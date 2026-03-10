from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta
import re
from typing import Any, Optional

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models.athlete import Athlete, AthleteFocusBlock, AthleteTarget
from app.models.planned_session import PlannedSession
from app.models.session import Session as AthleteSession
from app.services.mesocycle_library import mesocycle_template_by_id, select_mesocycle_template
from app.services.planning_taxonomy import infer_session_taxonomy
from app.services.workout_library import DraftSlot, WorkoutTemplate, WORKOUT_BLUEPRINTS, WORKOUT_TEMPLATES, evidence_for_ids, validate_microcycle_spacing


@dataclass(frozen=True)
class FamilyTolerance:
    """Estado de tolerancia de un atleta a una familia de sesión concreta.

    Se construye desde el historial de planned_sessions, no desde texto libre.
    Sirve como input para Patch 3 (selección de peldaño en dose_ladder).
    """

    family_id: str
    recent_exposures: int       # sesiones de esta familia en las últimas 6 semanas
    historical_exposures: int   # total histórico de sesiones planificadas de esta familia
    last_response: str          # "positive" | "negative" | "unclear" | "none"
    tolerance_level: str        # "low" (0-1 rec.) | "medium" (2-3) | "high" (≥4)
    last_dose_step: Optional[int]  # último peldaño usado (del payload de PlannedSession)


@dataclass(frozen=True)
class AthletePlanningState:
    # ── Campos originales (no tocar: backward compatible) ─────────────────────
    recent_session_count: int
    robustness: str
    goal_horizon: str
    dominant_recent_block: Optional[str]
    last_response: str
    curve_direction: str
    summary: str
    # ── Campos nuevos Patch 2 (todos con default) ─────────────────────────────
    weekly_sessions_baseline: int = 0
    """Promedio de sesiones semanales en la ventana de 42 días."""
    blocks_completed_recently: int = 0
    """Bloques completados en esta disciplina en los últimos 90 días."""
    last_block_type: Optional[str] = None
    """block_type del último bloque completado (para scoring de transición)."""
    current_macro_phase: str = "base"
    """Fase macro según distancia al objetivo: 'base' | 'build' | 'specific' | 'taper'."""
    family_tolerance: Optional[dict[str, FamilyTolerance]] = None
    """Tolerancia por familia de sesión. None = sin historial de planned sessions."""
    last_lactate_test_days_ago: Optional[int] = None
    """Días desde el último test de perfil aeróbico/anaeróbico. None = sin test."""
    block_validation_signal: str = "none"
    """Señal de validación del bloque activo: 'improving' | 'stable' | 'degrading' | 'none'."""
    technical_constraint: Optional[str] = None
    """Limitante técnica detectada: 'swim_technique' | 'run_economy' | None."""


def _discipline_workout_type(discipline: str) -> str:
    return {
        "running": "Run",
        "ciclismo": "Bike",
        "natación": "Swim",
    }.get(discipline, discipline)


def _days_to_target(target_date: Optional[date], reference_date: date) -> Optional[int]:
    if target_date is None:
        return None
    return (target_date - reference_date).days


def _goal_horizon(days_to_target: Optional[int]) -> str:
    if days_to_target is None:
        return "open"
    if days_to_target <= 28:
        return "close"
    if days_to_target <= 63:
        return "specific"
    if days_to_target <= 112:
        return "build"
    return "base"


def _curve_direction(block_type: str) -> str:
    if block_type == "aerobic_capacity_block":
        return "Expandir estabilidad subumbral y desplazar LT1 en la dirección del objetivo."
    if block_type == "threshold_development_block":
        return "Acercar LT2 al objetivo aumentando tiempo útil sostenible con coste controlado."
    if block_type == "aerobic_power_block":
        return "Elevar la parte alta del sistema aeróbico sin perder el soporte de LT1/LT2."
    if block_type == "competition_specific_block":
        return "Transferir la curva actual al ritmo, potencia o coste real de la prueba objetivo."
    if block_type == "technical_rebuild_block":
        return "Limpiar una limitante técnica que impide expresar mejor la curva fisiológica."
    return "Bajar fatiga y releer el estado para decidir la siguiente dirección de la curva."


