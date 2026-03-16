from datetime import date
from typing import Optional

from pydantic import BaseModel
from app.schemas.athlete import AthleteFocusBlockRead
from app.schemas.workout_definition import WorkoutDefinition


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
    estimated_tss: Optional[float] = None
    coach_override_expected: bool = False
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
    focus_block_id: Optional[int] = None
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
    estimated_tss: Optional[float] = None
    athlete_note: Optional[str] = None
    scheduled_time: Optional[str] = None
    structured_workout_payload: Optional[WorkoutDefinition] = None
    publish_status: str = "draft"
    publish_provider: Optional[str] = None
    publish_error: Optional[str] = None
    payload: dict = {}

    model_config = {"from_attributes": True}


class AthleteSessionEditRequest(BaseModel):
    """Edición del atleta sobre su propia sesión planificada."""
    public_label: Optional[str] = None
    athlete_note: Optional[str] = None
    scheduled_date: Optional[str] = None   # ISO date (YYYY-MM-DD)
    scheduled_time: Optional[str] = None   # HH:MM (24h)


class CoachSessionEditRequest(BaseModel):
    """Edición manual del entrenador sobre una sesión planificada."""
    coach_note: Optional[str] = None
    dose_step_override: Optional[int] = None   # None = usar el calculado por el motor
    swapped_template_id: Optional[str] = None  # template_id si el entrenador swapea
    scheduled_date: Optional[str] = None        # ISO date (YYYY-MM-DD) para mover la sesión de día
    public_label: Optional[str] = None          # Título visible de la sesión


class AddPlannedSessionRequest(BaseModel):
    """Añadir una sesión planificada desde la biblioteca o manualmente."""
    athlete_id: int
    scheduled_date: str                         # ISO YYYY-MM-DD
    discipline: str                             # running / ciclismo / natación
    template_id: Optional[str] = None           # from workout library (None = manual)
    public_label: str
    objective: Optional[str] = ""
    session_family: Optional[str] = "manual"
    session_role: Optional[str] = "support"
    dose_step: Optional[int] = None             # dose ladder step (1-based)
    coach_note: Optional[str] = None
    bla_check: bool = False


class CoachLibraryCreate(BaseModel):
    """Crear una biblioteca de entrenos."""
    name: str
    description: Optional[str] = None
    discipline: Optional[str] = None


class CoachWorkoutTemplateCreate(BaseModel):
    """Añadir un entreno a una biblioteca."""
    day_offset: int = 0                         # 0=Lun, 1=Mar, ..., 6=Dom
    discipline: str
    session_family: str
    public_label: str
    objective: str = ""
    intensity_zone: Optional[str] = None
    duration_min: Optional[float] = None
    description: Optional[str] = None


class CoachWorkoutTemplateRead(BaseModel):
    id: int
    library_id: int
    day_offset: int = 0
    discipline: str
    session_family: str
    public_label: str
    objective: str
    intensity_zone: Optional[str] = None
    duration_min: Optional[float] = None
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class ApplyLibraryRequest(BaseModel):
    """Aplicar una biblioteca semanal a un atleta desde una fecha."""
    athlete_id: int
    start_date: str                             # ISO YYYY-MM-DD (lunes de la semana)


class CoachPlanCreate(BaseModel):
    """Crear un plan de entrenamiento."""
    name: str
    description: Optional[str] = None
    duration_weeks: int = 4


class CoachPlanDayCreate(BaseModel):
    """Añadir una sesión a un día del plan."""
    day_number: int = 0
    discipline: str
    session_family: str
    public_label: str
    objective: str = ""
    intensity_zone: Optional[str] = None
    duration_min: Optional[float] = None
    description: Optional[str] = None


class CoachPlanDayRead(BaseModel):
    id: int
    plan_id: int
    day_number: int
    discipline: str
    session_family: str
    public_label: str
    objective: str
    intensity_zone: Optional[str] = None
    duration_min: Optional[float] = None
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class CoachPlanRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    duration_weeks: int
    days: list[CoachPlanDayRead] = []

    model_config = {"from_attributes": True}


class ApplyPlanRequest(BaseModel):
    """Aplicar un plan a un atleta desde una fecha."""
    athlete_id: int
    start_date: str  # ISO YYYY-MM-DD


class CoachLibraryRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    discipline: Optional[str] = None
    workouts: list[CoachWorkoutTemplateRead] = []

    model_config = {"from_attributes": True}


class WorkoutStepsEditRequest(BaseModel):
    """Edición directa del workout estructurado por el entrenador.

    Permite guardar una WorkoutDefinition editada manualmente (cambios en
    duración de intervalos, zonas, repeticiones, etc.).  Marca la sesión
    como ``coach_edited`` para que la exportación a Garmin use esta versión.
    """
    workout: WorkoutDefinition


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


