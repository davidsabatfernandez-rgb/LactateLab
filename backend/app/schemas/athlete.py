from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class AthleteWeightHistoryBase(BaseModel):
    recorded_at: date
    weight: float = Field(gt=0)
    source: Optional[str] = None


class AthleteWeightHistoryCreate(AthleteWeightHistoryBase):
    pass


class AthleteWeightHistoryRead(AthleteWeightHistoryBase):
    id: int

    model_config = {"from_attributes": True}


class AthleteFocusBlockBase(BaseModel):
    start_date: date
    end_date: Optional[date] = None
    template_id: Optional[str] = None
    energy_system_focus: str
    block_objective: str
    block_intent: Optional[str] = None
    priority_discipline: Optional[str] = None
    phase: Optional[str] = None
    target_event: Optional[str] = None
    target_date: Optional[date] = None
    status: str = "planned"
    coach_notes: Optional[str] = None


class AthleteFocusBlockCreate(AthleteFocusBlockBase):
    pass


class AthleteFocusBlockUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    template_id: Optional[str] = None
    energy_system_focus: Optional[str] = None
    block_objective: Optional[str] = None
    block_intent: Optional[str] = None
    priority_discipline: Optional[str] = None
    phase: Optional[str] = None
    target_event: Optional[str] = None
    target_date: Optional[date] = None
    status: Optional[str] = None
    coach_notes: Optional[str] = None


class AthleteFocusBlockRead(AthleteFocusBlockBase):
    id: int

    model_config = {"from_attributes": True}


class AthleteFocusBlockEvaluationRead(BaseModel):
    block_id: int
    status: str
    summary: str
    direction: str
    confidence: float
    worked: Optional[bool] = None
    key_metric: str
    baseline_value: Optional[float] = None
    latest_value: Optional[float] = None
    delta: Optional[float] = None
    unit: str
    baseline_weight: Optional[float] = None
    latest_weight: Optional[float] = None
    baseline_relative_value: Optional[float] = None
    latest_relative_value: Optional[float] = None
    delta_relative: Optional[float] = None
    relative_unit: Optional[str] = None
    recommendation: str


class AthleteTargetBase(BaseModel):
    target_date: date
    discipline: str
    objective: Optional[str] = None
    distance_label: Optional[str] = None
    distance_category: Optional[str] = None
    priority_level: Optional[str] = None
    target_pace_label: Optional[str] = None
    target_power_watts: Optional[float] = None
    target_running_pace_label: Optional[str] = None
    target_swim_pace_label: Optional[str] = None
    target_cycling_power_watts: Optional[float] = None
    notes: Optional[str] = None


class AthleteTargetCreate(AthleteTargetBase):
    pass


class AthleteTargetUpdate(BaseModel):
    target_date: Optional[date] = None
    discipline: Optional[str] = None
    objective: Optional[str] = None
    distance_label: Optional[str] = None
    distance_category: Optional[str] = None
    priority_level: Optional[str] = None
    target_pace_label: Optional[str] = None
    target_power_watts: Optional[float] = None
    target_running_pace_label: Optional[str] = None
    target_swim_pace_label: Optional[str] = None
    target_cycling_power_watts: Optional[float] = None
    notes: Optional[str] = None


class AthleteTargetRead(AthleteTargetBase):
    id: int

    model_config = {"from_attributes": True}


class AthleteBase(BaseModel):
    name: str
    date_of_birth: date
    sex: str
    weight: float = Field(gt=0)
    height: Optional[float] = Field(default=None, gt=0)
    primary_discipline: str
    goal_category: Optional[str] = None
    training_goal: Optional[str] = None
    notes: Optional[str] = None
    athlete_level: str = "trained"
    training_hr_max: Optional[int] = Field(default=None, ge=100, le=230)
    hr_rest: Optional[int] = Field(default=None, ge=20, le=100)
    ftp_cycling_watts: Optional[int] = Field(default=None, ge=50, le=600)
    ftpa_running_pace: Optional[float] = Field(default=None, ge=120, le=600)
    css_swimming_pace: Optional[float] = Field(default=None, ge=50, le=300)
    initial_ctl: Optional[float] = Field(default=None, ge=0, le=300)
    initial_atl: Optional[float] = Field(default=None, ge=0, le=500)
    created_at: date


class AthleteCreate(AthleteBase):
    weights: list[AthleteWeightHistoryCreate] = []


class AthleteUpdate(BaseModel):
    name: Optional[str] = None
    date_of_birth: Optional[date] = None
    sex: Optional[str] = None
    weight: Optional[float] = Field(default=None, gt=0)
    height: Optional[float] = Field(default=None, gt=0)
    primary_discipline: Optional[str] = None
    goal_category: Optional[str] = None
    training_goal: Optional[str] = None
    notes: Optional[str] = None
    athlete_level: Optional[str] = None
    training_hr_max: Optional[int] = Field(default=None, ge=100, le=230)
    hr_rest: Optional[int] = Field(default=None, ge=20, le=100)
    ftp_cycling_watts: Optional[int] = Field(default=None, ge=50, le=600)
    ftpa_running_pace: Optional[float] = Field(default=None, ge=120, le=600)
    css_swimming_pace: Optional[float] = Field(default=None, ge=50, le=300)
    initial_ctl: Optional[float] = Field(default=None, ge=0, le=300)
    initial_atl: Optional[float] = Field(default=None, ge=0, le=500)


class AthleteRead(AthleteBase):
    id: int
    coach_id: Optional[int]
    strava_athlete_id: Optional[int] = None
    strava_connected: bool = False
    garmin_user_id: Optional[int] = None
    garmin_connected: bool = False
    cycling_interpolated_from_running: bool = False
    weights: list[AthleteWeightHistoryRead] = []
    focus_blocks: list[AthleteFocusBlockRead] = []
    targets: list[AthleteTargetRead] = []

    model_config = {"from_attributes": True}
