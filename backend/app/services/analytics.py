from __future__ import annotations

from dataclasses import asdict, dataclass, fields
from datetime import date, timedelta
from statistics import mean, median
from typing import Any, Optional

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, defer, joinedload

from app.core.config import get_settings
from app.models.athlete import Athlete, AthleteFocusBlock
from app.models.metrics import DerivedMetric, PerformanceEstimate, PhysiologicalSnapshot
from app.models.session import Session as AthleteSession, SessionInterval
from app.services.dynamic_threshold_engine import build_dynamic_threshold_payload, config_from_settings, _accumulated_fatigue_penalty
from app.services.prediction_engine import build_performance_estimates


@dataclass
class ThresholdMethodEstimate:
    threshold_name: str
    method: str
    lactate: Optional[float]
    pace_seconds_per_km: Optional[float]
    power_watts: Optional[float]
    heart_rate: Optional[int]
    power_source: Optional[str]
    confidence: float
    explanation: str


@dataclass
class ThresholdResult:
    name: str
    lactate: Optional[float]
    pace_seconds_per_km: Optional[float]
    power_watts: Optional[float]
    heart_rate: Optional[int]
    power_source: Optional[str]
    method: str
    confidence: float
    rationale: str
    methods_compared: list[dict[str, Any]]
    agreement_score: float
    evidence_level: str


THRESHOLD_RESULT_FIELD_NAMES = {item.name for item in fields(ThresholdResult)}


def _threshold_result_from_payload(payload: dict[str, Any]) -> ThresholdResult:
    normalized = {key: value for key, value in payload.items() if key in THRESHOLD_RESULT_FIELD_NAMES}
    return ThresholdResult(**normalized)


def _smooth(values: list[float]) -> list[float]:
    """3-point moving average with reflective padding (scipy mode='reflect').

    Without padding, endpoint values are averaged with fewer neighbours, which
    compresses peak lactate and underestimates LT2 in steep curves.
    Reflective padding preserves endpoint magnitude — standard in signal
    processing (Smith 1997, scipy.ndimage).
    """
    if len(values) < 3:
        return values[:]
    # Reflective pad: [v1, v0, v0, v1, v2, ..., vN, vN, vN-1]
    padded = [values[1], values[0]] + values + [values[-1], values[-2]]
    smoothed: list[float] = []
    for index in range(2, len(padded) - 2):
        neighborhood = padded[index - 1: index + 2]
        smoothed.append(sum(neighborhood) / len(neighborhood))
    return smoothed


def _confidence_level(score: float) -> str:
    if score >= 0.8:
        return "high"
    if score >= 0.6:
        return "medium"
    return "low"


def _load_metric(interval: SessionInterval) -> Optional[float]:
    if interval.power_watts:
        return float(interval.power_watts)
    if interval.running_power_watts:
        return float(interval.running_power_watts)
    if interval.pace_seconds_per_km:
        return 3600 / interval.pace_seconds_per_km
    # HR as fallback: allows analysis when athlete only has lactate + HR
    # (e.g. manual test entry without pace/power data)
    if interval.heart_rate_avg:
        return float(interval.heart_rate_avg)
    return None


def _primary_metric_value(interval: SessionInterval) -> tuple[Optional[float], str]:
    if interval.pace_seconds_per_km:
        return float(interval.pace_seconds_per_km), "pace_seconds_per_km"
    if interval.power_watts:
        return float(interval.power_watts), "power_watts"
    if interval.running_power_watts:
        return float(interval.running_power_watts), "running_power_watts"
    if interval.heart_rate_avg:
        return float(interval.heart_rate_avg), "heart_rate_avg"
    return None, "unknown"


def _session_density(session: AthleteSession) -> float:
    total_work = sum(interval.duration_seconds for interval in session.intervals)
    total_rest = sum(interval.rest_seconds or 0 for interval in session.intervals)
    total = total_work + total_rest
    if total == 0:
        return 1.0
    return total_work / total


def _interval_duration_score(duration_seconds: int) -> float:
    if duration_seconds < 120:
        return 0.42
    if duration_seconds < 180:
        return 0.58
    if duration_seconds <= 240:
        return 0.78
    if duration_seconds <= 480:
        return 0.92
    if duration_seconds <= 720:
        return 0.85
    if duration_seconds <= 900:
        return 0.76
    if duration_seconds <= 1200:
        return 0.64
    return 0.5


def _interval_protocol_score(interval: SessionInterval) -> float:
    duration_score = _interval_duration_score(interval.duration_seconds)
    rest_ratio = (interval.rest_seconds or 0) / max(interval.duration_seconds, 1)
    if rest_ratio <= 0.15:
        rest_score = 1.0
    elif rest_ratio <= 0.30:
        rest_score = 0.9
    elif rest_ratio <= 0.50:
        rest_score = 0.74
    elif rest_ratio <= 0.75:
        rest_score = 0.58
    else:
        rest_score = 0.42
    return round(max(0.25, min(1.0, duration_score * 0.65 + rest_score * 0.35)), 2)


def _normalized_power_source(session: AthleteSession) -> Optional[str]:
    if session.discipline != "ciclismo":
        return None
    return session.power_source or "outdoor"


def contextualize_sample(interval: SessionInterval, session: AthleteSession) -> tuple[float, float, str, dict[str, Any]]:
    sample = interval.lactate_sample
    if sample is None:
        return 0.0, 0.0, "", {}
    contextual = sample.lactate_mmol
    confidence = max(0.6, min(0.95, 0.92 - (0.06 if sample.sample_delay_seconds > 60 else 0.0)))
    comment = (
        f"Lactato usado sin contextualización: {sample.lactate_mmol:.1f} mmol/L. "
        f"Se conserva el valor medido; solo se informa del retraso de muestra (+{sample.sample_delay_seconds}s)."
    )
    payload = {
        "measured_lactate": round(sample.lactate_mmol, 2),
        "contextual_lactate": round(contextual, 2),
        "total_adjustment": 0.0,
        "rules": {"contextualization": "disabled"},
        "confidence": round(confidence, 2),
        "comment": comment,
    }
    return round(contextual, 2), round(confidence, 2), comment, payload


def _peak_lactate(session: AthleteSession) -> Optional[dict[str, Any]]:
    """Devuelve el punto de mayor lactato medido en la sesión (proxy de VLaMax)."""
    best = None
    for interval in session.intervals:
        sample = interval.lactate_sample
        if not sample:
            continue
        if best is None or sample.lactate_mmol > best["lactate_mmol"]:
            best = {
                "lactate_mmol": round(sample.lactate_mmol, 2),
                "pace_seconds_per_km": interval.pace_seconds_per_km,
                "power_watts": interval.power_watts or interval.running_power_watts,
                "heart_rate": interval.heart_rate_avg,
                "order_index": interval.order_index,
            }
    return best


def _calculate_measured_vlamax(session: AthleteSession) -> Optional[dict[str, Any]]:
    """Calculate VLamax from a sprint all-out test using Mader's formula.

    Two modes:
    1. Explicit: session_type == "vlamax_test" → confidence 0.90
    2. Auto-detect: any session with a sprint interval ≤30s and peak lactate ≥6 mmol/L
       → confidence 0.75 (retrocompat for athletes who recorded sprints before
       the vlamax_test type existed)

    Sprint protocol override:
      If session.sprint_protocol is set ("15s" or "30s"), that duration is used
      as the divisor in the Mader formula instead of auto-detecting from intervals.
      This is critical because the protocol duration is a divisor — getting it wrong
      doubles or halves the result.

    Simplified Mader formula:
      VLamax = (peak_lactate - baseline) / (2 × sprint_duration_s)

    Units: mmol/L/s — consistent with published VLamax values and the
    prediction engine proxy (range 0.15–0.75).
    Literature ranges: sprinter 0.6–0.9, trained 0.3–0.5, endurance 0.15–0.30.
    """
    explicit = session.session_type == "vlamax_test"

    # Resolve sprint protocol: explicit protocol field takes precedence
    protocol = getattr(session, "sprint_protocol", None)
    protocol_duration_s: Optional[int] = None
    if protocol == "15s":
        protocol_duration_s = 15
    elif protocol == "30s":
        protocol_duration_s = 30

    # Find sprint interval: shortest duration interval (the all-out effort)
    sprint_interval = None
    max_duration = 120 if explicit else 30
    for interval in session.intervals:
        if interval.duration_seconds and interval.duration_seconds <= max_duration:
            if sprint_interval is None or interval.duration_seconds < sprint_interval.duration_seconds:
                sprint_interval = interval

    if sprint_interval is None or not sprint_interval.duration_seconds:
        # If we have a protocol but no matching interval, still need at least one interval
        if protocol_duration_s is None:
            return None

    # Sprint duration: protocol override > interval auto-detect
    sprint_duration_s = protocol_duration_s if protocol_duration_s is not None else sprint_interval.duration_seconds

    # Find baseline lactate (pre-sprint resting value)
    baseline = None
    for interval in session.intervals:
        sample = interval.lactate_sample
        if sample and sample.baseline_lactate is not None:
            baseline = sample.baseline_lactate
            break
    # Fallback: use the lowest lactate in the session as baseline
    if baseline is None:
        all_lactates = [
            iv.lactate_sample.lactate_mmol
            for iv in session.intervals
            if iv.lactate_sample
        ]
        if all_lactates:
            baseline = min(all_lactates)

    if baseline is None:
        return None

    # Find peak post-sprint lactate (highest value in the session)
    peak = None
    for interval in session.intervals:
        sample = interval.lactate_sample
        if sample and (peak is None or sample.lactate_mmol > peak):
            peak = sample.lactate_mmol

    if peak is None or peak <= baseline:
        return None

    # Auto-detect gate: require peak ≥ 6 mmol/L to avoid false positives
    # from short warm-up intervals in incremental tests
    if not explicit and peak < 6.0:
        return None

    # Simplified Mader: VLamax (mmol/L/s) = Δlactate / (2 × t_sprint_s)
    # The factor of 2 accounts for the glycolytic stoichiometry (Mader 2003):
    # only ~50% of glycolytic flux appears as blood lactate.
    vlamax = (peak - baseline) / (2.0 * sprint_duration_s)

    # Sanity clamp: physiological range 0.15–0.90 mmol/L/s
    vlamax = max(0.15, min(0.90, vlamax))

    # Validation warnings
    warnings: list[str] = []
    if protocol == "15s" and peak < 6.0:
        warnings.append("Pico lactato <6 mmol/L en protocolo 15\": el sprint puede no haber sido maximal.")
    if protocol == "30s" and peak > 20.0:
        warnings.append("Pico lactato >20 mmol/L en protocolo 30\": valor plausible pero extremo.")

    return {
        "vlamax_mmol_min": round(vlamax, 3),
        "peak_lactate": round(peak, 2),
        "baseline_lactate": round(baseline, 2),
        "sprint_duration_s": sprint_duration_s,
        "sprint_protocol": protocol,
        "source": "mader_sprint_test" if explicit else "mader_sprint_autodetect",
        "confidence": 0.90 if explicit else 0.75,
        "warnings": warnings,
        "calculation": f"VLamax = ({round(peak, 2)} - {round(baseline, 2)}) / (2 x {sprint_duration_s}) = {round(vlamax, 3)} mmol/L/s",
    }


def _curve_points(session: AthleteSession, metric: str) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    peak_lactate = max(
        (s.lactate_mmol for i in session.intervals if (s := i.lactate_sample) and getattr(i, metric) is not None),
        default=None,
    )
    for interval in session.intervals:
        sample = interval.lactate_sample
        if not sample:
            continue
        x = getattr(interval, metric)
        if x is None:
            continue
        points.append(
            {
                "interval_id": interval.id,
                "x": float(x),
                "lactate": sample.lactate_mmol,
                "contextual_lactate": sample.contextual_lactate or sample.lactate_mmol,
                "label": f"Bloque {interval.order_index}",
                "session_date": session.performed_at.isoformat(),
                "power_source": _normalized_power_source(session),
                "is_peak": peak_lactate is not None and sample.lactate_mmol == peak_lactate,
            }
        )
    reverse = metric == "pace_seconds_per_km"
    return sorted(points, key=lambda point: point["x"], reverse=reverse)


def _build_candidates(session: AthleteSession, max_sample_delay_seconds: Optional[int] = None) -> list[dict[str, Any]]:
    candidates = []
    for interval in session.intervals:
        sample = interval.lactate_sample
        if not sample:
            continue
        if max_sample_delay_seconds is not None and sample.sample_delay_seconds > max_sample_delay_seconds:
            continue
        load = _load_metric(interval)
        if load is None:
            continue
        fatigue = _accumulated_fatigue_penalty(session, interval)
        candidates.append(
            {
                "load": load,
                "interval": interval,
                "lactate": sample.contextual_lactate or sample.lactate_mmol,
                "protocol_score": round(_interval_protocol_score(interval) * fatigue, 2),
                "sample_delay_seconds": sample.sample_delay_seconds,
                "accumulated_fatigue_penalty": fatigue,
            }
        )
    candidates.sort(key=lambda item: item["load"])
    return candidates


def _curve_monotonicity(candidates: list[dict[str, Any]]) -> float:
    lactates = [item["lactate"] for item in candidates]
    valid_pairs = len(lactates) - 1
    if valid_pairs <= 0:
        return 0.0
    ascending = sum(1 for idx in range(1, len(lactates)) if lactates[idx] >= lactates[idx - 1] - 0.15)
    return round(ascending / valid_pairs, 2)


def _curve_signal_score(candidates: list[dict[str, Any]]) -> float:
    if len(candidates) < 3:
        return 0.2
    lactates = [item["lactate"] for item in candidates]
    monotonicity = _curve_monotonicity(candidates)
    descending_drops = [max(0.0, lactates[idx - 1] - lactates[idx] - 0.15) for idx in range(1, len(lactates))]
    drop_burden = min(1.0, (sum(descending_drops) / max(len(descending_drops), 1)) / 1.2) if descending_drops else 0.0
    lactate_range = max(lactates) - min(lactates)
    range_score = max(0.25, min(1.0, lactate_range / 4.0))
    stage_score = max(0.25, min(1.0, len(candidates) / 8))
    return round(
        max(0.18, min(0.95, monotonicity * 0.45 + (1 - drop_burden) * 0.25 + range_score * 0.15 + stage_score * 0.15)),
        2,
    )


def _method_baseline_rise(candidates: list[dict[str, Any]]) -> list[ThresholdMethodEstimate]:
    lactates = _smooth([item["lactate"] for item in candidates])
    baseline_window = lactates[: min(4, len(lactates))]
    baseline = min(baseline_window)
    baseline_index = lactates.index(baseline)
    lt1_index = baseline_index
    for idx in range(baseline_index + 1, len(lactates)):
        value = lactates[idx]
        next_value = lactates[idx + 1] if idx + 1 < len(lactates) else value
        # +0.5 mmol sobre baseline: criterio más defendido en literatura
        # (Faude, Kindermann & Meyer 2009; Stegmann & Kindermann 1981).
        # +0.35 era demasiado sensible en curvas con ruido bajo.
        if value >= baseline + 0.5 and next_value >= value - 0.25:
            lt1_index = idx
            break
    lt2_index = len(lactates) - 1
    lt2_is_fallback = True
    for idx, value in enumerate(lactates):
        prev_value = lactates[idx - 1] if idx > 0 else value
        next_value = lactates[idx + 1] if idx + 1 < len(lactates) else value
        candidate = value >= 4.0 or (
            idx > 1
            and value >= max(3.2, baseline + 1.4)
            and (value - prev_value) >= 0.45
        )
        if candidate:
            # Verifica que no es un pico transitorio: el siguiente punto
            # debe no caer más de 0.5 mmol (Billat et al. 2003).
            # Si cae, es un artefacto y seguimos buscando.
            if next_value >= value - 0.5:
                lt2_index = idx
                lt2_is_fallback = False
                break
    output = []
    for name, idx, explanation in [
        ("LT1", lt1_index, "Primer aumento sostenido de +0.5 mmol sobre el basal suavizado (Faude 2009)."),
        ("LT2", lt2_index, "Punto con aceleración de lactato o aproximación operativa a 4 mmol."),
    ]:
        interval = candidates[idx]["interval"]
        sample = interval.lactate_sample
        protocol_score = candidates[idx].get("protocol_score", 0.7)
        confidence = min(0.88, 0.56 + len(candidates) * 0.05)
        confidence = round(max(0.25, min(0.95, confidence * (0.72 + protocol_score * 0.28))), 2)
        explanation_used = explanation
        # Penalizar LT2 que viene de fallback (último punto) — no es una
        # detección real sino ausencia de señal clara.
        if name == "LT2" and lt2_is_fallback:
            confidence = round(confidence * 0.4, 2)
            explanation_used = (
                "FALLBACK: ningún método detectó LT2 claro; se usa el último "
                "dato como proxy con confianza reducida."
            )
        if protocol_score < 0.7:
            explanation_used = f"{explanation_used} La fiabilidad baja por duración/descanso del escalón poco favorables."
        output.append(
            ThresholdMethodEstimate(
                threshold_name=name,
                method="baseline_rise",
                lactate=sample.contextual_lactate if sample else None,
                pace_seconds_per_km=interval.pace_seconds_per_km,
                power_watts=interval.power_watts or interval.running_power_watts,
                heart_rate=interval.heart_rate_avg,
                power_source=_normalized_power_source(interval.session) if interval.session else None,
                confidence=confidence,
                explanation=explanation_used,
            )
        )
    return output