class CapacityProfileRead(BaseModel):
    aerobic_level: str
    vlamax_level: str
    lt1_lt2_ratio: Optional[float] = None
    vo2max_estimated: Optional[float] = None
    vo2max_source: Optional[str] = None
    vo2max_confidence: float = 0.0
    fractional_utilization: Optional[float] = None
    source: str
    confidence: float


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
    capacity_profile: Optional[CapacityProfileRead] = None


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


# ── B4 — Triathlon analysis schemas ──────────────────────────────────────────

class TriSignalRead(BaseModel):
    tipo: str
    resultado: Optional[str] = None
    detalle: str


class TriThresholdCheckRead(BaseModel):
    running_type: str
    ciclismo_type: str
    homogeneous: bool
    warning: Optional[str] = None


class TriExplicacionRead(BaseModel):
    resumen: str
    señales: list[TriSignalRead] = []
    acuerdo: str
    tipo_umbral_usado: Optional[TriThresholdCheckRead] = None

    model_config = {"from_attributes": True}


class TriWeaknessRead(BaseModel):
    disciplina_debil: Optional[str] = None
    disciplina_secundaria: Optional[str] = None
    confianza: str
    señales: list[TriSignalRead] = []
    explicacion: TriExplicacionRead
    warnings: list[str] = []

    model_config = {"from_attributes": True}


class TriPrimaryMesocycleRead(BaseModel):
    discipline: str
    recommended_block_type: str
    recommended_block_label: str
    reasoning: list[str] = []
    risk_flags: list[str] = []
    confidence: float
    duration_weeks: int
    mesocycle_draft: Optional[PlanningMesocycleDraftRead] = None

    model_config = {"from_attributes": True}


class TriSecondaryAdviceRead(BaseModel):
    disciplina: str
    bloque_recomendado: str
    bloque_label: str
    recomendacion: str
    sesiones_sugeridas: str
    regla_cientifica: str
    iguala_intensidad_primaria: bool = False
    bloque_propio_fisiologico: Optional[str] = None
    bloque_techo: Optional[str] = None
    source: str = "techo_default"

    model_config = {"from_attributes": True}


class TriLoadBudgetDisciplineRead(BaseModel):
    disciplina: str
    eco_weight: float
    budget: float


class TriLoadBudgetRead(BaseModel):
    techo_semanal: float
    fase: str
    presupuesto_primaria: TriLoadBudgetDisciplineRead
    presupuesto_secundaria: TriLoadBudgetDisciplineRead
    presupuesto_natacion: TriLoadBudgetDisciplineRead


class TriathlonAnalysisRead(BaseModel):
    athlete_id: int
    athlete_name: str
    generated_on: date
    weakness_analysis: TriWeaknessRead
    primary_mesocycle: Optional[TriPrimaryMesocycleRead] = None
    secondary_advice: Optional[TriSecondaryAdviceRead] = None
    spacing_rules: list[str] = []
    load_budget: Optional[TriLoadBudgetRead] = None
    nota_natacion: str
    triathlon_mesocycle: Optional["TriathlonMesocycleDraftRead"] = None

    model_config = {"from_attributes": True}


# ── Triathlon Integrated Mesocycle schemas ────────────────────────────────────

class TriathlonMesocycleRequest(BaseModel):
    duration_weeks: int = 4
    start_date: date
    swim_mode: str = "auto"  # "auto"|"aerobic"|"threshold"|"technical"
    ramp_rate_pct: float = 5.0  # % of CTL/day (Gabbett 2016: keep ≤10%)
    custom_tss_split: Optional[dict[str, float]] = None


class TriathlonDraftSessionRead(BaseModel):
    session_id: str
    discipline: str
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
    progression_note: str = ""
    expected_signal: str = ""
    coach_note: str = ""
    confidence: float = 0.7
    estimated_tss: Optional[float] = None
    coach_override_expected: bool = False
    scheduled_time: Optional[str] = None
    payload: dict = {}


class TriathlonWeekDraftRead(BaseModel):
    week_index: int
    phase: str
    load_label: str
    sessions: list[TriathlonDraftSessionRead]
    tss_target_total: float
    tss_target_by_discipline: dict[str, float] = {}
    spacing_warnings: list[str] = []


class WeekLoadProjectionRead(BaseModel):
    week_index: int
    projected_tss: float
    projected_ctl: float
    projected_atl: float
    projected_tsb: float
    projected_acwr: Optional[float] = None
    safety_flag: str  # "safe"|"high_acwr"|"spike"|"detraining"


class TriathlonMesocycleDraftRead(BaseModel):
    primary_discipline: str
    primary_block_type: str
    secondary_discipline: str
    secondary_block_type: str
    swim_block_type: str
    duration_weeks: int
    season_phase: str
    weakness_analysis: Optional[TriWeaknessRead] = None
    tss_budget: Optional[TriLoadBudgetRead] = None
    weeks: list[TriathlonWeekDraftRead] = []
    spacing_warnings: list[str] = []
    load_projection: list[WeekLoadProjectionRead] = []
