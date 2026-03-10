from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.security import encrypt_secret
from app.models.athlete import Athlete

STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"


@dataclass
class StravaStartPayload:
    authorize_url: str
    athlete_id: int
    already_connected: bool


def _normalized_return_path(value: str | None) -> str:
    if not value or not value.startswith("/"):
        return "/strava-test"
    return value


def _state_token(user_id: int, athlete_id: int, return_path: str, settings: Settings) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    payload = {
        "sub": "strava_oauth",
        "user_id": user_id,
        "athlete_id": athlete_id,
        "return_path": _normalized_return_path(return_path),
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.access_token_algorithm)


def build_strava_start_payload(user_id: int, athlete: Athlete, return_path: str | None = None) -> StravaStartPayload:
    settings = get_settings()
    _validate_strava_configuration(settings)
    state = _state_token(
        user_id=user_id,
        athlete_id=athlete.id,
        return_path=_normalized_return_path(return_path),
        settings=settings,
    )
    query = urlencode(
        {
            "client_id": settings.strava_client_id,
            "redirect_uri": settings.strava_redirect_uri,
            "response_type": "code",
            "approval_prompt": "auto",
            "scope": settings.strava_scopes,
            "state": state,
        }
    )
    return StravaStartPayload(
        authorize_url=f"{STRAVA_AUTHORIZE_URL}?{query}",
        athlete_id=athlete.id,
        already_connected=athlete.strava_connected,
    )


def decode_strava_state(state: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(state, settings.jwt_secret, algorithms=[settings.access_token_algorithm])
    except JWTError as exc:
        raise ValueError("Invalid Strava OAuth state") from exc
    if payload.get("sub") != "strava_oauth":
        raise ValueError("Invalid Strava OAuth state")
    return payload


def exchange_code_for_token(code: str) -> dict[str, Any]:
    settings = get_settings()
    _validate_strava_configuration(settings)
    response = httpx.post(
        STRAVA_TOKEN_URL,
        data={
            "client_id": settings.strava_client_id,
            "client_secret": settings.strava_client_secret,
            "code": code,
            "grant_type": "authorization_code",
        },
        timeout=15.0,
    )
    if response.status_code >= 400:
        detail = response.json().get("message", "Strava token exchange failed") if response.headers.get("content-type", "").startswith("application/json") else "Strava token exchange failed"
        raise ValueError(detail)
    payload = response.json()
    if not payload.get("access_token") or not payload.get("refresh_token") or not payload.get("athlete", {}).get("id"):
        raise ValueError("Incomplete Strava token payload")
    return payload


def persist_strava_connection(db: Session, athlete_id: int, token_payload: dict[str, Any]) -> Athlete:
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise ValueError("Athlete not found")

    strava_athlete_id = int(token_payload["athlete"]["id"])
    existing = db.scalar(select(Athlete).where(Athlete.strava_athlete_id == strava_athlete_id, Athlete.id != athlete_id))
    if existing is not None:
        raise ValueError("This Strava account is already linked to another athlete")

    athlete.strava_athlete_id = strava_athlete_id
    athlete.strava_access_token = encrypt_secret(token_payload["access_token"])
    athlete.strava_refresh_token = encrypt_secret(token_payload["refresh_token"])
    athlete.strava_token_expires_at = datetime.fromtimestamp(int(token_payload["expires_at"]), tz=timezone.utc)
    athlete.strava_connected_at = datetime.now(timezone.utc)

    db.add(athlete)
    db.commit()
    db.refresh(athlete)
    return athlete


def build_callback_redirect(status: str, reason: str | None = None, return_path: str | None = None, code: str | None = None) -> str:
    settings = get_settings()
    query = {"strava": status}
    if reason:
        query["reason"] = reason
    if code:
        query["code"] = code
    return f"{settings.frontend_base_url.rstrip('/')}{_normalized_return_path(return_path)}?{urlencode(query)}"


def _validate_strava_configuration(settings: Settings) -> None:
    if not settings.strava_client_id or not settings.strava_client_secret:
        raise ValueError("Strava is not configured")
