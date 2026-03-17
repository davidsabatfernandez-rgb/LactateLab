"""Calendar sync via iCal URL (Google Calendar secret address) + Google Calendar OAuth2 API."""

from __future__ import annotations

import logging
import re
import urllib.request
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.planned_session import PlannedSession
from app.models.user import User

router = APIRouter(prefix="/calendar", tags=["calendar"])
logger = logging.getLogger(__name__)


# ── Schemas ────────────────────────────────────────────────────

class CalendarConnectRequest(BaseModel):
    ical_url: str


class CalendarConnectResponse(BaseModel):
    athlete_id: int
    connected: bool


class CalendarEventRead(BaseModel):
    summary: str
    start: Optional[str] = None
    end: Optional[str] = None
    all_day: bool = False


class CalendarDisconnectResponse(BaseModel):
    athlete_id: int
    disconnected: bool


class GCalStartResponse(BaseModel):
    authorize_url: str
    athlete_id: int
    already_connected: bool


class CalendarStatusResponse(BaseModel):
    athlete_id: int
    connected: bool
    provider: Optional[str] = None  # "google" | "ical" | null


class GCalSyncResponse(BaseModel):
    synced: int
    errors: int


# ── iCal parser ────────────────────────────────────────────────

def _unfold_ical(text: str) -> str:
    """RFC 5545: unfold long lines (continuation lines start with a space or tab)."""
    return re.sub(r"\r?\n[ \t]", "", text)


def parse_ical_events(ical_text: str, start_date: date, end_date: date) -> list[dict]:
    """Parse VEVENT blocks from an iCal feed, filtering by date range."""
    ical_text = _unfold_ical(ical_text)
    events: list[dict] = []
    for block in re.split(r"BEGIN:VEVENT", ical_text)[1:]:
        end_block = block.split("END:VEVENT")[0]
        summary = ""
        dtstart = None
        dtend = None
        all_day = False
        for line in end_block.strip().splitlines():
            if line.startswith("SUMMARY:"):
                summary = line[8:].strip()
            elif line.startswith("DTSTART"):
                val = line.split(":")[-1].strip()
                if len(val) == 8:  # YYYYMMDD (all-day event)
                    dtstart = datetime.strptime(val, "%Y%m%d").date()
                    all_day = True
                else:
                    try:
                        dtstart = datetime.strptime(val[:15], "%Y%m%dT%H%M%S")
                    except ValueError:
                        continue
            elif line.startswith("DTEND"):
                val = line.split(":")[-1].strip()
                if len(val) == 8:
                    dtend = datetime.strptime(val, "%Y%m%d").date()
                else:
                    try:
                        dtend = datetime.strptime(val[:15], "%Y%m%dT%H%M%S")
                    except ValueError:
                        pass
        if dtstart is None:
            continue
        event_date = dtstart if isinstance(dtstart, date) and not isinstance(dtstart, datetime) else dtstart.date()
        if start_date <= event_date <= end_date:
            events.append({
                "summary": summary,
                "start": dtstart.isoformat() if dtstart else None,
                "end": dtend.isoformat() if dtend else None,
                "all_day": all_day,
            })
    return events


# ── Helpers ────────────────────────────────────────────────────

def _resolve_target_athlete(db: Session, user: User, athlete_id: int) -> Athlete:
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Athlete not found")
    if user.role == "athlete" and user.athlete_id != athlete_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot access another athlete's calendar")
    return athlete


# ── iCal Endpoints ────────────────────────────────────────────

