from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.planned_session import PlannedSession
from app.schemas.planning import (
    BlaCheckUpdateRequest,
    CoachSessionEditRequest,
    MesocycleRecommendationRead,
    PlanningDetectedMesocycleRead,
    PlanningMesocycleDraftRead,
    PlanningOverviewRead,
    PlanningPlannedSessionRead,
    PlanningWorkoutTemplateRead,
)
from app.services.planning_engine import recommend_next_mesocycle, workout_library_payload

router = APIRouter(prefix="/planning", tags=["planning"])


@router.get("/athletes/{athlete_id}/overview", response_model=PlanningOverviewRead)
def planning_overview(
    athlete_id: int,
    discipline: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        return recommend_next_mesocycle(db, athlete_id, discipline=discipline)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
    if body.coach_note is not None:
        session.coach_note = body.coach_note
    if body.dose_step_override is not None:
        session.dose_step_override = body.dose_step_override
    if body.swapped_template_id is not None:
        session.swapped_template_id = body.swapped_template_id
    db.commit()
    db.refresh(session)
    return session
