export type Athlete = {
  id: number;
  name: string;
  date_of_birth: string;
  sex: string;
  weight: number;
  height?: number | null;
  primary_discipline: string;
  goal_category?: string | null;
  training_goal?: string | null;
  notes?: string | null;
  strava_athlete_id?: number | null;
  strava_connected: boolean;
  garmin_user_id?: number | null;
  garmin_connected: boolean;
  athlete_level: string;
  hr_rest?: number | null;
  ftp_cycling_watts?: number | null;
  ftpa_running_pace?: number | null;
  css_swimming_pace?: number | null;
  created_at: string;
  weights?: Array<{
    id: number;
    recorded_at: string;
    weight: number;
    source?: string | null;
  }>;
  focus_blocks?: AthleteFocusBlock[];
  targets?: AthleteTarget[];
};

export type AuthUser = {
  id: number;
  email: string;
  role: string;
  full_name: string;
  athlete_id?: number | null;
};

export type StravaActivity = {
  provider_activity_id: number;
  name: string;
  sport_type: string;
  started_at: string;
  timezone?: string | null;
  distance_m: number;
  moving_time_seconds: number;
  elapsed_time_seconds: number;
  average_speed_m_s?: number | null;
  max_speed_m_s?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_watts?: number | null;
  kilojoules?: number | null;
  trainer: boolean;
  commute: boolean;
  description?: string | null;
  total_elevation_gain_m?: number | null;
  calories?: number | null;
  average_cadence?: number | null;
  weighted_average_watts?: number | null;
  max_watts?: number | null;
  device_watts?: boolean | null;
  suffer_score?: number | null;
  perceived_exertion?: number | null;
  has_heartrate?: boolean | null;
  workout_type?: number | null;
  gear_id?: string | null;
  start_latlng: number[];
  end_latlng: number[];
  map_summary_polyline?: string | null;
  device_name?: string | null;
  splits_metric: Array<{
    distance_m: number;
    elapsed_time_seconds: number;
    moving_time_seconds: number;
    elevation_difference_m?: number | null;
    split_index?: number | null;
    average_speed_m_s?: number | null;
    average_heartrate?: number | null;
    pace_zone?: number | null;
  }>;
  splits_standard: Array<{
    distance_m: number;
    elapsed_time_seconds: number;
    moving_time_seconds: number;
    elevation_difference_m?: number | null;
    split_index?: number | null;
    average_speed_m_s?: number | null;
    average_heartrate?: number | null;
    pace_zone?: number | null;
  }>;
  best_efforts: Array<{
    name: string;
    distance_m: number;
    elapsed_time_seconds: number;
    moving_time_seconds: number;
    start_date?: string | null;
    average_heartrate?: number | null;
    average_watts?: number | null;
    pr_rank?: number | null;
    achievement_count: number;
    segment_id?: number | null;
    segment_average_grade?: number | null;
    segment_max_grade?: number | null;
    segment_elevation_high_m?: number | null;
    segment_elevation_low_m?: number | null;
    segment_start_latlng: number[];
    segment_end_latlng: number[];
  }>;
  segment_efforts: Array<{
    name: string;
    distance_m: number;
    elapsed_time_seconds: number;
    moving_time_seconds: number;
    start_date?: string | null;
    average_heartrate?: number | null;
    average_watts?: number | null;
    pr_rank?: number | null;
    achievement_count: number;
    segment_id?: number | null;
    segment_average_grade?: number | null;
    segment_max_grade?: number | null;
    segment_elevation_high_m?: number | null;
    segment_elevation_low_m?: number | null;
    segment_start_latlng: number[];
    segment_end_latlng: number[];
  }>;
  laps: Array<{
    lap_index: number;
    name: string;
    distance_m: number;
    elapsed_time_seconds: number;
    moving_time_seconds: number;
    average_speed_m_s?: number | null;
    average_heartrate?: number | null;
    max_heartrate?: number | null;
    average_watts?: number | null;
    start_date?: string | null;
  }>;
  zones: Array<{
    type: string;
    score?: number | null;
    sensor_based?: boolean | null;
    points?: number | null;
    buckets: Array<{
      min_value?: number | null;
      max_value?: number | null;
      time_seconds: number;
    }>;
  }>;
  streams: Record<
    string,
    {
      original_size: number;
      resolution?: string | null;
      series_type?: string | null;
      data: unknown[];
    }
  >;
  raw_detail: Record<string, unknown>;
  enrichment_error?: string | null;
  enrichment_notice?: string | null;
};

export type StravaActivitiesImportResponse = {
  athlete_id: number;
  athlete_name: string;
  start_date: string;
  end_date: string;
  imported_count: number;
  activities: StravaActivity[];
};

