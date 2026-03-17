from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.user import User
from app.schemas.training_load import TrainingLoadResponse
from app.services.garmin import list_garmin_activities, GarminRequestError
from app.services.training_load_calculator import compute_training_load_series

router = APIRouter(prefix="/athletes", tags=["training-load"])


@router.get("/{athlete_id}/training-load", response_model=TrainingLoadResponse)
def get_training_load(
    athlete_id: int,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")

    if not athlete.garmin_connected:
        raise HTTPException(status_code=400, detail="Athlete does not have Garmin connected")

    # Fetch activities with 42d warmup for EWMA
    fetch_start = start_date - timedelta(days=42)
    try:
        activities = list_garmin_activities(
            db, athlete, fetch_start, end_date,
            include_full_detail=True,
        )
    except GarminRequestError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

    try:
        result = compute_training_load_series(db, athlete, activities, start_date, end_date)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Training load computation crashed for athlete %s: %s", athlete_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error calculando carga de entrenamiento: {exc}") from exc
    return result
