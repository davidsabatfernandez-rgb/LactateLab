import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { WorkoutPreviewModal, WorkoutPreviewSelection } from "../components/WorkoutPreviewModal";
import { api } from "../lib/api";
import { resolveAnalysisDisciplineView, resolveTrainingThreshold } from "../lib/trainingThresholds";
import { Athlete, AthleteAnalysis, AthleteFocusBlockEvaluation, AthleteTarget, DynamicReference, PlanningMesocycleDraftSession, PlanningMesocycleTemplate, PlanningOverview, PlanningPlannedSession, PlanningWorkoutTemplate, SessionSummary, WorkoutDefinition } from "../types";

type PlanningPageProps = {
  token: string;
};

type OpenWorkoutPreviewState = {
  template: PlanningWorkoutTemplate;
  selection: WorkoutPreviewSelection;
};

type PlanningSourceModalState = {
  source: PlanningCalendarSource;
  title: string;
  summary: string;
  details: string[];
};

type PlanTone = "positive" | "warning" | "neutral";

type MicrocycleWeek = {
  title: string;
  load: string;
  emphasis: string;
  notes: string;
  tone: PlanTone;
};

type PlanningCalendarSource = {
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

type CalendarSession = {
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

type CalendarEntry = CalendarSession & {
  layerDiscipline: string;
  isOverlay: boolean;
};

type CalendarMesocycleOption = {
  template: PlanningMesocycleTemplate;
  score: number | null;
  isBest: boolean;
  whyItFits: string[];
  whyNotAsGood: string[];
};

type QuickAddKind = "running" | "ciclismo" | "natación" | "event" | "off" | "note" | "mesocycle";

type WorkoutLibraryLayer =
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

type CalendarQuickAddState = {
  date: string;
  mode: "actions" | "library" | "manual";
  selectedKind: QuickAddKind;
  selectedDiscipline?: "running" | "ciclismo" | "natación";
  selectedLayer?: WorkoutLibraryLayer;
};

type CalendarWorkspaceTab = "athletes" | "library" | "calendar" | "summary";

type SummaryQuickBar = {
  label: string;
  value: number;
  tone: PlanTone;
};

type RosterProgressRow = {
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

type CalendarWeekDisciplineMetric = {
  discipline: string;
  minutes: number;
  distanceMeters: number | null;
  distanceEstimated: boolean;
  sessions: number;
};

type CalendarWeekLoadProfile = {
  label: string;
  tone: PlanTone;
  hint: string;
  intensityPct: number;
};

type CalendarWeekSnapshot = {
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

type CalendarMonthRow = {
  weekStart: string;
  weekEnd: string;
  cells: Array<{ id: string; date: string | null }>;
  inMonthDays: number;
  snapshot: CalendarWeekSnapshot;
};

type CalendarMonthSection = {
  monthStart: string;
  rows: CalendarMonthRow[];
  scale: {
    totalMinutes: number;
    disciplineMinutes: Record<string, number>;
  };
  totalMinutes: number;
  totalSessions: number;
};

function parseDateValue(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  return new Date(value);
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoDateFromToday(offsetDays = 0) {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() + offsetDays);
  return formatDateKey(value);
}

function addDays(isoDate: string, days: number) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return isoDate;
  value.setDate(value.getDate() + days);
  return formatDateKey(value);
}

function addMonths(isoDate: string, months: number) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return isoDate;
  value.setDate(1);
  value.setMonth(value.getMonth() + months);
  return formatDateKey(value);
}

function dateValue(isoDate?: string | null) {
  if (!isoDate) return Number.NaN;
  const value = parseDateValue(isoDate);
  return value.getTime();
}

function disciplineLabel(value?: string | null) {
  if (value === "running") return "Carrera a pie";
  if (value === "ciclismo") return "Ciclismo";
  if (value === "natación") return "Natación";
  if (value === "triatlón") return "Triatlón";
  return value || "Disciplina";
}

function planningPublishStatusMeta(value?: string | null) {
  if (value === "ready") {
    return { label: "Ready", tone: "positive" as const, description: "Estructura canónica lista para enviar." };
  }
  if (value === "sent") {
    return { label: "Sent", tone: "positive" as const, description: "Workout ya publicado en un proveedor externo." };
  }
  if (value === "failed") {
    return { label: "Failed", tone: "negative" as const, description: "Falló la preparación o publicación del workout." };
  }
  return { label: "Draft", tone: "neutral" as const, description: "Todavía no hay una estructura lista para publicar." };
}

function planningDisciplineAccent(value?: string | null) {
  if (value === "running") return "#285fe7";
  if (value === "ciclismo") return "#257a4d";
  if (value === "natación") return "#1f7c8b";
  return "#8a98a8";
}

function normalizeDisciplineKey(value?: string | null) {
  if (!value) return "running";
  if (value === "triatlón") return "running";
  if (value === "carrera" || value === "carrera a pie") return "running";
  return value;
}

function quickAddKindSlug(kind: QuickAddKind | "library") {
  if (kind === "running") return "running";
  if (kind === "ciclismo") return "cycling";
  if (kind === "natación") return "swimming";
  if (kind === "event") return "event";
  if (kind === "off") return "off";
  if (kind === "note") return "note";
  if (kind === "mesocycle") return "mesocycle";
  return "library";
}

function QuickAddIcon({ kind, large = false }: { kind: QuickAddKind | "library"; large?: boolean }) {
  const slug = quickAddKindSlug(kind);
  return (
    <span className={`planning-quick-add-icon kind-${slug} ${large ? "large" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {kind === "running" ? (
          <>
            <circle cx="16.5" cy="5" r="2.2" />
            <path d="M10.5 21l2.2-5.6 2.7-2.6 1.8 2.2 3.3.4" />
            <path d="M8.4 13.4l4-3.5 1.9-3.2 3.5 1" />
            <path d="M7 10.8l2.5 1.1" />
          </>
        ) : kind === "ciclismo" ? (
          <>
            <circle cx="6.5" cy="17" r="3.5" />
            <circle cx="17.5" cy="17" r="3.5" />
            <path d="M9 17l3.1-6h3.2" />
            <path d="M11.2 11l3.3 6h3" />
            <path d="M9.8 11H7.5" />
            <path d="M14.5 7.5h1.8" />
          </>
        ) : kind === "natación" ? (
          <>
            <path d="M3 16c1.6 0 1.6-1 3.2-1s1.6 1 3.2 1 1.6-1 3.2-1 1.6 1 3.2 1 1.6-1 3.2-1 1.6 1 3.2 1" />
            <path d="M4 11.6c1.2-.6 2.8-1.1 4.3-.6 1 .3 1.7 1 2.7 1.2 1.8.4 3.1-.8 4.5-1.7" />
            <path d="M15.6 7.3l1.9 1.1" />
            <path d="M14.5 9.1c.8-.6 1.9-.8 2.8-.5" />
          </>
        ) : kind === "event" ? (
          <>
            <rect x="4" y="6" width="16" height="14" rx="2.5" />
            <path d="M8 4v4" />
            <path d="M16 4v4" />
            <path d="M4 10.5h16" />
            <path d="M8 14h3" />
          </>
        ) : kind === "off" ? (
          <>
            <path d="M12 4.5v7.5" />
            <path d="M12 12l5.2 3" />
            <circle cx="12" cy="12" r="8" />
          </>
        ) : kind === "note" ? (
          <>
            <path d="M7 4.5h7l4 4V19.5H7z" />
            <path d="M14 4.5v4h4" />
            <path d="M9.5 12.5h5" />
            <path d="M9.5 16h5" />
          </>
        ) : kind === "mesocycle" ? (
          <>
            <rect x="4" y="5" width="16" height="14" rx="3" />
            <path d="M8 9h8" />
            <path d="M8 13h5" />
            <path d="M8 17h8" />
          </>
        ) : (
          <>
            <path d="M7 6h10" />
            <path d="M7 12h10" />
            <path d="M7 18h10" />
            <circle cx="5" cy="6" r="1" />
            <circle cx="5" cy="12" r="1" />
            <circle cx="5" cy="18" r="1" />
          </>
        )}
      </svg>
    </span>
  );
}

function firstName(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return "";
  return normalized.split(/\s+/)[0] ?? normalized;
}

function formatTargetChipDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = parseDateValue(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function formatTargetCountdown(value?: string | null) {
  if (!value) return "Sin fecha objetivo";
  const target = parseDateValue(value);
  if (Number.isNaN(target.getTime())) return "Fecha no válida";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "Objetivo pasado";
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Mañana";
  const weeks = Math.floor(diffDays / 7);
  const days = diffDays % 7;
  if (weeks <= 0) return `${diffDays} días`;
  if (days === 0) return `${weeks} sem`;
  return `${weeks} sem · ${days} días`;
}

function targetMetricLabel(target: AthleteTarget) {
  const runningPace = target.target_running_pace_label || target.target_pace_label;
  const swimPace = target.target_swim_pace_label;
  const cyclingWatts = target.target_cycling_power_watts || target.target_power_watts;

  if (target.discipline === "ciclismo" && typeof cyclingWatts === "number") {
    return `${Math.round(cyclingWatts)} W objetivo`;
  }
  if (target.discipline === "natación" && swimPace) {
    return `Ritmo objetivo ${swimPace}`;
  }
  if (runningPace) {
    return `Ritmo objetivo ${runningPace}`;
  }
  if (typeof cyclingWatts === "number") {
    return `${Math.round(cyclingWatts)} W objetivo`;
  }
  return "Sin métrica objetivo";
}

function targetPrimaryValue(target: AthleteTarget) {
  return target.objective || target.distance_label || "Objetivo";
}

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = parseDateValue(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function formatShortDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = parseDateValue(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function parseCalendarWorkspaceTab(value: string | null): CalendarWorkspaceTab {
  if (value === "athletes" || value === "library" || value === "summary") return value;
  return "calendar";
}

function progressTone(direction?: string | null): PlanTone {
  const normalized = direction?.toLowerCase() ?? "";
  if (normalized.includes("mejor") || normalized.includes("posit") || normalized.includes("up") || normalized.includes("good")) {
    return "positive";
  }
  if (normalized.includes("peor") || normalized.includes("negat") || normalized.includes("down") || normalized.includes("fatiga") || normalized.includes("risk")) {
    return "warning";
  }
  return "neutral";
}

function progressDirectionLabel(direction?: string | null) {
  const normalized = direction?.toLowerCase() ?? "";
  if (normalized.includes("mejor") || normalized.includes("posit") || normalized.includes("up") || normalized.includes("good")) {
    return "Mejorando";
  }
  if (normalized.includes("peor") || normalized.includes("negat") || normalized.includes("down") || normalized.includes("fatiga") || normalized.includes("risk")) {
    return "Vigilar";
  }
  return "Estable";
}

function averageConfidenceLabel(analysis?: AthleteAnalysis | null) {
  const scores = analysis?.confidence_summary?.map((item) => item.score).filter((value) => Number.isFinite(value)) ?? [];
  if (!scores.length) return "Sin señal";
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return `${Math.round(average * 100)}%`;
}

function normalizeConfidenceScore(score?: number | null) {
  if (typeof score !== "number" || Number.isNaN(score)) return 0;
  if (score > 1) return Math.max(0, Math.min(score / 100, 1));
  return Math.max(0, Math.min(score, 1));
}

function shortConfidenceLabel(label?: string | null) {
  const normalized = label?.trim();
  if (!normalized) return "SIG";
  return normalized.split(/\s+/).slice(0, 1).join("").slice(0, 3).toUpperCase();
}

function shortMetricLabel(metric?: string | null) {
  const normalized = metric?.trim().toLowerCase() ?? "";
  if (normalized.includes("lt1")) return "LT1";
  if (normalized.includes("lt2")) return "LT2";
  if (normalized.includes("lact")) return "LAC";
  if (normalized.includes("dur")) return "DUR";
  if (normalized.includes("ftp")) return "FTP";
  if (normalized.includes("css")) return "CSS";
  return (metric || "MET").slice(0, 3).toUpperCase();
}

function toneFromScore(score: number): PlanTone {
  if (score >= 0.72) return "positive";
  if (score <= 0.42) return "warning";
  return "neutral";
}

function buildRecentLoadBars(sessions?: SessionSummary[] | null): SummaryQuickBar[] {
  const today = isoDateFromToday();
  const labels = ["L", "M", "X", "J", "V", "S", "D"];
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const counts = new Map<string, number>();

  (sessions ?? []).forEach((session) => {
    const key = formatDateKey(parseDateValue(session.performed_at));
    if (!days.includes(key)) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const maxCount = Math.max(1, ...days.map((day) => counts.get(day) ?? 0));
  return days.map((day) => {
    const parsed = parseDateValue(day);
    const weekday = parsed.getDay();
    const label = labels[weekday === 0 ? 6 : weekday - 1] ?? "·";
    const count = counts.get(day) ?? 0;
    return {
      label,
      value: count / maxCount,
      tone: count >= maxCount && count > 0 ? "positive" : count === 0 ? "neutral" : "warning",
    };
  });
}

function buildConfidenceBars(analysis?: AthleteAnalysis | null): SummaryQuickBar[] {
  const summary = analysis?.confidence_summary?.slice(0, 4) ?? [];
  if (!summary.length) {
    return [
      { label: "SIG", value: 0.18, tone: "neutral" },
      { label: "DAT", value: 0.14, tone: "neutral" },
      { label: "CTL", value: 0.16, tone: "neutral" },
    ];
  }
  return summary.map((item) => {
    const value = normalizeConfidenceScore(item.score);
    return {
      label: shortConfidenceLabel(item.label),
      value,
      tone: toneFromScore(value),
    };
  });
}

function formatBlockMetricQuickview(evaluation?: AthleteFocusBlockEvaluation | null) {
  if (!evaluation) {
    return {
      label: "Sin métrica activa",
      hint: "Todavía no hay una lectura comparativa del bloque.",
    };
  }

  const delta = evaluation.delta_relative ?? evaluation.delta;
  const unit = evaluation.relative_unit ?? evaluation.unit ?? "";
  const deltaLabel = typeof delta === "number"
    ? `${delta > 0 ? "+" : ""}${delta.toFixed(Math.abs(delta) >= 10 ? 0 : 1)} ${unit}`.trim()
    : "sin delta";

  return {
    label: shortMetricLabel(evaluation.key_metric),
    hint: `${deltaLabel} · ${evaluation.recommendation || evaluation.summary}`,
  };
}

function formatThresholdSecondaryMetric(
  threshold: ReturnType<typeof resolveTrainingThreshold>,
  discipline: string,
) {
  if (!threshold) return "Sin referencia visible";
  const details = [threshold.sourceLabel];
  const primaryMetric = formatThresholdPrimaryMetric(threshold, discipline);
  if (typeof threshold.heartRate === "number" && !primaryMetric.includes("bpm")) {
    details.unshift(`${Math.round(threshold.heartRate)} bpm`);
  }
  return details.join(" · ");
}

function formatThresholdQuickRows(
  source: AthleteAnalysis | ReturnType<typeof resolveAnalysisDisciplineView> | null | undefined,
  discipline: string,
) {
  const lt1 = resolveTrainingThreshold(source, "LT1");
  const lt2 = resolveTrainingThreshold(source, "LT2");

  return {
    lt1Label: formatThresholdPrimaryMetric(lt1, discipline),
    lt1Hint: formatThresholdSecondaryMetric(lt1, discipline),
    lt2Label: formatThresholdPrimaryMetric(lt2, discipline),
    lt2Hint: formatThresholdSecondaryMetric(lt2, discipline),
  };
}

function nextTargetLabelFromAthlete(athlete: Athlete) {
  const nextTarget = (athlete.targets ?? [])
    .slice()
    .sort((left, right) => String(left.target_date).localeCompare(String(right.target_date)))
    .find((target) => target.target_date >= isoDateFromToday());
  if (!nextTarget) return "Sin objetivo cercano";
  return `${nextTarget.objective} · ${formatShortDate(nextTarget.target_date)}`;
}

function formatPace(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "n/d";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}/km`;
}

function formatSwimPace(secondsPerKm?: number | null) {
  if (typeof secondsPerKm !== "number" || !Number.isFinite(secondsPerKm)) return "n/d";
  return formatPace(secondsPerKm / 10).replace("/km", "/100m");
}

function formatThresholdPrimaryMetric(
  threshold: ReturnType<typeof resolveTrainingThreshold>,
  discipline: string,
) {
  if (!threshold) return "Sin referencia";
  if (discipline === "ciclismo" && typeof threshold.powerWatts === "number") {
    return `${Math.round(threshold.powerWatts)} W`;
  }
  if (discipline === "natación" && typeof threshold.paceSecondsPerKm === "number") {
    return formatSwimPace(threshold.paceSecondsPerKm);
  }
  if (typeof threshold.paceSecondsPerKm === "number") {
    return formatPace(threshold.paceSecondsPerKm);
  }
  if (typeof threshold.powerWatts === "number") {
    return `${Math.round(threshold.powerWatts)} W`;
  }
  if (typeof threshold.heartRate === "number") {
    return `${Math.round(threshold.heartRate)} bpm`;
  }
  return "Sin referencia";
}

function formatDynamicReferencePrimaryMetric(reference: DynamicReference | null | undefined, discipline: string) {
  if (!reference) return "Sin referencia";
  if (discipline === "ciclismo" && typeof reference.estimated_power_watts === "number") {
    return `${Math.round(reference.estimated_power_watts)} W`;
  }
  if (discipline === "natación" && typeof reference.estimated_pace_seconds_per_km === "number") {
    return formatSwimPace(reference.estimated_pace_seconds_per_km);
  }
  if (typeof reference.estimated_pace_seconds_per_km === "number") {
    return formatPace(reference.estimated_pace_seconds_per_km);
  }
  if (typeof reference.estimated_power_watts === "number") {
    return `${Math.round(reference.estimated_power_watts)} W`;
  }
  if (typeof reference.estimated_hr_at_target === "number") {
    return `${Math.round(reference.estimated_hr_at_target)} bpm`;
  }
  return "Sin referencia";
}

function formatThresholdCoachLine(
  threshold: ReturnType<typeof resolveTrainingThreshold>,
  discipline: string,
) {
  if (!threshold) return "Sin referencia";
  const details = [formatThresholdPrimaryMetric(threshold, discipline)];
  if (typeof threshold.heartRate === "number") {
    details.push(`${Math.round(threshold.heartRate)} bpm`);
  }
  return `${details.join(" · ")} · ${threshold.sourceLabel}`;
}

function formatThresholdRange(
  lt1: ReturnType<typeof resolveTrainingThreshold>,
  lt2: ReturnType<typeof resolveTrainingThreshold>,
  discipline: string,
) {
  if (!lt1 || !lt2) return "Sin rango completo";
  const primaryMetric =
    discipline === "ciclismo" && typeof lt1.powerWatts === "number" && typeof lt2.powerWatts === "number"
      ? `${Math.round(lt1.powerWatts)}-${Math.round(lt2.powerWatts)} W`
      : discipline === "natación" && typeof lt1.paceSecondsPerKm === "number" && typeof lt2.paceSecondsPerKm === "number"
        ? `${formatSwimPace(lt1.paceSecondsPerKm)} → ${formatSwimPace(lt2.paceSecondsPerKm)}`
        : typeof lt1.paceSecondsPerKm === "number" && typeof lt2.paceSecondsPerKm === "number"
          ? `${formatPace(lt1.paceSecondsPerKm)} → ${formatPace(lt2.paceSecondsPerKm)}`
          : typeof lt1.heartRate === "number" && typeof lt2.heartRate === "number"
            ? `${Math.round(lt1.heartRate)}-${Math.round(lt2.heartRate)} bpm`
            : "Rango abierto";
  const heartRateRange =
    typeof lt1.heartRate === "number" && typeof lt2.heartRate === "number"
      ? `${Math.round(lt1.heartRate)}-${Math.round(lt2.heartRate)} bpm`
      : null;
  return heartRateRange && !primaryMetric.includes("bpm")
    ? `${primaryMetric} · ${heartRateRange}`
    : primaryMetric;
}

function planningThresholdOpinion(
  lt1: ReturnType<typeof resolveTrainingThreshold>,
  lt2: ReturnType<typeof resolveTrainingThreshold>,
  individualReason?: string | null,
) {
  const bothIndividual = lt1?.source === "individual" && lt2?.source === "individual";
  if (bothIndividual) {
    return "Esta disciplina ya está leyendo la planificación con LT1/LT2 individuales robustos.";
  }
  return individualReason || "Mientras no haya LT1/LT2 individuales robustos, la planificación usa 2.0 y 4.0 mmol como anclas fisiológicas.";
}

function buildPlanningPrescriptionHint(
  objective: string,
  title: string,
  discipline: string,
  lt1: ReturnType<typeof resolveTrainingThreshold>,
  lt2: ReturnType<typeof resolveTrainingThreshold>,
) {
  const family = objectiveFamily(`${objective} ${title}`);
  if (family === "recovery") {
    return lt1 ? `Mantén la sesión por debajo de LT1: ${formatThresholdCoachLine(lt1, discipline)}.` : "Sesión de descarga sin ancla LT1 disponible.";
  }
  if (family === "lt1") {
    return lt1 ? `Trabajo apoyado en LT1: ${formatThresholdCoachLine(lt1, discipline)}.` : "Trabajo LT1 sin referencia visible todavía.";
  }
  if (family === "lt2") {
    return lt2 ? `Trabajo apoyado en LT2: ${formatThresholdCoachLine(lt2, discipline)}.` : "Trabajo LT2 sin referencia visible todavía.";
  }
  if (family === "vo2") {
    return lt2 ? `La entrada se apoya en LT2 (${formatThresholdCoachLine(lt2, discipline)}) y las repeticiones salen por encima.` : "Sesión VO2 sin LT2 visible para afinar la lectura.";
  }
  return lt1 && lt2
    ? `Zona media entre LT1 y LT2: ${formatThresholdRange(lt1, lt2, discipline)}.`
    : "Sesión con intensidad mixta sin rango LT1-LT2 completo.";
}

function averageThresholdPaceSeconds(
  left?: number | null,
  right?: number | null,
) {
  if (typeof left === "number" && typeof right === "number") return (left + right) / 2;
  if (typeof left === "number") return left;
  if (typeof right === "number") return right;
  return null;
}

function estimatedPaceForCalendarSession(
  session: CalendarEntry,
  lt1: ReturnType<typeof resolveTrainingThreshold>,
  lt2: ReturnType<typeof resolveTrainingThreshold>,
) {
  const family = objectiveFamily(`${session.sessionType} ${session.objective} ${session.title}`);
  if (family === "lt2" || family === "vo2") {
    return lt2?.paceSecondsPerKm ?? lt1?.paceSecondsPerKm ?? null;
  }
  if (family === "technique") {
    return lt1?.paceSecondsPerKm ?? averageThresholdPaceSeconds(lt1?.paceSecondsPerKm, lt2?.paceSecondsPerKm);
  }
  if (family === "recovery") {
    return lt1?.paceSecondsPerKm ?? null;
  }
  return averageThresholdPaceSeconds(lt1?.paceSecondsPerKm, lt2?.paceSecondsPerKm) ?? lt1?.paceSecondsPerKm ?? lt2?.paceSecondsPerKm ?? null;
}

function parseDistanceMetersFromText(text?: string | null) {
  if (!text) return null;
  const normalized = text.toLowerCase().replace(/,/g, ".");
  const patterns: Array<{ regex: RegExp; resolve: (match: RegExpMatchArray) => number }> = [
    {
      regex: /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*km\b/i,
      resolve: (match) => Number(match[1]) * ((Number(match[2]) + Number(match[3])) / 2) * 1000,
    },
    {
      regex: /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*km\b/i,
      resolve: (match) => Number(match[1]) * Number(match[2]) * 1000,
    },
    {
      regex: /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*km\b/i,
      resolve: (match) => ((Number(match[1]) + Number(match[2])) / 2) * 1000,
    },
    {
      regex: /(\d+(?:\.\d+)?)\s*km\b/i,
      resolve: (match) => Number(match[1]) * 1000,
    },
    {
      regex: /(\d+)\s*x\s*(\d+)\s*-\s*(\d+)\s*m\b/i,
      resolve: (match) => Number(match[1]) * ((Number(match[2]) + Number(match[3])) / 2),
    },
    {
      regex: /(\d+)\s*x\s*(\d+)\s*m\b/i,
      resolve: (match) => Number(match[1]) * Number(match[2]),
    },
    {
      regex: /(\d+)\s*-\s*(\d+)\s*m\b/i,
      resolve: (match) => (Number(match[1]) + Number(match[2])) / 2,
    },
    {
      regex: /(\d+)\s*m\b/i,
      resolve: (match) => Number(match[1]),
    },
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (!match) continue;
    return pattern.resolve(match);
  }

  return null;
}

function estimateCalendarSessionDistanceMeters(
  session: CalendarEntry,
  thresholdSource: ReturnType<typeof resolveAnalysisDisciplineView> | AthleteAnalysis | null,
) {
  const explicitDistance = parseDistanceMetersFromText(session.dose || session.title || session.objective);
  if (typeof explicitDistance === "number" && Number.isFinite(explicitDistance) && explicitDistance > 0) {
    return { distanceMeters: explicitDistance, estimated: true };
  }

  const discipline = normalizeDisciplineKey(session.layerDiscipline || session.discipline);
  if (discipline !== "running" && discipline !== "natación") {
    return { distanceMeters: null, estimated: false };
  }

  const minutes = session.estimatedMinutes ?? estimateMinutesFromDose(session.dose);
  if (!minutes) {
    return { distanceMeters: null, estimated: false };
  }

  const lt1 = resolveTrainingThreshold(thresholdSource, "LT1");
  const lt2 = resolveTrainingThreshold(thresholdSource, "LT2");
  const paceSecondsPerKm = estimatedPaceForCalendarSession(session, lt1, lt2);
  if (typeof paceSecondsPerKm !== "number" || !Number.isFinite(paceSecondsPerKm) || paceSecondsPerKm <= 0) {
    return { distanceMeters: null, estimated: false };
  }

  return {
    distanceMeters: (minutes * 60 / paceSecondsPerKm) * 1000,
    estimated: true,
  };
}

function calendarWeekLoadProfile(totalMinutes: number, keySessions: number, totalSessions: number): CalendarWeekLoadProfile {
  if (!totalSessions) {
    return {
      label: "Semana vacía",
      tone: "neutral",
      hint: "Sin sesiones visibles todavía.",
      intensityPct: 0,
    };
  }
  if (totalMinutes >= 420 || keySessions >= 3) {
    return {
      label: "Carga alta",
      tone: "warning",
      hint: "Semana densa: conviene vigilar recuperación y orden de estímulos.",
      intensityPct: 100,
    };
  }
  if (totalMinutes >= 240 || keySessions >= 2) {
    return {
      label: "Construcción",
      tone: "positive",
      hint: "Carga útil para mover el bloque sin perder comparabilidad.",
      intensityPct: Math.max(48, Math.min(88, (totalMinutes / 420) * 100)),
    };
  }
  return {
    label: "Carga ligera",
    tone: "neutral",
    hint: "Semana de soporte, técnica o asimilación.",
    intensityPct: Math.max(18, Math.min(44, (totalMinutes / 420) * 100)),
  };
}

function buildCalendarWeekSnapshot(
  entries: CalendarEntry[],
  athleteAnalysis: AthleteAnalysis | null,
  selectedDiscipline: string,
): CalendarWeekSnapshot {
  const buckets = new Map<string, CalendarWeekDisciplineMetric>();
  const dayMinutes = new Map<string, number>();
  let totalMinutes = 0;
  let totalSessions = 0;
  let keySessions = 0;
  let supportSessions = 0;
  let recoverySessions = 0;

  entries.forEach((session) => {
    const discipline = normalizeDisciplineKey(session.layerDiscipline || session.discipline);
    const current = buckets.get(discipline) ?? {
      discipline,
      minutes: 0,
      distanceMeters: null,
      distanceEstimated: false,
      sessions: 0,
    };
    const minutes = session.estimatedMinutes ?? estimateMinutesFromDose(session.dose);
    const thresholdSource = resolveAnalysisDisciplineView(athleteAnalysis, discipline)
      ?? (discipline === normalizeDisciplineKey(selectedDiscipline) ? athleteAnalysis : null);
    const distance = estimateCalendarSessionDistanceMeters(session, thresholdSource);
    const sessionType = (session.sessionType || "").toLowerCase();

    totalMinutes += minutes;
    totalSessions += 1;
    if (sessionType.includes("clave") || sessionType.includes("test")) {
      keySessions += 1;
    } else if (sessionType.includes("recuper")) {
      recoverySessions += 1;
    } else {
      supportSessions += 1;
    }

    dayMinutes.set(session.date, (dayMinutes.get(session.date) ?? 0) + minutes);

    current.minutes += minutes;
    current.sessions += 1;
    if (typeof distance.distanceMeters === "number" && Number.isFinite(distance.distanceMeters)) {
      current.distanceMeters = (current.distanceMeters ?? 0) + distance.distanceMeters;
      current.distanceEstimated = current.distanceEstimated || distance.estimated;
    }
    buckets.set(discipline, current);
  });

  const disciplineMetrics = Array.from(buckets.values()).sort((left, right) => right.minutes - left.minutes);
  const peakDayEntry = Array.from(dayMinutes.entries()).sort((left, right) => right[1] - left[1])[0] ?? null;
  const totalDistance = disciplineMetrics.reduce<number | null>((sum, metric) => {
    if (typeof metric.distanceMeters !== "number" || !Number.isFinite(metric.distanceMeters)) return sum;
    return (sum ?? 0) + metric.distanceMeters;
  }, null);

  return {
    totalMinutes,
    totalSessions,
    keySessions,
    supportSessions,
    recoverySessions,
    disciplineMetrics,
    primaryDiscipline: disciplineMetrics[0]?.discipline ?? null,
    peakDay: peakDayEntry ? { date: peakDayEntry[0], minutes: peakDayEntry[1] } : null,
    totalDistanceMeters: totalDistance,
    loadProfile: calendarWeekLoadProfile(totalMinutes, keySessions, totalSessions),
  };
}

function formatMinutesCompact(totalMinutes: number) {
  if (!totalMinutes) return "0h";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatDistanceCompact(distanceMeters?: number | null) {
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return "n/d";
  }
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(distanceMeters >= 10000 ? 0 : 1)} km`;
  }
  return `${Math.round(distanceMeters)} m`;
}

function estimateMinutesFromDose(dose?: string | null) {
  if (!dose) return 0;
  const rangeRepeat = dose.match(/(\d+)\s*x\s*(\d+)\s*-\s*(\d+)\s*'/i);
  if (rangeRepeat) {
    return Number(rangeRepeat[1]) * Math.round((Number(rangeRepeat[2]) + Number(rangeRepeat[3])) / 2);
  }
  const repeat = dose.match(/(\d+)\s*x\s*(\d+)\s*'/i);
  if (repeat) {
    return Number(repeat[1]) * Number(repeat[2]);
  }
  const range = dose.match(/(\d+)\s*-\s*(\d+)\s*'/);
  if (range) {
    return Math.round((Number(range[1]) + Number(range[2])) / 2);
  }
  const single = dose.match(/(\d+)\s*'/);
  if (single) {
    return Number(single[1]);
  }
  return 0;
}

function startOfMonth(isoDate: string) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return isoDate;
  value.setDate(1);
  return formatDateKey(value);
}

function monthLabel(isoDate: string) {
  const parsed = parseDateValue(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

function monthHeading(isoDate: string) {
  const label = monthLabel(isoDate);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function diffCalendarMonths(start: string, end: string) {
  const startDate = parseDateValue(start);
  const endDate = parseDateValue(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
}

function buildCalendarMonthCells(monthStart: string) {
  const totalDays = daysInMonth(monthStart);
  const offset = weekdayOffset(monthStart);
  return [
    ...Array.from({ length: offset }, (_, index) => ({ id: `empty-${monthStart}-${index}`, date: null as string | null })),
    ...Array.from({ length: totalDays }, (_, index) => ({
      id: `day-${monthStart}-${index + 1}`,
      date: addDays(monthStart, index),
    })),
  ];
}

function buildCalendarMonthRows(
  monthStart: string,
  sessionsByDate: Map<string, CalendarEntry[]>,
  athleteAnalysis: AthleteAnalysis | null,
  selectedDiscipline: string,
): CalendarMonthRow[] {
  const firstWeekStart = startOfWeek(monthStart);
  const paddedCells = [...buildCalendarMonthCells(monthStart)];
  const remainder = paddedCells.length % 7;

  if (remainder) {
    paddedCells.push(
      ...Array.from({ length: 7 - remainder }, (_, index) => ({
        id: `tail-empty-${monthStart}-${index}`,
        date: null as string | null,
      })),
    );
  }

  return Array.from({ length: paddedCells.length / 7 }, (_, index) => {
    const cells = paddedCells.slice(index * 7, index * 7 + 7);
    const visibleDates = cells.flatMap((cell) => (cell.date ? [cell.date] : []));
    const weekStart = addDays(firstWeekStart, index * 7);
    const weekEnd = addDays(weekStart, 6);
    const weekEntries = visibleDates.flatMap((date) => sessionsByDate.get(date) ?? []);

    return {
      weekStart,
      weekEnd,
      cells,
      inMonthDays: visibleDates.length,
      snapshot: buildCalendarWeekSnapshot(weekEntries, athleteAnalysis, selectedDiscipline),
    };
  });
}

function weekHeading(startIsoDate: string, endIsoDate: string) {
  const start = parseDateValue(startIsoDate);
  const end = parseDateValue(endIsoDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `Semana de ${startIsoDate}`;
  }

  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    const month = start.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    return `${start.getDate()}-${end.getDate()} ${month}`;
  }

  if (sameYear) {
    return `${start.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} - ${end.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`;
  }

  return `${start.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })} - ${end.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`;
}

function startOfWeek(isoDate: string) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return isoDate;
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return formatDateKey(value);
}

function daysInMonth(isoDate: string) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return 30;
  return new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
}

function weekdayOffset(isoDate: string) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return 0;
  const day = value.getDay();
  return day === 0 ? 6 : day - 1;
}

function overlapsRange(start: string, end: string, rangeStart: string, rangeEnd: string) {
  return dateValue(start) <= dateValue(rangeEnd) && dateValue(end) >= dateValue(rangeStart);
}

function focusTone(direction?: string | null): PlanTone {
  if (direction === "up" || direction === "positive") return "positive";
  if (direction === "down" || direction === "negative") return "warning";
  return "neutral";
}

function objectiveFamily(value?: string | null) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("lt2") || normalized.includes("ftp") || normalized.includes("compet")) return "lt2";
  if (normalized.includes("vo2")) return "vo2";
  if (normalized.includes("técn") || normalized.includes("tecn")) return "technique";
  if (normalized.includes("recuper")) return "recovery";
  return "lt1";
}

function dayNameShort(isoDate: string) {
  const parsed = parseDateValue(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("es-ES", { weekday: "short" });
}

function monthDayLabel(isoDate: string) {
  const parsed = parseDateValue(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("es-ES", { day: "numeric" });
}

function compactPlanningSourceTitle(source: PlanningCalendarSource) {
  if (source.kind === "draft") {
    return `${source.objective} · ${disciplineLabel(source.discipline)}`;
  }
  return source.title;
}

function describePlanningSource(source: PlanningCalendarSource) {
  const details = [
    `Disciplina: ${disciplineLabel(source.discipline)}`,
    `Ventana: ${formatDate(source.startDate)} → ${formatDate(source.endDate)}`,
    source.phase ? `Fase: ${source.phase}` : null,
    source.energySystemFocus ? `Sistema dominante: ${source.energySystemFocus}` : null,
    source.density ? `Densidad: ${source.density}` : null,
  ].filter(Boolean) as string[];

  let summary = source.intent || "Sin intención operativa cargada.";
  if (source.kind === "historical") {
    summary = source.intent || "Mesociclo histórico detectado para reutilizar su lógica.";
  } else if (source.kind === "planned") {
    summary = source.intent || "Bloque real ya guardado para esta disciplina.";
  } else if (source.kind === "draft") {
    summary = source.intent || "Borrador vivo construido desde la plantilla, el objetivo y la disciplina activa.";
  }

  return {
    title: compactPlanningSourceTitle(source),
    summary,
    details,
  };
}

function mesocycleTemplateMatchesDiscipline(template: PlanningMesocycleTemplate, discipline: string) {
  return template.discipline === discipline || template.discipline === "all";
}

function resolveMesocycleTemplateForSource(
  source: PlanningCalendarSource,
  templates: PlanningMesocycleTemplate[],
) {
  if (source.templateId) {
    const byId = templates.find((template) => template.template_id === source.templateId);
    if (byId) return byId;
  }

  if (source.blockType) {
    return templates.find((template) => (
      template.block_type === source.blockType
      && mesocycleTemplateMatchesDiscipline(template, source.discipline)
    )) ?? null;
  }

  return null;
}

function buildWorkoutBlueprints(source: PlanningCalendarSource) {
  const family = objectiveFamily(source.objective || source.title);
  const density = source.density || "media";
  const highDensity = density === "alta";
  const mediumLong = density === "baja" ? "75-90'" : density === "alta" ? "105-120'" : "90-105'";

  if (source.discipline === "ciclismo") {
    if (family === "lt2") {
      return [
        { weekday: 2, sessionType: "clave", title: "LT2 sostenido", objective: "Elevar potencia estable cercana a umbral.", dose: "3 x 12-16' @ LT2", description: "Recuperación 4'. Mantén potencia y deriva de FC controladas.", confidence: "alta" as const },
        { weekday: 4, sessionType: "soporte", title: "Tempo controlado", objective: "Acumular trabajo subumbral sin fatiga excesiva.", dose: "2 x 20-30' entre LT1 alta y LT2 baja", description: "Sesión puente para sostener tiempo útil sin abrir demasiado la semana.", confidence: "media" as const },
        { weekday: 6, sessionType: "fondo", title: "Salida aeróbica con final vivo", objective: "Transferir el bloque al gesto prolongado.", dose: `${mediumLong} con 20' finales controlados`, description: "El final debe sentirse firme, no como test.", confidence: "media" as const },
      ];
    }
    if (family === "vo2") {
      return [
        { weekday: 2, sessionType: "clave", title: "VO2 corto", objective: "Abrir potencia aeróbica sin destruir la semana.", dose: "5-6 x 3' fuertes / 3' suaves", description: "Calidad alta, pero con volumen total acotado.", confidence: "alta" as const },
        { weekday: 4, sessionType: "soporte", title: "LT1 largo", objective: "Sostener base mientras el bloque es más agudo.", dose: "2 x 20-25' LT1", description: "No mezclar torque, VO2 y sprint el mismo día.", confidence: "media" as const },
        { weekday: 6, sessionType: "fondo", title: "Resistencia con cadencia", objective: "Dar continuidad sin cargar demasiado la glucólisis.", dose: `${mediumLong} con bloques de cadencia`, description: "Foco técnico y eficiencia de pedaleo.", confidence: "media" as const },
      ];
    }
    return [
      { weekday: 2, sessionType: "clave", title: "LT1 extensivo", objective: "Ampliar tiempo útil en zona estable.", dose: "3 x 20-25' LT1", description: "Controla lactato y evita irte a ritmo de competición.", confidence: "alta" as const },
      { weekday: 4, sessionType: "soporte", title: "Cadencia o torque", objective: "Ajustar el gesto dominante del bloque.", dose: "6-8 repeticiones técnicas", description: "Escoge cadencia o torque, no ambos si el atleta viene cargado.", confidence: "media" as const },
      { weekday: 6, sessionType: "fondo", title: "Fondo aeróbico", objective: "Consolidar durabilidad y economía.", dose: mediumLong, description: "Debe dejar sensación de control, no de vaciado.", confidence: "alta" as const },
    ];
  }

  if (source.discipline === "natación") {
    if (family === "lt2") {
      return [
        { weekday: 1, sessionType: "clave", title: "CSS sostenido", objective: "Fijar ritmo competitivo controlado.", dose: "3 x 600-800m CSS/LT2", description: "Recuperación corta con técnica estable.", confidence: "alta" as const },
        { weekday: 3, sessionType: "soporte", title: "Técnica + aeróbico", objective: "Sostener metros útiles con buena mecánica.", dose: "Serie técnica + 20-30' continuo", description: "No sacrificar brazada por densidad.", confidence: "media" as const },
        { weekday: 5, sessionType: "fondo", title: "Continuidad aeróbica", objective: "Construir volumen transferible al bloque.", dose: "45-70' acumulados", description: "Ritmo controlado y respiración estable.", confidence: "media" as const },
      ];
    }
    return [
      { weekday: 1, sessionType: "clave", title: "Aeróbico técnico", objective: "Elevar continuidad sin romper técnica.", dose: "4 x 400m controlados", description: "La calidad del apoyo manda sobre el reloj.", confidence: "alta" as const },
      { weekday: 3, sessionType: "soporte", title: "Educativos + pull", objective: "Refinar economía acuática.", dose: "30-45' técnica integrada", description: "Bloque de soporte, no test encubierto.", confidence: "media" as const },
      { weekday: 5, sessionType: "fondo", title: "Continuo progresivo", objective: "Extender metros útiles de forma conservadora.", dose: "1 bloque continuo o 2 bloques largos", description: "Termina con sensación de margen.", confidence: "media" as const },
    ];
  }

  if (family === "lt2") {
    return [
      { weekday: 2, sessionType: "clave", title: "LT2 específico", objective: "Sostener ritmo próximo al objetivo sin deriva excesiva.", dose: "4-5 x 6-8' @ LT2", description: "Recuperación 2'. Ritmo sólido, no final en vacío.", confidence: "alta" as const },
      { weekday: 4, sessionType: "soporte", title: "Tempo subumbral", objective: "Acumular minutos útiles y estabilidad interna.", dose: "20-30' continuos o 2 x 15'", description: "Sesión de control para que la semana no quede solo en un pico.", confidence: "media" as const },
      { weekday: 6, sessionType: "fondo", title: "Tirada con final progresivo", objective: "Transferir el bloque a durabilidad específica.", dose: mediumLong, description: "Últimos 15-20' algo más vivos, sin convertirlo en competición.", confidence: "media" as const },
    ];
  }
  if (family === "vo2") {
    return [
      { weekday: 2, sessionType: "clave", title: "VO2 controlado", objective: "Elevar techo aeróbico con volumen acotado.", dose: highDensity ? "6 x 3'" : "5 x 3'", description: "La semana necesita espacio para absorberlo.", confidence: "alta" as const },
      { weekday: 4, sessionType: "soporte", title: "Rodaje LT1", objective: "Mantener base mientras el estímulo principal es más agudo.", dose: "35-50' LT1", description: "Debe sentirse estable y comparable.", confidence: "media" as const },
      { weekday: 6, sessionType: "fondo", title: "Tirada aeróbica", objective: "No perder economía ni continuidad.", dose: mediumLong, description: "Sin final intenso si el martes dejó fatiga real.", confidence: "media" as const },
    ];
  }
  if (family === "recovery") {
    return [
      { weekday: 2, sessionType: "clave", title: "Activación ligera", objective: "Mover sin arrastrar fatiga.", dose: "30-40' suaves + 4 progresivos", description: "La sesión existe para recuperar, no para sumar carga.", confidence: "alta" as const },
      { weekday: 4, sessionType: "soporte", title: "Rodaje fácil", objective: "Mantener gesto y sensaciones.", dose: "35-50' muy controlados", description: "Si la señal fisiológica no limpia, se recorta.", confidence: "alta" as const },
      { weekday: 6, sessionType: "fondo", title: "Continuidad suave", objective: "Cerrar semana con margen.", dose: "50-70' suaves", description: "Sin estímulo duro oculto.", confidence: "media" as const },
    ];
  }
  return [
    { weekday: 2, sessionType: "clave", title: "LT1 extensivo", objective: "Ampliar base útil y estabilidad subumbral.", dose: "3 x 10-15' LT1", description: "Debe permitir leer mejor el lactato a igual carga al final del bloque.", confidence: "alta" as const },
    { weekday: 4, sessionType: "soporte", title: "Economía y técnica", objective: "Apoyar el bloque sin distorsionar la señal fisiológica.", dose: "40-50' suaves + técnica", description: "Trabajo de soporte para que el martes tenga traducción real.", confidence: "media" as const },
    { weekday: 6, sessionType: "fondo", title: "Tirada aeróbica", objective: "Construir durabilidad y control interno.", dose: mediumLong, description: "Carga sostenida con margen claro.", confidence: "alta" as const },
  ];
}

