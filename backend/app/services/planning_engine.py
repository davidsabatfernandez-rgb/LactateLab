from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.athlete import Athlete, AthleteFocusBlock
from app.models.metrics import PhysiologicalSnapshot
from app.models.planned_session import PlannedSession
from app.models.session import Session as AthleteSession
from app.services.analytics import athlete_analysis_payload
from app.services.block_rationale import (
    BLOCK_RATIONALE,
    generate_block_explanation,
    generate_reliability_warnings,
    rationale_fit_messages,
    rationale_risk_messages,
)
from app.services.mesocycle_library import FOUNDATION_PILLARS, select_mesocycle_template, templates_for_discipline
from app.services.physiological_engine import (
    analyse_physiological_gap,
    build_physiological_context,
)
from app.services.target_taxonomy import infer_distance_category
from app.services.mesocycle_detector import detect_mesocycles, serialize_detected_mesocycles
from app.services.planning_taxonomy import BLOCK_TAXONOMY
from app.services.workout_library import (
    build_mesocycle_draft,
    builder_variables_for_template,
    evidence_for_ids,
    templates_for_block,
    templates_for_discipline_library,
    variants_for_template,
)


def _discipline_targets(athlete: Athlete, discipline: str) -> list:
    targets = athlete.targets or []
    if athlete.primary_discipline == "triatlón":
        filtered = [target for target in targets if target.discipline in {discipline, "triatlón"}]
    else:
        filtered = [target for target in targets if target.discipline in {discipline, athlete.primary_discipline}]
    return sorted(filtered, key=lambda item: item.target_date)


def _sessions_for_discipline(athlete: Athlete, discipline: str) -> list[AthleteSession]:
    return sorted(
        [session for session in athlete.sessions if session.discipline == discipline],
        key=lambda item: item.performed_at,
    )


def _focus_block_for_discipline(athlete: Athlete, discipline: str):
    for block in athlete.focus_blocks:
        target_discipline = block.priority_discipline or athlete.primary_discipline
        if target_discipline == discipline and block.status == "active":
            return block
    return None


def _planned_blocks_for_discipline(athlete: Athlete, discipline: str) -> list[dict[str, Any]]:
    items = []
    for block in athlete.focus_blocks:
        target_discipline = block.priority_discipline or athlete.primary_discipline
        if target_discipline != discipline:
            continue
        items.append(
            {
                "id": block.id,
                "start_date": block.start_date,
                "end_date": block.end_date,
                "template_id": block.template_id,
                "energy_system_focus": block.energy_system_focus,
                "block_objective": block.block_objective,
                "block_intent": block.block_intent,
                "priority_discipline": block.priority_discipline,
                "phase": block.phase,
                "target_event": block.target_event,
                "target_date": block.target_date,
                "status": block.status,
                "coach_notes": block.coach_notes,
            }
        )
    return sorted(items, key=lambda item: (item["start_date"], item["id"]), reverse=True)


def _planned_sessions_all(athlete: Athlete) -> list[dict[str, Any]]:
    """Return ALL planned sessions for the athlete (all disciplines) for the calendar."""
    items: list[dict[str, Any]] = []
    for session in getattr(athlete, "planned_sessions", []):
        items.append(
            {
                "id": session.id,
                "focus_block_id": session.focus_block_id,
                "scheduled_date": session.scheduled_date,
                "discipline": session.discipline,
                "week_index": session.week_index,
                "day_offset": session.day_offset,
                "session_role": session.session_role,
                "session_family": session.session_family,
                "workout_template_id": session.workout_template_id,
                "public_label": session.public_label,
                "objective": session.objective,
                "dose_prescription": session.dose_prescription,
                "dose_guidance": session.dose_guidance,
                "progression_note": session.progression_note,
                "expected_signal": session.expected_signal,
                "coach_note": session.coach_note,
                "confidence": session.confidence,
                "status": session.status,
                "bla_check": session.bla_check,
                "estimated_tss": session.estimated_tss,
                "athlete_note": session.athlete_note,
                "scheduled_time": session.scheduled_time,
                "publish_status": session.publish_status,
                "publish_provider": session.publish_provider,
                "publish_error": session.publish_error,
                "payload": session.payload or {},
            }
        )
    return sorted(items, key=lambda item: (item["scheduled_date"], item["week_index"], item["day_offset"]))


