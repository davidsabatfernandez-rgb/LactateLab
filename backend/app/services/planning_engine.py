from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.athlete import Athlete
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
            "aerobic_power_block",
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


def _score_block_candidates(
    *,
    days_to_target: Optional[int],
    previous_major: Optional[str],
    evaluation_signal: str,
    robustness: str,
    recent_session_count: int,
    discipline: str,
) -> list[BlockCandidate]:
    """Puntúa cada tipo de bloque candidato con reglas explícitas y auditables.

    Cada regla que suma o resta puntos deja una razón o contraindicación textual.
    No hay puntos base por defecto: solo se puntúa evidencia contextual real.
    El ganador es el bloque con mayor puntuación — el entrenador puede auditar
    todos los candidatos y sus razones.
    """

    def _candidate(block_type: str) -> BlockCandidate:
        return BlockCandidate(block_type=block_type, score=0.0)

    candidates: dict[str, BlockCandidate] = {
        bt: _candidate(bt)
        for bt in (
            "aerobic_capacity_block",
            "threshold_development_block",
            "aerobic_power_block",
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

    # ── technical_rebuild_block ───────────────────────────────────────────────
    if discipline == "natación":
        add("technical_rebuild_block", 15, "En natación la técnica condiciona directamente la utilidad de la carga fisiológica.")
    if previous_major == "aerobic_capacity_block" and robustness == "low":
        add("technical_rebuild_block", 10, "Base incipiente con poca robustez: reforzar técnica y economía antes de subir carga.")

    return sorted(candidates.values(), key=lambda c: c.score, reverse=True)


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
        )
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
        "planned_sessions": _planned_sessions_for_discipline(athlete, selected_discipline),
        "detected_mesocycles": serialize_detected_mesocycles(detected_mesocycles),
        "next_recommendation": recommendation_payload,
        "recommended_workouts": recommended_workouts,
        "workout_library": workout_library,
        "mesocycle_draft": mesocycle_draft,
        "warnings": risk_flags,
        "explanation": explanation,
    }
