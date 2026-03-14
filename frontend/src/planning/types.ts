import type { Athlete, AthleteAnalysis, AthleteFocusBlockEvaluation, AthleteTarget, DynamicReference, PlanningMesocycleTemplate, PlanningWorkoutTemplate } from "../types";

export type PlanTone = "positive" | "warning" | "neutral";

export type OpenWorkoutPreviewState = {
  template: PlanningWorkoutTemplate;
  selection: import("../components/WorkoutPreviewModal").WorkoutPreviewSelection;
};

export type PlanningSourceModalState = {
  source: PlanningCalendarSource;
  title: string;
  summary: string;
  details: string[];
};

export type MicrocycleWeek = {
  title: string;
  load: string;
  emphasis: string;
  notes: string;
  tone: PlanTone;
};

export type PlanningCalendarSource = {
  id: string;
  kind: "draft" | "planned" | "historical";
  focusBlockId?: number | null;
  startDate: string;
  endDate: string;
  discipline: string;
  templateId?: string | null;
  blockType?: string | null;
  status?: string | null;
  title: string;
  objective: string;
  energySystemFocus?: string | null;
  phase?: string | null;
  intent?: string | null;
  notes?: string | null;
  density?: string | null;
};

export type CalendarSession = {
  id: string;
  date: string;
  discipline: string;
  title: string;
  sessionType: string;
  objective: string;
  description: string;
  dose: string;
  confidence: "alta" | "media";
  estimatedMinutes?: number;
  rawId?: number;
  blaCheck?: boolean;
  publishStatus?: string;
  publishError?: string | null;
};

export type CalendarEntry = CalendarSession & {
  layerDiscipline: string;
  isOverlay: boolean;
};

export type CalendarMesocycleOption = {
  template: PlanningMesocycleTemplate;
  score: number | null;
  isBest: boolean;
  whyItFits: string[];
  whyNotAsGood: string[];
};

export type QuickAddKind = "running" | "ciclismo" | "natación" | "event" | "off" | "note" | "mesocycle";

export type WorkoutLibraryLayer =
  | "base"
  | "lt1"
  | "subthreshold"
  | "lt2"
  | "vo2"
  | "technique"
  | "strength"
  | "specific"
  | "recovery"
  | "other";

export type CalendarQuickAddState = {
  date: string;
  mode: "actions" | "library" | "manual";
  selectedKind: QuickAddKind;
  selectedDiscipline?: "running" | "ciclismo" | "natación";
  selectedLayer?: WorkoutLibraryLayer;
};

export type CalendarWorkspaceTab = "athletes" | "library" | "calendar" | "summary";

export type SummaryQuickBar = {
  label: string;
  value: number;
  tone: PlanTone;
};

export type RosterProgressRow = {
  athlete: Athlete;
  tone: PlanTone;
  directionLabel: string;
  summary: string;
  snapshotLabel: string;
  confidenceLabel: string;
  currentBlock: string;
  nextTarget: string;
  quickLoadBars: SummaryQuickBar[];
  confidenceBars: SummaryQuickBar[];
  blockMetricLabel: string;
  blockMetricHint: string;
  thresholdDisciplineLabel: string;
  lt1Label: string;
  lt1Hint: string;
  lt2Label: string;
  lt2Hint: string;
};

export type CalendarWeekDisciplineMetric = {
  discipline: string;
  minutes: number;
  distanceMeters: number | null;
  distanceEstimated: boolean;
  sessions: number;
};

export type CalendarWeekLoadProfile = {
  label: string;
  tone: PlanTone;
  hint: string;
  intensityPct: number;
};

export type CalendarWeekSnapshot = {
  totalMinutes: number;
  totalSessions: number;
  keySessions: number;
  supportSessions: number;
  recoverySessions: number;
  disciplineMetrics: CalendarWeekDisciplineMetric[];
  primaryDiscipline: string | null;
  peakDay: { date: string; minutes: number } | null;
  totalDistanceMeters: number | null;
  loadProfile: CalendarWeekLoadProfile;
};

export type CalendarMonthRow = {
  weekStart: string;
  weekEnd: string;
  cells: Array<{ id: string; date: string | null }>;
  inMonthDays: number;
  snapshot: CalendarWeekSnapshot;
};

export type CalendarMonthSection = {
  monthStart: string;
  rows: CalendarMonthRow[];
  scale: {
    totalMinutes: number;
    disciplineMinutes: Record<string, number>;
  };
  totalMinutes: number;
  totalSessions: number;
};
