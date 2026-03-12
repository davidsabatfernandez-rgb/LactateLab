import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "../lib/api";
import { ResolvedTrainingThreshold, resolveTrainingThreshold } from "../lib/trainingThresholds";
import {
  Athlete,
  AthleteAnalysis,
  DisciplineView,
  StravaActivitiesImportResponse,
  StravaActivity,
} from "../types";

type StravaInformationPageProps = {
  token: string;
  athletes: Athlete[];
};

type InsightTone = "positive" | "warning" | "neutral";
type ExternalMetricKind = "pace" | "power" | "none";
type ActivityPhase = "warmup" | "main" | "cooldown";
type LoadBand = "sub_lt1" | "lt1" | "lt2" | "unknown";
type ThresholdReference = ResolvedTrainingThreshold;

type ActivitySegment = {
  sequence: number;
  name: string;
  source: "lap" | "split" | "activity";
  distanceM: number;
  elapsedTimeSeconds: number;
  movingTimeSeconds: number;
  averageSpeedMps?: number | null;
  averageHeartrate?: number | null;
  averageWatts?: number | null;
  startDate?: string | null;
};

type SegmentNameHints = {
  warmup: boolean;
  cooldown: boolean;
  recovery: boolean;
  work: boolean;
};

type ActivitySegmentAnalysis = ActivitySegment & {
  phase: ActivityPhase;
  phaseLabel: string;
  hints: SegmentNameHints;
  externalIndex?: number | null;
  heartRateIndex?: number | null;
  externalBand: LoadBand;
  heartRateBand: LoadBand;
  externalLoadLabel: string;
  heartRateLabel: string;
};

type PhaseSummary = {
  phase: ActivityPhase;
  label: string;
  durationSeconds: number;
  distanceM: number;
  segmentCount: number;
  averageSpeedMps?: number | null;
  averageHeartrate?: number | null;
  averageWatts?: number | null;
  externalLt1TimeSeconds: number;
  externalLt2TimeSeconds: number;
  heartRateLt1TimeSeconds: number;
  heartRateLt2TimeSeconds: number;
};

type ThresholdUsageSummary = {
  available: boolean;
  metricLabel: string;
  belowLt1TimeSeconds: number;
  lt1TimeSeconds: number;
  lt2TimeSeconds: number;
};

type ChartMode = "heartRate" | "metric" | "thresholdHeartRate" | "thresholdMetric";

type ActivityCoachSummary = {
  disciplineKey?: string | null;
  disciplineLabel: string;
  thresholdNote: string;
  thresholdSubnote: string;
  externalMetricKind: ExternalMetricKind;
  externalMetricLabel: string;
  lt1?: ThresholdReference | null;
  lt2?: ThresholdReference | null;
  segments: ActivitySegmentAnalysis[];
  phaseSummaries: Record<ActivityPhase, PhaseSummary>;
  thresholdUsage: {
    external: ThresholdUsageSummary;
    heartRate: ThresholdUsageSummary;
  };
  focusAlignment?: {
    tone: InsightTone;
    label: string;
    detail: string;
  } | null;
  insights: string[];
  hasCoachContext: boolean;
  hasLoadChart: boolean;
};

type SessionChartPoint = {
  key: string;
  label: string;
  phase: ActivityPhase;
  phaseLabel: string;
  elapsedSeconds: number;
  elapsedLabel: string;
  durationLabel: string;
  metricValue?: number | null;
  heartRateValue?: number | null;
  externalIndex?: number | null;
  heartRateIndex?: number | null;
  externalLoadLabel: string;
  heartRateLabel: string;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: SessionChartPoint }>;
};

const DEMO_ACTIVITY_ID = 9900000001;

function isoDateOffset(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function disciplineLabel(value: string) {
  if (value === "running") return "Carrera";
  if (value === "ciclismo") return "Ciclismo";
  if (value === "cycling") return "Cycling";
  if (value === "natación") return "Natación";
  if (value === "swimming") return "Natación";
  if (value === "triatlón" || value === "triatlon") return "Triatlón";
  return value;
}

function sportLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("run")) return "Carrera";
  if (normalized.includes("ride") || normalized.includes("cycle")) return "Ciclismo";
  if (normalized.includes("swim")) return "Natación";
  if (normalized.includes("weight")) return "Fuerza";
  if (normalized.includes("workout")) return "Workout";
  return value;
}

function sportToneClass(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("run")) return "run";
  if (normalized.includes("ride") || normalized.includes("cycle")) return "ride";
  if (normalized.includes("swim")) return "swim";
  if (normalized.includes("weight")) return "strength";
  return "other";
}

function formatDistance(distanceM: number) {
  return `${(distanceM / 1000).toFixed(2)} km`;
}

function formatCompactDistance(distanceM: number) {
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(distanceM >= 10000 ? 1 : 2)} km`;
}

function formatDuration(totalSeconds: number) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${seconds}s`;
  return `${seconds}s`;
}

function formatDurationShort(totalSeconds: number) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPace(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "n/d";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}/km`;
}

function formatSwimPace(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "n/d";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}/100m`;
}

