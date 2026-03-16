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
    sessions_updated: Optional[int] = None  # populated when zones trigger workout regeneration

    model_config = {"from_attributes": True}


class ThresholdItemForZones(BaseModel):
    lactate: float
    pace_seconds_per_km: Optional[float] = None
    heart_rate: Optional[int] = None
    power_watts: Optional[float] = None
    pace_label: Optional[str] = None


class ZoneStalenessCheck(BaseModel):
    """Result of comparing active zones' threshold_context vs current thresholds."""
    is_stale: bool = False
    reason: Optional[str] = None
    zones_created_at: Optional[str] = None
    zones_threshold_source: Optional[str] = None
    current_snapshot_date: Optional[str] = None
    # Deltas (current minus zone-creation values) — positive = athlete improved
    lt2_pace_delta_seconds: Optional[float] = None  # negative = faster
    lt2_hr_delta: Optional[int] = None
    lt2_power_delta: Optional[float] = None
    lt1_pace_delta_seconds: Optional[float] = None
    lt1_hr_delta: Optional[int] = None
    lt1_power_delta: Optional[float] = None


class ThresholdProfileForZones(BaseModel):
    """Perfil de umbral mostrado al crear zonas — el entrenador necesita ver
    el ancla (individual/fisiológico/análisis) para decidir si las zonas son fiables."""

    lt1: Optional[ThresholdItemForZones] = None
    lt2: Optional[ThresholdItemForZones] = None
    practical_lt1: Optional[ThresholdItemForZones] = None
    practical_lt2: Optional[ThresholdItemForZones] = None
    source: str
    source_label: str
    confidence: Optional[float] = None
    snapshot_date: Optional[str] = None
