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
    AthleteRegisterRequest,
    ChangePasswordRequest,
    InviteAthleteRequest,
    InviteAthleteResponse,
    LoginRequest,
    MessageResponse,
    PendingUserRead,
    RegisterPendingResponse,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    StravaConnectStartResponse,
    StravaTestConnectRequest,
    StravaTestConnectResponse,
    TokenResponse,
    UserRead,
)
from app.services.google_calendar import (
    build_gcal_callback_redirect,
    decode_gcal_state,
    exchange_gcal_code,
    persist_gcal_connection,
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

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tu cuenta está pendiente de aprobación. Te avisaremos cuando esté activa.")

    if password_needs_rehash(user.hashed_password):
        user.hashed_password = get_password_hash(payload.password)
        db.add(user)
        db.commit()

    return TokenResponse(access_token=create_access_token(user.email))


@router.post("/register", response_model=RegisterPendingResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db), _rate: None = Depends(check_rate_limit)) -> RegisterPendingResponse:
    """Register a new coach account (pending approval)."""
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
        is_active=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return RegisterPendingResponse(message="Cuenta creada. Está pendiente de aprobación.", user_id=user.id)


@router.post("/register-athlete", response_model=RegisterPendingResponse)
def register_athlete(
    payload: AthleteRegisterRequest,
    db: Session = Depends(get_db),
    _rate: None = Depends(check_rate_limit),
) -> RegisterResponse:
    """Self-registration for athletes with questionnaire."""
    import json
    import logging
    from datetime import date as date_type

    logger = logging.getLogger(__name__)

    # --- Validate email uniqueness ---
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ya existe una cuenta con este email")

    # --- Validate password ---
    if len(payload.password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La contraseña debe tener al menos 8 caracteres")

    # --- Find demo coach ---
    demo_coach = db.scalar(select(User).where(User.email == "coach@lactatelab.dev"))
    coach_id = demo_coach.id if demo_coach else 1

    # --- Parse date_of_birth ---
    dob = None
    if payload.date_of_birth:
        try:
            dob = date_type.fromisoformat(payload.date_of_birth)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="date_of_birth debe ser una fecha ISO válida (YYYY-MM-DD)")

    # --- Build training_goal JSON from goals ---
    training_goal_json = None
    if payload.goals:
        training_goal_json = json.dumps([g.dict() for g in payload.goals], ensure_ascii=False)

    goal_category = payload.goals[0].event_name if payload.goals else None

    # --- Create Athlete record ---
    athlete = Athlete(
        name=payload.full_name,
        sex=payload.sex,
        weight=payload.weight_kg,
        height=payload.height_cm,
        date_of_birth=dob or date_type(2000, 1, 1),
        primary_discipline=payload.primary_discipline,
        athlete_level=payload.athlete_level or "trained",
        coach_id=coach_id,
        training_goal=training_goal_json,
        goal_category=goal_category,
        created_at=date_type.today(),
    )
    db.add(athlete)
    db.flush()  # get athlete.id without committing

    # --- Create User record (pending approval) ---
    user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        role="athlete",
        athlete_id=athlete.id,
        is_active=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.refresh(athlete)

    # --- Optional Garmin connection (best-effort, don't fail registration) ---
    if payload.garmin_email and payload.garmin_password:
        try:
            from app.services.garmin import connect_garmin_account

            connect_garmin_account(
                db,
                athlete_id=athlete.id,
                email=payload.garmin_email,
                password=payload.garmin_password,
            )
        except Exception:
            logger.warning("Garmin connection failed during athlete self-registration for %s — skipping", payload.email)

    return RegisterPendingResponse(message="Cuenta creada. Está pendiente de aprobación.", user_id=user.id)


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


