from datetime import date as date_type, datetime, timezone
from typing import Optional

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
from app.models.behavior_journal import BehaviorJournalEntry, BehaviorPreferences, CustomBehavior, CustomBehaviorLog, BEHAVIOR_KEYS
from app.models.nutrition_log import NutritionLog
from app.schemas.athlete_health import (
    AiCoachMessageRequest,
    AiCoachResponse,
    AppleHealthSyncPayload,
    AppleHealthSyncResult,
    AthleteHealthOverviewRead,
    BehaviorCorrelationRead,
    BehaviorInsightsSummaryRead,
    BehaviorJournalCreate,
    BehaviorJournalRead,
    BehaviorJournalStreakRead,
    BehaviorPreferencesRead,
    BehaviorPreferencesUpdate,
    BehaviorWeeklySummaryRead,
    CoachBehaviorAggregationRead,
    CoachHealthAlertsRead,
    CustomBehaviorCreate,
    CustomBehaviorLogCreate,
    CustomBehaviorRead,
    HealthAlertHistoryRead,
    HealthAlertRead,
    NutritionLogCreate,
    NutritionLogRead,
    SleepAnalyticsDetailRead,
    SleepCoachRead,
    SleepHistoryDetailItemRead,
    SleepHistoryItemRead,
    SleepPerformanceRead,
    SleepSummaryDetailRead,
    StrainHistoryItemRead,
    StrainScoreRead,
    StrainTargetRead,
    MonthlyReportRead,
    ReportAvailableRead,
    WeeklyReportRead,
    WellnessCheckInCreate,
    WellnessCheckInRead,
)
from app.services.athlete_health import build_athlete_health_overview, compute_recovery_score
from app.services.sleep_analytics import compute_sleep_analytics, compute_sleep_history, compute_sleep_summary

router = APIRouter(prefix="/athlete-health", tags=["athlete-health"])