export type GarminActivity = {
  provider_activity_id: number;
  name: string;
  sport_type: string;
  started_at: string;
  timezone?: string | null;
  distance_m: number;
  moving_time_seconds: number;
  elapsed_time_seconds: number;
  average_speed_m_s?: number | null;
  max_speed_m_s?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_watts?: number | null;
  calories?: number | null;
  description?: string | null;
  total_elevation_gain_m?: number | null;
  average_cadence?: number | null;
  max_watts?: number | null;
  start_latlng: number[];
  end_latlng: number[];
  device_name?: string | null;
  laps: Array<{
    lap_index: number;
    name: string;
    distance_m: number;
    elapsed_time_seconds: number;
    moving_time_seconds: number;
    average_speed_m_s?: number | null;
    average_heartrate?: number | null;
    max_heartrate?: number | null;
    average_watts?: number | null;
    start_date?: string | null;
  }>;
  raw_detail: Record<string, unknown>;
};

export type GarminActivitiesPreviewResponse = {
  athlete_id: number;
  athlete_name: string;
  start_date: string;
  end_date: string;
  imported_count: number;
  activities: GarminActivity[];
};

export type AthleteHealthProviderStatus = {
  provider: string;
  label: string;
  connected: boolean;
  status: string;
  last_sync_at?: string | null;
  detail?: string | null;
};

export type AthleteHealthSummary = {
  activities_count: number;
  training_days: number;
  total_duration_seconds: number;
  total_distance_m: number;
  most_recent_activity_at?: string | null;
  primary_sport_label?: string | null;
  primary_sport_color?: string | null;
};

export type AthleteHealthMetric = {
  key: string;
  label: string;
  value: string;
  detail?: string | null;
};

export type AthleteHealthDaily = {
  date: string;
  sleep_score?: number | null;
  sleep_seconds?: number | null;
  resting_hr?: number | null;
  body_battery_change?: number | null;
  respiration_rate?: number | null;
  breathing_events?: number | null;
  stress_level?: number | null;
  hrv_status?: string | null;
  hrv_last_night_avg?: number | null;
  steps?: number | null;
  intensity_minutes?: number | null;
};

export type AthleteHealthActivity = {
  provider_activity_id: number;
  name: string;
  started_at: string;
  sport_type: string;
  sport_label: string;
  sport_color: string;
  distance_m: number;
  moving_time_seconds: number;
  average_heartrate?: number | null;
  average_watts?: number | null;
  source: string;
};

export type AthleteHealthCalendarDay = {
  date: string;
  activity_count: number;
  total_duration_seconds: number;
  total_distance_m: number;
  primary_sport_label?: string | null;
  primary_sport_color?: string | null;
};

export type AthleteHealthOverview = {
  athlete_id: number;
  athlete_name: string;
  window_start: string;
  window_end: string;
  providers: AthleteHealthProviderStatus[];
  summary: AthleteHealthSummary;
  health_metrics: AthleteHealthMetric[];
  sleep_breakdown: AthleteHealthMetric[];
  performance_metrics: AthleteHealthMetric[];
  health_days: AthleteHealthDaily[];
  recent_activities: AthleteHealthActivity[];
  activity_calendar: AthleteHealthCalendarDay[];
  raw_wellness: Record<string, unknown>;
  notes: string[];
};

export type AthleteFocusBlock = {
  id: number;
  start_date: string;
  end_date?: string | null;
  template_id?: string | null;
  energy_system_focus: string;
  block_objective: string;
  block_intent?: string | null;
  priority_discipline?: string | null;
  phase?: string | null;
  target_event?: string | null;
  target_date?: string | null;
  status: string;
  coach_notes?: string | null;
};

export type AthleteTarget = {
  id: number;
  target_date: string;
  discipline: string;
  objective: string;
  distance_label?: string | null;
  distance_category?: string | null;
  priority_level?: string | null;
  target_pace_label?: string | null;
  target_power_watts?: number | null;
  target_running_pace_label?: string | null;
  target_swim_pace_label?: string | null;
  target_cycling_power_watts?: number | null;
  notes?: string | null;
};

export type AthleteFocusBlockEvaluation = {
  block_id: number;
  status: string;
  summary: string;
  direction: string;
  confidence: number;
  worked?: boolean | null;
  key_metric: string;
  baseline_value?: number | null;
  latest_value?: number | null;
  delta?: number | null;
  unit: string;
  baseline_weight?: number | null;
  latest_weight?: number | null;
  baseline_relative_value?: number | null;
  latest_relative_value?: number | null;
  delta_relative?: number | null;
  relative_unit?: string | null;
  recommendation: string;
};

