from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.planned_session import PlannedSession
from app.schemas.planning import (
    AddPlannedSessionRequest,
    ApplyLibraryRequest,
    ApplyPlanRequest,
    AthleteSessionEditRequest,
    BlaCheckUpdateRequest,
    CoachFeedbackRequest,
    CoachSessionEditRequest,
    CoachLibraryCreate,
    CoachLibraryRead,
    CoachPlanCreate,
    CoachPlanDayCreate,
    CoachPlanDayRead,
    CoachPlanRead,
    CoachWorkoutTemplateCreate,
    CoachWorkoutTemplateRead,
    MesocycleRecommendationRead,
    PlanningDetectedMesocycleRead,
    PlanningMesocycleDraftRead,
    PlanningOverviewRead,
    PlanningPlannedSessionRead,
    PlanningWorkoutTemplateRead,
    TargetModeUpdateRequest,
    TriathlonAnalysisRead,
    TriathlonMesocycleRequest,
    TriathlonMesocycleDraftRead,
    WorkoutStepsEditRequest,
)
from app.models.coach_template import CoachLibrary, CoachWorkoutTemplate, CoachPlan, CoachPlanDay
from app.schemas.workout_definition import WorkoutDefinition
from app.services.planning_engine import recommend_next_mesocycle, triathlon_analysis, workout_library_payload
from app.services.planned_session_publication import prepare_planned_session_for_publish
from app.services.workout_definition_builder import build_library_workout_definition, build_workout_definition

router = APIRouter(prefix="/planning", tags=["planning"])