def _normalize_response(direction: Optional[str]) -> str:
    if direction in {"up", "positive", "improving"}:
        return "positive"
    if direction in {"down", "negative", "degrading"}:
        return "negative"
    return "unclear"


def _resolve_block_type(block: AthleteFocusBlock, discipline: str) -> str:
    template = mesocycle_template_by_id(block.template_id)
    if template:
        return template.block_type

    objective = (block.block_objective or "").lower()
    focus = (block.energy_system_focus or "").lower()
    phase = (block.phase or "").lower()

    if "recuper" in objective or "relect" in objective or "recovery" in focus or phase == "descarga":
        return "recovery_consolidation_block"
    if "compet" in objective or "compet" in phase or "espec" in phase or "specific" in focus:
        return "competition_specific_block"
    if "vo2" in objective:
        return "aerobic_power_block"
    if any(term in objective for term in ("lt2", "ftp", "umbral", "css")):
        return "threshold_development_block"
    if "técn" in objective or "tecn" in objective or "technique" in focus:
        return "technical_rebuild_block"
    if discipline == "natación" and "aerób" not in objective and "lt1" not in objective and "lt2" not in objective:
        return "technical_rebuild_block"
    return "aerobic_capacity_block"


def _recent_sessions_for_discipline(athlete: Athlete, discipline: str, reference_date: date) -> list[AthleteSession]:
    return [
        session
        for session in athlete.sessions
        if session.discipline == discipline and 0 <= (reference_date - session.performed_at.date()).days <= 42
    ]


def _dominant_recent_block_hint(sessions: list[AthleteSession], discipline: str) -> Optional[str]:
    counter: Counter[str] = Counter()
    workout_type = _discipline_workout_type(discipline)
    for session in sessions:
        inferred = infer_session_taxonomy(
            title=session.goal,
            description=session.comments,
            coach_comments=session.session_type,
            workout_type=workout_type,
        )
        counter[inferred.block_type_hint] += 1
    if not counter:
        return None
    return counter.most_common(1)[0][0]


def _current_macro_phase(days_to_target: Optional[int]) -> str:
    """Fase macro del macrociclo según distancia temporal al objetivo."""
    if days_to_target is None:
        return "base"
    if days_to_target <= 28:
        return "taper"
    if days_to_target <= 63:
        return "specific"
    if days_to_target <= 112:
        return "build"
    return "base"


def _last_completed_block_type(athlete: Athlete, discipline: str) -> Optional[str]:
    """Devuelve el block_type del último bloque no-activo de esta disciplina."""
    completed = [
        block
        for block in (athlete.focus_blocks or [])
        if (block.priority_discipline or athlete.primary_discipline) == discipline
        and block.status != "active"
        and (block.end_date or block.start_date)
    ]
    if not completed:
        return None
    latest = max(completed, key=lambda b: b.end_date or b.start_date)
    return _resolve_block_type(latest, discipline)


def _blocks_completed_recently(athlete: Athlete, discipline: str, reference_date: date) -> int:
    """Cuenta bloques no-activos de esta disciplina en los últimos 90 días."""
    cutoff = reference_date - timedelta(days=90)
    return sum(
        1
        for block in (athlete.focus_blocks or [])
        if (block.priority_discipline or athlete.primary_discipline) == discipline
        and block.status != "active"
        and (block.end_date or block.start_date) >= cutoff
    )


def _last_lactate_test_days_ago(
    athlete: Athlete, discipline: str, reference_date: date
) -> Optional[int]:
    """Días desde el último test de perfil aeróbico/anaeróbico en esta disciplina."""
    workout_type = _discipline_workout_type(discipline)
    test_types = {"test_aerobic_profile", "test_anaerobic_profile"}
    for session in sorted(
        athlete.sessions or [], key=lambda s: s.performed_at, reverse=True
    ):
        if session.discipline != discipline:
            continue
        inferred = infer_session_taxonomy(
            title=session.goal,
            description=session.comments,
            coach_comments=session.session_type,
            workout_type=workout_type,
        )
        if inferred.canonical_session_type in test_types:
            days = (reference_date - session.performed_at.date()).days
            if 0 <= days <= 365:
                return days
    return None


