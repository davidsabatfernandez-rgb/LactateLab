from datetime import date as date_type, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.user import User
from app.models.health_sample import HealthSample
from app.models.planned_session import PlannedSession
from app.models.wellness_checkin import WellnessCheckIn
from app.schemas.athlete_health import (
    AppleHealthSyncPayload,
    AppleHealthSyncResult,
    AthleteHealthOverviewRead,
    WellnessCheckInCreate,
    WellnessCheckInRead,
)
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
    try:
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
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Health overview crashed for athlete %s: %s", athlete_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno en salud del atleta: {exc}") from exc


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


@router.post("/athletes/{athlete_id}/apple-health-sync", response_model=AppleHealthSyncResult)
def apple_health_sync(
    athlete_id: int,
    payload: AppleHealthSyncPayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AppleHealthSyncResult:
    """Receive a batch of Apple Health samples from the iOS app (upsert by date)."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    upserted = 0
    for sample in payload.samples:
        existing = db.scalar(
            select(HealthSample).where(
                HealthSample.athlete_id == athlete.id,
                HealthSample.sample_date == sample.sample_date,
                HealthSample.source == "apple_health",
            )
        )
        data = sample.model_dump(exclude_none=True)
        data.pop("sample_date", None)
        if existing:
            for key, value in data.items():
                setattr(existing, key, value)
            existing.synced_at = datetime.utcnow()
        else:
            db.add(HealthSample(
                athlete_id=athlete.id,
                sample_date=sample.sample_date,
                source="apple_health",
                **data,
            ))
        upserted += 1
    athlete.apple_health_connected = True
    athlete.apple_health_last_sync_at = datetime.utcnow()
    db.commit()
    return AppleHealthSyncResult(upserted=upserted, message=f"{upserted} muestras sincronizadas")


@router.get("/athletes/{athlete_id}/planned-workouts")
def get_athlete_planned_workouts(
    athlete_id: int,
    days_ahead: int = Query(14, ge=1, le=60),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return upcoming published workouts for the athlete (for Apple Watch sync)."""
    from datetime import timedelta
    athlete = _resolve_target_athlete(db, user, athlete_id)
    today = date_type.today()
    cutoff = today + timedelta(days=days_ahead)

    sessions = db.scalars(
        select(PlannedSession)
        .where(
            PlannedSession.athlete_id == athlete.id,
            PlannedSession.scheduled_date >= today,
            PlannedSession.scheduled_date <= cutoff,
            PlannedSession.execution_status == "planned",
        )
        .order_by(PlannedSession.scheduled_date, PlannedSession.day_offset)
    ).all()

    results = []
    for s in sessions:
        results.append({
            "id": s.id,
            "scheduled_date": s.scheduled_date.isoformat(),
            "scheduled_time": s.scheduled_time,
            "discipline": s.discipline,
            "session_role": s.session_role,
            "session_family": s.session_family,
            "public_label": s.public_label,
            "objective": s.objective,
            "dose_prescription": s.dose_prescription,
            "target_mode": s.target_mode,
            "structured_workout_payload": s.structured_workout_payload,
            "bla_check": s.bla_check,
            "coach_note": s.coach_note,
            "payload": {
                "calentamiento_min": (s.payload or {}).get("calentamiento_min"),
                "calentamiento_template": (s.payload or {}).get("calentamiento_template"),
                "enfriamiento_min": (s.payload or {}).get("enfriamiento_min"),
                "enfriamiento_template": (s.payload or {}).get("enfriamiento_template"),
                "coach_tips": (s.payload or {}).get("coach_tips"),
            },
        })
    return results


@router.post("/athletes/{athlete_id}/publish-for-watch/{session_id}")
def publish_session_for_watch(
    athlete_id: int,
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark a planned session as published for Apple Watch sync."""
    _resolve_target_athlete(db, user, athlete_id)
    session = db.scalar(
        select(PlannedSession).where(
            PlannedSession.id == session_id,
            PlannedSession.athlete_id == athlete_id,
        )
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Mark as published for watch
    session.publish_status = "published"
    session.publish_provider = "apple_watch"
    db.commit()
    return {"ok": True, "session_id": session_id, "publish_status": "published"}


@router.post("/athletes/{athlete_id}/apple-health-disconnect")
def apple_health_disconnect(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    athlete.apple_health_connected = False
    athlete.apple_health_last_sync_at = None
    db.commit()
    return {"ok": True}


def _resolve_target_athlete(db: Session, user: User, athlete_id: int) -> Athlete:
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Athlete not found")

    if user.is_athlete:
        if user.athlete_id != athlete_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Athlete user can only access their own athlete health data")
        return athlete

    if user.is_coach:
        return athlete

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Athlete health is not available for this role")
