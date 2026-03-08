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

export type AthleteFocusBlock = {
  id: number;
  start_date: string;
  end_date?: string | null;
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
  surface?: string | null;
  temperature_c?: number | null;
  comments?: string | null;
  intervals?: SessionInterval[];
};

export type LactateSample = {
  id?: number;
  lactate_mmol: number;
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
  power_source_views?: Record<string, DisciplineView> | null;
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
  discipline_views: Record<string, DisciplineView>;
  active_focus_block?: (AthleteFocusBlock & { evaluation?: AthleteFocusBlockEvaluation }) | null;
  focus_block_evaluations: AthleteFocusBlockEvaluation[];
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
  historical_evolution: Record<string, HistoricalPoint[]>;
};

export type DashboardData = {
  athletes_count: number;
  recent_tests: SessionSummary[];
  physiological_alerts: string[];
  improving_athletes: string[];
  degrading_athletes: string[];
};