def _build_family_tolerance_profile(
    athlete: Athlete,
    discipline: str,
    reference_date: date,
    *,
    evaluation_direction: Optional[str] = None,
) -> dict[str, FamilyTolerance]:
    """Construye el perfil de tolerancia por familia desde el historial de planned_sessions.

    - recent_exposures: planificadas en los últimos 42 días (6 semanas)
    - historical_exposures: total histórico
    - last_dose_step: extraído del payload.dose_step_index (Patch 3+)
    - tolerance_level: bucket simple basado en exposiciones recientes
    - last_response: señal de evaluación del bloque activo aplicada a familias usadas
      recientemente. Familias sin exposiciones recientes conservan "unclear".
    """
    recent_cutoff = reference_date - timedelta(days=42)
    planned = getattr(athlete, "planned_sessions", None) or []

    recent_by_family: Counter[str] = Counter()
    historical_by_family: Counter[str] = Counter()
    last_dose_step_by_family: dict[str, Optional[int]] = {}

    for ps in planned:
        if ps.discipline != discipline:
            continue
        family = ps.session_family
        if not family:
            continue

        historical_by_family[family] += 1

        if ps.scheduled_date >= recent_cutoff:
            recent_by_family[family] += 1

        # Peldaño de dosis del último planned_session de esta familia (Patch 3+)
        if family not in last_dose_step_by_family:
            payload = ps.payload or {}
            last_dose_step_by_family[family] = payload.get("dose_step_index")

    # Normalizar la señal de evaluación una sola vez
    normalized_eval = _normalize_response(evaluation_direction)

    all_families = set(historical_by_family) | set(recent_by_family)
    profile: dict[str, FamilyTolerance] = {}
    for family in all_families:
        recent = recent_by_family.get(family, 0)
        historical = historical_by_family.get(family, 0)
        tolerance = "low" if recent <= 1 else "medium" if recent <= 3 else "high"

        # La señal de evaluación del bloque se propaga solo a familias usadas recientemente.
        # Una familia sin exposiciones recientes no puede haber respondido a este bloque.
        if recent > 0 and normalized_eval != "unclear":
            family_response = normalized_eval
        else:
            family_response = "unclear"

        profile[family] = FamilyTolerance(
            family_id=family,
            recent_exposures=recent,
            historical_exposures=historical,
            last_response=family_response,
            tolerance_level=tolerance,
            last_dose_step=last_dose_step_by_family.get(family),
        )
    return profile


def _block_validation_signal(evaluation_direction: Optional[str]) -> str:
    """Normaliza la señal de validación del bloque activo."""
    if evaluation_direction in {"up", "positive", "improving"}:
        return "improving"
    if evaluation_direction in {"down", "negative", "degrading"}:
        return "degrading"
    if evaluation_direction in {"stable", "neutral"}:
        return "stable"
    return "none"


def summarize_athlete_state(
    athlete: Athlete,
    discipline: str,
    block_type: str,
    *,
    reference_date: date,
    target_date: Optional[date] = None,
    evaluation_direction: Optional[str] = None,
) -> AthletePlanningState:
    recent_sessions = _recent_sessions_for_discipline(athlete, discipline, reference_date)
    recent_count = len(recent_sessions)
    robustness = "low" if recent_count <= 4 else "medium" if recent_count <= 8 else "high"
    days_to_target = _days_to_target(target_date, reference_date)
    goal_horizon = _goal_horizon(days_to_target)
    dominant_recent_block = _dominant_recent_block_hint(recent_sessions, discipline)
    last_response = _normalize_response(evaluation_direction)
    curve_direction = _curve_direction(block_type)

    # ── Campos Patch 2 ────────────────────────────────────────────────────────
    macro_phase = _current_macro_phase(days_to_target)
    blocks_completed = _blocks_completed_recently(athlete, discipline, reference_date)
    last_block = _last_completed_block_type(athlete, discipline)
    last_lactate = _last_lactate_test_days_ago(athlete, discipline, reference_date)
    family_tol = _build_family_tolerance_profile(
        athlete, discipline, reference_date, evaluation_direction=evaluation_direction
    )
    validation_signal = _block_validation_signal(evaluation_direction)
    weekly_baseline = round(recent_count / 6) if recent_count > 0 else 0

    summary = (
        f"{recent_count} sesiones recientes en {discipline}, robustez {robustness}, "
        f"fase {macro_phase}, horizonte {goal_horizon} y señal {validation_signal}."
    )
    return AthletePlanningState(
        recent_session_count=recent_count,
        robustness=robustness,
        goal_horizon=goal_horizon,
        dominant_recent_block=dominant_recent_block,
        last_response=last_response,
        curve_direction=curve_direction,
        summary=summary,
        # Patch 2
        weekly_sessions_baseline=weekly_baseline,
        blocks_completed_recently=blocks_completed,
        last_block_type=last_block,
        current_macro_phase=macro_phase,
        family_tolerance=family_tol if family_tol else None,
        last_lactate_test_days_ago=last_lactate,
        block_validation_signal=validation_signal,
    )


