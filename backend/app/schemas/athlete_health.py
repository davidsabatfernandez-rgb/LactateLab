from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class AthleteHealthProviderStatusRead(BaseModel):
    provider: str
    label: str
    connected: bool
    status: str
    last_sync_at: Optional[datetime] = None
    detail: Optional[str] = None


class AthleteHealthSummaryRead(BaseModel):
    activities_count: int
    training_days: int
    total_duration_seconds: int
    total_distance_m: float
    most_recent_activity_at: Optional[datetime] = None
    primary_sport_label: Optional[str] = None
    primary_sport_color: Optional[str] = None


class AthleteHealthMetricRead(BaseModel):
    key: str
    label: str
    value: str
    detail: Optional[str] = None


class AthleteHealthDailyRead(BaseModel):
    date: date
    sleep_score: Optional[int] = None
    sleep_seconds: Optional[int] = None
    resting_hr: Optional[int] = None
    body_battery_change: Optional[int] = None
    respiration_rate: Optional[float] = None
    breathing_events: Optional[int] = None
    stress_level: Optional[int] = None
    hrv_status: Optional[str] = None
    hrv_last_night_avg: Optional[int] = None
    steps: Optional[int] = None
    intensity_minutes: Optional[int] = None


class AthleteHealthActivityRead(BaseModel):
    provider_activity_id: int
    name: str
    started_at: datetime
    sport_type: str
    sport_label: str
    sport_color: str
    distance_m: float
    moving_time_seconds: int
    average_heartrate: Optional[float] = None
    average_watts: Optional[float] = None
    calories: Optional[float] = None
    source: str


class AthleteHealthCalendarDayRead(BaseModel):
    date: date
    activity_count: int
    total_duration_seconds: int
    total_distance_m: float
    primary_sport_label: Optional[str] = None
    primary_sport_color: Optional[str] = None


class AthleteHealthOverviewRead(BaseModel):
    athlete_id: int
    athlete_name: str
    window_start: date
    window_end: date
    providers: list[AthleteHealthProviderStatusRead] = Field(default_factory=list)
    summary: AthleteHealthSummaryRead
    health_metrics: list[AthleteHealthMetricRead] = Field(default_factory=list)
    sleep_breakdown: list[AthleteHealthMetricRead] = Field(default_factory=list)
    performance_metrics: list[AthleteHealthMetricRead] = Field(default_factory=list)
    health_days: list[AthleteHealthDailyRead] = Field(default_factory=list)
    recent_activities: list[AthleteHealthActivityRead] = Field(default_factory=list)
    activity_calendar: list[AthleteHealthCalendarDayRead] = Field(default_factory=list)
    raw_wellness: dict[str, Any] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)


class AppleHealthSampleCreate(BaseModel):
    """A single day of Apple Health data sent from the iOS app."""
    sample_date: date
    sleep_seconds: Optional[int] = None
    deep_sleep_seconds: Optional[int] = None
    rem_sleep_seconds: Optional[int] = None
    core_sleep_seconds: Optional[int] = None
    awake_seconds: Optional[int] = None
    resting_hr: Optional[int] = None
    hrv_sdnn: Optional[float] = None
    respiration_rate: Optional[float] = None
    spo2: Optional[float] = None
    steps: Optional[int] = None
    exercise_minutes: Optional[int] = None
    active_energy_kcal: Optional[float] = None
    vo2max: Optional[float] = None


class AppleHealthSyncPayload(BaseModel):
    """Batch of health samples from the iOS app."""
    samples: list[AppleHealthSampleCreate] = Field(..., max_length=90)


class AppleHealthSyncResult(BaseModel):
    upserted: int
    message: str


class WellnessCheckInCreate(BaseModel):
    check_date: date
    fatigue: int = Field(ge=1, le=5)
    soreness: int = Field(ge=1, le=5)
    mood: int = Field(ge=1, le=5)
    sleep_quality: int = Field(ge=1, le=5)
    notes: Optional[str] = None


