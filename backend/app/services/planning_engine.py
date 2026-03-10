from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.athlete import Athlete
from app.models.planned_session import PlannedSession
from app.models.session import Session as AthleteSession
from app.services.analytics import athlete_analysis_payload
from app.services.mesocycle_library import FOUNDATION_PILLARS, select_mesocycle_template, templates_for_discipline
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


def _eval_signal(direction: Optional[str]) -> str:
    """Normaliza la dirección de evaluación a señal interna del motor."""
    if direction in {"up", "positive", "improving"}:
        return "improving"
    if direction in {"down", "negative", "degrading"}:
        return "degrading"
    if direction in {"stable", "neutral"}:
        return "stable"
    return "none"


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
    add("aerobic_capacity_block", 30, "Opción base universal; siempre defensible.")
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
    add("threshold_development_block", 25, "Bloque de alto impacto en rendimiento; bien ubicado en el ciclo.")
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
    add("aerobic_power_block", 15, "Bloque potente y corto; útil cuando la base y el umbral están asentados.")
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
    add("competition_specific_block", 5, "Disponible siempre; solo relevante cuando el objetivo está cerca.")
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
    add("recovery_consolidation_block", 5, "Válvula de seguridad: siempre disponible, necesario cuando hay fatiga acumulada.")
    if evaluation_signal == "degrading":
        add("recovery_consolidation_block", 40, "Señal claramente negativa: consolidar antes de apretar es la única opción segura.")
    if evaluation_signal == "stable" and previous_major not in {None, "recovery_consolidation_block"}:
        add("recovery_consolidation_block", 10, "Señal estable tras bloque exigente: breve descarga puede revelar adaptación.")
    if recent_session_count == 0:
        sub("recovery_consolidation_block", 20, "Sin carga reciente: no hay nada que consolidar ahora.")
    if robustness == "high" and evaluation_signal != "degrading":
        sub("recovery_consolidation_block", 5, "Atleta robusto con señal aceptable: no necesita descarga ahora.")

    # ── technical_rebuild_block ───────────────────────────────────────────────
    add("technical_rebuild_block", 5, "Disponible cuando hay limitantes técnicas que frenan la expresión fisiológica.")
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

    # ── Scoring de candidatos (Patch 5) ───────────────────────────────────────
    robustness = "low" if len(recent_sessions) <= 4 else "medium" if len(recent_sessions) <= 8 else "high"
    evaluation_signal = _eval_signal(current_evaluation.get("direction") if current_evaluation else None)

    scored_candidates = _score_block_candidates(
        days_to_target=days_to_target,
        previous_major=previous_major,
        evaluation_signal=evaluation_signal,
        robustness=robustness,
        recent_session_count=len(recent_sessions),
        discipline=selected_discipline,
    )
    winner = scored_candidates[0]
    recommended_type = winner.block_type
    reasoning: list[str] = winner.reasons[:]
    risk_flags: list[str] = winner.contraindications[:]
    control_points: list[str] = []
    progression_rules: list[str] = []

    # ── Risk flags globales ───────────────────────────────────────────────────
    if len(recent_sessions) <= 4:
        risk_flags.append("Muestra reciente escasa: conviene un bloque corto y conservador.")
    if next_target is None:
        risk_flags.append("No hay target próximo cargado; la recomendación se apoya en histórico y bloque activo.")
    if not sessions:
        risk_flags.append("Hay muy pocos datos por disciplina; la recomendación es orientativa.")

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
        "confidence": round(min(0.9, 0.58 + len(recent_sessions) * 0.03 + (0.06 if current_evaluation else 0)), 2),
        "reasoning": reasoning,
        "key_session_families": key_session_families,
        "control_points": control_points,
        "progression_rules": progression_rules,
        "entry_checks": entry_checks,
        "exit_checks": exit_checks,
        "risk_flags": risk_flags,
        "next_target": next_target,
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
            "robustness": robustness,
            "evaluation_signal": evaluation_signal,
            "previous_major": previous_major,
            "days_to_target": days_to_target,
        },
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
