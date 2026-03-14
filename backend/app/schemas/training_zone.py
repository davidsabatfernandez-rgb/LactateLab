from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TrainingZoneBase(BaseModel):
    zone_number: int
    zone_label: str
    zone_color: Optional[str] = None
    pace_lower_seconds: Optional[float] = None
    pace_upper_seconds: Optional[float] = None
    hr_lower: Optional[int] = None
    hr_upper: Optional[int] = None
    power_lower: Optional[float] = None
    power_upper: Optional[float] = None
    description: Optional[str] = None


class TrainingZoneRead(TrainingZoneBase):
    id: int

    model_config = {"from_attributes": True}


class TrainingZoneSetCreate(BaseModel):
    discipline: str
    name: str
    threshold_source: Optional[str] = None
    threshold_context: Optional[dict] = None
    notes: Optional[str] = None
    zones: list[TrainingZoneBase]


class TrainingZoneSetUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None
    zones: Optional[list[TrainingZoneBase]] = None


class TrainingZoneSetRead(BaseModel):
    id: int
    discipline: str
    name: str
    is_active: bool
    threshold_source: Optional[str] = None
    threshold_context: Optional[dict] = None
    notes: Optional[str] = None
    created_at: datetime
    zones: list[TrainingZoneRead]

    model_config = {"from_attributes": True}


class ThresholdItemForZones(BaseModel):
    lactate: float
    pace_seconds_per_km: Optional[float] = None
    heart_rate: Optional[int] = None
    power_watts: Optional[float] = None
    pace_label: Optional[str] = None


class ThresholdProfileForZones(BaseModel):
    """Perfil de umbral mostrado al crear zonas — el entrenador necesita ver
    el ancla (individual/fisiológico/análisis) para decidir si las zonas son fiables."""

    lt1: Optional[ThresholdItemForZones] = None
    lt2: Optional[ThresholdItemForZones] = None
    source: str
    source_label: str
    confidence: Optional[float] = None
    snapshot_date: Optional[str] = None
