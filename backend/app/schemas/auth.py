from typing import Optional

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
