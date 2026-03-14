from __future__ import annotations

import math
from datetime import date
from statistics import mean
from typing import Any, Optional

from app.models.athlete import Athlete
from app.models.metrics import PhysiologicalSnapshot


# ── Constants ───────────────────────────────────────────────────────────────
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

# Fractional utilization is NOT fixed per distance — it depends on race DURATION.
# Daniels & Gilbert (1979): %VO2max sustainable decays with time.
# F(T) = 0.8 + 0.1894393 * e^(-0.012778*T) + 0.2989558 * e^(-0.1932605*T)
# where T = race duration in minutes.
# This naturally handles: fast athletes (short 5K) sustain higher F than slow athletes (long 5K).


def _daniels_sustainable_fraction(duration_minutes: float) -> float:
    """Daniels & Gilbert (1979): sustainable %VO2max as a function of race duration.

    Validated against thousands of race results across all distances.
    Returns the fraction of VO2max that can be sustained for the given duration.
    """
    t = duration_minutes
    return 0.8 + 0.1894393 * math.exp(-0.012778 * t) + 0.2989558 * math.exp(-0.1932605 * t)

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

# Base spread per distance — recalibrated from literature:
# Daniels VDOT ±2-3%, McLaughlin 2010 SEE ~5-7%, Roecker 1998 SEE ~3.5%
_BASE_SPREAD: dict[str, float] = {
    "5K": 0.020,
    "10K": 0.025,
    "HM": 0.035,
    "Maratón": 0.045,
}

# Asymmetric spread fractions (optimistic, pessimistic). Sum = 1.0.
# Santos-Lozano 2014: 87% of marathons are positive splits.
# Smyth 2021: 28% of male runners hit the wall.
# Asymmetry scales with distance because downside risk grows with duration.
_ASYMMETRY: dict[str, tuple[float, float]] = {
    "5K": (0.45, 0.55),
    "10K": (0.42, 0.58),
    "HM": (0.38, 0.62),
    "Maratón": (0.35, 0.65),
}
_MARATHON_HIGH_VLAMAX_ASYMMETRY = (0.30, 0.70)

