import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "../lib/api";
import { buildTargetObjective } from "../lib/targetCatalog";
import { ResolvedTrainingThreshold, resolveTrainingThreshold } from "../lib/trainingThresholds";
import { AthleteAnalysis, AthleteHealthDaily, AthleteHealthMetric, AthleteHealthOverview, AuthUser, CurvePoint, DailyTrainingLoad, DisciplineView, Estimate, GarminActivity, GarminActivitiesPreviewResponse, HistoricalPoint, PlanningOverview, PlanningPlannedSession, SessionSummary, TrainingLoadResponse } from "../types";

import { MetricDrawer } from "../components/athlete/MetricDrawer";
import { TimeRangeSelector, type TimeRange } from "../components/athlete/TimeRangeSelector";
import { ViewModeToggle, type ViewMode } from "../components/athlete/ViewModeToggle";
import { WhyButton } from "../components/athlete/WhyButton";
import { InsightCard } from "../components/athlete/InsightCard";
import { LactateFactsCarousel, type LactateFactContext } from "../components/LactateFacts";

type AthletePortalPageProps = {
  user: AuthUser | null;
  token: string;
};

type DisciplineSnapshot = {
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

type PortalCurvePoint = {
  id: string;
  label: string;
  sessionDate?: string | null;
  load: number;
  lactate: number;
  adjusted: number;
  powerSource?: string | null;
};

type PortalStatusTone = "surging" | "steady" | "building";

type PortalStatus = {
  tone: PortalStatusTone;
  label: string;
  headline: string;
  summary: string;
  emphasis: string;
};

type GarminFieldRow = {
  key: string;
  label: string;
  value: string;
};

type WellnessSeriesPoint = {
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
};

type SleepStageKey = "awake" | "rem" | "light" | "deep";

type SleepStageSegment = {
  stage: SleepStageKey;
  start: number;
  end: number;
};

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSecondsToClock(totalSeconds?: number | null) {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds)) return "n/d";
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatPace(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "n/d";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}/km`;
}

function formatSwimPace(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "n/d";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}/100m`;
}

function formatTarget(estimate: Estimate) {
  if (estimate.estimate_type === "FTP") {
    return `${Math.round(estimate.value)} W`;
  }
  if (estimate.unit === "s/km") {
    return formatPace(estimate.value);
  }
  return `${estimate.value.toFixed(1)} ${estimate.unit}`;
}

function formatEstimateValue(estimate?: Estimate | null) {
  if (!estimate) return "n/d";
  if (estimate.estimate_type === "FTP") {
    return `${Math.round(estimate.value)} W`;
  }
  if (estimate.unit === "s/km") {
    return formatPace(estimate.value);
  }
  return `${Math.round(estimate.value * 10) / 10} ${estimate.unit}`;
}

function estimateTypeClassName(type?: string | null) {
  const normalized = (type ?? "").toLowerCase();
  if (normalized === "10k") return "ten-k";
  if (normalized === "hm") return "half-marathon";
  if (normalized === "maratón" || normalized === "maraton") return "marathon";
  return normalized.replace(/[^a-z0-9]+/g, "-") || "generic";
}

function formatCyclingTarget(targetPowerWatts?: number | null, athleteWeight?: number | null) {
  if (typeof targetPowerWatts !== "number" || !Number.isFinite(targetPowerWatts)) return "n/d";
  if (typeof athleteWeight === "number" && athleteWeight > 0) {
    return `${Math.round(targetPowerWatts)} W · ${(targetPowerWatts / athleteWeight).toFixed(2)} W/kg`;
  }
  return `${Math.round(targetPowerWatts)} W`;
}

function formatLactateValue(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  return `${value.toFixed(1)} mmol/L`;
}

function formatDistanceKm(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "0 km";
  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} km`;
}

function formatSteps(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  return value.toLocaleString("es-ES");
}

function formatMinutes(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  return `${Math.round(value)} min`;
}

function formatSleepDuration(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "n/d";
  const totalMinutes = Math.round(value / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function formatNumericMetric(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  return `${Math.round(value)}`;
}

function parseMetricNumber(value?: string | null) {
  if (!value) return null;
  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDurationLabelToSeconds(value?: string | null) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  const hours = normalized.match(/(\d+)\s*h/);
  const minutes = normalized.match(/(\d+)\s*m/);
  const seconds = normalized.match(/(\d+)\s*s/);
  const totalSeconds = (hours ? Number(hours[1]) * 3600 : 0) + (minutes ? Number(minutes[1]) * 60 : 0) + (seconds ? Number(seconds[1]) : 0);
  return totalSeconds > 0 ? totalSeconds : null;
}

function parseTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  }
  return null;
}

function parseSleepStageSegments(payload: Record<string, unknown>): SleepStageSegment[] {
  const connectApi = payload.sleep_connectapi;
  if (!connectApi || typeof connectApi !== "object") return [];

  const candidateMaps = [
    (connectApi as Record<string, unknown>).sleepLevelsMap,
    (connectApi as Record<string, unknown>).sleepLevelMap,
    (connectApi as Record<string, unknown>).sleepLevels,
  ];
  const stageMap = candidateMaps.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  if (!stageMap) return [];

  const stageAliases: Record<string, SleepStageKey> = {
    awake: "awake",
    wake: "awake",
    rem: "rem",
    light: "light",
    core: "light",
    deep: "deep",
  };

  const segments: SleepStageSegment[] = [];
  Object.entries(stageMap).forEach(([rawStage, value]) => {
    const stage = stageAliases[rawStage.toLowerCase()];
    if (!stage || !Array.isArray(value)) return;
    value.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const record = entry as Record<string, unknown>;
      const start = parseTimestamp(record.startGMT ?? record.startTimeGMT ?? record.startTimeLocal ?? record.startTimeInSeconds ?? record.startTimeOffset ?? record.start);
      const end =
        parseTimestamp(record.endGMT ?? record.endTimeGMT ?? record.endTimeLocal ?? record.endTimeInSeconds ?? record.end) ??
        (start !== null && typeof record.durationInSeconds === "number" ? start + record.durationInSeconds * 1000 : null);
      if (start === null || end === null || end <= start) return;
      segments.push({ stage, start, end });
    });
  });

  return segments.sort((a, b) => a.start - b.start);
}

function recoveryTone(score?: number | null) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "neutral";
  if (score >= 82) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function sleepScoreLabel(score?: number | null) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "Lectura pendiente";
  if (score >= 88) return "Sueño muy reparador";
  if (score >= 75) return "Sueño sólido";
  if (score >= 60) return "Sueño aceptable";
  return "Sueño mejorable";
}

function sleepScoreSupport(score?: number | null) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "Sin lectura visible todavía.";
  if (score >= 88) return "Noche muy buena para sumar carga.";
  if (score >= 75) return "Recuperación sólida para seguir construyendo.";
  if (score >= 60) return "Descanso útil, aunque mejorable.";
  return "Hoy conviene entrenar con algo más de control.";
}

function averageNumericSeries(values: Array<number | null | undefined>) {
  const validValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!validValues.length) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function buildWellnessSeries(days: AthleteHealthDaily[]) {
  return [...days]
    .slice()
    .reverse()
    .map((day) => ({
      date: day.date,
      shortLabel: new Date(day.date).toLocaleDateString("es-ES", { weekday: "short" }).replace(".", ""),
      sleepScore: typeof day.sleep_score === "number" ? day.sleep_score : null,
      sleepHours: typeof day.sleep_seconds === "number" ? day.sleep_seconds / 3600 : null,
      hrv: typeof day.hrv_last_night_avg === "number" ? day.hrv_last_night_avg : null,
      hrvStatus: day.hrv_status ?? null,
      restingHr: typeof day.resting_hr === "number" ? day.resting_hr : null,
      stress: typeof day.stress_level === "number" ? day.stress_level : null,
      intensityMinutes: typeof day.intensity_minutes === "number" ? day.intensity_minutes : null,
      bodyBatteryChange: typeof day.body_battery_change === "number" ? day.body_battery_change : null,
      respirationRate: typeof day.respiration_rate === "number" ? day.respiration_rate : null,
      breathingEvents: typeof day.breathing_events === "number" ? day.breathing_events : null,
      weight: typeof (day as any).weight === "number" ? (day as any).weight : null,
    }));
}

function describeHrvStatus(status?: string | null) {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) return "HRV pendiente";
  if (normalized.includes("very low") || normalized.includes("muy bajo")) return "Muy por debajo";
  if (normalized.includes("low") || normalized.includes("bajo")) return "Por debajo";
  if (normalized.includes("very high") || normalized.includes("muy alto")) return "Muy por encima";
  if (normalized.includes("high") || normalized.includes("alto")) return "Por encima";
  if (normalized.includes("balanced") || normalized.includes("normal") || normalized.includes("on path") || normalized.includes("ok")) {
    return "En rango";
  }
  if (normalized.includes("unbalanced")) return "Fuera de rango";
  return status ?? "HRV pendiente";
}

function hrvStatusTone(status?: string | null) {
  const normalized = describeHrvStatus(status).toLowerCase();
  if (normalized.includes("muy por encima")) return "high";
  if (normalized.includes("por encima")) return "good";
  if (normalized.includes("en rango")) return "neutral";
  if (normalized.includes("por debajo")) return "warning";
  if (normalized.includes("muy por debajo") || normalized.includes("fuera")) return "alert";
  return "neutral";
}

function stressLabel(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Sin lectura";
  if (value >= 76) return "Muy alto";
  if (value >= 56) return "Alto";
  if (value >= 31) return "Moderado";
  return "Controlado";
}

function bodyBatteryDirectionLabel(current?: number | null, average?: number | null) {
  if (typeof current !== "number" || !Number.isFinite(current)) return "Sin referencia";
  if (typeof average !== "number" || !Number.isFinite(average)) return "Sin referencia";
  const delta = current - average;
  if (delta >= 3) return "Subiendo";
  if (delta <= -3) return "Bajando";
  return "Estable";
}

function stageLabel(stage: SleepStageKey) {
  if (stage === "awake") return "Despierto";
  if (stage === "rem") return "REM";
  if (stage === "light") return "Sueño ligero";
  return "Sueño profundo";
}

function restingHrLabel(current?: number | null, average?: number | null) {
  if (typeof current !== "number" || !Number.isFinite(current)) return "Sin lectura";
  if (typeof average !== "number" || !Number.isFinite(average)) return "Sin referencia";
  const delta = current - average;
  if (delta >= 6) return "Muy alta";
  if (delta >= 3) return "Alta";
  if (delta <= -4) return "Muy baja";
  if (delta <= -2) return "Baja";
  return "En rango";
}

function renderWellnessTooltip(
  active: boolean | undefined,
  payload: Array<{ payload?: WellnessSeriesPoint }> | undefined,
  metricLabel: string,
  formatter: (value?: number | null) => string,
) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="athlete-portal-wellness-tooltip">
      <strong>{formatDate(point.date)}</strong>
      <span>{metricLabel}: {formatter(
        metricLabel === "HRV nocturna" ? point.hrv
          : metricLabel === "Frecuencia en reposo" ? point.restingHr
            : metricLabel === "Estrés diario" ? point.stress
              : metricLabel === "Batería corporal" ? point.bodyBatteryChange
                : metricLabel === "Respiración nocturna" ? point.respirationRate
                  : point.sleepHours,
      )}</span>
    </div>
  );
}

function formatGarminFieldValue(value: unknown) {
  if (value == null) return "n/d";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === "object") return `${Object.keys(value as Record<string, unknown>).length} campos`;
  return String(value);
}

function humanizeGarminFieldKey(key: string) {
  return key
    .replace(/\./g, " / ")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function flattenGarminObject(value: unknown, prefix = "", rows: GarminFieldRow[] = [], limit = 120): GarminFieldRow[] {
  if (rows.length >= limit) return rows;
  if (value == null || typeof value !== "object") {
    if (prefix) {
      rows.push({ key: prefix, label: humanizeGarminFieldKey(prefix), value: formatGarminFieldValue(value) });
    }
    return rows;
  }

  if (Array.isArray(value)) {
    if (prefix) {
      rows.push({ key: prefix, label: humanizeGarminFieldKey(prefix), value: `${value.length} items` });
    }
    value.slice(0, 4).forEach((item, index) => {
      flattenGarminObject(item, prefix ? `${prefix}[${index}]` : `[${index}]`, rows, limit);
    });
    return rows;
  }

  Object.entries(value).forEach(([key, nested]) => {
    if (rows.length >= limit) return;
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (nested != null && typeof nested === "object") {
      if (Array.isArray(nested)) {
        rows.push({ key: nextKey, label: humanizeGarminFieldKey(nextKey), value: `${nested.length} items` });
        nested.slice(0, 3).forEach((item, index) => {
          flattenGarminObject(item, `${nextKey}[${index}]`, rows, limit);
        });
      } else {
        rows.push({
          key: nextKey,
          label: humanizeGarminFieldKey(nextKey),
          value: `${Object.keys(nested as Record<string, unknown>).length} campos`,
        });
        flattenGarminObject(nested, nextKey, rows, limit);
      }
    } else {
      rows.push({ key: nextKey, label: humanizeGarminFieldKey(nextKey), value: formatGarminFieldValue(nested) });
    }
  });

  return rows;
}

function sportToneClass(sportType: string) {
  const normalized = sportType.toLowerCase();
  if (normalized.includes("run")) return "run";
  if (normalized.includes("cycl") || normalized.includes("bike")) return "ride";
  if (normalized.includes("swim")) return "swim";
  if (normalized.includes("strength") || normalized.includes("yoga")) return "strength";
  return "other";
}

function sportLabel(sportType: string) {
  const normalized = sportType.toLowerCase();
  if (normalized === "running") return "Running";
  if (normalized === "lap_swimming") return "Pool Swim";
  return humanizeGarminFieldKey(sportType);
}

function daysUntil(date?: string | null) {
  if (!date) return null;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function disciplineOrder(discipline: string) {
  if (discipline === "natación") return 0;
  if (discipline === "ciclismo") return 1;
  if (discipline === "running") return 2;
  return 3;
}

function formatTrendValue(value?: number | null, discipline?: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  if (discipline === "ciclismo") return `${Math.round(value)} W`;
  if (discipline === "natación") return formatSwimPace(value / 10);
  return formatPace(value);
}

function buildDisciplineTrend(view?: DisciplineView | null, discipline?: string) {
  if (!view) return [];
  const preferredMetric =
    discipline === "ciclismo"
      ? view.historical_evolution?.LT2_power_watts ?? view.historical_evolution?.LT1_power_watts ?? []
      : view.historical_evolution?.LT2_pace_seconds_per_km ?? view.historical_evolution?.LT1_pace_seconds_per_km ?? [];
  return preferredMetric.slice(-8).map((point) => ({
    date: formatDate(point.date),
    value: point.value ?? null,
    label: point.label,
  }));
}

function getPrimaryEstimate(view?: DisciplineView | null, type?: string) {
  return view?.estimates?.find((estimate) => estimate.estimate_type === type);
}

function disciplineLabel(discipline: string) {
  if (discipline === "running") return "Carrera a pie";
  if (discipline === "ciclismo") return "Ciclismo";
  if (discipline === "natación") return "Natación";
  if (discipline === "triatlón") return "Triatlón";
  return discipline;
}

function disciplineAccent(discipline: string) {
  if (discipline === "natación") return "#0ea5e9";
  if (discipline === "ciclismo") return "#f59e0b";
  if (discipline === "running") return "#22c55e";
  return "#16353d";
}

function renderThresholdValue(threshold?: ResolvedTrainingThreshold | null, discipline?: string) {
  if (!threshold) return "n/d";
  if (discipline === "ciclismo" && typeof threshold.powerWatts === "number") {
    return `${Math.round(threshold.powerWatts)} W`;
  }
  if (discipline === "natación" && typeof threshold.paceSecondsPerKm === "number") {
    return formatSwimPace(threshold.paceSecondsPerKm / 10);
  }
  if (typeof threshold.paceSecondsPerKm === "number") {
    return formatPace(threshold.paceSecondsPerKm);
  }
  if (typeof threshold.powerWatts === "number") {
    return `${Math.round(threshold.powerWatts)} W`;
  }
  return "n/d";
}

function countSessionsWithinDays(sessions: SessionSummary[], days: number) {
  const cutoff = Date.now() - days * 86400000;
  return sessions.filter((session) => new Date(session.performed_at).getTime() >= cutoff).length;
}

function buildDisciplineLactateSeries(view?: DisciplineView | null) {
  if (!view) return [];
  const lt1Points = view.historical_evolution?.LT1 ?? [];
  const lt2Points = view.historical_evolution?.LT2 ?? [];
  const peakPoints = view.historical_evolution?.peak_lactate ?? [];
  const byDate = new Map<string, { date: string; label: string; lt1?: number | null; lt2?: number | null; vlamaxProxy?: number | null }>();

  lt1Points.forEach((point) => {
    const current = byDate.get(point.date);
    byDate.set(point.date, {
      date: point.date,
      label: formatDate(point.date),
      lt1: point.value ?? null,
      lt2: current?.lt2 ?? null,
      vlamaxProxy: current?.vlamaxProxy ?? null,
    });
  });

  lt2Points.forEach((point) => {
    const current = byDate.get(point.date);
    byDate.set(point.date, {
      date: point.date,
      label: formatDate(point.date),
      lt1: current?.lt1 ?? null,
      lt2: point.value ?? null,
      vlamaxProxy: current?.vlamaxProxy ?? null,
    });
  });

  peakPoints.forEach((point) => {
    const current = byDate.get(point.date);
    byDate.set(point.date, {
      date: point.date,
      label: formatDate(point.date),
      lt1: current?.lt1 ?? null,
      lt2: current?.lt2 ?? null,
      vlamaxProxy: point.value ?? null,
    });
  });

  return [...byDate.values()].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

function formatLoadLabel(value?: number | null, discipline?: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  if (discipline === "ciclismo") return `${Math.round(value)} W`;
  if (discipline === "natación") return formatSwimPace(value / 10);
  return formatPace(value);
}

function smoothCurveValue(points: CurvePoint[], index: number) {
  const current = points[index];
  const previous = points[index - 1];
  const next = points[index + 1];
  if (!current) return null;
  if (!previous || !next) return current.lactate;
  return previous.lactate * 0.22 + current.lactate * 0.56 + next.lactate * 0.22;
}

function buildDisciplineCurvePlot(view?: DisciplineView | null, discipline?: string): PortalCurvePoint[] {
  if (!view || !discipline) return [];
  const source = discipline === "ciclismo" ? view.curve_history?.power ?? [] : view.curve_history?.pace ?? [];
  const sorted = [...source]
    .filter((point) => typeof point.x === "number" && typeof point.lactate === "number")
    .sort((left, right) => left.x - right.x);

  return sorted.map((point, index) => ({
    id: `${discipline}-${point.interval_id}-${index}`,
    label: point.label,
    sessionDate: point.session_date,
    load: point.x,
    lactate: point.lactate,
    adjusted: Math.round((smoothCurveValue(sorted, index) ?? point.lactate) * 100) / 100,
    powerSource: point.power_source ?? null,
  }));
}

function portalCurveTooltip(
  active: boolean | undefined,
  payload: Array<{ payload?: PortalCurvePoint; dataKey?: string }> | undefined,
  discipline?: string,
) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="athlete-portal-curve-tooltip">
      <strong>{point.label}</strong>
      {point.sessionDate ? <span>Fecha {formatDate(point.sessionDate)}</span> : null}
      <span>Carga {formatLoadLabel(point.load, discipline)}</span>
      <span>Lactato {formatLactateValue(point.lactate)}</span>
      <span>Ajuste {formatLactateValue(point.adjusted)}</span>
      {point.powerSource ? <span>Fuente {point.powerSource}</span> : null}
    </div>
  );
}

function formatPrimaryAxisValue(value?: number | null, discipline?: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  if (discipline === "ciclismo") return `${Math.round(value)} W`;
  if (discipline === "natación") return formatSwimPace(value / 10);
  return formatPace(value);
}

function latestHistorical(points?: HistoricalPoint[]) {
  if (!points?.length) return null;
  return points[points.length - 1] ?? null;
}

function relativeCountdownLabel(days: number | null) {
  if (days === null) return "Fecha pendiente";
  if (days < 0) return "Objetivo pasado";
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `${days} días`;
}

function shortText(value?: string | null, maxLength = 120) {
  if (!value) return "";
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trimEnd()}...`;
}

function confidenceLabel(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Lectura abierta";
  if (value >= 0.78) return "Alta confianza";
  if (value >= 0.58) return "Confianza media";
  return "Evidencia limitada";
}

function buildPortalStatus(params: {
  confidence?: number | null;
  nextTargetCountdown: number | null;
  summary?: string | null;
  recommendation?: string | null;
  hasTarget: boolean;
}): PortalStatus {
  const { confidence, nextTargetCountdown, summary, recommendation, hasTarget } = params;
  const baseSummary = shortText(summary || recommendation || "Tu portal irá afinando esta lectura cuando entren más sesiones comparables.", 150);
  const baseRecommendation = shortText(recommendation || summary || "Sigue acumulando sesiones comparables para convertir los datos en dirección útil.", 150);

  if (typeof confidence === "number" && confidence >= 0.78) {
    return {
      tone: "surging",
      label: hasTarget && nextTargetCountdown !== null && nextTargetCountdown <= 21 ? "Ventana de afinación" : "Bloque en línea",
      headline:
        hasTarget && nextTargetCountdown !== null && nextTargetCountdown <= 21
          ? "Llegas a una fase buena para afinar sin perder estabilidad."
          : "El bloque está respondiendo y la foto actual es bastante sólida.",
      summary: baseSummary,
      emphasis: baseRecommendation,
    };
  }

  if (typeof confidence === "number" && confidence >= 0.58) {
    return {
      tone: "steady",
      label: hasTarget && nextTargetCountdown !== null && nextTargetCountdown <= 21 ? "Ajuste fino" : "Progreso útil",
      headline:
        hasTarget && nextTargetCountdown !== null && nextTargetCountdown <= 21
          ? "Vas bien, pero todavía conviene consolidar antes de apretar más."
          : "Hay señales útiles, aunque el bloque aún no está del todo cerrado.",
      summary: baseSummary,
      emphasis: baseRecommendation,
    };
  }

  return {
    tone: "building",
    label: hasTarget ? "Base en construcción" : "Lectura abierta",
    headline:
      hasTarget && nextTargetCountdown !== null && nextTargetCountdown <= 35
        ? "Todavía falta convertir el trabajo reciente en una referencia más estable."
        : "Ahora mismo el foco es construir base y acumular comparables de calidad.",
    summary: baseSummary,
    emphasis: baseRecommendation,
  };
}

