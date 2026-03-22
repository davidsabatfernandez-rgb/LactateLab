from typing import List, Optional

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserRead(BaseModel):
    id: int
    email: EmailStr
    role: str
    full_name: str
    athlete_id: Optional[int] = None

    model_config = {"from_attributes": True}


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class RegisterResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    role: str


class InviteAthleteRequest(BaseModel):
    athlete_id: int
    email: EmailStr
    password: str


class InviteAthleteResponse(BaseModel):
    message: str
    email: str
    athlete_id: int


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class MessageResponse(BaseModel):
    message: str


class AthleteGoal(BaseModel):
    """A single goal/target event"""
    event_name: str  # e.g. "Maratón Valencia", "Ironman 70.3", "10k"
    target_date: Optional[str] = None  # ISO date string
    discipline: str  # "running", "cycling", "swimming", "triathlon"
    target_value: Optional[str] = None  # e.g. "3:30:00", "280w", "4:15/km"
    target_type: Optional[str] = None  # "time", "power", "pace"


class AthleteRegisterRequest(BaseModel):
    # Account
    email: EmailStr
    password: str
    full_name: str
    # Questionnaire
    sex: str  # "M" or "F"
    weight_kg: float
    height_cm: Optional[float] = None
    date_of_birth: Optional[str] = None  # ISO date
    primary_discipline: str  # "running", "cycling", "swimming", "triathlon"
    athlete_level: Optional[str] = "trained"  # "recreational", "trained", "competitive"
    goals: List[AthleteGoal] = []
    garmin_email: Optional[str] = None
    garmin_password: Optional[str] = None


class RegisterPendingResponse(BaseModel):
    message: str
    user_id: int


class PendingUserRead(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    created_at: str

    model_config = {"from_attributes": True}


class StravaConnectStartResponse(BaseModel):
    authorize_url: str
    athlete_id: int
    already_connected: bool


class StravaTestConnectRequest(BaseModel):
    code: str
    athlete_id: Optional[int] = None


class StravaTestConnectResponse(BaseModel):
    athlete_id: int
    strava_athlete_id: int
    connected: bool