def _method_sustained_increase(candidates: list[dict[str, Any]]) -> list[ThresholdMethodEstimate]:
    lactates = _smooth([item["lactate"] for item in candidates])
    lt1_index: Optional[int] = None  # None = no detection (was: 0 fallback)
    baseline = min(lactates[: min(4, len(lactates))])
    for idx in range(1, len(lactates)):
        if (
            lactates[idx] >= baseline + 0.3
            and lactates[idx] > lactates[idx - 1]
            and idx + 1 < len(lactates)
            and lactates[idx + 1] >= lactates[idx]
        ):
            lt1_index = idx
            break
    lt2_index = len(lactates) - 1
    lt2_is_fallback = True
    for idx in range(2, len(lactates)):
        local_slope = lactates[idx] - lactates[idx - 1]
        prior_slope = lactates[idx - 1] - lactates[idx - 2]
        if lactates[idx] >= max(3.2, baseline + 1.4) and local_slope >= max(0.45, prior_slope + 0.2):
            lt2_index = idx
            lt2_is_fallback = False
            break
    output = []
    for name, idx, explanation in [
        ("LT1", lt1_index, "Se elige el primer ascenso mantenido entre dos pasos consecutivos."),
        ("LT2", lt2_index, "Se elige la primera rotura clara de pendiente frente al tramo anterior."),
    ]:
        # Skip LT1 if no sustained increase was detected (avoids contaminating
        # the aggregation with index 0 — the first data point).
        if idx is None:
            continue
        interval = candidates[idx]["interval"]
        sample = interval.lactate_sample
        protocol_score = candidates[idx].get("protocol_score", 0.7)
        confidence = min(0.84, 0.52 + len(candidates) * 0.05)
        confidence = round(max(0.25, min(0.95, confidence * (0.72 + protocol_score * 0.28))), 2)
        explanation_used = explanation
        # Penalizar LT2 fallback (último punto = ausencia de señal clara)
        if name == "LT2" and lt2_is_fallback:
            confidence = round(confidence * 0.4, 2)
            explanation_used = (
                "FALLBACK: sin rotura de pendiente clara; se usa el último "
                "dato como proxy con confianza reducida."
            )
        if protocol_score < 0.7:
            explanation_used = f"{explanation_used} La fiabilidad baja por duración/descanso del escalón poco favorables."
        output.append(
            ThresholdMethodEstimate(
                threshold_name=name,
                method="sustained_increase",
                lactate=sample.contextual_lactate if sample else None,
                pace_seconds_per_km=interval.pace_seconds_per_km,
                power_watts=interval.power_watts or interval.running_power_watts,
                heart_rate=interval.heart_rate_avg,
                power_source=_normalized_power_source(interval.session) if interval.session else None,
                confidence=confidence,
                explanation=explanation_used,
            )
        )
    return output


def _method_moddmax(candidates: list[dict[str, Any]]) -> list[ThresholdMethodEstimate]:
    """ModDmax (Bishop et al. 1998): variante robusta del método Dmax.

    El Dmax clásico traza la línea desde el primer hasta el último punto de
    la curva. En atletas entrenados con curva convexa suave (siempre por
    debajo de esa línea), todas las desviaciones son negativas y el máximo
    cae en el primer punto → resultado completamente erróneo.

    ModDmax soluciona esto trazando la línea desde el **primer punto de
    aumento sostenido significativo** (≥0.3 mmol de subida confirmada en el
    siguiente paso) hasta el último punto. Así la región de interés queda
    siempre por encima de la línea.

    Solo se usa para LT2. LT1 no se estima por este método porque el proxy
    "punto anterior al Dmax" carece de base fisiológica.
    """
    if len(candidates) < 4:
        return []
    loads = [item["load"] for item in candidates]
    lactates = _smooth([item["lactate"] for item in candidates])

    # Criterio de Bishop et al. (1998): la línea empieza en el primer punto
    # donde el lactato supera baseline_min + 0.5 mmol. Más robusto que un
    # criterio de subida entre pasos porque se ancla en el mínimo absoluto
    # de la curva, independientemente de cuándo ocurra.
    baseline_min = min(lactates[: min(4, len(lactates))])
    start_index = 0
    for idx in range(len(lactates)):
        if lactates[idx] >= baseline_min + 0.5:
            start_index = idx
            break

    # El tramo de interés va desde start_index hasta el último punto
    subset_loads = loads[start_index:]
    subset_lactates = lactates[start_index:]
    if len(subset_loads) < 3:
        return []

    load_span = subset_loads[-1] - subset_loads[0] or 1.0
    line_values = [
        subset_lactates[0] + ((load - subset_loads[0]) / load_span) * (subset_lactates[-1] - subset_lactates[0])
        for load in subset_loads
    ]
    deviations = [val - line for val, line in zip(subset_lactates, line_values)]
    local_lt2 = max(range(len(deviations)), key=lambda idx: deviations[idx])
    # Índice absoluto en candidates
    lt2_index = start_index + local_lt2

    # LT2 solo si la desviación es positiva (curva por encima de la línea)
    if deviations[local_lt2] <= 0:
        return []

    interval = candidates[lt2_index]["interval"]
    sample = interval.lactate_sample
    protocol_score = candidates[lt2_index].get("protocol_score", 0.7)
    confidence = min(0.82, 0.48 + len(candidates) * 0.045)
    confidence = round(max(0.25, min(0.95, confidence * (0.72 + protocol_score * 0.28))), 2)
    explanation = (
        f"ModDmax: máxima desviación positiva sobre la recta trazada desde el "
        f"primer aumento sostenido (carga {subset_loads[0]:.1f}) hasta el final."
    )
    if protocol_score < 0.7:
        explanation = f"{explanation} La fiabilidad baja por duración/descanso del escalón poco favorables."
    return [
        ThresholdMethodEstimate(
            threshold_name="LT2",
            method="moddmax",
            lactate=sample.contextual_lactate if sample else None,
            pace_seconds_per_km=interval.pace_seconds_per_km,
            power_watts=interval.power_watts or interval.running_power_watts,
            heart_rate=interval.heart_rate_avg,
            power_source=_normalized_power_source(interval.session) if interval.session else None,
            confidence=confidence,
            explanation=explanation,
        )
    ]


def _aggregate_threshold(name: str, methods: list[ThresholdMethodEstimate]) -> ThresholdResult:
    valid = [method for method in methods if method.threshold_name == name]
    if not valid:
        return ThresholdResult(
            name=name,
            lactate=None,
            pace_seconds_per_km=None,
            power_watts=None,
            heart_rate=None,
            power_source=None,
            method="insufficient_data",
            confidence=0.3,
            rationale="No hay suficientes puntos para estimar este umbral.",
            methods_compared=[],
            agreement_score=0.0,
            evidence_level="low",
        )

    filtering_notes: list[str] = []
    best = max(valid, key=lambda method: method.confidence)
    lactate_values = [item.lactate for item in valid if item.lactate is not None]
    pace_values = [item.pace_seconds_per_km for item in valid if item.pace_seconds_per_km is not None]
    power_values = [item.power_watts for item in valid if item.power_watts is not None]
    hr_values = [item.heart_rate for item in valid if item.heart_rate is not None]

    lactate_agreement = 0.0
    if len(lactate_values) >= 2:
        lactate_range = max(lactate_values) - min(lactate_values)
        lactate_agreement = max(0.0, 1 - lactate_range / 1.5)
    elif len(valid) == 1:
        # Un solo método: no hay acuerdo posible → confianza baja (Faude 2009:
        # la validez de un umbral requiere convergencia de ≥2 métodos)
        lactate_agreement = 0.25
    else:
        lactate_agreement = 0.55

    agreement_score = round(min(0.95, (mean(item.confidence for item in valid) * 0.6) + (lactate_agreement * 0.4)), 2)
    final_confidence = round(min(0.95, best.confidence * 0.7 + agreement_score * 0.3), 2)
    rationale = (
        f"Se compararon {len(valid)} métodos; el resultado final prioriza {best.method} "
        f"y pondera el acuerdo entre métodos ({agreement_score:.2f}). {best.explanation}"
    )
    if filtering_notes:
        rationale = f"{' '.join(filtering_notes)} {rationale}"

    # Lactato: media (estable entre métodos).
    # Ritmo/Potencia/FC: mediana — evita que un método outlier arrastre el
    # resultado a un ritmo que no corresponde a ninguna muestra real
    # (Billat 2003; cada método apunta a un intervalo medido, la mediana
    # garantiza que el resultado final también lo hace).
    return ThresholdResult(
        name=name,
        lactate=round(mean(lactate_values), 2) if lactate_values else best.lactate,
        pace_seconds_per_km=round(median(pace_values), 1) if pace_values else best.pace_seconds_per_km,
        power_watts=round(median(power_values), 1) if power_values else best.power_watts,
        heart_rate=round(median(hr_values)) if hr_values else best.heart_rate,
        power_source=best.power_source,
        method=best.method,
        confidence=final_confidence,
        rationale=rationale,
        methods_compared=[asdict(item) for item in valid],
        agreement_score=agreement_score,
        evidence_level=_confidence_level(final_confidence),
    )


_BASELINE_ARRUINADO_THRESHOLD = 3.0
_FEW_POINTS_THRESHOLD = 5
# P6 — Cap gradual de confianza según número de escalones:
# 3 puntos → max 0.45 (muy poca resolución)
# 4 puntos → max 0.60 (insuficiente pero usable con cautela)
# ≥5 puntos → sin cap adicional
_CONFIDENCE_CAP_BY_POINTS = {3: 0.45, 4: 0.60}


def _thresholds_from_session(session: AthleteSession) -> list[ThresholdResult]:
    candidates = _build_candidates(session)
    if len(candidates) < 3:
        return []

    # B1 — Validación de baseline arruinado: si el mínimo de los primeros
    # 4 valores de lactato ya supera 3.0 mmol, el test es inválido.
    # El atleta no partió de reposo metabólico y los umbrales serán
    # absurdos. No publicamos nada.
    lactates = [item["lactate"] for item in candidates]
    baseline_window = lactates[: min(4, len(lactates))]
    baseline_min = min(baseline_window)
    if baseline_min > _BASELINE_ARRUINADO_THRESHOLD:
        return [
            ThresholdResult(
                name=name,
                lactate=None,
                pace_seconds_per_km=None,
                power_watts=None,
                heart_rate=None,
                power_source=None,
                method="baseline_invalid",
                confidence=0.0,
                rationale=(
                    f"Test invalidado: el lactato basal mínimo ({baseline_min:.1f} mmol) "
                    f"supera {_BASELINE_ARRUINADO_THRESHOLD} mmol. El atleta no partió de "
                    f"reposo metabólico. Se recomienda repetir el test con un "
                    f"calentamiento adecuado y escalones iniciales más suaves."
                ),
                methods_compared=[],
                agreement_score=0.0,
                evidence_level="low",
            )
            for name in ("LT1", "LT2")
        ]

    method_outputs: list[ThresholdMethodEstimate] = []
    for builder in (_method_baseline_rise, _method_sustained_increase, _method_moddmax):
        method_outputs.extend(builder(candidates))

    # P6 — Cap gradual de confianza con pocos puntos: con <5 escalones
    # no hay suficiente resolución para confiar plenamente en los umbrales.
    confidence_cap = _CONFIDENCE_CAP_BY_POINTS.get(len(candidates))
    if confidence_cap is not None:
        for estimate in method_outputs:
            if estimate.confidence > confidence_cap:
                estimate.confidence = confidence_cap

    lt1 = _aggregate_threshold("LT1", method_outputs)
    lt2 = _aggregate_threshold("LT2", method_outputs)

    # B2 — Validación LT1 < LT2: tras agregar, verificamos que LT1 sea
    # fisiológicamente inferior a LT2. Si LT1 >= LT2 en lactato, o si
    # LT1 es más rápido que LT2 (en ritmo: menor s/km = más rápido),
    # los umbrales son incoherentes y no se publican.
    if lt1.lactate is not None and lt2.lactate is not None:
        if lt1.lactate >= lt2.lactate:
            return [
                ThresholdResult(
                    name=name,
                    lactate=None,
                    pace_seconds_per_km=None,
                    power_watts=None,
                    heart_rate=None,
                    power_source=None,
                    method="inverted_thresholds",
                    confidence=0.0,
                    rationale=(
                        f"Umbrales invalidados: LT1 ({lt1.lactate:.2f} mmol) ≥ LT2 "
                        f"({lt2.lactate:.2f} mmol). Esto es fisiológicamente imposible. "
                        f"Posibles causas: protocolo de test inadecuado, baseline elevado "
                        f"o curva anómala. Se recomienda repetir el test."
                    ),
                    methods_compared=[],
                    agreement_score=0.0,
                    evidence_level="low",
                )
                for name in ("LT1", "LT2")
            ]

    if (
        lt1.pace_seconds_per_km is not None
        and lt2.pace_seconds_per_km is not None
        and lt1.pace_seconds_per_km < lt2.pace_seconds_per_km
    ):
        return [
            ThresholdResult(
                name=name,
                lactate=None,
                pace_seconds_per_km=None,
                power_watts=None,
                heart_rate=None,
                power_source=None,
                method="inverted_thresholds",
                confidence=0.0,
                rationale=(
                    f"Umbrales invalidados: LT1 a ritmo más rápido "
                    f"({lt1.pace_seconds_per_km:.0f} s/km) que LT2 "
                    f"({lt2.pace_seconds_per_km:.0f} s/km). "
                    f"Se recomienda repetir el test."
                ),
                methods_compared=[],
                agreement_score=0.0,
                evidence_level="low",
            )
            for name in ("LT1", "LT2")
        ]

    if (
        lt1.power_watts is not None
        and lt2.power_watts is not None
        and lt1.power_watts > lt2.power_watts
    ):
        return [
            ThresholdResult(
                name=name,
                lactate=None,
                pace_seconds_per_km=None,
                power_watts=None,
                heart_rate=None,
                power_source=None,
                method="inverted_thresholds",
                confidence=0.0,
                rationale=(
                    f"Umbrales invalidados: LT1 a mayor potencia "
                    f"({lt1.power_watts:.0f} W) que LT2 "
                    f"({lt2.power_watts:.0f} W). "
                    f"Se recomienda repetir el test."
                ),
                methods_compared=[],
                agreement_score=0.0,
                evidence_level="low",
            )
            for name in ("LT1", "LT2")
        ]

    return [lt1, lt2]


