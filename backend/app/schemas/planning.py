from datetime import date
from typing import Optional

from pydantic import BaseModel
from app.schemas.athlete import AthleteFocusBlockRead


class PlanningCurrentBlockRead(BaseModel):
    id: Optional[int] = None
    status: str
    energy_system_focus: Optional[str] = None
    block_objective: Optional[str] = None
    block_intent: Optional[str] = None
    phase: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    target_date: Optional[date] = None
    evaluation_summary: Optional[str] = None
    evaluation_direction: Optional[str] = None
    evaluation_confidence: Optional[float] = None
    recommendation: Optional[str] = None


class PlanningDetectedMesocycleRead(BaseModel):
    start_date: date
    end_date: date
    discipline: str
    block_type: str
    block_label: str
    weeks_count: int
    session_count: int
    work_weeks: int
    recovery_weeks: int
    testing_weeks: int
    support_modules: list[str]
    dominant_session_types: list[str]
    confidence: float
    explanation: list[str]
    week_starts: list[date]


class PlanningTargetSummaryRead(BaseModel):
    objective: Optional[str] = None
    discipline: Optional[str] = None
    target_date: Optional[date] = None
    distance_label: Optional[str] = None
    priority_level: Optional[str] = None
    target_metric: Optional[str] = None


class PlanningFoundationRead(BaseModel):
    foundation_id: str
    title: str
    summary: str
    anchor: str


class PlanningMesocycleTemplateRead(BaseModel):
    template_id: str
    discipline: str
    block_type: str
    public_label: str
    summary: str
    primary_focus: str
    secondary_focus: Optional[str] = None
    typical_structure: str
    typical_duration_weeks_min: int
    typical_duration_weeks_max: int
    key_session_families: list[str]
    control_points: list[str]
    progression_rules: list[str]
    entry_checks: list[str]
    exit_checks: list[str]
    csv_rationale: str
    evidence_rationale: str


class PlanningEvidenceSourceRead(BaseModel):
    source_id: str
    citation: str
    source_type: str
    athlete_level: str
    url: str
    key_takeaway: str


class PlanningWorkoutVariantRead(BaseModel):
    label: str
    format_type: str
    dose_example: str
    use_case: str


class PlanningWorkoutVariableRead(BaseModel):
    name: str
    options: list[str]


class DoseStepRead(BaseModel):
    step: int
    label: str
    total_useful_time_min: int
    rest_min: float
    intensity_zone: str
    readiness_required: str
    notes: str
    total_duration_min: int = 0


class PlanningWorkoutTemplateRead(BaseModel):
    template_id: str
    discipline: str
    compatible_block_types: list[str]
    session_role: str
    session_family: str
    public_label: str
    summary: str
    objective: str
    dose_guidance: str
    progression_axes: list[str]
    control_points: list[str]
    expected_adaptations: list[str]
    cautions: list[str]
    confidence: float
    evidence: list[PlanningEvidenceSourceRead]
    variants: list[PlanningWorkoutVariantRead]
    builder_variables: list[PlanningWorkoutVariableRead]
    csv_examples: list[str]
    fatigue_cost: int = 3
    calentamiento_min: int = 0
    calentamiento_template: str = ""
    enfriamiento_min: int = 0
    enfriamiento_template: str = ""
    coach_tips: list[str] = []
    dose_ladder: list[DoseStepRead] = []


class PlanningMesocycleDraftSessionRead(BaseModel):
    session_id: str
    scheduled_date: Optional[date] = None
    week_index: int
    day_offset: int
    template_id: Optional[str] = None
    session_role: str
    session_family: str
    public_label: str
    objective: str
    dose_prescription: Optional[str] = None
    dose_guidance: str
    progression_note: str
    expected_signal: str
    coach_note: str
    confidence: float
    evidence_source_ids: list[str]
    csv_examples: list[str]
    selection_reason: list[str] = []
    payload: dict = {}


