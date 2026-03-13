from __future__ import annotations

import math
from datetime import date
from statistics import mean
from typing import Any, Optional

from app.models.athlete import Athlete
from app.models.metrics import PhysiologicalSnapshot


# ── Constants: ACSM metabolic equations ─────────────────────────────────────
_VO2_REST = 3.5  # ml/kg/min

# ── Distance-specific fractional utilization tables ─────────────────────────
# Base %VO2max sustainable for each race distance (trained runners).
# Sources: Daniels & Gilbert 1979, Péronnet-Thibault 1989, Bassett & Howley 2000.
# Values represent the MIDDLE of the trained range.
_RACE_DISTANCE_KM: dict[str, float] = {
    "5K": 5.0,
    "10K": 10.0,
    "HM": 21.0975,
    "Maratón": 42.195,
}

# Base fractional utilization (%VO2max at race pace) for a "neutral" athlete
# (endurance_score ~0.5, VLamax ~0.35 mmol/L/s).
_F_BASE: dict[str, float] = {
    "5K": 0.95,
    "10K": 0.90,
    "HM": 0.85,
    "Maratón": 0.78,
}

# How much VLamax shifts fractional utilization per unit deviation from 0.35.
# Positive = high VLamax REDUCES sustained fraction (more at longer distances).
# Sources: Mader 2003, Olbrecht, INSCYD validation data.
_VLAMAX_SENSITIVITY: dict[str, float] = {
    "5K": 0.03,    # 5K: VLamax effect is small (anaerobic helps)
    "10K": 0.08,   # 10K: moderate effect
    "HM": 0.14,    # HM: significant effect
    "Maratón": 0.22,  # Marathon: dominant effect
}

# Anaerobic contribution to race pace (fraction of total energy from anaerobic).
# High VLamax athletes get a small BONUS at short distances.
# Sources: Gastin 2001, Spencer & Gastin 2001.
_ANAEROBIC_CONTRIBUTION: dict[str, float] = {
    "5K": 0.06,     # ~6% anaerobic energy at 5K
    "10K": 0.03,    # ~3%
    "HM": 0.01,     # ~1%
    "Maratón": 0.005,  # negligible
}

# Confidence penalty per distance (longer = more uncertain)
_CONFIDENCE_PENALTY: dict[str, float] = {
    "5K": 0.02,
    "10K": 0.03,
    "HM": 0.05,
    "Maratón": 0.08,
}

# Base spread per distance
_BASE_SPREAD: dict[str, float] = {
    "5K": 0.03,
    "10K": 0.035,
    "HM": 0.05,
    "Maratón": 0.065,
}

# VLamax reference point (neutral athlete)
_VLAMAX_NEUTRAL = 0.35


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _threshold_attr(threshold: Any, attr: str) -> Any:
    if threshold is None:
        return None
    if isinstance(threshold, dict):
        return threshold.get(attr)
    return getattr(threshold, attr, None)


def _find_threshold(thresholds: list[Any], name: str) -> Any:
    return next((item for item in thresholds if _threshold_attr(item, "name") == name), None)


def _pace_to_speed_kph(pace_seconds_per_km: Optional[float]) -> Optional[float]:
    if pace_seconds_per_km is None or pace_seconds_per_km <= 0:
        return None
    return 3600 / pace_seconds_per_km


def _speed_kph_to_pace(speed_kph: Optional[float]) -> Optional[float]:
    if speed_kph is None or speed_kph <= 0:
        return None
    return 3600 / speed_kph


def _historical_stability(values: list[float]) -> float:
    cleaned = [value for value in values if value is not None and value > 0]
    if len(cleaned) < 2:
        return 0.46
    relative_changes = [abs(cleaned[index] - cleaned[index - 1]) / cleaned[index - 1] for index in range(1, len(cleaned)) if cleaned[index - 1] > 0]
    if not relative_changes:
        return 0.5
    mean_change = sum(relative_changes) / len(relative_changes)
    return round(_clamp(1 - mean_change / 0.08, 0.35, 0.92), 2)


def _agreement_score(values: list[float], reference_value: float) -> float:
    if len(values) < 2 or reference_value <= 0:
        return 0.64
    normalized_gap = (max(values) - min(values)) / reference_value
    return round(_clamp(1 - normalized_gap / 0.08, 0.35, 0.95), 2)


def _confidence_label(confidence: float, evidence_points: int) -> str:
    if evidence_points < 2 or confidence < 0.6:
        return "low"
    if confidence < 0.78:
        return "medium"
    return "high"


# ── Running economy: ACSM metabolic equation ───────────────────────────────
def _running_economy_ml_per_km(speed_kph: float) -> float:
    """VO2 cost in ml/kg per km at given speed.

    Uses ACSM running equation: VO2 = 0.2 × speed(m/min) + 0.9 × speed(m/min) × grade + 3.5
    For flat running (grade=0): VO2 = 0.2 × speed(m/min) + 3.5
    Cost per km = VO2(ml/kg/min) / speed(km/min) = VO2 / (speed_kph / 60)

    In practice, running economy varies ~5-10% between athletes (Conley & Krahenbuhl 1980).
    We derive it implicitly from LT2 pace + fractional utilization when possible.
    """
    speed_m_per_min = speed_kph * 1000 / 60
    vo2 = 0.2 * speed_m_per_min + _VO2_REST  # ml/kg/min at this speed
    cost_per_km = vo2 / (speed_kph / 60)  # ml/kg per km
    return cost_per_km


def _vo2_at_speed(speed_kph: float) -> float:
    """VO2 (ml/kg/min) at given running speed using ACSM flat equation."""
    speed_m_per_min = speed_kph * 1000 / 60
    return 0.2 * speed_m_per_min + _VO2_REST


