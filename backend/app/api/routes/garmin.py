from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.user import User
from app.schemas.garmin import GarminActivitiesPreviewResponse, GarminActivityRead, GarminConnectRequest, GarminConnectResponse
from app.services.garmin import GarminRequestError, connect_garmin_account, get_garmin_activity_detail, list_garmin_activities

router = APIRouter(prefix="/garmin", tags=["garmin"])


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
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

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
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return GarminActivityRead(**activity)


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