class PlanningMesocycleDraftWeekRead(BaseModel):
    week_index: int
    theme: str
    load_type: str
    objective: str
    rationale: str
    sessions: list[PlanningMesocycleDraftSessionRead]
    control_points: list[str]
    spacing_warnings: list[str] = []


class PlanningMesocycleDraftRead(BaseModel):
    discipline: str
    block_type: str
    block_label: str
    structure: str
    duration_weeks: int
    primary_focus: str
    secondary_focus: Optional[str] = None
    foundations: list[str]
    progression_rules: list[str]
    state_summary: Optional[str] = None
    curve_direction: Optional[str] = None
    weeks: list[PlanningMesocycleDraftWeekRead]


class PlanningPlannedSessionRead(BaseModel):
    id: int
    focus_block_id: int
    scheduled_date: date
    discipline: str
    week_index: int
    day_offset: int
    session_role: str
    session_family: str
    workout_template_id: Optional[str] = None
    public_label: str
    objective: str
    dose_prescription: str
    dose_guidance: Optional[str] = None
    progression_note: Optional[str] = None
    expected_signal: Optional[str] = None
    coach_note: Optional[str] = None
    dose_step_override: Optional[int] = None
    swapped_template_id: Optional[str] = None
    confidence: float
    status: str
    bla_check: bool = False
    payload: dict = {}

    model_config = {"from_attributes": True}


class CoachSessionEditRequest(BaseModel):
    """Edición manual del entrenador sobre una sesión planificada."""
    coach_note: Optional[str] = None
    dose_step_override: Optional[int] = None   # None = usar el calculado por el motor
    swapped_template_id: Optional[str] = None  # template_id si el entrenador swapea


class BlaCheckUpdateRequest(BaseModel):
    bla_check: bool


class BlockCandidateRead(BaseModel):
    block_type: str
    score: float
    reasons: list[str]
    contraindications: list[str]


class ScoringContextRead(BaseModel):
    assignment_mode: Optional[str] = None
    selection_engine: Optional[str] = None
    robustness: str
    evaluation_signal: str
    previous_major: Optional[str] = None
    days_to_target: Optional[int] = None


class DurabilityAnalysisRead(BaseModel):
    durability_score: Optional[float] = None
    lt1_degradation_pct: Optional[float] = None
    lt2_degradation_pct: Optional[float] = None
    aerobic_drift_pct: Optional[float] = None
    durability_confidence: float = 0.0
    durability_source: str = "none"
    durability_flag: str = "insufficient_evidence_for_durability"


class LactateCheckRecommendationRead(BaseModel):
    session_type: str
    purpose: str
    suggested_timing_within_block: str
    minimum_conditions: list[str] = []
    optional_lactate_points: list[str] = []
    coach_editable: bool = True
    priority: str
    why_now: str


class ReliabilityWarningRead(BaseModel):
    """Warning de fiabilidad generado por block_rationale.generate_reliability_warnings().

    Códigos posibles (ver block_rationale.py para constantes W_*):
      INTERPOLATED_THRESHOLDS, LOW_CONFIDENCE, STALE_DATA_MILD, STALE_DATA_CRITICAL,
      BORDERLINE_GAP, INSUFFICIENT_WEEKS, NO_TARGET, PROFILE_UNCERTAIN,
      NO_LT1, IMPLAUSIBLE_RATIO, SINGLE_DISCIPLINE.
    Severidades: "info" | "warning" | "critical".
    """
    code: str
    severity: str
    message: str
    actionable: str


class BlockRationaleRead(BaseModel):
    """Rationale científico de un bloque. Ver BLOCK_RATIONALE en block_rationale.py."""
    block_key: str
    display_name: str
    olbrecht_class: str
    summary_coach: str
    physiological_goal: str
    training_description: str
    expected_timeline: str
    ideal_context: str
    risk_if_wrong: str
    min_weeks: int
    max_weeks: int
    science_refs: list[str] = []