class WellnessCheckInRead(WellnessCheckInCreate):
    id: int
    athlete_id: int
    created_at: datetime
    average: float  # computed

    model_config = {"from_attributes": True}


# ── Behavior Journal ──

# Helper: all behavior keys for dynamic schema generation
_TOGGLE_KEYS = [
    "ice_bath", "sauna", "massage", "foam_rolling", "stretching", "compression_garments", "cold_shower",
    "creatine",
    "melatonin", "omega_3", "vitamin_d", "electrolytes", "probiotics", "ashwagandha", "cbd", "pre_workout",
    "meditation", "journaling", "breathwork",
    "consistent_bedtime", "sleep_mask", "magnesium",
    "mouth_tape", "nasal_strip", "weighted_blanket", "white_noise", "reading_before_bed", "blue_light_glasses",
    "working_late", "shift_work",
    "travel_jet_lag", "morning_sunlight", "nature_outdoors", "social_activity", "sex",
    "illness", "injury", "allergies", "high_altitude",
    "antihistamine", "pain_reliever", "birth_control", "cpap_machine", "prescription_medication", "anti_inflammatory",
]
_ALL_KEYS = _TOGGLE_KEYS + [
    "alcohol", "late_meal", "caffeine_after_2pm", "fasting",
    "screens_before_bed", "high_work_stress", "nap",
]


class BehaviorJournalCreate(BaseModel):
    entry_date: date
    # Recovery (toggle)
    ice_bath: Optional[bool] = None
    sauna: Optional[bool] = None
    massage: Optional[bool] = None
    foam_rolling: Optional[bool] = None
    stretching: Optional[bool] = None
    compression_garments: Optional[bool] = None
    cold_shower: Optional[bool] = None
    # Nutrition (mixed)
    alcohol: Optional[int] = Field(None, ge=1, le=6, description="Number of drinks")
    late_meal: Optional[str] = Field(None, pattern=r"^([01]\d|2[0-3]):([0-5]\d)$", description="Last meal HH:MM")
    creatine: Optional[bool] = None
    caffeine_after_2pm: Optional[str] = Field(None, pattern=r"^([01]\d|2[0-3]):([0-5]\d)$", description="Last caffeine HH:MM")
    fasting: Optional[int] = Field(None, ge=1, le=3, description="1=intermittent 2=extended 3=prolonged")
    # Supplements (toggle)
    melatonin: Optional[bool] = None
    omega_3: Optional[bool] = None
    vitamin_d: Optional[bool] = None
    electrolytes: Optional[bool] = None
    probiotics: Optional[bool] = None
    ashwagandha: Optional[bool] = None
    cbd: Optional[bool] = None
    pre_workout: Optional[bool] = None
    # Mental (toggle)
    meditation: Optional[bool] = None
    journaling: Optional[bool] = None
    breathwork: Optional[bool] = None
    # Sleep (mixed)
    screens_before_bed: Optional[str] = Field(None, pattern=r"^([01]\d|2[0-3]):([0-5]\d)$", description="Last screen HH:MM")
    consistent_bedtime: Optional[bool] = None
    sleep_mask: Optional[bool] = None
    magnesium: Optional[bool] = None
    mouth_tape: Optional[bool] = None
    nasal_strip: Optional[bool] = None
    weighted_blanket: Optional[bool] = None
    white_noise: Optional[bool] = None
    reading_before_bed: Optional[bool] = None
    blue_light_glasses: Optional[bool] = None
    # Work (toggle)
    working_late: Optional[bool] = None
    shift_work: Optional[bool] = None
    # Lifestyle (mixed)
    travel_jet_lag: Optional[bool] = None
    high_work_stress: Optional[int] = Field(None, ge=1, le=3, description="1=leve 2=moderado 3=alto")
    nap: Optional[int] = Field(None, ge=5, le=180, description="Duration in minutes")
    morning_sunlight: Optional[bool] = None
    nature_outdoors: Optional[bool] = None
    social_activity: Optional[bool] = None
    sex: Optional[bool] = None
    # Life status (toggle)
    illness: Optional[bool] = None
    injury: Optional[bool] = None
    allergies: Optional[bool] = None
    high_altitude: Optional[bool] = None
    # Medication (toggle)
    antihistamine: Optional[bool] = None
    pain_reliever: Optional[bool] = None
    birth_control: Optional[bool] = None
    cpap_machine: Optional[bool] = None
    prescription_medication: Optional[bool] = None
    anti_inflammatory: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=2000)


