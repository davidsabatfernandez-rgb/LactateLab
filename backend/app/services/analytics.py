from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import timedelta
from statistics import mean
from typing import Any, Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from app.models.athlete import Athlete, AthleteFocusBlock
from app.models.metrics import DerivedMetric, PerformanceEstimate, PhysiologicalSnapshot
from app.models.session import Session as AthleteSession, SessionInterval


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


def _smooth(values: list[float]) -> list[float]:
    if len(values) < 3:
        return values[:]
    smoothed: list[float] = []
    for index in range(len(values)):
        neighborhood = values[max(0, index - 1): min(len(values), index + 2)]
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
    return None


def _primary_metric_value(interval: SessionInterval) -> tuple[Optional[float], str]:
    if interval.pace_seconds_per_km:
        return float(interval.pace_seconds_per_km), "pace_seconds_per_km"
    if interval.power_watts:
        return float(interval.power_watts), "power_watts"
    if interval.running_power_watts:
        return float(interval.running_power_watts), "running_power_watts"
    return None, "unknown"


def _session_density(session: AthleteSession) -> float:
    total_work = sum(interval.duration_seconds for interval in session.intervals)
    total_rest = sum(interval.rest_seconds or 0 for interval in session.intervals)
    total = total_work + total_rest
    if total == 0:
        return 1.0
    return total_work / total


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


def _curve_points(session: AthleteSession, metric: str) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
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
            }
        )
    reverse = metric == "pace_seconds_per_km"
    return sorted(points, key=lambda point: point["x"], reverse=reverse)


def _build_candidates(session: AthleteSession) -> list[dict[str, Any]]:
    candidates = []
    for interval in session.intervals:
        sample = interval.lactate_sample
        if not sample:
            continue
        load = _load_metric(interval)
        if load is None:
            continue
        candidates.append(
            {
                "load": load,
                "interval": interval,
                "lactate": sample.contextual_lactate or sample.lactate_mmol,
            }
        )
    candidates.sort(key=lambda item: item["load"])
    return candidates


def _method_baseline_rise(candidates: list[dict[str, Any]]) -> list[ThresholdMethodEstimate]:
    lactates = _smooth([item["lactate"] for item in candidates])
    baseline = lactates[0]
    lt1_index = 0
    for idx, value in enumerate(lactates):
        if value >= baseline + 0.35:
            lt1_index = idx
            break
    lt2_index = len(lactates) - 1
    for idx, value in enumerate(lactates):
        prev_value = lactates[idx - 1] if idx > 0 else value
        if value >= 4.0 or (idx > 1 and (value - prev_value) >= 0.7):
            lt2_index = idx
            break
    output = []
    for name, idx, explanation in [
        ("LT1", lt1_index, "Primer aumento sostenido de ~0.35 mmol sobre el basal suavizado."),
        ("LT2", lt2_index, "Punto con aceleración de lactato o aproximación operativa a 4 mmol."),
    ]:
        interval = candidates[idx]["interval"]
        sample = interval.lactate_sample
        output.append(
            ThresholdMethodEstimate(
                threshold_name=name,
                method="baseline_rise",
                lactate=sample.contextual_lactate if sample else None,
                pace_seconds_per_km=interval.pace_seconds_per_km,
                power_watts=interval.power_watts or interval.running_power_watts,
                heart_rate=interval.heart_rate_avg,
                power_source=_normalized_power_source(interval.session) if interval.session else None,
                confidence=min(0.88, 0.56 + len(candidates) * 0.05),
                explanation=explanation,
            )
        )
    return output