function buildSyntheticCalendarSessions(source: PlanningCalendarSource) {
  const blueprints = buildWorkoutBlueprints(source);
  const start = startOfWeek(source.startDate);
  const end = source.endDate;
  const sessions: CalendarSession[] = [];
  let currentWeek = start;
  let weekIndex = 0;
  while (dateValue(currentWeek) <= dateValue(end) && weekIndex < 8) {
    blueprints.forEach((blueprint, blueprintIndex) => {
      const sessionDate = addDays(currentWeek, blueprint.weekday - 1);
      if (dateValue(sessionDate) < dateValue(source.startDate) || dateValue(sessionDate) > dateValue(end)) return;
      const weekTone = weekIndex === 0 ? "arranque" : dateValue(addDays(currentWeek, 13)) > dateValue(end) ? "cierre" : "construcción";
      sessions.push({
        id: `${source.id}-${sessionDate}-${blueprintIndex}`,
        date: sessionDate,
        discipline: source.discipline,
        title: blueprint.title,
        sessionType: blueprint.sessionType,
        objective: blueprint.objective,
        description: `${blueprint.description} Semana de ${weekTone} del bloque ${source.objective.toLowerCase()}.`,
        dose: blueprint.dose,
        confidence: blueprint.confidence,
        estimatedMinutes: estimateMinutesFromDose(blueprint.dose),
      });
    });
    currentWeek = addDays(currentWeek, 7);
    weekIndex += 1;
  }
  return sessions.sort((a, b) => dateValue(a.date) - dateValue(b.date));
}

function buildPersistedCalendarSessions(source: PlanningCalendarSource, plannedSessions: PlanningPlannedSession[]) {
  if (source.kind !== "planned" || !source.focusBlockId) return null;
  const selected = plannedSessions
    .filter((session) => session.focus_block_id === source.focusBlockId)
    .map<CalendarSession>((session) => ({
      id: `planned-session-${session.id}`,
      date: session.scheduled_date,
      discipline: session.discipline,
      title: session.public_label,
      sessionType: session.session_role,
      objective: session.objective,
      description: [session.coach_note, session.expected_signal].filter(Boolean).join(" "),
      dose: session.dose_prescription,
      confidence: session.confidence >= 0.85 ? "alta" : "media",
      estimatedMinutes: typeof session.payload?.total_duration_min === "number"
        ? Number(session.payload.total_duration_min)
        : estimateMinutesFromDose(session.dose_prescription),
      rawId: session.id,
      blaCheck: session.bla_check,
      publishStatus: session.publish_status,
      publishError: session.publish_error,
    }));

  return selected.length ? selected.sort((a, b) => dateValue(a.date) - dateValue(b.date)) : null;
}

function findWorkoutDoseStep(template: PlanningWorkoutTemplate, doseLabel?: string | null, doseStepIndex?: number | null) {
  if (!template.dose_ladder.length) return null;
  if (doseLabel) {
    const byLabel = template.dose_ladder.find((step) => step.label === doseLabel);
    if (byLabel) return byLabel;
  }
  if (doseStepIndex != null) {
    return template.dose_ladder.find((step) => step.step === doseStepIndex || step.step === doseStepIndex + 1) ?? null;
  }
  return null;
}

function resolveWorkoutTemplate(
  workoutLibrary: PlanningWorkoutTemplate[],
  options: {
    templateId?: string | null;
    family?: string | null;
    label?: string | null;
  },
) {
  return workoutLibrary.find((template) => template.template_id === options.templateId)
    ?? workoutLibrary.find((template) => template.session_family === options.family)
    ?? workoutLibrary.find((template) => template.public_label === options.label)
    ?? null;
}

function buildDraftWorkoutPreviewSelection(
  template: PlanningWorkoutTemplate,
  session: PlanningMesocycleDraftSession,
): WorkoutPreviewSelection {
  const doseStepIndex = session.payload?.dose_step_index as number | null | undefined;
  const doseLabel = session.dose_prescription || template.csv_examples[0] || template.public_label;
  const step = findWorkoutDoseStep(template, session.dose_prescription, doseStepIndex);

  return {
    source: "planning",
    templateId: template.template_id,
    label: doseLabel,
    notes: session.progression_note || session.coach_note || session.expected_signal || template.dose_guidance,
    totalDurationMin: step?.total_duration_min,
    usefulDurationMin: step?.total_useful_time_min,
    restMin: step?.rest_min,
    intensityZone: step?.intensity_zone,
    readiness: step?.readiness_required ?? (template.fatigue_cost >= 4 ? "fresh" : template.fatigue_cost >= 3 ? "medium" : "any"),
  };
}

function buildPlannedWorkoutPreviewSelection(
  template: PlanningWorkoutTemplate,
  session: PlanningPlannedSession,
): WorkoutPreviewSelection {
  const doseStepIndex = session.payload?.dose_step_index as number | null | undefined;
  const step = findWorkoutDoseStep(template, session.dose_prescription, doseStepIndex);

  return {
    source: "planning",
    templateId: template.template_id,
    plannedSessionId: session.id,
    label: session.dose_prescription || template.csv_examples[0] || template.public_label,
    notes: session.progression_note || session.coach_note || session.expected_signal || template.dose_guidance,
    totalDurationMin: step?.total_duration_min,
    usefulDurationMin: step?.total_useful_time_min,
    restMin: step?.rest_min,
    intensityZone: step?.intensity_zone,
    readiness: step?.readiness_required ?? (template.fatigue_cost >= 4 ? "fresh" : template.fatigue_cost >= 3 ? "medium" : "any"),
  };
}

function syntheticWarmupTemplate(discipline: string) {
  if (discipline === "ciclismo") return "12-15' progresivos + 3 activaciones de cadencia.";
  if (discipline === "natación") return "Entrada progresiva + técnica básica antes del bloque principal.";
  return "12-15' suaves + movilidad dinámica + 4 activaciones cortas.";
}

function syntheticCooldownTemplate(discipline: string) {
  if (discipline === "ciclismo") return "8-10' muy suaves soltando cadencia.";
  if (discipline === "natación") return "200-400m suaves para soltar.";
  return "8-10' trote muy suave para salir limpio.";
}

function syntheticSessionZone(session: CalendarEntry) {
  const family = objectiveFamily(`${session.sessionType} ${session.objective} ${session.title}`);
  if (family === "lt2") return "LT2";
  if (family === "vo2") return "VO2";
  if (family === "technique") return "Técnica";
  if (family === "recovery") return "Recuperación";
  return "LT1";
}

function buildSyntheticCalendarWorkoutPreview(
  session: CalendarEntry,
  source: PlanningCalendarSource,
  lt1: ReturnType<typeof resolveTrainingThreshold>,
  lt2: ReturnType<typeof resolveTrainingThreshold>,
  thresholdBasis: string,
): OpenWorkoutPreviewState {
  const discipline = session.layerDiscipline || session.discipline;
  const warmupMin = session.sessionType === "clave" ? 18 : session.sessionType === "fondo" ? 12 : 10;
  const cooldownMin = session.sessionType === "clave" ? 10 : 8;
  const totalDurationMin = session.estimatedMinutes ?? (estimateMinutesFromDose(session.dose) || undefined);
  const usefulDurationMin = totalDurationMin ? Math.max(10, totalDurationMin - warmupMin - cooldownMin) : undefined;
  const family = objectiveFamily(`${session.sessionType} ${session.objective} ${session.title}`);
  const fatigueCost = session.sessionType === "clave" ? 4 : session.sessionType === "fondo" ? 3 : family === "recovery" ? 1 : 2;
  const templateId = `calendar-preview-${session.id}`;

  return {
    template: {
      template_id: templateId,
      discipline,
      compatible_block_types: [],
      session_role: session.sessionType,
      session_family: family,
      public_label: session.title,
      summary: session.description || session.objective,
      objective: session.objective,
      dose_guidance: session.description || "Sesión editable desde calendario, sin automatismos sobre la semana.",
      progression_axes: [source.objective],
      control_points: [
        "Mantener la intención fisiológica del bloque sin forzar la deriva.",
        "Revisar sensaciones y calidad mecánica al terminar.",
      ],
      expected_adaptations: [session.objective],
      cautions: [
        "No convertir la sesión en test si no estaba previsto.",
        "Ajusta manualmente si el atleta llega sin margen de recuperación.",
      ],
      confidence: session.confidence === "alta" ? 0.9 : 0.76,
      evidence: [],
      variants: [],
      builder_variables: [],
      csv_examples: [session.dose],
      fatigue_cost: fatigueCost,
      calentamiento_min: warmupMin,
      calentamiento_template: syntheticWarmupTemplate(discipline),
      enfriamiento_min: cooldownMin,
      enfriamiento_template: syntheticCooldownTemplate(discipline),
      coach_tips: [
        source.intent || "Usa esta sesión como referencia operativa del bloque actual.",
        session.description || "Mantén el criterio del entrenador por encima de cualquier sugerencia.",
      ],
      dose_ladder: [],
    },
    selection: {
      source: "planning",
      templateId,
      plannedSessionId: session.rawId,
      label: session.dose || session.title,
      notes: session.description,
      prescriptionHint: buildPlanningPrescriptionHint(session.objective, session.title, discipline, lt1, lt2),
      thresholdBasis,
      totalDurationMin,
      usefulDurationMin,
      intensityZone: syntheticSessionZone(session),
      readiness: fatigueCost >= 4 ? "fresh" : fatigueCost >= 3 ? "medium" : "any",
    },
  };
}

function buildLibraryWorkoutPreview(
  template: PlanningWorkoutTemplate,
  lt1: ReturnType<typeof resolveTrainingThreshold>,
  lt2: ReturnType<typeof resolveTrainingThreshold>,
  thresholdBasis: string,
): OpenWorkoutPreviewState {
  const firstStep = template.dose_ladder[0] ?? null;
  const fallbackLabel = template.csv_examples[0] || template.public_label;

  return {
    template,
    selection: {
      source: "planning",
      templateId: template.template_id,
      label: firstStep?.label || fallbackLabel,
      notes: template.dose_guidance || template.summary,
      totalDurationMin: firstStep?.total_duration_min,
      usefulDurationMin: firstStep?.total_useful_time_min,
      restMin: firstStep?.rest_min,
      intensityZone: firstStep?.intensity_zone,
      readiness: firstStep?.readiness_required ?? (template.fatigue_cost >= 4 ? "fresh" : template.fatigue_cost >= 3 ? "medium" : "any"),
      prescriptionHint: buildPlanningPrescriptionHint(template.objective, template.public_label, template.discipline, lt1, lt2),
      thresholdBasis,
    },
  };
}

function workoutLayerForTemplate(template: PlanningWorkoutTemplate): WorkoutLibraryLayer {
  const family = template.session_family.toLowerCase();
  const objective = template.objective.toLowerCase();
  const zone = (template.dose_ladder[0]?.intensity_zone || "").toLowerCase();
  const combined = `${family} ${objective} ${zone}`;

  if (combined.includes("recovery") || combined.includes("regener") || combined.includes("lt0") || combined.includes("rest")) return "recovery";
  if (combined.includes("specific") || combined.includes("race pace") || combined.includes("compet") || combined.includes("brick") || combined.includes("css")) return "specific";
  if (combined.includes("strength") || combined.includes("torque") || combined.includes("fuerza")) return "strength";
  if (combined.includes("tech") || combined.includes("técn") || combined.includes("economy") || combined.includes("cadence") || combined.includes("aero_stability")) return "technique";
  if (combined.includes("vo2")) return "vo2";
  if (combined.includes("lt2") || combined.includes("threshold") || combined.includes("umbral")) return "lt2";
  if (combined.includes("subthreshold") || combined.includes("sub-t") || combined.includes("e2") || combined.includes("lt1→lt2") || combined.includes("lt1->lt2")) return "subthreshold";
  if (combined.includes("lt1")) return "lt1";
  if (combined.includes("base") || combined.includes("endur") || combined.includes("aerób") || combined.includes("aerob") || combined.includes("durability")) return "base";
  return "other";
}