export type SessionSummary = {
  id: number;
  athlete_id: number;
  performed_at: string;
  discipline: string;
  power_source?: string | null;
  session_type: string;
  goal: string;
  session_heart_rate_max?: number | null;
  surface?: string | null;
  temperature_c?: number | null;
  comments?: string | null;
  intervals?: SessionInterval[];
};

export type LactateSample = {
  id?: number;
  lactate_mmol: number;
  baseline_lactate?: number | null;
  sample_delay_seconds: number;
  sample_timing_label: string;
  sampling_notes?: string | null;
};

export type SessionInterval = {
  id: number;
  order_index: number;
  duration_seconds: number;
  rest_seconds?: number | null;
  rest_type?: string | null;
  heart_rate_avg?: number | null;
  heart_rate_max?: number | null;
  pace_seconds_per_km?: number | null;
  power_watts?: number | null;
  running_power_watts?: number | null;
  cadence?: number | null;
  rpe?: number | null;
  purpose: string;
  notes?: string | null;
  lactate_sample?: LactateSample | null;
};

export type Threshold = {
  name: string;
  lactate?: number | null;
  pace_seconds_per_km?: number | null;
  power_watts?: number | null;
  heart_rate?: number | null;
  power_source?: string | null;
  method: string;
  confidence: number;
  rationale: string;
  methods_compared: Array<{
    threshold_name: string;
    method: string;
    lactate?: number | null;
    pace_seconds_per_km?: number | null;
    power_watts?: number | null;
    heart_rate?: number | null;
    confidence: number;
    explanation: string;
  }>;
  agreement_score: number;
  evidence_level: string;
};

export type CurvePoint = {
  interval_id: number;
  x: number;
  lactate: number;
  contextual_lactate: number;
  label: string;
  session_date: string;
  power_source?: string | null;
  is_peak?: boolean;
};

export type Estimate = {
  estimate_type: string;
  discipline: string;
  power_source?: string | null;
  value: number;
  unit: string;
  lower_bound?: number | null;
  upper_bound?: number | null;
  confidence: number;
  reliability_label: string;
  valid_on: string;
  inputs_summary: string;
  variables_used: string[];
  evidence_points: number;
  low_evidence: boolean;
  method_used?: string | null;
  primary_anchor?: string | null;
  agreement_score?: number | null;
  range_summary?: string | null;
  calculation_steps?: string[];
  cautions?: string[];
  anchors?: Array<{
    label: string;
    value: number;
    unit: string;
    confidence: number;
  }>;
  confidence_factors?: Array<{
    label: string;
    score: number;
    weight: number;
    explanation: string;
  }>;
  // v2: three-pace output, glycogen risk, durability, quality score
  ritmo_techo?: number | null;
  ritmo_objetivo?: number | null;
  ritmo_seguro?: number | null;
  glycogen_risk?: { level: string; label: string } | null;
  durability_info?: {
    duration_hours: number;
    decay_rate_pct_per_hour: number;
    total_decay_pct: number;
    effective_lt2_speed_kph: number;
    decay_factor: number;
    endurance_tier: string;
  } | null;
  quality_score?: number | null;
};

export type Zone = {
  zone: string;
  metric: string;
  lower?: number | null;
  upper?: number | null;
  unit: string;
};

export type Trend = {
  metric: string;
  value: number;
  direction: string;
  confidence: number;
  summary: string;
};

export type ConfidenceItem = {
  label: string;
  score: number;
  level: string;
  explanation: string;
};

export type HistoricalPoint = {
  date: string;
  metric: string;
  value?: number | null;
  unit: string;
  label: string;
};

export type PowerBest = {
  duration_seconds: number;
  label: string;
  value_watts: number;
};

export type MeasurementLog = {
  interval_id: number;
  session_id: number;
  session_date: string;
  session_type: string;
  interval_label: string;
  duration_seconds: number;
  rest_seconds?: number | null;
  lactate_mmol: number;
  pace_seconds_per_km?: number | null;
  power_watts?: number | null;
  heart_rate_avg?: number | null;
  cadence?: number | null;
  power_source?: string | null;
};

export type RealThresholdItem = {
  name: string;
  lactate: number;
  pace_seconds_per_km?: number | null;
  power_watts?: number | null;
  heart_rate?: number | null;
  confidence?: number | null;
  agreement_score?: number | null;
  method?: string | null;
  evidence_level?: string | null;
  rationale?: string | null;
  derived_from?: string | null;
  status?: string | null;
};

export type ThresholdDetectionStatus = {
  name: string;
  state: string;
  primary_method?: string | null;
  confirmation_method?: string | null;
  supporting_methods: string[];
  compatible: boolean;
  quality_gate_passed: boolean;
  anchor_update_recommended: boolean;
  confidence: number;
  candidate_threshold?: RealThresholdItem | null;
  explanation: string;
};