def _blueprint_for(discipline: str, block_type: str) -> dict[str, tuple]:
    return WORKOUT_BLUEPRINTS.get((discipline, block_type)) or {
        "load": (DraftSlot(2, "test_profile_anchor"), DraftSlot(5, "recovery_regeneration")),
        "build": (DraftSlot(2, "recovery_regeneration"),),
        "recovery": (DraftSlot(2, "recovery_regeneration"), DraftSlot(5, "test_profile_anchor")),
    }


def _phase_sequence(
    structure: str,
    duration_weeks: int,
    block_type: str,
    work_weeks: int,
    recovery_weeks: int,
) -> list[str]:
    match = re.search(r"(\d+)\s*\+\s*(\d+)", structure or "")
    if match:
        cycle_recovery = max(int(match.group(2)), 0)
    else:
        cycle_recovery = recovery_weeks

    if duration_weeks <= 0:
        return []

    tail_recovery = 0
    if duration_weeks > 1:
        requested_recovery = max(recovery_weeks, cycle_recovery)
        tail_recovery = min(max(requested_recovery, 1), duration_weeks - 1)

    work_span = max(1, duration_weeks - tail_recovery)
    phases = ["load"]
    phases.extend(["build"] * max(work_span - 1, 0))
    phases.extend(["recovery"] * tail_recovery)

    if block_type == "competition_specific_block":
        for index in range(len(phases) - 1, -1, -1):
            if phases[index] != "recovery":
                phases[index] = "specific"
                break

    return phases[:duration_weeks]


def _week_load_label(phase: str) -> str:
    return {
        "load": "acumulación",
        "build": "construcción",
        "specific": "especificidad",
        "recovery": "descarga",
    }.get(phase, "construcción")


def _progression_note(session_family: str, phase: str, week_index: int, state: AthletePlanningState) -> str:
    if phase == "load":
        return f"Semana {week_index}: introducir {session_family} con dosis conservadora y comparabilidad alta."
    if phase == "build":
        return f"Semana {week_index}: progresar una sola palanca de {session_family} respetando la robustez {state.robustness}."
    if phase == "specific":
        return f"Semana {week_index}: acercar {session_family} al objetivo con señal limpia y sin vaciar al atleta."
    return f"Semana {week_index}: consolidar con {session_family} y bajar ruido para releer la respuesta."


def _expected_signal(template, phase: str) -> str:
    if phase == "recovery":
        return "Debe bajar el coste fisiológico y mejorar la sensación de frescura."
    return template.expected_adaptations[0] if template.expected_adaptations else "Esperar una adaptación específica y medible."


def _base_selection_index(template, phase: str, state: AthletePlanningState) -> int:
    max_index = max(len(template.csv_examples) - 1, 0)
    index = {"load": 0, "build": 1, "specific": 2, "recovery": 0}.get(phase, 0)
    index = min(index, max_index)

    if template.session_role in {"support", "recovery"}:
        index = min(index, 1 if max_index >= 1 else 0)
    if state.robustness == "low":
        index = max(0, index - 1)
    if state.last_response == "negative":
        index = 0
    if state.goal_horizon == "close" and phase == "specific" and template.session_role == "key":
        index = max(index, min(max_index, 2))
    if state.dominant_recent_block == _resolve_template_block_hint(template.template_id) and template.session_role == "key" and phase == "build":
        index = min(max_index, index + 1)

    return min(index, max_index)