function workoutLayerLabel(layer: WorkoutLibraryLayer) {
  if (layer === "base") return "Base";
  if (layer === "lt1") return "LT1";
  if (layer === "subthreshold") return "Subumbral";
  if (layer === "lt2") return "LT2";
  if (layer === "vo2") return "VO2";
  if (layer === "technique") return "Técnica";
  if (layer === "strength") return "Fuerza";
  if (layer === "specific") return "Específico";
  if (layer === "recovery") return "Recuperación";
  if (layer === "other") return "Otros";
  return "Otros";
}

function workoutLayerTone(layer: WorkoutLibraryLayer) {
  if (layer === "recovery") return "recovery";
  if (layer === "base") return "aerobic";
  if (layer === "lt1") return "lt1";
  if (layer === "subthreshold") return "subthreshold";
  if (layer === "lt2") return "lt2";
  if (layer === "vo2") return "vo2";
  if (layer === "technique") return "technical";
  if (layer === "specific") return "specific";
  if (layer === "strength") return "strength";
  return "other";
}

function workoutLayerCue(layer: WorkoutLibraryLayer) {
  if (layer === "recovery") return "Carga baja y control fino de la fatiga residual.";
  if (layer === "base") return "Volumen útil para consolidar oxidación y estabilidad.";
  if (layer === "lt1") return "Trabajo extensivo cerca del primer umbral.";
  if (layer === "subthreshold") return "Transición metabólica con densidad controlada.";
  if (layer === "lt2") return "Minutos de calidad alrededor del máximo estado estable.";
  if (layer === "vo2") return "Bloques intensos para techo aeróbico y potencia.";
  if (layer === "technique") return "Eficiencia mecánica con fatiga contenida.";
  if (layer === "specific") return "Sesiones cercanas a la demanda competitiva.";
  if (layer === "strength") return "Soporte estructural y transferencia al gesto.";
  return "Sesiones complementarias fuera de las familias principales.";
}

function workoutLayerGlyph(layer: WorkoutLibraryLayer) {
  if (layer === "recovery") return "RC";
  if (layer === "base") return "BA";
  if (layer === "lt1") return "LT1";
  if (layer === "subthreshold") return "ST";
  if (layer === "lt2") return "LT2";
  if (layer === "vo2") return "VO2";
  if (layer === "technique") return "TEC";
  if (layer === "specific") return "ESP";
  if (layer === "strength") return "FZ";
  return "OT";
}

function phaseOptionsForRecommendation(blockType?: string | null) {
  if (blockType === "competition_specific_block") return ["específico", "competición", "taper"];
  if (blockType === "recovery_consolidation_block") return ["descarga", "transición"];
  if (blockType === "technical_rebuild_block") return ["técnica", "base"];
  return ["base", "build", "específico"];
}

function defaultPhaseForRecommendation(blockType?: string | null) {
  if (blockType === "competition_specific_block") return "específico";
  if (blockType === "recovery_consolidation_block") return "descarga";
  if (blockType === "technical_rebuild_block") return "técnica";
  if (blockType === "aerobic_power_block") return "build";
  return "base";
}

function energySystemFocusForRecommendation(blockType?: string | null, primaryFocus?: string | null) {
  if (blockType === "aerobic_capacity_block") return "Aerobic Capacity";
  if (blockType === "threshold_development_block") return "Aerobic Power";
  if (blockType === "anaerobic_capacity_block") return "Anaerobic Capacity";
  if (blockType === "aerobic_power_block") return "Aerobic Power";
  if (blockType === "anaerobic_power_block") return "Anaerobic Power";
  if (blockType === "competition_specific_block") return "Specific Performance";
  if (blockType === "technical_rebuild_block") return "Technique";
  if (blockType === "recovery_consolidation_block") return "Recovery";
  return primaryFocus || "Aerobic Capacity";
}

function objectiveOptionsForDiscipline(discipline: string) {
  if (discipline === "ciclismo") {
    return ["LT1", "LT2", "VO2", "Cadencia", "FTP", "Recuperación"];
  }
  if (discipline === "natación") {
    return ["Técnica", "Aeróbico", "LT1", "LT2", "Recuperación"];
  }
  return ["LT1", "LT2", "VO2", "Economía", "Competición", "Recuperación"];
}

function weaknessOptionsForDiscipline(discipline: string) {
  if (discipline === "ciclismo") {
    return ["Base aeróbica", "Cadencia", "Torque", "FTP/LT2", "VO2", "Durabilidad", "Recuperación"];
  }
  if (discipline === "natación") {
    return ["Técnica", "Continuidad aeróbica", "CSS/LT2", "Economía acuática", "Fuerza específica", "Recuperación"];
  }
  return ["Base aeróbica", "Economía", "LT1", "LT2", "VO2", "Durabilidad", "Recuperación"];
}

function objectiveFromTemplate(template: PlanningMesocycleTemplate | null, discipline: string) {
  if (!template) return objectiveOptionsForDiscipline(discipline)[0] ?? "LT1";
  if (template.block_type === "recovery_consolidation_block") return "Recuperación";
  if (template.block_type === "technical_rebuild_block") return "Técnica";
  if (template.block_type === "aerobic_power_block") return "VO2";
  if (template.block_type === "competition_specific_block") return discipline === "ciclismo" ? "FTP" : "Competición";
  if (template.block_type === "threshold_development_block") return "LT2";
  return discipline === "natación" ? "Aeróbico" : "LT1";
}

function structureHelpText(structure: string) {
  if (structure === "1+1") return "1 semana de carga y 1 de descarga o consolidación.";
  if (structure === "2+1") return "2 semanas de carga y 1 semana final de descarga o asimilación.";
  if (structure === "3+1") return "3 semanas de carga y 1 semana de descarga.";
  if (structure === "1+1 o 2+1") return "Bloque corto: puede funcionar como 1 semana de carga + 1 de descarga, o 2 de carga + 1 de descarga.";
  if (structure === "2+1 o 3+1") return "Según nivel y fatiga: 2 o 3 semanas de carga antes de descargar.";
  if (structure === "2+1 o taper corto") return "2 semanas de trabajo y luego descarga corta/puesta a punto.";
  if (structure === "1 semana o microfase") return "No es un bloque largo: es una fase breve de descarga o consolidación.";
  return "Relación entre semanas de carga y semanas de descarga dentro del mesociclo.";
}

function durationInterpretation(template: PlanningMesocycleTemplate | null, requestedWeeks: number) {
  if (!template) return null;
  if (requestedWeeks < template.typical_duration_weeks_min) {
    return {
      tone: "warning" as PlanTone,
      title: "Bloque más corto de lo habitual",
      body: `Esta plantilla suele funcionar mejor en ${template.typical_duration_weeks_min}-${template.typical_duration_weeks_max} semanas. Si la acortas, úsala como microfase o bloque puente, no como lectura completa del mesociclo.`,
    };
  }
  if (requestedWeeks > template.typical_duration_weeks_max) {
    return {
      tone: "warning" as PlanTone,
      title: "Conviene partirlo en dos fases",
      body: `Has pedido ${requestedWeeks} semanas para una plantilla pensada para ${template.typical_duration_weeks_min}-${template.typical_duration_weeks_max}. El sistema no debería estirar sin más el mismo bloque: lo sólido es encadenar dos subfases con relectura intermedia.`,
    };
  }
  return {
    tone: "positive" as PlanTone,
    title: "Duración coherente con la plantilla",
    body: `La duración elegida encaja con el rango habitual (${template.typical_duration_weeks_min}-${template.typical_duration_weeks_max} semanas).`,
  };
}

function isDecisionPointDetectedBlock(block: {
  testing_weeks: number;
  session_count: number;
  weeks_count: number;
}) {
  return block.testing_weeks > 0 && block.session_count <= 2 && block.weeks_count <= 2;
}

function detectedBlockTitle(block: {
  block_label: string;
  testing_weeks: number;
  session_count: number;
  weeks_count: number;
}) {
  if (isDecisionPointDetectedBlock(block)) return `${block.block_label} · contexto de test`;
  return block.block_label;
}

function buildMicrocycle(weeks: number, discipline: string, objective: string, density: string): MicrocycleWeek[] {
  const toneByWeek: PlanTone[] = ["positive", "positive", "warning", "neutral"];
  const loadByWeek = density === "alta"
    ? ["Acumulación sostenida", "Pico controlado", "Estabilizar", "Descarga activa"]
    : density === "baja"
      ? ["Introducción", "Asimilación", "Consolidación", "Descarga activa"]
      : ["Construcción", "Construcción", "Afinar", "Descarga activa"];
  const notesByDiscipline =
    discipline === "ciclismo"
      ? [
          "Bloque principal en potencia controlada y una sesión técnica de cadencia.",
          "Sube tiempo útil o densidad, no ambas a la vez.",
          "Semana de contraste con un estímulo más exigente y una tirada sólida.",
          "Reduce carga y confirma que el lactato vuelve a caer con el mismo gesto.",
        ]
      : discipline === "natación"
        ? [
            "Más metros útiles a intensidad controlada y foco técnico.",
            "Mantén continuidad y controla la fatiga global del triatleta.",
            "Semana de transferencia sin perder economía de brazada.",
            "Recupera sensaciones y limpia la fatiga antes del siguiente bloque.",
          ]
        : [
            "Base del ciclo con un día clave y otro de soporte aeróbico.",
            "Extiende minutos de trabajo o repeticiones comparables.",
            "Semana específica con estímulo más fino sobre el objetivo.",
            "Afloja para absorber el bloque y llegar con lectura fisiológica limpia.",
          ];

  return Array.from({ length: weeks }, (_, index) => ({
    title: `Semana ${index + 1}`,
    load: loadByWeek[index] ?? "Construcción",
    emphasis: `${objective} · ${disciplineLabel(discipline)}`,
    notes: notesByDiscipline[index] ?? "Semana de mantenimiento bajo criterio del entrenador.",
    tone: toneByWeek[index] ?? "neutral",
  }));
}

const BLOCK_LABELS: Record<string, string> = {
  aerobic_capacity_block: "Capacidad aeróbica",
  threshold_development_block: "Desarrollo de umbral",
  anaerobic_capacity_block: "Cap. Anaeróbica",
  aerobic_power_block: "Potencia aeróbica",
  anaerobic_power_block: "Potencia Anaeróbica",
  competition_specific_block: "Especificidad competitiva",
  recovery_consolidation_block: "Consolidación / recuperación",
  technical_rebuild_block: "Reconstrucción técnica",
};

const SESSION_ROLE_LABEL: Record<string, string> = {
  key: "principal",
  support: "soporte",
  recovery: "recuperación",
  test: "test",
};