export type RealThresholds = {
  lt1_real?: RealThresholdItem | null;
  lt2_real?: RealThresholdItem | null;
  lt1_practical_real?: RealThresholdItem | null;
  lt2_practical_real?: RealThresholdItem | null;
  lt1_detection?: ThresholdDetectionStatus | null;
  lt2_detection?: ThresholdDetectionStatus | null;
  data_quality?: {
    stage_count: number;
    usable_stage_count?: number;
    monotonicity: number;
    protocol_score?: number;
    signal_score?: number;
    criteria_version?: number;
    sufficient: boolean;
    reason: string;
  } | null;
};

export type IndividualThresholdItem = {
  name: string;
  lactate: number;
  pace_seconds_per_km?: number | null;
  power_watts?: number | null;
  heart_rate?: number | null;
  confidence?: number | null;
  agreement_score?: number | null;
  method?: string | null;
  evidence_level?: string | null;
  rationale?: string | null;
  supporting_sessions?: Array<Record<string, unknown>>;
  protocol_score?: number | null;
  signal_score?: number | null;
  progression_alignment?: number | null;
};

export type IndividualThresholds = {
  lt1_individual?: IndividualThresholdItem | null;
  lt2_individual?: IndividualThresholdItem | null;
  data_quality?: {
    session_count?: number;
    stage_count?: number;
    monotonicity?: number;
    protocol_score?: number;
    signal_score?: number;
    progression_alignment?: number | null;
    min_support_sessions?: number;
    criteria_version?: number;
    sufficient: boolean;
    reason: string;
  } | null;
};

export type DisciplineView = {
  discipline: string;
  power_source?: string | null;
  latest_snapshot_date?: string | null;
  thresholds: Threshold[];
  zones: Zone[];
  estimates: Estimate[];
  recent_sessions: SessionSummary[];
  curve_history: Record<string, CurvePoint[]>;
  historical_evolution: Record<string, HistoricalPoint[]>;
  power_bests: PowerBest[];
  measurement_log: MeasurementLog[];
  dynamic_thresholds?: DynamicThresholds | null;
  power_source_views?: Record<string, DisciplineView> | null;
  real_thresholds?: RealThresholds | null;
  individual_thresholds?: IndividualThresholds | null;
  swain_vo2max?: {
    vo2max: number;
    fractional_utilization: number;
    confidence: number;
    source: string;
    hr_max_used?: number | null;
    hr_rest_used?: number | null;
    lt2_hr_used?: number | null;
  } | null;
  target_curve?: {
    distance_category: string;
    distance_km: number;
    target_pace_s_per_km: number;
    target_speed_kph: number;
    race_duration_min: number;
    fractional_utilization: number;
    vo2max_needed: number;
    target_lt2_pace: number | null;
    target_lt2_speed_kph: number;
    target_lt1_pace: number | null;
    target_lt1_speed_kph: number;
    lt1_lactate_used: number;
    lt2_lactate_used: number;
    lt1_lt2_ratio_used: number;
    curve_points: Array<{ x: number; speed_kph: number; lactate: number }>;
    gap: Record<string, { current?: number | null; target?: number | null; delta?: number | null; current_pace?: number | null; target_pace?: number | null; delta_s_per_km?: number | null; delta_pct?: number | null }>;
    vlamax_note: string | null;
    method: string;
    explanation: string[];
  } | null;
};

export type AthleteAnalysis = {
  athlete: Athlete;
  latest_snapshot_date?: string | null;
  thresholds: Threshold[];
  zones: Zone[];
  estimates: Estimate[];
  trends: Trend[];
  recent_sessions: SessionSummary[];
  curve_history: Record<string, CurvePoint[]>;
  automated_comments: string[];
  interpretation: string[];
  confidence_summary: ConfidenceItem[];
  historical_evolution: Record<string, HistoricalPoint[]>;
  dynamic_thresholds?: DynamicThresholds | null;
  real_thresholds?: RealThresholds | null;
  individual_thresholds?: IndividualThresholds | null;
  discipline_views: Record<string, DisciplineView>;
  active_focus_block?: (AthleteFocusBlock & { evaluation?: AthleteFocusBlockEvaluation }) | null;
  focus_block_evaluations: AthleteFocusBlockEvaluation[];
};

export type PhysiologyReportProfile = {
  full_name: string;
  age?: number | null;
  sex?: string | null;
  weight_kg?: number | null;
  discipline: string;
  performance_goal?: string | null;
  target_competition?: string | null;
  training_background?: string | null;
  coach_notes?: string | null;
};

