from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.middleware.rate_limit import check_rate_limit
from app.core.security import create_access_token, get_password_hash, password_needs_rehash, verify_password
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    InviteAthleteRequest,
    InviteAthleteResponse,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    StravaConnectStartResponse,
    StravaTestConnectRequest,
    StravaTestConnectResponse,
    TokenResponse,
    UserRead,
)
from app.services.strava import (
    build_callback_redirect,
    build_strava_start_payload,
    decode_strava_state,
    exchange_code_for_token,
    persist_strava_connection,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db), _rate: None = Depends(check_rate_limit)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if password_needs_rehash(user.hashed_password):
        user.hashed_password = get_password_hash(payload.password)
        db.add(user)
        db.commit()

    return TokenResponse(access_token=create_access_token(user.email))


@router.post("/register", response_model=RegisterResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db), _rate: None = Depends(check_rate_limit)) -> RegisterResponse:
    """Register a new coach account."""
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ya existe una cuenta con este email")

    if len(payload.password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La contraseña debe tener al menos 8 caracteres")

    user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        role="coach",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.email)
    return RegisterResponse(access_token=token, user_id=user.id, role=user.role)


@router.post("/invite-athlete", response_model=InviteAthleteResponse)
def invite_athlete(
    payload: InviteAthleteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> InviteAthleteResponse:
    """Coach creates a user account for an athlete."""
    if user.role != "coach":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo los coaches pueden invitar atletas")

    athlete = db.scalar(select(Athlete).where(Athlete.id == payload.athlete_id))
    if not athlete:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atleta no encontrado")

    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ya existe una cuenta con este email")

    if len(payload.password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La contraseña debe tener al menos 8 caracteres")

    athlete_user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        full_name=athlete.name,
        role="athlete",
        athlete_id=athlete.id,
    )
    db.add(athlete_user)
    db.commit()

    return InviteAthleteResponse(message="Cuenta de atleta creada", email=payload.email, athlete_id=athlete.id)


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(user: User = Depends(get_current_user)) -> TokenResponse:
    """Refresh access token (call before expiry)."""
    token = create_access_token(user.email)
    return TokenResponse(access_token=token)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db), _rate: None = Depends(check_rate_limit)) -> MessageResponse:
    """Reset password (MVP: no email verification, direct reset)."""
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No existe cuenta con este email")

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La contraseña debe tener al menos 8 caracteres")

    user.hashed_password = get_password_hash(payload.new_password)
    db.commit()

    return MessageResponse(message="Contraseña actualizada")


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    """Change password for logged-in user."""
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contraseña actual incorrecta")

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La contraseña debe tener al menos 8 caracteres")

    user.hashed_password = get_password_hash(payload.new_password)
    db.commit()

    return MessageResponse(message="Contraseña actualizada")


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/strava/start", response_model=StravaConnectStartResponse)
def strava_start(
    athlete_id: Optional[int] = Query(default=None),
    return_path: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StravaConnectStartResponse:
    if user.role == "athlete":
        if not user.athlete_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Athlete user is not linked to an athlete profile")
        target_athlete_id = user.athlete_id
        effective_return_path = return_path or "/athlete"
    elif user.role == "coach":
        if athlete_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coach must specify athlete_id to test Strava connection")
        target_athlete_id = athlete_id
        effective_return_path = return_path or "/strava-test"
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Strava connection is not available for this role")

    athlete = db.scalar(select(Athlete).where(Athlete.id == target_athlete_id))
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Athlete not found")

    try:
        payload = build_strava_start_payload(user_id=user.id, athlete=athlete, return_path=effective_return_path)
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
    if error:
        return RedirectResponse(build_callback_redirect("error", error, "/strava-test"), status_code=status.HTTP_302_FOUND)
    if not code or not state:
        return RedirectResponse(build_callback_redirect("error", "missing_code_or_state", "/strava-test"), status_code=status.HTTP_302_FOUND)

    try:
        state_payload = decode_strava_state(state)
        token_payload = exchange_code_for_token(code)
        persist_strava_connection(db, athlete_id=int(state_payload["athlete_id"]), token_payload=token_payload)
    except ValueError as exc:
        return RedirectResponse(build_callback_redirect("error", str(exc), "/strava-test", code=code), status_code=status.HTTP_302_FOUND)

    return RedirectResponse(
        build_callback_redirect("connected", return_path=state_payload.get("return_path")),
        status_code=status.HTTP_302_FOUND,
    )


@router.post("/strava/test-connect", response_model=StravaTestConnectResponse)
def strava_test_connect(
    payload: StravaTestConnectRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StravaTestConnectResponse:
    if user.role == "athlete":
        if not user.athlete_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Athlete user is not linked to an athlete profile")
        target_athlete_id = user.athlete_id
    elif user.role == "coach":
        if payload.athlete_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coach must specify athlete_id for manual Strava test connection")
        target_athlete_id = payload.athlete_id
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Strava test connection is not available for this role")

    athlete = db.scalar(select(Athlete).where(Athlete.id == target_athlete_id))
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Athlete not found")

    try:
        token_payload = exchange_code_for_token(payload.code)
        athlete = persist_strava_connection(db, athlete_id=target_athlete_id, token_payload=token_payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return StravaTestConnectResponse(
        athlete_id=athlete.id,
        strava_athlete_id=athlete.strava_athlete_id or 0,
        connected=athlete.strava_connected,
    )
