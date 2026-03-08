from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.session import Session as AthleteSession, SessionInterval
from app.models.user import User
from app.services.analytics import athlete_analysis_payload, analyze_session

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/athlete/{athlete_id}")
def athlete_report(athlete_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        analysis = athlete_analysis_payload(db, athlete_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "summary": f"Perfil fisiológico de {analysis['athlete'].name}",
        "key_metrics": analysis["thresholds"],
        "estimates": analysis["estimates"],
        "alerts": [comment for comment in analysis["automated_comments"] if "degrading" in comment],
        "recommendations": [
            "Verificar consistencia de muestreo en bloques LT1 largos.",
            "Repetir test incremental si la confianza cae por debajo de 0.6.",
        ],
    }


@router.get("/session/{session_id}")
def session_report(session_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    session = db.scalar(
        select(AthleteSession)
        .options(joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample), joinedload(AthleteSession.athlete))
        .where(AthleteSession.id == session_id)
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    analysis = analyze_session(session)
    return {
        "summary": f"Informe de sesión {session.session_type} para {session.athlete.name}",
        "key_metrics": analysis["thresholds"],
        "contextual_interpretation": analysis["contextual_comments"],
        "recommendations": [
            "Mantener protocolo de muestra constante para facilitar comparativas.",
            "Comparar esta curva con el test incremental más reciente.",
        ],
    }