export type PhysiologyReportStage = {
  stage_number: number;
  duration_seconds: number;
  load_value: number;
  load_label: string;
  heart_rate_bpm?: number | null;
  lactate_mmol: number;
  cadence?: number | null;
};

export type PhysiologyReportThreshold = {
  name: string;
  anchor_mmol: number;
  metric_value?: number | null;
  metric_label: string;
  heart_rate_bpm?: number | null;
  interpretation: string;
  confidence?: number | null;
  agreement_score?: number | null;
  evidence_level?: string | null;
  supporting_sessions?: number | null;
};

export type PhysiologyReportZone = {
  zone: string;
  objective: string;
  primary_label: string;
  heart_rate_label?: string | null;
};

export type PhysiologyReportSection = {
  key: string;
  title: string;
  body: string[];
};

export type PhysiologyReportTestSummary = {
  session_id: number;
  performed_at: string;
  power_source?: string | null;
  stage_count: number;
  total_duration_seconds: number;
  average_stage_duration_seconds: number;
  peak_lactate_mmol: number;
  load_start_label: string;
  load_end_label: string;
};

export type PhysiologyReport = {
  athlete_id: number;
  athlete_name: string;
  generated_on: string;
  discipline: string;
  power_source?: string | null;
  profile_tag: string;
  profile: PhysiologyReportProfile;
  test_summary: PhysiologyReportTestSummary;
  stages: PhysiologyReportStage[];
  thresholds: PhysiologyReportThreshold[];
  individual_thresholds: PhysiologyReportThreshold[];
  individual_threshold_sample_count: number;
  individual_threshold_min_samples: number;
  individual_threshold_note?: string | null;
  zones: PhysiologyReportZone[];
  sections: PhysiologyReportSection[];
  limitations: string[];
  disclaimer: string;
  final_coach_summary: string[];
  report_title: string;
  report_subtitle: string;
};

export type PlanningCurrentBlock = {
  id?: number | null;
  status: string;
  energy_system_focus?: string | null;
  block_objective?: string | null;
  block_intent?: string | null;
  phase?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  target_date?: string | null;
  evaluation_summary?: string | null;
  evaluation_direction?: string | null;
  evaluation_confidence?: number | null;
  recommendation?: string | null;
};

export type PlanningDetectedMesocycle = {
  start_date: string;
  end_date: string;
  discipline: string;
  block_type: string;
  block_label: string;
  weeks_count: number;
  session_count: number;
  work_weeks: number;
  recovery_weeks: number;
  testing_weeks: number;
  support_modules: string[];
  dominant_session_types: string[];
  confidence: number;
  explanation: string[];
  week_starts: string[];
};

export type PlanningTargetSummary = {
  objective?: string | null;
  discipline?: string | null;
  target_date?: string | null;
  distance_label?: string | null;
  priority_level?: string | null;
  target_metric?: string | null;
};

export type PlanningFoundation = {
  foundation_id: string;
  title: string;
  summary: string;
  anchor: string;
};

export type PlanningMesocycleTemplate = {
  template_id: string;
  discipline: string;
  block_type: string;
  public_label: string;
  summary: string;
  primary_focus: string;
  secondary_focus?: string | null;
  typical_structure: string;
  typical_duration_weeks_min: number;
  typical_duration_weeks_max: number;
  key_session_families: string[];
  control_points: string[];
  progression_rules: string[];
  entry_checks: string[];
  exit_checks: string[];
  csv_rationale: string;
  evidence_rationale: string;
};

export type PlanningEvidenceSource = {
  source_id: string;
  citation: string;
  source_type: string;
  athlete_level: string;
  url: string;
  key_takeaway: string;
};

export type PlanningWorkoutVariant = {
  label: string;
  format_type: string;
  dose_example: string;
  use_case: string;
};

export type PlanningWorkoutVariable = {
  name: string;
  options: string[];
};

export type DoseStepItem = {
  step: number;
  label: string;
  total_useful_time_min: number;
  rest_min: number;
  intensity_zone: string;
  readiness_required: string;
  notes: string;
  total_duration_min: number;
};

export type WorkoutTarget = {
  target_type: string;
  value_from?: number | null;
  value_to?: number | null;
  unit?: string | null;
  label?: string | null;
};

export type WorkoutStep = {
  order: number;
  step_type: string;
  length_type: string;
  length_value?: number | null;
  target?: WorkoutTarget | null;
  intensity_label?: string | null;
  instructions?: string | null;
  repeat_count?: number | null;
  children: WorkoutStep[];
};

export type WorkoutDefinition = {
  source_session_id?: number | null;
  sport: string;
  title: string;
  description?: string | null;
  steps: WorkoutStep[];
  notes: string[];
  source_payload: Record<string, unknown>;
};

