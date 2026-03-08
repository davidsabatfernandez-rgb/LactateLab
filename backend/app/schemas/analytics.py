from datetime import date
from typing import Optional

from pydantic import BaseModel

from app.schemas.athlete import AthleteFocusBlockEvaluationRead, AthleteRead
from app.schemas.session import SessionRead


class CurvePoint(BaseModel):
    interval_id: int
    x: float
    lactate: float
    contextual_lactate: float
    label: str
    session_date: str
    power_source: Optional[str] = None


class ThresholdEstimate(BaseModel):
    name: str
    lactate: Optional[float]
    pace_seconds_per_km: Optional[float] = None
    power_watts: Optional[float] = None
    heart_rate: Optional[int] = None
    power_source: Optional[str] = None
    method: str
    confidence: float
    rationale: str
    methods_compared: list[dict]
    agreement_score: float
    evidence_level: str


class ConfidenceItem(BaseModel):
    label: str
    score: float
    level: str
    explanation: str


class HistoricalPoint(BaseModel):
    date: str
    metric: str
    value: Optional[float]
    unit: str
    label: str


class Zone(BaseModel):
    zone: str
    metric: str
    lower: Optional[float]
    upper: Optional[float]
    unit: str


class PerformanceEstimateRead(BaseModel):
    estimate_type: str
    discipline: str
    power_source: Optional[str] = None
    value: float
    unit: str
    lower_bound: Optional[float]
    upper_bound: Optional[float]
    confidence: float
    reliability_label: str
    valid_on: date
    inputs_summary: str
    variables_used: list[str]
    evidence_points: int
    low_evidence: bool


class PowerBestRead(BaseModel):
    duration_seconds: int
    label: str
    value_watts: float


class MeasurementLogRead(BaseModel):
    session_id: int
    session_date: str
    session_type: str
    interval_label: str
    duration_seconds: int
    rest_seconds: Optional[int] = None
    lactate_mmol: float
    pace_seconds_per_km: Optional[float] = None
    power_watts: Optional[float] = None
    heart_rate_avg: Optional[int] = None
    cadence: Optional[int] = None
    power_source: Optional[str] = None


class TrendRead(BaseModel):
    metric: str
    value: float
    direction: str
    confidence: float
    summary: str


class DisciplineAnalysisRead(BaseModel):
    discipline: str
    power_source: Optional[str] = None
    latest_snapshot_date: Optional[date]
    thresholds: list[ThresholdEstimate]
    zones: list[Zone]
    estimates: list[PerformanceEstimateRead]
    recent_sessions: list[SessionRead]
    curve_history: dict[str, list[CurvePoint]]
    historical_evolution: dict[str, list[HistoricalPoint]]
    power_bests: list[PowerBestRead]
    measurement_log: list[MeasurementLogRead]
    power_source_views: Optional[dict[str, "DisciplineAnalysisRead"]] = None


class SessionAnalysisRead(BaseModel):
    session: SessionRead
    curve_by_pace: list[CurvePoint]
    curve_by_power: list[CurvePoint]
    curve_by_hr: list[CurvePoint]
    thresholds: list[ThresholdEstimate]
    contextual_comments: list[str]
    interpretation: list[str]
    confidence_summary: list[ConfidenceItem]
    contextual_details: list[dict]
    historical_evolution: dict[str, list[HistoricalPoint]]


class AthleteAnalysisRead(BaseModel):
    athlete: AthleteRead
    latest_snapshot_date: Optional[date]
    thresholds: list[ThresholdEstimate]
    zones: list[Zone]
    estimates: list[PerformanceEstimateRead]
    trends: list[TrendRead]
    recent_sessions: list[SessionRead]
    curve_history: dict[str, list[CurvePoint]]
    automated_comments: list[str]
    interpretation: list[str]
    confidence_summary: list[ConfidenceItem]
    historical_evolution: dict[str, list[HistoricalPoint]]
    discipline_views: dict[str, DisciplineAnalysisRead]
    active_focus_block: Optional[dict] = None
    focus_block_evaluations: list[AthleteFocusBlockEvaluationRead] = []


class DashboardRead(BaseModel):
    athletes_count: int
    recent_tests: list[SessionRead]
    physiological_alerts: list[str]
    improving_athletes: list[str]
    degrading_athletes: list[str]


DisciplineAnalysisRead.model_rebuild()
