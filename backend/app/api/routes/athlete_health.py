from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.user import User
from app.models.wellness_checkin import WellnessCheckIn
from app.schemas.athlete_health import AthleteHealthOverviewRead, WellnessCheckInCreate, WellnessCheckInRead
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


@router.post("/athletes/{athlete_id}/wellness-checkins", response_model=WellnessCheckInRead, status_code=status.HTTP_201_CREATED)
def create_wellness_checkin(
    athlete_id: int,
    payload: WellnessCheckInCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WellnessCheckInRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    # Upsert: replace if same date exists
    existing = db.scalar(
        select(WellnessCheckIn).where(
            WellnessCheckIn.athlete_id == athlete.id,
            WellnessCheckIn.check_date == payload.check_date,
        )
    )
    if existing:
        existing.fatigue = payload.fatigue
        existing.soreness = payload.soreness
        existing.mood = payload.mood
        existing.sleep_quality = payload.sleep_quality
        existing.notes = payload.notes
        db.commit()
        db.refresh(existing)
        checkin = existing
    else:
        checkin = WellnessCheckIn(
            athlete_id=athlete.id,
            check_date=payload.check_date,
            fatigue=payload.fatigue,
            soreness=payload.soreness,
            mood=payload.mood,
            sleep_quality=payload.sleep_quality,
            notes=payload.notes,
        )
        db.add(checkin)
        db.commit()
        db.refresh(checkin)
    avg = (checkin.fatigue + checkin.soreness + checkin.mood + checkin.sleep_quality) / 4
    return WellnessCheckInRead(
        id=checkin.id,
        athlete_id=checkin.athlete_id,
        check_date=checkin.check_date,
        fatigue=checkin.fatigue,
        soreness=checkin.soreness,
        mood=checkin.mood,
        sleep_quality=checkin.sleep_quality,
        notes=checkin.notes,
        created_at=checkin.created_at,
        average=round(avg, 2),
    )


@router.get("/athletes/{athlete_id}/wellness-checkins", response_model=list[WellnessCheckInRead])
def list_wellness_checkins(
    athlete_id: int,
    days: int = Query(28, ge=1, le=90),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[WellnessCheckInRead]:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from datetime import timedelta
    cutoff = date_type.today() - timedelta(days=days)
    rows = db.scalars(
        select(WellnessCheckIn)
        .where(WellnessCheckIn.athlete_id == athlete.id, WellnessCheckIn.check_date >= cutoff)
        .order_by(WellnessCheckIn.check_date.desc())
    ).all()
    result = []
    for c in rows:
        avg = (c.fatigue + c.soreness + c.mood + c.sleep_quality) / 4
        result.append(WellnessCheckInRead(
            id=c.id, athlete_id=c.athlete_id, check_date=c.check_date,
            fatigue=c.fatigue, soreness=c.soreness, mood=c.mood, sleep_quality=c.sleep_quality,
            notes=c.notes, created_at=c.created_at, average=round(avg, 2),
        ))
    return result


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