def _selection_index(
    template,
    phase: str,
    state: AthletePlanningState,
    *,
    prior_exposures: int,
    last_index: Optional[int],
) -> int:
    max_index = max(len(template.csv_examples) - 1, 0)
    base_index = _base_selection_index(template, phase, state)

    if last_index is None or prior_exposures == 0:
        return min(base_index, max_index)

    if phase == "recovery":
        return max(0, min(base_index, last_index - 1 if last_index > 0 else 0))

    step_up = 1 if template.session_role in {"key", "support"} else 0
    if phase == "specific" and template.session_role == "key":
        step_up = max(step_up, 1)

    progressed_index = min(max_index, last_index + step_up)
    return min(max_index, max(base_index, progressed_index))


def _resolve_template_block_hint(template_id: Optional[str]) -> Optional[str]:
    for discipline, block_type in WORKOUT_BLUEPRINTS:
        if any(slot.template_id == template_id for slots in WORKOUT_BLUEPRINTS[(discipline, block_type)].values() for slot in slots):
            return block_type
    return None


def _selection_reason(template, phase: str, state: AthletePlanningState, index: int) -> list[str]:
    reasons = [
        f"Dirección del bloque: {state.curve_direction}",
        f"Robustez reciente {state.robustness} con {state.recent_session_count} sesiones en 42 días.",
        f"Fase de la semana: {_week_load_label(phase)}.",
    ]
    if state.goal_horizon != "open":
        reasons.append(f"Horizonte al objetivo: {state.goal_horizon}.")
    if state.last_response != "unclear":
        reasons.append(f"Respuesta del bloque previo: {state.last_response}.")
    reasons.append(f"Se usa el ejemplo preescrito #{index + 1} de la familia {template.session_family}.")
    return reasons


def _select_dose_step(
    template: WorkoutTemplate,
    phase: str,
    state: AthletePlanningState,
    *,
    last_step_in_block: Optional[int] = None,
):
    """Selecciona el peldaño adecuado del dose_ladder.

    Prioridad de decisión (descendente):
    1. Señal degradando → bajar 1.
    2. Respuesta negativa del bloque → no subir.
    3. Semana de recovery → bajar 2.
    4. Cap por robustez (low→3, medium→5, high→max).
    5. Check de readiness: si peldaño requiere 'fresh' y robustez low → buscar uno más bajo.
    6. Progresión normal por phase y exposición previa.
    """
    ladder = template.dose_ladder
    max_step = max(s.step for s in ladder)
    step_map = {s.step: s for s in ladder}

    # ── Determinar el último peldaño de referencia ────────────────────────────
    # Primero miramos el tracking intra-bloque (semana anterior de esta generación);
    # si no existe, miramos el historial persistido en la DB.
    effective_last: Optional[int] = None
    if last_step_in_block and last_step_in_block >= 1:
        effective_last = last_step_in_block
    else:
        fam_tol = (state.family_tolerance or {}).get(template.session_family)
        if fam_tol and fam_tol.last_dose_step and fam_tol.last_dose_step >= 1:
            effective_last = fam_tol.last_dose_step

    # ── Calcular peldaño objetivo según phase ─────────────────────────────────
    if effective_last is None:
        # Sin historial: empezar conservador
        target = 1 if state.robustness == "low" or phase == "recovery" else 2
    elif phase == "recovery":
        target = max(1, effective_last - 2)
    elif phase == "load":
        # Primer ciclo de carga: ligeramente por debajo del máximo previo
        target = max(1, effective_last - 1)
    elif phase == "build":
        target = effective_last + 1
    elif phase == "specific":
        # Fase específica: mantener o subir uno si hay buena señal
        target = effective_last + (1 if state.block_validation_signal == "improving" else 0)
    else:
        target = effective_last

    # ── Señal degradante: bajar uno ───────────────────────────────────────────
    if state.block_validation_signal == "degrading":
        target = max(1, target - 1)

    # ── Respuesta negativa: no progresar ──────────────────────────────────────
    if state.last_response == "negative" and effective_last is not None:
        target = min(target, effective_last)

    # ── Cap por robustez ──────────────────────────────────────────────────────
    robustness_cap = {"low": 3, "medium": 5}.get(state.robustness, max_step)
    target = min(target, robustness_cap)

    # ── Clamp al rango válido ─────────────────────────────────────────────────
    target = max(1, min(target, max_step))
    selected = step_map.get(target, ladder[0])

    # ── Readiness check: peldaño requiere 'fresh' pero robustez es baja ───────
    if selected.readiness_required == "fresh" and state.robustness == "low" and phase not in ("recovery",):
        for candidate_step in range(target - 1, 0, -1):
            candidate = step_map.get(candidate_step)
            if candidate and candidate.readiness_required != "fresh":
                selected = candidate
                break
        else:
            selected = step_map.get(1, ladder[0])

    return selected