# Durability: LT2 speed decay per hour of racing (Zanini et al. 2025).
# High endurance (LT1/LT2 ratio >0.87): ~2.5%/h.
# Medium: ~3.5%/h. Low: ~4.5%/h.
_DURABILITY_DECAY: dict[str, float] = {
    "high": 0.025,
    "medium": 0.035,
    "low": 0.045,
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


# ── Quality score Q — replaces additive spread penalties ─────────────────
def _quality_score(
    agreement: float,
    stability: float,
    history_depth: int,
    lt1_available: bool,
    vo2max_source: str,
) -> float:
    """Integrated data quality score Q ∈ [0, 1].

    Replaces the previous additive spread penalties with a single score.
    When Q = 1.0 (perfect data), spread = base_spread.
    When Q = 0.0 (worst data), spread = 2 × base_spread.
    Formula: spread = base / (0.5 + 0.5 * Q).
    """
    history_norm = _clamp(min(history_depth, 6) / 6, 0.0, 1.0)
    lt1_factor = 1.0 if lt1_available else 0.6
    vo2_factor = {"swain_hr": 1.0, "lt2_derived": 0.7, "none": 0.5}.get(vo2max_source, 0.6)

    q = (
        agreement * 0.25
        + stability * 0.25
        + history_norm * 0.20
        + lt1_factor * 0.15
        + vo2_factor * 0.15
    )
    return round(_clamp(q, 0.0, 1.0), 3)


# ── Glycogen risk flag (qualitative) ─────────────────────────────────────
def _glycogen_risk(vlamax: float, estimate_type: str) -> Optional[dict[str, str]]:
    """Qualitative glycogen depletion risk based on VLamax.

    Only relevant for HM (if VLamax very high) and Maratón.
    Based on Mader 2003, Olbrecht, Rapoport 2010.
    High VLamax = higher glycolytic flux = faster glycogen depletion.
    """
    if estimate_type not in ("HM", "Maratón"):
        return None
    if estimate_type == "HM" and vlamax <= 0.50:
        return None

    if vlamax < 0.30:
        return {
            "level": "low",
            "label": (
                "Perfil diesel (VLamax baja). Alta capacidad de oxidacion de grasas. "
                "Riesgo de deplecion glucogenica bajo con nutricion basica en carrera."
            ),
        }
    elif vlamax <= 0.45:
        return {
            "level": "moderate",
            "label": (
                "Riesgo glucogenico moderado. Nutricion en carrera recomendada "
                "desde el inicio (~60 g/h CHO minimo)."
            ),
        }
    else:
        return {
            "level": "high",
            "label": (
                "Riesgo glucogenico alto (VLamax elevada). Estrategia agresiva de "
                "reposicion de CHO imprescindible (60-90 g/h). "
                "El muro es probable sin nutricion adecuada."
            ),
        }


# ── Durability factor (Zanini et al. 2025) ───────────────────────────────
def _durability_decay_rate(endurance_score: float) -> float:
    """LT2 speed decay rate per hour of racing.

    Zanini et al. 2025: LT2 declines ~3.6% after 90 min, ~7.1% after 120 min.
    Hunter & Muniz-Pumares 2025: less durable runners run slower marathons.
    """
    if endurance_score > 0.7:
        return _DURABILITY_DECAY["high"]
    elif endurance_score >= 0.4:
        return _DURABILITY_DECAY["medium"]
    else:
        return _DURABILITY_DECAY["low"]


def _apply_durability(
    race_speed_kph: float,
    lt2_speed_kph: float,
    endurance_score: float,
    distance_km: float,
) -> tuple[float, dict[str, Any]]:
    """Apply LT2 threshold decline over race duration.

    The Daniels F(T) models VO2 kinetics at fixed threshold.
    This adds Zanini's separate mechanism: threshold itself drifts down.
    No double-counting because they capture different physiological phenomena.

    Returns: (adjusted_speed, durability_metadata)
    """
    duration_hours = (distance_km / race_speed_kph) if race_speed_kph > 0 else 1.0
    decay_rate = _durability_decay_rate(endurance_score)
    # Zanini 2025 data: 3.6% at 1.5h, 7.1% at 2h → not linear, closer to sqrt.
    # sqrt model: decay = rate * sqrt(duration) fits both data points better
    # than linear, and doesn't overestimate for 3h+ marathons.
    total_decay = decay_rate * math.sqrt(duration_hours)
    # Clamp: maximum 15% decay (prevents over-correction for ultra-slow paces)
    decay_factor = _clamp(1.0 - total_decay, 0.85, 1.0)
    adjusted_speed = race_speed_kph * decay_factor

    metadata = {
        "duration_hours": round(duration_hours, 2),
        "decay_rate_pct_per_hour": round(decay_rate * 100, 1),
        "total_decay_pct": round(total_decay * 100, 1),
        "effective_lt2_speed_kph": round(lt2_speed_kph * decay_factor, 2),
        "decay_factor": round(decay_factor, 4),
        "endurance_tier": (
            "high" if endurance_score > 0.7
            else "medium" if endurance_score >= 0.4
            else "low"
        ),
    }
    return adjusted_speed, metadata


# ── Running oxygen cost: Daniels & Gilbert equation ────────────────────────
# Replaces ACSM (VO2 = 0.2*v + 3.5) which overestimates O2 cost by 10-40%.
# Daniels equation validated against thousands of race results (1979, updated 2014).
#
# VO2 = -4.60 + 0.182258 * v + 0.000104 * v^2   (v in m/min)
#
# This is more accurate across the full speed range (8-22 km/h) because
# the quadratic term captures the non-linear relationship at higher speeds.

def _vo2_at_speed(speed_kph: float) -> float:
    """VO2 (ml/kg/min) at given running speed using Daniels & Gilbert equation."""
    v = speed_kph * 1000 / 60  # m/min
    return -4.60 + 0.182258 * v + 0.000104 * v * v


def _speed_at_vo2(vo2: float) -> float:
    """Inverse of Daniels equation: speed (km/h) that requires given VO2.

    Solves: 0.000104*v^2 + 0.182258*v + (-4.60 - vo2) = 0
    """
    a = 0.000104
    b = 0.182258
    c = -4.60 - vo2
    disc = b * b - 4 * a * c
    if disc < 0:
        return 0.0
    v = (-b + math.sqrt(disc)) / (2 * a)  # m/min
    return v * 60 / 1000  # km/h


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


# ── Race pace prediction: di Prampero + Daniels framework ──────────────────
def _predict_race_pace(
    vo2max: float,
    vlamax: float,
    lt2_speed_kph: float,
    estimate_type: str,
) -> Optional[float]:
    """Predict race pace using di Prampero framework with Daniels F(duration).

    Core equation: v_race = F(T) × VO2max / C

    Where:
    - F(T) = Daniels sustainable fraction at race duration T, modulated by VLamax
    - C = running economy (VO2 cost per unit speed, from Daniels equation)
    - VO2max = maximal aerobic capacity

    F depends on race duration which depends on race speed → iterative solution.
    Converges in 3-5 iterations.

    References:
    - di Prampero 1986: v = F × VO2max / C
    - Daniels & Gilbert 1979: F(T) = sustainable %VO2max
    - Mader 2003: VLamax modulation of sustainable %VO2max
    """
    if vo2max < 20 or lt2_speed_kph < 4:
        return None

    distance_km = _RACE_DISTANCE_KM[estimate_type]

    # Step 1: Derive running economy from LT2 data
    vo2_at_lt2 = _vo2_at_speed(lt2_speed_kph)
    economy = vo2_at_lt2 / lt2_speed_kph  # ml/kg/min per km/h

    # Step 2: Iterative solution — F depends on duration, duration depends on speed
    # Start with a rough estimate of race speed (LT2 speed as starting point)
    race_speed_kph = lt2_speed_kph

    for _ in range(8):  # converges in 3-5 iterations
        # Estimate race duration at current speed
        duration_min = (distance_km / race_speed_kph) * 60

        # Daniels sustainable fraction at this duration
        f_base = _daniels_sustainable_fraction(duration_min)

        # VLamax modulation
        vlamax_delta = vlamax - _VLAMAX_NEUTRAL
        sensitivity = _VLAMAX_SENSITIVITY[estimate_type]
        f_adjusted = f_base - vlamax_delta * sensitivity

        # Anaerobic bonus for short distances
        anaerobic_bonus = _ANAEROBIC_CONTRIBUTION[estimate_type] * (vlamax_delta / _VLAMAX_NEUTRAL)
        f_adjusted += anaerobic_bonus

        f_race = _clamp(f_adjusted, 0.65, 0.99)

        # di Prampero: v_race = F × VO2max / economy
        race_speed_kph = f_race * vo2max / economy

    # Sanity check: race speed should be reasonable relative to LT2
    ratio_to_lt2 = race_speed_kph / lt2_speed_kph
    if ratio_to_lt2 > 1.25 or ratio_to_lt2 < 0.65:
        max_ratio = {"5K": 1.15, "10K": 1.08, "HM": 1.00, "Maratón": 0.95}
        min_ratio = {"5K": 0.95, "10K": 0.88, "HM": 0.80, "Maratón": 0.72}
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
    ritmo_techo: Optional[float] = None,
    ritmo_objetivo: Optional[float] = None,
    ritmo_seguro: Optional[float] = None,
    glycogen_risk: Optional[dict[str, str]] = None,
    durability_info: Optional[dict[str, Any]] = None,
    quality_score_val: Optional[float] = None,
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
        "ritmo_techo": ritmo_techo,
        "ritmo_objetivo": ritmo_objetivo,
        "ritmo_seguro": ritmo_seguro,
        "glycogen_risk": glycogen_risk,
        "durability_info": durability_info,
        "quality_score": quality_score_val,
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

        # ── F. Durability factor (Zanini et al. 2025) ────────────────────
        # LT2 speed declines ~3-4%/hour at marathon intensity.
        # Applied to HM and Maratón; computed but not applied for 5K/10K.
        race_speed_raw = _pace_to_speed_kph(pace)
        durability_info: Optional[dict[str, Any]] = None
        if race_speed_raw and race_speed_raw > 0:
            distance_km = _RACE_DISTANCE_KM[estimate_type]
            if estimate_type in ("HM", "Maratón"):
                adjusted_speed, durability_info = _apply_durability(
                    race_speed_kph=race_speed_raw,
                    lt2_speed_kph=lt2_speed,
                    endurance_score=endurance_score,
                    distance_km=distance_km,
                )
                pace = _speed_kph_to_pace(adjusted_speed)
            else:
                # Compute metadata for transparency but don't adjust pace
                # (5K/10K duration <1h → decay <2.5%, negligible)
                _, durability_info = _apply_durability(
                    race_speed_kph=race_speed_raw,
                    lt2_speed_kph=lt2_speed,
                    endurance_score=endurance_score,
                    distance_km=distance_km,
                )

        # ── D. Quality score Q ───────────────────────────────────────────
        Q = _quality_score(
            agreement=inputs["agreement_score"],
            stability=inputs["stability_score"],
            history_depth=history_depth,
            lt1_available=not inputs["lt1_missing"],
            vo2max_source=vo2max_source,
        )

        # ── E. Spread via Q-score (replaces additive penalties) ──────────
        base_spread = _BASE_SPREAD[estimate_type]
        spread = base_spread / (0.5 + 0.5 * Q)
        spread = round(_clamp(spread, 0.015, 0.10), 3)

        # ── A. Asymmetric spread (Santos-Lozano 2014, Smyth 2021) ───────
        opt_frac, pess_frac = _ASYMMETRY[estimate_type]
        if estimate_type == "Maratón" and vlamax > 0.45:
            opt_frac, pess_frac = _MARATHON_HIGH_VLAMAX_ASYMMETRY
        # Multiply by 2 because fractions sum to 1.0 (each side gets its share)
        optimistic_spread = spread * opt_frac * 2
        pessimistic_spread = spread * pess_frac * 2

        # ── C. Three paces ──────────────────────────────────────────────
        # In s/km: lower number = faster. Techo is fastest, seguro is slowest.
        rt_objetivo = pace
        rt_techo = pace * (1 - optimistic_spread)
        rt_seguro = pace * (1 + pessimistic_spread)

        # ── B. Glycogen risk flag ───────────────────────────────────────
        glycogen = _glycogen_risk(vlamax, estimate_type)

        # ── Confidence ──────────────────────────────────────────────────
        confidence = inputs["base_confidence"] - _CONFIDENCE_PENALTY[estimate_type]
        if estimate_type == "Maratón" and inputs["lt1_missing"]:
            confidence -= 0.04
        if vo2max_source == "swain_hr":
            confidence += 0.03
        confidence = round(_clamp(confidence, 0.35, 0.91), 2)

        # ── Explanation and cautions ────────────────────────────────────
        range_summary = (
            f"Q={round(Q, 2)} → spread base {round(base_spread*100, 1)}%, "
            f"efectivo {round(spread*100, 1)}% "
            f"(optimista {round(optimistic_spread*100, 1)}% / pesimista {round(pessimistic_spread*100, 1)}%). "
            f"Acuerdo anclas {round(inputs['agreement_score'] * 100)}%, "
            f"estabilidad {round(inputs['stability_score'] * 100)}%, "
            f"{history_depth} cortes."
        )

        method_used = "di_prampero_vlamax_durability_v2" if vo2max and vo2max > 20 else "riegel_endurance_fallback"
        explanation = (
            f"Prediccion fisiologica: VO2max={round(vo2max, 1) if vo2max else '?'} ml/kg/min, "
            f"VLamax={round(vlamax, 2)} mmol/L/s, "
            f"utilizacion fraccional ajustada por distancia y perfil metabolico (di Prampero 1986, Mader 2003)"
        )
        if durability_info and estimate_type in ("HM", "Maratón"):
            explanation += (
                f", corregida por durabilidad (Zanini 2025): "
                f"-{durability_info['total_decay_pct']}% en {durability_info['duration_hours']}h."
            )
        else:
            explanation += "."

        cautions = list(inputs["cautions"])
        # G. Running Economy caution (always — we use population-average RE)
        cautions.append(
            "Economia de carrera estimada con ecuacion poblacional (Daniels). "
            "La prediccion mejorara con datos individuales de RE (variabilidad inter-individual ~21%, Hansen 2021)."
        )
        if estimate_type == "Maratón" and history_depth < 4:
            cautions.append("Maraton necesita mas respaldo longitudinal que 5K o 10K; conviene confirmarla con trabajo especifico.")
        if vo2max_source == "lt2_derived":
            cautions.append("VO2max derivado de LT2 (circular); la prediccion mejorara con datos de FC.")
        if glycogen and glycogen["level"] in ("moderate", "high"):
            cautions.append(glycogen["label"])

        calc_steps = list(inputs["calculation_steps"])
        if durability_info and estimate_type in ("HM", "Maratón"):
            calc_steps.append(
                f"Factor durabilidad (Zanini 2025): LT2 efectivo cae {durability_info['total_decay_pct']}% "
                f"en {durability_info['duration_hours']}h de carrera "
                f"(tier: {durability_info['endurance_tier']}, decay: {durability_info['decay_rate_pct_per_hour']}%/h)."
            )
        calc_steps.append(
            f"Spread asimetrico: techo (mejor dia) a -{round(optimistic_spread*100, 1)}%, "
            f"seguro (salida conservadora) a +{round(pessimistic_spread*100, 1)}% "
            f"(Santos-Lozano 2014, Smyth 2021)."
        )

        estimates.append(
            _estimate_payload(
                estimate_type=estimate_type,
                discipline="running",
                power_source=power_source,
                value=round(rt_objetivo, 1),
                unit="s/km",
                confidence=confidence,
                snapshot_date=snapshot_date,
                variables_used=base_variables,
                evidence_points=history_depth,
                explanation=explanation,
                spread=spread,
                lower_bound=round(rt_techo, 1),
                upper_bound=round(rt_seguro, 1),
                method_used=method_used,
                primary_anchor="vo2max_vlamax_lt2" if vo2max else "lt2_blended_reference",
                agreement_score=inputs["agreement_score"],
                range_summary=range_summary,
                calculation_steps=calc_steps,
                cautions=cautions,
                anchors=list(inputs["anchors"]),
                confidence_factors=list(inputs["confidence_factors"]),
                ritmo_techo=round(rt_techo, 1),
                ritmo_objetivo=round(rt_objetivo, 1),
                ritmo_seguro=round(rt_seguro, 1),
                glycogen_risk=glycogen,
                durability_info=durability_info,
                quality_score_val=Q,
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

    # Q-score for cycling (same principle as running)
    lt1_available = inputs.get("endurance_score", 0.55) != 0.55
    Q_cyc = _quality_score(
        agreement=inputs["agreement_score"],
        stability=inputs["stability_score"],
        history_depth=history_depth,
        lt1_available=lt1_available,
        vo2max_source="lt2_derived",
    )
    ftp_spread = 0.028 / (0.5 + 0.5 * Q_cyc)
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
            range_summary=f"Q={round(Q_cyc, 2)} → spread {round(ftp_spread*100, 1)}%. Acuerdo anclas {round(inputs['agreement_score'] * 100)}%.",
            calculation_steps=list(inputs["calculation_steps"]),
            cautions=list(inputs["cautions"]),
            anchors=list(inputs["anchors"]),
            confidence_factors=list(inputs["confidence_factors"]),
            quality_score_val=Q_cyc,
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


# ── Target curve: reverse-engineer required physiology from race goal ────────

# Distance categories to km mapping (matches AthleteTarget.distance_category)
_DISTANCE_CATEGORY_KM: dict[str, float] = {
    "5k": 5.0,
    "10k": 10.0,
    "hm": 21.0975,
    "marathon": 42.195,
}

# Distance category to estimate_type mapping
_CATEGORY_TO_ESTIMATE: dict[str, str] = {
    "5k": "5K",
    "10k": "10K",
    "hm": "HM",
    "marathon": "Maratón",
}


def _lt2_fraction_for_vlamax(vlamax: float) -> float:
    """Fraction of VO2max at which LT2 occurs, given VLamax.

    Low VLamax (diesel) → LT2 at higher % of VO2max (~0.91).
    High VLamax (sprinter) → LT2 at lower % of VO2max (~0.82).
    Source: Mader 2003, Olbrecht.
    """
    return _clamp(0.97 - vlamax * 0.30, 0.78, 0.93)


def _pace_label_to_seconds(pace_label: Optional[str]) -> Optional[float]:
    """Convert '4:30' or '4:30/km' to seconds per km."""
    if not pace_label:
        return None
    try:
        clean = pace_label.replace("/km", "").strip()
        parts = clean.split(":")
        if len(parts) == 2:
            mins, secs = int(parts[0]), int(parts[1])
            return mins * 60 + secs
    except (ValueError, IndexError):
        pass
    return None


def _format_pace(pace_seconds: Optional[float]) -> str:
    """Format pace in seconds to 'M:SS' string."""
    if pace_seconds is None or pace_seconds <= 0:
        return "?"
    mins = int(pace_seconds // 60)
    secs = int(pace_seconds % 60)
    return f"{mins}:{secs:02d}"


def build_target_curve(
    *,
    distance_category: str,
    target_pace_label: Optional[str] = None,
    target_pace_seconds: Optional[float] = None,
    current_lt1_speed_kph: Optional[float] = None,
    current_lt2_speed_kph: Optional[float] = None,
    current_lt1_lactate: Optional[float] = None,
    current_lt2_lactate: Optional[float] = None,
    current_vo2max: Optional[float] = None,
    current_vlamax: Optional[float] = None,
    baseline_lactate: float = 0.9,
) -> Optional[dict[str, Any]]:
    """Build a target lactate curve from a race goal.

    Given a target race (distance + pace), reverse-engineers the required
    VO2max, LT2 speed, and LT1 speed, then generates a synthetic exponential
    lactate curve through the target thresholds.

    The curve uses the athlete's CURRENT lactate values at their thresholds
    (because training shifts the curve right, not down — Olbrecht principle).
    If real thresholds are available, those lactate values are used.
    Otherwise, defaults to 2.0 (LT1) and 4.0 (LT2).

    Returns a dict with target analysis and synthetic curve points, or None
    if insufficient data.
    """
    distance_km = _DISTANCE_CATEGORY_KM.get(distance_category)
    if distance_km is None:
        return None

    # Resolve target pace
    pace_s = target_pace_seconds
    if pace_s is None:
        pace_s = _pace_label_to_seconds(target_pace_label)
    if pace_s is None or pace_s <= 0:
        return None

    target_speed_kph = 3600 / pace_s
    estimate_type = _CATEGORY_TO_ESTIMATE.get(distance_category, "10K")

    # ── Step 1: Required VO2max ────────────────────────────────────────
    duration_min = (distance_km / target_speed_kph) * 60
    vlamax = current_vlamax if current_vlamax and current_vlamax > 0.1 else 0.35

    f_base = _daniels_sustainable_fraction(duration_min)
    vlamax_delta = vlamax - _VLAMAX_NEUTRAL
    sensitivity = _VLAMAX_SENSITIVITY.get(estimate_type, 0.08)
    f_adjusted = f_base - vlamax_delta * sensitivity
    anaerobic_bonus = _ANAEROBIC_CONTRIBUTION.get(estimate_type, 0.03) * (vlamax_delta / _VLAMAX_NEUTRAL)
    f_adjusted += anaerobic_bonus
    f_race = _clamp(f_adjusted, 0.65, 0.99)

    vo2_at_race = _vo2_at_speed(target_speed_kph)
    vo2max_needed = vo2_at_race / f_race

    if vo2max_needed < 20 or vo2max_needed > 95:
        return None

    # ── Step 2: Target LT2 speed ──────────────────────────────────────
    lt2_frac = _lt2_fraction_for_vlamax(vlamax)
    vo2_at_target_lt2 = lt2_frac * vo2max_needed
    target_lt2_speed_kph = _speed_at_vo2(vo2_at_target_lt2)
    target_lt2_pace = _speed_kph_to_pace(target_lt2_speed_kph)

    # ── Step 3: Target LT1 speed ──────────────────────────────────────
    # Preserve current LT1/LT2 speed ratio (reflects VLamax / curve shape)
    if current_lt1_speed_kph and current_lt2_speed_kph and current_lt2_speed_kph > 0:
        lt1_lt2_ratio = current_lt1_speed_kph / current_lt2_speed_kph
    else:
        # Default ratio from VLamax
        lt1_lt2_ratio = _clamp(0.96 - vlamax * 0.20, 0.78, 0.94)

    target_lt1_speed_kph = target_lt2_speed_kph * lt1_lt2_ratio
    target_lt1_pace = _speed_kph_to_pace(target_lt1_speed_kph)

    # ── Step 4: Lactate values at thresholds ──────────────────────────
    # Use real values (individual) if available, else defaults
    lt1_lac = current_lt1_lactate if current_lt1_lactate and current_lt1_lactate > 0.5 else 2.0
    lt2_lac = current_lt2_lactate if current_lt2_lactate and current_lt2_lactate > 1.0 else 4.0
    if lt2_lac <= lt1_lac:
        lt2_lac = lt1_lac + 1.5

    # ── Step 5: Synthetic exponential curve ───────────────────────────
    # Model: La(v) = La_baseline + a * exp(b * v)
    # Fit through (LT1_speed, LT1_lac) and (LT2_speed, LT2_lac)
    curve_points: list[dict[str, Any]] = []

    delta_lt1 = lt1_lac - baseline_lactate
    delta_lt2 = lt2_lac - baseline_lactate

    if delta_lt1 > 0.05 and delta_lt2 > delta_lt1 and target_lt2_speed_kph > target_lt1_speed_kph:
        speed_gap = target_lt2_speed_kph - target_lt1_speed_kph
        b = math.log(delta_lt2 / delta_lt1) / speed_gap
        a_coeff = delta_lt1 / math.exp(b * target_lt1_speed_kph)

        # Generate points from well below LT1 to slightly above LT2
        min_speed = target_lt1_speed_kph * 0.75
        max_speed = target_lt2_speed_kph * 1.10
        n_points = 20
        step = (max_speed - min_speed) / (n_points - 1)

        for i in range(n_points):
            v = min_speed + i * step
            lac = baseline_lactate + a_coeff * math.exp(b * v)
            lac = min(lac, 12.0)
            pace = _speed_kph_to_pace(v)
            curve_points.append({
                "x": round(pace, 1) if pace else 0,
                "speed_kph": round(v, 2),
                "lactate": round(lac, 2),
            })

    # ── Step 6: Gap analysis ──────────────────────────────────────────
    gap: dict[str, Any] = {}
    if current_vo2max and current_vo2max > 0:
        gap["vo2max"] = {
            "current": round(current_vo2max, 1),
            "target": round(vo2max_needed, 1),
            "delta": round(vo2max_needed - current_vo2max, 1),
            "delta_pct": round((vo2max_needed - current_vo2max) / current_vo2max * 100, 1),
        }
    if current_lt2_speed_kph and current_lt2_speed_kph > 0:
        current_lt2_pace = _speed_kph_to_pace(current_lt2_speed_kph)
        gap["lt2_speed"] = {
            "current_pace": round(current_lt2_pace, 1) if current_lt2_pace else None,
            "target_pace": round(target_lt2_pace, 1) if target_lt2_pace else None,
            "delta_s_per_km": round((current_lt2_pace or 0) - (target_lt2_pace or 0), 1),
        }
    if current_lt1_speed_kph and current_lt1_speed_kph > 0:
        current_lt1_pace = _speed_kph_to_pace(current_lt1_speed_kph)
        gap["lt1_speed"] = {
            "current_pace": round(current_lt1_pace, 1) if current_lt1_pace else None,
            "target_pace": round(target_lt1_pace, 1) if target_lt1_pace else None,
            "delta_s_per_km": round((current_lt1_pace or 0) - (target_lt1_pace or 0), 1),
        }

    # ── Step 7: VLamax recommendation ─────────────────────────────────
    vlamax_note = None
    if distance_category in ("marathon", "hm") and vlamax > 0.40:
        vlamax_note = (
            f"VLamax actual ({round(vlamax, 2)}) es alta para {distance_category}. "
            "Reducirla (mas trabajo aerobico) mejoraria la utilizacion fraccional en carrera."
        )
    elif distance_category in ("5k", "10k") and vlamax < 0.25:
        vlamax_note = (
            f"VLamax actual ({round(vlamax, 2)}) es baja para {distance_category}. "
            "Un componente anaerobico algo mayor beneficiaria el rendimiento en distancias cortas."
        )

    return {
        "distance_category": distance_category,
        "distance_km": distance_km,
        "target_pace_s_per_km": round(pace_s, 1),
        "target_speed_kph": round(target_speed_kph, 2),
        "race_duration_min": round(duration_min, 1),
        "fractional_utilization": round(f_race, 3),
        "vo2max_needed": round(vo2max_needed, 1),
        "target_lt2_pace": round(target_lt2_pace, 1) if target_lt2_pace else None,
        "target_lt2_speed_kph": round(target_lt2_speed_kph, 2),
        "target_lt1_pace": round(target_lt1_pace, 1) if target_lt1_pace else None,
        "target_lt1_speed_kph": round(target_lt1_speed_kph, 2),
        "lt1_lactate_used": round(lt1_lac, 2),
        "lt2_lactate_used": round(lt2_lac, 2),
        "lt1_lt2_ratio_used": round(lt1_lt2_ratio, 3),
        "curve_points": curve_points,
        "gap": gap,
        "vlamax_note": vlamax_note,
        "method": "di_prampero_daniels_reverse_v1",
        "explanation": [
            f"Objetivo: {distance_category.upper()} en {_format_pace(pace_s)}/km "
            f"({int(duration_min // 60)}h{int(duration_min % 60):02d}min).",
            f"VO2max necesario: {round(vo2max_needed, 1)} ml/kg/min "
            f"(utilizacion fraccional {round(f_race * 100, 1)}% a esa duracion).",
            f"LT2 objetivo: {_format_pace(target_lt2_pace)}/km "
            f"(al {round(lt2_frac * 100)}% del VO2max).",
            f"LT1 objetivo: {_format_pace(target_lt1_pace)}/km "
            f"(ratio LT1/LT2 = {round(lt1_lt2_ratio, 2)}).",
            "Curva objetivo: exponencial a traves de LT1 y LT2 objetivo "
            "con los lactatos individuales del atleta (Olbrecht: el entrenamiento "
            "desplaza la curva a la derecha, no hacia abajo).",
        ],
    }