class BlockExplanationRead(BaseModel):
    """Explicación contextual del bloque. Ver generate_block_explanation() en block_rationale.py.

    Generada combinando datos del atleta + rationale científico.
    Lista para mostrar en UI o enviar al planning engine.
    """
    headline: str           # 1 frase: por qué este bloque ahora
    why_now: str            # párrafo: datos del atleta + justificación científica
    what_to_expect: str     # qué adaptaciones ver en test y rendimiento
    what_to_watch: str      # señales de que funciona (✓) o no (⚠)
    when_to_exit: str       # cuándo terminar y qué bloque sigue
    alternative_if_wrong: str  # bloque alternativo si datos cambian
    block_key: str
    display_name: str
    olbrecht_class: str
    min_weeks: int
    max_weeks: int


class PhysiologicalAnalysisRead(BaseModel):
    data_quality: str
    season_phase: Optional[str] = None
    primary_limiter: Optional[str] = None
    secondary_limiter: Optional[str] = None
    lt2_gap_kmh: Optional[float] = None
    lt1_gap_kmh: Optional[float] = None
    required_lt2_kmh: Optional[float] = None
    required_lt1_kmh: Optional[float] = None
    physiological_block: Optional[str] = None
    distance_category: Optional[str] = None
    metric_type: Optional[str] = None
    lt1_confidence_dynamic: Optional[float] = None
    lt2_confidence_dynamic: Optional[float] = None
    glycolytic_confidence: Optional[float] = None
    overall_decision_confidence: Optional[float] = None
    confidence_band: Optional[str] = None
    decision_uncertainty: Optional[str] = None
    needs_confirmation: bool = False
    durability: Optional[DurabilityAnalysisRead] = None
    contradictory_signals: list[str] = []
    confidence_factors: list[dict] = []
    lactate_check_recommendations: list[LactateCheckRecommendationRead] = []
    overrides_temporal_scoring: bool = False
    # ── Fiabilidad y rationale (block_rationale.py) ───────────────────────────
    reliability_warnings: list[ReliabilityWarningRead] = []
    borderline: bool = False
    borderline_note: str = ""
    block_rationale: Optional[BlockRationaleRead] = None
    block_explanation: Optional[BlockExplanationRead] = None


class MesocycleRecommendationRead(BaseModel):
    target_discipline: str
    recommended_block_type: str
    recommended_block_label: str
    template_id: Optional[str] = None
    template_summary: Optional[str] = None
    structure: str
    duration_weeks: int
    work_weeks: int
    recovery_weeks: int
    primary_focus: str
    secondary_focus: Optional[str] = None
    confidence: float
    reasoning: list[str]
    key_session_families: list[str] = []
    control_points: list[str]
    progression_rules: list[str]
    entry_checks: list[str] = []
    exit_checks: list[str] = []
    risk_flags: list[str]
    next_target: Optional[PlanningTargetSummaryRead] = None
    candidates_scored: list[BlockCandidateRead] = []
    scoring_context: Optional[ScoringContextRead] = None
    physiological_analysis: Optional[PhysiologicalAnalysisRead] = None
    lactate_check_recommendations: list[LactateCheckRecommendationRead] = []


class PlanningOverviewRead(BaseModel):
    athlete_id: int
    athlete_name: str
    athlete_primary_discipline: str
    discipline: str
    generated_on: date
    foundations: list[PlanningFoundationRead]
    template_library: list[PlanningMesocycleTemplateRead]
    current_block: PlanningCurrentBlockRead
    planned_blocks: list[AthleteFocusBlockRead]
    planned_sessions: list[PlanningPlannedSessionRead] = []
    detected_mesocycles: list[PlanningDetectedMesocycleRead]
    next_recommendation: MesocycleRecommendationRead
    recommended_workouts: list[PlanningWorkoutTemplateRead] = []
    mesocycle_draft: Optional[PlanningMesocycleDraftRead] = None
    warnings: list[str]
    explanation: list[str]
