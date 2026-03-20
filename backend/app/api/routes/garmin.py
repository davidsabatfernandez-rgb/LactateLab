from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.user import User
from app.models.planned_session import PlannedSession
from app.schemas.garmin import GarminActivitiesPreviewResponse, GarminActivityRead, GarminActivityStoredRead, GarminConnectRequest, GarminConnectResponse, GarminPushWorkoutResponse, GarminSyncResponse, GarminSyncStatusResponse
from app.services.garmin import GarminRequestError, connect_garmin_account, get_garmin_activity_detail, get_stored_activities, list_garmin_activities, push_workout_to_garmin, sync_garmin_activities

router = APIRouter(prefix="/garmin", tags=["garmin"])


def _garmin_http_status(exc: GarminRequestError) -> int:
    """Map Garmin errors to HTTP status codes that won't trigger auth logout on the frontend."""
    if exc.status_code in (401, 403):
        return 502  # Bad Gateway — upstream (Garmin) auth failed, not our auth
    return exc.status_code


@router.post("/athletes/{athlete_id}/connect", response_model=GarminConnectResponse)
def connect_athlete_garmin(
    athlete_id: int,
    payload: GarminConnectRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GarminConnectResponse:
    athlete = _resolve_target_athlete(db, user, athlete_id)

    try:
        connected = connect_garmin_account(
            db,
            athlete_id=athlete.id,
            email=payload.email,
            password=payload.password,
            mfa_code=payload.mfa_code,
        )
    except GarminRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    # Auto-sync last 7 days right after connecting (best-effort)
    if connected.garmin_connected:
        try:
            import logging
            logging.getLogger(__name__).info("Auto-syncing 7 days after Garmin connect for athlete %s", connected.id)
            sync_garmin_activities(db, connected, days_back=7)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("Auto-sync after connect failed for athlete %s: %s", connected.id, exc)

    return GarminConnectResponse(
        athlete_id=connected.id,
        garmin_user_id=connected.garmin_user_id or 0,
        garmin_email=connected.garmin_email or payload.email,
        connected=connected.garmin_connected,
    )


@router.get("/athletes/{athlete_id}/preview", response_model=GarminActivitiesPreviewResponse)
def preview_athlete_garmin_activities(
    athlete_id: int,
    start_date: date = Query(...),
    end_date: date = Query(...),
    include_full_detail: bool = Query(False),
    activity_limit: Optional[int] = Query(None, ge=1, le=10),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GarminActivitiesPreviewResponse:
    athlete = _resolve_target_athlete(db, user, athlete_id)

    try:
        activities = list_garmin_activities(
            db,
            athlete,
            start_date=start_date,
            end_date=end_date,
            include_full_detail=include_full_detail,
            activity_limit=activity_limit,
        )
    except GarminRequestError as exc:
        raise HTTPException(status_code=_garmin_http_status(exc), detail=str(exc)) from exc

    return GarminActivitiesPreviewResponse(
        athlete_id=athlete.id,
        athlete_name=athlete.name,
        start_date=start_date,
        end_date=end_date,
        imported_count=len(activities),
        activities=activities,
    )


@router.get("/athletes/{athlete_id}/activities/{activity_id}", response_model=GarminActivityRead)
def get_athlete_garmin_activity_detail(
    athlete_id: int,
    activity_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GarminActivityRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)

    try:
        activity = get_garmin_activity_detail(db, athlete, activity_id)
    except GarminRequestError as exc:
        raise HTTPException(status_code=_garmin_http_status(exc), detail=str(exc)) from exc
    except (ValueError, Exception) as exc:
        raise HTTPException(status_code=502, detail=f"Error fetching Garmin activity detail: {exc}") from exc

    return GarminActivityRead(**activity)


@router.post("/athletes/{athlete_id}/push-workout/{session_id}", response_model=GarminPushWorkoutResponse)
def push_planned_workout_to_garmin(
    athlete_id: int,
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GarminPushWorkoutResponse:
    """Push a planned session's structured workout to Garmin Connect."""
    athlete = _resolve_target_athlete(db, user, athlete_id)

    planned = db.scalar(
        select(PlannedSession).where(
            PlannedSession.id == session_id,
            PlannedSession.athlete_id == athlete_id,
        )
    )
    if planned is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planned session not found")

    workout_payload = planned.structured_workout_payload
    if not workout_payload or not isinstance(workout_payload, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This session has no structured workout. Generate or edit the workout first.",
        )

    scheduled_date = planned.scheduled_date.isoformat() if planned.scheduled_date else None

    try:
        result = push_workout_to_garmin(
            db,
            athlete,
            workout_payload,
            scheduled_date=scheduled_date,
        )
    except GarminRequestError as exc:
        raise HTTPException(status_code=_garmin_http_status(exc), detail=str(exc)) from exc

    # Update publish status
    planned.publish_status = "published"
    planned.publish_provider = "garmin"
    db.add(planned)
    db.commit()

    return GarminPushWorkoutResponse(
        session_id=planned.id,
        garmin_workout_id=result.get("workoutId"),
        status="published",
    )


def _resolve_target_athlete(db: Session, user: User, athlete_id: int) -> Athlete:
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Athlete not found")

    if user.role == "athlete":
        if user.athlete_id != athlete_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Athlete user can only access their own Garmin data")
        return athlete

    if user.role == "coach":
        return athlete

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Garmin beta is not available for this role")


@router.get("/athletes/{athlete_id}/sync-status", response_model=GarminSyncStatusResponse)
def garmin_sync_status(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Check Garmin connection and sync staleness for an athlete."""
    from datetime import datetime, timedelta
    athlete = _resolve_target_athlete(db, user, athlete_id)
    connected = bool(athlete.garmin_connected)
    last_sync = athlete.garmin_last_sync_at if connected else None
    stale = True
    if connected and last_sync:
        stale = last_sync < datetime.utcnow() - timedelta(minutes=20)
    return GarminSyncStatusResponse(
        connected=connected,
        last_sync_at=last_sync,
        stale=stale,
        garmin_email=athlete.garmin_email if connected else None,
    )


@router.post("/athletes/{athlete_id}/sync", response_model=GarminSyncResponse)
def sync_athlete_garmin(
    athlete_id: int,
    days_back: int = Query(56, ge=7, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manual sync: import Garmin activities into DB. Default 56 days (8 weeks)."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    if not athlete.garmin_connected:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Atleta no tiene Garmin conectado")

    try:
        result = sync_garmin_activities(db, athlete, days_back=days_back)
    except GarminRequestError as exc:
        raise HTTPException(status_code=_garmin_http_status(exc), detail=str(exc)) from exc

    # Enrich with synced flag and last_sync_at
    result["synced"] = True
    result["last_sync_at"] = athlete.garmin_last_sync_at
    return result


@router.get("/athletes/{athlete_id}/stored-activities", response_model=list[GarminActivityStoredRead])
def list_stored_activities(
    athlete_id: int,
    start_date: str = Query(None),
    end_date: str = Query(None),
    discipline: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get stored Garmin activities from local DB (no Garmin API call)."""
    _resolve_target_athlete(db, user, athlete_id)
    return get_stored_activities(db, athlete_id, start_date, end_date, discipline)