_REAL_MIN_CONFIDENCE = 0.75
_REAL_MIN_STAGES = 5
_REAL_MIN_MONOTONICITY = 0.60
_REAL_MIN_AGREEMENT = 0.62
_REAL_MIN_PROTOCOL_SCORE = 0.68
_REAL_MIN_SIGNAL_SCORE = 0.70
_REAL_CANDIDATE_STRONG_MIN_CONFIDENCE = 0.72
_INDIVIDUAL_MAX_SAMPLE_DELAY_SECONDS = 60
_INDIVIDUAL_MIN_SUPPORT_SESSIONS = 6
_INDIVIDUAL_MIN_PROGRESSION_ALIGNMENT = 0.75
_INDIVIDUAL_PROGRESS_TOLERANCE_RATIO = 0.01
_INDIVIDUAL_MIN_AGREEMENT = 0.62
_INDIVIDUAL_MIN_CONFIDENCE = 0.78
_INDIVIDUAL_RULESET_VERSION = 2
_REAL_RULESET_VERSION = 3


def _method_family(method: str) -> str:
    families = {
        "baseline_rise": "baseline_change",
        "sustained_increase": "slope_change",
        "moddmax": "geometry",
        "dmax": "geometry",
        "ltp_breakpoint": "curve_shape",
    }
    return families.get(method, method)


def _relative_delta(first: float, second: float) -> float:
    reference = max(abs(first), abs(second), 1.0)
    return abs(first - second) / reference


def _threshold_lactate_tolerance(name: str) -> float:
    return 0.6 if name == "LT1" else 0.6


def _load_metric_compatible(
    first: ThresholdMethodEstimate | dict[str, Any],
    second: ThresholdMethodEstimate | dict[str, Any],
) -> bool:
    first_power = first.power_watts if isinstance(first, ThresholdMethodEstimate) else first.get("power_watts")
    second_power = second.power_watts if isinstance(second, ThresholdMethodEstimate) else second.get("power_watts")
    if first_power is not None and second_power is not None:
        return _relative_delta(float(first_power), float(second_power)) <= 0.04

    first_pace = first.pace_seconds_per_km if isinstance(first, ThresholdMethodEstimate) else first.get("pace_seconds_per_km")
    second_pace = second.pace_seconds_per_km if isinstance(second, ThresholdMethodEstimate) else second.get("pace_seconds_per_km")
    if first_pace is not None and second_pace is not None:
        return abs(float(first_pace) - float(second_pace)) <= 15.0

    first_hr = first.heart_rate if isinstance(first, ThresholdMethodEstimate) else first.get("heart_rate")
    second_hr = second.heart_rate if isinstance(second, ThresholdMethodEstimate) else second.get("heart_rate")
    if first_hr is not None and second_hr is not None:
        return abs(int(first_hr) - int(second_hr)) <= 6

    return False


def _methods_are_compatible(first: ThresholdMethodEstimate, second: ThresholdMethodEstimate, threshold_name: str) -> bool:
    if first.threshold_name != threshold_name or second.threshold_name != threshold_name:
        return False
    if _method_family(first.method) == _method_family(second.method):
        return False
    if first.lactate is None or second.lactate is None:
        return False
    if abs(first.lactate - second.lactate) > _threshold_lactate_tolerance(threshold_name) + 1e-9:
        return False
    return _load_metric_compatible(first, second)


def _real_threshold_payload(name: str, result: ThresholdResult, status: str = "confirmed") -> dict[str, Any]:
    return {
        "name": f"{name} REAL",
        "lactate": result.lactate,
        "pace_seconds_per_km": result.pace_seconds_per_km,
        "power_watts": result.power_watts,
        "heart_rate": result.heart_rate,
        "confidence": result.confidence,
        "agreement_score": result.agreement_score,
        "method": result.method,
        "evidence_level": result.evidence_level,
        "rationale": result.rationale,
        "status": status,
    }


def _build_threshold_detection_status(
    name: str,
    result: ThresholdResult,
    methods: list[ThresholdMethodEstimate],
    quality_gate_passed: bool,
    quality_reason: str,
) -> dict[str, Any]:
    valid = [method for method in methods if method.threshold_name == name]
    if not valid:
        return {
            "name": name,
            "state": "none",
            "primary_method": None,
            "confirmation_method": None,
            "supporting_methods": [],
            "compatible": False,
            "quality_gate_passed": quality_gate_passed,
            "anchor_update_recommended": False,
            "confidence": 0.0,
            "candidate_threshold": None,
            "explanation": "No hay suficientes detecciones de método para abrir candidato.",
        }

    best = max(valid, key=lambda method: method.confidence)
    compatible_pairs: list[tuple[ThresholdMethodEstimate, ThresholdMethodEstimate]] = []
    for index, first in enumerate(valid):
        for second in valid[index + 1 :]:
            if _methods_are_compatible(first, second, name):
                compatible_pairs.append((first, second))

    candidate_threshold = {
        "name": f"{name} candidato",
        "lactate": result.lactate,
        "pace_seconds_per_km": result.pace_seconds_per_km,
        "power_watts": result.power_watts,
        "heart_rate": result.heart_rate,
        "confidence": result.confidence,
        "agreement_score": result.agreement_score,
        "method": result.method,
        "evidence_level": result.evidence_level,
        "rationale": result.rationale,
    }
    supporting_methods = [method.method for method in valid]

    if compatible_pairs and quality_gate_passed and result.confidence >= _REAL_MIN_CONFIDENCE and result.agreement_score >= _REAL_MIN_AGREEMENT:
        confirmation_pair = max(
            compatible_pairs,
            key=lambda pair: pair[0].confidence + pair[1].confidence,
        )
        return {
            "name": name,
            "state": "confirmed",
            "primary_method": confirmation_pair[0].method,
            "confirmation_method": confirmation_pair[1].method,
            "supporting_methods": supporting_methods,
            "compatible": True,
            "quality_gate_passed": True,
            "anchor_update_recommended": False,
            "confidence": result.confidence,
            "candidate_threshold": candidate_threshold,
            "explanation": (
                f"{name} confirmado por {confirmation_pair[0].method} y {confirmation_pair[1].method} "
                "con acuerdo compatible dentro de la misma sesión."
            ),
        }

    state = "candidate_strong" if quality_gate_passed and best.confidence >= _REAL_CANDIDATE_STRONG_MIN_CONFIDENCE else "candidate_weak"
    explanation = (
        f"{best.method} detectó un candidato de {name}, pero aún falta confirmación independiente."
    )
    if not quality_gate_passed:
        explanation = f"{explanation} {quality_reason}"
    elif compatible_pairs:
        explanation = (
            f"Hay más de una señal para {name}, pero el consenso final aún no alcanza los gates "
            f"de publicación conservadora (confianza {result.confidence:.2f}, acuerdo {result.agreement_score:.2f})."
        )

    return {
        "name": name,
        "state": state,
        "primary_method": best.method,
        "confirmation_method": None,
        "supporting_methods": supporting_methods,
        "compatible": bool(compatible_pairs),
        "quality_gate_passed": quality_gate_passed,
        "anchor_update_recommended": False,
        "confidence": result.confidence,
        "candidate_threshold": candidate_threshold,
        "explanation": explanation,
    }


def _real_item_matches_individual(
    real_item: Optional[dict[str, Any]],
    individual_item: Optional[dict[str, Any]],
    threshold_name: str,
) -> bool:
    if not real_item or not individual_item:
        return False
    real_lactate = real_item.get("lactate")
    individual_lactate = individual_item.get("lactate")
    if real_lactate is None or individual_lactate is None:
        return False
    if abs(float(real_lactate) - float(individual_lactate)) > _threshold_lactate_tolerance(threshold_name) + 1e-9:
        return False
    return _load_metric_compatible(real_item, individual_item)


