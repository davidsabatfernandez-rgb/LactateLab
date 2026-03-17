"""Google Calendar OAuth2 + Event CRUD service."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.security import decrypt_secret, encrypt_secret
from app.models.athlete import Athlete

logger = logging.getLogger(__name__)

GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.events"

# Discipline -> (emoji, Google Calendar colorId)
_DISCIPLINE_META: dict[str, tuple[str, str]] = {
    "running": ("\U0001f3c3", "9"),    # blueberry
    "cycling": ("\U0001f6b4", "2"),    # sage
    "swimming": ("\U0001f3ca", "7"),   # peacock
}


@dataclass
class GCalStartPayload:
    authorize_url: str
    athlete_id: int
    already_connected: bool


# ---------------------------------------------------------------------------
# Configuration validation
# ---------------------------------------------------------------------------

def _validate_gcal_configuration(settings: Settings) -> None:
    if not settings.google_calendar_client_id or not settings.google_calendar_client_secret:
        raise ValueError("Google Calendar is not configured")


# ---------------------------------------------------------------------------
# OAuth2 helpers
# ---------------------------------------------------------------------------

def _normalized_return_path(value: str | None) -> str:
    if not value or not value.startswith("/"):
        return "/calendar"
    return value


def _state_token(user_id: int, athlete_id: int, return_path: str, settings: Settings) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    payload = {
        "sub": "gcal_oauth",
        "user_id": user_id,
        "athlete_id": athlete_id,
        "return_path": _normalized_return_path(return_path),
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.access_token_algorithm)


def build_gcal_start_payload(
    user_id: int,
    athlete: Athlete,
    return_path: str | None = None,
) -> GCalStartPayload:
    """Build the Google OAuth2 authorize URL with a JWT state token."""
    settings = get_settings()
    _validate_gcal_configuration(settings)
    state = _state_token(
        user_id=user_id,
        athlete_id=athlete.id,
        return_path=_normalized_return_path(return_path),
        settings=settings,
    )
    query = urlencode(
        {
            "client_id": settings.google_calendar_client_id,
            "redirect_uri": settings.google_calendar_redirect_uri,
            "response_type": "code",
            "scope": GCAL_SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
    )
    return GCalStartPayload(
        authorize_url=f"{GOOGLE_AUTHORIZE_URL}?{query}",
        athlete_id=athlete.id,
        already_connected=athlete.gcal_connected,
    )


def decode_gcal_state(state: str) -> dict[str, Any]:
    """Decode and validate the JWT state token from the OAuth callback."""
    settings = get_settings()
    try:
        payload = jwt.decode(state, settings.jwt_secret, algorithms=[settings.access_token_algorithm])
    except JWTError as exc:
        raise ValueError("Invalid Google Calendar OAuth state") from exc
    if payload.get("sub") != "gcal_oauth":
        raise ValueError("Invalid Google Calendar OAuth state")
    return payload


def exchange_gcal_code(code: str) -> dict[str, Any]:
    """Exchange the authorization code for access + refresh tokens."""
    settings = get_settings()
    _validate_gcal_configuration(settings)
    response = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": settings.google_calendar_client_id,
            "client_secret": settings.google_calendar_client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.google_calendar_redirect_uri,
        },
        timeout=15.0,
    )
    if response.status_code >= 400:
        detail = "Google token exchange failed"
        if response.headers.get("content-type", "").startswith("application/json"):
            detail = response.json().get("error_description", detail)
        raise ValueError(detail)
    payload = response.json()
    if not payload.get("access_token") or not payload.get("refresh_token"):
        raise ValueError("Incomplete Google token payload (missing refresh_token — ensure prompt=consent)")
    return payload


def persist_gcal_connection(db: Session, athlete_id: int, token_payload: dict[str, Any]) -> Athlete:
    """Save encrypted Google Calendar tokens on the athlete record."""
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise ValueError("Athlete not found")

    athlete.gcal_access_token = encrypt_secret(token_payload["access_token"])
    athlete.gcal_refresh_token = encrypt_secret(token_payload["refresh_token"])
    # Google returns expires_in (seconds from now)
    expires_in = int(token_payload.get("expires_in", 3600))
    athlete.gcal_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    athlete.gcal_connected_at = datetime.now(timezone.utc)

    db.add(athlete)
    db.commit()
    db.refresh(athlete)
    return athlete


def _ensure_gcal_token(db: Session, athlete: Athlete) -> str:
    """Return a valid access token, refreshing if expired."""
    if not athlete.gcal_access_token or not athlete.gcal_refresh_token or athlete.gcal_token_expires_at is None:
        raise ValueError("Athlete does not have valid Google Calendar tokens")

    now = datetime.now(timezone.utc)
    expires_at = athlete.gcal_token_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    # Still valid (with 5-minute buffer)
    if expires_at > now + timedelta(minutes=5):
        return decrypt_secret(athlete.gcal_access_token)

    # Refresh the token
    settings = get_settings()
    response = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": settings.google_calendar_client_id,
            "client_secret": settings.google_calendar_client_secret,
            "grant_type": "refresh_token",
            "refresh_token": decrypt_secret(athlete.gcal_refresh_token),
        },
        timeout=15.0,
    )
    if response.status_code >= 400:
        detail = "Google Calendar token refresh failed"
        if response.headers.get("content-type", "").startswith("application/json"):
            detail = response.json().get("error_description", detail)
        raise ValueError(detail)

    payload = response.json()
    if not payload.get("access_token"):
        raise ValueError("Incomplete Google refresh payload")

    athlete.gcal_access_token = encrypt_secret(payload["access_token"])
    expires_in = int(payload.get("expires_in", 3600))
    athlete.gcal_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    # Google may or may not return a new refresh token
    if payload.get("refresh_token"):
        athlete.gcal_refresh_token = encrypt_secret(payload["refresh_token"])

    db.add(athlete)
    db.commit()
    db.refresh(athlete)
    return payload["access_token"]


def build_gcal_callback_redirect(
    status: str,
    reason: str | None = None,
    return_path: str | None = None,
) -> str:
    """Build the redirect URL back to the frontend after OAuth callback."""
    settings = get_settings()
    query: dict[str, str] = {"gcal": status}
    if reason:
        query["reason"] = reason
    return f"{settings.frontend_base_url.rstrip('/')}{_normalized_return_path(return_path)}?{urlencode(query)}"


# ---------------------------------------------------------------------------
# Calendar Event CRUD
# ---------------------------------------------------------------------------

def list_gcal_events(
    db: Session,
    athlete: Athlete,
    start_date: date,
    end_date: date,
) -> list[dict]:
    """GET events from Google Calendar API for a date range."""
    access_token = _ensure_gcal_token(db, athlete)
    time_min = datetime.combine(start_date, datetime.min.time()).isoformat() + "Z"
    time_max = datetime.combine(end_date + timedelta(days=1), datetime.min.time()).isoformat() + "Z"

    events: list[dict] = []
    page_token: str | None = None

    while True:
        params: dict[str, str] = {
            "timeMin": time_min,
            "timeMax": time_max,
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": "250",
        }
        if page_token:
            params["pageToken"] = page_token

        response = httpx.get(
            GOOGLE_CALENDAR_EVENTS_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
            timeout=15.0,
        )
        if response.status_code >= 400:
            detail = "Failed to fetch Google Calendar events"
            if response.headers.get("content-type", "").startswith("application/json"):
                detail = response.json().get("error", {}).get("message", detail)
            raise ValueError(detail)

        data = response.json()
        for item in data.get("items", []):
            start_info = item.get("start", {})
            end_info = item.get("end", {})
            all_day = "date" in start_info and "dateTime" not in start_info
            events.append({
                "summary": item.get("summary", ""),
                "start": start_info.get("dateTime") or start_info.get("date"),
                "end": end_info.get("dateTime") or end_info.get("date"),
                "all_day": all_day,
            })

        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return events


def _session_to_gcal_body(planned_session: Any) -> dict:
    """Map a PlannedSession to a Google Calendar event JSON body."""
    discipline = (planned_session.discipline or "running").lower()
    emoji, color_id = _DISCIPLINE_META.get(discipline, ("\U0001f3c3", "9"))

    summary = f"{emoji} {planned_session.public_label}"

    description_parts: list[str] = []
    if planned_session.objective:
        description_parts.append(planned_session.objective)
    if planned_session.dose_prescription:
        description_parts.append(planned_session.dose_prescription)
    if planned_session.coach_note:
        description_parts.append(f"Coach: {planned_session.coach_note}")
    description = "\n\n".join(description_parts)

    payload = planned_session.payload or {}
    duration_min = payload.get("total_duration_min", 60)

    body: dict[str, Any] = {
        "summary": summary,
        "description": description,
        "colorId": color_id,
    }

    scheduled_time = planned_session.scheduled_time  # "HH:MM" or None
    scheduled_date = planned_session.scheduled_date   # date object

    if scheduled_time:
        # Timed event
        try:
            hour, minute = map(int, scheduled_time.split(":"))
            start_dt = datetime(
                scheduled_date.year, scheduled_date.month, scheduled_date.day,
                hour, minute, 0,
            )
            end_dt = start_dt + timedelta(minutes=int(duration_min))
            body["start"] = {"dateTime": start_dt.isoformat(), "timeZone": "Europe/Madrid"}
            body["end"] = {"dateTime": end_dt.isoformat(), "timeZone": "Europe/Madrid"}
        except (ValueError, TypeError):
            # Fallback to all-day
            body["start"] = {"date": scheduled_date.isoformat()}
            body["end"] = {"date": (scheduled_date + timedelta(days=1)).isoformat()}
    else:
        # All-day event
        body["start"] = {"date": scheduled_date.isoformat()}
        body["end"] = {"date": (scheduled_date + timedelta(days=1)).isoformat()}

    return body


def create_gcal_event(db: Session, athlete: Athlete, planned_session: Any) -> str:
    """Create a Google Calendar event for a PlannedSession. Returns the event ID."""
    access_token = _ensure_gcal_token(db, athlete)
    body = _session_to_gcal_body(planned_session)

    response = httpx.post(
        GOOGLE_CALENDAR_EVENTS_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=15.0,
    )
    if response.status_code >= 400:
        detail = "Failed to create Google Calendar event"
        if response.headers.get("content-type", "").startswith("application/json"):
            detail = response.json().get("error", {}).get("message", detail)
        raise ValueError(detail)

    event_data = response.json()
    return event_data["id"]


def update_gcal_event(db: Session, athlete: Athlete, planned_session: Any) -> None:
    """Update an existing Google Calendar event using gcal_event_id."""
    if not planned_session.gcal_event_id:
        raise ValueError("PlannedSession has no gcal_event_id")

    access_token = _ensure_gcal_token(db, athlete)
    body = _session_to_gcal_body(planned_session)
    event_url = f"{GOOGLE_CALENDAR_EVENTS_URL}/{planned_session.gcal_event_id}"

    response = httpx.put(
        event_url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=15.0,
    )
    if response.status_code >= 400:
        detail = "Failed to update Google Calendar event"
        if response.headers.get("content-type", "").startswith("application/json"):
            detail = response.json().get("error", {}).get("message", detail)
        raise ValueError(detail)


def delete_gcal_event(db: Session, athlete: Athlete, planned_session: Any) -> None:
    """Delete a Google Calendar event using gcal_event_id."""
    if not planned_session.gcal_event_id:
        return  # Nothing to delete

    access_token = _ensure_gcal_token(db, athlete)
    event_url = f"{GOOGLE_CALENDAR_EVENTS_URL}/{planned_session.gcal_event_id}"

    response = httpx.delete(
        event_url,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15.0,
    )
    # 404/410 = already deleted, that's fine
    if response.status_code >= 400 and response.status_code not in (404, 410):
        detail = "Failed to delete Google Calendar event"
        if response.headers.get("content-type", "").startswith("application/json"):
            detail = response.json().get("error", {}).get("message", detail)
        raise ValueError(detail)


def sync_session_to_gcal(db: Session, planned_session: Any) -> None:
    """Best-effort sync: create or update a session in Google Calendar. Never raises."""
    try:
        athlete = db.scalar(select(Athlete).where(Athlete.id == planned_session.athlete_id))
        if athlete is None or not athlete.gcal_connected:
            return

        if planned_session.gcal_event_id:
            update_gcal_event(db, athlete, planned_session)
        else:
            event_id = create_gcal_event(db, athlete, planned_session)
            planned_session.gcal_event_id = event_id
            db.add(planned_session)
            db.commit()
    except Exception:
        logger.warning(
            "Failed to sync planned session %s to Google Calendar",
            getattr(planned_session, "id", "?"),
            exc_info=True,
        )
