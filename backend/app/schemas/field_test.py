from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Decoupling ──────────────────────────────────────────────────

class DecouplingResultCreate(BaseModel):
    test_date: date
    discipline: str = "running"
    pace_seconds_per_km: float = Field(ge=120, le=600)
    hr_avg: int = Field(ge=80, le=220)
    hr_first_half: Optional[int] = Field(default=None, ge=80, le=220)
    hr_second_half: Optional[int] = Field(default=None, ge=80, le=220)
    drift_pct: float
    verdict: str
    block_duration_min: float = Field(ge=0)
    pace_cv_pct: Optional[float] = None
    temp_c: Optional[float] = None
    temp_flag: bool = False
    source: str = "dedicated_test"
    planned_session_id: Optional[int] = None
    garmin_activity_id: Optional[int] = None
    notes: Optional[str] = None


class DecouplingResultRead(BaseModel):
    id: int
    athlete_id: int
    test_date: date
    discipline: str
    pace_seconds_per_km: float
    hr_avg: int
    hr_first_half: Optional[int] = None
    hr_second_half: Optional[int] = None
    drift_pct: float
    verdict: str
    block_duration_min: float
    pace_cv_pct: Optional[float] = None
    temp_c: Optional[float] = None
    temp_flag: bool
    source: str
    planned_session_id: Optional[int] = None
    garmin_activity_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Time Trial 30' ──────────────────────────────────────────────

class TimeTrial30ResultCreate(BaseModel):
    test_date: date
    discipline: str = "running"
    avg_pace_seconds_per_km: float = Field(ge=120, le=600)
    avg_hr: int = Field(ge=80, le=220)
    distance_m: Optional[float] = None
    pace_first_half: Optional[float] = None
    pace_second_half: Optional[float] = None
    pacing_diff_pct: float
    pacing_quality: str
    temp_c: Optional[float] = None
    temp_flag: bool = False
    planned_session_id: Optional[int] = None
    garmin_activity_id: Optional[int] = None
    notes: Optional[str] = None


class TimeTrial30ResultRead(BaseModel):
    id: int
    athlete_id: int
    test_date: date
    discipline: str
    avg_pace_seconds_per_km: float
    avg_hr: int
    distance_m: Optional[float] = None
    pace_first_half: Optional[float] = None
    pace_second_half: Optional[float] = None
    pacing_diff_pct: float
    pacing_quality: str
    temp_c: Optional[float] = None
    temp_flag: bool
    planned_session_id: Optional[int] = None
    garmin_activity_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Field Test Snapshot ─────────────────────────────────────────

class FieldTestSnapshotRead(BaseModel):
    id: int
    athlete_id: int
    discipline: str
    lt1_pace_seconds_per_km: Optional[float] = None
    lt1_hr: Optional[int] = None
    lt1_confidence: Optional[float] = None
    lt1_test_count: int = 0
    lt1_last_test_date: Optional[date] = None
    lt2_pace_seconds_per_km: Optional[float] = None
    lt2_hr: Optional[int] = None
    lt2_confidence: Optional[float] = None
    lt2_test_count: int = 0
    lt2_last_test_date: Optional[date] = None
    lt1_lt2_ratio_pace: Optional[float] = None
    lt1_lt2_ratio_hr: Optional[float] = None
    cross_validation_ok: Optional[bool] = None
    transfer_source: Optional[str] = None
    transfer_factor_lt1: Optional[float] = None
    transfer_factor_lt2: Optional[float] = None
    updated_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}