class BehaviorJournalRead(BehaviorJournalCreate):
    id: int
    athlete_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class BehaviorPreferencesUpdate(BaseModel):
    ice_bath: Optional[bool] = None
    sauna: Optional[bool] = None
    massage: Optional[bool] = None
    foam_rolling: Optional[bool] = None
    stretching: Optional[bool] = None
    compression_garments: Optional[bool] = None
    cold_shower: Optional[bool] = None
    alcohol: Optional[bool] = None
    late_meal: Optional[bool] = None
    creatine: Optional[bool] = None
    caffeine_after_2pm: Optional[bool] = None
    fasting: Optional[bool] = None
    melatonin: Optional[bool] = None
    omega_3: Optional[bool] = None
    vitamin_d: Optional[bool] = None
    electrolytes: Optional[bool] = None
    probiotics: Optional[bool] = None
    ashwagandha: Optional[bool] = None
    cbd: Optional[bool] = None
    pre_workout: Optional[bool] = None
    meditation: Optional[bool] = None
    journaling: Optional[bool] = None
    breathwork: Optional[bool] = None
    screens_before_bed: Optional[bool] = None
    consistent_bedtime: Optional[bool] = None
    sleep_mask: Optional[bool] = None
    magnesium: Optional[bool] = None
    mouth_tape: Optional[bool] = None
    nasal_strip: Optional[bool] = None
    weighted_blanket: Optional[bool] = None
    white_noise: Optional[bool] = None
    reading_before_bed: Optional[bool] = None
    blue_light_glasses: Optional[bool] = None
    working_late: Optional[bool] = None
    shift_work: Optional[bool] = None
    travel_jet_lag: Optional[bool] = None
    high_work_stress: Optional[bool] = None
    nap: Optional[bool] = None
    morning_sunlight: Optional[bool] = None
    nature_outdoors: Optional[bool] = None
    social_activity: Optional[bool] = None
    sex: Optional[bool] = None
    illness: Optional[bool] = None
    injury: Optional[bool] = None
    allergies: Optional[bool] = None
    high_altitude: Optional[bool] = None
    antihistamine: Optional[bool] = None
    pain_reliever: Optional[bool] = None
    birth_control: Optional[bool] = None
    cpap_machine: Optional[bool] = None
    prescription_medication: Optional[bool] = None
    anti_inflammatory: Optional[bool] = None


class BehaviorPreferencesRead(BaseModel):
    ice_bath: bool
    sauna: bool
    massage: bool
    foam_rolling: bool
    stretching: bool
    compression_garments: bool
    cold_shower: bool
    alcohol: bool
    late_meal: bool
    creatine: bool
    caffeine_after_2pm: bool
    fasting: bool
    melatonin: bool
    omega_3: bool
    vitamin_d: bool
    electrolytes: bool
    probiotics: bool
    ashwagandha: bool
    cbd: bool
    pre_workout: bool
    meditation: bool
    journaling: bool
    breathwork: bool
    screens_before_bed: bool
    consistent_bedtime: bool
    sleep_mask: bool
    magnesium: bool
    mouth_tape: bool
    nasal_strip: bool
    weighted_blanket: bool
    white_noise: bool
    reading_before_bed: bool
    blue_light_glasses: bool
    working_late: bool
    shift_work: bool
    travel_jet_lag: bool
    high_work_stress: bool
    nap: bool
    morning_sunlight: bool
    nature_outdoors: bool
    social_activity: bool
    sex: bool
    illness: bool
    injury: bool
    allergies: bool
    high_altitude: bool
    antihistamine: bool
    pain_reliever: bool
    birth_control: bool
    cpap_machine: bool
    prescription_medication: bool
    anti_inflammatory: bool

    model_config = {"from_attributes": True}


