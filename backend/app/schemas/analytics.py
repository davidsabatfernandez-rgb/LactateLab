from datetime import date
from typing import Any, Optional

from pydantic import BaseModel, Field

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
    method_used: Optional[str] = None
    primary_anchor: Optional[str] = None
    agreement_score: Optional[float] = None
    range_summary: Optional[str] = None
    calculation_steps: list[str] = Field(default_factory=list)
    cautions: list[str] = Field(default_factory=list)
    anchors: list[dict[str, Any]] = Field(default_factory=list)
    confidence_factors: list[dict[str, Any]] = Field(default_factory=list)


class PowerBestRead(BaseModel):
    duration_seconds: int
    label: str
    value_watts: float


class MeasurementLogRead(BaseModel):
    interval_id: int
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


class RealThresholdItemRead(BaseModel):
    name: str
    lactate: float
    pace_seconds_per_km: Optional[float] = None
    power_watts: Optional[float] = None
    heart_rate: Optional[int] = None
    confidence: Optional[float] = None
    agreement_score: Optional[float] = None
    method: Optional[str] = None
    evidence_level: Optional[str] = None
    rationale: Optional[str] = None
    derived_from: Optional[str] = None
    status: Optional[str] = None


class ThresholdDetectionStatusRead(BaseModel):
    name: str
    state: str
    primary_method: Optional[str] = None
    confirmation_method: Optional[str] = None
    supporting_methods: list[str] = []
    compatible: bool
    quality_gate_passed: bool
    anchor_update_recommended: bool
    confidence: float
    candidate_threshold: Optional[RealThresholdItemRead] = None
    explanation: str


class RealThresholdsRead(BaseModel):
    lt1_real: Optional[RealThresholdItemRead] = None
    lt2_real: Optional[RealThresholdItemRead] = None
    lt1_practical_real: Optional[RealThresholdItemRead] = None
    lt2_practical_real: Optional[RealThresholdItemRead] = None
    lt1_detection: Optional[ThresholdDetectionStatusRead] = None
    lt2_detection: Optional[ThresholdDetectionStatusRead] = None
    data_quality: Optional[dict] = None


class IndividualThresholdItemRead(BaseModel):
    name: str
    lactate: float
    pace_seconds_per_km: Optional[float] = None
    power_watts: Optional[float] = None
    heart_rate: Optional[int] = None
    confidence: Optional[float] = None
    agreement_score: Optional[float] = None
    method: Optional[str] = None
    evidence_level: Optional[str] = None
    rationale: Optional[str] = None
    supporting_sessions: list[dict[str, Any]] = []
    protocol_score: Optional[float] = None
    signal_score: Optional[float] = None
    progression_alignment: Optional[float] = None


class IndividualThresholdsRead(BaseModel):
    lt1_individual: Optional[IndividualThresholdItemRead] = None
    lt2_individual: Optional[IndividualThresholdItemRead] = None
    data_quality: Optional[dict[str, Any]] = None


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
    dynamic_thresholds: Optional["DynamicThresholdsRead"] = None
    power_source_views: Optional[dict[str, "DisciplineAnalysisRead"]] = None
    real_thresholds: Optional[RealThresholdsRead] = None
    individual_thresholds: Optional[IndividualThresholdsRead] = None


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
    real_thresholds: Optional[RealThresholdsRead] = None
    individual_thresholds: Optional[IndividualThresholdsRead] = None


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
    dynamic_thresholds: Optional["DynamicThresholdsRead"] = None
    real_thresholds: Optional[RealThresholdsRead] = None
    individual_thresholds: Optional[IndividualThresholdsRead] = None
    discipline_views: dict[str, DisciplineAnalysisRead]
    active_focus_block: Optional[dict] = None
    focus_block_evaluations: list[AthleteFocusBlockEvaluationRead] = []


class DynamicReferenceRead(BaseModel):
    target_lactate: float
    estimated_pace_seconds_per_km: Optional[float] = None
    estimated_speed_kph: Optional[float] = None
    estimated_power_watts: Optional[float] = None
    estimated_hr_at_target: Optional[float] = None
    confidence_interval: dict[str, Any]
    number_of_points_used: int
    interpolation_method_used: str
    confidence_score: float
    reliability_score: float
    validity_score: float
    sample_size_effect: float
    point_influence_score: float
    protocol_score: Optional[float] = None
    signal_score: Optional[float] = None
    baseline_state_score: Optional[float] = None
    warnings: list[str]
    explanation: list[str]
    relative_target_from_baseline: Optional[float] = None


class DynamicThresholdModelRead(BaseModel):
    model_type: str
    based_on_days: int
    sessions_considered: int
    reference_2mmol: Optional[DynamicReferenceRead] = None
    reference_4mmol: Optional[DynamicReferenceRead] = None
    practical_lt1: Optional[DynamicReferenceRead] = None
    practical_lt2: Optional[DynamicReferenceRead] = None
    confidence_score: float
    reliability_score: float
    validity_score: float
    sample_size_effect: float
    point_influence_score: float
    signal_score: Optional[float] = None
    warnings: list[str]
    explanation: list[str]
    points_used: list[dict[str, Any]]
    baseline_lactate: Optional[float] = None
    baseline_source: str
    baseline_state: Optional[str] = None
    baseline_delta_from_history: Optional[float] = None
    baseline_state_score: Optional[float] = None
    lt1_relative_target_lactate: Optional[float] = None


class DynamicThresholdComparisonRead(BaseModel):
    summary: str
    warnings: list[str]
    metrics: dict[str, Any]


class DynamicThresholdsRead(BaseModel):
    discipline: str
    power_source: Optional[str] = None
    generated_on: date
    config: dict[str, Any]
    current_baseline_lactate: Optional[float] = None
    current_baseline_source: str
    current_baseline_state: Optional[str] = None
    current_baseline_delta_from_history: Optional[float] = None
    current_baseline_state_score: Optional[float] = None
    lt1_relative_target_lactate: Optional[float] = None
    acute: DynamicThresholdModelRead
    chronic: DynamicThresholdModelRead
    comparison: DynamicThresholdComparisonRead
    history: dict[str, list[HistoricalPoint]]
    warnings: list[str]
    explanation: list[str]


class DashboardRead(BaseModel):
    athletes_count: int
    recent_tests: list[SessionRead]
    physiological_alerts: list[str]
    improving_athletes: list[str]
    degrading_athletes: list[str]


DisciplineAnalysisRead.model_rebuild()
AthleteAnalysisRead.model_rebuild()
