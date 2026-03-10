from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.session import LactateSample, Session as AthleteSession, SessionInterval
from app.models.user import User
from app.schemas.analytics import SessionAnalysisRead
from app.schemas.imports import ImportCommitResponse, ImportPreviewResponse
from app.schemas.session import SessionCreate, SessionIntervalUpdate, SessionRead, SessionUpdate
from app.services.analytics import analyze_session, recalculate_athlete
from app.services.importer import build_import_preview, commit_import, parse_json_form_field

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _session_query():
    return select(AthleteSession).options(joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample))


@router.get("", response_model=list[SessionRead])
def list_sessions(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    sessions = db.scalars(_session_query().order_by(AthleteSession.performed_at.desc())).unique().all()
    return sessions


@router.post("", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
def create_session(payload: SessionCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    athlete = db.scalar(select(Athlete).where(Athlete.id == payload.athlete_id))
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")
    session = AthleteSession(**payload.model_dump(exclude={"intervals"}))
    session.intervals = []
    for interval_payload in payload.intervals:
        interval = SessionInterval(**interval_payload.model_dump(exclude={"lactate_sample"}))
        if interval_payload.lactate_sample:
            interval.lactate_sample = LactateSample(**interval_payload.lactate_sample.model_dump())
        session.intervals.append(interval)
    db.add(session)
    db.commit()
    db.refresh(session)
    recalculate_athlete(db, payload.athlete_id)
    refreshed = db.scalar(_session_query().where(AthleteSession.id == session.id))
    return refreshed


@router.get("/{session_id}", response_model=SessionRead)
def get_session(session_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    session = db.scalar(_session_query().where(AthleteSession.id == session_id))
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/intervals/{interval_id}", response_model=SessionRead)
def update_interval(interval_id: int, payload: SessionIntervalUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    interval = db.scalar(select(SessionInterval).options(joinedload(SessionInterval.lactate_sample), joinedload(SessionInterval.session)).where(SessionInterval.id == interval_id))
    if interval is None or interval.session is None:
        raise HTTPException(status_code=404, detail="Interval not found")

    data = payload.model_dump(exclude_unset=True)
    sample_payload = data.pop("lactate_sample", None)
    for field, value in data.items():
        setattr(interval, field, value)

    if sample_payload is not None:
        has_sample_values = any(value not in (None, "") for value in sample_payload.values())
        if interval.lactate_sample is None and has_sample_values:
            interval.lactate_sample = LactateSample(
                lactate_mmol=sample_payload.get("lactate_mmol") or 1.0,
                sample_delay_seconds=sample_payload.get("sample_delay_seconds") or 0,
                sample_timing_label=sample_payload.get("sample_timing_label") or "sin registrar",
                sampling_notes=sample_payload.get("sampling_notes"),
            )
        elif interval.lactate_sample is not None:
            for field, value in sample_payload.items():
                if field == "sample_timing_label" and value in (None, ""):
                    value = "sin registrar"
                if field == "sample_delay_seconds" and value is None:
                    value = 0
                if value is not None:
                    setattr(interval.lactate_sample, field, value)

    db.commit()
    recalculate_athlete(db, interval.session.athlete_id)
    refreshed = db.scalar(_session_query().where(AthleteSession.id == interval.session_id))
    return refreshed


@router.delete("/intervals/{interval_id}/lactate-sample", status_code=status.HTTP_204_NO_CONTENT)
def delete_interval_lactate_sample(interval_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    interval = db.scalar(select(SessionInterval).options(joinedload(SessionInterval.lactate_sample), joinedload(SessionInterval.session)).where(SessionInterval.id == interval_id))
    if interval is None or interval.session is None:
        raise HTTPException(status_code=404, detail="Interval not found")
    if interval.lactate_sample is None:
        raise HTTPException(status_code=404, detail="Lactate sample not found")

    athlete_id = interval.session.athlete_id
    db.delete(interval.lactate_sample)
    db.commit()
    recalculate_athlete(db, athlete_id)
    db.commit()


@router.patch("/{session_id}", response_model=SessionRead)
def update_session(session_id: int, payload: SessionUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    session = db.scalar(_session_query().where(AthleteSession.id == session_id))
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(session, field, value)
    athlete_id = session.athlete_id
    db.commit()
    db.refresh(session)
    recalculate_athlete(db, athlete_id)
    return session


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    session = db.scalar(select(AthleteSession).where(AthleteSession.id == session_id))
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    athlete_id = session.athlete_id
    db.delete(session)
    db.commit()
    recalculate_athlete(db, athlete_id)


@router.get("/{session_id}/analysis", response_model=SessionAnalysisRead)
def session_analysis(session_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    session = db.scalar(_session_query().where(AthleteSession.id == session_id))
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    analysis = analyze_session(session)
    db.commit()
    return {"session": session, **analysis}


@router.post("/import/preview", response_model=ImportPreviewResponse)
async def import_preview(
    file: UploadFile = File(...),
    mapping: Optional[str] = Form(default=None),
    defaults: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        file_bytes = await file.read()
        return build_import_preview(
            db,
            file.filename or "import.csv",
            file_bytes,
            mapping=parse_json_form_field(mapping),
            defaults=parse_json_form_field(defaults),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/import/commit", response_model=ImportCommitResponse)
async def import_commit_route(
    file: UploadFile = File(...),
    mapping: str = Form(...),
    defaults: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        file_bytes = await file.read()
        return commit_import(
            db,
            file.filename or "import.csv",
            file_bytes,
            mapping=parse_json_form_field(mapping),
            defaults=parse_json_form_field(defaults),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
