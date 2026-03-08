from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.analytics import DashboardRead
from app.services.analytics import compare_sessions, dashboard_payload

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardRead)
def dashboard(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return dashboard_payload(db)


@router.get("/compare")
def compare(session_a: int, session_b: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        return compare_sessions(db, session_a, session_b)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