def _method_sustained_increase(candidates: list[dict[str, Any]]) -> list[ThresholdMethodEstimate]:
    lactates = _smooth([item["lactate"] for item in candidates])
    lt1_index = 0
    for idx in range(1, len(lactates)):
        if lactates[idx] > lactates[idx - 1] and idx + 1 < len(lactates) and lactates[idx + 1] >= lactates[idx]:
            lt1_index = idx
            break
    lt2_index = len(lactates) - 1
    for idx in range(2, len(lactates)):
        local_slope = lactates[idx] - lactates[idx - 1]
        prior_slope = lactates[idx - 1] - lactates[idx - 2]
        if local_slope >= max(0.6, prior_slope + 0.25):
            lt2_index = idx
            break
    output = []
    for name, idx, explanation in [
        ("LT1", lt1_index, "Se elige el primer ascenso mantenido entre dos pasos consecutivos."),
        ("LT2", lt2_index, "Se elige la primera rotura clara de pendiente frente al tramo anterior."),
    ]:
        interval = candidates[idx]["interval"]
        sample = interval.lactate_sample
        output.append(
            ThresholdMethodEstimate(
                threshold_name=name,
                method="sustained_increase",
                lactate=sample.contextual_lactate if sample else None,
                pace_seconds_per_km=interval.pace_seconds_per_km,
                power_watts=interval.power_watts or interval.running_power_watts,
                heart_rate=interval.heart_rate_avg,
                power_source=_normalized_power_source(interval.session) if interval.session else None,
                confidence=min(0.84, 0.52 + len(candidates) * 0.05),
                explanation=explanation,
            )
        )
    return output


def _method_dmax_proxy(candidates: list[dict[str, Any]]) -> list[ThresholdMethodEstimate]:
    if len(candidates) < 4:
        return []
    loads = [item["load"] for item in candidates]
    lactates = _smooth([item["lactate"] for item in candidates])
    load_span = max(loads) - min(loads) or 1.0
    line_values = []
    for load in loads:
        projection = lactates[0] + ((load - loads[0]) / load_span) * (lactates[-1] - lactates[0])
        line_values.append(projection)
    deviations = [value - line for value, line in zip(lactates, line_values)]
    lt2_index = max(range(len(deviations)), key=lambda idx: deviations[idx])
    lt1_index = max(0, lt2_index - 1)
    output = []
    for name, idx, explanation in [
        ("LT1", lt1_index, "Proxy simple de punto previo a la máxima curvatura observada."),
        ("LT2", lt2_index, "Proxy de Dmax: máxima desviación sobre la recta entre inicio y final."),
    ]:
        interval = candidates[idx]["interval"]
        sample = interval.lactate_sample
        output.append(
            ThresholdMethodEstimate(
                threshold_name=name,
                method="dmax_proxy",
                lactate=sample.contextual_lactate if sample else None,
                pace_seconds_per_km=interval.pace_seconds_per_km,
                power_watts=interval.power_watts or interval.running_power_watts,
                heart_rate=interval.heart_rate_avg,
                power_source=_normalized_power_source(interval.session) if interval.session else None,
                confidence=min(0.81, 0.50 + len(candidates) * 0.045),
                explanation=explanation,
            )
        )
    return output


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

    best = max(valid, key=lambda method: method.confidence)
    lactate_values = [item.lactate for item in valid if item.lactate is not None]
    pace_values = [item.pace_seconds_per_km for item in valid if item.pace_seconds_per_km is not None]
    power_values = [item.power_watts for item in valid if item.power_watts is not None]
    hr_values = [item.heart_rate for item in valid if item.heart_rate is not None]

    lactate_agreement = 0.0
    if len(lactate_values) >= 2:
        lactate_range = max(lactate_values) - min(lactate_values)
        lactate_agreement = max(0.0, 1 - lactate_range / 1.5)
    else:
        lactate_agreement = 0.55

    agreement_score = round(min(0.95, (mean(item.confidence for item in valid) * 0.6) + (lactate_agreement * 0.4)), 2)
    final_confidence = round(min(0.95, best.confidence * 0.7 + agreement_score * 0.3), 2)
    rationale = (
        f"Se compararon {len(valid)} métodos; el resultado final prioriza {best.method} "
        f"y pondera el acuerdo entre métodos ({agreement_score:.2f}). {best.explanation}"
    )

    return ThresholdResult(
        name=name,
        lactate=round(mean(lactate_values), 2) if lactate_values else best.lactate,
        pace_seconds_per_km=round(mean(pace_values), 1) if pace_values else best.pace_seconds_per_km,
        power_watts=round(mean(power_values), 1) if power_values else best.power_watts,
        heart_rate=round(mean(hr_values)) if hr_values else best.heart_rate,
        power_source=best.power_source,
        method=best.method,
        confidence=final_confidence,
        rationale=rationale,
        methods_compared=[asdict(item) for item in valid],
        agreement_score=agreement_score,
        evidence_level=_confidence_level(final_confidence),
    )