export type PlanningWorkoutTemplate = {
  template_id: string;
  discipline: string;
  compatible_block_types: string[];
  session_role: string;
  session_family: string;
  public_label: string;
  summary: string;
  objective: string;
  dose_guidance: string;
  progression_axes: string[];
  control_points: string[];
  expected_adaptations: string[];
  cautions: string[];
  confidence: number;
  evidence: PlanningEvidenceSource[];
  variants: PlanningWorkoutVariant[];
  builder_variables: PlanningWorkoutVariable[];
  csv_examples: string[];
  fatigue_cost: number;
  calentamiento_min: number;
  calentamiento_template: string;
  enfriamiento_min: number;
  enfriamiento_template: string;
  coach_tips: string[];
  dose_ladder: DoseStepItem[];
};

export type PlanningMesocycleDraftSession = {
  session_id: string;
  scheduled_date?: string | null;
  week_index: number;
  day_offset: number;
  template_id?: string | null;
  session_role: string;
  session_family: string;
  public_label: string;
  objective: string;
  dose_prescription?: string | null;
  dose_guidance: string;
  progression_note: string;
  expected_signal: string;
  coach_note: string;
  confidence: number;
  evidence_source_ids: string[];
  csv_examples: string[];
  selection_reason?: string[];
  estimated_tss?: number | null;
  coach_override_expected?: boolean;
  payload?: Record<string, unknown>;
};

export type PlanningMesocycleDraftWeek = {
  week_index: number;
  theme: string;
  load_type: string;
  objective: string;
  rationale: string;
  sessions: PlanningMesocycleDraftSession[];
  control_points: string[];
  spacing_warnings?: string[];
};

export type PlanningMesocycleDraft = {
  discipline: string;
  block_type: string;
  block_label: string;
  structure: string;
  duration_weeks: number;
  primary_focus: string;
  secondary_focus?: string | null;
  foundations: string[];
  progression_rules: string[];
  state_summary?: string | null;
  curve_direction?: string | null;
  weeks: PlanningMesocycleDraftWeek[];
};

export type PlanningPlannedSession = {
  id: number;
  focus_block_id: number;
  scheduled_date: string;
  discipline: string;
  week_index: number;
  day_offset: number;
  session_role: string;
  session_family: string;
  workout_template_id?: string | null;
  public_label: string;
  objective: string;
  dose_prescription: string;
  dose_guidance?: string | null;
  progression_note?: string | null;
  expected_signal?: string | null;
  coach_note?: string | null;
  athlete_note?: string | null;
  scheduled_time?: string | null;
  confidence: number;
  status: string;
  bla_check: boolean;
  estimated_tss?: number | null;
  structured_workout_payload?: WorkoutDefinition | null;
  publish_status?: string;
  publish_provider?: string | null;
  publish_error?: string | null;
  payload?: Record<string, unknown>;
};

export type BlockCandidate = {
  block_type: string;
  score: number;
  reasons: string[];
  contraindications: string[];
};

export type LactateCheckRecommendation = {
  session_type: string;
  purpose: string;
  suggested_timing_within_block: string;
  minimum_conditions: string[];
  optional_lactate_points: string[];
  coach_editable: boolean;
  priority: string;
  why_now: string;
};

export type DurabilityAnalysis = {
  durability_score?: number | null;
  lt1_degradation_pct?: number | null;
  lt2_degradation_pct?: number | null;
  aerobic_drift_pct?: number | null;
  durability_confidence: number;
  durability_source: string;
  durability_flag: string;
};

export type BlockRationale = {
  block_key: string;
  display_name: string;
  olbrecht_class: string;
  summary_coach: string;
  physiological_goal: string;
  training_description: string;
  expected_timeline: string;
  ideal_context: string;
  risk_if_wrong: string;
  min_weeks: number;
  max_weeks: number;
  science_refs: string[];
};

export type ReliabilityWarning = {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  actionable: string;
};

export type BlockExplanation = {
  headline: string;
  why_now: string;
  what_to_expect: string;
  what_to_watch: string;
  when_to_exit: string;
  alternative_if_wrong: string;
  block_key: string;
  display_name: string;
  olbrecht_class: string;
  min_weeks: number;
  max_weeks: number;
};

