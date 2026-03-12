from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.user import User
from app.schemas.athlete_health import AthleteHealthOverviewRead
from app.services.athlete_health import build_athlete_health_overview

router = APIRouter(prefix="/athlete-health", tags=["athlete-health"])


@router.get("/athletes/{athlete_id}/overview", response_model=AthleteHealthOverviewRead)
def athlete_health_overview(
    athlete_id: int,
    days: int = Query(28, ge=7, le=84),
    include_activity: bool = Query(True),
    include_raw_wellness: bool = Query(True),
    refresh_live_health: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AthleteHealthOverviewRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    return AthleteHealthOverviewRead(
        **build_athlete_health_overview(
            db,
            athlete,
            days=days,
            include_activity=include_activity,
            include_raw_wellness=include_raw_wellness,
            refresh_live_health=refresh_live_health,
        )
    )


def _resolve_target_athlete(db: Session, user: User, athlete_id: int) -> Athlete:
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Athlete not found")

    if user.role == "athlete":
        if user.athlete_id != athlete_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Athlete user can only access their own athlete health data")
        return athlete

    if user.role == "coach":
        return athlete

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Athlete health is not available for this role")