class BehaviorJournalStreakRead(BaseModel):
    current_streak: int
    longest_streak: int
    total_entries: int


class BehaviorWeeklySummaryRead(BaseModel):
    behavior: str
    days_active: int
    total_days: int
    detail: Optional[str] = None


# ── Custom Behaviors ──

class CustomBehaviorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    emoji: str = Field(default="⭐", max_length=10)
    category: str = Field(default="custom", max_length=30)


class CustomBehaviorRead(CustomBehaviorCreate):
    id: int
    athlete_id: int
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class CustomBehaviorLogCreate(BaseModel):
    log_date: date
    custom_behavior_id: int
    value: bool = True


# ── Nutrition Log ──────────────────────────────────────────────

class NutritionLogCreate(BaseModel):
    log_date: date
    carbs_g: Optional[float] = Field(None, ge=0, le=1000)
    protein_g: Optional[float] = Field(None, ge=0, le=500)
    fat_g: Optional[float] = Field(None, ge=0, le=500)
    calories_kcal: Optional[float] = Field(None, ge=0, le=10000)
    hydration_l: Optional[float] = Field(None, ge=0, le=15)
    preset: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = Field(None, max_length=500)


class NutritionLogRead(NutritionLogCreate):
    id: int
    athlete_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Behavior Correlations ─────────────────────────────────────

class BehaviorCorrelationRead(BaseModel):
    behavior_key: str
    behavior_label: str
    behavior_emoji: str
    outcome_metric: str
    outcome_label: str
    sample_size_with: int
    sample_size_without: int
    mean_with: float
    mean_without: float
    effect_pct: float
    effect_direction: str
    confidence: str
    p_value: Optional[float] = None
    lag_days: int
    narrative: str


class BehaviorInsightsSummaryRead(BaseModel):
    top_positive: list[BehaviorCorrelationRead]
    top_negative: list[BehaviorCorrelationRead]
    data_completeness_pct: float
    total_days_tracked: int
    min_days_remaining: Optional[int] = None


class CoachBehaviorAggregationItem(BaseModel):
    behavior_key: str
    behavior_label: str
    behavior_emoji: str
    affected_athletes: int
    total_tracked_athletes: int
    avg_effect_pct: float
    effect_direction: str
    outcome_metric: str
    outcome_label: str


class CoachBehaviorAggregationRead(BaseModel):
    aggregations: list[CoachBehaviorAggregationItem]
    total_athletes: int


# ── Health Alerts ─────────────────────────────────────────────

class HealthAlertRead(BaseModel):
    metric: str
    metric_label: str
    severity: str  # "warning" | "critical"
    current_value: float
    baseline_value: Optional[float] = None
    deviation_pct: float
    message: str
    icon: str
    created_date: str


class HealthAlertDayRead(BaseModel):
    date: str
    alerts: list[HealthAlertRead]


class HealthAlertHistoryRead(BaseModel):
    athlete_id: int
    days: int
    history: list[HealthAlertDayRead]


class CoachHealthAlertAthleteRead(BaseModel):
    athlete_id: int
    athlete_name: str
    alerts: list[HealthAlertRead]


class CoachHealthAlertsRead(BaseModel):
    athletes: list[CoachHealthAlertAthleteRead]


# ── Strain Coach ──────────────────────────────────────────────

class StrainComponentsRead(BaseModel):
    active_energy_kcal: float
    energy_strain: float
    exercise_minutes: int
    exercise_bonus: float
    steps: int
    activities_count: int
    baseline_energy_kcal: float