export type MesocycleRecommendation = {
  target_discipline: string;
  recommended_block_type: string;
  recommended_block_label: string;
  template_id?: string | null;
  template_summary?: string | null;
  structure: string;
  duration_weeks: number;
  work_weeks: number;
  recovery_weeks: number;
  primary_focus: string;
  secondary_focus?: string | null;
  confidence: number;
  reasoning: string[];
  key_session_families: string[];
  control_points: string[];
  progression_rules: string[];
  entry_checks: string[];
  exit_checks: string[];
  risk_flags: string[];
  next_target?: PlanningTargetSummary | null;
  lactate_check_recommendations?: LactateCheckRecommendation[];
  candidates_scored?: BlockCandidate[];
  scoring_context?: {
    assignment_mode?: string | null;
    selection_engine?: string | null;
    robustness: string;
    evaluation_signal: string;
    previous_major: string | null;
    days_to_target: number | null;
  };
  physiological_analysis?: {
    data_quality: string;
    season_phase?: string | null;
    primary_limiter?: string | null;
    secondary_limiter?: string | null;
    lt2_gap_kmh?: number | null;
    lt1_gap_kmh?: number | null;
    required_lt2_kmh?: number | null;
    required_lt1_kmh?: number | null;
    physiological_block?: string | null;
    distance_category?: string | null;
    metric_type?: string | null;
    lt1_confidence_dynamic?: number | null;
    lt2_confidence_dynamic?: number | null;
    glycolytic_confidence?: number | null;
    overall_decision_confidence?: number | null;
    confidence_band?: string | null;
    decision_uncertainty?: string | null;
    needs_confirmation: boolean;
    durability?: DurabilityAnalysis | null;
    contradictory_signals?: string[];
    confidence_factors?: Array<{
      label: string;
      score: number;
      weight: number;
      explanation: string;
    }>;
    lactate_check_recommendations?: LactateCheckRecommendation[];
    overrides_temporal_scoring: boolean;
    reliability_warnings?: ReliabilityWarning[];
    borderline?: boolean;
    borderline_note?: string;
    block_rationale?: BlockRationale | null;
    block_explanation?: BlockExplanation | null;
  } | null;
};

export type PlanningOverview = {
  athlete_id: number;
  athlete_name: string;
  athlete_primary_discipline: string;
  discipline: string;
  generated_on: string;
  foundations: PlanningFoundation[];
  template_library: PlanningMesocycleTemplate[];
  current_block: PlanningCurrentBlock;
  planned_blocks: AthleteFocusBlock[];
  planned_sessions: PlanningPlannedSession[];
  detected_mesocycles: PlanningDetectedMesocycle[];
  next_recommendation: MesocycleRecommendation;
  recommended_workouts: PlanningWorkoutTemplate[];
  mesocycle_draft?: PlanningMesocycleDraft | null;
  warnings: string[];
  explanation: string[];
};

export type DynamicReference = {
  target_lactate: number;
  estimated_pace_seconds_per_km?: number | null;
  estimated_speed_kph?: number | null;
  estimated_power_watts?: number | null;
  estimated_hr_at_target?: number | null;
  confidence_interval: Record<string, unknown>;
  number_of_points_used: number;
  interpolation_method_used: string;
  confidence_score: number;
  reliability_score: number;
  validity_score: number;
  sample_size_effect: number;
  point_influence_score: number;
  protocol_score?: number | null;
  signal_score?: number | null;
  baseline_state_score?: number | null;
  warnings: string[];
  explanation: string[];
  relative_target_from_baseline?: number | null;
};

export type DynamicThresholdModel = {
  model_type: string;
  based_on_days: number;
  sessions_considered: number;
  reference_2mmol?: DynamicReference | null;
  reference_4mmol?: DynamicReference | null;
  practical_lt1?: DynamicReference | null;
  practical_lt2?: DynamicReference | null;
  confidence_score: number;
  reliability_score: number;
  validity_score: number;
  sample_size_effect: number;
  point_influence_score: number;
  signal_score?: number | null;
  warnings: string[];
  explanation: string[];
  points_used: Array<Record<string, unknown>>;
  baseline_lactate?: number | null;
  baseline_source: string;
  baseline_state?: string | null;
  baseline_delta_from_history?: number | null;
  baseline_state_score?: number | null;
  lt1_relative_target_lactate?: number | null;
};

export type DynamicThresholdComparison = {
  summary: string;
  warnings: string[];
  metrics: Record<string, unknown>;
};

export type DynamicThresholds = {
  discipline: string;
  power_source?: string | null;
  generated_on: string;
  config: Record<string, unknown>;
  current_baseline_lactate?: number | null;
  current_baseline_source: string;
  current_baseline_state?: string | null;
  current_baseline_delta_from_history?: number | null;
  current_baseline_state_score?: number | null;
  lt1_relative_target_lactate?: number | null;
  acute: DynamicThresholdModel;
  chronic: DynamicThresholdModel;
  comparison: DynamicThresholdComparison;
  history: Record<string, HistoricalPoint[]>;
  warnings: string[];
  explanation: string[];
};