def _dose_step_reasons(
    template: WorkoutTemplate,
    phase: str,
    state: AthletePlanningState,
    selected,  # DoseStep
    effective_last: Optional[int],
) -> list[str]:
    """Genera razones auditables para el peldaño seleccionado del dose_ladder."""
    max_step = max(s.step for s in template.dose_ladder)
    reasons = [
        f"Dirección del bloque: {state.curve_direction}",
        f"Robustez {state.robustness} · {state.recent_session_count} sesiones en 42d · fase macro {state.current_macro_phase}.",
        f"Semana: {_week_load_label(phase)} · señal de bloque: {state.block_validation_signal}.",
        f"Dosis: peldaño {selected.step}/{max_step} — {selected.label} ({selected.total_useful_time_min}' útiles, zona {selected.intensity_zone}).",
    ]
    if effective_last:
        move = selected.step - effective_last
        if move > 0:
            reasons.append(f"Progresión desde peldaño {effective_last} (+{move}).")
        elif move < 0:
            reasons.append(f"Descenso desde peldaño {effective_last} ({move}).")
        else:
            reasons.append(f"Consolidación en peldaño {effective_last} (sin cambio).")
    fam_tol = (state.family_tolerance or {}).get(template.session_family)
    if fam_tol:
        reasons.append(
            f"Tolerancia histórica a {template.session_family}: {fam_tol.tolerance_level} "
            f"({fam_tol.recent_exposures} rec. / {fam_tol.historical_exposures} total)."
        )
    if selected.readiness_required == "fresh":
        reasons.append("Este peldaño requiere estado fresco — verificar recuperación previa.")
    if selected.notes:
        reasons.append(f"Nota: {selected.notes}")
    return reasons


def _prescribed_dose(
    template,
    phase: str,
    state: AthletePlanningState,
    *,
    prior_exposures: int,
    last_index: Optional[int],
) -> tuple[str, list[str], int]:
    # ── Rama dose_ladder (Patch 3) ────────────────────────────────────────────
    if template.dose_ladder:
        selected = _select_dose_step(
            template, phase, state, last_step_in_block=last_index
        )
        # Reconstituir effective_last para el mensaje de razones
        effective_last: Optional[int] = last_index if (last_index and last_index >= 1) else None
        if effective_last is None:
            fam_tol = (state.family_tolerance or {}).get(template.session_family)
            if fam_tol and fam_tol.last_dose_step:
                effective_last = fam_tol.last_dose_step
        reasons = _dose_step_reasons(template, phase, state, selected, effective_last)
        return selected.label, reasons, selected.step

    # ── Rama csv_examples (fallback, todos los templates sin dose_ladder) ─────
    if not template.csv_examples:
        return template.dose_guidance, _selection_reason(template, phase, state, 0), 0
    index = _selection_index(
        template,
        phase,
        state,
        prior_exposures=prior_exposures,
        last_index=last_index,
    )
    return template.csv_examples[index], _selection_reason(template, phase, state, index), index