class StrainScoreRead(BaseModel):
    score: float
    zone: str
    zone_label: str
    components: StrainComponentsRead
    target_date: str


class StrainTargetRead(BaseModel):
    target_min: int
    target_max: int
    zone: str
    zone_label: str
    recommendation: str
    recovery_score: Optional[int] = None
    has_planned_session: bool
    target_date: str


class StrainHistoryItemRead(BaseModel):
    date: str
    score: float
    zone: str
    zone_label: str


# ── Sleep Coach ───────────────────────────────────────────────

class SleepCoachRead(BaseModel):
    base_need_hours: float
    strain_adjustment_min: int
    debt_hours: float
    nap_credit_min: int
    total_need_hours: float
    actual_hours: Optional[float] = None
    deficit_hours: Optional[float] = None
    recommendation: str
    target_date: str


class SleepBreakdownRead(BaseModel):
    deep_pct: float
    rem_pct: float
    light_pct: float
    awake_pct: float


class SleepPerformanceRead(BaseModel):
    score: Optional[int] = None
    efficiency_pct: Optional[float] = None
    consistency_score: Optional[int] = None
    debt_hours: Optional[float] = None
    breakdown: Optional[SleepBreakdownRead] = None
    target_date: str


class SleepHistoryItemRead(BaseModel):
    date: str
    sleep_hours: Optional[float] = None
    deep_sleep_hours: Optional[float] = None
    rem_sleep_hours: Optional[float] = None
    score: Optional[int] = None
    efficiency_pct: Optional[float] = None


# ── Performance Reports ──────────────────────────────────────────

class ReportPeriodRead(BaseModel):
    start: str
    end: str
    type: str  # "weekly" | "monthly"


class ReportSummaryRead(BaseModel):
    avg_recovery: Optional[float] = None
    total_strain: float = 0
    avg_sleep_hours: Optional[float] = None
    total_activities: int = 0
    total_duration_min: float = 0
    total_distance_km: float = 0


class RecoveryDailyRead(BaseModel):
    date: str
    score: Optional[float] = None
    zone: Optional[str] = None


class ReportRecoveryRead(BaseModel):
    avg_score: Optional[float] = None
    trend: str = "stable"
    best_day: Optional[str] = None
    worst_day: Optional[str] = None
    daily: list[RecoveryDailyRead] = Field(default_factory=list)


class SportBreakdownRead(BaseModel):
    sport: str
    count: int
    duration_min: float
    distance_km: float


class IntensityDistributionRead(BaseModel):
    easy_pct: int = 0
    moderate_pct: int = 0
    hard_pct: int = 0


class ReportTrainingRead(BaseModel):
    total_sessions: int = 0
    by_sport: list[SportBreakdownRead] = Field(default_factory=list)
    intensity_distribution: IntensityDistributionRead = Field(default_factory=IntensityDistributionRead)
    load_status: str = "sin_datos"
    total_duration_min: float = 0
    total_distance_km: float = 0
    total_strain: float = 0


class ReportSleepRead(BaseModel):
    avg_hours: Optional[float] = None
    avg_deep_pct: Optional[float] = None
    avg_rem_pct: Optional[float] = None
    consistency_score: Optional[int] = None
    debt_hours: Optional[float] = None
    trend: str = "stable"


class ReportVitalsRead(BaseModel):
    avg_rhr: Optional[float] = None
    rhr_trend: str = "stable"
    avg_hrv: Optional[float] = None
    hrv_trend: str = "stable"
    avg_spo2: Optional[float] = None


class BehaviorAdherentRead(BaseModel):
    behavior: str
    emoji: str
    days: int


class BehaviorCorrelationBriefRead(BaseModel):
    behavior: str
    emoji: str
    effect: str