def _planned_sessions_for_discipline(athlete: Athlete, discipline: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for session in getattr(athlete, "planned_sessions", []):
        if session.discipline != discipline:
            continue
        items.append(
            {
                "id": session.id,
                "focus_block_id": session.focus_block_id,
                "scheduled_date": session.scheduled_date,
                "discipline": session.discipline,
                "week_index": session.week_index,
                "day_offset": session.day_offset,
                "session_role": session.session_role,
                "session_family": session.session_family,
                "workout_template_id": session.workout_template_id,
                "public_label": session.public_label,
                "objective": session.objective,
                "dose_prescription": session.dose_prescription,
                "dose_guidance": session.dose_guidance,
                "progression_note": session.progression_note,
                "expected_signal": session.expected_signal,
                "coach_note": session.coach_note,
                "confidence": session.confidence,
                "status": session.status,
                "payload": session.payload or {},
            }
        )
    return sorted(items, key=lambda item: (item["scheduled_date"], item["week_index"], item["day_offset"]))


def _evaluation_for_block(analysis: dict[str, Any], block_id: Optional[int]) -> Optional[dict[str, Any]]:
    if block_id is None:
        return None
    for evaluation in analysis.get("focus_block_evaluations", []):
        if evaluation.get("block_id") == block_id:
            return evaluation
    return None


def _peak_lactate_proxy(view: dict[str, Any], raw_curve_points: list[dict[str, Any]]) -> Optional[float]:
    history = (view.get("historical_evolution") or {}).get("peak_lactate") or []
    if history:
        latest = history[-1]
        value = latest.get("value")
        if isinstance(value, (int, float)):
            return float(value)

    measurement_log = view.get("measurement_log") or []
    values = [
        float(item["lactate_mmol"])
        for item in measurement_log
        if isinstance(item.get("lactate_mmol"), (int, float))
    ]
    if values:
        return max(values)

    curve_values = [
        float(point["lactate_mmol"])
        for point in raw_curve_points
        if isinstance(point.get("lactate_mmol"), (int, float))
    ]
    return max(curve_values) if curve_values else None


def _raw_lactate_curve(athlete: Athlete, discipline: str) -> list[dict]:
    """Extrae los puntos crudos de la última sesión de test de lactato.

    Se usa como fallback en el motor fisiológico cuando la detección
    automática de LT1/LT2 no produce resultados con suficiente confianza.
    """
    test_sessions = [
        s for s in (athlete.sessions or [])
        if s.discipline == discipline
        and any(
            getattr(iv, "lactate_sample", None) is not None
            for iv in getattr(s, "intervals", [])
        )
    ]
    if not test_sessions:
        return []

    latest = max(test_sessions, key=lambda s: s.performed_at)
    points = []
    for iv in getattr(latest, "intervals", []):
        sample = getattr(iv, "lactate_sample", None)
        pace = getattr(iv, "pace_seconds_per_km", None)
        power = getattr(iv, "power_watts", None)
        if sample and getattr(sample, "lactate_mmol", None):
            point = {
                "lactate_mmol": sample.lactate_mmol,
            }
            if pace:
                point["pace_seconds_per_km"] = pace
            if power:
                point["power_watts"] = power
            points.append(point)
    return points


def _extract_lt2_heart_rate(analysis: dict, discipline: str) -> Optional[int]:
    """Extract LT2 heart rate from the latest snapshot thresholds."""
    thresholds = analysis.get("thresholds") or []
    lt2 = next((t for t in thresholds if t.get("name") == "LT2"), None)
    if lt2 and lt2.get("heart_rate"):
        return int(lt2["heart_rate"])
    # Fallback: dynamic thresholds practical LT2
    dt = analysis.get("dynamic_thresholds") or {}
    chronic = dt.get("chronic") or dt
    p_lt2 = chronic.get("practical_lt2") or chronic.get("reference_4mmol")
    if p_lt2 and p_lt2.get("estimated_hr_at_target"):
        return int(p_lt2["estimated_hr_at_target"])
    return None


def _extract_hr_max(athlete: Athlete, discipline: str) -> Optional[int]:
    """Extract max HR from observed session data.

    Priority: athlete.training_hr_max (coach override) > observed > age-based.
    """
    # Coach override takes priority
    coach_hr_max = getattr(athlete, "training_hr_max", None)
    if coach_hr_max and coach_hr_max >= 150:
        return coach_hr_max

    max_hr_observed = None
    for session in (athlete.sessions or []):
        if session.discipline != discipline:
            continue
        for iv in getattr(session, "intervals", []):
            hr_max = getattr(iv, "heart_rate_max", None)
            if hr_max and (max_hr_observed is None or hr_max > max_hr_observed):
                max_hr_observed = hr_max
            # Also check heart_rate_avg as a lower bound signal
            hr_avg = getattr(iv, "heart_rate_avg", None)
            if hr_avg and (max_hr_observed is None or hr_avg > max_hr_observed):
                max_hr_observed = hr_avg

    if max_hr_observed and max_hr_observed >= 150:
        return max_hr_observed

    # Fallback: age-based estimate
    dob = getattr(athlete, "date_of_birth", None)
    if dob:
        age = (date.today() - dob).days // 365
        if 10 <= age <= 90:
            return 220 - age
    return None


def _extract_hr_rest(db: Session, athlete: Athlete) -> Optional[int]:
    """Extract resting HR estimate.

    Without persistent Garmin health snapshots, we use a level-based default.
    A more accurate value could come from a future manual field or cached
    Garmin sync. For now:
      - competitive: 48 bpm (typical well-trained endurance athlete)
      - trained: 55 bpm
      - recreational: 62 bpm
    These are conservative estimates that avoid inflating VO2max.
    """
    level = getattr(athlete, "athlete_level", "trained") or "trained"
    defaults = {"competitive": 48, "trained": 55, "recreational": 62}
    return defaults.get(level, 55)


def _extract_garmin_vo2max(db: Session, athlete: Athlete, discipline: str) -> Optional[float]:
    """Extract Garmin VO2max — currently not persisted locally.

    TODO: when Garmin health snapshots are cached in DB, extract from there.
    For now returns None (Swain estimation is primary source).
    """
    return None


def _safe_ratio(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    if numerator is None or denominator is None or denominator <= 0:
        return None
    return numerator / denominator


def _session_total_duration_seconds(session: AthleteSession) -> int:
    return sum((getattr(interval, "duration_seconds", 0) or 0) + (getattr(interval, "rest_seconds", 0) or 0) for interval in getattr(session, "intervals", []))


def _durability_duration_floor(discipline: str) -> int:
    if discipline == "ciclismo":
        return 75 * 60
    if discipline == "natación":
        return 35 * 60
    return 55 * 60


def _session_durability_signature(session: AthleteSession, discipline: str) -> Optional[dict[str, Any]]:
    intervals = [interval for interval in getattr(session, "intervals", []) if getattr(interval, "duration_seconds", 0) and getattr(interval, "duration_seconds", 0) >= 120]
    if len(intervals) < 4:
        return None

    total_duration = _session_total_duration_seconds(session)
    if total_duration < _durability_duration_floor(discipline):
        return None

    early = intervals[: max(2, len(intervals) // 3)]
    late = intervals[-max(2, len(intervals) // 3) :]

    if discipline == "ciclismo":
        early_metric = [float(interval.power_watts) for interval in early if isinstance(getattr(interval, "power_watts", None), (int, float)) and interval.power_watts > 0]
        late_metric = [float(interval.power_watts) for interval in late if isinstance(getattr(interval, "power_watts", None), (int, float)) and interval.power_watts > 0]
        metric_name = "power"
        source = "brick_session" if "brick" in ((getattr(session, "goal", "") or "") + " " + (getattr(session, "session_type", "") or "")).lower() else "long_session_field"
    else:
        early_metric = [
            3600 / float(interval.pace_seconds_per_km)
            for interval in early
            if isinstance(getattr(interval, "pace_seconds_per_km", None), (int, float)) and interval.pace_seconds_per_km > 0
        ]
        late_metric = [
            3600 / float(interval.pace_seconds_per_km)
            for interval in late
            if isinstance(getattr(interval, "pace_seconds_per_km", None), (int, float)) and interval.pace_seconds_per_km > 0
        ]
        metric_name = "speed"
        source = "brick_session" if "brick" in ((getattr(session, "goal", "") or "") + " " + (getattr(session, "session_type", "") or "")).lower() else "long_session_field"

    early_hr = [float(interval.heart_rate_avg) for interval in early if isinstance(getattr(interval, "heart_rate_avg", None), (int, float)) and interval.heart_rate_avg > 0]
    late_hr = [float(interval.heart_rate_avg) for interval in late if isinstance(getattr(interval, "heart_rate_avg", None), (int, float)) and interval.heart_rate_avg > 0]

    if len(early_metric) < 2 or len(late_metric) < 2 or len(early_hr) < 2 or len(late_hr) < 2:
        return None

    early_metric_mean = sum(early_metric) / len(early_metric)
    late_metric_mean = sum(late_metric) / len(late_metric)
    early_hr_mean = sum(early_hr) / len(early_hr)
    late_hr_mean = sum(late_hr) / len(late_hr)

    early_cost = _safe_ratio(early_hr_mean, early_metric_mean)
    late_cost = _safe_ratio(late_hr_mean, late_metric_mean)
    if early_cost is None or late_cost is None:
        return None

    aerobic_drift_pct = round(((late_cost / early_cost) - 1) * 100, 2)
    lt1_degradation_pct = round(max(0.0, ((early_metric_mean - late_metric_mean) / early_metric_mean) * 100), 2)
    lt2_degradation_pct = round(lt1_degradation_pct * 0.6, 2)
    confounded = bool(getattr(session, "temperature_c", None) and getattr(session, "temperature_c", 0) >= 28)

    return {
        "session_id": session.id,
        "metric_name": metric_name,
        "aerobic_drift_pct": aerobic_drift_pct,
        "lt1_degradation_pct": lt1_degradation_pct,
        "lt2_degradation_pct": lt2_degradation_pct,
        "durability_score": round(max(0.0, min(1.0, 1 - max(0.0, aerobic_drift_pct) / 12)), 2),
        "source": source,
        "confounded": confounded,
    }


def _estimate_durability_state(
    sessions: list[AthleteSession],
    *,
    discipline: str,
    distance_category: Optional[str],
) -> dict[str, Any]:
    relevant_events = {
        "hm",
        "marathon",
        "road_tt_medium",
        "road_tt_long",
        "granfondo",
        "70.3",
        "half_tri",
        "half_run",
        "half_bike",
        "ironman",
        "ironman_run",
        "ironman_bike",
        "open_water_long",
    }
    if distance_category not in relevant_events:
        return {
            "durability_score": None,
            "lt1_degradation_pct": None,
            "lt2_degradation_pct": None,
            "aerobic_drift_pct": None,
            "durability_confidence": 0.2,
            "durability_source": "none",
            "durability_flag": "insufficient_evidence_for_durability",
            "signals": [],
        }

    signatures = []
    for session in sorted(sessions, key=lambda item: item.performed_at, reverse=True)[:6]:
        signature = _session_durability_signature(session, discipline)
        if signature:
            signatures.append(signature)

    if not signatures:
        return {
            "durability_score": None,
            "lt1_degradation_pct": None,
            "lt2_degradation_pct": None,
            "aerobic_drift_pct": None,
            "durability_confidence": 0.2,
            "durability_source": "none",
            "durability_flag": "insufficient_evidence_for_durability",
            "signals": [],
        }

    valid = [item for item in signatures if not item["confounded"]]
    signal_pool = valid or signatures
    durability_source = signal_pool[0]["source"] if signal_pool else "none"
    aerobic_drift_pct = round(sum(item["aerobic_drift_pct"] for item in signal_pool) / len(signal_pool), 2)
    lt1_degradation_pct = round(sum(item["lt1_degradation_pct"] for item in signal_pool) / len(signal_pool), 2)
    lt2_degradation_pct = round(sum(item["lt2_degradation_pct"] for item in signal_pool) / len(signal_pool), 2)
    durability_score = round(sum(item["durability_score"] for item in signal_pool) / len(signal_pool), 2)

    if len(valid) >= 3:
        confidence = 0.8
    elif len(valid) == 2:
        confidence = 0.65
    elif len(signal_pool) == 1:
        confidence = 0.45
    else:
        confidence = 0.52

    if valid and aerobic_drift_pct >= 6:
        flag = "possible_low_durability"
    elif not valid and any(item["confounded"] for item in signatures):
        flag = "durability_signal_confounded"
    else:
        flag = "durability_ok" if confidence >= 0.55 else "insufficient_evidence_for_durability"

    return {
        "durability_score": durability_score,
        "lt1_degradation_pct": lt1_degradation_pct,
        "lt2_degradation_pct": lt2_degradation_pct,
        "aerobic_drift_pct": aerobic_drift_pct,
        "durability_confidence": confidence,
        "durability_source": durability_source,
        "durability_flag": flag,
        "signals": signal_pool,
    }


def _infer_secondary_limiter(
    *,
    physio_gap: Any,
    peak_lactate_proxy: Optional[float],
    durability_state: dict[str, Any],
) -> Optional[str]:
    if durability_state.get("durability_flag") == "possible_low_durability" and durability_state.get("durability_confidence", 0) >= 0.55:
        return "durability_risk"
    if peak_lactate_proxy is not None and peak_lactate_proxy >= 12.0:
        return "glycolytic_mismatch"
    if peak_lactate_proxy is not None and peak_lactate_proxy <= 8.0:
        return "glycolytic_mismatch"
    if getattr(physio_gap, "primary_limiter", None) == "lt2" and physio_gap.lt1_gap_kmh is not None and physio_gap.lt1_gap_kmh > 0.25:
        return "lt1_support"
    if getattr(physio_gap, "primary_limiter", None) == "lt1" and physio_gap.lt2_gap_kmh is not None and physio_gap.lt2_gap_kmh > 0.25:
        return "lt2_ceiling"
    return None


def _dynamic_decision_confidence(
    *,
    physio_ctx: Any,
    physio_gap: Any,
    recent_session_count: int,
    robustness: str,
    raw_curve_points: list[dict[str, Any]],
    distance_category: Optional[str],
    durability_state: dict[str, Any],
    peak_lactate_proxy: Optional[float],
) -> dict[str, Any]:
    lt1_conf = physio_ctx.lt1_confidence or 0.0
    lt2_conf = physio_ctx.lt2_confidence or 0.0

    if physio_ctx.test_age_days is None:
        age_adjustment = -0.03
    elif physio_ctx.test_age_days <= 10:
        age_adjustment = 0.05
    elif physio_ctx.test_age_days <= 28:
        age_adjustment = 0.0
    elif physio_ctx.test_age_days <= 42:
        age_adjustment = -0.08
    else:
        age_adjustment = -0.18

    session_adjustment = -0.05 if recent_session_count <= 1 else 0.0 if recent_session_count <= 4 else 0.03
    robustness_adjustment = {"low": -0.05, "medium": 0.0, "high": 0.03}.get(robustness, 0.0)
    fallback_penalty = -0.08 if raw_curve_points and (lt1_conf <= 0.61 or lt2_conf <= 0.61) else 0.0

    contradictory_signals: list[str] = []
    contradiction_penalty = 0.0
    if peak_lactate_proxy is not None and peak_lactate_proxy >= 12.0 and getattr(physio_gap, "recommended_block", None) in {"threshold_development_block", "competition_specific_block"}:
        contradictory_signals.append("Pico glucolítico alto frente a una recomendación centrada en LT2/especificidad.")
        contradiction_penalty += 0.08
    if peak_lactate_proxy is not None and peak_lactate_proxy <= 8.0 and getattr(physio_gap, "recommended_block", None) == "aerobic_capacity_block":
        contradictory_signals.append("Perfil muy diésel con una recomendación todavía muy conservadora por arriba.")
        contradiction_penalty += 0.05
    if durability_state.get("durability_flag") == "possible_low_durability" and getattr(physio_gap, "recommended_block", None) in {"competition_specific_block", "aerobic_power_block"}:
        contradictory_signals.append("La durabilidad observada es dudosa para un bloque tan agudo o específico.")
        contradiction_penalty += 0.07

    lt1_dynamic = round(max(0.35, min(0.95, lt1_conf + age_adjustment + session_adjustment + robustness_adjustment + fallback_penalty)), 2)
    lt2_dynamic = round(max(0.35, min(0.95, lt2_conf + age_adjustment + session_adjustment + robustness_adjustment + fallback_penalty)), 2)
    glycolytic_confidence = 0.7 if peak_lactate_proxy is not None else 0.4
    if physio_ctx.test_age_days and physio_ctx.test_age_days > 42:
        glycolytic_confidence -= 0.1
    if contradictory_signals:
        glycolytic_confidence -= 0.08
    glycolytic_confidence = round(max(0.4, min(0.85, glycolytic_confidence)), 2)

    durability_weight = 0.2 if distance_category in {"hm", "marathon", "road_tt_medium", "road_tt_long", "granfondo", "70.3", "half_tri", "half_run", "half_bike", "ironman", "ironman_run", "ironman_bike", "open_water_long"} else 0.1
    overall = (
        0.35 * lt1_dynamic
        + 0.35 * lt2_dynamic
        + 0.10 * glycolytic_confidence
        + durability_weight * durability_state.get("durability_confidence", 0.2)
    ) - contradiction_penalty
    overall = round(max(0.25, min(0.95, overall)), 2)

    if overall >= 0.78:
        band = "high"
    elif overall >= 0.62:
        band = "medium"
    elif overall >= 0.45:
        band = "low"
    else:
        band = "very_low"

    return {
        "lt1_confidence_dynamic": lt1_dynamic,
        "lt2_confidence_dynamic": lt2_dynamic,
        "glycolytic_confidence": glycolytic_confidence,
        "overall_decision_confidence": overall,
        "confidence_band": band,
        "decision_uncertainty": "needs_confirmation" if band in {"low", "very_low"} else "managed" if contradictory_signals else "low",
        "needs_confirmation": band in {"low", "very_low"} or bool(contradictory_signals),
        "contradictory_signals": contradictory_signals,
        "confidence_factors": [
            {"label": "lt1_dynamic", "score": lt1_dynamic, "weight": 0.35, "explanation": "Confianza dinámica de LT1 tras edad del test, robustez y coherencia."},
            {"label": "lt2_dynamic", "score": lt2_dynamic, "weight": 0.35, "explanation": "Confianza dinámica de LT2 tras edad del test, robustez y coherencia."},
            {"label": "glycolytic_confidence", "score": glycolytic_confidence, "weight": 0.10, "explanation": "Confianza del pico de lactato como orientador glucolítico."},
            {"label": "durability_confidence", "score": durability_state.get("durability_confidence", 0.2), "weight": durability_weight, "explanation": "La durabilidad solo pesa si hay evidencia suficiente en sesiones de campo."},
        ],
    }


def _generate_lactate_check_recommendations(
    *,
    recommended_block: str,
    discipline: str,
    distance_category: Optional[str],
    confidence_band: str,
    needs_confirmation: bool,
    durability_state: dict[str, Any],
) -> list[dict[str, Any]]:
    recommendations: list[dict[str, Any]] = []

    def add(session_type: str, purpose: str, timing: str, conditions: list[str], points: list[str], priority: str, why_now: str) -> None:
        recommendations.append(
            {
                "session_type": session_type,
                "purpose": purpose,
                "suggested_timing_within_block": timing,
                "minimum_conditions": conditions,
                "optional_lactate_points": points,
                "coach_editable": True,
                "priority": priority,
                "why_now": why_now,
            }
        )

    if recommended_block == "aerobic_capacity_block":
        add(
            "steady_subthreshold_check",
            "Confirmar LT1/coste estable",
            "semana 2-3",
            ["atleta fresco", "ritmo/potencia estables", "condiciones térmicas razonables"],
            ["último bloque subumbral estable", "opcional: una muestra al inicio y otra al final"],
            "high" if needs_confirmation else "medium",
            "Sirve para verificar que la base subumbral acompaña la dirección del bloque.",
        )
        if distance_category in {"hm", "marathon", "road_tt_medium", "road_tt_long", "granfondo", "70.3", "half_run", "half_bike", "ironman", "ironman_run", "ironman_bike", "open_water_long"}:
            add(
                "long_session_stability_check",
                "Observar estabilidad/durabilidad en fatiga controlada",
                "semana 3-4",
                ["sesión larga estructurada", "sin calor extremo", "nutrición anotada"],
                ["bloque controlado de la segunda mitad", "opcional: muestra final"],
                "medium",
                "Ayuda a distinguir base insuficiente de simple falta de techo.",
            )
    elif recommended_block == "threshold_development_block":
        add(
            "long_interval_lt2_check",
            "Confirmar desplazamiento de LT2 práctico y acumulación tolerable",
            "semana 2-3",
            ["intervalos largos comparables", "recuperaciones cerradas", "sin fatiga residual extrema"],
            ["penúltimo y último intervalo largo"],
            "high" if needs_confirmation else "medium",
            "El umbral es la palanca principal y conviene comprobar que la carga elegida tiene sentido.",
        )
        add(
            "subthreshold_bridge_check",
            "Ver si LT1 acompaña el bloque sin degradarse",
            "semana 3-4",
            ["bloque subumbral estable", "ritmo/potencia repetibles"],
            ["último bloque del trabajo continuo"],
            "medium",
            "Evita mejorar LT2 a costa de perder control por abajo.",
        )
    elif recommended_block == "aerobic_power_block":
        add(
            "high_aerobic_repeatability_check",
            "Comprobar transferencia al techo aeróbico sin descontrol metabólico",
            "semana 2",
            ["sesión tipo 3'-5' o 30/30", "atleta fresco", "volumen moderado"],
            ["última repetición larga o último bloque corto"],
            "medium",
            "Este bloque es más agudo y conviene confirmar que el perfil lo absorbe.",
        )
    elif recommended_block == "competition_specific_block" and (needs_confirmation or confidence_band != "high"):
        add(
            "specific_compatibility_check",
            "Verificar compatibilidad real con la intensidad objetivo",
            "inicio del bloque",
            ["sesión específica controlada", "descanso suficiente", "objetivo claro"],
            ["bloque específico principal", "opcional: muestra final"],
            "medium",
            "La especificidad solo tiene sentido si el perfil fisiológico ya es defendible.",
        )

    if durability_state.get("durability_flag") == "possible_low_durability" and len(recommendations) < 2:
        add(
            "durability_control_segment",
            "Confirmar si la degradación observada es real o coyuntural",
            "semana 3",
            ["sesión larga comparable", "nutrición registrada", "sin calor extremo"],
            ["bloque estable tardío"],
            "medium",
            "La durabilidad aparece dudosa y conviene validarla antes de sacar conclusiones fuertes.",
        )

    max_checks = 1 if confidence_band == "high" and not needs_confirmation else 2
    return recommendations[:max_checks]


def _apply_durability_guardrail(
    *,
    recommended_type: str,
    distance_category: Optional[str],
    durability_state: dict[str, Any],
    physio_gap: Any,
) -> tuple[str, list[str], list[str]]:
    reasons: list[str] = []
    flags: list[str] = []
    long_sensitive = {"hm", "marathon", "road_tt_medium", "road_tt_long", "granfondo", "70.3", "half_tri", "half_run", "half_bike", "ironman", "ironman_run", "ironman_bike", "open_water_long"}
    if distance_category not in long_sensitive:
        return recommended_type, reasons, flags

    if durability_state.get("durability_flag") != "possible_low_durability" or durability_state.get("durability_confidence", 0) < 0.55:
        return recommended_type, reasons, flags

    if recommended_type == "competition_specific_block":
        adjusted = "threshold_development_block" if getattr(physio_gap, "primary_limiter", None) == "lt2" else "aerobic_capacity_block"
        reasons.append("La durabilidad observada no es suficientemente sólida para gastar ya un bloque totalmente específico.")
        flags.append("La durabilidad de campo sugiere prudencia: se retrasa la especificidad hasta confirmar estabilidad.")
        return adjusted, reasons, flags
    if recommended_type == "aerobic_power_block":
        reasons.append("La durabilidad observada hace prudente bajar un escalón desde potencia aeróbica.")
        flags.append("La durabilidad sugiere evitar un bloque demasiado agudo por ahora.")
        return "threshold_development_block", reasons, flags
    return recommended_type, reasons, flags


def _estimate_level(recent_sessions: int) -> tuple[str, int, int]:
    if recent_sessions <= 4:
        return "1+1", 1, 1
    if recent_sessions <= 8:
        return "2+1", 2, 1
    return "3+1", 3, 1


def _serialize_workout_template(template) -> dict[str, Any]:
    return {
        "template_id": template.template_id,
        "discipline": template.discipline,
        "compatible_block_types": list(template.compatible_block_types),
        "session_role": template.session_role,
        "session_family": template.session_family,
        "public_label": template.public_label,
        "summary": template.summary,
        "objective": template.objective,
        "dose_guidance": template.dose_guidance,
        "progression_axes": list(template.progression_axes),
        "control_points": list(template.control_points),
        "expected_adaptations": list(template.expected_adaptations),
        "cautions": list(template.cautions),
        "confidence": template.confidence,
        "evidence": [
            {
                "source_id": source.source_id,
                "citation": source.citation,
                "source_type": source.source_type,
                "athlete_level": source.athlete_level,
                "url": source.url,
                "key_takeaway": source.key_takeaway,
            }
            for source in evidence_for_ids(template.evidence_ids)
        ],
        "variants": [
            {
                "label": variant.label,
                "format_type": variant.format_type,
                "dose_example": variant.dose_example,
                "use_case": variant.use_case,
            }
            for variant in variants_for_template(template)
        ],
        "builder_variables": [
            {
                "name": variable.name,
                "options": list(variable.options),
            }
            for variable in builder_variables_for_template(template)
        ],
        "csv_examples": list(template.csv_examples),
        "fatigue_cost": template.fatigue_cost,
        "calentamiento_min": template.calentamiento_min,
        "calentamiento_template": template.calentamiento_template,
        "enfriamiento_min": template.enfriamiento_min,
        "enfriamiento_template": template.enfriamiento_template,
        "coach_tips": list(template.coach_tips),
        "dose_ladder": [
            {
                "step": step.step,
                "label": step.label,
                "total_useful_time_min": step.total_useful_time_min,
                "rest_min": step.rest_min,
                "intensity_zone": step.intensity_zone,
                "readiness_required": step.readiness_required,
                "notes": step.notes,
                "total_duration_min": step.total_duration_min,
            }
            for step in template.dose_ladder
        ],
    }


def workout_library_payload(discipline: str) -> list[dict[str, Any]]:
    return [_serialize_workout_template(template) for template in templates_for_discipline_library(discipline)]


def _next_target_summary(athlete: Athlete, discipline: str) -> Optional[dict[str, Any]]:
    today = date.today()
    targets = _discipline_targets(athlete, discipline)
    next_target = next((target for target in targets if target.target_date >= today), None) or (targets[0] if targets else None)
    if next_target is None:
        return None
    if next_target.discipline == "triatlón":
        if discipline == "ciclismo":
            target_metric = f"{round(next_target.target_cycling_power_watts)} W" if next_target.target_cycling_power_watts else None
        elif discipline == "natación":
            target_metric = next_target.target_swim_pace_label
        else:
            target_metric = next_target.target_running_pace_label
    elif next_target.discipline == "ciclismo":
        target_metric = f"{round(next_target.target_power_watts)} W" if next_target.target_power_watts else None
    else:
        target_metric = next_target.target_pace_label
    return {
        "objective": next_target.objective,
        "discipline": next_target.discipline,
        "target_date": next_target.target_date,
        "distance_label": next_target.distance_label,
        "priority_level": next_target.priority_level,
        "target_metric": target_metric,
    }


def _reference_estimate_label(analysis: dict[str, Any], discipline: str) -> Optional[str]:
    view = (analysis.get("discipline_views") or {}).get(discipline) or {}
    estimates = view.get("estimates") or []
    if discipline == "ciclismo":
        preferred = next((estimate for estimate in estimates if estimate.get("estimate_type") == "FTP"), None)
    elif discipline == "natación":
        preferred = next((estimate for estimate in estimates if estimate.get("estimate_type") == "VO2max"), None)
    else:
        preferred = next((estimate for estimate in estimates if estimate.get("estimate_type") in {"HM", "10K", "Maratón"}), None)
    if preferred:
        return preferred.get("estimate_type")
    return estimates[0].get("estimate_type") if estimates else None


def _serialize_template(template) -> dict[str, Any]:
    return {
        "template_id": template.template_id,
        "discipline": template.discipline,
        "block_type": template.block_type,
        "public_label": template.public_label,
        "summary": template.summary,
        "primary_focus": template.primary_focus,
        "secondary_focus": template.secondary_focus,
        "typical_structure": template.typical_structure,
        "typical_duration_weeks_min": template.typical_duration_weeks[0],
        "typical_duration_weeks_max": template.typical_duration_weeks[1],
        "key_session_families": template.key_session_families,
        "control_points": template.control_points,
        "progression_rules": template.progression_rules,
        "entry_checks": template.entry_checks,
        "exit_checks": template.exit_checks,
        "csv_rationale": template.csv_rationale,
        "evidence_rationale": template.evidence_rationale,
    }


def _serialize_foundation(foundation) -> dict[str, Any]:
    return {
        "foundation_id": foundation.foundation_id,
        "title": foundation.title,
        "summary": foundation.summary,
        "anchor": foundation.anchor,
    }


@dataclass
class BlockResponseRecord:
    """Resultado medido de un bloque completado, comparando snapshots pre/post.

    Esto permite al scoring aprender de la respuesta real del atleta,
    no solo de reglas heurísticas estáticas.

    Referencias:
      - Olbrecht (2000): diagnóstico-intervención-evaluación iterativo
      - Mujika & Padilla (2003): cuantificación de respuesta al entrenamiento
      - Kiviniemi et al. (2007): individualización basada en respuesta HR/rendimiento
    """

    block_type: str
    lt1_delta_pct: float | None  # +5% = mejoró 5%. Pace: negativo=mejora. Power: positivo=mejora. Normalizado.
    lt2_delta_pct: float | None
    confidence: float  # confianza del snapshot post-bloque
    weeks_ago: int  # semanas desde que terminó el bloque


@dataclass
class BlockCandidate:
    """Un candidato de bloque con su puntuación y razones auditables."""

    block_type: str
    score: float
    reasons: list[str] = field(default_factory=list)
    contraindications: list[str] = field(default_factory=list)


def _prioritize_physiological_candidate(
    scored_candidates: list[BlockCandidate],
    *,
    physiological_block: Optional[str],
    reasons: list[str],
    contraindications: list[str],
) -> list[BlockCandidate]:
    if not physiological_block or physiological_block == "testing_decision_block":
        return scored_candidates

    cloned = {
        candidate.block_type: BlockCandidate(
            block_type=candidate.block_type,
            score=candidate.score,
            reasons=list(candidate.reasons),
            contraindications=list(candidate.contraindications),
        )
        for candidate in scored_candidates
    }
    physiological_candidate = cloned.get(physiological_block) or BlockCandidate(block_type=physiological_block, score=0.0)
    top_score = max((candidate.score for candidate in cloned.values()), default=0.0)
    if physiological_candidate.score < top_score:
        physiological_candidate.score = top_score
    physiological_candidate.reasons = list(
        dict.fromkeys(
            [
                "Prioridad fisiológica explícita: con señal suficiente, el test manda sobre el scoring contextual.",
            ]
            + reasons
            + physiological_candidate.reasons
        )
    )
    physiological_candidate.contraindications = list(dict.fromkeys(contraindications + physiological_candidate.contraindications))
    cloned[physiological_block] = physiological_candidate

    return sorted(
        cloned.values(),
        key=lambda candidate: (0 if candidate.block_type == physiological_block else 1, -candidate.score),
    )


def _eval_signal(direction: Optional[str]) -> str:
    """Normaliza la dirección de evaluación a señal interna del motor."""
    if direction in {"up", "positive", "improving"}:
        return "improving"
    if direction in {"down", "negative", "degrading"}:
        return "degrading"
    if direction in {"stable", "neutral"}:
        return "stable"
    return "none"


def _is_initial_assignment(
    *,
    current_block: Any,
    previous_major: Optional[str],
    recent_session_count: int,
) -> bool:
    if current_block is not None:
        return False
    if previous_major not in {None, "testing_decision_block", "recovery_consolidation_block"}:
        return False
    return recent_session_count <= 2


def _score_initial_assignment_candidates(
    *,
    days_to_target: Optional[int],
    discipline: str,
    distance_category: Optional[str],
    physiological_block: Optional[str],
    primary_limiter: Optional[str],
    data_quality: str,
) -> list[BlockCandidate]:
    """Scoring inicial para atletas sin bloque previo.

    Aquí el motor parte de prueba + test fisiológico, no del historial.
    """

    def _candidate(block_type: str) -> BlockCandidate:
        return BlockCandidate(block_type=block_type, score=0.0)

    candidates: dict[str, BlockCandidate] = {
        bt: _candidate(bt)
        for bt in (
            "aerobic_capacity_block",
            "threshold_development_block",
            "anaerobic_capacity_block",
            "aerobic_power_block",
            "anaerobic_power_block",
            "competition_specific_block",
            "recovery_consolidation_block",
            "technical_rebuild_block",
        )
    }

    def add(block_type: str, pts: float, reason: str) -> None:
        c = candidates[block_type]
        c.score += pts
        c.reasons.append(f"+{pts:.0f} {reason}")

    def sub(block_type: str, pts: float, reason: str) -> None:
        c = candidates[block_type]
        c.score -= pts
        c.contraindications.append(f"-{pts:.0f} {reason}")

    # ANC y ANP: penalizar por defecto en asignación inicial (motor fisiológico los activa si procede)
    sub("anaerobic_capacity_block", 10, "Asignación inicial: ANC solo si el motor fisiológico detecta perfil diesel + prueba corta.")
    sub("anaerobic_power_block", 30, "Asignación inicial: ANP solo en pre-comp con base consolidada.")

    long_duration_events = {"marathon", "70.3", "half_tri", "half_run", "half_bike", "ironman", "ironman_run", "ironman_bike", "open_water_long"}
    short_intense_events = {"5k", "10k", "road_tt", "sprint_tri", "sprint_run", "sprint_bike", "olympic_tri", "olympic_run", "olympic_bike", "pool_400"}

    sub("recovery_consolidation_block", 20, "Atleta nuevo sin bloque previo: no toca consolidar fatiga que aún no existe.")

    if discipline == "natación":
        add("technical_rebuild_block", 12, "En natación el coste técnico puede justificar un bloque inicial más técnico.")
    else:
        sub("technical_rebuild_block", 5, "Sin señal técnica explícita, no debe ganar por defecto.")

    if distance_category in long_duration_events:
        add("aerobic_capacity_block", 15, "La prueba penaliza más una base insuficiente que un LT2 corto.")
        sub("aerobic_power_block", 10, "La potencia aeróbica no es la primera palanca en una prueba larga.")
    if distance_category in short_intense_events:
        add("threshold_development_block", 10, "La prueba depende más de LT2 que de pura durabilidad.")

    if days_to_target is not None and days_to_target <= 35:
        add("competition_specific_block", 20, "Objetivo cercano: incluso en asignación inicial hay que transferir rápido.")
    elif days_to_target is not None and days_to_target > 84:
        sub("competition_specific_block", 15, "Objetivo lejano: todavía no toca gastar especificidad.")

    if primary_limiter == "lt1":
        add("aerobic_capacity_block", 18, "El limitante principal detectado es LT1 / soporte subumbral.")
        sub("aerobic_power_block", 10, "Abrir techo sin soporte suficiente tiene poco retorno marginal.")
    elif primary_limiter == "lt2":
        add("threshold_development_block", 18, "El limitante principal detectado es LT2.")

    if physiological_block and physiological_block in candidates:
        add(physiological_block, 35, "El test incremental y la demanda de prueba apuntan a este bloque inicial.")

    if data_quality == "good" and physiological_block and physiological_block in candidates:
        add(physiological_block, 10, "La señal fisiológica es suficientemente sólida para mandar en la asignación inicial.")
    elif data_quality == "low":
        sub("aerobic_power_block", 8, "Con señal fisiológica floja no conviene abrir con un bloque agresivo.")
        sub("competition_specific_block", 8, "Con señal fisiológica floja no conviene gastar especificidad demasiado pronto.")

    return sorted(candidates.values(), key=lambda c: c.score, reverse=True)


# ── Response Factor — aprender de la respuesta real del atleta ────────────────
# Progresiones naturales: después de un bloque exitoso, el siguiente debería
# avanzar en especificidad. Olbrecht: AEC→THR→AEP→COMP.
_NATURAL_PROGRESSION: dict[str, list[str]] = {
    "aerobic_capacity_block": ["threshold_development_block", "aerobic_power_block"],
    "threshold_development_block": ["aerobic_power_block", "competition_specific_block"],
    "aerobic_power_block": ["competition_specific_block", "anaerobic_power_block"],
    "anaerobic_capacity_block": ["aerobic_capacity_block", "threshold_development_block"],
    "anaerobic_power_block": ["competition_specific_block"],
}

# Bloques protectores: cuando hay regresión, volver a base.
_PROTECTIVE_BLOCKS = {"aerobic_capacity_block", "recovery_consolidation_block"}


def _compute_block_response_history(
    db: "Session",
    athlete_id: int,
    discipline: str,
) -> list[BlockResponseRecord]:
    """Consulta los bloques completados recientes y calcula deltas LT1/LT2.

    Para cada focus block completado, busca el snapshot más cercano ANTES
    del bloque (pre) y el más cercano DESPUÉS (post). Calcula el cambio
    porcentual en LT2 pace/power y LT1, ponderado por la confianza del
    snapshot post-bloque.

    Solo mira los últimos 365 días y máximo 6 bloques.
    """
    from datetime import timedelta

    cutoff = date.today() - timedelta(days=365)
    blocks = db.scalars(
        select(AthleteFocusBlock)
        .where(
            AthleteFocusBlock.athlete_id == athlete_id,
            AthleteFocusBlock.status == "completed",
            AthleteFocusBlock.start_date >= cutoff,
        )
        .order_by(AthleteFocusBlock.start_date)
    ).all()

    if not blocks:
        return []

    # Get all snapshots for this athlete+discipline in the window
    snapshots = db.scalars(
        select(PhysiologicalSnapshot)
        .where(
            PhysiologicalSnapshot.athlete_id == athlete_id,
            PhysiologicalSnapshot.discipline == discipline,
            PhysiologicalSnapshot.snapshot_date >= cutoff - timedelta(days=30),
            PhysiologicalSnapshot.confidence > 0.0,
        )
        .order_by(PhysiologicalSnapshot.snapshot_date)
    ).all()

    if not snapshots:
        return []

    records: list[BlockResponseRecord] = []
    today = date.today()

    for block in blocks[-6:]:  # últimos 6 bloques
        block_start = block.start_date
        block_end = block.end_date or (block_start + timedelta(weeks=4))
        block_type = block.energy_system_focus

        # Find pre-block snapshot (closest before block_start, max 30 days before)
        pre_snap = None
        for snap in reversed(snapshots):
            if snap.snapshot_date <= block_start and (block_start - snap.snapshot_date).days <= 30:
                pre_snap = snap
                break

        # Find post-block snapshot (closest after block_end, max 21 days after)
        post_snap = None
        for snap in snapshots:
            if snap.snapshot_date >= block_end and (snap.snapshot_date - block_end).days <= 21:
                post_snap = snap
                break

        if not pre_snap or not post_snap:
            continue

        # Calculate deltas — normalize direction: positive = improvement
        lt2_delta = _snapshot_delta(pre_snap, post_snap, "lt2", discipline)
        lt1_delta = _snapshot_delta(pre_snap, post_snap, "lt1", discipline)
        weeks_ago = max(0, (today - block_end).days // 7)

        records.append(BlockResponseRecord(
            block_type=block_type,
            lt1_delta_pct=lt1_delta,
            lt2_delta_pct=lt2_delta,
            confidence=post_snap.confidence,
            weeks_ago=weeks_ago,
        ))

    return records


def _snapshot_delta(
    pre: "PhysiologicalSnapshot",
    post: "PhysiologicalSnapshot",
    threshold: str,  # "lt1" or "lt2"
    discipline: str,
) -> float | None:
    """Calcula el cambio porcentual en un umbral entre dos snapshots.

    Normaliza la dirección: positivo = mejora.
    - Pace (s/km): bajar es mejor → delta = (pre - post) / pre
    - Power (W): subir es mejor → delta = (post - pre) / pre
    """
    pace_attr = f"{threshold}_pace_seconds_per_km"
    power_attr = f"{threshold}_power_watts"

    pre_pace = getattr(pre, pace_attr, None)
    post_pace = getattr(post, pace_attr, None)
    pre_power = getattr(pre, power_attr, None)
    post_power = getattr(post, power_attr, None)

    if discipline in ("running", "natación") and pre_pace and post_pace and pre_pace > 0:
        return round((pre_pace - post_pace) / pre_pace * 100, 2)
    elif discipline == "ciclismo" and pre_power and post_power and pre_power > 0:
        return round((post_power - pre_power) / pre_power * 100, 2)
    elif pre_pace and post_pace and pre_pace > 0:
        return round((pre_pace - post_pace) / pre_pace * 100, 2)
    elif pre_power and post_power and pre_power > 0:
        return round((post_power - pre_power) / pre_power * 100, 2)
    return None


def _apply_response_factor(
    candidates: dict[str, "BlockCandidate"],
    response_history: list[BlockResponseRecord],
    add_fn,
    sub_fn,
) -> None:
    """Aplica los 3 factores de respuesta histórica al scoring.

    1. response_bonus: si el último bloque respondió bien, bonus al siguiente
       en la progresión natural (AEC→THR, THR→AEP, etc.)
    2. stagnation_penalty: si 2+ bloques del mismo tipo sin mejora, penalizar repetir
    3. regression_urgency: si un umbral empeoró, priorizar bloque protector (AEC)
    """
    if not response_history:
        return

    latest = response_history[-1]
    _IMPROVEMENT_THRESHOLD = 2.0   # >2% mejora = respuesta positiva
    _NOISE_THRESHOLD = 1.0         # <1% cambio = ruido/sin cambio
    _REGRESSION_THRESHOLD = -2.0   # <-2% = empeoramiento real

    # ── 1. Response bonus ──────────────────────────────────────────────────
    # Si el último bloque tuvo respuesta positiva medible, bonus al siguiente
    # en la progresión natural. Ponderado por confianza del snapshot.
    latest_improvement = max(
        latest.lt1_delta_pct or 0,
        latest.lt2_delta_pct or 0,
    )
    if latest_improvement >= _IMPROVEMENT_THRESHOLD and latest.confidence >= 0.55:
        next_blocks = _NATURAL_PROGRESSION.get(latest.block_type, [])
        weight = min(1.0, latest.confidence)  # escalar por confianza
        for next_bt in next_blocks:
            if next_bt in candidates:
                pts = round(15 * weight)
                add_fn(next_bt, pts,
                    f"Respuesta positiva al {latest.block_type.replace('_block','').replace('_',' ')} "
                    f"(+{latest_improvement:.1f}%, conf {latest.confidence:.0%}): "
                    f"avanzar en especificidad (Olbrecht).")

    # ── 2. Stagnation penalty ──────────────────────────────────────────────
    # Si 2+ bloques del mismo tipo sin mejora medible, penalizar repetirlo.
    # Olbrecht: "si la adaptación no llega, variar el estímulo."
    by_type: dict[str, list[BlockResponseRecord]] = {}
    for record in response_history:
        by_type.setdefault(record.block_type, []).append(record)

    for block_type, records in by_type.items():
        if len(records) < 2:
            continue
        # Últimos 2 bloques del mismo tipo
        last_two = records[-2:]
        both_stagnant = all(
            (r.lt2_delta_pct is not None and abs(r.lt2_delta_pct) < _NOISE_THRESHOLD)
            or (r.lt2_delta_pct is None and r.lt1_delta_pct is not None and abs(r.lt1_delta_pct) < _NOISE_THRESHOLD)
            for r in last_two
        )
        if both_stagnant and block_type in candidates:
            sub_fn(block_type, 20,
                f"Estancamiento: 2 bloques de {block_type.replace('_block','').replace('_',' ')} "
                f"sin mejora medible (LT2 Δ < {_NOISE_THRESHOLD}%). "
                f"Variar estímulo (Olbrecht: cambiar eje AEC↔ANC).")
            # Bonus a bloques alternativos que no se han probado
            for alt_bt in candidates:
                if alt_bt != block_type and alt_bt not in by_type and alt_bt not in _PROTECTIVE_BLOCKS:
                    add_fn(alt_bt, 8,
                        f"Estímulo no probado: alternativa al estancamiento en "
                        f"{block_type.replace('_block','').replace('_',' ')}.")

    # ── 3. Regression urgency ──────────────────────────────────────────────
    # Si el último bloque empeoró un umbral, priorizar bloque protector.
    # Especialmente si LT2 bajó: la base aeróbica está comprometida.
    lt2_regressed = (latest.lt2_delta_pct is not None and latest.lt2_delta_pct <= _REGRESSION_THRESHOLD)
    lt1_regressed = (latest.lt1_delta_pct is not None and latest.lt1_delta_pct <= _REGRESSION_THRESHOLD)

    if lt2_regressed and latest.confidence >= 0.50:
        for protective_bt in _PROTECTIVE_BLOCKS:
            if protective_bt in candidates:
                add_fn(protective_bt, 20,
                    f"LT2 empeoró ({latest.lt2_delta_pct:+.1f}%) tras "
                    f"{latest.block_type.replace('_block','').replace('_',' ')}. "
                    f"Proteger base aeróbica antes de subir especificidad "
                    f"(Mujika 2003: pérdida de adaptaciones centrales).")
        # Penalizar repetir el bloque que causó la regresión
        if latest.block_type in candidates:
            sub_fn(latest.block_type, 15,
                f"Bloque anterior ({latest.block_type.replace('_block','').replace('_',' ')}) "
                f"produjo regresión en LT2: no repetir sin consolidar.")

    if lt1_regressed and not lt2_regressed and latest.confidence >= 0.50:
        if "aerobic_capacity_block" in candidates:
            add_fn("aerobic_capacity_block", 12,
                f"LT1 empeoró ({latest.lt1_delta_pct:+.1f}%) sin afectar LT2: "
                f"reforzar capacidad aeróbica de base.")


def _score_block_candidates(
    *,
    days_to_target: Optional[int],
    previous_major: Optional[str],
    evaluation_signal: str,
    robustness: str,
    recent_session_count: int,
    discipline: str,
    response_history: list[BlockResponseRecord] | None = None,
) -> list[BlockCandidate]:
    """Puntúa cada tipo de bloque candidato con reglas explícitas y auditables.

    Cada regla que suma o resta puntos deja una razón o contraindicación textual.
    No hay puntos base por defecto: solo se puntúa evidencia contextual real.
    El ganador es el bloque con mayor puntuación — el entrenador puede auditar
    todos los candidatos y sus razones.

    Desde auditoría 1.2: integra response_history (deltas LT1/LT2 reales de
    bloques completados) para modular el scoring con evidencia n=1 del atleta.
    """

    def _candidate(block_type: str) -> BlockCandidate:
        return BlockCandidate(block_type=block_type, score=0.0)

    candidates: dict[str, BlockCandidate] = {
        bt: _candidate(bt)
        for bt in (
            "aerobic_capacity_block",
            "threshold_development_block",
            "anaerobic_capacity_block",    # ANC — Olbrecht
            "aerobic_power_block",
            "anaerobic_power_block",        # ANP — Olbrecht
            "competition_specific_block",
            "recovery_consolidation_block",
            "technical_rebuild_block",
        )
    }

    def add(block_type: str, pts: float, reason: str) -> None:
        c = candidates[block_type]
        c.score += pts
        c.reasons.append(f"+{pts:.0f} {reason}")

    def sub(block_type: str, pts: float, reason: str) -> None:
        c = candidates[block_type]
        c.score -= pts
        c.contraindications.append(f"-{pts:.0f} {reason}")

    # ── aerobic_capacity_block ────────────────────────────────────────────────
    if previous_major in {None, "testing_decision_block", "recovery_consolidation_block"}:
        add("aerobic_capacity_block", 15, "Sin bloque previo claro o tras test/recovery: construir base es el paso lógico.")
    if previous_major == "aerobic_capacity_block" and evaluation_signal == "degrading":
        add("aerobic_capacity_block", 10, "El bloque de capacidad no respondió bien: repetir y consolidar antes de subir.")
    if previous_major in {"aerobic_power_block", "competition_specific_block"}:
        sub("aerobic_capacity_block", 10, "Regresión desde bloque más específico; solo si hay motivo claro.")
    if days_to_target is None or days_to_target > 112:
        add("aerobic_capacity_block", 15, "Horizonte largo o sin objetivo: la base es la inversión más segura.")
    elif days_to_target <= 35:
        sub("aerobic_capacity_block", 30, "Objetivo demasiado cercano para un bloque extensivo de capacidad.")
    elif 63 < days_to_target <= 112:
        add("aerobic_capacity_block", 5, "Horizonte build: aún hay margen para construir base.")
    if robustness == "low":
        add("aerobic_capacity_block", 10, "Robustez baja: empezar conservador reduce riesgo de sobreestimación.")
    if evaluation_signal == "degrading":
        add("aerobic_capacity_block", 8, "Señal degradante: volver a base aeróbica antes de subir especificidad.")
    if recent_session_count == 0:
        add("aerobic_capacity_block", 10, "Sin sesiones recientes: la base es el punto de partida obligado.")

    # ── threshold_development_block ───────────────────────────────────────────
    if previous_major == "aerobic_capacity_block" and evaluation_signal in {"improving", "stable"}:
        add("threshold_development_block", 25, "Base aeróbica consolidada con señal positiva: paso lógico hacia el umbral.")
    if previous_major == "aerobic_capacity_block" and evaluation_signal == "degrading":
        sub("threshold_development_block", 10, "La base no respondió bien; mejor consolidar antes de subir especificidad.")
    if previous_major == "threshold_development_block" and evaluation_signal == "improving":
        add("threshold_development_block", 5, "Puede repetirse si la señal sigue siendo positiva.")
    if previous_major == "threshold_development_block" and evaluation_signal == "degrading":
        sub("threshold_development_block", 15, "Bloque de umbral previo con señal negativa: no forzar más sin consolidar.")
    if days_to_target is not None and 63 <= days_to_target <= 112:
        add("threshold_development_block", 15, "Horizonte build: momento ideal para traducir base en rendimiento de umbral.")
    if days_to_target is not None and days_to_target < 35:
        sub("threshold_development_block", 25, "Objetivo demasiado cercano; el umbral ya debería estar consolidado.")
    if days_to_target is not None and days_to_target > 112:
        sub("threshold_development_block", 5, "Horizonte muy largo; puede esperar a tener más base.")
    if robustness == "low":
        sub("threshold_development_block", 10, "Robustez baja: el trabajo de umbral requiere base mínima consolidada.")
    if robustness == "high":
        add("threshold_development_block", 5, "Robustez alta: el atleta puede absorber carga de umbral sin riesgo.")

    # ── aerobic_power_block ───────────────────────────────────────────────────
    if previous_major in {"threshold_development_block", "aerobic_capacity_block"} and evaluation_signal == "improving":
        add("aerobic_power_block", 20, "Bloque previo bien respondido: se puede abrir una fase más exigente.")
    if previous_major == "aerobic_power_block":
        sub("aerobic_power_block", 15, "No repetir dos bloques de potencia seguidos sin fase de consolidación.")
    if days_to_target is not None and 35 <= days_to_target <= 63:
        add("aerobic_power_block", 15, "Horizonte specific: buena ventana para un bloque corto de potencia antes del taper.")
    if days_to_target is None or days_to_target > 112:
        sub("aerobic_power_block", 20, "Demasiado pronto en el ciclo para fase de potencia aeróbica.")
    if days_to_target is not None and days_to_target < 21:
        sub("aerobic_power_block", 20, "Demasiado cerca del objetivo; priorizar taper o especificidad.")
    if robustness == "low":
        sub("aerobic_power_block", 15, "Robustez baja: el VO2/potencia requiere base consolidada para absorber la carga.")
    if robustness == "high":
        add("aerobic_power_block", 10, "Robustez alta: el atleta puede absorber la exigencia del bloque de potencia.")

    # ── competition_specific_block ────────────────────────────────────────────
    if days_to_target is not None and days_to_target <= 21:
        add("competition_specific_block", 50, "Objetivo en menos de 3 semanas: especificidad máxima y taper.")
    elif days_to_target is not None and days_to_target <= 35:
        add("competition_specific_block", 35, "Objetivo próximo: priorizar transferencia al gesto y ritmo competitivo.")
    elif days_to_target is not None and days_to_target <= 63:
        add("competition_specific_block", 10, "Objetivo en rango specific: se puede introducir trabajo de transferencia.")
    elif days_to_target is not None and days_to_target > 63:
        sub("competition_specific_block", 20, "Objetivo lejano: no gastar especificidad demasiado pronto.")
    if days_to_target is None:
        sub("competition_specific_block", 30, "Sin objetivo definido: la especificidad no tiene referencia temporal.")
    if robustness == "low":
        sub("competition_specific_block", 15, "Robustez baja: la especificidad sin base puede vaciar al atleta sin adaptación.")

    # ── recovery_consolidation_block ──────────────────────────────────────────
    if evaluation_signal == "degrading":
        add("recovery_consolidation_block", 40, "Señal claramente negativa: consolidar antes de apretar es la única opción segura.")
    if evaluation_signal == "stable" and previous_major not in {None, "recovery_consolidation_block"}:
        add("recovery_consolidation_block", 10, "Señal estable tras bloque exigente: breve descarga puede revelar adaptación.")
    if recent_session_count == 0:
        sub("recovery_consolidation_block", 20, "Sin carga reciente: no hay nada que consolidar ahora.")
    if robustness == "high" and evaluation_signal != "degrading":
        sub("recovery_consolidation_block", 5, "Atleta robusto con señal aceptable: no necesita descarga ahora.")

    # ── anaerobic_capacity_block (ANC) ────────────────────────────────────────
    # ANC = construir VLamax. Solo para perfiles diesel + pruebas cortas. Base tardía.
    # El motor fisiológico ya controla cuándo recomendarlo — aquí solo contexto histórico.
    if previous_major == "aerobic_capacity_block" and evaluation_signal in {"improving", "stable"}:
        add("anaerobic_capacity_block", 10, "Base aeróbica consolidada: buen momento para introducir ANC como spice.")
    if previous_major == "anaerobic_capacity_block":
        sub("anaerobic_capacity_block", 10, "No repetir ANC sin bloque de transición — riesgo de exceso glucolítico.")
    if days_to_target is not None and days_to_target > 84:
        add("anaerobic_capacity_block", 5, "Horizonte base: ventana adecuada para trabajo ANC.")
    if days_to_target is not None and days_to_target < 35:
        sub("anaerobic_capacity_block", 25, "Objetivo cercano: demasiado tarde para adaptaciones ANC (requieren meses).")
    if robustness == "low":
        sub("anaerobic_capacity_block", 15, "Robustez baja: 'thin ice' (Olbrecht) — ANC puede destruir la base débil.")
    if evaluation_signal == "degrading":
        sub("anaerobic_capacity_block", 15, "Señal degradante: priorizar AEC antes de añadir estímulo ANC.")

    # ── anaerobic_power_block (ANP) ───────────────────────────────────────────
    # ANP = tolerancia a la acidosis, pre-comp EXCLUSIVAMENTE. Pruebas cortas.
    # Olbrecht: "máximo 2 semanas consecutivas — más riesgo que beneficio."
    if days_to_target is not None and days_to_target <= 35:
        add("anaerobic_power_block", 30, "Objetivo próximo: ventana ideal para toughening anaeróbico pre-comp.")
    elif days_to_target is not None and days_to_target <= 56:
        add("anaerobic_power_block", 10, "Horizonte specific: puede iniciarse ANP si la base y AEC están consolidados.")
    if days_to_target is None or days_to_target > 84:
        sub("anaerobic_power_block", 35, "Demasiado pronto — ANP solo en competition training period (Olbrecht).")
    if previous_major in {"aerobic_power_block", "competition_specific_block"} and evaluation_signal == "improving":
        add("anaerobic_power_block", 15, "Bloque previo específico bien respondido: ANP como paso final antes de competición.")
    if previous_major == "anaerobic_power_block":
        sub("anaerobic_power_block", 25, "No repetir ANP seguido — necesita recuperación. Máx 2 semanas consecutivas.")
    if robustness == "low":
        sub("anaerobic_power_block", 20, "Robustez baja: ANP sin base destroza la capacidad aeróbica.")
    if evaluation_signal == "degrading":
        sub("anaerobic_power_block", 30, "Señal degradante: ANP está contraindicado completamente.")

    # ── technical_rebuild_block ───────────────────────────────────────────────
    if discipline == "natación":
        add("technical_rebuild_block", 15, "En natación la técnica condiciona directamente la utilidad de la carga fisiológica.")
    if previous_major == "aerobic_capacity_block" and robustness == "low":
        add("technical_rebuild_block", 10, "Base incipiente con poca robustez: reforzar técnica y economía antes de subir carga.")

    # ── Response factor — evidencia n=1 del atleta ─────────────────────────
    if response_history:
        _apply_response_factor(candidates, response_history, add, sub)

    return sorted(candidates.values(), key=lambda c: c.score, reverse=True)


# ── I2 — Detección de estancamiento crónico ──────────────────────────────────
_STAGNATION_MIN_TESTS = 3
_STAGNATION_MAX_IMPROVEMENT_PCT = 0.05  # <5% mejora = estancamiento
_STAGNATION_LOOKBACK_DAYS = 180  # últimos 6 meses


def _detect_stagnation(
    db: Session,
    athlete_id: int,
    discipline: str,
) -> tuple[bool, int, list[str]]:
    """Detecta estancamiento crónico en LT2.

    Busca ≥3 snapshots recientes y compara el LT2 (ritmo o potencia).
    Si la mejora total es <5% entre el primer y último test, se considera
    estancamiento.

    Returns:
        (stagnation_detected, test_count, warnings)
    """
    cutoff = date.today() - __import__("datetime").timedelta(days=_STAGNATION_LOOKBACK_DAYS)
    snapshots = db.scalars(
        select(PhysiologicalSnapshot)
        .where(
            PhysiologicalSnapshot.athlete_id == athlete_id,
            PhysiologicalSnapshot.discipline == discipline,
            PhysiologicalSnapshot.snapshot_date >= cutoff,
            PhysiologicalSnapshot.confidence > 0.0,
        )
        .order_by(PhysiologicalSnapshot.snapshot_date)
    ).all()

    if len(snapshots) < _STAGNATION_MIN_TESTS:
        return False, len(snapshots), []

    # Usar ritmo (s/km, menor = mejor) o potencia (W, mayor = mejor)
    lt2_values: list[float] = []
    metric_type = "pace"
    for snap in snapshots:
        if snap.lt2_pace_seconds_per_km is not None and snap.lt2_pace_seconds_per_km > 0:
            lt2_values.append(snap.lt2_pace_seconds_per_km)
        elif snap.lt2_power_watts is not None and snap.lt2_power_watts > 0:
            lt2_values.append(snap.lt2_power_watts)
            metric_type = "power"

    if len(lt2_values) < _STAGNATION_MIN_TESTS:
        return False, len(lt2_values), []

    first_val = lt2_values[0]
    last_val = lt2_values[-1]
    best_val = min(lt2_values) if metric_type == "pace" else max(lt2_values)

    if first_val == 0:
        return False, len(lt2_values), []

    if metric_type == "pace":
        # En ritmo: mejora = bajar segundos. Menor es mejor.
        improvement_pct = (first_val - best_val) / first_val
    else:
        # En potencia: mejora = subir watts. Mayor es mejor.
        improvement_pct = (best_val - first_val) / first_val

    warnings: list[str] = []
    if improvement_pct < _STAGNATION_MAX_IMPROVEMENT_PCT:
        warnings.append(
            f"Estancamiento crónico: {len(lt2_values)} tests en {_STAGNATION_LOOKBACK_DAYS} días "
            f"con mejora de solo {improvement_pct:.1%} en LT2. "
            f"Considerar cambio de estímulo (Olbrecht: variar el eje AEC↔ANC)."
        )
        return True, len(lt2_values), warnings

    return False, len(lt2_values), []


# ── I1 — Detección de inactividad prolongada ─────────────────────────────────
_INACTIVITY_THRESHOLD_DAYS = 14


def _detect_inactivity(
    sessions: list[AthleteSession],
) -> tuple[bool, Optional[int], list[str]]:
    """Detecta si el atleta lleva >14 días sin sesiones.

    Returns:
        (inactive, days_since_last, warnings)
    """
    if not sessions:
        return True, None, [
            "Sin sesiones registradas. Se recomienda semana de readaptación "
            "antes de iniciar un bloque de entrenamiento."
        ]

    today = date.today()
    latest = max(s.performed_at.date() for s in sessions)
    days_since = (today - latest).days

    if days_since > _INACTIVITY_THRESHOLD_DAYS:
        return True, days_since, [
            f"Inactividad prolongada: {days_since} días sin sesiones. "
            f"Se recomienda una semana de readaptación progresiva antes "
            f"de retomar la carga normal. No prescribir build_peak ni "
            f"sesiones de fatigue_cost ≥ 4 en las primeras 2 semanas."
        ]

    return False, days_since, []


def recommend_next_mesocycle(db: Session, athlete_id: int, discipline: Optional[str] = None) -> dict[str, Any]:
    athlete = db.scalar(
        select(Athlete)
        .options(
            joinedload(Athlete.sessions),
            joinedload(Athlete.focus_blocks),
            joinedload(Athlete.planned_sessions),
            joinedload(Athlete.targets),
        )
        .where(Athlete.id == athlete_id)
    )
    if athlete is None:
        raise ValueError("Athlete not found")

    analysis = athlete_analysis_payload(db, athlete_id)
    selected_discipline = discipline or athlete.primary_discipline
    sessions = _sessions_for_discipline(athlete, selected_discipline)
    detected_mesocycles = detect_mesocycles(sessions, selected_discipline)
    current_block = _focus_block_for_discipline(athlete, selected_discipline)
    current_evaluation = _evaluation_for_block(analysis, current_block.id if current_block else None)
    next_target = _next_target_summary(athlete, selected_discipline)
    today = date.today()
    days_to_target = None
    if next_target and next_target.get("target_date"):
        days_to_target = (next_target["target_date"] - today).days

    recent_sessions = [session for session in sessions if (today - session.performed_at.date()).days <= 42]
    structure, work_weeks, recovery_weeks = _estimate_level(len(recent_sessions))
    latest_mesocycle = detected_mesocycles[-1] if detected_mesocycles else None
    previous_major = latest_mesocycle.block_type if latest_mesocycle else None
    negative_block = current_evaluation and current_evaluation.get("direction") in {"down", "negative"}
    positive_block = current_evaluation and current_evaluation.get("direction") in {"up", "positive"}
    reference_estimate = _reference_estimate_label(analysis, selected_discipline)

    next_target_obj = next(
        (t for t in (athlete.targets or []) if t.target_date >= today),
        (athlete.targets[0] if athlete.targets else None),
    )
    robustness = "low" if len(recent_sessions) <= 4 else "medium" if len(recent_sessions) <= 8 else "high"
    evaluation_signal = _eval_signal(current_evaluation.get("direction") if current_evaluation else None)

    # I1 — Detección de inactividad prolongada
    inactive, days_since_last_session, inactivity_warnings = _detect_inactivity(sessions)

    # I2 — Detección de estancamiento crónico
    stagnation_detected, stagnation_tests, stagnation_warnings = _detect_stagnation(
        db, athlete_id, selected_discipline
    )

    physio_gap = None
    resolved_distance_category = infer_distance_category(next_target_obj, selected_discipline) if next_target_obj else None
    physio_ctx = None
    peak_lactate_proxy = None
    raw_curve_points: list[dict[str, Any]] = []
    if next_target_obj:
        weeks_to_goal = (next_target_obj.target_date - today).days // 7
        _disc_view = (analysis.get("discipline_views") or {}).get(selected_discipline) or {}
        raw_curve_points = _raw_lactate_curve(athlete, selected_discipline)
        peak_lactate_proxy = _peak_lactate_proxy(_disc_view, raw_curve_points)

        # ── Gather HR data for VO2max estimation (Swain+ACSM) ────────────
        _lt2_hr = _extract_lt2_heart_rate(analysis, selected_discipline)
        _hr_max = _extract_hr_max(athlete, selected_discipline)
        _hr_rest = _extract_hr_rest(db, athlete)
        _garmin_vo2 = _extract_garmin_vo2max(db, athlete, selected_discipline)

        # Find latest measured VLamax from athlete's snapshots
        _measured_vlamax = None
        for _snap in reversed(getattr(athlete, "snapshots", []) or []):
            _mv = (_snap.payload or {}).get("measured_vlamax")
            if _mv and _mv.get("vlamax_mmol_min"):
                _measured_vlamax = _mv
                break

        physio_ctx = build_physiological_context(
            analysis=analysis,
            athlete_level=getattr(athlete, "athlete_level", "trained") or "trained",
            discipline=selected_discipline,
            distance_category=resolved_distance_category,
            target_pace_label=getattr(next_target_obj, "target_pace_label", None)
                or getattr(next_target_obj, "target_running_pace_label", None),
            target_power_watts=getattr(next_target_obj, "target_power_watts", None)
                or getattr(next_target_obj, "target_cycling_power_watts", None),
            weeks_to_goal=weeks_to_goal,
            peak_lactate_1km=peak_lactate_proxy,
            raw_curve_points=raw_curve_points,
            dynamic_thresholds=analysis.get("dynamic_thresholds"),
            lt2_heart_rate=_lt2_hr,
            hr_max=_hr_max,
            hr_rest=_hr_rest,
            weight_kg=getattr(athlete, "weight", None),
            garmin_vo2max=_garmin_vo2,
            measured_vlamax=_measured_vlamax,
        )
        # I2 — Inyectar estado de estancamiento al contexto fisiológico
        physio_ctx.stagnation_detected = stagnation_detected
        physio_ctx.stagnation_tests_count = stagnation_tests
        physio_gap = analyse_physiological_gap(physio_ctx)

    durability_state = _estimate_durability_state(
        recent_sessions,
        discipline=selected_discipline,
        distance_category=resolved_distance_category,
    )
    dynamic_confidence = (
        _dynamic_decision_confidence(
            physio_ctx=physio_ctx,
            physio_gap=physio_gap,
            recent_session_count=len(recent_sessions),
            robustness=robustness,
            raw_curve_points=raw_curve_points,
            distance_category=resolved_distance_category,
            durability_state=durability_state,
            peak_lactate_proxy=peak_lactate_proxy,
        )
        if physio_gap and physio_ctx
        else {
            "lt1_confidence_dynamic": None,
            "lt2_confidence_dynamic": None,
            "glycolytic_confidence": None,
            "overall_decision_confidence": 0.46,
            "confidence_band": "low",
            "decision_uncertainty": "needs_confirmation",
            "needs_confirmation": True,
            "contradictory_signals": [],
            "confidence_factors": [],
        }
    )
    secondary_limiter = _infer_secondary_limiter(
        physio_gap=physio_gap,
        peak_lactate_proxy=peak_lactate_proxy,
        durability_state=durability_state,
    ) if physio_gap else None

    initial_assignment = _is_initial_assignment(
        current_block=current_block,
        previous_major=previous_major,
        recent_session_count=len(recent_sessions),
    )

    # Response factor: deltas LT1/LT2 de bloques completados
    response_history = _compute_block_response_history(db, athlete_id, selected_discipline)

    if initial_assignment and physio_gap:
        scored_candidates = _score_initial_assignment_candidates(
            days_to_target=days_to_target,
            discipline=selected_discipline,
            distance_category=resolved_distance_category,
            physiological_block=physio_gap.recommended_block,
            primary_limiter=physio_gap.primary_limiter,
            data_quality=physio_gap.data_quality,
        )
    else:
        scored_candidates = _score_block_candidates(
            days_to_target=days_to_target,
            previous_major=previous_major,
            evaluation_signal=evaluation_signal,
            robustness=robustness,
            recent_session_count=len(recent_sessions),
            discipline=selected_discipline,
            response_history=response_history,
        )

    for candidate in scored_candidates:
        candidate.reasons = list(dict.fromkeys(candidate.reasons + rationale_fit_messages(candidate.block_type)))
        candidate.contraindications = list(dict.fromkeys(candidate.contraindications + rationale_risk_messages(candidate.block_type)))

    winner = scored_candidates[0]
    recommended_type = winner.block_type
    reasoning: list[str] = winner.reasons[:]
    risk_flags: list[str] = winner.contraindications[:]
    selection_engine = "heuristic"

    # ── Capa fisiológica (physiological_engine) ───────────────────────────────
    # Usa LT1/LT2 reales o, si aún no están resueltos, LT fisiológicos
    # anclados a 2.0/4.0 mmol.
    if physio_gap:
        can_override = (
            physio_gap.data_quality == "good"
            or (
                initial_assignment
                and physio_gap.data_quality == "low"
                and dynamic_confidence["overall_decision_confidence"] >= 0.62
            )
        )
        if can_override and physio_gap.recommended_block != "testing_decision_block":
            recommended_type = physio_gap.recommended_block
            scored_candidates = _prioritize_physiological_candidate(
                scored_candidates,
                physiological_block=physio_gap.recommended_block,
                reasons=physio_gap.reasons,
                contraindications=physio_gap.contraindications,
            )
            selection_engine = "physiological_primary"
            source_note = (
                "Asignación inicial basada en test incremental + demanda de prueba, no en la heurística temporal por defecto."
                if initial_assignment
                else "El motor fisiológico manda sobre la heurística temporal porque hay señal suficiente para elegir bloque."
            )
            reasoning = physio_gap.reasons + [
                source_note
            ]
            risk_flags = physio_gap.contraindications + risk_flags
        elif physio_gap.data_quality == "none":
            selection_engine = "heuristic_fallback_no_physiology"
            risk_flags.append(
                "Sin test de lactato interpretable — la recomendación es temporal, no fisiológica. "
                "Incluir test en el próximo mesociclo."
            )
        else:
            selection_engine = "heuristic_fallback_low_signal"
            reasoning.extend(physio_gap.reasons)
            risk_flags.append(
                f"Datos de lactato con calidad baja "
                f"(test hace {physio_ctx.test_age_days if physio_ctx else '?'}d o confianza insuficiente). "
                "La recomendación se apoya parcialmente en fisiología, pero no con certeza fuerte."
            )

    if physio_gap:
        adjusted_block, durability_reasons, durability_flags = _apply_durability_guardrail(
            recommended_type=recommended_type,
            distance_category=resolved_distance_category,
            durability_state=durability_state,
            physio_gap=physio_gap,
        )
        if adjusted_block != recommended_type:
            recommended_type = adjusted_block
            selection_engine = f"{selection_engine}_durability_guardrail"
            reasoning.extend(durability_reasons)
            risk_flags.extend(durability_flags)
    # ── AEC stagnation guardrail ──────────────────────────────────────────
    # Si el atleta lleva 3+ bloques AEC consecutivos, considerar THR.
    # Olbrecht: capacity training is foundational but must eventually give way
    # to power training. Diminishing returns after 3 consecutive AEC blocks.
    _season = physio_gap.season_phase if physio_gap else None
    if (
        recommended_type == "aerobic_capacity_block"
        and athlete.focus_blocks
        and _season != "base_early"  # En base_early AEC siempre es correcto (Olbrecht R1)
    ):
        _recent_blocks = sorted(athlete.focus_blocks, key=lambda b: b.start_date, reverse=True)
        _aec_streak = 0
        for _fb in _recent_blocks:
            if _fb.energy_system_focus == "aerobic_capacity_block":
                _aec_streak += 1
            else:
                break
        if _aec_streak >= 3:
            recommended_type = "threshold_development_block"
            reasoning.append(
                "Guardrail de estancamiento: 3+ bloques AEC consecutivos sin progresión suficiente. "
                "Olbrecht: la capacidad tiene rendimientos decrecientes — es momento de estimular "
                "el umbral para progresar por otra vía, incluso si LT1 no está completamente resuelto."
            )
            risk_flags.append("Transición forzada AEC→THR por rendimientos decrecientes tras 3 bloques AEC.")

    # ── ANP max 2 semanas consecutivas (Olbrecht) ──────────────────────────
    # Olbrecht SoW: "ANP training should not exceed 2 consecutive weeks."
    # Con bloques ANP de max 2 semanas (1+1), 1 bloque = 2 semanas = límite.
    # Tras 1 bloque ANP → insertar buffer aeróbico antes de poder repetir.
    # La redirección depende del contexto:
    #   - taper (≤3 semanas): COMP (única opción lógica)
    #   - gap cerrado/negativo: AEP (consolidar potencia aeróbica)
    #   - gap abierto: THR (volver a trabajar umbral como buffer)
    if recommended_type == "anaerobic_power_block" and athlete.focus_blocks:
        _recent_blocks = sorted(athlete.focus_blocks, key=lambda b: b.start_date, reverse=True)
        _anp_streak = 0
        for _fb in _recent_blocks:
            if _fb.energy_system_focus == "anaerobic_power_block":
                _anp_streak += 1
            else:
                break
        if _anp_streak >= 1:
            _anp_weeks = weeks_to_goal
            _anp_gap = physio_gap.lt2_gap_kmh if physio_gap else None
            if _anp_weeks is not None and _anp_weeks <= 3:
                recommended_type = "competition_specific_block"
                reasoning.append(
                    "Guardrail Olbrecht: 2 ANP consecutivos + taper (≤3 semanas). "
                    "Transición a especificidad competitiva."
                )
            elif _anp_gap is not None and _anp_gap <= 0:
                recommended_type = "aerobic_power_block"
                reasoning.append(
                    "Guardrail Olbrecht: 2 ANP consecutivos con gap cerrado. "
                    "Bloque AEP como buffer aeróbico para consolidar sin más carga anaeróbica."
                )
            else:
                recommended_type = "threshold_development_block"
                reasoning.append(
                    "Guardrail Olbrecht: 2 ANP consecutivos con gap aún abierto. "
                    "Bloque THR como buffer aeróbico antes de poder retomar ANP."
                )
            risk_flags.append("ANP limitado a 2 bloques consecutivos (Olbrecht). Bloque buffer aeróbico insertado.")

    # ── AEC re-boost al final de base_late (Olbrecht) ─────────────────────
    # Olbrecht SoW: "re-boost aerobic capacity in the last mesocycle of the
    # base period before entering specific phase."
    # Si estamos en base_late, a ≤23 semanas del objetivo (justo antes de specific),
    # y el atleta NO hizo AEC en los últimos 2 bloques → insertar AEC.
    if (
        _season == "base_late"
        and recommended_type not in {"aerobic_capacity_block", "testing_decision_block"}
        and athlete.focus_blocks
    ):
        _recent_blocks_reboost = sorted(athlete.focus_blocks, key=lambda b: b.start_date, reverse=True)
        _had_recent_aec = any(
            fb.energy_system_focus == "aerobic_capacity_block"
            for fb in _recent_blocks_reboost[:2]
        )
        _weeks = (next_target_obj.target_date - today).days // 7 if next_target_obj and hasattr(next_target_obj, "target_date") else None
        if not _had_recent_aec and _weeks is not None and _weeks <= 23:
            recommended_type = "aerobic_capacity_block"
            reasoning.append(
                "Re-boost Olbrecht: último mesociclo del base — consolidar capacidad aeróbica "
                "antes de entrar en fase específica. Sin AEC reciente en los últimos 2 bloques."
            )
            risk_flags.append(
                "Re-boost AEC forzado en transición base_late→specific (Olbrecht: proteger base antes de intensificar)."
            )

    # I1 — Si hay inactividad prolongada, forzar AEC y estructura corta
    if inactive and recommended_type not in {"aerobic_capacity_block", "testing_decision_block"}:
        recommended_type = "aerobic_capacity_block"
        reasoning.append(
            f"Inactividad prolongada ({days_since_last_session or '?'} días sin sesiones). "
            "Se fuerza bloque de capacidad aeróbica para readaptación progresiva."
        )

    control_points: list[str] = []
    progression_rules: list[str] = []

    reasoning = list(dict.fromkeys(reasoning + rationale_fit_messages(recommended_type)))
    risk_flags = list(dict.fromkeys(risk_flags + rationale_risk_messages(recommended_type)))

    # ── Risk flags globales ───────────────────────────────────────────────────
    if len(recent_sessions) <= 4:
        risk_flags.append("Muestra reciente escasa: conviene un bloque corto y conservador.")
    if next_target is None:
        risk_flags.append("No hay target próximo cargado; la recomendación se apoya en histórico y bloque activo.")
    if not sessions:
        risk_flags.append("Hay muy pocos datos por disciplina; la recomendación es orientativa.")

    # I1 — Warnings de inactividad prolongada
    risk_flags.extend(inactivity_warnings)

    # I2 — Warnings de estancamiento crónico
    risk_flags.extend(stagnation_warnings)

    risk_flags = list(dict.fromkeys(risk_flags))

    effective_physio_gap = None
    reliability_warnings_payload = []
    block_rationale_payload = None
    block_explanation_payload = None
    if physio_gap and physio_ctx:
        effective_physio_gap = (
            replace(physio_gap, recommended_block=recommended_type)
            if physio_gap.recommended_block != recommended_type
            else physio_gap
        )

        reliability_warnings_payload = [
            {
                "code": warning.code,
                "severity": warning.severity,
                "message": warning.message,
                "actionable": warning.actionable,
            }
            for warning in generate_reliability_warnings(physio_ctx, effective_physio_gap)
        ]

        if recommended_type in BLOCK_RATIONALE:
            rationale = BLOCK_RATIONALE[recommended_type]
            block_rationale_payload = {
                "block_key": rationale.block_key,
                "display_name": rationale.display_name,
                "olbrecht_class": rationale.olbrecht_class,
                "summary_coach": rationale.summary_coach,
                "physiological_goal": rationale.physiological_goal,
                "training_description": rationale.training_description,
                "expected_timeline": rationale.expected_timeline,
                "ideal_context": rationale.ideal_context,
                "risk_if_wrong": rationale.risk_if_wrong,
                "min_weeks": rationale.min_weeks,
                "max_weeks": rationale.max_weeks,
                "science_refs": rationale.science_refs,
            }

        block_explanation = generate_block_explanation(physio_ctx, effective_physio_gap)
        block_explanation_payload = {
            "headline": block_explanation.headline,
            "why_now": block_explanation.why_now,
            "what_to_expect": block_explanation.what_to_expect,
            "what_to_watch": block_explanation.what_to_watch,
            "when_to_exit": block_explanation.when_to_exit,
            "alternative_if_wrong": block_explanation.alternative_if_wrong,
            "block_key": block_explanation.block_key,
            "display_name": block_explanation.display_name,
            "olbrecht_class": block_explanation.olbrecht_class,
            "min_weeks": block_explanation.min_weeks,
            "max_weeks": block_explanation.max_weeks,
        }

    # ── Regla de progresión específica por disciplina ─────────────────────────
    if selected_discipline == "ciclismo":
        progression_rules.append("En ciclismo, decide si progresas por tiempo útil o por potencia objetivo antes de tocar la otra variable.")
    elif selected_discipline == "running":
        progression_rules.append("En carrera, evita subir a la vez minutos de trabajo y densidad si quieres mantener lectura limpia del bloque.")
    elif selected_discipline == "natación":
        progression_rules.append("En natación, asegura continuidad técnica antes de endurecer el coste metabólico.")

    template = select_mesocycle_template(selected_discipline, recommended_type)
    if template:
        primary_focus = template.primary_focus
        secondary_focus = reference_estimate or template.secondary_focus
        control_points = list(dict.fromkeys(template.control_points + control_points))
        progression_rules = list(dict.fromkeys(template.progression_rules + progression_rules))
        entry_checks = template.entry_checks
        exit_checks = template.exit_checks
        key_session_families = template.key_session_families
        template_id = template.template_id
        template_summary = template.summary
        recommended_block_label = template.public_label
    else:
        entry_checks = []
        exit_checks = []
        key_session_families = []
        template_id = None
        template_summary = None
        recommended_block_label = BLOCK_TAXONOMY[recommended_type].public_label

    block_meta = BLOCK_TAXONOMY[recommended_type]
    explanation = [
        "La recomendación combina estado actual, objetivo próximo y una biblioteca de mesociclos por disciplina.",
        "El histórico detectado queda como contexto secundario; el núcleo del motor es prescriptivo y no un simple detector de semanas.",
        block_meta.olbrecht_rationale,
    ]

    current_block_payload = {
        "id": current_block.id if current_block else None,
        "status": current_block.status if current_block else "none",
        "energy_system_focus": current_block.energy_system_focus if current_block else None,
        "block_objective": current_block.block_objective if current_block else None,
        "block_intent": current_block.block_intent if current_block else None,
        "phase": current_block.phase if current_block else None,
        "start_date": current_block.start_date if current_block else None,
        "end_date": current_block.end_date if current_block else None,
        "target_date": current_block.target_date if current_block else None,
        "evaluation_summary": current_evaluation.get("summary") if current_evaluation else None,
        "evaluation_direction": current_evaluation.get("direction") if current_evaluation else None,
        "evaluation_confidence": current_evaluation.get("confidence") if current_evaluation else None,
        "recommendation": current_evaluation.get("recommendation") if current_evaluation else None,
    }

    lactate_check_recommendations = _generate_lactate_check_recommendations(
        recommended_block=recommended_type,
        discipline=selected_discipline,
        distance_category=resolved_distance_category,
        confidence_band=dynamic_confidence["confidence_band"],
        needs_confirmation=dynamic_confidence["needs_confirmation"],
        durability_state=durability_state,
    )

    recommendation_confidence = round(
        min(
            0.92,
            max(
                0.32,
                dynamic_confidence["overall_decision_confidence"]
                if physio_gap
                else 0.42 + min(len(recent_sessions), 8) * 0.03 + (0.05 if current_evaluation else 0.0),
            ),
        ),
        2,
    )

    recommendation_payload = {
        "target_discipline": selected_discipline,
        "recommended_block_type": recommended_type,
        "recommended_block_label": recommended_block_label,
        "template_id": template_id,
        "template_summary": template_summary,
        "structure": structure,
        "duration_weeks": work_weeks + recovery_weeks,
        "work_weeks": work_weeks,
        "recovery_weeks": recovery_weeks,
        "primary_focus": primary_focus,
        "secondary_focus": secondary_focus,
        "confidence": recommendation_confidence,
        "reasoning": reasoning,
        "key_session_families": key_session_families,
        "control_points": control_points,
        "progression_rules": progression_rules,
        "entry_checks": entry_checks,
        "exit_checks": exit_checks,
        "risk_flags": risk_flags,
        "next_target": next_target,
        "lactate_check_recommendations": lactate_check_recommendations,
        # Scoring completo de candidatos — permite al entrenador auditar la decisión
        "candidates_scored": [
            {
                "block_type": c.block_type,
                "score": round(c.score, 1),
                "reasons": c.reasons,
                "contraindications": c.contraindications,
            }
            for c in scored_candidates
        ],
        "scoring_context": {
            "assignment_mode": "initial_assignment" if initial_assignment else "progression_assignment",
            "selection_engine": selection_engine,
            "robustness": robustness,
            "evaluation_signal": evaluation_signal,
            "previous_major": previous_major,
            "days_to_target": days_to_target,
            # I1 — Estado de inactividad
            "inactivity_detected": inactive,
            "days_since_last_session": days_since_last_session,
            # I2 — Estado de estancamiento
            "stagnation_detected": stagnation_detected,
            "stagnation_tests_count": stagnation_tests,
        },
        "physiological_analysis": {
            "data_quality": physio_gap.data_quality if physio_gap else "none",
            "season_phase": physio_gap.season_phase if physio_gap else None,
            "primary_limiter": physio_gap.primary_limiter if physio_gap else None,
            "secondary_limiter": secondary_limiter,
            "lt2_gap_kmh": physio_gap.lt2_gap_kmh if physio_gap else None,
            "lt1_gap_kmh": physio_gap.lt1_gap_kmh if physio_gap else None,
            "required_lt2_kmh": physio_gap.required_lt2_kmh if physio_gap else None,
            "required_lt1_kmh": physio_gap.required_lt1_kmh if physio_gap else None,
            "physiological_block": physio_gap.recommended_block if physio_gap else None,
            "distance_category": resolved_distance_category,
            "metric_type": physio_gap.metric_type if physio_gap else None,
            "lt1_confidence_dynamic": dynamic_confidence["lt1_confidence_dynamic"] if physio_gap else None,
            "lt2_confidence_dynamic": dynamic_confidence["lt2_confidence_dynamic"] if physio_gap else None,
            "glycolytic_confidence": dynamic_confidence["glycolytic_confidence"] if physio_gap else None,
            "overall_decision_confidence": dynamic_confidence["overall_decision_confidence"],
            "confidence_band": dynamic_confidence["confidence_band"],
            "decision_uncertainty": dynamic_confidence["decision_uncertainty"],
            "needs_confirmation": dynamic_confidence["needs_confirmation"],
            "durability": {
                "durability_score": durability_state["durability_score"],
                "lt1_degradation_pct": durability_state["lt1_degradation_pct"],
                "lt2_degradation_pct": durability_state["lt2_degradation_pct"],
                "aerobic_drift_pct": durability_state["aerobic_drift_pct"],
                "durability_confidence": durability_state["durability_confidence"],
                "durability_source": durability_state["durability_source"],
                "durability_flag": durability_state["durability_flag"],
            },
            "contradictory_signals": dynamic_confidence["contradictory_signals"],
            "confidence_factors": dynamic_confidence["confidence_factors"],
            "lactate_check_recommendations": lactate_check_recommendations,
            "overrides_temporal_scoring": can_override if physio_gap else False,
            "reliability_warnings": reliability_warnings_payload,
            "borderline": effective_physio_gap.borderline if effective_physio_gap else False,
            "borderline_note": effective_physio_gap.borderline_note if effective_physio_gap else "",
            "block_rationale": block_rationale_payload,
            "block_explanation": block_explanation_payload,
            "capacity_profile": {
                "aerobic_level": physio_ctx.capacity_profile.aerobic_level,
                "vlamax_level": physio_ctx.capacity_profile.vlamax_level,
                "lt1_lt2_ratio": physio_ctx.capacity_profile.lt1_lt2_ratio,
                "vo2max_estimated": physio_ctx.capacity_profile.vo2max_estimated,
                "vo2max_source": physio_ctx.capacity_profile.vo2max_source,
                "vo2max_confidence": physio_ctx.capacity_profile.vo2max_confidence,
                "fractional_utilization": physio_ctx.capacity_profile.fractional_utilization,
                "source": physio_ctx.capacity_profile.source,
                "confidence": physio_ctx.capacity_profile.confidence,
            } if physio_ctx and physio_ctx.capacity_profile else None,
        } if physio_gap else None,
    }

    recommended_workouts = [_serialize_workout_template(template) for template in templates_for_block(selected_discipline, recommended_type)]
    workout_library = [_serialize_workout_template(template) for template in templates_for_discipline_library(selected_discipline)]
    mesocycle_draft = build_mesocycle_draft(
        discipline=selected_discipline,
        block_type=recommended_type,
        block_label=recommended_block_label,
        structure=structure,
        duration_weeks=work_weeks + recovery_weeks,
        work_weeks=work_weeks,
        recovery_weeks=recovery_weeks,
        primary_focus=primary_focus,
        secondary_focus=secondary_focus,
        athlete=athlete,
        target_date=next_target.get("target_date") if next_target else None,
        evaluation_direction=current_evaluation.get("direction") if current_evaluation else None,
    )

    return {
        "athlete_id": athlete.id,
        "athlete_name": athlete.name,
        "athlete_primary_discipline": athlete.primary_discipline,
        "discipline": selected_discipline,
        "generated_on": today,
        "foundations": [_serialize_foundation(foundation) for foundation in FOUNDATION_PILLARS],
        "template_library": [_serialize_template(template) for template in templates_for_discipline(selected_discipline)],
        "current_block": current_block_payload,
        "planned_blocks": _planned_blocks_for_discipline(athlete, selected_discipline),
        "planned_sessions": _planned_sessions_all(athlete),
        "detected_mesocycles": serialize_detected_mesocycles(detected_mesocycles),
        "next_recommendation": recommendation_payload,
        "recommended_workouts": recommended_workouts,
        "workout_library": workout_library,
        "mesocycle_draft": mesocycle_draft,
        "warnings": risk_flags,
        "explanation": explanation,
    }


# ── B4 — Análisis triatlón: disciplina débil + consejos secundarios ──────────

# Regla de intensidad secundaria — DIFERENCIADA por disciplina secundaria.
#
# Running como secundario: baja 1 nivel (alto impacto musculoesquelético,
# ECO=1.0). Doble umbral sistémico en carrera es contraproducente (Millet 2002).
#
# Ciclismo como secundario: puede igualar o complementar intensidad (ECO=0.50,
# bajo impacto, diferente reclutamiento muscular). Intervalos cortos en bici
# (SIT, 30/30, VO2max) no generan la misma fatiga musculoesquelética que en
# carrera — son ideales para subir techo aeróbico sin romper piernas.
# Olbrecht: "the bike can serve as a high-intensity stimulus with lower
# orthopedic cost, allowing the athlete to accumulate quality work."

# Mapa cuando la secundaria es RUNNING (conservador: 1 nivel abajo)
_SECONDARY_BLOCK_MAP_RUNNING: dict[str, str] = {
    "aerobic_capacity_block": "aerobic_capacity_block",       # AEC → AEC
    "threshold_development_block": "aerobic_capacity_block",  # THR → AEC
    "aerobic_power_block": "threshold_development_block",     # AEP → THR
    "anaerobic_capacity_block": "aerobic_capacity_block",     # ANC → AEC
    "anaerobic_power_block": "threshold_development_block",   # ANP → THR
    "competition_specific_block": "aerobic_power_block",      # COMP → AEP
    "testing_decision_block": "aerobic_capacity_block",
    "recovery_consolidation_block": "recovery_consolidation_block",
}

# Mapa cuando la secundaria es CICLISMO (permisivo: puede igualar intensidad)
# La bici tolera intensidad alta sin el coste musculoesquelético del running.
# Si la primaria (running) necesita AEP/VO2max → la bici TAMBIÉN puede hacer
# AEP (SIT, 30/30, microintervalos) porque aporta estímulo central (corazón,
# mitocondrias) sin machacar las piernas para el running.
_SECONDARY_BLOCK_MAP_CYCLING: dict[str, str] = {
    "aerobic_capacity_block": "aerobic_capacity_block",       # AEC → AEC (mantenimiento)
    "threshold_development_block": "threshold_development_block",  # THR → THR (puede igualar)
    "aerobic_power_block": "aerobic_power_block",             # AEP → AEP (SIT/30-30 en bici OK)
    "anaerobic_capacity_block": "anaerobic_capacity_block",   # ANC → ANC (sprints en bici OK)
    "anaerobic_power_block": "aerobic_power_block",           # ANP → AEP (ANP es pre-comp, bici baja 1)
    "competition_specific_block": "aerobic_power_block",      # COMP → AEP
    "testing_decision_block": "aerobic_capacity_block",
    "recovery_consolidation_block": "recovery_consolidation_block",
}

# ECO load weighting (Cejuela 2022)
_ECO_WEIGHT: dict[str, float] = {
    "running": 1.0,
    "ciclismo": 0.50,
    "natación": 0.75,
}

# Techo de carga semanal por fase (unidades: sum of fatigue_cost × ECO)
_LOAD_CEILING: dict[str, float] = {
    "base_early": 10.0,
    "base_late": 12.0,
    "specific": 14.0,
    "pre_comp": 14.0,
    "taper": 8.0,
}

# Cross-benchmarks nivel: (LT2 running km/h, LT2 ciclismo watts)
# Para situar al atleta en percentil dentro de su nivel por disciplina.
# Fuente: Friel, Coggan, Billat, Olbrecht
_CROSS_PERCENTILE_BENCHMARKS: dict[str, dict[str, tuple[float, float]]] = {
    "running": {
        "recreational": (9.0, 11.5),
        "trained": (11.0, 14.5),
        "competitive": (13.5, 17.0),
    },
    "ciclismo": {
        "recreational": (170.0, 240.0),
        "trained": (220.0, 310.0),
        "competitive": (270.0, 380.0),
    },
}


def _percentile_in_band(value: float, band: tuple[float, float]) -> float:
    """Devuelve el percentil (0-1) del valor dentro de la banda."""
    lo, hi = band
    if hi <= lo:
        return 0.5
    return max(0.0, min(1.0, (value - lo) / (hi - lo)))


def _tri_pace_to_kmh(pace_label: Optional[str]) -> Optional[float]:
    """Convierte '4:59' o '4:59/km' a km/h."""
    if not pace_label:
        return None
    try:
        clean = pace_label.replace("/km", "").strip()
        parts = clean.split(":")
        if len(parts) == 2:
            total_secs = int(parts[0]) * 60 + int(parts[1])
            return round(3600 / total_secs, 3) if total_secs > 0 else None
    except Exception:
        pass
    return None


def _signal_gap_vs_objective(
    analysis: dict[str, Any],
    athlete: Any,
    athlete_level: str,
) -> dict[str, Any]:
    """Señal A: gap vs objetivo de carrera para running y ciclismo."""
    result: dict[str, Any] = {"available": False, "run_gap_pct": None, "bike_gap_pct": None, "weakest": None}

    targets = _discipline_targets(athlete, "triatlón") or _discipline_targets(athlete, athlete.primary_discipline)
    today = date.today()
    target = next((t for t in targets if t.target_date >= today), targets[0] if targets else None)
    if target is None:
        return result

    dist_cat = infer_distance_category(target, "triatlón") or infer_distance_category(target, "running")

    # Running gap
    run_view = (analysis.get("discipline_views") or {}).get("running") or {}
    run_thresholds = {str(t.get("name", "")).upper(): t for t in (run_view.get("thresholds") or []) if isinstance(t, dict)}
    lt2_run = run_thresholds.get("LT2", {})
    lt2_run_pace = lt2_run.get("pace_seconds_per_km")
    lt2_run_kmh = round(3600 / lt2_run_pace, 3) if isinstance(lt2_run_pace, (int, float)) and lt2_run_pace > 0 else None

    target_run_pace = getattr(target, "target_running_pace_label", None) or getattr(target, "target_pace_label", None)
    target_run_kmh = _tri_pace_to_kmh(target_run_pace) if target_run_pace else None

    if lt2_run_kmh and target_run_kmh and dist_cat:
        from app.services.physiological_engine import LT2_RACE_FACTOR
        factor_dict = LT2_RACE_FACTOR.get(dist_cat) or LT2_RACE_FACTOR.get("hm", {})
        factor = factor_dict.get(athlete_level, 0.90)
        required_lt2_run = target_run_kmh / factor if factor > 0 else target_run_kmh
        run_gap = (required_lt2_run - lt2_run_kmh) / required_lt2_run if required_lt2_run > 0 else 0
        result["run_gap_pct"] = round(run_gap * 100, 1)

    # Cycling gap
    bike_view = (analysis.get("discipline_views") or {}).get("ciclismo") or {}
    bike_thresholds = {str(t.get("name", "")).upper(): t for t in (bike_view.get("thresholds") or []) if isinstance(t, dict)}
    lt2_bike = bike_thresholds.get("LT2", {})
    lt2_bike_power = lt2_bike.get("power_watts")
    lt2_bike_power = float(lt2_bike_power) if isinstance(lt2_bike_power, (int, float)) and lt2_bike_power > 0 else None

    target_bike_power = getattr(target, "target_cycling_power_watts", None) or getattr(target, "target_power_watts", None)
    target_bike_power = float(target_bike_power) if isinstance(target_bike_power, (int, float)) and target_bike_power > 0 else None

    if lt2_bike_power and target_bike_power and dist_cat:
        from app.services.physiological_engine import LT2_RACE_FACTOR
        # Para ciclismo, buscar el evento de bici del triatlón
        bike_dist = dist_cat.replace("tri", "bike") if "tri" in dist_cat else dist_cat
        if bike_dist not in LT2_RACE_FACTOR:
            bike_dist = dist_cat
        factor_dict = LT2_RACE_FACTOR.get(bike_dist) or LT2_RACE_FACTOR.get("road_tt_medium", {})
        factor = factor_dict.get(athlete_level, 0.90)
        required_lt2_bike = target_bike_power / factor if factor > 0 else target_bike_power
        bike_gap = (required_lt2_bike - lt2_bike_power) / required_lt2_bike if required_lt2_bike > 0 else 0
        result["bike_gap_pct"] = round(bike_gap * 100, 1)

    if result["run_gap_pct"] is not None and result["bike_gap_pct"] is not None:
        result["available"] = True
        result["weakest"] = "ciclismo" if result["bike_gap_pct"] > result["run_gap_pct"] else "running"

    return result


def _signal_curve_trend(
    db: Session,
    athlete_id: int,
) -> dict[str, Any]:
    """Señal B: tendencia de curva LT2 en últimos 180d para running y ciclismo."""
    result: dict[str, Any] = {"available": False, "run_trend_pct": None, "bike_trend_pct": None, "weakest": None}
    cutoff = date.today() - __import__("datetime").timedelta(days=_STAGNATION_LOOKBACK_DAYS)

    for disc, metric_key in [("running", "pace"), ("ciclismo", "power")]:
        snapshots = db.scalars(
            select(PhysiologicalSnapshot)
            .where(
                PhysiologicalSnapshot.athlete_id == athlete_id,
                PhysiologicalSnapshot.discipline == disc,
                PhysiologicalSnapshot.snapshot_date >= cutoff,
                PhysiologicalSnapshot.confidence > 0.0,
            )
            .order_by(PhysiologicalSnapshot.snapshot_date)
        ).all()

        if len(snapshots) < 2:
            continue

        values: list[float] = []
        for snap in snapshots:
            if metric_key == "pace" and snap.lt2_pace_seconds_per_km and snap.lt2_pace_seconds_per_km > 0:
                values.append(snap.lt2_pace_seconds_per_km)
            elif metric_key == "power" and snap.lt2_power_watts and snap.lt2_power_watts > 0:
                values.append(snap.lt2_power_watts)

        if len(values) < 2 or values[0] == 0:
            continue

        if metric_key == "pace":
            # Menor es mejor para pace
            improvement_pct = (values[0] - values[-1]) / values[0] * 100
        else:
            # Mayor es mejor para power
            improvement_pct = (values[-1] - values[0]) / values[0] * 100

        if disc == "running":
            result["run_trend_pct"] = round(improvement_pct, 1)
        else:
            result["bike_trend_pct"] = round(improvement_pct, 1)

    if result["run_trend_pct"] is not None and result["bike_trend_pct"] is not None:
        result["available"] = True
        # La que menos ha mejorado (o más ha empeorado) es la débil
        result["weakest"] = "ciclismo" if result["bike_trend_pct"] < result["run_trend_pct"] else "running"

    return result


def _signal_cross_benchmark(
    analysis: dict[str, Any],
    athlete_level: str,
) -> dict[str, Any]:
    """Señal C: percentil cruzado entre running y ciclismo.

    Un atleta con LT2 running en percentil 80% de su nivel pero FTP en
    percentil 30% tiene un desajuste claro → ciclismo es el débil.
    """
    result: dict[str, Any] = {"available": False, "run_percentile": None, "bike_percentile": None, "weakest": None}

    # Running LT2 en km/h
    run_view = (analysis.get("discipline_views") or {}).get("running") or {}
    run_thresholds = {str(t.get("name", "")).upper(): t for t in (run_view.get("thresholds") or []) if isinstance(t, dict)}
    lt2_run = run_thresholds.get("LT2", {})
    lt2_run_pace = lt2_run.get("pace_seconds_per_km")
    lt2_run_kmh = round(3600 / lt2_run_pace, 3) if isinstance(lt2_run_pace, (int, float)) and lt2_run_pace > 0 else None

    # Cycling LT2 en watts
    bike_view = (analysis.get("discipline_views") or {}).get("ciclismo") or {}
    bike_thresholds = {str(t.get("name", "")).upper(): t for t in (bike_view.get("thresholds") or []) if isinstance(t, dict)}
    lt2_bike = bike_thresholds.get("LT2", {})
    lt2_bike_power = lt2_bike.get("power_watts")
    lt2_bike_power = float(lt2_bike_power) if isinstance(lt2_bike_power, (int, float)) and lt2_bike_power > 0 else None

    if lt2_run_kmh is None or lt2_bike_power is None:
        return result

    run_band = _CROSS_PERCENTILE_BENCHMARKS["running"].get(athlete_level)
    bike_band = _CROSS_PERCENTILE_BENCHMARKS["ciclismo"].get(athlete_level)
    if not run_band or not bike_band:
        return result

    run_pct = round(_percentile_in_band(lt2_run_kmh, run_band) * 100, 1)
    bike_pct = round(_percentile_in_band(lt2_bike_power, bike_band) * 100, 1)

    result["available"] = True
    result["run_percentile"] = run_pct
    result["bike_percentile"] = bike_pct
    result["weakest"] = "ciclismo" if bike_pct < run_pct else "running"

    return result


def _check_threshold_homogeneity(
    analysis: dict[str, Any],
) -> dict[str, Any]:
    """Verifica que los umbrales comparados sean del mismo tipo entre disciplinas."""
    result: dict[str, str] = {}
    for disc in ("running", "ciclismo"):
        view = (analysis.get("discipline_views") or {}).get(disc) or {}
        real = view.get("real_thresholds") or {}
        thresholds = view.get("thresholds") or []
        has_real = bool(real.get("lt2_real"))
        has_basic = any(
            str(t.get("name", "")).upper() == "LT2" and isinstance(t.get("confidence"), (int, float)) and t["confidence"] >= 0.6
            for t in thresholds if isinstance(t, dict)
        )
        if has_real:
            result[disc] = "real"
        elif has_basic:
            result[disc] = "fisiológico"
        else:
            result[disc] = "práctico"

    homogeneous = result.get("running") == result.get("ciclismo")
    return {
        "running_type": result.get("running", "sin_datos"),
        "ciclismo_type": result.get("ciclismo", "sin_datos"),
        "homogeneous": homogeneous,
        "warning": None if homogeneous else (
            f"Comparación asimétrica: running usa LT2 {result.get('running', '?')}, "
            f"ciclismo usa LT2 {result.get('ciclismo', '?')}. Confianza reducida."
        ),
    }


def identify_weakest_discipline(
    db: Session,
    athlete_id: int,
    analysis: dict[str, Any],
    athlete: Any,
) -> dict[str, Any]:
    """Identifica la disciplina más débil entre running y ciclismo.

    Usa 3 señales:
      A: gap vs objetivo (di Prampero / race factors)
      B: tendencia de curva LT2 (Δ% últimos 180d)
      C: cross-benchmark (percentil cruzado entre disciplinas, Friel/Coggan)

    Si A y B coinciden → confianza alta.
    Si discrepan → B+C mandan (no dependen de modelo externo).

    Returns:
        Dict con disciplina_debil, confianza, señales, explicación, etc.
    """
    athlete_level = getattr(athlete, "athlete_level", "trained") or "trained"

    signal_a = _signal_gap_vs_objective(analysis, athlete, athlete_level)
    signal_b = _signal_curve_trend(db, athlete_id)
    signal_c = _signal_cross_benchmark(analysis, athlete_level)
    threshold_check = _check_threshold_homogeneity(analysis)

    signals = []
    votes: dict[str, int] = {"running": 0, "ciclismo": 0}

    if signal_a["available"]:
        signals.append({
            "tipo": "gap_vs_objetivo",
            "resultado": signal_a["weakest"],
            "detalle": (
                f"Gap running: {signal_a['run_gap_pct']}%. "
                f"Gap ciclismo: {signal_a['bike_gap_pct']}%. "
                f"{'Ciclismo' if signal_a['weakest'] == 'ciclismo' else 'Running'} tiene mayor brecha vs objetivo."
            ),
        })
        votes[signal_a["weakest"]] += 1

    if signal_b["available"]:
        signals.append({
            "tipo": "tendencia_curva",
            "resultado": signal_b["weakest"],
            "detalle": (
                f"Running mejoró {signal_b['run_trend_pct']:+.1f}% en 6 meses. "
                f"Ciclismo mejoró {signal_b['bike_trend_pct']:+.1f}% en 6 meses. "
                f"{'Ciclismo' if signal_b['weakest'] == 'ciclismo' else 'Running'} está más estancado."
            ),
        })
        votes[signal_b["weakest"]] += 1

    if signal_c["available"]:
        signals.append({
            "tipo": "cross_benchmark",
            "resultado": signal_c["weakest"],
            "detalle": (
                f"Running: percentil {signal_c['run_percentile']}% en nivel {athlete_level}. "
                f"Ciclismo: percentil {signal_c['bike_percentile']}% en nivel {athlete_level}. "
                f"{'Ciclismo' if signal_c['weakest'] == 'ciclismo' else 'Running'} está por debajo del nivel esperado."
            ),
        })
        votes[signal_c["weakest"]] += 1

    total_signals = sum(1 for s in [signal_a, signal_b, signal_c] if s["available"])

    if total_signals == 0:
        return {
            "disciplina_debil": None,
            "confianza": "insufficient_data",
            "señales": [],
            "explicacion": {
                "resumen": "No hay datos suficientes de running y ciclismo para comparar disciplinas.",
                "señales": [],
                "acuerdo": "Sin señales disponibles",
                "tipo_umbral_usado": threshold_check,
            },
            "warnings": ["Se necesitan tests de lactato en running y ciclismo para el análisis triatlón."],
        }

    # Determinar disciplina débil
    if votes["ciclismo"] > votes["running"]:
        weakest = "ciclismo"
    elif votes["running"] > votes["ciclismo"]:
        weakest = "running"
    else:
        # Empate: B+C mandan (no dependen de modelo externo)
        bc_votes = {"running": 0, "ciclismo": 0}
        if signal_b["available"]:
            bc_votes[signal_b["weakest"]] += 1
        if signal_c["available"]:
            bc_votes[signal_c["weakest"]] += 1
        weakest = "ciclismo" if bc_votes["ciclismo"] >= bc_votes["running"] else "running"

    # Confianza
    agreeing = votes[weakest]
    if agreeing == total_signals and total_signals >= 2:
        confidence = "high"
        acuerdo = f"{agreeing}/{total_signals} señales coinciden → confianza alta"
    elif agreeing > total_signals // 2:
        confidence = "moderate"
        acuerdo = f"{agreeing}/{total_signals} señales coinciden → confianza moderada"
    else:
        confidence = "low"
        acuerdo = f"Señales discrepan — se priorizan tendencia de curva y cross-benchmark"

    # Reducir confianza si umbrales no homogéneos
    if not threshold_check["homogeneous"] and confidence == "high":
        confidence = "moderate"
        acuerdo += " (reducida por comparación asimétrica de umbrales)"

    secondary = "running" if weakest == "ciclismo" else "ciclismo"

    return {
        "disciplina_debil": weakest,
        "disciplina_secundaria": secondary,
        "confianza": confidence,
        "señales": signals,
        "explicacion": {
            "resumen": (
                f"{'Ciclismo' if weakest == 'ciclismo' else 'Running'} es tu mayor margen de mejora. "
                f"{'Running' if weakest == 'ciclismo' else 'Ciclismo'} ya está en mejor nivel relativo."
            ),
            "señales": signals,
            "acuerdo": acuerdo,
            "tipo_umbral_usado": threshold_check,
        },
        "warnings": [threshold_check["warning"]] if threshold_check["warning"] else [],
    }


def _secondary_discipline_advice(
    primary_block: str,
    secondary_discipline: str,
    season_phase: str,
    secondary_own_block: Optional[str] = None,
) -> dict[str, Any]:
    """Genera consejos para la disciplina secundaria.

    Enfoque en 2 fases:
    1. Consultar qué bloque necesita la disciplina secundaria POR SU PROPIO
       estado fisiológico (secondary_own_block, viene de recommend_next_mesocycle).
    2. Aplicar techo de intensidad solo si es necesario:
       - Running secundario: techo = 1 nivel por debajo del primario (ECO=1.0).
       - Ciclismo secundario: techo = mismo nivel del primario (ECO=0.50).
       Si el bloque propio de la secundaria ya está por debajo del techo → se
       respeta tal cual (no se sube artificialmente).
       Si el bloque propio supera el techo → se baja al techo.

    Esto evita prescribir AEP en bici cuando la bici necesita AEC (no tiene base),
    o frenar la bici con AEC cuando podría estar haciendo THR.
    """
    if secondary_discipline == "ciclismo":
        ceiling_map = _SECONDARY_BLOCK_MAP_CYCLING
    else:
        ceiling_map = _SECONDARY_BLOCK_MAP_RUNNING

    ceiling_block = ceiling_map.get(primary_block, "aerobic_capacity_block")

    # Escala de intensidad para comparar bloques
    _INTENSITY_RANK: dict[str, int] = {
        "recovery_consolidation_block": 0,
        "aerobic_capacity_block": 1,
        "threshold_development_block": 2,
        "aerobic_power_block": 3,
        "anaerobic_capacity_block": 3,
        "competition_specific_block": 4,
        "anaerobic_power_block": 4,
        "testing_decision_block": 0,
    }

    if secondary_own_block:
        own_rank = _INTENSITY_RANK.get(secondary_own_block, 1)
        ceiling_rank = _INTENSITY_RANK.get(ceiling_block, 1)

        if own_rank <= ceiling_rank:
            # El bloque propio ya está por debajo o igual al techo → respetar
            secondary_block = secondary_own_block
            source = "fisiológico_propio"
        else:
            # El bloque propio supera el techo → bajar al techo
            secondary_block = ceiling_block
            source = "techo_aplicado"
    else:
        # Sin análisis fisiológico de la secundaria → usar techo como default
        secondary_block = ceiling_block
        source = "techo_default"

    block_labels = {
        "aerobic_capacity_block": "Capacidad aeróbica (LT1 extensivo)",
        "threshold_development_block": "Desarrollo de umbral (LT2)",
        "aerobic_power_block": "Potencia aeróbica (VO2max)",
        "anaerobic_capacity_block": "Capacidad anaeróbica",
        "competition_specific_block": "Especificidad competitiva",
        "recovery_consolidation_block": "Recuperación y consolidación",
    }

    # Guidelines más detalladas según disciplina secundaria
    if secondary_discipline == "ciclismo":
        session_guidelines = {
            "aerobic_capacity_block": (
                "2-3/semana LT1 extensivo en bici. Construir base ciclista — "
                "no tiene sentido empujar intensidad sin base aeróbica en bici."
            ),
            "threshold_development_block": (
                "2-3/semana con 1 sesión de umbral (sweet spot / FTP). "
                "La bici tolera umbral simultáneo al running porque el impacto mecánico es mínimo."
            ),
            "aerobic_power_block": (
                "2-3/semana con 1 sesión VO2max (SIT 30/30, 40/20, o microintervalos). "
                "Estímulo central (corazón + mitocondrias) sin machacar piernas para el running. "
                "Ideal para subir techo aeróbico compartido entre disciplinas."
            ),
            "anaerobic_capacity_block": (
                "2/semana con 1 sesión de sprints cortos (10-30'' MAX + recuperación larga). "
                "Activa la glucólisis sin impacto musculoesquelético."
            ),
        }
    else:  # running secundario
        session_guidelines = {
            "aerobic_capacity_block": (
                "2-3/semana LT1 extensivo, 1 KEY máximo. "
                "Mantener volumen y economía de carrera, no buscar adaptación nueva."
            ),
            "threshold_development_block": (
                "2/semana con 1 sesión de umbral moderada (tempo o cruise intervals cortos). "
                "No combinar con KEY bici en días consecutivos — fatiga cruzada bike→run."
            ),
            "aerobic_power_block": (
                "2/semana con intervalos VO2max cortos (3-4' al 95-100% vVO2max). "
                "Cuidar fatiga sistémica — no el mismo día que KEY bici."
            ),
        }

    # ── Explicación contextual según de dónde viene el bloque ────────────
    matches_primary = (secondary_block == primary_block)

    if source == "fisiológico_propio":
        recomendacion = (
            f"{secondary_discipline.capitalize()} necesita {block_labels.get(secondary_block, secondary_block).lower()} "
            f"según su propio estado fisiológico. Este bloque es compatible con la carga del "
            f"mesociclo focalizado — se respeta sin modificación."
        )
        regla = (
            "El bloque secundario se determina primero por el estado fisiológico de esa disciplina "
            "(gaps de LT1/LT2, perfil VO2max/VLamax), y después se comprueba que no exceda "
            "el techo de carga sistémica. Si ya está por debajo → se respeta."
        )
    elif source == "techo_aplicado":
        recomendacion = (
            f"{secondary_discipline.capitalize()} necesitaría {block_labels.get(secondary_own_block or '', 'un bloque más intenso').lower()} "
            f"por su estado fisiológico, pero se modera a {block_labels.get(secondary_block, secondary_block).lower()} "
            f"para no sobrecargar el sistema junto con el mesociclo focalizado."
        )
        if secondary_discipline == "ciclismo":
            regla = (
                "Olbrecht: aunque la bici tolera más intensidad (bajo impacto mecánico), "
                "el estrés sistémico (hormonal, SNC) sigue siendo acumulativo. "
                "Se modera al techo para proteger la adaptación prioritaria."
            )
        else:
            regla = (
                "Millet 2002: running como secundario debe moderar intensidad (alto impacto "
                "musculoesquelético, ECO=1.0). Doble umbral sistémico es contraproducente."
            )
    elif secondary_discipline == "ciclismo" and matches_primary:
        recomendacion = (
            f"La bici puede trabajar al mismo nivel de intensidad ({block_labels.get(secondary_block, secondary_block).lower()}) "
            f"que el running focalizado. El bajo impacto mecánico del ciclismo (ECO=0.50) permite "
            f"acumular estímulo central sin comprometer la recuperación muscular para correr."
        )
        regla = (
            "Olbrecht: la bici aporta estímulo cardiovascular y mitocondrial con menor coste "
            "ortopédico. Intervalos cortos de alta intensidad en bici (SIT, 30/30) son ideales "
            "para elevar el techo VO2max compartido sin riesgo de lesión por impacto."
        )
    else:
        recomendacion = (
            f"Mantener {secondary_discipline} en modo {block_labels.get(secondary_block, 'mantenimiento').lower()}. "
            f"No competir por adaptación fisiológica con la disciplina focalizada."
        )
        regla = (
            "Millet 2002, Olbrecht: la disciplina secundaria se ajusta al techo de intensidad "
            "para proteger la adaptación prioritaria del mesociclo focalizado."
        )

    return {
        "disciplina": secondary_discipline,
        "bloque_recomendado": secondary_block,
        "bloque_label": block_labels.get(secondary_block, secondary_block),
        "recomendacion": recomendacion,
        "sesiones_sugeridas": session_guidelines.get(secondary_block, "2-3/semana en zona baja."),
        "regla_cientifica": regla,
        "iguala_intensidad_primaria": matches_primary,
        "bloque_propio_fisiologico": secondary_own_block,
        "bloque_techo": ceiling_block,
        "source": source,
    }


def _get_activities_for_load(db: Session, athlete: Athlete) -> list[dict]:
    """Fetch Garmin activities for training load calculation. Returns empty on error."""
    try:
        from app.services.garmin import list_garmin_activities
        return list_garmin_activities(
            athlete,
            start_date=date.today() - timedelta(days=132),  # 90d + 42d warmup
            end_date=date.today(),
        )
    except Exception:
        return []


def _spacing_rules(primary_discipline: str) -> list[str]:
    """Reglas de spacing entre disciplinas (Millet 2002, Hausswirth 2013)."""
    rules = [
        "No 2 sesiones KEY de disciplinas diferentes en días consecutivos.",
        "La semana de recovery del mesociclo focalizado debe ser recovery en todas las disciplinas.",
    ]
    if primary_discipline == "ciclismo":
        rules.append(
            "Si combinas bike+run el mismo día → siempre bike primero. "
            "Fatiga cruzada bike→run: -12% economía de carrera (Millet 2002, tau=12h)."
        )
    elif primary_discipline == "running":
        rules.append(
            "Evitar sesión KEY de bici el día anterior a KEY running. "
            "La fatiga neuromuscular del ciclismo afecta la economía de carrera (Hausswirth 2013)."
        )
    return rules


def triathlon_analysis(
    db: Session,
    athlete_id: int,
) -> dict[str, Any]:
    """Análisis triatlón completo: identifica disciplina débil y genera consejos.

    Solo compara running vs ciclismo. Natación queda fuera del motor —
    el coach la gestiona manualmente (limitante técnico no resoluble con bloques fisiológicos).

    Returns:
        Dict con disciplina débil, explicación, mesociclo sugerido para primaria,
        consejos para secundaria, y presupuesto de carga.
    """
    from sqlalchemy.orm import joinedload

    athlete = db.scalar(
        select(Athlete)
        .options(
            joinedload(Athlete.sessions),
            joinedload(Athlete.focus_blocks),
            joinedload(Athlete.planned_sessions),
            joinedload(Athlete.targets),
        )
        .where(Athlete.id == athlete_id)
    )
    if athlete is None:
        raise ValueError("Athlete not found")

    analysis = athlete_analysis_payload(db, athlete_id)

    weakness = identify_weakest_discipline(db, athlete_id, analysis, athlete)

    if weakness["disciplina_debil"] is None:
        return {
            "athlete_id": athlete_id,
            "athlete_name": athlete.name,
            "generated_on": date.today(),
            "weakness_analysis": weakness,
            "primary_mesocycle": None,
            "secondary_advice": None,
            "spacing_rules": [],
            "load_budget": None,
            "nota_natacion": (
                "La natación no entra en la comparación automática. "
                "Con los datos actuales, el limitante en natación suele ser técnico "
                "(hidrodinámica, patada, agarre), no metabólico. "
                "Un bloque fisiológico no lo resolvería — recomendamos trabajo técnico continuado."
            ),
        }

    weak_disc = weakness["disciplina_debil"]
    secondary_disc = weakness["disciplina_secundaria"]

    # Generar mesociclo enfocado para la disciplina débil
    primary_meso = recommend_next_mesocycle(db, athlete_id, discipline=weak_disc)
    primary_block = primary_meso["next_recommendation"]["recommended_block_type"]
    season_phase = (
        primary_meso["next_recommendation"].get("physiological_analysis", {}) or {}
    ).get("season_phase", "base_early") or "base_early"

    # Consultar el motor fisiológico de la disciplina SECUNDARIA
    # para saber qué bloque necesita por su propio estado.
    secondary_own_block: Optional[str] = None
    try:
        secondary_meso = recommend_next_mesocycle(db, athlete_id, discipline=secondary_disc)
        secondary_own_block = secondary_meso["next_recommendation"]["recommended_block_type"]
    except Exception:
        pass  # Sin datos suficientes → se usará el techo por defecto

    # Consejos para disciplina secundaria — basados en su propio estado + techo
    secondary_advice = _secondary_discipline_advice(
        primary_block, secondary_disc, season_phase,
        secondary_own_block=secondary_own_block,
    )

    # Presupuesto de carga
    ceiling = _LOAD_CEILING.get(season_phase, 12.0)
    primary_budget = round(ceiling * 0.55, 1)  # 55% para la disciplina focalizada
    secondary_budget = round(ceiling * 0.30, 1)  # 30% para la secundaria
    swim_budget = round(ceiling * 0.15, 1)  # 15% para natación

    load_budget = {
        "techo_semanal": ceiling,
        "fase": season_phase,
        "presupuesto_primaria": {
            "disciplina": weak_disc,
            "eco_weight": _ECO_WEIGHT.get(weak_disc, 1.0),
            "budget": primary_budget,
        },
        "presupuesto_secundaria": {
            "disciplina": secondary_disc,
            "eco_weight": _ECO_WEIGHT.get(secondary_disc, 0.5),
            "budget": secondary_budget,
        },
        "presupuesto_natacion": {
            "disciplina": "natación",
            "eco_weight": 0.75,
            "budget": swim_budget,
        },
    }

    # ── Build integrated triathlon mesocycle draft ────────────────────────────
    from app.services.triathlon_motor import build_triathlon_mesocycle_draft, resolve_swim_block

    secondary_block = secondary_advice.get("bloque_recomendado", "aerobic_capacity_block") if isinstance(secondary_advice, dict) else secondary_advice.bloque_recomendado if hasattr(secondary_advice, "bloque_recomendado") else "aerobic_capacity_block"
    swim_block = resolve_swim_block(season_phase)
    rec = primary_meso["next_recommendation"]
    duration_weeks = rec["duration_weeks"]
    structure = rec.get("structure", f"{duration_weeks - 1}+1")

    # Fetch current training load for projections
    current_ctl = 0.0
    current_atl = 0.0
    current_ctl_by_disc: dict[str, float] = {}
    try:
        from app.services.training_load_calculator import compute_training_load_series
        from app.models.athlete import Athlete as _A
        tl_activities = _get_activities_for_load(db, athlete)
        if tl_activities:
            tl_result = compute_training_load_series(
                db, athlete, tl_activities,
                start_date=date.today() - timedelta(days=90),
                end_date=date.today(),
            )
            current_ctl = tl_result.get("current_ctl", 0.0)
            current_atl = tl_result.get("current_atl", 0.0)
            current_ctl_by_disc = tl_result.get("current_ctl_by_discipline", {})
    except Exception:
        logger.debug("Could not fetch training load for triathlon projection", exc_info=True)

    triathlon_draft = None
    try:
        triathlon_draft = build_triathlon_mesocycle_draft(
            primary_discipline=weak_disc,
            primary_block_type=primary_block,
            secondary_discipline=secondary_disc,
            secondary_block_type=secondary_block,
            swim_block_type=swim_block,
            duration_weeks=duration_weeks,
            structure=structure,
            season_phase=season_phase,
            start_date=date.today(),
            weakness_confidence=weakness.get("confianza", "moderate") if isinstance(weakness, dict) else weakness.confianza if hasattr(weakness, "confianza") else "moderate",
            current_ctl=current_ctl,
            current_atl=current_atl,
            current_ctl_by_discipline=current_ctl_by_disc,
        )
    except Exception:
        logger.warning("Failed to build triathlon mesocycle draft", exc_info=True)

    return {
        "athlete_id": athlete_id,
        "athlete_name": athlete.name,
        "generated_on": date.today(),
        "weakness_analysis": weakness,
        "primary_mesocycle": {
            "discipline": weak_disc,
            "recommended_block_type": primary_block,
            "recommended_block_label": primary_meso["next_recommendation"]["recommended_block_label"],
            "reasoning": primary_meso["next_recommendation"]["reasoning"],
            "risk_flags": primary_meso["next_recommendation"]["risk_flags"],
            "confidence": primary_meso["next_recommendation"]["confidence"],
            "duration_weeks": duration_weeks,
            "mesocycle_draft": primary_meso.get("mesocycle_draft"),
        },
        "secondary_advice": secondary_advice,
        "spacing_rules": _spacing_rules(weak_disc),
        "load_budget": load_budget,
        "nota_natacion": (
            "La natación no entra en la comparación automática. "
            "El limitante en natación suele ser técnico (hidrodinámica, patada, agarre), no metabólico. "
            "Un bloque fisiológico no lo resolvería — recomendamos trabajo técnico continuado con "
            f"presupuesto de carga máximo de {swim_budget} AU/semana."
        ),
        "triathlon_mesocycle": triathlon_draft,
    }