@router.post("/athletes/{athlete_id}/connect", response_model=CalendarConnectResponse)
def connect_calendar(
    athlete_id: int,
    payload: CalendarConnectRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CalendarConnectResponse:
    """Save an iCal URL for the athlete (Google Calendar secret address)."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    url = payload.ical_url.strip()
    if not url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ical_url is required")
    athlete.calendar_ical_url = url  # type: ignore[assignment]
    db.add(athlete)
    db.commit()
    return CalendarConnectResponse(athlete_id=athlete.id, connected=True)


@router.get("/athletes/{athlete_id}/events", response_model=list[CalendarEventRead])
def get_calendar_events(
    athlete_id: int,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CalendarEventRead]:
    """Fetch calendar events. Prefers Google Calendar API if connected, falls back to iCal."""
    athlete = _resolve_target_athlete(db, user, athlete_id)

    # Prefer Google Calendar API if connected
    if athlete.gcal_connected:
        try:
            from app.services.google_calendar import list_gcal_events

            events = list_gcal_events(db, athlete, start_date, end_date)
            return [CalendarEventRead(**e) for e in events]
        except Exception:
            logger.warning(
                "Google Calendar API failed for athlete %s, falling back to iCal",
                athlete_id,
                exc_info=True,
            )

    # Fall back to iCal
    if not athlete.calendar_ical_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No calendar connected")

    try:
        req = urllib.request.Request(athlete.calendar_ical_url, headers={"User-Agent": "LactateLab/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            ical_text = resp.read().decode("utf-8", errors="replace")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error fetching iCal feed: {exc}",
        ) from exc

    events = parse_ical_events(ical_text, start_date, end_date)
    return [CalendarEventRead(**e) for e in events]


@router.delete("/athletes/{athlete_id}/disconnect", response_model=CalendarDisconnectResponse)
def disconnect_calendar(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CalendarDisconnectResponse:
    """Remove the iCal URL from the athlete record."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    athlete.calendar_ical_url = None  # type: ignore[assignment]
    db.add(athlete)
    db.commit()
    return CalendarDisconnectResponse(athlete_id=athlete.id, disconnected=True)


@router.get("/athletes/{athlete_id}/status", response_model=CalendarStatusResponse)
def calendar_status(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CalendarStatusResponse:
    """Check whether the athlete has a calendar connected and which provider."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    if athlete.gcal_connected:
        return CalendarStatusResponse(athlete_id=athlete.id, connected=True, provider="google")
    if athlete.calendar_ical_url:
        return CalendarStatusResponse(athlete_id=athlete.id, connected=True, provider="ical")
    return CalendarStatusResponse(athlete_id=athlete.id, connected=False, provider=None)


# ── Google Calendar OAuth2 Endpoints ──────────────────────────

@router.post("/athletes/{athlete_id}/google/start", response_model=GCalStartResponse)
def gcal_start(
    athlete_id: int,
    return_path: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GCalStartResponse:
    """Start Google Calendar OAuth2 flow. Returns the authorize URL."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    try:
        from app.services.google_calendar import build_gcal_start_payload

        payload = build_gcal_start_payload(
            user_id=user.id,
            athlete=athlete,
            return_path=return_path,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return GCalStartResponse(
        authorize_url=payload.authorize_url,
        athlete_id=payload.athlete_id,
        already_connected=payload.already_connected,
    )


@router.delete("/athletes/{athlete_id}/google/disconnect", response_model=CalendarDisconnectResponse)
def gcal_disconnect(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CalendarDisconnectResponse:
    """Disconnect Google Calendar from the athlete."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    athlete.gcal_access_token = None  # type: ignore[assignment]
    athlete.gcal_refresh_token = None  # type: ignore[assignment]
    athlete.gcal_token_expires_at = None  # type: ignore[assignment]
    athlete.gcal_connected_at = None  # type: ignore[assignment]
    db.add(athlete)
    db.commit()
    return CalendarDisconnectResponse(athlete_id=athlete.id, disconnected=True)


@router.post("/athletes/{athlete_id}/google/sync-planned", response_model=GCalSyncResponse)
def gcal_sync_planned(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GCalSyncResponse:
    """Manually sync all planned sessions to Google Calendar."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    if not athlete.gcal_connected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google Calendar is not connected",
        )

    from app.services.google_calendar import create_gcal_event, update_gcal_event

    sessions = db.scalars(
        select(PlannedSession)
        .where(PlannedSession.athlete_id == athlete_id)
        .where(PlannedSession.status != "cancelled")
    ).all()

    synced = 0
    errors = 0
    for session in sessions:
        try:
            if session.gcal_event_id:
                update_gcal_event(db, athlete, session)
            else:
                event_id = create_gcal_event(db, athlete, session)
                session.gcal_event_id = event_id
                db.add(session)
            synced += 1
        except Exception:
            logger.warning(
                "Failed to sync planned session %s to Google Calendar",
                session.id,
                exc_info=True,
            )
            errors += 1

    db.commit()
    return GCalSyncResponse(synced=synced, errors=errors)