def _thresholds_from_session(session: AthleteSession) -> list[ThresholdResult]:
    candidates = _build_candidates(session)
    if len(candidates) < 3:
        return []

    method_outputs: list[ThresholdMethodEstimate] = []
    for builder in (_method_baseline_rise, _method_sustained_increase, _method_dmax_proxy):
        method_outputs.extend(builder(candidates))

    return [_aggregate_threshold("LT1", method_outputs), _aggregate_threshold("LT2", method_outputs)]


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
        "historical_evolution": {},
    }


def _estimate_zones(thresholds: list[ThresholdResult], discipline: str) -> list[dict[str, Any]]:
    lt1 = next((item for item in thresholds if item.name == "LT1"), None)
    lt2 = next((item for item in thresholds if item.name == "LT2"), None)
    zones: list[dict[str, Any]] = []
    if discipline == "running" and lt1 and lt2 and lt1.pace_seconds_per_km and lt2.pace_seconds_per_km:
        zones.extend(
            [
                {"zone": "Z1", "metric": "pace", "lower": lt1.pace_seconds_per_km * 1.15, "upper": lt1.pace_seconds_per_km, "unit": "s/km"},
                {"zone": "Z2", "metric": "pace", "lower": lt1.pace_seconds_per_km, "upper": (lt1.pace_seconds_per_km + lt2.pace_seconds_per_km) / 2, "unit": "s/km"},
                {"zone": "Z3", "metric": "pace", "lower": (lt1.pace_seconds_per_km + lt2.pace_seconds_per_km) / 2, "upper": lt2.pace_seconds_per_km, "unit": "s/km"},
            ]
        )
    if lt1 and lt2 and lt1.heart_rate and lt2.heart_rate:
        zones.extend(
            [
                {"zone": "Z1", "metric": "heart_rate", "lower": None, "upper": lt1.heart_rate, "unit": "bpm"},
                {"zone": "Z2", "metric": "heart_rate", "lower": lt1.heart_rate, "upper": lt2.heart_rate, "unit": "bpm"},
                {"zone": "Z3", "metric": "heart_rate", "lower": lt2.heart_rate, "upper": None, "unit": "bpm"},
            ]
        )
    if lt1 and lt2 and lt1.power_watts and lt2.power_watts:
        zones.extend(
            [
                {"zone": "Z1", "metric": "power", "lower": None, "upper": lt1.power_watts, "unit": "W"},
                {"zone": "Z2", "metric": "power", "lower": lt1.power_watts, "upper": lt2.power_watts, "unit": "W"},
                {"zone": "Z3", "metric": "power", "lower": lt2.power_watts, "upper": lt2.power_watts * 1.15, "unit": "W"},
            ]
        )
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
    thresholds: list[ThresholdResult],
    snapshot_date,
    history_depth: int,
    power_source: Optional[str] = None,
) -> list[dict[str, Any]]:
    lt2 = next((item for item in thresholds if item.name == "LT2"), None)
    lt1 = next((item for item in thresholds if item.name == "LT1"), None)
    estimates: list[dict[str, Any]] = []
    if not lt2:
        return estimates

    evidence_points = max(1, history_depth)
    if athlete.primary_discipline in {"running", "triatlón"} and lt2.pace_seconds_per_km:
        threshold_speed = 3600 / lt2.pace_seconds_per_km
        economy_ratio = (
            (lt1.pace_seconds_per_km - lt2.pace_seconds_per_km) / lt1.pace_seconds_per_km
            if lt1 and lt1.pace_seconds_per_km and lt2.pace_seconds_per_km
            else 0.1
        )
        vo2max = 3.5 + threshold_speed * 0.2 + 12 + economy_ratio * 6
        vlamax_running = min(
            1.1,
            max(
                0.25,
                0.28
                + max(0.0, (lt2.lactate or 3.5) - (lt1.lactate or 1.8)) * 0.12
                + max(0.03, economy_ratio) * 0.9,
            ),
        )
        spread = 0.05 if evidence_points >= 3 else 0.08
        distance_factors = {"5K": 0.95, "10K": 0.92, "HM": 0.88, "Maratón": 0.84}
        for key, factor in distance_factors.items():
            race_pace = lt2.pace_seconds_per_km / factor
            estimates.append(
                _estimate_payload(
                    estimate_type=key,
                    discipline="running",
                    power_source=power_source,
                    value=race_pace,
                    unit="s/km",
                    spread=spread,
                    confidence=lt2.confidence * (0.92 if evidence_points >= 3 else 0.8),
                    snapshot_date=snapshot_date,
                    variables_used=["lt2_pace", "lt2_lactate", "lt1_lt2_gap", "history_depth"],
                    evidence_points=evidence_points,
                    explanation="Predicción explicable a partir del ritmo en LT2, separación LT1-LT2 e histórico disponible.",
                )
            )
        estimates.append(
            _estimate_payload(
                estimate_type="VO2max",
                discipline="running",
                power_source=power_source,
                value=vo2max,
                unit="ml/kg/min",
                spread=2.5 if evidence_points >= 3 else 4.0,
                confidence=lt2.confidence * (0.9 if evidence_points >= 3 else 0.78),
                snapshot_date=snapshot_date,
                variables_used=["lt2_pace", "lt1_pace", "athlete_weight", "history_depth"],
                evidence_points=evidence_points,
                explanation="VO2max estimado desde velocidad asociada a LT2 y economía inferida.",
            )
        )
        estimates.append(
            _estimate_payload(
                estimate_type="VLAMAX",
                discipline="running",
                power_source=power_source,
                value=vlamax_running,
                unit="mmol/L/s",
                spread=0.12 if evidence_points >= 3 else 0.18,
                confidence=lt2.confidence * (0.78 if evidence_points >= 3 else 0.64),
                snapshot_date=snapshot_date,
                variables_used=["lt1_lactate", "lt2_lactate", "lt1_lt2_gap", "history_depth"],
                evidence_points=evidence_points,
                explanation="VLAMAX heurístico estimado desde el salto LT1-LT2 y la separación de cargas externas. Es una aproximación inicial, no medición directa.",
            )
        )

    if athlete.primary_discipline in {"ciclismo", "triatlón"} and lt2.power_watts:
        ftp = lt2.power_watts * 0.95
        vo2max_cycling = (lt2.power_watts / athlete.weight) * 10 + 20
        power_gap_ratio = (
            (lt2.power_watts - lt1.power_watts) / lt1.power_watts
            if lt1 and lt1.power_watts and lt2.power_watts and lt1.power_watts > 0
            else 0.18
        )
        vlamax_cycling = min(
            1.1,
            max(
                0.22,
                0.26
                + max(0.0, (lt2.lactate or 3.6) - (lt1.lactate or 1.8)) * 0.11
                + max(0.05, power_gap_ratio) * 0.85,
            ),
        )
        spread = 0.04 if evidence_points >= 3 else 0.07
        estimates.extend(
            [
                _estimate_payload(
                    estimate_type="FTP",
                    discipline="ciclismo",
                    power_source=power_source,
                    value=ftp,
                    unit="W",
                    spread=spread,
                    confidence=lt2.confidence * (0.94 if evidence_points >= 3 else 0.82),
                    snapshot_date=snapshot_date,
                    variables_used=["lt2_power", "athlete_weight", "history_depth"],
                    evidence_points=evidence_points,
                    explanation="FTP derivado de potencia asociada a LT2 con margen ampliado si hay poco histórico.",
                ),
                _estimate_payload(
                    estimate_type="VO2max",
                    discipline="ciclismo",
                    power_source=power_source,
                    value=vo2max_cycling,
                    unit="ml/kg/min",
                    spread=3.0 if evidence_points >= 3 else 5.0,
                    confidence=lt2.confidence * (0.86 if evidence_points >= 3 else 0.74),
                    snapshot_date=snapshot_date,
                    variables_used=["lt2_power", "athlete_weight", "history_depth"],
                    evidence_points=evidence_points,
                    explanation="VO2max ciclista estimado desde W/kg en LT2.",
                ),
                _estimate_payload(
                    estimate_type="VLAMAX",
                    discipline="ciclismo",
                    power_source=power_source,
                    value=vlamax_cycling,
                    unit="mmol/L/s",
                    spread=0.12 if evidence_points >= 3 else 0.18,
                    confidence=lt2.confidence * (0.76 if evidence_points >= 3 else 0.62),
                    snapshot_date=snapshot_date,
                    variables_used=["lt1_lactate", "lt2_lactate", "lt1_lt2_power_gap", "history_depth"],
                    evidence_points=evidence_points,
                    explanation="VLAMAX heurístico ciclista estimado desde salto de lactato y separación LT1-LT2 en potencia. Aproximación inicial, no medición directa.",
                ),
            ]
        )
    return estimates


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
    evolution = {"LT1": [], "LT2": [], "lactate_anchor": []}
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
    threshold_objects = [ThresholdResult(**item) for item in thresholds] if thresholds else []
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
            }
            for item in discipline_estimates[:10]
        ],
        "recent_sessions": sorted(discipline_sessions, key=lambda current: current.performed_at, reverse=True)[:5],
        "curve_history": _discipline_history(sessions, discipline, power_source),
        "historical_evolution": _historical_evolution(discipline_snapshots),
        "power_bests": _power_bests(discipline_sessions, discipline, power_source),
        "measurement_log": _measurement_log(discipline_sessions, discipline, power_source),
        "power_source_views": None,
    }
    if discipline == "ciclismo" and power_source is None:
        payload["power_source_views"] = {
            source: _discipline_view(athlete, discipline, sessions, snapshots, estimates, power_source=source)
            for source in ("outdoor", "indoor")
            if any(_normalized_power_source(session) == source for session in sessions if session.discipline == discipline)
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
    db.execute(delete(PhysiologicalSnapshot).where(PhysiologicalSnapshot.athlete_id == athlete_id))

    for session in sorted(athlete.sessions, key=lambda current: current.performed_at):
        analysis = analyze_session(session)
        thresholds = [ThresholdResult(**item) for item in analysis["thresholds"]]
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

        for estimate in _performance_estimates(
            athlete,
            thresholds,
            snapshot.snapshot_date,
            history_depth=len(athlete.sessions),
            power_source=snapshot.power_source,
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

    db.commit()
    return {"sessions_processed": len(athlete.sessions)}


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

    threshold_objects = [ThresholdResult(**item) for item in latest_thresholds] if latest_thresholds else []
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

    available_disciplines = sorted({session.discipline for session in athlete.sessions})
    discipline_views = {
        discipline: _discipline_view(athlete, discipline, athlete.sessions, snapshots, estimates)
        for discipline in available_disciplines
    }

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
        "discipline_views": discipline_views,
        "active_focus_block": active_focus_block,
        "focus_block_evaluations": focus_block_evaluations,
    }


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
