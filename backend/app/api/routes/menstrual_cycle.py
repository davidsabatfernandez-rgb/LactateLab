"""Menstrual cycle tracking API routes."""
from datetime import date as date_type, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.menstrual_cycle import MenstrualCycleLog, MenstrualCyclePreferences, MenstrualDailyLog
from app.models.user import User
from app.schemas.menstrual_cycle import (
    CycleDashboardRead,
    CycleLogCreate,
    CycleLogRead,
    CyclePreferencesCreate,
    CyclePreferencesRead,
    CyclePreferencesUpdate,
    CyclePhaseRead,
    DailyLogCreate,
    DailyLogRead,
)
from app.services.menstrual_engine import get_current_phase, log_period_start, upsert_daily_log

router = APIRouter(prefix="/menstrual-cycle", tags=["menstrual-cycle"])


# ── Helpers ──────────────────────────────────────────────────

def _resolve_athlete(db: Session, user: User, athlete_id: int) -> Athlete:
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    if user.role == "athlete" and user.athlete_id != athlete_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return athlete


def _require_female(athlete: Athlete):
    if athlete.sex.lower() not in ("female", "f", "mujer", "femenino"):
        raise HTTPException(status_code=400, detail="Cycle tracking is only available for female athletes")


# ── Preferences (onboarding) ────────────────────────────────

@router.post("/athletes/{athlete_id}/preferences", response_model=CyclePreferencesRead, status_code=status.HTTP_201_CREATED)
def create_preferences(
    athlete_id: int,
    payload: CyclePreferencesCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_athlete(db, user, athlete_id)
    _require_female(athlete)

    existing = db.scalar(
        select(MenstrualCyclePreferences).where(MenstrualCyclePreferences.athlete_id == athlete_id)
    )
    if existing:
        raise HTTPException(status_code=409, detail="Preferences already exist. Use PATCH to update.")

    prefs = MenstrualCyclePreferences(athlete_id=athlete_id, **payload.model_dump())
    db.add(prefs)

    # If last_period_start_date provided, auto-create the first cycle log
    if payload.last_period_start_date:
        period_len = payload.average_period_length_days or 5
        period_end = payload.last_period_start_date + timedelta(days=period_len - 1)
        log_period_start(db, athlete_id, payload.last_period_start_date, period_end)

    db.commit()
    db.refresh(prefs)
    return prefs


@router.get("/athletes/{athlete_id}/preferences", response_model=CyclePreferencesRead)
def get_preferences(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _resolve_athlete(db, user, athlete_id)
    prefs = db.scalar(
        select(MenstrualCyclePreferences).where(MenstrualCyclePreferences.athlete_id == athlete_id)
    )
    if not prefs:
        raise HTTPException(status_code=404, detail="Cycle preferences not found. Complete onboarding first.")
    return prefs


@router.patch("/athletes/{athlete_id}/preferences", response_model=CyclePreferencesRead)
def update_preferences(
    athlete_id: int,
    payload: CyclePreferencesUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _resolve_athlete(db, user, athlete_id)
    prefs = db.scalar(
        select(MenstrualCyclePreferences).where(MenstrualCyclePreferences.athlete_id == athlete_id)
    )
    if not prefs:
        raise HTTPException(status_code=404, detail="Cycle preferences not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(prefs, k, v)
    db.commit()
    db.refresh(prefs)
    return prefs


# ── Cycle Logs (period tracking) ────────────────────────────

@router.post("/athletes/{athlete_id}/cycles", response_model=CycleLogRead, status_code=status.HTTP_201_CREATED)
def create_cycle_log(
    athlete_id: int,
    payload: CycleLogCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_athlete(db, user, athlete_id)
    _require_female(athlete)
    cycle = log_period_start(db, athlete_id, payload.cycle_start_date, payload.period_end_date)
    if payload.notes:
        cycle.notes = payload.notes
    db.commit()
    db.refresh(cycle)
    return cycle


@router.get("/athletes/{athlete_id}/cycles", response_model=list[CycleLogRead])
def list_cycle_logs(
    athlete_id: int,
    limit: int = Query(12, ge=1, le=24),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _resolve_athlete(db, user, athlete_id)
    rows = db.scalars(
        select(MenstrualCycleLog)
        .where(MenstrualCycleLog.athlete_id == athlete_id)
        .order_by(MenstrualCycleLog.cycle_start_date.desc())
        .limit(limit)
    ).all()
    return rows


@router.patch("/athletes/{athlete_id}/cycles/{cycle_id}/period-end", response_model=CycleLogRead)
def mark_period_end(
    athlete_id: int,
    cycle_id: int,
    period_end_date: date_type = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark when the period ended for a given cycle."""
    _resolve_athlete(db, user, athlete_id)
    cycle = db.scalar(
        select(MenstrualCycleLog).where(
            MenstrualCycleLog.id == cycle_id,
            MenstrualCycleLog.athlete_id == athlete_id,
        )
    )
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
    cycle.period_end_date = period_end_date
    cycle.period_length_days = (period_end_date - cycle.cycle_start_date).days + 1
    db.commit()
    db.refresh(cycle)
    return cycle


# ── Daily Logs (symptoms) ───────────────────────────────────

@router.post("/athletes/{athlete_id}/daily-logs", response_model=DailyLogRead, status_code=status.HTTP_201_CREATED)
def create_daily_log(
    athlete_id: int,
    payload: DailyLogCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    athlete = _resolve_athlete(db, user, athlete_id)
    _require_female(athlete)
    log = upsert_daily_log(db, athlete_id, payload.model_dump())
    db.commit()
    db.refresh(log)
    return log


@router.get("/athletes/{athlete_id}/daily-logs", response_model=list[DailyLogRead])
def list_daily_logs(
    athlete_id: int,
    days: int = Query(60, ge=1, le=180),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _resolve_athlete(db, user, athlete_id)
    cutoff = date_type.today() - timedelta(days=days)
    rows = db.scalars(
        select(MenstrualDailyLog)
        .where(MenstrualDailyLog.athlete_id == athlete_id, MenstrualDailyLog.log_date >= cutoff)
        .order_by(MenstrualDailyLog.log_date.desc())
    ).all()
    return rows


# ── Dashboard ────────────────────────────────────────────────

@router.get("/athletes/{athlete_id}/dashboard", response_model=CycleDashboardRead)
def cycle_dashboard(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Full dashboard: current phase + recent cycles + recent daily logs."""
    _resolve_athlete(db, user, athlete_id)

    prefs = db.scalar(
        select(MenstrualCyclePreferences).where(MenstrualCyclePreferences.athlete_id == athlete_id)
    )

    current_phase = None
    if prefs and prefs.is_active:
        phase_data = get_current_phase(db, athlete_id, prefs)
        if phase_data:
            current_phase = CyclePhaseRead(**phase_data)

    recent_cycles = db.scalars(
        select(MenstrualCycleLog)
        .where(MenstrualCycleLog.athlete_id == athlete_id)
        .order_by(MenstrualCycleLog.cycle_start_date.desc())
        .limit(6)
    ).all()

    cutoff = date_type.today() - timedelta(days=60)
    recent_daily = db.scalars(
        select(MenstrualDailyLog)
        .where(MenstrualDailyLog.athlete_id == athlete_id, MenstrualDailyLog.log_date >= cutoff)
        .order_by(MenstrualDailyLog.log_date.desc())
    ).all()

    return CycleDashboardRead(
        preferences=prefs,
        current_phase=current_phase,
        recent_cycles=recent_cycles,
        recent_daily_logs=recent_daily,
    )
