"""Pydantic schemas for menstrual cycle tracking."""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Preferences ──────────────────────────────────────────────

class CyclePreferencesCreate(BaseModel):
    tracking_goal: Optional[str] = None
    average_cycle_length_days: Optional[int] = Field(None, ge=18, le=45)
    average_period_length_days: Optional[int] = Field(None, ge=1, le=12)
    cycles_are_regular: Optional[bool] = None
    uses_hormonal_contraception: bool = False
    contraception_type: Optional[str] = None
    last_period_start_date: Optional[date] = None
    notify_phase_change: bool = True
    share_with_coach: bool = False


class CyclePreferencesUpdate(BaseModel):
    is_active: Optional[bool] = None
    tracking_goal: Optional[str] = None
    average_cycle_length_days: Optional[int] = Field(None, ge=18, le=45)
    average_period_length_days: Optional[int] = Field(None, ge=1, le=12)
    cycles_are_regular: Optional[bool] = None
    uses_hormonal_contraception: Optional[bool] = None
    contraception_type: Optional[str] = None
    last_period_start_date: Optional[date] = None
    notify_phase_change: Optional[bool] = None
    share_with_coach: Optional[bool] = None


class CyclePreferencesRead(BaseModel):
    id: int
    athlete_id: int
    is_active: bool
    tracking_goal: Optional[str] = None
    average_cycle_length_days: Optional[int] = None
    average_period_length_days: Optional[int] = None
    cycles_are_regular: Optional[bool] = None
    uses_hormonal_contraception: bool
    contraception_type: Optional[str] = None
    last_period_start_date: Optional[date] = None
    notify_phase_change: bool
    share_with_coach: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Cycle Log ────────────────────────────────────────────────

class CycleLogCreate(BaseModel):
    cycle_start_date: date
    period_end_date: Optional[date] = None
    notes: Optional[str] = None


class CycleLogRead(BaseModel):
    id: int
    athlete_id: int
    cycle_start_date: date
    cycle_end_date: Optional[date] = None
    period_end_date: Optional[date] = None
    cycle_length_days: Optional[int] = None
    period_length_days: Optional[int] = None
    is_predicted: bool
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Daily Log ────────────────────────────────────────────────

class DailyLogCreate(BaseModel):
    log_date: date
    flow_intensity: Optional[str] = None
    cramps_level: Optional[int] = Field(None, ge=0, le=3)
    energy_level: Optional[int] = Field(None, ge=1, le=5)
    mood: Optional[str] = None
    bloating: bool = False
    headache: bool = False
    breast_tenderness: bool = False
    back_pain: bool = False
    acne: bool = False
    sleep_quality: Optional[int] = Field(None, ge=1, le=5)
    appetite: Optional[str] = None
    exercise_tolerance: Optional[str] = None
    notes: Optional[str] = None


class DailyLogRead(BaseModel):
    id: int
    athlete_id: int
    log_date: date
    flow_intensity: Optional[str] = None
    cramps_level: Optional[int] = None
    energy_level: Optional[int] = None
    mood: Optional[str] = None
    bloating: bool
    headache: bool
    breast_tenderness: bool
    back_pain: bool
    acne: bool
    sleep_quality: Optional[int] = None
    appetite: Optional[str] = None
    exercise_tolerance: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Dashboard / Phase ────────────────────────────────────────

class CyclePhaseRead(BaseModel):
    """Current phase info for the dashboard."""
    phase: str  # menstruation | follicular | ovulation | early_luteal | late_luteal
    phase_label: str
    day_of_cycle: int
    cycle_day_total: int
    next_period_date: Optional[date] = None
    confidence: float  # 0-1, increases with more logged cycles
    training_tips: list[str] = Field(default_factory=list)


class CycleDashboardRead(BaseModel):
    preferences: Optional[CyclePreferencesRead] = None
    current_phase: Optional[CyclePhaseRead] = None
    recent_cycles: list[CycleLogRead] = Field(default_factory=list)
    recent_daily_logs: list[DailyLogRead] = Field(default_factory=list)
