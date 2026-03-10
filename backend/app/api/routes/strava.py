from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.user import User
from app.schemas.strava import StravaActivitiesImportResponse
from app.services.strava import list_strava_activities

router = APIRouter(prefix="/strava", tags=["strava"])


@router.get("/athletes/{athlete_id}/activities", response_model=StravaActivitiesImportResponse)
def get_athlete_strava_activities(
    athlete_id: int,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StravaActivitiesImportResponse:
    athlete = _resolve_target_athlete(db, user, athlete_id)

    try:
        activities = list_strava_activities(db, athlete, start_date=start_date, end_date=end_date)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return StravaActivitiesImportResponse(
        athlete_id=athlete.id,
        athlete_name=athlete.name,
        start_date=start_date,
        end_date=end_date,
        imported_count=len(activities),
        activities=activities,
    )


def _resolve_target_athlete(db: Session, user: User, athlete_id: int) -> Athlete:
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Athlete not found")

    if user.role == "athlete":
        if user.athlete_id != athlete_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Athlete user can only access their own Strava data")
        return athlete

    if user.role == "coach":
        return athlete

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Strava activity import is not available for this role")