function formatMovementMetric(speed?: number | null, sportType?: string) {
  if (!speed || speed <= 0) return "n/d";
  const normalized = (sportType ?? "").toLowerCase();
  if (normalized.includes("swim")) {
    const secondsPer100m = 100 / speed;
    return formatSwimPace(secondsPer100m);
  }
  if (normalized.includes("ride") || normalized.includes("cycle")) {
    return `${(speed * 3.6).toFixed(1)} km/h`;
  }
  const secondsPerKm = 1000 / speed;
  return formatPace(secondsPerKm);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function formatNumber(value?: number | null, suffix = "", digits = 0) {
  if (value === undefined || value === null) return "n/d";
  return `${value.toFixed(digits)}${suffix}`;
}

function formatLatLng(value: number[]) {
  if (!value.length) return "n/d";
  return value.map((item) => item.toFixed(5)).join(", ");
}

function normalizeActivity(activity: StravaActivity): StravaActivity {
  return {
    ...activity,
    start_latlng: Array.isArray(activity.start_latlng) ? activity.start_latlng : [],
    end_latlng: Array.isArray(activity.end_latlng) ? activity.end_latlng : [],
    splits_metric: Array.isArray(activity.splits_metric) ? activity.splits_metric : [],
    splits_standard: Array.isArray(activity.splits_standard) ? activity.splits_standard : [],
    best_efforts: Array.isArray(activity.best_efforts) ? activity.best_efforts : [],
    segment_efforts: Array.isArray(activity.segment_efforts) ? activity.segment_efforts : [],
    laps: Array.isArray(activity.laps) ? activity.laps : [],
    zones: Array.isArray(activity.zones) ? activity.zones : [],
    streams: activity.streams && typeof activity.streams === "object" ? activity.streams : {},
    raw_detail: activity.raw_detail && typeof activity.raw_detail === "object" ? activity.raw_detail : {},
  };
}

function activityAvailability(activity: StravaActivity): { tone: InsightTone; text: string } | null {
  if (activity.enrichment_error) {
    return { tone: "warning", text: `Detalle parcial: ${activity.enrichment_error}` };
  }
  if (activity.enrichment_notice) {
    return { tone: "neutral", text: activity.enrichment_notice };
  }
  return null;
}

function activityDataScore(activity: StravaActivity) {
  const signals = [
    activity.laps.length > 0,
    activity.splits_metric.length > 0,
    activity.splits_standard.length > 0,
    activity.best_efforts.length > 0,
    activity.segment_efforts.length > 0,
    activity.zones.length > 0,
    Object.keys(activity.streams ?? {}).length > 0,
    typeof activity.average_heartrate === "number",
    typeof activity.average_watts === "number",
    Boolean(activity.description),
  ];
  const available = signals.filter(Boolean).length;
  const ratio = available / signals.length;
  if (ratio >= 0.75) return { label: "Señal alta", tone: "positive" as const, value: available };
  if (ratio >= 0.45) return { label: "Señal media", tone: "warning" as const, value: available };
  return { label: "Señal base", tone: "neutral" as const, value: available };
}

function activitySummary(activity: StravaActivity) {
  const parts: string[] = [];
  if (activity.description) parts.push(activity.description);
  if (activity.laps.length) parts.push(`${activity.laps.length} laps`);
  if (activity.best_efforts.length) parts.push(`${activity.best_efforts.length} best efforts`);
  if (activity.segment_efforts.length) parts.push(`${activity.segment_efforts.length} segmentos`);
  if (Object.keys(activity.streams ?? {}).length) parts.push(`${Object.keys(activity.streams ?? {}).length} streams`);
  if (!parts.length) return "Vista rápida de actividad importada desde Strava.";
  return parts.slice(0, 3).join(" · ");
}

function longestLap(activity: StravaActivity) {
  return [...activity.laps].sort((a, b) => b.moving_time_seconds - a.moving_time_seconds)[0] ?? null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function phaseLabel(phase: ActivityPhase) {
  if (phase === "warmup") return "Calentamiento";
  if (phase === "cooldown") return "Enfriamiento";
  return "Bloque principal";
}

function phaseColor(phase: ActivityPhase) {
  if (phase === "warmup") return "#4d8bb2";
  if (phase === "cooldown") return "#5f8a6f";
  return "#d26a36";
}

function sportDisciplineCandidates(sportType: string) {
  const normalized = sportType.toLowerCase();
  if (normalized.includes("run")) return ["running", "carrera", "run"];
  if (normalized.includes("ride") || normalized.includes("cycle")) return ["ciclismo", "cycling", "ride"];
  if (normalized.includes("swim")) return ["natación", "swimming", "swim"];
  return [];
}

function resolveDisciplineView(analysis: AthleteAnalysis | null, activity: StravaActivity, athlete?: Athlete | null) {
  if (!analysis) {
    return { key: null, label: "Sin análisis cargado", view: null as DisciplineView | null };
  }

  const candidates = sportDisciplineCandidates(activity.sport_type);
  const views = analysis.discipline_views ?? {};
  for (const candidate of candidates) {
    if (views[candidate]) {
      return { key: candidate, label: disciplineLabel(candidate), view: views[candidate] };
    }
  }

  if (athlete?.primary_discipline && views[athlete.primary_discipline] && candidates.length) {
    return { key: athlete.primary_discipline, label: disciplineLabel(athlete.primary_discipline), view: views[athlete.primary_discipline] };
  }

  return { key: null, label: candidates.length ? disciplineLabel(candidates[0]) : "Sin disciplina de resistencia", view: null as DisciplineView | null };
}

function referenceToSpeed(reference?: ThresholdReference | null) {
  if (!reference?.paceSecondsPerKm || reference.paceSecondsPerKm <= 0) return null;
  return 1000 / reference.paceSecondsPerKm;
}

function resolveExternalMetricKind(sportType: string, lt1?: ThresholdReference | null, lt2?: ThresholdReference | null): ExternalMetricKind {
  const normalized = sportType.toLowerCase();
  if ((normalized.includes("ride") || normalized.includes("cycle")) && lt1?.powerWatts != null && lt2?.powerWatts != null) {
    return "power";
  }
  if ((normalized.includes("run") || normalized.includes("swim")) && lt1?.paceSecondsPerKm != null && lt2?.paceSecondsPerKm != null) {
    return "pace";
  }
  if (lt1?.powerWatts != null && lt2?.powerWatts != null) return "power";
  if (lt1?.paceSecondsPerKm != null && lt2?.paceSecondsPerKm != null) return "pace";
  return "none";
}

function externalMetricLabel(kind: ExternalMetricKind, sportType: string) {
  if (kind === "power") return "Potencia";
  if (kind === "pace" && sportType.toLowerCase().includes("swim")) return "Ritmo";
  if (kind === "pace") return "Ritmo";
  return "Carga externa";
}

function formatThresholdLoad(reference: ThresholdReference | null | undefined, sportType: string, kind: ExternalMetricKind) {
  if (!reference) return "n/d";
  if (kind === "power" && reference.powerWatts != null) {
    return `${Math.round(reference.powerWatts)} W`;
  }
  if (kind === "pace" && reference.paceSecondsPerKm != null) {
    if (sportType.toLowerCase().includes("swim")) return formatSwimPace(reference.paceSecondsPerKm / 10);
    return formatPace(reference.paceSecondsPerKm);
  }
  if (reference.heartRate != null) return `${Math.round(reference.heartRate)} bpm`;
  return `${reference.lactate.toFixed(1)} mmol/L`;
}

function formatSegmentExternalLoad(segment: ActivitySegment, sportType: string, kind: ExternalMetricKind) {
  if (kind === "power") return segment.averageWatts != null ? `${Math.round(segment.averageWatts)} W` : "n/d";
  if (kind === "pace") return formatMovementMetric(segment.averageSpeedMps, sportType);
  return "n/d";
}

function loadIndex(value?: number | null, lt1?: number | null, lt2?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || typeof lt1 !== "number" || typeof lt2 !== "number") return null;
  const safeLt1 = Math.max(lt1, 0.0001);
  const safeLt2 = Math.max(lt2, safeLt1 + 0.0001);
  if (value <= safeLt1) {
    return clamp(value / safeLt1, 0, 1);
  }
  if (value <= safeLt2) {
    return 1 + (value - safeLt1) / (safeLt2 - safeLt1);
  }
  const overSpan = Math.max(safeLt2 * 0.18, safeLt2 - safeLt1);
  return 2 + clamp((value - safeLt2) / overSpan, 0, 1);
}

function loadBandFromIndex(index?: number | null): LoadBand {
  if (typeof index !== "number" || !Number.isFinite(index)) return "unknown";
  if (index < 1) return "sub_lt1";
  if (index < 2) return "lt1";
  return "lt2";
}

function detectNameHints(name: string): SegmentNameHints {
  const normalized = name.toLowerCase();
  const warmup = ["warm", "wu", "calent", "activation", "activación", "drill", "drills", "técnica", "tecnica"].some((token) => normalized.includes(token));
  const cooldown = ["cool", "cd", "enfri", "vuelta", "cooldown", "down"].some((token) => normalized.includes(token));
  const recovery = ["recovery", "recover", "rest", "float", "easy", "suave", "descanso", "rec"].some((token) => normalized.includes(token));
  const work = ["rep", "tempo", "block", "main", "over", "under", "threshold", "umbral", "lt1", "lt2", "serie", "set", "work", "pace"].some((token) => normalized.includes(token));
  return { warmup, cooldown, recovery, work };
}

function buildActivitySegments(activity: StravaActivity): ActivitySegment[] {
  if (activity.laps.length) {
    return activity.laps.map((lap, index) => ({
      sequence: index + 1,
      name: lap.name || `Lap ${lap.lap_index}`,
      source: "lap",
      distanceM: lap.distance_m,
      elapsedTimeSeconds: lap.elapsed_time_seconds,
      movingTimeSeconds: lap.moving_time_seconds,
      averageSpeedMps: lap.average_speed_m_s ?? (lap.moving_time_seconds > 0 ? lap.distance_m / lap.moving_time_seconds : null),
      averageHeartrate: lap.average_heartrate ?? null,
      averageWatts: lap.average_watts ?? null,
      startDate: lap.start_date ?? null,
    }));
  }

  if (activity.splits_metric.length) {
    return activity.splits_metric.map((split, index) => ({
      sequence: index + 1,
      name: `Split ${split.split_index ?? index + 1}`,
      source: "split",
      distanceM: split.distance_m,
      elapsedTimeSeconds: split.elapsed_time_seconds,
      movingTimeSeconds: split.moving_time_seconds,
      averageSpeedMps: split.average_speed_m_s ?? (split.moving_time_seconds > 0 ? split.distance_m / split.moving_time_seconds : null),
      averageHeartrate: split.average_heartrate ?? null,
      averageWatts: null,
      startDate: null,
    }));
  }

  return [
    {
      sequence: 1,
      name: activity.name,
      source: "activity",
      distanceM: activity.distance_m,
      elapsedTimeSeconds: activity.elapsed_time_seconds,
      movingTimeSeconds: activity.moving_time_seconds,
      averageSpeedMps: activity.average_speed_m_s ?? null,
      averageHeartrate: activity.average_heartrate ?? null,
      averageWatts: activity.average_watts ?? null,
      startDate: activity.started_at,
    },
  ];
}

function classifyPhases(segments: Array<Omit<ActivitySegmentAnalysis, "phase" | "phaseLabel">>) {
  if (!segments.length) return [];
  if (segments.length === 1) {
    return segments.map((segment) => ({ ...segment, phase: "main" as const, phaseLabel: phaseLabel("main") }));
  }

  const scores = segments.map((segment, index) => {
    const intensity = Math.max(segment.externalIndex ?? 0, segment.heartRateIndex ?? 0);
    let score = intensity;
    if (segment.hints.work) score += 0.7;
    if (segment.hints.recovery) score += 0.15;
    if (segment.hints.warmup) score -= 0.9;
    if (segment.hints.cooldown) score -= 1.1;
    if (segments.length > 2) {
      const midpoint = (segments.length - 1) / 2;
      const distanceToCenter = Math.abs(index - midpoint) / Math.max(midpoint, 1);
      score += (1 - distanceToCenter) * 0.2;
    }
    return score;
  });

  const candidateIndices = scores
    .map((score, index) => ({ score, index }))
    .filter(({ score, index }) => {
      const hints = segments[index].hints;
      return !hints.warmup && !hints.cooldown && (score >= 1.05 || hints.work);
    })
    .map(({ index }) => index);

  let firstMain = candidateIndices.length ? candidateIndices[0] : segments.findIndex((segment) => !segment.hints.warmup);
  let lastMain = candidateIndices.length
    ? candidateIndices[candidateIndices.length - 1]
    : segments.length -
      1 -
      [...segments]
        .reverse()
        .findIndex((segment) => !segment.hints.cooldown);

  if (firstMain < 0 || firstMain >= segments.length) firstMain = 0;
  if (lastMain < 0 || lastMain >= segments.length) lastMain = segments.length - 1;
  if (firstMain > lastMain) {
    firstMain = 0;
    lastMain = segments.length - 1;
  }

  while (firstMain > 0 && segments[firstMain - 1].hints.recovery && !segments[firstMain - 1].hints.warmup) {
    firstMain -= 1;
  }
  while (lastMain < segments.length - 1 && segments[lastMain + 1].hints.recovery && !segments[lastMain + 1].hints.cooldown) {
    lastMain += 1;
  }

  return segments.map((segment, index) => {
    let phase: ActivityPhase = "main";
    if (index < firstMain) phase = "warmup";
    if (index > lastMain) phase = "cooldown";
    if (segment.hints.warmup && index <= firstMain) phase = "warmup";
    if (segment.hints.cooldown && index >= lastMain) phase = "cooldown";
    return { ...segment, phase, phaseLabel: phaseLabel(phase) };
  });
}

function summarizePhase(phase: ActivityPhase, segments: ActivitySegmentAnalysis[]) {
  const relevant = segments.filter((segment) => segment.phase === phase);
  const durationSeconds = relevant.reduce((total, segment) => total + segment.movingTimeSeconds, 0);
  const distanceM = relevant.reduce((total, segment) => total + segment.distanceM, 0);
  const heartRateWeighted = relevant.reduce(
    (total, segment) => total + (segment.averageHeartrate ?? 0) * segment.movingTimeSeconds,
    0,
  );
  const wattsWeighted = relevant.reduce((total, segment) => total + (segment.averageWatts ?? 0) * segment.movingTimeSeconds, 0);
  const totalHrTime = relevant.reduce((total, segment) => total + (segment.averageHeartrate != null ? segment.movingTimeSeconds : 0), 0);
  const totalWattsTime = relevant.reduce((total, segment) => total + (segment.averageWatts != null ? segment.movingTimeSeconds : 0), 0);

  return {
    phase,
    label: phaseLabel(phase),
    durationSeconds,
    distanceM,
    segmentCount: relevant.length,
    averageSpeedMps: durationSeconds > 0 ? distanceM / durationSeconds : null,
    averageHeartrate: totalHrTime > 0 ? heartRateWeighted / totalHrTime : null,
    averageWatts: totalWattsTime > 0 ? wattsWeighted / totalWattsTime : null,
    externalLt1TimeSeconds: relevant.reduce((total, segment) => total + (segment.externalBand === "lt1" ? segment.movingTimeSeconds : 0), 0),
    externalLt2TimeSeconds: relevant.reduce((total, segment) => total + (segment.externalBand === "lt2" ? segment.movingTimeSeconds : 0), 0),
    heartRateLt1TimeSeconds: relevant.reduce((total, segment) => total + (segment.heartRateBand === "lt1" ? segment.movingTimeSeconds : 0), 0),
    heartRateLt2TimeSeconds: relevant.reduce((total, segment) => total + (segment.heartRateBand === "lt2" ? segment.movingTimeSeconds : 0), 0),
  };
}

function summarizeThresholdUsage(segments: ActivitySegmentAnalysis[], signal: "external" | "heartRate", metricLabel: string): ThresholdUsageSummary {
  const bandKey = signal === "external" ? "externalBand" : "heartRateBand";
  const valid = segments.filter((segment) => segment[bandKey] !== "unknown");
  return {
    available: valid.length > 0,
    metricLabel,
    belowLt1TimeSeconds: valid.reduce((total, segment) => total + (segment[bandKey] === "sub_lt1" ? segment.movingTimeSeconds : 0), 0),
    lt1TimeSeconds: valid.reduce((total, segment) => total + (segment[bandKey] === "lt1" ? segment.movingTimeSeconds : 0), 0),
    lt2TimeSeconds: valid.reduce((total, segment) => total + (segment[bandKey] === "lt2" ? segment.movingTimeSeconds : 0), 0),
  };
}

function buildThresholdNote(lt1: ThresholdReference | null, lt2: ThresholdReference | null, disciplineKey?: string | null) {
  const pairs = [lt1, lt2].filter(Boolean) as ThresholdReference[];
  if (!pairs.length) {
    return {
      note: "Sin ancla LT1/LT2 usable para esta actividad",
      subnote: disciplineKey
        ? `No hay referencias visibles en ${disciplineLabel(disciplineKey)} para estimar tiempo por umbrales.`
        : "Este deporte todavía no se cruza con una disciplina de resistencia del sistema.",
    };
  }

  const uniqueSources = Array.from(new Set(pairs.map((pair) => pair.source)));
  if (uniqueSources.length === 1) {
    const source = uniqueSources[0];
    if (source === "individual") {
      return {
        note: "Usando umbrales individuales del motor",
        subnote: "La lectura prioriza las anclas longitudinales del atleta cuando la señal es suficiente.",
      };
    }
    if (source === "analysis") {
      return {
        note: "Usando anclas del análisis actual",
        subnote: "Esta actividad conserva la referencia analítica disponible mientras aún no entra una base fisiológica o individual completa.",
      };
    }
    return {
      note: "Usando anclas fisiológicas 2.0 / 4.0 mmol",
      subnote: "La actividad se compara con referencias fisiológicas estables mientras no haya LT Individual robusto.",
    };
  }

  return {
    note: "Usando anclas mixtas LT1/LT2",
    subnote: `${lt1 ? `LT1: ${lt1.sourceLabel}` : "LT1 sin ancla"} · ${lt2 ? `LT2: ${lt2.sourceLabel}` : "LT2 sin ancla"}`,
  };
}

function buildFocusAlignment(
  analysis: AthleteAnalysis | null,
  usage: { external: ThresholdUsageSummary; heartRate: ThresholdUsageSummary },
): ActivityCoachSummary["focusAlignment"] {
  const block = analysis?.active_focus_block;
  if (!block) return null;
  const objective = `${block.block_objective ?? ""} ${block.block_intent ?? ""}`.toLowerCase();
  if (!objective.trim()) return null;

  if (objective.includes("lt2") || objective.includes("umbral")) {
    const aligned = usage.external.lt2TimeSeconds > 0 || usage.heartRate.lt2TimeSeconds > 0;
    return {
      tone: aligned ? "positive" : "warning",
      label: aligned ? "Sesión alineada con foco LT2" : "Foco LT2 poco visible",
      detail: aligned
        ? "El bloque principal sí pisa LT2 en la lectura estimada de la actividad."
        : "La actividad no deja un tiempo claro en LT2 pese al foco activo del bloque.",
    };
  }

  if (objective.includes("lt1") || objective.includes("base") || objective.includes("aerób")) {
    const aligned = usage.external.lt1TimeSeconds >= usage.external.lt2TimeSeconds;
    return {
      tone: aligned ? "positive" : "neutral",
      label: aligned ? "Sesión alineada con foco LT1" : "Sesión más agresiva que el foco LT1",
      detail: aligned
        ? "Predomina el tiempo entre LT1 y LT2 frente al tiempo por encima de LT2."
        : "La actividad se va hacia un perfil más alto que el objetivo de base o LT1.",
    };
  }

  return {
    tone: "neutral",
    label: "Foco activo visible",
    detail: `${block.block_objective} · ${block.block_intent ?? "sin intención detallada"}`,
  };
}

function buildCoachInsights(
  segments: ActivitySegmentAnalysis[],
  phaseSummaries: Record<ActivityPhase, PhaseSummary>,
  usage: { external: ThresholdUsageSummary; heartRate: ThresholdUsageSummary },
  focusAlignment?: ActivityCoachSummary["focusAlignment"],
) {
  const totalTime = segments.reduce((total, segment) => total + segment.movingTimeSeconds, 0);
  const mainShare = totalTime > 0 ? Math.round((phaseSummaries.main.durationSeconds / totalTime) * 100) : 0;
  const insights = [
    `El bloque principal ocupa ${formatDuration(phaseSummaries.main.durationSeconds)} y concentra ${mainShare}% del tiempo útil.`,
  ];

  if (usage.external.available) {
    insights.push(
      `Por carga externa: ${formatDuration(usage.external.lt1TimeSeconds)} entre LT1 y LT2, ${formatDuration(usage.external.lt2TimeSeconds)} en LT2+.`,
    );
  }

  if (usage.heartRate.available) {
    insights.push(
      `Por FC: ${formatDuration(usage.heartRate.lt1TimeSeconds)} entre LT1 y LT2, ${formatDuration(usage.heartRate.lt2TimeSeconds)} en LT2+.`,
    );
  }

  if (usage.external.available && usage.heartRate.available) {
    const delta = usage.heartRate.lt2TimeSeconds - usage.external.lt2TimeSeconds;
    if (Math.abs(delta) >= 240) {
      insights.push(
        delta > 0
          ? "La FC permanece más tiempo en LT2 que la carga externa: posible deriva o fatiga acumulada."
          : "La carga externa pisa LT2 más que la FC: sesión más mecánica o con respuesta cardiaca contenida.",
      );
    }
  }

  if (focusAlignment) {
    insights.push(focusAlignment.detail);
  }

  return insights.slice(0, 4);
}

function buildActivityCoachSummary(activity: StravaActivity, analysis: AthleteAnalysis | null, athlete?: Athlete | null): ActivityCoachSummary {
  const disciplineContext = resolveDisciplineView(analysis, activity, athlete);
  const lt1 = resolveTrainingThreshold(disciplineContext.view, "LT1");
  const lt2 = resolveTrainingThreshold(disciplineContext.view, "LT2");
  const externalMetricKind = resolveExternalMetricKind(activity.sport_type, lt1, lt2);
  const externalMetricLabelValue = externalMetricLabel(externalMetricKind, activity.sport_type);
  const segments = buildActivitySegments(activity);
  const lt1External = externalMetricKind === "power" ? lt1?.powerWatts ?? null : referenceToSpeed(lt1);
  const lt2External = externalMetricKind === "power" ? lt2?.powerWatts ?? null : referenceToSpeed(lt2);

  const analyzedBase = segments.map((segment) => {
    const hints = detectNameHints(segment.name);
    const externalValue =
      externalMetricKind === "power"
        ? segment.averageWatts ?? null
        : externalMetricKind === "pace"
          ? segment.averageSpeedMps ?? null
          : null;
    const externalIndex = loadIndex(externalValue, lt1External, lt2External);
    const heartRateIndex = loadIndex(segment.averageHeartrate ?? null, lt1?.heartRate ?? null, lt2?.heartRate ?? null);
    return {
      ...segment,
      hints,
      externalIndex,
      heartRateIndex,
      externalBand: loadBandFromIndex(externalIndex),
      heartRateBand: loadBandFromIndex(heartRateIndex),
      externalLoadLabel: formatSegmentExternalLoad(segment, activity.sport_type, externalMetricKind),
      heartRateLabel: segment.averageHeartrate != null ? `${Math.round(segment.averageHeartrate)} bpm` : "n/d",
    };
  });

  const analyzedSegments = classifyPhases(analyzedBase);
  const phaseSummaries = {
    warmup: summarizePhase("warmup", analyzedSegments),
    main: summarizePhase("main", analyzedSegments),
    cooldown: summarizePhase("cooldown", analyzedSegments),
  };
  const thresholdUsage = {
    external: summarizeThresholdUsage(analyzedSegments, "external", externalMetricLabelValue),
    heartRate: summarizeThresholdUsage(analyzedSegments, "heartRate", "FC"),
  };
  const thresholdNote = buildThresholdNote(lt1, lt2, disciplineContext.key);
  const focusAlignment = buildFocusAlignment(analysis, thresholdUsage);
  const insights = buildCoachInsights(analyzedSegments, phaseSummaries, thresholdUsage, focusAlignment);

  return {
    disciplineKey: disciplineContext.key,
    disciplineLabel: disciplineContext.label,
    thresholdNote: thresholdNote.note,
    thresholdSubnote: thresholdNote.subnote,
    externalMetricKind,
    externalMetricLabel: externalMetricLabelValue,
    lt1,
    lt2,
    segments: analyzedSegments,
    phaseSummaries,
    thresholdUsage,
    focusAlignment,
    insights,
    hasCoachContext: Boolean(lt1 || lt2),
    hasLoadChart: analyzedSegments.some((segment) => segment.externalIndex != null || segment.heartRateIndex != null),
  };
}

function formatPhasePrimaryMetric(summary: PhaseSummary, sportType: string, kind: ExternalMetricKind) {
  if (kind === "power") return summary.averageWatts != null ? `${Math.round(summary.averageWatts)} W` : "n/d";
  if (kind === "pace") return formatMovementMetric(summary.averageSpeedMps, sportType);
  return "n/d";
}

function segmentMetricNumericValue(segment: ActivitySegmentAnalysis, kind: ExternalMetricKind) {
  if (kind === "power") return segment.averageWatts ?? null;
  if (kind === "pace" && segment.averageSpeedMps && segment.averageSpeedMps > 0) {
    return 1000 / segment.averageSpeedMps;
  }
  return null;
}

function buildSessionChartData(summary: ActivityCoachSummary) {
  let elapsedSeconds = 0;
  return summary.segments.map((segment) => {
    elapsedSeconds += segment.movingTimeSeconds;
    return {
      key: `${segment.phase}-${segment.sequence}`,
      label: segment.name,
      phase: segment.phase,
      phaseLabel: segment.phaseLabel,
      elapsedSeconds,
      elapsedLabel: formatDurationShort(elapsedSeconds),
      durationLabel: formatDuration(segment.movingTimeSeconds),
      metricValue: segmentMetricNumericValue(segment, summary.externalMetricKind),
      heartRateValue: segment.averageHeartrate ?? null,
      externalIndex: segment.externalIndex ?? null,
      heartRateIndex: segment.heartRateIndex ?? null,
      externalLoadLabel: segment.externalLoadLabel,
      heartRateLabel: segment.heartRateLabel,
    };
  });
}

function chartModeLabel(mode: ChartMode, summary: ActivityCoachSummary) {
  if (mode === "heartRate") return "FC";
  if (mode === "metric") return summary.externalMetricKind === "power" ? "Potencia" : "Ritmo";
  if (mode === "thresholdHeartRate") return "Umbral lactato · FC";
  return summary.externalMetricKind === "power" ? "Umbral lactato · Potencia" : "Umbral lactato · Ritmo";
}

function availableChartModes(summary: ActivityCoachSummary) {
  const modes: ChartMode[] = [];
  if (summary.segments.some((segment) => segment.averageHeartrate != null)) modes.push("heartRate");
  if (summary.externalMetricKind !== "none" && summary.segments.some((segment) => segmentMetricNumericValue(segment, summary.externalMetricKind) != null)) {
    modes.push("metric");
  }
  if (summary.thresholdUsage.heartRate.available) modes.push("thresholdHeartRate");
  if (summary.thresholdUsage.external.available) modes.push("thresholdMetric");
  return modes;
}

function actualMetricLabel(summary: ActivityCoachSummary) {
  return summary.externalMetricKind === "power" ? "Potencia" : "Ritmo";
}

function referenceLineValues(summary: ActivityCoachSummary, mode: ChartMode) {
  if (mode === "heartRate") {
    return [
      { value: summary.lt1?.heartRate ?? null, label: "LT1 FC", stroke: "#2f6570" },
      { value: summary.lt2?.heartRate ?? null, label: "LT2 FC", stroke: "#d26a36" },
    ].filter((item) => typeof item.value === "number") as Array<{ value: number; label: string; stroke: string }>;
  }

  if (mode === "metric") {
    if (summary.externalMetricKind === "power") {
      return [
        { value: summary.lt1?.powerWatts ?? null, label: "LT1 Potencia", stroke: "#2f6570" },
        { value: summary.lt2?.powerWatts ?? null, label: "LT2 Potencia", stroke: "#d26a36" },
      ].filter((item) => typeof item.value === "number") as Array<{ value: number; label: string; stroke: string }>;
    }
    return [
      { value: summary.lt1?.paceSecondsPerKm ?? null, label: "LT1 Ritmo", stroke: "#2f6570" },
      { value: summary.lt2?.paceSecondsPerKm ?? null, label: "LT2 Ritmo", stroke: "#d26a36" },
    ].filter((item) => typeof item.value === "number") as Array<{ value: number; label: string; stroke: string }>;
  }

  if (mode === "thresholdHeartRate") {
    return [
      { value: 1, label: "LT1 FC", stroke: "#2f6570" },
      { value: 2, label: "LT2 FC", stroke: "#d26a36" },
    ];
  }

  return [
    { value: 1, label: summary.externalMetricKind === "power" ? "LT1 Potencia" : "LT1 Ritmo", stroke: "#2f6570" },
    { value: 2, label: summary.externalMetricKind === "power" ? "LT2 Potencia" : "LT2 Ritmo", stroke: "#d26a36" },
  ];
}

function chartValueFormatter(value: number | null | undefined, summary: ActivityCoachSummary, mode: ChartMode, sportType: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  if (mode === "heartRate") return `${Math.round(value)} bpm`;
  if (mode === "metric") {
    if (summary.externalMetricKind === "power") return `${Math.round(value)} W`;
    if (summary.externalMetricKind === "pace") {
      return sportType.toLowerCase().includes("swim") ? formatSwimPace(value / 10) : formatPace(value);
    }
    return value.toFixed(1);
  }
  return renderNormalizedTick(value);
}

function chartDomain(points: SessionChartPoint[], summary: ActivityCoachSummary, mode: ChartMode) {
  const values = points
    .map((point) => {
      if (mode === "heartRate") return point.heartRateValue ?? null;
      if (mode === "metric") return point.metricValue ?? null;
      if (mode === "thresholdHeartRate") return point.heartRateIndex ?? null;
      return point.externalIndex ?? null;
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const refs = referenceLineValues(summary, mode)
    .map((item) => item.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const combined = [...values, ...refs];
  if (!combined.length) return [0, 1] as [number, number];
  if (mode === "thresholdHeartRate" || mode === "thresholdMetric") return [0, 3] as [number, number];
  const min = Math.min(...combined);
  const max = Math.max(...combined);
  const padding = Math.max((max - min) * 0.12, mode === "heartRate" ? 4 : 8);
  return [Math.max(0, min - padding), max + padding] as [number, number];
}

function isChartModeReversed(summary: ActivityCoachSummary, mode: ChartMode) {
  return mode === "metric" && summary.externalMetricKind === "pace";
}

function chartDataKey(mode: ChartMode) {
  if (mode === "heartRate") return "heartRateValue";
  if (mode === "metric") return "metricValue";
  if (mode === "thresholdHeartRate") return "heartRateIndex";
  return "externalIndex";
}

function renderChartTooltip(props: ChartTooltipProps, summary: ActivityCoachSummary, mode: ChartMode, sportType: string) {
  if (!props.active || !props.payload?.length) return null;
  const point = props.payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="strava-chart-tooltip">
      <strong>{point.label}</strong>
      <span>{point.phaseLabel} · {point.elapsedLabel} · {point.durationLabel}</span>
      <span>{chartModeLabel(mode, summary)}: {chartValueFormatter(
        mode === "heartRate"
          ? point.heartRateValue
          : mode === "metric"
            ? point.metricValue
            : mode === "thresholdHeartRate"
              ? point.heartRateIndex
              : point.externalIndex,
        summary,
        mode,
        sportType,
      )}</span>
      <span>{actualMetricLabel(summary)}: {point.externalLoadLabel}</span>
      <span>FC: {point.heartRateLabel}</span>
    </div>
  );
}

function renderNormalizedTick(value: number) {
  if (value === 0) return "0";
  if (value === 1) return "LT1";
  if (value === 2) return "LT2";
  return "LT2+";
}

function buildDemoActivity(athlete?: Athlete | null): StravaActivity {
  const athleteName = athlete?.name ?? "Atleta demo";
  const sportType = athlete?.primary_discipline === "ciclismo" ? "Ride" : "Run";
  const isRide = sportType === "Ride";

  return normalizeActivity({
    provider_activity_id: DEMO_ACTIVITY_ID,
    name: isRide ? "Demo local · Over-unders LT2" : "Demo local · 8x400 ritmo 5k",
    sport_type: sportType,
    started_at: "2026-03-09T17:45:00Z",
    timezone: "(GMT+01:00) Europe/Madrid",
    distance_m: isRide ? 36200 : 12240,
    moving_time_seconds: isRide ? 4460 : 3325,
    elapsed_time_seconds: isRide ? 4720 : 3490,
    average_speed_m_s: isRide ? 8.12 : 3.68,
    max_speed_m_s: isRide ? 14.1 : 5.2,
    average_heartrate: isRide ? 151 : 164,
    max_heartrate: isRide ? 178 : 188,
    average_watts: isRide ? 247 : 328,
    kilojoules: isRide ? 1112 : 968,
    trainer: false,
    commute: false,
    description: `${athleteName} · actividad demo local para trabajar la visual sin importar desde Strava todavía.`,
    total_elevation_gain_m: isRide ? 412 : 38,
    calories: isRide ? 921 : 744,
    average_cadence: isRide ? 88 : 86,
    weighted_average_watts: isRide ? 263 : 336,
    max_watts: isRide ? 512 : 472,
    device_watts: true,
    suffer_score: null,
    perceived_exertion: 7,
    has_heartrate: true,
    workout_type: null,
    gear_id: null,
    start_latlng: [41.28787, 2.10474],
    end_latlng: [41.28789, 2.10473],
    map_summary_polyline: "demo_polyline_local_preview",
    device_name: isRide ? "Garmin Edge 840" : "Garmin fēnix 7",
    splits_metric: isRide
      ? [
          { distance_m: 10000, elapsed_time_seconds: 1020, moving_time_seconds: 1008, elevation_difference_m: 52, split_index: 1, average_speed_m_s: 9.92, average_heartrate: 139 },
          { distance_m: 10000, elapsed_time_seconds: 1088, moving_time_seconds: 1062, elevation_difference_m: 140, split_index: 2, average_speed_m_s: 9.41, average_heartrate: 154 },
          { distance_m: 10000, elapsed_time_seconds: 1216, moving_time_seconds: 1170, elevation_difference_m: 118, split_index: 3, average_speed_m_s: 8.54, average_heartrate: 161 },
          { distance_m: 6200, elapsed_time_seconds: 1136, moving_time_seconds: 1120, elevation_difference_m: 102, split_index: 4, average_speed_m_s: 5.54, average_heartrate: 160 },
        ]
      : [
          { distance_m: 1000, elapsed_time_seconds: 337, moving_time_seconds: 337, elevation_difference_m: 2, split_index: 1, average_speed_m_s: 2.97, average_heartrate: 138 },
          { distance_m: 1000, elapsed_time_seconds: 302, moving_time_seconds: 302, elevation_difference_m: 0, split_index: 2, average_speed_m_s: 3.31, average_heartrate: 152 },
          { distance_m: 1000, elapsed_time_seconds: 245, moving_time_seconds: 245, elevation_difference_m: -1, split_index: 3, average_speed_m_s: 4.08, average_heartrate: 176 },
          { distance_m: 1000, elapsed_time_seconds: 251, moving_time_seconds: 251, elevation_difference_m: 1, split_index: 4, average_speed_m_s: 3.98, average_heartrate: 177 },
          { distance_m: 1000, elapsed_time_seconds: 247, moving_time_seconds: 247, elevation_difference_m: -1, split_index: 5, average_speed_m_s: 4.05, average_heartrate: 179 },
          { distance_m: 1000, elapsed_time_seconds: 248, moving_time_seconds: 248, elevation_difference_m: 0, split_index: 6, average_speed_m_s: 4.03, average_heartrate: 180 },
          { distance_m: 1000, elapsed_time_seconds: 255, moving_time_seconds: 255, elevation_difference_m: 1, split_index: 7, average_speed_m_s: 3.92, average_heartrate: 178 },
          { distance_m: 1000, elapsed_time_seconds: 249, moving_time_seconds: 249, elevation_difference_m: 0, split_index: 8, average_speed_m_s: 4.01, average_heartrate: 181 },
          { distance_m: 1000, elapsed_time_seconds: 281, moving_time_seconds: 281, elevation_difference_m: 2, split_index: 9, average_speed_m_s: 3.56, average_heartrate: 168 },
          { distance_m: 1000, elapsed_time_seconds: 336, moving_time_seconds: 336, elevation_difference_m: -1, split_index: 10, average_speed_m_s: 2.98, average_heartrate: 149 },
          { distance_m: 1000, elapsed_time_seconds: 335, moving_time_seconds: 335, elevation_difference_m: 0, split_index: 11, average_speed_m_s: 2.99, average_heartrate: 141 },
          { distance_m: 1240, elapsed_time_seconds: 239, moving_time_seconds: 239, elevation_difference_m: 1, split_index: 12, average_speed_m_s: 5.19, average_heartrate: 182 },
        ],
    splits_standard: isRide
      ? [
          { distance_m: 16090, elapsed_time_seconds: 1664, moving_time_seconds: 1630, elevation_difference_m: 112, split_index: 1, average_speed_m_s: 9.87, average_heartrate: 145 },
          { distance_m: 16100, elapsed_time_seconds: 1808, moving_time_seconds: 1761, elevation_difference_m: 165, split_index: 2, average_speed_m_s: 9.14, average_heartrate: 159 },
          { distance_m: 4010, elapsed_time_seconds: 988, moving_time_seconds: 973, elevation_difference_m: 135, split_index: 3, average_speed_m_s: 4.12, average_heartrate: 162 },
        ]
      : [
          { distance_m: 1609, elapsed_time_seconds: 529, moving_time_seconds: 529, elevation_difference_m: 3, split_index: 1, average_speed_m_s: 3.04, average_heartrate: 142 },
          { distance_m: 1609, elapsed_time_seconds: 424, moving_time_seconds: 424, elevation_difference_m: 0, split_index: 2, average_speed_m_s: 3.79, average_heartrate: 166 },
          { distance_m: 1609, elapsed_time_seconds: 407, moving_time_seconds: 407, elevation_difference_m: -1, split_index: 3, average_speed_m_s: 3.95, average_heartrate: 179 },
          { distance_m: 1609, elapsed_time_seconds: 416, moving_time_seconds: 416, elevation_difference_m: 0, split_index: 4, average_speed_m_s: 3.86, average_heartrate: 177 },
          { distance_m: 1609, elapsed_time_seconds: 503, moving_time_seconds: 503, elevation_difference_m: 1, split_index: 5, average_speed_m_s: 3.19, average_heartrate: 154 },
          { distance_m: 1195, elapsed_time_seconds: 214, moving_time_seconds: 214, elevation_difference_m: 0, split_index: 6, average_speed_m_s: 5.58, average_heartrate: 183 },
        ],
    best_efforts: isRide
      ? [
          { name: "5K climb", distance_m: 5000, elapsed_time_seconds: 742, moving_time_seconds: 742, start_date: "2026-03-09T18:02:00Z", average_heartrate: 164, average_watts: 312, pr_rank: 2, achievement_count: 1, segment_id: null, segment_average_grade: null, segment_max_grade: null, segment_elevation_high_m: null, segment_elevation_low_m: null, segment_start_latlng: [], segment_end_latlng: [] },
          { name: "20 min power", distance_m: 11000, elapsed_time_seconds: 1200, moving_time_seconds: 1200, start_date: "2026-03-09T18:15:00Z", average_heartrate: 166, average_watts: 289, pr_rank: null, achievement_count: 0, segment_id: null, segment_average_grade: null, segment_max_grade: null, segment_elevation_high_m: null, segment_elevation_low_m: null, segment_start_latlng: [], segment_end_latlng: [] },
        ]
      : [
          { name: "400m", distance_m: 400, elapsed_time_seconds: 87, moving_time_seconds: 87, start_date: "2026-03-09T17:59:00Z", average_heartrate: 176, average_watts: 402, pr_rank: null, achievement_count: 0, segment_id: null, segment_average_grade: null, segment_max_grade: null, segment_elevation_high_m: null, segment_elevation_low_m: null, segment_start_latlng: [], segment_end_latlng: [] },
          { name: "1K", distance_m: 1000, elapsed_time_seconds: 241, moving_time_seconds: 241, start_date: "2026-03-09T18:03:00Z", average_heartrate: 180, average_watts: 358, pr_rank: 3, achievement_count: 1, segment_id: null, segment_average_grade: null, segment_max_grade: null, segment_elevation_high_m: null, segment_elevation_low_m: null, segment_start_latlng: [], segment_end_latlng: [] },
          { name: "1 mile", distance_m: 1609, elapsed_time_seconds: 408, moving_time_seconds: 408, start_date: "2026-03-09T18:09:00Z", average_heartrate: 179, average_watts: 349, pr_rank: null, achievement_count: 0, segment_id: null, segment_average_grade: null, segment_max_grade: null, segment_elevation_high_m: null, segment_elevation_low_m: null, segment_start_latlng: [], segment_end_latlng: [] },
        ],
    segment_efforts: isRide
      ? [
          { name: "Subida demo LT2", distance_m: 2480, elapsed_time_seconds: 436, moving_time_seconds: 436, start_date: "2026-03-09T18:10:00Z", average_heartrate: 168, average_watts: 324, pr_rank: 2, achievement_count: 1, segment_id: 301, segment_average_grade: 4.8, segment_max_grade: 8.4, segment_elevation_high_m: 185, segment_elevation_low_m: 68, segment_start_latlng: [], segment_end_latlng: [] },
          { name: "Llano aero demo", distance_m: 3210, elapsed_time_seconds: 382, moving_time_seconds: 382, start_date: "2026-03-09T18:26:00Z", average_heartrate: 154, average_watts: 278, pr_rank: null, achievement_count: 0, segment_id: 302, segment_average_grade: 0.4, segment_max_grade: 1.2, segment_elevation_high_m: 102, segment_elevation_low_m: 95, segment_start_latlng: [], segment_end_latlng: [] },
        ]
      : [
          { name: "Recta demo 500", distance_m: 512, elapsed_time_seconds: 104, moving_time_seconds: 104, start_date: "2026-03-09T18:06:00Z", average_heartrate: 178, average_watts: 372, pr_rank: 1, achievement_count: 1, segment_id: 201, segment_average_grade: -0.2, segment_max_grade: 0.4, segment_elevation_high_m: 4.2, segment_elevation_low_m: 3.9, segment_start_latlng: [], segment_end_latlng: [] },
          { name: "Curva demo 400", distance_m: 398, elapsed_time_seconds: 86, moving_time_seconds: 86, start_date: "2026-03-09T18:11:00Z", average_heartrate: 181, average_watts: 389, pr_rank: 2, achievement_count: 1, segment_id: 202, segment_average_grade: 0.1, segment_max_grade: 0.7, segment_elevation_high_m: 5.1, segment_elevation_low_m: 4.8, segment_start_latlng: [], segment_end_latlng: [] },
        ],
    laps: isRide
      ? [
          { lap_index: 1, name: "Warm up", distance_m: 9200, elapsed_time_seconds: 1080, moving_time_seconds: 1040, average_speed_m_s: 8.84, average_heartrate: 136, max_heartrate: 148, average_watts: 182, start_date: "2026-03-09T17:45:00Z" },
          { lap_index: 2, name: "3x8' over-under", distance_m: 13800, elapsed_time_seconds: 1440, moving_time_seconds: 1440, average_speed_m_s: 9.58, average_heartrate: 162, max_heartrate: 176, average_watts: 296, start_date: "2026-03-09T18:03:00Z" },
          { lap_index: 3, name: "Recovery valley", distance_m: 4200, elapsed_time_seconds: 600, moving_time_seconds: 560, average_speed_m_s: 7.5, average_heartrate: 144, max_heartrate: 151, average_watts: 156, start_date: "2026-03-09T18:27:00Z" },
          { lap_index: 4, name: "Tempo finish", distance_m: 9000, elapsed_time_seconds: 900, moving_time_seconds: 900, average_speed_m_s: 10, average_heartrate: 165, max_heartrate: 178, average_watts: 284, start_date: "2026-03-09T18:37:00Z" },
          { lap_index: 5, name: "Cool down", distance_m: 4000, elapsed_time_seconds: 700, moving_time_seconds: 520, average_speed_m_s: 7.7, average_heartrate: 132, max_heartrate: 140, average_watts: 141, start_date: "2026-03-09T18:52:00Z" },
        ]
      : [
          { lap_index: 1, name: "Warm up", distance_m: 2620, elapsed_time_seconds: 910, moving_time_seconds: 860, average_speed_m_s: 3.04, average_heartrate: 139, max_heartrate: 149, average_watts: 262, start_date: "2026-03-09T17:45:00Z" },
          { lap_index: 2, name: "Drills", distance_m: 640, elapsed_time_seconds: 240, moving_time_seconds: 210, average_speed_m_s: 3.05, average_heartrate: 144, max_heartrate: 153, average_watts: 274, start_date: "2026-03-09T18:00:00Z" },
          { lap_index: 3, name: "Rep 1", distance_m: 400, elapsed_time_seconds: 89, moving_time_seconds: 89, average_speed_m_s: 4.49, average_heartrate: 170, max_heartrate: 180, average_watts: 394, start_date: "2026-03-09T18:05:00Z" },
          { lap_index: 4, name: "Recovery 1", distance_m: 215, elapsed_time_seconds: 75, moving_time_seconds: 75, average_speed_m_s: 2.86, average_heartrate: 161, max_heartrate: 171, average_watts: 272, start_date: "2026-03-09T18:06:40Z" },
          { lap_index: 5, name: "Rep 2", distance_m: 400, elapsed_time_seconds: 88, moving_time_seconds: 88, average_speed_m_s: 4.54, average_heartrate: 174, max_heartrate: 183, average_watts: 401, start_date: "2026-03-09T18:08:00Z" },
          { lap_index: 6, name: "Recovery 2", distance_m: 218, elapsed_time_seconds: 76, moving_time_seconds: 76, average_speed_m_s: 2.87, average_heartrate: 162, max_heartrate: 172, average_watts: 274, start_date: "2026-03-09T18:09:40Z" },
          { lap_index: 7, name: "Rep 3", distance_m: 400, elapsed_time_seconds: 87, moving_time_seconds: 87, average_speed_m_s: 4.59, average_heartrate: 176, max_heartrate: 185, average_watts: 408, start_date: "2026-03-09T18:11:00Z" },
          { lap_index: 8, name: "Recovery 3", distance_m: 220, elapsed_time_seconds: 76, moving_time_seconds: 76, average_speed_m_s: 2.89, average_heartrate: 163, max_heartrate: 172, average_watts: 276, start_date: "2026-03-09T18:12:40Z" },
          { lap_index: 9, name: "Rep 4", distance_m: 400, elapsed_time_seconds: 86, moving_time_seconds: 86, average_speed_m_s: 4.65, average_heartrate: 178, max_heartrate: 186, average_watts: 414, start_date: "2026-03-09T18:14:00Z" },
          { lap_index: 10, name: "Recovery 4", distance_m: 221, elapsed_time_seconds: 77, moving_time_seconds: 77, average_speed_m_s: 2.87, average_heartrate: 163, max_heartrate: 173, average_watts: 275, start_date: "2026-03-09T18:15:40Z" },
          { lap_index: 11, name: "Rep 5", distance_m: 400, elapsed_time_seconds: 87, moving_time_seconds: 87, average_speed_m_s: 4.6, average_heartrate: 179, max_heartrate: 187, average_watts: 410, start_date: "2026-03-09T18:17:00Z" },
          { lap_index: 12, name: "Recovery 5", distance_m: 222, elapsed_time_seconds: 76, moving_time_seconds: 76, average_speed_m_s: 2.92, average_heartrate: 164, max_heartrate: 173, average_watts: 277, start_date: "2026-03-09T18:18:40Z" },
          { lap_index: 13, name: "Rep 6", distance_m: 400, elapsed_time_seconds: 88, moving_time_seconds: 88, average_speed_m_s: 4.54, average_heartrate: 180, max_heartrate: 188, average_watts: 405, start_date: "2026-03-09T18:20:00Z" },
          { lap_index: 14, name: "Recovery 6", distance_m: 224, elapsed_time_seconds: 77, moving_time_seconds: 77, average_speed_m_s: 2.91, average_heartrate: 165, max_heartrate: 174, average_watts: 278, start_date: "2026-03-09T18:21:40Z" },
          { lap_index: 15, name: "Rep 7", distance_m: 400, elapsed_time_seconds: 87, moving_time_seconds: 87, average_speed_m_s: 4.59, average_heartrate: 181, max_heartrate: 188, average_watts: 409, start_date: "2026-03-09T18:23:00Z" },
          { lap_index: 16, name: "Recovery 7", distance_m: 225, elapsed_time_seconds: 77, moving_time_seconds: 77, average_speed_m_s: 2.92, average_heartrate: 165, max_heartrate: 175, average_watts: 280, start_date: "2026-03-09T18:24:40Z" },
          { lap_index: 17, name: "Rep 8", distance_m: 400, elapsed_time_seconds: 86, moving_time_seconds: 86, average_speed_m_s: 4.65, average_heartrate: 182, max_heartrate: 188, average_watts: 414, start_date: "2026-03-09T18:26:00Z" },
          { lap_index: 18, name: "Cool down", distance_m: 3580, elapsed_time_seconds: 803, moving_time_seconds: 704, average_speed_m_s: 3.12, average_heartrate: 149, max_heartrate: 161, average_watts: 284, start_date: "2026-03-09T18:28:00Z" },
        ],
    zones: [
      {
        type: isRide ? "power" : "heartrate",
        score: 84,
        sensor_based: true,
        points: 41,
        buckets: [
          { min_value: 0, max_value: isRide ? 180 : 138, time_seconds: isRide ? 960 : 780 },
          { min_value: isRide ? 180 : 138, max_value: isRide ? 240 : 155, time_seconds: isRide ? 1320 : 1040 },
          { min_value: isRide ? 240 : 155, max_value: isRide ? 300 : 172, time_seconds: isRide ? 1580 : 920 },
          { min_value: isRide ? 300 : 172, max_value: isRide ? 999 : 200, time_seconds: isRide ? 600 : 585 },
        ],
      },
    ],
    streams: {
      heartrate: { original_size: 12, resolution: "medium", series_type: "time", data: [138, 144, 152, 160, 171, 176, 179, 181, 183, 176, 161, 149] },
      cadence: { original_size: 12, resolution: "medium", series_type: "time", data: isRide ? [88, 90, 92, 89, 91, 93, 90, 89, 91, 88, 86, 84] : [82, 84, 86, 88, 90, 91, 92, 92, 91, 88, 85, 83] },
      watts: { original_size: 12, resolution: "medium", series_type: "time", data: isRide ? [162, 188, 214, 248, 292, 304, 318, 301, 284, 236, 198, 154] : [262, 274, 301, 338, 382, 401, 409, 414, 407, 332, 296, 284] },
      velocity_smooth: { original_size: 12, resolution: "medium", series_type: "distance", data: isRide ? [7.4, 8.2, 8.8, 9.4, 9.9, 10.2, 9.8, 9.6, 9.3, 8.4, 7.8, 7.2] : [2.9, 3.1, 3.4, 3.7, 4.4, 4.6, 4.5, 4.6, 4.5, 3.8, 3.2, 3.0] },
    },
    raw_detail: {
      source: "local_demo",
      athlete_name: athleteName,
      note: "Actividad demo local para trabajar la vista visual de sesiones antes de importar desde Strava.",
    },
    enrichment_error: null,
    enrichment_notice: "Actividad demo local: sirve para ajustar la visual mientras trabajas en localhost. Se reemplaza al importar actividades reales.",
  });
}

function buildDemoImportResult(athlete?: Athlete | null): StravaActivitiesImportResponse | null {
  if (!athlete) return null;
  return {
    athlete_id: athlete.id,
    athlete_name: athlete.name,
    start_date: "2026-03-01",
    end_date: "2026-03-10",
    imported_count: 1,
    activities: [buildDemoActivity(athlete)],
  };
}

export function StravaInformationPage({ token, athletes }: StravaInformationPageProps) {
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(athletes[0]?.id ?? null);
  const [startDate, setStartDate] = useState(() => isoDateOffset(-14));
  const [endDate, setEndDate] = useState(() => isoDateOffset(0));
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<StravaActivitiesImportResponse | null>(null);
  const [modalActivityId, setModalActivityId] = useState<number | null>(null);
  const [athleteAnalysis, setAthleteAnalysis] = useState<AthleteAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("metric");

  useEffect(() => {
    if (!athletes.length) {
      setSelectedAthleteId(null);
      return;
    }
    setSelectedAthleteId((current) => (current && athletes.some((athlete) => athlete.id === current) ? current : athletes[0].id));
  }, [athletes]);

  useEffect(() => {
    setImportError(null);
    setImportResult(null);
    setModalActivityId(null);
  }, [selectedAthleteId]);

  useEffect(() => {
    let cancelled = false;
    if (selectedAthleteId == null) {
      setAthleteAnalysis(null);
      return undefined;
    }
    const athleteId = selectedAthleteId;

    async function loadAnalysis() {
      setAnalysisLoading(true);
      setAnalysisError(null);
      try {
        const payload = (await api.athleteAnalysis(token, athleteId)) as AthleteAnalysis;
        if (!cancelled) setAthleteAnalysis(payload);
      } catch (error) {
        if (!cancelled) {
          setAthleteAnalysis(null);
          setAnalysisError(error instanceof Error ? error.message : "No se pudo cargar el análisis del atleta.");
        }
      } finally {
        if (!cancelled) setAnalysisLoading(false);
      }
    }

    void loadAnalysis();
    return () => {
      cancelled = true;
    };
  }, [selectedAthleteId, token]);

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === selectedAthleteId) ?? null,
    [athletes, selectedAthleteId],
  );

  const demoImportResult = useMemo(() => buildDemoImportResult(selectedAthlete), [selectedAthlete]);
  const activeImportResult = importResult ?? demoImportResult;
  const usingDemoData = !importResult && Boolean(demoImportResult);

  const activityCoachSummaries = useMemo(() => {
    const map = new Map<number, ActivityCoachSummary>();
    (activeImportResult?.activities ?? []).forEach((activity) => {
      map.set(activity.provider_activity_id, buildActivityCoachSummary(activity, athleteAnalysis, selectedAthlete));
    });
    return map;
  }, [activeImportResult, athleteAnalysis, selectedAthlete]);

  const selectedActivity = useMemo(
    () => activeImportResult?.activities.find((activity) => activity.provider_activity_id === modalActivityId) ?? null,
    [activeImportResult, modalActivityId],
  );

  const selectedActivityCoachSummary = useMemo(
    () => (selectedActivity ? activityCoachSummaries.get(selectedActivity.provider_activity_id) ?? null : null),
    [activityCoachSummaries, selectedActivity],
  );

  const selectedActivityJson = useMemo(
    () => (selectedActivity ? JSON.stringify(selectedActivity, null, 2) : null),
    [selectedActivity],
  );

  const selectedChartData = useMemo(
    () => (selectedActivityCoachSummary ? buildSessionChartData(selectedActivityCoachSummary) : []),
    [selectedActivityCoachSummary],
  );

  const selectedChartModes = useMemo(
    () => (selectedActivityCoachSummary ? availableChartModes(selectedActivityCoachSummary) : []),
    [selectedActivityCoachSummary],
  );

  const importSummary = useMemo(() => {
    if (!activeImportResult) return [];
    const activities = activeImportResult.activities;
    const withPower = activities.filter((activity) => typeof activity.average_watts === "number").length;
    const coachReady = activities.filter((activity) => activityCoachSummaries.get(activity.provider_activity_id)?.hasCoachContext).length;
    const structured = activities.filter((activity) => (activityCoachSummaries.get(activity.provider_activity_id)?.phaseSummaries.main.durationSeconds ?? 0) > 0).length;
    const withStreams = activities.filter((activity) => Object.keys(activity.streams ?? {}).length > 0).length;
    return [
      { label: "Actividades", value: String(activities.length), detail: `${activeImportResult.start_date} a ${activeImportResult.end_date}` },
      { label: "Coach-ready", value: `${coachReady}/${activities.length}`, detail: "Con ancla LT1/LT2 usable" },
      { label: "Bloque principal", value: `${structured}/${activities.length}`, detail: "Lectura por laps disponible" },
      { label: "Potencia/streams", value: `${withPower}/${withStreams}`, detail: "Señal externa y profundidad" },
    ];
  }, [activeImportResult, activityCoachSummaries]);

  const primaryDisciplineView = useMemo(() => {
    if (!selectedAthlete || !athleteAnalysis) return null;
    return athleteAnalysis.discipline_views?.[selectedAthlete.primary_discipline] ?? null;
  }, [athleteAnalysis, selectedAthlete]);

  const primaryDisciplineLt1 = useMemo(
    () => resolveTrainingThreshold(primaryDisciplineView, "LT1"),
    [primaryDisciplineView],
  );
  const primaryDisciplineLt2 = useMemo(
    () => resolveTrainingThreshold(primaryDisciplineView, "LT2"),
    [primaryDisciplineView],
  );
  const primaryDisciplineThresholdNote = useMemo(
    () => buildThresholdNote(primaryDisciplineLt1, primaryDisciplineLt2, selectedAthlete?.primary_discipline),
    [primaryDisciplineLt1, primaryDisciplineLt2, selectedAthlete?.primary_discipline],
  );

  useEffect(() => {
    if (!selectedActivityCoachSummary) return;
    const modes = availableChartModes(selectedActivityCoachSummary);
    if (!modes.includes(chartMode)) {
      setChartMode(modes[0] ?? "heartRate");
    }
  }, [selectedActivityCoachSummary, chartMode]);

  async function handleImport() {
    if (!selectedAthleteId) return;
    setImporting(true);
    setImportError(null);
    try {
      const payload = (await api.stravaActivities(token, selectedAthleteId, startDate, endDate)) as StravaActivitiesImportResponse;
      const normalizedPayload: StravaActivitiesImportResponse = {
        ...payload,
        activities: Array.isArray(payload.activities) ? payload.activities.map((activity) => normalizeActivity(activity as StravaActivity)) : [],
      };
      setImportResult(normalizedPayload);
      setModalActivityId(null);
    } catch (error) {
      setImportResult(null);
      setModalActivityId(null);
      setImportError(error instanceof Error ? error.message : "No se pudieron cargar las actividades de Strava.");
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    if (!selectedActivity) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModalActivityId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedActivity]);

  return (
    <div className="page-grid">
      <section className="hero">
        <div className="hero-main">
          <span className="eyebrow">Coach view</span>
          <h1>Strava Information</h1>
          <p>
            Carga actividades completas del atleta, revisa su lectura por bloques y entra al detalle con laps, tiempo estimado respecto a LT1/LT2, gráfico visual y datos crudos.
          </p>
        </div>
      </section>

      <section className="card section-card">
        <div className="section-heading compact">
          <span className="eyebrow">Atleta</span>
          <h2 className="section-title">Selecciona qué perfil quieres revisar</h2>
        </div>
        {athletes.length ? (
          <div className="library-toolbar-main">
            <label className="library-search-shell">
              <span className="library-search-label">Atleta</span>
              <select
                className="library-search"
                value={selectedAthleteId ?? ""}
                onChange={(event) => setSelectedAthleteId(event.target.value ? Number(event.target.value) : null)}
              >
                {athletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.name} · {disciplineLabel(athlete.primary_discipline)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p>No hay atletas disponibles todavía.</p>
        )}
      </section>

      <section className="card section-card">
        <div className="section-heading compact">
          <span className="eyebrow">Vista actual</span>
          <h2 className="section-title">{selectedAthlete ? selectedAthlete.name : "Sin atleta seleccionado"}</h2>
        </div>
        {selectedAthlete ? (
          <>
            <div className="strava-current-shell">
              <div className="strava-current-panel">
                <span className="eyebrow">Perfil</span>
                <strong>{selectedAthlete.name}</strong>
                <p>
                  {disciplineLabel(selectedAthlete.primary_discipline)} · usa la lectura del sistema para comparar cada entreno con LT1/LT2 y con el foco activo del bloque.
                </p>
              </div>
              <div className="strava-current-overview">
                <div className="strava-current-metric">
                  <span>Estado de Strava</span>
                  <strong>{selectedAthlete.strava_connected ? "Conectado" : "Pendiente"}</strong>
                </div>
                <div className="strava-current-metric">
                  <span>Strava athlete id</span>
                  <strong>{selectedAthlete.strava_athlete_id ?? "n/d"}</strong>
                </div>
                <div className="strava-current-metric">
                  <span>Foco activo</span>
                  <strong>{athleteAnalysis?.active_focus_block?.block_objective ?? "Sin bloque activo"}</strong>
                </div>
                <div className="strava-current-metric">
                  <span>Umbrales activos</span>
                  <strong>{primaryDisciplineThresholdNote.note}</strong>
                </div>
              </div>
            </div>
            {analysisLoading ? <p className="strava-inline-note">Cargando análisis fisiológico del atleta...</p> : null}
            {analysisError ? <p className="error">{analysisError}</p> : null}
          </>
        ) : (
          <p>Selecciona un atleta para empezar a construir esta vista.</p>
        )}
      </section>

      <section className="card section-card">
        <div className="section-heading compact">
          <span className="eyebrow">Importación manual</span>
          <h2 className="section-title">Carga actividades completas</h2>
        </div>
        <div className="session-debug-list">
          <div>
            <strong>Rango de fechas</strong>
            <div className="strava-import-grid">
              <label className="library-search-shell">
                <span className="library-search-label">Desde</span>
                <input className="library-search" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="library-search-shell">
                <span className="library-search-label">Hasta</span>
                <input className="library-search" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
              <div className="strava-import-action">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleImport}
                  disabled={!selectedAthleteId || !selectedAthlete?.strava_connected || importing || endDate < startDate}
                >
                  {importing ? "Cargando detalle..." : "Cargar actividades"}
                </button>
              </div>
            </div>
            {!selectedAthlete?.strava_connected ? <span>Este atleta todavía no tiene Strava conectado desde su portal.</span> : null}
            {endDate < startDate ? <span>La fecha final debe ser igual o posterior a la inicial.</span> : null}
            {usingDemoData ? <span>Mientras no importes, se muestra una actividad demo local para trabajar la visual.</span> : null}
          </div>
        </div>
        {importError ? <p className="error">{importError}</p> : null}
      </section>

      {importSummary.length ? (
        <section className="strava-summary-strip">
          {importSummary.map((item) => (
            <article key={item.label} className="strava-summary-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </article>
          ))}
        </section>
      ) : null}

      <section className="card section-card">
        <div className="section-heading compact">
          <span className="eyebrow">Actividades</span>
          <h2 className="section-title">Vista visual de sesiones</h2>
        </div>
        {activeImportResult ? (
          activeImportResult.activities.length ? (
            <div className="strava-activity-grid">
              {activeImportResult.activities.map((activity) => {
                const isSelected = selectedActivity?.provider_activity_id === activity.provider_activity_id;
                const availability = activityAvailability(activity);
                const dataScore = activityDataScore(activity);
                const longLap = longestLap(activity);
                const coachSummary = activityCoachSummaries.get(activity.provider_activity_id);
                return (
                  <button
                    key={activity.provider_activity_id}
                    type="button"
                    className={`strava-activity-card${isSelected ? " selected" : ""}`}
                    onClick={() => setModalActivityId(activity.provider_activity_id)}
                  >
                    <div className="strava-activity-card-head">
                      <div className="strava-activity-card-topline">
                        <span className={`strava-sport-pill ${sportToneClass(activity.sport_type)}`}>{sportLabel(activity.sport_type)}</span>
                        <span className={`strava-data-pill ${dataScore.tone}`}>{dataScore.label}</span>
                        {activity.provider_activity_id === DEMO_ACTIVITY_ID ? <span className="strava-subtle-pill">Demo local</span> : null}
                      </div>
                      <strong>{formatDateTime(activity.started_at)}</strong>
                    </div>

                    <div className="strava-activity-title-block">
                      <h3>{activity.name}</h3>
                      <p>{activitySummary(activity)}</p>
                    </div>

                    <div className="strava-activity-kpi-grid">
                      <div>
                        <span>Duración</span>
                        <strong>{formatDuration(activity.moving_time_seconds)}</strong>
                      </div>
                      <div>
                        <span>Distancia</span>
                        <strong>{formatDistance(activity.distance_m)}</strong>
                      </div>
                      <div>
                        <span>Ritmo/velocidad</span>
                        <strong>{formatMovementMetric(activity.average_speed_m_s, activity.sport_type)}</strong>
                      </div>
                      <div>
                        <span>FC / Potencia</span>
                        <strong>
                          {activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : "n/d"}
                          {activity.average_watts ? ` · ${Math.round(activity.average_watts)} W` : ""}
                        </strong>
                      </div>
                    </div>

                    <div className="strava-activity-structure-grid">
                      <div className="strava-activity-structure-card">
                        <span>Estructura</span>
                        <strong>{activity.laps.length ? `${activity.laps.length} laps` : "Sin laps"}</strong>
                        <small>{longLap ? `Bloque largo: ${formatDuration(longLap.moving_time_seconds)}` : "Sin bloques segmentados."}</small>
                      </div>
                      <div className="strava-activity-structure-card">
                        <span>Lectura coach</span>
                        <strong>{coachSummary?.phaseSummaries.main.durationSeconds ? formatDuration(coachSummary.phaseSummaries.main.durationSeconds) : "Sin bloque"}</strong>
                        <small>{coachSummary?.thresholdNote ?? "Sin ancla LT1/LT2."}</small>
                      </div>
                    </div>

                    {coachSummary ? (
                      <div className="strava-activity-coach-grid">
                        <div className="strava-activity-coach-card">
                          <span>LT2 {actualMetricLabel(coachSummary)}</span>
                          <strong>{coachSummary.thresholdUsage.external.available ? formatDuration(coachSummary.thresholdUsage.external.lt2TimeSeconds) : "n/d"}</strong>
                          <small>{formatThresholdLoad(coachSummary.lt2, activity.sport_type, coachSummary.externalMetricKind)}</small>
                        </div>
                        <div className="strava-activity-coach-card">
                          <span>LT2 FC</span>
                          <strong>{coachSummary.thresholdUsage.heartRate.available ? formatDuration(coachSummary.thresholdUsage.heartRate.lt2TimeSeconds) : "n/d"}</strong>
                          <small>{coachSummary.lt2?.heartRate != null ? `${Math.round(coachSummary.lt2.heartRate)} bpm` : "Sin LT2 FC"}</small>
                        </div>
                      </div>
                    ) : null}

                    <div className="strava-activity-phase-strip">
                      {coachSummary ? (
                        ["warmup", "main", "cooldown"].map((phaseKey) => {
                          const phase = phaseKey as ActivityPhase;
                          const summary = coachSummary.phaseSummaries[phase];
                          const totalTime = Math.max(activity.moving_time_seconds, 1);
                          return (
                            <div key={phaseKey} className={`strava-activity-phase-segment ${phaseKey}`} style={{ width: `${(summary.durationSeconds / totalTime) * 100}%` }}>
                              <span>{phaseLabel(phase)}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="strava-activity-phase-segment main" style={{ width: "100%" }}>
                          <span>Sin lectura de fases</span>
                        </div>
                      )}
                    </div>

                    <div className="strava-activity-card-flags">
                      {activity.trainer ? <span>Indoor</span> : null}
                      {coachSummary?.phaseSummaries.main.segmentCount ? <span>{coachSummary.phaseSummaries.main.segmentCount} laps principales</span> : null}
                      {activity.best_efforts.length ? <span>{activity.best_efforts.length} best efforts</span> : null}
                    </div>

                    {availability ? <p className={`strava-activity-note ${availability.tone}`}>{availability.text}</p> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="strava-preview-empty">
              <span className="eyebrow">Vista previa</span>
              <p>No se encontraron actividades en ese rango de fechas.</p>
            </div>
          )
        ) : (
          <div className="strava-preview-empty">
            <span className="eyebrow">Vista previa</span>
            <p>Todavía no hay datos visibles para este atleta.</p>
          </div>
        )}
      </section>

      {selectedActivity && selectedActivityCoachSummary ? (
        <div className="target-modal-backdrop" onClick={() => setModalActivityId(null)}>
          <section className="card target-modal-card library-workout-modal strava-activity-modal" onClick={(event) => event.stopPropagation()}>
            <div className="library-workout-modal-head">
              <div className="library-workout-title-wrap">
                <span className="eyebrow">Detalle de sesión</span>
                <h2>{selectedActivity.name}</h2>
                <p>{formatDateTime(selectedActivity.started_at)} · {sportLabel(selectedActivity.sport_type)}</p>
              </div>
              <div className="library-workout-head-actions">
                <span className="library-preview-source example">Strava activity</span>
                <button type="button" className="ghost-button library-workout-close" onClick={() => setModalActivityId(null)}>
                  Cerrar
                </button>
              </div>
            </div>

            <div className="strava-detail-hero-shell">
              <div className="strava-detail-hero-main">
                <div className="strava-detail-hero-topline">
                  <span className={`strava-sport-pill ${sportToneClass(selectedActivity.sport_type)}`}>{sportLabel(selectedActivity.sport_type)}</span>
                  <span className={`strava-data-pill ${activityDataScore(selectedActivity).tone}`}>{activityDataScore(selectedActivity).label}</span>
                  <span className="strava-subtle-pill">{formatDateLabel(selectedActivity.started_at)}</span>
                </div>
                <h3>{selectedActivityCoachSummary.thresholdNote}</h3>
                <p className="strava-detail-hero-copy">
                  {selectedActivityCoachSummary.thresholdSubnote}
                  {selectedActivity.description ? ` ${selectedActivity.description}` : ""}
                </p>
                <div className="strava-detail-tag-list">
                  <span>{selectedActivityCoachSummary.disciplineLabel}</span>
                  <span>{selectedActivity.trainer ? "Indoor" : "Outdoor / mixto"}</span>
                  <span>{selectedActivity.device_name ?? "Dispositivo no identificado"}</span>
                  <span>{selectedActivityCoachSummary.segments.length} bloques visibles</span>
                  <span>{selectedActivity.best_efforts.length} best efforts</span>
                </div>
              </div>

              <div className="strava-detail-hero-side">
                <div>
                  <span>Distancia</span>
                  <strong>{formatDistance(selectedActivity.distance_m)}</strong>
                </div>
                <div>
                  <span>Duración útil</span>
                  <strong>{formatDuration(selectedActivity.moving_time_seconds)}</strong>
                </div>
                <div>
                  <span>Ritmo / velocidad</span>
                  <strong>{formatMovementMetric(selectedActivity.average_speed_m_s, selectedActivity.sport_type)}</strong>
                </div>
                <div>
                  <span>FC / Potencia</span>
                  <strong>
                    {selectedActivity.average_heartrate ? `${Math.round(selectedActivity.average_heartrate)} bpm` : "n/d"}
                    {selectedActivity.average_watts ? ` · ${Math.round(selectedActivity.average_watts)} W` : ""}
                  </strong>
                </div>
              </div>
            </div>

            {activityAvailability(selectedActivity) ? (
              <div className={`strava-detail-note ${activityAvailability(selectedActivity)?.tone}`}>
                <span className="eyebrow">Disponibilidad Strava</span>
                <p>{activityAvailability(selectedActivity)?.text}</p>
              </div>
            ) : null}

            <div className="strava-coach-shell compact">
              <div className="strava-detail-panel">
                <div className="strava-preview-header">
                  <div>
                    <span className="eyebrow">Umbrales activos</span>
                    <h3>LT1 / LT2 FC y {actualMetricLabel(selectedActivityCoachSummary)}</h3>
                  </div>
                  <strong>{selectedActivityCoachSummary.disciplineLabel}</strong>
                </div>
                <div className="strava-threshold-reference-grid expanded">
                  <article className="strava-threshold-reference-card">
                    <span>LT1 {actualMetricLabel(selectedActivityCoachSummary)}</span>
                    <strong>{formatThresholdLoad(selectedActivityCoachSummary.lt1, selectedActivity.sport_type, selectedActivityCoachSummary.externalMetricKind)}</strong>
                    <small>{selectedActivityCoachSummary.lt1?.sourceLabel ?? "Sin referencia visible"}</small>
                    <p>Tiempo entre LT1 y LT2: {selectedActivityCoachSummary.thresholdUsage.external.available ? formatDuration(selectedActivityCoachSummary.thresholdUsage.external.lt1TimeSeconds) : "n/d"}</p>
                  </article>
                  <article className="strava-threshold-reference-card">
                    <span>LT2 {actualMetricLabel(selectedActivityCoachSummary)}</span>
                    <strong>{formatThresholdLoad(selectedActivityCoachSummary.lt2, selectedActivity.sport_type, selectedActivityCoachSummary.externalMetricKind)}</strong>
                    <small>{selectedActivityCoachSummary.lt2?.sourceLabel ?? "Sin referencia visible"}</small>
                    <p>Tiempo en LT2+: {selectedActivityCoachSummary.thresholdUsage.external.available ? formatDuration(selectedActivityCoachSummary.thresholdUsage.external.lt2TimeSeconds) : "n/d"}</p>
                  </article>
                  <article className="strava-threshold-reference-card">
                    <span>LT1 FC</span>
                    <strong>{selectedActivityCoachSummary.lt1?.heartRate != null ? `${Math.round(selectedActivityCoachSummary.lt1.heartRate)} bpm` : "n/d"}</strong>
                    <small>{selectedActivityCoachSummary.lt1?.sourceLabel ?? "Sin referencia visible"}</small>
                    <p>Tiempo entre LT1 y LT2: {selectedActivityCoachSummary.thresholdUsage.heartRate.available ? formatDuration(selectedActivityCoachSummary.thresholdUsage.heartRate.lt1TimeSeconds) : "n/d"}</p>
                  </article>
                  <article className="strava-threshold-reference-card">
                    <span>LT2 FC</span>
                    <strong>{selectedActivityCoachSummary.lt2?.heartRate != null ? `${Math.round(selectedActivityCoachSummary.lt2.heartRate)} bpm` : "n/d"}</strong>
                    <small>{selectedActivityCoachSummary.lt2?.sourceLabel ?? "Sin referencia visible"}</small>
                    <p>Tiempo en LT2+: {selectedActivityCoachSummary.thresholdUsage.heartRate.available ? formatDuration(selectedActivityCoachSummary.thresholdUsage.heartRate.lt2TimeSeconds) : "n/d"}</p>
                  </article>
                </div>
                <div className="strava-insight-list compact">
                  {selectedActivityCoachSummary.insights.map((insight) => (
                    <p key={insight}>{insight}</p>
                  ))}
                </div>
              </div>

              <div className="strava-detail-panel">
                <div className="strava-preview-header">
                  <div>
                    <span className="eyebrow">Lectura coach</span>
                    <h3>Resumen rápido de la sesión</h3>
                  </div>
                  <strong>{formatDuration(selectedActivityCoachSummary.phaseSummaries.main.durationSeconds)}</strong>
                </div>
                <div className="strava-coach-summary-grid compact">
                  <div className="strava-depth-card">
                    <span>Bloque principal</span>
                    <strong>{selectedActivityCoachSummary.phaseSummaries.main.segmentCount} laps</strong>
                    <small>{formatCompactDistance(selectedActivityCoachSummary.phaseSummaries.main.distanceM)} · {formatPhasePrimaryMetric(selectedActivityCoachSummary.phaseSummaries.main, selectedActivity.sport_type, selectedActivityCoachSummary.externalMetricKind)}</small>
                  </div>
                  <div className="strava-depth-card">
                    <span>LT2 {actualMetricLabel(selectedActivityCoachSummary)}</span>
                    <strong>{selectedActivityCoachSummary.thresholdUsage.external.available ? formatDuration(selectedActivityCoachSummary.thresholdUsage.external.lt2TimeSeconds) : "n/d"}</strong>
                    <small>Tiempo por carga principal</small>
                  </div>
                  <div className="strava-depth-card">
                    <span>LT2 FC</span>
                    <strong>{selectedActivityCoachSummary.thresholdUsage.heartRate.available ? formatDuration(selectedActivityCoachSummary.thresholdUsage.heartRate.lt2TimeSeconds) : "n/d"}</strong>
                    <small>Respuesta cardiaca</small>
                  </div>
                  <div className="strava-depth-card">
                    <span>Foco activo</span>
                    <strong>{athleteAnalysis?.active_focus_block?.block_objective ?? "Sin foco"}</strong>
                    <small>{selectedActivityCoachSummary.focusAlignment?.label ?? "Sin lectura de alineación"}</small>
                  </div>
                </div>
                {selectedActivityCoachSummary.focusAlignment ? (
                  <p className={`strava-inline-callout ${selectedActivityCoachSummary.focusAlignment.tone}`}>
                    {selectedActivityCoachSummary.focusAlignment.label}: {selectedActivityCoachSummary.focusAlignment.detail}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="strava-detail-panel">
              <div className="strava-preview-header">
                <div>
                  <span className="eyebrow">Curva de sesión</span>
                  <h3>Tiempo en X y lectura del entreno en Y</h3>
                </div>
                <strong>{chartModeLabel(chartMode, selectedActivityCoachSummary)}</strong>
              </div>
              {selectedChartModes.length ? (
                <>
                  <div className="strava-chart-mode-switch">
                    {selectedChartModes.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`strava-chart-mode-button${chartMode === mode ? " active" : ""}`}
                        onClick={() => setChartMode(mode)}
                      >
                        {chartModeLabel(mode, selectedActivityCoachSummary)}
                      </button>
                    ))}
                  </div>
                  <div className="strava-chart-shell elevated">
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={selectedChartData}>
                        <CartesianGrid stroke="rgba(22, 53, 61, 0.08)" vertical={false} />
                        <XAxis
                          type="number"
                          dataKey="elapsedSeconds"
                          domain={[0, "dataMax"]}
                          tickFormatter={(value) => formatDurationShort(Number(value))}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          type="number"
                          dataKey={chartDataKey(chartMode)}
                          domain={chartDomain(selectedChartData, selectedActivityCoachSummary, chartMode)}
                          tickFormatter={(value) => chartValueFormatter(Number(value), selectedActivityCoachSummary, chartMode, selectedActivity.sport_type)}
                          tickLine={false}
                          axisLine={false}
                          reversed={isChartModeReversed(selectedActivityCoachSummary, chartMode)}
                          width={76}
                        />
                        {referenceLineValues(selectedActivityCoachSummary, chartMode).map((line) => (
                          <ReferenceLine key={`${chartMode}-${line.label}`} y={line.value} stroke={line.stroke} strokeDasharray="4 4" />
                        ))}
                        <Tooltip content={(props) => renderChartTooltip(props as ChartTooltipProps, selectedActivityCoachSummary, chartMode, selectedActivity.sport_type)} />
                        <Line
                          type="monotone"
                          dataKey={chartDataKey(chartMode)}
                          stroke="#16353d"
                          strokeWidth={2.6}
                          connectNulls
                          dot={{ r: 4, fill: "#d26a36", stroke: "#ffffff", strokeWidth: 2 }}
                          activeDot={{ r: 6, fill: "#d26a36", stroke: "#fff", strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="strava-session-timeline-legend minimal">
                    <span><i className="warmup" />Calentamiento</span>
                    <span><i className="main" />Bloque principal</span>
                    <span><i className="cooldown" />Enfriamiento</span>
                  </div>
                </>
              ) : (
                <p className="strava-inline-note">No hay señal suficiente para graficar esta sesión con las referencias actuales.</p>
              )}
            </div>

            <div className="strava-detail-panel">
              <div className="strava-preview-header">
                <div>
                  <span className="eyebrow">Laps estructurados</span>
                  <h3>Calentamiento, bloque principal y enfriamiento</h3>
                </div>
                <strong>{selectedActivityCoachSummary.segments.length} laps</strong>
              </div>
              <div className="strava-phase-layout">
                {(["warmup", "main", "cooldown"] as ActivityPhase[]).map((phase) => {
                  const summary = selectedActivityCoachSummary.phaseSummaries[phase];
                  const phaseSegments = selectedActivityCoachSummary.segments.filter((segment) => segment.phase === phase);
                  return (
                    <article key={phase} className={`strava-phase-panel ${phase}`}>
                      <div className="strava-phase-panel-head">
                        <div>
                          <span className={`strava-phase-pill ${phase}`}>{phaseLabel(phase)}</span>
                          <strong>{formatDuration(summary.durationSeconds)}</strong>
                        </div>
                        <small>{summary.segmentCount ? `${summary.segmentCount} laps · ${formatCompactDistance(summary.distanceM)}` : "Sin bloque detectado"}</small>
                      </div>
                      <div className="strava-phase-panel-meta">
                        <span>{actualMetricLabel(selectedActivityCoachSummary)}: {formatPhasePrimaryMetric(summary, selectedActivity.sport_type, selectedActivityCoachSummary.externalMetricKind)}</span>
                        <span>FC: {summary.averageHeartrate != null ? `${Math.round(summary.averageHeartrate)} bpm` : "n/d"}</span>
                        <span>LT2 {actualMetricLabel(selectedActivityCoachSummary)}: {formatDuration(summary.externalLt2TimeSeconds)}</span>
                        <span>LT2 FC: {formatDuration(summary.heartRateLt2TimeSeconds)}</span>
                      </div>
                      {phaseSegments.length ? (
                        <div className="strava-phase-lap-grid">
                          {phaseSegments.map((segment) => (
                            <article key={`${selectedActivity.provider_activity_id}-${segment.sequence}`} className="strava-phase-lap-card">
                              <div className="strava-phase-lap-topline">
                                <strong>#{segment.sequence}</strong>
                                <span>{segment.name}</span>
                              </div>
                              <div className="strava-phase-lap-meta">
                                <span>{formatDuration(segment.movingTimeSeconds)}</span>
                                <span>{formatCompactDistance(segment.distanceM)}</span>
                                <span>{segment.externalLoadLabel}</span>
                                <span>{segment.heartRateLabel}</span>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="strava-inline-note">No hay laps visibles en este bloque.</p>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="strava-detail-metrics">
              <div><strong>Duración total</strong><span>{formatDuration(selectedActivity.elapsed_time_seconds)}</span></div>
              <div><strong>FC máx</strong><span>{selectedActivity.max_heartrate ? `${Math.round(selectedActivity.max_heartrate)} bpm` : "n/d"}</span></div>
              <div><strong>Potencia máx</strong><span>{selectedActivity.max_watts ? `${Math.round(selectedActivity.max_watts)} W` : "n/d"}</span></div>
              <div><strong>Elevación</strong><span>{formatNumber(selectedActivity.total_elevation_gain_m, " m", 0)}</span></div>
              <div><strong>Calorías</strong><span>{formatNumber(selectedActivity.calories, "", 0)}</span></div>
              <div><strong>Cadencia media</strong><span>{formatNumber(selectedActivity.average_cadence, "", 1)}</span></div>
              <div><strong>Weighted avg watts</strong><span>{formatNumber(selectedActivity.weighted_average_watts, " W", 0)}</span></div>
              <div><strong>Workout type</strong><span>{selectedActivity.workout_type ?? "n/d"}</span></div>
              <div><strong>Gear id</strong><span>{selectedActivity.gear_id ?? "n/d"}</span></div>
              <div><strong>Inicio</strong><span>{formatLatLng(selectedActivity.start_latlng)}</span></div>
              <div><strong>Final</strong><span>{formatLatLng(selectedActivity.end_latlng)}</span></div>
              <div><strong>Polyline</strong><span>{selectedActivity.map_summary_polyline ? `${selectedActivity.map_summary_polyline.slice(0, 32)}...` : "n/d"}</span></div>
            </div>

            {selectedActivityJson ? (
              <details className="strava-debug-disclosure">
                <summary>Debug JSON crudo</summary>
                <div className="strava-raw-json">
                  <pre>{selectedActivityJson}</pre>
                </div>
              </details>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
