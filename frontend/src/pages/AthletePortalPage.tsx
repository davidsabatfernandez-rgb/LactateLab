import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "../lib/api";
import { buildTargetObjective } from "../lib/targetCatalog";
import { ResolvedTrainingThreshold, resolveTrainingThreshold } from "../lib/trainingThresholds";
import { AthleteAnalysis, AthleteHealthDaily, AthleteHealthMetric, AthleteHealthOverview, AuthUser, CurvePoint, DisciplineView, Estimate, GarminActivity, GarminActivitiesPreviewResponse, HistoricalPoint, SessionSummary } from "../types";

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
  if (discipline === "natación") return "#2563eb";
  if (discipline === "ciclismo") return "#157f66";
  if (discipline === "running") return "#d26a36";
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
  const todayPortalLabel = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
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

  return (
    <div className="page-grid ap-dashboard">

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 1 — Hero: "Cómo llegas hoy"
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="ap-block ap-hero">
        <div className="ap-hero-top">
          <div className="ap-hero-greeting">
            <span className="ap-eyebrow">Cómo llegas hoy</span>
            <h1 className="ap-hero-name">{analysis.athlete.name}</h1>
            <p className="ap-hero-date">{todayPortalLabel}</p>
            <span className={`ap-hero-status-badge ${portalStatus.tone}`}>{portalStatus.label}</span>
          </div>

          <div className="ap-recovery-ring">
            <div className="ap-recovery-ring-wrap">
              <svg viewBox="0 0 120 120" width="120" height="120">
                <circle className="ap-ring-track" cx="60" cy="60" r="52" />
                <circle
                  className="ap-ring-fill"
                  cx="60" cy="60" r="52"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={`${2 * Math.PI * 52 * (1 - Math.min(1, (recoveryScore ?? 0) / 100))}`}
                />
              </svg>
              <span className="ap-recovery-ring-value">{sleepScoreValue}</span>
              <span className="ap-recovery-ring-label">Recovery</span>
            </div>
          </div>
        </div>

        {/* 5 vital cards */}
        <div className="ap-hero-vitals">
          <article className="ap-vital-card">
            <span className="ap-card-label">Sueño</span>
            <strong>{sleepDurationDisplay}</strong>
            <span className="ap-chip purple">{sleepScoreLabel(recoveryScore)}</span>
            <span className="ap-vital-avg">
              {sleepHoursDelta === null
                ? "n/d"
                : `${sleepHoursDelta > 0 ? "+" : ""}${Math.round(sleepHoursDelta * 60)} min vs 7d`}
            </span>
          </article>
          <article className="ap-vital-card">
            <span className="ap-card-label">HRV nocturna</span>
            <strong>{typeof currentHrv === "number" ? `${Math.round(currentHrv)} ms` : "n/d"}</strong>
            <span className={`ap-chip green`}>{currentHrvStatus}</span>
            <span className="ap-vital-avg">{hrvAverage !== null ? `Media 7d ${hrvAverage.toFixed(0)} ms` : ""}</span>
          </article>
          <article className="ap-vital-card">
            <span className="ap-card-label">Reposo</span>
            <strong>{typeof currentRestingHr === "number" ? `${Math.round(currentRestingHr)} bpm` : "n/d"}</strong>
            <span className="ap-chip blue">{restingHrLabel(currentRestingHr, restingHrAverage)}</span>
            <span className="ap-vital-avg">{restingHrAverage !== null ? `Media 7d ${restingHrAverage.toFixed(0)} bpm` : ""}</span>
          </article>
          <article className="ap-vital-card">
            <span className="ap-card-label">Estrés</span>
            <strong>{typeof currentStress === "number" ? `${Math.round(currentStress)}` : "n/d"}</strong>
            <span className="ap-chip orange">{stressLabel(currentStress)}</span>
            <span className="ap-vital-avg">{stressAverage !== null ? `Media 7d ${stressAverage.toFixed(0)}` : ""}</span>
          </article>
          <article className="ap-vital-card">
            <span className="ap-card-label">Batería corporal</span>
            <strong>{bodyBatteryDelta !== null ? `${bodyBatteryDelta >= 0 ? "+" : ""}${Math.round(bodyBatteryDelta)}` : "n/d"}</strong>
            <span className="ap-chip green">{bodyBatteryDirection}</span>
            <span className="ap-vital-avg">{bodyBatteryAverage !== null ? `Media 7d ${bodyBatteryAverage.toFixed(0)}` : "Sin media"}</span>
          </article>
        </div>

        {/* Message card */}
        <div className={`ap-hero-message ${portalStatus.tone}`}>
          <span className="ap-card-label">Qué toca mirar ahora</span>
          <strong>{portalStatus.emphasis}</strong>
          <p>{sleepScoreSupport(recoveryScore)}</p>
        </div>

        {/* Garmin provider + refresh */}
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
        {athleteHealthStatus ? <p className="ap-status-msg">{athleteHealthStatus}</p> : null}

        {/* Loading / error states for health */}
        {athleteHealthLoading ? (
          <div className="ap-empty">Cargando actividad y salud conectada...</div>
        ) : athleteHealthError ? (
          <div className="ap-empty">{athleteHealthError}</div>
        ) : !athleteHealth ? (
          <div className="ap-empty">Todavía no hay una capa de salud Garmin conectada disponible.</div>
        ) : null}

        {/* Night visible section */}
        {athleteSleepBreakdown.length ? (
          <div className="ap-night-card">
            <span className="ap-card-label">Noche visible</span>
            <div className="ap-night-header">
              <span>
                <small>Tiempo en cama</small>
                <strong>{formatSleepDuration(visibleNightSeconds || null)}</strong>
              </span>
              <span>
                <small>Tiempo dormido</small>
                <strong>{sleepDurationDisplay}</strong>
              </span>
            </div>

            {/* Sleep architecture chips */}
            <div className="ap-stage-chips">
              {sleepArchitectureMetrics.filter((m) => m.key !== "sleep_time").map((metric) => (
                <div key={metric.key} className="ap-stage-chip">
                  <span className={`ap-stage-dot ${metric.key === "deep_sleep" ? "deep" : metric.key === "rem_sleep" ? "rem" : metric.key === "light_sleep" ? "light" : "awake"}`} />
                  <strong>{metric.value}</strong>
                  <small>{metric.label}</small>
                </div>
              ))}
            </div>

            {/* Sleep stage timeline */}
            {sleepStageWindow ? (
              <div className="ap-stage-timeline">
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
                  const width = ((segment.end - segment.start) / total) * 100;
                  return (
                    <span
                      key={`${segment.stage}-${segment.start}-${index}`}
                      className={`ap-stage-segment ${segment.stage}`}
                      style={{
                        left: `calc(70px + ${left / 100} * (100% - 70px))`,
                        width: `calc(${Math.max(width, 1.2) / 100} * (100% - 70px))`,
                        top: `${stageIndex * 23 + 2}px`,
                        height: "16px",
                      }}
                      title={stageLabel(segment.stage)}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 2 — Carga y Volumen
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
          BLOCK 3 — Última Sesión
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
          BLOCK 4 — Tendencias Recuperación
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="ap-block ap-recovery-trends">
        <span className="ap-eyebrow">Tendencias de recuperación</span>

        <div className="ap-trends-grid">
          {/* HRV trend */}
          <article className="ap-trend-card">
            <span className="ap-card-label">HRV nocturna</span>
            <strong>{typeof currentHrv === "number" ? `${Math.round(currentHrv)} ms` : "n/d"}</strong>
            <span className={`ap-chip green`}>{currentHrvStatus}</span>
            <span className="ap-vital-avg">{hrvAverage !== null ? `Media 7d ${hrvAverage.toFixed(0)} ms` : ""}</span>
            {wellnessSeries.some((p) => p.hrv !== null) ? (
              <div className="ap-spark">
                <ResponsiveContainer width="100%" height={30}>
                  <LineChart data={wellnessSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis hide dataKey="shortLabel" />
                    <YAxis hide />
                    <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as Array<{ payload?: WellnessSeriesPoint }> | undefined, "HRV nocturna", (v) => typeof v === "number" ? `${Math.round(v)} ms` : "n/d")} />
                    <Line type="monotone" dataKey="hrv" stroke="#4fb46b" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#4fb46b", stroke: "#fff", strokeWidth: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </article>

          {/* Resting HR trend */}
          <article className="ap-trend-card">
            <span className="ap-card-label">Frecuencia en reposo</span>
            <strong>{typeof currentRestingHr === "number" ? `${Math.round(currentRestingHr)} bpm` : "n/d"}</strong>
            <span className="ap-chip blue">{restingHrLabel(currentRestingHr, restingHrAverage)}</span>
            <span className="ap-vital-avg">{restingHrAverage !== null ? `Media 7d ${restingHrAverage.toFixed(0)} bpm` : ""}</span>
            {wellnessSeries.some((p) => p.restingHr !== null) ? (
              <div className="ap-spark">
                <ResponsiveContainer width="100%" height={30}>
                  <LineChart data={wellnessSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis hide dataKey="shortLabel" />
                    <YAxis hide />
                    <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as Array<{ payload?: WellnessSeriesPoint }> | undefined, "Frecuencia en reposo", (v) => typeof v === "number" ? `${Math.round(v)} bpm` : "n/d")} />
                    <Line type="monotone" dataKey="restingHr" stroke="#5a9cf5" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#5a9cf5", stroke: "#fff", strokeWidth: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </article>

          {/* Sleep hours trend */}
          <article className="ap-trend-card">
            <span className="ap-card-label">Horas de sueño</span>
            <strong>{currentSleepHours !== null ? `${currentSleepHours.toFixed(1)} h` : "n/d"}</strong>
            <span className="ap-chip purple">{sleepScoreLabel(recoveryScore)}</span>
            <span className="ap-vital-avg">{sleepHoursAverage !== null ? `Media 7d ${sleepHoursAverage.toFixed(1)} h` : ""}</span>
            {wellnessSeries.some((p) => p.sleepHours !== null) ? (
              <div className="ap-spark">
                <ResponsiveContainer width="100%" height={30}>
                  <LineChart data={wellnessSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis hide dataKey="shortLabel" />
                    <YAxis hide />
                    <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as Array<{ payload?: WellnessSeriesPoint }> | undefined, "Horas de sueño", (v) => typeof v === "number" ? `${v.toFixed(1)} h` : "n/d")} />
                    <Line type="monotone" dataKey="sleepHours" stroke="#7c6fba" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#7c6fba", stroke: "#fff", strokeWidth: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </article>

          {/* Sleep score trend */}
          <article className="ap-trend-card">
            <span className="ap-card-label">Sleep score</span>
            <strong>{sleepScoreValue}</strong>
            <span className="ap-chip purple">{typeof recoveryScore === "number" ? `${recoveryToneClass}` : "pendiente"}</span>
            <span className="ap-vital-avg">{averageNumericSeries(wellnessSeries.map((p) => p.sleepScore)) !== null ? `Media 7d ${averageNumericSeries(wellnessSeries.map((p) => p.sleepScore))!.toFixed(0)}` : ""}</span>
            {wellnessSeries.some((p) => p.sleepScore !== null) ? (
              <div className="ap-spark">
                <ResponsiveContainer width="100%" height={30}>
                  <LineChart data={wellnessSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis hide dataKey="shortLabel" />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as Array<{ payload?: WellnessSeriesPoint }> | undefined, "Sleep score", (v) => typeof v === "number" ? `${Math.round(v)}` : "n/d")} />
                    <Line type="monotone" dataKey="sleepScore" stroke="#7c6fba" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#7c6fba", stroke: "#fff", strokeWidth: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </article>

          {/* Stress trend */}
          <article className="ap-trend-card">
            <span className="ap-card-label">Estrés diario</span>
            <strong>{typeof currentStress === "number" ? `${Math.round(currentStress)}` : "n/d"}</strong>
            <span className="ap-chip orange">{stressLabel(currentStress)}</span>
            <span className="ap-vital-avg">{stressAverage !== null ? `Media 7d ${stressAverage.toFixed(0)}` : ""}</span>
            {wellnessSeries.some((p) => p.stress !== null) ? (
              <div className="ap-spark">
                <ResponsiveContainer width="100%" height={30}>
                  <LineChart data={wellnessSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis hide dataKey="shortLabel" />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as Array<{ payload?: WellnessSeriesPoint }> | undefined, "Estrés diario", (v) => typeof v === "number" ? `${Math.round(v)}` : "n/d")} />
                    <Line type="monotone" dataKey="stress" stroke="#e8935a" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#e8935a", stroke: "#fff", strokeWidth: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </article>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 5 — Tendencias Rendimiento
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="ap-block ap-performance">
        <span className="ap-eyebrow">Tendencias de rendimiento</span>

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

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 8 — Roadmap
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
    </div>
  );
}
