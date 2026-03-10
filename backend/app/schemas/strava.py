from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class StravaActivityRead(BaseModel):
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
    kilojoules: Optional[float] = None
    trainer: bool = False
    commute: bool = False


class StravaActivitiesImportResponse(BaseModel):
    athlete_id: int
    athlete_name: str
    start_date: date
    end_date: date
    imported_count: int
    activities: list[StravaActivityRead]