def _speed_at_vo2(vo2: float) -> float:
    """Inverse of ACSM: speed (km/h) that requires given VO2."""
    speed_m_per_min = (vo2 - _VO2_REST) / 0.2
    return speed_m_per_min * 60 / 1000


# ── VLamax estimation from lactate curve ────────────────────────────────────
def _estimate_vlamax_from_thresholds(
    lt1_speed_kph: Optional[float],
    lt2_speed_kph: Optional[float],
    lt1_lactate: Optional[float],
    lt2_lactate: Optional[float],
    vo2max: Optional[float],
) -> tuple[float, float, str]:
    """Estimate VLamax from threshold data using Mader-compatible logic.

    The LT1/LT2 speed ratio reflects the balance between aerobic and glycolytic
    capacity (Olbrecht, Mader 2003). A high ratio (>0.87) means low VLamax;
    a low ratio (<0.79) means high VLamax.

    When VO2max is available, we can refine this: at LT2, lactate production
    equals elimination. The gap between VO2 at LT2 and VO2max constrains VLamax.

    Returns: (vlamax_estimate, confidence, method)
    """
    method_parts = []
    estimates = []
    weights = []

    # Method 1: LT1/LT2 speed ratio (Olbrecht proxy)
    if lt1_speed_kph and lt2_speed_kph and lt2_speed_kph > 0:
        ratio = lt1_speed_kph / lt2_speed_kph
        # Olbrecht mapping: ratio 0.94 → VLamax ~0.20, ratio 0.75 → VLamax ~0.65
        # Linear mapping inverted: VLamax = 0.95 - ratio * 0.80
        vlamax_ratio = _clamp(0.95 - ratio * 0.80, 0.15, 0.75)
        estimates.append(vlamax_ratio)
        weights.append(0.45)
        method_parts.append("lt1_lt2_ratio")

    # Method 2: Lactate values at thresholds (steepness of curve)
    if lt1_lactate and lt2_lactate and lt1_speed_kph and lt2_speed_kph:
        lactate_rise = lt2_lactate - lt1_lactate  # mmol/L
        speed_gap = lt2_speed_kph - lt1_speed_kph  # km/h
        if speed_gap > 0.5:
            # Steepness: mmol/L per km/h increase between LT1 and LT2
            steepness = lactate_rise / speed_gap
            # Typical: 0.3-0.5 = low VLamax, 0.8-1.5 = high VLamax
            vlamax_steep = _clamp(0.15 + steepness * 0.30, 0.15, 0.75)
            estimates.append(vlamax_steep)
            weights.append(0.30)
            method_parts.append("lactate_steepness")

    # Method 3: VO2max headroom above LT2 (Mader framework)
    if vo2max and lt2_speed_kph and vo2max > 25:
        vo2_at_lt2 = _vo2_at_speed(lt2_speed_kph)
        fractional = vo2_at_lt2 / vo2max
        # High fractional (>0.88) → low VLamax, Low fractional (<0.78) → high VLamax
        # Mader: at MLSS, higher VLamax means lactate steady-state occurs at lower
        # %VO2max because glycolytic contribution kicks in earlier.
        vlamax_frac = _clamp(1.05 - fractional * 1.0, 0.15, 0.75)
        estimates.append(vlamax_frac)
        weights.append(0.25)
        method_parts.append("vo2max_headroom")

    if not estimates:
        return 0.35, 0.25, "default_neutral"

    # Weighted average
    total_w = sum(weights)
    vlamax = sum(e * w for e, w in zip(estimates, weights)) / total_w
    vlamax = round(_clamp(vlamax, 0.15, 0.75), 3)

    # Confidence: more methods = more confidence
    conf = _clamp(0.35 + len(estimates) * 0.15, 0.35, 0.75)
    method = "mader_composite_" + "+".join(method_parts)

    return vlamax, conf, method


# ── Race pace prediction: di Prampero framework ────────────────────────────
def _predict_race_pace(
    vo2max: float,
    vlamax: float,
    lt2_speed_kph: float,
    estimate_type: str,
) -> Optional[float]:
    """Predict race pace using di Prampero framework.

    Core equation: v_race = F(d, VLamax) × VO2max / C

    Where:
    - F = fractional utilization at race distance, modulated by VLamax
    - C = running economy (VO2 cost per unit speed)
    - VO2max = maximal aerobic capacity

    Running economy (C) is derived implicitly from LT2 data:
    we know the athlete runs at lt2_speed at ~F_LT2 × VO2max,
    so C = (F_LT2 × VO2max) / lt2_speed.

    References:
    - di Prampero 1986: v = F × VO2max / C
    - Péronnet-Thibault 1989: endurance index for F decay
    - Mader 2003: VLamax modulation of sustainable %VO2max
    """
    if vo2max < 20 or lt2_speed_kph < 4:
        return None

    # Step 1: Derive running economy from LT2 data
    # At LT2, athlete sustains ~F_LT2 of VO2max
    vo2_at_lt2 = _vo2_at_speed(lt2_speed_kph)
    f_at_lt2 = _clamp(vo2_at_lt2 / vo2max, 0.70, 0.98)

    # Running economy: VO2 cost per km/h
    # C = vo2_at_lt2 / lt2_speed_kph (ml/kg/min per km/h)
    economy = vo2_at_lt2 / lt2_speed_kph

    # Step 2: Calculate distance-specific fractional utilization
    f_base = _F_BASE[estimate_type]

    # VLamax modulation: deviation from neutral shifts sustainable %VO2max
    vlamax_delta = vlamax - _VLAMAX_NEUTRAL
    sensitivity = _VLAMAX_SENSITIVITY[estimate_type]
    # High VLamax → lower F (can't sustain as high %VO2max for long)
    # Low VLamax → higher F (diesel athlete sustains more)
    f_adjusted = f_base - vlamax_delta * sensitivity

    # Anaerobic bonus for short distances: high VLamax helps at 5K/10K
    anaerobic_bonus = _ANAEROBIC_CONTRIBUTION[estimate_type] * (vlamax_delta / _VLAMAX_NEUTRAL)
    f_adjusted += anaerobic_bonus

    f_race = _clamp(f_adjusted, 0.65, 0.99)

    # Step 3: Predict race speed using di Prampero
    # v_race = F_race × VO2max / economy
    race_speed_kph = f_race * vo2max / economy

    # Sanity check: race speed should be reasonable relative to LT2
    # 5K can be ~105-110% of LT2 speed, marathon ~85-92%
    ratio_to_lt2 = race_speed_kph / lt2_speed_kph
    if ratio_to_lt2 > 1.20 or ratio_to_lt2 < 0.70:
        # Implausible, clamp to reasonable bounds
        max_ratio = {"5K": 1.12, "10K": 1.05, "HM": 0.98, "Maratón": 0.93}
        min_ratio = {"5K": 0.98, "10K": 0.92, "HM": 0.85, "Maratón": 0.78}
        race_speed_kph = lt2_speed_kph * _clamp(
            ratio_to_lt2,
            min_ratio[estimate_type],
            max_ratio[estimate_type],
        )

    pace = _speed_kph_to_pace(race_speed_kph)
    return pace