@router.get("/athletes/{athlete_id}/recovery-score")
def get_recovery_score(
    athlete_id: int,
    target_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    d = None
    if target_date:
        try:
            d = date_type.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    return compute_recovery_score(db, athlete.id, d)


# ── Health Alerts ────────────────────────────────────────────


@router.get("/athletes/{athlete_id}/health-alerts", response_model=list[HealthAlertRead])
def get_health_alerts(
    athlete_id: int,
    days: int = Query(1, ge=1, le=30),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[HealthAlertRead]:
    """Return health anomaly alerts for the athlete. days=1 means today only."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.health_alerts import check_health_alerts
    if days == 1:
        return [HealthAlertRead(**a) for a in check_health_alerts(db, athlete.id)]
    # Multiple days — return flat list with all alerts
    from datetime import timedelta
    today = date_type.today()
    alerts = []
    for offset in range(days):
        d = today - timedelta(days=offset)
        day_alerts = check_health_alerts(db, athlete.id, d)
        alerts.extend(day_alerts)
    return [HealthAlertRead(**a) for a in alerts]


@router.get("/athletes/{athlete_id}/health-alert-history", response_model=HealthAlertHistoryRead)
def get_health_alert_history(
    athlete_id: int,
    days: int = Query(14, ge=1, le=30),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HealthAlertHistoryRead:
    """Return health alert history grouped by date."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.health_alerts import get_alert_history
    history = get_alert_history(db, athlete.id, days)
    return HealthAlertHistoryRead(
        athlete_id=athlete.id,
        days=days,
        history=history,
    )


@router.get("/coach/health-alerts", response_model=CoachHealthAlertsRead)
def get_coach_health_alerts(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CoachHealthAlertsRead:
    """Return active health alerts for all athletes coached by the current user."""
    if user.role not in ("coach", "coach_athlete"):
        raise HTTPException(status_code=403, detail="Coach access required")
    from app.services.health_alerts import get_coach_alerts
    result = get_coach_alerts(db, user.id)
    return CoachHealthAlertsRead(athletes=result)


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
            existing.synced_at = datetime.now(timezone.utc)
        else:
            db.add(HealthSample(
                athlete_id=athlete.id,
                sample_date=sample.sample_date,
                source="apple_health",
                **data,
            ))
        upserted += 1
    athlete.apple_health_connected = True
    athlete.apple_health_last_sync_at = datetime.now(timezone.utc)
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


# ── Behavior Journal ──


@router.post("/athletes/{athlete_id}/behavior-journal", response_model=BehaviorJournalRead, status_code=status.HTTP_201_CREATED)
def upsert_behavior_journal(
    athlete_id: int,
    payload: BehaviorJournalCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BehaviorJournalRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    existing = db.scalar(
        select(BehaviorJournalEntry).where(
            BehaviorJournalEntry.athlete_id == athlete.id,
            BehaviorJournalEntry.entry_date == payload.entry_date,
        )
    )
    data = payload.model_dump(exclude={"entry_date"}, exclude_none=True)
    if existing:
        for key, value in data.items():
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        entry = existing
    else:
        entry = BehaviorJournalEntry(athlete_id=athlete.id, entry_date=payload.entry_date, **data)
        db.add(entry)
        db.commit()
        db.refresh(entry)
    return BehaviorJournalRead.model_validate(entry)


@router.get("/athletes/{athlete_id}/behavior-journal", response_model=list[BehaviorJournalRead])
def list_behavior_journal(
    athlete_id: int,
    days: int = Query(28, ge=1, le=90),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[BehaviorJournalRead]:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from datetime import timedelta
    cutoff = date_type.today() - timedelta(days=days)
    rows = db.scalars(
        select(BehaviorJournalEntry)
        .where(BehaviorJournalEntry.athlete_id == athlete.id, BehaviorJournalEntry.entry_date >= cutoff)
        .order_by(BehaviorJournalEntry.entry_date.desc())
    ).all()
    return [BehaviorJournalRead.model_validate(r) for r in rows]


@router.delete("/athletes/{athlete_id}/behavior-journal/{entry_date}", status_code=status.HTTP_204_NO_CONTENT)
def delete_behavior_journal_entry(
    athlete_id: int,
    entry_date: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        date_type.fromisoformat(entry_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    athlete = _resolve_target_athlete(db, user, athlete_id)
    entry = db.scalar(
        select(BehaviorJournalEntry).where(
            BehaviorJournalEntry.athlete_id == athlete.id,
            BehaviorJournalEntry.entry_date == entry_date,
        )
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(entry)
    db.commit()


@router.get("/athletes/{athlete_id}/behavior-preferences", response_model=BehaviorPreferencesRead)
def get_behavior_preferences(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BehaviorPreferencesRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    prefs = db.scalar(select(BehaviorPreferences).where(BehaviorPreferences.athlete_id == athlete.id))
    if not prefs:
        prefs = BehaviorPreferences(athlete_id=athlete.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return BehaviorPreferencesRead.model_validate(prefs)


@router.put("/athletes/{athlete_id}/behavior-preferences", response_model=BehaviorPreferencesRead)
def update_behavior_preferences(
    athlete_id: int,
    payload: BehaviorPreferencesUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BehaviorPreferencesRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    prefs = db.scalar(select(BehaviorPreferences).where(BehaviorPreferences.athlete_id == athlete.id))
    if not prefs:
        prefs = BehaviorPreferences(athlete_id=athlete.id)
        db.add(prefs)
        db.flush()
    data = payload.model_dump(exclude_none=True)
    for key, value in data.items():
        setattr(prefs, key, value)
    db.commit()
    db.refresh(prefs)
    return BehaviorPreferencesRead.model_validate(prefs)


@router.get("/athletes/{athlete_id}/behavior-journal/streak", response_model=BehaviorJournalStreakRead)
def get_behavior_streak(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BehaviorJournalStreakRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from datetime import timedelta
    rows = db.scalars(
        select(BehaviorJournalEntry.entry_date)
        .where(BehaviorJournalEntry.athlete_id == athlete.id)
        .order_by(BehaviorJournalEntry.entry_date.desc())
    ).all()
    if not rows:
        return BehaviorJournalStreakRead(current_streak=0, longest_streak=0, total_entries=0)
    dates = sorted(set(rows), reverse=True)
    # Current streak: consecutive days ending today or yesterday
    # NOTE: date.today() uses server-local timezone. For global accuracy,
    # consider accepting a timezone parameter from the client in the future.
    today = date_type.today()
    current = 0
    check = today
    if dates and dates[0] < today - timedelta(days=1):
        current = 0
    else:
        if dates[0] == today:
            check = today
        else:
            check = today - timedelta(days=1)
        for d in dates:
            if d == check:
                current += 1
                check -= timedelta(days=1)
            elif d < check:
                break
    # Longest streak
    longest = 1
    streak = 1
    sorted_asc = sorted(dates)
    for i in range(1, len(sorted_asc)):
        if sorted_asc[i] - sorted_asc[i - 1] == timedelta(days=1):
            streak += 1
            longest = max(longest, streak)
        else:
            streak = 1
    return BehaviorJournalStreakRead(
        current_streak=current,
        longest_streak=max(longest, current),
        total_entries=len(dates),
    )


@router.get("/athletes/{athlete_id}/behavior-journal/weekly-summary", response_model=list[BehaviorWeeklySummaryRead])
def get_behavior_weekly_summary(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[BehaviorWeeklySummaryRead]:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from datetime import timedelta
    today = date_type.today()
    week_start = today - timedelta(days=6)
    rows = db.scalars(
        select(BehaviorJournalEntry)
        .where(BehaviorJournalEntry.athlete_id == athlete.id, BehaviorJournalEntry.entry_date >= week_start)
        .order_by(BehaviorJournalEntry.entry_date.desc())
    ).all()
    if not rows:
        return []
    total_days = len(rows)
    # Count active days per behavior
    counts: dict[str, int] = {}
    for row in rows:
        for key in BEHAVIOR_KEYS:
            val = getattr(row, key, None)
            if val is not None and val is not False and val != 0:
                counts[key] = counts.get(key, 0) + 1
    result = []
    for key, days_active in sorted(counts.items(), key=lambda x: -x[1]):
        result.append(BehaviorWeeklySummaryRead(
            behavior=key,
            days_active=days_active,
            total_days=total_days,
        ))
    return result


# ── Custom Behaviors ──


@router.post("/athletes/{athlete_id}/custom-behaviors", response_model=CustomBehaviorRead, status_code=status.HTTP_201_CREATED)
def create_custom_behavior(
    athlete_id: int,
    payload: CustomBehaviorCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CustomBehaviorRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    behavior = CustomBehavior(
        athlete_id=athlete.id,
        name=payload.name,
        emoji=payload.emoji,
        category=payload.category,
    )
    db.add(behavior)
    db.commit()
    db.refresh(behavior)
    return CustomBehaviorRead.model_validate(behavior)


@router.get("/athletes/{athlete_id}/custom-behaviors", response_model=list[CustomBehaviorRead])
def list_custom_behaviors(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CustomBehaviorRead]:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    rows = db.scalars(
        select(CustomBehavior)
        .where(CustomBehavior.athlete_id == athlete.id, CustomBehavior.is_active == True)
        .order_by(CustomBehavior.created_at.asc())
    ).all()
    return [CustomBehaviorRead.model_validate(r) for r in rows]


@router.delete("/athletes/{athlete_id}/custom-behaviors/{behavior_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_custom_behavior(
    athlete_id: int,
    behavior_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    behavior = db.scalar(
        select(CustomBehavior).where(
            CustomBehavior.id == behavior_id,
            CustomBehavior.athlete_id == athlete.id,
        )
    )
    if not behavior:
        raise HTTPException(status_code=404, detail="Custom behavior not found")
    behavior.is_active = False
    db.commit()


@router.post("/athletes/{athlete_id}/custom-behavior-logs", status_code=status.HTTP_201_CREATED)
def upsert_custom_behavior_log(
    athlete_id: int,
    payload: CustomBehaviorLogCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    # Verify the custom behavior belongs to this athlete
    behavior = db.scalar(
        select(CustomBehavior).where(
            CustomBehavior.id == payload.custom_behavior_id,
            CustomBehavior.athlete_id == athlete.id,
        )
    )
    if not behavior:
        raise HTTPException(status_code=404, detail="Custom behavior not found")
    existing = db.scalar(
        select(CustomBehaviorLog).where(
            CustomBehaviorLog.custom_behavior_id == payload.custom_behavior_id,
            CustomBehaviorLog.log_date == payload.log_date,
        )
    )
    if existing:
        existing.value = payload.value
        db.commit()
        db.refresh(existing)
        log = existing
    else:
        log = CustomBehaviorLog(
            custom_behavior_id=payload.custom_behavior_id,
            athlete_id=athlete.id,
            log_date=payload.log_date,
            value=payload.value,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
    return {
        "id": log.id,
        "custom_behavior_id": log.custom_behavior_id,
        "athlete_id": log.athlete_id,
        "log_date": log.log_date.isoformat(),
        "value": log.value,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


@router.get("/athletes/{athlete_id}/custom-behavior-logs")
def list_custom_behavior_logs(
    athlete_id: int,
    days: int = Query(28, ge=1, le=90),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from datetime import timedelta
    cutoff = date_type.today() - timedelta(days=days)
    rows = db.scalars(
        select(CustomBehaviorLog)
        .where(CustomBehaviorLog.athlete_id == athlete.id, CustomBehaviorLog.log_date >= cutoff)
        .order_by(CustomBehaviorLog.log_date.desc())
    ).all()
    return [
        {
            "id": r.id,
            "custom_behavior_id": r.custom_behavior_id,
            "athlete_id": r.athlete_id,
            "log_date": r.log_date.isoformat(),
            "value": r.value,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# ── Nutrition Log ──────────────────────────────────────────────


@router.post("/athletes/{athlete_id}/nutrition-log", response_model=NutritionLogRead)
def upsert_nutrition_log(
    athlete_id: int,
    payload: NutritionLogCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    existing = db.scalar(
        select(NutritionLog).where(
            NutritionLog.athlete_id == athlete.id,
            NutritionLog.log_date == payload.log_date,
        )
    )
    data = payload.model_dump(exclude={"log_date"}, exclude_none=True)
    # Auto-calculate calories if macros provided but calories not
    if "calories_kcal" not in data and any(k in data for k in ("carbs_g", "protein_g", "fat_g")):
        c = data.get("carbs_g", 0) or 0
        p = data.get("protein_g", 0) or 0
        f = data.get("fat_g", 0) or 0
        data["calories_kcal"] = round(c * 4 + p * 4 + f * 9, 1)
    if existing:
        for k, v in data.items():
            setattr(existing, k, v)
        db.commit()
        db.refresh(existing)
        return existing
    entry = NutritionLog(athlete_id=athlete.id, log_date=payload.log_date, **data)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/athletes/{athlete_id}/nutrition-log", response_model=list[NutritionLogRead])
def list_nutrition_logs(
    athlete_id: int,
    days: int = Query(28, ge=1, le=90),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from datetime import timedelta
    since = date_type.today() - timedelta(days=days)
    rows = db.scalars(
        select(NutritionLog)
        .where(NutritionLog.athlete_id == athlete.id, NutritionLog.log_date >= since)
        .order_by(NutritionLog.log_date.desc())
    ).all()
    return rows


@router.delete("/athletes/{athlete_id}/nutrition-log/{log_date}", status_code=status.HTTP_204_NO_CONTENT)
def delete_nutrition_log(
    athlete_id: int,
    log_date: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        date_type.fromisoformat(log_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    athlete = _resolve_target_athlete(db, user, athlete_id)
    entry = db.scalar(
        select(NutritionLog).where(
            NutritionLog.athlete_id == athlete.id,
            NutritionLog.log_date == log_date,
        )
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Nutrition log not found")
    db.delete(entry)
    db.commit()


@router.get("/athletes/{athlete_id}/nutrition-presets")
def get_nutrition_presets(athlete_id: int, user: User = Depends(get_current_user)):
    """Return available nutrition presets."""
    return {
        "presets": [
            {"key": "low_carb", "label": "Bajo en CH", "emoji": "🥗", "carbs_g": 100, "protein_g": 150, "fat_g": 80, "calories_kcal": 1700},
            {"key": "medium_carb", "label": "Normal", "emoji": "🍽️", "carbs_g": 250, "protein_g": 130, "fat_g": 70, "calories_kcal": 2100},
            {"key": "high_carb", "label": "Alto en CH", "emoji": "🍝", "carbs_g": 400, "protein_g": 120, "fat_g": 60, "calories_kcal": 2600},
            {"key": "race_day", "label": "Día de carrera", "emoji": "🏁", "carbs_g": 500, "protein_g": 100, "fat_g": 50, "calories_kcal": 2900},
        ]
    }


# ── Behavior Correlations ─────────────────────────────────────


@router.get("/athletes/{athlete_id}/behavior-correlations", response_model=list[BehaviorCorrelationRead])
def get_behavior_correlations(
    athlete_id: int,
    window_days: int = Query(90, ge=14, le=365),
    min_confidence: str = Query("low"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.behavior_correlation_engine import get_cached_correlations, refresh_correlations
    refresh_correlations(db, athlete.id, window_days=window_days)
    return get_cached_correlations(db, athlete.id, min_confidence=min_confidence)


@router.get("/athletes/{athlete_id}/behavior-correlations/{behavior_key}", response_model=list[BehaviorCorrelationRead])
def get_behavior_correlation_detail(
    athlete_id: int,
    behavior_key: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.behavior_correlation_engine import get_cached_correlations, refresh_correlations
    refresh_correlations(db, athlete.id)
    all_corrs = get_cached_correlations(db, athlete.id)
    return [c for c in all_corrs if c["behavior_key"] == behavior_key]


@router.post("/athletes/{athlete_id}/behavior-correlations/refresh")
def refresh_behavior_correlations(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.behavior_correlation_engine import refresh_correlations
    result = refresh_correlations(db, athlete.id, force=True)
    return {"refreshed": len(result), "message": "Correlaciones actualizadas"}


@router.get("/athletes/{athlete_id}/behavior-insights", response_model=BehaviorInsightsSummaryRead)
def get_behavior_insights(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.behavior_correlation_engine import get_insights_summary
    return get_insights_summary(db, athlete.id)


@router.get("/athletes/{athlete_id}/behavior-digest")
def get_behavior_digest(
    athlete_id: int,
    digest_type: str = Query("weekly", pattern="^(weekly|monthly)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.behavior_correlation_engine import generate_weekly_digest, generate_monthly_digest
    if digest_type == "weekly":
        result = generate_weekly_digest(db, athlete.id)
    else:
        result = generate_monthly_digest(db, athlete.id)
    return result


@router.get("/coach/behavior-aggregations", response_model=CoachBehaviorAggregationRead)
def get_coach_behavior_aggregations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cross-athlete behavior correlation aggregations for coaches."""
    if user.role not in ("coach", "coach_athlete"):
        raise HTTPException(status_code=403, detail="Coach access required")

    from app.services.behavior_correlation_engine import get_coach_aggregations
    return get_coach_aggregations(db, user.id)


# ── Strain Coach ──────────────────────────────────────────────


@router.get("/athletes/{athlete_id}/strain-score", response_model=StrainScoreRead)
def get_strain_score(
    athlete_id: int,
    target_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StrainScoreRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    d = None
    if target_date:
        try:
            d = date_type.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    from app.services.strain_coach import compute_daily_strain
    return compute_daily_strain(db, athlete.id, d)


@router.get("/athletes/{athlete_id}/strain-target", response_model=StrainTargetRead)
def get_strain_target(
    athlete_id: int,
    target_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StrainTargetRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    d = None
    if target_date:
        try:
            d = date_type.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    from app.services.strain_coach import compute_strain_target
    return compute_strain_target(db, athlete.id, d)


@router.get("/athletes/{athlete_id}/strain-history", response_model=list[StrainHistoryItemRead])
def get_strain_history(
    athlete_id: int,
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[StrainHistoryItemRead]:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.strain_coach import get_strain_history
    return get_strain_history(db, athlete.id, days)


# ── Sleep Coach ───────────────────────────────────────────────


@router.get("/athletes/{athlete_id}/sleep-coach", response_model=SleepCoachRead)
def get_sleep_coach(
    athlete_id: int,
    target_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SleepCoachRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    d = None
    if target_date:
        try:
            d = date_type.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    from app.services.sleep_coach import compute_sleep_need
    return compute_sleep_need(db, athlete.id, d)


@router.get("/athletes/{athlete_id}/sleep-performance", response_model=SleepPerformanceRead)
def get_sleep_performance(
    athlete_id: int,
    target_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SleepPerformanceRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    d = None
    if target_date:
        try:
            d = date_type.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    from app.services.sleep_coach import compute_sleep_performance
    return compute_sleep_performance(db, athlete.id, d)


@router.get("/athletes/{athlete_id}/sleep-history", response_model=list[SleepHistoryItemRead])
def get_sleep_history(
    athlete_id: int,
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SleepHistoryItemRead]:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.sleep_coach import get_sleep_history
    return get_sleep_history(db, athlete.id, days)


# ── Sleep Analytics (enhanced) ──────────────────────────────────


@router.get("/athletes/{athlete_id}/sleep-analytics", response_model=SleepAnalyticsDetailRead)
def get_sleep_analytics(
    athlete_id: int,
    target_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    d = None
    if target_date:
        try:
            d = date_type.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    return compute_sleep_analytics(db, athlete.id, d)


@router.get("/athletes/{athlete_id}/sleep-analytics-history", response_model=list[SleepHistoryDetailItemRead])
def get_sleep_analytics_history(
    athlete_id: int,
    days: int = Query(14, ge=1, le=90),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    return compute_sleep_history(db, athlete.id, days)


@router.get("/athletes/{athlete_id}/sleep-analytics-summary", response_model=SleepSummaryDetailRead)
def get_sleep_analytics_summary(
    athlete_id: int,
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_target_athlete(db, user, athlete_id)
    return compute_sleep_summary(db, athlete.id, days)


# ── Performance Reports ──────────────────────────────────────────


@router.get("/athletes/{athlete_id}/reports/weekly", response_model=WeeklyReportRead)
def get_weekly_report(
    athlete_id: int,
    week_start: Optional[str] = Query(None, description="Monday of the week, YYYY-MM-DD"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WeeklyReportRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    d = None
    if week_start:
        try:
            d = date_type.fromisoformat(week_start)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha invalido. Usa YYYY-MM-DD")
    from app.services.performance_report import generate_weekly_report
    try:
        return generate_weekly_report(db, athlete.id, d)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Weekly report failed for athlete %s: %s", athlete_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generando informe semanal: {exc}") from exc


@router.get("/athletes/{athlete_id}/reports/monthly", response_model=MonthlyReportRead)
def get_monthly_report(
    athlete_id: int,
    year_month: Optional[str] = Query(None, description="YYYY-MM"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MonthlyReportRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.performance_report import generate_monthly_report
    try:
        return generate_monthly_report(db, athlete.id, year_month)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Monthly report failed for athlete %s: %s", athlete_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generando informe mensual: {exc}") from exc


@router.get("/athletes/{athlete_id}/reports/available", response_model=ReportAvailableRead)
def get_available_reports_endpoint(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReportAvailableRead:
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.performance_report import get_available_reports as _get_available
    reports = _get_available(db, athlete.id)
    return ReportAvailableRead(reports=reports)


# ── AI Coach ────────────────────────────────────────────────


@router.post("/athletes/{athlete_id}/ai-coach/chat", response_model=AiCoachResponse)
async def ai_coach_chat(
    athlete_id: int,
    payload: AiCoachMessageRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AiCoachResponse:
    """Chat with the AI coach. Returns an AI-generated response with full athlete context."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.ai_coach import chat
    try:
        response_text, context_summary = await chat(
            db,
            athlete.id,
            payload.message,
            payload.history,
        )
        return AiCoachResponse(response=response_text, context_summary=context_summary)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error(
            "AI Coach failed for athlete %s: %s", athlete_id, exc, exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Error del coach IA: {exc}",
        ) from exc


@router.get("/athletes/{athlete_id}/ai-coach/history")
def ai_coach_history(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the last 50 chat messages for this athlete."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.ai_coach import load_history
    return {"messages": load_history(db, athlete.id, limit=50)}


@router.delete("/athletes/{athlete_id}/ai-coach/history")
def ai_coach_clear_history(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Clear all chat messages for this athlete."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    from app.services.ai_coach import clear_history
    deleted = clear_history(db, athlete.id)
    return {"deleted": deleted}


def _resolve_target_athlete(db: Session, user: User, athlete_id: int) -> Athlete:
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Athlete not found")

    if user.is_athlete:
        if user.athlete_id != athlete_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Athlete user can only access their own athlete health data")
        return athlete

    if user.is_coach:
        if athlete.coach_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Coach can only access athletes they coach")
        return athlete

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Athlete health is not available for this role")
