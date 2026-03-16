import type { DisciplineView, Estimate, SessionSummary, AthleteHealthDaily, AthleteHealthMetric, AthleteHealthOverview, AthleteAnalysis, PlanningPlannedSession, PlanningOverview, HistoricalPoint } from "../types";
import type { ResolvedTrainingThreshold } from "../lib/trainingThresholds";

export type DisciplineSnapshot = {
  discipline: string;
  view: DisciplineView;
  lt1?: ResolvedTrainingThreshold | null;
  lt2?: ResolvedTrainingThreshold | null;
  estimate?: Estimate;
  weeklySessions: number;
  monthlySessions: number;
  latestSession?: SessionSummary;
  trend: Array<{ date: string; value: number | null }>;
};

export type PortalStatusTone = "surging" | "steady" | "building";

export type PortalStatus = {
  tone: PortalStatusTone;
  label: string;
  headline: string;
  summary: string;
  emphasis: string;
};

export type WellnessSeriesPoint = {
  date: string;
  shortLabel: string;
  sleepScore: number | null;
  sleepHours: number | null;
  hrv: number | null;
  hrvStatus: string | null;
  restingHr: number | null;
  stress: number | null;
  intensityMinutes: number | null;
  bodyBatteryChange: number | null;
  respirationRate: number | null;
  breathingEvents: number | null;
  weight: number | null;
  steps: number | null;
};

export type SleepStageKey = "awake" | "rem" | "light" | "deep";

export type SleepStageSegment = {
  stage: SleepStageKey;
  start: number;
  end: number;
};

export type StatusHistoryPoint = { label: string; score: number };

export type CalendarDay = {
  date: Date;
  iso: string;
  label: string;
  dayNum: number;
  isToday: boolean;
};

export type CalendarDayWithSessions = CalendarDay & {
  sessions: PlanningPlannedSession[];
};