@router.get(
    "/athletes/{athlete_id}/sessions",
    response_model=list[PlanningPlannedSessionRead],
)
def athlete_planned_sessions(
    athlete_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Devuelve TODAS las sesiones planificadas del atleta (todas las disciplinas).
    Endpoint ligero para el calendario del atleta — no ejecuta el motor de planificación.
    """
    from sqlalchemy import select as sa_select
    from app.models.planned_session import PlannedSession as PS

    rows = db.scalars(
        sa_select(PS)
        .where(PS.athlete_id == athlete_id)
        .order_by(PS.scheduled_date, PS.week_index, PS.day_offset)
    ).all()
    return rows


@router.get("/athletes/{athlete_id}/overview", response_model=PlanningOverviewRead)
def planning_overview(
    athlete_id: int,
    discipline: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    # Auto-sync recent Garmin activities if stale (>20 min since last sync)
    from sqlalchemy import select as sa_select
    from app.models.athlete import Athlete
    athlete = db.scalar(sa_select(Athlete).where(Athlete.id == athlete_id))
    if athlete and athlete.garmin_connected:
        from datetime import datetime, timedelta
        stale_threshold = datetime.utcnow() - timedelta(minutes=20)
        if not athlete.garmin_last_sync_at or athlete.garmin_last_sync_at < stale_threshold:
            try:
                from app.services.garmin import sync_garmin_activities
                sync_garmin_activities(db, athlete, days_back=7)
            except Exception:
                pass  # Don't block planning load if sync fails

    try:
        overview = recommend_next_mesocycle(db, athlete_id, discipline=discipline)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # Enrich with threshold staleness warnings
    try:
        from app.services.threshold_cascade import get_threshold_staleness_days, build_threshold_warnings
        staleness = get_threshold_staleness_days(db, athlete_id)
        overview["threshold_staleness"] = staleness
        overview["threshold_warnings"] = build_threshold_warnings(staleness)
    except Exception:
        pass

    return overview


@router.get("/athletes/{athlete_id}/triathlon-analysis", response_model=TriathlonAnalysisRead)
def planning_triathlon_analysis(
    athlete_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Análisis triatlón: identifica disciplina débil (running vs ciclismo) y genera
    mesociclo enfocado + consejos para la disciplina secundaria.
    """
    try:
        return triathlon_analysis(db, athlete_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/athletes/{athlete_id}/triathlon-mesocycle", response_model=TriathlonMesocycleDraftRead)
def create_triathlon_mesocycle(
    athlete_id: int,
    body: TriathlonMesocycleRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Generate integrated triathlon mesocycle draft with 3 disciplines."""
    from datetime import timedelta
    from sqlalchemy import select
    from app.models.athlete import Athlete

    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")

    # Get triathlon analysis for weakness + blocks
    try:
        analysis = triathlon_analysis(db, athlete_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    weakness = analysis.get("weakness_analysis") or {}
    primary_meso = analysis.get("primary_mesocycle") or {}
    secondary_advice = analysis.get("secondary_advice") or {}

    weak_disc = weakness.get("disciplina_debil") if isinstance(weakness, dict) else getattr(weakness, "disciplina_debil", None)
    if not weak_disc:
        raise HTTPException(status_code=400, detail="No weakness detected — cannot generate triathlon mesocycle")

    secondary_disc = weakness.get("disciplina_secundaria") if isinstance(weakness, dict) else getattr(weakness, "disciplina_secundaria", None)
    primary_block = primary_meso.get("recommended_block_type") if isinstance(primary_meso, dict) else getattr(primary_meso, "recommended_block_type", "aerobic_capacity_block")
    secondary_block = secondary_advice.get("bloque_recomendado") if isinstance(secondary_advice, dict) else getattr(secondary_advice, "bloque_recomendado", "aerobic_capacity_block")

    season_phase = "base_early"
    if isinstance(primary_meso, dict):
        pa = (primary_meso.get("physiological_analysis") or {})
        season_phase = pa.get("season_phase", "base_early") or "base_early"

    from app.services.triathlon_motor import build_triathlon_mesocycle_draft, resolve_swim_block

    swim_block = resolve_swim_block(season_phase, body.swim_mode)
    duration_weeks = body.duration_weeks
    structure = f"{duration_weeks - 1}+1"

    # Fetch current training load
    current_ctl = 0.0
    current_atl = 0.0
    try:
        from app.services.training_load_calculator import compute_training_load_series
        from app.services.garmin import list_garmin_activities
        if athlete.garmin_connected:
            activities = list_garmin_activities(
                athlete,
                start_date=body.start_date - timedelta(days=132),
                end_date=body.start_date,
            )
            tl = compute_training_load_series(
                db, athlete, activities,
                start_date=body.start_date - timedelta(days=90),
                end_date=body.start_date,
            )
            current_ctl = tl.get("current_ctl", 0.0)
            current_atl = tl.get("current_atl", 0.0)
    except Exception:
        pass

    draft = build_triathlon_mesocycle_draft(
        primary_discipline=weak_disc,
        primary_block_type=primary_block,
        secondary_discipline=secondary_disc or "ciclismo",
        secondary_block_type=secondary_block,
        swim_block_type=swim_block,
        duration_weeks=duration_weeks,
        structure=structure,
        season_phase=season_phase,
        start_date=body.start_date,
        weakness_confidence=weakness.get("confianza", "moderate") if isinstance(weakness, dict) else "moderate",
        current_ctl=current_ctl,
        current_atl=current_atl,
        ramp_rate=body.ramp_rate_pct,
        custom_tss_split=body.custom_tss_split,
        swim_mode=body.swim_mode,
    )

    # Attach weakness and budget info
    draft["weakness_analysis"] = weakness
    draft["tss_budget"] = analysis.get("load_budget")

    return draft


@router.get("/athletes/{athlete_id}/mesocycles", response_model=list[PlanningDetectedMesocycleRead])
def planning_mesocycles(
    athlete_id: int,
    discipline: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        return recommend_next_mesocycle(db, athlete_id, discipline=discipline)["detected_mesocycles"]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/athletes/{athlete_id}/recommendation", response_model=MesocycleRecommendationRead)
def planning_recommendation(
    athlete_id: int,
    discipline: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        return recommend_next_mesocycle(db, athlete_id, discipline=discipline)["next_recommendation"]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/athletes/{athlete_id}/workout-library", response_model=list[PlanningWorkoutTemplateRead])
def planning_workout_library(
    athlete_id: int,
    discipline: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        return recommend_next_mesocycle(db, athlete_id, discipline=discipline)["workout_library"]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/workout-library", response_model=list[PlanningWorkoutTemplateRead])
def planning_general_workout_library(
    discipline: str,
    _: User = Depends(get_current_user),
):
    return workout_library_payload(discipline)


@router.get("/athletes/{athlete_id}/mesocycle-draft", response_model=PlanningMesocycleDraftRead)
def planning_mesocycle_draft(
    athlete_id: int,
    discipline: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        return recommend_next_mesocycle(db, athlete_id, discipline=discipline)["mesocycle_draft"]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/planned-sessions/{session_id}/workout-definition-preview",
    response_model=WorkoutDefinition,
)
def planning_workout_definition_preview(
    session_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = db.get(PlannedSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    if session.structured_workout_payload:
        return WorkoutDefinition(**session.structured_workout_payload)
    return build_workout_definition(session)


@router.post(
    "/planned-sessions/{session_id}/prepare-publish",
    response_model=PlanningPlannedSessionRead,
)
def planning_prepare_planned_session_publish(
    session_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = db.get(PlannedSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    prepare_planned_session_for_publish(session, db=db)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get(
    "/workout-library/{template_id}/structured-preview",
    response_model=WorkoutDefinition,
)
def planning_workout_library_structured_preview(
    template_id: str,
    discipline: str = Query(...),
    source: str = Query(..., pattern="^(dose|example)$"),
    dose_step: Optional[int] = Query(None, ge=1),
    label: Optional[str] = Query(None),
    _: User = Depends(get_current_user),
):
    try:
        return build_library_workout_definition(
            discipline=discipline,
            template_id=template_id,
            source=source,
            dose_step=dose_step,
            label=label,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch(
    "/planned-sessions/{session_id}/bla-check",
    response_model=PlanningPlannedSessionRead,
)
def toggle_bla_check(
    session_id: int,
    body: BlaCheckUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Activa o desactiva el BLa check de una sesión planificada.
    Cuando está activo, el atleta verá el prompt de medición de lactato durante esa sesión.
    """
    session = db.get(PlannedSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    session.bla_check = body.bla_check
    db.commit()
    db.refresh(session)
    return session


@router.patch(
    "/planned-sessions/{session_id}/coach-feedback",
    response_model=PlanningPlannedSessionRead,
)
def submit_coach_feedback(
    session_id: int,
    body: CoachFeedbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit post-workout feedback and rating from coach.

    Sets coach_feedback, coach_feedback_at, and execution_rating on the planned session.
    Only accessible by coach role.
    """
    if current_user.role != "coach":
        raise HTTPException(status_code=403, detail="Solo el entrenador puede enviar feedback.")
    session = db.get(PlannedSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sesion no encontrada.")

    VALID_RATINGS = {"excellent", "good", "acceptable", "poor"}
    if body.rating is not None and body.rating not in VALID_RATINGS:
        raise HTTPException(status_code=422, detail=f"Rating invalido. Opciones: {', '.join(sorted(VALID_RATINGS))}")

    from datetime import datetime, timezone
    if body.feedback is not None:
        session.coach_feedback = body.feedback.strip() or None
    if body.rating is not None:
        session.execution_rating = body.rating
    session.coach_feedback_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    return session


@router.patch(
    "/planned-sessions/{session_id}/target-mode",
    response_model=PlanningPlannedSessionRead,
)
def update_target_mode(
    session_id: int,
    body: TargetModeUpdateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Switch between pace/HR/power targets for a planned session.

    Regenerates the structured_workout_payload with the new target type
    resolved from the athlete's active training zones.
    """
    if body.target_mode not in ("pace", "hr", "power"):
        raise HTTPException(status_code=422, detail="target_mode debe ser 'pace', 'hr' o 'power'.")

    session = db.get(PlannedSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    session.target_mode = body.target_mode
    # Regenerate workout with new target mode (skip coach-edited)
    prepare_planned_session_for_publish(session, db=db, target_mode=body.target_mode)
    db.commit()
    db.refresh(session)
    return session


@router.post(
    "/athletes/{athlete_id}/auto-generate-zones",
)
def auto_generate_training_zones(
    athlete_id: int,
    discipline: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Auto-generate training zones for an athlete from their thresholds.

    If zones already exist, returns them without changes.
    If generated, returns the new zone set with a warning for the coach.
    """
    from app.services.zone_generator import ensure_zones_for_athlete

    zone_set, warning = ensure_zones_for_athlete(db, athlete_id, discipline)
    db.commit()

    return {
        "zone_set_id": zone_set.id if zone_set else None,
        "auto_generated": warning is not None,
        "warning": warning,
    }


@router.patch(
    "/planned-sessions/{session_id}/coach-edit",
    response_model=PlanningPlannedSessionRead,
)
def coach_edit_planned_session(
    session_id: int,
    body: CoachSessionEditRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Permite al entrenador ajustar nota, peldaño de dosis o swap de sesión.

    - coach_note: texto libre del entrenador sobre la sesión.
    - dose_step_override: peldaño manual (None = usar el calculado por el motor).
    - swapped_template_id: template_id alternativo si el entrenador cambia la sesión.
    """
    session = db.get(PlannedSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    print(f"[coach-edit] session_id={session_id} body={body.model_dump()}")
    if body.coach_note is not None:
        session.coach_note = body.coach_note
    if body.dose_step_override is not None:
        session.dose_step_override = body.dose_step_override
    if body.swapped_template_id is not None:
        session.swapped_template_id = body.swapped_template_id
    if body.scheduled_date is not None:
        from datetime import date as date_type
        session.scheduled_date = date_type.fromisoformat(body.scheduled_date)
        print(f"[coach-edit] scheduled_date updated to {session.scheduled_date}")
    if body.public_label is not None:
        session.public_label = body.public_label.strip()
    prepare_planned_session_for_publish(session, db=db)
    db.commit()
    db.refresh(session)
    print(f"[coach-edit] after refresh: scheduled_date={session.scheduled_date}")
    return session


@router.patch(
    "/planned-sessions/{session_id}/athlete-edit",
    response_model=PlanningPlannedSessionRead,
)
def athlete_edit_planned_session(
    session_id: int,
    body: AthleteSessionEditRequest,
    db: Session = Depends(get_db),
):
    """Permite al atleta editar título, nota personal, fecha y hora de una sesión."""
    session = db.get(PlannedSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    if body.public_label is not None:
        session.public_label = body.public_label.strip()
    if body.athlete_note is not None:
        session.athlete_note = body.athlete_note.strip() or None
    if body.scheduled_date is not None:
        from datetime import date as date_type
        session.scheduled_date = date_type.fromisoformat(body.scheduled_date)
    if body.scheduled_time is not None:
        # Validate HH:MM format
        import re
        if body.scheduled_time == "":
            session.scheduled_time = None
        elif re.match(r"^\d{2}:\d{2}$", body.scheduled_time):
            session.scheduled_time = body.scheduled_time
        else:
            raise HTTPException(status_code=422, detail="Formato de hora inválido. Usa HH:MM.")
    db.commit()
    db.refresh(session)
    return session


@router.post(
    "/planned-sessions",
    response_model=PlanningPlannedSessionRead,
    status_code=201,
)
def add_planned_session(
    body: AddPlannedSessionRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Añade una sesión planificada individual (desde biblioteca o manual)."""
    from datetime import date as date_type

    session = PlannedSession(
        athlete_id=body.athlete_id,
        focus_block_id=None,
        scheduled_date=date_type.fromisoformat(body.scheduled_date),
        discipline=body.discipline,
        week_index=0,
        day_offset=0,
        session_role=body.session_role or "support",
        session_family=body.session_family or "manual",
        workout_template_id=body.template_id,
        public_label=body.public_label,
        objective=body.objective or "",
        dose_prescription="Manual",
        coach_note=body.coach_note,
        confidence=0.5,
        status="planned",
        bla_check=body.bla_check,
        payload={
            "added_manually": True,
            "dose_step_index": body.dose_step,
        },
    )
    db.add(session)
    db.flush()
    if body.template_id:
        prepare_planned_session_for_publish(session, db=db)
    db.commit()
    db.refresh(session)
    return session


@router.delete(
    "/planned-sessions/{session_id}",
    status_code=204,
)
def delete_planned_session(
    session_id: int,
    db: Session = Depends(get_db),
):
    """Elimina una sesión planificada."""
    session = db.get(PlannedSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    db.delete(session)
    db.commit()
    return None


@router.patch(
    "/planned-sessions/{session_id}/workout-steps",
    response_model=PlanningPlannedSessionRead,
)
def edit_workout_steps(
    session_id: int,
    body: WorkoutStepsEditRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Guarda una WorkoutDefinition editada manualmente por el entrenador.

    - Persiste el payload estructurado tal cual lo envía el frontend.
    - Marca ``publish_status = "ready"`` (listo para exportar a Garmin).
    - El ``source_payload`` se enriquece con ``coach_edited: true``.
    """
    session = db.get(PlannedSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    edited = body.workout.model_copy(
        update={
            "source_session_id": session.id,
            "source_payload": {
                **body.workout.source_payload,
                "coach_edited": True,
            },
        }
    )
    from datetime import datetime, timezone

    session.structured_workout_payload = edited.model_dump()
    session.publish_status = "ready"
    session.publish_error = None
    session.structured_workout_generated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    return session


@router.post(
    "/athletes/{athlete_id}/refresh-stale-targets",
)
def refresh_stale_targets(
    athlete_id: int,
    discipline: str = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Bulk refresh all stale-target planned sessions for an athlete.

    Optionally filter by discipline. Returns summary with counts.
    """
    from app.services.threshold_cascade import cascade_threshold_update

    disciplines = [discipline] if discipline else ["running", "ciclismo", "natación"]
    total_summary: dict = {"refreshed": 0, "needs_republish": 0, "skipped_coach_edited": 0}

    for disc in disciplines:
        result = cascade_threshold_update(db, athlete_id, disc)
        for key in total_summary:
            total_summary[key] += result.get(key, 0)

    db.commit()
    return total_summary


@router.post(
    "/planned-sessions/{session_id}/republish",
    response_model=PlanningPlannedSessionRead,
)
def republish_planned_session(
    session_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Re-publish a session that needs republishing after threshold changes.

    Regenerates structured workout and resets publish_status to 'ready'.
    """
    session = db.get(PlannedSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sesion no encontrada.")
    prepare_planned_session_for_publish(session, db=db)
    session.targets_stale = False
    db.commit()
    db.refresh(session)
    return session


# ── Coach Libraries & Workout Templates ────────────────────────────────────────


@router.get("/coach-libraries", response_model=list[CoachLibraryRead])
def list_coach_libraries(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lista todas las bibliotecas del entrenador con sus entrenos."""
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload

    query = (
        select(CoachLibrary)
        .where(CoachLibrary.user_id == user.id)
        .options(joinedload(CoachLibrary.workouts))
        .order_by(CoachLibrary.name)
    )
    return db.scalars(query).unique().all()


@router.post("/coach-libraries", response_model=CoachLibraryRead, status_code=201)
def create_coach_library(
    body: CoachLibraryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Crea una nueva biblioteca de entrenos."""
    library = CoachLibrary(
        user_id=user.id,
        name=body.name,
        description=body.description,
        discipline=body.discipline,
    )
    db.add(library)
    db.commit()
    db.refresh(library)
    return library


@router.delete("/coach-libraries/{library_id}", status_code=204)
def delete_coach_library(
    library_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Elimina una biblioteca y todos sus entrenos."""
    library = db.get(CoachLibrary, library_id)
    if library is None or library.user_id != user.id:
        raise HTTPException(status_code=404, detail="Library not found")
    db.delete(library)
    db.commit()


@router.post("/coach-libraries/{library_id}/workouts", response_model=CoachWorkoutTemplateRead, status_code=201)
def add_workout_to_library(
    library_id: int,
    body: CoachWorkoutTemplateCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Añade un entreno a una biblioteca."""
    library = db.get(CoachLibrary, library_id)
    if library is None or library.user_id != user.id:
        raise HTTPException(status_code=404, detail="Library not found")

    max_order = max((w.sort_order for w in library.workouts), default=-1) + 1
    workout = CoachWorkoutTemplate(
        library_id=library_id,
        user_id=user.id,
        day_offset=body.day_offset,
        discipline=body.discipline,
        session_family=body.session_family,
        public_label=body.public_label,
        objective=body.objective,
        intensity_zone=body.intensity_zone,
        duration_min=body.duration_min,
        description=body.description,
        sort_order=max_order,
    )
    db.add(workout)
    db.commit()
    db.refresh(workout)
    return workout


@router.delete("/coach-libraries/{library_id}/workouts/{workout_id}", status_code=204)
def delete_workout_from_library(
    library_id: int,
    workout_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Elimina un entreno de una biblioteca."""
    workout = db.get(CoachWorkoutTemplate, workout_id)
    if workout is None or workout.library_id != library_id or workout.user_id != user.id:
        raise HTTPException(status_code=404, detail="Workout not found")
    db.delete(workout)
    db.commit()


@router.post("/coach-libraries/{library_id}/apply", response_model=list[PlanningPlannedSessionRead], status_code=201)
def apply_library_to_athlete(
    library_id: int,
    body: ApplyLibraryRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Aplica una biblioteca semanal a un atleta: crea PlannedSessions según day_offset desde start_date."""
    from datetime import date as date_type, timedelta
    from sqlalchemy.orm import joinedload

    library = db.get(CoachLibrary, library_id)
    if library is None or library.user_id != user.id:
        raise HTTPException(status_code=404, detail="Library not found")

    start = date_type.fromisoformat(body.start_date)
    created = []
    for workout in library.workouts:
        session = PlannedSession(
            athlete_id=body.athlete_id,
            focus_block_id=None,
            scheduled_date=start + timedelta(days=workout.day_offset),
            discipline=workout.discipline,
            week_index=0,
            day_offset=workout.day_offset,
            session_role="support",
            session_family=workout.session_family,
            workout_template_id=None,
            public_label=workout.public_label,
            objective=workout.objective or "",
            dose_prescription=f"Biblioteca: {library.name}",
            coach_note=workout.description,
            confidence=0.5,
            status="planned",
            bla_check=False,
            payload={
                "added_from_coach_library": True,
                "library_id": library.id,
                "library_name": library.name,
            },
        )
        db.add(session)
        created.append(session)

    db.commit()
    for s in created:
        db.refresh(s)
    return created


# ── Coach Training Plans ─────────────────────────────────────────────────────

@router.get("/coach-plans", response_model=list[CoachPlanRead])
def list_coach_plans(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lista todos los planes del entrenador."""
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload
    query = (
        select(CoachPlan)
        .where(CoachPlan.user_id == user.id)
        .options(joinedload(CoachPlan.days))
        .order_by(CoachPlan.name)
    )
    return db.scalars(query).unique().all()


@router.post("/coach-plans", response_model=CoachPlanRead, status_code=201)
def create_coach_plan(
    body: CoachPlanCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Crea un nuevo plan de entrenamiento."""
    plan = CoachPlan(
        user_id=user.id,
        name=body.name,
        description=body.description,
        duration_weeks=body.duration_weeks,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.patch("/coach-plans/{plan_id}", response_model=CoachPlanRead)
def update_coach_plan(
    plan_id: int,
    body: CoachPlanCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Actualiza nombre, descripción o duración de un plan."""
    plan = db.get(CoachPlan, plan_id)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Plan not found")
    plan.name = body.name
    plan.description = body.description
    plan.duration_weeks = body.duration_weeks
    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/coach-plans/{plan_id}", status_code=204)
def delete_coach_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Elimina un plan y todas sus sesiones."""
    plan = db.get(CoachPlan, plan_id)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Plan not found")
    db.delete(plan)
    db.commit()


@router.post("/coach-plans/{plan_id}/days", response_model=CoachPlanDayRead, status_code=201)
def add_day_to_plan(
    plan_id: int,
    body: CoachPlanDayCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Añade una sesión a un día del plan."""
    plan = db.get(CoachPlan, plan_id)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Plan not found")
    max_order = max((d.sort_order for d in plan.days), default=-1) + 1
    day = CoachPlanDay(
        plan_id=plan_id,
        user_id=user.id,
        day_number=body.day_number,
        discipline=body.discipline,
        session_family=body.session_family,
        public_label=body.public_label,
        objective=body.objective,
        intensity_zone=body.intensity_zone,
        duration_min=body.duration_min,
        description=body.description,
        sort_order=max_order,
    )
    db.add(day)
    db.commit()
    db.refresh(day)
    return day


@router.delete("/coach-plans/{plan_id}/days/{day_id}", status_code=204)
def delete_day_from_plan(
    plan_id: int,
    day_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Elimina una sesión de un plan."""
    day = db.get(CoachPlanDay, day_id)
    if day is None or day.plan_id != plan_id or day.user_id != user.id:
        raise HTTPException(status_code=404, detail="Day not found")
    db.delete(day)
    db.commit()


@router.post("/coach-plans/{plan_id}/apply", response_model=list[PlanningPlannedSessionRead], status_code=201)
def apply_plan_to_athlete(
    plan_id: int,
    body: ApplyPlanRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Aplica un plan a un atleta: crea PlannedSessions para cada día del plan desde start_date."""
    from datetime import date as date_type, timedelta

    plan = db.get(CoachPlan, plan_id)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Plan not found")

    start = date_type.fromisoformat(body.start_date)
    created = []
    for day in plan.days:
        session = PlannedSession(
            athlete_id=body.athlete_id,
            focus_block_id=None,
            scheduled_date=start + timedelta(days=day.day_number),
            discipline=day.discipline,
            week_index=day.day_number // 7,
            day_offset=day.day_number % 7,
            session_role="support",
            session_family=day.session_family,
            workout_template_id=None,
            public_label=day.public_label,
            objective=day.objective or "",
            dose_prescription=f"Plan: {plan.name}",
            coach_note=day.description,
            confidence=0.5,
            status="planned",
            bla_check=False,
            payload={
                "added_from_coach_plan": True,
                "plan_id": plan.id,
                "plan_name": plan.name,
            },
        )
        db.add(session)
        created.append(session)

    db.commit()
    for s in created:
        db.refresh(s)
    return created


# ── Lap matching for lactate overlay ──────────────────────────


def _extract_work_steps(payload: dict | None) -> list[dict]:
    """Extract flat list of work intervals from structured_workout_payload."""
    if not payload or "steps" not in payload:
        return []
    result = []
    for step in payload["steps"]:
        st = step.get("step_type", "")
        if st == "repeat":
            for child in step.get("children", []):
                cst = child.get("step_type", "")
                if cst in ("interval", "steady"):
                    result.append(child)
        elif st in ("interval", "steady"):
            result.append(step)
    return result


def _match_laps_to_steps(
    work_steps: list[dict], laps: list[dict], tolerance_s: int = 10
) -> list[dict | None]:
    """Try to find a contiguous subsequence of laps matching work_steps by duration ±tolerance.

    Returns a list parallel to work_steps: matched lap dict or None.
    """
    n_steps = len(work_steps)
    n_laps = len(laps)
    if n_steps == 0 or n_laps < n_steps:
        return [None] * n_steps

    step_durations = [s.get("length_value") or 0 for s in work_steps]

    for start in range(n_laps - n_steps + 1):
        all_match = True
        for i in range(n_steps):
            lap_dur = laps[start + i].get("elapsed_time_seconds") or laps[start + i].get("moving_time_seconds") or 0
            if abs(lap_dur - step_durations[i]) > tolerance_s:
                all_match = False
                break
        if all_match:
            return [laps[start + i] for i in range(n_steps)]

    return [None] * n_steps


@router.get("/planned-sessions/{session_id}/lap-match")
def planned_session_lap_match(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Match planned work intervals with Garmin laps for lactate overlay.

    Returns steps with Garmin HR/pace pre-filled if laps match (±10s), empty otherwise.
    """
    from sqlalchemy import select as sa_select
    from app.models.garmin_activity import GarminActivity

    ps = db.get(PlannedSession, session_id)
    if not ps:
        raise HTTPException(404, "Planned session not found")

    # Auth: athlete can only access own sessions
    if user.role == "athlete":
        if not user.athlete_id or user.athlete_id != ps.athlete_id:
            raise HTTPException(403, "Access denied")

    work_steps = _extract_work_steps(ps.structured_workout_payload)
    discipline = ps.discipline or "running"

    result_steps = []
    matched = False

    if ps.linked_activity_id and work_steps:
        # Find the Garmin activity
        activity = db.scalar(
            sa_select(GarminActivity).where(
                GarminActivity.provider_activity_id == ps.linked_activity_id
            )
        )
        if not activity:
            activity = db.scalar(
                sa_select(GarminActivity).where(
                    GarminActivity.planned_session_id == ps.id
                )
            )

        laps = []
        if activity and activity.raw_summary:
            laps = activity.raw_summary.get("laps", [])

        lap_matches = _match_laps_to_steps(work_steps, laps)
        matched = any(m is not None for m in lap_matches)

        for i, step in enumerate(work_steps):
            lap = lap_matches[i]
            duration_s = step.get("length_value") or 0
            entry: dict = {
                "order": i + 1,
                "planned_duration_s": duration_s,
                "intensity_label": step.get("intensity_label") or step.get("target", {}).get("label") or "",
                "garmin_matched": lap is not None,
            }
            if lap:
                speed = lap.get("average_speed_m_s")
                entry["hr_avg"] = round(lap["average_heartrate"]) if lap.get("average_heartrate") else None
                entry["power_watts"] = round(lap["average_watts"]) if lap.get("average_watts") else None
                if speed and speed > 0 and discipline == "running":
                    entry["pace_seconds_per_km"] = round(1000.0 / speed)
                elif speed and speed > 0 and discipline == "natación":
                    entry["pace_seconds_per_100m"] = round(100.0 / speed)
                else:
                    entry["pace_seconds_per_km"] = None
            else:
                entry["hr_avg"] = None
                entry["power_watts"] = None
                entry["pace_seconds_per_km"] = None

            result_steps.append(entry)
    elif work_steps:
        for i, step in enumerate(work_steps):
            result_steps.append({
                "order": i + 1,
                "planned_duration_s": step.get("length_value") or 0,
                "intensity_label": step.get("intensity_label") or step.get("target", {}).get("label") or "",
                "garmin_matched": False,
                "hr_avg": None,
                "power_watts": None,
                "pace_seconds_per_km": None,
            })

    return {
        "planned_session_id": ps.id,
        "discipline": discipline,
        "scheduled_date": str(ps.scheduled_date),
        "dose_prescription": ps.dose_prescription,
        "matched": matched,
        "n_work_steps": len(work_steps),
        "steps": result_steps,
    }