def _estimate_payload(
    estimate_type: str,
    discipline: str,
    power_source: Optional[str],
    value: float,
    unit: str,
    confidence: float,
    snapshot_date: date,
    variables_used: list[str],
    evidence_points: int,
    explanation: str,
    *,
    spread: Optional[float] = None,
    lower_bound: Optional[float] = None,
    upper_bound: Optional[float] = None,
    method_used: Optional[str] = None,
    primary_anchor: Optional[str] = None,
    agreement_score: Optional[float] = None,
    range_summary: Optional[str] = None,
    calculation_steps: Optional[list[str]] = None,
    cautions: Optional[list[str]] = None,
    anchors: Optional[list[dict[str, Any]]] = None,
    confidence_factors: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    if lower_bound is None or upper_bound is None:
        if unit == "ml/kg/min":
            margin = spread or 3.0
            lower_bound = round(value - margin, 1)
            upper_bound = round(value + margin, 1)
        else:
            applied_spread = spread or 0.05
            lower_bound = round(value * (1 - applied_spread), 1)
            upper_bound = round(value * (1 + applied_spread), 1)

    confidence = round(_clamp(confidence, 0.2, 0.95), 2)
    reliability = _confidence_label(confidence, evidence_points)
    payload = {
        "estimate_type": estimate_type,
        "discipline": discipline,
        "power_source": power_source,
        "value": round(value, 1),
        "unit": unit,
        "lower_bound": round(lower_bound, 1) if lower_bound is not None else None,
        "upper_bound": round(upper_bound, 1) if upper_bound is not None else None,
        "confidence": confidence,
        "reliability_label": reliability,
        "valid_on": snapshot_date,
        "inputs_summary": explanation,
        "variables_used": variables_used,
        "evidence_points": evidence_points,
        "low_evidence": reliability == "low",
        "valid_on_iso": snapshot_date.isoformat(),
        "method_used": method_used,
        "primary_anchor": primary_anchor,
        "agreement_score": agreement_score,
        "range_summary": range_summary,
        "calculation_steps": calculation_steps or [],
        "cautions": cautions or [],
        "anchors": anchors or [],
        "confidence_factors": confidence_factors or [],
    }
    return payload


def _running_prediction_inputs(
    thresholds: list[Any],
    dynamic_thresholds: Optional[dict[str, Any]],
    snapshots: list[PhysiologicalSnapshot],
    discipline: str,
    power_source: Optional[str],
    history_depth: int,
    swain_vo2max: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    lt1 = _find_threshold(thresholds, "LT1")
    lt2 = _find_threshold(thresholds, "LT2")
    lt2_pace = _threshold_attr(lt2, "pace_seconds_per_km")
    if lt2_pace is None:
        return None

    anchors: list[dict[str, Any]] = []
    weighted_sources: list[tuple[float, float, str]] = []

    lt2_confidence = float(_threshold_attr(lt2, "confidence") or 0.55)
    anchors.append(
        {
            "label": "LT2 fisiologico",
            "value": round(float(lt2_pace), 1),
            "unit": "s/km",
            "confidence": round(lt2_confidence, 2),
        }
    )
    weighted_sources.append((float(lt2_pace), max(0.25, lt2_confidence), "lt2_fisiologico"))

    chronic = (dynamic_thresholds or {}).get("chronic") or {}
    practical_lt2 = chronic.get("practical_lt2") or {}
    practical_pace = practical_lt2.get("estimated_pace_seconds_per_km")
    practical_confidence = float(practical_lt2.get("confidence_score") or practical_lt2.get("reliability_score") or 0.0)
    if practical_pace is not None:
        anchors.append(
            {
                "label": "LT2 practico cronico",
                "value": round(float(practical_pace), 1),
                "unit": "s/km",
                "confidence": round(practical_confidence, 2),
            }
        )
        weighted_sources.append((float(practical_pace), max(0.2, practical_confidence), "lt2_practico_cronico"))

    total_weight = sum(weight for _, weight, _ in weighted_sources)
    reference_pace = sum(value * weight for value, weight, _ in weighted_sources) / max(total_weight, 1e-6)
    reference_speed_kph = _pace_to_speed_kph(reference_pace)
    if reference_speed_kph is None:
        return None

    agreement = _agreement_score([value for value, _, _ in weighted_sources], reference_pace)
    lt2_history = [
        snapshot.lt2_pace_seconds_per_km
        for snapshot in snapshots
        if snapshot.discipline == discipline
        and (power_source is None or snapshot.power_source == power_source)
        and snapshot.lt2_pace_seconds_per_km is not None
    ]
    lt2_history.append(float(lt2_pace))
    stability = _historical_stability([value for value in lt2_history if value is not None])
    history_score = round(_clamp(0.28 + min(history_depth, 6) * 0.1, 0.28, 0.88), 2)

    cautions: list[str] = []
    lt1_pace = _threshold_attr(lt1, "pace_seconds_per_km")
    lt1_speed_kph: Optional[float] = None
    lt2_speed_kph = _pace_to_speed_kph(float(lt2_pace))

    if lt1_pace is not None:
        lt1_speed_kph = _pace_to_speed_kph(float(lt1_pace))
        ratio = (lt1_speed_kph / lt2_speed_kph) if lt1_speed_kph and lt2_speed_kph else 0.88
        endurance_score = round(_clamp((ratio - 0.82) / 0.12, 0.0, 1.0), 2)
    else:
        endurance_score = 0.52
        cautions.append("Sin LT1 comparable en la sesion actual, el perfil de resistencia se ha estimado con mayor prudencia.")

    if history_depth < 3:
        cautions.append("Historico corto para afinar predicciones de media y larga distancia.")
    if agreement < 0.55:
        cautions.append("Las anclas LT2 fisiologica y LT2 practica cronica no coinciden del todo; el rango se amplia.")

    base_confidence = round(
        _clamp(
            mean([item["confidence"] for item in anchors]) * 0.48
            + stability * 0.2
            + agreement * 0.17
            + history_score * 0.15,
            0.38,
            0.92,
        ),
        2,
    )

    # ── VO2max: prefer Swain (HR-based, non-circular) over LT2-derived ──
    vo2max: Optional[float] = None
    vo2max_source = "none"
    vo2max_confidence = 0.0
    fractional_utilization: Optional[float] = None

    if swain_vo2max and swain_vo2max.get("vo2max"):
        vo2max = float(swain_vo2max["vo2max"])
        vo2max_source = "swain_hr"
        vo2max_confidence = float(swain_vo2max.get("confidence", 0.6))
        fractional_utilization = float(swain_vo2max.get("fractional_utilization", 0.0)) or None
        anchors.append({
            "label": "VO2max (Swain HR)",
            "value": round(vo2max, 1),
            "unit": "ml/kg/min",
            "confidence": round(vo2max_confidence, 2),
        })
    else:
        # Fallback: derive from LT2 pace (circular but better than nothing)
        if reference_speed_kph and reference_speed_kph > 0:
            threshold_fraction = 0.86 + endurance_score * 0.04
            speed_m_per_min = reference_speed_kph * 1000 / 60
            vvo2_speed = speed_m_per_min / threshold_fraction
            vo2max = 0.2 * vvo2_speed + _VO2_REST
            vo2max_source = "lt2_derived"
            vo2max_confidence = 0.45  # lower confidence for circular estimate
            fractional_utilization = threshold_fraction

    # ── VLamax estimation ───────────────────────────────────────────────
    lt1_lactate = float(_threshold_attr(lt1, "lactate") or 0) if lt1 else None
    lt2_lactate = float(_threshold_attr(lt2, "lactate") or 0) if lt2 else None
    if lt1_lactate and lt1_lactate <= 0:
        lt1_lactate = None
    if lt2_lactate and lt2_lactate <= 0:
        lt2_lactate = None

    vlamax, vlamax_conf, vlamax_method = _estimate_vlamax_from_thresholds(
        lt1_speed_kph=lt1_speed_kph,
        lt2_speed_kph=lt2_speed_kph,
        lt1_lactate=lt1_lactate,
        lt2_lactate=lt2_lactate,
        vo2max=vo2max,
    )

    calculation_steps = [
        "Se toma LT2 fisiologico como ancla principal de rendimiento.",
    ]
    if practical_pace is not None:
        calculation_steps.append("Se mezcla con LT2 practico cronico para no depender solo del ultimo test.")
    if vo2max_source == "swain_hr":
        calculation_steps.append(
            f"VO2max estimado via Swain (HR): {round(vo2max, 1)} ml/kg/min "
            f"(LT2 al {round(fractional_utilization * 100)}% del techo)."
            if fractional_utilization else
            f"VO2max estimado via Swain (HR): {round(vo2max, 1)} ml/kg/min."
        )
    else:
        calculation_steps.append("VO2max derivado del ritmo LT2 (proxy, sin datos de FC disponibles).")
    calculation_steps.append(
        f"VLamax estimada: {round(vlamax, 2)} mmol/L/s ({vlamax_method.split('_', 2)[-1]}) "
        f"— modula el rendimiento sostenible por distancia."
    )
    calculation_steps.append(
        "Prediccion por modelo di Prampero: v_race = F(distancia, VLamax) x VO2max / C(economia)."
    )

    confidence_factors = [
        {
            "label": "acuerdo_anclas",
            "score": agreement,
            "weight": 0.17,
            "explanation": "Si LT2 fisiologico y LT2 practico cronico se parecen, la prediccion es mas estable.",
        },
        {
            "label": "estabilidad_historica",
            "score": stability,
            "weight": 0.2,
            "explanation": "Las referencias longitudinales estables reducen dispersion.",
        },
        {
            "label": "profundidad_historica",
            "score": history_score,
            "weight": 0.15,
            "explanation": "Mas cortes comparables elevan confianza.",
        },
    ]
    if vo2max_source == "swain_hr":
        confidence_factors.append({
            "label": "vo2max_swain",
            "score": vo2max_confidence,
            "weight": 0.10,
            "explanation": "VO2max calculado desde FC (Swain) refuerza la prediccion con una senal independiente del lactato.",
        })

    return {
        "reference_pace": round(reference_pace, 1),
        "reference_speed_kph": round(reference_speed_kph, 3),
        "agreement_score": agreement,
        "stability_score": stability,
        "history_score": history_score,
        "endurance_score": endurance_score,
        "base_confidence": base_confidence,
        "anchors": anchors,
        "cautions": cautions,
        "calculation_steps": calculation_steps,
        "confidence_factors": confidence_factors,
        "lt1_missing": lt1_pace is None,
        # New physiological inputs
        "vo2max": vo2max,
        "vo2max_source": vo2max_source,
        "vo2max_confidence": vo2max_confidence,
        "fractional_utilization": fractional_utilization,
        "vlamax": vlamax,
        "vlamax_confidence": vlamax_conf,
        "vlamax_method": vlamax_method,
        "lt1_speed_kph": lt1_speed_kph,
        "lt2_speed_kph": lt2_speed_kph,
        "lt1_lactate": lt1_lactate,
        "lt2_lactate": lt2_lactate,
    }


def _cycling_prediction_inputs(
    thresholds: list[Any],
    dynamic_thresholds: Optional[dict[str, Any]],
    snapshots: list[PhysiologicalSnapshot],
    discipline: str,
    power_source: Optional[str],
    history_depth: int,
) -> Optional[dict[str, Any]]:
    lt1 = _find_threshold(thresholds, "LT1")
    lt2 = _find_threshold(thresholds, "LT2")
    lt2_power = _threshold_attr(lt2, "power_watts")
    if lt2_power is None:
        return None

    anchors: list[dict[str, Any]] = []
    weighted_sources: list[tuple[float, float, str]] = []

    lt2_confidence = float(_threshold_attr(lt2, "confidence") or 0.55)
    anchors.append(
        {
            "label": "LT2 fisiologico",
            "value": round(float(lt2_power), 1),
            "unit": "W",
            "confidence": round(lt2_confidence, 2),
        }
    )
    weighted_sources.append((float(lt2_power), max(0.25, lt2_confidence), "lt2_fisiologico"))

    chronic = (dynamic_thresholds or {}).get("chronic") or {}
    practical_lt2 = chronic.get("practical_lt2") or {}
    practical_power = practical_lt2.get("estimated_power_watts")
    practical_confidence = float(practical_lt2.get("confidence_score") or practical_lt2.get("reliability_score") or 0.0)
    if practical_power is not None:
        anchors.append(
            {
                "label": "LT2 practico cronico",
                "value": round(float(practical_power), 1),
                "unit": "W",
                "confidence": round(practical_confidence, 2),
            }
        )
        weighted_sources.append((float(practical_power), max(0.2, practical_confidence), "lt2_practico_cronico"))

    total_weight = sum(weight for _, weight, _ in weighted_sources)
    reference_power = sum(value * weight for value, weight, _ in weighted_sources) / max(total_weight, 1e-6)
    agreement = _agreement_score([value for value, _, _ in weighted_sources], reference_power)
    lt2_history = [
        snapshot.lt2_power_watts
        for snapshot in snapshots
        if snapshot.discipline == discipline
        and (power_source is None or snapshot.power_source == power_source)
        and snapshot.lt2_power_watts is not None
    ]
    lt2_history.append(float(lt2_power))
    stability = _historical_stability([value for value in lt2_history if value is not None])
    history_score = round(_clamp(0.28 + min(history_depth, 6) * 0.1, 0.28, 0.88), 2)

    cautions: list[str] = []
    lt1_power = _threshold_attr(lt1, "power_watts")
    if lt1_power is not None and lt2_power:
        ratio = float(lt1_power) / float(lt2_power) if float(lt2_power) > 0 else 0.8
        endurance_score = round(_clamp((ratio - 0.72) / 0.18, 0.0, 1.0), 2)
    else:
        endurance_score = 0.55
        cautions.append("Sin LT1 ciclista comparable, el ajuste de durabilidad se conserva en una zona neutra.")

    if history_depth < 3:
        cautions.append("Historico corto para estabilizar FTP y VO2max estimados.")
    if agreement < 0.55:
        cautions.append("La referencia fisiologica y la practica cronica difieren mas de lo deseable; se amplian margenes.")

    base_confidence = round(
        _clamp(
            mean([item["confidence"] for item in anchors]) * 0.5
            + stability * 0.2
            + agreement * 0.16
            + history_score * 0.14,
            0.4,
            0.92,
        ),
        2,
    )

    calculation_steps = [
        "Se usa LT2 ciclista como ancla principal de carga sostenible.",
    ]
    if practical_power is not None:
        calculation_steps.append("Se mezcla con LT2 practico cronico para reducir dependencia del ultimo test.")
    calculation_steps.append("Se ajusta el factor FTP segun cercania LT1-LT2 y robustez del historico.")

    confidence_factors = [
        {
            "label": "acuerdo_anclas",
            "score": agreement,
            "weight": 0.16,
            "explanation": "Cuanto mas convergen LT2 fisiologico y LT2 practico, menor dispersion del resultado.",
        },
        {
            "label": "estabilidad_historica",
            "score": stability,
            "weight": 0.2,
            "explanation": "Menos variacion entre cortes comparables aumenta confianza.",
        },
        {
            "label": "profundidad_historica",
            "score": history_score,
            "weight": 0.14,
            "explanation": "Mas referencias ciclistas comparables hacen mas defendible la estimacion.",
        },
    ]

    return {
        "reference_power": round(reference_power, 1),
        "agreement_score": agreement,
        "stability_score": stability,
        "history_score": history_score,
        "endurance_score": endurance_score,
        "base_confidence": base_confidence,
        "anchors": anchors,
        "cautions": cautions,
        "calculation_steps": calculation_steps,
        "confidence_factors": confidence_factors,
    }


def _running_estimates(
    athlete: Athlete,
    snapshot_date: date,
    power_source: Optional[str],
    history_depth: int,
    inputs: dict[str, Any],
) -> list[dict[str, Any]]:
    reference_speed = inputs["reference_speed_kph"]
    endurance_score = inputs["endurance_score"]
    vo2max = inputs.get("vo2max")
    vlamax = inputs.get("vlamax", 0.35)
    lt2_speed = inputs.get("lt2_speed_kph", reference_speed)
    vo2max_source = inputs.get("vo2max_source", "none")

    estimates: list[dict[str, Any]] = []
    base_variables = [
        "lt2_pace",
        "practical_lt2_chronic_pace",
        "lt1_lt2_gap",
        "historical_stability",
        "history_depth",
    ]
    if vo2max_source == "swain_hr":
        base_variables.extend(["vo2max_swain", "fractional_utilization"])
    base_variables.append("vlamax_estimated")

    # ── Race predictions using di Prampero framework ────────────────────
    for estimate_type in _RACE_DISTANCE_KM:
        pace: Optional[float] = None

        if vo2max and vo2max > 20:
            # Full physiological model: di Prampero + VLamax modulation
            pace = _predict_race_pace(
                vo2max=vo2max,
                vlamax=vlamax,
                lt2_speed_kph=lt2_speed,
                estimate_type=estimate_type,
            )

        if pace is None:
            # Fallback: use reference speed with simple distance-based decay
            # (Riegel-like, but with endurance_score adjustment)
            fallback_factors = {
                "5K": 1.03 + (1 - endurance_score) * 0.015,
                "10K": 1.0 + endurance_score * 0.002,
                "HM": 0.94 + endurance_score * 0.035,
                "Maratón": 0.89 + endurance_score * 0.05,
            }
            pace = _speed_kph_to_pace(reference_speed * fallback_factors[estimate_type])

        if pace is None:
            continue

        # Spread calculation
        base_spread = _BASE_SPREAD[estimate_type]
        spread = base_spread + (1 - inputs["agreement_score"]) * 0.045 + (1 - inputs["stability_score"]) * 0.035
        if history_depth < 3:
            spread += 0.015
        if estimate_type in {"HM", "Maratón"} and inputs["lt1_missing"]:
            spread += 0.02 if estimate_type == "HM" else 0.03
        # VO2max source affects spread: Swain narrows it, LT2-derived widens it
        if vo2max_source == "swain_hr":
            spread -= 0.008  # tighter bounds with independent VO2max
        elif vo2max_source == "lt2_derived":
            spread += 0.005  # slightly wider for circular estimate
        spread = round(_clamp(spread, 0.025, 0.12), 3)

        confidence = inputs["base_confidence"] - _CONFIDENCE_PENALTY[estimate_type]
        if estimate_type == "Maratón" and inputs["lt1_missing"]:
            confidence -= 0.04
        # Bonus for Swain VO2max (independent signal improves confidence)
        if vo2max_source == "swain_hr":
            confidence += 0.03
        confidence = round(_clamp(confidence, 0.35, 0.91), 2)

        range_summary = (
            f"Rango basado en acuerdo entre anclas ({round(inputs['agreement_score'] * 100)}%), "
            f"estabilidad historica ({round(inputs['stability_score'] * 100)}%), "
            f"profundidad ({history_depth} cortes)"
        )
        if vo2max_source == "swain_hr":
            range_summary += f" y VO2max Swain ({round(vo2max, 1)} ml/kg/min)."
        else:
            range_summary += "."

        method_used = "di_prampero_vlamax_v1" if vo2max and vo2max > 20 else "riegel_endurance_fallback"
        explanation = (
            f"Prediccion fisiologica: VO2max={round(vo2max, 1) if vo2max else '?'} ml/kg/min, "
            f"VLamax={round(vlamax, 2)} mmol/L/s, "
            f"utilizacion fraccional ajustada por distancia y perfil metabolico (di Prampero 1986, Mader 2003)."
        )

        cautions = list(inputs["cautions"])
        if estimate_type == "Maratón" and history_depth < 4:
            cautions.append("Maraton necesita mas respaldo longitudinal que 5K o 10K; conviene confirmarla con trabajo especifico.")
        if vo2max_source == "lt2_derived":
            cautions.append("VO2max derivado de LT2 (circular); la prediccion mejorara con datos de FC.")

        estimates.append(
            _estimate_payload(
                estimate_type=estimate_type,
                discipline="running",
                power_source=power_source,
                value=pace,
                unit="s/km",
                confidence=confidence,
                snapshot_date=snapshot_date,
                variables_used=base_variables,
                evidence_points=history_depth,
                explanation=explanation,
                spread=spread,
                method_used=method_used,
                primary_anchor="vo2max_vlamax_lt2" if vo2max else "lt2_blended_reference",
                agreement_score=inputs["agreement_score"],
                range_summary=range_summary,
                calculation_steps=list(inputs["calculation_steps"]),
                cautions=cautions,
                anchors=list(inputs["anchors"]),
                confidence_factors=list(inputs["confidence_factors"]),
            )
        )

    # ── VO2max estimate ─────────────────────────────────────────────────
    if vo2max and vo2max > 20:
        vo2_margin = 2.0 + (1 - inputs["agreement_score"]) * 2.4 + (1 - inputs["stability_score"]) * 1.8 + (0.88 - inputs["history_score"]) * 1.2
        if vo2max_source == "swain_hr":
            vo2_margin *= 0.75  # tighter bounds with HR-based estimate
        vo2_margin = _clamp(vo2_margin, 1.5, 5.5)
        vo2_conf = inputs["base_confidence"] - (0.02 if vo2max_source == "swain_hr" else 0.06)

        vo2_steps = list(inputs["calculation_steps"][:2])  # keep LT2 anchor steps
        if vo2max_source == "swain_hr":
            vo2_steps.append(
                f"VO2max calculado via Swain (HR at LT2): %HRR ≈ %VO2R → {round(vo2max, 1)} ml/kg/min. "
                "Metodo no circular (Swain 1997, ACSM)."
            )
        else:
            vo2_steps.extend([
                "Se estima que LT2 ocurre en torno al 86-90% de la vVO2 segun el perfil de resistencia del atleta.",
                "Se aplica la ecuacion energetica de carrera en m/min para obtener VO2max estimado.",
            ])

        estimates.append(
            _estimate_payload(
                estimate_type="VO2max",
                discipline="running",
                power_source=power_source,
                value=vo2max,
                unit="ml/kg/min",
                confidence=_clamp(vo2_conf, 0.4, 0.92),
                snapshot_date=snapshot_date,
                variables_used=["lt2_pace", "lt1_pace", "heart_rate_lt2", "hr_max", "historical_stability"],
                evidence_points=history_depth,
                explanation=(
                    f"VO2max via Swain (HR): {round(vo2max, 1)} ml/kg/min. Metodo independiente del lactato."
                    if vo2max_source == "swain_hr" else
                    "VO2max estimado desde velocidad asociada a LT2, fraccion de vVO2 inferida por el perfil LT1-LT2."
                ),
                lower_bound=vo2max - vo2_margin,
                upper_bound=vo2max + vo2_margin,
                method_used=f"swain_acsm_hr" if vo2max_source == "swain_hr" else "lt2_to_vvo2_proxy_v2",
                primary_anchor="hr_at_lt2" if vo2max_source == "swain_hr" else "lt2_blended_reference",
                agreement_score=inputs["agreement_score"],
                range_summary=(
                    "VO2max Swain con margenes ajustados por calidad de datos HR."
                    if vo2max_source == "swain_hr" else
                    "El margen combina error fisiologico del proxy LT2->vVO2 con acuerdo entre anclas y estabilidad del historico."
                ),
                calculation_steps=vo2_steps,
                cautions=list(inputs["cautions"]) + (
                    ["VO2max derivado de LT2 (circular); considerar datos de FC para mayor precision."]
                    if vo2max_source == "lt2_derived" else []
                ),
                anchors=list(inputs["anchors"]),
                confidence_factors=list(inputs["confidence_factors"]),
            )
        )

    # ── VLamax estimate ─────────────────────────────────────────────────
    vlamax_val = inputs.get("vlamax", 0.35)
    vlamax_conf = inputs.get("vlamax_confidence", 0.3)
    vlamax_method = inputs.get("vlamax_method", "default_neutral")

    vlamax_steps = [
        "Se estima VLamax desde multiples senales fisiologicas (Mader 2003, Olbrecht):",
    ]
    if "lt1_lt2_ratio" in vlamax_method:
        vlamax_steps.append("  - Ratio LT1/LT2: atletas con LT1 cercano a LT2 tienen VLamax baja (diesel).")
    if "lactate_steepness" in vlamax_method:
        vlamax_steps.append("  - Pendiente de lactato entre LT1 y LT2: subida rapida indica VLamax alta.")
    if "vo2max_headroom" in vlamax_method:
        vlamax_steps.append("  - Headroom VO2max: LT2 cercano al techo → VLamax baja.")

    estimates.append(
        _estimate_payload(
            estimate_type="VLAMAX",
            discipline="running",
            power_source=power_source,
            value=vlamax_val,
            unit="mmol/L/s",
            confidence=_clamp(vlamax_conf, 0.25, 0.78),
            snapshot_date=snapshot_date,
            variables_used=["lt1_lactate", "lt2_lactate", "lt1_lt2_gap", "vo2max", "history_depth"],
            evidence_points=history_depth,
            explanation=(
                f"VLamax estimada: {round(vlamax_val, 2)} mmol/L/s — "
                f"{'diesel (baja produccion glucolitica)' if vlamax_val < 0.30 else 'sprinter (alta produccion glucolitica)' if vlamax_val > 0.45 else 'perfil equilibrado'}. "
                "Modula rendimiento sostenible: baja VLamax favorece larga distancia, alta VLamax favorece 5K-10K."
            ),
            spread=0.10 if len(vlamax_method.split("+")) >= 2 else 0.16,
            method_used=vlamax_method,
            primary_anchor="lt1_lt2_ratio+vo2max",
            agreement_score=inputs["agreement_score"],
            range_summary="VLamax compuesta desde ratio LT1/LT2, pendiente de lactato y headroom VO2max (Mader/Olbrecht).",
            calculation_steps=vlamax_steps,
            cautions=list(inputs["cautions"]) + ["VLamax sigue siendo una aproximacion indirecta; un test especifico la confirmaria."],
            anchors=list(inputs["anchors"]),
            confidence_factors=list(inputs["confidence_factors"]),
        )
    )

    return estimates


def _cycling_estimates(
    athlete: Athlete,
    snapshot_date: date,
    power_source: Optional[str],
    history_depth: int,
    inputs: dict[str, Any],
) -> list[dict[str, Any]]:
    reference_power = inputs["reference_power"]
    endurance_score = inputs["endurance_score"]
    estimates: list[dict[str, Any]] = []

    ftp_factor = 0.92 + endurance_score * 0.04
    ftp = reference_power * ftp_factor
    ftp_spread = 0.028 + (1 - inputs["agreement_score"]) * 0.04 + (1 - inputs["stability_score"]) * 0.03
    if history_depth < 3:
        ftp_spread += 0.015
    ftp_spread = round(_clamp(ftp_spread, 0.025, 0.09), 3)
    estimates.append(
        _estimate_payload(
            estimate_type="FTP",
            discipline="ciclismo",
            power_source=power_source,
            value=ftp,
            unit="W",
            confidence=_clamp(inputs["base_confidence"] - 0.02, 0.42, 0.92),
            snapshot_date=snapshot_date,
            variables_used=["lt2_power", "practical_lt2_chronic_power", "lt1_lt2_gap", "history_depth"],
            evidence_points=history_depth,
            explanation="FTP derivado de LT2 fisiologico y LT2 practico cronico con ajuste conservador por durabilidad LT1-LT2.",
            spread=ftp_spread,
            method_used="blended_lt2_ftp_proxy_v2",
            primary_anchor="lt2_blended_reference",
            agreement_score=inputs["agreement_score"],
            range_summary="El margen aumenta si el historico es corto o si LT2 fisiologico y practico no convergen.",
            calculation_steps=list(inputs["calculation_steps"]),
            cautions=list(inputs["cautions"]),
            anchors=list(inputs["anchors"]),
            confidence_factors=list(inputs["confidence_factors"]),
        )
    )

    athlete_weight = athlete.weight if athlete.weight and athlete.weight > 0 else None
    if athlete_weight:
        reference_wkg = reference_power / athlete_weight
        vo2max = 23 + reference_wkg * 8.5 + (1 - endurance_score) * 1.5
        vo2_margin = _clamp(2.4 + (1 - inputs["agreement_score"]) * 2.2 + (1 - inputs["stability_score"]) * 1.8, 2.0, 5.8)
        estimates.append(
            _estimate_payload(
                estimate_type="VO2max",
                discipline="ciclismo",
                power_source=power_source,
                value=vo2max,
                unit="ml/kg/min",
                confidence=_clamp(inputs["base_confidence"] - 0.05, 0.4, 0.9),
                snapshot_date=snapshot_date,
                variables_used=["lt2_power", "athlete_weight", "historical_stability", "history_depth"],
                evidence_points=history_depth,
                explanation="VO2max ciclista estimado desde W/kg de referencia en LT2 y calidad del soporte longitudinal.",
                lower_bound=vo2max - vo2_margin,
                upper_bound=vo2max + vo2_margin,
                method_used="lt2_wkg_vo2_proxy_v2",
                primary_anchor="lt2_blended_reference",
                agreement_score=inputs["agreement_score"],
                range_summary="Margen fisiologico ampliado cuando el LT2 practico y el LT2 fisiologico discrepan o el historico es corto.",
                calculation_steps=[
                    "Se mezcla LT2 fisiologico y LT2 practico cronico para obtener la potencia de referencia.",
                    "La potencia se relativiza por peso corporal actual para evitar sesgos absolutos.",
                    "El VO2max se aproxima desde W/kg con un margen dependiente del acuerdo entre anclas.",
                ],
                cautions=list(inputs["cautions"]),
                anchors=list(inputs["anchors"]),
                confidence_factors=list(inputs["confidence_factors"]),
            )
        )

    vlamax = _clamp(0.26 + (1 - endurance_score) * 0.36, 0.22, 0.92)
    estimates.append(
        _estimate_payload(
            estimate_type="VLAMAX",
            discipline="ciclismo",
            power_source=power_source,
            value=vlamax,
            unit="mmol/L/s",
            confidence=_clamp(inputs["base_confidence"] - 0.18, 0.3, 0.78),
            snapshot_date=snapshot_date,
            variables_used=["lt1_lactate", "lt2_lactate", "lt1_lt2_power_gap", "history_depth"],
            evidence_points=history_depth,
            explanation="Proxy glucolitico ciclista estimado desde separacion LT1-LT2 y sesgo del perfil de potencia.",
            spread=0.12 if history_depth >= 3 else 0.18,
            method_used="lt_gap_glycolytic_proxy_v1",
            primary_anchor="lt1_lt2_power_gap",
            agreement_score=inputs["agreement_score"],
            range_summary="VLaMax sigue siendo una lectura orientativa en ausencia de protocolo especifico.",
            calculation_steps=[
                "Se usa la distancia LT1-LT2 en potencia como indicador indirecto del perfil glucolitico.",
                "El resultado se modera si el historico o el acuerdo entre anclas es limitado.",
            ],
            cautions=list(inputs["cautions"]) + ["Este valor no sustituye una medicion especifica de VLaMax."],
            anchors=list(inputs["anchors"]),
            confidence_factors=list(inputs["confidence_factors"]),
        )
    )

    return estimates


def build_performance_estimates(
    athlete: Athlete,
    discipline: str,
    thresholds: list[Any],
    snapshot_date: date,
    history_depth: int,
    power_source: Optional[str] = None,
    dynamic_thresholds: Optional[dict[str, Any]] = None,
    snapshots: Optional[list[PhysiologicalSnapshot]] = None,
    swain_vo2max: Optional[dict[str, Any]] = None,
) -> list[dict[str, Any]]:
    snapshots = snapshots or []
    normalized_discipline = discipline or athlete.primary_discipline

    if normalized_discipline == "running":
        running_inputs = _running_prediction_inputs(
            thresholds=thresholds,
            dynamic_thresholds=dynamic_thresholds,
            snapshots=snapshots,
            discipline=normalized_discipline,
            power_source=power_source,
            history_depth=history_depth,
            swain_vo2max=swain_vo2max,
        )
        if not running_inputs:
            return []
        return _running_estimates(
            athlete=athlete,
            snapshot_date=snapshot_date,
            power_source=power_source,
            history_depth=max(1, history_depth),
            inputs=running_inputs,
        )

    if normalized_discipline == "ciclismo":
        cycling_inputs = _cycling_prediction_inputs(
            thresholds=thresholds,
            dynamic_thresholds=dynamic_thresholds,
            snapshots=snapshots,
            discipline=normalized_discipline,
            power_source=power_source,
            history_depth=history_depth,
        )
        if not cycling_inputs:
            return []
        return _cycling_estimates(
            athlete=athlete,
            snapshot_date=snapshot_date,
            power_source=power_source,
            history_depth=max(1, history_depth),
            inputs=cycling_inputs,
        )

    return []