def build_prewritten_mesocycle_draft(
    *,
    discipline: str,
    block_type: str,
    block_label: str,
    structure: str,
    duration_weeks: int,
    work_weeks: int,
    recovery_weeks: int,
    primary_focus: str,
    secondary_focus: Optional[str] = None,
    start_date: Optional[date] = None,
    athlete: Optional[Athlete] = None,
    target_date: Optional[date] = None,
    evaluation_direction: Optional[str] = None,
) -> dict[str, Any]:
    library = {template.template_id: template for template in WORKOUT_TEMPLATES}
    blueprints = _blueprint_for(discipline, block_type)
    resolved_start = start_date or date.today()
    state = summarize_athlete_state(
        athlete,
        discipline,
        block_type,
        reference_date=resolved_start,
        target_date=target_date,
        evaluation_direction=evaluation_direction,
    ) if athlete else AthletePlanningState(
        recent_session_count=0,
        robustness="low",
        goal_horizon=_goal_horizon(_days_to_target(target_date, resolved_start)),
        dominant_recent_block=None,
        last_response=_normalize_response(evaluation_direction),
        curve_direction=_curve_direction(block_type),
        summary="Sin histórico suficiente; se usa una preescritura conservadora.",
    )

    phases = _phase_sequence(structure, duration_weeks, block_type, work_weeks, recovery_weeks)
    draft_weeks: list[dict[str, Any]] = []
    template_usage_counts: Counter[str] = Counter()
    template_last_indices: dict[str, int] = {}

    for week_index, phase in enumerate(phases, start=1):
        slots = blueprints.get(phase) or blueprints.get("build") or blueprints.get("load") or blueprints.get("recovery") or ()
        sessions: list[dict[str, Any]] = []
        weekly_controls: list[str] = []
        for slot in slots:
            template = library[slot.template_id]
            evidence = evidence_for_ids(template.evidence_ids)
            weekly_controls.extend(template.control_points[:2])
            prior_exposures = template_usage_counts[template.template_id]
            last_index = template_last_indices.get(template.template_id)
            dose_prescription, selection_reason, selected_index = _prescribed_dose(
                template,
                phase,
                state,
                prior_exposures=prior_exposures,
                last_index=last_index,
            )
            template_usage_counts[template.template_id] += 1
            template_last_indices[template.template_id] = selected_index
            scheduled_date = resolved_start + timedelta(days=(week_index - 1) * 7 + slot.day_offset - 1)
            sessions.append(
                {
                    "session_id": f"{discipline}-{block_type}-w{week_index}-d{slot.day_offset}-{template.template_id}",
                    "scheduled_date": scheduled_date,
                    "week_index": week_index,
                    "day_offset": slot.day_offset,
                    "template_id": template.template_id,
                    "session_role": template.session_role,
                    "session_family": template.session_family,
                    "public_label": template.public_label,
                    "objective": template.objective,
                    "dose_prescription": dose_prescription,
                    "dose_guidance": template.dose_guidance,
                    "progression_note": _progression_note(template.session_family, phase, week_index, state),
                    "expected_signal": _expected_signal(template, phase),
                    "coach_note": template.summary,
                    "confidence": template.confidence,
                    "evidence_source_ids": [item.source_id for item in evidence],
                    "csv_examples": list(template.csv_examples[:3]),
                    "selection_reason": selection_reason,
                    "payload": {
                        "state_summary": state.summary,
                        "curve_direction": state.curve_direction,
                        "selected_example_index": selected_index if not template.dose_ladder else None,
                        "dose_step_index": selected_index if template.dose_ladder else None,
                        "goal_horizon": state.goal_horizon,
                        "robustness": state.robustness,
                        "macro_phase": state.current_macro_phase,
                        "block_validation_signal": state.block_validation_signal,
                    },
                }
            )

        # ── Validación de compatibilidad del microciclo (no bloqueante) ──────
        # fatigue_cost es un descriptor estructural del tipo de sesión, no una
        # medición real de fatiga. El lactato valida el bloque (2x/mesociclo),
        # no el estado diario. Los warnings son orientativos para el entrenador.
        spacing_slots = [(slot.day_offset, library[slot.template_id]) for slot in slots]
        spacing_warnings = validate_microcycle_spacing(spacing_slots)

        draft_weeks.append(
            {
                "week_index": week_index,
                "theme": f"{primary_focus} · {_week_load_label(phase)}",
                "load_type": _week_load_label(phase),
                "objective": primary_focus,
                "rationale": (
                    f"La semana {week_index} mueve la preparación hacia {primary_focus.lower()} "
                    f"usando una dosis preescrita compatible con {state.summary.lower()}"
                ),
                "sessions": sessions,
                "control_points": list(dict.fromkeys(weekly_controls))[:4],
                "spacing_warnings": spacing_warnings,
            }
        )

    return {
        "discipline": discipline,
        "block_type": block_type,
        "block_label": block_label,
        "structure": structure,
        "duration_weeks": duration_weeks,
        "primary_focus": primary_focus,
        "secondary_focus": secondary_focus,
        "foundations": [
            "El bloque se preescribe desde una librería curada de familias repetibles, no desde combinaciones abiertas.",
            "La dirección fisiológica manda sobre la variedad: cada semana busca mover la curva en una sola dirección principal.",
            "El lactato actúa como validación puntual del bloque, no como volante diario de cada sesión.",
            "La dosis concreta se resuelve con ejemplos preescritos según robustez reciente, fase del bloque y proximidad al objetivo.",
        ],
        "progression_rules": [
            "Progresar un solo escalón de ejemplo por semana cuando la respuesta lo permita.",
            "Mantener al menos una sesión ancla comparable dentro del bloque.",
            "Usar la descarga para releer el estado, no para esconder otra semana media.",
            "Si la señal interna se ensucia antes de tiempo, consolidar en vez de forzar.",
        ],
        "state_summary": state.summary,
        "curve_direction": state.curve_direction,
        "weeks": draft_weeks,
    }


