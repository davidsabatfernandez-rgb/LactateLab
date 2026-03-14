from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LactateSampleBase(BaseModel):
    lactate_mmol: float = Field(gt=0)
    baseline_lactate: Optional[float] = Field(default=None, gt=0)
    sample_delay_seconds: int = Field(ge=0)
    sample_timing_label: str
    sampling_notes: Optional[str] = None


class LactateSampleCreate(LactateSampleBase):
    pass


class LactateSampleUpdate(BaseModel):
    lactate_mmol: Optional[float] = Field(default=None, gt=0)
    baseline_lactate: Optional[float] = Field(default=None, gt=0)
    sample_delay_seconds: Optional[int] = Field(default=None, ge=0)
    sample_timing_label: Optional[str] = None
    sampling_notes: Optional[str] = None


class LactateSampleRead(LactateSampleBase):
    id: int
    contextual_lactate: Optional[float] = None
    contextual_confidence: Optional[float] = None
    interpretation: Optional[str] = None

    model_config = {"from_attributes": True}


class SessionIntervalBase(BaseModel):
    order_index: int = Field(ge=1)
    duration_seconds: int = Field(gt=0)
    rest_seconds: Optional[int] = Field(default=None, ge=0)
    rest_type: Optional[str] = None
    heart_rate_avg: Optional[int] = Field(default=None, ge=0)
    heart_rate_max: Optional[int] = Field(default=None, ge=0)
    pace_seconds_per_km: Optional[float] = Field(default=None, gt=0)
    power_watts: Optional[float] = Field(default=None, gt=0)
    running_power_watts: Optional[float] = Field(default=None, gt=0)
    cadence: Optional[int] = Field(default=None, ge=0)
    rpe: Optional[float] = Field(default=None, ge=0, le=10)
    purpose: str
    notes: Optional[str] = None
    lactate_sample: Optional[LactateSampleCreate] = None


class SessionIntervalCreate(SessionIntervalBase):
    pass


class SessionIntervalUpdate(BaseModel):
    rest_seconds: Optional[int] = Field(default=None, ge=0)
    rest_type: Optional[str] = None
    heart_rate_avg: Optional[int] = Field(default=None, ge=0)
    heart_rate_max: Optional[int] = Field(default=None, ge=0)
    pace_seconds_per_km: Optional[float] = Field(default=None, gt=0)
    power_watts: Optional[float] = Field(default=None, gt=0)
    running_power_watts: Optional[float] = Field(default=None, gt=0)
    cadence: Optional[int] = Field(default=None, ge=0)
    rpe: Optional[float] = Field(default=None, ge=0, le=10)
    notes: Optional[str] = None
    lactate_sample: Optional[LactateSampleUpdate] = None


class SessionIntervalRead(SessionIntervalBase):
    id: int
    lactate_sample: Optional[LactateSampleRead] = None

    model_config = {"from_attributes": True}


class SessionBase(BaseModel):
    athlete_id: int
    performed_at: datetime
    discipline: str
    power_source: Optional[str] = None
    session_type: str
    goal: str
    session_heart_rate_max: Optional[int] = Field(default=None, ge=0)
    surface: Optional[str] = None
    temperature_c: Optional[float] = None
    comments: Optional[str] = None


class SessionCreate(SessionBase):
    intervals: list[SessionIntervalCreate]


class SessionUpdate(BaseModel):
    performed_at: Optional[datetime] = None
    discipline: Optional[str] = None
    power_source: Optional[str] = None
    session_type: Optional[str] = None
    goal: Optional[str] = None
    session_heart_rate_max: Optional[int] = Field(default=None, ge=0)
    surface: Optional[str] = None
    temperature_c: Optional[float] = None
    comments: Optional[str] = None


class SessionRead(SessionBase):
    id: int
    intervals: list[SessionIntervalRead] = []

    model_config = {"from_attributes": True}