class ReportBehaviorsRead(BaseModel):
    total_logged_days: int = 0
    top_adherent: list[BehaviorAdherentRead] = Field(default_factory=list)
    top_positive_correlation: Optional[BehaviorCorrelationBriefRead] = None
    top_negative_correlation: Optional[BehaviorCorrelationBriefRead] = None


class ReportNutritionRead(BaseModel):
    avg_calories: Optional[float] = None
    avg_carbs: Optional[float] = None
    avg_protein: Optional[float] = None
    avg_hydration: Optional[float] = None
    days_logged: int = 0


class WeeklyReportRead(BaseModel):
    period: ReportPeriodRead
    summary: ReportSummaryRead
    recovery: ReportRecoveryRead
    training: ReportTrainingRead
    sleep: ReportSleepRead
    vitals: ReportVitalsRead
    behaviors: ReportBehaviorsRead
    nutrition: ReportNutritionRead
    highlights: list[str] = Field(default_factory=list)


class WeeklyBreakdownRead(BaseModel):
    week_start: str
    week_end: str
    sessions: int
    duration_min: float
    strain: float


class MonthComparisonRead(BaseModel):
    recovery_change_pct: Optional[float] = None
    sessions_change: Optional[int] = None
    sleep_change_pct: Optional[float] = None
    hrv_change_pct: Optional[float] = None
    rhr_change_pct: Optional[float] = None


class MonthlyReportRead(WeeklyReportRead):
    weekly_breakdown: list[WeeklyBreakdownRead] = Field(default_factory=list)
    month_comparison: MonthComparisonRead = Field(default_factory=MonthComparisonRead)


class ReportAvailableItemRead(BaseModel):
    type: str
    start: str
    end: str
    label: str
    year_month: Optional[str] = None


class ReportAvailableRead(BaseModel):
    reports: list[ReportAvailableItemRead] = Field(default_factory=list)


# ── Sleep Analytics (enhanced) ───────────────────────────────────

class SleepStagesDetailRead(BaseModel):
    deep_hours: float = 0.0
    deep_pct: float = 0.0
    rem_hours: float = 0.0
    rem_pct: float = 0.0
    light_hours: float = 0.0
    light_pct: float = 0.0
    awake_hours: float = 0.0
    awake_pct: float = 0.0


class SleepConsistencyRead(BaseModel):
    score: Optional[float] = None
    avg_bedtime: Optional[str] = None
    avg_waketime: Optional[str] = None
    variability_min: Optional[float] = None


class SleepDebtRead(BaseModel):
    accumulated_hours: float = 0.0
    trend: str = "stable"


class SleepBaselineRead(BaseModel):
    total_vs_avg_pct: Optional[float] = None
    deep_vs_avg_pct: Optional[float] = None
    rem_vs_avg_pct: Optional[float] = None


class SleepAnalyticsDetailRead(BaseModel):
    date: str
    total_hours: Optional[float] = None
    stages: Optional[SleepStagesDetailRead] = None
    efficiency_pct: Optional[float] = None
    performance_score: Optional[int] = None
    consistency: Optional[SleepConsistencyRead] = None
    debt: Optional[SleepDebtRead] = None
    vs_baseline: Optional[SleepBaselineRead] = None


class SleepHistoryDetailItemRead(BaseModel):
    date: str
    total_hours: float
    stages: SleepStagesDetailRead
    efficiency_pct: float
    performance_score: int
    vs_baseline: Optional[SleepBaselineRead] = None


class SleepSummaryDetailRead(BaseModel):
    avg_hours: Optional[float] = None
    avg_efficiency: Optional[float] = None
    avg_deep_pct: Optional[float] = None
    avg_rem_pct: Optional[float] = None
    consistency_score: Optional[float] = None
    total_debt_hours: float = 0.0
    performance_trend: str = "stable"
    days_with_data: int = 0


# ── AI Coach ──────────────────────────────────────────────────

class AiCoachMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: Optional[list[dict]] = Field(default=None, max_length=50)


class AiCoachResponse(BaseModel):
    response: str
    context_summary: str
