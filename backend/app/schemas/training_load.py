from __future__ import annotations

from datetime import date
from typing import Any, Optional

from pydantic import BaseModel


class ActivityTSSRead(BaseModel):
    garmin_activity_id: str
    date: date
    discipline: str
    tss: float
    method: str
    confidence: float
    garmin_tss: Optional[float] = None
    duration_minutes: float


class DailyTrainingLoadRead(BaseModel):
    date: date
    tss_total: float
    tss_by_discipline: dict[str, float]
    atl: float
    ctl: float
    tsb: float
    acwr: Optional[float] = None
    atl_by_discipline: dict[str, float] = {}
    ctl_by_discipline: dict[str, float] = {}
    tsb_by_discipline: dict[str, float] = {}


class TrainingLoadResponse(BaseModel):
    athlete_id: int
    start_date: date
    end_date: date
    days: list[DailyTrainingLoadRead]
    current_atl: float
    current_ctl: float
    current_tsb: float
    current_acwr: Optional[float] = None
    current_atl_by_discipline: dict[str, float] = {}
    current_ctl_by_discipline: dict[str, float] = {}
    threshold_sources: dict[str, Any]
    warnings: list[str]
    avg_confidence: float = 0.0
