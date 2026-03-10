from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.user import User
from app.schemas.auth import LoginRequest, StravaConnectStartResponse, TokenResponse, UserRead
from app.services.strava import (
    build_callback_redirect,
    build_strava_start_payload,
    decode_strava_state,
    exchange_code_for_token,
    persist_strava_connection,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(user.email))


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/strava/start", response_model=StravaConnectStartResponse)
def strava_start(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StravaConnectStartResponse:
    if user.role != "athlete":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Strava connection is only available in the athlete portal")
    if not user.athlete_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Athlete user is not linked to an athlete profile")

    athlete = db.scalar(select(Athlete).where(Athlete.id == user.athlete_id))
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Athlete not found")

    try:
        payload = build_strava_start_payload(user_id=user.id, athlete=athlete)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return StravaConnectStartResponse(**payload.__dict__)


@router.get("/strava/callback")
def strava_callback(
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    _: Optional[str] = Query(default=None, alias="scope"),
    db: Session = Depends(get_db),
):
    settings = get_settings()

    if error:
        return RedirectResponse(build_callback_redirect("error", error), status_code=status.HTTP_302_FOUND)
    if not code or not state:
        return RedirectResponse(build_callback_redirect("error", "missing_code_or_state"), status_code=status.HTTP_302_FOUND)

    try:
        state_payload = decode_strava_state(state)
        token_payload = exchange_code_for_token(code)
        persist_strava_connection(db, athlete_id=int(state_payload["athlete_id"]), token_payload=token_payload)
    except ValueError as exc:
        return RedirectResponse(build_callback_redirect("error", str(exc)), status_code=status.HTTP_302_FOUND)

    return RedirectResponse(f"{settings.frontend_base_url.rstrip('/')}/athlete?strava=connected", status_code=status.HTTP_302_FOUND)