export function PlanningPage({ token }: PlanningPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const athleteId = searchParams.get("athleteId");
  const searchDiscipline = searchParams.get("discipline") ?? "running";
  const calendarPanelOpen = searchParams.get("panel") === "calendar";
  const calendarWorkspaceTab = parseCalendarWorkspaceTab(searchParams.get("view"));

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [overview, setOverview] = useState<PlanningOverview | null>(null);
  const [athleteAnalysis, setAthleteAnalysis] = useState<AthleteAnalysis | null>(null);
  const [rosterAnalyses, setRosterAnalyses] = useState<Record<number, AthleteAnalysis | null>>({});
  const [rosterAnalysesLoading, setRosterAnalysesLoading] = useState(false);
  const [disciplineOverviews, setDisciplineOverviews] = useState<Record<string, PlanningOverview>>({});
  const [loading, setLoading] = useState(Boolean(athleteId));
  const [error, setError] = useState<string | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState(searchDiscipline);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [blockObjective, setBlockObjective] = useState("LT1");
  const [primaryWeakness, setPrimaryWeakness] = useState("Base aeróbica");
  const [secondaryWeakness, setSecondaryWeakness] = useState("LT1");
  const [weeks, setWeeks] = useState("4");
  const [density, setDensity] = useState("media");
  const [priority, setPriority] = useState("controlado");
  const [blockStartDate, setBlockStartDate] = useState(() => isoDateFromToday());
  const [blockPhase, setBlockPhase] = useState("base");
  const [blockIntent, setBlockIntent] = useState("");
  const [coachNotes, setCoachNotes] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingBlockId, setDeletingBlockId] = useState<number | null>(null);
  const [ribbonExpanded, setRibbonExpanded] = useState(false);
  const [calendarVisualMode, setCalendarVisualMode] = useState<"month" | "week">("month");
  const [selectedLibrarySourceId, setSelectedLibrarySourceId] = useState<string>("");
  const [selectedCalendarSourceId, setSelectedCalendarSourceId] = useState<string>("");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(isoDateFromToday()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [enabledOverlayDisciplines, setEnabledOverlayDisciplines] = useState<string[]>([]);
  const [workoutLibrary, setWorkoutLibrary] = useState<PlanningWorkoutTemplate[]>([]);
  const [quickAddLibraries, setQuickAddLibraries] = useState<Record<string, PlanningWorkoutTemplate[]>>({});
  const [openWorkoutPreview, setOpenWorkoutPreview] = useState<OpenWorkoutPreviewState | null>(null);
  const [showPlannedSessionRawInformation, setShowPlannedSessionRawInformation] = useState(false);
  const [plannedSessionStructuredPreview, setPlannedSessionStructuredPreview] = useState<WorkoutDefinition | null>(null);
  const [plannedSessionStructuredPreviewLoading, setPlannedSessionStructuredPreviewLoading] = useState(false);
  const [plannedSessionStructuredPreviewError, setPlannedSessionStructuredPreviewError] = useState<string | null>(null);
  const [plannedSessionRegeneratingId, setPlannedSessionRegeneratingId] = useState<number | null>(null);
  const [planningSourceModal, setPlanningSourceModal] = useState<PlanningSourceModalState | null>(null);
  const [calendarComposerDate, setCalendarComposerDate] = useState<string | null>(null);
  const [calendarQuickAdd, setCalendarQuickAdd] = useState<CalendarQuickAddState | null>(null);
  const calendarWeekScrollerRef = useRef<HTMLDivElement | null>(null);
  const calendarWeekScrollFrameRef = useRef<number | null>(null);
  const calendarWeekAutoCenteredRef = useRef(false);
  const calendarWeekSectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const calendarMonthScrollerRef = useRef<HTMLDivElement | null>(null);
  const calendarMonthScrollFrameRef = useRef<number | null>(null);
  const calendarMonthAutoCenteredRef = useRef(false);
  const calendarMonthSectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadAthletes() {
      try {
        const result = (await api.athletes(token)) as Athlete[];
        if (!cancelled) {
          setAthletes(result);
        }
      } catch {
        if (!cancelled) {
          setAthletes([]);
        }
      }
    }
    loadAthletes();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const updatePlanningRoute = useCallback(
    (nextAthleteId: string, nextDiscipline: string) => {
      const athlete = athletes.find((item) => String(item.id) === nextAthleteId);
      const params = new URLSearchParams(searchParams);
      params.set("athleteId", nextAthleteId);
      params.set("discipline", nextDiscipline);
      if (athlete) {
        params.set("athleteName", athlete.name);
      }
      setSearchParams(params);
    },
    [athletes, searchParams, setSearchParams],
  );

  const openCalendarPanel = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.set("panel", "calendar");
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const openCalendarWorkspaceTab = useCallback((tab: CalendarWorkspaceTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("panel", "calendar");
    params.set("view", tab);
    setSearchParams(params);
    if (tab !== "calendar") {
      setCalendarComposerDate(null);
      setCalendarQuickAdd(null);
    }
  }, [searchParams, setSearchParams]);

  const closeCalendarPanel = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("panel");
    params.delete("view");
    setCalendarQuickAdd(null);
    setCalendarComposerDate(null);
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (athleteId || !athletes.length) return;
    const firstAthlete = athletes[0];
    const initialDiscipline = firstAthlete.primary_discipline === "triatlón" ? "running" : firstAthlete.primary_discipline ?? "running";
    updatePlanningRoute(String(firstAthlete.id), initialDiscipline);
  }, [athleteId, athletes, updatePlanningRoute]);

  async function loadPlanningContext(currentAthleteId: string, currentDiscipline: string) {
    setLoading(true);
    setError(null);
    try {
      const result = (await api.planningOverview(token, currentAthleteId, currentDiscipline)) as PlanningOverview;
      setOverview(result);
      setDisciplineOverviews((current) => ({ ...current, [currentDiscipline]: result }));
    } catch (loadError) {
      setOverview(null);
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la planificación.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedDiscipline(searchDiscipline);
  }, [searchDiscipline]);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalysis() {
      if (!athleteId) {
        setAthleteAnalysis(null);
        return;
      }
      try {
        const result = (await api.athleteAnalysis(token, athleteId)) as AthleteAnalysis;
        if (!cancelled) {
          setAthleteAnalysis(result);
        }
      } catch {
        if (!cancelled) {
          setAthleteAnalysis(null);
        }
      }
    }

    loadAnalysis();
    return () => {
      cancelled = true;
    };
  }, [athleteId, token]);

  useEffect(() => {
    let cancelled = false;

    async function loadRosterAnalyses() {
      if (!calendarPanelOpen || calendarWorkspaceTab !== "summary" || !athletes.length) return;
      const missingAthletes = athletes.filter((athlete) => rosterAnalyses[athlete.id] === undefined);
      if (!missingAthletes.length) return;
      setRosterAnalysesLoading(true);
      try {
        const results = await Promise.allSettled(
          missingAthletes.map(async (athlete) => [athlete.id, (await api.athleteAnalysis(token, athlete.id)) as AthleteAnalysis] as const),
        );
        if (!cancelled) {
          setRosterAnalyses((current) => {
            const next = { ...current };
            results.forEach((result, index) => {
              const athlete = missingAthletes[index];
              next[athlete.id] = result.status === "fulfilled" ? result.value[1] : null;
            });
            return next;
          });
        }
      } finally {
        if (!cancelled) {
          setRosterAnalysesLoading(false);
        }
      }
    }

    loadRosterAnalyses();
    return () => {
      cancelled = true;
    };
  }, [athletes, calendarPanelOpen, calendarWorkspaceTab, rosterAnalyses, token]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!athleteId) {
        setOverview(null);
        setLoading(false);
        return;
      }
      try {
        const result = (await api.planningOverview(token, athleteId, selectedDiscipline)) as PlanningOverview;
        if (!cancelled) {
          setOverview(result);
          setDisciplineOverviews((current) => ({ ...current, [selectedDiscipline]: result }));
        }
      } catch (loadError) {
        if (!cancelled) {
          setOverview(null);
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la planificación.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [athleteId, token, selectedDiscipline]);

  const availableDisciplines = useMemo(() => {
    if (overview?.athlete_primary_discipline === "triatlón") {
      return ["natación", "ciclismo", "running"];
    }
    if (overview?.athlete_primary_discipline) {
      return [overview.athlete_primary_discipline];
    }
    return [searchDiscipline];
  }, [overview?.athlete_primary_discipline, searchDiscipline]);

  useEffect(() => {
    const overlayOptions = availableDisciplines.filter((discipline) => discipline !== selectedDiscipline);
    setEnabledOverlayDisciplines((current) => current.filter((discipline) => overlayOptions.includes(discipline)));
  }, [availableDisciplines, selectedDiscipline]);

  useEffect(() => {
    let cancelled = false;

    async function loadOverlayDisciplines() {
      if (!athleteId || availableDisciplines.length <= 1) return;
      const missingDisciplines = availableDisciplines.filter((discipline) => !disciplineOverviews[discipline]);
      if (!missingDisciplines.length) return;
      try {
        const results = await Promise.all(
          missingDisciplines.map(async (discipline) => (
            [discipline, (await api.planningOverview(token, athleteId, discipline)) as PlanningOverview] as const
          )),
        );
        if (!cancelled) {
          setDisciplineOverviews((current) => {
            const next = { ...current };
            results.forEach(([discipline, result]) => {
              next[discipline] = result;
            });
            return next;
          });
        }
      } catch {
        if (!cancelled) {
          return;
        }
      }
    }

    loadOverlayDisciplines();
    return () => {
      cancelled = true;
    };
  }, [athleteId, availableDisciplines, disciplineOverviews, token]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkoutLibrary() {
      try {
        const result = (await api.generalPlanningWorkoutLibrary(token, selectedDiscipline)) as PlanningWorkoutTemplate[];
        if (!cancelled) setWorkoutLibrary(result);
      } catch {
        if (!cancelled) setWorkoutLibrary([]);
      }
    }

    loadWorkoutLibrary();
    setOpenWorkoutPreview(null);

    return () => {
      cancelled = true;
    };
  }, [selectedDiscipline, token]);

  useEffect(() => {
    let cancelled = false;

    async function loadQuickAddLibraries() {
      const disciplines: Array<"running" | "ciclismo" | "natación"> = ["running", "ciclismo", "natación"];
      try {
        const results = await Promise.all(
          disciplines.map(async (discipline) => (
            [discipline, (await api.generalPlanningWorkoutLibrary(token, discipline)) as PlanningWorkoutTemplate[]] as const
          )),
        );
        if (!cancelled) {
          setQuickAddLibraries(Object.fromEntries(results));
        }
      } catch {
        if (!cancelled) {
          setQuickAddLibraries({});
        }
      }
    }

    loadQuickAddLibraries();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const templateLibrary = overview?.template_library ?? [];
  const selectedTemplate = useMemo(
    () => templateLibrary.find((template) => template.template_id === selectedTemplateId) ?? templateLibrary[0] ?? null,
    [selectedTemplateId, templateLibrary],
  );
  const plannedBlocksById = useMemo(
    () => new Map((overview?.planned_blocks ?? []).map((block) => [String(block.id), block])),
    [overview?.planned_blocks],
  );
  const detectedMesocyclesById = useMemo(
    () => new Map((overview?.detected_mesocycles ?? []).map((block) => [`historical-${block.start_date}-${block.block_type}`, block])),
    [overview?.detected_mesocycles],
  );
  const quickAddDiscipline = calendarQuickAdd?.selectedDiscipline ?? "running";
  const quickAddDisciplineLibrary = useMemo(() => {
    const recommendedIds = new Set(
      (overview?.recommended_workouts ?? [])
        .filter((template) => template.discipline === quickAddDiscipline)
        .map((template) => template.template_id),
    );
    const library = quickAddLibraries[quickAddDiscipline] ?? [];
    return [...library].sort((left, right) => Number(recommendedIds.has(right.template_id)) - Number(recommendedIds.has(left.template_id)));
  }, [calendarQuickAdd?.selectedDiscipline, overview?.recommended_workouts, quickAddDiscipline, quickAddLibraries]);
  const quickAddAvailableLayers = useMemo(() => {
    const present = new Set<WorkoutLibraryLayer>(quickAddDisciplineLibrary.map(workoutLayerForTemplate));
    return (["recovery", "base", "lt1", "subthreshold", "lt2", "vo2", "technique", "strength", "specific", "other"] as WorkoutLibraryLayer[])
      .filter((layer) => present.has(layer));
  }, [quickAddDisciplineLibrary]);
  const quickAddActiveLayer = useMemo(
    () => (calendarQuickAdd?.selectedLayer && quickAddAvailableLayers.includes(calendarQuickAdd.selectedLayer) ? calendarQuickAdd.selectedLayer : quickAddAvailableLayers[0] ?? null),
    [calendarQuickAdd?.selectedLayer, quickAddAvailableLayers],
  );
  const quickAddLayerCounts = useMemo(
    () => Object.fromEntries(quickAddAvailableLayers.map((layer) => [layer, quickAddDisciplineLibrary.filter((template) => workoutLayerForTemplate(template) === layer).length])),
    [quickAddAvailableLayers, quickAddDisciplineLibrary],
  );
  const quickAddFilteredLibrary = useMemo(() => {
    const selectedLayer = quickAddActiveLayer;
    const filtered = selectedLayer
      ? quickAddDisciplineLibrary.filter((template) => workoutLayerForTemplate(template) === selectedLayer)
      : quickAddDisciplineLibrary;
    return filtered.slice(0, 15);
  }, [quickAddActiveLayer, quickAddDisciplineLibrary]);

  useEffect(() => {
    if (!availableDisciplines.includes(selectedDiscipline)) {
      if (athleteId && availableDisciplines.length) {
        updatePlanningRoute(athleteId, availableDisciplines[0] ?? "running");
        return;
      }
      setSelectedDiscipline(availableDisciplines[0] ?? "running");
    }
  }, [athleteId, availableDisciplines, selectedDiscipline, updatePlanningRoute]);

  useEffect(() => {
    if (!templateLibrary.length) {
      setSelectedTemplateId("");
      return;
    }
    const suggestedTemplateId = overview?.next_recommendation.template_id ?? "";
    if (selectedTemplateId && templateLibrary.some((template) => template.template_id === selectedTemplateId)) {
      return;
    }
    if (suggestedTemplateId && templateLibrary.some((template) => template.template_id === suggestedTemplateId)) {
      setSelectedTemplateId(suggestedTemplateId);
      return;
    }
    setSelectedTemplateId(templateLibrary[0].template_id);
  }, [overview?.next_recommendation.template_id, selectedTemplateId, templateLibrary]);

  const selectedObjectiveOptions = useMemo(() => objectiveOptionsForDiscipline(selectedDiscipline), [selectedDiscipline]);
  const selectedWeaknessOptions = useMemo(() => weaknessOptionsForDiscipline(selectedDiscipline), [selectedDiscipline]);

  useEffect(() => {
    if (!selectedObjectiveOptions.includes(blockObjective)) {
      setBlockObjective(selectedObjectiveOptions[0] ?? "LT1");
    }
  }, [blockObjective, selectedObjectiveOptions]);

  useEffect(() => {
    if (!selectedWeaknessOptions.includes(primaryWeakness)) {
      setPrimaryWeakness(selectedWeaknessOptions[0] ?? "Base aeróbica");
    }
    if (!selectedWeaknessOptions.includes(secondaryWeakness)) {
      setSecondaryWeakness(selectedWeaknessOptions[1] ?? selectedWeaknessOptions[0] ?? "LT1");
    }
  }, [primaryWeakness, secondaryWeakness, selectedWeaknessOptions]);

  useEffect(() => {
    if (!overview?.next_recommendation) return;
    setWeeks(String(overview.next_recommendation.duration_weeks));
    setBlockIntent((current) => (
      current ||
      overview.current_block.recommendation ||
      overview.next_recommendation.reasoning[0] ||
      "Bloque provisional para empezar a trabajar la limitante principal."
    ));
    setCoachNotes((current) => current || overview.next_recommendation.control_points.join(" "));
  }, [overview?.current_block.recommendation, overview?.next_recommendation]);

  useEffect(() => {
    if (!selectedTemplate) return;
    const nextObjective = objectiveFromTemplate(selectedTemplate, selectedDiscipline);
    if (selectedObjectiveOptions.includes(nextObjective)) {
      setBlockObjective(nextObjective);
    }
    setBlockPhase(defaultPhaseForRecommendation(selectedTemplate.block_type));
    setWeeks((current) => {
      const parsed = Number(current);
      if (parsed >= selectedTemplate.typical_duration_weeks_min && parsed <= selectedTemplate.typical_duration_weeks_max) {
        return current;
      }
      return String(selectedTemplate.typical_duration_weeks_min);
    });
  }, [selectedDiscipline, selectedObjectiveOptions, selectedTemplate]);

  const quickGuardrails = useMemo(() => {
    const recommendation = overview?.next_recommendation;
    const lines = [
      selectedTemplate?.entry_checks?.[0] ??
        overview?.current_block.recommendation ??
        "Mantén una única variable dominante por bloque para poder leer si el cambio fisiológico es real.",
      selectedDiscipline === "ciclismo"
        ? "En ciclismo, decide si quieres progresar por tiempo útil o por densidad antes de subir potencia objetivo."
        : selectedDiscipline === "natación"
          ? "En natación, prioriza continuidad y calidad técnica antes de endurecer el bloque."
          : "En carrera, sube minutos de trabajo o densidad, no ambas cosas en la misma semana.",
      selectedTemplate?.progression_rules?.[0] ??
        recommendation?.progression_rules?.[0] ??
        (priority === "agresivo"
          ? "Modo agresivo: deja una semana final de descarga clara para no arrastrar fatiga al siguiente bloque."
          : "Modo controlado: busca comparabilidad de lactato y una respuesta limpia al final del ciclo."),
    ];
    return lines;
  }, [overview?.current_block.recommendation, overview?.next_recommendation, priority, selectedDiscipline, selectedTemplate]);

  const microcycle = useMemo(
    () => buildMicrocycle(Number(weeks) || 4, selectedDiscipline, blockObjective, density),
    [weeks, selectedDiscipline, blockObjective, density],
  );
  const durationFeedback = useMemo(
    () => durationInterpretation(selectedTemplate, Number(weeks) || 0),
    [selectedTemplate, weeks],
  );

  const phaseOptions = useMemo(
    () => phaseOptionsForRecommendation(selectedTemplate?.block_type || overview?.next_recommendation.recommended_block_type),
    [overview?.next_recommendation.recommended_block_type, selectedTemplate?.block_type],
  );

  useEffect(() => {
    if (!phaseOptions.includes(blockPhase)) {
      setBlockPhase(phaseOptions[0] ?? "base");
    }
  }, [blockPhase, phaseOptions]);

  async function saveFocusBlockFromPlanning() {
    if (!athleteId || !overview) return false;
    setSaveError(null);
    setSaveMessage(null);
    setSaving(true);
    try {
      const durationWeeks = Number(weeks) || overview.next_recommendation.duration_weeks || 4;
      const endDate = addDays(blockStartDate, durationWeeks * 7 - 1);
      await api.addFocusBlock(token, Number(athleteId), {
        start_date: blockStartDate,
        end_date: endDate,
        template_id: selectedTemplate?.template_id || null,
        energy_system_focus: selectedTemplate?.primary_focus || energySystemFocusForRecommendation(
          overview.next_recommendation.recommended_block_type,
          overview.next_recommendation.primary_focus,
        ),
        block_objective: blockObjective,
        block_intent: blockIntent || selectedTemplate?.summary || null,
        priority_discipline: selectedDiscipline,
        phase: blockPhase,
        target_event: overview.next_recommendation.next_target?.objective || null,
        target_date: overview.next_recommendation.next_target?.target_date || null,
        status: "active",
        coach_notes: [
          selectedTemplate ? `Plantilla: ${selectedTemplate.public_label}` : null,
          primaryWeakness ? `Limitante principal: ${primaryWeakness}` : null,
          secondaryWeakness ? `Limitante secundaria: ${secondaryWeakness}` : null,
          coachNotes || null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      setSaveMessage("Bloque guardado como activo desde planificación.");
      // Close composer immediately for snappy UX, reload context in background
      setSaving(false);
      loadPlanningContext(String(athleteId), selectedDiscipline);
      return true;
    } catch (loadError) {
      setSaveError(loadError instanceof Error ? loadError.message : "No se pudo guardar el bloque.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deletePlannedBlock(blockId: number) {
    if (!athleteId) return;
    const confirmed = window.confirm("¿Quieres eliminar este bloque planificado? Esta acción sí borra el bloque real del atleta.");
    if (!confirmed) return;
    setDeletingBlockId(blockId);
    try {
      await api.deleteFocusBlock(token, Number(athleteId), blockId);
      await loadPlanningContext(String(athleteId), selectedDiscipline);
      return true;
    } catch (loadError) {
      setSaveError(loadError instanceof Error ? loadError.message : "No se pudo eliminar el bloque.");
      return false;
    } finally {
      setDeletingBlockId(null);
    }
  }

  const deletePlanningSourceFromModal = useCallback(async () => {
    if (!planningSourceModal?.source.focusBlockId || planningSourceModal.source.kind !== "planned") return;
    const deleted = await deletePlannedBlock(planningSourceModal.source.focusBlockId);
    if (deleted) {
      setPlanningSourceModal(null);
    }
  }, [planningSourceModal]);

  const openMesocycleLibraryFromSource = useCallback((source: PlanningCalendarSource) => {
    const linkedTemplate = resolveMesocycleTemplateForSource(source, templateLibrary);
    setSelectedLibrarySourceId(source.id);
    if (linkedTemplate) {
      setSelectedTemplateId(linkedTemplate.template_id);
    }
    setPlanningSourceModal(null);
    openCalendarWorkspaceTab("library");
  }, [openCalendarWorkspaceTab, templateLibrary]);

  const timelineItems = useMemo(() => {
    const items: Array<{
      id: string;
      tone: PlanTone;
      kind: "historical" | "planned" | "target";
      date: string;
      endDate?: string | null;
      title: string;
      subtitle: string;
      meta: string;
    }> = [];

    (overview?.detected_mesocycles ?? []).forEach((block) => {
      items.push({
        id: `historical-${block.start_date}-${block.block_type}`,
        tone:
          block.block_type === "recovery_consolidation_block"
            ? "warning"
            : block.block_type === "aerobic_capacity_block" || block.block_type === "threshold_development_block" || block.block_type === "aerobic_power_block" || block.block_type === "anaerobic_capacity_block" || block.block_type === "anaerobic_power_block"
              ? "positive"
              : "neutral",
        kind: "historical",
        date: block.start_date,
        endDate: block.end_date,
        title: detectedBlockTitle(block),
        subtitle: "Histórico inferido",
        meta: `${block.weeks_count} sem · ${block.session_count} sesiones`,
      });
    });

    (overview?.planned_blocks ?? []).forEach((block) => {
      items.push({
        id: `planned-${block.id}`,
        tone: block.status === "active" ? "positive" : block.status === "planned" ? "neutral" : "warning",
        kind: "planned",
        date: block.start_date,
        endDate: block.end_date ?? block.target_date ?? null,
        title: `${block.energy_system_focus} · ${block.block_objective}`,
        subtitle: block.status === "active" ? "Bloque activo" : "Bloque programado",
        meta: disciplineLabel(block.priority_discipline || selectedDiscipline),
      });
    });

    const target = overview?.next_recommendation.next_target;
    if (target?.target_date) {
      items.push({
        id: `target-${target.target_date}-${target.objective}`,
        tone: "warning",
        kind: "target",
        date: target.target_date,
        title: target.objective || "Objetivo",
        subtitle: `Objetivo ${disciplineLabel(selectedDiscipline).toLowerCase()}`,
        meta: target.target_metric || target.distance_label || "Objetivo abierto",
      });
    }

    return items.sort((a, b) => dateValue(a.date) - dateValue(b.date));
  }, [overview?.detected_mesocycles, overview?.next_recommendation.next_target, overview?.planned_blocks, selectedDiscipline]);

  const draftCalendarSource = useMemo<PlanningCalendarSource>(() => {
    const durationWeeks = Number(weeks) || overview?.next_recommendation.duration_weeks || 4;
    return {
      id: "draft",
      kind: "draft",
      focusBlockId: null,
      startDate: blockStartDate,
      endDate: addDays(blockStartDate, durationWeeks * 7 - 1),
      discipline: selectedDiscipline,
      templateId: selectedTemplate?.template_id || overview?.next_recommendation.template_id || null,
      blockType: selectedTemplate?.block_type || overview?.next_recommendation.recommended_block_type || null,
      status: "draft",
      title: selectedTemplate?.public_label || overview?.next_recommendation.recommended_block_label || "Borrador",
      objective: blockObjective,
      energySystemFocus: selectedTemplate?.primary_focus || overview?.next_recommendation.primary_focus || null,
      phase: blockPhase,
      intent: blockIntent || selectedTemplate?.summary || null,
      notes: coachNotes || null,
      density,
    };
  }, [
    blockIntent,
    blockObjective,
    blockPhase,
    blockStartDate,
    coachNotes,
    density,
    overview?.next_recommendation.duration_weeks,
    overview?.next_recommendation.primary_focus,
    overview?.next_recommendation.recommended_block_label,
    selectedDiscipline,
    selectedTemplate?.primary_focus,
    selectedTemplate?.public_label,
    selectedTemplate?.summary,
    weeks,
  ]);

  const ribbonCards = useMemo(() => {
    const items: Array<{
      id: string;
      tone: PlanTone;
      kind: "historical" | "planned" | "target";
      date: string;
      endDate?: string | null;
      title: string;
      subtitle: string;
      meta: string;
    }> = [...timelineItems];

    const nextTarget = overview?.next_recommendation.next_target;
    if (nextTarget?.target_date && !items.some((item) => item.kind === "target")) {
      items.push({
        id: `target-${nextTarget.target_date}-${nextTarget.objective}`,
        tone: "warning",
        kind: "target",
        date: nextTarget.target_date,
        title: nextTarget.objective || "Objetivo",
        subtitle: "Objetivo",
        meta: nextTarget.target_metric || nextTarget.distance_label || "Objetivo abierto",
      });
    }

    return items.sort((a, b) => dateValue(a.date) - dateValue(b.date));
  }, [draftCalendarSource, overview?.next_recommendation.next_target, timelineItems]);

  const calendarSources = useMemo<PlanningCalendarSource[]>(() => {
    const planned = (overview?.planned_blocks ?? []).map((block) => ({
      id: `planned-${block.id}`,
      kind: "planned" as const,
      focusBlockId: block.id,
      startDate: block.start_date,
      endDate: block.end_date || block.target_date || block.start_date,
      discipline: block.priority_discipline || selectedDiscipline,
      templateId: block.template_id ?? null,
      blockType: (templateLibrary.find((template) => template.template_id === block.template_id)?.block_type) ?? null,
      status: block.status,
      title: `${block.energy_system_focus} · ${block.block_objective}`,
      objective: block.block_objective,
      energySystemFocus: block.energy_system_focus,
      phase: block.phase,
      intent: block.block_intent,
      notes: block.coach_notes,
      density: "media",
    }));
    const historical = (overview?.detected_mesocycles ?? []).map((block) => ({
      id: `historical-${block.start_date}-${block.block_type}`,
      kind: "historical" as const,
      focusBlockId: null,
      startDate: block.start_date,
      endDate: block.end_date,
      discipline: block.discipline,
      templateId: resolveMesocycleTemplateForSource({
        id: "",
        kind: "historical",
        focusBlockId: null,
        startDate: block.start_date,
        endDate: block.end_date,
        discipline: block.discipline,
        templateId: null,
        blockType: block.block_type,
        status: "historical",
        title: block.block_label,
        objective: block.block_label,
      }, templateLibrary)?.template_id ?? null,
      blockType: block.block_type,
      status: "historical",
      title: block.block_label,
      objective: block.block_label,
      energySystemFocus: block.block_type,
      phase: null,
      intent: block.explanation[0] || null,
      notes: block.explanation.join(" "),
      density: "media",
    }));
    return [...planned, ...historical];
  }, [overview?.detected_mesocycles, overview?.planned_blocks, selectedDiscipline, templateLibrary]);

  const primaryCalendarSource = useMemo(
    () => overview?.planned_blocks?.[0] ? calendarSources.find((source) => source.kind === "planned") ?? calendarSources[0] ?? null : calendarSources[0] ?? null,
    [calendarSources, overview?.planned_blocks],
  );

  const selectedCalendarSource = useMemo(
    () => calendarSources.find((source) => source.id === selectedCalendarSourceId) ?? primaryCalendarSource ?? draftCalendarSource,
    [calendarSources, draftCalendarSource, primaryCalendarSource, selectedCalendarSourceId],
  );
  const selectedLibrarySource = useMemo(
    () => calendarSources.find((source) => source.id === selectedLibrarySourceId) ?? null,
    [calendarSources, selectedLibrarySourceId],
  );
  const selectedLibrarySourceTemplate = useMemo(
    () => (selectedLibrarySource ? resolveMesocycleTemplateForSource(selectedLibrarySource, templateLibrary) : null),
    [selectedLibrarySource, templateLibrary],
  );
  const activeLibraryTemplate = selectedLibrarySourceTemplate ?? selectedTemplate;
  const selectedLibraryCompatibleWorkouts = useMemo(() => {
    const activeTemplate = activeLibraryTemplate;
    if (!activeTemplate) return [];
    const targetDiscipline = selectedLibrarySource?.discipline ?? selectedDiscipline;
    return workoutLibrary
      .filter((template) => (
        template.compatible_block_types.includes(activeTemplate.block_type)
        && (template.discipline === targetDiscipline || template.discipline === "all")
      ))
      .sort((left, right) => {
        const roleWeight = (value: string) => (value === "key" ? 0 : value === "support" ? 1 : value === "recovery" ? 2 : 3);
        return roleWeight(left.session_role) - roleWeight(right.session_role) || left.public_label.localeCompare(right.public_label);
      });
  }, [activeLibraryTemplate, selectedDiscipline, selectedLibrarySource?.discipline, workoutLibrary]);
  const selectedLibraryPlannedSessions = useMemo(
    () => selectedLibrarySource?.focusBlockId
      ? (overview?.planned_sessions ?? [])
        .filter((session) => session.focus_block_id === selectedLibrarySource.focusBlockId)
        .sort((left, right) => dateValue(left.scheduled_date) - dateValue(right.scheduled_date))
      : [],
    [overview?.planned_sessions, selectedLibrarySource],
  );
  const selectedLibraryHistoricalBlock = useMemo(
    () => (selectedLibrarySource ? detectedMesocyclesById.get(selectedLibrarySource.id) ?? null : null),
    [detectedMesocyclesById, selectedLibrarySource],
  );
  const selectedLibraryCandidate = useMemo(() => {
    const blockType = activeLibraryTemplate?.block_type ?? selectedLibrarySource?.blockType ?? null;
    if (!blockType) return null;
    return overview?.next_recommendation.candidates_scored?.find((candidate) => candidate.block_type === blockType) ?? null;
  }, [activeLibraryTemplate?.block_type, overview?.next_recommendation.candidates_scored, selectedLibrarySource?.blockType]);
  const selectedLibraryWhyNow = useMemo(() => {
    const blockType = activeLibraryTemplate?.block_type ?? selectedLibrarySource?.blockType ?? null;
    if (!blockType) return [];
    if (blockType === overview?.next_recommendation.recommended_block_type) {
      return overview?.next_recommendation.reasoning ?? [];
    }
    return selectedLibraryCandidate?.reasons ?? selectedLibraryHistoricalBlock?.explanation ?? [];
  }, [
    overview?.next_recommendation.reasoning,
    overview?.next_recommendation.recommended_block_type,
    selectedLibraryCandidate?.reasons,
    selectedLibraryHistoricalBlock?.explanation,
    activeLibraryTemplate?.block_type,
    selectedLibrarySource?.blockType,
  ]);

  const overlayOptions = useMemo(
    () => availableDisciplines.filter((discipline) => discipline !== selectedDiscipline),
    [availableDisciplines, selectedDiscipline],
  );

  const overlaySources = useMemo<PlanningCalendarSource[]>(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = addDays(addMonths(monthStart, 1), -1);
    return enabledOverlayDisciplines.flatMap<PlanningCalendarSource>((discipline) => {
      const disciplineOverview = disciplineOverviews[discipline];
      if (!disciplineOverview) return [];
      const planned = disciplineOverview.planned_blocks
        .map((block) => ({
          id: `overlay-planned-${discipline}-${block.id}`,
          kind: "planned" as const,
          focusBlockId: block.id,
          startDate: block.start_date,
          endDate: block.end_date || block.target_date || block.start_date,
          discipline,
          title: `${block.energy_system_focus} · ${block.block_objective}`,
          objective: block.block_objective,
          energySystemFocus: block.energy_system_focus,
          phase: block.phase,
          intent: block.block_intent,
          notes: block.coach_notes,
          density: "media",
        }))
        .filter((source) => overlapsRange(source.startDate, source.endDate, monthStart, monthEnd));
      if (planned.length) return planned;
      return disciplineOverview.detected_mesocycles
        .map((block) => ({
          id: `overlay-historical-${discipline}-${block.start_date}-${block.block_type}`,
          kind: "historical" as const,
          focusBlockId: null,
          startDate: block.start_date,
          endDate: block.end_date,
          discipline,
          title: block.block_label,
          objective: block.block_label,
          energySystemFocus: block.block_type,
          phase: null,
          intent: block.explanation[0] || null,
          notes: block.explanation.join(" "),
          density: "media",
        }))
        .filter((source) => overlapsRange(source.startDate, source.endDate, monthStart, monthEnd))
        .slice(-1);
    });
  }, [calendarMonth, disciplineOverviews, enabledOverlayDisciplines]);

  useEffect(() => {
    if (!calendarSources.some((source) => source.id === selectedCalendarSourceId)) {
      setSelectedCalendarSourceId(primaryCalendarSource?.id ?? "");
    }
  }, [calendarSources, primaryCalendarSource?.id, selectedCalendarSourceId]);

  useEffect(() => {
    if (selectedLibrarySourceId && !calendarSources.some((source) => source.id === selectedLibrarySourceId)) {
      setSelectedLibrarySourceId("");
    }
  }, [calendarSources, selectedLibrarySourceId]);

  useEffect(() => {
    setCalendarMonth(startOfMonth(selectedCalendarSource.startDate));
  }, [selectedCalendarSource.startDate]);

  const plannedSessions = useMemo(() => {
    const persisted = buildPersistedCalendarSessions(selectedCalendarSource, overview?.planned_sessions ?? []);
    return persisted ?? buildSyntheticCalendarSessions(selectedCalendarSource);
  }, [overview?.planned_sessions, selectedCalendarSource]);

  const overlayEntries = useMemo<CalendarEntry[]>(
    () => overlaySources.flatMap((source) => {
      const disciplineOverview = disciplineOverviews[source.discipline];
      const persisted = buildPersistedCalendarSessions(source, disciplineOverview?.planned_sessions ?? []);
      const sessions = persisted ?? buildSyntheticCalendarSessions(source);
      return sessions.map((session) => ({
        ...session,
        layerDiscipline: source.discipline,
        isOverlay: true,
      }));
    }),
    [disciplineOverviews, overlaySources],
  );

  const primaryEntries = useMemo<CalendarEntry[]>(
    () => plannedSessions.map((session) => ({
      ...session,
      layerDiscipline: selectedCalendarSource.discipline,
      isOverlay: false,
    })),
    [plannedSessions, selectedCalendarSource.discipline],
  );

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    [...primaryEntries, ...overlayEntries].forEach((session) => {
      const current = map.get(session.date) ?? [];
      current.push(session);
      map.set(session.date, current);
    });
    return map;
  }, [overlayEntries, primaryEntries]);

  useEffect(() => {
    const initialDate = plannedSessions[0]?.date ?? selectedCalendarSource.startDate;
    setSelectedCalendarDate(initialDate);
  }, [plannedSessions, selectedCalendarSource.startDate, selectedCalendarSource.id]);

  useEffect(() => {
    if (calendarVisualMode !== "week" || !selectedCalendarDate) return;
    setCalendarMonth(startOfMonth(selectedCalendarDate));
  }, [calendarVisualMode, selectedCalendarDate]);

  const planningThresholdSource = useMemo(
    () => resolveAnalysisDisciplineView(athleteAnalysis, selectedDiscipline) ?? athleteAnalysis,
    [athleteAnalysis, selectedDiscipline],
  );
  const planningLt1 = useMemo(
    () => resolveTrainingThreshold(planningThresholdSource, "LT1"),
    [planningThresholdSource],
  );
  const planningLt2 = useMemo(
    () => resolveTrainingThreshold(planningThresholdSource, "LT2"),
    [planningThresholdSource],
  );
  const planningPracticalLt1 = planningThresholdSource?.dynamic_thresholds?.chronic.practical_lt1 ?? null;
  const planningPracticalLt2 = planningThresholdSource?.dynamic_thresholds?.chronic.practical_lt2 ?? null;
  const planningThresholdBasis = useMemo(() => {
    const visibleSources = Array.from(new Set([planningLt1?.source, planningLt2?.source].filter(Boolean)));
    if (planningLt1?.source === "individual" && planningLt2?.source === "individual") {
      return "LT1/LT2 individuales";
    }
    if (visibleSources.length > 1) {
      return "Referencia mixta";
    }
    if (planningLt1?.source === "physiological" || planningLt2?.source === "physiological") {
      return "LT1/LT2 activos";
    }
    if (planningLt1 || planningLt2) {
      return "Anclas actuales";
    }
    return "Sin anclas visibles";
  }, [planningLt1, planningLt2]);

  const openDraftWorkoutPreview = useCallback((session: PlanningMesocycleDraftSession) => {
    const template = resolveWorkoutTemplate(workoutLibrary, {
      templateId: session.template_id,
      family: session.session_family,
      label: session.public_label,
    });
    if (!template) return;
    setOpenWorkoutPreview({
      template,
      selection: {
        ...buildDraftWorkoutPreviewSelection(template, session),
        prescriptionHint: buildPlanningPrescriptionHint(session.objective, session.public_label, template.discipline, planningLt1, planningLt2),
        thresholdBasis: planningThresholdBasis,
      },
    });
  }, [planningLt1, planningLt2, planningThresholdBasis, workoutLibrary]);

  const openPlannedWorkoutPreview = useCallback((sessionId: number) => {
    const plannedSession = overview?.planned_sessions.find((item) => item.id === sessionId);
    if (!plannedSession) return false;
    const template = resolveWorkoutTemplate(workoutLibrary, {
      templateId: plannedSession.workout_template_id,
      family: plannedSession.session_family,
      label: plannedSession.public_label,
    });
    if (!template) return false;
    setOpenWorkoutPreview({
      template,
      selection: {
        ...buildPlannedWorkoutPreviewSelection(template, plannedSession),
        prescriptionHint: buildPlanningPrescriptionHint(plannedSession.objective, plannedSession.public_label, plannedSession.discipline, planningLt1, planningLt2),
        thresholdBasis: planningThresholdBasis,
      },
    });
    return true;
  }, [overview?.planned_sessions, planningLt1, planningLt2, planningThresholdBasis, workoutLibrary]);

  const openPlannedWorkoutRawInformation = useCallback((sessionId: number) => {
    const opened = openPlannedWorkoutPreview(sessionId);
    if (!opened) return;
    setShowPlannedSessionRawInformation(true);
  }, [openPlannedWorkoutPreview]);

  const openCalendarSessionDetail = useCallback((session: CalendarEntry) => {
    setSelectedCalendarDate(session.date);
    if (session.rawId != null && openPlannedWorkoutPreview(session.rawId)) {
      return;
    }
    setOpenWorkoutPreview(buildSyntheticCalendarWorkoutPreview(
      session,
      selectedCalendarSource,
      planningLt1,
      planningLt2,
      planningThresholdBasis,
    ));
  }, [openPlannedWorkoutPreview, planningLt1, planningLt2, planningThresholdBasis, selectedCalendarSource]);

  const activePlannedPreviewSession = useMemo(
    () => openWorkoutPreview?.selection.plannedSessionId != null
      ? overview?.planned_sessions.find((session) => session.id === openWorkoutPreview.selection.plannedSessionId) ?? null
      : null,
    [openWorkoutPreview, overview?.planned_sessions],
  );

  useEffect(() => {
    if (!activePlannedPreviewSession) {
      setShowPlannedSessionRawInformation(false);
      setPlannedSessionStructuredPreview(null);
      setPlannedSessionStructuredPreviewError(null);
      setPlannedSessionStructuredPreviewLoading(false);
      return;
    }
    if (activePlannedPreviewSession.structured_workout_payload) {
      setPlannedSessionStructuredPreview(activePlannedPreviewSession.structured_workout_payload);
      setPlannedSessionStructuredPreviewError(null);
      setPlannedSessionStructuredPreviewLoading(false);
    } else {
      // Eagerly fetch structured preview so the editor can work
      let cancelled = false;
      setPlannedSessionStructuredPreviewLoading(true);
      api.plannedSessionWorkoutDefinitionPreview(token, activePlannedPreviewSession.id)
        .then((payload) => { if (!cancelled) setPlannedSessionStructuredPreview(payload as WorkoutDefinition); })
        .catch(() => { /* editor will be unavailable */ })
        .finally(() => { if (!cancelled) setPlannedSessionStructuredPreviewLoading(false); });
      return () => { cancelled = true; };
    }
  }, [activePlannedPreviewSession?.id, activePlannedPreviewSession?.structured_workout_payload, token]);

  useEffect(() => {
    if (!showPlannedSessionRawInformation || !activePlannedPreviewSession?.id) return;

    let cancelled = false;
    setPlannedSessionStructuredPreviewLoading(true);
    setPlannedSessionStructuredPreviewError(null);

    api.plannedSessionWorkoutDefinitionPreview(token, activePlannedPreviewSession.id)
      .then((payload) => {
        if (!cancelled) {
          setPlannedSessionStructuredPreview(payload as WorkoutDefinition);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setPlannedSessionStructuredPreviewError(
            loadError instanceof Error ? loadError.message : "No se pudo cargar la estructura canónica.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPlannedSessionStructuredPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activePlannedPreviewSession?.id, showPlannedSessionRawInformation, token]);

  const plannedSessionStructuredPreviewJson = useMemo(
    () => (plannedSessionStructuredPreview ? JSON.stringify(plannedSessionStructuredPreview, null, 2) : null),
    [plannedSessionStructuredPreview],
  );

  const regeneratePlannedSessionStructure = useCallback(async (sessionId: number) => {
    if (!athleteId) return;
    setPlannedSessionRegeneratingId(sessionId);
    setPlannedSessionStructuredPreviewError(null);
    try {
      const payload = (await api.preparePlannedSessionPublish(token, sessionId)) as PlanningPlannedSession;
      setPlannedSessionStructuredPreview(payload.structured_workout_payload ?? null);
      await loadPlanningContext(String(athleteId), selectedDiscipline);
      setShowPlannedSessionRawInformation(true);
    } catch (loadError) {
      setPlannedSessionStructuredPreviewError(
        loadError instanceof Error ? loadError.message : "No se pudo regenerar la estructura del entreno.",
      );
    } finally {
      setPlannedSessionRegeneratingId(null);
    }
  }, [athleteId, selectedDiscipline, token]);

  const handleSaveWorkoutSteps = useCallback(async (workout: WorkoutDefinition) => {
    if (!activePlannedPreviewSession) return;
    const result = (await api.saveWorkoutSteps(token, activePlannedPreviewSession.id, workout as unknown as Record<string, unknown>)) as PlanningPlannedSession;
    setPlannedSessionStructuredPreview(result.structured_workout_payload ?? null);
    if (athleteId) {
      await loadPlanningContext(String(athleteId), selectedDiscipline);
    }
  }, [activePlannedPreviewSession, athleteId, selectedDiscipline, token]);

  const handlePushToGarmin = useCallback(async () => {
    if (!activePlannedPreviewSession || !athleteId) return;
    await api.pushWorkoutToGarmin(token, Number(athleteId), activePlannedPreviewSession.id);
    if (athleteId) {
      await loadPlanningContext(String(athleteId), selectedDiscipline);
    }
  }, [activePlannedPreviewSession, athleteId, selectedDiscipline, token]);

  // Build a WorkoutDefinition for the editor — prefer stored payload, fall back to generated
  const editableWorkoutDefinition = useMemo<WorkoutDefinition | null>(() => {
    if (!activePlannedPreviewSession) return null;
    if (plannedSessionStructuredPreview) return plannedSessionStructuredPreview;
    // Minimal fallback: the preview definition is loaded lazily, so it may not be ready
    return null;
  }, [activePlannedPreviewSession, plannedSessionStructuredPreview]);

  const activeBlockLabel = overview?.current_block.energy_system_focus
    ? `${overview.current_block.energy_system_focus} · ${overview.current_block.block_objective}`
    : "Sin bloque activo";
  const nextTargetPrimaryLabel = overview?.next_recommendation.next_target?.distance_label
    || overview?.next_recommendation.next_target?.objective
    || "Objetivo abierto";
  const nextTargetLabel = overview?.next_recommendation.next_target
    ? [
        overview.next_recommendation.next_target.target_date
          ? formatDate(overview.next_recommendation.next_target.target_date)
          : "Sin fecha",
        overview.next_recommendation.next_target.target_metric
          ? `Ritmo objetivo ${overview.next_recommendation.next_target.target_metric}`
          : null,
      ].filter(Boolean).join(" · ")
    : "Sin fecha";
  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => String(athlete.id) === String(athleteId)) ?? null,
    [athleteId, athletes],
  );
  const visibleTargets = useMemo(() => {
    const today = formatDateKey(new Date());
    return (selectedAthlete?.targets ?? [])
      .filter((target) => !target.target_date || target.target_date >= today)
      .sort((left, right) => String(left.target_date).localeCompare(String(right.target_date)))
      .slice(0, 4);
  }, [selectedAthlete]);
  const rosterProgressRows = useMemo<RosterProgressRow[]>(() => athletes.map((athlete) => {
    const analysis = athlete.id === selectedAthlete?.id ? athleteAnalysis : rosterAnalyses[athlete.id] ?? null;
    const thresholdDiscipline = normalizeDisciplineKey(athlete.primary_discipline);
    const thresholdSource = resolveAnalysisDisciplineView(analysis, thresholdDiscipline)
      ?? (normalizeDisciplineKey(selectedDiscipline) === thresholdDiscipline ? analysis : null)
      ?? analysis;
    const evaluation = analysis?.active_focus_block?.evaluation ?? analysis?.focus_block_evaluations?.[0] ?? null;
    const direction = evaluation?.direction ?? analysis?.trends?.[0]?.direction ?? null;
    const summary = evaluation?.summary
      ?? analysis?.trends?.[0]?.summary
      ?? analysis?.interpretation?.[0]
      ?? athlete.training_goal
      ?? "Sin suficiente señal longitudinal todavía.";
    const activeBlock = athlete.focus_blocks?.find((block) => block.status === "active");
    const blockMetric = formatBlockMetricQuickview(evaluation);
    const thresholdRows = formatThresholdQuickRows(thresholdSource, thresholdDiscipline);

    return {
      athlete,
      tone: progressTone(direction),
      directionLabel: progressDirectionLabel(direction),
      summary,
      snapshotLabel: analysis?.latest_snapshot_date ? formatDate(analysis.latest_snapshot_date) : "Sin snapshot",
      confidenceLabel: averageConfidenceLabel(analysis),
      currentBlock: activeBlock ? `${activeBlock.energy_system_focus} · ${activeBlock.block_objective}` : "Sin bloque activo",
      nextTarget: nextTargetLabelFromAthlete(athlete),
      quickLoadBars: buildRecentLoadBars(analysis?.recent_sessions),
      confidenceBars: buildConfidenceBars(analysis),
      blockMetricLabel: blockMetric.label,
      blockMetricHint: blockMetric.hint,
      thresholdDisciplineLabel: disciplineLabel(thresholdDiscipline),
      lt1Label: thresholdRows.lt1Label,
      lt1Hint: thresholdRows.lt1Hint,
      lt2Label: thresholdRows.lt2Label,
      lt2Hint: thresholdRows.lt2Hint,
    };
  }), [athleteAnalysis, athletes, rosterAnalyses, selectedAthlete, selectedDiscipline]);
  const selectedRosterRow = useMemo(
    () => rosterProgressRows.find((row) => row.athlete.id === selectedAthlete?.id) ?? rosterProgressRows[0] ?? null,
    [rosterProgressRows, selectedAthlete?.id],
  );
  const rosterProgressStats = useMemo(() => {
    const improving = rosterProgressRows.filter((row) => row.tone === "positive").length;
    const warning = rosterProgressRows.filter((row) => row.tone === "warning").length;
    return {
      improving,
      warning,
      stable: rosterProgressRows.length - improving - warning,
    };
  }, [rosterProgressRows]);
  const selectedWeekStart = useMemo(
    () => startOfWeek(selectedCalendarDate || selectedCalendarSource.startDate),
    [selectedCalendarDate, selectedCalendarSource.startDate],
  );
  const selectedWeekEnd = useMemo(() => addDays(selectedWeekStart, 6), [selectedWeekStart]);
  const selectedWeekVisibleEntries = useMemo(
    () => [...primaryEntries, ...overlayEntries]
      .filter((session) => dateValue(session.date) >= dateValue(selectedWeekStart) && dateValue(session.date) <= dateValue(selectedWeekEnd)),
    [overlayEntries, primaryEntries, selectedWeekEnd, selectedWeekStart],
  );
  const selectedWeekSnapshot = useMemo(
    () => buildCalendarWeekSnapshot(selectedWeekVisibleEntries, athleteAnalysis, selectedDiscipline),
    [athleteAnalysis, selectedDiscipline, selectedWeekVisibleEntries],
  );
  const selectedWeekdayOffset = useMemo(() => {
    if (!selectedCalendarDate) return 0;
    return Math.max(0, Math.min(6, Math.round((dateValue(selectedCalendarDate) - dateValue(selectedWeekStart)) / 86400000)));
  }, [selectedCalendarDate, selectedWeekStart]);
  const continuousMonthStarts = useMemo(() => {
    const allDates = [
      selectedCalendarSource.startDate,
      selectedCalendarSource.endDate,
      selectedCalendarDate,
      calendarMonth,
      isoDateFromToday(),
      ...primaryEntries.map((session) => session.date),
      ...overlayEntries.map((session) => session.date),
    ].filter(Boolean) as string[];

    const sorted = allDates
      .map((value) => startOfMonth(value))
      .sort((left, right) => dateValue(left) - dateValue(right));

    const minMonth = sorted[0] ?? startOfMonth(isoDateFromToday());
    const maxMonth = sorted[sorted.length - 1] ?? minMonth;
    const rangeStart = startOfMonth(addMonths(minMonth, -6));
    const rangeEnd = startOfMonth(addMonths(maxMonth, 6));
    const totalMonths = Math.max(1, diffCalendarMonths(rangeStart, rangeEnd) + 1);

    return Array.from({ length: totalMonths }, (_, index) => startOfMonth(addMonths(rangeStart, index)));
  }, [calendarMonth, overlayEntries, primaryEntries, selectedCalendarDate, selectedCalendarSource.endDate, selectedCalendarSource.startDate]);
  const continuousMonthSections = useMemo<CalendarMonthSection[]>(() => continuousMonthStarts.map((monthStart) => {
    const rows = buildCalendarMonthRows(monthStart, sessionsByDate, athleteAnalysis, selectedDiscipline);
    const totalMinutes = rows.reduce((sum, row) => sum + row.snapshot.totalMinutes, 0);
    const totalSessions = rows.reduce((sum, row) => sum + row.snapshot.totalSessions, 0);
    return {
      monthStart,
      rows,
      scale: {
        totalMinutes: Math.max(1, ...rows.map((row) => row.snapshot.totalMinutes)),
        disciplineMinutes: ["running", "ciclismo", "natación"].reduce<Record<string, number>>((acc, discipline) => {
          acc[discipline] = Math.max(
            1,
            ...rows.map((row) => row.snapshot.disciplineMetrics.find((metric) => metric.discipline === discipline)?.minutes ?? 0),
          );
          return acc;
        }, {}),
      },
      totalMinutes,
      totalSessions,
    };
  }), [athleteAnalysis, continuousMonthStarts, selectedDiscipline, sessionsByDate]);
  const calendarToolbarHeading = useMemo(
    () => (calendarVisualMode === "week" ? weekHeading(selectedWeekStart, selectedWeekEnd) : monthHeading(calendarMonth)),
    [calendarMonth, calendarVisualMode, selectedWeekEnd, selectedWeekStart],
  );
  const calendarToolbarSubheading = useMemo(
    () => (calendarVisualMode === "week"
      ? `${compactPlanningSourceTitle(selectedCalendarSource)} · ${disciplineLabel(selectedCalendarSource.discipline)} · Semana visible`
      : `${compactPlanningSourceTitle(selectedCalendarSource)} · ${disciplineLabel(selectedCalendarSource.discipline)}`),
    [calendarVisualMode, selectedCalendarSource],
  );
  const continuousWeekStarts = useMemo(() => {
    const allDates = [
      selectedCalendarSource.startDate,
      selectedCalendarSource.endDate,
      selectedCalendarDate,
      isoDateFromToday(),
      ...primaryEntries.map((session) => session.date),
      ...overlayEntries.map((session) => session.date),
    ].filter(Boolean) as string[];

    const sorted = allDates
      .map((value) => startOfWeek(value))
      .sort((left, right) => dateValue(left) - dateValue(right));

    const minWeek = sorted[0] ?? startOfWeek(isoDateFromToday());
    const maxWeek = sorted[sorted.length - 1] ?? minWeek;
    const rangeStart = addDays(minWeek, -35);
    const rangeEnd = addDays(maxWeek, 35);
    const totalWeeks = Math.max(1, Math.round((dateValue(rangeEnd) - dateValue(rangeStart)) / 86400000 / 7) + 1);

    return Array.from({ length: totalWeeks }, (_, index) => addDays(rangeStart, index * 7));
  }, [overlayEntries, primaryEntries, selectedCalendarDate, selectedCalendarSource.endDate, selectedCalendarSource.startDate]);
  const calendarMesocycleOptions = useMemo<CalendarMesocycleOption[]>(() => {
    const recommendation = overview?.next_recommendation;
    const candidateOrder = recommendation?.candidates_scored ?? [];
    const options = candidateOrder
      .map<CalendarMesocycleOption | null>((candidate): CalendarMesocycleOption | null => {
        const template = templateLibrary.find((item) => item.block_type === candidate.block_type);
        if (!template) return null;
        const isBest = template.template_id === recommendation?.template_id || candidate.block_type === recommendation?.recommended_block_type;
        return {
          template,
          score: candidate.score ?? null,
          isBest,
          whyItFits: (isBest ? recommendation?.reasoning : candidate.reasons) ?? [],
          whyNotAsGood: (isBest ? recommendation?.risk_flags : candidate.contraindications) ?? [],
        } as CalendarMesocycleOption;
      })
      .filter((option): option is CalendarMesocycleOption => option !== null);

    if (options.length) {
      // Mostrar todos los candidatos evaluados (no solo 4)
      return options.map((option) => ({
        ...option,
        whyItFits: option.whyItFits.slice(0, 3),
        whyNotAsGood: option.whyNotAsGood.slice(0, 3),
      }));
    }

    return templateLibrary.map((template, index) => {
      const isBest = template.template_id === recommendation?.template_id || index === 0;
      return {
        template,
        score: null,
        isBest,
        whyItFits: isBest ? (recommendation?.reasoning ?? []).slice(0, 3) : [],
        whyNotAsGood: isBest ? (recommendation?.risk_flags ?? []).slice(0, 3) : [],
      };
    });
  }, [overview?.next_recommendation, templateLibrary]);
  const selectedComposerOption = useMemo(
    () => calendarMesocycleOptions.find((option) => option.template.template_id === selectedTemplateId) ?? calendarMesocycleOptions[0] ?? null,
    [calendarMesocycleOptions, selectedTemplateId],
  );
  const recommendedBlockExplanation = overview?.next_recommendation.physiological_analysis?.block_explanation;
  const recommendedReliabilityWarnings = overview?.next_recommendation.physiological_analysis?.reliability_warnings ?? [];
  useEffect(() => {
    if (!calendarPanelOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [calendarPanelOpen]);

  const scrollCalendarWeekIntoView = useCallback((weekStart: string, behavior: ScrollBehavior = "smooth") => {
    const scroller = calendarWeekScrollerRef.current;
    const section = calendarWeekSectionRefs.current[weekStart];
    if (!scroller || !section) return;
    const targetTop = Math.max(0, section.offsetTop - scroller.clientHeight * 0.18);
    scroller.scrollTo({ top: targetTop, behavior });
  }, []);

  const scrollCalendarMonthIntoView = useCallback((monthStart: string, behavior: ScrollBehavior = "smooth") => {
    const scroller = calendarMonthScrollerRef.current;
    const section = calendarMonthSectionRefs.current[monthStart];
    if (!scroller || !section) return;
    const targetTop = Math.max(0, section.offsetTop - scroller.clientHeight * 0.08);
    scroller.scrollTo({ top: targetTop, behavior });
  }, []);

  const jumpCalendarToToday = useCallback(() => {
    const today = isoDateFromToday();
    setCalendarMonth(startOfMonth(today));
    setSelectedCalendarDate(today);
  }, []);

  const openCalendarMesocycleComposer = useCallback((date: string) => {
    setSelectedCalendarDate(date);
    setBlockStartDate(date);
    setCalendarQuickAdd(null);
    setCalendarComposerDate(date);
  }, []);

  const closeCalendarMesocycleComposer = useCallback(() => {
    setCalendarComposerDate(null);
  }, []);

  const openCalendarQuickAdd = useCallback((date: string) => {
    setSelectedCalendarDate(date);
    setCalendarMonth(startOfMonth(date));
    setCalendarQuickAdd({ date, mode: "actions", selectedKind: "running", selectedDiscipline: "running" });
  }, []);

  const closeCalendarQuickAdd = useCallback(() => {
    setCalendarQuickAdd(null);
  }, []);

  const openCalendarWorkoutLibrary = useCallback((date: string, discipline: "running" | "ciclismo" | "natación") => {
    setSelectedCalendarDate(date);
    setCalendarMonth(startOfMonth(date));
    setCalendarQuickAdd({ date, mode: "library", selectedKind: discipline, selectedDiscipline: discipline });
  }, []);

  const openLibraryWorkoutPreview = useCallback((template: PlanningWorkoutTemplate) => {
    setCalendarQuickAdd(null);
    setOpenWorkoutPreview(buildLibraryWorkoutPreview(template, planningLt1, planningLt2, planningThresholdBasis));
  }, [planningLt1, planningLt2, planningThresholdBasis]);

  const shiftCalendarBackward = useCallback(() => {
    if (calendarVisualMode === "week") {
      const nextDate = addDays(selectedWeekStart, -7);
      setSelectedCalendarDate(nextDate);
      setCalendarMonth(startOfMonth(nextDate));
      return;
    }
    const targetMonth = startOfMonth(addMonths(calendarMonth, -1));
    setCalendarMonth(targetMonth);
  }, [calendarMonth, calendarVisualMode, selectedWeekStart]);

  const shiftCalendarForward = useCallback(() => {
    if (calendarVisualMode === "week") {
      const nextDate = addDays(selectedWeekStart, 7);
      setSelectedCalendarDate(nextDate);
      setCalendarMonth(startOfMonth(nextDate));
      return;
    }
    const targetMonth = startOfMonth(addMonths(calendarMonth, 1));
    setCalendarMonth(targetMonth);
  }, [calendarMonth, calendarVisualMode, selectedWeekStart]);

  const syncCalendarWeekSelectionFromScroll = useCallback(() => {
    const scroller = calendarWeekScrollerRef.current;
    if (!scroller) return;

    const viewportFocus = scroller.scrollTop + scroller.clientHeight * 0.32;
    let closestWeekStart = selectedWeekStart;
    let closestDistance = Number.POSITIVE_INFINITY;

    continuousWeekStarts.forEach((weekStart) => {
      const section = calendarWeekSectionRefs.current[weekStart];
      if (!section) return;
      const distance = Math.abs(section.offsetTop - viewportFocus);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestWeekStart = weekStart;
      }
    });

    if (closestWeekStart === selectedWeekStart) return;

    const nextDate = addDays(closestWeekStart, selectedWeekdayOffset);
    setSelectedCalendarDate(nextDate);
    setCalendarMonth(startOfMonth(nextDate));
  }, [continuousWeekStarts, selectedWeekStart, selectedWeekdayOffset]);

  const handleContinuousWeekScroll = useCallback(() => {
    if (calendarWeekScrollFrameRef.current != null) return;
    calendarWeekScrollFrameRef.current = window.requestAnimationFrame(() => {
      calendarWeekScrollFrameRef.current = null;
      syncCalendarWeekSelectionFromScroll();
    });
  }, [syncCalendarWeekSelectionFromScroll]);

  const syncCalendarMonthSelectionFromScroll = useCallback(() => {
    const scroller = calendarMonthScrollerRef.current;
    if (!scroller) return;

    const viewportFocus = scroller.scrollTop + scroller.clientHeight * 0.2;
    let closestMonth = calendarMonth;
    let closestDistance = Number.POSITIVE_INFINITY;

    continuousMonthStarts.forEach((monthStart) => {
      const section = calendarMonthSectionRefs.current[monthStart];
      if (!section) return;
      const distance = Math.abs(section.offsetTop - viewportFocus);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestMonth = monthStart;
      }
    });

    if (closestMonth !== calendarMonth) {
      setCalendarMonth(closestMonth);
    }
  }, [calendarMonth, continuousMonthStarts]);

  const handleContinuousMonthScroll = useCallback(() => {
    if (calendarMonthScrollFrameRef.current != null) return;
    calendarMonthScrollFrameRef.current = window.requestAnimationFrame(() => {
      calendarMonthScrollFrameRef.current = null;
      syncCalendarMonthSelectionFromScroll();
    });
  }, [syncCalendarMonthSelectionFromScroll]);

  useEffect(() => () => {
    if (calendarWeekScrollFrameRef.current != null) {
      window.cancelAnimationFrame(calendarWeekScrollFrameRef.current);
    }
  }, []);

  useEffect(() => () => {
    if (calendarMonthScrollFrameRef.current != null) {
      window.cancelAnimationFrame(calendarMonthScrollFrameRef.current);
    }
  }, []);

  useEffect(() => {
    if (calendarVisualMode !== "week") {
      calendarWeekAutoCenteredRef.current = false;
      return;
    }

    const scroller = calendarWeekScrollerRef.current;
    const selectedSection = calendarWeekSectionRefs.current[selectedWeekStart];
    if (!scroller || !selectedSection) return;

    const targetTop = Math.max(0, selectedSection.offsetTop - scroller.clientHeight * 0.18);
    const alreadyNearTarget = Math.abs(scroller.scrollTop - targetTop) < 36;

    if (!calendarWeekAutoCenteredRef.current) {
      scroller.scrollTo({ top: targetTop, behavior: "auto" });
      calendarWeekAutoCenteredRef.current = true;
      return;
    }

    if (!alreadyNearTarget) {
      scroller.scrollTo({ top: targetTop, behavior: "smooth" });
    }
  }, [calendarVisualMode, continuousWeekStarts, selectedWeekStart]);

  useEffect(() => {
    if (calendarVisualMode !== "month") {
      calendarMonthAutoCenteredRef.current = false;
      return;
    }

    const scroller = calendarMonthScrollerRef.current;
    const selectedSection = calendarMonthSectionRefs.current[calendarMonth];
    if (!scroller || !selectedSection) return;

    const targetTop = Math.max(0, selectedSection.offsetTop - scroller.clientHeight * 0.08);
    const alreadyNearTarget = Math.abs(scroller.scrollTop - targetTop) < 40;

    if (!calendarMonthAutoCenteredRef.current) {
      scroller.scrollTo({ top: targetTop, behavior: "auto" });
      calendarMonthAutoCenteredRef.current = true;
      return;
    }

    if (!alreadyNearTarget) {
      scroller.scrollTo({ top: targetTop, behavior: "smooth" });
    }
  }, [calendarMonth, calendarVisualMode, continuousMonthStarts]);

  if (loading) {
    return <div className="loading">Preparando planificación...</div>;
  }

  if (error) {
    return <div className="error">No se pudo cargar la planificación: {error}</div>;
  }

  if (calendarPanelOpen) {
    return (
      <div className="planning-calendar-overlay-page">
        <button type="button" className="planning-calendar-overlay-close" onClick={closeCalendarPanel} aria-label="Cerrar calendario">
          ×
        </button>

        <div className="planning-calendar-app">
        <header className="planning-calendar-app-topnav">
          <div className="planning-calendar-app-brand">PeakAerobic</div>
          <nav className="planning-calendar-app-nav">
            <button type="button" className="planning-calendar-app-tab" onClick={closeCalendarPanel}>Planificación</button>
            <button
              type="button"
              className={`planning-calendar-app-tab ${calendarWorkspaceTab === "athletes" ? "active" : ""}`}
              onClick={() => openCalendarWorkspaceTab("athletes")}
            >
              Atletas
            </button>
            <button
              type="button"
              className={`planning-calendar-app-tab ${calendarWorkspaceTab === "library" ? "active" : ""}`}
              onClick={() => openCalendarWorkspaceTab("library")}
            >
              Biblioteca
            </button>
            <button
              type="button"
              className={`planning-calendar-app-tab ${calendarWorkspaceTab === "calendar" ? "active" : ""}`}
              onClick={() => openCalendarWorkspaceTab("calendar")}
            >
              Calendario
            </button>
            <button
              type="button"
              className={`planning-calendar-app-tab ${calendarWorkspaceTab === "summary" ? "active" : ""}`}
              onClick={() => openCalendarWorkspaceTab("summary")}
            >
              Resumen
            </button>
            <button type="button" className="planning-calendar-app-tab">Panel de control</button>
          </nav>
          <div className="planning-calendar-app-user">
            <span>{overview ? firstName(overview.athlete_name) : "Atleta"}</span>
            <button type="button" className="planning-calendar-back subtle" onClick={closeCalendarPanel}>
              Volver
            </button>
          </div>
        </header>

        <div className="planning-calendar-app-body">
          <section className="planning-calendar-app-workspace">
            {calendarWorkspaceTab === "athletes" ? (
              <>
                <div className="planning-calendar-app-toolbar">
                  <div className="planning-calendar-toolbar-left">
                    <div className="planning-calendar-toolbar-heading">
                      <strong>Selector de atletas</strong>
                      <p>Cambia de atleta sin salir del entorno de calendario y conserva la misma lectura visual.</p>
                    </div>
                  </div>
                  <div className="planning-calendar-toolbar-center">
                    <button type="button" className="planning-calendar-athlete-chip">
                      {selectedAthlete ? `${selectedAthlete.name} · ${disciplineLabel(selectedDiscipline)}` : "Sin atleta"}
                    </button>
                  </div>
                  <div className="planning-calendar-toolbar-right">
                    <button type="button" className="planning-inline-action" onClick={() => openCalendarWorkspaceTab("calendar")}>
                      Ir al calendario
                    </button>
                  </div>
                </div>

                <div className="planning-calendar-app-content">
                  <section className="planning-calendar-app-main planning-workspace-main">
                    <div className="planning-workspace-grid planning-athlete-selection-grid">
                      {athletes.map((athlete) => {
                        const athleteDiscipline = athlete.primary_discipline === "triatlón" ? "running" : athlete.primary_discipline ?? "running";
                        const isSelected = String(athlete.id) === String(selectedAthlete?.id);
                        const activeBlock = athlete.focus_blocks?.find((block) => block.status === "active");
                        return (
                          <button
                            key={athlete.id}
                            type="button"
                            className={`planning-workspace-card planning-athlete-selection-card ${isSelected ? "selected" : ""}`}
                            onClick={() => updatePlanningRoute(String(athlete.id), athleteDiscipline)}
                          >
                            <div className="planning-athlete-selection-head">
                              <div>
                                <span className="planning-kicker">{disciplineLabel(athlete.primary_discipline)}</span>
                                <strong>{athlete.name}</strong>
                              </div>
                              <span className={`status-badge ${isSelected ? "positive" : "neutral"}`}>
                                {isSelected ? "Activo" : athlete.goal_category ?? "Coach"}
                              </span>
                            </div>
                            <p>{athlete.training_goal || athlete.notes || "Sin briefing cargado todavía."}</p>
                            <div className="planning-athlete-selection-meta">
                              <article>
                                <small>Bloque</small>
                                <strong>{activeBlock ? activeBlock.block_objective : "Sin foco"}</strong>
                              </article>
                              <article>
                                <small>Objetivo</small>
                                <strong>{nextTargetLabelFromAthlete(athlete)}</strong>
                              </article>
                              <article>
                                <small>Conectado</small>
                                <strong>{athlete.strava_connected || athlete.garmin_connected ? "Sí" : "No"}</strong>
                              </article>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <aside className="planning-calendar-app-summary">
                    <div className="planning-calendar-summary-panel">
                      <span className="planning-kicker">Atleta activo</span>
                      <div className="planning-calendar-summary-stats">
                        <article>
                          <small>Nombre</small>
                          <strong>{selectedAthlete?.name || "Sin atleta"}</strong>
                        </article>
                        <article>
                          <small>Disciplina</small>
                          <strong>{selectedAthlete ? disciplineLabel(selectedAthlete.primary_discipline) : "Sin disciplina"}</strong>
                        </article>
                        <article>
                          <small>Bloque actual</small>
                          <strong>{activeBlockLabel}</strong>
                        </article>
                        <article>
                          <small>Target</small>
                          <strong>{nextTargetPrimaryLabel}</strong>
                        </article>
                      </div>
                    </div>

                    <div className="planning-calendar-day-panel">
                      <span className="planning-kicker">Próximos objetivos</span>
                      <div className="planning-day-stack">
                        {visibleTargets.length ? visibleTargets.map((target) => (
                          <article key={target.id} className="planning-day-card">
                            <strong>{target.objective}</strong>
                            <p>{target.distance_label || disciplineLabel(target.discipline)}</p>
                            <small>{formatDate(target.target_date)}</small>
                          </article>
                        )) : (
                          <article className="planning-day-card empty">
                            <strong>Sin objetivos próximos</strong>
                            <p>Añade una fecha objetivo para ordenar mejor la selección del bloque.</p>
                          </article>
                        )}
                      </div>
                    </div>
                  </aside>
                </div>
              </>
            ) : calendarWorkspaceTab === "library" ? (
              <>
                <div className="planning-calendar-app-toolbar">
                  <div className="planning-calendar-toolbar-left">
                    <div className="planning-calendar-toolbar-heading">
                      <strong>Biblioteca de mesociclos</strong>
                      <p>Consulta qué bloques existen, cuál encaja ahora y qué mesociclos ya se detectaron en el histórico.</p>
                    </div>
                  </div>
                  <div className="planning-calendar-toolbar-center">
                    <button type="button" className="planning-calendar-athlete-chip">
                      {overview ? `${firstName(overview.athlete_name)} · ${disciplineLabel(selectedDiscipline)}` : "Sin atleta"}
                    </button>
                  </div>
                  <div className="planning-calendar-toolbar-right">
                    <button type="button" className="planning-inline-action" onClick={() => openCalendarWorkspaceTab("calendar")}>
                      Ver calendario
                    </button>
                  </div>
                </div>

                <div className="planning-calendar-app-content">
                  <section className="planning-calendar-app-main planning-workspace-main">
                    <div className="planning-workspace-section">
                      <div className="planning-workspace-section-head">
                        <span className="planning-kicker">Plantillas disponibles</span>
                        <strong>{templateLibrary.length} mesociclos utilizables</strong>
                      </div>
                      <div className="planning-workspace-grid planning-library-grid">
                        {templateLibrary.map((template) => {
                          const isSelected = template.template_id === selectedTemplate?.template_id;
                          const isRecommended = template.template_id === overview?.next_recommendation.template_id;
                          return (
                            <button
                              key={template.template_id}
                              type="button"
                              className={`planning-workspace-card planning-library-card ${isSelected ? "selected" : ""}`}
                              onClick={() => {
                                setSelectedTemplateId(template.template_id);
                                setSelectedLibrarySourceId("");
                              }}
                            >
                              <div className="planning-athlete-selection-head">
                                <div>
                                  <span className="planning-kicker">{template.block_type.replace(/_/g, " ")}</span>
                                  <strong>{template.public_label}</strong>
                                </div>
                                <span className={`status-badge ${isRecommended ? "positive" : "neutral"}`}>
                                  {isRecommended ? "Recomendada" : `${template.typical_duration_weeks_min}-${template.typical_duration_weeks_max} sem`}
                                </span>
                              </div>
                              <p>{template.summary}</p>
                              <div className="planning-athlete-selection-meta">
                                <article>
                                  <small>Foco</small>
                                  <strong>{template.primary_focus}</strong>
                                </article>
                                <article>
                                  <small>Estructura</small>
                                  <strong>{template.typical_structure}</strong>
                                </article>
                                <article>
                                  <small>Sesiones clave</small>
                                  <strong>{template.key_session_families.slice(0, 2).join(" · ") || "n/d"}</strong>
                                </article>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="planning-workspace-section">
                      <div className="planning-workspace-section-head">
                        <span className="planning-kicker">Mesociclos detectados</span>
                        <strong>{overview?.detected_mesocycles.length ?? 0} bloques en el histórico</strong>
                      </div>
                      <div className="planning-workspace-grid planning-history-grid">
                        {(overview?.detected_mesocycles ?? []).length ? (overview?.detected_mesocycles ?? []).map((block) => {
                          const sourceId = `historical-${block.start_date}-${block.block_type}`;
                          const matchingSource = calendarSources.find((source) => source.id === sourceId);
                          const isSelected = selectedLibrarySourceId === sourceId;
                          return (
                          <button
                            key={`${block.start_date}-${block.block_type}`}
                            type="button"
                            className={`planning-workspace-card planning-history-card ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              if (matchingSource) {
                                openMesocycleLibraryFromSource(matchingSource);
                                return;
                              }
                              setSelectedLibrarySourceId(sourceId);
                            }}
                          >
                            <span className="planning-kicker">{disciplineLabel(block.discipline)}</span>
                            <strong>{block.block_label}</strong>
                            <p>{block.explanation[0] || "Mesociclo detectado a partir del patrón de sesiones."}</p>
                            <div className="planning-athlete-selection-meta">
                              <article>
                                <small>Fechas</small>
                                <strong>{formatShortDate(block.start_date)} - {formatShortDate(block.end_date)}</strong>
                              </article>
                              <article>
                                <small>Semanas</small>
                                <strong>{block.weeks_count}</strong>
                              </article>
                              <article>
                                <small>Sesiones</small>
                                <strong>{block.session_count}</strong>
                              </article>
                            </div>
                          </button>
                        );
                        }) : (
                          <article className="planning-empty-state">
                            <strong>Sin histórico suficiente todavía.</strong>
                            <p>Cuando el atleta acumule sesiones comparables aparecerán aquí los mesociclos detectados.</p>
                          </article>
                        )}
                      </div>
                    </div>
                  </section>

                  <aside className="planning-calendar-app-summary">
                    <div className="planning-calendar-summary-panel">
                      <span className="planning-kicker">Mesociclo seleccionado</span>
                      <div className="planning-calendar-summary-stats">
                        <article>
                          <small>Bloque</small>
                          <strong>{activeLibraryTemplate?.public_label || "Sin selección"}</strong>
                        </article>
                        {selectedLibrarySource ? (
                          <article>
                            <small>Abierto desde</small>
                            <strong>{selectedLibrarySource.kind === "planned" ? "Bloque real" : selectedLibrarySource.kind === "historical" ? "Histórico detectado" : "Borrador"}</strong>
                          </article>
                        ) : null}
                        <article>
                          <small>Foco primario</small>
                          <strong>{activeLibraryTemplate?.primary_focus || "Sin foco"}</strong>
                        </article>
                        <article>
                          <small>Regla principal</small>
                          <strong>{activeLibraryTemplate?.progression_rules[0] || "Sin regla"}</strong>
                        </article>
                        <article>
                          <small>Entrada</small>
                          <strong>{activeLibraryTemplate?.entry_checks[0] || "Sin chequeo"}</strong>
                        </article>
                      </div>
                    </div>

                    <div className="planning-calendar-warning-panel">
                      <span className="planning-kicker">{selectedLibrarySource ? "Lectura del bloque abierto" : "Por qué encaja ahora"}</span>
                      <div className="planning-day-stack">
                        {selectedLibraryWhyNow.slice(0, 4).map((reason) => (
                          <article key={reason} className="planning-day-card">
                            <strong>{reason}</strong>
                          </article>
                        ))}
                        {!selectedLibraryWhyNow.length ? (
                          <article className="planning-day-card empty">
                            <strong>Sin explicación disponible</strong>
                            <p>No hay razones adicionales guardadas para este mesociclo.</p>
                          </article>
                        ) : null}
                      </div>
                    </div>

                    {activeLibraryTemplate ? (
                      <div className="planning-calendar-day-panel">
                        <span className="planning-kicker">Explicación del mesociclo</span>
                        <div className="planning-day-stack">
                          <article className="planning-day-card">
                            <strong>Resumen</strong>
                            <p>{activeLibraryTemplate.summary}</p>
                          </article>
                          <article className="planning-day-card">
                            <strong>Rationale CSV</strong>
                            <p>{activeLibraryTemplate.csv_rationale}</p>
                          </article>
                          <article className="planning-day-card">
                            <strong>Rationale evidencia</strong>
                            <p>{activeLibraryTemplate.evidence_rationale}</p>
                          </article>
                        </div>
                      </div>
                    ) : null}

                    {selectedLibraryHistoricalBlock ? (
                      <div className="planning-calendar-day-panel">
                        <span className="planning-kicker">Lectura histórica detectada</span>
                        <div className="planning-day-stack">
                          {selectedLibraryHistoricalBlock.explanation.map((line) => (
                            <article key={line} className="planning-day-card">
                              <strong>{line}</strong>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {!!selectedLibraryPlannedSessions.length && (
                      <div className="planning-calendar-day-panel">
                        <span className="planning-kicker">Sesiones dentro del bloque</span>
                        <div className="planning-day-stack">
                          {selectedLibraryPlannedSessions.map((session) => (
                            <article key={session.id} className="planning-day-card">
                              <div className="planning-day-card-top">
                                <strong>{formatShortDate(session.scheduled_date)} · {session.public_label}</strong>
                                <span className={`status-badge ${planningPublishStatusMeta(session.publish_status).tone}`}>
                                  {planningPublishStatusMeta(session.publish_status).label}
                                </span>
                              </div>
                              <p>{session.objective}</p>
                              <small>{session.dose_prescription}</small>
                              {session.publish_error ? <small>{session.publish_error}</small> : null}
                              <div className="planning-session-inline-actions">
                                <button type="button" className="planning-inline-action" onClick={() => openPlannedWorkoutPreview(session.id)}>
                                  Abrir preview
                                </button>
                                <button type="button" className="planning-inline-action" onClick={() => openPlannedWorkoutRawInformation(session.id)}>
                                  Ver raw
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeLibraryTemplate ? (
                      <div className="planning-calendar-day-panel">
                        <span className="planning-kicker">Reglas y control</span>
                        <div className="planning-day-stack">
                          {activeLibraryTemplate.progression_rules.slice(0, 3).map((rule) => (
                            <article key={rule} className="planning-day-card">
                              <strong>{rule}</strong>
                            </article>
                          ))}
                          {activeLibraryTemplate.exit_checks.slice(0, 2).map((check) => (
                            <article key={check} className="planning-day-card">
                              <strong>{check}</strong>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {selectedLibraryCompatibleWorkouts.length ? (
                      <div className="planning-calendar-day-panel">
                        <span className="planning-kicker">Librería compatible del mesociclo</span>
                        <div className="planning-day-stack">
                          {selectedLibraryCompatibleWorkouts.slice(0, 10).map((template) => (
                            <article key={template.template_id} className="planning-day-card">
                              <strong>{template.public_label}</strong>
                              <p>{template.summary}</p>
                              <small>{template.session_role} · {template.session_family}</small>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </aside>
                </div>
              </>
            ) : calendarWorkspaceTab === "summary" ? (
              <>
                <div className="planning-calendar-app-toolbar">
                  <div className="planning-calendar-toolbar-left">
                    <div className="planning-calendar-toolbar-heading">
                      <strong>Resumen de progresión</strong>
                      <p>Lectura rápida de cómo evolucionan tus atletas y quién necesita atención primero.</p>
                    </div>
                  </div>
                  <div className="planning-calendar-toolbar-center">
                    <button type="button" className="planning-calendar-athlete-chip">
                      {rosterAnalysesLoading ? "Actualizando..." : `${rosterProgressRows.length} atletas`}
                    </button>
                  </div>
                  <div className="planning-calendar-toolbar-right">
                    <button type="button" className="planning-inline-action" onClick={() => openCalendarWorkspaceTab("athletes")}>
                      Cambiar atleta
                    </button>
                  </div>
                </div>

                <div className="planning-calendar-app-content">
                  <section className="planning-calendar-app-main planning-workspace-main">
                    <div className="planning-workspace-grid planning-summary-grid">
                      {rosterProgressRows.map((row) => {
                        const athleteDiscipline = row.athlete.primary_discipline === "triatlón" ? "running" : row.athlete.primary_discipline ?? "running";
                        return (
                          <article
                            key={row.athlete.id}
                            className={`planning-workspace-card planning-summary-card rich ${row.tone}`}
                          >
                            <div className="planning-athlete-selection-head">
                              <div>
                                <span className="planning-kicker">{disciplineLabel(row.athlete.primary_discipline)}</span>
                                <strong>{row.athlete.name}</strong>
                              </div>
                              <span className={`status-badge ${row.tone === "positive" ? "positive" : row.tone === "warning" ? "warning" : "neutral"}`}>
                                {row.directionLabel}
                              </span>
                            </div>
                            <p>{row.summary}</p>
                            <div className="planning-summary-quickviews">
                              <article className="planning-summary-quickview">
                                <div className="planning-summary-quickview-head">
                                  <span>Actividad 7d</span>
                                  <strong>{row.quickLoadBars.filter((bar) => bar.value > 0).length} días activos</strong>
                                </div>
                                <div className="planning-summary-mini-bars">
                                  {row.quickLoadBars.map((bar) => (
                                    <div key={`${row.athlete.id}-${bar.label}-load`} className={`planning-summary-mini-bar ${bar.tone}`}>
                                      <span style={{ height: `${Math.max(18, Math.round(bar.value * 100))}%` }} />
                                      <small>{bar.label}</small>
                                    </div>
                                  ))}
                                </div>
                              </article>
                              <article className="planning-summary-quickview thresholds">
                                <div className="planning-summary-quickview-head">
                                  <span>LT1 / LT2</span>
                                  <strong>{row.thresholdDisciplineLabel}</strong>
                                </div>
                                <div className="planning-summary-threshold-stack">
                                  <div className="planning-summary-threshold-row">
                                    <small>LT1</small>
                                    <strong>{row.lt1Label}</strong>
                                    <span>{row.lt1Hint}</span>
                                  </div>
                                  <div className="planning-summary-threshold-row">
                                    <small>LT2</small>
                                    <strong>{row.lt2Label}</strong>
                                    <span>{row.lt2Hint}</span>
                                  </div>
                                </div>
                              </article>
                              <article className="planning-summary-quickview">
                                <div className="planning-summary-quickview-head">
                                  <span>Quick view</span>
                                  <strong>{row.blockMetricLabel}</strong>
                                </div>
                                <div className="planning-summary-mini-bars compact">
                                  {row.confidenceBars.map((bar) => (
                                    <div key={`${row.athlete.id}-${bar.label}-confidence`} className={`planning-summary-mini-bar ${bar.tone}`}>
                                      <span style={{ height: `${Math.max(18, Math.round(bar.value * 100))}%` }} />
                                      <small>{bar.label}</small>
                                    </div>
                                  ))}
                                </div>
                                <p className="planning-summary-quickview-note">{row.blockMetricHint}</p>
                              </article>
                            </div>
                            <div className="planning-athlete-selection-meta">
                              <article>
                                <small>Snapshot</small>
                                <strong>{row.snapshotLabel}</strong>
                              </article>
                              <article>
                                <small>Confidence</small>
                                <strong>{row.confidenceLabel}</strong>
                              </article>
                              <article>
                                <small>Objetivo</small>
                                <strong>{row.nextTarget}</strong>
                              </article>
                            </div>
                            <div className="planning-summary-actions">
                              <button
                                type="button"
                                className="planning-inline-action"
                                onClick={() => {
                                  updatePlanningRoute(String(row.athlete.id), athleteDiscipline);
                                  openCalendarWorkspaceTab("calendar");
                                }}
                              >
                                Ver calendario
                              </button>
                              <Link className="ghost-button" to={`/athletes/${row.athlete.id}`}>
                                Abrir ficha
                              </Link>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>

                  <aside className="planning-calendar-app-summary">
                    <div className="planning-calendar-summary-panel">
                      <span className="planning-kicker">Estado global</span>
                      <div className="planning-calendar-summary-stats">
                        <article>
                          <small>Mejorando</small>
                          <strong>{rosterProgressStats.improving}</strong>
                        </article>
                        <article>
                          <small>Estables</small>
                          <strong>{rosterProgressStats.stable}</strong>
                        </article>
                        <article>
                          <small>A vigilar</small>
                          <strong>{rosterProgressStats.warning}</strong>
                        </article>
                        <article>
                          <small>Atleta activo</small>
                          <strong>{selectedAthlete?.name || "Sin atleta"}</strong>
                        </article>
                      </div>
                    </div>

                    <div className="planning-calendar-day-panel">
                      <span className="planning-kicker">Foco actual</span>
                      <div className="planning-day-stack">
                        <article className="planning-day-card">
                          <strong>{selectedRosterRow?.currentBlock || "Sin bloque activo"}</strong>
                          <p>{selectedRosterRow?.summary || "Selecciona un atleta para ver más contexto."}</p>
                        </article>
                        {selectedRosterRow ? (
                          <article className="planning-day-card">
                            <span className="planning-kicker">Quick view LT1 / LT2</span>
                            <div className="planning-summary-threshold-stack compact">
                              <div className="planning-summary-threshold-row">
                                <small>LT1</small>
                                <strong>{selectedRosterRow.lt1Label}</strong>
                                <span>{selectedRosterRow.lt1Hint}</span>
                              </div>
                              <div className="planning-summary-threshold-row">
                                <small>LT2</small>
                                <strong>{selectedRosterRow.lt2Label}</strong>
                                <span>{selectedRosterRow.lt2Hint}</span>
                              </div>
                            </div>
                            <p className="planning-summary-quickview-note">{selectedRosterRow.blockMetricHint}</p>
                            <Link className="ghost-button" to={`/athletes/${selectedRosterRow.athlete.id}`}>
                              Abrir ficha del atleta
                            </Link>
                          </article>
                        ) : null}
                      </div>
                    </div>
                  </aside>
                </div>
              </>
            ) : calendarComposerDate ? (
              <div className="planning-calendar-composer-shell">
                <div className="planning-calendar-app-toolbar planner">
                  <div className="planning-calendar-toolbar-left">
                    <div className="planning-calendar-toolbar-heading">
                      <strong>Crear mesociclo</strong>
                      <p>{formatDate(calendarComposerDate)} · compara opciones y activa la que mejor encaja ahora</p>
                    </div>
                  </div>

                  <div className="planning-calendar-toolbar-center">
                    <button type="button" className="planning-calendar-athlete-chip">
                      {overview ? firstName(overview.athlete_name) : "Atleta"}
                    </button>
                  </div>

                  <div className="planning-calendar-toolbar-right">
                    <button type="button" className="planning-inline-action" onClick={closeCalendarMesocycleComposer}>
                      Volver al calendario
                    </button>
                  </div>
                </div>

                <div className="planning-calendar-composer-content">
                  <section className="planning-calendar-composer-main">
                    <div className="planning-calendar-composer-hero">
                      <article className="planning-calendar-composer-recommendation">
                        <span className="planning-kicker">Mejor opción ahora</span>
                        <strong>
                          {overview?.next_recommendation.recommended_block_label || selectedComposerOption?.template.public_label || "Sin recomendación"}
                          {overview?.next_recommendation.physiological_analysis?.borderline && (
                            <span className="borderline-badge" title={overview.next_recommendation.physiological_analysis.borderline_note || "Caso límite: dos bloques son casi equivalentes"}> ~ caso límite</span>
                          )}
                        </strong>
                        <p className="planning-calendar-composer-headline">
                          {recommendedBlockExplanation?.headline
                            || overview?.next_recommendation.physiological_analysis?.block_rationale?.summary_coach
                            || overview?.next_recommendation.template_summary
                            || overview?.next_recommendation.reasoning?.[0]
                            || "Sin explicación prioritaria disponible."}
                        </p>
                        <div className="planning-calendar-composer-tags">
                          <span className="planning-chip">{overview?.next_recommendation.primary_focus || selectedComposerOption?.template.primary_focus || "Sin foco"}</span>
                          <span className="planning-chip">{overview?.next_recommendation.duration_weeks || weeks} semanas</span>
                          <span className="planning-chip">{overview?.next_recommendation.physiological_analysis?.confidence_band || "confianza media"}</span>
                        </div>
                        {recommendedBlockExplanation ? (
                          <div className="planning-calendar-composer-insight-grid">
                            <article>
                              <span>Por qué ahora</span>
                              <p>{recommendedBlockExplanation.why_now}</p>
                            </article>
                            <article>
                              <span>Qué esperar</span>
                              <p>{recommendedBlockExplanation.what_to_expect}</p>
                            </article>
                            <article>
                              <span>Qué vigilar</span>
                              <p>{recommendedBlockExplanation.what_to_watch}</p>
                            </article>
                            <article>
                              <span>Cuándo salir</span>
                              <p>{recommendedBlockExplanation.when_to_exit}</p>
                            </article>
                          </div>
                        ) : null}
                      </article>

                      <article className="planning-calendar-composer-context">
                        <span className="planning-kicker">Contexto</span>
                        <p className="planning-calendar-composer-context-line">
                          <strong>Target:</strong> {nextTargetPrimaryLabel}
                          <span>·</span>
                          <strong>Fecha objetivo:</strong> {nextTargetLabel}
                          <span>·</span>
                          <strong>Primary limiter:</strong> {overview?.next_recommendation.physiological_analysis?.primary_limiter || primaryWeakness}
                          <span>·</span>
                          <strong>Secondary limiter:</strong> {overview?.next_recommendation.physiological_analysis?.secondary_limiter || secondaryWeakness}
                        </p>
                      </article>
                    </div>

                    <div className="planning-calendar-composer-options">
                      {calendarMesocycleOptions.map((option, index) => {
                        const isSelected = option.template.template_id === (selectedComposerOption?.template.template_id ?? selectedTemplateId);
                        return (
                          <button
                            key={option.template.template_id}
                            type="button"
                            className={`planning-calendar-composer-option ${option.isBest ? "best" : ""} ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              setSelectedTemplateId(option.template.template_id);
                              setBlockIntent(option.template.summary);
                              setCoachNotes(option.template.control_points.join(" · "));
                              setWeeks(String(
                                overview?.next_recommendation.duration_weeks
                                && overview.next_recommendation.duration_weeks >= option.template.typical_duration_weeks_min
                                && overview.next_recommendation.duration_weeks <= option.template.typical_duration_weeks_max
                                  ? overview.next_recommendation.duration_weeks
                                  : option.template.typical_duration_weeks_min,
                              ));
                            }}
                          >
                            <div className="planning-calendar-composer-option-head">
                              <div>
                                <span className="planning-kicker">{option.isBest ? "Prioridad del sistema" : `Alternativa ${index + 1}`}</span>
                                <strong>{option.template.public_label}</strong>
                                <p>{option.whyItFits[0] || option.template.primary_focus}</p>
                              </div>
                              <div className="planning-calendar-composer-option-score">
                                <span>{option.score != null ? `${option.score} pts` : "sin score"}</span>
                              </div>
                            </div>

                            <div className="planning-calendar-composer-option-columns">
                              {option.whyItFits.length ? (
                                <article>
                                  <span>{option.isBest ? "Lectura fisiológica" : "Encaje"}</span>
                                  <ul className="planning-note-list">
                                    {option.whyItFits.slice(0, 2).map((line) => <li key={line}>{line}</li>)}
                                  </ul>
                                </article>
                              ) : null}
                              {option.whyNotAsGood.length ? (
                                <article>
                                  <span>{option.isBest ? "Trade-off" : "Qué penaliza"}</span>
                                  <ul className="planning-note-list">
                                    {option.whyNotAsGood.slice(0, 2).map((line) => <li key={line}>{line}</li>)}
                                  </ul>
                                </article>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <aside className="planning-calendar-composer-sidebar">
                    <article className="planning-calendar-composer-sidecard">
                      <span className="planning-kicker">Opción elegida</span>
                      <strong>{selectedComposerOption?.template.public_label || "Sin selección"}</strong>
                      <p>
                        {selectedComposerOption?.isBest
                          ? recommendedBlockExplanation?.what_to_expect
                          || overview?.next_recommendation.physiological_analysis?.block_rationale?.physiological_goal
                          || selectedComposerOption?.template.summary
                          : selectedComposerOption?.template.summary
                          || "Elige una opción para revisar su lógica antes de activarla."}
                      </p>
                      <div className="planning-chip-row">
                        {selectedComposerOption?.template.primary_focus ? <span className="planning-chip">{selectedComposerOption.template.primary_focus}</span> : null}
                        {selectedComposerOption?.template.typical_structure ? <span className="planning-chip">{selectedComposerOption.template.typical_structure}</span> : null}
                        {selectedComposerOption ? <span className="planning-chip">{selectedComposerOption.template.typical_duration_weeks_min}-{selectedComposerOption.template.typical_duration_weeks_max} semanas</span> : null}
                      </div>
                    </article>

                    {selectedComposerOption?.isBest && recommendedBlockExplanation ? (
                      <article className="planning-calendar-composer-sidecard">
                        <span className="planning-kicker">Lectura del bloque</span>
                        <div className="planning-calendar-composer-mini-grid">
                          <article>
                            <span>Adaptación</span>
                            <p>{recommendedBlockExplanation.what_to_expect}</p>
                          </article>
                          {recommendedReliabilityWarnings.length > 0 && (
                            <article>
                              <span>Alternativa</span>
                              <p>{recommendedBlockExplanation.alternative_if_wrong}</p>
                            </article>
                          )}
                        </div>
                      </article>
                    ) : null}

                    {recommendedReliabilityWarnings.length ? (
                      <article className="planning-calendar-composer-sidecard">
                        <span className="planning-kicker">Fiabilidad de la recomendación</span>
                        <div className="reliability-warnings">
                          {recommendedReliabilityWarnings.slice(0, 3).map((warning) => (
                            <div key={warning.code} className={`warning-item warning-${warning.severity}`}>
                              <span className="warning-icon">
                                {warning.severity === 'critical' ? '🔴' : warning.severity === 'warning' ? '🟡' : 'ℹ️'}
                              </span>
                              <div>
                                <p className="warning-message">{warning.message}</p>
                                <p className="warning-actionable">{warning.actionable}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    ) : null}

                    <article className="planning-calendar-composer-sidecard">
                      <span className="planning-kicker">Duración del bloque</span>

                      {/* Duración auto-calculada por el motor — el entrenador solo ajusta si quiere */}
                      <div className="composer-duration-row">
                        <button
                          type="button"
                          className="composer-duration-btn"
                          onClick={() => setWeeks((w) => String(Math.max(1, Number(w) - 1)))}
                        >−</button>
                        <span className="composer-duration-value">
                          <strong>{weeks}</strong> semanas
                        </span>
                        <button
                          type="button"
                          className="composer-duration-btn"
                          onClick={() => setWeeks((w) => String(Math.min(12, Number(w) + 1)))}
                        >+</button>
                      </div>

                      {/* Rango recomendado por Olbrecht para este bloque */}
                      {selectedTemplate && (
                        <p className="composer-duration-hint">
                          Rango óptimo: {selectedTemplate.typical_duration_weeks_min}–{selectedTemplate.typical_duration_weeks_max} semanas
                          {Number(weeks) < selectedTemplate.typical_duration_weeks_min && (
                            <span className="composer-duration-warn"> · muy corto para adaptación estructural</span>
                          )}
                          {Number(weeks) > selectedTemplate.typical_duration_weeks_max && (
                            <span className="composer-duration-warn"> · riesgo de estancamiento por exceso</span>
                          )}
                        </p>
                      )}

                      {/* Nota opcional del entrenador */}
                      <label style={{marginTop: "12px"}}>
                        Nota (opcional)
                        <textarea
                          rows={2}
                          placeholder="Observaciones del entrenador para este bloque..."
                          value={blockIntent}
                          onChange={(event) => setBlockIntent(event.target.value)}
                        />
                      </label>

                      {saveError ? <p className="error">{saveError}</p> : null}
                      {saveMessage ? <p>{saveMessage}</p> : null}
                      <button
                        type="button"
                        className="primary-button"
                        disabled={saving || !athleteId || !selectedComposerOption}
                        onClick={async () => {
                          const saved = await saveFocusBlockFromPlanning();
                          if (saved) closeCalendarMesocycleComposer();
                        }}
                      >
                        {saving ? "Creando..." : "Crear mesociclo"}
                      </button>
                    </article>
                  </aside>
                </div>
              </div>
            ) : (
              <>
                <div className="planning-calendar-app-toolbar">
                  <div className="planning-calendar-toolbar-left">
                    <div className="planning-calendar-toolbar-heading">
                      <strong>{calendarToolbarHeading}</strong>
                      <p>{calendarToolbarSubheading}</p>
                    </div>
                    <div className="planning-calendar-toolbar-nav">
                      <button type="button" className="planning-inline-action" onClick={jumpCalendarToToday}>
                        Hoy
                      </button>
                      <button type="button" className="planning-inline-action" onClick={shiftCalendarBackward}>
                        &lt;
                      </button>
                      <button type="button" className="planning-inline-action" onClick={shiftCalendarForward}>
                        &gt;
                      </button>
                    </div>
                  </div>

                  <div className="planning-calendar-toolbar-center">
                    <button type="button" className="planning-calendar-athlete-chip">
                      {overview ? firstName(overview.athlete_name) : "Atleta"}
                    </button>
                  </div>

                  <div className="planning-calendar-toolbar-right">
                    <div className="training-calendar-view-switch">
                      <button
                        type="button"
                        className={`planning-inline-action ${calendarVisualMode === "month" ? "active" : ""}`}
                        onClick={() => setCalendarVisualMode("month")}
                      >
                        Mes
                      </button>
                      <button
                        type="button"
                        className={`planning-inline-action ${calendarVisualMode === "week" ? "active" : ""}`}
                        onClick={() => setCalendarVisualMode("week")}
                      >
                        Semana
                      </button>
                    </div>
                  </div>
                </div>

                <div className="planning-calendar-app-content calendar-full">
                  <section className={`planning-calendar-app-main ${calendarVisualMode === "month" ? "month-mode" : ""}`}>
                    {calendarVisualMode === "month" ? (
                      <div className="planning-calendar-month-stream planning-calendar-month-fixed">
                        {continuousMonthSections.filter((s) => s.monthStart === calendarMonth).map((monthSection) => (
                          <section
                            key={monthSection.monthStart}
                            className="planning-calendar-month-section active"
                          >
                            <div className="planning-calendar-month-section-head">
                              <strong>{monthHeading(monthSection.monthStart)}</strong>
                              <small>
                                {monthSection.totalSessions
                                  ? `${formatMinutesCompact(monthSection.totalMinutes)} · ${monthSection.totalSessions} sesiones visibles`
                                  : "Sin sesiones visibles todavía"}
                              </small>
                            </div>

                            <div className="planning-calendar-month-board">
                              <div className="planning-calendar-month-header">
                                {["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"].map((day) => (
                                  <span key={`${monthSection.monthStart}-${day}`} className="planning-calendar-app-weekday">{day}</span>
                                ))}
                                <span className="planning-calendar-month-summary-heading">Carga semanal</span>
                              </div>

                              <div className="planning-calendar-month-rows">
                                {monthSection.rows.map((week) => {
                                  const isSelectedWeek = week.weekStart === selectedWeekStart;
                                  const disciplineRows = ["running", "ciclismo", "natación"].map((discipline) => ({
                                    discipline,
                                    minutes: week.snapshot.disciplineMetrics.find((metric) => metric.discipline === discipline)?.minutes ?? 0,
                                  }));

                                  return (
                                    <section
                                      key={`month-row-${monthSection.monthStart}-${week.weekStart}`}
                                      className={`planning-calendar-month-row ${isSelectedWeek ? "selected" : ""}`}
                                    >
                                      <div className="planning-calendar-month-row-grid">
                                        {week.cells.map((cell) => {
                                          if (!cell.date) {
                                            return <span key={cell.id} className="planning-calendar-app-spacer" aria-hidden="true" />;
                                          }
                                          const day = cell.date;
                                          const daySessions = sessionsByDate.get(day) ?? [];
                                          const primaryDaySessions = daySessions.filter((session) => !session.isOverlay);
                                          const overlayDaySessions = daySessions.filter((session) => session.isOverlay);
                                          const isSelected = selectedCalendarDate === day;
                                          const isInBlock = dateValue(day) >= dateValue(selectedCalendarSource.startDate) && dateValue(day) <= dateValue(selectedCalendarSource.endDate);
                                          const isToday = day === isoDateFromToday();
                                          return (
                                            <article
                                              key={cell.id}
                                              className={`planning-calendar-app-day ${isSelected ? "selected" : ""} ${isInBlock ? "in-block" : ""}`}
                                            >
                                              <button type="button" className={`planning-calendar-app-day-label ${isToday ? "today" : ""}`} onClick={() => setSelectedCalendarDate(day)}>
                                                {isToday ? `Hoy ${monthDayLabel(day)}` : monthDayLabel(day)}
                                              </button>
                                              <div className="planning-calendar-app-day-stack">
                                                {primaryDaySessions.map((session) => (
                                                  <button
                                                    key={session.id}
                                                    type="button"
                                                    className={`planning-calendar-app-session ${session.layerDiscipline === "running" ? "running" : session.layerDiscipline === "ciclismo" ? "cycling" : session.layerDiscipline === "natación" ? "swimming" : ""} ${session.sessionType === "clave" ? "key" : ""}`}
                                                    onClick={() => openCalendarSessionDetail(session)}
                                                  >
                                                    <div className="planning-session-card-head">
                                                      <span>{session.sessionType}</span>
                                                      {session.publishStatus ? (
                                                        <span className={`planning-session-publish-badge ${planningPublishStatusMeta(session.publishStatus).tone}`}>
                                                          {planningPublishStatusMeta(session.publishStatus).label}
                                                        </span>
                                                      ) : null}
                                                    </div>
                                                    <strong>{session.title}</strong>
                                                    <p>{session.estimatedMinutes ? `${session.estimatedMinutes} min` : session.dose}</p>
                                                    <small>{session.dose}</small>
                                                  </button>
                                                ))}
                                                {!primaryDaySessions.length ? (
                                                  <button type="button" className="planning-calendar-app-empty" onClick={() => openCalendarQuickAdd(day)}>
                                                    +
                                                  </button>
                                                ) : null}
                                                {overlayDaySessions.map((session) => (
                                                  <span key={session.id} className="planning-calendar-app-overlay">
                                                    {disciplineLabel(session.layerDiscipline)}
                                                  </span>
                                                ))}
                                              </div>
                                            </article>
                                          );
                                        })}
                                      </div>

                                      <aside className={`planning-calendar-month-row-summary ${week.snapshot.loadProfile.tone} ${isSelectedWeek ? "selected" : ""}`}>
                                        <button
                                          type="button"
                                          className="planning-calendar-month-row-summary-head"
                                          onClick={() => setSelectedCalendarDate(week.weekStart)}
                                        >
                                          <span>{weekHeading(week.weekStart, week.weekEnd)}</span>
                                          <strong>{formatMinutesCompact(week.snapshot.totalMinutes)}</strong>
                                          <small>
                                            {week.snapshot.totalSessions
                                              ? `${week.snapshot.totalSessions} sesiones · ${week.snapshot.loadProfile.label.toLowerCase()}`
                                              : `Sin sesiones en ${week.inMonthDays} días`}
                                          </small>
                                        </button>

                                        <div className="planning-calendar-month-row-metrics">
                                          <div className="planning-calendar-month-row-metric">
                                            <div className="planning-calendar-month-row-metric-head">
                                              <span>Total</span>
                                              <strong>{formatMinutesCompact(week.snapshot.totalMinutes)}</strong>
                                            </div>
                                            <div className="planning-calendar-month-row-metric-track">
                                              <span
                                                className={`planning-calendar-month-row-metric-fill ${week.snapshot.loadProfile.tone}`}
                                                style={{
                                                  width: week.snapshot.totalMinutes
                                                    ? `${Math.max(8, (week.snapshot.totalMinutes / monthSection.scale.totalMinutes) * 100)}%`
                                                    : "0%",
                                                }}
                                              />
                                            </div>
                                          </div>

                                          {disciplineRows.map((row) => (
                                            <div key={`${week.weekStart}-${row.discipline}`} className="planning-calendar-month-row-metric">
                                              <div className="planning-calendar-month-row-metric-head">
                                                <span>{disciplineLabel(row.discipline)}</span>
                                                <strong>{formatMinutesCompact(row.minutes)}</strong>
                                              </div>
                                              <div className="planning-calendar-month-row-metric-track">
                                                <span
                                                  className="planning-calendar-month-row-metric-fill discipline"
                                                  style={{
                                                    width: row.minutes
                                                      ? `${Math.max(8, (row.minutes / monthSection.scale.disciplineMinutes[row.discipline]) * 100)}%`
                                                      : "0%",
                                                    backgroundColor: planningDisciplineAccent(row.discipline),
                                                  }}
                                                />
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </aside>
                                    </section>
                                  );
                                })}
                              </div>
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div className="planning-calendar-app-header-row">
                          {["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"].map((day) => (
                            <span key={day} className="planning-calendar-app-weekday">{day}</span>
                          ))}
                        </div>

                        <div className="training-calendar-week-stream training-calendar-week-fixed">
                        {continuousWeekStarts.filter((ws) => ws === selectedWeekStart).map((weekStart) => {
                          const weekEnd = addDays(weekStart, 6);
                          const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
                          const isFocusedWeek = weekStart === selectedWeekStart;
                          const weekEntries = weekDates.flatMap((day) => sessionsByDate.get(day) ?? []);
                          const weekSnapshot = buildCalendarWeekSnapshot(weekEntries, athleteAnalysis, selectedDiscipline);
                          const weekBarMaxMinutes = Math.max(1, ...weekSnapshot.disciplineMetrics.map((item) => item.minutes));

                          return (
                            <section
                              key={weekStart}
                              ref={(node) => {
                                calendarWeekSectionRefs.current[weekStart] = node;
                              }}
                              className={`training-calendar-week-section ${isFocusedWeek ? "selected" : ""}`}
                            >
                              <div className="training-calendar-week-section-head">
                                <span>{isFocusedWeek ? "Semana activa" : "Semana visible"}</span>
                                <strong>{weekHeading(weekStart, weekEnd)}</strong>
                              </div>

                              <div className="training-calendar-week-layout">
                                <div className="training-calendar-week-grid">
                                  {weekDates.map((day) => {
                                    const daySessions = sessionsByDate.get(day) ?? [];
                                    const primaryDaySessions = daySessions.filter((session) => !session.isOverlay);
                                    const overlayDaySessions = daySessions.filter((session) => session.isOverlay);
                                    const isSelected = selectedCalendarDate === day;
                                    const isToday = day === isoDateFromToday();
                                    return (
                                      <article
                                        key={day}
                                        className={`training-calendar-week-column ${isSelected ? "selected" : ""}`}
                                      >
                                        <button type="button" className={`training-calendar-week-head ${isToday ? "today" : ""}`} onClick={() => setSelectedCalendarDate(day)}>
                                          <span>{dayNameShort(day)}</span>
                                          <strong>{monthDayLabel(day)}</strong>
                                        </button>
                                        <div className="training-calendar-week-stack">
                                          {primaryDaySessions.length ? primaryDaySessions.map((session) => (
                                            <button
                                              key={session.id}
                                              type="button"
                                              className={`training-calendar-session-card ${session.layerDiscipline === "running" ? "running" : session.layerDiscipline === "ciclismo" ? "cycling" : session.layerDiscipline === "natación" ? "swimming" : ""} ${session.sessionType === "clave" ? "key" : ""}`}
                                              onClick={() => openCalendarSessionDetail(session)}
                                            >
                                              <div className="planning-session-card-head">
                                                <span>{session.sessionType}</span>
                                                {session.publishStatus ? (
                                                  <span className={`planning-session-publish-badge ${planningPublishStatusMeta(session.publishStatus).tone}`}>
                                                    {planningPublishStatusMeta(session.publishStatus).label}
                                                  </span>
                                                ) : null}
                                              </div>
                                              <strong>{session.title}</strong>
                                              <p>{session.dose}</p>
                                              <small>{session.objective}</small>
                                            </button>
                                          )) : (
                                            <button type="button" className="training-calendar-empty-slot" onClick={() => openCalendarQuickAdd(day)}>+</button>
                                          )}
                                          {overlayDaySessions.map((session) => (
                                            <div key={session.id} className="training-calendar-session-card overlay">
                                              <span>{disciplineLabel(session.layerDiscipline)}</span>
                                              <strong>{session.title}</strong>
                                            </div>
                                          ))}
                                        </div>
                                      </article>
                                    );
                                  })}
                                </div>

                                <aside className={`training-calendar-week-summary training-calendar-week-summary-${weekSnapshot.loadProfile.tone}`}>
                                  <div className="training-calendar-week-summary-top">
                                    <article className="training-calendar-week-summary-kpi load">
                                      <span>Carga</span>
                                      <strong>{weekSnapshot.loadProfile.label}</strong>
                                      <small>{weekSnapshot.loadProfile.hint}</small>
                                    </article>
                                    <article className="training-calendar-week-summary-kpi">
                                      <span>Sesiones</span>
                                      <strong>{weekSnapshot.totalSessions}</strong>
                                      <small>{weekSnapshot.keySessions} clave · {weekSnapshot.supportSessions} soporte</small>
                                    </article>
                                    <article className="training-calendar-week-summary-kpi">
                                      <span>Día pico</span>
                                      <strong>{weekSnapshot.peakDay ? formatMinutesCompact(weekSnapshot.peakDay.minutes) : "-"}</strong>
                                      <small>{weekSnapshot.peakDay ? `${dayNameShort(weekSnapshot.peakDay.date)} ${monthDayLabel(weekSnapshot.peakDay.date)}` : "Sin carga visible"}</small>
                                    </article>
                                  </div>

                                  <div className="training-calendar-week-summary-bars">
                                    <div className="training-calendar-week-metric-row">
                                      <div className="training-calendar-week-metric-head">
                                        <span>Total duración</span>
                                        <strong>{formatMinutesCompact(weekSnapshot.totalMinutes)}</strong>
                                      </div>
                                      <div className="training-calendar-week-metric-track">
                                        <span
                                          className={`training-calendar-week-metric-fill ${weekSnapshot.loadProfile.tone}`}
                                          style={{ width: `${Math.max(10, weekSnapshot.loadProfile.intensityPct)}%` }}
                                        />
                                      </div>
                                    </div>

                                    <div className="training-calendar-week-metric-row">
                                      <div className="training-calendar-week-metric-head">
                                        <span>Densidad clave</span>
                                        <strong>{weekSnapshot.totalSessions ? `${weekSnapshot.keySessions}/${weekSnapshot.totalSessions}` : "0/0"}</strong>
                                      </div>
                                      <div className="training-calendar-week-metric-track">
                                        <span
                                          className="training-calendar-week-metric-fill positive"
                                          style={{ width: `${weekSnapshot.totalSessions ? Math.max(10, (weekSnapshot.keySessions / weekSnapshot.totalSessions) * 100) : 10}%` }}
                                        />
                                      </div>
                                    </div>

                                    {weekSnapshot.disciplineMetrics.length ? weekSnapshot.disciplineMetrics.map((metric) => (
                                      <div key={`${weekStart}-${metric.discipline}`} className="training-calendar-week-metric-row">
                                        <div className="training-calendar-week-metric-head">
                                          <span>{disciplineLabel(metric.discipline)}</span>
                                          <strong>{formatMinutesCompact(metric.minutes)}</strong>
                                        </div>
                                        <div className="training-calendar-week-metric-track">
                                          <span
                                            className="training-calendar-week-metric-fill discipline"
                                            style={{
                                              width: `${Math.max(14, (metric.minutes / weekBarMaxMinutes) * 100)}%`,
                                              backgroundColor: planningDisciplineAccent(metric.discipline),
                                            }}
                                          />
                                        </div>
                                        <small>
                                          {metric.distanceMeters
                                            ? `${metric.distanceEstimated ? "~" : ""}${formatDistanceCompact(metric.distanceMeters)} · ${metric.sessions} sesiones`
                                            : `${metric.sessions} sesiones`}
                                        </small>
                                      </div>
                                    )) : (
                                      <p className="training-calendar-week-summary-empty">Todavía no hay sesiones visibles para esta semana.</p>
                                    )}
                                  </div>

                                  <div className="training-calendar-week-summary-foot">
                                    <div>
                                      <span>Disciplina dominante</span>
                                      <strong>{weekSnapshot.primaryDiscipline ? disciplineLabel(weekSnapshot.primaryDiscipline) : "Sin foco"}</strong>
                                    </div>
                                    <div>
                                      <span>Distancia estimada</span>
                                      <strong>{weekSnapshot.totalDistanceMeters ? formatDistanceCompact(weekSnapshot.totalDistanceMeters) : "n/d"}</strong>
                                    </div>
                                  </div>
                                </aside>
                              </div>
                            </section>
                          );
                        })}
                        </div>
                      </>
                    )}
                  </section>

                </div>
              </>
            )}
          </section>
        </div>
        </div>

        {calendarQuickAdd && (
          <div className="target-modal-backdrop" onClick={closeCalendarQuickAdd}>
            <section className="card target-modal-card planning-calendar-quick-add-modal" onClick={(event) => event.stopPropagation()}>
              <div className="planning-calendar-quick-add-head">
                <div className="planning-calendar-quick-add-title">
                  <span className="eyebrow">Anadir al calendario</span>
                  <h2>{formatDate(calendarQuickAdd.date)}</h2>
                  <p>
                    {calendarQuickAdd.mode === "library"
                      ? `Biblioteca de ${disciplineLabel(quickAddDiscipline)} con subcapas para moverte por base, subumbral, LT2 y mas.`
                      : calendarQuickAdd.mode === "manual"
                        ? "Accion manual del dia preparada como acceso directo. La persistencia la conectamos despues sin tocar esta navegacion."
                        : "Elige el tipo de elemento que quieres anadir hoy, con una entrada directa por disciplina y accesos rapidos manuales."}
                  </p>
                </div>
                <div className="planning-calendar-quick-add-actions">
                  {calendarQuickAdd.mode !== "actions" ? (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setCalendarQuickAdd({
                        date: calendarQuickAdd.date,
                        mode: "actions",
                        selectedKind: "running",
                        selectedDiscipline: "running",
                      })}
                    >
                      Volver
                    </button>
                  ) : null}
                  <button type="button" className="ghost-button" onClick={closeCalendarQuickAdd}>
                    Cerrar
                  </button>
                </div>
              </div>

              {calendarQuickAdd.mode === "library" ? (
                <div className="planning-calendar-quick-add-library">
                  <div className="planning-calendar-quick-add-section-head">
                    <span className="planning-kicker">Biblioteca de sesiones</span>
                    <strong>{disciplineLabel(quickAddDiscipline)} · {quickAddFilteredLibrary.length} opciones visibles</strong>
                  </div>
                  <div className="planning-calendar-quick-add-discipline-tabs">
                    {(["running", "ciclismo", "natación"] as const).map((discipline) => (
                      <button
                        key={discipline}
                        type="button"
                        className={`planning-calendar-quick-add-tab ${quickAddDiscipline === discipline ? "active" : ""}`}
                        onClick={() => setCalendarQuickAdd((current) => current ? {
                          ...current,
                          mode: "library",
                          selectedKind: discipline,
                          selectedDiscipline: discipline,
                          selectedLayer: undefined,
                        } : current)}
                      >
                        <span className="planning-calendar-quick-add-tab-label">
                          <QuickAddIcon kind={discipline} />
                          {disciplineLabel(discipline)}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="planning-calendar-quick-add-category-list">
                    {quickAddAvailableLayers.map((layer) => {
                      const tone = workoutLayerTone(layer);
                      const isActive = quickAddActiveLayer === layer;
                      return (
                        <button
                          key={layer}
                          type="button"
                          className={`planning-calendar-quick-add-category tone-${tone} ${isActive ? "active" : ""}`}
                          onClick={() => setCalendarQuickAdd((current) => current ? { ...current, selectedLayer: layer } : current)}
                        >
                          <span className={`planning-calendar-quick-add-category-glyph tone-${tone}`}>{workoutLayerGlyph(layer)}</span>
                          <span className="planning-calendar-quick-add-category-copy">
                            <strong>{workoutLayerLabel(layer)}</strong>
                            <small>{workoutLayerCue(layer)}</small>
                          </span>
                          <span className="planning-calendar-quick-add-category-count">{quickAddLayerCounts[layer] ?? 0} sesiones</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="planning-calendar-quick-add-grid library">
                    {quickAddFilteredLibrary.map((template) => {
                      const isRecommended = (overview?.recommended_workouts ?? []).some((item) => item.template_id === template.template_id);
                      const firstDose = template.dose_ladder[0];
                      return (
                        <button
                          key={template.template_id}
                          type="button"
                          className={`planning-calendar-quick-add-card ${isRecommended ? "recommended" : ""}`}
                          onClick={() => openLibraryWorkoutPreview(template)}
                        >
                          <div className="planning-calendar-quick-add-card-top">
                            <div className="planning-calendar-quick-add-card-hero">
                              <QuickAddIcon kind={quickAddDiscipline} large />
                            </div>
                            <span className="planning-kicker">{workoutLayerLabel(workoutLayerForTemplate(template))}</span>
                            {isRecommended ? <span className="planning-calendar-quick-add-badge">Sugerida</span> : null}
                          </div>
                          <strong>{template.public_label}</strong>
                          <small>
                            {firstDose?.intensity_zone || template.objective}
                            {firstDose?.total_duration_min ? ` · ${firstDose.total_duration_min} min` : ""}
                          </small>
                        </button>
                      );
                    })}
                    {!quickAddFilteredLibrary.length ? (
                      <article className="planning-empty-state">
                        <strong>Sin sesiones en esta subcapa.</strong>
                        <p>Cambia de capa o de disciplina para seguir navegando la biblioteca.</p>
                      </article>
                    ) : null}
                  </div>
                </div>
              ) : calendarQuickAdd.mode === "manual" ? (
                <div className="planning-calendar-quick-add-manual">
                  <div className="planning-calendar-quick-add-section-head">
                    <span className="planning-kicker">Entrada manual</span>
                    <strong>
                      {calendarQuickAdd.selectedKind === "event"
                        ? "Evento"
                        : calendarQuickAdd.selectedKind === "off"
                          ? "Dia off"
                          : "Nota"}
                    </strong>
                  </div>
                  <div className="planning-calendar-quick-add-grid">
                    <article className="planning-calendar-quick-add-card accent">
                      <div className="planning-calendar-quick-add-card-top">
                        <div className="planning-calendar-quick-add-card-hero">
                          <QuickAddIcon kind={calendarQuickAdd.selectedKind} large />
                        </div>
                        <span className="planning-kicker">Acceso preparado</span>
                      </div>
                      <strong>
                        {calendarQuickAdd.selectedKind === "event"
                          ? "Evento del calendario"
                          : calendarQuickAdd.selectedKind === "off"
                            ? "Dia de descanso"
                            : "Nota del entrenador"}
                      </strong>
                      <small>UI lista. Falta conectar el guardado manual real.</small>
                    </article>
                  </div>
                </div>
              ) : (
                <div className="planning-calendar-quick-add-body">
                  <div className="planning-calendar-quick-add-grid actions">
                    <button
                      type="button"
                      className="planning-calendar-quick-add-card primary"
                      onClick={() => openCalendarWorkoutLibrary(calendarQuickAdd.date, "running")}
                    >
                      <div className="planning-calendar-quick-add-card-top">
                        <div className="planning-calendar-quick-add-card-hero">
                          <QuickAddIcon kind="running" large />
                        </div>
                        <span className="planning-kicker">Disciplina</span>
                      </div>
                      <strong>Carrera a pie</strong>
                      <small>{(quickAddLibraries.running ?? []).length} plantillas</small>
                    </button>

                    <button
                      type="button"
                      className="planning-calendar-quick-add-card primary"
                      onClick={() => openCalendarWorkoutLibrary(calendarQuickAdd.date, "ciclismo")}
                    >
                      <div className="planning-calendar-quick-add-card-top">
                        <div className="planning-calendar-quick-add-card-hero">
                          <QuickAddIcon kind="ciclismo" large />
                        </div>
                        <span className="planning-kicker">Disciplina</span>
                      </div>
                      <strong>Ciclismo</strong>
                      <small>{(quickAddLibraries.ciclismo ?? []).length} plantillas</small>
                    </button>

                    <button
                      type="button"
                      className="planning-calendar-quick-add-card primary"
                      onClick={() => openCalendarWorkoutLibrary(calendarQuickAdd.date, "natación")}
                    >
                      <div className="planning-calendar-quick-add-card-top">
                        <div className="planning-calendar-quick-add-card-hero">
                          <QuickAddIcon kind="natación" large />
                        </div>
                        <span className="planning-kicker">Disciplina</span>
                      </div>
                      <strong>Natacion</strong>
                      <small>{(quickAddLibraries["natación"] ?? []).length} plantillas</small>
                    </button>

                    <button
                      type="button"
                      className="planning-calendar-quick-add-card"
                      onClick={() => setCalendarQuickAdd((current) => current ? { ...current, mode: "manual", selectedKind: "event" } : current)}
                    >
                      <div className="planning-calendar-quick-add-card-top">
                        <div className="planning-calendar-quick-add-card-hero">
                          <QuickAddIcon kind="event" large />
                        </div>
                        <span className="planning-kicker">Manual</span>
                      </div>
                      <strong>Evento</strong>
                      <small>Acceso rapido del calendario</small>
                    </button>

                    <button
                      type="button"
                      className="planning-calendar-quick-add-card"
                      onClick={() => setCalendarQuickAdd((current) => current ? { ...current, mode: "manual", selectedKind: "off" } : current)}
                    >
                      <div className="planning-calendar-quick-add-card-top">
                        <div className="planning-calendar-quick-add-card-hero">
                          <QuickAddIcon kind="off" large />
                        </div>
                        <span className="planning-kicker">Manual</span>
                      </div>
                      <strong>Dia off</strong>
                      <small>Descanso y disponibilidad</small>
                    </button>

                    <button
                      type="button"
                      className="planning-calendar-quick-add-card"
                      onClick={() => setCalendarQuickAdd((current) => current ? { ...current, mode: "manual", selectedKind: "note" } : current)}
                    >
                      <div className="planning-calendar-quick-add-card-top">
                        <div className="planning-calendar-quick-add-card-hero">
                          <QuickAddIcon kind="note" large />
                        </div>
                        <span className="planning-kicker">Manual</span>
                      </div>
                      <strong>Nota</strong>
                      <small>Contexto, recordatorios y consignas</small>
                    </button>

                    <button
                      type="button"
                      className="planning-calendar-quick-add-card accent"
                      onClick={() => openCalendarMesocycleComposer(calendarQuickAdd.date)}
                    >
                      <div className="planning-calendar-quick-add-card-top">
                        <div className="planning-calendar-quick-add-card-hero">
                          <QuickAddIcon kind="mesocycle" large />
                        </div>
                        <span className="planning-kicker">Bloques</span>
                      </div>
                      <strong>Mesociclo</strong>
                      <small>{templateLibrary.length} mesociclos utilizables</small>
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {openWorkoutPreview && (
          <WorkoutPreviewModal
            template={openWorkoutPreview.template}
            selection={openWorkoutPreview.selection}
            rawInformation={activePlannedPreviewSession ? {
              active: showPlannedSessionRawInformation,
              onToggle: () => setShowPlannedSessionRawInformation((value) => !value),
              label: "Raw information",
              statusLabel: planningPublishStatusMeta(activePlannedPreviewSession.publish_status).label,
              statusTone: planningPublishStatusMeta(activePlannedPreviewSession.publish_status).tone,
              panel: (
                <>
                  {plannedSessionStructuredPreviewJson ? (
                    <section className="library-workout-panel library-workout-raw-panel">
                      <div className="planning-session-raw-head">
                        <div className="library-workout-panel-head">
                          <span className="eyebrow">Raw information</span>
                          <h3>Bloque estructurado para publicación futura</h3>
                        </div>
                        <button
                          type="button"
                          className="planning-inline-action"
                          onClick={() => regeneratePlannedSessionStructure(activePlannedPreviewSession.id)}
                          disabled={plannedSessionRegeneratingId === activePlannedPreviewSession.id}
                        >
                          {plannedSessionRegeneratingId === activePlannedPreviewSession.id ? "Regenerando..." : "Regenerar estructura"}
                        </button>
                      </div>
                      <p className="library-workout-raw-copy">
                        Estado actual: {planningPublishStatusMeta(activePlannedPreviewSession.publish_status).description}
                        {activePlannedPreviewSession.publish_provider ? ` Proveedor: ${activePlannedPreviewSession.publish_provider}.` : ""}
                      </p>
                      <div className="library-workout-raw-json">
                        <pre>{plannedSessionStructuredPreviewJson}</pre>
                      </div>
                    </section>
                  ) : null}

                  {showPlannedSessionRawInformation && plannedSessionStructuredPreviewLoading && !plannedSessionStructuredPreviewJson ? (
                    <section className="library-workout-panel library-workout-raw-panel">
                      <div className="library-workout-panel-head">
                        <span className="eyebrow">Raw information</span>
                        <h3>Construyendo bloque estructurado…</h3>
                      </div>
                      <p className="library-workout-raw-copy">Estamos pidiendo al backend la versión canónica de la sesión planificada.</p>
                    </section>
                  ) : null}

                  {showPlannedSessionRawInformation && plannedSessionStructuredPreviewError && !plannedSessionStructuredPreviewLoading ? (
                    <section className="library-workout-panel library-workout-raw-panel">
                      <div className="planning-session-raw-head">
                        <div className="library-workout-panel-head">
                          <span className="eyebrow">Raw information</span>
                          <h3>No se pudo construir el bloque</h3>
                        </div>
                        <button
                          type="button"
                          className="planning-inline-action"
                          onClick={() => regeneratePlannedSessionStructure(activePlannedPreviewSession.id)}
                          disabled={plannedSessionRegeneratingId === activePlannedPreviewSession.id}
                        >
                          {plannedSessionRegeneratingId === activePlannedPreviewSession.id ? "Regenerando..." : "Reintentar"}
                        </button>
                      </div>
                      <p className="library-workout-raw-copy">{plannedSessionStructuredPreviewError}</p>
                    </section>
                  ) : null}
                </>
              ),
            } : null}
            workoutDefinition={editableWorkoutDefinition}
            onSaveWorkout={activePlannedPreviewSession ? handleSaveWorkoutSteps : undefined}
            onPushToGarmin={activePlannedPreviewSession ? handlePushToGarmin : undefined}
            garminConnected={selectedAthlete?.garmin_connected ?? false}
            publishStatus={activePlannedPreviewSession?.publish_status ?? null}
            thresholdReference={{
              lt1Label: planningLt1 ? `${formatThresholdPrimaryMetric(planningLt1, selectedDiscipline)}${planningLt1.heartRate ? ` · ${Math.round(planningLt1.heartRate)} bpm` : ""}` : null,
              lt1Source: planningLt1?.sourceLabel ?? null,
              lt2Label: planningLt2 ? `${formatThresholdPrimaryMetric(planningLt2, selectedDiscipline)}${planningLt2.heartRate ? ` · ${Math.round(planningLt2.heartRate)} bpm` : ""}` : null,
              lt2Source: planningLt2?.sourceLabel ?? null,
            }}
            onClose={() => {
              setShowPlannedSessionRawInformation(false);
              setOpenWorkoutPreview(null);
            }}
          />
        )}

        {planningSourceModal && (
          <div className="target-modal-backdrop" onClick={() => setPlanningSourceModal(null)}>
            <section className="card target-modal-card planning-source-modal" onClick={(event) => event.stopPropagation()}>
              <div className="library-workout-modal-head">
                <div>
                  <span className="eyebrow">
                    {planningSourceModal.source.kind === "draft" ? "Borrador" : planningSourceModal.source.kind === "planned" ? "Bloque real" : "Histórico útil"}
                  </span>
                  <h2>{planningSourceModal.title}</h2>
                  <p>{planningSourceModal.summary}</p>
                </div>
                <button type="button" className="ghost-button" onClick={() => setPlanningSourceModal(null)}>
                  Cerrar
                </button>
              </div>
              <div className="planning-source-modal-body">
                <article className="planning-source-modal-card">
                  <span className="planning-kicker">Objetivo del mesociclo</span>
                  <strong>{planningSourceModal.source.objective}</strong>
                  <p>{planningSourceModal.source.intent || "Sin intención operativa detallada."}</p>
                </article>
                {overview?.next_recommendation ? (
                  <article className="planning-source-modal-card">
                    <span className="planning-kicker">Por qué el sistema prioriza este mesociclo</span>
                    <strong>{overview.next_recommendation.recommended_block_label}</strong>
                    <p>{overview.next_recommendation.template_summary || overview.next_recommendation.reasoning[0] || "Sin explicación prioritaria disponible."}</p>
                    <div className="planning-modal-reading-grid">
                      {(overview.next_recommendation.reasoning ?? []).slice(0, 3).map((item, index) => (
                        <article key={item} className="planning-modal-reading-item">
                          <span>{index === 0 ? "Lectura principal" : index === 1 ? "Bloque sugerido" : "Criterio adicional"}</span>
                          <strong>{item}</strong>
                        </article>
                      ))}
                    </div>
                  </article>
                ) : null}
                <article className="planning-source-modal-card">
                  <span className="planning-kicker">Características</span>
                  <ul className="planning-note-list">
                    {planningSourceModal.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </article>
                {(overview?.next_recommendation.candidates_scored?.length ?? 0) > 0 ? (
                  <article className="planning-source-modal-card">
                    <span className="planning-kicker">Posiciones por scoring entre mesociclos</span>
                    <div className="planning-modal-score-list">
                      {overview!.next_recommendation.candidates_scored!.map((candidate, index) => (
                        <article key={candidate.block_type} className={`planning-modal-score-item ${index === 0 ? "winner" : ""}`}>
                          <div className="planning-modal-score-head">
                            <strong>{index + 1}. {BLOCK_LABELS[candidate.block_type] ?? candidate.block_type}</strong>
                            <span>{candidate.score} pts</span>
                          </div>
                          <p>{candidate.reasons[0] || "Sin argumento resumido."}</p>
                        </article>
                      ))}
                    </div>
                  </article>
                ) : null}
                {planningSourceModal.source.notes ? (
                  <article className="planning-source-modal-card">
                    <span className="planning-kicker">Notas</span>
                    <p>{planningSourceModal.source.notes}</p>
                  </article>
                ) : null}
                {planningSourceModal.source.kind === "planned" && planningSourceModal.source.focusBlockId ? (
                  <div className="planning-source-modal-actions">
                    <button
                      type="button"
                      className="ghost-button danger"
                      onClick={deletePlanningSourceFromModal}
                      disabled={deletingBlockId === planningSourceModal.source.focusBlockId}
                    >
                      {deletingBlockId === planningSourceModal.source.focusBlockId ? "Eliminando..." : "Eliminar mesociclo"}
                    </button>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-grid planning-page">
      <section className="hero card planning-hero">
        <div className="planning-hero-main">
          <span className="eyebrow">Planificación</span>
          <div className="planning-hero-title-row">
            <h1>{overview ? `Planificación de ${firstName(overview.athlete_name)}` : "Planificación"}</h1>
            {overview ? (
              <Link className="ghost-button" to={`/athletes/${overview.athlete_id}`}>
                Ir Ficha Atleta
              </Link>
            ) : null}
          </div>
          <div className="planning-hero-tags">
            {athletes.length ? (
              <div className="planning-athlete-picker">
                <span className="planning-athlete-label">Atleta</span>
                <select
                  className="planning-athlete-select"
                  value={athleteId ?? ""}
                  onChange={(event) => {
                    const nextAthleteId = event.target.value;
                    const athlete = athletes.find((item) => String(item.id) === nextAthleteId);
                    const nextDiscipline = athlete?.primary_discipline === "triatlón" ? "running" : athlete?.primary_discipline ?? "running";
                    updatePlanningRoute(nextAthleteId, nextDiscipline);
                  }}
                >
                  {athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="planning-discipline-group">
              {availableDisciplines.map((discipline) => (
                <button
                  key={discipline}
                  type="button"
                  className={`discipline-tab ${selectedDiscipline === discipline ? "active" : ""}`}
                  onClick={() => {
                    if (!athleteId) return;
                    updatePlanningRoute(athleteId, discipline);
                  }}
                >
                  {disciplineLabel(discipline)}
                </button>
              ))}
            </div>
          </div>
          {visibleTargets.length ? (
            <div className="planning-targets-row">
              {visibleTargets.map((target) => (
                <article key={target.id} className="planning-target-chip">
                  <small>{target.distance_label || disciplineLabel(target.discipline)}</small>
                  <strong>{targetPrimaryValue(target)}</strong>
                  <span>{formatDate(target.target_date)}</span>
                  <span>{formatTargetCountdown(target.target_date)} · {targetMetricLabel(target)}</span>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="card section-card planning-card planning-toolbar-card">
        <div className="planning-kpi-strip">
          <article className="planning-kpi-card">
            <span className="planning-kpi-label">Bloque activo · {disciplineLabel(selectedDiscipline)}</span>
            <strong>{activeBlockLabel}</strong>
            <small>{overview?.current_block.start_date ? `${formatDate(overview.current_block.start_date)} → ${formatDate(overview.current_block.end_date || overview.current_block.target_date)}` : "Sin bloque real cargado"}</small>
          </article>
          <article className="planning-kpi-card">
            <span className="planning-kpi-label">Siguiente hito</span>
            <strong>{nextTargetPrimaryLabel}</strong>
            <small>{nextTargetLabel}</small>
          </article>
          <article className="planning-kpi-card">
            <span className="planning-kpi-label">Bloques guardados</span>
            <strong>{overview?.planned_blocks.length ?? 0}</strong>
            <small>{overview?.planned_blocks.length ? "listos para revisar o borrar" : "sin plan persistido todavía"}</small>
          </article>
        </div>
        <div className="planning-threshold-strip">
          <article className="planning-threshold-card">
            <span className="planning-kicker">LT1 activo</span>
            <strong>{formatThresholdPrimaryMetric(planningLt1, selectedDiscipline)}</strong>
            <small>{planningLt1 ? `${planningLt1.sourceLabel}${planningLt1.heartRate != null ? ` · ${Math.round(planningLt1.heartRate)} bpm` : ""}` : "Sin LT1 visible"}</small>
          </article>
          <article className="planning-threshold-card">
            <span className="planning-kicker">LT1 práctico</span>
            <strong>{formatDynamicReferencePrimaryMetric(planningPracticalLt1, selectedDiscipline)}</strong>
            <small>{planningPracticalLt1?.estimated_hr_at_target != null ? `${Math.round(planningPracticalLt1.estimated_hr_at_target)} bpm` : "Sin LT1 práctico visible"}</small>
          </article>
          <article className="planning-threshold-card">
            <span className="planning-kicker">LT2 activo</span>
            <strong>{formatThresholdPrimaryMetric(planningLt2, selectedDiscipline)}</strong>
            <small>{planningLt2 ? `${planningLt2.sourceLabel}${planningLt2.heartRate != null ? ` · ${Math.round(planningLt2.heartRate)} bpm` : ""}` : "Sin LT2 visible"}</small>
          </article>
          <article className="planning-threshold-card">
            <span className="planning-kicker">LT2 práctico</span>
            <strong>{formatDynamicReferencePrimaryMetric(planningPracticalLt2, selectedDiscipline)}</strong>
            <small>{planningPracticalLt2?.estimated_hr_at_target != null ? `${Math.round(planningPracticalLt2.estimated_hr_at_target)} bpm` : "Sin LT2 práctico visible"}</small>
          </article>
          <article className="planning-threshold-card policy">
            <span className="planning-kicker">Base activa</span>
            <strong>{planningThresholdBasis}</strong>
          </article>
        </div>
      </section>

      <section className="card section-card planning-card planning-block-ribbon">
        <div className="planning-ribbon-header">
          <div>
            <span className="eyebrow">Historial de mesociclos</span>
            <p className="muted">{ribbonCards.length} bloques registrados · {ribbonCards.filter((c) => c.kind === "planned").length} creados por el coach</p>
          </div>
          <div className="planning-ribbon-header-actions">
            {ribbonCards.length > 3 && (
              <button type="button" className="ghost-button" onClick={() => setRibbonExpanded((v) => !v)}>
                {ribbonExpanded ? "Ver menos" : `Ver todos (${ribbonCards.length})`}
              </button>
            )}
            <button
              type="button"
              className="planning-calendar-trigger"
              onClick={openCalendarPanel}
            >
              Calendario
            </button>
          </div>
        </div>
        <div className={`planning-ribbon-strip ${ribbonExpanded ? "expanded" : ""}`}>
          {ribbonCards.length ? (ribbonExpanded ? ribbonCards : ribbonCards.slice(-3)).map((item) => {
            const matchingSource = calendarSources.find((source) => source.id === item.id);
            const focusBlockId = item.kind === "planned" ? Number(item.id.replace("planned-", "")) : null;
            return (
              <article key={item.id} className={`planning-ribbon-item ${item.kind}`}>
                <button
                  type="button"
                  className={`planning-ribbon-card ${item.tone} ${item.kind === "target" ? "target" : ""} ${matchingSource && selectedCalendarSourceId === item.id ? "active" : ""}`}
                  onClick={() => {
                    if (!matchingSource) return;
                    setSelectedCalendarSourceId(item.id);
                    openMesocycleLibraryFromSource(matchingSource);
                  }}
                >
                  <span className="planning-kicker">{item.subtitle}</span>
                  <strong>{matchingSource ? compactPlanningSourceTitle(matchingSource) : item.title}</strong>
                  <p>
                    {formatDate(item.date)}
                    {item.endDate ? ` → ${formatDate(item.endDate)}` : ""}
                    {item.meta ? ` · ${item.meta}` : ""}
                  </p>
                </button>
                {focusBlockId != null && (
                  <button
                    type="button"
                    className="planning-ribbon-delete"
                    title="Eliminar mesociclo"
                    disabled={deletingBlockId === focusBlockId}
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePlannedBlock(focusBlockId);
                    }}
                  >
                    {deletingBlockId === focusBlockId ? "..." : "×"}
                  </button>
                )}
              </article>
            );
          }) : (
            <article className="planning-empty-state">
              <strong>No hay bloques ni hitos en ese rango.</strong>
              <p>Ajusta la ventana para recuperar histórico o próximos objetivos.</p>
            </article>
          )}
        </div>
      </section>

      <section className="card section-card planning-builder-card">
        <div className="section-heading">
          <span className="eyebrow">Diseño del bloque</span>
          <h2 className="section-title">Editor coach-led del bloque</h2>
          <p className="muted">Aquí ajustas diagnóstico, plantilla y reglas del bloque sin depender del calendario central.</p>
        </div>

            <div className="planning-foundation-grid">
              {(overview?.foundations ?? []).map((foundation) => (
                <article key={foundation.foundation_id} className="planning-foundation-card">
                  <span className="planning-kicker">{foundation.anchor}</span>
                  <strong>{foundation.title}</strong>
                  <p>{foundation.summary}</p>
                </article>
              ))}
            </div>

            <div className="planning-builder-grid">
              <div className="planning-builder-controls">
                <strong className="planning-panel-title">Diagnóstico del entrenador</strong>
                <div className="planning-form-grid">
                  <label>
                    Disciplina dominante
                    <select
                      value={selectedDiscipline}
                      onChange={(event) => {
                        const nextDiscipline = event.target.value;
                        if (athleteId) {
                          updatePlanningRoute(athleteId, nextDiscipline);
                          return;
                        }
                        setSelectedDiscipline(nextDiscipline);
                      }}
                    >
                      {availableDisciplines.map((discipline) => (
                        <option key={discipline} value={discipline}>
                          {disciplineLabel(discipline)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Objetivo del bloque
                    <select value={blockObjective} onChange={(event) => setBlockObjective(event.target.value)}>
                      {selectedObjectiveOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Limitante principal
                    <select value={primaryWeakness} onChange={(event) => setPrimaryWeakness(event.target.value)}>
                      {selectedWeaknessOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Limitante secundaria
                    <select value={secondaryWeakness} onChange={(event) => setSecondaryWeakness(event.target.value)}>
                      {selectedWeaknessOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Duración
                    <select value={weeks} onChange={(event) => setWeeks(event.target.value)}>
                      <option value="1">1 semana</option>
                      <option value="2">2 semanas</option>
                      <option value="3">3 semanas</option>
                      <option value="4">4 semanas</option>
                      <option value="5">5 semanas</option>
                      <option value="6">6 semanas</option>
                    </select>
                  </label>

                  <label>
                    Densidad
                    <select value={density} onChange={(event) => setDensity(event.target.value)}>
                      <option value="baja">Baja</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                    </select>
                  </label>

                  <label>
                    Tono del bloque
                    <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                      <option value="controlado">Controlado</option>
                      <option value="agresivo">Agresivo</option>
                    </select>
                  </label>

                  <label>
                    Inicio del bloque
                    <input type="date" value={blockStartDate} onChange={(event) => setBlockStartDate(event.target.value)} />
                  </label>

                  <label>
                    Fase
                    <select value={blockPhase} onChange={(event) => setBlockPhase(event.target.value)}>
                      {phaseOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="planning-field-span-2">
                    Intención operativa
                    <textarea
                      value={blockIntent}
                      onChange={(event) => setBlockIntent(event.target.value)}
                      rows={3}
                      placeholder="Ej.: consolidar LT2 sin perder economía / resolver cadencia ineficiente / estabilizar CSS antes de apretar."
                    />
                  </label>

                  <label className="planning-field-span-2">
                    Notas del entrenador
                    <textarea
                      value={coachNotes}
                      onChange={(event) => setCoachNotes(event.target.value)}
                      rows={3}
                      placeholder="Observaciones prácticas, reglas internas, sesión ancla o criterio de corte."
                    />
                  </label>

                  {saveError ? <p className="error planning-field-span-2">{saveError}</p> : null}
                  {saveMessage ? <p className="planning-field-span-2">{saveMessage}</p> : null}
                  <button className="primary-button planning-field-span-2" type="button" onClick={saveFocusBlockFromPlanning} disabled={saving || !athleteId}>
                    {saving ? "Guardando..." : "Guardar como bloque activo"}
                  </button>
                </div>
              </div>

              <div className="planning-builder-preview">
                <div className="planning-template-browser">
                  <div className="section-heading compact">
                    <span className="eyebrow">Biblioteca</span>
                    <h3 className="section-title">Mesociclos disponibles</h3>
                  </div>
                  <div className="planning-template-strip">
                    {templateLibrary.map((template) => {
                      const isSelected = selectedTemplate?.template_id === template.template_id;
                      const matchesSystem = template.template_id === overview?.next_recommendation.template_id;
                      return (
                        <button
                          key={template.template_id}
                          type="button"
                          className={`planning-template-card ${isSelected ? "active" : ""}`}
                          onClick={() => {
                            setSelectedTemplateId(template.template_id);
                            setBlockIntent(template.summary);
                            setCoachNotes(template.control_points.join(" · "));
                          }}
                        >
                          <div className="planning-structure-row">
                            <span className="planning-kicker">{template.typical_structure}</span>
                            <button
                              type="button"
                              className="planning-info-dot"
                              title="Ver detalle del mesociclo"
                              aria-label="Ver detalle del mesociclo"
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedTemplateId((current) => (current === template.template_id ? null : template.template_id));
                              }}
                            >
                              ?
                            </button>
                          </div>
                          <strong>{template.public_label}</strong>
                          <p>{template.primary_focus}</p>
                          <small>{template.typical_duration_weeks_min}-{template.typical_duration_weeks_max} semanas</small>
                          {matchesSystem ? <span className="planning-template-match">encaje alto</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedTemplate ? (
                  <div className="planning-template-detail">
                    <div className="planning-template-detail-head">
                      <div>
                        <span className="planning-kicker">Bloque provisional elegido</span>
                        <strong>{selectedTemplate.public_label}</strong>
                        <p>{selectedTemplate.summary}</p>
                      </div>
                      {selectedTemplate.template_id === overview?.next_recommendation.template_id ? (
                        <span className="planning-tag">La lectura actual lo respalda</span>
                      ) : null}
                    </div>

                    <div className="planning-chip-row">
                      <span className="planning-chip">{selectedTemplate.primary_focus}</span>
                      <span className="planning-chip">{selectedTemplate.typical_structure}</span>
                      <span className="planning-chip">{selectedTemplate.typical_duration_weeks_min}-{selectedTemplate.typical_duration_weeks_max} semanas</span>
                      {selectedTemplate.secondary_focus ? <span className="planning-chip">{selectedTemplate.secondary_focus}</span> : null}
                    </div>

                    <div className="planning-template-columns">
                      <div>
                        <span className="planning-kicker">Lo elijo cuando</span>
                        <ul className="planning-note-list">
                          {selectedTemplate.entry_checks.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="planning-kicker">Qué vigilo dentro del bloque</span>
                        <ul className="planning-note-list">
                          {selectedTemplate.control_points.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="planning-kicker">Qué debe pasar al salir</span>
                        <ul className="planning-note-list">
                          {selectedTemplate.exit_checks.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="planning-template-rationale">
                      <article className="planning-mini-card">
                        <span className="eyebrow">Lo que veo en el CSV</span>
                        <p>{selectedTemplate.csv_rationale}</p>
                      </article>
                      <article className="planning-mini-card">
                        <span className="eyebrow">Soporte científico</span>
                        <p>{selectedTemplate.evidence_rationale}</p>
                      </article>
                    </div>
                  </div>
                ) : null}

                {selectedTemplate && expandedTemplateId === selectedTemplate.template_id ? (
                  <div className="planning-template-detail">
                    <div className="planning-template-detail-head">
                      <div>
                        <span className="planning-kicker">Interpretación del mesociclo</span>
                        <strong>{selectedTemplate.public_label}</strong>
                        <p>{structureHelpText(selectedTemplate.typical_structure)}</p>
                      </div>
                    </div>

                    <div className="planning-template-columns">
                      <div>
                        <span className="planning-kicker">Opciones dentro del bloque</span>
                        <ul className="planning-note-list">
                          {selectedTemplate.key_session_families.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="planning-kicker">Cómo lo modularías</span>
                        <ul className="planning-note-list">
                          {selectedTemplate.progression_rules.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="planning-kicker">Si quieres alargarlo</span>
                        <ul className="planning-note-list">
                          <li>No alargues la misma plantilla en línea recta sin releer al atleta.</li>
                          <li>Si pides 6 semanas para una plantilla de 3-4, úsala como fase 1 y encadena una fase 2.</li>
                          <li>Ejemplo: 3+1 de base y luego 2 semanas de continuación o transición hacia LT1/LT2.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="planning-guardrails">
                  <strong>Hipótesis del bloque</strong>
                  <div className="planning-chip-row">
                    <span className="planning-chip">{disciplineLabel(selectedDiscipline)}</span>
                    <span className="planning-chip">Limitante: {primaryWeakness}</span>
                    <span className="planning-chip">Soporte: {secondaryWeakness}</span>
                    <span className="planning-chip">{blockObjective}</span>
                    <span className="planning-chip">{weeks} semanas</span>
                    <span className="planning-chip">{density} densidad</span>
                  </div>
                  <ul className="planning-note-list">
                    {quickGuardrails.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                    {(overview?.next_recommendation.risk_flags ?? []).slice(0, 2).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {durationFeedback ? (
                    <article className={`planning-duration-note ${durationFeedback.tone}`}>
                      <strong>{durationFeedback.title}</strong>
                      <p>{durationFeedback.body}</p>
                    </article>
                  ) : null}
                </div>

                <div className="planning-microcycle">
                  {microcycle.map((week) => (
                    <article key={week.title} className={`planning-week-card ${week.tone}`}>
                      <span className="planning-kicker">{week.title}</span>
                      <strong>{week.load}</strong>
                      <p>{week.emphasis}</p>
                      <small>{week.notes}</small>
                    </article>
                  ))}
                </div>
              </div>
            </div>
      </section>

      {overview?.mesocycle_draft && (
        <section className="card section-card planning-card planning-draft-section">
          <div className="section-heading compact">
            <span className="eyebrow">Propuesta generada</span>
            <h2 className="section-title">Borrador del bloque</h2>
            {overview.mesocycle_draft.state_summary && (
              <p className="section-sub">{overview.mesocycle_draft.state_summary}</p>
            )}
          </div>
          <div className="planning-draft-grid">
            {overview.mesocycle_draft.weeks.map((week) => {
              const weekClass =
                week.load_type === "descarga" ? "recovery"
                : week.load_type === "acumulación" ? "load"
                : week.load_type === "especificidad" ? "specific"
                : "build";
              return (
                <article key={week.week_index} className={`planning-draft-week ${weekClass}`}>
                  <header className="planning-draft-week-header">
                    <span className="planning-week-num">S{week.week_index}</span>
                    <span className="planning-week-theme">{week.theme}</span>
                    {(week.spacing_warnings?.length ?? 0) > 0 && (
                      <span className="planning-spacing-badge" title={week.spacing_warnings!.join(" · ")}>
                        ⚠ spacing
                      </span>
                    )}
                  </header>
                  <ul className="planning-draft-sessions">
                    {week.sessions.map((session) => {
                      const doseStep = session.payload?.dose_step_index as number | null | undefined;
                      return (
                        <li
                          key={session.session_id}
                          className={`planning-draft-session clickable role-${session.session_role}`}
                          onClick={() => openDraftWorkoutPreview(session)}
                        >
                          <span className="session-role-badge">
                            {SESSION_ROLE_LABEL[session.session_role] ?? session.session_role}
                          </span>
                          <div className="session-main">
                            <strong>{session.public_label}</strong>
                            {session.dose_prescription && (
                              <span className="session-dose">{session.dose_prescription}</span>
                            )}
                            {doseStep != null && (
                              <span className="session-step">peldaño {doseStep}</span>
                            )}
                            <small className="planning-threshold-note">
                              {buildPlanningPrescriptionHint(session.objective, session.public_label, selectedDiscipline, planningLt1, planningLt2)}
                            </small>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {week.control_points.length > 0 && (
                    <footer className="planning-draft-controls">
                      {week.control_points.slice(0, 2).map((cp) => (
                        <small key={cp}>· {cp}</small>
                      ))}
                    </footer>
                  )}
                </article>
              );
            })}
          </div>
          {overview.mesocycle_draft.progression_rules.length > 0 && (
            <div className="planning-draft-rules">
              {overview.mesocycle_draft.progression_rules.map((rule) => (
                <small key={rule}>→ {rule}</small>
              ))}
            </div>
          )}
        </section>
      )}

      {openWorkoutPreview && (
        <WorkoutPreviewModal
          template={openWorkoutPreview.template}
          selection={openWorkoutPreview.selection}
          onClose={() => setOpenWorkoutPreview(null)}
        />
      )}

      {planningSourceModal && (
        <div className="target-modal-backdrop" onClick={() => setPlanningSourceModal(null)}>
          <section className="card target-modal-card planning-source-modal" onClick={(event) => event.stopPropagation()}>
            <div className="library-workout-modal-head">
              <div>
                <span className="eyebrow">
                  {planningSourceModal.source.kind === "draft" ? "Borrador" : planningSourceModal.source.kind === "planned" ? "Bloque real" : "Histórico útil"}
                </span>
                <h2>{planningSourceModal.title}</h2>
                <p>{planningSourceModal.summary}</p>
              </div>
              <button type="button" className="ghost-button" onClick={() => setPlanningSourceModal(null)}>
                Cerrar
              </button>
            </div>
            <div className="planning-source-modal-body">
              <article className="planning-source-modal-card">
                <span className="planning-kicker">Objetivo del mesociclo</span>
                <strong>{planningSourceModal.source.objective}</strong>
                <p>{planningSourceModal.source.intent || "Sin intención operativa detallada."}</p>
              </article>
              {overview?.next_recommendation ? (
                <article className="planning-source-modal-card">
                  <span className="planning-kicker">Por qué el sistema prioriza este mesociclo</span>
                  <strong>{overview.next_recommendation.recommended_block_label}</strong>
                  <p>{overview.next_recommendation.template_summary || overview.next_recommendation.reasoning[0] || "Sin explicación prioritaria disponible."}</p>
                  <div className="planning-modal-reading-grid">
                    {(overview.next_recommendation.reasoning ?? []).slice(0, 3).map((item, index) => (
                      <article key={item} className="planning-modal-reading-item">
                        <span>{index === 0 ? "Lectura principal" : index === 1 ? "Bloque sugerido" : "Criterio adicional"}</span>
                        <strong>{item}</strong>
                      </article>
                    ))}
                  </div>
                </article>
              ) : null}
              <article className="planning-source-modal-card">
                <span className="planning-kicker">Características</span>
                <ul className="planning-note-list">
                  {planningSourceModal.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </article>
              {(overview?.next_recommendation.candidates_scored?.length ?? 0) > 0 ? (
                <article className="planning-source-modal-card">
                  <span className="planning-kicker">Posiciones por scoring entre mesociclos</span>
                  <div className="planning-modal-score-list">
                    {overview!.next_recommendation.candidates_scored!.map((candidate, index) => (
                      <article key={candidate.block_type} className={`planning-modal-score-item ${index === 0 ? "winner" : ""}`}>
                        <div className="planning-modal-score-head">
                          <strong>{index + 1}. {BLOCK_LABELS[candidate.block_type] ?? candidate.block_type}</strong>
                          <span>{candidate.score} pts</span>
                        </div>
                        <p>{candidate.reasons[0] || "Sin argumento resumido."}</p>
                      </article>
                    ))}
                  </div>
                </article>
              ) : null}
              {planningSourceModal.source.notes ? (
                <article className="planning-source-modal-card">
                  <span className="planning-kicker">Notas</span>
                  <p>{planningSourceModal.source.notes}</p>
                </article>
              ) : null}
              {planningSourceModal.source.kind === "planned" && planningSourceModal.source.focusBlockId ? (
                <div className="planning-source-modal-actions">
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={deletePlanningSourceFromModal}
                    disabled={deletingBlockId === planningSourceModal.source.focusBlockId}
                  >
                    {deletingBlockId === planningSourceModal.source.focusBlockId ? "Eliminando..." : "Eliminar mesociclo"}
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
