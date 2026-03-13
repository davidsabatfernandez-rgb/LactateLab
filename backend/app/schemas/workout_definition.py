from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


WorkoutSport = Literal["running", "ciclismo", "natación", "triatlón", "other"]
WorkoutStepType = Literal["warmup", "steady", "interval", "recovery", "cooldown", "repeat", "other"]
WorkoutLengthType = Literal["time", "distance", "lap_button", "open"]
WorkoutTargetType = Literal["pace", "power", "heart_rate", "cadence", "easy", "free", "rpe", "other"]


class WorkoutTarget(BaseModel):
    target_type: WorkoutTargetType
    value_from: Optional[float] = None
    value_to: Optional[float] = None
    unit: Optional[str] = None
    label: Optional[str] = None


class WorkoutStep(BaseModel):
    order: int
    step_type: WorkoutStepType
    length_type: WorkoutLengthType
    length_value: Optional[float] = None
    target: Optional[WorkoutTarget] = None
    intensity_label: Optional[str] = None
    instructions: Optional[str] = None
    repeat_count: Optional[int] = None
    children: List["WorkoutStep"] = Field(default_factory=list)


class WorkoutDefinition(BaseModel):
    source_session_id: Optional[int] = None
    sport: WorkoutSport
    title: str
    description: Optional[str] = None
    steps: List[WorkoutStep] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)
    source_payload: Dict[str, Any] = Field(default_factory=dict)


WorkoutStep.model_rebuild()