@router.get("/pending-users", response_model=list[PendingUserRead])
def pending_users(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List users pending approval (coach only)."""
    if user.role != "coach":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo los coaches pueden ver usuarios pendientes")
    rows = db.scalars(select(User).where(User.is_active == False).order_by(User.created_at.desc())).all()  # noqa: E712
    return [
        PendingUserRead(
            id=u.id, email=u.email, full_name=u.full_name,
            role=u.role, created_at=u.created_at.isoformat() if u.created_at else "",
        )
        for u in rows
    ]


@router.patch("/users/{user_id}/activate", response_model=MessageResponse)
def activate_user(user_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> MessageResponse:
    """Approve a pending user (coach only)."""
    if user.role != "coach":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo los coaches pueden aprobar usuarios")
    target = db.scalar(select(User).where(User.id == user_id))
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    target.is_active = True
    db.commit()
    return MessageResponse(message=f"Usuario {target.email} aprobado")


@router.delete("/users/{user_id}/reject", response_model=MessageResponse)
def reject_user(user_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> MessageResponse:
    """Reject and delete a pending user (coach only)."""
    if user.role != "coach":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo los coaches pueden rechazar usuarios")
    target = db.scalar(select(User).where(User.id == user_id))
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    if target.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede rechazar un usuario ya activo")
    # If athlete role, also remove the athlete record
    if target.role == "athlete" and target.athlete_id:
        athlete = db.scalar(select(Athlete).where(Athlete.id == target.athlete_id))
        if athlete:
            db.delete(athlete)
    db.delete(target)
    db.commit()
    return MessageResponse(message=f"Usuario {target.email} rechazado y eliminado")


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
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Auto-fix orphaned athlete link: user points to deleted athlete
    if user.role == "athlete" and user.athlete_id:
        athlete = db.scalar(select(Athlete).where(Athlete.id == user.athlete_id))
        if athlete is None:
            import logging
            logging.getLogger(__name__).warning("User %s has orphaned athlete_id=%s, attempting fix", user.email, user.athlete_id)
            from sqlalchemy import text
            row = db.execute(text(
                "SELECT id FROM athletes ORDER BY id DESC LIMIT 1"
            )).fetchone()
            if row:
                user.athlete_id = row[0]
                db.add(user)
                db.commit()
                db.refresh(user)
                logging.getLogger(__name__).info("Fixed user %s: athlete_id %s -> %s", user.email, user.athlete_id, row[0])
        else:
            # Auto-sync today's Garmin activities if connected and stale (>20 min)
            _auto_sync_today(db, athlete)
    return user


def _auto_sync_today(db: Session, athlete: "Athlete") -> None:
    """Sync only today's Garmin activities if last sync was >20 min ago. Best-effort."""
    if not athlete.garmin_connected:
        return
    from datetime import datetime, timedelta
    stale_threshold = datetime.utcnow() - timedelta(minutes=20)
    if athlete.garmin_last_sync_at and athlete.garmin_last_sync_at >= stale_threshold:
        return
    try:
        from app.services.garmin import sync_garmin_activities
        sync_garmin_activities(db, athlete, days_back=1)
    except Exception:
        import logging
        logging.getLogger(__name__).warning("Auto-sync today failed for athlete %s", athlete.id)


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


@router.get("/google-calendar/callback")
def google_calendar_callback(
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    _: Optional[str] = Query(default=None, alias="scope"),
    db: Session = Depends(get_db),
):
    """Handle Google Calendar OAuth2 callback."""
    if error:
        return RedirectResponse(
            build_gcal_callback_redirect("error", error, "/calendar"),
            status_code=status.HTTP_302_FOUND,
        )
    if not code or not state:
        return RedirectResponse(
            build_gcal_callback_redirect("error", "missing_code_or_state", "/calendar"),
            status_code=status.HTTP_302_FOUND,
        )

    return_path = "/calendar"
    try:
        state_payload = decode_gcal_state(state)
        return_path = state_payload.get("return_path", "/calendar")
        token_payload = exchange_gcal_code(code)
        persist_gcal_connection(db, athlete_id=int(state_payload["athlete_id"]), token_payload=token_payload)
    except ValueError as exc:
        return RedirectResponse(
            build_gcal_callback_redirect("error", str(exc), return_path),
            status_code=status.HTTP_302_FOUND,
        )

    return RedirectResponse(
        build_gcal_callback_redirect("connected", return_path=return_path),
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