function EventIcon({ discipline, distanceCategory }: { discipline?: string; distanceCategory?: string | null }) {
  const d = (discipline ?? "").toLowerCase();
  const cat = (distanceCategory ?? "").toLowerCase();
  const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  if (d.includes("triatlón") || d.includes("triatlon") || d.includes("triathlon")) {
    // Three disciplines combined — triangle
    return <svg {...props}><path d="M12 3l9 18H3z"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/><circle cx="12" cy="9" r="1.5"/></svg>;
  }
  if (cat.includes("aguas abiertas") || cat.includes("open water") || cat.includes("ow")) {
    // Waves
    return <svg {...props}><path d="M2 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>;
  }
  if (d.includes("natación") || d.includes("swim")) {
    return <svg {...props}><path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>;
  }
  if (d.includes("ciclismo") || d.includes("cycling") || d.includes("bike")) {
    return <svg {...props}><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 2 0 1 1 0 0 0-2 0"/><path d="M12 17.5V14l-3-3 4-3 2 3h3"/></svg>;
  }
  if (d.includes("running") || d.includes("carrera") || d.includes("trail")) {
    // Flag
    return <svg {...props}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>;
  }
  // Default — target
  return <svg {...props}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
}

function weatherLabel(code: number): { icon: string; desc: string } {
  if (code === 0) return { icon: "☀", desc: "Despejado" };
  if (code <= 3) return { icon: "⛅", desc: "Parcialmente nublado" };
  if (code <= 48) return { icon: "☁", desc: "Nublado" };
  if (code <= 57) return { icon: "🌧", desc: "Llovizna" };
  if (code <= 67) return { icon: "🌧", desc: "Lluvia" };
  if (code <= 77) return { icon: "❄", desc: "Nieve" };
  if (code <= 82) return { icon: "🌧", desc: "Chubascos" };
  if (code <= 86) return { icon: "❄", desc: "Nieve" };
  if (code <= 99) return { icon: "⛈", desc: "Tormenta" };
  return { icon: "☁", desc: "" };
}

function CalendarSportIcon({ label }: { label: string }) {
  const l = label.toLowerCase();
  const props = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (l.includes("carrera") || l.includes("trail") || l.includes("cinta")) {
    // Running shoe
    return <svg {...props}><path d="M13.5 5.5c1 .5 2.5 1 3.5 2.5L20 12l-1 1H7l-1-1 .5-2c.5-1.5 2-2 3-2l1 1 3-3z"/><path d="M6 12v3c0 1 .5 2 2 2h8c1.5 0 2-1 2-2v-3"/></svg>;
  }
  if (l.includes("ciclismo") || l.includes("rodillo") || l.includes("mtb")) {
    return <svg {...props}><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 2 0 1 1 0 0 0-2 0"/><path d="M12 17.5V14l-3-3 4-3 2 3h3"/></svg>;
  }
  if (l.includes("natacion") || l.includes("piscina") || l.includes("aguas")) {
    return <svg {...props}><path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>;
  }
  if (l.includes("fuerza") || l.includes("strength")) {
    return <svg {...props}><path d="M6.5 6.5v11M17.5 6.5v11M6.5 12h11M4 8v8M20 8v8"/></svg>;
  }
  if (l.includes("senderismo") || l.includes("caminata")) {
    return <svg {...props}><path d="M3 20l5-16 4 8 4-4 5 12"/></svg>;
  }
  // Generic activity
  return <svg {...props}><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 3"/></svg>;
}

function dedupeRecentSessions(analysis: AthleteAnalysis | null) {
  const seen = new Set<number>();
  const sessions = Object.values(analysis?.discipline_views ?? {})
    .flatMap((view) => view.recent_sessions ?? [])
    .filter((session) => {
      if (seen.has(session.id)) return false;
      seen.add(session.id);
      return true;
    })
    .sort((left, right) => new Date(right.performed_at).getTime() - new Date(left.performed_at).getTime());
  return sessions.slice(0, 6);
}

function sessionDurationHours(session?: SessionSummary) {
  if (!session?.intervals?.length) return 0;
  return session.intervals.reduce((sum, interval) => sum + interval.duration_seconds, 0) / 3600;
}

function sessionDistanceKm(session?: SessionSummary) {
  if (!session?.intervals?.length) return 0;
  return session.intervals.reduce((sum, interval) => {
    if (typeof interval.pace_seconds_per_km !== "number" || !Number.isFinite(interval.pace_seconds_per_km) || interval.pace_seconds_per_km <= 0) {
      return sum;
    }
    return sum + (interval.duration_seconds / interval.pace_seconds_per_km);
  }, 0);
}

function volumeSummary(sessions: SessionSummary[]) {
  const runningKm = sessions.filter((session) => session.discipline === "running").reduce((sum, session) => sum + sessionDistanceKm(session), 0);
  const swimKm = sessions.filter((session) => session.discipline === "natación").reduce((sum, session) => sum + sessionDistanceKm(session), 0);
  const trainingHours = sessions.reduce((sum, session) => sum + sessionDurationHours(session), 0);
  const cyclingHasDistance = sessions.some((session) => session.discipline === "ciclismo" && sessionDistanceKm(session) > 0);
  const cyclingKm = sessions.filter((session) => session.discipline === "ciclismo").reduce((sum, session) => sum + sessionDistanceKm(session), 0);
  return { runningKm, swimKm, trainingHours, cyclingKm, cyclingHasDistance };
}

function allSessionsDeduped(analysis: AthleteAnalysis | null) {
  const seen = new Set<number>();
  return Object.values(analysis?.discipline_views ?? {})
    .flatMap((view) => view.recent_sessions ?? [])
    .filter((session) => {
      if (seen.has(session.id)) return false;
      seen.add(session.id);
      return true;
    })
    .sort((left, right) => new Date(left.performed_at).getTime() - new Date(right.performed_at).getTime());
}

type WeeklyVolume = { weekLabel: string; running: number; cycling: number; swimming: number };

