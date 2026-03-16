from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, EmailStr


class GarminConnectRequest(BaseModel):
    email: EmailStr
    password: str
    mfa_code: Optional[str] = None


class GarminConnectResponse(BaseModel):
    athlete_id: int
    garmin_user_id: int
    garmin_email: EmailStr
    connected: bool


class GarminActivityLapRead(BaseModel):
    lap_index: int
    name: str
    distance_m: float
    elapsed_time_seconds: int
    moving_time_seconds: int
    average_speed_m_s: Optional[float] = None
    average_heartrate: Optional[float] = None
    max_heartrate: Optional[float] = None
    average_watts: Optional[float] = None
    start_date: Optional[datetime] = None


class GarminActivityRead(BaseModel):
    provider_activity_id: int
    name: str
    sport_type: str
    started_at: datetime
    timezone: Optional[str] = None
    distance_m: float
    moving_time_seconds: int
    elapsed_time_seconds: int
    average_speed_m_s: Optional[float] = None
    max_speed_m_s: Optional[float] = None
    average_heartrate: Optional[float] = None
    max_heartrate: Optional[float] = None
    average_watts: Optional[float] = None
    calories: Optional[float] = None
    description: Optional[str] = None
    total_elevation_gain_m: Optional[float] = None
    average_cadence: Optional[float] = None
    max_watts: Optional[float] = None
    start_latlng: list[float] = Field(default_factory=list)
    end_latlng: list[float] = Field(default_factory=list)
    device_name: Optional[str] = None
    laps: list[GarminActivityLapRead] = Field(default_factory=list)
    raw_detail: dict[str, Any] = Field(default_factory=dict)


class GarminPushWorkoutResponse(BaseModel):
    session_id: int
    garmin_workout_id: Optional[int] = None
    status: str


class GarminActivitiesPreviewResponse(BaseModel):
    athlete_id: int
    athlete_name: str
    start_date: date
    end_date: date
    imported_count: int
    activities: list[GarminActivityRead]


class GarminActivityStoredRead(BaseModel):
    id: int
    athlete_id: int
    provider_activity_id: int
    sport_type: str
    discipline: str
    name: Optional[str] = None
    started_at: str
    distance_m: Optional[float] = None
    moving_time_seconds: Optional[int] = None
    elapsed_time_seconds: Optional[int] = None
    average_heartrate: Optional[float] = None
    max_heartrate: Optional[float] = None
    average_watts: Optional[float] = None
    max_watts: Optional[float] = None
    average_speed_m_s: Optional[float] = None
    total_elevation_gain_m: Optional[float] = None
    average_cadence: Optional[float] = None
    calories: Optional[float] = None
    device_name: Optional[str] = None
    tss: Optional[float] = None
    tss_method: Optional[str] = None
    planned_session_id: Optional[int] = None
    synced_at: str

    class Config:
        from_attributes = True


class GarminSyncResponse(BaseModel):
    athlete_id: int
    synced: bool = True
    new_activities: int
    total_activities: int
    sync_range_start: str
    sync_range_end: str
    last_sync_at: Optional[datetime] = None
    matching: Optional[dict] = None


class GarminSyncStatusResponse(BaseModel):
    connected: bool
    last_sync_at: Optional[datetime] = None
    stale: bool
    garmin_email: Optional[str] = None