def _merge_real_threshold_states(
    real_thresholds: Optional[dict[str, Any]],
    individual_thresholds: Optional[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    if not real_thresholds:
        return real_thresholds

    payload: dict[str, Any] = {}
    for key, value in real_thresholds.items():
        if isinstance(value, dict):
            payload[key] = dict(value)
        else:
            payload[key] = value

    mapping = (
        ("LT1", "lt1_real", "lt1_detection", "lt1_individual"),
        ("LT2", "lt2_real", "lt2_detection", "lt2_individual"),
    )
    for threshold_name, real_key, detection_key, individual_key in mapping:
        detection = payload.get(detection_key)
        real_item = payload.get(real_key)
        individual_item = (individual_thresholds or {}).get(individual_key)
        if not isinstance(detection, dict) or detection.get("state") != "confirmed":
            continue
        if not _real_item_matches_individual(real_item, individual_item, threshold_name):
            continue
        detection["state"] = "ready_to_anchor"
        detection["anchor_update_recommended"] = True
        detection["explanation"] = (
            f"{detection.get('explanation', '').rstrip()} Existe respaldo longitudinal comparable, "
            "así que el umbral está listo para anclarse."
        ).strip()
        if isinstance(real_item, dict):
            real_item["status"] = "ready_to_anchor"

    return payload


def _interpolate_load_from_candidates(
    candidates: list[dict[str, Any]], target_lactate: float
) -> Optional[dict[str, Any]]:
    """Interpolates load and HR at a given target lactate from sorted candidates."""
    by_lactate = sorted(candidates, key=lambda c: c["lactate"])
    lower = [c for c in by_lactate if c["lactate"] <= target_lactate]
    upper = [c for c in by_lactate if c["lactate"] >= target_lactate]
    if not lower or not upper:
        return None
    low, high = lower[-1], upper[0]
    if low is high or high["lactate"] == low["lactate"]:
        return None
    ratio = (target_lactate - low["lactate"]) / (high["lactate"] - low["lactate"])
    load = round(low["load"] + ratio * (high["load"] - low["load"]), 2)
    interval_low = low["interval"]
    interval_high = high["interval"]
    pace_low = interval_low.pace_seconds_per_km
    pace_high = interval_high.pace_seconds_per_km
    power_low = interval_low.power_watts or interval_low.running_power_watts
    power_high = interval_high.power_watts or interval_high.running_power_watts
    hr_low = interval_low.heart_rate_avg
    hr_high = interval_high.heart_rate_avg
    pace = round(pace_low + ratio * (pace_high - pace_low), 1) if pace_low and pace_high else None
    power = round(power_low + ratio * (power_high - power_low), 1) if power_low and power_high else None
    hr = round(hr_low + ratio * (hr_high - hr_low)) if hr_low and hr_high else None
    return {"load": load, "pace_seconds_per_km": pace, "power_watts": power, "heart_rate": hr, "lactate": round(target_lactate, 2)}


def _detect_real_thresholds(session: AthleteSession) -> dict[str, Any]:
    """
    Detecta LT1 REAL, LT2 REAL y sus prácticos REALES por análisis de forma de curva.

    Sigue el principio de conservadurismo científico (Faude et al. 2009):
    - Solo se estiman umbrales cuando la calidad de datos y la confianza son altas.
    - Si los datos no son suficientes, los valores son None — nunca se fuerza una estimación.

    Requisitos mínimos:
    - >= 5 etapas con lactato
    - Confianza individual >= 0.75 para cada umbral
    - Agreement score >= 0.62
    - Monotonicity >= 0.60
    """
    result: dict[str, Any] = {
        "lt1_real": None,
        "lt2_real": None,
        "lt1_practical_real": None,
        "lt2_practical_real": None,
        "lt1_detection": None,
        "lt2_detection": None,
        "data_quality": {
            "stage_count": 0,
            "usable_stage_count": 0,
            "monotonicity": 0.0,
            "signal_score": 0.0,
            "sufficient": False,
            "reason": "No hay suficientes etapas",
            "criteria_version": _REAL_RULESET_VERSION,
        },
    }

    all_candidates = _build_candidates(session)
    candidates = _build_candidates(session, max_sample_delay_seconds=_INDIVIDUAL_MAX_SAMPLE_DELAY_SECONDS)
    stage_count = len(all_candidates)
    usable_stage_count = len(candidates)
    result["data_quality"]["stage_count"] = stage_count
    result["data_quality"]["usable_stage_count"] = usable_stage_count

    quality_gate_passed = True
    if usable_stage_count < _REAL_MIN_STAGES:
        quality_gate_passed = False
        if stage_count >= _REAL_MIN_STAGES:
            result["data_quality"]["reason"] = (
                f"Solo {usable_stage_count} etapas con muestra válida para umbral individual "
                f"tras filtrar retrasos > {_INDIVIDUAL_MAX_SAMPLE_DELAY_SECONDS}s"
            )
        else:
            result["data_quality"]["reason"] = f"Solo {usable_stage_count} etapas con lactato (mínimo {_REAL_MIN_STAGES})"

    protocol_score = round(median([c.get("protocol_score", 0.7) for c in candidates]), 2) if candidates else 0.0
    monotonicity = _curve_monotonicity(candidates)
    signal_score = _curve_signal_score(candidates)
    result["data_quality"]["monotonicity"] = monotonicity
    result["data_quality"]["protocol_score"] = protocol_score
    result["data_quality"]["signal_score"] = signal_score

    if monotonicity < _REAL_MIN_MONOTONICITY:
        quality_gate_passed = False
        result["data_quality"]["reason"] = f"Curva muy ruidosa (monotonicity {monotonicity:.0%}, mínimo {_REAL_MIN_MONOTONICITY:.0%})"

    if protocol_score < _REAL_MIN_PROTOCOL_SCORE:
        quality_gate_passed = False
        result["data_quality"]["reason"] = (
            f"Protocolo poco adecuado para umbral real "
            f"(protocol_score {protocol_score:.0%}, mínimo {_REAL_MIN_PROTOCOL_SCORE:.0%})"
        )

    if signal_score < _REAL_MIN_SIGNAL_SCORE:
        quality_gate_passed = False
        result["data_quality"]["reason"] = (
            f"Señal insuficiente para umbral individual "
            f"(signal_score {signal_score:.0%}, mínimo {_REAL_MIN_SIGNAL_SCORE:.0%})"
        )
    if quality_gate_passed:
        result["data_quality"]["sufficient"] = True
        result["data_quality"]["reason"] = "Datos suficientes para estimación conservadora"

    # B1 — Baseline arruinado: si el mínimo de los primeros valores supera
    # 3.0 mmol, no tiene sentido estimar umbrales reales.
    if candidates:
        real_lactates = [c["lactate"] for c in candidates]
        real_baseline = min(real_lactates[: min(4, len(real_lactates))])
        if real_baseline > _BASELINE_ARRUINADO_THRESHOLD:
            result["data_quality"]["sufficient"] = False
            result["data_quality"]["reason"] = (
                f"Baseline arruinado ({real_baseline:.1f} mmol > {_BASELINE_ARRUINADO_THRESHOLD} mmol). "
                f"Repetir test con escalones iniciales más suaves."
            )
            return result

    # Run detection methods
    method_outputs: list[ThresholdMethodEstimate] = []
    if len(candidates) >= 3:
        for builder in (_method_baseline_rise, _method_sustained_increase, _method_moddmax):
            method_outputs.extend(builder(candidates))

    lt1_result = _aggregate_threshold("LT1", method_outputs)
    lt2_result = _aggregate_threshold("LT2", method_outputs)

    # B2 — Validación LT1 < LT2 en umbrales reales
    if (
        lt1_result.lactate is not None
        and lt2_result.lactate is not None
        and lt1_result.lactate >= lt2_result.lactate
    ):
        result["data_quality"]["sufficient"] = False
        result["data_quality"]["reason"] = (
            f"LT1 ({lt1_result.lactate:.2f} mmol) ≥ LT2 ({lt2_result.lactate:.2f} mmol). "
            f"Umbrales invertidos — test inválido."
        )
        return result

    quality_reason = result["data_quality"]["reason"]
    result["lt1_detection"] = _build_threshold_detection_status("LT1", lt1_result, method_outputs, quality_gate_passed, quality_reason)
    result["lt2_detection"] = _build_threshold_detection_status("LT2", lt2_result, method_outputs, quality_gate_passed, quality_reason)

    # Conservative gates for LT1 REAL
    if (
        result["lt1_detection"]["state"] == "confirmed"
        and quality_gate_passed
        and lt1_result.confidence >= _REAL_MIN_CONFIDENCE
        and lt1_result.agreement_score >= _REAL_MIN_AGREEMENT
        and (lt1_result.pace_seconds_per_km is not None or lt1_result.power_watts is not None)
        and lt1_result.lactate is not None
    ):
        result["lt1_real"] = _real_threshold_payload("LT1", lt1_result)
        # LT1 práctico REAL: load at (LT1_real_lactate - 0.3 mmol)
        lt1_practical_target = round(lt1_result.lactate - 0.3, 2)
        if lt1_practical_target > 0.5:
            practical = _interpolate_load_from_candidates(candidates, lt1_practical_target)
            if practical:
                result["lt1_practical_real"] = {
                    "name": "LT1 práctico REAL",
                    "lactate": lt1_practical_target,
                    "pace_seconds_per_km": practical.get("pace_seconds_per_km"),
                    "power_watts": practical.get("power_watts"),
                    "heart_rate": practical.get("heart_rate"),
                    "derived_from": "LT1 REAL",
                }

    # Conservative gates for LT2 REAL
    if (
        result["lt2_detection"]["state"] == "confirmed"
        and quality_gate_passed
        and lt2_result.confidence >= _REAL_MIN_CONFIDENCE
        and lt2_result.agreement_score >= _REAL_MIN_AGREEMENT
        and (lt2_result.pace_seconds_per_km is not None or lt2_result.power_watts is not None)
        and lt2_result.lactate is not None
    ):
        result["lt2_real"] = _real_threshold_payload("LT2", lt2_result)
        # LT2 práctico REAL: load at (LT2_real_lactate - 0.5 mmol)
        lt2_practical_target = round(lt2_result.lactate - 0.5, 2)
        lt1_lac = result["lt1_real"]["lactate"] if result["lt1_real"] else 0.0
        if lt2_practical_target > lt1_lac and lt2_practical_target > 0.8:
            practical = _interpolate_load_from_candidates(candidates, lt2_practical_target)
            if practical:
                result["lt2_practical_real"] = {
                    "name": "LT2 práctico REAL",
                    "lactate": lt2_practical_target,
                    "pace_seconds_per_km": practical.get("pace_seconds_per_km"),
                    "power_watts": practical.get("power_watts"),
                    "heart_rate": practical.get("heart_rate"),
                    "derived_from": "LT2 REAL",
                }

    return result


def _individual_progression_alignment(supports: list[dict[str, Any]]) -> Optional[float]:
    ordered_supports = sorted(supports, key=lambda entry: entry["session_date"])
    values: list[float] = []
    for item in ordered_supports:
        threshold = item["threshold"]
        power = threshold.get("power_watts")
        pace = threshold.get("pace_seconds_per_km")
        if power is not None:
            values.append(float(power))
            continue
        if pace is not None and pace > 0:
            values.append(3600 / float(pace))
    if len(values) < 2:
        return None

    reference_value = max(abs(median(values)), 1.0)
    tolerance = max(0.05, reference_value * _INDIVIDUAL_PROGRESS_TOLERANCE_RATIO)
    directions: list[int] = []
    for index in range(1, len(values)):
        delta = values[index] - values[index - 1]
        if abs(delta) <= tolerance:
            directions.append(0)
        elif delta > 0:
            directions.append(1)
        else:
            directions.append(-1)

    if not directions:
        return None

    positive = directions.count(1)
    negative = directions.count(-1)
    flat = directions.count(0)
    dominant = max(positive, negative)
    return round((dominant + flat) / len(directions), 2)


def _aggregate_individual_threshold(
    name: str,
    supports: list[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    if len(supports) < _INDIVIDUAL_MIN_SUPPORT_SESSIONS:
        return None

    progression_alignment = _individual_progression_alignment(supports)
    if progression_alignment is None or progression_alignment < _INDIVIDUAL_MIN_PROGRESSION_ALIGNMENT:
        return None

    lactates = [item["threshold"]["lactate"] for item in supports if item["threshold"].get("lactate") is not None]
    paces = [item["threshold"]["pace_seconds_per_km"] for item in supports if item["threshold"].get("pace_seconds_per_km") is not None]
    powers = [item["threshold"]["power_watts"] for item in supports if item["threshold"].get("power_watts") is not None]
    hrs = [item["threshold"]["heart_rate"] for item in supports if item["threshold"].get("heart_rate") is not None]
    median_confidence = median([item["threshold"].get("confidence") or 0.0 for item in supports])
    median_method_agreement = median([item["threshold"].get("agreement_score") or 0.0 for item in supports])
    protocol_score = round(median([item["quality"].get("protocol_score", 0.7) for item in supports]), 2)
    signal_score = round(median([item["quality"].get("signal_score", 0.65) for item in supports]), 2)

    lactate_agreement = 0.55 if len(lactates) < 2 else max(0.0, 1 - ((max(lactates) - min(lactates)) / 1.2))
    if powers:
        power_median = max(median(powers), 1.0)
        load_agreement = max(0.0, 1 - ((max(powers) - min(powers)) / max(power_median * 0.18, 1.0)))
    elif paces:
        pace_median = max(median(paces), 1.0)
        load_agreement = max(0.0, 1 - ((max(paces) - min(paces)) / max(pace_median * 0.10, 1.0)))
    else:
        load_agreement = 0.55
    support_score = min(0.95, 0.42 + min(len(supports), 5) * 0.11)
    agreement_score = round(max(0.18, min(0.95, lactate_agreement * 0.45 + load_agreement * 0.35 + median_method_agreement * 0.2)), 2)
    confidence = round(
        max(
            0.22,
            min(
                0.95,
                median_confidence * 0.34
                + agreement_score * 0.2
                + support_score * 0.16
                + protocol_score * 0.14
                + signal_score * 0.16,
            ),
        ),
        2,
    )
    if agreement_score < _INDIVIDUAL_MIN_AGREEMENT or confidence < _INDIVIDUAL_MIN_CONFIDENCE:
        return None
    evidence_level = "high" if confidence >= 0.82 and len(supports) >= 3 else "medium" if confidence >= 0.68 else "low"
    supporting_sessions = [
        {
            "session_id": item["session_id"],
            "session_date": item["session_date"],
            "confidence": item["threshold"].get("confidence"),
            "agreement_score": item["threshold"].get("agreement_score"),
        }
        for item in sorted(supports, key=lambda entry: entry["session_date"], reverse=True)[:6]
    ]

    display_name = "LT1 Individual" if name == "LT1" else "LT2 Individual"
    return {
        "name": display_name,
        "lactate": round(median(lactates), 2) if lactates else None,
        "pace_seconds_per_km": round(median(paces), 1) if paces else None,
        "power_watts": round(median(powers), 1) if powers else None,
        "heart_rate": round(median(hrs)) if hrs else None,
        "confidence": confidence,
        "agreement_score": agreement_score,
        "method": "longitudinal_consensus",
        "evidence_level": evidence_level,
        "rationale": (
            f"{display_name} agregado desde {len(supports)} sesiones comparables con gates de protocolo, "
            f"señal de curva, progresión longitudinal alineada y acuerdo entre métodos. "
            f"Protocol score mediano {protocol_score:.2f}; signal score mediano {signal_score:.2f}; "
            f"progression alignment {progression_alignment:.2f}."
        ),
        "supporting_sessions": supporting_sessions,
        "protocol_score": protocol_score,
        "signal_score": signal_score,
        "progression_alignment": progression_alignment,
    }


def _build_individual_thresholds(
    sessions: list[AthleteSession],
    discipline: str,
    power_source: Optional[str] = None,
) -> dict[str, Any]:
    relevant_sessions = [
        session
        for session in sorted(sessions, key=lambda current: current.performed_at)
        if session.discipline == discipline and (power_source is None or _normalized_power_source(session) == power_source)
    ]
    supports_lt1: list[dict[str, Any]] = []
    supports_lt2: list[dict[str, Any]] = []
    protocol_scores: list[float] = []
    signal_scores: list[float] = []

    for session in relevant_sessions:
        detected = _detect_real_thresholds(session)
        quality = detected.get("data_quality", {})
        if quality.get("sufficient"):
            if quality.get("protocol_score") is not None:
                protocol_scores.append(float(quality["protocol_score"]))
            if quality.get("signal_score") is not None:
                signal_scores.append(float(quality["signal_score"]))
        if detected.get("lt1_real"):
            supports_lt1.append(
                {
                    "session_id": session.id,
                    "session_date": session.performed_at.date().isoformat(),
                    "threshold": detected["lt1_real"],
                    "quality": quality,
                }
            )
        if detected.get("lt2_real"):
            supports_lt2.append(
                {
                    "session_id": session.id,
                    "session_date": session.performed_at.date().isoformat(),
                    "threshold": detected["lt2_real"],
                    "quality": quality,
                }
            )

    lt1_progression_alignment = _individual_progression_alignment(supports_lt1)
    lt2_progression_alignment = _individual_progression_alignment(supports_lt2)
    lt1_individual = _aggregate_individual_threshold("LT1", supports_lt1)
    lt2_individual = _aggregate_individual_threshold("LT2", supports_lt2)
    support_session_count = len({item["session_id"] for item in supports_lt1 + supports_lt2})
    sufficient = bool(lt1_individual or lt2_individual)
    progression_candidates = [value for value in (lt1_progression_alignment, lt2_progression_alignment) if value is not None]
    progression_alignment = round(min(progression_candidates), 2) if progression_candidates else None
    if sufficient:
        reason = "Pool suficiente para consolidar umbrales individuales longitudinales."
    elif relevant_sessions:
        if support_session_count < _INDIVIDUAL_MIN_SUPPORT_SESSIONS:
            reason = (
                f"Solo {support_session_count} sesiones con señal suficiente para consolidar umbrales individuales "
                f"(mínimo {_INDIVIDUAL_MIN_SUPPORT_SESSIONS} sesiones alineadas)."
            )
        elif progression_alignment is not None and progression_alignment < _INDIVIDUAL_MIN_PROGRESSION_ALIGNMENT:
            reason = (
                "La progresión longitudinal todavía no está suficientemente alineada para publicar LT Individual "
                f"(alignment {progression_alignment:.0%}, mínimo {_INDIVIDUAL_MIN_PROGRESSION_ALIGNMENT:.0%})."
            )
        else:
            reason = (
                "Hay sesiones comparables, pero no se ha alcanzado un consenso longitudinal suficientemente robusto "
                "para publicar LT Individual."
            )
    else:
        reason = "No hay sesiones comparables para construir umbrales individuales."

    return {
        "lt1_individual": lt1_individual,
        "lt2_individual": lt2_individual,
        "data_quality": {
            "session_count": support_session_count,
            "protocol_score": round(median(protocol_scores), 2) if protocol_scores else 0.0,
            "signal_score": round(median(signal_scores), 2) if signal_scores else 0.0,
            "progression_alignment": progression_alignment,
            "min_support_sessions": _INDIVIDUAL_MIN_SUPPORT_SESSIONS,
            "criteria_version": _INDIVIDUAL_RULESET_VERSION,
            "sufficient": sufficient,
            "reason": reason,
        },
    }


def analyze_session(session: AthleteSession) -> dict[str, Any]:
    contextual_details: list[dict[str, Any]] = []
    interpretation = []
    confidence_items = []

    for interval in session.intervals:
        sample = interval.lactate_sample
        if sample is None:
            continue
        contextual, confidence, commentary, payload = contextualize_sample(interval, session)
        sample.contextual_lactate = contextual
        sample.contextual_confidence = confidence
        sample.interpretation = commentary
        contextual_details.append(
            {
                "interval_id": interval.id,
                "order_index": interval.order_index,
                "measured_lactate": sample.lactate_mmol,
                "contextual_lactate": contextual,
                "confidence": confidence,
                "comment": commentary,
                "rules": payload["rules"],
            }
        )
        interpretation.append(commentary)
        confidence_items.append(
            {
                "label": f"Bloque {interval.order_index}",
                "score": confidence,
                "level": _confidence_level(confidence),
                "explanation": "Confianza de contextualización según descanso, retraso de muestra y densidad.",
            }
        )

    thresholds = _thresholds_from_session(session)
    threshold_confidence_items = [
        {
            "label": threshold.name,
            "score": threshold.confidence,
            "level": threshold.evidence_level,
            "explanation": threshold.rationale,
        }
        for threshold in thresholds
    ]

    peak = _peak_lactate(session)
    measured_vlamax = _calculate_measured_vlamax(session)
    return {
        "curve_by_pace": _curve_points(session, "pace_seconds_per_km"),
        "curve_by_power": _curve_points(session, "power_watts"),
        "curve_by_hr": _curve_points(session, "heart_rate_avg"),
        "thresholds": [asdict(threshold) for threshold in thresholds],
        "contextual_comments": interpretation,
        "interpretation": interpretation
        + [f"{threshold.name}: {threshold.rationale}" for threshold in thresholds],
        "confidence_summary": threshold_confidence_items + confidence_items[:3],
        "contextual_details": contextual_details,
        "peak_lactate": peak,
        "measured_vlamax": measured_vlamax,
        "historical_evolution": {},
        "real_thresholds": _detect_real_thresholds(session),
        "individual_thresholds": None,
    }


def _estimate_zones(thresholds: list[ThresholdResult], discipline: str) -> list[dict[str, Any]]:
    """Genera zonas de entrenamiento (5 zonas) ancladas a LT1/LT2 individuales.

    Modelo basado en Seiler 2006, Esteve-Lanao 2007, Faude 2009, Coggan 2010,
    Nuuttila 2025 (EJAP 125:2161):
      Z1 (Recovery):  < 85% de LT1
      Z2 (Aeróbico):  85% LT1 → LT1          (upper = LT1)
      Z3 (Tempo):     LT1 → LT2               (entre umbrales)
      Z4 (Threshold): LT2 → LT2 × 1.05        (centrada en LT2/MLSS)
      Z5 (VO2max+):   > LT2 × 1.05

    Nuuttila 2025: el 43% de atletas se clasifican mal con zonas fijas (%HRmax).
    Anclar a umbrales individuales elimina este error sistemático.

    Para pace (running): valores más ALTOS = más lento, por eso los cálculos se
    invierten (÷ en lugar de ×).
    """
    lt1 = next((item for item in thresholds if item.name == "LT1"), None)
    lt2 = next((item for item in thresholds if item.name == "LT2"), None)
    zones: list[dict[str, Any]] = []

    # ── Pace zones (running) ─────────────────────────────────────────────
    if discipline == "running" and lt1 and lt2 and lt1.pace_seconds_per_km and lt2.pace_seconds_per_km:
        lt1_p = lt1.pace_seconds_per_km
        lt2_p = lt2.pace_seconds_per_km
        # Para pace: más lento = valor mayor, así que Z1 upper > Z2 upper
        z1_lower = round(lt1_p / 0.85)        # ~85% LT1 speed → slower
        z4_upper = round(lt2_p / 1.05)        # LT2+5% speed → faster
        zones.extend([
            {"zone": "Z1", "metric": "pace", "lower": z1_lower, "upper": lt1_p,  "unit": "s/km", "label": "Recovery"},
            {"zone": "Z2", "metric": "pace", "lower": lt1_p,    "upper": lt1_p,  "unit": "s/km", "label": "Aeróbico"},
            {"zone": "Z3", "metric": "pace", "lower": lt1_p,    "upper": lt2_p,  "unit": "s/km", "label": "Tempo"},
            {"zone": "Z4", "metric": "pace", "lower": lt2_p,    "upper": z4_upper, "unit": "s/km", "label": "Threshold"},
            {"zone": "Z5", "metric": "pace", "lower": z4_upper, "upper": None,   "unit": "s/km", "label": "VO2max+"},
        ])

    # ── HR zones ─────────────────────────────────────────────────────────
    if lt1 and lt2 and lt1.heart_rate and lt2.heart_rate:
        lt1_hr = lt1.heart_rate
        lt2_hr = lt2.heart_rate
        z1_lower = round(lt1_hr * 0.85)
        z4_upper = round(lt2_hr * 1.05)
        zones.extend([
            {"zone": "Z1", "metric": "heart_rate", "lower": z1_lower, "upper": lt1_hr,  "unit": "bpm", "label": "Recovery"},
            {"zone": "Z2", "metric": "heart_rate", "lower": lt1_hr,   "upper": lt1_hr,  "unit": "bpm", "label": "Aeróbico"},
            {"zone": "Z3", "metric": "heart_rate", "lower": lt1_hr,   "upper": lt2_hr,  "unit": "bpm", "label": "Tempo"},
            {"zone": "Z4", "metric": "heart_rate", "lower": lt2_hr,   "upper": z4_upper, "unit": "bpm", "label": "Threshold"},
            {"zone": "Z5", "metric": "heart_rate", "lower": z4_upper, "upper": None,    "unit": "bpm", "label": "VO2max+"},
        ])

    # ── Power zones (ciclismo) ───────────────────────────────────────────
    if lt1 and lt2 and lt1.power_watts and lt2.power_watts:
        lt1_w = lt1.power_watts
        lt2_w = lt2.power_watts
        z1_lower = round(lt1_w * 0.85)
        z4_upper = round(lt2_w * 1.05)
        zones.extend([
            {"zone": "Z1", "metric": "power", "lower": z1_lower, "upper": lt1_w,  "unit": "W", "label": "Recovery"},
            {"zone": "Z2", "metric": "power", "lower": lt1_w,    "upper": lt1_w,  "unit": "W", "label": "Aeróbico"},
            {"zone": "Z3", "metric": "power", "lower": lt1_w,    "upper": lt2_w,  "unit": "W", "label": "Tempo"},
            {"zone": "Z4", "metric": "power", "lower": lt2_w,    "upper": z4_upper, "unit": "W", "label": "Threshold"},
            {"zone": "Z5", "metric": "power", "lower": z4_upper, "upper": None,   "unit": "W", "label": "VO2max+"},
        ])

    return zones


def _estimate_payload(
    estimate_type: str,
    discipline: str,
    power_source: Optional[str],
    value: float,
    unit: str,
    spread: float,
    confidence: float,
    snapshot_date,
    variables_used: list[str],
    evidence_points: int,
    explanation: str,
) -> dict[str, Any]:
    lower = round(value * (1 - spread), 1) if unit != "ml/kg/min" else round(value - spread, 1)
    upper = round(value * (1 + spread), 1) if unit != "ml/kg/min" else round(value + spread, 1)
    reliability = "low" if evidence_points < 2 or confidence < 0.6 else ("medium" if confidence < 0.78 else "high")
    return {
        "estimate_type": estimate_type,
        "discipline": discipline,
        "power_source": power_source,
        "value": round(value, 1),
        "unit": unit,
        "lower_bound": lower,
        "upper_bound": upper,
        "confidence": round(confidence, 2),
        "reliability_label": reliability,
        "valid_on": snapshot_date,
        "inputs_summary": explanation,
        "variables_used": variables_used,
        "evidence_points": evidence_points,
        "low_evidence": reliability == "low",
        "valid_on_iso": snapshot_date.isoformat(),
    }


def _performance_estimates(
    athlete: Athlete,
    discipline: str,
    thresholds: list[ThresholdResult],
    snapshot_date,
    history_depth: int,
    power_source: Optional[str] = None,
    dynamic_thresholds: Optional[dict[str, Any]] = None,
    snapshots: Optional[list[PhysiologicalSnapshot]] = None,
    swain_vo2max: Optional[dict[str, Any]] = None,
    measured_vlamax: Optional[dict[str, Any]] = None,
) -> list[dict[str, Any]]:
    return build_performance_estimates(
        athlete=athlete,
        discipline=discipline,
        thresholds=thresholds,
        snapshot_date=snapshot_date,
        history_depth=max(1, history_depth),
        power_source=power_source,
        dynamic_thresholds=dynamic_thresholds,
        snapshots=snapshots or [],
        swain_vo2max=swain_vo2max,
        measured_vlamax=measured_vlamax,
    )


def _trend_direction(delta: float) -> str:
    if delta > 0.02:
        return "improving"
    if delta < -0.02:
        return "degrading"
    return "stable"


def _snapshot_load(snapshot: PhysiologicalSnapshot, threshold_name: str) -> Optional[float]:
    if threshold_name == "LT1":
        if snapshot.lt1_power_watts:
            return snapshot.lt1_power_watts
        if snapshot.lt1_pace_seconds_per_km:
            return 3600 / snapshot.lt1_pace_seconds_per_km
    if threshold_name == "LT2":
        if snapshot.lt2_power_watts:
            return snapshot.lt2_power_watts
        if snapshot.lt2_pace_seconds_per_km:
            return 3600 / snapshot.lt2_pace_seconds_per_km
    return None


def _historical_evolution(snapshots: list[PhysiologicalSnapshot]) -> dict[str, list[dict[str, Any]]]:
    evolution: dict[str, list[dict[str, Any]]] = {"LT1": [], "LT2": [], "lactate_anchor": [], "peak_lactate": []}
    for snapshot in snapshots:
        evolution["LT1"].append(
            {
                "date": snapshot.snapshot_date.isoformat(),
                "metric": "LT1",
                "value": snapshot.lt1_power_watts or snapshot.lt1_pace_seconds_per_km,
                "unit": "W" if snapshot.lt1_power_watts else "s/km",
                "label": "LT1",
            }
        )
        evolution["LT2"].append(
            {
                "date": snapshot.snapshot_date.isoformat(),
                "metric": "LT2",
                "value": snapshot.lt2_power_watts or snapshot.lt2_pace_seconds_per_km,
                "unit": "W" if snapshot.lt2_power_watts else "s/km",
                "label": "LT2",
            }
        )
        if snapshot.lt1_lactate is not None:
            evolution["lactate_anchor"].append(
                {
                    "date": snapshot.snapshot_date.isoformat(),
                    "metric": "LT1_anchor_lactate",
                    "value": snapshot.lt1_lactate,
                    "unit": "mmol/L",
                    "label": "Lactato LT1",
                }
            )
        # Pico de lactato del test (proxy VLaMax) — extraído del payload de la sesión
        peak = (snapshot.payload or {}).get("peak_lactate") if snapshot.payload else None
        if peak and peak.get("lactate_mmol") is not None:
            evolution["peak_lactate"].append(
                {
                    "date": snapshot.snapshot_date.isoformat(),
                    "metric": "peak_lactate",
                    "value": peak["lactate_mmol"],
                    "unit": "mmol/L",
                    "label": "Pico lactato (proxy VLaMax)",
                }
            )
    return evolution


def _focus_metric_definition(block: AthleteFocusBlock) -> tuple[str, str, str]:
    objective = (block.block_objective or "").lower()
    if objective in {"lt1", "base aeróbica", "estabilidad subumbral", "recuperación", "readaptación"}:
        return "LT1", "load", "primary"
    if objective in {"lt2", "ritmo competición", "potencia aeróbica específica"}:
        return "LT2", "load", "primary"
    if objective == "vo2max":
        return "VO2max", "estimate", "ml/kg/min"
    if objective in {"sprint", "peak power", "neuromuscular"}:
        return "peak_30s", "power_best", "W"
    if objective in {"tolerancia lactato", "capacidad glucolítica", "repeatability"}:
        return "VLAMAX", "estimate", "mmol/L/s"
    focus = (block.energy_system_focus or "").lower()
    if focus == "aerobic capacity":
        return "LT1", "load", "primary"
    if focus == "aerobic power":
        return "LT2", "load", "primary"
    if focus == "anaerobic power":
        return "peak_30s", "power_best", "W"
    return "LT2", "load", "primary"


def _snapshot_metric_value(snapshot: PhysiologicalSnapshot, metric_name: str) -> Optional[float]:
    if metric_name == "LT1":
        return _snapshot_load(snapshot, "LT1")
    if metric_name == "LT2":
        return _snapshot_load(snapshot, "LT2")
    return None


def _latest_snapshot_metric_value(
    snapshots: list[PhysiologicalSnapshot], metric_name: str
) -> Optional[float]:
    for snapshot in reversed(snapshots):
        value = _snapshot_metric_value(snapshot, metric_name)
        if value is not None:
            return value
    return None


def _count_snapshot_metric_values(
    snapshots: list[PhysiologicalSnapshot], metric_name: str
) -> int:
    return sum(1 for snapshot in snapshots if _snapshot_metric_value(snapshot, metric_name) is not None)


def _weight_on_date(athlete: Athlete, target_date) -> Optional[float]:
    history = sorted(
        [item for item in (athlete.weights or []) if 25 <= item.weight <= 150],
        key=lambda item: item.recorded_at,
    )
    latest_before_or_on = None
    for entry in history:
        if entry.recorded_at <= target_date:
            latest_before_or_on = entry.weight
        else:
            break
    if latest_before_or_on is not None:
        return latest_before_or_on
    if history:
        return history[0].weight
    return athlete.weight if 25 <= athlete.weight <= 150 else None


def _latest_snapshot_with_metric(
    snapshots: list[PhysiologicalSnapshot], metric_name: str
) -> Optional[PhysiologicalSnapshot]:
    for snapshot in reversed(snapshots):
        if _snapshot_metric_value(snapshot, metric_name) is not None:
            return snapshot
    return None


def _estimate_metric_value(
    estimates: list[PerformanceEstimate],
    metric_name: str,
    discipline: Optional[str],
    start_date,
    end_date,
) -> Optional[float]:
    for estimate in estimates:
        if estimate.estimate_type != metric_name:
            continue
        if discipline and estimate.discipline != discipline:
            continue
        if estimate.valid_on < start_date or estimate.valid_on > end_date:
            continue
        return estimate.value
    return None


def _power_best_value(sessions: list[AthleteSession], label: str, discipline: Optional[str], start_date, end_date) -> Optional[float]:
    candidates = []
    target_seconds = {"5s": 5, "10s": 10, "30s": 30, "1min": 60, "3min": 180, "5min": 300, "10min": 600, "20min": 1200}.get(label)
    if target_seconds is None:
        return None
    for session in sessions:
        if discipline and session.discipline != discipline:
            continue
        if session.performed_at.date() < start_date or session.performed_at.date() > end_date:
            continue
        for interval in session.intervals:
            if interval.power_watts is not None and interval.duration_seconds >= target_seconds:
                candidates.append(interval.power_watts)
    return max(candidates) if candidates else None


def evaluate_focus_blocks(
    athlete: Athlete,
    snapshots: list[PhysiologicalSnapshot],
    estimates: list[PerformanceEstimate],
    sessions: list[AthleteSession],
) -> tuple[Optional[dict[str, Any]], list[dict[str, Any]]]:
    today = snapshots[-1].snapshot_date if snapshots else None
    evaluations: list[dict[str, Any]] = []
    active_block: Optional[dict[str, Any]] = None
    focus_blocks = sorted(athlete.focus_blocks, key=lambda item: item.start_date, reverse=True)

    for block in focus_blocks:
        metric_name, source_type, unit_hint = _focus_metric_definition(block)
        discipline = block.priority_discipline or athlete.primary_discipline
        start_date = block.start_date
        end_date = block.end_date or today or block.start_date
        relevant_snapshots = [
            snapshot
            for snapshot in snapshots
            if snapshot.discipline == discipline and start_date <= snapshot.snapshot_date <= end_date
        ]
        before_snapshots = [
            snapshot
            for snapshot in snapshots
            if snapshot.discipline == discipline and snapshot.snapshot_date < start_date
        ]
        baseline_value: Optional[float] = None
        latest_value: Optional[float] = None
        baseline_weight: Optional[float] = None
        latest_weight: Optional[float] = None
        baseline_relative_value: Optional[float] = None
        latest_relative_value: Optional[float] = None
        delta_relative: Optional[float] = None
        relative_unit: Optional[str] = None
        unit = "delta"
        comparable_points = 0

        if source_type == "load":
            baseline_snapshot = _latest_snapshot_with_metric(before_snapshots, metric_name)
            latest_snapshot = _latest_snapshot_with_metric(relevant_snapshots, metric_name)
            baseline_value = _snapshot_metric_value(baseline_snapshot, metric_name) if baseline_snapshot else None
            latest_value = _snapshot_metric_value(latest_snapshot, metric_name) if latest_snapshot else None
            comparable_points = _count_snapshot_metric_values(relevant_snapshots, metric_name)
            unit = "W" if discipline == "ciclismo" else "s/km"
            if discipline == "ciclismo":
                baseline_weight = _weight_on_date(athlete, baseline_snapshot.snapshot_date) if baseline_snapshot else None
                latest_weight = _weight_on_date(athlete, latest_snapshot.snapshot_date) if latest_snapshot else None
                if baseline_value is not None and baseline_weight:
                    baseline_relative_value = baseline_value / baseline_weight
                if latest_value is not None and latest_weight:
                    latest_relative_value = latest_value / latest_weight
                if baseline_relative_value is not None and latest_relative_value is not None:
                    delta_relative = latest_relative_value - baseline_relative_value
                relative_unit = "W/kg"
        elif source_type == "estimate":
            baseline_value = _estimate_metric_value(estimates, metric_name, discipline, start_date - timedelta(days=120), start_date)
            latest_value = _estimate_metric_value(estimates, metric_name, discipline, start_date, end_date)
            comparable_points = sum(
                1
                for estimate in estimates
                if estimate.estimate_type == metric_name
                and (not discipline or estimate.discipline == discipline)
                and start_date <= estimate.valid_on <= end_date
            )
            unit = unit_hint
        elif source_type == "power_best":
            baseline_value = _power_best_value(sessions, "30s", discipline, start_date - timedelta(days=120), start_date)
            latest_value = _power_best_value(sessions, "30s", discipline, start_date, end_date)
            comparable_points = sum(
                1
                for session in sessions
                if (not discipline or session.discipline == discipline)
                and start_date <= session.performed_at.date() <= end_date
            )
            unit = unit_hint

        delta = None
        worked = None
        direction = "unclear"
        confidence = 0.42

        if baseline_value is not None and latest_value is not None:
            if unit == "s/km":
                delta = baseline_value - latest_value
                worked = delta > 0
            else:
                delta = latest_value - baseline_value
                worked = delta > 0
            direction = "improving" if worked else ("degrading" if delta != 0 else "stable")
            sample_count = max(comparable_points, 1)
            confidence = min(0.9, 0.5 + sample_count * 0.08)
        elif latest_value is not None:
            direction = "needs_baseline"
            confidence = 0.38

        summary = (
            f"{block.energy_system_focus} · {block.block_objective}: "
            + (
                f"{'respuesta favorable' if worked else 'sin respuesta clara'} en {metric_name}"
                if worked is not None
                else "aún sin suficiente histórico para valorar si el bloque está funcionando"
            )
        )
        recommendation = (
            "Mantener la línea del bloque y consolidar antes de cambiar el foco."
            if worked
            else (
                "Revisar densidad, continuidad y especificidad del bloque antes del siguiente mesociclo."
                if worked is False
                else "Seguir acumulando datos comparables dentro del bloque para poder evaluarlo mejor."
            )
        )
        evaluation = {
            "block_id": block.id,
            "status": block.status,
            "summary": summary,
            "direction": direction,
            "confidence": round(confidence, 2),
            "worked": worked,
            "key_metric": metric_name,
            "baseline_value": round(baseline_value, 2) if baseline_value is not None else None,
            "latest_value": round(latest_value, 2) if latest_value is not None else None,
            "delta": round(delta, 2) if delta is not None else None,
            "unit": unit,
            "baseline_weight": round(baseline_weight, 2) if baseline_weight is not None else None,
            "latest_weight": round(latest_weight, 2) if latest_weight is not None else None,
            "baseline_relative_value": round(baseline_relative_value, 2) if baseline_relative_value is not None else None,
            "latest_relative_value": round(latest_relative_value, 2) if latest_relative_value is not None else None,
            "delta_relative": round(delta_relative, 2) if delta_relative is not None else None,
            "relative_unit": relative_unit,
            "recommendation": recommendation,
        }
        evaluations.append(evaluation)
        if block.status == "active":
            active_block = {
                "id": block.id,
                "start_date": block.start_date,
                "end_date": block.end_date,
                "energy_system_focus": block.energy_system_focus,
                "block_objective": block.block_objective,
                "block_intent": block.block_intent,
                "priority_discipline": block.priority_discipline,
                "phase": block.phase,
                "target_event": block.target_event,
                "target_date": block.target_date,
                "status": block.status,
                "coach_notes": block.coach_notes,
                "evaluation": evaluation,
            }

    return active_block, evaluations


def _power_bests(sessions: list[AthleteSession], discipline: str, power_source: Optional[str] = None) -> list[dict[str, Any]]:
    if discipline != "ciclismo":
        return []
    targets = [
        (5, "5s"),
        (10, "10s"),
        (30, "30s"),
        (60, "1min"),
        (180, "3min"),
        (300, "5min"),
        (600, "10min"),
        (1200, "20min"),
    ]
    bests: list[dict[str, Any]] = []
    intervals = [
        interval
        for session in sessions
        if session.discipline == discipline and (power_source is None or _normalized_power_source(session) == power_source)
        for interval in session.intervals
        if interval.power_watts is not None
    ]
    for target_seconds, label in targets:
        candidates = [interval.power_watts for interval in intervals if interval.duration_seconds >= target_seconds and interval.power_watts]
        if not candidates:
            continue
        bests.append(
            {
                "duration_seconds": target_seconds,
                "label": label,
                "value_watts": round(max(candidates), 1),
            }
        )
    return bests


def _discipline_history(sessions: list[AthleteSession], discipline: str, power_source: Optional[str] = None) -> dict[str, list[dict[str, Any]]]:
    history = {"pace": [], "power": [], "heart_rate": []}
    discipline_sessions = [
        session
        for session in sessions
        if session.discipline == discipline and (power_source is None or _normalized_power_source(session) == power_source)
    ]
    for session in discipline_sessions:
        analysis = analyze_session(session)
        history["pace"].extend(analysis["curve_by_pace"])
        history["power"].extend(analysis["curve_by_power"])
        history["heart_rate"].extend(analysis["curve_by_hr"])
    return history


def _measurement_log(sessions: list[AthleteSession], discipline: str, power_source: Optional[str] = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for session in sorted(
        (
            item
            for item in sessions
            if item.discipline == discipline and (power_source is None or _normalized_power_source(item) == power_source)
        ),
        key=lambda current: current.performed_at,
        reverse=True,
    ):
        for interval in session.intervals:
            sample = interval.lactate_sample
            if sample is None:
                continue
            rows.append(
                {
                    "interval_id": interval.id,
                    "session_id": session.id,
                    "session_date": session.performed_at.date().isoformat(),
                    "session_type": session.session_type,
                    "interval_label": f"Bloque {interval.order_index}",
                    "duration_seconds": interval.duration_seconds,
                    "rest_seconds": interval.rest_seconds,
                    "lactate_mmol": sample.lactate_mmol,
                    "pace_seconds_per_km": interval.pace_seconds_per_km,
                    "power_watts": interval.power_watts or interval.running_power_watts,
                    "heart_rate_avg": interval.heart_rate_avg,
                    "cadence": interval.cadence,
                    "power_source": _normalized_power_source(session),
                }
            )
    return rows


def _normalize_measurement_log_rows(
    rows: list[dict[str, Any]],
    *,
    fallback_session_id: int | None = None,
    fallback_session_type: str = "interpolated",
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            continue
        normalized.append(
            {
                "interval_id": int(row.get("interval_id") or index),
                "session_id": int(row.get("session_id") or fallback_session_id or 0),
                "session_date": row.get("session_date") or row.get("date") or "",
                "session_type": row.get("session_type") or fallback_session_type,
                "interval_label": row.get("interval_label") or row.get("label") or f"Bloque {index}",
                "duration_seconds": int(row.get("duration_seconds") or row.get("duration") or 0),
                "rest_seconds": row.get("rest_seconds"),
                "lactate_mmol": float(row.get("lactate_mmol")),
                "pace_seconds_per_km": row.get("pace_seconds_per_km") or row.get("pace_running"),
                "power_watts": row.get("power_watts"),
                "heart_rate_avg": row.get("heart_rate_avg") or row.get("heart_rate_cycling") or row.get("heart_rate_running"),
                "cadence": row.get("cadence"),
                "power_source": row.get("power_source") or row.get("source"),
            }
        )
    return normalized


def _discipline_view(
    athlete: Athlete,
    discipline: str,
    sessions: list[AthleteSession],
    snapshots: list[PhysiologicalSnapshot],
    estimates: list[PerformanceEstimate],
    power_source: Optional[str] = None,
) -> dict[str, Any]:
    discipline_snapshots = [
        snapshot
        for snapshot in snapshots
        if snapshot.discipline == discipline and (power_source is None or snapshot.power_source == power_source)
    ]
    latest_snapshot = next(
        (
            snapshot
            for snapshot in reversed(discipline_snapshots)
            if snapshot.lt1_lactate is not None or snapshot.lt2_lactate is not None
        ),
        discipline_snapshots[-1] if discipline_snapshots else None,
    )
    thresholds = latest_snapshot.payload.get("thresholds", []) if latest_snapshot else []
    threshold_objects = [_threshold_result_from_payload(item) for item in thresholds] if thresholds else []
    discipline_estimates = [
        item
        for item in estimates
        if item.discipline == discipline and (power_source is None or item.power_source == power_source)
    ]
    discipline_sessions = [
        session
        for session in sessions
        if session.discipline == discipline and (power_source is None or _normalized_power_source(session) == power_source)
    ]
    payload = {
        "discipline": discipline,
        "power_source": power_source,
        "latest_snapshot_date": latest_snapshot.snapshot_date if latest_snapshot else None,
        "thresholds": thresholds,
        "zones": _estimate_zones(threshold_objects, discipline),
        "estimates": [
            {
                "estimate_type": item.estimate_type,
                "discipline": item.discipline,
                "power_source": item.power_source,
                "value": item.value,
                "unit": item.unit,
                "lower_bound": item.lower_bound,
                "upper_bound": item.upper_bound,
                "confidence": item.confidence,
                "reliability_label": item.reliability_label,
                "valid_on": item.valid_on,
                "inputs_summary": item.inputs_summary,
                "variables_used": item.payload.get("variables_used", []),
                "evidence_points": item.payload.get("evidence_points", 1),
                "low_evidence": item.payload.get("low_evidence", False),
                "method_used": item.payload.get("method_used"),
                "primary_anchor": item.payload.get("primary_anchor"),
                "agreement_score": item.payload.get("agreement_score"),
                "range_summary": item.payload.get("range_summary"),
                "calculation_steps": item.payload.get("calculation_steps", []),
                "cautions": item.payload.get("cautions", []),
                "anchors": item.payload.get("anchors", []),
                "confidence_factors": item.payload.get("confidence_factors", []),
                "ritmo_techo": item.payload.get("ritmo_techo"),
                "ritmo_objetivo": item.payload.get("ritmo_objetivo"),
                "ritmo_seguro": item.payload.get("ritmo_seguro"),
                "glycogen_risk": item.payload.get("glycogen_risk"),
                "durability_info": item.payload.get("durability_info"),
                "quality_score": item.payload.get("quality_score"),
                "evidence_ritmo_techo": item.payload.get("evidence_ritmo_techo"),
                "evidence_ritmo_objetivo": item.payload.get("evidence_ritmo_objetivo"),
                "evidence_ritmo_seguro": item.payload.get("evidence_ritmo_seguro"),
            }
            for item in discipline_estimates[:10]
        ],
        "recent_sessions": sorted(discipline_sessions, key=lambda current: current.performed_at, reverse=True)[:5],
        "curve_history": _discipline_history(sessions, discipline, power_source),
        "historical_evolution": _historical_evolution(discipline_snapshots),
        "power_bests": _power_bests(discipline_sessions, discipline, power_source),
        "measurement_log": _measurement_log(discipline_sessions, discipline, power_source)
            or (
                _normalize_measurement_log_rows(
                    latest_snapshot.payload.get("interpolated_curve", []),
                    fallback_session_id=latest_snapshot.session_id,
                    fallback_session_type="interpolated_from_running",
                )
                if latest_snapshot and latest_snapshot.power_source == "interpolated_from_running"
                else []
            ),
        "dynamic_thresholds": latest_snapshot.payload.get("dynamic_thresholds") if latest_snapshot else None,
        "power_source_views": None,
        "real_thresholds": None,
        "individual_thresholds": None,
    }
    # Extract real_thresholds from the most recent snapshot that has them
    real_thresholds = None
    individual_thresholds = None
    if discipline_snapshots:
        sorted_snapshots = sorted(discipline_snapshots, key=lambda s: s.snapshot_date)
        for snapshot in reversed(sorted_snapshots):
            snap_payload = snapshot.payload or {}
            individual = snap_payload.get("individual_thresholds")
            if individual and individual_thresholds is None:
                individual_thresholds = individual
            rt = snap_payload.get("real_thresholds")
            if rt and (rt.get("lt1_real") or rt.get("lt2_real")):
                real_thresholds = rt
            if real_thresholds is not None and individual_thresholds is not None:
                break
    payload["individual_thresholds"] = individual_thresholds
    payload["real_thresholds"] = _merge_real_threshold_states(real_thresholds, individual_thresholds)
    # ── Swain VO2max estimation ──────────────────────────────────────────
    from app.services.physiological_engine import estimate_vo2max_swain
    swain_vo2max = None
    if latest_snapshot:
        lt2_hr = latest_snapshot.lt2_heart_rate
        lt2_pace = latest_snapshot.lt2_pace_seconds_per_km
        lt2_power = latest_snapshot.lt2_power_watts
        lt2_speed = round(3600 / lt2_pace, 3) if lt2_pace and lt2_pace > 0 else None
        # Gather HR max: coach override > observed > age-based
        hr_max_obs = getattr(athlete, "training_hr_max", None)
        if not hr_max_obs or hr_max_obs < 150:
            hr_max_obs = None
            for s in discipline_sessions:
                for iv in getattr(s, "intervals", []):
                    hr_m = getattr(iv, "heart_rate_max", None)
                    if hr_m and (hr_max_obs is None or hr_m > hr_max_obs):
                        hr_max_obs = hr_m
                    hr_a = getattr(iv, "heart_rate_avg", None)
                    if hr_a and (hr_max_obs is None or hr_a > hr_max_obs):
                        hr_max_obs = hr_a
        if not hr_max_obs or hr_max_obs < 150:
            dob = getattr(athlete, "date_of_birth", None)
            if dob:
                from datetime import date as date_type
                age = (date_type.today() - dob).days // 365
                if 10 <= age <= 90:
                    hr_max_obs = 220 - age
        level = getattr(athlete, "athlete_level", "trained") or "trained"
        hr_rest_est = {"competitive": 48, "trained": 55, "recreational": 62}.get(level, 55)
        vo2, frac, conf = estimate_vo2max_swain(
            lt2_speed_kmh=lt2_speed,
            lt2_power_watts=lt2_power,
            lt2_heart_rate=lt2_hr,
            hr_max=hr_max_obs,
            hr_rest=hr_rest_est,
            weight_kg=getattr(athlete, "weight", None),
            discipline=discipline,
        )
        if vo2 is not None:
            swain_vo2max = {
                "vo2max": vo2,
                "fractional_utilization": frac,
                "confidence": conf,
                "source": "swain_hr",
                "hr_max_used": hr_max_obs,
                "hr_rest_used": hr_rest_est,
                "lt2_hr_used": lt2_hr,
            }
    payload["swain_vo2max"] = swain_vo2max

    # ── Measured VLamax from latest sprint test ───────────────────────────
    _latest_measured_vlamax = None
    for snap in reversed(snapshots):
        _mv = (snap.payload or {}).get("measured_vlamax")
        if _mv and _mv.get("vlamax_mmol_min"):
            _latest_measured_vlamax = _mv
            break
    payload["measured_vlamax"] = _latest_measured_vlamax

    # ── Target curve from athlete's race goal ────────────────────────────
    target_curve = None
    if discipline == "running" and latest_snapshot:
        from app.services.prediction_engine import build_target_curve as _build_tc
        # Find the nearest running target
        targets = getattr(athlete, "targets", [])
        running_target = None
        for t in targets:
            t_disc = getattr(t, "discipline", None)
            t_cat = getattr(t, "distance_category", None)
            if t_disc in ("running", "triatlón") and t_cat in ("5k", "10k", "hm", "marathon"):
                if running_target is None or (getattr(t, "priority_level", "") or "") == "A":
                    running_target = t
        if running_target:
            t_pace = (
                getattr(running_target, "target_pace_label", None)
                or getattr(running_target, "target_running_pace_label", None)
            )
            # Gather current physiological data from latest estimates
            _cur_vo2 = swain_vo2max["vo2max"] if swain_vo2max else None
            _cur_vlamax = None
            for est in discipline_estimates:
                if est.estimate_type == "VLAMAX":
                    _cur_vlamax = est.value
                    break
            # Current LT1/LT2 speeds
            _lt2_spd = round(3600 / latest_snapshot.lt2_pace_seconds_per_km, 3) if latest_snapshot.lt2_pace_seconds_per_km and latest_snapshot.lt2_pace_seconds_per_km > 0 else None
            _lt1_spd = round(3600 / latest_snapshot.lt1_pace_seconds_per_km, 3) if latest_snapshot.lt1_pace_seconds_per_km and latest_snapshot.lt1_pace_seconds_per_km > 0 else None
            # Use real lactate values at thresholds
            _lt1_lac = latest_snapshot.lt1_lactate
            _lt2_lac = latest_snapshot.lt2_lactate
            # Check for individual/real thresholds (more accurate lactate values)
            if individual_thresholds:
                _it_lt1 = individual_thresholds.get("lt1_individual") if isinstance(individual_thresholds, dict) else None
                _it_lt2 = individual_thresholds.get("lt2_individual") if isinstance(individual_thresholds, dict) else None
                if _it_lt1 and _it_lt1.get("lactate"):
                    _lt1_lac = _it_lt1["lactate"]
                if _it_lt2 and _it_lt2.get("lactate"):
                    _lt2_lac = _it_lt2["lactate"]
            elif real_thresholds:
                _rt_lt1 = real_thresholds.get("lt1_real") if isinstance(real_thresholds, dict) else None
                _rt_lt2 = real_thresholds.get("lt2_real") if isinstance(real_thresholds, dict) else None
                if _rt_lt1 and _rt_lt1.get("lactate"):
                    _lt1_lac = _rt_lt1["lactate"]
                if _rt_lt2 and _rt_lt2.get("lactate"):
                    _lt2_lac = _rt_lt2["lactate"]

            target_curve = _build_tc(
                distance_category=running_target.distance_category,
                target_pace_label=t_pace,
                current_lt1_speed_kph=_lt1_spd,
                current_lt2_speed_kph=_lt2_spd,
                current_lt1_lactate=_lt1_lac,
                current_lt2_lactate=_lt2_lac,
                current_vo2max=_cur_vo2,
                current_vlamax=_cur_vlamax,
            )
    payload["target_curve"] = target_curve

    if discipline == "ciclismo" and power_source is None:
        payload["power_source_views"] = {
            source: _discipline_view(athlete, discipline, sessions, snapshots, estimates, power_source=source)
            for source in ("outdoor", "indoor")
            if any(_normalized_power_source(session) == source for session in sessions if session.discipline == discipline)
        }

    # ── Level suggestion ─────────────────────────────────────────────────
    from app.services.physiological_engine import suggest_athlete_level
    if latest_snapshot and power_source is None:
        lt2_pace = latest_snapshot.lt2_pace_seconds_per_km
        lt2_power = latest_snapshot.lt2_power_watts
        lt2_speed = round(3600 / lt2_pace, 3) if lt2_pace and lt2_pace > 0 else None
        lt2_vals: dict[str, Optional[float]] = {}
        if discipline == "ciclismo" and lt2_power:
            lt2_vals["ciclismo"] = float(lt2_power)
        elif discipline == "natacion" and lt2_speed:
            lt2_vals["natacion"] = lt2_speed
        elif lt2_speed:
            lt2_vals["running"] = lt2_speed

        vo2_est = swain_vo2max["vo2max"] if swain_vo2max else None
        frac_est = swain_vo2max.get("fractional_utilization") if swain_vo2max else None
        lt1_pace = latest_snapshot.lt1_pace_seconds_per_km
        lt1_speed = round(3600 / lt1_pace, 3) if lt1_pace and lt1_pace > 0 else None
        lt1_power = latest_snapshot.lt1_power_watts
        ratio = None
        if discipline == "ciclismo" and lt1_power and lt2_power and lt2_power > 0:
            ratio = lt1_power / lt2_power
        elif lt1_speed and lt2_speed and lt2_speed > 0:
            ratio = lt1_speed / lt2_speed

        sex = getattr(athlete, "sex", "male") or "male"
        suggestion = suggest_athlete_level(
            lt2_values=lt2_vals,
            vo2max=vo2_est,
            lt1_lt2_ratio=ratio,
            fractional_utilization=frac_est,
            sex=sex,
        )
        current_level = getattr(athlete, "athlete_level", "trained") or "trained"
        suggestion.current_level = current_level
        suggestion.matches_current = suggestion.suggested_level == current_level
        payload["level_suggestion"] = {
            "suggested_level": suggestion.suggested_level,
            "confidence": suggestion.confidence,
            "current_level": suggestion.current_level,
            "matches_current": suggestion.matches_current,
            "evidence": suggestion.evidence,
            "scores": suggestion.scores,
        }

    return payload


def _longitudinal_metrics(athlete: Athlete, snapshots: list[PhysiologicalSnapshot]) -> list[DerivedMetric]:
    if len(snapshots) < 2:
        return []
    derived: list[DerivedMetric] = []

    latest = snapshots[-1]

    def add_weighted_trend(metric_name: str, threshold_name: str) -> None:
        values = []
        for snapshot in snapshots:
            load = _snapshot_load(snapshot, threshold_name)
            if load is not None:
                values.append((snapshot, load))
        if len(values) < 3:
            return
        split_index = max(1, len(values) // 2)
        earlier = values[:split_index]
        recent = values[split_index:]

        def weighted_average(series):
            total_weight = 0.0
            weighted_sum = 0.0
            for index, (_, value) in enumerate(series, start=1):
                total_weight += index
                weighted_sum += value * index
            return weighted_sum / total_weight if total_weight else None

        earlier_avg = weighted_average(earlier)
        recent_avg = weighted_average(recent)
        if not earlier_avg or not recent_avg:
            return
        delta = (recent_avg - earlier_avg) / earlier_avg
        confidence = min(0.92, 0.62 + min(len(values), 8) * 0.03)
        derived.append(
            DerivedMetric(
                athlete_id=athlete.id,
                session_id=latest.session_id,
                metric_type=metric_name,
                value=round(delta, 3),
                unit="delta",
                confidence=round(confidence, 2),
                recorded_at=latest.session.performed_at if latest.session else latest.snapshot_date,
                explanation=f"Tendencia longitudinal de {threshold_name} comparando media ponderada reciente frente a histórica.",
                payload={
                    "earlier_average": round(earlier_avg, 3),
                    "recent_average": round(recent_avg, 3),
                    "samples": len(values),
                    "direction": _trend_direction(delta),
                },
            )
        )

    add_weighted_trend("trend_LT1", "LT1")
    add_weighted_trend("trend_LT2", "LT2")

    lt1_anchors = []
    for snapshot in snapshots:
        if snapshot.lt1_lactate is not None:
            load = _snapshot_load(snapshot, "LT1")
            if load is not None:
                lt1_anchors.append((snapshot, load))
    if len(lt1_anchors) >= 3:
        earlier_anchor = sum(value for _, value in lt1_anchors[: len(lt1_anchors) // 2]) / max(1, len(lt1_anchors) // 2)
        recent_anchor_series = lt1_anchors[len(lt1_anchors) // 2 :]
        recent_anchor = sum(value for _, value in recent_anchor_series) / len(recent_anchor_series)
        anchor_delta = (recent_anchor - earlier_anchor) / earlier_anchor
        derived.append(
            DerivedMetric(
                athlete_id=athlete.id,
                session_id=latest.session_id,
                metric_type="lactate_anchor_progression",
                value=round(anchor_delta, 3),
                unit="delta",
                confidence=0.78,
                recorded_at=latest.session.performed_at if latest.session else latest.snapshot_date,
                explanation="Compara si un lactato de referencia similar aparece ahora a mejor o peor carga externa que meses atrás.",
                payload={
                    "previous_load": round(earlier_anchor, 3),
                    "latest_load": round(recent_anchor, 3),
                    "samples": len(lt1_anchors),
                    "direction": _trend_direction(anchor_delta),
                },
            )
        )
    return derived


def _needs_recalculation_lightweight(athlete: Athlete, snapshots_light: list[PhysiologicalSnapshot]) -> bool | None:
    """Fast check using only scalar columns (no payload deserialization).

    Returns True/False when the answer is conclusive, or None when
    payload inspection is required (caller should do the heavy check).
    """
    if not athlete.sessions:
        return False
    session_snapshots = [s for s in snapshots_light if s.power_source != "interpolated_from_running"]
    if not session_snapshots:
        return True

    latest_session_date = max(session.performed_at.date() for session in athlete.sessions)
    latest_snapshot_date = max(snapshot.snapshot_date for snapshot in session_snapshots)
    if latest_session_date > latest_snapshot_date:
        return True

    session_keys = {(session.id, session.performed_at.date(), session.discipline, _normalized_power_source(session)) for session in athlete.sessions}
    snapshot_keys = {(snapshot.session_id, snapshot.snapshot_date, snapshot.discipline, snapshot.power_source) for snapshot in session_snapshots}
    if len(snapshot_keys) != len(session_keys):
        return True
    if not session_keys.issubset(snapshot_keys):
        return True

    return None  # Need payload check


def _needs_recalculation_payload_check(snapshots: list[PhysiologicalSnapshot]) -> bool:
    """Heavy check — inspects JSON payload for version staleness."""
    for snapshot in snapshots:
        if snapshot.power_source == "interpolated_from_running":
            continue
        payload = snapshot.payload or {}
        if "dynamic_thresholds" not in payload:
            return True
        real_quality = (payload.get("real_thresholds") or {}).get("data_quality") or {}
        if real_quality.get("criteria_version") != _REAL_RULESET_VERSION:
            return True
        individual_quality = (payload.get("individual_thresholds") or {}).get("data_quality") or {}
        if individual_quality.get("criteria_version") != _INDIVIDUAL_RULESET_VERSION:
            return True
    return False


def _needs_recalculation(athlete: Athlete, snapshots: list[PhysiologicalSnapshot]) -> bool:
    result = _needs_recalculation_lightweight(athlete, snapshots)
    if result is not None:
        return result
    return _needs_recalculation_payload_check(snapshots)


def recalculate_athlete(db: Session, athlete_id: int) -> dict[str, Any]:
    athlete = db.scalar(
        select(Athlete)
        .options(
            joinedload(Athlete.sessions).joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample),
            joinedload(Athlete.snapshots),
        )
        .where(Athlete.id == athlete_id)
    )
    if athlete is None:
        raise ValueError("Athlete not found")

    db.execute(delete(DerivedMetric).where(DerivedMetric.athlete_id == athlete_id))
    db.execute(delete(PerformanceEstimate).where(PerformanceEstimate.athlete_id == athlete_id))
    # Preserve interpolated snapshots (managed by interpolation endpoint, not recalculation)
    db.execute(
        delete(PhysiologicalSnapshot).where(
            PhysiologicalSnapshot.athlete_id == athlete_id,
            PhysiologicalSnapshot.power_source != "interpolated_from_running",
        )
    )

    dynamic_config = config_from_settings(get_settings())
    # Pre-load surviving (interpolated) snapshots once; maintain list in-memory
    # instead of querying ALL snapshots on every loop iteration (was O(N²)).
    prior_snapshots: list[PhysiologicalSnapshot] = list(db.scalars(
        select(PhysiologicalSnapshot)
        .where(PhysiologicalSnapshot.athlete_id == athlete.id)
        .order_by(PhysiologicalSnapshot.snapshot_date)
    ).all())
    for session in sorted(athlete.sessions, key=lambda current: current.performed_at):
        analysis = analyze_session(session)
        # Extraer LT2 fisiológico de la sesión actual para anclar el LT2 práctico dinámico.
        # El LT2 fisiológico se calcula por forma de curva (inflexión), mientras que el
        # dinámico interpola en mmol fijos; anclarlos parcialmente mejora la coherencia
        # cuando los datos dinámicos son escasos o ruidosos.
        _phys_thresholds = analysis.get("thresholds", [])
        _lt2_phys = next((t for t in _phys_thresholds if t.get("name") == "LT2"), None)
        _lt2_pace = _lt2_phys.get("pace_seconds_per_km") if _lt2_phys else None
        _lt2_power = _lt2_phys.get("power_watts") if _lt2_phys else None
        _lt2_lactate = _lt2_phys.get("lactate") if _lt2_phys else None
        _lt1_phys = next((t for t in _phys_thresholds if t.get("name") == "LT1"), None)
        _lt1_lactate = _lt1_phys.get("lactate") if _lt1_phys else None
        analysis["dynamic_thresholds"] = build_dynamic_threshold_payload(
            athlete=athlete,
            sessions=[current for current in athlete.sessions if current.performed_at.date() <= session.performed_at.date()],
            snapshots=prior_snapshots,
            discipline=session.discipline,
            as_of=session.performed_at.date(),
            config=dynamic_config,
            power_source=_normalized_power_source(session),
            physiological_lt2_speed_kph=round(3600 / _lt2_pace, 3) if _lt2_pace else None,
            physiological_lt2_power_watts=_lt2_power,
            physiological_lt2_lactate_mmol=float(_lt2_lactate) if _lt2_lactate is not None else None,
            physiological_lt1_lactate_mmol=float(_lt1_lactate) if _lt1_lactate is not None else None,
        )
        analysis["individual_thresholds"] = _build_individual_thresholds(
            sessions=[current for current in athlete.sessions if current.performed_at.date() <= session.performed_at.date()],
            discipline=session.discipline,
            power_source=_normalized_power_source(session),
        )
        thresholds = [_threshold_result_from_payload(item) for item in analysis["thresholds"]]
        snapshot = PhysiologicalSnapshot(
            athlete_id=athlete.id,
            session_id=session.id,
            snapshot_date=session.performed_at.date(),
            discipline=session.discipline,
            power_source=_normalized_power_source(session),
            lt1_lactate=next((item.lactate for item in thresholds if item.name == "LT1"), None),
            lt2_lactate=next((item.lactate for item in thresholds if item.name == "LT2"), None),
            lt1_pace_seconds_per_km=next((item.pace_seconds_per_km for item in thresholds if item.name == "LT1"), None),
            lt2_pace_seconds_per_km=next((item.pace_seconds_per_km for item in thresholds if item.name == "LT2"), None),
            lt1_power_watts=next((item.power_watts for item in thresholds if item.name == "LT1"), None),
            lt2_power_watts=next((item.power_watts for item in thresholds if item.name == "LT2"), None),
            lt1_heart_rate=next((item.heart_rate for item in thresholds if item.name == "LT1"), None),
            lt2_heart_rate=next((item.heart_rate for item in thresholds if item.name == "LT2"), None),
            method="hybrid_threshold_engine_v2",
            confidence=round(mean([item.confidence for item in thresholds]), 2) if thresholds else 0.4,
            summary="Snapshot calculado desde contextualización conservadora, comparación de métodos y reglas longitudinales explicables.",
            payload=analysis,
        )
        db.add(snapshot)
        db.flush()
        # Append to in-memory list so next iteration sees this snapshot
        prior_snapshots.append(snapshot)

        discipline_history_depth = sum(
            1
            for current in athlete.sessions
            if current.discipline == session.discipline
            and current.performed_at.date() <= session.performed_at.date()
            and (
                session.discipline != "ciclismo"
                or _normalized_power_source(current) == snapshot.power_source
            )
        )
        comparable_snapshots = [
            item
            for item in prior_snapshots
            if item.discipline == snapshot.discipline
            and (
                snapshot.discipline != "ciclismo"
                or item.power_source == snapshot.power_source
            )
        ]
        # Compute Swain VO2max for this snapshot to feed into predictions
        _swain_for_prediction = None
        if snapshot.lt2_heart_rate and snapshot.discipline == "running":
            from app.services.physiological_engine import estimate_vo2max_swain as _est_swain
            _lt2_spd = round(3600 / snapshot.lt2_pace_seconds_per_km, 3) if snapshot.lt2_pace_seconds_per_km and snapshot.lt2_pace_seconds_per_km > 0 else None
            _hr_max_snap = getattr(athlete, "training_hr_max", None)
            if not _hr_max_snap or _hr_max_snap < 150:
                _hr_max_snap = None
                for _iv in getattr(session, "intervals", []):
                    _hrm = getattr(_iv, "heart_rate_max", None)
                    if _hrm and (_hr_max_snap is None or _hrm > _hr_max_snap):
                        _hr_max_snap = _hrm
            if not _hr_max_snap or _hr_max_snap < 150:
                _dob = getattr(athlete, "date_of_birth", None)
                if _dob:
                    _age = (session.performed_at.date() - _dob).days // 365
                    if 10 <= _age <= 90:
                        _hr_max_snap = 220 - _age
            _lvl = getattr(athlete, "athlete_level", "trained") or "trained"
            _hr_rest_snap = {"competitive": 48, "trained": 55, "recreational": 62}.get(_lvl, 55)
            _v, _f, _c = _est_swain(
                lt2_speed_kmh=_lt2_spd, lt2_power_watts=None,
                lt2_heart_rate=snapshot.lt2_heart_rate,
                hr_max=_hr_max_snap, hr_rest=_hr_rest_snap,
                weight_kg=getattr(athlete, "weight", None),
                discipline="running",
            )
            if _v is not None:
                _swain_for_prediction = {"vo2max": _v, "fractional_utilization": _f, "confidence": _c}

        # Find latest measured VLamax: from current session or most recent prior snapshot
        _measured_vlamax = analysis.get("measured_vlamax")
        if _measured_vlamax is None:
            for _prior in reversed(prior_snapshots):
                _prior_mv = (_prior.payload or {}).get("measured_vlamax")
                if _prior_mv and _prior_mv.get("vlamax_mmol_min"):
                    _measured_vlamax = _prior_mv
                    break

        for estimate in _performance_estimates(
            athlete,
            snapshot.discipline,
            thresholds,
            snapshot.snapshot_date,
            history_depth=discipline_history_depth,
            power_source=snapshot.power_source,
            dynamic_thresholds=analysis.get("dynamic_thresholds"),
            snapshots=comparable_snapshots,
            swain_vo2max=_swain_for_prediction,
            measured_vlamax=_measured_vlamax,
        ):
            payload = dict(estimate)
            payload["valid_on"] = estimate["valid_on_iso"]
            db.add(
                PerformanceEstimate(
                    athlete_id=athlete.id,
                    snapshot_id=snapshot.id,
                    estimate_type=estimate["estimate_type"],
                    discipline=estimate["discipline"],
                    power_source=estimate.get("power_source"),
                    value=estimate["value"],
                    unit=estimate["unit"],
                    lower_bound=estimate["lower_bound"],
                    upper_bound=estimate["upper_bound"],
                    confidence=estimate["confidence"],
                    valid_on=estimate["valid_on"],
                    reliability_label=estimate["reliability_label"],
                    inputs_summary=estimate["inputs_summary"],
                    payload=payload,
                )
            )

        lt1 = next((item for item in thresholds if item.name == "LT1"), None)
        lt2 = next((item for item in thresholds if item.name == "LT2"), None)
        if lt1 and lt2:
            if lt1.pace_seconds_per_km and lt2.pace_seconds_per_km:
                economy_value = (lt1.pace_seconds_per_km - lt2.pace_seconds_per_km) / lt1.pace_seconds_per_km
                db.add(
                    DerivedMetric(
                        athlete_id=athlete.id,
                        session_id=session.id,
                        metric_type="running_economy_band",
                        value=round(economy_value, 3),
                        unit="ratio",
                        confidence=0.72,
                        recorded_at=session.performed_at,
                        explanation="Separación relativa entre LT1 y LT2 en ritmo.",
                        payload={"lt1": lt1.pace_seconds_per_km, "lt2": lt2.pace_seconds_per_km},
                    )
                )
            if lt1.power_watts and lt2.power_watts:
                efficiency_value = lt2.power_watts / athlete.weight
                db.add(
                    DerivedMetric(
                        athlete_id=athlete.id,
                        session_id=session.id,
                        metric_type="cycling_efficiency",
                        value=round(efficiency_value, 2),
                        unit="W/kg",
                        confidence=0.77,
                        recorded_at=session.performed_at,
                        explanation="Potencia relativa en LT2.",
                        payload={"lt2_power": lt2.power_watts, "weight": athlete.weight},
                    )
                )

    db.flush()

    snapshots = db.scalars(
        select(PhysiologicalSnapshot).where(PhysiologicalSnapshot.athlete_id == athlete_id).order_by(PhysiologicalSnapshot.snapshot_date)
    ).all()
    for metric in _longitudinal_metrics(athlete, snapshots):
        db.add(metric)

    # ── Threshold cascade: refresh future planned sessions ──
    try:
        from app.services.threshold_cascade import cascade_threshold_update
        disciplines_processed = {s.discipline for s in athlete.sessions}
        cascade_summary = {}
        for disc in disciplines_processed:
            cascade_summary[disc] = cascade_threshold_update(db, athlete_id, disc)
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "Threshold cascade failed for athlete=%d", athlete_id, exc_info=True,
        )
        cascade_summary = {}

    db.commit()
    return {"sessions_processed": len(athlete.sessions), "threshold_cascade": cascade_summary}


def athlete_analysis_payload(db: Session, athlete_id: int) -> dict[str, Any]:
    athlete = db.scalar(
        select(Athlete)
        .options(
            joinedload(Athlete.weights),
            joinedload(Athlete.focus_blocks),
            joinedload(Athlete.targets),
            joinedload(Athlete.sessions).joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample),
        )
        .where(Athlete.id == athlete_id)
    )
    if athlete is None:
        raise ValueError("Athlete not found")

    # Phase 1: lightweight recalculation check — no JSON payload deserialization.
    # This avoids the 3-4s cost of json.loads on thousands of payload columns
    # when the answer is obvious (new sessions added, or no sessions at all).
    snapshots_light = db.scalars(
        select(PhysiologicalSnapshot)
        .options(defer(PhysiologicalSnapshot.payload))
        .where(PhysiologicalSnapshot.athlete_id == athlete_id)
        .order_by(PhysiologicalSnapshot.snapshot_date)
    ).all()
    light_result = _needs_recalculation_lightweight(athlete, snapshots_light)
    db.expire_all()  # Clear deferred-payload objects from identity map

    if light_result is True:
        # Definitely needs recalculation (new sessions, missing snapshots)
        recalculate_athlete(db, athlete_id)
        athlete = db.scalar(
            select(Athlete)
            .options(
                joinedload(Athlete.weights),
                joinedload(Athlete.focus_blocks),
                joinedload(Athlete.targets),
                joinedload(Athlete.sessions).joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample),
            )
            .where(Athlete.id == athlete_id)
        )
        if athlete is None:
            raise ValueError("Athlete not found")
        snapshots = db.scalars(
            select(PhysiologicalSnapshot).where(PhysiologicalSnapshot.athlete_id == athlete_id).order_by(PhysiologicalSnapshot.snapshot_date)
        ).all()
    elif light_result is False:
        # No sessions at all
        snapshots = []
    else:
        # Inconclusive — need to inspect payload versions (full load required)
        snapshots = db.scalars(
            select(PhysiologicalSnapshot).where(PhysiologicalSnapshot.athlete_id == athlete_id).order_by(PhysiologicalSnapshot.snapshot_date)
        ).all()
        if _needs_recalculation_payload_check(snapshots):
            recalculate_athlete(db, athlete_id)
            athlete = db.scalar(
                select(Athlete)
                .options(
                    joinedload(Athlete.weights),
                    joinedload(Athlete.focus_blocks),
                    joinedload(Athlete.targets),
                    joinedload(Athlete.sessions).joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample),
                )
                .where(Athlete.id == athlete_id)
            )
            if athlete is None:
                raise ValueError("Athlete not found")
            snapshots = db.scalars(
                select(PhysiologicalSnapshot).where(PhysiologicalSnapshot.athlete_id == athlete_id).order_by(PhysiologicalSnapshot.snapshot_date)
            ).all()

    estimates = db.scalars(
        select(PerformanceEstimate)
        .where(PerformanceEstimate.athlete_id == athlete_id)
        .order_by(PerformanceEstimate.valid_on.desc(), PerformanceEstimate.id.desc())
    ).all()
    metrics = db.scalars(
        select(DerivedMetric)
        .where(DerivedMetric.athlete_id == athlete_id)
        .order_by(DerivedMetric.recorded_at.desc(), DerivedMetric.id.desc())
    ).all()
    active_focus_block, focus_block_evaluations = evaluate_focus_blocks(athlete, snapshots, estimates, athlete.sessions)

    latest_snapshot = next(
        (
            snapshot
            for snapshot in reversed(snapshots)
            if snapshot.lt1_lactate is not None or snapshot.lt2_lactate is not None
        ),
        snapshots[-1] if snapshots else None,
    )
    latest_thresholds: list[dict[str, Any]] = []
    if latest_snapshot:
        snapshot_thresholds = latest_snapshot.payload.get("thresholds", [])
        latest_thresholds = snapshot_thresholds

    threshold_objects = [_threshold_result_from_payload(item) for item in latest_thresholds] if latest_thresholds else []
    zones = _estimate_zones(threshold_objects, athlete.primary_discipline)

    trend_metrics = []
    confidence_summary = []
    for metric in metrics:
        if metric.metric_type.startswith("trend_") or metric.metric_type == "lactate_anchor_progression":
            trend_metrics.append(
                {
                    "metric": metric.metric_type,
                    "value": metric.value,
                    "direction": metric.payload.get("direction", _trend_direction(metric.value)),
                    "confidence": metric.confidence,
                    "summary": metric.explanation or "",
                }
            )
            confidence_summary.append(
                {
                    "label": metric.metric_type,
                    "score": metric.confidence,
                    "level": _confidence_level(metric.confidence),
                    "explanation": metric.explanation or "",
                }
            )

    history = {"pace": [], "power": [], "heart_rate": []}
    for session in sorted(athlete.sessions, key=lambda current: current.performed_at)[-6:]:
        analysis = analyze_session(session)
        history["pace"].extend(analysis["curve_by_pace"])
        history["power"].extend(analysis["curve_by_power"])
        history["heart_rate"].extend(analysis["curve_by_hr"])

    interpretation = []
    if latest_snapshot:
        interpretation.extend(latest_snapshot.payload.get("interpretation", []))
    for trend in trend_metrics[:3]:
        interpretation.append(f"{trend['metric']} {trend['direction']} ({trend['value']:+.1%}).")

    if latest_snapshot:
        confidence_summary.insert(
            0,
            {
                "label": "snapshot_global",
                "score": latest_snapshot.confidence,
                "level": _confidence_level(latest_snapshot.confidence),
                "explanation": latest_snapshot.summary or "",
            },
        )

    available_disciplines = sorted(
        {session.discipline for session in athlete.sessions}
        | {snapshot.discipline for snapshot in snapshots if snapshot.discipline}
    )
    discipline_views = {
        discipline: _discipline_view(athlete, discipline, athlete.sessions, snapshots, estimates)
        for discipline in available_disciplines
    }
    latest_dynamic_thresholds = latest_snapshot.payload.get("dynamic_thresholds") if latest_snapshot else None
    latest_real_thresholds = latest_snapshot.payload.get("real_thresholds") if latest_snapshot else None
    latest_individual_thresholds = latest_snapshot.payload.get("individual_thresholds") if latest_snapshot else None
    latest_real_thresholds = _merge_real_threshold_states(latest_real_thresholds, latest_individual_thresholds)

    return {
        "athlete": athlete,
        "latest_snapshot_date": latest_snapshot.snapshot_date if latest_snapshot else None,
        "thresholds": latest_thresholds,
        "zones": zones,
        "estimates": [
            {
                "estimate_type": item.estimate_type,
                "discipline": item.discipline,
                "value": item.value,
                "unit": item.unit,
                "lower_bound": item.lower_bound,
                "upper_bound": item.upper_bound,
                "confidence": item.confidence,
                "reliability_label": item.reliability_label,
                "valid_on": item.valid_on,
                "inputs_summary": item.inputs_summary,
                "variables_used": item.payload.get("variables_used", []),
                "evidence_points": item.payload.get("evidence_points", 1),
                "low_evidence": item.payload.get("low_evidence", False),
                "method_used": item.payload.get("method_used"),
                "primary_anchor": item.payload.get("primary_anchor"),
                "agreement_score": item.payload.get("agreement_score"),
                "range_summary": item.payload.get("range_summary"),
                "calculation_steps": item.payload.get("calculation_steps", []),
                "cautions": item.payload.get("cautions", []),
                "anchors": item.payload.get("anchors", []),
                "confidence_factors": item.payload.get("confidence_factors", []),
            }
            for item in estimates[:10]
        ],
        "trends": trend_metrics,
        "recent_sessions": sorted(athlete.sessions, key=lambda current: current.performed_at, reverse=True)[:5],
        "curve_history": history,
        "automated_comments": interpretation,
        "interpretation": interpretation,
        "confidence_summary": confidence_summary,
        "historical_evolution": _historical_evolution(snapshots),
        "dynamic_thresholds": latest_dynamic_thresholds,
        "real_thresholds": latest_real_thresholds,
        "individual_thresholds": latest_individual_thresholds,
        "discipline_views": discipline_views,
        "active_focus_block": active_focus_block,
        "focus_block_evaluations": focus_block_evaluations,
    }


def dynamic_thresholds_payload(
    db: Session,
    athlete_id: int,
    discipline: Optional[str] = None,
    power_source: Optional[str] = None,
) -> dict[str, Any]:
    athlete = db.scalar(
        select(Athlete)
        .options(
            joinedload(Athlete.sessions).joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample),
            joinedload(Athlete.snapshots),
        )
        .where(Athlete.id == athlete_id)
    )
    if athlete is None:
        raise ValueError("Athlete not found")
    snapshots = sorted(athlete.snapshots, key=lambda item: item.snapshot_date)
    if _needs_recalculation(athlete, snapshots):
        recalculate_athlete(db, athlete_id)
        athlete = db.scalar(
            select(Athlete)
            .options(
                joinedload(Athlete.sessions).joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample),
                joinedload(Athlete.snapshots),
            )
            .where(Athlete.id == athlete_id)
        )
        if athlete is None:
            raise ValueError("Athlete not found")
        snapshots = sorted(athlete.snapshots, key=lambda item: item.snapshot_date)

    resolved_discipline = discipline
    if resolved_discipline is None:
        available = sorted({session.discipline for session in athlete.sessions})
        if athlete.primary_discipline in available:
            resolved_discipline = athlete.primary_discipline
        else:
            resolved_discipline = next((item for item in available if item in {"running", "ciclismo"}), available[0] if available else athlete.primary_discipline)

    matching = [
        snapshot
        for snapshot in snapshots
        if snapshot.discipline == resolved_discipline and (power_source is None or snapshot.power_source == power_source)
    ]
    latest_snapshot = matching[-1] if matching else None
    if latest_snapshot and latest_snapshot.payload.get("dynamic_thresholds"):
        return latest_snapshot.payload["dynamic_thresholds"]

    resolved_as_of = max(
        (session.performed_at.date() for session in athlete.sessions if session.discipline == resolved_discipline),
        default=None,
    )
    if resolved_as_of is None:
        resolved_as_of = snapshots[-1].snapshot_date if snapshots else date.today()

    # Extract physiological LT1/LT2 from latest snapshot if available.
    _phys_lt2_speed = None
    _phys_lt2_power = None
    _phys_lt2_lactate = None
    _phys_lt1_lactate = None
    if latest_snapshot and latest_snapshot.payload:
        _snap_thresholds = latest_snapshot.payload.get("thresholds", [])
        _snap_lt2 = next((t for t in _snap_thresholds if t.get("name") == "LT2"), None)
        if _snap_lt2:
            _snap_pace = _snap_lt2.get("pace_seconds_per_km")
            _phys_lt2_speed = round(3600 / _snap_pace, 3) if _snap_pace else None
            _phys_lt2_power = _snap_lt2.get("power_watts")
            _phys_lt2_lactate = float(_snap_lt2["lactate"]) if _snap_lt2.get("lactate") is not None else None
        _snap_lt1 = next((t for t in _snap_thresholds if t.get("name") == "LT1"), None)
        if _snap_lt1:
            _phys_lt1_lactate = float(_snap_lt1["lactate"]) if _snap_lt1.get("lactate") is not None else None

    return build_dynamic_threshold_payload(
        athlete=athlete,
        sessions=athlete.sessions,
        snapshots=snapshots,
        discipline=resolved_discipline,
        as_of=resolved_as_of,
        config=config_from_settings(get_settings()),
        power_source=power_source,
        physiological_lt2_speed_kph=_phys_lt2_speed,
        physiological_lt2_power_watts=_phys_lt2_power,
        physiological_lt2_lactate_mmol=_phys_lt2_lactate,
        physiological_lt1_lactate_mmol=_phys_lt1_lactate,
    )


def dashboard_payload(db: Session) -> dict[str, Any]:
    athletes = db.scalars(select(Athlete).options(joinedload(Athlete.sessions), joinedload(Athlete.metrics))).unique().all()
    recent_tests = db.scalars(select(AthleteSession).order_by(AthleteSession.performed_at.desc()).limit(6)).all()

    alerts: list[str] = []
    improving: list[str] = []
    degrading: list[str] = []

    for athlete in athletes:
        trend_metrics = [metric for metric in athlete.metrics if metric.metric_type in {"trend_LT1", "trend_LT2"}]
        trend_value = mean([metric.value for metric in trend_metrics]) if trend_metrics else 0.0
        if trend_value > 0.02:
            improving.append(athlete.name)
        elif trend_value < -0.02:
            degrading.append(athlete.name)
            alerts.append(f"{athlete.name}: posible degradación reciente de umbrales.")

    return {
        "athletes_count": len(athletes),
        "recent_tests": recent_tests,
        "physiological_alerts": alerts,
        "improving_athletes": improving,
        "degrading_athletes": degrading,
    }


def compare_sessions(db: Session, session_a: int, session_b: int) -> dict[str, Any]:
    sessions = db.scalars(
        select(AthleteSession)
        .where(AthleteSession.id.in_([session_a, session_b]))
        .options(joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample))
    ).all()
    if len(sessions) != 2:
        raise ValueError("Need two valid sessions")
    return {str(session.id): analyze_session(session) for session in sessions}