def create_planned_sessions_for_block(
    db: Session,
    athlete: Athlete,
    block: AthleteFocusBlock,
    *,
    target: Optional[AthleteTarget] = None,
    evaluation_direction: Optional[str] = None,
) -> list[PlannedSession]:
    discipline = block.priority_discipline or athlete.primary_discipline
    block_type = _resolve_block_type(block, discipline)
    template = mesocycle_template_by_id(block.template_id) or select_mesocycle_template(discipline, block_type)
    duration_weeks = max(1, ((block.end_date or block.start_date) - block.start_date).days // 7 + 1)
    work_weeks = max(1, duration_weeks - 1) if duration_weeks > 1 else 1
    recovery_weeks = 1 if duration_weeks > 1 else 0
    block_label = template.public_label if template else block.block_objective
    structure = template.typical_structure if template else ("1+1" if duration_weeks <= 2 else "2+1")
    primary_focus = template.primary_focus if template else block.energy_system_focus
    secondary_focus = template.secondary_focus if template else None
    target_date = block.target_date or (target.target_date if target else None)

    draft = build_prewritten_mesocycle_draft(
        discipline=discipline,
        block_type=block_type,
        block_label=block_label,
        structure=structure,
        duration_weeks=duration_weeks,
        work_weeks=work_weeks,
        recovery_weeks=recovery_weeks,
        primary_focus=primary_focus,
        secondary_focus=secondary_focus,
        start_date=block.start_date,
        athlete=athlete,
        target_date=target_date,
        evaluation_direction=evaluation_direction,
    )

    db.execute(delete(PlannedSession).where(PlannedSession.focus_block_id == block.id))

    created: list[PlannedSession] = []
    for week in draft["weeks"]:
        for session in week["sessions"]:
            planned_session = PlannedSession(
                athlete_id=athlete.id,
                focus_block_id=block.id,
                scheduled_date=session["scheduled_date"],
                discipline=discipline,
                week_index=session["week_index"],
                day_offset=session["day_offset"],
                session_role=session["session_role"],
                session_family=session["session_family"],
                workout_template_id=session["template_id"],
                public_label=session["public_label"],
                objective=session["objective"],
                dose_prescription=session["dose_prescription"],
                dose_guidance=session["dose_guidance"],
                progression_note=session["progression_note"],
                expected_signal=session["expected_signal"],
                coach_note=session["coach_note"],
                confidence=session["confidence"],
                status="planned",
                payload={
                    **session["payload"],
                    "selection_reason": session["selection_reason"],
                    "csv_examples": session["csv_examples"],
                    "block_type": block_type,
                    "block_label": block_label,
                },
            )
            db.add(planned_session)
            created.append(planned_session)
    return created
