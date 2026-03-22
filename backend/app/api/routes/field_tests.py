"""API endpoints for field-test-based threshold estimation.

Independent of the lactate endpoints. Only used for athletes with threshold_mode='field_tests'.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.field_test import DecouplingResult, FieldTestSnapshot, TimeTrial30Result
from app.models.user import User
from app.schemas.field_test import (
    DecouplingResultCreate,
    DecouplingResultRead,
    FieldTestSnapshotRead,
    TimeTrial30ResultCreate,
    TimeTrial30ResultRead,
)
from app.services.decoupling_engine import update_field_test_snapshot
from app.api.routes.auth import get_current_user

router = APIRouter(prefix="/field-tests", tags=["field-tests"])


# ── Decoupling Results ───────────────────────────────────────────

@router.get("/athletes/{athlete_id}/decoupling", response_model=list[DecouplingResultRead])
def list_decoupling_results(
    athlete_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List all decoupling test results for an athlete, newest first."""
    results = db.scalars(
        select(DecouplingResult)
        .where(DecouplingResult.athlete_id == athlete_id)
        .order_by(DecouplingResult.test_date.desc())
    ).all()
    return results


@router.post("/athletes/{athlete_id}/decoupling", response_model=DecouplingResultRead, status_code=201)
def create_decoupling_result(
    athlete_id: int,
    payload: DecouplingResultCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Record a decoupling test result and recompute the field test snapshot."""
    athlete = db.get(Athlete, athlete_id)
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")

    result = DecouplingResult(
        athlete_id=athlete_id,
        test_date=payload.test_date,
        discipline=payload.discipline,
        pace_seconds_per_km=payload.pace_seconds_per_km,
        hr_avg=payload.hr_avg,
        hr_first_half=payload.hr_first_half,
        hr_second_half=payload.hr_second_half,
        drift_pct=payload.drift_pct,
        verdict=payload.verdict,
        block_duration_min=payload.block_duration_min,
        pace_cv_pct=payload.pace_cv_pct,
        temp_c=payload.temp_c,
        temp_flag=payload.temp_flag,
        source=payload.source,
        planned_session_id=payload.planned_session_id,
        garmin_activity_id=payload.garmin_activity_id,
        notes=payload.notes,
        created_at=datetime.utcnow(),
    )
    db.add(result)
    db.flush()

    # Recompute snapshot
    update_field_test_snapshot(db, athlete_id, payload.discipline)
    db.commit()
    db.refresh(result)
    return result


@router.delete("/athletes/{athlete_id}/decoupling/{result_id}", status_code=204)
def delete_decoupling_result(
    athlete_id: int,
    result_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Delete a decoupling result and recompute snapshot."""
    result = db.scalar(
        select(DecouplingResult).where(
            DecouplingResult.id == result_id,
            DecouplingResult.athlete_id == athlete_id,
        )
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Result not found")

    discipline = result.discipline
    db.delete(result)
    db.flush()
    update_field_test_snapshot(db, athlete_id, discipline)
    db.commit()


# ── Time Trial 30' Results ──────────────────────────────────────

@router.get("/athletes/{athlete_id}/time-trial-30", response_model=list[TimeTrial30ResultRead])
def list_time_trial_results(
    athlete_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List all 30-min time trial results for an athlete, newest first."""
    results = db.scalars(
        select(TimeTrial30Result)
        .where(TimeTrial30Result.athlete_id == athlete_id)
        .order_by(TimeTrial30Result.test_date.desc())
    ).all()
    return results


@router.post("/athletes/{athlete_id}/time-trial-30", response_model=TimeTrial30ResultRead, status_code=201)
def create_time_trial_result(
    athlete_id: int,
    payload: TimeTrial30ResultCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Record a time trial result and recompute the field test snapshot."""
    athlete = db.get(Athlete, athlete_id)
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")

    result = TimeTrial30Result(
        athlete_id=athlete_id,
        test_date=payload.test_date,
        discipline=payload.discipline,
        avg_pace_seconds_per_km=payload.avg_pace_seconds_per_km,
        avg_hr=payload.avg_hr,
        distance_m=payload.distance_m,
        pace_first_half=payload.pace_first_half,
        pace_second_half=payload.pace_second_half,
        pacing_diff_pct=payload.pacing_diff_pct,
        pacing_quality=payload.pacing_quality,
        temp_c=payload.temp_c,
        temp_flag=payload.temp_flag,
        planned_session_id=payload.planned_session_id,
        garmin_activity_id=payload.garmin_activity_id,
        notes=payload.notes,
        created_at=datetime.utcnow(),
    )
    db.add(result)
    db.flush()

    update_field_test_snapshot(db, athlete_id, payload.discipline)
    db.commit()
    db.refresh(result)
    return result


@router.delete("/athletes/{athlete_id}/time-trial-30/{result_id}", status_code=204)
def delete_time_trial_result(
    athlete_id: int,
    result_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Delete a time trial result and recompute snapshot."""
    result = db.scalar(
        select(TimeTrial30Result).where(
            TimeTrial30Result.id == result_id,
            TimeTrial30Result.athlete_id == athlete_id,
        )
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Result not found")

    discipline = result.discipline
    db.delete(result)
    db.flush()
    update_field_test_snapshot(db, athlete_id, discipline)
    db.commit()


# ── Field Test Snapshot ──────────────────────────────────────────

@router.get("/athletes/{athlete_id}/snapshot", response_model=list[FieldTestSnapshotRead])
def get_field_test_snapshots(
    athlete_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get current field test snapshots for all disciplines."""
    snapshots = db.scalars(
        select(FieldTestSnapshot)
        .where(FieldTestSnapshot.athlete_id == athlete_id)
        .order_by(FieldTestSnapshot.discipline)
    ).all()
    return snapshots


@router.post("/athletes/{athlete_id}/snapshot/recompute", response_model=list[FieldTestSnapshotRead])
def recompute_snapshot(
    athlete_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Force recompute of field test snapshots from all results."""
    athlete = db.get(Athlete, athlete_id)
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")

    update_field_test_snapshot(db, athlete_id, "running")
    db.commit()

    snapshots = db.scalars(
        select(FieldTestSnapshot)
        .where(FieldTestSnapshot.athlete_id == athlete_id)
        .order_by(FieldTestSnapshot.discipline)
    ).all()
    return snapshots
