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


class StravaConnectStartResponse(BaseModel):
    authorize_url: str
    athlete_id: int
    already_connected: bool