export type PeakLactate = {
  lactate_mmol: number;
  pace_seconds_per_km?: number | null;
  power_watts?: number | null;
  heart_rate?: number | null;
  order_index: number;
};

export type SessionAnalysis = {
  session: SessionSummary;
  curve_by_pace: CurvePoint[];
  curve_by_power: CurvePoint[];
  curve_by_hr: CurvePoint[];
  thresholds: Threshold[];
  contextual_comments: string[];
  interpretation: string[];
  confidence_summary: ConfidenceItem[];
  contextual_details: Array<{
    interval_id: number;
    order_index: number;
    measured_lactate: number;
    contextual_lactate: number;
    confidence: number;
    comment: string;
    rules: Record<string, number>;
  }>;
  peak_lactate?: PeakLactate | null;
  historical_evolution: Record<string, HistoricalPoint[]>;
  real_thresholds?: RealThresholds | null;
  individual_thresholds?: IndividualThresholds | null;
};

export type DashboardData = {
  athletes_count: number;
  recent_tests: SessionSummary[];
  physiological_alerts: string[];
  improving_athletes: string[];
  degrading_athletes: string[];
};

// ── Training Zones ──────────────────────────────────────────────────────────

export type TrainingZoneItem = {
  id: number;
  zone_number: number;
  zone_label: string;
  zone_color?: string | null;
  pace_lower_seconds?: number | null;
  pace_upper_seconds?: number | null;
  hr_lower?: number | null;
  hr_upper?: number | null;
  power_lower?: number | null;
  power_upper?: number | null;
  description?: string | null;
};

export type TrainingZoneSet = {
  id: number;
  discipline: string;
  name: string;
  is_active: boolean;
  threshold_source?: string | null;
  threshold_context?: Record<string, unknown> | null;
  notes?: string | null;
  created_at: string;
  zones: TrainingZoneItem[];
};

export type ThresholdItemForZones = {
  lactate: number;
  pace_seconds_per_km?: number | null;
  heart_rate?: number | null;
  power_watts?: number | null;
  pace_label?: string | null;
};

export type ThresholdProfileForZones = {
  lt1?: ThresholdItemForZones | null;
  lt2?: ThresholdItemForZones | null;
  source: string;
  source_label: string;
  confidence?: number | null;
  snapshot_date?: string | null;
};

// ── Training Load (TSS / ATL / CTL / TSB) ───────────────────────────────────

export type DailyTrainingLoad = {
  date: string;
  tss_total: number;
  tss_by_discipline: Record<string, number>;
  atl: number;
  ctl: number;
  tsb: number;
  acwr?: number | null;
  atl_by_discipline?: Record<string, number>;
  ctl_by_discipline?: Record<string, number>;
  tsb_by_discipline?: Record<string, number>;
};

export type TrainingLoadResponse = {
  athlete_id: number;
  start_date: string;
  end_date: string;
  days: DailyTrainingLoad[];
  current_atl: number;
  current_ctl: number;
  current_tsb: number;
  current_acwr?: number | null;
  current_atl_by_discipline?: Record<string, number>;
  current_ctl_by_discipline?: Record<string, number>;
  threshold_sources: Record<string, unknown>;
  warnings: string[];
  avg_confidence: number;
};

// ── Triathlon Integrated Mesocycle ───────────────────────────────────────────

export type TriathlonDraftSession = {
  session_id: string;
  discipline: string;
  scheduled_date?: string | null;
  week_index: number;
  day_offset: number;
  template_id?: string | null;
  session_role: string;
  session_family: string;
  public_label: string;
  objective: string;
  dose_prescription?: string | null;
  dose_guidance: string;
  progression_note?: string;
  expected_signal?: string;
  coach_note?: string;
  confidence: number;
  estimated_tss?: number | null;
  coach_override_expected?: boolean;
  scheduled_time?: string | null;
  payload?: Record<string, unknown>;
};

export type TriathlonWeekDraft = {
  week_index: number;
  phase: string;
  load_label: string;
  sessions: TriathlonDraftSession[];
  tss_target_total: number;
  tss_target_by_discipline?: Record<string, number>;
  spacing_warnings?: string[];
};

export type WeekLoadProjection = {
  week_index: number;
  projected_tss: number;
  projected_ctl: number;
  projected_atl: number;
  projected_tsb: number;
  projected_acwr?: number | null;
  safety_flag: string;
};

export type TriathlonMesocycleDraft = {
  primary_discipline: string;
  primary_block_type: string;
  secondary_discipline: string;
  secondary_block_type: string;
  swim_block_type: string;
  duration_weeks: number;
  season_phase: string;
  weeks: TriathlonWeekDraft[];
  spacing_warnings?: string[];
  load_projection?: WeekLoadProjection[];
};
