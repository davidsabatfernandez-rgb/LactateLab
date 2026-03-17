from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.analytics import DashboardRead, DynamicThresholdModelRead, DynamicThresholdsRead
from app.services.analytics import compare_sessions, dashboard_payload, dynamic_thresholds_payload

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardRead)
def dashboard(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        return dashboard_payload(db)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Dashboard crashed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno en dashboard: {exc}") from exc


@router.get("/compare")
def compare(session_a: int, session_b: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        return compare_sessions(db, session_a, session_b)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/athletes/{athlete_id}/dynamic-thresholds", response_model=DynamicThresholdsRead)
def athlete_dynamic_thresholds(
    athlete_id: int,
    discipline: str = None,
    power_source: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        return dynamic_thresholds_payload(db, athlete_id, discipline=discipline, power_source=power_source)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/athletes/{athlete_id}/dynamic-thresholds/acute", response_model=DynamicThresholdModelRead)
def athlete_dynamic_thresholds_acute(
    athlete_id: int,
    discipline: str = None,
    power_source: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        return dynamic_thresholds_payload(db, athlete_id, discipline=discipline, power_source=power_source)["acute"]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/athletes/{athlete_id}/dynamic-thresholds/chronic", response_model=DynamicThresholdModelRead)
def athlete_dynamic_thresholds_chronic(
    athlete_id: int,
    discipline: str = None,
    power_source: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        return dynamic_thresholds_payload(db, athlete_id, discipline=discipline, power_source=power_source)["chronic"]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/athletes/{athlete_id}/dynamic-thresholds/history")
def athlete_dynamic_thresholds_history(
    athlete_id: int,
    discipline: str = None,
    power_source: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        payload = dynamic_thresholds_payload(db, athlete_id, discipline=discipline, power_source=power_source)
        return {
            "discipline": payload["discipline"],
            "power_source": payload.get("power_source"),
            "generated_on": payload["generated_on"],
            "history": payload["history"],
            "warnings": payload["warnings"],
        }
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
