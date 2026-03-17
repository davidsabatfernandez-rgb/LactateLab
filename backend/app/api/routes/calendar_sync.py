"""Calendar sync via iCal URL (Google Calendar secret address)."""

from __future__ import annotations

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
from app.models.user import User

router = APIRouter(prefix="/calendar", tags=["calendar"])


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


# ── Endpoints ──────────────────────────────────────────────────

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
    """Fetch and parse the athlete's iCal feed, returning events in the date range."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
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


@router.get("/athletes/{athlete_id}/status")
def calendar_status(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Check whether the athlete has a calendar connected."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    return {"athlete_id": athlete.id, "connected": bool(athlete.calendar_ical_url)}
