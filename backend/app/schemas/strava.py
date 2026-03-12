from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class StravaActivityLapRead(BaseModel):
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


class StravaZoneBucketRead(BaseModel):
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    time_seconds: int = 0


class StravaActivityZoneRead(BaseModel):
    type: str
    score: Optional[int] = None
    sensor_based: Optional[bool] = None
    points: Optional[int] = None
    buckets: list[StravaZoneBucketRead] = Field(default_factory=list)


class StravaActivityStreamRead(BaseModel):
    original_size: int = 0
    resolution: Optional[str] = None
    series_type: Optional[str] = None
    data: list[Any] = Field(default_factory=list)


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
    description: Optional[str] = None
    total_elevation_gain_m: Optional[float] = None
    calories: Optional[float] = None
    average_cadence: Optional[float] = None
    weighted_average_watts: Optional[float] = None
    max_watts: Optional[float] = None
    device_watts: Optional[bool] = None
    suffer_score: Optional[float] = None
    perceived_exertion: Optional[float] = None
    has_heartrate: Optional[bool] = None
    workout_type: Optional[int] = None
    gear_id: Optional[str] = None
    start_latlng: list[float] = Field(default_factory=list)
    end_latlng: list[float] = Field(default_factory=list)
    map_summary_polyline: Optional[str] = None
    device_name: Optional[str] = None
    splits_metric: list[dict[str, Any]] = Field(default_factory=list)
    splits_standard: list[dict[str, Any]] = Field(default_factory=list)
    best_efforts: list[dict[str, Any]] = Field(default_factory=list)
    segment_efforts: list[dict[str, Any]] = Field(default_factory=list)
    laps: list[StravaActivityLapRead] = Field(default_factory=list)
    zones: list[StravaActivityZoneRead] = Field(default_factory=list)
    streams: dict[str, StravaActivityStreamRead] = Field(default_factory=dict)
    raw_detail: dict[str, Any] = Field(default_factory=dict)
    enrichment_error: Optional[str] = None
    enrichment_notice: Optional[str] = None


class StravaActivitiesImportResponse(BaseModel):
    athlete_id: int
    athlete_name: str
    start_date: date
    end_date: date
    imported_count: int
    activities: list[StravaActivityRead]
