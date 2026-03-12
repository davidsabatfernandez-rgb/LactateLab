from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class AthleteHealthProviderStatusRead(BaseModel):
    provider: str
    label: str
    connected: bool
    status: str
    last_sync_at: Optional[datetime] = None
    detail: Optional[str] = None


class AthleteHealthSummaryRead(BaseModel):
    activities_count: int
    training_days: int
    total_duration_seconds: int
    total_distance_m: float
    most_recent_activity_at: Optional[datetime] = None
    primary_sport_label: Optional[str] = None
    primary_sport_color: Optional[str] = None


class AthleteHealthMetricRead(BaseModel):
    key: str
    label: str
    value: str
    detail: Optional[str] = None


class AthleteHealthDailyRead(BaseModel):
    date: date
    sleep_score: Optional[int] = None
    sleep_seconds: Optional[int] = None
    resting_hr: Optional[int] = None
    body_battery_change: Optional[int] = None
    respiration_rate: Optional[float] = None
    breathing_events: Optional[int] = None
    stress_level: Optional[int] = None
    hrv_status: Optional[str] = None
    hrv_last_night_avg: Optional[int] = None
    steps: Optional[int] = None
    intensity_minutes: Optional[int] = None


class AthleteHealthActivityRead(BaseModel):
    provider_activity_id: int
    name: str
    started_at: datetime
    sport_type: str
    sport_label: str
    sport_color: str
    distance_m: float
    moving_time_seconds: int
    average_heartrate: Optional[float] = None
    average_watts: Optional[float] = None
    source: str


class AthleteHealthCalendarDayRead(BaseModel):
    date: date
    activity_count: int
    total_duration_seconds: int
    total_distance_m: float
    primary_sport_label: Optional[str] = None
    primary_sport_color: Optional[str] = None


class AthleteHealthOverviewRead(BaseModel):
    athlete_id: int
    athlete_name: str
    window_start: date
    window_end: date
    providers: list[AthleteHealthProviderStatusRead] = Field(default_factory=list)
    summary: AthleteHealthSummaryRead
    health_metrics: list[AthleteHealthMetricRead] = Field(default_factory=list)
    sleep_breakdown: list[AthleteHealthMetricRead] = Field(default_factory=list)
    performance_metrics: list[AthleteHealthMetricRead] = Field(default_factory=list)
    health_days: list[AthleteHealthDailyRead] = Field(default_factory=list)
    recent_activities: list[AthleteHealthActivityRead] = Field(default_factory=list)
    activity_calendar: list[AthleteHealthCalendarDayRead] = Field(default_factory=list)
    raw_wellness: dict[str, Any] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)