function buildWeeklyVolumeByDiscipline(sessions: SessionSummary[], weeks: number): WeeklyVolume[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayOfWeek = now.getDay();
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  const result: WeeklyVolume[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = new Date(currentMonday);
    weekStart.setDate(currentMonday.getDate() - w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const weekSessions = sessions.filter((s) => {
      const d = new Date(s.performed_at);
      return d >= weekStart && d < weekEnd;
    });
    const monthLabel = weekStart.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
    const dayLabel = weekStart.getDate();
    const label = `${dayLabel} ${monthLabel}`;
    result.push({
      weekLabel: label,
      running: weekSessions.filter((s) => s.discipline === "running").reduce((sum, s) => sum + sessionDistanceKm(s), 0),
      cycling: weekSessions.filter((s) => s.discipline === "ciclismo").reduce((sum, s) => sum + sessionDistanceKm(s), 0),
      swimming: weekSessions.filter((s) => s.discipline === "natación").reduce((sum, s) => sum + sessionDistanceKm(s) * 1000, 0),
    });
  }
  return result;
}

type StatusHistoryPoint = { label: string; score: number };

function buildStatusTrend(series: Array<{ stress: number | null; hrv: number | null; sleepScore: number | null }>): StatusHistoryPoint[] {
  return series.slice(-14).map((p, i) => {
    let score = 50;
    if (typeof p.sleepScore === "number") score += Math.round((p.sleepScore / 100) * 25) - 12;
    if (typeof p.hrv === "number") score += Math.min(15, Math.round(p.hrv * 0.15));
    if (typeof p.stress === "number") score -= Math.round(Math.max(0, p.stress - 30) * 0.25);
    return { label: `D${i + 1}`, score: Math.max(0, Math.min(100, score)) };
  });
}

export function AthletePortalPage({ user, token }: AthletePortalPageProps) {
  const [analysis, setAnalysis] = useState<AthleteAnalysis | null>(null);
  const [athleteHealth, setAthleteHealth] = useState<AthleteHealthOverview | null>(null);
  const [athleteHealthLoading, setAthleteHealthLoading] = useState(false);
  const [athleteHealthError, setAthleteHealthError] = useState<string | null>(null);
  const [athleteHealthStatus, setAthleteHealthStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>("");
  const [stravaRedirecting, setStravaRedirecting] = useState(false);
  const [stravaFeedback, setStravaFeedback] = useState<string | null>(null);
  const [garminLoginOpen, setGarminLoginOpen] = useState(false);
  const [garminEmail, setGarminEmail] = useState("");
  const [garminPassword, setGarminPassword] = useState("");
  const [garminMfaCode, setGarminMfaCode] = useState("");
  const [garminConnectLoading, setGarminConnectLoading] = useState(false);
  const [garminConnectError, setGarminConnectError] = useState<string | null>(null);
  const [garminConnectMessage, setGarminConnectMessage] = useState<string | null>(null);
  const [garminPreviewLoading, setGarminPreviewLoading] = useState(false);
  const [garminPreviewError, setGarminPreviewError] = useState<string | null>(null);
  const [garminPreview, setGarminPreview] = useState<GarminActivitiesPreviewResponse | null>(null);
  const [garminActivityDetails, setGarminActivityDetails] = useState<Record<number, GarminActivity>>({});
  const [selectedGarminActivityId, setSelectedGarminActivityId] = useState<number | null>(null);
  const [garminActivityLoading, setGarminActivityLoading] = useState(false);
  const [garminActivityError, setGarminActivityError] = useState<string | null>(null);
  const [selectedSleepMetricKey, setSelectedSleepMetricKey] = useState<string | null>(null);
  const [openDrawer, setOpenDrawer] = useState<"sleep" | "hrv" | "rhr" | "stress" | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("athlete");
  const [trendRange, setTrendRange] = useState<TimeRange>("7d");
  const [recoveryMetric, setRecoveryMetric] = useState<"hrv" | "rhr" | "sleep" | "stress">("hrv");
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  const [weightModalOpen, setWeightModalOpen] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [weightSaving, setWeightSaving] = useState(false);
  const [plannedSessions, setPlannedSessions] = useState<PlanningPlannedSession[]>([]);
  const [calWeekOffset, setCalWeekOffset] = useState(0);
  const [editingSession, setEditingSession] = useState<PlanningPlannedSession | null>(null);
  const [editForm, setEditForm] = useState({ label: "", note: "", date: "", time: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editDeleting, setEditDeleting] = useState(false);
  const [garminPushing, setGarminPushing] = useState(false);
  const [garminPushResult, setGarminPushResult] = useState<"ok" | "error" | null>(null);
  const [dragSessionId, setDragSessionId] = useState<number | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"home" | "training" | "fitness" | "lactate">("home");
  const [trainingLoad, setTrainingLoad] = useState<TrainingLoadResponse | null>(null);
  const [trainingLoadLoading, setTrainingLoadLoading] = useState(false);

  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=41.6167&longitude=2.0861&current=temperature_2m,weather_code&timezone=auto")
      .then(r => r.json())
      .then(data => {
        if (data?.current) {
          setWeather({ temp: Math.round(data.current.temperature_2m), code: data.current.weather_code });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stravaStatus = params.get("strava");
    const stravaReason = params.get("reason");
    if (!stravaStatus) return;

    if (stravaStatus === "connected") {
      setStravaFeedback("Strava conectado. Ya podemos usar la actividad real en cuanto activemos webhooks y matching.");
    } else {
      setStravaFeedback(stravaReason ? `No se pudo conectar Strava: ${stravaReason}` : "No se pudo completar la conexión con Strava.");
    }

    params.delete("strava");
    params.delete("reason");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAthletePortal() {
      if (!user?.athlete_id) {
        setError("Tu acceso atleta todavía no está vinculado a un deportista.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = (await api.athleteAnalysis(token, user.athlete_id)) as AthleteAnalysis;
        if (!cancelled) {
          setAnalysis(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar tu portal de atleta.");
          setAnalysis(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAthletePortal();
    return () => {
      cancelled = true;
    };
  }, [token, user?.athlete_id]);

  useEffect(() => {
    let cancelled = false;

    async function loadAthleteHealth() {
      if (!user?.athlete_id || loading) return;
      setAthleteHealthLoading(true);
      setAthleteHealthError(null);
      setAthleteHealthStatus(null);
      try {
        const result = (await api.athleteHealthOverview(token, user.athlete_id, 28, {
          includeActivity: false,
          includeRawWellness: false,
          refreshLiveHealth: Boolean(analysis?.athlete.garmin_connected),
        })) as AthleteHealthOverview;
        if (!cancelled) {
          setAthleteHealth(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setAthleteHealth(null);
          setAthleteHealthError(loadError instanceof Error ? loadError.message : "No se pudo cargar la capa paralela de actividad del atleta.");
        }
      } finally {
        if (!cancelled) {
          setAthleteHealthLoading(false);
        }
      }
    }

    loadAthleteHealth();
    return () => {
      cancelled = true;
    };
  }, [analysis?.athlete.garmin_connected, loading, token, user?.athlete_id]);

  // ── Load training load (TSS/ATL/CTL/TSB) ─────────────────────
  useEffect(() => {
    let cancelled = false;
    async function loadTrainingLoad() {
      if (!user?.athlete_id || loading || !analysis?.athlete.garmin_connected) return;
      setTrainingLoadLoading(true);
      try {
        const end = new Date().toISOString().slice(0, 10);
        const start = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
        const result = (await api.trainingLoad(token, user.athlete_id, start, end)) as TrainingLoadResponse;
        if (!cancelled) setTrainingLoad(result);
      } catch {
        if (!cancelled) setTrainingLoad(null);
      } finally {
        if (!cancelled) setTrainingLoadLoading(false);
      }
    }
    loadTrainingLoad();
    return () => { cancelled = true; };
  }, [analysis?.athlete.garmin_connected, loading, token, user?.athlete_id]);

  // ── Load planned sessions ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function loadPlanned() {
      if (!user?.athlete_id || loading) return;
      try {
        const result = (await api.planningOverview(token, user.athlete_id)) as PlanningOverview;
        if (!cancelled) setPlannedSessions(result.planned_sessions ?? []);
      } catch {
        // silent — planned sessions are optional
      }
    }
    loadPlanned();
    return () => { cancelled = true; };
  }, [loading, token, user?.athlete_id]);

  const activeBlock = analysis?.active_focus_block;
  const upcomingTargets = useMemo(
    () =>
      [...(analysis?.athlete.targets ?? [])]
        .filter((target) => new Date(target.target_date).getTime() >= Date.now() - 86400000)
        .sort((left, right) => new Date(left.target_date).getTime() - new Date(right.target_date).getTime())
        .slice(0, 3),
    [analysis],
  );
  const nextTarget = upcomingTargets[0] ?? null;
  const nextTargetCountdown = daysUntil(nextTarget?.target_date);

  const disciplineSnapshots = useMemo<DisciplineSnapshot[]>(() => (
    Object.entries(analysis?.discipline_views ?? {})
      .sort(([leftDiscipline], [rightDiscipline]) => disciplineOrder(leftDiscipline) - disciplineOrder(rightDiscipline))
      .map(([discipline, view]) => ({
        discipline,
        view,
        lt1: resolveTrainingThreshold(view, "LT1"),
        lt2: resolveTrainingThreshold(view, "LT2"),
        estimate: getPrimaryEstimate(view, discipline === "ciclismo" ? "FTP" : discipline === "running" ? "10K" : "VO2max") ?? view.estimates?.[0],
        weeklySessions: countSessionsWithinDays(view.recent_sessions ?? [], 7),
        monthlySessions: countSessionsWithinDays(view.recent_sessions ?? [], 30),
        latestSession: [...(view.recent_sessions ?? [])].sort((left, right) => new Date(right.performed_at).getTime() - new Date(left.performed_at).getTime())[0],
        trend: buildDisciplineTrend(view, discipline),
      }))
  ), [analysis?.discipline_views]);

  useEffect(() => {
    if (!disciplineSnapshots.length) return;
    if (!disciplineSnapshots.some((snapshot) => snapshot.discipline === selectedDiscipline)) {
      const defaultDiscipline = activeBlock?.priority_discipline || analysis?.athlete.primary_discipline || disciplineSnapshots[0]?.discipline || "running";
      setSelectedDiscipline(defaultDiscipline);
    }
  }, [activeBlock?.priority_discipline, analysis?.athlete.primary_discipline, disciplineSnapshots, selectedDiscipline]);

  const selectedSnapshot = useMemo(
    () => disciplineSnapshots.find((snapshot) => snapshot.discipline === selectedDiscipline) ?? disciplineSnapshots[0],
    [disciplineSnapshots, selectedDiscipline],
  );

  const lactateSeries = useMemo(
    () => buildDisciplineCurvePlot(selectedSnapshot?.view, selectedSnapshot?.discipline),
    [selectedSnapshot?.discipline, selectedSnapshot?.view],
  );

  const recentFeed = useMemo(
    () => dedupeRecentSessions(analysis),
    [analysis],
  );
  const visibleVolume = useMemo(
    () => volumeSummary(recentFeed),
    [recentFeed],
  );

  const allSessions = useMemo(() => allSessionsDeduped(analysis), [analysis]);
  const weeklyVolume12 = useMemo(() => buildWeeklyVolumeByDiscipline(allSessions, 12), [allSessions]);
  const [volumeDiscipline, setVolumeDiscipline] = useState<"running" | "cycling" | "swimming">("running");
  const volumeUnit = volumeDiscipline === "swimming" ? "m" : "km";
  const volumeDataKey = volumeDiscipline;

  const weeklyTotal = useMemo(
    () => disciplineSnapshots.reduce((sum, snapshot) => sum + snapshot.weeklySessions, 0),
    [disciplineSnapshots],
  );

  const monthlyTotal = useMemo(
    () => disciplineSnapshots.reduce((sum, snapshot) => sum + snapshot.monthlySessions, 0),
    [disciplineSnapshots],
  );

  const latestAnchor = latestHistorical(selectedSnapshot?.view?.historical_evolution?.lactate_anchor);
  const latestPeak = latestHistorical(selectedSnapshot?.view?.historical_evolution?.peak_lactate);
  const latestInterpretation = analysis?.interpretation?.slice(0, 2) ?? [];
  const coachSignals = analysis?.automated_comments?.slice(0, 3) ?? [];
  const focusDiscipline = selectedSnapshot?.discipline || activeBlock?.priority_discipline || analysis?.athlete.primary_discipline || "running";
  const focusEstimate =
    selectedSnapshot?.estimate ??
    getPrimaryEstimate(selectedSnapshot?.view, focusDiscipline === "ciclismo" ? "FTP" : focusDiscipline === "running" ? "HM" : "VO2max");
  const selectedPredictions = selectedSnapshot?.view.estimates?.slice(0, 3) ?? [];
  const vlamaxEstimate = selectedSnapshot?.view.estimates?.find((estimate) => estimate.estimate_type === "VLAMAX");

  const lactateFactContext = useMemo<LactateFactContext>(() => ({
    hasLT1: Boolean(selectedSnapshot?.lt1),
    hasLT2: Boolean(selectedSnapshot?.lt2),
    discipline: focusDiscipline,
    lt1Lactate: selectedSnapshot?.lt1?.lactate,
    lt2Lactate: selectedSnapshot?.lt2?.lactate,
    hasDynamicThresholds: Boolean(selectedSnapshot?.view?.dynamic_thresholds),
    hasMultipleSessions: (selectedSnapshot?.view?.recent_sessions?.length ?? 0) > 1,
  }), [selectedSnapshot, focusDiscipline]);
  const featuredPrediction = selectedPredictions[0] ?? null;
  const secondaryPredictions = featuredPrediction ? selectedPredictions.slice(1, 3) : [];
  const portalSignals = [activeBlock?.evaluation?.recommendation, ...coachSignals].filter((item): item is string => Boolean(item)).slice(0, 3);
  const portalStatus = buildPortalStatus({
    confidence: activeBlock?.evaluation?.confidence,
    nextTargetCountdown,
    summary: activeBlock?.evaluation?.summary ?? latestInterpretation[0],
    recommendation: activeBlock?.evaluation?.recommendation ?? latestInterpretation[1],
    hasTarget: Boolean(nextTarget),
  });
  const latestVisibleSession = selectedSnapshot?.latestSession ?? recentFeed[0];
  const weeklyBreakdown = disciplineSnapshots
    .map((snapshot) => ({
      discipline: snapshot.discipline,
      label: disciplineLabel(snapshot.discipline),
      value: snapshot.weeklySessions,
    }))
    .filter((item) => item.value > 0);
  const weeklyMaxSessions = Math.max(1, ...weeklyBreakdown.map((item) => item.value));
  const selectedDisciplineLabel = disciplineLabel(selectedSnapshot?.discipline || focusDiscipline);
  const referenceValue = focusEstimate ? formatTarget(focusEstimate) : renderThresholdValue(selectedSnapshot?.lt2, focusDiscipline);
  const referenceDetail = focusEstimate ? `${focusEstimate.estimate_type} · ${disciplineLabel(focusDiscipline)}` : "Referencia LT2 visible en tu disciplina activa.";
  const syncHeadline =
    analysis?.athlete.strava_connected || analysis?.athlete.garmin_connected ? "Actividad conectada" : "Conecta tu actividad";
  const syncSummary =
    analysis?.athlete.strava_connected || analysis?.athlete.garmin_connected
      ? "Ya hay una fuente real lista para cruzar sesiones y actividad visible."
      : "Autoriza Strava para que el dashboard conecte lo planificado con lo que realmente haces.";
  const syncProviders = [
    { label: "Strava", connected: Boolean(analysis?.athlete.strava_connected) },
    { label: "Garmin", connected: Boolean(analysis?.athlete.garmin_connected) },
  ];
  const dashboardMetrics = [
    {
      label: "Próxima cita",
      value: nextTarget ? relativeCountdownLabel(nextTargetCountdown) : "Sin fecha",
      detail: nextTarget ? buildTargetObjective({ category: nextTarget.distance_category, distanceLabel: nextTarget.distance_label, fallback: nextTarget.objective }) : "Todavía no hay un objetivo fechado visible.",
    },
    {
      label: "Disciplina foco",
      value: selectedDisciplineLabel,
      detail: activeBlock?.phase ? `Fase ${activeBlock.phase}` : "Bloque abierto",
    },
    {
      label: "Referencia",
      value: referenceValue,
      detail: referenceDetail,
    },
    {
      label: "Ritmo semanal",
      value: `${weeklyTotal} sesiones`,
      detail: `${formatSecondsToClock(visibleVolume.trainingHours * 3600)} visibles en los últimos días`,
    },
  ];
  const focusChecklist = [
    {
      label: "Bloque activo",
      value: activeBlock?.block_objective ?? "Base abierta",
      detail: activeBlock?.block_intent ? shortText(activeBlock.block_intent, 110) : "Todavía no hay una intención operativa visible para este bloque.",
    },
    {
      label: "Qué mirar hoy",
      value: portalStatus.emphasis,
      detail: `Lectura actual: ${confidenceLabel(activeBlock?.evaluation?.confidence)}.`,
    },
    {
      label: "Última sesión",
      value: latestVisibleSession?.session_type ?? "Sin sesión reciente",
      detail: latestVisibleSession ? `${disciplineLabel(latestVisibleSession.discipline)} · ${formatDate(latestVisibleSession.performed_at)}` : "Todavía no hay actividad reciente vinculada a este portal.",
    },
  ];
  const athleteHealthSummary = athleteHealth?.summary;
  const athleteHealthProviders = athleteHealth?.providers ?? [];
  const garminHealthProvider = athleteHealthProviders.find((provider) => provider.provider === "garmin") ?? null;
  const athleteHealthMetrics = athleteHealth?.health_metrics ?? [];
  const athleteSleepBreakdown = athleteHealth?.sleep_breakdown ?? [];
  const athletePerformanceMetrics = athleteHealth?.performance_metrics ?? [];
  const athleteHealthDays = athleteHealth?.health_days ?? [];
  const athleteHealthCalendar = athleteHealth?.activity_calendar ?? [];
  const athleteHealthRecent = athleteHealth?.recent_activities ?? [];
  const athleteHealthNotes = athleteHealth?.notes ?? [];
  const athleteWellnessPayload = athleteHealth?.raw_wellness ?? {};
  const athleteWellnessDiagnostics = (athleteWellnessPayload.diagnostics ?? null) as Record<string, unknown> | null;
  const athleteHealthMetricMap = useMemo(
    () =>
      athleteHealthMetrics.reduce<Record<string, AthleteHealthMetric>>((map, metric) => {
        map[metric.key] = metric;
        return map;
      }, {}),
    [athleteHealthMetrics],
  );
  const athleteWellnessDiagnosticCards = athleteWellnessDiagnostics
    ? [
        { label: "Sleep raw", value: athleteWellnessDiagnostics.raw_sleep_scores_count },
        { label: "Steps raw", value: athleteWellnessDiagnostics.raw_steps_count },
        { label: "Stress raw", value: athleteWellnessDiagnostics.raw_stress_count },
        { label: "Intensity raw", value: athleteWellnessDiagnostics.raw_intensity_count },
        { label: "HRV raw", value: athleteWellnessDiagnostics.raw_hrv_count },
      ].filter((item) => typeof item.value === "number")
    : [];
  const athleteWellnessJson = useMemo(() => {
    if (!Object.keys(athleteWellnessPayload).length) return null;
    return JSON.stringify(athleteWellnessPayload, null, 2);
  }, [athleteWellnessPayload]);
  const athleteWellnessPreviewFields = useMemo(() => flattenGarminObject(athleteWellnessPayload, "", [], 24), [athleteWellnessPayload]);
  const athleteSleepStageSegments = useMemo(() => parseSleepStageSegments(athleteWellnessPayload), [athleteWellnessPayload]);
  const sleepScoreValue = athleteHealthMetricMap.sleep_score?.value ?? "n/d";
  const recoveryScore = parseMetricNumber(sleepScoreValue);
  const recoveryToneClass = recoveryTone(recoveryScore);
  const wellnessSeries = useMemo(() => buildWellnessSeries(athleteHealthDays), [athleteHealthDays]);
  const currentWellness = wellnessSeries[wellnessSeries.length - 1] ?? null;
  const sleepSecondsMetric = athleteSleepBreakdown.find((metric) => metric.key === "sleep_time") ?? null;
  const sleepDurationDisplay =
    sleepSecondsMetric?.value ??
    formatSleepDuration(currentWellness?.sleepHours !== null && currentWellness?.sleepHours !== undefined ? currentWellness.sleepHours * 3600 : null);
  const sleepHoursAverage = averageNumericSeries(wellnessSeries.map((point) => point.sleepHours));
  const currentSleepHours = currentWellness?.sleepHours ?? null;
  const sleepHoursDelta = currentSleepHours !== null && sleepHoursAverage !== null ? currentSleepHours - sleepHoursAverage : null;
  const hrvAverage = averageNumericSeries(wellnessSeries.map((point) => point.hrv));
  const currentHrv = currentWellness?.hrv ?? parseMetricNumber(athleteHealthMetricMap.hrv?.value) ?? null;
  const currentHrvStatus = describeHrvStatus(athleteHealthMetricMap.hrv?.detail ?? currentWellness?.hrvStatus);
  const currentHrvTone = hrvStatusTone(athleteHealthMetricMap.hrv?.detail ?? currentWellness?.hrvStatus);
  const restingHrAverage = averageNumericSeries(wellnessSeries.map((point) => point.restingHr));
  const currentRestingHr = currentWellness?.restingHr ?? parseMetricNumber(athleteHealthMetricMap.resting_hr?.value) ?? null;
  const currentStress = currentWellness?.stress ?? parseMetricNumber(athleteHealthMetricMap.stress?.value) ?? null;
  const stressAverage = averageNumericSeries(wellnessSeries.map((point) => point.stress));
  const bodyBatteryDelta = currentWellness?.bodyBatteryChange ?? parseMetricNumber(athleteHealthMetricMap.body_battery?.value) ?? null;
  const bodyBatteryAverage = averageNumericSeries(wellnessSeries.map((point) => point.bodyBatteryChange));
  const bodyBatteryDirection = bodyBatteryDirectionLabel(bodyBatteryDelta, bodyBatteryAverage);
  const respirationMetric = athleteSleepBreakdown.find((metric) => metric.key === "respiration") ?? null;
  const currentRespiration = currentWellness?.respirationRate ?? parseMetricNumber(respirationMetric?.value) ?? null;
  const respirationAverage = averageNumericSeries(wellnessSeries.map((point) => point.respirationRate));
  const currentBreathingEvents = currentWellness?.breathingEvents ?? parseMetricNumber(respirationMetric?.detail) ?? null;
  const currentWeight = (() => {
    const metricVal = parseMetricNumber(athleteHealthMetricMap.weight?.value) ?? parseMetricNumber(athleteHealthMetricMap.body_weight?.value);
    if (metricVal) return metricVal;
    if (typeof analysis?.athlete?.weight === "number" && analysis.athlete.weight > 0) return analysis.athlete.weight;
    return null;
  })();
  const weightAverage = averageNumericSeries(wellnessSeries.map((p: any) => p.weight ?? null));
  const weightDelta = currentWeight !== null && weightAverage !== null ? currentWeight - weightAverage : null;
  const weightHistory = useMemo(() => {
    const entries = (analysis?.athlete?.weights ?? [])
      .map((w) => ({ date: w.recorded_at, weight: w.weight }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return entries;
  }, [analysis?.athlete?.weights]);
  const sleepArchitectureMetrics = useMemo(() => {
    const priority = ["sleep_time", "deep_sleep", "light_sleep", "rem_sleep", "awake_sleep"];
    return priority
      .map((key) => athleteSleepBreakdown.find((metric) => metric.key === key))
      .filter((metric): metric is AthleteHealthMetric => Boolean(metric));
  }, [athleteSleepBreakdown]);
  const sleepSupportMetrics = useMemo(
    () =>
      athleteSleepBreakdown.filter(
        (metric) => !["sleep_time", "deep_sleep", "light_sleep", "rem_sleep", "awake_sleep"].includes(metric.key),
      ),
    [athleteSleepBreakdown],
  );
  const visibleSleepSeconds = parseDurationLabelToSeconds(sleepArchitectureMetrics.find((metric) => metric.key === "sleep_time")?.value);
  const awakeSleepSeconds = parseDurationLabelToSeconds(sleepArchitectureMetrics.find((metric) => metric.key === "awake_sleep")?.value) ?? 0;
  const visibleNightSeconds = (visibleSleepSeconds ?? 0) + awakeSleepSeconds;
  const selectedSleepMetric =
    sleepArchitectureMetrics.find((metric) => metric.key === selectedSleepMetricKey) ?? sleepArchitectureMetrics[0] ?? null;
  const selectedSleepMetricSeconds = parseDurationLabelToSeconds(selectedSleepMetric?.value);
  const selectedSleepMetricShare =
    selectedSleepMetricSeconds && visibleNightSeconds > 0 ? Math.min(100, Math.round((selectedSleepMetricSeconds / visibleNightSeconds) * 100)) : null;
  const sleepStageWindow =
    athleteSleepStageSegments.length > 0
      ? {
          start: athleteSleepStageSegments[0].start,
          end: athleteSleepStageSegments[athleteSleepStageSegments.length - 1].end,
        }
      : null;

  useEffect(() => {
    if (!sleepArchitectureMetrics.length) {
      setSelectedSleepMetricKey(null);
      return;
    }
    if (!selectedSleepMetricKey || !sleepArchitectureMetrics.some((metric) => metric.key === selectedSleepMetricKey)) {
      setSelectedSleepMetricKey(sleepArchitectureMetrics[0].key);
    }
  }, [selectedSleepMetricKey, sleepArchitectureMetrics]);
  const hasExtendedHealthDetail =
    athleteHealthDays.length > 0 ||
    athleteWellnessDiagnosticCards.length > 0 ||
    athleteWellnessPreviewFields.length > 0 ||
    athleteHealthCalendar.length > 0 ||
    athleteHealthRecent.length > 0 ||
    athleteHealthNotes.length > 0;
  // ── Drawer-specific computations ───────────────────────────────
  const rangeSlice = trendRange === "7d" ? 7 : trendRange === "30d" ? 30 : 90;
  const trendData = useMemo(() => wellnessSeries.slice(-rangeSlice), [wellnessSeries, rangeSlice]);

  const hrvAvg30d = averageNumericSeries(wellnessSeries.slice(-30).map((p) => p.hrv));
  const restingHrAvg30d = averageNumericSeries(wellnessSeries.slice(-30).map((p) => p.restingHr));
  const sleepAvg30d = averageNumericSeries(wellnessSeries.slice(-30).map((p) => p.sleepHours));
  const stressAvg30d = averageNumericSeries(wellnessSeries.slice(-30).map((p) => p.stress));

  const hrvConsecutiveLow = useMemo(() => {
    let count = 0;
    for (let i = wellnessSeries.length - 1; i >= 0; i--) {
      const p = wellnessSeries[i];
      if (p.hrv === null) break;
      if (hrvAverage !== null && p.hrv < hrvAverage * 0.9) count++;
      else break;
    }
    return count;
  }, [wellnessSeries, hrvAverage]);

  const hrvInsight = useMemo(() => {
    if (hrvConsecutiveLow >= 3) return { text: `${hrvConsecutiveLow} días seguidos por debajo de tu baseline. Valora moderar la carga.`, tone: "warning" as const };
    if (typeof currentHrv === "number" && hrvAverage !== null && currentHrv > hrvAverage * 1.05) return { text: "Recuperación autonómica mejorando. Buena señal para cargar.", tone: "positive" as const };
    return { text: "Dentro de tu rango habitual. Sin señales de alarma.", tone: "info" as const };
  }, [hrvConsecutiveLow, currentHrv, hrvAverage]);

  const sleepInsight = useMemo(() => {
    const recentBelow = wellnessSeries.slice(-3).filter((p) => p.sleepHours !== null && sleepHoursAverage !== null && p.sleepHours < sleepHoursAverage).length;
    if (recentBelow >= 3) return { text: "Últimas 3 noches por debajo de tu media. La duración limita la recuperación.", tone: "warning" as const };
    if (typeof recoveryScore === "number" && recoveryScore >= 75 && sleepHoursDelta !== null && sleepHoursDelta < -0.3) return { text: "Buen score, pero algo corta en duración. La calidad compensa por ahora.", tone: "info" as const };
    return { text: "Patrón de sueño estable. Sin señales negativas.", tone: "positive" as const };
  }, [wellnessSeries, sleepHoursAverage, recoveryScore, sleepHoursDelta]);

  const rhrInsight = useMemo(() => {
    if (typeof currentRestingHr === "number" && restingHrAverage !== null && currentRestingHr > restingHrAverage + 5) return { text: "Frecuencia en reposo elevada respecto a tu baseline. Puede indicar fatiga acumulada.", tone: "warning" as const };
    if (typeof currentRestingHr === "number" && restingHrAverage !== null && currentRestingHr < restingHrAverage - 3) return { text: "Reposo más bajo de lo habitual. Buena señal de recuperación.", tone: "positive" as const };
    return { text: "Frecuencia en reposo dentro de tu rango normal.", tone: "info" as const };
  }, [currentRestingHr, restingHrAverage]);

  const stressInsight = useMemo(() => {
    if (typeof currentStress === "number" && currentStress >= 60) return { text: "Estrés elevado. La carga fisiológica y/o mental está alta hoy.", tone: "warning" as const };
    if (bodyBatteryDelta !== null && bodyBatteryDelta < -10) return { text: "La batería corporal ha caído bastante. Tu sistema se está drenando.", tone: "warning" as const };
    return { text: "Estrés bajo control. La carga se está gestionando bien.", tone: "positive" as const };
  }, [currentStress, bodyBatteryDelta]);

  // Balance bar position (0-100, 50 = optimal)
  const balancePosition = useMemo(() => {
    if (weeklyTotal === 0) return 20; // infraestimulado
    const hasHighStress = typeof currentStress === "number" && currentStress >= 65;
    const hasLowHrv = hrvConsecutiveLow >= 2;
    const hasHighRhr = typeof currentRestingHr === "number" && restingHrAverage !== null && currentRestingHr > restingHrAverage + 4;
    if (hasHighStress && hasLowHrv) return 80; // excesivo
    if (hasHighStress || hasLowHrv || hasHighRhr) return 65; // cargado
    if (weeklyTotal >= 4) return 50; // productivo
    return 35; // building
  }, [weeklyTotal, currentStress, hrvConsecutiveLow, currentRestingHr, restingHrAverage]);

  const balanceLabel = balancePosition <= 25 ? "Infraestimulado" : balancePosition <= 40 ? "Construyendo" : balancePosition <= 60 ? "Productivo" : balancePosition <= 75 ? "Cargado" : "Excesivo";

  // ── Hero trio cards: VO2max, Training Status, Readiness ────
  const vo2maxMetric = athletePerformanceMetrics.find((m) => m.key === "vo2max_running") ?? athletePerformanceMetrics.find((m) => m.key === "vo2max_cycling") ?? null;
  const vo2maxValue = vo2maxMetric ? parseFloat(vo2maxMetric.value) : null;
  const vo2maxLabel = vo2maxMetric?.key === "vo2max_cycling" ? "Ciclismo" : "Carrera";

  const trainingStatusLabel = useMemo(() => {
    const hasHighStress = typeof currentStress === "number" && currentStress >= 65;
    const hasLowHrv = hrvConsecutiveLow >= 3;
    const hasMildStress = typeof currentStress === "number" && currentStress >= 45;
    if (hasHighStress && hasLowHrv) return { label: "Sobrecarga", tone: "alert" as const, score: 15 };
    if (hasHighStress || hasLowHrv) return { label: "Fatigado", tone: "warning" as const, score: 35 };
    if (hasMildStress && hrvConsecutiveLow >= 1) return { label: "Funcional", tone: "neutral" as const, score: 55 };
    if (weeklyTotal >= 3 && typeof currentHrv === "number" && hrvAverage !== null && currentHrv >= hrvAverage * 0.95) return { label: "Productivo", tone: "good" as const, score: 85 };
    if (weeklyTotal >= 1) return { label: "Mantenimiento", tone: "neutral" as const, score: 50 };
    return { label: "Desentrenado", tone: "low" as const, score: 20 };
  }, [currentStress, hrvConsecutiveLow, weeklyTotal, currentHrv, hrvAverage]);

  const readinessScore = useMemo(() => {
    let score = 50;
    // Sleep contribution (0-30)
    if (typeof recoveryScore === "number") score += Math.min(30, Math.round((recoveryScore / 100) * 30)) - 15;
    // HRV contribution (0-25)
    if (typeof currentHrv === "number" && hrvAverage !== null && hrvAverage > 0) {
      const ratio = currentHrv / hrvAverage;
      score += Math.round(Math.min(1.2, Math.max(0.7, ratio)) * 25) - 20;
    }
    // Stress penalty (0-20)
    if (typeof currentStress === "number") score -= Math.round(Math.max(0, currentStress - 30) * 0.3);
    // Body battery bonus
    if (bodyBatteryDelta !== null && bodyBatteryDelta > 0) score += Math.min(10, Math.round(bodyBatteryDelta * 0.15));
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [recoveryScore, currentHrv, hrvAverage, currentStress, bodyBatteryDelta]);

  const readinessLabel = readinessScore >= 80 ? "Óptimo" : readinessScore >= 60 ? "Preparado" : readinessScore >= 40 ? "Moderado" : readinessScore >= 20 ? "Bajo" : "Crítico";
  const readinessTone = readinessScore >= 80 ? "high" : readinessScore >= 60 ? "good" : readinessScore >= 40 ? "mid" : readinessScore >= 20 ? "low" : "critical";

  const statusTrend = useMemo(() => buildStatusTrend(wellnessSeries), [wellnessSeries]);

  // ── Weekly calendar ──────────────────────────────────────────
  const calendarWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) + calWeekOffset * 7);
    const days: Array<{ date: Date; iso: string; label: string; dayNum: number; isToday: boolean }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      days.push({
        date: d,
        iso,
        label: d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "").toUpperCase(),
        dayNum: d.getDate(),
        isToday: d.getTime() === today.getTime(),
      });
    }
    return days;
  }, [calWeekOffset]);

  const calendarWeekLabel = useMemo(() => {
    if (!calendarWeek.length) return "";
    const first = calendarWeek[0].date;
    const last = calendarWeek[6].date;
    const fmtDay = (d: Date) => d.getDate();
    const fmtMonth = (d: Date) => d.toLocaleDateString("es-ES", { month: "short" });
    if (first.getMonth() === last.getMonth()) {
      return `${fmtDay(first)}-${fmtDay(last)} ${fmtMonth(last)} ${last.getFullYear()}`;
    }
    return `${fmtDay(first)} ${fmtMonth(first)} - ${fmtDay(last)} ${fmtMonth(last)} ${last.getFullYear()}`;
  }, [calendarWeek]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, PlanningPlannedSession[]>();
    for (const session of plannedSessions) {
      const existing = map.get(session.scheduled_date) ?? [];
      existing.push(session);
      map.set(session.scheduled_date, existing);
    }
    return map;
  }, [plannedSessions]);

  const calWeekSessions = useMemo(() => {
    return calendarWeek.map((day) => ({
      ...day,
      sessions: sessionsByDate.get(day.iso) ?? [],
    }));
  }, [calendarWeek, sessionsByDate]);

  const calWeekTotalSessions = calWeekSessions.reduce((sum, d) => sum + d.sessions.length, 0);
  const calWeekTotalMinutes = calWeekSessions.reduce((sum, d) =>
    sum + d.sessions.reduce((s, sess) => s + (typeof sess.payload?.total_duration_min === "number" ? sess.payload.total_duration_min as number : 0), 0),
    0,
  );

  const zoneDistribution = (() => {
    const totals = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
    for (const day of calWeekSessions) {
      for (const s of day.sessions) {
        const dur = typeof s.payload?.total_duration_min === "number" ? s.payload.total_duration_min as number : 45;
        if (s.session_role === "LONG") { totals.z1 += dur * 0.6; totals.z2 += dur * 0.4; }
        else if (s.session_role === "SUPPORT") { totals.z2 += dur * 0.7; totals.z1 += dur * 0.3; }
        else if (s.session_role === "KEY") { totals.z3 += dur * 0.4; totals.z4 += dur * 0.4; totals.z5 += dur * 0.2; }
      }
    }
    const total = totals.z1 + totals.z2 + totals.z3 + totals.z4 + totals.z5;
    if (total === 0) return null;
    return {
      z1: Math.round((totals.z1 / total) * 100),
      z2: Math.round((totals.z2 / total) * 100),
      z3: Math.round((totals.z3 / total) * 100),
      z4: Math.round((totals.z4 / total) * 100),
      z5: Math.round((totals.z5 / total) * 100),
      totalMin: Math.round(total),
    };
  })();

  // ── Monthly activity calendar (Garmin-style) ──────────────────
  const monthCalendar = useMemo(() => {
    if (!athleteHealthCalendar.length) return { monthLabel: "", weeks: [] as Array<Array<{ date: string; dayNum: number; isToday: boolean; isCurrentMonth: boolean; activityCount: number; sportLabel: string | null; sportColor: string | null }>>, streak: 0, streakActivities: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();
    const month = today.getMonth();
    const monthLabel = today.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

    // Build lookup from calendar data
    const lookup = new Map<string, { count: number; label: string | null; color: string | null }>();
    for (const day of athleteHealthCalendar) {
      lookup.set(day.date, { count: day.activity_count, label: day.primary_sport_label ?? null, color: day.primary_sport_color ?? null });
    }

    // Build grid: start from Monday of first week of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const gridStart = new Date(firstDay);
    gridStart.setDate(gridStart.getDate() - startOffset);

    const weeks: Array<Array<{ date: string; dayNum: number; isToday: boolean; isCurrentMonth: boolean; activityCount: number; sportLabel: string | null; sportColor: string | null }>> = [];
    const cursor = new Date(gridStart);
    while (cursor <= lastDay || cursor.getDay() !== 1) {
      const week: typeof weeks[0] = [];
      for (let i = 0; i < 7; i++) {
        const iso = cursor.toISOString().slice(0, 10);
        const entry = lookup.get(iso);
        week.push({
          date: iso,
          dayNum: cursor.getDate(),
          isToday: cursor.getTime() === today.getTime(),
          isCurrentMonth: cursor.getMonth() === month,
          activityCount: entry?.count ?? 0,
          sportLabel: entry?.label ?? null,
          sportColor: entry?.color ?? null,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
      if (weeks.length >= 6) break; // max 6 weeks
    }

    // Compute streak (consecutive days with activity ending today or yesterday)
    let streak = 0;
    let streakActivities = 0;
    const streakCursor = new Date(today);
    // Allow streak to start from yesterday if today has no activity yet
    const todayIso = today.toISOString().slice(0, 10);
    const todayEntry = lookup.get(todayIso);
    if (!todayEntry || todayEntry.count === 0) {
      streakCursor.setDate(streakCursor.getDate() - 1);
    }
    for (let i = 0; i < 365; i++) {
      const iso = streakCursor.toISOString().slice(0, 10);
      const entry = lookup.get(iso);
      if (entry && entry.count > 0) {
        streak++;
        streakActivities += entry.count;
        streakCursor.setDate(streakCursor.getDate() - 1);
      } else {
        break;
      }
    }

    return { monthLabel, weeks, streak, streakActivities };
  }, [athleteHealthCalendar]);

  // ── Activity summary: cumulative hours (current 28d vs previous 28d) ──
  const activitySummary = useMemo(() => {
    if (!athleteHealthCalendar.length) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calendar data covers last 28 days. Build a lookup.
    const lookup = new Map<string, number>();
    for (const day of athleteHealthCalendar) lookup.set(day.date, day.total_duration_seconds);

    // Current period: last 28 days cumulative
    const current: Array<{ dayIndex: number; label: string; hours: number }> = [];
    let cumCurrent = 0;
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      cumCurrent += (lookup.get(iso) ?? 0) / 3600;
      current.push({
        dayIndex: 27 - i,
        label: d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", ""),
        hours: Math.round(cumCurrent * 10) / 10,
      });
    }

    // Previous period: 28 days before that (day -56 to day -29)
    const prev: Array<{ dayIndex: number; hours: number }> = [];
    let cumPrev = 0;
    for (let i = 55; i >= 28; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      cumPrev += (lookup.get(iso) ?? 0) / 3600;
      prev.push({ dayIndex: 55 - i, hours: Math.round(cumPrev * 10) / 10 });
    }

    const totalHours = cumCurrent;
    const totalH = Math.floor(totalHours);
    const totalM = Math.round((totalHours - totalH) * 60);
    const delta = cumCurrent - cumPrev;
    const deltaH = Math.floor(Math.abs(delta));
    const deltaM = Math.round((Math.abs(delta) - deltaH) * 60);

    // Merge into chart data
    const chartData = current.map((c, i) => ({
      label: c.label,
      current: c.hours,
      previous: prev[i]?.hours ?? 0,
    }));

    // Date range labels
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 27);
    const rangeLabel = `${startDate.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – ${today.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`;

    return { chartData, totalH, totalM, delta, deltaH, deltaM, rangeLabel };
  }, [athleteHealthCalendar]);

  const todayPortalLabel = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const dailyPhrases = [
    "Hoy es un buen día para superarte.",
    "Confía en el proceso.",
    "Cada sesión cuenta.",
    "Tu cuerpo es más fuerte de lo que crees.",
    "La constancia gana al talento.",
    "Hoy entrenas para el mañana.",
    "Lo que haces hoy importa.",
    "Pequeños pasos, grandes resultados.",
    "Tú marcas el ritmo.",
    "El esfuerzo silencioso es el que más paga.",
    "No necesitas motivación, necesitas disciplina.",
    "Estás más cerca de lo que piensas.",
    "Cada día es una oportunidad nueva.",
    "Tu mejor versión se construye hoy.",
    "Respira, enfoca, ejecuta.",
    "El camino se hace paso a paso.",
    "Hoy es tu día.",
    "Entrena con intención, descansa con propósito.",
    "Lo difícil se vuelve fácil con repetición.",
    "Sé paciente con el proceso, exigente con el esfuerzo.",
    "La mejora no siempre es visible, pero siempre está ahí.",
    "Tu único rival eres tú de ayer.",
    "Haz que este entrenamiento cuente.",
    "La fatiga es temporal, el progreso es permanente.",
    "Confía en tu preparación.",
    "Hoy toca dar un paso más.",
    "Menos excusas, más kilómetros.",
    "Tu futuro yo te lo agradecerá.",
    "El dolor de hoy es la fuerza de mañana.",
    "Mantén el foco, el resultado llega solo.",
    "Eres capaz de más de lo que imaginas.",
  ];
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const dailyPhrase = dailyPhrases[dayOfYear % dailyPhrases.length];
  const portalQuickChips = [
    { label: "Disciplina", value: selectedDisciplineLabel },
    { label: "Recovery", value: sleepScoreValue },
    { label: "Bloque", value: portalStatus.label },
    { label: "Objetivo", value: nextTarget ? relativeCountdownLabel(nextTargetCountdown) : "Sin fecha" },
  ];
  const recoveryRingStyle = {
    "--progress": `${Math.max(6, Math.min(100, recoveryScore ?? 12))}%`,
  } as CSSProperties;
  const selectedGarminActivity = useMemo(() => {
    if (!garminPreview?.activities.length) return null;
    const previewMatch = garminPreview.activities.find((activity) => activity.provider_activity_id === selectedGarminActivityId) ?? garminPreview.activities[0] ?? null;
    if (!previewMatch) return null;
    return garminActivityDetails[previewMatch.provider_activity_id] ?? previewMatch;
  }, [garminActivityDetails, garminPreview?.activities, selectedGarminActivityId]);
  const selectedGarminJson = useMemo(() => {
    if (!selectedGarminActivity?.raw_detail || !Object.keys(selectedGarminActivity.raw_detail).length) return null;
    return JSON.stringify(selectedGarminActivity.raw_detail, null, 2);
  }, [selectedGarminActivity]);
  const selectedGarminFields = useMemo(() => {
    if (!selectedGarminActivity?.raw_detail) return [];
    return flattenGarminObject(selectedGarminActivity.raw_detail);
  }, [selectedGarminActivity]);

  const fitnessData = useMemo(() => {
    // Use real training load data from backend when available
    if (trainingLoad?.days?.length) {
      return trainingLoad.days.map((day) => ({
        date: day.date,
        label: new Date(day.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", ""),
        atl: day.atl,
        ctl: day.ctl,
        tsb: day.tsb,
        acwr: day.acwr,
        tss: day.tss_total,
      }));
    }

    // Fallback: duration proxy
    if (!athleteHealthCalendar.length) return [];
    const sorted = [...athleteHealthCalendar].sort((a, b) => a.date.localeCompare(b.date));

    let atl = 0;
    let ctl = 0;
    const atlDecay = 2 / (7 + 1);
    const ctlDecay = 2 / (42 + 1);

    return sorted.map((day) => {
      const load = day.total_duration_seconds / 60;
      atl = atl * (1 - atlDecay) + load * atlDecay;
      ctl = ctl * (1 - ctlDecay) + load * ctlDecay;
      const tsb = ctl - atl;
      return {
        date: day.date,
        label: new Date(day.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", ""),
        atl: Math.round(atl * 10) / 10,
        ctl: Math.round(ctl * 10) / 10,
        tsb: Math.round(tsb * 10) / 10,
        acwr: ctl >= 10 ? Math.round((atl / ctl) * 100) / 100 : null as number | null,
        tss: load,
      };
    });
  }, [athleteHealthCalendar, trainingLoad]);

  const personalBests = useMemo(() => {
    const recent = athleteHealthRecent ?? [];
    const bests: Array<{ category: string; value: string; detail: string; date: string }> = [];

    const runActivities = recent.filter((a) => {
      const sport = (a.sport_type ?? "").toLowerCase();
      return sport.includes("running") || sport.includes("trail");
    });

    // Best 5K
    const near5k = runActivities.filter((a) => a.distance_m >= 4500 && a.distance_m <= 5500);
    if (near5k.length > 0) {
      const best = near5k.reduce((b, a) => (a.moving_time_seconds / a.distance_m) < (b.moving_time_seconds / b.distance_m) ? a : b);
      const pace = best.moving_time_seconds / (best.distance_m / 1000);
      const paceMin = Math.floor(pace / 60);
      const paceSec = Math.round(pace % 60);
      bests.push({ category: "5K", value: `${Math.floor(best.moving_time_seconds / 60)}:${String(Math.round(best.moving_time_seconds % 60)).padStart(2, "0")}`, detail: `${paceMin}:${String(paceSec).padStart(2, "0")} /km`, date: best.started_at ?? "" });
    }

    // Best 10K
    const near10k = runActivities.filter((a) => a.distance_m >= 9000 && a.distance_m <= 11000);
    if (near10k.length > 0) {
      const best = near10k.reduce((b, a) => (a.moving_time_seconds / a.distance_m) < (b.moving_time_seconds / b.distance_m) ? a : b);
      const pace = best.moving_time_seconds / (best.distance_m / 1000);
      const paceMin = Math.floor(pace / 60);
      const paceSec = Math.round(pace % 60);
      bests.push({ category: "10K", value: `${Math.floor(best.moving_time_seconds / 60)}:${String(Math.round(best.moving_time_seconds % 60)).padStart(2, "0")}`, detail: `${paceMin}:${String(paceSec).padStart(2, "0")} /km`, date: best.started_at ?? "" });
    }

    // Best Half Marathon
    const nearHM = runActivities.filter((a) => a.distance_m >= 20000 && a.distance_m <= 22000);
    if (nearHM.length > 0) {
      const best = nearHM.reduce((b, a) => a.moving_time_seconds < b.moving_time_seconds ? a : b);
      const h = Math.floor(best.moving_time_seconds / 3600);
      const m = Math.floor((best.moving_time_seconds % 3600) / 60);
      const s = Math.round(best.moving_time_seconds % 60);
      bests.push({ category: "Media maratón", value: `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`, detail: `${(best.distance_m / 1000).toFixed(1)} km`, date: best.started_at ?? "" });
    }

    // Best cycling average power
    const bikeActivities = recent.filter((a) => {
      const sport = (a.sport_type ?? "").toLowerCase();
      return sport.includes("cycling") || sport.includes("biking") || sport.includes("indoor");
    });
    const bestPower = bikeActivities.filter((a) => typeof a.average_watts === "number" && (a.average_watts ?? 0) > 0);
    if (bestPower.length > 0) {
      const best = bestPower.reduce((b, a) => (a.average_watts ?? 0) > (b.average_watts ?? 0) ? a : b);
      bests.push({ category: "Mejor potencia media", value: `${Math.round(best.average_watts ?? 0)} W`, detail: `${(best.distance_m / 1000).toFixed(1)} km`, date: best.started_at ?? "" });
    }

    return bests;
  }, [athleteHealthRecent]);

  if (loading) {
    return <div className="loading">Preparando tu panel...</div>;
  }

  if (error || !analysis) {
    return (
      <div className="page-grid">
        <section className="card athlete-portal-note">
          <span className="eyebrow">Portal atleta</span>
          <h1>No hemos podido cargar tu panel</h1>
          <p>{error ?? "Falta vincular este acceso a un atleta real."}</p>
        </section>
      </div>
    );
  }

  async function handleSaveWeight() {
    if (!user || !token || !user.athlete_id) return;
    const val = parseFloat(weightInput.replace(",", "."));
    if (isNaN(val) || val < 20 || val > 300) return;
    setWeightSaving(true);
    try {
      await api.addAthleteWeight(token, user.athlete_id, {
        recorded_at: new Date().toISOString().slice(0, 10),
        weight: val,
        source: "manual",
      });
      window.location.reload();
    } catch {
      // silent
    } finally {
      setWeightSaving(false);
    }
  }

  async function handleStravaConnect() {
    setStravaRedirecting(true);
    setStravaFeedback(null);
    try {
      const payload = await api.stravaConnectStart(token);
      window.location.assign(payload.authorize_url);
    } catch (connectError) {
      setStravaFeedback(connectError instanceof Error ? connectError.message : "No se pudo iniciar la conexión con Strava.");
      setStravaRedirecting(false);
    }
  }

  async function handleGarminConnect() {
    if (!user?.athlete_id) return;
    setGarminConnectLoading(true);
    setGarminConnectError(null);
    setGarminConnectMessage(null);
    try {
      const result = await api.garminConnect(token, user.athlete_id, {
        email: garminEmail,
        password: garminPassword,
        ...(garminMfaCode.trim() ? { mfa_code: garminMfaCode.trim() } : {}),
      });
      setGarminConnectMessage(`Garmin conectado para ${analysis?.athlete.name ?? "tu atleta"} (${result.garmin_email}).`);
      setGarminPassword("");
      setGarminMfaCode("");
      setGarminLoginOpen(false);
      const refreshed = (await api.athleteAnalysis(token, user.athlete_id)) as AthleteAnalysis;
      setAnalysis(refreshed);
      const healthRefreshed = (await api.athleteHealthOverview(token, user.athlete_id, 28, {
        includeActivity: false,
        includeRawWellness: false,
        refreshLiveHealth: false,
      })) as AthleteHealthOverview;
      setAthleteHealth(healthRefreshed);
    } catch (connectError) {
      setGarminConnectError(connectError instanceof Error ? connectError.message : "No se pudo conectar Garmin.");
    } finally {
      setGarminConnectLoading(false);
    }
  }

  async function handleLoadGarminRaw() {
    if (!user?.athlete_id) return;
    setGarminPreviewLoading(true);
    setGarminPreviewError(null);
    setGarminActivityError(null);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 13);
      const result = (await api.garminPreview(
        token,
        user.athlete_id,
        startDate.toISOString().slice(0, 10),
        endDate.toISOString().slice(0, 10),
        { includeFullDetail: false, activityLimit: 6 },
      )) as GarminActivitiesPreviewResponse;
      setGarminPreview(result);
      setGarminActivityDetails({});
      const firstActivityId = result.activities[0]?.provider_activity_id ?? null;
      setSelectedGarminActivityId(firstActivityId);
      if (firstActivityId) {
        const detail = (await api.garminActivityDetail(token, user.athlete_id, firstActivityId)) as GarminActivity;
        setGarminActivityDetails({ [firstActivityId]: detail });
      }
    } catch (loadError) {
      setGarminPreview(null);
      setSelectedGarminActivityId(null);
      setGarminPreviewError(loadError instanceof Error ? loadError.message : "No se pudo cargar el payload Garmin.");
    } finally {
      setGarminPreviewLoading(false);
    }
  }

  async function handleRefreshAthleteHealth() {
    if (!user?.athlete_id) return;
      setAthleteHealthLoading(true);
      setAthleteHealthError(null);
      setAthleteHealthStatus("Consultando Garmin en vivo...");
      try {
      const refreshed = (await api.athleteHealthOverview(token, user.athlete_id, 28, {
        includeActivity: false,
        includeRawWellness: true,
        refreshLiveHealth: true,
      })) as AthleteHealthOverview;
      setAthleteHealth(refreshed);
      const diagnostics = (refreshed.raw_wellness?.diagnostics ?? {}) as Record<string, unknown>;
      const rawCount = [
        diagnostics.raw_sleep_scores_count,
        diagnostics.raw_steps_count,
        diagnostics.raw_stress_count,
        diagnostics.raw_intensity_count,
        diagnostics.raw_hrv_count,
      ].reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0);
      const hasVisibleWellness =
        refreshed.health_metrics.length > 0 ||
        refreshed.health_days.length > 0 ||
        Object.keys(refreshed.raw_wellness ?? {}).length > 0;
      setAthleteHealthStatus(
        hasVisibleWellness
          ? "Datos Garmin actualizados."
          : rawCount > 0
            ? "Garmin ha devuelto payload crudo, pero no hemos conseguido mapear métricas visibles todavía."
            : "Garmin ha respondido, pero esta cuenta no ha devuelto métricas de wellness visibles.",
      );
      } catch (loadError) {
        setAthleteHealthError(loadError instanceof Error ? loadError.message : "No se pudo refrescar la salud Garmin.");
        setAthleteHealthStatus(null);
      } finally {
        setAthleteHealthLoading(false);
      }
  }

  async function handleOpenGarminActivity(activityId: number) {
    if (!user?.athlete_id) return;
    setSelectedGarminActivityId(activityId);
    setGarminActivityError(null);
    if (garminActivityDetails[activityId]) return;
    setGarminActivityLoading(true);
    try {
      const result = (await api.garminActivityDetail(token, user.athlete_id, activityId)) as GarminActivity;
      setGarminActivityDetails((current) => ({ ...current, [activityId]: result }));
    } catch (loadError) {
      setGarminActivityError(loadError instanceof Error ? loadError.message : "No se pudo cargar el detalle Garmin.");
    } finally {
      setGarminActivityLoading(false);
    }
  }

  const todaySessions = calWeekSessions.find((d) => d.isToday)?.sessions ?? [];

  return (
    <div className="page-grid ap-dashboard">

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 1 — Hero
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="ap-block ap-hero">
        {/* Date pinned top-left */}
        <p className="ap-hero-date">
          {todayPortalLabel}
          {weather && (() => { const w = weatherLabel(weather.code); return <span className="ap-hero-weather">{w.icon} {weather.temp}°C {w.desc}</span>; })()}
        </p>

        {/* Centered name + phrase */}
        <div className="ap-hero-center">
          <h1 className="ap-hero-name">{analysis.athlete.name}</h1>
          <p className="ap-hero-phrase">{dailyPhrase}</p>
        </div>

        {/* 3-ring row: VO2max — Predisposición — Estado */}
        <div className="ap-rings-row">

          {/* VO2max ring */}
          <div className="ap-metric-ring-block">
            <span className="ap-metric-ring-title">VO₂max</span>
            <div className="ap-metric-ring-wrap small">
              <svg viewBox="0 0 80 80" width="72" height="72">
                <circle className="ap-ring-track" cx="40" cy="40" r="34" />
                <circle
                  className="ap-ring-fill vo2"
                  cx="40" cy="40" r="34"
                  strokeDasharray={`${2 * Math.PI * 34}`}
                  strokeDashoffset={`${2 * Math.PI * 34 * (1 - Math.min(1, Math.max(0, ((vo2maxValue ?? 25) - 25) / 45)))}`}
                />
              </svg>
              <span className="ap-metric-ring-value">{vo2maxValue !== null && Number.isFinite(vo2maxValue) ? vo2maxValue.toFixed(0) : "–"}</span>
            </div>
            <span className="ap-metric-ring-sub">{vo2maxValue !== null ? vo2maxLabel : "Sin datos"}</span>
          </div>

          {/* Predisposición ring — main, larger */}
          <div className="ap-metric-ring-block main">
            <span className="ap-metric-ring-title">Predisposición</span>
            <div className="ap-recovery-ring">
              <div className="ap-recovery-ring-wrap">
                <svg viewBox="0 0 120 120" width="120" height="120">
                  <circle className="ap-ring-track" cx="60" cy="60" r="52" />
                  <circle
                    className={`ap-ring-fill readiness-${readinessTone}`}
                    cx="60" cy="60" r="52"
                    strokeDasharray={`${2 * Math.PI * 52}`}
                    strokeDashoffset={`${2 * Math.PI * 52 * (1 - readinessScore / 100)}`}
                  />
                </svg>
                <span className="ap-recovery-ring-value">{readinessScore}</span>
              </div>
            </div>
            <span className={`ap-readiness-label-text ${readinessTone}`}>{readinessLabel}</span>
          </div>

          {/* Estado ring */}
          <div className="ap-metric-ring-block">
            <span className="ap-metric-ring-title">Estado</span>
            <div className={`ap-metric-ring-wrap small status-${trainingStatusLabel.tone}`}>
              <svg viewBox="0 0 80 80" width="72" height="72">
                <circle className="ap-ring-track" cx="40" cy="40" r="34" />
                <circle
                  className={`ap-ring-fill status-${trainingStatusLabel.tone}`}
                  cx="40" cy="40" r="34"
                  strokeDasharray={`${2 * Math.PI * 34}`}
                  strokeDashoffset={`${2 * Math.PI * 34 * (1 - trainingStatusLabel.score / 100)}`}
                />
              </svg>
              <span className="ap-metric-ring-value small">{trainingStatusLabel.score}</span>
            </div>
            <span className={`ap-readiness-label-text ${trainingStatusLabel.tone}`}>{trainingStatusLabel.label}</span>
          </div>

        </div>

        {/* 12-week volume chart — centered */}
        <div className="ap-volume-chart">
          <div className="ap-volume-chart-head">
            <span className="ap-volume-chart-title">Volumen 12 semanas</span>
            <div className="ap-volume-disc-btns">
              <button type="button" className={`ap-volume-disc-btn ${volumeDiscipline === "running" ? "active" : ""}`} onClick={() => setVolumeDiscipline("running")} title="Carrera">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4a1 1 0 1 0 2 0 1 1 0 0 0-2 0"/><path d="M7 21l3-4 2.5 1 3.5-6-3-2-4 2-2 4"/><path d="M16 11l2-2 3 1"/></svg>
              </button>
              <button type="button" className={`ap-volume-disc-btn ${volumeDiscipline === "cycling" ? "active" : ""}`} onClick={() => setVolumeDiscipline("cycling")} title="Bici">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 2 0 1 1 0 0 0-2 0"/><path d="M12 17.5V14l-3-3 4-3 2 3h3"/></svg>
              </button>
              <button type="button" className={`ap-volume-disc-btn ${volumeDiscipline === "swimming" ? "active" : ""}`} onClick={() => setVolumeDiscipline("swimming")} title="Natación">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={weeklyVolume12} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <XAxis dataKey="weekLabel" tick={{ fontSize: 10, fill: "#8a8a9a" }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#8a8a9a" }} axisLine={false} tickLine={false} width={36} unit={volumeDiscipline === "swimming" ? "m" : "km"} />
              <Tooltip
                contentStyle={{ background: "#1e1e2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "#ccc" }}
                formatter={(value: number) => [`${value.toFixed(1)} ${volumeUnit}`, volumeDiscipline === "running" ? "Carrera" : volumeDiscipline === "cycling" ? "Bici" : "Natación"]}
              />
              <Line type="monotone" dataKey={volumeDataKey} stroke={volumeDiscipline === "running" ? "#4fb46b" : volumeDiscipline === "cycling" ? "#e6a03c" : "#5b9bd5"} strokeWidth={2} dot={{ r: 2.5, fill: volumeDiscipline === "running" ? "#4fb46b" : volumeDiscipline === "cycling" ? "#e6a03c" : "#5b9bd5", strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Upcoming events — inline, no card */}
        {upcomingTargets.length > 0 ? (
          <div className="ap-events-inline">
            {upcomingTargets.slice(0, 2).map((target) => {
              const daysLeft = daysUntil(target.target_date);
              return (
                <div key={target.id} className="ap-event-row">
                  <span className="ap-event-icon"><EventIcon discipline={target.discipline} distanceCategory={target.distance_category} /></span>
                  <div className="ap-event-info">
                    <strong className="ap-event-name">{target.objective}</strong>
                    {target.distance_label ? <span className="ap-event-detail">{target.distance_label}</span> : null}
                    <span className="ap-event-countdown">{daysLeft !== null && daysLeft >= 0 ? `${daysLeft}d` : formatDate(target.target_date)}</span>
                    {target.target_pace_label ? <span className="ap-event-goal">Obj: {target.target_pace_label}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Vital chips row */}
        <div className="ap-vital-chips">
          {/* Sleep card with Garmin-style hypnogram */}
          <button type="button" className="ap-vital-chip ap-sleep-card" onClick={() => setOpenDrawer("sleep")}>
            <div className="ap-sleep-card-head">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              <span className="ap-vital-chip-label">Sueño</span>
            </div>
            <span className="ap-vital-chip-value">{sleepDurationDisplay}</span>
            {sleepStageWindow ? (
              <span className="ap-sleep-time-range">
                {new Date(sleepStageWindow.start).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                {" – "}
                {new Date(sleepStageWindow.end).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
            {/* Garmin-style hypnogram */}
            {athleteSleepStageSegments.length > 0 && sleepStageWindow ? (() => {
              const total = sleepStageWindow.end - sleepStageWindow.start || 1;
              const W = 200;
              const H = 48;
              const pad = 2;
              const stageY = (s: SleepStageKey) => s === "awake" ? pad : s === "rem" ? pad + (H - pad * 2) * 0.28 : s === "light" ? pad + (H - pad * 2) * 0.56 : H - pad;
              const stageColor = (s: SleepStageKey) => s === "awake" ? "#e6a03c" : s === "rem" ? "#7c9eeb" : s === "light" ? "#5b9bd5" : "#6b5bce";
              return (
                <div className="ap-hypnogram-wrap">
                  <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
                    {athleteSleepStageSegments.map((seg, i) => {
                      const x1 = ((seg.start - sleepStageWindow.start) / total) * W;
                      const x2 = ((seg.end - sleepStageWindow.start) / total) * W;
                      const y = stageY(seg.stage);
                      const barW = Math.max(1, x2 - x1);
                      const color = stageColor(seg.stage);
                      // Vertical connector to next segment
                      const next = athleteSleepStageSegments[i + 1];
                      const nextY = next ? stageY(next.stage) : y;
                      return (
                        <g key={i}>
                          <rect x={x1} y={Math.min(y, H - pad)} width={barW} height={Math.max(2, H - pad - Math.min(y, H - pad))} fill={color} opacity={0.55} rx={0.5} />
                          <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={2.2} />
                          {next ? <line x1={x2} y1={y} x2={x2} y2={nextY} stroke={stageColor(next.stage)} strokeWidth={1.2} opacity={0.5} /> : null}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              );
            })() : (
              <span className="ap-vital-chip-status purple">{sleepScoreLabel(recoveryScore)}</span>
            )}
            {/* Sleep composition bar */}
            {(() => {
              const stages = (["deep_sleep", "light_sleep", "rem_sleep", "awake_sleep"] as const).map((key) => {
                const m = sleepArchitectureMetrics.find((x) => x.key === key);
                return { key, seconds: parseDurationLabelToSeconds(m?.value) ?? 0 };
              });
              const total = stages.reduce((s, st) => s + st.seconds, 0);
              if (total === 0) return null;
              const colors: Record<string, string> = { deep_sleep: "#6b5bce", light_sleep: "#5b9bd5", rem_sleep: "#7c9eeb", awake_sleep: "#e6a03c" };
              const labels: Record<string, string> = { deep_sleep: "Prof.", light_sleep: "Lig.", rem_sleep: "REM", awake_sleep: "Desp." };
              return (
                <div className="ap-sleep-comp">
                  <div className="ap-sleep-comp-bar">
                    {stages.filter((s) => s.seconds > 0).map((s) => (
                      <div key={s.key} className="ap-sleep-comp-seg" style={{ flex: s.seconds, background: colors[s.key] }} />
                    ))}
                  </div>
                  <div className="ap-sleep-comp-labels">
                    {stages.filter((s) => s.seconds > 0).map((s) => (
                      <span key={s.key} className="ap-sleep-comp-lbl" style={{ color: colors[s.key] }}>
                        {labels[s.key]} {Math.round((s.seconds / total) * 100)}%
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
            <span className="ap-vital-chip-delta">
              {sleepHoursDelta === null ? "" : `${sleepHoursDelta > 0 ? "+" : ""}${Math.round(sleepHoursDelta * 60)} min vs 7d`}
            </span>
          </button>
          {/* HRV card with mini sparkline */}
          <button type="button" className="ap-vital-chip ap-hrv-card" onClick={() => setOpenDrawer("hrv")}>
            <div className="ap-hrv-card-head">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 12 6 12 8 6 11 18 14 8 16 12 22 12"/></svg>
              <span className="ap-vital-chip-label">HRV nocturna</span>
            </div>
            <div className="ap-hrv-value-row">
              <span className="ap-vital-chip-value">{typeof currentHrv === "number" ? `${currentHrv.toFixed(1)}` : "n/d"}<small className="ap-hrv-unit">ms</small></span>
            </div>
            <span className={`ap-hrv-status ${currentHrvTone}`}>{currentHrvStatus}</span>
            {/* Mini HRV sparkline — last 14d */}
            <div className="ap-hrv-spark">
              <ResponsiveContainer width="100%" height={36}>
                <LineChart data={wellnessSeries.slice(-14)} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                  {hrvAverage !== null ? <ReferenceArea y1={hrvAverage * 0.92} y2={hrvAverage * 1.08} fill="#4fb46b" fillOpacity={0.08} /> : null}
                  <Line type="monotone" dataKey="hrv" stroke="#4fb46b" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <span className="ap-vital-chip-delta">{hrvAverage !== null ? `Media ${hrvAverage.toFixed(0)} ms` : ""}</span>
          </button>
          {/* Resting HR card with mini sparkline */}
          <button type="button" className="ap-vital-chip ap-rhr-card" onClick={() => setOpenDrawer("rhr")}>
            <div className="ap-card-icon-head">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              <span className="ap-vital-chip-label">FC Reposo</span>
            </div>
            <div className="ap-hrv-value-row">
              <span className="ap-vital-chip-value">{typeof currentRestingHr === "number" ? `${currentRestingHr.toFixed(1)}` : "n/d"}<small className="ap-hrv-unit">bpm</small></span>
            </div>
            <span className={`ap-hrv-status ${typeof currentRestingHr === "number" && restingHrAverage !== null && currentRestingHr > restingHrAverage + 4 ? "warning" : "good"}`}>{restingHrLabel(currentRestingHr, restingHrAverage)}</span>
            <div className="ap-hrv-spark">
              <ResponsiveContainer width="100%" height={36}>
                <LineChart data={wellnessSeries.slice(-14)} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                  {restingHrAverage !== null ? <ReferenceArea y1={restingHrAverage - 3} y2={restingHrAverage + 3} fill="#5b9bd5" fillOpacity={0.08} /> : null}
                  <Line type="monotone" dataKey="restingHr" stroke="#5b9bd5" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <span className="ap-vital-chip-delta">{restingHrAverage !== null ? `Media ${restingHrAverage.toFixed(0)} bpm` : ""}</span>
          </button>
          {/* Stress / BB card */}
          <button type="button" className="ap-vital-chip ap-stress-card" onClick={() => setOpenDrawer("stress")}>
            <div className="ap-card-icon-head">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              <span className="ap-vital-chip-label">Estrés · BB</span>
            </div>
            <span className="ap-vital-chip-value">{typeof currentStress === "number" ? `${Math.round(currentStress)}` : "n/d"}</span>
            <span className={`ap-hrv-status ${typeof currentStress === "number" && currentStress >= 60 ? "warning" : typeof currentStress === "number" && currentStress >= 45 ? "neutral" : "good"}`}>{stressLabel(currentStress)}</span>
            <div className="ap-hrv-spark">
              <ResponsiveContainer width="100%" height={36}>
                <LineChart data={wellnessSeries.slice(-14)} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                  <Line type="monotone" dataKey="stress" stroke="#e6a03c" strokeWidth={2} dot={false} connectNulls />
                  {bodyBatteryDelta !== null ? <Line type="monotone" dataKey="bodyBatteryChange" stroke="#4fb46b" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="4 2" /> : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <span className="ap-vital-chip-delta">
              {bodyBatteryDelta !== null ? `BB ${bodyBatteryDelta >= 0 ? "+" : ""}${Math.round(bodyBatteryDelta)}` : ""}
            </span>
          </button>
        </div>

        {/* Garmin connection — minimal in snapshot */}
        {!athleteHealth && !athleteHealthLoading ? (
          <div className="ap-hero-actions">
            {garminHealthProvider ? (
              <span className="ap-provider-badge">Garmin · {garminHealthProvider.status === "connected" ? "activo" : "pendiente"}</span>
            ) : null}
            <button
              type="button"
              className="ap-refresh-btn"
              onClick={() => void handleRefreshAthleteHealth()}
              disabled={athleteHealthLoading || !analysis.athlete.garmin_connected}
            >
              {athleteHealthLoading ? "Consultando..." : "Actualizar salud"}
            </button>
          </div>
        ) : null}
        {athleteHealthStatus ? <p className="ap-status-msg">{athleteHealthStatus}</p> : null}
        {athleteHealthLoading ? (
          <div className="ap-empty">Cargando actividad y salud conectada...</div>
        ) : athleteHealthError ? (
          <div className="ap-empty">{athleteHealthError}</div>
        ) : null}

      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          METRIC DRAWERS (NIVEL 2 — Contextual panels)
          ═══════════════════════════════════════════════════════════════════ */}

      {/* ── HRV Drawer ──────────────────────────────────────────────── */}
      <MetricDrawer open={openDrawer === "hrv"} title="HRV nocturna" onClose={() => setOpenDrawer(null)}>
        <div className="ap-drawer-section">
          <TimeRangeSelector value={trendRange} onChange={setTrendRange} />
        </div>

        <div className="ap-drawer-chart">
          {trendData.some((p) => p.hrv !== null) ? (
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {hrvAverage !== null && (
                  <ReferenceArea
                    y1={hrvAverage * 0.9}
                    y2={hrvAverage * 1.1}
                    fill="rgba(79, 180, 107, 0.08)"
                    strokeOpacity={0}
                  />
                )}
                <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} tick={{ fill: "var(--dk-muted)", fontSize: 11 }} />
                <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as Array<{ payload?: WellnessSeriesPoint }> | undefined, "HRV nocturna", (v) => typeof v === "number" ? `${Math.round(v)} ms` : "n/d")} />
                {hrvAverage !== null && (
                  <ReferenceLine y={hrvAverage} stroke="rgba(79, 180, 107, 0.4)" strokeDasharray="6 3" />
                )}
                <Line type="monotone" dataKey="hrv" stroke="#4fb46b" strokeWidth={2.5} dot={{ r: 3, fill: "#4fb46b", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#4fb46b", stroke: "#fff", strokeWidth: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="ap-empty">Sin datos de HRV en este rango.</div>
          )}
        </div>

        <div className="ap-drawer-kpis">
          <div className="ap-drawer-kpi">
            <small>Promedio 7d</small>
            <strong>{hrvAverage !== null ? `${hrvAverage.toFixed(0)} ms` : "n/d"}</strong>
          </div>
          <div className="ap-drawer-kpi">
            <small>Promedio 30d</small>
            <strong>{hrvAvg30d !== null ? `${hrvAvg30d.toFixed(0)} ms` : "n/d"}</strong>
          </div>
          <div className="ap-drawer-kpi">
            <small>Delta vs baseline</small>
            <strong>{typeof currentHrv === "number" && hrvAverage !== null ? `${currentHrv - hrvAverage > 0 ? "+" : ""}${(currentHrv - hrvAverage).toFixed(0)} ms` : "n/d"}</strong>
          </div>
          <div className="ap-drawer-kpi">
            <small>Días consecutivos bajos</small>
            <strong>{hrvConsecutiveLow}</strong>
          </div>
        </div>

        <InsightCard text={hrvInsight.text} tone={hrvInsight.tone} />

        <div className="ap-drawer-section">
          <span className="ap-drawer-section-title">Relaciones</span>
          <div className="ap-drawer-relations">
            <div className="ap-drawer-relation">
              <small>HRV vs Sueño</small>
              <strong>{typeof currentHrv === "number" && currentSleepHours !== null ? (currentSleepHours >= 7 && currentHrv >= (hrvAverage ?? 0) ? "Alineados" : "Desacoplados") : "Sin datos"}</strong>
            </div>
            <div className="ap-drawer-relation">
              <small>HRV vs Carga</small>
              <strong>{typeof currentHrv === "number" && hrvAverage !== null ? (currentHrv < hrvAverage * 0.9 && weeklyTotal >= 5 ? "Carga alta, HRV baja" : "Sin tensión") : "Sin datos"}</strong>
            </div>
          </div>
        </div>
      </MetricDrawer>

      {/* ── Sleep Drawer ────────────────────────────────────────────── */}
      <MetricDrawer open={openDrawer === "sleep"} title="Sueño" onClose={() => setOpenDrawer(null)}>
        <div className="ap-drawer-section">
          <TimeRangeSelector value={trendRange} onChange={setTrendRange} />
        </div>

        {/* Hypnogram */}
        {sleepStageWindow ? (
          <div className="ap-drawer-section">
            <span className="ap-drawer-section-title">Hipnograma nocturno</span>
            <div className="ap-drawer-chart" style={{ minHeight: 100 }}>
              <div className="ap-stage-timeline" style={{ position: "relative", height: 94 }}>
                {(["awake", "rem", "light", "deep"] as SleepStageKey[]).map((stage) => (
                  <div key={stage} className={`ap-stage-row stage-${stage}`}>
                    <span className="ap-stage-label">
                      {stage === "awake" ? "Despierto" : stage === "rem" ? "REM" : stage === "light" ? "Ligero" : "Profundo"}
                    </span>
                  </div>
                ))}
                {athleteSleepStageSegments.map((segment, index) => {
                  const total = sleepStageWindow.end - sleepStageWindow.start || 1;
                  const stageIndex = ["awake", "rem", "light", "deep"].indexOf(segment.stage);
                  const left = ((segment.start - sleepStageWindow.start) / total) * 100;
                  const w = ((segment.end - segment.start) / total) * 100;
                  return (
                    <span
                      key={`${segment.stage}-${segment.start}-${index}`}
                      className={`ap-stage-segment ${segment.stage}`}
                      style={{
                        left: `calc(70px + ${left / 100} * (100% - 70px))`,
                        width: `calc(${Math.max(w, 1.2) / 100} * (100% - 70px))`,
                        top: `${stageIndex * 23 + 2}px`,
                        height: "16px",
                      }}
                      title={stageLabel(segment.stage)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {/* Trend chart */}
        <div className="ap-drawer-section">
          <span className="ap-drawer-section-title">Tendencia</span>
          <div className="ap-drawer-chart">
            {trendData.some((p) => p.sleepHours !== null) ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} tick={{ fill: "var(--dk-muted)", fontSize: 11 }} />
                  <YAxis hide domain={[0, "auto"]} />
                  <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as Array<{ payload?: WellnessSeriesPoint }> | undefined, "Horas de sueño", (v) => typeof v === "number" ? `${v.toFixed(1)} h` : "n/d")} />
                  {sleepHoursAverage !== null && (
                    <ReferenceLine y={sleepHoursAverage} stroke="rgba(145, 128, 212, 0.35)" strokeDasharray="6 3" />
                  )}
                  <Line type="monotone" dataKey="sleepHours" stroke="#7c6fba" strokeWidth={2.5} dot={{ r: 3, fill: "#7c6fba", strokeWidth: 0 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="ap-empty">Sin datos de sueño en este rango.</div>
            )}
          </div>
        </div>

        {/* Composition breakdown */}
        {sleepArchitectureMetrics.length > 1 ? (
          <div className="ap-drawer-section">
            <span className="ap-drawer-section-title">Composición</span>
            <div className="ap-sleep-comp-bar">
              {sleepArchitectureMetrics.filter((m) => m.key !== "sleep_time").map((metric) => {
                const seconds = parseDurationLabelToSeconds(metric.value) ?? 0;
                const pct = visibleNightSeconds > 0 ? (seconds / visibleNightSeconds) * 100 : 0;
                const stage = metric.key === "deep_sleep" ? "deep" : metric.key === "rem_sleep" ? "rem" : metric.key === "light_sleep" ? "light" : "awake";
                return <div key={metric.key} className={`ap-sleep-comp-segment ${stage}`} style={{ width: `${pct}%` }} title={`${metric.label}: ${metric.value}`} />;
              })}
            </div>
            <div className="ap-sleep-comp-legend">
              {sleepArchitectureMetrics.filter((m) => m.key !== "sleep_time").map((metric) => {
                const stage = metric.key === "deep_sleep" ? "deep" : metric.key === "rem_sleep" ? "rem" : metric.key === "light_sleep" ? "light" : "awake";
                return <span key={metric.key}><i className={stage} />{metric.label} {metric.value}</span>;
              })}
            </div>
          </div>
        ) : null}

        <div className="ap-drawer-kpis">
          <div className="ap-drawer-kpi">
            <small>Horas dormidas</small>
            <strong>{currentSleepHours !== null ? `${currentSleepHours.toFixed(1)} h` : "n/d"}</strong>
          </div>
          <div className="ap-drawer-kpi">
            <small>Sleep score</small>
            <strong>{sleepScoreValue}</strong>
          </div>
          <div className="ap-drawer-kpi">
            <small>Media 7d</small>
            <strong>{sleepHoursAverage !== null ? `${sleepHoursAverage.toFixed(1)} h` : "n/d"}</strong>
          </div>
          <div className="ap-drawer-kpi">
            <small>Media 30d</small>
            <strong>{sleepAvg30d !== null ? `${sleepAvg30d.toFixed(1)} h` : "n/d"}</strong>
          </div>
        </div>

        <InsightCard text={sleepInsight.text} tone={sleepInsight.tone} />
      </MetricDrawer>

      {/* ── Resting HR Drawer ───────────────────────────────────────── */}
      <MetricDrawer open={openDrawer === "rhr"} title="Frecuencia en reposo" onClose={() => setOpenDrawer(null)}>
        <div className="ap-drawer-section">
          <TimeRangeSelector value={trendRange} onChange={setTrendRange} />
        </div>

        <div className="ap-drawer-chart">
          {trendData.some((p) => p.restingHr !== null) ? (
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {restingHrAverage !== null && (
                  <ReferenceArea
                    y1={restingHrAverage - 3}
                    y2={restingHrAverage + 3}
                    fill="rgba(90, 156, 245, 0.06)"
                    strokeOpacity={0}
                  />
                )}
                <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} tick={{ fill: "var(--dk-muted)", fontSize: 11 }} />
                <YAxis hide domain={["dataMin - 3", "dataMax + 3"]} />
                <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as Array<{ payload?: WellnessSeriesPoint }> | undefined, "Frecuencia en reposo", (v) => typeof v === "number" ? `${Math.round(v)} bpm` : "n/d")} />
                {restingHrAverage !== null && (
                  <ReferenceLine y={restingHrAverage} stroke="rgba(90, 156, 245, 0.4)" strokeDasharray="6 3" />
                )}
                <Line type="monotone" dataKey="restingHr" stroke="#5a9cf5" strokeWidth={2.5} dot={{ r: 3, fill: "#5a9cf5", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#5a9cf5", stroke: "#fff", strokeWidth: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="ap-empty">Sin datos de frecuencia en reposo.</div>
          )}
        </div>

        <div className="ap-drawer-kpis">
          <div className="ap-drawer-kpi">
            <small>Hoy</small>
            <strong>{typeof currentRestingHr === "number" ? `${Math.round(currentRestingHr)} bpm` : "n/d"}</strong>
          </div>
          <div className="ap-drawer-kpi">
            <small>Media 7d</small>
            <strong>{restingHrAverage !== null ? `${restingHrAverage.toFixed(0)} bpm` : "n/d"}</strong>
          </div>
          <div className="ap-drawer-kpi">
            <small>Media 30d</small>
            <strong>{restingHrAvg30d !== null ? `${restingHrAvg30d.toFixed(0)} bpm` : "n/d"}</strong>
          </div>
          <div className="ap-drawer-kpi">
            <small>Delta</small>
            <strong>{typeof currentRestingHr === "number" && restingHrAverage !== null ? `${currentRestingHr - restingHrAverage > 0 ? "+" : ""}${(currentRestingHr - restingHrAverage).toFixed(0)} bpm` : "n/d"}</strong>
          </div>
        </div>

        <InsightCard text={rhrInsight.text} tone={rhrInsight.tone} />
      </MetricDrawer>

      {/* ── Stress / Body Battery Drawer ─────────────────────────────── */}
      <MetricDrawer open={openDrawer === "stress"} title="Estrés y batería corporal" onClose={() => setOpenDrawer(null)}>
        <div className="ap-drawer-section">
          <TimeRangeSelector value={trendRange} onChange={setTrendRange} />
        </div>

        <div className="ap-drawer-section">
          <span className="ap-drawer-section-title">Estrés diario</span>
          <div className="ap-drawer-chart">
            {trendData.some((p) => p.stress !== null) ? (
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} tick={{ fill: "var(--dk-muted)", fontSize: 11 }} />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as Array<{ payload?: WellnessSeriesPoint }> | undefined, "Estrés diario", (v) => typeof v === "number" ? `${Math.round(v)}` : "n/d")} />
                  {stressAverage !== null && (
                    <ReferenceLine y={stressAverage} stroke="rgba(232, 147, 90, 0.35)" strokeDasharray="6 3" />
                  )}
                  <Line type="monotone" dataKey="stress" stroke="#e8935a" strokeWidth={2.5} dot={{ r: 3, fill: "#e8935a", strokeWidth: 0 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="ap-empty">Sin datos de estrés.</div>
            )}
          </div>
        </div>

        <div className="ap-drawer-section">
          <span className="ap-drawer-section-title">Batería corporal (delta)</span>
          <div className="ap-drawer-chart">
            {trendData.some((p) => p.bodyBatteryChange !== null) ? (
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} tick={{ fill: "var(--dk-muted)", fontSize: 11 }} />
                  <YAxis hide />
                  <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as Array<{ payload?: WellnessSeriesPoint }> | undefined, "Batería corporal", (v) => typeof v === "number" ? `${v > 0 ? "+" : ""}${Math.round(v)}` : "n/d")} />
                  <ReferenceLine y={0} stroke="rgba(255, 255, 255, 0.1)" />
                  <Line type="monotone" dataKey="bodyBatteryChange" stroke="#4fb46b" strokeWidth={2.5} dot={{ r: 3, fill: "#4fb46b", strokeWidth: 0 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="ap-empty">Sin datos de batería corporal.</div>
            )}
          </div>
        </div>

        <div className="ap-drawer-kpis">
          <div className="ap-drawer-kpi">
            <small>Estrés hoy</small>
            <strong>{typeof currentStress === "number" ? `${Math.round(currentStress)}` : "n/d"}</strong>
          </div>
          <div className="ap-drawer-kpi">
            <small>Media estrés 7d</small>
            <strong>{stressAverage !== null ? stressAverage.toFixed(0) : "n/d"}</strong>
          </div>
          <div className="ap-drawer-kpi">
            <small>BB delta hoy</small>
            <strong>{bodyBatteryDelta !== null ? `${bodyBatteryDelta >= 0 ? "+" : ""}${Math.round(bodyBatteryDelta)}` : "n/d"}</strong>
          </div>
          <div className="ap-drawer-kpi">
            <small>Media BB 7d</small>
            <strong>{bodyBatteryAverage !== null ? `${bodyBatteryAverage >= 0 ? "+" : ""}${bodyBatteryAverage.toFixed(0)}` : "n/d"}</strong>
          </div>
        </div>

        <InsightCard text={stressInsight.text} tone={stressInsight.tone} />
      </MetricDrawer>

      {/* Weight modal */}
      {weightModalOpen && (
        <div className="ap-drawer-backdrop" onClick={() => setWeightModalOpen(false)}>
          <div className="ap-drawer ap-weight-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-drawer-header">
              <h3>Peso</h3>
              <button className="ap-drawer-close" onClick={() => setWeightModalOpen(false)}>✕</button>
            </div>
            <div className="ap-weight-modal-body">
              <div className="ap-weight-input-row">
                <input
                  type="number"
                  step="0.1"
                  min="20"
                  max="300"
                  className="ap-weight-input"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder="kg"
                  autoFocus
                />
                <button
                  type="button"
                  className="ap-weight-save-btn"
                  disabled={weightSaving || !weightInput}
                  onClick={handleSaveWeight}
                >
                  {weightSaving ? "Guardando…" : "Guardar"}
                </button>
              </div>
              {weightHistory.length > 1 && (
                <div className="ap-weight-trend-chart">
                  <span className="ap-weight-trend-title">Tendencia</span>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={weightHistory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "var(--dk-muted)", fontSize: 10 }}
                        tickFormatter={(v: string) => { const d = new Date(v); return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }); }}
                      />
                      <YAxis
                        domain={["dataMin - 1", "dataMax + 1"]}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "var(--dk-muted)", fontSize: 10 }}
                        width={36}
                        tickFormatter={(v: number) => `${v}`}
                      />
                      <Tooltip
                        contentStyle={{ background: "#1e1e2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 }}
                        labelStyle={{ color: "#ccc" }}
                        formatter={(value: number) => [`${value.toFixed(1)} kg`, "Peso"]}
                        labelFormatter={(v: string) => new Date(v).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                      />
                      <Line type="monotone" dataKey="weight" stroke="#a78bfa" strokeWidth={2.5} dot={{ r: 3, fill: "#a78bfa", strokeWidth: 0 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {weightHistory.length > 0 && (
                <div className="ap-weight-history-list">
                  {weightHistory.slice(-10).reverse().map((entry) => (
                    <div key={entry.date} className="ap-weight-history-row">
                      <span>{new Date(entry.date).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</span>
                      <strong>{entry.weight.toFixed(1)} kg</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB NAVIGATION
          ═══════════════════════════════════════════════════════════════════ */}
      <nav className="ap-tab-nav">
        {([
          { id: "home", label: "Inicio", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
          { id: "training", label: "Entreno", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
          { id: "fitness", label: "Fitness", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> },

          { id: "lactate", label: "Lactato", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2l-5 5.5L14 12l-8.5 10"/><circle cx="10" cy="19" r="2"/></svg> },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`ap-tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
          >
            {tab.icon}
            <span className="ap-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: TRAINING
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "training" && (<>

      {/* Hoy te toca */}
      <section className="ap-block ap-today">
        <span className="ap-eyebrow">Hoy te toca</span>
        {todaySessions.length > 0 ? (
          <div className="ap-today-sessions">
            {todaySessions.map((session) => {
              const roleClass = session.session_role === "KEY" ? "key" : session.session_role === "SUPPORT" ? "support" : "long";
              const durationMin = typeof session.payload?.total_duration_min === "number" ? session.payload.total_duration_min as number : null;
              return (
                <div key={session.id} className={`ap-today-card ${roleClass}`}>
                  <div className="ap-today-card-top">
                    <span className={`ap-today-role ${roleClass}`}>{session.session_role}</span>
                    {durationMin ? (
                      <span className="ap-today-dur">{Math.floor(durationMin / 60) > 0 ? `${Math.floor(durationMin / 60)}h ` : ""}{Math.round(durationMin % 60)}min</span>
                    ) : null}
                  </div>
                  <strong className="ap-today-label">{session.public_label}</strong>
                  {session.dose_prescription ? (
                    <p className="ap-today-dose">{session.dose_prescription}</p>
                  ) : null}
                  {session.objective ? (
                    <p className="ap-today-obj">{session.objective}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ap-today-rest">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
            <p>Día de descanso — recupérate bien</p>
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          CALENDARS ROW — Monthly activity + Weekly sessions side by side
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="ap-calendars-row">
        <div className="ap-calendars-left-col">
        {/* Monthly activity calendar (Garmin-style) */}
        {monthCalendar.weeks.length > 0 && (
          <section className="ap-block ap-month-cal">
            <div className="ap-month-cal-header">
              <strong className="ap-month-cal-title">{monthCalendar.monthLabel}</strong>
            </div>
            {(monthCalendar.streak > 0 || monthCalendar.streakActivities > 0) && (
              <div className="ap-month-cal-streak">
                <span className="ap-month-cal-streak-item">
                  <small>Tu serie</small>
                  <strong>{monthCalendar.streak} {monthCalendar.streak === 1 ? "Día" : "Días"}</strong>
                </span>
                <span className="ap-month-cal-streak-item">
                  <small>Actividades en serie</small>
                  <strong>{monthCalendar.streakActivities}</strong>
                </span>
              </div>
            )}
            <div className="ap-month-cal-weekdays">
              {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
                <span key={d} className="ap-month-cal-wd">{d}</span>
              ))}
            </div>
            <div className="ap-month-cal-grid">
              {monthCalendar.weeks.map((week, wi) => (
                <div key={wi} className="ap-month-cal-week">
                  {week.map((day) => (
                    <div key={day.date} className={`ap-month-cal-cell ${day.isToday ? "today" : ""} ${!day.isCurrentMonth ? "outside" : ""}`}>
                      {day.activityCount > 0 && day.sportLabel ? (
                        <span className="ap-month-cal-icon" style={{ color: day.sportColor ?? "var(--dk-text)" }}>
                          <CalendarSportIcon label={day.sportLabel} />
                        </span>
                      ) : (
                        <span className="ap-month-cal-num">{day.isCurrentMonth ? day.dayNum : ""}</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {activitySummary && (
              <div className="ap-month-summary-chart">
                <div className="ap-activity-sum-head">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 6-6"/></svg>
                  <span className="ap-month-summary-title">Resumen actividad</span>
                </div>
                <strong className="ap-activity-sum-total">{activitySummary.totalH}h {activitySummary.totalM}m</strong>
                <div className="ap-activity-sum-meta">
                  <span className="ap-activity-sum-range">{activitySummary.rangeLabel}</span>
                  <span className={`ap-activity-sum-delta ${activitySummary.delta >= 0 ? "up" : "down"}`}>
                    {activitySummary.delta >= 0 ? "↑" : "↓"} {activitySummary.deltaH}h {activitySummary.deltaM}m
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={80}>
                  <LineChart data={activitySummary.chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--dk-muted)", fontSize: 9 }} interval={Math.floor(activitySummary.chartData.length / 3) - 1} />
                    <YAxis hide domain={[0, "auto"]} />
                    <Tooltip
                      contentStyle={{ background: "#1e1e2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 }}
                      labelStyle={{ color: "#ccc" }}
                      formatter={(value: number, name: string) => [`${value.toFixed(1)}h`, name === "current" ? "Actual" : "Anterior"]}
                    />
                    <defs>
                      <linearGradient id="actFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#e6707a" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#e6707a" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <Line type="monotone" dataKey="previous" stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="current" stroke="#e6707a" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        )}

        </div>

        {/* Weekly sessions calendar */}
        <section className="ap-block ap-week-cal">
          <div className="ap-week-cal-header">
            <div className="ap-week-cal-nav">
              <span className="ap-eyebrow">Semana</span>
              <strong className="ap-week-cal-range">{calendarWeekLabel}</strong>
            </div>
            <div className="ap-week-cal-controls">
              <button type="button" className="ap-week-cal-btn" onClick={() => setCalWeekOffset(0)}>Hoy</button>
              <button type="button" className="ap-week-cal-btn" onClick={() => setCalWeekOffset((o) => o - 1)}>‹</button>
              <button type="button" className="ap-week-cal-btn" onClick={() => setCalWeekOffset((o) => o + 1)}>›</button>
            </div>
            {calWeekTotalSessions > 0 && (
              <span className="ap-week-cal-summary">
                {calWeekTotalSessions} sesión{calWeekTotalSessions !== 1 ? "es" : ""}
                {calWeekTotalMinutes > 0 ? ` · ${Math.floor(calWeekTotalMinutes / 60)}h ${Math.round(calWeekTotalMinutes % 60)}m` : ""}
              </span>
            )}
          </div>

          <div className="ap-week-cal-grid">
            {calWeekSessions.map((day) => (
              <div
                key={day.iso}
                className={`ap-week-cal-day ${day.isToday ? "today" : ""} ${dragOverDate === day.iso ? "drag-over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverDate(day.iso); }}
                onDragLeave={() => { if (dragOverDate === day.iso) setDragOverDate(null); }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragOverDate(null);
                  if (dragSessionId == null) return;
                  const sess = plannedSessions.find((s) => s.id === dragSessionId);
                  if (!sess || sess.scheduled_date === day.iso) { setDragSessionId(null); return; }
                  // Optimistic update
                  setPlannedSessions((prev) =>
                    prev.map((s) => (s.id === dragSessionId ? { ...s, scheduled_date: day.iso } : s))
                  );
                  try {
                    await api.athleteEditSession(token, dragSessionId, { scheduled_date: day.iso });
                  } catch {
                    // Revert on error
                    setPlannedSessions((prev) =>
                      prev.map((s) => (s.id === dragSessionId ? { ...s, scheduled_date: sess.scheduled_date } : s))
                    );
                  }
                  setDragSessionId(null);
                }}
              >
                <div className="ap-week-cal-day-head">
                  <span className="ap-week-cal-day-label">{day.label}</span>
                  <span className={`ap-week-cal-day-num ${day.isToday ? "today" : ""}`}>{day.dayNum}</span>
                </div>
                <div className="ap-week-cal-sessions">
                  {day.sessions.length > 0 ? (
                    day.sessions.map((session) => {
                      const roleClass = session.session_role === "KEY" ? "key" : session.session_role === "SUPPORT" ? "support" : "long";
                      const durationMin = typeof session.payload?.total_duration_min === "number" ? session.payload.total_duration_min as number : null;
                      const isDragging = dragSessionId === session.id;
                      return (
                        <div
                          key={session.id}
                          className={`ap-week-cal-session ${roleClass} ${isDragging ? "dragging" : ""}`}
                          draggable
                          onDragStart={(e) => {
                            setDragSessionId(session.id);
                            e.dataTransfer.effectAllowed = "move";
                            if (e.currentTarget instanceof HTMLElement) {
                              e.dataTransfer.setDragImage(e.currentTarget, 20, 20);
                            }
                          }}
                          onDragEnd={() => { setDragSessionId(null); setDragOverDate(null); }}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (dragSessionId != null) return;
                            setEditingSession(session);
                            setGarminPushResult(null);
                            setEditForm({
                              label: session.public_label,
                              note: session.athlete_note ?? "",
                              date: session.scheduled_date,
                              time: session.scheduled_time ?? "",
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              setEditingSession(session);
                              setEditForm({
                                label: session.public_label,
                                note: session.athlete_note ?? "",
                                date: session.scheduled_date,
                                time: session.scheduled_time ?? "",
                              });
                            }
                          }}
                        >
                          <span className="ap-week-cal-session-role">{session.session_role}</span>
                          <strong className="ap-week-cal-session-label">{session.public_label}</strong>
                          {session.scheduled_time ? (
                            <span className="ap-week-cal-session-time">{session.scheduled_time}</span>
                          ) : null}
                          {session.dose_prescription ? (
                            <span className="ap-week-cal-session-dose">{session.dose_prescription}</span>
                          ) : null}
                          {durationMin ? (
                            <span className="ap-week-cal-session-dur">{Math.floor(durationMin / 60) > 0 ? `${Math.floor(durationMin / 60)}h ` : ""}{Math.round(durationMin % 60)}min</span>
                          ) : null}
                          {session.objective ? (
                            <span className="ap-week-cal-session-obj">{session.objective}</span>
                          ) : null}
                          {session.athlete_note ? (
                            <span className="ap-week-cal-session-note">{session.athlete_note}</span>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="ap-week-cal-empty" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Session edit modal */}
        {editingSession && (
          <div className="ap-session-edit-overlay" onClick={() => setEditingSession(null)}>
            <div className="ap-session-edit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="ap-session-edit-header">
                <h3>Editar sesión</h3>
                <button type="button" className="ap-session-edit-close" onClick={() => setEditingSession(null)}>&times;</button>
              </div>

              <div className="ap-session-edit-meta">
                <span className={`ap-session-edit-role ${editingSession.session_role.toLowerCase()}`}>{editingSession.session_role}</span>
                <span className="ap-session-edit-discipline">{editingSession.discipline}</span>
                {editingSession.dose_prescription ? <span className="ap-session-edit-dose">{editingSession.dose_prescription}</span> : null}
              </div>

              {editingSession.objective ? (
                <p className="ap-session-edit-obj">{editingSession.objective}</p>
              ) : null}

              {editingSession.coach_note ? (
                <div className="ap-session-edit-coach-note">
                  <span className="ap-session-edit-field-label">Nota del entrenador</span>
                  <p>{editingSession.coach_note}</p>
                </div>
              ) : null}

              <div className="ap-session-edit-fields">
                <label className="ap-session-edit-field">
                  <span className="ap-session-edit-field-label">Título</span>
                  <input
                    type="text"
                    value={editForm.label}
                    onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                    placeholder="Nombre de la sesión"
                  />
                </label>
                <label className="ap-session-edit-field">
                  <span className="ap-session-edit-field-label">Mi nota</span>
                  <textarea
                    value={editForm.note}
                    onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="Sensaciones, recordatorios, material..."
                    rows={3}
                  />
                </label>
                <div className="ap-session-edit-row">
                  <label className="ap-session-edit-field">
                    <span className="ap-session-edit-field-label">Fecha</span>
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                    />
                  </label>
                  <label className="ap-session-edit-field">
                    <span className="ap-session-edit-field-label">Hora</span>
                    <input
                      type="time"
                      value={editForm.time}
                      onChange={(e) => setEditForm((f) => ({ ...f, time: e.target.value }))}
                    />
                  </label>
                </div>
              </div>

              <div className="ap-session-edit-actions">
                {analysis?.athlete.garmin_connected && editingSession.structured_workout_payload && (
                  <button
                    type="button"
                    className={`ap-session-edit-garmin ${garminPushResult === "ok" ? "success" : garminPushResult === "error" ? "error" : ""}`}
                    disabled={garminPushing}
                    onClick={async () => {
                      if (!editingSession || !user?.athlete_id) return;
                      setGarminPushing(true);
                      setGarminPushResult(null);
                      try {
                        await api.pushWorkoutToGarmin(token, user.athlete_id, editingSession.id);
                        setGarminPushResult("ok");
                      } catch {
                        setGarminPushResult("error");
                      } finally {
                        setGarminPushing(false);
                      }
                    }}
                  >
                    {garminPushing ? "Enviando..." : garminPushResult === "ok" ? "Enviado a Garmin" : garminPushResult === "error" ? "Error al enviar" : "Enviar a Garmin"}
                  </button>
                )}
                <button
                  type="button"
                  className="ap-session-edit-delete"
                  disabled={editDeleting}
                  onClick={async () => {
                    if (!editingSession) return;
                    if (!confirm("¿Eliminar esta sesión? Esta acción no se puede deshacer.")) return;
                    setEditDeleting(true);
                    try {
                      await api.deletePlannedSession(token, editingSession.id);
                      setPlannedSessions((prev) => prev.filter((s) => s.id !== editingSession.id));
                      setEditingSession(null);
                    } catch {
                      // keep modal open
                    } finally {
                      setEditDeleting(false);
                    }
                  }}
                >
                  {editDeleting ? "Eliminando..." : "Eliminar"}
                </button>
                <div className="ap-session-edit-actions-right">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setEditingSession(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={editSaving}
                    onClick={async () => {
                      if (!editingSession) return;
                      setEditSaving(true);
                      try {
                        const patch: Record<string, string> = {};
                        if (editForm.label !== editingSession.public_label) patch.public_label = editForm.label;
                        if (editForm.note !== (editingSession.athlete_note ?? "")) patch.athlete_note = editForm.note;
                        if (editForm.date !== editingSession.scheduled_date) patch.scheduled_date = editForm.date;
                        if (editForm.time !== (editingSession.scheduled_time ?? "")) patch.scheduled_time = editForm.time;
                        if (Object.keys(patch).length > 0) {
                          const updated = (await api.athleteEditSession(token, editingSession.id, patch)) as PlanningPlannedSession;
                          setPlannedSessions((prev) =>
                            prev.map((s) => (s.id === updated.id ? updated : s))
                          );
                        }
                        setEditingSession(null);
                      } catch {
                        // keep modal open on error
                      } finally {
                        setEditSaving(false);
                      }
                    }}
                  >
                    {editSaving ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cumplimiento del plan */}
      <div className="ap-block ap-compliance">
        <span className="ap-eyebrow">Cumplimiento semanal</span>
        {(() => {
          const weekSessions = calWeekSessions.flatMap(d => d.sessions);
          const totalPlanned = weekSessions.length;
          const today = new Date();
          today.setHours(0,0,0,0);
          const completedCount = calWeekSessions.filter(d => {
            const dayDate = new Date(d.iso);
            dayDate.setHours(0,0,0,0);
            return dayDate < today && d.sessions.length > 0;
          }).reduce((acc, d) => acc + d.sessions.length, 0);
          const pct = totalPlanned > 0 ? Math.round((completedCount / totalPlanned) * 100) : 0;
          return (
            <div className="ap-compliance-body">
              <div className="ap-compliance-ring">
                <svg viewBox="0 0 36 36" width="80" height="80">
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#4fb46b" strokeWidth="3" strokeDasharray={`${pct}, 100`} strokeLinecap="round" />
                </svg>
                <span className="ap-compliance-pct">{pct}%</span>
              </div>
              <div className="ap-compliance-detail">
                <strong>{completedCount} de {totalPlanned}</strong>
                <span>sesiones completadas esta semana</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Próximo test de lactato */}
      {(() => {
        const latestSnapshotDate = selectedSnapshot?.view.latest_snapshot_date;
        if (!latestSnapshotDate) return null;
        const daysSince = Math.floor((Date.now() - new Date(latestSnapshotDate).getTime()) / 86400000);
        return (
          <div className={`ap-block ap-next-test ${daysSince > 42 ? "urgent" : daysSince > 28 ? "warn" : ""}`}>
            <span className="ap-eyebrow">Último test de lactato</span>
            <div className="ap-next-test-body">
              <strong>{daysSince} días</strong>
              <span>{daysSince > 42 ? "Sería buen momento para un nuevo test" : daysSince > 28 ? "Considera programar un test pronto" : "Test reciente"}</span>
            </div>
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 2 — Carga y Volumen (in training tab)
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="ap-block ap-volume">
        <span className="ap-eyebrow">Carga y volumen</span>

        <div className="ap-load-kpis">
          <article className="ap-load-kpi">
            <span className="ap-card-label">Semana</span>
            <strong>{weeklyTotal}</strong>
            <small>sesiones / 7d</small>
          </article>
          <article className="ap-load-kpi">
            <span className="ap-card-label">Mes</span>
            <strong>{monthlyTotal}</strong>
            <small>sesiones / 30d</small>
          </article>
          <article className="ap-load-kpi">
            <span className="ap-card-label">Horas</span>
            <strong>{formatSecondsToClock(visibleVolume.trainingHours * 3600)}</strong>
            <small>tiempo visible</small>
          </article>
          <article className="ap-load-kpi">
            <span className="ap-card-label">Disciplinas</span>
            <strong>{disciplineSnapshots.length}</strong>
            <small>activas</small>
          </article>
        </div>

        <div className="ap-load-distances">
          <article className="ap-load-distance run">
            <span className="ap-card-label">Run</span>
            <strong>{visibleVolume.runningKm.toFixed(1)} km</strong>
          </article>
          <article className="ap-load-distance swim">
            <span className="ap-card-label">Swim</span>
            <strong>{visibleVolume.swimKm.toFixed(1)} km</strong>
          </article>
          <article className="ap-load-distance bike">
            <span className="ap-card-label">Bike</span>
            <strong>{visibleVolume.cyclingHasDistance ? `${visibleVolume.cyclingKm.toFixed(1)} km` : "GPS pendiente"}</strong>
          </article>
        </div>

        <div className="ap-load-bars">
          {weeklyBreakdown.length ? (
            weeklyBreakdown.map((item) => (
              <div key={item.discipline} className="ap-load-bar-row">
                <div className="ap-load-bar-head">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
                <div className="ap-load-bar-track">
                  <div
                    className="ap-load-bar-fill"
                    style={{ width: `${Math.max(18, (item.value / weeklyMaxSessions) * 100)}%`, backgroundColor: disciplineAccent(item.discipline) }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="muted">Todavía no hay suficientes sesiones recientes para dibujar el reparto semanal.</p>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 3 — Última Sesión (in training tab)
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="ap-block ap-latest-session">
        <span className="ap-eyebrow">Última sesión</span>

        {latestVisibleSession ? (
          <article className="ap-latest-card featured">
            <div className="ap-latest-head">
              <span className="ap-discipline-dot" style={{ backgroundColor: disciplineAccent(latestVisibleSession.discipline) }} />
              <strong>{latestVisibleSession.session_type}</strong>
            </div>
            <p>{disciplineLabel(latestVisibleSession.discipline)} · {formatDate(latestVisibleSession.performed_at)}</p>
            {latestVisibleSession.goal ? <p className="ap-session-goal">{latestVisibleSession.goal}</p> : null}
          </article>
        ) : (
          <div className="ap-empty">Sin sesión reciente visible.</div>
        )}

        <div className="ap-latest-feed">
          {recentFeed.length ? (
            recentFeed.slice(0, 4).map((session) => (
              <article key={session.id} className="ap-latest-feed-item">
                <span className="ap-discipline-dot" style={{ backgroundColor: disciplineAccent(session.discipline) }} />
                <div className="ap-feed-item-copy">
                  <strong>{session.session_type}</strong>
                  <span>{disciplineLabel(session.discipline)}</span>
                  <small>{formatDate(session.performed_at)}</small>
                  {session.goal ? <p>{session.goal}</p> : null}
                </div>
              </article>
            ))
          ) : (
            <div className="ap-empty">Cuando entren más actividades, aparecerán aquí.</div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 8 — Roadmap (in training tab)
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="ap-block ap-roadmap">
        <span className="ap-eyebrow">Roadmap</span>

        {/* Active block card */}
        <article className="ap-roadmap-card block-card">
          <span className="ap-card-label">Bloque activo</span>
          <strong>{activeBlock?.block_objective ?? "Base abierta"}</strong>
          <p>{activeBlock?.block_intent ?? "Todavía no hay mensaje visible del bloque."}</p>
          <p>{activeBlock?.evaluation?.recommendation ?? "Aquí verás una traducción clara de lo que está buscando tu entrenador en este bloque."}</p>
          <div className="ap-roadmap-meta">
            <span>{activeBlock?.phase ? `Fase ${activeBlock.phase}` : "Fase abierta"}</span>
            <span>{confidenceLabel(activeBlock?.evaluation?.confidence)}</span>
          </div>
        </article>

        {/* Next target card */}
        <article className="ap-roadmap-card target-card">
          <span className="ap-card-label">Próximo objetivo</span>
          <strong>{nextTarget ? nextTarget.objective : "Sin objetivo definido"}</strong>
          <p>
            {nextTarget
              ? `${disciplineLabel(nextTarget.discipline)} · ${relativeCountdownLabel(nextTargetCountdown)}`
              : "Cuando tu entrenador marque un objetivo, lo verás aquí."}
          </p>
          {nextTarget?.discipline === "triatlón" ? (
            <div className="ap-target-splits">
              {nextTarget.target_swim_pace_label ? (
                <span>
                  <strong>Natación</strong>
                  {nextTarget.target_swim_pace_label}
                </span>
              ) : null}
              {typeof nextTarget.target_cycling_power_watts === "number" ? (
                <span>
                  <strong>Ciclismo</strong>
                  {formatCyclingTarget(nextTarget.target_cycling_power_watts, analysis.athlete.weight)}
                </span>
              ) : null}
              {nextTarget.target_running_pace_label ? (
                <span>
                  <strong>Carrera</strong>
                  {nextTarget.target_running_pace_label}
                </span>
              ) : null}
            </div>
          ) : nextTarget?.target_pace_label ? (
            <div className="ap-target-splits">
              <span>
                <strong>Referencia</strong>
                {nextTarget.target_pace_label}
              </span>
            </div>
          ) : typeof nextTarget?.target_power_watts === "number" ? (
            <div className="ap-target-splits">
              <span>
                <strong>Referencia</strong>
                {formatCyclingTarget(nextTarget.target_power_watts, analysis.athlete.weight)}
              </span>
            </div>
          ) : null}
        </article>

        {/* Coach signals */}
        {coachSignals.length ? (
          <div className="ap-coach-signals">
            <span className="ap-card-label">Lecturas del sistema</span>
            {coachSignals.map((signal) => (
              <article key={signal} className="ap-signal-item">
                <span />
                <strong>{signal}</strong>
              </article>
            ))}
          </div>
        ) : null}

        {/* Sync card */}
        <article className="ap-roadmap-card sync-card">
          <span className="ap-card-label">Sincronización</span>
          <strong>{syncHeadline}</strong>
          <p>{syncSummary}</p>
          <div className="ap-roadmap-sync-providers">
            {syncProviders.map((provider) => (
              <span key={provider.label} className={`ap-roadmap-sync-provider ${provider.connected ? "connected" : ""}`}>
                {provider.label} · {provider.connected ? "activa" : "pendiente"}
              </span>
            ))}
          </div>
          <div className="ap-sync-actions">
            <button className="ghost-button" type="button" onClick={handleStravaConnect} disabled={stravaRedirecting}>
              {stravaRedirecting ? "Redirigiendo..." : analysis.athlete.strava_connected ? "Reconectar Strava" : "Conectar Strava"}
            </button>
            <button className="ghost-button" type="button" onClick={() => setGarminLoginOpen(true)}>
              {analysis.athlete.garmin_connected ? "Reconectar Garmin" : "Conectar Garmin"}
            </button>
          </div>
          {stravaFeedback ? <small className="ap-sync-note">{stravaFeedback}</small> : null}
        </article>

        {/* Upcoming targets list */}
        {upcomingTargets.length ? (
          <div className="ap-roadmap-targets-list">
            <span className="ap-card-label">Objetivos</span>
            {upcomingTargets.map((target) => (
              <article key={target.id} className="ap-roadmap-target">
                <span className="ap-target-date">{formatDate(target.target_date)}</span>
                <strong>{buildTargetObjective({ category: target.distance_category, distanceLabel: target.distance_label, fallback: target.objective })}</strong>
                <p>{disciplineLabel(target.discipline)}</p>
                {target.distance_label ? <p>{target.distance_label}</p> : null}
                {target.target_pace_label ? <p>Ritmo objetivo: {target.target_pace_label}</p> : null}
                {target.target_running_pace_label ? <p>Carrera: {target.target_running_pace_label}</p> : null}
                {target.target_swim_pace_label ? <p>Natación: {target.target_swim_pace_label}</p> : null}
                {typeof target.target_cycling_power_watts === "number" ? <p>Ciclismo: {Math.round(target.target_cycling_power_watts)} W</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">Todavía no hay objetivos visibles para ti.</p>
        )}
      </section>

      </>)}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: FITNESS
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "fitness" && (<>

      {/* ATL / CTL / TSB / ACWR — descriptive load metrics (Imbach 2025: FFM is descriptive, not predictive) */}
      {fitnessData.length > 7 && (() => {
        const last = fitnessData[fitnessData.length - 1];
        const acwr = last?.acwr;
        const acwrColor = typeof acwr === "number" ? (acwr >= 0.8 && acwr <= 1.3 ? "var(--dk-muted)" : "#e6a23c") : "var(--dk-muted)";
        return (
        <section className="ap-block ap-fitness">
          <span className="ap-eyebrow">Carga de entrenamiento{trainingLoad ? " (TSS real)" : " (proxy duración)"}{trainingLoad ? ` · Confianza ${Math.round(trainingLoad.avg_confidence * 100)}%` : ""}</span>
          <div className="ap-fitness-kpis">
            <span className="ap-fitness-kpi ctl" title="Carga crónica (media móvil 42 días). Indicador descriptivo del volumen acumulado.">
              <small>Carga crónica (CTL)</small>
              <strong>{last?.ctl.toFixed(0)}</strong>
            </span>
            <span className="ap-fitness-kpi atl" title="Carga aguda (media móvil 7 días). Indica la carga reciente, no predice fatiga futura.">
              <small>Carga aguda (ATL)</small>
              <strong>{last?.atl.toFixed(0)}</strong>
            </span>
            <span className={`ap-fitness-kpi tsb ${(last?.tsb ?? 0) >= 0 ? "positive" : "negative"}`} title="Balance de carga (CTL − ATL). Valores negativos indican carga reciente alta respecto a la habitual.">
              <small>Balance (TSB)</small>
              <strong>{last?.tsb.toFixed(0)}</strong>
            </span>
            <span className="ap-fitness-kpi" style={{ borderColor: acwrColor }} title="Ratio carga aguda / crónica. Métrica descriptiva — no debe usarse como predictor de lesiones (Imbach 2025).">
              <small>Ratio A:C</small>
              <strong style={{ color: acwrColor }}>{typeof acwr === "number" ? acwr.toFixed(2) : "n/d"}</strong>
            </span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={fitnessData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--dk-muted)", fontSize: 10 }} interval={Math.max(1, Math.floor(fitnessData.length / 5) - 1)} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--dk-muted)", fontSize: 10 }} width={32} />
              <Tooltip
                contentStyle={{ background: "#1e1e2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 }}
                labelStyle={{ color: "#ccc" }}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
              <Line type="monotone" dataKey="ctl" stroke="#4fb46b" strokeWidth={2} dot={false} name="Carga crónica (CTL)" />
              <Line type="monotone" dataKey="atl" stroke="#e6707a" strokeWidth={2} dot={false} name="Carga aguda (ATL)" />
              <Line type="monotone" dataKey="tsb" stroke="#5b9bd5" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Balance (TSB)" />
            </ComposedChart>
          </ResponsiveContainer>
        </section>
        );
      })()}

      {/* Training zones distribution */}
      {zoneDistribution && (
        <div className="ap-block ap-zones-card">
          <div className="ap-zones-head">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <span className="ap-zones-title">Zonas de la semana</span>
            <span className="ap-zones-total">{Math.floor(zoneDistribution.totalMin / 60)}h {zoneDistribution.totalMin % 60}m</span>
          </div>
          <div className="ap-zones-bar">
            {zoneDistribution.z1 > 0 && <div className="ap-zone z1" style={{ flex: zoneDistribution.z1 }} />}
            {zoneDistribution.z2 > 0 && <div className="ap-zone z2" style={{ flex: zoneDistribution.z2 }} />}
            {zoneDistribution.z3 > 0 && <div className="ap-zone z3" style={{ flex: zoneDistribution.z3 }} />}
            {zoneDistribution.z4 > 0 && <div className="ap-zone z4" style={{ flex: zoneDistribution.z4 }} />}
            {zoneDistribution.z5 > 0 && <div className="ap-zone z5" style={{ flex: zoneDistribution.z5 }} />}
          </div>
          <div className="ap-zones-labels">
            <span className="ap-zone-lbl"><span className="ap-zone-dot z1" />Z1 {zoneDistribution.z1}%</span>
            <span className="ap-zone-lbl"><span className="ap-zone-dot z2" />Z2 {zoneDistribution.z2}%</span>
            <span className="ap-zone-lbl"><span className="ap-zone-dot z3" />Z3 {zoneDistribution.z3}%</span>
            <span className="ap-zone-lbl"><span className="ap-zone-dot z4" />Z4 {zoneDistribution.z4}%</span>
            <span className="ap-zone-lbl"><span className="ap-zone-dot z5" />Z5 {zoneDistribution.z5}%</span>
          </div>
        </div>
      )}

      {/* Personal Bests */}
      {personalBests.length > 0 && (
        <section className="ap-block ap-pbs">
          <span className="ap-eyebrow">Mejores marcas recientes</span>
          <div className="ap-pbs-grid">
            {personalBests.map((pb) => (
              <div key={pb.category} className="ap-pb-card">
                <span className="ap-pb-category">{pb.category}</span>
                <strong className="ap-pb-value">{pb.value}</strong>
                <span className="ap-pb-detail">{pb.detail}</span>
                {pb.date && <span className="ap-pb-date">{new Date(pb.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Predicciones */}
      {(() => {
        const allEstimates = selectedSnapshot?.view.estimates ?? [];
        const raceTypes = ["5K", "10K", "HM", "Maratón", "FTP", "VO2max"];
        const predictions = raceTypes.map((t) => allEstimates.find((e) => e.estimate_type === t)).filter((e): e is Estimate => Boolean(e));
        if (predictions.length === 0) return null;
        return (
          <section className="ap-block ap-predictions">
            <span className="ap-eyebrow">Predicciones</span>
            <div className="ap-predictions-grid">
              {predictions.map((est) => (
                <div key={est.estimate_type} className="ap-pred-card">
                  <span className="ap-pred-type">{est.estimate_type === "HM" ? "Media maratón" : est.estimate_type}</span>
                  <strong className="ap-pred-value">{formatEstimateValue(est)}</strong>
                  {est.lower_bound != null && est.upper_bound != null && (
                    <span className="ap-pred-range">
                      {formatEstimateValue({ ...est, value: est.lower_bound })} – {formatEstimateValue({ ...est, value: est.upper_bound })}
                    </span>
                  )}
                  <span className={`ap-pred-conf ${est.confidence >= 0.7 ? "high" : est.confidence >= 0.5 ? "mid" : "low"}`}>
                    {Math.round(est.confidence * 100)}% · {est.reliability_label}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 4 — Tendencias Recuperación (dual mode)
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="ap-block ap-recovery-trends">
        <span className="ap-eyebrow">Tendencias de recuperación</span>

        {viewMode === "athlete" ? (
          <>
            {/* ATHLETE MODE: single metric with selector + big chart */}
            <div className="ap-recovery-metric-selector">
              {([["hrv", "HRV"], ["rhr", "Reposo"], ["sleep", "Sueño"], ["stress", "Estrés"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`ap-recovery-metric-btn ${recoveryMetric === key ? "active" : ""}`}
                  onClick={() => setRecoveryMetric(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="ap-recovery-main-chart">
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={trendData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.04)" />
                  <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} tick={{ fill: "var(--dk-muted)", fontSize: 11 }} />
                  <YAxis hide domain={recoveryMetric === "stress" ? [0, 100] : ["dataMin - 5", "dataMax + 5"]} />
                  {recoveryMetric === "hrv" && hrvAverage !== null && (
                    <ReferenceArea y1={hrvAverage * 0.9} y2={hrvAverage * 1.1} fill="rgba(79, 180, 107, 0.06)" strokeOpacity={0} />
                  )}
                  {recoveryMetric === "rhr" && restingHrAverage !== null && (
                    <ReferenceArea y1={restingHrAverage - 3} y2={restingHrAverage + 3} fill="rgba(90, 156, 245, 0.06)" strokeOpacity={0} />
                  )}
                  <Tooltip
                    content={({ active, payload }) => renderWellnessTooltip(
                      active,
                      payload as Array<{ payload?: WellnessSeriesPoint }> | undefined,
                      recoveryMetric === "hrv" ? "HRV nocturna" : recoveryMetric === "rhr" ? "Frecuencia en reposo" : recoveryMetric === "sleep" ? "Horas de sueño" : "Estrés diario",
                      recoveryMetric === "hrv" ? (v) => typeof v === "number" ? `${Math.round(v)} ms` : "n/d"
                        : recoveryMetric === "rhr" ? (v) => typeof v === "number" ? `${Math.round(v)} bpm` : "n/d"
                          : recoveryMetric === "sleep" ? (v) => typeof v === "number" ? `${v.toFixed(1)} h` : "n/d"
                            : (v) => typeof v === "number" ? `${Math.round(v)}` : "n/d",
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey={recoveryMetric === "hrv" ? "hrv" : recoveryMetric === "rhr" ? "restingHr" : recoveryMetric === "sleep" ? "sleepHours" : "stress"}
                    stroke={recoveryMetric === "hrv" ? "#4fb46b" : recoveryMetric === "rhr" ? "#5a9cf5" : recoveryMetric === "sleep" ? "#7c6fba" : "#e8935a"}
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 0, fill: recoveryMetric === "hrv" ? "#4fb46b" : recoveryMetric === "rhr" ? "#5a9cf5" : recoveryMetric === "sleep" ? "#7c6fba" : "#e8935a" }}
                    activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <InsightCard
              text={recoveryMetric === "hrv" ? hrvInsight.text : recoveryMetric === "sleep" ? sleepInsight.text : recoveryMetric === "rhr" ? rhrInsight.text : stressInsight.text}
              tone={recoveryMetric === "hrv" ? hrvInsight.tone : recoveryMetric === "sleep" ? sleepInsight.tone : recoveryMetric === "rhr" ? rhrInsight.tone : stressInsight.tone}
            />
          </>
        ) : (
          /* COACH MODE: small multiples */
          <div className="ap-trends-grid">
            {([
              { key: "hrv" as const, label: "HRV", color: "#4fb46b", fmt: (v: number) => `${Math.round(v)} ms` },
              { key: "restingHr" as const, label: "Reposo", color: "#5a9cf5", fmt: (v: number) => `${Math.round(v)} bpm` },
              { key: "sleepHours" as const, label: "Sueño", color: "#7c6fba", fmt: (v: number) => `${v.toFixed(1)} h` },
              { key: "stress" as const, label: "Estrés", color: "#e8935a", fmt: (v: number) => `${Math.round(v)}` },
            ] as const).map((metric) => (
              <article key={metric.key} className="ap-trend-card" style={{ cursor: "pointer" }} onClick={() => {
                setRecoveryMetric(metric.key === "restingHr" ? "rhr" : metric.key === "sleepHours" ? "sleep" : metric.key as "hrv" | "stress");
                setOpenDrawer(metric.key === "restingHr" ? "rhr" : metric.key === "sleepHours" ? "sleep" : metric.key as "hrv" | "stress");
              }}>
                <span className="ap-card-label">{metric.label}</span>
                <strong>{(() => {
                  const val = currentWellness?.[metric.key];
                  return typeof val === "number" ? metric.fmt(val) : "n/d";
                })()}</strong>
                {trendData.some((p) => p[metric.key] !== null) ? (
                  <div className="ap-spark">
                    <ResponsiveContainer width="100%" height={30}>
                      <LineChart data={trendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <XAxis hide dataKey="shortLabel" />
                        <YAxis hide />
                        <Line type="monotone" dataKey={metric.key} stroke={metric.color} strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 5 — Tendencias Rendimiento
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="ap-block ap-performance">
        <span className="ap-eyebrow">Tendencias de rendimiento</span>

        {/* Balance bar */}
        <div className="ap-balance-bar-wrap">
          <div className="ap-balance-bar-labels">
            <span>Infraestimulado</span>
            <span>Productivo</span>
            <span>Excesivo</span>
          </div>
          <div className="ap-balance-bar-track">
            <div className="ap-balance-bar-marker" style={{ left: `${balancePosition}%` }} />
          </div>
          <p className="ap-balance-bar-label">{balanceLabel}</p>
          <WhyButton explanation={`Basado en: carga semanal (${weeklyTotal} sesiones), HRV (${hrvConsecutiveLow > 0 ? hrvConsecutiveLow + " días bajos" : "estable"}), estrés (${typeof currentStress === "number" ? stressLabel(currentStress) : "sin dato"}) y reposo (${restingHrLabel(currentRestingHr, restingHrAverage)}).`} />
        </div>

        {/* Featured prediction */}
        <div className="ap-perf-featured">
          {featuredPrediction ? (
            <article className={`ap-prediction-card featured ${estimateTypeClassName(featuredPrediction.estimate_type)}`}>
              <span className="ap-card-label">Referencia protagonista</span>
              <strong>{formatEstimateValue(featuredPrediction)}</strong>
              <p>{featuredPrediction.estimate_type} · {disciplineLabel(featuredPrediction.discipline)}</p>
              <small>{shortText(featuredPrediction.inputs_summary, 140)}</small>
              <div className="ap-prediction-meta">
                <span>{featuredPrediction.reliability_label}</span>
                <span>{Math.round(featuredPrediction.confidence * 100)}% confianza</span>
              </div>
            </article>
          ) : (
            <article className="ap-prediction-card featured empty">
              <span className="ap-card-label">Referencia protagonista</span>
              <strong>Sin predicción visible</strong>
              <p>Cuando entren más tests y más histórico, esta sección traducirá tu progreso a referencias mucho más claras.</p>
            </article>
          )}

          {/* Secondary predictions */}
          <div className="ap-perf-secondary">
            {secondaryPredictions.map((estimate) => (
              <article key={`${estimate.discipline}-${estimate.estimate_type}`} className={`ap-prediction-card ${estimateTypeClassName(estimate.estimate_type)}`}>
                <span className="ap-card-label">{estimate.estimate_type}</span>
                <strong>{formatEstimateValue(estimate)}</strong>
                <p>{shortText(estimate.inputs_summary, 86)}</p>
                <small>{estimate.reliability_label}</small>
              </article>
            ))}
          </div>
        </div>

        {/* Discipline selector pills */}
        <div className="ap-discipline-switch">
          {disciplineSnapshots.map((snapshot) => (
            <button
              key={snapshot.discipline}
              type="button"
              className={`ap-discipline-pill ${selectedSnapshot?.discipline === snapshot.discipline ? "active" : ""}`}
              onClick={() => setSelectedDiscipline(snapshot.discipline)}
            >
              {disciplineLabel(snapshot.discipline)}
            </button>
          ))}
        </div>

        {/* Discipline cards with trend charts and LT1/LT2 */}
        <div className="ap-perf-disciplines">
          {disciplineSnapshots.map((snapshot) => (
            <article key={snapshot.discipline} className="ap-perf-discipline-card">
              <div className="ap-perf-discipline-head">
                <div>
                  <strong>{disciplineLabel(snapshot.discipline)}</strong>
                  <span>{formatDate(snapshot.view.latest_snapshot_date)}</span>
                </div>
                <span className="ap-chip" style={{ backgroundColor: `${disciplineAccent(snapshot.discipline)}16`, color: disciplineAccent(snapshot.discipline) }}>
                  {snapshot.weeklySessions} / semana
                </span>
              </div>
              <div className="ap-perf-discipline-kpis">
                <div>
                  <small>LT1</small>
                  <strong>{renderThresholdValue(snapshot.lt1, snapshot.discipline)}</strong>
                </div>
                <div>
                  <small>LT2</small>
                  <strong>{renderThresholdValue(snapshot.lt2, snapshot.discipline)}</strong>
                </div>
                <div>
                  <small>Referencia</small>
                  <strong>{snapshot.estimate ? formatTarget(snapshot.estimate) : "n/d"}</strong>
                </div>
              </div>
              <div className="ap-discipline-chart">
                {snapshot.trend.length >= 2 ? (
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={snapshot.trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.08)" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={16} />
                      <YAxis hide domain={["dataMin", "dataMax"]} reversed={snapshot.discipline !== "ciclismo"} />
                      <Tooltip
                        formatter={(value: number) => formatTrendValue(value, snapshot.discipline)}
                        labelFormatter={(label) => `Fecha: ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={disciplineAccent(snapshot.discipline)}
                        strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="ap-empty">Aún faltan más referencias para ver la evolución.</div>
                )}
              </div>
              <p className="ap-perf-note">
                {snapshot.estimate
                  ? `${snapshot.estimate.estimate_type}: ${formatEstimateValue(snapshot.estimate)}`
                  : "Estas referencias se actualizarán cuando entren más sesiones comparables."}
              </p>
            </article>
          ))}
        </div>

        {/* Performance note */}
        <article className="ap-perf-note">
          <span className="ap-card-label">Lectura rápida</span>
          <strong>{portalStatus.label}</strong>
          <p>{portalStatus.emphasis}</p>
          <small>{featuredPrediction ? `Referencia activa en ${disciplineLabel(featuredPrediction.discipline)}.` : "Aún no hay una referencia protagonista visible."}</small>
        </article>
      </section>

      </>)}


      {/* ═══════════════════════════════════════════════════════════════════
          TAB: LACTATE
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "lactate" && (<>

      {/* Lactate curve — thresholds visualization */}
      {(lactateSeries.length >= 3 || selectedSnapshot?.lt1 || selectedSnapshot?.lt2) && (
        <section className="ap-block ap-lactate-mini">
          <span className="ap-eyebrow">Curva de lactato</span>
          <div className="ap-lactate-thresholds-row">
            {selectedSnapshot?.lt1 && (
              <span className="ap-lactate-th lt1">LT1 <strong>{renderThresholdValue(selectedSnapshot.lt1, selectedSnapshot.discipline)}</strong></span>
            )}
            {selectedSnapshot?.lt2 && (
              <span className="ap-lactate-th lt2">LT2 <strong>{renderThresholdValue(selectedSnapshot.lt2, selectedSnapshot.discipline)}</strong></span>
            )}
          </div>
          {lactateSeries.length >= 3 ? (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={lactateSeries} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="load"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--dk-muted)", fontSize: 10 }}
                  tickFormatter={(value: number) => formatLoadLabel(value, selectedSnapshot?.discipline)}
                  reversed={selectedSnapshot?.discipline !== "ciclismo"}
                />
                <YAxis
                  domain={[0, "auto"]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--dk-muted)", fontSize: 10 }}
                  width={28}
                />
                <Tooltip
                  contentStyle={{ background: "#1e1e2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 }}
                  formatter={(value: number) => [`${value.toFixed(1)} mmol/L`, "Lactato"]}
                  labelFormatter={(label: number) => formatLoadLabel(label, selectedSnapshot?.discipline)}
                />
                {selectedSnapshot?.lt1 && typeof selectedSnapshot.lt1.lactate === "number" && (
                  <ReferenceLine y={selectedSnapshot.lt1.lactate} stroke="#4fb46b" strokeDasharray="4 4" strokeWidth={1.5} />
                )}
                {selectedSnapshot?.lt2 && typeof selectedSnapshot.lt2.lactate === "number" && (
                  <ReferenceLine y={selectedSnapshot.lt2.lactate} stroke="#e6707a" strokeDasharray="4 4" strokeWidth={1.5} />
                )}
                <Line type="monotone" dataKey="adjusted" stroke="#e6707a" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="ap-empty" style={{ margin: "12px 0 0" }}>Sin suficientes datos de curva. Se mostrará con ≥3 puntos de lactato.</p>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 6 — Lactato
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="ap-block ap-lactate">
        <div className="ap-lactate-head">
          <div>
            <span className="ap-eyebrow">Lactato</span>
            <h2>Curva y umbrales en lenguaje claro</h2>
            <p className="muted">Puntos reales, ajuste visual y referencias LT1/LT2 para entender qué significa hoy tu test en la disciplina activa.</p>
          </div>
          <div className="ap-discipline-switch">
            {disciplineSnapshots.map((snapshot) => (
              <button
                key={snapshot.discipline}
                type="button"
                className={`ap-discipline-pill ${selectedSnapshot?.discipline === snapshot.discipline ? "active" : ""}`}
                onClick={() => setSelectedDiscipline(snapshot.discipline)}
              >
                {disciplineLabel(snapshot.discipline)}
              </button>
            ))}
          </div>
        </div>

        <div className="ap-lactate-grid">
          <div className="ap-lactate-chart-wrap">
            <div className="ap-chart-head">
              <span className="ap-card-label">Curva actual</span>
              <strong>{disciplineLabel(selectedSnapshot?.discipline || focusDiscipline)}</strong>
            </div>
            <div className="ap-lactate-chart">
              {lactateSeries.length >= 2 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={lactateSeries} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(16, 34, 42, 0.08)" />
                    <XAxis
                      type="number"
                      dataKey="load"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => formatLoadLabel(value, selectedSnapshot?.discipline || focusDiscipline)}
                      domain={["auto", "auto"]}
                      reversed={selectedSnapshot?.discipline !== "ciclismo"}
                    />
                    <YAxis
                      type="number"
                      dataKey="lactate"
                      tickLine={false}
                      axisLine={false}
                      width={46}
                      tickFormatter={(value) => `${value}`}
                      domain={[0, "auto"]}
                    />
                    <Tooltip content={({ active, payload }) => portalCurveTooltip(active, payload as Array<{ payload?: PortalCurvePoint; dataKey?: string }> | undefined, selectedSnapshot?.discipline || focusDiscipline)} />
                    {selectedSnapshot?.lt1 ? (
                      <ReferenceLine
                        x={selectedSnapshot.discipline === "ciclismo" ? selectedSnapshot.lt1.powerWatts ?? undefined : selectedSnapshot.lt1.paceSecondsPerKm ?? undefined}
                        stroke="#3156d3"
                        strokeWidth={2.6}
                        strokeDasharray="8 4"
                        label={{ value: "LT1", position: "insideTop", fill: "#3156d3", fontSize: 11 }}
                      />
                    ) : null}
                    {selectedSnapshot?.lt2 ? (
                      <ReferenceLine
                        x={selectedSnapshot.discipline === "ciclismo" ? selectedSnapshot.lt2.powerWatts ?? undefined : selectedSnapshot.lt2.paceSecondsPerKm ?? undefined}
                        stroke="#d26a36"
                        strokeWidth={2.6}
                        strokeDasharray="8 4"
                        label={{ value: "LT2", position: "insideTop", fill: "#d26a36", fontSize: 11 }}
                      />
                    ) : null}
                    <Line
                      type="monotone"
                      dataKey="lactate"
                      name="Lactato"
                      stroke="#2740c7"
                      strokeWidth={2.2}
                      dot={{ r: 3.8, strokeWidth: 0, fill: "#2740c7" }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="adjusted"
                      name="Ajuste visual"
                      stroke="#d84f3f"
                      strokeWidth={2.6}
                      dot={false}
                    />
                    <Scatter data={lactateSeries} fill="#101828" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="ap-empty">Aún faltan más mediciones comparables para dibujar la curva de lactato y sus referencias.</div>
              )}
            </div>
            <div className="ap-lactate-legend">
              <span><i className="lactate" />Lactato real</span>
              <span><i className="adjusted" />Ajuste visual</span>
              <span><i className="lt1" />LT1</span>
              <span><i className="lt2" />LT2</span>
            </div>
          </div>

          <div className="ap-lactate-insights">
            <article className="ap-lactate-insight lt1">
              <span className="ap-card-label">LT1 actual</span>
              <strong>{renderThresholdValue(selectedSnapshot?.lt1, focusDiscipline)}</strong>
              <p>{latestAnchor ? `Ancla de lactato: ${formatLactateValue(latestAnchor.value)}` : "Sin ancla reciente visible."}</p>
            </article>
            <article className="ap-lactate-insight lt2">
              <span className="ap-card-label">LT2 actual</span>
              <strong>{renderThresholdValue(selectedSnapshot?.lt2, focusDiscipline)}</strong>
              <p>{selectedSnapshot?.lt2?.lactate ? `Lactato asociado: ${formatLactateValue(selectedSnapshot.lt2.lactate)}` : "Sin lactato LT2 visible."}</p>
            </article>
            <article className="ap-lactate-insight peak">
              <span className="ap-card-label">VLaMax proxy</span>
              <strong>{vlamaxEstimate ? formatEstimateValue(vlamaxEstimate) : latestPeak ? formatLactateValue(latestPeak.value) : "n/d"}</strong>
              <p>{vlamaxEstimate ? vlamaxEstimate.inputs_summary : "Mientras no haya estimación longitudinal, usamos el pico de lactato del test como proxy visible."}</p>
            </article>
            <article className="ap-lactate-insight narrative">
              <span className="ap-card-label">Qué significa</span>
              <strong>{latestInterpretation[0] ?? "Tu portal irá explicando estas señales con más claridad cuando haya más histórico."}</strong>
              <p>{latestInterpretation[1] ?? "La idea es que entiendas tu evolución sin tener que descifrar una curva de laboratorio."}</p>
            </article>
          </div>

          <LactateFactsCarousel context={lactateFactContext} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 7 — Avanzado (collapsible)
          ═══════════════════════════════════════════════════════════════════ */}
      <details className="ap-advanced">
        <summary className="ap-advanced-toggle">Avanzado: Garmin, actividades y parámetros crudos</summary>

          <div className="ap-advanced-content">
            {/* Garmin login form */}
            <div className="ap-garmin-login">
              <div className="ap-garmin-actions">
                <button type="button" className="ghost-button" onClick={() => setGarminLoginOpen((current) => !current)}>
                  {garminLoginOpen ? "Cerrar login" : analysis.athlete.garmin_connected ? "Cambiar login Garmin" : "Login Garmin"}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handleLoadGarminRaw()}
                  disabled={garminPreviewLoading || !analysis.athlete.garmin_connected}
                >
                  {garminPreviewLoading ? "Cargando Garmin..." : "Cargar lista + 1 detalle completo"}
                </button>
              </div>

              {garminLoginOpen ? (
                <div className="ap-garmin-login-card">
                  <label>
                    <span className="ap-card-label">Email Garmin</span>
                    <input type="email" value={garminEmail} onChange={(event) => setGarminEmail(event.target.value)} placeholder="usuario@correo.com" />
                  </label>
                  <label>
                    <span className="ap-card-label">Password</span>
                    <input type="password" value={garminPassword} onChange={(event) => setGarminPassword(event.target.value)} placeholder="Password Garmin" />
                  </label>
                  <label>
                    <span className="ap-card-label">MFA</span>
                    <input type="text" value={garminMfaCode} onChange={(event) => setGarminMfaCode(event.target.value)} placeholder="Opcional si Garmin lo pide" />
                  </label>
                  <div className="ap-garmin-login-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void handleGarminConnect()}
                      disabled={garminConnectLoading || !garminEmail.trim() || !garminPassword.trim()}
                    >
                      {garminConnectLoading ? "Conectando..." : "Hacer login Garmin"}
                    </button>
                  </div>
                  {garminConnectMessage ? <p>{garminConnectMessage}</p> : null}
                  {garminConnectError ? <p className="error">{garminConnectError}</p> : null}
                </div>
              ) : null}
            </div>

            {/* Garmin activity list + detail */}
            {!analysis.athlete.garmin_connected ? (
              <div className="ap-empty">Haz login con Garmin para inspeccionar actividad y salud desde esta capa paralela.</div>
            ) : (
              <>
                {garminPreviewError ? <div className="ap-empty">{garminPreviewError}</div> : null}
                {garminPreview?.activities.length ? (
                  <div className="ap-garmin-grid">
                    <div className="ap-garmin-list">
                      {garminPreview.activities.map((activity) => (
                        <button
                          key={activity.provider_activity_id}
                          type="button"
                          className={`ap-garmin-activity-btn ${selectedGarminActivity?.provider_activity_id === activity.provider_activity_id ? "active" : ""}`}
                          onClick={() => void handleOpenGarminActivity(activity.provider_activity_id)}
                        >
                          <div className="ap-garmin-activity-head">
                            <span className={`strava-sport-pill ${sportToneClass(activity.sport_type)}`}>{sportLabel(activity.sport_type)}</span>
                            <small>{formatDateTime(activity.started_at)}</small>
                          </div>
                          <strong>{activity.name}</strong>
                          <p>{formatDistanceKm(activity.distance_m)} · {formatSecondsToClock(activity.moving_time_seconds)}</p>
                          <small>
                            {activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : "FC n/d"}
                            {activity.average_watts ? ` · ${Math.round(activity.average_watts)} W` : ""}
                          </small>
                        </button>
                      ))}
                    </div>

                    <div className="ap-garmin-detail">
                      {selectedGarminActivity ? (
                        <>
                          <div className="ap-garmin-hero">
                            <div>
                              <span className={`strava-sport-pill ${sportToneClass(selectedGarminActivity.sport_type)}`}>{sportLabel(selectedGarminActivity.sport_type)}</span>
                              <h3>{selectedGarminActivity.name}</h3>
                              <p>{formatDateTime(selectedGarminActivity.started_at)}</p>
                            </div>
                            <div className="ap-garmin-kpis">
                              <span><small>Distancia</small><strong>{formatDistanceKm(selectedGarminActivity.distance_m)}</strong></span>
                              <span><small>Tiempo</small><strong>{formatSecondsToClock(selectedGarminActivity.moving_time_seconds)}</strong></span>
                              <span><small>FC media</small><strong>{selectedGarminActivity.average_heartrate ? `${Math.round(selectedGarminActivity.average_heartrate)} bpm` : "n/d"}</strong></span>
                              <span><small>Potencia</small><strong>{selectedGarminActivity.average_watts ? `${Math.round(selectedGarminActivity.average_watts)} W` : "n/d"}</strong></span>
                            </div>
                          </div>

                          {garminActivityLoading ? <div className="ap-empty">Cargando detalle completo Garmin...</div> : null}
                          {garminActivityError ? <div className="ap-empty">{garminActivityError}</div> : null}

                          {/* Raw parameters */}
                          <div className="ap-garmin-params">
                            {selectedGarminFields.map((field) => (
                              <article key={field.key} className="ap-garmin-param">
                                <span className="ap-card-label">{field.label}</span>
                                <strong>{field.value}</strong>
                              </article>
                            ))}
                          </div>

                          {/* JSON */}
                          <div className="ap-garmin-json">
                            <div className="ap-chart-head">
                              <span className="ap-card-label">JSON crudo</span>
                              <strong>Raw Garmin payload</strong>
                            </div>
                            <pre>{selectedGarminJson ?? "Sin raw_detail visible en esta actividad."}</pre>
                          </div>
                        </>
                      ) : (
                        <div className="ap-empty">Carga una actividad Garmin para ver todos sus parámetros.</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="ap-empty">Pulsa "Cargar lista + 1 detalle completo" para traer varias actividades y abrir una con todo el payload real.</div>
                )}
              </>
            )}

            {/* Extended health detail */}
            {hasExtendedHealthDetail ? (
              <div className="ap-extended-health">
                {athleteHealthDays.length ? (
                  <div className="ap-health-days-grid">
                    {athleteHealthDays.map((day, index) => (
                      <article key={day.date} className="ap-health-day-card">
                        <strong>
                          {new Date(day.date).toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" })}
                          {index === 0 ? " (hoy)" : ""}
                        </strong>
                        <div className="ap-health-day-metrics">
                          <span>Sueño {typeof day.sleep_score === "number" ? day.sleep_score : "n/d"}</span>
                          <span>HRV {formatNumericMetric(day.hrv_last_night_avg)}</span>
                          <span>Reposo {formatNumericMetric(day.resting_hr)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
                {athletePerformanceMetrics.length ? (
                  <div className="ap-performance-metrics-grid">
                    {athletePerformanceMetrics.map((metric) => (
                      <article key={metric.key} className="ap-perf-metric-card">
                        <span className="ap-card-label">{metric.label}</span>
                        <strong>{metric.value}</strong>
                        <p className="muted">{metric.detail ?? ""}</p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
      </details>

      </>)}

    </div>
  );
}
