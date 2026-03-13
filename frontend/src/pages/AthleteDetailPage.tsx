import { FormEvent, ReactNode, useEffect, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";

import { CurveChart } from "../components/CurveChart";
import { GeneratePhysiologyReportButton } from "../components/GeneratePhysiologyReportButton";
import { PhysiologyReportPreview } from "../components/PhysiologyReportPreview";
import { api } from "../lib/api";
import { buildTargetObjective, targetCategoryLabel, targetCategoryOptions } from "../lib/targetCatalog";
import { ResolvedTrainingThreshold, resolveTrainingThreshold } from "../lib/trainingThresholds";
import {
  AthleteAnalysis,
  AthleteFocusBlock,
  AthleteFocusBlockEvaluation,
  AthleteTarget,
  DisciplineView,
  DynamicReference,
  DynamicThresholds,
  Estimate,
  HistoricalPoint,
  IndividualThresholds,
  MesocycleRecommendation,
  PhysiologyReport,
  RealThresholds,
  ThresholdDetectionStatus,
  Threshold,
} from "../types";

type PracticalChartReference = {
  label: string;
  value: number;
  color: string;
};

type ThresholdDisplay = {
  name: string;
  lactate?: number | null;
  pace_seconds_per_km?: number | null;
  power_watts?: number | null;
  heart_rate?: number | null;
  power_source?: string | null;
  method: string;
  confidence: number;
  rationale: string;
  evidence_level: string;
  provisional?: boolean;
};

type PlotSupportPoint = {
  sessionDate?: string | null;
  session_date?: string | null;
  heartRate?: number | null;
  heart_rate_avg?: number | null;
  intervalLabel?: string | null;
  interval_label?: string | null;
  powerSource?: string | null;
  power_source?: string | null;
};

type GoalMovementTone = "positive" | "neutral" | "negative";

type GoalMovementFocus = {
  label: string;
  current: string;
  target?: string | null;
  delta?: string | null;
  tone: GoalMovementTone;
  description: string;
};

type GoalScenarioPoint = {
  label: string;
  series: "Actual" | "Objetivo";
  x: number;
  lactate: number;
};

type GoalMovementScenario = {
  title: string;
  description: string;
  xLabel: string;
  reversed: boolean;
  points: GoalScenarioPoint[];
};

type GoalMovementInsight = {
  target: AthleteTarget;
  contextLabel: string;
  targetValue: string;
  currentValue: string;
  gapLabel: string;
  tone: GoalMovementTone;
  summary: string;
  movementHeadline: string;
  focuses: GoalMovementFocus[];
  notes: string[];
  scenario?: GoalMovementScenario | null;
};

type AthleteDetailSectionLink = {
  id: string;
  label: string;
  shortLabel: string;
};

function formatPace(seconds?: number | null) {
  if (!seconds) return "-";
  const safeSeconds = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = (safeSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}/km`;
}

function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatSwimPacePer100m(totalSecondsPer100m?: number | null) {
  if (!totalSecondsPer100m) return "-";
  const mins = Math.floor(totalSecondsPer100m / 60);
  const secs = Math.round(totalSecondsPer100m % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}/100m`;
}

function kmhToPaceSeconds(value?: number | null) {
  if (value === null || value === undefined || value <= 0) return null;
  return 3600 / value;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function formatValue(value?: number | null, unit?: string) {
  if (value === null || value === undefined) return "-";
  if (unit === "s/km") return formatPace(value);
  return `${Math.round(value * 10) / 10} ${unit ?? ""}`.trim();
}

function formatBaselineSource(source?: string | null) {
  if (source === "measured") return "medido";
  if (source === "estimated_recent") return "estimado reciente";
  if (source === "estimated_historical") return "estimado histórico";
  if (source === "fallback_default") return "fallback";
  return source ?? "-";
}

function formatBaselineState(state?: string | null) {
  if (state === "normal") return "en línea";
  if (state === "alto") return "alto";
  if (state === "bajo") return "bajo";
  if (state === "sin_referencia") return "sin referencia";
  return state ?? "-";
}

function mapLegacyRealThresholdsToIndividual(realThresholds?: RealThresholds | null): IndividualThresholds | null {
  if (!realThresholds?.lt1_real && !realThresholds?.lt2_real) return null;
  return {
    lt1_individual: realThresholds.lt1_real
      ? {
          ...realThresholds.lt1_real,
          name: "LT1 Individual",
          protocol_score: realThresholds.data_quality?.protocol_score ?? null,
          signal_score: realThresholds.data_quality?.signal_score ?? null,
        }
      : null,
    lt2_individual: realThresholds.lt2_real
      ? {
          ...realThresholds.lt2_real,
          name: "LT2 Individual",
          protocol_score: realThresholds.data_quality?.protocol_score ?? null,
          signal_score: realThresholds.data_quality?.signal_score ?? null,
        }
      : null,
    data_quality: realThresholds.data_quality
      ? {
          session_count: 1,
          stage_count: realThresholds.data_quality.stage_count,
          monotonicity: realThresholds.data_quality.monotonicity,
          protocol_score: realThresholds.data_quality.protocol_score,
          signal_score: realThresholds.data_quality.signal_score,
          sufficient: realThresholds.data_quality.sufficient,
          reason: realThresholds.data_quality.reason,
        }
      : null,
  };
}

function confidenceToEvidenceLevel(confidence?: number | null) {
  if (confidence === null || confidence === undefined) return "low";
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

function thresholdToDisplay(threshold?: Threshold | null): ThresholdDisplay | undefined {
  if (!threshold) return undefined;
  return {
    name: threshold.name,
    lactate: threshold.lactate ?? null,
    pace_seconds_per_km: threshold.pace_seconds_per_km ?? null,
    power_watts: threshold.power_watts ?? null,
    heart_rate: threshold.heart_rate ?? null,
    power_source: threshold.power_source ?? null,
    method: threshold.method,
    confidence: threshold.confidence,
    rationale: threshold.rationale,
    evidence_level: threshold.evidence_level,
    provisional: false,
  };
}

function dynamicReferenceToDisplay(
  name: string,
  reference?: DynamicReference | null,
  powerSource?: string | null,
): ThresholdDisplay | undefined {
  if (!reference) return undefined;
  return {
    name,
    lactate: reference.target_lactate ?? null,
    pace_seconds_per_km: reference.estimated_pace_seconds_per_km ?? null,
    power_watts: reference.estimated_power_watts ?? null,
    heart_rate: reference.estimated_hr_at_target ?? null,
    power_source: powerSource ?? null,
    method: reference.interpolation_method_used,
    confidence: reference.confidence_score,
    rationale: reference.explanation?.[0] ?? "Referencia dinámica derivada del histórico comparable del atleta.",
    evidence_level: confidenceToEvidenceLevel(reference.confidence_score),
    provisional: false,
  };
}

function dynamicReferencePrimaryValue(reference?: DynamicReference | null, discipline?: string | null) {
  if (!reference) return "-";
  if (discipline === "ciclismo" && reference.estimated_power_watts !== null && reference.estimated_power_watts !== undefined) {
    return `${Math.round(reference.estimated_power_watts)} W`;
  }
  if (reference.estimated_pace_seconds_per_km !== null && reference.estimated_pace_seconds_per_km !== undefined) {
    return formatPace(reference.estimated_pace_seconds_per_km);
  }
  if (reference.estimated_speed_kph !== null && reference.estimated_speed_kph !== undefined) {
    return `${reference.estimated_speed_kph.toFixed(1)} km/h`;
  }
  if (reference.estimated_power_watts !== null && reference.estimated_power_watts !== undefined) {
    return `${Math.round(reference.estimated_power_watts)} W`;
  }
  return "-";
}

function dynamicReferenceSecondaryValue(reference?: DynamicReference | null) {
  if (!reference) return "-";
  const parts = [];
  if (reference.estimated_hr_at_target !== null && reference.estimated_hr_at_target !== undefined) {
    parts.push(`${Math.round(reference.estimated_hr_at_target)} bpm`);
  }
  if (reference.relative_target_from_baseline !== null && reference.relative_target_from_baseline !== undefined) {
    parts.push(`relativo ${reference.relative_target_from_baseline.toFixed(2)} mmol`);
  }
  return parts.join(" · ") || "-";
}

function resolvedThresholdToDisplay(
  threshold?: ResolvedTrainingThreshold | null,
  powerSource?: string | null,
): ThresholdDisplay | undefined {
  if (!threshold) return undefined;
  return {
    name: threshold.label,
    lactate: threshold.lactate ?? null,
    pace_seconds_per_km: threshold.paceSecondsPerKm ?? null,
    power_watts: threshold.powerWatts ?? null,
    heart_rate: threshold.heartRate ?? null,
    power_source: powerSource ?? null,
    method: threshold.method ?? threshold.sourceLabel,
    confidence: threshold.confidence ?? 0,
    rationale: threshold.rationale ?? threshold.sourceLabel,
    evidence_level: threshold.evidenceLevel ?? "low",
    provisional: false,
  };
}

function thresholdDetectionToDisplay(
  detection?: ThresholdDetectionStatus | null,
  powerSource?: string | null,
): ThresholdDisplay | undefined {
  const candidate = detection?.candidate_threshold;
  if (!candidate) return undefined;
  return {
    name: `${detection?.name ?? candidate.name} señal`,
    lactate: candidate.lactate ?? null,
    pace_seconds_per_km: candidate.pace_seconds_per_km ?? null,
    power_watts: candidate.power_watts ?? null,
    heart_rate: candidate.heart_rate ?? null,
    power_source: powerSource ?? null,
    method: candidate.method ?? detection?.primary_method ?? "candidate_detection",
    confidence: candidate.confidence ?? detection?.confidence ?? 0,
    rationale: candidate.rationale ?? detection?.explanation ?? "Señal detectada sobre la curva de lactato.",
    evidence_level: candidate.evidence_level ?? confidenceToEvidenceLevel(candidate.confidence ?? detection?.confidence ?? 0),
    provisional: detection?.state !== "ready_to_anchor",
  };
}

function joinLabels(labels: string[]) {
  if (!labels.length) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

function thresholdDetectionIsConfirmed(state?: string | null) {
  return state === "ready_to_anchor";
}

function thresholdDetectionStateLabel(state?: string | null) {
  if (state === "candidate_weak") return "Señal débil";
  if (state === "candidate_strong") return "Señal fuerte";
  if (state === "confirmed") return "Consenso de sesión";
  if (state === "ready_to_anchor") return "Confirmado";
  return "Sin señal";
}

function thresholdDetectionTone(state?: string | null): "positive" | "neutral" | "negative" {
  if (state === "ready_to_anchor") return "positive";
  if (state === "confirmed") return "neutral";
  if (state === "candidate_strong") return "neutral";
  return "negative";
}

function thresholdDetectionLineDasharray(state?: string | null) {
  if (state === "ready_to_anchor") return "12 4";
  if (state === "confirmed") return "8 5";
  if (state === "candidate_strong") return "4 5";
  return "2 6";
}

function thresholdDetectionUsageMessage(state?: string | null) {
  if (state === "ready_to_anchor") {
    return "Confirmado, válido para cálculos y con respaldo suficiente para anclarlo al histórico.";
  }
  if (state === "confirmed") {
    return "Hay acuerdo entre métodos en esta sesión, pero todavía espera confirmación antes de usarlo para cálculos.";
  }
  if (state === "candidate_strong" || state === "candidate_weak") {
    return "Solo señal por ahora: espera confirmación antes de usarlo como umbral o para cálculos.";
  }
  return "Sin señal visible.";
}

function thresholdDetectionCoachExplanation(detection: ThresholdDetectionStatus | null | undefined) {
  if (!detection) return "Sin señal visible.";
  if (detection.state === "ready_to_anchor") return detection.explanation;
  if (detection.state === "confirmed") {
    return "Hay consenso interno entre métodos dentro de esta sesión, pero todavía falta validación operativa para cerrarlo como umbral.";
  }
  return detection.explanation;
}

function thresholdDetectionTooltip(
  detection: ThresholdDetectionStatus | null | undefined,
  threshold: ThresholdDisplay | undefined,
  discipline: string,
  athleteWeight?: number | null,
  support?: PlotSupportPoint | null,
) {
  if (!detection || !threshold) return "Sin señal visible.";
  const methods = [detection.primary_method, detection.confirmation_method].filter(Boolean).join(" + ");
  const parts = [
    `${thresholdDetectionStateLabel(detection.state)} · confianza ${Math.round((detection.confidence ?? 0) * 100)}%`,
    thresholdDetailLine(threshold, discipline, athleteWeight),
  ];
  if (methods) {
    parts.push(`Métodos ${methods}`);
  }
  if (support?.sessionDate ?? support?.session_date) {
    parts.push(`Fecha ${formatDate(support?.sessionDate ?? support?.session_date ?? null)}`);
  }
  parts.push(thresholdDetectionUsageMessage(detection.state));
  parts.push(thresholdDetectionCoachExplanation(detection));
  return parts.join(" · ");
}

function emptyCurveHistory(): DisciplineView["curve_history"] {
  return {
    pace: [],
    power: [],
  };
}

function emptyHistoricalEvolution(): DisciplineView["historical_evolution"] {
  return {
    LT1: [],
    LT2: [],
    lactate_anchor: [],
    peak_lactate: [],
  };
}

function buildEmptyDisciplineView(discipline: string, powerSource: string | null = null): DisciplineView {
  return {
    discipline,
    power_source: powerSource,
    latest_snapshot_date: null,
    thresholds: [],
    zones: [],
    estimates: [],
    recent_sessions: [],
    curve_history: emptyCurveHistory(),
    historical_evolution: emptyHistoricalEvolution(),
    power_bests: [],
    measurement_log: [],
    dynamic_thresholds: null,
    power_source_views: null,
    real_thresholds: null,
    individual_thresholds: null,
  };
}

function describeDynamicWarning(warning: string) {
  if (warning.includes("Basal no medido")) {
    return {
      tone: "warning",
      eyebrow: "Basal estimado",
      title: "La referencia del día no parte de un basal medido",
      body: "El sistema ha usado un basal estimado. La lectura sigue siendo útil como orientación, pero conviene confirmarla con una toma basal real.",
    };
  }
  if (warning.includes("umbral definitivo")) {
    return {
      tone: "neutral",
      eyebrow: "Lectura prudente",
      title: "No lo tomes como un umbral fisiológico definitivo",
      body: "Estas referencias son anclas operativas para decidir zonas y comparar sesiones, no una verdad cerrada sobre LT1 o LT2.",
    };
  }
  if (warning.includes("Muy pocos datos")) {
    return {
      tone: "warning",
      eyebrow: "Muestra corta",
      title: "Todavía hay pocos puntos para una lectura robusta",
      body: "Cada dato pesa mucho y una sesión nueva puede mover bastante el resultado. Úsalo con cautela hasta consolidar más repeticiones comparables.",
    };
  }
  if (warning.includes("alto impacto")) {
    return {
      tone: "negative",
      eyebrow: "Alta sensibilidad",
      title: "Un punto nuevo podría cambiar bastante la estimación",
      body: "El modelo sigue siendo sensible a la entrada de una sola muestra. La estabilidad aumentará cuando el histórico sea más denso.",
    };
  }
  if (warning.includes("Cambio agudo excesivo")) {
    return {
      tone: "negative",
      eyebrow: "Desajuste temporal",
      title: "El modelo agudo se ha separado demasiado del crónico",
      body: "Puede ser una mejora puntual, una fatiga reciente o un protocolo poco comparable. Antes de ajustar zonas, conviene revisar contexto y repetir.",
    };
  }
  if (warning.includes("fisiológicamente dudosa")) {
    return {
      tone: "negative",
      eyebrow: "Validez dudosa",
      title: "La matemática es estable, pero la fisiología no termina de cuadrar",
      body: "Hay coherencia interna del modelo, pero la relación entre lactato, FC y carga externa no es todo lo convincente que debería.",
    };
  }
  return {
    tone: "neutral",
    eyebrow: "Atención",
    title: warning,
    body: "Interprétalo dentro del contexto de la sesión, la calidad de la muestra y el histórico reciente del atleta.",
  };
}

function explainTechnicalItem(item: string) {
  const normalized = item.toLowerCase();
  if (normalized.includes("regresión ponderada local")) {
    return "Combina los puntos cercanos dando más peso a los más recientes, comparables y de mejor calidad, en vez de tratar todas las muestras como iguales.";
  }
  if (normalized.includes("efecto muestral")) {
    return "Indica cuánto soporte real tiene la estimación por número de puntos. Más cerca de 1 implica una base más estable; más cerca de 0 implica mucha sensibilidad a pocos datos.";
  }
  if (normalized.includes("influencia potencial")) {
    return "Mide cuánto podría moverse la referencia si entra una muestra nueva. Valores altos significan que el modelo aún es sensible a pequeños cambios del histórico.";
  }
  if (normalized.includes("basal")) {
    return "El basal es el punto de partida del día. Si no está medido, el modelo usa una estimación conservadora y baja la seguridad de la lectura.";
  }
  return "Resume una parte del cálculo para que puedas seguir qué datos han pesado más y por qué la confianza sube o baja.";
}

function InfoHint({ label }: { label: string }) {
  return (
    <span className="info-hint" tabIndex={0}>
      ?
      <span className="info-tooltip">{label}</span>
    </span>
  );
}

function formatSignedDelta(value?: number | null, unit?: string) {
  if (value === null || value === undefined) return null;
  const sign = value > 0 ? "+" : "";
  if (unit === "s/km") return `${sign}${Math.round(value)} ${unit}`;
  return `${sign}${(Math.round(value * 100) / 100).toFixed(unit === "W/kg" ? 2 : 1)} ${unit ?? ""}`.trim();
}

function formatWattsPerKg(power?: number | null, weight?: number | null) {
  if (power === null || power === undefined || weight === null || weight === undefined || weight <= 0) return "-";
  return `${(power / weight).toFixed(2)} W/kg`;
}

function formatPowerWithWeight(power?: number | null, weight?: number | null) {
  if (power === null || power === undefined) return "-";
  const relative = formatWattsPerKg(power, weight);
  return relative === "-" ? `${Math.round(power)} W` : `${Math.round(power)} W · ${relative}`;
}

function isPlausibleAthleteWeight(weight?: number | null) {
  return weight !== null && weight !== undefined && weight >= 25 && weight <= 150;
}

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "-";
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatIntervalDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "-";
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  return `${seconds}s`;
}

function raceDistanceKm(estimateType: string) {
  if (estimateType === "5K") return 5;
  if (estimateType === "10K") return 10;
  if (estimateType === "HM") return 21.0975;
  if (estimateType === "Maratón") return 42.195;
  return null;
}

function racePredictionSummary(estimate: Estimate) {
  const distanceKm = raceDistanceKm(estimate.estimate_type);
  if (estimate.unit !== "s/km" || !distanceKm) {
    return null;
  }
  return {
    pace: formatPace(estimate.value),
    totalTime: formatDuration(estimate.value * distanceKm),
    lowerTime: estimate.lower_bound ? formatDuration(estimate.lower_bound * distanceKm) : "-",
    upperTime: estimate.upper_bound ? formatDuration(estimate.upper_bound * distanceKm) : "-",
  };
}

function relevantEstimateRank(type: string) {
  const order = ["Maratón", "HM", "10K", "5K", "FTP", "VO2max"];
  const index = order.indexOf(type);
  return index === -1 ? order.length : index;
}

function estimateTypesForDiscipline(discipline: string) {
  if (discipline === "ciclismo") return ["FTP", "VO2max"];
  if (discipline === "natación") return ["VO2max"];
  return ["Maratón", "HM", "10K", "5K", "VO2max"];
}

function estimateVisualRange(estimate: Estimate, athleteWeight?: number | null) {
  const raceSummary = racePredictionSummary(estimate);
  const distanceKm = raceDistanceKm(estimate.estimate_type);
  if (raceSummary && distanceKm) {
    const bestSeconds = estimate.lower_bound ? estimate.lower_bound * distanceKm : estimate.value * distanceKm;
    const conservativeSeconds = estimate.upper_bound ? estimate.upper_bound * distanceKm : estimate.value * distanceKm;
    const currentSeconds = estimate.value * distanceKm;
    const span = Math.max(1, conservativeSeconds - bestSeconds);
    const position = ((conservativeSeconds - currentSeconds) / span) * 100;
    return {
      primary: raceSummary.totalTime,
      secondary: raceSummary.pace,
      bestSecondaryLabel: formatPace(estimate.lower_bound ?? estimate.value),
      conservativeSecondaryLabel: formatPace(estimate.upper_bound ?? estimate.value),
      conservativeLabel: raceSummary.upperTime,
      bestLabel: raceSummary.lowerTime,
      markerLabel: "Estimado",
      position,
    };
  }

  const lower = estimate.lower_bound ?? estimate.value;
  const upper = estimate.upper_bound ?? estimate.value;
  const best = Math.max(lower, upper);
  const conservative = Math.min(lower, upper);
  const span = Math.max(1e-6, best - conservative);
  const position = ((estimate.value - conservative) / span) * 100;

  let primary = formatValue(estimate.value, estimate.unit);
  if (estimate.estimate_type === "FTP" && estimate.unit === "W") {
    primary = formatPowerWithWeight(estimate.value, athleteWeight);
  }

  return {
    primary,
    secondary: estimate.unit,
    bestSecondaryLabel: formatValue(best, estimate.unit),
    conservativeSecondaryLabel: formatValue(conservative, estimate.unit),
    conservativeLabel: formatValue(conservative, estimate.unit),
    bestLabel: formatValue(best, estimate.unit),
    markerLabel: estimate.estimate_type === "FTP" || estimate.estimate_type === "VO2max" ? "Actual" : "Estimado",
    position: Math.max(0, Math.min(100, position)),
  };
}

function estimateMethodLabel(method?: string | null) {
  if (!method) return "Modelo explicable";
  if (method === "blended_lt2_endurance_profile_v2") return "LT2 + perfil de resistencia";
  if (method === "lt2_to_vvo2_proxy_v2") return "LT2 -> vVO2 -> VO2max";
  if (method === "blended_lt2_ftp_proxy_v2") return "LT2 combinado -> FTP";
  if (method === "lt2_wkg_vo2_proxy_v2") return "LT2 W/kg -> VO2max";
  if (method === "lt_gap_glycolytic_proxy_v1") return "Proxy glucolítico";
  return method.replace(/_/g, " ");
}

function estimateAnchorLabel(anchor?: string | null) {
  if (!anchor) return "Ancla principal";
  if (anchor === "lt2_blended_reference") return "LT2 combinado";
  if (anchor === "lt1_lt2_gap") return "Separación LT1-LT2";
  if (anchor === "lt1_lt2_power_gap") return "Separación LT1-LT2 en potencia";
  return anchor.replace(/_/g, " ");
}

function disciplineLabel(value: string) {
  if (value === "ciclismo") return "Ciclismo";
  if (value === "natación") return "Natación";
  if (value === "triatlón") return "Triatlón";
  return "Carrera a pie";
}

function parseDistanceKm(label?: string | null) {
  if (!label) return null;
  const normalized = label.toLowerCase();
  if (normalized.includes("hm") || normalized.includes("media")) return 21.0975;
  if (normalized.includes("marat")) return 42.195;
  const kilometerMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*k/);
  if (kilometerMatch) {
    return Number(kilometerMatch[1].replace(",", "."));
  }
  const kmTextMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*km/);
  if (kmTextMatch) {
    return Number(kmTextMatch[1].replace(",", "."));
  }
  return null;
}

function parseTriathlonDistanceLabel(label?: string | null) {
  if (!label) return null;
  const normalized = label.toLowerCase();
  if (normalized.includes("ironman") || normalized.includes("140.6")) {
    return { swimMeters: 3900, bikeKm: 180, runKm: 42.195, label: "IRONMAN" };
  }
  if (normalized.includes("medio ironman") || normalized.includes("half") || normalized.includes("70.3") || normalized.includes("media distancia")) {
    return { swimMeters: 1900, bikeKm: 90, runKm: 21.0975, label: "Media distancia" };
  }
  if (normalized.includes("olimp")) {
    return { swimMeters: 1500, bikeKm: 40, runKm: 10, label: "Olímpico" };
  }
  if (normalized.includes("sprint")) {
    return { swimMeters: 750, bikeKm: 20, runKm: 10, label: "Sprint" };
  }
  return null;
}

function parseRunningPaceLabel(label?: string | null) {
  if (!label) return null;
  const match = label.trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseSwimPaceLabel(label?: string | null) {
  if (!label) return null;
  const match = label.trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function estimateBikeSpeedFromWattsPerKg(wattsPerKg: number, elevationGain = 0, bikeKm = 40) {
  const speed = 33 + (wattsPerKg - 2.6) * 4;
  const elevationPenalty = bikeKm > 0 ? (elevationGain / bikeKm) * 0.18 : 0;
  return Math.max(22, Math.min(46, speed - elevationPenalty));
}

function estimateWattsPerKgFromBikeSpeed(speedKph: number, elevationGain = 0, bikeKm = 40) {
  const elevationPenalty = bikeKm > 0 ? (elevationGain / bikeKm) * 0.18 : 0;
  return Math.max(1.8, Math.min(6.5, 2.6 + (speedKph + elevationPenalty - 33) / 4));
}

function formatSpeedKph(speedKph?: number | null) {
  if (!speedKph) return "-";
  return `${speedKph.toFixed(1)} km/h`;
}

function formatDeltaClock(totalSeconds: number) {
  const absolute = formatClock(Math.abs(totalSeconds));
  return totalSeconds > 0 ? `+${absolute}` : totalSeconds < 0 ? `-${absolute}` : absolute;
}

function safeNumber(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

const TRIATHLON_DISTANCE_PRESETS = {
  ironman: { label: "IRONMAN", swimMeters: 3900, bikeKm: 180, runKm: 42.195 },
  half: { label: "Media distancia", swimMeters: 1900, bikeKm: 90, runKm: 21.0975 },
  olympic: { label: "Olímpico", swimMeters: 1500, bikeKm: 40, runKm: 10 },
  sprint: { label: "Sprint", swimMeters: 750, bikeKm: 20, runKm: 10 },
} as const;

function triathlonPlanningModel(label?: string | null) {
  const race = parseTriathlonDistanceLabel(label);
  if (!race) return null;
  const normalized = label?.toLowerCase() ?? "";
  if (normalized.includes("ironman")) {
    return { transitionsSeconds: 8 * 60, split: { swim: 0.1, bike: 0.51, run: 0.39 } };
  }
  if (normalized.includes("media distancia") || normalized.includes("medio ironman") || normalized.includes("70.3")) {
    return { transitionsSeconds: 5 * 60, split: { swim: 0.11, bike: 0.5, run: 0.39 } };
  }
  if (normalized.includes("olímp") || normalized.includes("olimp")) {
    return { transitionsSeconds: 3 * 60, split: { swim: 0.16, bike: 0.5, run: 0.34 } };
  }
  if (normalized.includes("sprint")) {
    return { transitionsSeconds: 2 * 60, split: { swim: 0.17, bike: 0.49, run: 0.34 } };
  }
  return { transitionsSeconds: 4 * 60, split: { swim: 0.12, bike: 0.5, run: 0.38 } };
}

function triathlonPresetKeyFromLabel(label?: string | null) {
  if (!label) return "manual";
  const normalized = label.toLowerCase();
  if (normalized.includes("ironman")) return "ironman";
  if (normalized.includes("media distancia") || normalized.includes("medio ironman") || normalized.includes("70.3")) return "half";
  if (normalized.includes("olímp") || normalized.includes("olimp")) return "olympic";
  if (normalized.includes("sprint")) return "sprint";
  return "manual";
}

function parseSubTargetSeconds(objective: string, context?: { distanceKm?: number | null; discipline?: string }) {
  const normalized = objective.toLowerCase().replace(",", ".");
  const threePart = normalized.match(/sub\s*(\d{1,2})[:h](\d{2})[:m](\d{2})/i) || normalized.match(/sub\s*(\d{1,2}):(\d{2}):(\d{2})/i);
  if (threePart) {
    return Number(threePart[1]) * 3600 + Number(threePart[2]) * 60 + Number(threePart[3]);
  }

  const twoPart = normalized.match(/sub\s*(\d{1,3})[:h](\d{2})/i) || normalized.match(/sub\s*(\d{1,3}):(\d{2})/i);
  if (twoPart) {
    const first = Number(twoPart[1]);
    const second = Number(twoPart[2]);
    const shouldTreatAsHours =
      normalized.includes("h") ||
      (context?.discipline === "triatlón") ||
      ((context?.distanceKm ?? 0) >= 21 && first <= 5);
    if (shouldTreatAsHours) {
      return first * 3600 + second * 60;
    }
    return first * 60 + second;
  }

  const hourOnly = normalized.match(/sub\s*(\d+(?:\.\d+)?)\s*h/);
  if (hourOnly) {
    return Math.round(Number(hourOnly[1]) * 3600);
  }

  const minuteOnly = normalized.match(/sub\s*(\d{1,3})(?!\d)/);
  if (minuteOnly) {
    return Number(minuteOnly[1]) * 60;
  }

  return null;
}

function extractFtpWatts(objective: string) {
  const normalized = objective.toLowerCase();
  const ftpMatch = normalized.match(/ftp\s*(\d{2,4})\s*w?/i);
  if (ftpMatch) return Number(ftpMatch[1]);
  return null;
}

function buildObjectiveHints(form: {
  discipline: string;
  objective: string;
  distance_label: string;
  distance_category?: string;
  target_pace_label?: string;
  target_power_watts?: string;
}) {
  const hints: string[] = [];
  const targetLabel = buildTargetObjective({
    category: form.distance_category,
    distanceLabel: form.distance_label,
    fallback: form.objective,
  });
  if (!targetLabel.trim()) return hints;

  const distanceKm = parseDistanceKm(form.distance_label || targetLabel);
  const explicitPace =
    form.discipline === "running" || form.discipline === "triatlón"
      ? parseRunningPaceLabel(form.target_pace_label ?? "")
      : null;
  const targetSeconds = explicitPace && distanceKm ? explicitPace * distanceKm : parseSubTargetSeconds(targetLabel, { distanceKm, discipline: form.discipline });

  if ((form.discipline === "running" || form.discipline === "triatlón") && distanceKm && targetSeconds) {
    const paceSeconds = targetSeconds / distanceKm;
    hints.push(`Ritmo medio para cumplir: ${formatPace(paceSeconds)}`);
  }

  if (form.discipline === "ciclismo" || form.discipline === "triatlón") {
    const ftpWatts = form.target_power_watts ? Number(form.target_power_watts) : extractFtpWatts(targetLabel);
    if (ftpWatts) {
      hints.push(`Potencia de referencia para cumplir: ${Math.round(ftpWatts)} W`);
    }
  }

  if (form.discipline === "triatlón" && targetSeconds && /sub|^\d/.test((form.objective ?? "").trim().toLowerCase())) {
    hints.push(`Tiempo total objetivo detectado: ${formatClock(targetSeconds)}`);
  }

  return hints;
}

function buildTriathlonDisciplineHints(form: {
  objective: string;
  distance_label: string;
  target_running_pace_label: string;
  target_swim_pace_label: string;
  target_cycling_power_watts: string;
  transition_1_seconds: string;
  transition_2_seconds: string;
  bike_elevation_gain_m: string;
}, athleteWeight?: number | null) {
  const race = parseTriathlonDistanceLabel(form.distance_label);
  const planningModel = triathlonPlanningModel(form.distance_label);
  const totalSeconds = parseSubTargetSeconds(form.objective, { discipline: "triatlón" });
  if (!race || !totalSeconds || !planningModel) {
    return { swim: [], bike: [], run: [] } as Record<"swim" | "bike" | "run", string[]>;
  }

  const runPace = parseRunningPaceLabel(form.target_running_pace_label);
  const swimPace = parseSwimPaceLabel(form.target_swim_pace_label);
  const bikeWattsPerKg = form.target_cycling_power_watts ? Number(form.target_cycling_power_watts) : null;
  const bikeElevationGain = safeNumber(form.bike_elevation_gain_m);
  const bikeSpeed = bikeWattsPerKg ? estimateBikeSpeedFromWattsPerKg(bikeWattsPerKg, bikeElevationGain, race.bikeKm) : null;

  const providedSegments = {
    swim: swimPace ? (swimPace * race.swimMeters) / 100 : null,
    bike: bikeSpeed ? (race.bikeKm / bikeSpeed) * 3600 : null,
    run: runPace ? runPace * race.runKm : null,
  };

  const providedCount = Object.values(providedSegments).filter(isDefined).length;
  const availableRaceSeconds = totalSeconds - planningModel.transitionsSeconds;
  const remainingSeconds = availableRaceSeconds - (providedSegments.swim ?? 0) - (providedSegments.bike ?? 0) - (providedSegments.run ?? 0);
  const ratio = planningModel.split;

  const hints: Record<"swim" | "bike" | "run", string[]> = { swim: [], bike: [], run: [] };

  if (providedSegments.swim) {
    hints.swim.push(`Tiempo estimado disciplina: ${formatClock(providedSegments.swim)}`);
  }
  if (providedSegments.run) {
    hints.run.push(`Tiempo estimado disciplina: ${formatClock(providedSegments.run)}`);
  }
  if (providedSegments.bike) {
    hints.bike.push(`Tiempo estimado disciplina: ${formatClock(providedSegments.bike)}`);
  }

  if (providedCount <= 1) {
    const suggestedSwimSeconds = availableRaceSeconds * ratio.swim;
    const suggestedBikeSeconds = availableRaceSeconds * ratio.bike;
    const suggestedRunSeconds = availableRaceSeconds * ratio.run;
    const suggestedBikeSpeed = race.bikeKm / (suggestedBikeSeconds / 3600);
    const suggestedBikeWkg = estimateWattsPerKgFromBikeSpeed(suggestedBikeSpeed, bikeElevationGain, race.bikeKm);
    hints.swim.push(`Referencia inicial: ${formatSwimPacePer100m((suggestedSwimSeconds / race.swimMeters) * 100)}`);
    hints.swim.push(`Tiempo objetivo disciplina: ${formatClock(suggestedSwimSeconds)}`);
    hints.run.push(`Referencia inicial: ${formatPace(suggestedRunSeconds / race.runKm)}`);
    hints.run.push(`Tiempo objetivo disciplina: ${formatClock(suggestedRunSeconds)}`);
    hints.bike.push(
      `Referencia inicial: ${suggestedBikeWkg.toFixed(2)} W/kg${athleteWeight ? ` · ${Math.round(suggestedBikeWkg * athleteWeight)} W` : ""} · ${formatSpeedKph(
        suggestedBikeSpeed,
      )}`,
    );
    hints.bike.push(`Tiempo objetivo disciplina: ${formatClock(suggestedBikeSeconds)}`);
  }

  if (providedCount === 2) {
    if (!providedSegments.swim) {
      const requiredSwimPer100 = (remainingSeconds / race.swimMeters) * 100;
      hints.swim.push(`Para cumplir el objetivo: ${formatSwimPacePer100m(requiredSwimPer100)}`);
      hints.swim.push(`Tiempo objetivo disciplina: ${formatClock(remainingSeconds)}`);
    }
    if (!providedSegments.run) {
      const requiredRunPace = remainingSeconds / race.runKm;
      hints.run.push(`Para cumplir el objetivo: ${formatPace(requiredRunPace)}`);
      hints.run.push(`Tiempo objetivo disciplina: ${formatClock(remainingSeconds)}`);
    }
    if (!providedSegments.bike) {
      const requiredBikeSpeed = race.bikeKm / (remainingSeconds / 3600);
      const requiredBikeWkg = estimateWattsPerKgFromBikeSpeed(requiredBikeSpeed, bikeElevationGain, race.bikeKm);
      hints.bike.push(
        `Para cumplir el objetivo: ${requiredBikeWkg.toFixed(2)} W/kg${athleteWeight ? ` · ${Math.round(requiredBikeWkg * athleteWeight)} W` : ""} · ${formatSpeedKph(
          requiredBikeSpeed,
        )}`,
      );
      hints.bike.push(`Tiempo objetivo disciplina: ${formatClock(remainingSeconds)}`);
    }
  }

  if (!hints.bike.length && bikeSpeed) {
    hints.bike.push(
      `Velocidad estimada con tu FTP objetivo: ${bikeWattsPerKg?.toFixed(2)} W/kg${athleteWeight && bikeWattsPerKg ? ` · ${Math.round(bikeWattsPerKg * athleteWeight)} W` : ""} · ${formatSpeedKph(
        bikeSpeed,
      )}`,
    );
    hints.bike.push(`Tiempo estimado disciplina: ${formatClock((race.bikeKm / bikeSpeed) * 3600)}`);
  }
  if (providedCount === 3) {
    const totalWithTransitions = (providedSegments.swim ?? 0) + (providedSegments.bike ?? 0) + (providedSegments.run ?? 0) + planningModel.transitionsSeconds;
    const deltaSeconds = Math.round(totalWithTransitions - totalSeconds);
    const targetBikeSeconds = availableRaceSeconds * ratio.bike;
    const targetBikeSpeed = race.bikeKm / (targetBikeSeconds / 3600);
    const targetBikeWkg = estimateWattsPerKgFromBikeSpeed(targetBikeSpeed, bikeElevationGain, race.bikeKm);
    hints.bike.push(`Con tu FTP actual, bici estimada: ${formatClock(providedSegments.bike ?? 0)}`);
    hints.bike.push(`Para cuadrar el objetivo total: ${targetBikeWkg.toFixed(2)} W/kg${athleteWeight ? ` · ${Math.round(targetBikeWkg * athleteWeight)} W` : ""} · ${formatSpeedKph(targetBikeSpeed)}`);
    hints.bike.push(
      deltaSeconds > 0
        ? `Con los tres parámetros actuales te irías a ${formatClock(totalWithTransitions)} (${formatClock(deltaSeconds)} por encima del objetivo).`
        : `Con los tres parámetros actuales saldría ${formatClock(totalWithTransitions)} (${formatClock(Math.abs(deltaSeconds))} por debajo del objetivo).`,
    );
  }
  hints.bike.push(`Desnivel bici considerado: ${Math.round(bikeElevationGain)} m+`);
  hints.bike.push("Estimación de velocidad basada en una bici aero media, posición normal y desnivel uniforme durante el recorrido.");

  return hints;
}

function buildTriathlonPlannerSummary(form: {
  objective: string;
  distance_label: string;
  target_running_pace_label: string;
  target_swim_pace_label: string;
  target_cycling_power_watts: string;
  transition_1_seconds: string;
  transition_2_seconds: string;
  bike_elevation_gain_m: string;
}) {
  const race = parseTriathlonDistanceLabel(form.distance_label);
  const totalGoalSeconds = parseSubTargetSeconds(form.objective, { discipline: "triatlón" });
  if (!race || !totalGoalSeconds) return null;

  const runPace = parseRunningPaceLabel(form.target_running_pace_label);
  const swimPace = parseSwimPaceLabel(form.target_swim_pace_label);
  const bikeWkg = form.target_cycling_power_watts ? Number(form.target_cycling_power_watts) : null;
  const transition1 = safeNumber(form.transition_1_seconds);
  const transition2 = safeNumber(form.transition_2_seconds);
  const elevation = safeNumber(form.bike_elevation_gain_m);
  const bikeSpeed = bikeWkg ? estimateBikeSpeedFromWattsPerKg(bikeWkg, elevation, race.bikeKm) : null;

  const swimSeconds = swimPace ? (swimPace * race.swimMeters) / 100 : null;
  const bikeSeconds = bikeSpeed ? (race.bikeKm / bikeSpeed) * 3600 : null;
  const runSeconds = runPace ? runPace * race.runKm : null;
  const allDefined = swimSeconds !== null && bikeSeconds !== null && runSeconds !== null;
  const totalCurrent = allDefined ? swimSeconds + bikeSeconds + runSeconds + transition1 + transition2 : null;

  return {
    totalGoalSeconds,
    swimSeconds,
    bikeSeconds,
    runSeconds,
    bikeSpeed,
    bikeWkg,
    transition1,
    transition2,
    totalCurrent,
    deltaSeconds: totalCurrent !== null ? Math.round(totalCurrent - totalGoalSeconds) : null,
  };
}

function estimatePowerAtLactate(
  entries: Array<{ lactate_mmol: number; power_watts?: number | null; power_source?: string | null }>,
  targetLactate: number,
) {
  const usable = entries
    .filter((entry) => entry.power_watts !== null && entry.power_watts !== undefined && entry.lactate_mmol !== null && entry.lactate_mmol !== undefined)
    .map((entry) => ({ lactate: entry.lactate_mmol, power: entry.power_watts as number, power_source: entry.power_source ?? null }))
    .sort((a, b) => a.lactate - b.lactate);

  if (!usable.length) return null;

  const exact = usable.find((entry) => Math.abs(entry.lactate - targetLactate) <= 0.05);
  if (exact) {
    return { power: exact.power, power_source: exact.power_source, interpolated: false };
  }

  const lower = [...usable].reverse().find((entry) => entry.lactate < targetLactate);
  const upper = usable.find((entry) => entry.lactate > targetLactate);
  if (lower && upper && upper.lactate !== lower.lactate) {
    const ratio = (targetLactate - lower.lactate) / (upper.lactate - lower.lactate);
    const power = lower.power + ratio * (upper.power - lower.power);
    return { power, power_source: lower.power_source === upper.power_source ? lower.power_source : null, interpolated: true };
  }

  const nearest = usable.reduce((best, current) =>
    Math.abs(current.lactate - targetLactate) < Math.abs(best.lactate - targetLactate) ? current : best,
  );
  return { power: nearest.power, power_source: nearest.power_source, interpolated: false };
}

function targetSummaryForDiscipline(
  target: {
    discipline: string;
    target_pace_label?: string | null;
    target_power_watts?: number | null;
    target_running_pace_label?: string | null;
    target_swim_pace_label?: string | null;
    target_cycling_power_watts?: number | null;
  },
  activeDiscipline: string,
) {
  if (target.discipline === "triatlón") {
    if (activeDiscipline === "ciclismo") {
      return target.target_cycling_power_watts ? `${Math.round(target.target_cycling_power_watts)} W` : "Sin potencia objetivo";
    }
    if (activeDiscipline === "natación") {
      return target.target_swim_pace_label || "Sin ritmo objetivo";
    }
    return target.target_running_pace_label || "Sin ritmo objetivo";
  }
  if (target.discipline === "ciclismo") {
    return target.target_power_watts ? `${Math.round(target.target_power_watts)} W` : "Sin potencia objetivo";
  }
  return target.target_pace_label || "Sin ritmo objetivo";
}

function compactTargetLabel(target: Pick<AthleteTarget, "discipline" | "distance_category" | "distance_label" | "objective">) {
  if (target.distance_category === "hm") return "HM";
  if (target.distance_category === "marathon") return "Maratón";
  if (target.distance_category === "10k") return "10K";
  if (target.distance_category === "5k") return "5K";

  const label = buildTargetObjective({
    category: target.distance_category,
    distanceLabel: target.distance_label,
    fallback: target.objective,
  });
  const normalized = label.toLowerCase();

  if (normalized.includes("media marat")) return "HM";
  if (normalized.includes("marat")) return "Maratón";
  if (/\b10\s*k\b/.test(normalized)) return "10K";
  if (/\b5\s*k\b/.test(normalized)) return "5K";
  if (normalized.includes("ironman")) return "Ironman";
  if (normalized.includes("half")) return "Half";

  return label;
}

function targetTotalTimeLabel(target: AthleteTarget, activeDiscipline: string) {
  const objectiveLabel = buildTargetObjective({
    category: target.distance_category,
    distanceLabel: target.distance_label,
    fallback: target.objective,
  });

  if (target.discipline === "triatlón") {
    const totalSeconds = parseSubTargetSeconds(target.objective || objectiveLabel, { discipline: "triatlón" });
    return totalSeconds ? formatDuration(totalSeconds) : null;
  }

  if (target.discipline === "running") {
    const distanceKm = parseDistanceKm(target.distance_label || objectiveLabel);
    const paceSeconds = parseRunningPaceLabel(target.target_pace_label);
    if (distanceKm && paceSeconds) {
      return formatDuration(distanceKm * paceSeconds);
    }
    const totalSeconds = parseSubTargetSeconds(target.objective || objectiveLabel, { distanceKm, discipline: target.discipline });
    return totalSeconds ? formatDuration(totalSeconds) : null;
  }

  if (target.discipline === "natación") {
    return null;
  }

  if (target.discipline === "ciclismo" && activeDiscipline === "ciclismo") {
    const distanceKm = parseDistanceKm(target.distance_label || objectiveLabel);
    const totalSeconds = parseSubTargetSeconds(target.objective || objectiveLabel, { distanceKm, discipline: target.discipline });
    return totalSeconds ? formatDuration(totalSeconds) : null;
  }

  return null;
}

function targetMetricDetailLabel(target: AthleteTarget, activeDiscipline: string) {
  const summary = targetSummaryForDiscipline(target, activeDiscipline);
  if (summary.startsWith("Sin ")) return null;
  if (target.discipline === "triatlón" && activeDiscipline === "ciclismo") return `Potencia objetivo ${summary}`;
  if (target.discipline === "triatlón" && activeDiscipline === "natación") return `Ritmo swim ${summary}`;
  if (target.discipline === "triatlón" && activeDiscipline === "running") return `Ritmo run ${summary}`;
  if (target.discipline === "ciclismo") return `Potencia objetivo ${summary}`;
  if (target.discipline === "natación") return `Ritmo objetivo ${summary}`;
  return `Ritmo objetivo ${summary}`;
}

const RUNNING_LT2_TARGET_FACTORS: Record<"5K" | "10K" | "HM" | "Maratón", number> = {
  "5K": 1.03,
  "10K": 1.0,
  HM: 0.94,
  "Maratón": 0.89,
};

function targetPriorityRank(priority?: string | null) {
  const normalized = (priority ?? "").toLowerCase();
  if (normalized.startsWith("a") || normalized.includes("alta")) return 0;
  if (normalized.startsWith("b") || normalized.includes("baja")) return 2;
  return 1;
}

function selectRelevantTarget(targets: AthleteTarget[], activeDiscipline: string) {
  const today = new Date().toISOString().slice(0, 10);
  const primaryPool = targets.filter((target) => target.discipline === activeDiscipline);
  const fallbackPool = activeDiscipline !== "triatlón" ? targets.filter((target) => target.discipline === "triatlón") : [];
  const pool = primaryPool.length ? primaryPool : fallbackPool;
  return (
    pool
      .slice()
      .sort((a, b) => {
        const aFuture = a.target_date >= today ? 0 : 1;
        const bFuture = b.target_date >= today ? 0 : 1;
        if (aFuture !== bFuture) return aFuture - bFuture;
        const priorityDiff = targetPriorityRank(a.priority_level) - targetPriorityRank(b.priority_level);
        if (priorityDiff !== 0) return priorityDiff;
        return a.target_date.localeCompare(b.target_date);
      })[0] ?? null
  );
}

function runningEstimateTypeFromDistance(distanceKm?: number | null) {
  if (distanceKm === null || distanceKm === undefined) return null;
  if (distanceKm <= 7.5) return "5K";
  if (distanceKm <= 15) return "10K";
  if (distanceKm <= 30) return "HM";
  return "Maratón";
}

function formatPaceGapLabel(current?: number | null, target?: number | null) {
  if (current === null || current === undefined || target === null || target === undefined) return "n/d";
  const delta = Math.round(current - target);
  if (delta <= 0) return "Ya entra en zona objetivo";
  return `Faltan ${formatClock(delta)}/km`;
}

function formatRaceGapLabel(current?: number | null, target?: number | null) {
  if (current === null || current === undefined || target === null || target === undefined) return "n/d";
  const delta = Math.round(current - target);
  if (delta === 0) return "En objetivo";
  if (delta < 0) return `${formatClock(Math.abs(delta))} por debajo del objetivo`;
  return `Faltan ${formatClock(delta)}`;
}

function formatPowerGapLabel(current?: number | null, target?: number | null) {
  if (current === null || current === undefined || target === null || target === undefined) return "n/d";
  const delta = Math.round(target - current);
  if (delta <= 0) return "Ya entra en zona objetivo";
  return `Faltan ${delta} W`;
}

function interpolateMetric(start?: number | null, end?: number | null, ratio = 0.5) {
  if (start === null || start === undefined || end === null || end === undefined) return null;
  return start + (end - start) * ratio;
}

function goalScenarioPoint(
  label: string,
  series: "Actual" | "Objetivo",
  x?: number | null,
  lactate = 0,
): GoalScenarioPoint | null {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  return { label, series, x, lactate };
}

function buildGoalScenario(
  title: string,
  description: string,
  xLabel: string,
  reversed: boolean,
  points: Array<GoalScenarioPoint | null | undefined>,
): GoalMovementScenario | null {
  const usable = points
    .filter((point): point is GoalScenarioPoint => Boolean(point))
    .sort((a, b) => a.lactate - b.lactate || a.x - b.x);
  const actualCount = usable.filter((point) => point.series === "Actual").length;
  const targetCount = usable.filter((point) => point.series === "Objetivo").length;
  if (actualCount < 2 || targetCount < 1) return null;
  return { title, description, xLabel, reversed, points: usable };
}

function cyclingEnduranceFactor(target: AthleteTarget) {
  const category = target.distance_category ?? "";
  if (category === "ironman" || category === "ironman_bike") return 0.72;
  if (category === "half_tri" || category === "half_bike") return 0.82;
  if (category === "olympic_tri" || category === "olympic_bike") return 0.88;
  if (category === "granfondo") return 0.8;
  const normalized = `${target.distance_label ?? ""} ${target.objective}`.toLowerCase();
  if (normalized.includes("ironman") || normalized.includes("140.6")) return 0.72;
  if (normalized.includes("70.3") || normalized.includes("medio ironman") || normalized.includes("media distancia")) return 0.82;
  if (normalized.includes("olímp") || normalized.includes("olimp")) return 0.88;
  if (normalized.includes("gran fondo") || normalized.includes("fondo")) return 0.8;
  return 0.86;
}

function isEnduranceBikeTarget(target: AthleteTarget) {
  if (target.distance_category && ["half_tri", "half_bike", "ironman", "ironman_bike", "granfondo"].includes(target.distance_category)) return true;
  if (target.distance_category && ["road_tt_short", "road_tt_medium", "road_tt_long", "hill_climb", "road_race", "olympic_bike", "sprint_bike"].includes(target.distance_category)) return false;
  if (target.discipline === "triatlón") return true;
  const normalized = `${target.distance_label ?? ""} ${target.objective}`.toLowerCase();
  return normalized.includes("gran fondo") || normalized.includes("fondo") || normalized.includes("ultra");
}

function buildRunningTargetInsight(params: {
  target: AthleteTarget;
  estimatesByType: Map<string, Estimate>;
  lt1?: ThresholdDisplay;
  lt2?: ThresholdDisplay;
  dynamicThresholds: DynamicThresholds | null;
  vo2maxEstimate?: Estimate;
  physiologicalAnalysis?: MesocycleRecommendation["physiological_analysis"] | null;
}): GoalMovementInsight {
  const { target, estimatesByType, lt1, lt2, dynamicThresholds, vo2maxEstimate, physiologicalAnalysis } = params;
  const triathlonRace = target.discipline === "triatlón" ? parseTriathlonDistanceLabel(target.distance_label) : null;
  const targetLabel = buildTargetObjective({ category: target.distance_category, distanceLabel: target.distance_label, fallback: target.objective });
  const distanceKm = triathlonRace?.runKm ?? parseDistanceKm(target.distance_label || targetLabel);
  const explicitTargetPace =
    target.discipline === "triatlón"
      ? parseRunningPaceLabel(target.target_running_pace_label)
      : parseRunningPaceLabel(target.target_pace_label);
  const derivedTargetSeconds =
    !explicitTargetPace && distanceKm
      ? parseSubTargetSeconds(targetLabel, { distanceKm, discipline: target.discipline })
      : null;
  const targetPace = explicitTargetPace ?? (derivedTargetSeconds && distanceKm ? derivedTargetSeconds / distanceKm : null);
  const estimateType = runningEstimateTypeFromDistance(distanceKm);
  const raceEstimate = estimateType ? estimatesByType.get(estimateType) : undefined;
  const raceSummary = raceEstimate ? racePredictionSummary(raceEstimate) : null;
  const currentPace =
    raceEstimate?.unit === "s/km"
      ? raceEstimate.value
      : dynamicThresholds?.chronic.practical_lt2?.estimated_pace_seconds_per_km ?? lt2?.pace_seconds_per_km ?? null;
  const currentSeconds = raceEstimate && distanceKm ? raceEstimate.value * distanceKm : null;
  const targetSeconds = targetPace && distanceKm ? targetPace * distanceKm : null;
  const paceGap = currentPace !== null && targetPace !== null ? currentPace - targetPace : null;
  const longEvent = target.discipline === "triatlón" || (distanceKm ?? 0) >= 21;
  const useBackendTargets = physiologicalAnalysis?.metric_type === "pace_kmh";
  const tone: GoalMovementTone =
    paceGap === null ? "neutral" : paceGap <= 0 ? "positive" : paceGap <= (longEvent ? 8 : 6) ? "neutral" : "negative";

  if (!targetPace) {
    return {
      target,
      contextLabel: target.discipline === "triatlón" ? "Segmento run del triatlón" : "Objetivo running",
      targetValue: targetLabel,
      currentValue: raceSummary ? `${raceSummary.totalTime} · ${raceSummary.pace}` : currentPace ? formatPace(currentPace) : "Sin referencia actual",
      gapLabel: "Falta ritmo objetivo específico",
      tone: "negative" as GoalMovementTone,
      movementHeadline: "Primero hay que definir el ritmo objetivo del segmento de carrera.",
      summary:
        "Sin un ritmo objetivo concreto de carrera a pie, la plataforma no puede decir con precisión si el cuello de botella está en LT1, LT2 o en el techo aeróbico.",
      focuses: [
        {
          label: "Ritmo objetivo",
          current: targetSummaryForDiscipline(target, "running"),
          tone: "negative",
          description: "Añade un ritmo objetivo o un objetivo temporal claro para que el sistema traduzca la meta a palancas fisiológicas concretas.",
        },
      ],
      notes: target.notes ? [target.notes] : [],
    };
  }

  const fallbackTargetLt2Pace = estimateType ? targetPace * RUNNING_LT2_TARGET_FACTORS[estimateType] : targetPace;
  const currentLt2Pace = lt2?.pace_seconds_per_km ?? dynamicThresholds?.chronic.practical_lt2?.estimated_pace_seconds_per_km ?? null;
  const currentLt1Pace = lt1?.pace_seconds_per_km ?? dynamicThresholds?.chronic.practical_lt1?.estimated_pace_seconds_per_km ?? null;
  const targetLt2Pace = useBackendTargets
    ? kmhToPaceSeconds(physiologicalAnalysis?.required_lt2_kmh ?? null)
    : fallbackTargetLt2Pace;
  const targetLt1Pace = useBackendTargets
    ? kmhToPaceSeconds(physiologicalAnalysis?.required_lt1_kmh ?? null)
    : targetLt2Pace
      ? targetLt2Pace * (longEvent ? ((distanceKm ?? 0) >= 40 ? 1.15 : 1.11) : 1.08)
      : null;
  const mediumEvent = !longEvent && (distanceKm ?? 0) >= 8;
  const currentSupportRatio = currentLt1Pace !== null && currentLt2Pace !== null ? currentLt1Pace / currentLt2Pace : null;
  const targetSupportRatio = targetLt1Pace !== null && targetLt2Pace !== null ? targetLt1Pace / targetLt2Pace : null;
  const lt1Gap = currentLt1Pace !== null && targetLt1Pace !== null ? currentLt1Pace - targetLt1Pace : null;
  const lt2Gap = currentLt2Pace !== null && targetLt2Pace !== null ? currentLt2Pace - targetLt2Pace : null;
  const lt1NearTarget = lt1Gap !== null && lt1Gap <= (longEvent ? 4 : 3);
  const lt1LaggingRelative =
    currentSupportRatio !== null && targetSupportRatio !== null && currentSupportRatio > targetSupportRatio + (longEvent ? 0.015 : 0.025);
  const prioritizeLt1 =
    physiologicalAnalysis?.primary_limiter
      ? physiologicalAnalysis.primary_limiter === "lt1"
      : paceGap !== null && paceGap > 0
      ? longEvent
        ? currentLt1Pace === null || lt1LaggingRelative || !lt1NearTarget
        : mediumEvent && (currentLt1Pace === null || lt1LaggingRelative) && (lt1Gap ?? 0) >= 6
      : false;

  const lt1Focus: GoalMovementFocus = {
    label: "LT1 y durabilidad",
    current: currentLt1Pace ? formatPace(currentLt1Pace) : "Sin LT1 actual",
    target: targetLt1Pace ? formatPace(targetLt1Pace) : useBackendTargets ? "No requerido de forma explícita" : null,
    delta: currentLt1Pace
      ? targetLt1Pace
        ? formatPaceGapLabel(currentLt1Pace, targetLt1Pace)
        : "El selector no fija un LT1 requerido formal para este objetivo"
      : "Falta ancla LT1",
    tone:
      currentLt1Pace === null
        ? "negative"
        : targetLt1Pace === null
          ? "neutral"
          : currentLt1Pace <= targetLt1Pace
          ? "positive"
          : currentLt1Pace - targetLt1Pace <= (longEvent ? 8 : 6)
            ? "neutral"
            : "negative",
    description: useBackendTargets && targetLt1Pace === null
      ? "Para este objetivo, el selector de mesociclo no está fijando una referencia LT1 explícita. La decisión fisiológica se apoya sobre todo en LT2 y en el contexto temporal."
      : longEvent
      ? prioritizeLt1
        ? "En HM, maratón y triatlón, la primera palanca suele ser subir la carga sostenible a baja lactatemia y la durabilidad. Eso reduce la deriva y suele facilitar la siguiente subida de LT2."
        : "LT1 ya acompaña razonablemente al objetivo. Hay que mantener esa base mientras LT2 termina de acercarse."
      : prioritizeLt1
        ? "Aquí LT1 está demasiado retrasado respecto a LT2. Antes de apretar más el umbral alto, conviene cerrar esa base para que el bloque siguiente transfiera mejor."
        : "LT1 no es el primer cuello ahora mismo, pero tiene que seguir acompañando para que LT2 se consolide.",
  };

  const lt2Focus: GoalMovementFocus = {
    label: "LT2",
    current: currentLt2Pace ? formatPace(currentLt2Pace) : "Sin LT2 actual",
    target: targetLt2Pace ? formatPace(targetLt2Pace) : "Sin LT2 requerido",
    delta: targetLt2Pace ? formatPaceGapLabel(currentLt2Pace, targetLt2Pace) : "El selector no pudo fijar LT2 requerido",
    tone:
      currentLt2Pace === null
        ? "negative"
        : targetLt2Pace === null
          ? "negative"
          : currentLt2Pace <= targetLt2Pace
          ? "positive"
          : currentLt2Pace - targetLt2Pace <= 8
            ? "neutral"
            : "negative",
    description: prioritizeLt1
      ? "Después de mover la base, LT2 tiene que acercarse para que el ritmo competitivo deje de quedar por encima del umbral sostenible."
      : longEvent
        ? "LT1 ya acompaña bastante; ahora el salto principal está en LT2 para que el objetivo sea defendible de verdad."
        : "En 5K y 10K, si LT2 no se acerca al ritmo pedido, la marca objetivo no sale de forma defendible.",
  };

  const focuses: GoalMovementFocus[] = prioritizeLt1 ? [lt1Focus, lt2Focus] : [lt2Focus, lt1Focus];

  if (!longEvent && vo2maxEstimate) {
    focuses.push({
      label: "VO2max",
      current: `${Math.round(vo2maxEstimate.value * 10) / 10} ml/kg/min`,
      tone: paceGap !== null && paceGap <= 4 ? "neutral" : "negative",
      description: "En objetivos más cortos, el techo aeróbico también tiene que acompañar. No sustituye a LT2, pero sí ayuda a empujarlo hacia arriba.",
    });
  }

  const scenario = buildGoalScenario(
    "Escenario objetivo de lactato",
    useBackendTargets
      ? "Visualización directa de los umbrales requeridos que está usando el selector de mesociclo. Si falta alguna ancla, no se inventa."
      : "Proyección conservadora con anclas LT1 y LT2. La línea objetivo es una referencia de trabajo, no un test medido.",
    "Ritmo",
    true,
    [
      goalScenarioPoint("LT1 actual", "Actual", currentLt1Pace, lt1?.lactate ?? 2.0),
      goalScenarioPoint("LT2 actual", "Actual", currentLt2Pace, lt2?.lactate ?? 4.0),
      goalScenarioPoint("LT1 objetivo", "Objetivo", targetLt1Pace, 2.0),
      goalScenarioPoint("LT2 objetivo", "Objetivo", targetLt2Pace, 4.0),
    ],
  );

  const notes = [
    ...(useBackendTargets ? ["Esta tarjeta usa los `required_lt1` y `required_lt2` del motor de mesociclos para mantenerse alineada con la recomendación de bloque."] : []),
    ...(useBackendTargets && targetLt1Pace === null && targetLt2Pace !== null
      ? ["Para esta prueba, el motor está fijando solo un LT2 requerido. No hay un LT1 objetivo formal en la recomendación fisiológica actual."]
      : []),
    "La prioridad cambia con la distancia: cuanto más larga la prueba, más pesa la carga sostenible a lactatos bajos y la durabilidad; cuanto más corta, más manda LT2 y el techo aeróbico.",
    ...(target.discipline === "triatlón" ? ["Lectura aplicada solo al segmento de carrera a pie del triatlón objetivo."] : []),
    ...(raceEstimate?.low_evidence ? ["La estimación específica de esta distancia todavía tiene evidencia limitada."] : []),
    ...(target.notes ? [target.notes] : []),
  ];

  return {
    target,
    contextLabel: target.discipline === "triatlón" ? "Segmento run del triatlón" : "Objetivo running",
    targetValue: targetSeconds ? `${formatDuration(targetSeconds)} · ${formatPace(targetPace)}` : formatPace(targetPace),
    currentValue: raceSummary ? `${raceSummary.totalTime} · ${raceSummary.pace}` : currentPace ? formatPace(currentPace) : "Sin referencia actual",
    gapLabel:
      currentSeconds !== null && targetSeconds !== null
        ? formatRaceGapLabel(currentSeconds, targetSeconds)
        : formatPaceGapLabel(currentPace, targetPace),
    tone,
    movementHeadline:
      paceGap !== null && paceGap <= 0
        ? "La referencia actual ya entra dentro del objetivo."
        : prioritizeLt1
          ? longEvent
            ? "Primero tiene que moverse LT1 y la durabilidad; después LT2."
            : "Antes de apretar LT2, falta acercar LT1."
          : longEvent
            ? "LT1 ya acompaña bastante; ahora el cuello de botella principal es LT2."
            : "Lo primero que tiene que moverse es LT2; después debe acompañar el techo aeróbico.",
    summary:
      paceGap === null
        ? "Hay objetivo definido, pero todavía no hay suficiente ancla comparable para medir la distancia real hasta esa marca."
        : paceGap <= 0
          ? "Con las referencias actuales, la marca ya queda dentro de lo plausible. El trabajo es consolidarla y hacerla repetible."
          : prioritizeLt1
            ? longEvent
              ? "Ahora mismo el objetivo queda por encima de la referencia específica. Antes de exprimir el umbral alto, hace falta desplazar LT1 y la durabilidad para que el ritmo objetivo se pueda sostener sin tanta deriva."
              : "Aunque el objetivo no es largo, LT1 está más retrasado de lo deseable respecto a LT2. Compensa cerrar primero esa base y luego volver a empujar LT2."
            : longEvent
              ? "LT1 ya está relativamente cerca; la limitación visible ahora está más en LT2, aunque la durabilidad sigue siendo obligatoria para sostenerlo en competición."
              : "Ahora mismo el objetivo queda por encima de la referencia específica. El primer cuello de botella es LT2; si no sube, la marca no sale de forma estable.",
    focuses,
    notes,
    scenario,
  };
}

function buildCyclingTargetInsight(params: {
  target: AthleteTarget;
  estimatesByType: Map<string, Estimate>;
  lt1?: ThresholdDisplay;
  lt2?: ThresholdDisplay;
  dynamicThresholds: DynamicThresholds | null;
  vo2maxEstimate?: Estimate;
  athleteWeight?: number | null;
  physiologicalAnalysis?: MesocycleRecommendation["physiological_analysis"] | null;
}): GoalMovementInsight {
  const { target, estimatesByType, lt1, lt2, dynamicThresholds, vo2maxEstimate, athleteWeight, physiologicalAnalysis } = params;
  const targetLabel = buildTargetObjective({ category: target.distance_category, distanceLabel: target.distance_label, fallback: target.objective });
  const targetPower =
    target.discipline === "triatlón"
      ? target.target_cycling_power_watts ?? extractFtpWatts(targetLabel)
      : target.target_power_watts ?? extractFtpWatts(targetLabel);
  const ftpEstimate = estimatesByType.get("FTP");
  const currentFtpPower = ftpEstimate?.value ?? null;
  const currentReferencePower = currentFtpPower ?? dynamicThresholds?.chronic.practical_lt2?.estimated_power_watts ?? lt2?.power_watts ?? null;
  const powerGap = currentReferencePower !== null && targetPower !== null ? targetPower - currentReferencePower : null;
  const useBackendTargets = physiologicalAnalysis?.metric_type === "power_watts";
  const tone: GoalMovementTone =
    powerGap === null ? "neutral" : powerGap <= 0 ? "positive" : powerGap <= 15 ? "neutral" : "negative";

  if (!targetPower) {
    return {
      target,
      contextLabel: target.discipline === "triatlón" ? "Segmento bike del triatlón" : "Objetivo ciclismo",
      targetValue: targetLabel,
      currentValue: currentReferencePower ? formatPowerWithWeight(currentReferencePower, athleteWeight) : "Sin referencia actual",
      gapLabel: "Falta potencia objetivo",
      tone: "negative" as GoalMovementTone,
      movementHeadline: "Primero hay que fijar la potencia objetivo que quieres sostener.",
      summary:
        "Sin una potencia objetivo clara, la plataforma no puede decidir si el cuello de botella está en FTP, en LT2 práctico o en la durabilidad subumbral.",
      focuses: [
        {
          label: "Potencia objetivo",
          current: targetSummaryForDiscipline(target, "ciclismo"),
          tone: "negative",
          description: "Añade FTP o potencia objetivo concreta para que el sistema pueda decir qué debe subir y cuánto.",
        },
      ],
      notes: target.notes ? [target.notes] : [],
    };
  }

  const fallbackTargetLt2Power = targetPower / 0.94;
  const currentLt2Power = lt2?.power_watts ?? dynamicThresholds?.chronic.practical_lt2?.estimated_power_watts ?? null;
  const currentLt1Power = lt1?.power_watts ?? dynamicThresholds?.chronic.practical_lt1?.estimated_power_watts ?? null;
  const enduranceTarget = isEnduranceBikeTarget(target);
  const targetLt2Power = useBackendTargets ? physiologicalAnalysis?.required_lt2_kmh ?? null : fallbackTargetLt2Power;
  const targetSupportPower = useBackendTargets
    ? physiologicalAnalysis?.required_lt1_kmh ?? null
    : enduranceTarget
      ? targetPower * cyclingEnduranceFactor(target)
      : fallbackTargetLt2Power * 0.84;
  const currentSupportRatio = currentLt1Power !== null && currentLt2Power !== null ? currentLt1Power / currentLt2Power : null;
  const targetSupportRatio = targetSupportPower !== null && targetLt2Power !== null ? targetSupportPower / targetLt2Power : null;
  const lt1Gap = currentLt1Power !== null && targetSupportPower !== null ? targetSupportPower - currentLt1Power : null;
  const lt2Gap = currentLt2Power !== null && targetLt2Power !== null ? targetLt2Power - currentLt2Power : null;
  const lt1NearTarget = lt1Gap !== null && lt1Gap <= (enduranceTarget ? 12 : 10);
  const lt1LaggingRelative =
    currentSupportRatio !== null && targetSupportRatio !== null && currentSupportRatio < targetSupportRatio - (enduranceTarget ? 0.04 : 0.06);
  const prioritizeLt1 =
    physiologicalAnalysis?.primary_limiter
      ? physiologicalAnalysis.primary_limiter === "lt1"
      : powerGap !== null && powerGap > 0
      ? enduranceTarget
        ? currentLt1Power === null || lt1LaggingRelative || !lt1NearTarget
        : currentLt1Power !== null && lt1LaggingRelative && (lt1Gap ?? 0) >= 15
      : false;

  const lt1Focus: GoalMovementFocus = {
    label: "LT1 y durabilidad",
    current: currentLt1Power ? formatPowerWithWeight(currentLt1Power, athleteWeight) : "Sin LT1 actual",
    target: targetSupportPower ? formatPowerWithWeight(targetSupportPower, athleteWeight) : useBackendTargets ? "No requerido de forma explícita" : null,
    delta: targetSupportPower
      ? formatPowerGapLabel(currentLt1Power, targetSupportPower)
      : "El selector no fija LT1 requerido formal para este objetivo",
    tone:
      currentLt1Power === null
        ? "negative"
        : targetSupportPower === null
          ? "neutral"
          : currentLt1Power >= targetSupportPower
          ? "positive"
          : targetSupportPower - currentLt1Power <= 18
            ? "neutral"
            : "negative",
    description: useBackendTargets && targetSupportPower === null
      ? "Para este objetivo, el selector de mesociclo no está fijando una referencia LT1 explícita. La decisión fisiológica se apoya sobre todo en LT2/FTP y en el contexto temporal."
      : enduranceTarget
      ? prioritizeLt1
        ? "En triatlón y fondo, la primera palanca suele ser elevar la potencia sostenible por debajo del umbral alto y aguantarla durante más tiempo. Esa base suele facilitar después la subida de LT2 y FTP."
        : "La base subumbral ya acompaña bastante. Hay que sostenerla mientras LT2 y la potencia objetivo terminan de subir."
      : prioritizeLt1
        ? "Aunque el objetivo sea más corto, aquí la base está retrasada respecto a LT2. Cerrar ese hueco hará que el siguiente bloque de FTP/LT2 transfiera mejor."
        : "No es la primera palanca ahora mismo, pero sigue siendo el soporte que estabiliza las mejoras de potencia.",
  };

  const lt2Focus: GoalMovementFocus = {
    label: "LT2",
    current: currentLt2Power ? formatPowerWithWeight(currentLt2Power, athleteWeight) : "Sin LT2 actual",
    target: targetLt2Power ? formatPowerWithWeight(targetLt2Power, athleteWeight) : "Sin LT2 requerido",
    delta: targetLt2Power ? formatPowerGapLabel(currentLt2Power, targetLt2Power) : "El selector no pudo fijar LT2 requerido",
    tone:
      currentLt2Power === null
        ? "negative"
        : targetLt2Power === null
          ? "negative"
          : currentLt2Power >= targetLt2Power
          ? "positive"
          : targetLt2Power - currentLt2Power <= 18
            ? "neutral"
            : "negative",
    description: prioritizeLt1
      ? "Después de mover la base, LT2 tiene que acercarse para que la potencia objetivo deje de quedar por encima del nivel sostenible."
      : enduranceTarget
        ? "LT1 ya acompaña bastante; ahora el salto principal está en LT2 para que la potencia de carrera sea defendible."
        : "Si LT2 no acompaña, el FTP objetivo no se consolida. Es la ancla fisiológica que más tiene que acercarse al objetivo.",
  };

  const ftpFocus: GoalMovementFocus = {
    label: "FTP",
    current: currentFtpPower ? formatPowerWithWeight(currentFtpPower, athleteWeight) : "Sin FTP actual",
    target: formatPowerWithWeight(targetPower, athleteWeight),
    delta: formatPowerGapLabel(currentFtpPower ?? currentReferencePower, targetPower),
    tone:
      currentReferencePower === null
        ? "negative"
        : targetPower <= (currentFtpPower ?? currentReferencePower)
          ? "positive"
          : targetPower - (currentFtpPower ?? currentReferencePower) <= 15
            ? "neutral"
            : "negative",
    description: enduranceTarget
      ? "Es una referencia operativa útil, pero en objetivos largos rara vez es la primera palanca si la base subumbral todavía no acompaña."
      : "Es la referencia más directa para saber si el objetivo de potencia ya es defendible o si sigue por encima del nivel actual.",
  };

  const focuses: GoalMovementFocus[] = prioritizeLt1 ? [lt1Focus, lt2Focus, ftpFocus] : [ftpFocus, lt2Focus, lt1Focus];

  if (!enduranceTarget && vo2maxEstimate) {
    focuses.push({
      label: "VO2max",
      current: `${Math.round(vo2maxEstimate.value * 10) / 10} ml/kg/min`,
      tone: powerGap !== null && powerGap <= 10 ? "neutral" : "negative",
      description: "Cuando el salto de potencia es amplio, el techo aeróbico también tiene que acompañar para que FTP y LT2 puedan subir con solidez.",
    });
  }

  const scenario = buildGoalScenario(
    "Escenario objetivo de lactato",
    useBackendTargets
      ? "Visualización directa de los umbrales requeridos que está usando el selector de mesociclo. Si falta alguna ancla, no se inventa."
      : "Proyección conservadora con LT1 y LT2 para ver qué carga externa debería desplazarse al mismo lactato.",
    "Potencia",
    false,
    [
      goalScenarioPoint("LT1 actual", "Actual", currentLt1Power, lt1?.lactate ?? 2.0),
      goalScenarioPoint("LT2 actual", "Actual", currentLt2Power, lt2?.lactate ?? 4.0),
      goalScenarioPoint("LT1 objetivo", "Objetivo", targetSupportPower, 2.0),
      goalScenarioPoint("LT2 objetivo", "Objetivo", targetLt2Power, 4.0),
    ],
  );

  const notes = [
    ...(useBackendTargets ? ["Esta tarjeta usa los `required_lt1` y `required_lt2` del motor de mesociclos para mantenerse alineada con la recomendación de bloque."] : []),
    ...(useBackendTargets && targetSupportPower === null && targetLt2Power !== null
      ? ["Para esta prueba, el motor está fijando solo un LT2 requerido. No hay un LT1 objetivo formal en la recomendación fisiológica actual."]
      : []),
    "La prioridad cambia con la duración: en bike de fondo o triatlón pesa más la potencia sostenible y la durabilidad; en objetivos cortos o de FTP puro manda más LT2/FTP.",
    ...(target.discipline === "triatlón" ? ["Lectura aplicada al segmento de ciclismo del triatlón objetivo."] : []),
    ...(ftpEstimate?.low_evidence ? ["La estimación actual de FTP todavía tiene evidencia limitada."] : []),
    ...(target.notes ? [target.notes] : []),
  ];

  return {
    target,
    contextLabel: target.discipline === "triatlón" ? "Segmento bike del triatlón" : "Objetivo ciclismo",
    targetValue: formatPowerWithWeight(targetPower, athleteWeight),
    currentValue: currentReferencePower ? formatPowerWithWeight(currentReferencePower, athleteWeight) : "Sin referencia actual",
    gapLabel: formatPowerGapLabel(currentReferencePower, targetPower),
    tone,
    movementHeadline:
      powerGap !== null && powerGap <= 0
        ? "La referencia actual ya entra dentro del objetivo."
        : prioritizeLt1
          ? enduranceTarget
            ? "Primero tiene que moverse LT1 y la durabilidad; después LT2/FTP."
            : "Antes de apretar FTP, falta acercar LT1."
          : enduranceTarget
            ? "LT1 ya acompaña bastante; ahora el cuello de botella principal es LT2/FTP."
            : "Lo primero que tiene que moverse es FTP, sostenido por LT2.",
    summary:
      powerGap === null
        ? "Hay objetivo de ciclismo, pero todavía no hay una referencia comparable suficiente para medir el gap real."
        : powerGap <= 0
          ? "Con las referencias actuales, la potencia objetivo ya queda dentro de lo plausible. El foco pasa a consolidarla y hacerla repetible."
          : prioritizeLt1
            ? enduranceTarget
              ? "Ahora mismo el objetivo queda por encima de la referencia actual. Antes de exprimir LT2 o FTP, hace falta desplazar la base subumbral y la durabilidad para que la potencia de carrera sea sostenible."
              : "Aunque el objetivo no sea de fondo, LT1 está demasiado retrasado respecto a LT2. Conviene cerrar primero esa base y luego volver a empujar FTP."
            : enduranceTarget
              ? "LT1 ya está relativamente cerca; la limitación visible ahora está más en LT2/FTP, aunque la durabilidad sigue siendo obligatoria para sostenerlo el día de carrera."
              : "Ahora mismo el objetivo queda por encima de la referencia actual. El primer cuello de botella es la combinación FTP-LT2.",
    focuses,
    notes,
    scenario,
  };
}

function buildSwimmingTargetInsight(params: {
  target: AthleteTarget;
  displayView: DisciplineView;
}): GoalMovementInsight {
  const { target, displayView } = params;
  const targetPace =
    target.discipline === "triatlón"
      ? parseSwimPaceLabel(target.target_swim_pace_label)
      : parseSwimPaceLabel(target.target_pace_label);
  const sampleCount = displayView.measurement_log.length;
  const notes = [
    ...(target.discipline === "triatlón" ? ["Lectura aplicada solo al segmento de natación del triatlón objetivo."] : []),
    ...(target.notes ? [target.notes] : []),
  ];

  if (!targetPace) {
    return {
      target,
      contextLabel: target.discipline === "triatlón" ? "Segmento swim del triatlón" : "Objetivo natación",
      targetValue: buildTargetObjective({ category: target.distance_category, distanceLabel: target.distance_label, fallback: target.objective }),
      currentValue: sampleCount ? `${sampleCount} muestras con lactato` : "Sin base actual",
      gapLabel: "Falta ritmo objetivo",
      tone: "negative" as GoalMovementTone,
      movementHeadline: "Primero hay que fijar el ritmo objetivo de natación.",
      summary:
        "Sin un ritmo objetivo específico de agua, la plataforma no puede traducir la meta a una palanca fisiológica concreta dentro de natación.",
      focuses: [
        {
          label: "Ritmo objetivo",
          current: targetSummaryForDiscipline(target, "natación"),
          tone: "negative",
          description: "Añade el ritmo objetivo de natación para poder relacionarlo con las futuras anclas de lactato de ese segmento.",
        },
      ],
      notes,
      scenario: null,
    };
  }

  return {
    target,
    contextLabel: target.discipline === "triatlón" ? "Segmento swim del triatlón" : "Objetivo natación",
    targetValue: formatSwimPacePer100m(targetPace),
    currentValue: sampleCount ? `${sampleCount} muestras con lactato` : "Sin predictor específico",
    gapLabel: sampleCount >= 4 ? "Base parcial disponible" : "Faltan tests específicos",
    tone: sampleCount >= 4 ? "neutral" : "negative",
    movementHeadline: "En natación, antes de decir qué umbral mover, falta más ancla específica.",
    summary:
      "La plataforma aún no convierte con suficiente solidez el lactato de natación en una predicción específica de marca. El siguiente paso útil es acumular más tests comparables con ritmo y lactato.",
    focuses: [
      {
        label: "Ritmo objetivo",
        current: formatSwimPacePer100m(targetPace),
        tone: "neutral",
        description: "Esta es la referencia que luego tendremos que contrastar contra umbrales específicos de natación.",
      },
      {
        label: "Base fisiológica",
        current: sampleCount ? `${sampleCount} muestras con lactato` : "Sin muestras útiles",
        target: "4-6 tests comparables",
        delta: sampleCount >= 4 ? "Base mínima ya construida" : `Faltan ${Math.max(0, 4 - sampleCount)} cortes comparables`,
        tone: sampleCount >= 4 ? "neutral" : "negative",
        description: "Antes de decidir si el cuello está en LT1, LT2 o tolerancia al ritmo, necesitamos más histórico específico de natación.",
      },
    ],
    notes,
    scenario: null,
  };
}

function buildTargetMovementInsight(params: {
  targets: AthleteTarget[];
  activeDiscipline: string;
  displayView: DisciplineView;
  estimatesByType: Map<string, Estimate>;
  lt1?: ThresholdDisplay;
  lt2?: ThresholdDisplay;
  dynamicThresholds: DynamicThresholds | null;
  vo2maxEstimate?: Estimate;
  athleteWeight?: number | null;
  physiologicalAnalysis?: MesocycleRecommendation["physiological_analysis"] | null;
}): GoalMovementInsight | null {
  const { targets, activeDiscipline, displayView, estimatesByType, lt1, lt2, dynamicThresholds, vo2maxEstimate, athleteWeight, physiologicalAnalysis } = params;
  const target = selectRelevantTarget(targets, activeDiscipline);
  if (!target) return null;

  if (activeDiscipline === "running") {
    return buildRunningTargetInsight({
      target,
      estimatesByType,
      lt1,
      lt2,
      dynamicThresholds,
      vo2maxEstimate,
      physiologicalAnalysis,
    });
  }

  if (activeDiscipline === "ciclismo") {
    return buildCyclingTargetInsight({
      target,
      estimatesByType,
      lt1,
      lt2,
      dynamicThresholds,
      vo2maxEstimate,
      athleteWeight,
      physiologicalAnalysis,
    });
  }

  return buildSwimmingTargetInsight({ target, displayView });
}

function blockMatchesDiscipline(block: AthleteFocusBlock, discipline: string, athletePrimaryDiscipline: string) {
  const blockDiscipline = block.priority_discipline || athletePrimaryDiscipline;
  return blockDiscipline === discipline;
}

function powerSourceLabel(value?: string | null) {
  if (value === "indoor") return "Potenciómetro de interior";
  if (value === "outdoor") return "Potenciómetro de a pie";
  return "Sin fuente";
}

function focusDirectionLabel(direction?: string) {
  if (direction === "improving") return "Respuesta positiva";
  if (direction === "degrading") return "Respuesta pobre";
  if (direction === "needs_baseline") return "Falta línea base";
  if (direction === "stable") return "Estable";
  return "Por revisar";
}

function latestEstimateByType(estimates: Estimate[]) {
  const grouped = new Map<string, Estimate>();
  for (const estimate of estimates) {
    const current = grouped.get(estimate.estimate_type);
    if (!current || new Date(estimate.valid_on).getTime() >= new Date(current.valid_on).getTime()) {
      grouped.set(estimate.estimate_type, estimate);
    }
  }
  return grouped;
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function thresholdPrimaryValue(threshold: ThresholdDisplay, discipline: string, athleteWeight?: number | null) {
  if (discipline === "ciclismo" && threshold.power_watts) {
    return formatPowerWithWeight(threshold.power_watts, athleteWeight);
  }
  if (threshold.pace_seconds_per_km) {
    return formatPace(threshold.pace_seconds_per_km);
  }
  // HR-only threshold (interpolated cycling)
  if (threshold.heart_rate) {
    return `${threshold.heart_rate} bpm`;
  }
  return "-";
}

function thresholdSecondaryValue(threshold: ThresholdDisplay, discipline: string) {
  // HR-only interpolated threshold
  if (!threshold.pace_seconds_per_km && !threshold.power_watts && !threshold.lactate && threshold.heart_rate) {
    return "Interpolado desde running (HR bridge)";
  }
  if (discipline === "ciclismo") {
    return `${threshold.lactate?.toFixed(1) ?? "-"} mmol/L · ${threshold.heart_rate ?? "-"} bpm`;
  }
  return `${threshold.lactate?.toFixed(1) ?? "-"} mmol/L · ${threshold.heart_rate ?? "-"} bpm`;
}

function thresholdDetailLine(threshold: ThresholdDisplay, discipline: string, athleteWeight?: number | null) {
  // HR-only interpolated threshold
  if (!threshold.pace_seconds_per_km && !threshold.power_watts && threshold.heart_rate) {
    return `FC ${threshold.heart_rate} bpm · Potencia pendiente (necesita entrenos en bici)`;
  }
  if (discipline === "ciclismo") {
    return `Potencia ${formatPowerWithWeight(threshold.power_watts, athleteWeight)} · FC ${threshold.heart_rate ?? "-"} bpm · Lactato ${threshold.lactate?.toFixed(1) ?? "-"} mmol/L`;
  }
  return `Ritmo ${formatPace(threshold.pace_seconds_per_km)} · FC ${threshold.heart_rate ?? "-"} bpm · Lactato ${threshold.lactate?.toFixed(1) ?? "-"} mmol/L`;
}

function thresholdHoverLabel(
  threshold: ThresholdDisplay | undefined,
  discipline: string,
  athleteWeight?: number | null,
  support?: PlotSupportPoint | null,
) {
  if (!threshold) return "Sin referencia visible.";
  const supportDate = support?.sessionDate ?? support?.session_date;
  const supportInterval = support?.intervalLabel ?? support?.interval_label;
  const parts = [];
  if (supportDate) {
    parts.push(`Fecha ${formatDate(supportDate)}`);
  }
  parts.push(thresholdDetailLine(threshold, discipline, athleteWeight));
  if (supportInterval) {
    parts.push(`Intervalo ${supportInterval}`);
  }
  return parts.join(" · ");
}

function dynamicReferenceHoverLabel(
  reference: DynamicReference | null | undefined,
  discipline: string,
  athleteWeight?: number | null,
  support?: PlotSupportPoint | null,
) {
  if (!reference) return "Sin referencia operativa visible.";
  const supportDate = support?.sessionDate ?? support?.session_date;
  const supportInterval = support?.intervalLabel ?? support?.interval_label;
  const parts: string[] = [];
  if (supportDate) {
    parts.push(`Fecha ${formatDate(supportDate)}`);
  }
  if (discipline === "ciclismo" && reference.estimated_power_watts !== null && reference.estimated_power_watts !== undefined) {
    parts.push(`Potencia ${formatPowerWithWeight(reference.estimated_power_watts, athleteWeight)}`);
  } else if (reference.estimated_pace_seconds_per_km !== null && reference.estimated_pace_seconds_per_km !== undefined) {
    parts.push(`Ritmo ${formatPace(reference.estimated_pace_seconds_per_km)}`);
  }
  if (reference.estimated_hr_at_target !== null && reference.estimated_hr_at_target !== undefined) {
    parts.push(`FC ${Math.round(reference.estimated_hr_at_target)} bpm`);
  }
  if (reference.target_lactate !== null && reference.target_lactate !== undefined) {
    parts.push(`Lactato ${reference.target_lactate.toFixed(1)} mmol/L`);
  }
  if (supportInterval) {
    parts.push(`Intervalo ${supportInterval}`);
  }
  return parts.join(" · ") || "Sin referencia operativa visible.";
}

function customThresholdTooltip(
  active: boolean | undefined,
  payload: Array<{ payload?: Record<string, unknown> }> | undefined,
  discipline: string,
  athleteWeight?: number | null,
) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as
    | {
        name?: string;
        label?: string;
        x?: number;
        lactate?: number;
        heartRate?: number | null;
        sessionDate?: string | null;
        intervalLabel?: string | null;
        powerSource?: string | null;
      }
    | undefined;
  if (!point) return null;

  const title = point.name ?? point.label ?? "Referencia";
  const primaryMetric =
    discipline === "ciclismo"
      ? `Potencia ${typeof point.x === "number" ? formatPowerWithWeight(point.x, athleteWeight) : "-"}`
      : `Ritmo ${typeof point.x === "number" ? formatPace(point.x) : "-"}`;

  return (
    <div className="threshold-chart-tooltip">
      <strong>{title}</strong>
      {point.sessionDate ? <span>Fecha {formatDate(point.sessionDate)}</span> : null}
      <span>{primaryMetric}</span>
      {typeof point.heartRate === "number" ? <span>FC {Math.round(point.heartRate)} bpm</span> : null}
      {typeof point.lactate === "number" ? <span>Lactato {point.lactate.toFixed(1)} mmol/L</span> : null}
      {point.powerSource ? <span>Fuente {powerSourceLabel(point.powerSource)}</span> : null}
      {point.intervalLabel ? <span>Intervalo {point.intervalLabel}</span> : null}
    </div>
  );
}

function customGoalScenarioTooltip(
  active: boolean | undefined,
  payload: Array<{ payload?: Record<string, unknown> }> | undefined,
  discipline: string,
  athleteWeight?: number | null,
) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as GoalScenarioPoint | undefined;
  if (!point) return null;

  const primaryMetric =
    discipline === "ciclismo"
      ? `Potencia ${formatPowerWithWeight(point.x, athleteWeight)}`
      : `Ritmo ${formatPace(point.x)}`;

  return (
    <div className="threshold-chart-tooltip goal-scenario-tooltip">
      <strong>{point.label}</strong>
      <span>{point.series}</span>
      <span>{primaryMetric}</span>
      <span>Lactato {point.lactate.toFixed(1)} mmol/L</span>
    </div>
  );
}

function HoverMetaPill({
  className,
  tooltip,
  children,
  onClick,
  pressed,
}: {
  className: string;
  tooltip: string;
  children: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
}) {
  if (onClick) {
    return (
      <button type="button" className={className} aria-pressed={pressed} onClick={onClick}>
        {children}
        <span className="threshold-meta-tooltip">{tooltip}</span>
      </button>
    );
  }

  return (
    <span className={className}>
      {children}
      <span className="threshold-meta-tooltip">{tooltip}</span>
    </span>
  );
}

function anaerobicSummary(threshold: ThresholdDisplay | undefined, discipline: string) {
  if (!threshold) return "n/d";
  if (discipline === "ciclismo") {
    return `${threshold.power_watts ? `${Math.round(threshold.power_watts)} W` : "-"} · ${threshold.heart_rate ?? "-"} bpm`;
  }
  return `${formatPace(threshold.pace_seconds_per_km)} · ${threshold.heart_rate ?? "-"} bpm`;
}

function thresholdSummary(threshold: ThresholdDisplay | undefined, discipline: string) {
  if (!threshold) return "n/d";
  if (discipline === "ciclismo") {
    return `${threshold.power_watts ? `${Math.round(threshold.power_watts)} W` : "-"} · ${threshold.heart_rate ?? "-"} bpm`;
  }
  return `${formatPace(threshold.pace_seconds_per_km)} · ${threshold.heart_rate ?? "-"} bpm`;
}

function hasRenderableThreshold(threshold: ThresholdDisplay | undefined, discipline: string) {
  if (!threshold) return false;
  const hasPrimaryMetric = discipline === "ciclismo" ? threshold.power_watts !== null && threshold.power_watts !== undefined : threshold.pace_seconds_per_km !== null && threshold.pace_seconds_per_km !== undefined;
  return hasPrimaryMetric && threshold.lactate !== null && threshold.lactate !== undefined;
}

function cyclingThresholdRelation(power?: number | null, lt1Power?: number | null, lt2Power?: number | null) {
  if (power === null || power === undefined) return "Sin potencia";
  if (lt1Power && power < lt1Power) return "Por debajo de LT1";
  if (lt1Power && lt2Power && power >= lt1Power && power < lt2Power) return "Entre LT1 y LT2";
  if (lt2Power && power >= lt2Power) return "Por encima de LT2";
  return "Sin referencia suficiente";
}

function estimateLabelValue(estimate?: Estimate) {
  if (!estimate) return "n/d";
  if (estimate.unit === "ml/kg/min") {
    return `${Math.round(estimate.value * 10) / 10} ml/kg/min`;
  }
  if (estimate.unit === "mmol/L/s") {
    return `${Math.round(estimate.value * 100) / 100} mmol/L/s`;
  }
  return `${Math.round(estimate.value * 10) / 10} ${estimate.unit}`;
}

function latestHistorical(points: HistoricalPoint[] | undefined) {
  if (!points?.length) return null;
  return points[points.length - 1];
}

function historicalMetricLabel(key: string) {
  if (key === "LT1") return "LT1";
  if (key === "LT2") return "LT2";
  if (key === "lactate_anchor") return "Ancla de lactato";
  return key;
}

function trendMetricLabel(metric: string) {
  if (metric === "trend_LT1") return "Tendencia LT1";
  if (metric === "trend_LT2") return "Tendencia LT2";
  if (metric === "lactate_anchor_progression") return "Progresión del ancla de lactato";
  return metric.replace(/_/g, " ");
}

function trendDirectionLabel(direction?: string) {
  if (direction === "improving") return "Mejora";
  if (direction === "degrading") return "Descenso";
  return "Estable";
}

function shortenText(value: string, maxLength = 90) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

const CYCLING_CADENCE_BANDS = [
  { label: "60-65", min: 60, max: 65, color: "#6f6ad8" },
  { label: "65-70", min: 65, max: 70, color: "#5e86df" },
  { label: "70-75", min: 70, max: 75, color: "#4d9bc8" },
  { label: "75-80", min: 75, max: 80, color: "#319ea3" },
  { label: "80-85", min: 80, max: 85, color: "#2d9b78" },
  { label: "85-90", min: 85, max: 90, color: "#6d9f39" },
  { label: "90-95", min: 90, max: 95, color: "#b28728" },
  { label: "95+", min: 95, max: null, color: "#c45b2f" },
] as const;

const CYCLING_HISTORY_CADENCE_BANDS = [
  { label: "80-85", min: 80, max: 85, color: "#2f7de1" },
  { label: "85-90", min: 85, max: 90, color: "#2f9e5b" },
  { label: "90-95", min: 90, max: 95, color: "#d4a017" },
] as const;

function cadenceBandLabel(cadence?: number | null) {
  if (cadence === null || cadence === undefined) return null;
  const band = CYCLING_CADENCE_BANDS.find((item) =>
    item.max === null ? cadence >= item.min : cadence >= item.min && cadence < item.max,
  );
  return band?.label ?? null;
}

function cadenceHistoryBandLabel(cadence?: number | null) {
  if (cadence === null || cadence === undefined) return null;
  const band = CYCLING_HISTORY_CADENCE_BANDS.find((item) => cadence >= item.min && cadence < item.max);
  return band?.label ?? null;
}

function metricTone(direction?: string) {
  if (direction === "improving") return "positive";
  if (direction === "degrading") return "negative";
  return "neutral";
}

function evaluationTone(evaluation?: AthleteFocusBlockEvaluation | null) {
  if (!evaluation) return "neutral";
  const absoluteNegative = typeof evaluation.delta === "number" && evaluation.delta < 0;
  const relativeNegative = typeof evaluation.delta_relative === "number" && evaluation.delta_relative < 0;
  if (absoluteNegative || relativeNegative) return "negative";
  const absolutePositive = typeof evaluation.delta === "number" && evaluation.delta > 0;
  const relativePositive = typeof evaluation.delta_relative === "number" && evaluation.delta_relative > 0;
  if (absolutePositive || relativePositive) return "positive";
  return metricTone(evaluation.direction);
}

type IntervalForm = {
  duration_mode: "seconds" | "km";
  duration_value: string;
  rest_seconds: string;
  sampled: boolean;
  lactate_mmol: string;
  sample_delay_seconds: string;
  heart_rate_avg: string;
  pace_min_per_km: string;
  power_watts: string;
  cadence: string;
  heart_rate_max: string;
  rpe: string;
};

const emptyInterval = (sampled = false): IntervalForm => ({
  duration_mode: "seconds",
  duration_value: "240",
  rest_seconds: "60",
  sampled,
  lactate_mmol: "",
  sample_delay_seconds: "30",
  heart_rate_avg: "",
  pace_min_per_km: "",
  power_watts: "",
  cadence: "",
  heart_rate_max: "",
  rpe: "",
});

function parseMinPerKm(value: string) {
  const text = value.trim();
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return minutes * 60 + seconds;
}

type AthleteDetailPageProps = {
  analysis: AthleteAnalysis | null;
  token: string;
  onSaved: () => Promise<void>;
};

export function AthleteDetailPage({ analysis, token, onSaved }: AthleteDetailPageProps) {
  const [trainingGoal, setTrainingGoal] = useState("");
  const [goalCategory, setGoalCategory] = useState("media_distancia");
  const [activeDiscipline, setActiveDiscipline] = useState("running");
  const [interpolatingCycling, setInterpolatingCycling] = useState(false);
  const [interpolationResult, setInterpolationResult] = useState<{ lt1_hr_cycling: number | null; lt2_hr_cycling: number | null; lt1_hr_running: number | null; lt2_hr_running: number | null; hr_offset_applied: number; warnings: string[]; confidence: number } | null>(null);
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().slice(0, 16));
  const [discipline, setDiscipline] = useState("running");
  const [sessionBaselineLactate, setSessionBaselineLactate] = useState("");
  const [sessionPowerSource, setSessionPowerSource] = useState("outdoor");
  const [sessionType, setSessionType] = useState("test incremental");
  const [goal, setGoal] = useState("Registro manual de lactato");
  const [surface, setSurface] = useState("");
  const [temperature, setTemperature] = useState("");
  const [comments, setComments] = useState("");
  const [blocksCount, setBlocksCount] = useState("1");
  const [intervals, setIntervals] = useState<IntervalForm[]>([emptyInterval(true)]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [cyclingPowerSourceMode, setCyclingPowerSourceMode] = useState<"outdoor" | "indoor" | "compare">("outdoor");
  const [cyclingPowerTarget, setCyclingPowerTarget] = useState("");
  const [cyclingPowerTolerance, setCyclingPowerTolerance] = useState("15");
  const [selectedEstimateType, setSelectedEstimateType] = useState<string | null>(null);
  const [thresholdReferenceVisibility, setThresholdReferenceVisibility] = useState({
    lt1: true,
    lt2: true,
    lt1Candidate: true,
    lt2Candidate: true,
    practicalLt1: true,
    practicalLt2: true,
    lt1Real: false,
    lt2Real: false,
    lt1PracticalReal: false,
    lt2PracticalReal: true,
  });
  const [lactateOverlayOpen, setLactateOverlayOpen] = useState(false);
  const [targetsOverlayOpen, setTargetsOverlayOpen] = useState(false);
  const [physiologyReportOpen, setPhysiologyReportOpen] = useState(false);
  const [physiologyReport, setPhysiologyReport] = useState<PhysiologyReport | null>(null);
  const [physiologyReportLoading, setPhysiologyReportLoading] = useState(false);
  const [physiologyReportPdfLoading, setPhysiologyReportPdfLoading] = useState(false);
  const [physiologyReportError, setPhysiologyReportError] = useState<string | null>(null);
  const [planningRecommendation, setPlanningRecommendation] = useState<MesocycleRecommendation | null>(null);
  const [deletingMeasurementId, setDeletingMeasurementId] = useState<number | null>(null);
  const [expandedCyclingPanel, setExpandedCyclingPanel] = useState<"cadence" | "history" | "threshold" | null>(null);
  const [targetSubmitting, setTargetSubmitting] = useState(false);
  const [editingTargetId, setEditingTargetId] = useState<number | null>(null);
  const [triathlonDistancePreset, setTriathlonDistancePreset] = useState("manual");
  const [targetForm, setTargetForm] = useState({
    target_date: new Date().toISOString().slice(0, 10),
    discipline: "running",
    distance_label: "",
    distance_category: "",
    priority_level: "media",
    objective: "",
    target_pace_label: "",
    target_power_watts: "",
    target_running_pace_label: "",
    target_swim_pace_label: "",
    target_cycling_power_watts: "",
    transition_1_seconds: "240",
    transition_2_seconds: "240",
    bike_elevation_gain_m: "0",
    notes: "",
  });

  useEffect(() => {
    if (analysis?.athlete.training_goal) {
      setTrainingGoal(analysis.athlete.training_goal);
    }
  }, [analysis?.athlete.training_goal]);

  useEffect(() => {
    if (analysis?.athlete.goal_category) {
      setGoalCategory(analysis.athlete.goal_category);
    }
  }, [analysis?.athlete.goal_category]);

  useEffect(() => {
    if (!analysis) return;
    setTargetForm((current) => ({
      ...current,
      discipline:
        analysis.athlete.primary_discipline === "triatlón"
          ? current.discipline === "triatlón"
            ? "triatlón"
            : activeDiscipline
          : analysis.athlete.primary_discipline,
    }));
  }, [analysis, activeDiscipline]);

  useEffect(() => {
    if (targetForm.discipline !== "triatlón") return;
    if (triathlonDistancePreset === "manual") return;
    const preset = TRIATHLON_DISTANCE_PRESETS[triathlonDistancePreset as keyof typeof TRIATHLON_DISTANCE_PRESETS];
    if (!preset) return;
    setTargetForm((current) => ({ ...current, distance_label: preset.label }));
  }, [triathlonDistancePreset, targetForm.discipline]);

  useEffect(() => {
    if (discipline === "running") return;
    setIntervals((current) =>
      current.map((item) => ({
        ...item,
        duration_mode: "seconds",
      })),
    );
  }, [discipline]);

  useEffect(() => {
    if (!analysis) return;
    const available = Object.keys(analysis.discipline_views ?? {});
    if (!available.length) {
      setActiveDiscipline(analysis.athlete.primary_discipline);
      return;
    }
    if (analysis.athlete.primary_discipline === "triatlón") {
      if (["natación", "ciclismo", "running"].includes(activeDiscipline)) return;
      setActiveDiscipline("running");
      return;
    }
    setActiveDiscipline(available.includes(analysis.athlete.primary_discipline) ? analysis.athlete.primary_discipline : available[0]);
  }, [analysis, activeDiscipline]);

  useEffect(() => {
    setPhysiologyReport(null);
    setPhysiologyReportOpen(false);
    setPhysiologyReportError(null);
  }, [analysis?.athlete.id, activeDiscipline, cyclingPowerSourceMode]);

  useEffect(() => {
    if (!analysis?.athlete.id) {
      setPlanningRecommendation(null);
      return;
    }
    let cancelled = false;
    setPlanningRecommendation(null);
    void api
      .planningRecommendation(token, analysis.athlete.id, activeDiscipline)
      .then((result) => {
        if (!cancelled) {
          setPlanningRecommendation(result as MesocycleRecommendation);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlanningRecommendation(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [analysis?.athlete.id, activeDiscipline, token]);

  useEffect(() => {
    if (!analysis || activeDiscipline !== "ciclismo") return;
    const sources = Object.keys(analysis.discipline_views?.ciclismo?.power_source_views ?? {});
    if (!sources.length) return;
    if (cyclingPowerSourceMode === "compare") return;
    if (!sources.includes(cyclingPowerSourceMode)) {
      setCyclingPowerSourceMode((sources.includes("outdoor") ? "outdoor" : sources[0]) as "outdoor" | "indoor");
    }
  }, [analysis, activeDiscipline, cyclingPowerSourceMode]);

  useEffect(() => {
    if (!analysis || activeDiscipline !== "ciclismo" || cyclingPowerTarget) return;
    const fallbackDisciplineKey =
      analysis.athlete.primary_discipline === "ciclismo" ? "ciclismo" : Object.keys(analysis.discipline_views ?? {}).find((key) => key === "ciclismo");
    if (!fallbackDisciplineKey) return;
    const sourceViews = analysis.discipline_views?.[fallbackDisciplineKey]?.power_source_views ?? {};
    const idealSource =
      cyclingPowerSourceMode === "compare"
        ? (sourceViews.outdoor ? "outdoor" : Object.keys(sourceViews)[0])
        : cyclingPowerSourceMode;
    const view =
      (idealSource ? analysis.discipline_views?.[fallbackDisciplineKey]?.power_source_views?.[idealSource] : null) ??
      analysis.discipline_views?.[fallbackDisciplineKey];
    const lt1Threshold = resolveTrainingThreshold(view, "LT1");
    if (lt1Threshold?.powerWatts) {
      setCyclingPowerTarget(String(Math.round(lt1Threshold.powerWatts / 5) * 5));
      return;
    }
    const ftpEstimate = latestEstimateByType(view?.estimates ?? []).get("FTP");
    if (ftpEstimate) {
      setCyclingPowerTarget(String(Math.round(ftpEstimate.value / 5) * 5));
      return;
    }
    const firstEntry = view?.measurement_log.find((entry) => entry.power_watts !== null && entry.power_watts !== undefined);
    if (firstEntry?.power_watts) {
      setCyclingPowerTarget(String(Math.round(firstEntry.power_watts / 5) * 5));
    }
  }, [analysis, activeDiscipline, cyclingPowerTarget, cyclingPowerSourceMode]);

  const estimatedTypeOptions = Array.from(
    latestEstimateByType(
      analysis
        ? [
            ...(analysis.estimates ?? []),
            ...Object.values(analysis.discipline_views ?? {}).flatMap((view) => [
              ...(view.estimates ?? []),
              ...Object.values(view.power_source_views ?? {}).flatMap((sourceView) => sourceView.estimates ?? []),
            ]),
          ]
        : [],
    ).values(),
  )
    .filter((estimate) => ["Maratón", "HM", "10K", "5K", "FTP", "VO2max"].includes(estimate.estimate_type))
    .sort((a, b) => relevantEstimateRank(a.estimate_type) - relevantEstimateRank(b.estimate_type))
    .map((estimate) => estimate.estimate_type);

  useEffect(() => {
    if (!estimatedTypeOptions.length) {
      setSelectedEstimateType(null);
      return;
    }
    setSelectedEstimateType((current) =>
      current && estimatedTypeOptions.includes(current)
        ? current
        : estimatedTypeOptions[0],
    );
  }, [activeDiscipline, estimatedTypeOptions]);

  if (!analysis) {
    return <div className="loading">Cargando análisis...</div>;
  }

  const fallbackView: DisciplineView = {
    discipline: analysis.athlete.primary_discipline,
    power_source: null,
    latest_snapshot_date: analysis.latest_snapshot_date,
    thresholds: analysis.thresholds,
    zones: analysis.zones,
    estimates: analysis.estimates,
    recent_sessions: analysis.recent_sessions,
    curve_history: analysis.curve_history,
    historical_evolution: analysis.historical_evolution,
    power_bests: [],
    measurement_log: [],
    dynamic_thresholds: analysis.dynamic_thresholds ?? null,
    power_source_views: null,
  };
  const resolveDisciplineView = (disciplineKey: string) => {
    const directView = analysis.discipline_views?.[disciplineKey];
    const hasAnyDisciplineViews = Object.keys(analysis.discipline_views ?? {}).length > 0;
    if (directView) return directView;
    if (analysis.athlete.primary_discipline === disciplineKey) {
      return fallbackView;
    }
    if (!hasAnyDisciplineViews && analysis.athlete.primary_discipline !== "triatlón") {
      return fallbackView;
    }
    return buildEmptyDisciplineView(disciplineKey);
  };
  const currentView = resolveDisciplineView(activeDiscipline);
  const availableCyclingSourceViews = currentView.power_source_views ?? {};
  const preferredCyclingSource =
    cyclingPowerSourceMode === "compare"
      ? (availableCyclingSourceViews.outdoor ? "outdoor" : Object.keys(availableCyclingSourceViews)[0] || "outdoor")
      : cyclingPowerSourceMode;
  const selectedCyclingView =
    activeDiscipline === "ciclismo"
      ? availableCyclingSourceViews[preferredCyclingSource] ?? currentView
      : currentView;
  const sortedWeightEntries =
    (analysis.athlete.weights ?? [])
      .filter((entry) => isPlausibleAthleteWeight(entry.weight))
      .slice()
      .sort((a, b) => {
      const dateDiff = String(b.recorded_at).localeCompare(String(a.recorded_at));
      return dateDiff !== 0 ? dateDiff : b.id - a.id;
    });
  const latestWeightEntry = sortedWeightEntries[0];
  const athleteWeight = latestWeightEntry?.weight ?? (isPlausibleAthleteWeight(analysis.athlete.weight) ? analysis.athlete.weight : null);
  const weightTrendReference =
    latestWeightEntry
      ? sortedWeightEntries.find((entry) => {
          const latestDate = new Date(latestWeightEntry.recorded_at).getTime();
          const entryDate = new Date(entry.recorded_at).getTime();
          return latestDate - entryDate >= 21 * 24 * 60 * 60 * 1000;
        }) ?? sortedWeightEntries[sortedWeightEntries.length - 1]
      : undefined;
  const weightTrendValue =
    latestWeightEntry && weightTrendReference && latestWeightEntry.id !== weightTrendReference.id
      ? Number((latestWeightEntry.weight - weightTrendReference.weight).toFixed(1))
      : null;
  const targetHints = buildObjectiveHints(targetForm);
  const cyclingReferenceView =
    analysis.discipline_views?.ciclismo?.power_source_views?.outdoor ??
    analysis.discipline_views?.ciclismo?.power_source_views?.indoor ??
    analysis.discipline_views?.ciclismo ??
    null;
  const ironmanLactateReference =
    targetForm.discipline === "triatlón" && triathlonPresetKeyFromLabel(targetForm.distance_label) === "ironman"
      ? estimatePowerAtLactate(cyclingReferenceView?.measurement_log ?? [], 2.2)
      : null;
  const triathlonHints = buildTriathlonDisciplineHints(targetForm, athleteWeight);
  if (ironmanLactateReference && targetForm.discipline === "triatlón") {
    const relative = athleteWeight ? `${(ironmanLactateReference.power / athleteWeight).toFixed(2)} W/kg` : null;
    triathlonHints.bike.push(
      `Comentario fisiológico: en tu histórico ciclista, ~2.2 mmol se sitúan alrededor de ${Math.round(ironmanLactateReference.power)} W${relative ? ` · ${relative}` : ""}${
        ironmanLactateReference.power_source ? ` (${powerSourceLabel(ironmanLactateReference.power_source)})` : ""
      }. Úsalo como referencia orientativa para el tramo IM; no modifica el cálculo del objetivo.`,
    );
  }
  const triathlonPlannerSummary = buildTriathlonPlannerSummary(targetForm);
  const displayView = activeDiscipline === "ciclismo" ? selectedCyclingView : currentView;
  const dynamicThresholds: DynamicThresholds | null = displayView.dynamic_thresholds ?? currentView.dynamic_thresholds ?? null;
  const estimatesByType = latestEstimateByType(displayView.estimates);
  const vo2maxEstimate = estimatesByType.get("VO2max");
  const vlamaxEstimate = estimatesByType.get("VLAMAX");
  const hasHistoricalEvolution = ["LT1", "LT2", "lactate_anchor"].some(
    (key) => (displayView.historical_evolution[key] ?? []).length > 0,
  );
  function resolveViewThreshold(
    sourceView: DisciplineView,
    thresholdName: "LT1" | "LT2",
    _disciplineKey: string,
  ) {
    return resolvedThresholdToDisplay(resolveTrainingThreshold(sourceView, thresholdName), sourceView.power_source);
  }

  const lt1 = resolveViewThreshold(displayView, "LT1", activeDiscipline);
  const lt2 = resolveViewThreshold(displayView, "LT2", activeDiscipline);
  const visibleThresholdCards = [lt1, lt2].filter(isDefined);
  const cyclingEntries = displayView.measurement_log.filter(
    (entry) => entry.power_watts !== null && entry.power_watts !== undefined && entry.cadence !== null && entry.cadence !== undefined,
  );
  const comparableCyclingTarget =
    cyclingPowerTarget ||
    (lt1?.power_watts ? String(Math.round(lt1.power_watts / 5) * 5) : estimatesByType.get("FTP") ? String(Math.round(estimatesByType.get("FTP")!.value / 5) * 5) : cyclingEntries[0]?.power_watts ? String(Math.round((cyclingEntries[0].power_watts as number) / 5) * 5) : "");
  const comparableTolerance = Math.max(5, Number(cyclingPowerTolerance) || 15);
  const filteredCyclingEntries =
    activeDiscipline === "ciclismo" && comparableCyclingTarget
      ? cyclingEntries.filter((entry) => Math.abs((entry.power_watts as number) - Number(comparableCyclingTarget)) <= comparableTolerance)
      : [];
  const cadenceBandTrendMap = new Map<
    string,
    {
      label: string;
      color: string;
      values: number[];
      powers: number[];
      first?: number;
      last?: number;
      count: number;
    }
  >();
  const trendDateMap = new Map<string, Record<string, number | string | null>>();

  filteredCyclingEntries.forEach((entry) => {
    const bandLabel = cadenceBandLabel(entry.cadence);
    if (!bandLabel) return;
    const bandMeta = CYCLING_CADENCE_BANDS.find((item) => item.label === bandLabel);
    const dateKey = entry.session_date;
    const trendRow = trendDateMap.get(dateKey) ?? { date: dateKey };
    const currentValue = trendRow[bandLabel];
    const currentPowerValue = trendRow[`${bandLabel}__power`];
    const nextValue = typeof currentValue === "number" ? (currentValue + entry.lactate_mmol) / 2 : entry.lactate_mmol;
    const nextPowerValue =
      typeof currentPowerValue === "number" ? (currentPowerValue + (entry.power_watts as number)) / 2 : (entry.power_watts as number);
    trendRow[bandLabel] = Math.round(nextValue * 100) / 100;
    trendRow[`${bandLabel}__power`] = Math.round(nextPowerValue);
    trendDateMap.set(dateKey, trendRow);

    const currentBand =
      cadenceBandTrendMap.get(bandLabel) ?? { label: bandLabel, color: bandMeta?.color ?? "#17343c", values: [], powers: [], count: 0 };
    currentBand.values.push(entry.lactate_mmol);
    currentBand.powers.push(entry.power_watts as number);
    currentBand.count += 1;
    cadenceBandTrendMap.set(bandLabel, currentBand);
  });

  const cyclingCadenceTrendData = Array.from(trendDateMap.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  const dynamicHistoryMetricKey = activeDiscipline === "ciclismo" ? "estimated_power_watts" : "estimated_pace_seconds_per_km";
  const dynamicHistoryUnit = activeDiscipline === "ciclismo" ? "W" : "s/km";
  const acuteHistory = dynamicThresholds?.history?.acute_practical_lt2 ?? [];
  const chronicHistory = dynamicThresholds?.history?.chronic_practical_lt2 ?? [];
  const dynamicHistoryMap = new Map<string, { date: string; acute?: number | null; chronic?: number | null }>();
  acuteHistory.forEach((point) => {
    dynamicHistoryMap.set(point.date, { ...(dynamicHistoryMap.get(point.date) ?? { date: point.date }), acute: point.value });
  });
  chronicHistory.forEach((point) => {
    dynamicHistoryMap.set(point.date, { ...(dynamicHistoryMap.get(point.date) ?? { date: point.date }), chronic: point.value });
  });
  const dynamicHistoryData = Array.from(dynamicHistoryMap.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const chronicDynamicReferenceRows: Array<{ label: string; reference: DynamicReference | null | undefined }> = [
    { label: "2 mmol", reference: dynamicThresholds?.chronic.reference_2mmol },
    { label: "4 mmol", reference: dynamicThresholds?.chronic.reference_4mmol },
    { label: "LT1 práctico", reference: dynamicThresholds?.chronic.practical_lt1 },
    { label: "LT2 práctico", reference: dynamicThresholds?.chronic.practical_lt2 },
  ];
  const practicalChartReferences = {
    pace: [
      dynamicThresholds?.chronic.practical_lt1?.estimated_pace_seconds_per_km !== undefined && dynamicThresholds?.chronic.practical_lt1?.estimated_pace_seconds_per_km !== null
        ? { label: "LT1 práctico", value: dynamicThresholds.chronic.practical_lt1.estimated_pace_seconds_per_km, color: "#2d8f5b" }
        : null,
      dynamicThresholds?.chronic.practical_lt2?.estimated_pace_seconds_per_km !== undefined && dynamicThresholds?.chronic.practical_lt2?.estimated_pace_seconds_per_km !== null
        ? { label: "LT2 práctico", value: dynamicThresholds.chronic.practical_lt2.estimated_pace_seconds_per_km, color: "#d26a36" }
        : null,
    ].filter((item): item is PracticalChartReference => Boolean(item)),
    power: [
      dynamicThresholds?.chronic.practical_lt1?.estimated_power_watts !== undefined && dynamicThresholds?.chronic.practical_lt1?.estimated_power_watts !== null
        ? { label: "LT1 práctico", value: dynamicThresholds.chronic.practical_lt1.estimated_power_watts, color: "#2d8f5b" }
        : null,
      dynamicThresholds?.chronic.practical_lt2?.estimated_power_watts !== undefined && dynamicThresholds?.chronic.practical_lt2?.estimated_power_watts !== null
        ? { label: "LT2 práctico", value: dynamicThresholds.chronic.practical_lt2.estimated_power_watts, color: "#d26a36" }
        : null,
    ].filter((item): item is PracticalChartReference => Boolean(item)),
    heartRate: [
      dynamicThresholds?.chronic.practical_lt1?.estimated_hr_at_target !== undefined && dynamicThresholds?.chronic.practical_lt1?.estimated_hr_at_target !== null
        ? { label: "LT1 práctico", value: dynamicThresholds.chronic.practical_lt1.estimated_hr_at_target, color: "#2d8f5b" }
        : null,
      dynamicThresholds?.chronic.practical_lt2?.estimated_hr_at_target !== undefined && dynamicThresholds?.chronic.practical_lt2?.estimated_hr_at_target !== null
        ? { label: "LT2 práctico", value: dynamicThresholds.chronic.practical_lt2.estimated_hr_at_target, color: "#d26a36" }
        : null,
    ].filter((item): item is PracticalChartReference => Boolean(item)),
  };
  const dynamicWarningCards = (dynamicThresholds?.warnings ?? []).map(describeDynamicWarning);
  const practicalThresholdPlotReferences = {
    lt1:
      activeDiscipline === "ciclismo"
        ? dynamicThresholds?.chronic.practical_lt1?.estimated_power_watts
        : dynamicThresholds?.chronic.practical_lt1?.estimated_pace_seconds_per_km,
    lt2:
      activeDiscipline === "ciclismo"
        ? dynamicThresholds?.chronic.practical_lt2?.estimated_power_watts
        : dynamicThresholds?.chronic.practical_lt2?.estimated_pace_seconds_per_km,
  };
  const targetMovementInsight = buildTargetMovementInsight({
    targets: analysis.athlete.targets ?? [],
    activeDiscipline,
    displayView,
    estimatesByType,
    lt1,
    lt2,
    dynamicThresholds,
    vo2maxEstimate,
    athleteWeight,
    physiologicalAnalysis: planningRecommendation?.physiological_analysis ?? null,
  });
  const latestSnapshotLabel = displayView.latest_snapshot_date ? formatDate(displayView.latest_snapshot_date) : "Sin snapshot";
  const activeTarget = targetMovementInsight?.target ?? selectRelevantTarget(analysis.athlete.targets ?? [], activeDiscipline);
  const nextTargetLabel = activeTarget ? compactTargetLabel(activeTarget) : "Define una meta";
  const nextTargetTotalTime = activeTarget ? targetTotalTimeLabel(activeTarget, activeDiscipline) : null;
  const nextTargetMetric = activeTarget ? targetMetricDetailLabel(activeTarget, activeDiscipline) : null;
  const nextTargetValue = activeTarget ? [nextTargetLabel, nextTargetTotalTime].filter(Boolean).join(" · ") : "Define una meta";
  const nextTargetDetail = activeTarget
    ? [nextTargetMetric, `Objetivo ${formatDate(activeTarget.target_date)}`].filter(Boolean).join(" · ")
    : "Sin objetivo";
  const sectionLinks: AthleteDetailSectionLink[] = [
    { id: "thresholds", label: "Mapa de umbrales", shortLabel: "Umbrales" },
    ...(targetMovementInsight ? [{ id: "goal-gap", label: "Qué mover para el objetivo", shortLabel: "Objetivo" }] : []),
    ...(activeDiscipline === "ciclismo" && displayView.measurement_log.length ? [{ id: "cycling-insights", label: "Insights de ciclismo", shortLabel: "Ciclismo" }] : []),
    ...(dynamicThresholds ? [{ id: "dynamic-references", label: "Referencias dinámicas", shortLabel: "Dinámicas" }] : []),
    { id: "estimates", label: "Referencias estimadas", shortLabel: "Estimadas" },
    { id: "history", label: "Evolución histórica", shortLabel: "Histórico" },
    { id: "measurements", label: "Histórico de muestras", shortLabel: "Muestras" },
  ];
  const summaryCards = [
    {
      label: "Disciplina activa",
      value: disciplineLabel(activeDiscipline),
      detail: displayView.power_source ? powerSourceLabel(displayView.power_source) : "Vista principal",
      tone: "neutral",
    },
    {
      label: "Último snapshot",
      value: latestSnapshotLabel,
      detail: hasHistoricalEvolution ? "Con evolución longitudinal" : "Todavía sin serie robusta",
      tone: hasHistoricalEvolution ? "positive" : "warning",
    },
    {
      label: "Objetivo activo",
      value: nextTargetValue,
      detail: nextTargetDetail,
      tone: activeTarget ? "neutral" : "warning",
    },
    {
      label: "Muestras visibles",
      value: `${displayView.measurement_log.length}`,
      detail: activeDiscipline === "ciclismo" ? "con potencia y lactato" : "muestras de lactato filtradas",
      tone: displayView.measurement_log.length >= 6 ? "positive" : "warning",
    },
  ];
  function scrollToSection(sectionId: string) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const cyclingCadenceBandSummaries = CYCLING_CADENCE_BANDS.map((band) => {
    const raw = cadenceBandTrendMap.get(band.label);
    const orderedBandValues = cyclingCadenceTrendData
      .map((row) => row[band.label])
      .filter((value): value is number => typeof value === "number");
    const first = orderedBandValues[0];
    const last = orderedBandValues[orderedBandValues.length - 1];
    return {
      label: band.label,
      color: band.color,
      count: raw?.count ?? 0,
      average: raw?.values.length ? raw.values.reduce((sum, value) => sum + value, 0) / raw.values.length : null,
      averagePower: raw?.powers.length ? raw.powers.reduce((sum, value) => sum + value, 0) / raw.powers.length : null,
      minPower: raw?.powers.length ? Math.min(...raw.powers) : null,
      maxPower: raw?.powers.length ? Math.max(...raw.powers) : null,
      first,
      last,
      delta: first !== undefined && last !== undefined ? last - first : null,
    };
  }).filter((item) => item.count > 0);
  const cyclingScatterData = filteredCyclingEntries.map((entry, index) => ({
    id: `${entry.session_id}-${entry.interval_label}-${index}`,
    cadence: entry.cadence as number,
    lactate: entry.lactate_mmol,
    power: entry.power_watts as number,
    date: entry.session_date,
    band: cadenceBandLabel(entry.cadence) ?? "n/d",
  }));
  const cyclingComparableRows = filteredCyclingEntries
    .slice()
    .sort((a, b) => String(b.session_date).localeCompare(String(a.session_date)))
    .slice(0, 16);
  const cyclingThresholdPowerRows = cyclingEntries
    .slice()
    .sort((a, b) => ((b.power_watts as number) - (a.power_watts as number)))
    .slice(0, 20);
  const cyclingThresholdPlotData = cyclingThresholdPowerRows.map((entry, index) => ({
    id: `${entry.session_id}-${entry.interval_label}-plot-${index}`,
    sessionDate: entry.session_date,
    intervalLabel: entry.interval_label,
    power: entry.power_watts as number,
    wattsPerKg: entry.power_watts && athleteWeight ? Number(((entry.power_watts as number) / athleteWeight).toFixed(2)) : null,
    lactate: entry.lactate_mmol,
    cadence: entry.cadence,
    relation: cyclingThresholdRelation(entry.power_watts, lt1?.power_watts, lt2?.power_watts),
  }));
  const lt1FocusWindow = lt1?.power_watts ? 22 : null;
  const cyclingThresholdLt1FocusData =
    lt1?.power_watts && lt1FocusWindow
      ? cyclingThresholdPlotData.filter((point) => Math.abs(point.power - lt1.power_watts!) <= lt1FocusWindow)
      : [];
  const thresholdPowerValues = cyclingThresholdPlotData.map((point) => point.power);
  const thresholdLactateValues = cyclingThresholdPlotData.map((point) => point.lactate);
  const thresholdPowerMin = thresholdPowerValues.length ? Math.min(...thresholdPowerValues) : null;
  const thresholdPowerMax = thresholdPowerValues.length ? Math.max(...thresholdPowerValues) : null;
  const thresholdLactateMin = thresholdLactateValues.length ? Math.min(...thresholdLactateValues) : null;
  const thresholdLactateMax = thresholdLactateValues.length ? Math.max(...thresholdLactateValues) : null;
  const lt1FocusPowerValues = cyclingThresholdLt1FocusData.map((point) => point.power);
  const lt1FocusLactateValues = cyclingThresholdLt1FocusData.map((point) => point.lactate);
  const lt1FocusPowerMin = lt1FocusPowerValues.length ? Math.min(...lt1FocusPowerValues) : null;
  const lt1FocusPowerMax = lt1FocusPowerValues.length ? Math.max(...lt1FocusPowerValues) : null;
  const lt1FocusLactateMin = lt1FocusLactateValues.length ? Math.min(...lt1FocusLactateValues) : null;
  const lt1FocusLactateMax = lt1FocusLactateValues.length ? Math.max(...lt1FocusLactateValues) : null;
  const cyclingEfficiencyHistoryData = cyclingEntries
    .map((entry, index) => ({
      id: `${entry.session_id}-${entry.interval_label}-history-${index}`,
      sessionDate: entry.session_date,
      intervalLabel: entry.interval_label,
      wattsPerKg: entry.power_watts && athleteWeight ? Number(((entry.power_watts as number) / athleteWeight).toFixed(2)) : null,
      lactate: entry.lactate_mmol,
      heartRate: entry.heart_rate_avg ?? null,
      cadence: entry.cadence ?? null,
      cadenceBand: cadenceHistoryBandLabel(entry.cadence),
    }))
    .filter((entry) => entry.cadenceBand && entry.wattsPerKg !== null)
    .sort((a, b) => String(a.sessionDate).localeCompare(String(b.sessionDate)));

  const chartOverlays = [
    { label: "LT1", value: thresholdSummary(lt1, activeDiscipline), tone: "positive" as const },
    { label: "LT2", value: thresholdSummary(lt2, activeDiscipline), tone: "negative" as const },
    {
      label: "LT1 práctico",
      value: dynamicThresholds ? dynamicReferencePrimaryValue(dynamicThresholds.chronic.practical_lt1, activeDiscipline) : "n/d",
      tone: "positive" as const,
    },
    {
      label: "LT2 práctico",
      value: dynamicThresholds ? dynamicReferencePrimaryValue(dynamicThresholds.chronic.practical_lt2, activeDiscipline) : "n/d",
      tone: "warning" as const,
    },
    { label: "VO2max", value: displayView.swain_vo2max ? `${displayView.swain_vo2max.vo2max} ml/kg/min` : vo2maxEstimate ? `${Math.round(vo2maxEstimate.value * 10) / 10} ml/kg/min` : "n/d", tone: "neutral" as const },
    { label: "VLAMAX", value: vlamaxEstimate ? `${Math.round(vlamaxEstimate.value * 100) / 100} mmol/L/s` : "n/d", tone: "warning" as const },
  ];
  const athleteEstimatePool = [
    ...(currentView.estimates ?? []),
    ...Object.values(currentView.power_source_views ?? {}).flatMap((sourceView) => sourceView.estimates ?? []),
  ];
  const allowedEstimateTypes = estimateTypesForDiscipline(activeDiscipline);
  const relevantEstimates = Array.from(latestEstimateByType(athleteEstimatePool).values())
    .filter((estimate) => allowedEstimateTypes.includes(estimate.estimate_type))
    .filter((estimate) => estimate.discipline === activeDiscipline)
    .sort((a, b) => relevantEstimateRank(a.estimate_type) - relevantEstimateRank(b.estimate_type));
  const selectedRelevantEstimate =
    relevantEstimates.find((estimate) => estimate.estimate_type === selectedEstimateType) ?? relevantEstimates[0] ?? null;
  function openLactateEntryForm() {
    setSaveError(null);
    setSaveMessage(null);
    setLactateOverlayOpen(true);
  }

  function toggleThresholdReference(key: keyof typeof thresholdReferenceVisibility) {
    setThresholdReferenceVisibility((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }
  const focusEvaluationsById = new Map((analysis.focus_block_evaluations ?? []).map((item) => [item.block_id, item]));
  const disciplineFocusBlocks = (analysis.athlete.focus_blocks ?? []).filter((block) =>
    blockMatchesDiscipline(block, activeDiscipline, analysis.athlete.primary_discipline),
  );
  const activeFocusBlock = disciplineFocusBlocks.find((block) => block.status === "active");
  const activeFocusBlockWithEvaluation = activeFocusBlock
    ? { ...activeFocusBlock, evaluation: focusEvaluationsById.get(activeFocusBlock.id) }
    : null;
  function buildPlotView(disciplineKey: string) {
    const baseView = resolveDisciplineView(disciplineKey);
    const availableSourceViews = baseView.power_source_views ?? {};
    const resolvedView =
      disciplineKey === "ciclismo"
        ? availableSourceViews[preferredCyclingSource] ?? baseView
        : baseView;
    const compareViews =
      disciplineKey === "ciclismo" && cyclingPowerSourceMode === "compare"
        ? Object.entries(availableSourceViews)
            .map(([sourceKey, sourceView]) => ({ sourceKey, sourceView }))
            .filter(({ sourceView }) => sourceView.thresholds.length || sourceView.measurement_log.length)
        : [];
    const disciplineEstimates = latestEstimateByType(resolvedView.estimates);
    const disciplineLt1 = resolveViewThreshold(resolvedView, "LT1", disciplineKey);
    const disciplineLt2 = resolveViewThreshold(resolvedView, "LT2", disciplineKey);
    const practicalLt1Reference = resolvedView.dynamic_thresholds?.chronic.practical_lt1 ?? null;
    const practicalLt2Reference = resolvedView.dynamic_thresholds?.chronic.practical_lt2 ?? null;
    const realThresholds: RealThresholds | null = resolvedView.real_thresholds ?? null;
    const lt1Detection = realThresholds?.lt1_detection ?? null;
    const lt2Detection = realThresholds?.lt2_detection ?? null;
    const lt1Candidate = thresholdDetectionToDisplay(lt1Detection, resolvedView.power_source);
    const lt2Candidate = thresholdDetectionToDisplay(lt2Detection, resolvedView.power_source);
    const individualThresholds: IndividualThresholds | null = resolvedView.individual_thresholds ?? mapLegacyRealThresholdsToIndividual(realThresholds);
    const visibleMeasurements = (resolvedView.measurement_log ?? []).filter((entry) => {
      if (historyFrom && entry.session_date < historyFrom) return false;
      if (historyTo && entry.session_date > historyTo) return false;
      if (disciplineKey === "ciclismo" && resolvedView.power_source && entry.power_source && entry.power_source !== resolvedView.power_source) {
        return false;
      }
      return true;
    });
    function resolveMeasurementMatch(x?: number | null, lactate?: number | null) {
      if (typeof x !== "number" || !Number.isFinite(x) || typeof lactate !== "number" || !Number.isFinite(lactate)) {
        return null;
      }
      const candidates = visibleMeasurements
        .map((entry) => {
          const entryX = disciplineKey === "ciclismo" ? entry.power_watts : entry.pace_seconds_per_km;
          if (typeof entryX !== "number" || !Number.isFinite(entryX)) return null;
          const xDelta = Math.abs(entryX - x);
          const lactateDelta = Math.abs(entry.lactate_mmol - lactate);
          const score = xDelta + lactateDelta * (disciplineKey === "ciclismo" ? 18 : 12);
          return { entry, score };
        })
        .filter(isDefined)
        .sort((left, right) => left.score - right.score);
      return candidates[0]?.entry ?? null;
    }
    const lt1Support = resolveMeasurementMatch(
      disciplineKey === "ciclismo" ? disciplineLt1?.power_watts : disciplineLt1?.pace_seconds_per_km,
      disciplineLt1?.lactate,
    );
    const lt2Support = resolveMeasurementMatch(
      disciplineKey === "ciclismo" ? disciplineLt2?.power_watts : disciplineLt2?.pace_seconds_per_km,
      disciplineLt2?.lactate,
    );
    const practicalLt1Support = resolveMeasurementMatch(
      disciplineKey === "ciclismo" ? practicalLt1Reference?.estimated_power_watts : practicalLt1Reference?.estimated_pace_seconds_per_km,
      practicalLt1Reference?.target_lactate,
    );
    const practicalLt2Support = resolveMeasurementMatch(
      disciplineKey === "ciclismo" ? practicalLt2Reference?.estimated_power_watts : practicalLt2Reference?.estimated_pace_seconds_per_km,
      practicalLt2Reference?.target_lactate,
    );
    const lt1CandidateSupport = resolveMeasurementMatch(
      disciplineKey === "ciclismo" ? lt1Candidate?.power_watts : lt1Candidate?.pace_seconds_per_km,
      lt1Candidate?.lactate,
    );
    const lt2CandidateSupport = resolveMeasurementMatch(
      disciplineKey === "ciclismo" ? lt2Candidate?.power_watts : lt2Candidate?.pace_seconds_per_km,
      lt2Candidate?.lactate,
    );
    const disciplinePlotData = [disciplineLt1, disciplineLt2]
      .filter((threshold): threshold is ThresholdDisplay => hasRenderableThreshold(threshold, disciplineKey))
      .map((threshold) => {
        const support = threshold.name === "LT1" ? lt1Support : lt2Support;
        return {
          name: threshold.name,
          x: disciplineKey === "ciclismo" ? (threshold.power_watts as number) : (threshold.pace_seconds_per_km as number),
          lactate: threshold.lactate as number,
          power_source: threshold.power_source ?? resolvedView.power_source,
          sessionDate: support?.session_date ?? null,
          heartRate: threshold.heart_rate ?? support?.heart_rate_avg ?? null,
          intervalLabel: support?.interval_label ?? null,
          powerSource: support?.power_source ?? threshold.power_source ?? resolvedView.power_source,
        };
      });
    const source = disciplineKey === "ciclismo" ? (resolvedView.curve_history.power ?? []) : (resolvedView.curve_history.pace ?? []);
    const pool = source
      .filter((point) => point.x && point.lactate)
      .map((point, index) => ({
        id: `${disciplineKey}-${point.interval_id}-${index}`,
        x: point.x,
        lactate: point.lactate,
        label: point.label,
        sessionDate: point.session_date,
        powerSource: point.power_source,
        heartRate: resolveMeasurementMatch(point.x, point.lactate)?.heart_rate_avg ?? null,
        intervalLabel: resolveMeasurementMatch(point.x, point.lactate)?.interval_label ?? null,
      }))
      .filter((point) => {
        if (historyFrom && point.sessionDate < historyFrom) return false;
        if (historyTo && point.sessionDate > historyTo) return false;
        return true;
      });
    const orderedPool = [...pool].sort((left, right) =>
      disciplineKey === "ciclismo" ? left.x - right.x : right.x - left.x,
    );
    const baselinePoint = orderedPool[0] ?? null;
    const provisionalLt1Point =
      !disciplineLt1 && orderedPool.length >= 2
        ? orderedPool.find((point, index) => index > 0 && point.lactate >= (baselinePoint?.lactate ?? 0) + 0.3) ?? orderedPool[1]
        : null;
    const provisionalLt2Point =
      !disciplineLt2 && orderedPool.length >= 3
        ? orderedPool.find((point, index) => index > 1 && point.lactate >= (baselinePoint?.lactate ?? 0) + 0.9) ??
          orderedPool[orderedPool.length - 1]
        : null;
    const provisionalPlotData = [
      provisionalLt1Point
        ? {
            name: "LT1 provisional",
            x: provisionalLt1Point.x,
            lactate: provisionalLt1Point.lactate,
            label: provisionalLt1Point.label,
          }
        : null,
      provisionalLt2Point
        ? {
            name: "LT2 provisional",
            x: provisionalLt2Point.x,
            lactate: provisionalLt2Point.lactate,
            label: provisionalLt2Point.label,
          }
        : null,
    ].filter(
      (
        point,
      ): point is {
        name: string;
        x: number;
        lactate: number;
        label: string;
      } => point !== null,
    );
    const practicalPlotData = [
      practicalLt1Reference &&
      (disciplineKey === "ciclismo" ? practicalLt1Reference.estimated_power_watts : practicalLt1Reference.estimated_pace_seconds_per_km) !== undefined &&
      (disciplineKey === "ciclismo" ? practicalLt1Reference.estimated_power_watts : practicalLt1Reference.estimated_pace_seconds_per_km) !== null
        ? {
            name: "LT1 práctico",
            x:
              disciplineKey === "ciclismo"
                ? (practicalLt1Reference.estimated_power_watts as number)
                : (practicalLt1Reference.estimated_pace_seconds_per_km as number),
            lactate: practicalLt1Reference.target_lactate ?? 0.16,
            sessionDate: practicalLt1Support?.session_date ?? null,
            heartRate: practicalLt1Reference.estimated_hr_at_target ?? practicalLt1Support?.heart_rate_avg ?? null,
            intervalLabel: practicalLt1Support?.interval_label ?? null,
            powerSource: practicalLt1Support?.power_source ?? resolvedView.power_source,
          }
        : null,
      practicalLt2Reference &&
      (disciplineKey === "ciclismo" ? practicalLt2Reference.estimated_power_watts : practicalLt2Reference.estimated_pace_seconds_per_km) !== undefined &&
      (disciplineKey === "ciclismo" ? practicalLt2Reference.estimated_power_watts : practicalLt2Reference.estimated_pace_seconds_per_km) !== null
        ? {
            name: "LT2 práctico",
            x:
              disciplineKey === "ciclismo"
                ? (practicalLt2Reference.estimated_power_watts as number)
                : (practicalLt2Reference.estimated_pace_seconds_per_km as number),
            lactate: practicalLt2Reference.target_lactate ?? 0.32,
            sessionDate: practicalLt2Support?.session_date ?? null,
            heartRate: practicalLt2Reference.estimated_hr_at_target ?? practicalLt2Support?.heart_rate_avg ?? null,
            intervalLabel: practicalLt2Support?.interval_label ?? null,
            powerSource: practicalLt2Support?.power_source ?? resolvedView.power_source,
          }
        : null,
    ].filter(isDefined);
    const candidatePlotData = [
      lt1Candidate && hasRenderableThreshold(lt1Candidate, disciplineKey)
        ? {
            name: `LT1 señal · ${thresholdDetectionStateLabel(lt1Detection?.state)}`,
            x: disciplineKey === "ciclismo" ? (lt1Candidate.power_watts as number) : (lt1Candidate.pace_seconds_per_km as number),
            lactate: lt1Candidate.lactate as number,
            sessionDate: lt1CandidateSupport?.session_date ?? null,
            heartRate: lt1Candidate.heart_rate ?? lt1CandidateSupport?.heart_rate_avg ?? null,
            intervalLabel: lt1CandidateSupport?.interval_label ?? null,
            powerSource: lt1CandidateSupport?.power_source ?? resolvedView.power_source,
          }
        : null,
      lt2Candidate && hasRenderableThreshold(lt2Candidate, disciplineKey)
        ? {
            name: `LT2 señal · ${thresholdDetectionStateLabel(lt2Detection?.state)}`,
            x: disciplineKey === "ciclismo" ? (lt2Candidate.power_watts as number) : (lt2Candidate.pace_seconds_per_km as number),
            lactate: lt2Candidate.lactate as number,
            sessionDate: lt2CandidateSupport?.session_date ?? null,
            heartRate: lt2Candidate.heart_rate ?? lt2CandidateSupport?.heart_rate_avg ?? null,
            intervalLabel: lt2CandidateSupport?.interval_label ?? null,
            powerSource: lt2CandidateSupport?.power_source ?? resolvedView.power_source,
          }
        : null,
    ].filter(isDefined);
    const comparePools = compareViews.map(({ sourceKey, sourceView }) => ({
      sourceKey,
      color: sourceKey === "indoor" ? "#2f7de1" : "#c45b2f",
      label: powerSourceLabel(sourceKey),
      points: (sourceView.curve_history.power ?? [])
        .filter((point) => point.x && point.lactate)
        .map((point, index) => ({
          id: `${sourceKey}-${point.interval_id}-${index}`,
          x: point.x,
          lactate: point.lactate,
          label: point.label,
          sessionDate: point.session_date,
          powerSource: point.power_source,
        }))
        .filter((point) => {
          if (historyFrom && point.sessionDate < historyFrom) return false;
          if (historyTo && point.sessionDate > historyTo) return false;
          return true;
        }),
      thresholds: sourceView.thresholds,
      lt1: resolveViewThreshold(sourceView, "LT1", disciplineKey),
      lt2: resolveViewThreshold(sourceView, "LT2", disciplineKey),
    }));
    const peakPoint = pool.length
      ? pool.reduce((best, point) => (!best || point.lactate > best.lactate ? point : best), null as (typeof pool)[number] | null)
      : null;
    return {
      view: resolvedView,
      lt1: disciplineLt1,
      lt2: disciplineLt2,
      lt1Detection,
      lt2Detection,
      lt1Candidate,
      lt2Candidate,
      lt1Support,
      lt2Support,
      lt1CandidateSupport,
      lt2CandidateSupport,
      practicalLt1Support,
      practicalLt2Support,
      provisionalLt1: provisionalLt1Point,
      provisionalLt2: provisionalLt2Point,
      plotData: disciplinePlotData,
      candidatePlotData,
      practicalPlotData,
      provisionalPlotData,
      pool,
      comparePools,
      plotLabel: disciplineKey === "ciclismo" ? "Potencia" : "Ritmo en min/km",
      vo2max: disciplineEstimates.get("VO2max"),
      vlamax: disciplineEstimates.get("VLAMAX"),
      peakPoint,
      realThresholds,
      individualThresholds,
    };
  }

  function buildDurationSeconds(interval: IntervalForm) {
    if (interval.duration_mode === "seconds") {
      return Number(interval.duration_value);
    }
    if (discipline !== "running") {
      throw new Error("La duración en km solo está disponible para running.");
    }
    const km = Number(interval.duration_value);
    const pace = parseMinPerKm(interval.pace_min_per_km);
    if (!km || !pace) {
      throw new Error("Si la duración está en km, debes introducir también el ritmo medio en min/km.");
    }
    return Math.round(km * pace);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      await api.createSession(token, {
        athlete_id: analysis!.athlete.id,
        performed_at: performedAt,
        discipline,
        power_source: discipline === "ciclismo" ? sessionPowerSource : null,
        session_type: sessionType,
        goal,
        surface: surface || null,
        temperature_c: temperature ? Number(temperature) : null,
        comments: comments || null,
        intervals: intervals.map((interval, index) => ({
          order_index: index + 1,
          duration_seconds: buildDurationSeconds(interval),
          rest_seconds: interval.rest_seconds ? Number(interval.rest_seconds) : null,
          rest_type: "configured",
          heart_rate_avg: interval.heart_rate_avg ? Number(interval.heart_rate_avg) : null,
          heart_rate_max: interval.heart_rate_max ? Number(interval.heart_rate_max) : null,
          pace_seconds_per_km: discipline === "running" ? parseMinPerKm(interval.pace_min_per_km) : null,
          power_watts: discipline === "ciclismo" && interval.power_watts ? Number(interval.power_watts) : null,
          running_power_watts: null,
          cadence: interval.cadence ? Number(interval.cadence) : null,
          rpe: interval.rpe ? Number(interval.rpe) : null,
          purpose: "LT1",
          notes: null,
          lactate_sample: interval.sampled && interval.lactate_mmol
            ? {
                lactate_mmol: Number(interval.lactate_mmol),
                baseline_lactate: sessionBaselineLactate ? Number(sessionBaselineLactate) : null,
                sample_delay_seconds: interval.sample_delay_seconds ? Number(interval.sample_delay_seconds) : 0,
                sample_timing_label: interval.sample_delay_seconds ? `tras ${interval.sample_delay_seconds}s` : "sin registrar",
                sampling_notes: null,
              }
            : null,
        })),
      });
      setSaveMessage("Sesión y datos de lactato guardados.");
      setIntervals([emptyInterval(true)]);
      setBlocksCount("1");
      setGoal("Registro manual de lactato");
      setComments("");
      setSurface("");
      setTemperature("");
      setSessionBaselineLactate("");
      setLactateOverlayOpen(false);
      await onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar la sesión.");
    } finally {
      setSaving(false);
    }
  }

  function updateInterval(index: number, field: keyof IntervalForm, value: string) {
    const sharedTemplateFields: Array<keyof IntervalForm> = [
      "duration_mode",
      "duration_value",
      "rest_seconds",
      "heart_rate_avg",
      "pace_min_per_km",
      "power_watts",
      "cadence",
      "heart_rate_max",
      "rpe",
    ];
    setIntervals((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex === index) {
          return { ...item, [field]: value };
        }
        if (index === 0 && sharedTemplateFields.includes(field)) {
          return { ...item, [field]: value };
        }
        return item;
      }),
    );
  }

  function updateIntervalBoolean(index: number, value: boolean) {
    setIntervals((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              sampled: value,
              lactate_mmol: value ? item.lactate_mmol : "",
            }
          : item,
      ),
    );
  }

  function applyBlocksCount(nextValue: string) {
    setBlocksCount(nextValue);
    const count = Math.max(1, Number(nextValue) || 1);
    setIntervals((current) => {
      if (count === current.length) return current;
      if (count > current.length) {
        const expanded = [...current, ...Array.from({ length: count - current.length }, () => emptyInterval())];
        return expanded.map((item, itemIndex) => ({
          ...item,
          sampled: itemIndex === expanded.length - 1 ? true : item.sampled,
        }));
      }
      const sliced = current.slice(0, count);
      return sliced.map((item, itemIndex) => ({
        ...item,
        sampled: itemIndex === sliced.length - 1 ? true : item.sampled,
      }));
    });
  }

  async function saveGoal() {
    setSaveError(null);
    try {
      await api.updateAthlete(token, analysis!.athlete.id, {
        training_goal: trainingGoal,
        goal_category: goalCategory,
      });
      await onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el objetivo.");
    }
  }

  async function saveAthleteTarget() {
    setSaveError(null);
    setSaveMessage(null);
    setTargetSubmitting(true);
    try {
      const payload = {
        target_date: targetForm.target_date,
        discipline: targetForm.discipline,
        objective: buildTargetObjective({
          category: targetForm.distance_category,
          distanceLabel: targetForm.distance_label,
          fallback: disciplineLabel(targetForm.discipline),
        }),
        distance_label: targetForm.distance_label || targetCategoryLabel(targetForm.distance_category) || null,
        distance_category: targetForm.distance_category || null,
        priority_level: targetForm.priority_level || null,
        target_pace_label: targetForm.target_pace_label || null,
        target_power_watts: targetForm.target_power_watts ? Number(targetForm.target_power_watts) : null,
        target_running_pace_label: targetForm.target_running_pace_label || null,
        target_swim_pace_label: targetForm.target_swim_pace_label || null,
        target_cycling_power_watts:
          targetForm.target_cycling_power_watts && athleteWeight
            ? Number(targetForm.target_cycling_power_watts) * athleteWeight
            : targetForm.target_cycling_power_watts
              ? Number(targetForm.target_cycling_power_watts)
              : null,
        notes: targetForm.notes || null,
      };
      if (editingTargetId) {
        await api.updateAthleteTarget(token, analysis!.athlete.id, editingTargetId, payload);
      } else {
        await api.addAthleteTarget(token, analysis!.athlete.id, payload);
      }
      setSaveMessage(editingTargetId ? "Objetivo actualizado." : "Objetivo guardado.");
      setTargetsOverlayOpen(false);
      setEditingTargetId(null);
      setTargetForm((current) => ({
        ...current,
        distance_label: "",
        distance_category: "",
        objective: "",
        target_pace_label: "",
        target_power_watts: "",
        target_running_pace_label: "",
        target_swim_pace_label: "",
        target_cycling_power_watts: "",
        transition_1_seconds: "240",
        transition_2_seconds: "240",
        bike_elevation_gain_m: "0",
        notes: "",
      }));
      setTriathlonDistancePreset("manual");
      await onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el objetivo.");
    } finally {
      setTargetSubmitting(false);
    }
  }

  function loadTargetIntoForm(target: AthleteTarget) {
    setEditingTargetId(target.id);
    setTargetForm({
      target_date: target.target_date,
      discipline: target.discipline,
      distance_label: target.distance_label ?? "",
      distance_category: target.distance_category ?? "",
      priority_level: target.priority_level ?? "media",
      objective: target.objective,
      target_pace_label: target.target_pace_label ?? "",
      target_power_watts: target.target_power_watts ? String(target.target_power_watts) : "",
      target_running_pace_label: target.target_running_pace_label ?? "",
      target_swim_pace_label: target.target_swim_pace_label ?? "",
      target_cycling_power_watts:
        target.target_cycling_power_watts && athleteWeight ? (target.target_cycling_power_watts / athleteWeight).toFixed(2) : target.target_cycling_power_watts ? String(target.target_cycling_power_watts) : "",
      transition_1_seconds: "240",
      transition_2_seconds: "240",
      bike_elevation_gain_m: "0",
      notes: target.notes ?? "",
    });
    setTriathlonDistancePreset(target.discipline === "triatlón" ? triathlonPresetKeyFromLabel(target.distance_label) : "manual");
    setTargetsOverlayOpen(true);
  }

  async function deleteTarget(targetId: number) {
    setSaveError(null);
    if (!window.confirm("¿Quieres eliminar este objetivo/competición?")) return;
    try {
      await api.deleteAthleteTarget(token, analysis!.athlete.id, targetId);
      if (editingTargetId === targetId) {
        setEditingTargetId(null);
      }
      setSaveMessage("Objetivo eliminado.");
      await onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo eliminar el objetivo.");
    }
  }

  async function generatePhysiologyReport() {
    if (!analysis) return;
    setPhysiologyReportLoading(true);
    setPhysiologyReportError(null);
    try {
      const powerSource =
        activeDiscipline === "ciclismo" && cyclingPowerSourceMode !== "compare" ? cyclingPowerSourceMode : undefined;
      const report = (await api.generatePhysiologyReport(
        token,
        analysis.athlete.id,
        activeDiscipline,
        powerSource,
      )) as PhysiologyReport;
      setPhysiologyReport(report);
      setPhysiologyReportOpen(true);
    } catch (error) {
      setPhysiologyReport(null);
      setPhysiologyReportOpen(true);
      setPhysiologyReportError(
        error instanceof Error
          ? error.message
          : "No se pudo generar el informe fisiológico.",
      );
    } finally {
      setPhysiologyReportLoading(false);
    }
  }

  async function downloadPhysiologyReportPdf() {
    if (!analysis) return;
    setPhysiologyReportPdfLoading(true);
    setPhysiologyReportError(null);
    try {
      const powerSource =
        activeDiscipline === "ciclismo" && cyclingPowerSourceMode !== "compare" ? cyclingPowerSourceMode : undefined;
      const blob = await api.downloadPhysiologyReportPdf(
        token,
        analysis.athlete.id,
        activeDiscipline,
        powerSource,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `informe-fisiologico-${analysis.athlete.name.toLowerCase().replace(/\s+/g, "-")}-${activeDiscipline}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setPhysiologyReportError(
        error instanceof Error ? error.message : "No se pudo descargar el PDF del informe fisiológico.",
      );
    } finally {
      setPhysiologyReportPdfLoading(false);
    }
  }

  async function deleteMeasurement(intervalId: number, label: string) {
    const confirmed = window.confirm(`¿Eliminar la muestra de lactato de ${label}?`);
    if (!confirmed) return;
    setDeletingMeasurementId(intervalId);
    setSaveError(null);
    setSaveMessage(null);
    try {
      await api.deleteLactateSample(token, intervalId);
      setSaveMessage(`Muestra eliminada de ${label}.`);
      await onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo eliminar la muestra.");
    } finally {
      setDeletingMeasurementId(null);
    }
  }

  function renderCyclingCadenceEvolution(expanded = false) {
    return (
      <div className="cycling-cadence-body">
        {expanded ? (
          <>
            <div className="card-header">
              <div>
                <p className="muted">
                  Compara cómo cambia el lactato en cada franja de cadencia cuando ruedas a una potencia parecida.
                </p>
              </div>
              <div className="cycling-controls">
                <label>
                  Potencia comparable
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={comparableCyclingTarget}
                    onChange={(event) => setCyclingPowerTarget(event.target.value)}
                  />
                </label>
                <label>
                  Tolerancia
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={cyclingPowerTolerance}
                    onChange={(event) => setCyclingPowerTolerance(event.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="cycling-cadence-summary">
              {cyclingCadenceBandSummaries.length ? (
                cyclingCadenceBandSummaries.map((band) => (
                  <article key={band.label} className="cycling-band-card" style={{ borderColor: `${band.color}55` }}>
                    <span className="cycling-band-chip" style={{ backgroundColor: `${band.color}22`, color: band.color }}>
                      {band.label} rpm
                    </span>
                    <strong>{band.average !== null ? `${band.average.toFixed(1)} mmol/L` : "-"}</strong>
                    <p>{band.count} muestras comparables</p>
                    <small>
                      {band.averagePower !== null
                        ? `Potencia media ${Math.round(band.averagePower)} W (${formatWattsPerKg(band.averagePower, athleteWeight)}) · rango ${Math.round(band.minPower ?? band.averagePower)}-${Math.round(band.maxPower ?? band.averagePower)} W`
                        : "Sin potencia comparable suficiente"}
                    </small>
                    <small>
                      {band.delta === null
                        ? "Aún sin evolución suficiente"
                        : band.delta < 0
                          ? `${Math.abs(band.delta).toFixed(1)} mmol/L menos que al inicio`
                          : `${band.delta.toFixed(1)} mmol/L más que al inicio`}
                    </small>
                  </article>
                ))
              ) : (
                <p className="muted">Aún no hay suficientes muestras ciclistas con potencia y cadencia comparables.</p>
              )}
            </div>
          </>
        ) : (
          <div className="cycling-preview-strip">
            <p className="muted">Lectura rápida por bandas de cadencia a potencia comparable.</p>
            <div className="cycling-preview-metrics">
              <span>{comparableCyclingTarget || "300"} W objetivo</span>
              <span>±{cyclingPowerTolerance || "15"} W</span>
              <span>{cyclingCadenceBandSummaries.reduce((total, band) => total + band.count, 0)} muestras</span>
            </div>
          </div>
        )}
        {cyclingCadenceTrendData.length ? (
          <div className="cycling-chart-stack">
            <ResponsiveContainer width="100%" height={expanded ? 380 : 220}>
              <LineChart data={cyclingCadenceTrendData} margin={{ top: 10, right: 20, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                <XAxis dataKey="date" />
                <YAxis unit=" mmol/L" domain={[0, "auto"]} />
                <Tooltip
                  formatter={(value: number, name: string, item) => {
                    const payload = item?.payload as Record<string, number | string | null> | undefined;
                    const power = payload?.[`${name}__power`];
                    if (typeof value !== "number") return value;
                    if (typeof power === "number") {
                      return [`${Math.round(value * 10) / 10} mmol/L · ${Math.round(power)} W`, name];
                    }
                    return [`${Math.round(value * 10) / 10} mmol/L`, name];
                  }}
                />
                {expanded ? <Legend /> : null}
                {CYCLING_CADENCE_BANDS.map((band) => (
                  <Line
                    key={band.label}
                    type="monotone"
                    dataKey={band.label}
                    name={`${band.label} rpm`}
                    stroke={band.color}
                    strokeWidth={2.4}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            {expanded ? (
              <ResponsiveContainer width="100%" height={340}>
                <ScatterChart margin={{ top: 10, right: 20, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                  <XAxis type="number" dataKey="cadence" name="Cadencia" unit=" rpm" domain={[60, "auto"]} />
                  <YAxis type="number" dataKey="lactate" name="Lactato" unit=" mmol/L" domain={[0, "auto"]} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === "Cadencia") return `${Math.round(value)} rpm`;
                      if (name === "Lactato") return `${Math.round(value * 10) / 10} mmol/L`;
                      return `${value}`;
                    }}
                    labelFormatter={(_, payload) => {
                      const point = payload?.[0]?.payload;
                      return point ? `${point.date} · ${Math.round(point.power)} W · ${point.band} rpm` : "Muestra";
                    }}
                  />
                  {CYCLING_CADENCE_BANDS.map((band) => (
                    <Scatter
                      key={band.label}
                      name={band.label}
                      data={cyclingScatterData.filter((point) => point.band === band.label)}
                      fill={band.color}
                      fillOpacity={0.65}
                    >
                      {expanded ? (
                        <LabelList
                          dataKey="power"
                          position="top"
                          formatter={(value: number) => `${Math.round(value)}W`}
                          style={{ fontSize: "0.7rem", fill: band.color, fontWeight: 700 }}
                        />
                      ) : null}
                    </Scatter>
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderCyclingCadenceHistory(expanded = false) {
    if (!cyclingEfficiencyHistoryData.length) {
      return <p className="muted">Aún no hay suficientes muestras entre 80 y 95 rpm con lactato y potencia para esta vista.</p>;
    }
    return (
      <div className="cycling-cadence-body">
        {!expanded ? (
          <div className="cycling-preview-strip">
            <p className="muted">Coste fisiológico reciente entre 80 y 95 rpm.</p>
            <div className="cycling-preview-metrics">
              <span>{cyclingEfficiencyHistoryData.length} registros</span>
              <span>Lactato + FC</span>
            </div>
          </div>
        ) : null}
        <ResponsiveContainer width="100%" height={expanded ? 520 : 230}>
          <ComposedChart data={cyclingEfficiencyHistoryData} margin={{ top: 12, right: 24, left: 4, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
            <XAxis dataKey="sessionDate" />
            <YAxis yAxisId="lactate" unit=" mmol/L" domain={[0, "auto"]} />
            <YAxis yAxisId="fc" orientation="right" unit=" bpm" domain={["auto", "auto"]} />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === "Lactato") return `${Math.round(value * 10) / 10} mmol/L`;
                if (name === "FC") return `${Math.round(value)} bpm`;
                return `${value}`;
              }}
              labelFormatter={(_, payload) => {
                const point = payload?.[0]?.payload as typeof cyclingEfficiencyHistoryData[number] | undefined;
                return point
                  ? `${point.sessionDate} · ${point.intervalLabel} · ${point.cadence ? `${Math.round(point.cadence)} rpm` : "cadencia n/d"} · ${point.wattsPerKg} W/kg`
                  : "Muestra";
              }}
            />
            {expanded ? <Legend /> : null}
            <Line yAxisId="lactate" type="monotone" dataKey="lactate" name="Lactato" stroke="#c07a18" strokeWidth={2.4} dot={false} connectNulls />
            <Line yAxisId="fc" type="monotone" dataKey="heartRate" name="FC" stroke="#1d5c63" strokeWidth={2.2} dot={false} connectNulls />
            {CYCLING_HISTORY_CADENCE_BANDS.map((band) => (
              <Scatter
                key={band.label}
                yAxisId="lactate"
                name={`${band.label} rpm`}
                data={cyclingEfficiencyHistoryData.filter((point) => point.cadenceBand === band.label)}
                fill={band.color}
                fillOpacity={0.75}
              >
                {expanded ? (
                  <LabelList
                    dataKey="wattsPerKg"
                    position="top"
                    formatter={(value: number | null) => (value ? `${value}` : "")}
                    style={{ fontSize: "0.68rem", fill: band.color, fontWeight: 700 }}
                  />
                ) : null}
              </Scatter>
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  function renderCyclingThresholdRelation(expanded = false) {
    return (
      <div className="cycling-cadence-body">
        {expanded ? (
          <div className="threshold-overview">
            <article className="threshold-legend-card lt1">
              <span className="threshold-dot lt1" />
              <div>
                <strong>Referencia LT1</strong>
                <small>{lt1 ? thresholdDetailLine(lt1, "ciclismo", athleteWeight) : "Sin LT1 ciclista"}</small>
              </div>
            </article>
            <article className="threshold-legend-card lt2">
              <span className="threshold-dot lt2" />
              <div>
                <strong>Referencia LT2</strong>
                <small>{lt2 ? thresholdDetailLine(lt2, "ciclismo", athleteWeight) : "Sin LT2 ciclista"}</small>
              </div>
            </article>
          </div>
        ) : (
          <div className="cycling-preview-strip">
            <p className="muted">Cómo se reparten las muestras respecto a LT1 y LT2.</p>
            <div className="cycling-preview-metrics">
              <span>{lt1?.power_watts ? `LT1 ${Math.round(lt1.power_watts)} W` : "LT1 n/d"}</span>
              <span>{lt2?.power_watts ? `LT2 ${Math.round(lt2.power_watts)} W` : "LT2 n/d"}</span>
            </div>
          </div>
        )}
        {cyclingThresholdPlotData.length ? (
          <div className="cycling-threshold-visual">
            {expanded && cyclingThresholdLt1FocusData.length ? (
              <div className="cycling-threshold-focus">
                <div className="card-header">
                  <div>
                    <span className="eyebrow">Zoom LT1</span>
                    <h3>Zona cercana a LT1</h3>
                    <p className="muted">
                      Vista ampliada de las muestras dentro de {lt1FocusWindow} W alrededor de LT1 para distinguir mejor esa zona.
                    </p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={expanded ? 300 : 220}>
                  <ScatterChart margin={{ top: 12, right: 24, left: 4, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                    <XAxis
                      type="number"
                      dataKey="power"
                      name="Potencia"
                      unit=" W"
                      domain={
                        lt1FocusPowerMin !== null && lt1FocusPowerMax !== null
                          ? [Math.max(0, lt1FocusPowerMin - 5), lt1FocusPowerMax + 5]
                          : ["auto", "auto"]
                      }
                    />
                    <YAxis
                      type="number"
                      dataKey="lactate"
                      name="Lactato"
                      unit=" mmol/L"
                      domain={
                        lt1FocusLactateMin !== null && lt1FocusLactateMax !== null
                          ? [Math.max(0, lt1FocusLactateMin - 0.25), lt1FocusLactateMax + 0.25]
                          : [0, "auto"]
                      }
                    />
                    {lt1?.power_watts ? (
                      <ReferenceLine
                        x={lt1.power_watts}
                        stroke="#257a4d"
                        strokeDasharray="6 6"
                        label={expanded ? { value: `LT1 ${Math.round(lt1.power_watts)} W`, position: "insideTopLeft", fill: "#257a4d" } : undefined}
                      />
                    ) : null}
                    <Tooltip
                      formatter={(value: number, name: string, payload) => {
                        const point = payload?.payload as typeof cyclingThresholdPlotData[number] | undefined;
                        if (name === "Potencia") {
                          return point ? `${Math.round(value)} W · ${point.wattsPerKg ?? "-"} W/kg` : `${Math.round(value)} W`;
                        }
                        return `${Math.round(value * 10) / 10} mmol/L`;
                      }}
                      labelFormatter={(_, payload) => {
                        const point = payload?.[0]?.payload as typeof cyclingThresholdPlotData[number] | undefined;
                        return point
                          ? `${point.sessionDate} · ${point.intervalLabel} · ${Math.round(point.power)} W · ${point.wattsPerKg ?? "-"} W/kg · ${point.lactate.toFixed(1)} mmol/L · ${point.cadence ? `${Math.round(point.cadence)} rpm` : "cadencia n/d"}`
                          : "Muestra";
                      }}
                    />
                    <Scatter data={cyclingThresholdLt1FocusData} fill="#257a4d" fillOpacity={0.85} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            ) : null}
            <ResponsiveContainer width="100%" height={expanded ? 380 : 220}>
              <ScatterChart margin={{ top: 12, right: 24, left: 4, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                <XAxis
                  type="number"
                  dataKey="power"
                  name="Potencia"
                  unit=" W"
                  domain={
                    thresholdPowerMin !== null && thresholdPowerMax !== null
                      ? [Math.max(0, thresholdPowerMin - 10), thresholdPowerMax + 10]
                      : ["auto", "auto"]
                  }
                />
                <YAxis
                  type="number"
                  dataKey="lactate"
                  name="Lactato"
                  unit=" mmol/L"
                  domain={
                    thresholdLactateMin !== null && thresholdLactateMax !== null
                      ? [Math.max(0, thresholdLactateMin - 0.4), thresholdLactateMax + 0.4]
                      : [0, "auto"]
                  }
                />
                {lt1?.power_watts ? (
                  <ReferenceLine
                    x={lt1.power_watts}
                    stroke="#257a4d"
                    strokeDasharray="6 6"
                    label={expanded ? { value: `LT1 ${Math.round(lt1.power_watts)} W`, position: "insideTopLeft", fill: "#257a4d" } : undefined}
                  />
                ) : null}
                {lt2?.power_watts ? (
                  <ReferenceLine
                    x={lt2.power_watts}
                    stroke="#d26a36"
                    strokeDasharray="6 6"
                    label={expanded ? { value: `LT2 ${Math.round(lt2.power_watts)} W`, position: "insideTopRight", fill: "#d26a36" } : undefined}
                  />
                ) : null}
                <Tooltip
                  formatter={(value: number, name: string, payload) => {
                    const point = payload?.payload as typeof cyclingThresholdPlotData[number] | undefined;
                    if (name === "Potencia") {
                      return point ? `${Math.round(value)} W · ${point.wattsPerKg ?? "-"} W/kg` : `${Math.round(value)} W`;
                    }
                    return `${Math.round(value * 10) / 10} mmol/L`;
                  }}
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as typeof cyclingThresholdPlotData[number] | undefined;
                    return point
                      ? `${point.sessionDate} · ${point.intervalLabel} · ${Math.round(point.power)} W · ${point.wattsPerKg ?? "-"} W/kg · ${point.lactate.toFixed(1)} mmol/L · ${point.cadence ? `${Math.round(point.cadence)} rpm` : "cadencia n/d"} · ${point.relation}`
                      : "Muestra";
                  }}
                />
                <Scatter data={cyclingThresholdPlotData} fill="#c07a18" fillOpacity={0.82} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="muted">Aún no hay muestras ciclistas suficientes con potencia y lactato.</p>
        )}
      </div>
    );
  }

  return (
    <div className="page-grid">
      {expandedCyclingPanel ? (
        <div className="target-modal-backdrop" onClick={() => setExpandedCyclingPanel(null)}>
          <section className="card target-modal-card lactate-modal-card cycling-panel-modal" onClick={(event) => event.stopPropagation()}>
            <div className="card-header">
              <div>
                <span className="eyebrow">Visualización ampliada</span>
                <h2>
                  {expandedCyclingPanel === "cadence"
                    ? "Evolución del lactato por franjas de cadencia"
                    : expandedCyclingPanel === "history"
                      ? "Histórico por franjas 80-95 rpm"
                      : "Relación entre picos de potencia y lactato"}
                </h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => setExpandedCyclingPanel(null)}>
                Cerrar
              </button>
            </div>
            {expandedCyclingPanel === "cadence"
              ? renderCyclingCadenceEvolution(true)
              : expandedCyclingPanel === "history"
                ? renderCyclingCadenceHistory(true)
                : renderCyclingThresholdRelation(true)}
          </section>
        </div>
      ) : null}

      {physiologyReportOpen ? (
        <div className="target-modal-backdrop" onClick={() => setPhysiologyReportOpen(false)}>
          <section className="card target-modal-card physiology-report-modal" onClick={(event) => event.stopPropagation()}>
            <div className="card-header">
              <div>
                <span className="eyebrow">Informe fisiológico</span>
                <h2>Preview premium para entrenador</h2>
                <p>
                  Generado desde el test incremental visible y la ficha actual del atleta.
                </p>
              </div>
              <div className="physiology-report-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={downloadPhysiologyReportPdf}
                  disabled={!analysis || physiologyReportPdfLoading}
                >
                  {physiologyReportPdfLoading ? "Descargando PDF..." : "Descargar PDF"}
                </button>
                <button className="ghost-button" type="button" onClick={() => setPhysiologyReportOpen(false)}>
                  Cerrar
                </button>
              </div>
            </div>
            <div className="physiology-report-modal-body">
              {physiologyReport ? (
                <>
                  {physiologyReportError ? (
                    <div className="physiology-report-empty-state">
                      <strong>Incidencia en el informe</strong>
                      <p>{physiologyReportError}</p>
                    </div>
                  ) : null}
                  <PhysiologyReportPreview report={physiologyReport} />
                </>
              ) : physiologyReportError ? (
                <div className="physiology-report-empty-state">
                  <strong>No se pudo generar el informe</strong>
                  <p>{physiologyReportError}</p>
                </div>
              ) : physiologyReportLoading ? (
                <div className="physiology-report-empty-state">
                  <strong>Generando informe...</strong>
                  <p>Estamos interpretando el test incremental y preparando el PDF.</p>
                </div>
              ) : (
                <div className="physiology-report-empty-state">
                  <strong>No hay informe visible</strong>
                  <p>Genera el informe fisiológico desde la cabecera del mapa de umbrales.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {lactateOverlayOpen ? (
        <div className="target-modal-backdrop" onClick={() => setLactateOverlayOpen(false)}>
          <section className="card target-modal-card lactate-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="card-header">
              <div>
                <span className="eyebrow">Registro manual</span>
                <h2>Añadir datos de lactato</h2>
                <p>Registra una sesión rápida sin salir de la ficha del atleta.</p>
              </div>
              <button className="ghost-button" type="button" onClick={() => setLactateOverlayOpen(false)}>
                Cerrar
              </button>
            </div>
            <form className="session-form lactate-modal-form" onSubmit={handleSubmit}>
              <label>
                Fecha y hora
                <input type="datetime-local" value={performedAt} onChange={(event) => setPerformedAt(event.target.value)} required />
              </label>
              <label>
                Disciplina
                <select value={discipline} onChange={(event) => setDiscipline(event.target.value)}>
                  <option value="running">Running</option>
                  <option value="ciclismo">Ciclismo</option>
                  <option value="natación">Natación</option>
                  <option value="triatlón">Triatlón</option>
                </select>
              </label>
              <label>
                Tipo de sesión
                <select value={sessionType} onChange={(event) => setSessionType(event.target.value)}>
                  <option value="test incremental">Test incremental</option>
                  <option value="sesión LT1">Sesión LT1</option>
                  <option value="sesión LT2">Sesión LT2</option>
                  <option value="VO2max">VO2max</option>
                  <option value="continuo">Continuo</option>
                  <option value="progresivo">Progresivo</option>
                  <option value="intervalos">Intervalos</option>
                  <option value="competición">Competición</option>
                  <option value="recuperación">Recuperación</option>
                </select>
              </label>
              {discipline === "ciclismo" ? (
                <label>
                  Potenciómetro
                  <select value={sessionPowerSource} onChange={(event) => setSessionPowerSource(event.target.value)}>
                    <option value="outdoor">Potenciómetro de a pie</option>
                    <option value="indoor">Potenciómetro de interior</option>
                  </select>
                </label>
              ) : null}
              <label className="full-width">
                Objetivo
                <input value={goal} onChange={(event) => setGoal(event.target.value)} required />
              </label>
              <label>
                Superficie
                <input value={surface} onChange={(event) => setSurface(event.target.value)} />
              </label>
              <label>
                Temperatura
                <input type="number" step="0.1" value={temperature} onChange={(event) => setTemperature(event.target.value)} />
              </label>
              <label>
                Basal del día (mmol/L)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={sessionBaselineLactate}
                  onChange={(event) => setSessionBaselineLactate(event.target.value)}
                  placeholder="Opcional"
                />
              </label>
              <label>
                Número de bloques
                <input type="number" min="1" value={blocksCount} onChange={(event) => applyBlocksCount(event.target.value)} />
              </label>
              <label className="full-width">
                Comentarios
                <textarea rows={3} value={comments} onChange={(event) => setComments(event.target.value)} />
              </label>

              <div className="full-width interval-stack">
                {intervals.map((interval, index) => (
                  <div key={index} className="card interval-card">
                    <div className="card-header">
                      <h3>Bloque {index + 1}</h3>
                      <span className="muted">Configurado desde el número de bloques</span>
                    </div>
                    <div className="session-form">
                      <label>
                        Unidad duración
                        <select
                          value={interval.duration_mode}
                          onChange={(event) => updateInterval(index, "duration_mode", event.target.value as "seconds" | "km")}
                          disabled={discipline !== "running"}
                        >
                          <option value="seconds">Segundos</option>
                          {discipline === "running" ? <option value="km">Kilómetros</option> : null}
                        </select>
                      </label>
                      <label>
                        Duración
                        <input type="number" step="0.1" value={interval.duration_value} onChange={(event) => updateInterval(index, "duration_value", event.target.value)} required />
                      </label>
                      <label>
                        Descanso
                        <input type="number" value={interval.rest_seconds} onChange={(event) => updateInterval(index, "rest_seconds", event.target.value)} />
                      </label>
                      <label>
                        Lactato
                        <div className="sample-row">
                          <label className="checkbox-row">
                            <input type="checkbox" checked={interval.sampled} onChange={(event) => updateIntervalBoolean(index, event.target.checked)} />
                            <span>Tomar muestra</span>
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={interval.lactate_mmol}
                            onChange={(event) => updateInterval(index, "lactate_mmol", event.target.value)}
                            disabled={!interval.sampled}
                          />
                        </div>
                      </label>
                      <label>
                        Retraso muestra (s)
                        <input
                          type="number"
                          value={interval.sample_delay_seconds}
                          onChange={(event) => updateInterval(index, "sample_delay_seconds", event.target.value)}
                          disabled={!interval.sampled}
                          placeholder="Opcional"
                        />
                      </label>
                      <label>
                        FC media
                        <input type="number" value={interval.heart_rate_avg} onChange={(event) => updateInterval(index, "heart_rate_avg", event.target.value)} placeholder="Opcional" />
                      </label>
                      <label>
                        {discipline === "ciclismo" ? "Potencia media (W)" : "Ritmo medio (min/km)"}
                        {discipline === "ciclismo" ? (
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={interval.power_watts}
                            onChange={(event) => updateInterval(index, "power_watts", event.target.value)}
                            placeholder="250"
                          />
                        ) : (
                          <input
                            value={interval.pace_min_per_km}
                            onChange={(event) => updateInterval(index, "pace_min_per_km", event.target.value)}
                            placeholder="03:30"
                            pattern="\d{1,2}:\d{2}"
                          />
                        )}
                      </label>
                      <label>
                        Cadencia media
                        <input type="number" value={interval.cadence} onChange={(event) => updateInterval(index, "cadence", event.target.value)} placeholder="Opcional" />
                      </label>
                      <label>
                        FC máxima
                        <input type="number" value={interval.heart_rate_max} onChange={(event) => updateInterval(index, "heart_rate_max", event.target.value)} placeholder="Opcional" />
                      </label>
                      <label>
                        RPE
                        <input type="number" min="0" max="10" step="0.5" value={interval.rpe} onChange={(event) => updateInterval(index, "rpe", event.target.value)} placeholder="Opcional" />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              {saveError ? <p className="error full-width">{saveError}</p> : null}
              {saveMessage ? <p className="full-width">{saveMessage}</p> : null}
              <div className="button-row full-width">
                <button className="primary-button" type="submit" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar sesión de lactato"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {targetsOverlayOpen ? (
        <div className="target-modal-backdrop" onClick={() => setTargetsOverlayOpen(false)}>
          <section className="card target-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="card-header">
              <div>
                <span className="eyebrow">Objetivos</span>
                <h2>Objetivos y competiciones</h2>
                <p>Configura distancia, prioridad y referencias operativas sin salir de la ficha del atleta.</p>
              </div>
              <button className="ghost-button" type="button" onClick={() => setTargetsOverlayOpen(false)}>
                Cerrar
              </button>
            </div>
            <div className="list target-history-list modal-target-history">
              {(analysis.athlete.targets ?? []).map((target) => (
                <article key={target.id} className="list-item target-history-item">
                  <div className="status-head">
                    <strong>{buildTargetObjective({ category: target.distance_category, distanceLabel: target.distance_label, fallback: target.objective })}</strong>
                    <span className="status-badge neutral">{target.target_date}</span>
                  </div>
                  <p>
                    {disciplineLabel(target.discipline)}
                    {target.distance_label ? ` · ${target.distance_label}` : ""}
                    {target.priority_level ? ` · prioridad ${target.priority_level}` : ""}
                  </p>
                  <small>{targetSummaryForDiscipline(target, activeDiscipline)}</small>
                  {target.notes ? <small>{target.notes}</small> : null}
                  <div className="button-row">
                    <button className="ghost-button" type="button" onClick={() => loadTargetIntoForm(target)}>
                      Editar
                    </button>
                    <button className="danger-button" type="button" onClick={() => deleteTarget(target.id)}>
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="athlete-form target-page-form">
              <label>
                Fecha
                <input type="date" value={targetForm.target_date} onChange={(event) => setTargetForm({ ...targetForm, target_date: event.target.value })} />
              </label>
              <label>
                Disciplina
                <select value={targetForm.discipline} onChange={(event) => setTargetForm({ ...targetForm, discipline: event.target.value })}>
                  {analysis.athlete.primary_discipline === "triatlón" ? (
                    <>
                      <option value="triatlón">Triatlón</option>
                      <option value="natación">Natación</option>
                      <option value="ciclismo">Ciclismo</option>
                      <option value="running">Carrera a pie</option>
                    </>
                  ) : (
                    <option value={analysis.athlete.primary_discipline}>{disciplineLabel(analysis.athlete.primary_discipline)}</option>
                  )}
                </select>
              </label>
              <label>
                Prueba objetivo
                <select
                  value={targetForm.distance_category}
                  onChange={(event) =>
                    setTargetForm((current) => ({
                      ...current,
                      distance_category: event.target.value,
                      distance_label: targetCategoryLabel(event.target.value, current.distance_label) ?? current.distance_label,
                    }))
                  }
                >
                  <option value="">— Selecciona prueba —</option>
                  {targetCategoryOptions(targetForm.discipline).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Distancia
                {targetForm.discipline === "triatlón" ? (
                  <>
                    <select value={triathlonDistancePreset} onChange={(event) => setTriathlonDistancePreset(event.target.value)}>
                      <option value="ironman">IRONMAN</option>
                      <option value="half">Media distancia</option>
                      <option value="olympic">Olímpico</option>
                      <option value="sprint">Sprint</option>
                      <option value="manual">Manual</option>
                    </select>
                    {triathlonDistancePreset === "manual" ? (
                      <input
                        value={targetForm.distance_label}
                        onChange={(event) => setTargetForm({ ...targetForm, distance_label: event.target.value })}
                        placeholder="Introduce distancia personalizada"
                      />
                    ) : null}
                  </>
                ) : (
                  <input
                    value={targetForm.distance_label}
                    onChange={(event) => setTargetForm({ ...targetForm, distance_label: event.target.value })}
                    placeholder="5K, 10K, maratón, 1500m..."
                  />
                  )}
              </label>
              <label>
                Prioridad
                <select value={targetForm.priority_level} onChange={(event) => setTargetForm({ ...targetForm, priority_level: event.target.value })}>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </label>
              <div className="full-width card planning-threshold-card policy">
                <small>Nombre que guardará el sistema</small>
                <strong>{buildTargetObjective({ category: targetForm.distance_category, distanceLabel: targetForm.distance_label, fallback: disciplineLabel(targetForm.discipline) })}</strong>
                <p>La categoría de prueba manda en la lógica. El nombre visible solo acompaña.</p>
              </div>
              {targetHints.length ? (
                <div className="target-hints full-width target-hints-summary">
                  {targetHints.map((hint) => (
                    <small key={hint}>{hint}</small>
                  ))}
                </div>
              ) : null}
              {targetForm.discipline === "triatlón" && triathlonPlannerSummary ? (
                <div className="triathlon-counter full-width">
                  <article className="triathlon-counter-card primary">
                    <span>Objetivo total</span>
                    <strong>{formatClock(triathlonPlannerSummary.totalGoalSeconds)}</strong>
                    <small>
                      Actual: {triathlonPlannerSummary.totalCurrent ? formatClock(triathlonPlannerSummary.totalCurrent) : "Completa las tres disciplinas"}
                    </small>
                    {triathlonPlannerSummary.deltaSeconds !== null ? (
                      <small
                        className={`evaluation-delta ${
                          triathlonPlannerSummary.deltaSeconds < 0 ? "positive" : triathlonPlannerSummary.deltaSeconds > 0 ? "negative" : "neutral"
                        }`}
                      >
                        {formatDeltaClock(triathlonPlannerSummary.deltaSeconds)}
                      </small>
                    ) : null}
                  </article>
                  <article className="triathlon-counter-card">
                    <span>Natación</span>
                    <strong>{triathlonPlannerSummary.swimSeconds ? formatClock(triathlonPlannerSummary.swimSeconds) : "-"}</strong>
                    <small>Segmento actual</small>
                  </article>
                  <article className="triathlon-counter-card">
                    <span>Ciclismo</span>
                    <strong>{triathlonPlannerSummary.bikeSeconds ? formatClock(triathlonPlannerSummary.bikeSeconds) : "-"}</strong>
                    <small>
                      {triathlonPlannerSummary.bikeSpeed && triathlonPlannerSummary.bikeWkg
                        ? `${triathlonPlannerSummary.bikeWkg.toFixed(2)} W/kg${
                            athleteWeight ? ` · ${Math.round(triathlonPlannerSummary.bikeWkg * athleteWeight)} W` : ""
                          } · ${formatSpeedKph(triathlonPlannerSummary.bikeSpeed)}`
                        : "Introduce W/kg"}
                    </small>
                  </article>
                  <article className="triathlon-counter-card">
                    <span>Carrera a pie</span>
                    <strong>{triathlonPlannerSummary.runSeconds ? formatClock(triathlonPlannerSummary.runSeconds) : "-"}</strong>
                    <small>Segmento actual</small>
                  </article>
                  <article className="triathlon-counter-card">
                    <span>Transiciones</span>
                    <strong>{formatClock(triathlonPlannerSummary.transition1 + triathlonPlannerSummary.transition2)}</strong>
                    <small>
                      T1 {formatClock(triathlonPlannerSummary.transition1)} · T2 {formatClock(triathlonPlannerSummary.transition2)}
                    </small>
                  </article>
                </div>
              ) : null}
              {targetForm.discipline !== "triatlón" ? (
                <>
                  <label>
                    Ritmo objetivo
                    <input
                      value={targetForm.target_pace_label}
                      onChange={(event) => setTargetForm({ ...targetForm, target_pace_label: event.target.value })}
                      placeholder={targetForm.discipline === "natación" ? "01:22/100m" : "03:35/km"}
                      disabled={targetForm.discipline === "ciclismo"}
                    />
                  </label>
                  <label>
                    Potencia objetivo
                    <input
                      type="number"
                      step="1"
                      value={targetForm.target_power_watts}
                      onChange={(event) => setTargetForm({ ...targetForm, target_power_watts: event.target.value })}
                      placeholder="300"
                      disabled={targetForm.discipline !== "ciclismo"}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Transición 1 (s)
                    <input
                      type="number"
                      step="1"
                      value={targetForm.transition_1_seconds}
                      onChange={(event) => setTargetForm({ ...targetForm, transition_1_seconds: event.target.value })}
                      placeholder="240"
                    />
                  </label>
                  <label>
                    Transición 2 (s)
                    <input
                      type="number"
                      step="1"
                      value={targetForm.transition_2_seconds}
                      onChange={(event) => setTargetForm({ ...targetForm, transition_2_seconds: event.target.value })}
                      placeholder="240"
                    />
                  </label>
                  <label>
                    Desnivel bici (m+)
                    <input
                      type="number"
                      step="1"
                      value={targetForm.bike_elevation_gain_m}
                      onChange={(event) => setTargetForm({ ...targetForm, bike_elevation_gain_m: event.target.value })}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    Ritmo carrera a pie
                    <input value={targetForm.target_running_pace_label} onChange={(event) => setTargetForm({ ...targetForm, target_running_pace_label: event.target.value })} placeholder="03:35/km" />
                    {triathlonHints.run.length ? <div className="field-hints">{triathlonHints.run.map((hint) => <small key={hint}>{hint}</small>)}</div> : null}
                  </label>
                  <label>
                    Ritmo natación
                    <input value={targetForm.target_swim_pace_label} onChange={(event) => setTargetForm({ ...targetForm, target_swim_pace_label: event.target.value })} placeholder="01:22/100m" />
                    {triathlonHints.swim.length ? <div className="field-hints">{triathlonHints.swim.map((hint) => <small key={hint}>{hint}</small>)}</div> : null}
                  </label>
                  <label>
                    FTP ciclismo (W/kg)
                    <input
                      type="number"
                      step="0.01"
                      value={targetForm.target_cycling_power_watts}
                      onChange={(event) => setTargetForm({ ...targetForm, target_cycling_power_watts: event.target.value })}
                      placeholder="4.20"
                    />
                    {triathlonHints.bike.length ? <div className="field-hints">{triathlonHints.bike.map((hint) => <small key={hint}>{hint}</small>)}</div> : null}
                  </label>
                </>
              )}
              <label className="full-width">
                Notas
                <textarea rows={3} value={targetForm.notes} onChange={(event) => setTargetForm({ ...targetForm, notes: event.target.value })} />
              </label>
              <div className="button-row full-width">
                {editingTargetId ? (
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      setEditingTargetId(null);
                      setTargetForm((current) => ({
                        ...current,
                        target_date: new Date().toISOString().slice(0, 10),
                        distance_label: "",
                        priority_level: "media",
                        objective: "",
                        target_pace_label: "",
                        target_power_watts: "",
                        target_running_pace_label: "",
                        target_swim_pace_label: "",
                        target_cycling_power_watts: "",
                        transition_1_seconds: "240",
                        transition_2_seconds: "240",
                        bike_elevation_gain_m: "0",
                        notes: "",
                      }));
                      setTriathlonDistancePreset("manual");
                    }}
                  >
                    Cancelar edición
                  </button>
                ) : null}
                <button className="primary-button" type="button" onClick={saveAthleteTarget} disabled={targetSubmitting || !targetForm.distance_category}>
                  {targetSubmitting ? "Guardando..." : editingTargetId ? "Guardar cambios" : "Aceptar y guardar"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      <section className="hero card athlete-hero-layout">
        <div className="hero-main">
          <span className="eyebrow">{disciplineLabel(activeDiscipline)}</span>
          <div className="athlete-title-row">
            <h1>{analysis.athlete.name}</h1>
            <button className="ghost-button" type="button" onClick={() => setTargetsOverlayOpen(true)}>
              Objetivos y competiciones
            </button>
          </div>
          <p>{analysis.athlete.notes}</p>
          <div className="hero-goal-row">
            {analysis.athlete.primary_discipline === "triatlón" ? (
              <div className="discipline-tab-row ad-disc-tabs" style={{ padding: 0, background: "transparent", border: "none" }}>
                {["natación", "ciclismo", "running"].map((discipline) => (
                  <button
                    key={discipline}
                    type="button"
                    className={`discipline-tab ad-disc-tab ${activeDiscipline === discipline ? "active" : ""} ${discipline === "natación" ? "ad-tab-swim" : discipline === "ciclismo" ? "ad-tab-bike" : "ad-tab-run"}`}
                    onClick={() => setActiveDiscipline(discipline)}
                  >
                    {disciplineLabel(discipline)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="hero-focus-stack">
          <article className="hero-focus-card current">
            <span className="eyebrow">Foco actual</span>
            <strong>Bloque activo</strong>
            {activeFocusBlockWithEvaluation ? (
              <>
                <p>
                  {activeFocusBlockWithEvaluation.energy_system_focus} · {activeFocusBlockWithEvaluation.block_objective}
                  {activeFocusBlockWithEvaluation.priority_discipline ? ` · ${disciplineLabel(activeFocusBlockWithEvaluation.priority_discipline)}` : ""}
                </p>
                <small>
                  {activeFocusBlockWithEvaluation.start_date}
                  {activeFocusBlockWithEvaluation.end_date ? ` → ${activeFocusBlockWithEvaluation.end_date}` : " → abierto"} · {activeFocusBlockWithEvaluation.phase ?? "sin fase"}
                </small>
                <small>{activeFocusBlockWithEvaluation.block_intent || "Sin intención operativa definida todavía."}</small>
              </>
            ) : (
              <p>No hay bloque activo definido para este atleta.</p>
            )}
          </article>

          <article className="hero-focus-card evaluation">
            <span className="eyebrow">Evaluación</span>
            <strong>Evaluación del bloque</strong>
            {activeFocusBlockWithEvaluation?.evaluation ? (
              <>
                <p>{activeFocusBlockWithEvaluation.evaluation.summary}</p>
                <small>
                  {focusDirectionLabel(activeFocusBlockWithEvaluation.evaluation.direction)} · {Math.round(activeFocusBlockWithEvaluation.evaluation.confidence * 100)}% confianza
                </small>
                <small>
                  {activeFocusBlockWithEvaluation.evaluation.key_metric}: {formatValue(activeFocusBlockWithEvaluation.evaluation.baseline_value, activeFocusBlockWithEvaluation.evaluation.unit)} →{" "}
                  {formatValue(activeFocusBlockWithEvaluation.evaluation.latest_value, activeFocusBlockWithEvaluation.evaluation.unit)}
                </small>
                {activeFocusBlockWithEvaluation.evaluation.delta !== null && activeFocusBlockWithEvaluation.evaluation.delta !== undefined ? (
                  <div className="evaluation-delta-row">
                    <small
                      className={`evaluation-delta ${
                        activeFocusBlockWithEvaluation.evaluation.delta > 0 ? "positive" : activeFocusBlockWithEvaluation.evaluation.delta < 0 ? "negative" : "neutral"
                      }`}
                    >
                      {formatSignedDelta(activeFocusBlockWithEvaluation.evaluation.delta, activeFocusBlockWithEvaluation.evaluation.unit)}
                    </small>
                    {activeFocusBlockWithEvaluation.evaluation.delta_relative !== null &&
                    activeFocusBlockWithEvaluation.evaluation.delta_relative !== undefined &&
                    activeFocusBlockWithEvaluation.evaluation.relative_unit ? (
                      <small
                        className={`evaluation-delta ${
                          activeFocusBlockWithEvaluation.evaluation.delta_relative > 0
                            ? "positive"
                            : activeFocusBlockWithEvaluation.evaluation.delta_relative < 0
                              ? "negative"
                              : "neutral"
                        }`}
                      >
                        {formatSignedDelta(activeFocusBlockWithEvaluation.evaluation.delta_relative, activeFocusBlockWithEvaluation.evaluation.relative_unit)}
                      </small>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p>Aún no hay suficiente histórico comparable para valorar el bloque activo.</p>
            )}
          </article>

          <Link
            className="hero-plan-card"
            to={`/planning?athleteId=${analysis.athlete.id}&athleteName=${encodeURIComponent(analysis.athlete.name)}&discipline=${encodeURIComponent(activeDiscipline)}`}
          >
            <span className="eyebrow">Planificación</span>
            <strong>Abrir planificación del atleta</strong>
            <p>Cuadra siguientes bloques y el siguiente ciclo en una vista separada.</p>
            <small>{activeFocusBlockWithEvaluation?.evaluation?.recommendation ?? "Organiza el siguiente bloque desde una vista dedicada."}</small>
          </Link>
        </div>
      </section>

      <section className="card athlete-detail-nav-card">
        <div className="athlete-detail-nav-head">
          <div>
            <span className="eyebrow">Lectura rápida</span>
            <h2>Resumen del atleta</h2>
          </div>
          <small>Salta a cada bloque sin recorrer toda la página.</small>
        </div>
        <div className="athlete-detail-summary-grid">
          {summaryCards.map((card) => (
            <article key={card.label} className={`athlete-detail-summary-card ${card.tone}`}>
              <span className="eyebrow">{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </article>
          ))}
        </div>
        <div className="athlete-detail-section-nav ad-section-nav" aria-label="Secciones del análisis">
          {sectionLinks.map((link) => (
            <button key={link.id} type="button" className="athlete-detail-section-pill ad-section-link" onClick={() => scrollToSection(link.id)} title={link.label}>
              {link.shortLabel}
            </button>
          ))}
        </div>
      </section>

      {/* Botón de interpolación ciclismo desde running */}
      {activeDiscipline === "ciclismo" && !visibleThresholdCards.length && analysis?.discipline_views?.running && (
        <section className="ad-interpolation-banner" style={{ margin: "0 0 16px", padding: "16px 20px", background: "rgba(255,165,0,0.08)", border: "1px solid rgba(255,165,0,0.25)", borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: "var(--text-secondary, #94a3b8)" }}>
              Sin tests de lactato en ciclismo.
            </span>
            <button
              type="button"
              className="ghost-button"
              disabled={interpolatingCycling}
              style={{ fontSize: 13, padding: "6px 14px", border: "1px solid rgba(255,165,0,0.4)", borderRadius: 8, color: "#f59e0b" }}
              onClick={async () => {
                if (!analysis?.athlete.id) return;
                setInterpolatingCycling(true);
                setInterpolationResult(null);
                try {
                  const res = await api.interpolateCyclingFromRunning(token, analysis.athlete.id);
                  setInterpolationResult({ lt1_hr_cycling: res.lt1_hr_cycling, lt2_hr_cycling: res.lt2_hr_cycling, lt1_hr_running: res.lt1_hr_running, lt2_hr_running: res.lt2_hr_running, hr_offset_applied: res.hr_offset_applied, warnings: res.warnings, confidence: res.confidence });
                  await onSaved();
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : "Error al interpolar";
                  setInterpolationResult({ lt1_hr_cycling: null, lt2_hr_cycling: null, lt1_hr_running: null, lt2_hr_running: null, hr_offset_applied: 0, warnings: [msg], confidence: 0 });
                } finally {
                  setInterpolatingCycling(false);
                }
              }}
            >
              {interpolatingCycling ? "Interpolando..." : "Estimar FC ciclismo desde running (HR bridge)"}
            </button>
          </div>
          {interpolationResult && (
            <div style={{ marginTop: 10 }}>
              {(interpolationResult.lt1_hr_cycling || interpolationResult.lt2_hr_cycling) ? (
                <div style={{ fontSize: 13, color: "var(--text-primary, #e2e8f0)" }}>
                  <p style={{ margin: "0 0 4px" }}>
                    {interpolationResult.lt1_hr_cycling && <>LT1 ciclismo ≈ <strong>{interpolationResult.lt1_hr_cycling} bpm</strong></>}
                    {interpolationResult.lt1_hr_cycling && interpolationResult.lt2_hr_cycling && " · "}
                    {interpolationResult.lt2_hr_cycling && <>LT2 ciclismo ≈ <strong>{interpolationResult.lt2_hr_cycling} bpm</strong></>}
                    <span style={{ marginLeft: 8, fontSize: 12, color: "#94a3b8" }}>
                      (confianza: {(interpolationResult.confidence * 100).toFixed(0)}%)
                    </span>
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#94a3b8" }}>
                    Origen running: {interpolationResult.lt1_hr_running && <>LT1 {interpolationResult.lt1_hr_running} bpm</>}
                    {interpolationResult.lt1_hr_running && interpolationResult.lt2_hr_running && " · "}
                    {interpolationResult.lt2_hr_running && <>LT2 {interpolationResult.lt2_hr_running} bpm</>}
                    {" "}(−{interpolationResult.hr_offset_applied} bpm, Millet 2009)
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b" }}>
                    Para estimar potencia se necesitan entrenos en bici con potenciómetro.
                  </p>
                </div>
              ) : null}
              {interpolationResult.warnings.map((w, i) => (
                <p key={i} style={{ fontSize: 12, color: "#f59e0b", margin: "4px 0 0" }}>⚠ {w}</p>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Indicador cuando ciclismo tiene datos interpolados */}
      {activeDiscipline === "ciclismo" && visibleThresholdCards.length > 0 && displayView?.latest_snapshot_date && (displayView as any)?.thresholds?.some?.((t: any) => t.method?.includes?.("hr_bridge")) && (
        <div style={{ margin: "0 0 12px", padding: "8px 14px", background: "rgba(255,165,0,0.06)", border: "1px solid rgba(255,165,0,0.15)", borderRadius: 8, fontSize: 12, color: "#f59e0b" }}>
          ⚠ FC de umbrales interpolada desde running (HR bridge, Millet 2009). Un test de lactato en bicicleta mejorará la precisión.
        </div>
      )}

      {visibleThresholdCards.length || relevantEstimates.length ? (
        <section className="metrics-grid metrics-strip ad-threshold-row">
          {visibleThresholdCards.map((threshold) => (
            <article key={threshold.name} className={`card status-card ad-threshold-card ${threshold.name.toLowerCase().includes("lt1") ? "lt1" : threshold.name.toLowerCase().includes("lt2") ? "lt2" : threshold.name.toLowerCase().includes("real") ? "real" : "target"}`}>
              <div className="status-head">
                <span className="eyebrow ad-threshold-label">{threshold.name}</span>
                <span className={`status-badge ad-threshold-conf ${threshold.evidence_level}`}>{threshold.evidence_level}</span>
              </div>
              <strong className={`ad-threshold-value ${threshold.name.toLowerCase().includes("lt1") ? "lt1-val" : threshold.name.toLowerCase().includes("lt2") ? "lt2-val" : ""}`}>{thresholdPrimaryValue(threshold, activeDiscipline, athleteWeight)}</strong>
              <p className="ad-threshold-detail">
                {thresholdSecondaryValue(threshold, activeDiscipline)}
              </p>
              <small className="ad-threshold-detail">{thresholdDetailLine(threshold, activeDiscipline, athleteWeight)}</small>
            </article>
          ))}
          {relevantEstimates.map((estimate, index) => {
            const raceSummary = racePredictionSummary(estimate);
            const visualRange = estimateVisualRange(estimate, athleteWeight);
            return (
              <article
                key={`${estimate.estimate_type}-${estimate.discipline}-${estimate.valid_on ?? "na"}-${index}`}
                className={`card status-card selectable-estimate-card ${selectedRelevantEstimate?.estimate_type === estimate.estimate_type ? "active" : ""}`}
                onClick={() => setSelectedEstimateType(estimate.estimate_type)}
              >
                <div className="status-head">
                  <span className="eyebrow">{estimate.estimate_type}</span>
                  <span className={`status-badge ${estimate.reliability_label}`}>{estimate.reliability_label}</span>
                </div>
                <strong>
                  {estimate.estimate_type === "VO2max" && displayView.swain_vo2max
                    ? `${displayView.swain_vo2max.vo2max} ${estimate.unit}`
                    : raceSummary
                      ? raceSummary.pace
                      : activeDiscipline === "ciclismo" && estimate.unit === "W"
                        ? formatPowerWithWeight(estimate.value, athleteWeight)
                        : `${estimate.value} ${estimate.unit}`}
                </strong>
                <p>{raceSummary ? raceSummary.totalTime : visualRange.primary}</p>
                {estimate.estimate_type === "VO2max" && displayView.swain_vo2max ? (
                  <small>
                    LT2 al {Math.round(displayView.swain_vo2max.fractional_utilization * 100)}% del techo · FC {displayView.swain_vo2max.lt2_hr_used ?? "?"}/{displayView.swain_vo2max.hr_max_used ?? "?"} bpm
                  </small>
                ) : (
                  <small>
                    {raceSummary ? "Ritmo " : ""}
                    Mejor {visualRange.bestSecondaryLabel} · Conservador {visualRange.conservativeSecondaryLabel}
                  </small>
                )}
                {raceSummary ? <small>IC tiempo {raceSummary.lowerTime} - {raceSummary.upperTime}</small> : null}
                <small>{estimate.low_evidence ? "Evidencia limitada" : "Evidencia suficiente"}</small>
              </article>
            );
          })}
        </section>
      ) : null}

      {activeDiscipline === "ciclismo" && displayView.power_bests.length ? (
        <section className="card">
          <div className="card-header">
            <div>
              <span className="eyebrow">Potencia</span>
              <h2>Mejores registros ciclistas</h2>
            </div>
          </div>
          <div className="power-bests-grid">
            {displayView.power_bests.map((best) => (
              <article key={best.label} className="power-best-card">
                <div className="status-head">
                  <span className="eyebrow">{best.label}</span>
                  <span className="status-badge medium">peak</span>
                </div>
                <strong>{formatPowerWithWeight(best.value_watts, athleteWeight)}</strong>
                <p>Mejor media en {best.label}</p>
                <small>{formatWattsPerKg(best.value_watts, athleteWeight)}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section id="thresholds" className="card threshold-plot-card athlete-detail-anchor ad-section">
        <div className="card-header">
          <div>
            <span className="eyebrow">Mapa de umbrales</span>
            <h2>
              LT1 y LT2 por disciplina{" "}
              <small className="threshold-sample-count">
                ({buildPlotView(activeDiscipline).pool.length} muestras de lactato)
              </small>
            </h2>
          </div>
          <div className="threshold-filter-row ad-action-bar">
            <GeneratePhysiologyReportButton
              onClick={generatePhysiologyReport}
              loading={physiologyReportLoading}
              disabled={!analysis}
            />
            <button className="primary-button threshold-add-button" type="button" onClick={openLactateEntryForm}>
              Añadir lactato
            </button>
            <label>
              Desde
              <input type="date" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} />
            </label>
            <label>
              Hasta
              <input type="date" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} />
            </label>
          </div>
        </div>
        <div className="discipline-plot-stack">
          {(() => {
            const disciplineKey = activeDiscipline;
            const plotView = buildPlotView(disciplineKey);
            const evidenceSampleCount = plotView.pool.length;
            const thresholdEvidence = [plotView.lt1, plotView.lt2].filter(Boolean);
            const lowConfidenceThresholds = thresholdEvidence.filter(
              (threshold) =>
                (threshold?.evidence_level ?? "").toLowerCase() === "low" || (threshold?.confidence ?? 0) < 0.6,
            ).length;
            const detectionSummary = [
              { label: "LT1", detection: plotView.lt1Detection },
              { label: "LT2", detection: plotView.lt2Detection },
            ].filter(
              (entry): entry is { label: string; detection: ThresholdDetectionStatus } =>
                Boolean(entry.detection && entry.detection.state && entry.detection.state !== "none"),
            );
            const pendingDetectionLabels = detectionSummary
              .filter((entry) => !thresholdDetectionIsConfirmed(entry.detection.state))
              .map((entry) => entry.label);
            const confirmedDetectionLabels = detectionSummary
              .filter((entry) => thresholdDetectionIsConfirmed(entry.detection.state))
              .map((entry) => entry.label);
            const readyToAnchorLabels = detectionSummary
              .filter((entry) => entry.detection.state === "ready_to_anchor")
              .map((entry) => entry.label);
            const sparseEvidence =
              evidenceSampleCount <= 4 ||
              plotView.plotData.length < 2 ||
              thresholdEvidence.length < 2 ||
              lowConfidenceThresholds >= 1;
            const plotLt1X =
              disciplineKey === "ciclismo"
                ? plotView.lt1?.power_watts ?? plotView.provisionalLt1?.x ?? null
                : plotView.lt1?.pace_seconds_per_km ?? plotView.provisionalLt1?.x ?? null;
            const plotLt2X =
              disciplineKey === "ciclismo"
                ? plotView.lt2?.power_watts ?? plotView.provisionalLt2?.x ?? null
                : plotView.lt2?.pace_seconds_per_km ?? plotView.provisionalLt2?.x ?? null;
            const plotLt1CandidateX =
              disciplineKey === "ciclismo"
                ? plotView.lt1Candidate?.power_watts ?? null
                : plotView.lt1Candidate?.pace_seconds_per_km ?? null;
            const plotLt2CandidateX =
              disciplineKey === "ciclismo"
                ? plotView.lt2Candidate?.power_watts ?? null
                : plotView.lt2Candidate?.pace_seconds_per_km ?? null;
            const plotLt1RealX =
              disciplineKey === "ciclismo"
                ? plotView.individualThresholds?.lt1_individual?.power_watts ?? null
                : plotView.individualThresholds?.lt1_individual?.pace_seconds_per_km ?? null;
            const plotLt2RealX =
              disciplineKey === "ciclismo"
                ? plotView.individualThresholds?.lt2_individual?.power_watts ?? null
                : plotView.individualThresholds?.lt2_individual?.pace_seconds_per_km ?? null;
            return (
              <div className="discipline-plot-panel ad-chart-container">
                <div className="discipline-plot-header">
                  <span className="eyebrow">{disciplineLabel(disciplineKey)}</span>
                  <div className="discipline-plot-title-row">
                    <strong>{disciplineKey === "ciclismo" ? "Base ciclista independiente" : `Base ${disciplineLabel(disciplineKey).toLowerCase()} independiente`}</strong>
                  </div>
                  {disciplineKey === "ciclismo" ? (
                    <div className="source-toggle-row">
                      {(["outdoor", "indoor", "compare"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`discipline-tab ${cyclingPowerSourceMode === mode ? "active" : ""}`}
                          onClick={() => setCyclingPowerSourceMode(mode)}
                        >
                          {mode === "compare" ? "Comparar" : powerSourceLabel(mode)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="threshold-overview">
                  {disciplineKey === "ciclismo" && cyclingPowerSourceMode === "compare" ? (
                    plotView.comparePools.map((pool) => (
                      <article key={`compare-card-${pool.sourceKey}`} className="threshold-legend-card pool">
                        <span className="threshold-dot pool" style={{ background: pool.color }} />
                        <div>
                          <strong>{pool.label}</strong>
                          <p>Comparativa directa de umbrales por potenciómetro, sin mezclar interior y exterior.</p>
                          <small>
                            LT1: {pool.lt1 ? `${formatPowerWithWeight(pool.lt1.power_watts, athleteWeight)} · ${pool.lt1.heart_rate ?? "-"} bpm · ${pool.lt1.lactate?.toFixed(1) ?? "-"} mmol/L` : "n/d"}
                          </small>
                          <small>
                            LT2: {pool.lt2 ? `${formatPowerWithWeight(pool.lt2.power_watts, athleteWeight)} · ${pool.lt2.heart_rate ?? "-"} bpm · ${pool.lt2.lactate?.toFixed(1) ?? "-"} mmol/L` : "n/d"}
                          </small>
                        </div>
                      </article>
                    ))
                  ) : (
                    <>
                      <article className="threshold-legend-card lt1" title={thresholdHoverLabel(plotView.lt1, disciplineKey, athleteWeight, plotView.lt1Support)}>
                        <span className="threshold-dot lt1" />
                        <div>
                          <strong>{plotView.lt1 ? "LT1" : plotView.provisionalLt1 ? "LT1 provisional" : "LT1"}</strong>
                          <p>{disciplineKey === "ciclismo" ? "Primer umbral ciclista. Referencia de trabajo aeróbico sostenible en potencia." : "Primer umbral. Marca la transición hacia un trabajo aeróbico más exigente pero todavía muy sostenible."}</p>
                          <small>
                            {plotView.lt1
                              ? thresholdDetailLine(plotView.lt1, disciplineKey, athleteWeight)
                              : plotView.provisionalLt1
                                ? `${disciplineKey === "ciclismo" ? formatPowerWithWeight(plotView.provisionalLt1.x, athleteWeight) : formatPace(plotView.provisionalLt1.x)} · ${plotView.provisionalLt1.lactate.toFixed(1)} mmol/L · estimación provisional`
                                : "Sin cálculo disponible"}
                          </small>
                        </div>
                      </article>
                      <article className="threshold-legend-card lt2" title={thresholdHoverLabel(plotView.lt2, disciplineKey, athleteWeight, plotView.lt2Support)}>
                        <span className="threshold-dot lt2" />
                        <div>
                          <strong>{plotView.lt2 ? "LT2" : plotView.provisionalLt2 ? "LT2 provisional" : "LT2"}</strong>
                          <p>{disciplineKey === "ciclismo" ? "Segundo umbral ciclista. Punto de alta exigencia sostenible antes de acumular lactato con claridad." : "Segundo umbral. Señala el punto de alta exigencia sostenible antes de una acumulación marcada de lactato."}</p>
                          <small>
                            {plotView.lt2
                              ? thresholdDetailLine(plotView.lt2, disciplineKey, athleteWeight)
                              : plotView.provisionalLt2
                                ? `${disciplineKey === "ciclismo" ? formatPowerWithWeight(plotView.provisionalLt2.x, athleteWeight) : formatPace(plotView.provisionalLt2.x)} · ${plotView.provisionalLt2.lactate.toFixed(1)} mmol/L · estimación provisional`
                              : "Sin cálculo disponible"}
                          </small>
                        </div>
                      </article>
                      {plotView.lt1Detection && plotView.lt1Detection.state !== "none" ? (
                        <article
                          className={`threshold-legend-card detection ${thresholdDetectionTone(plotView.lt1Detection.state)}`}
                          title={thresholdDetectionTooltip(plotView.lt1Detection, plotView.lt1Candidate, disciplineKey, athleteWeight, plotView.lt1CandidateSupport)}
                        >
                          <span className="threshold-dot detection lt1-candidate" />
                          <div>
                            <span className="eyebrow">Señal LT1</span>
                            <strong>{thresholdDetectionStateLabel(plotView.lt1Detection.state)}</strong>
                            <p>{thresholdDetectionCoachExplanation(plotView.lt1Detection)}</p>
                            <small>
                              {plotView.lt1Candidate
                                ? thresholdDetailLine(plotView.lt1Candidate, disciplineKey, athleteWeight)
                                : "Sin candidato medible todavía"}
                            </small>
                            <small
                              className={`threshold-detection-usage ${thresholdDetectionIsConfirmed(plotView.lt1Detection.state) ? "positive" : "warning"}`}
                            >
                              {thresholdDetectionUsageMessage(plotView.lt1Detection.state)}
                            </small>
                          </div>
                        </article>
                      ) : null}
                      {plotView.lt2Detection && plotView.lt2Detection.state !== "none" ? (
                        <article
                          className={`threshold-legend-card detection ${thresholdDetectionTone(plotView.lt2Detection.state)}`}
                          title={thresholdDetectionTooltip(plotView.lt2Detection, plotView.lt2Candidate, disciplineKey, athleteWeight, plotView.lt2CandidateSupport)}
                        >
                          <span className="threshold-dot detection lt2-candidate" />
                          <div>
                            <span className="eyebrow">Señal LT2</span>
                            <strong>{thresholdDetectionStateLabel(plotView.lt2Detection.state)}</strong>
                            <p>{thresholdDetectionCoachExplanation(plotView.lt2Detection)}</p>
                            <small>
                              {plotView.lt2Candidate
                                ? thresholdDetailLine(plotView.lt2Candidate, disciplineKey, athleteWeight)
                                : "Sin candidato medible todavía"}
                            </small>
                            <small
                              className={`threshold-detection-usage ${thresholdDetectionIsConfirmed(plotView.lt2Detection.state) ? "positive" : "warning"}`}
                            >
                              {thresholdDetectionUsageMessage(plotView.lt2Detection.state)}
                            </small>
                          </div>
                        </article>
                      ) : null}
                      {dynamicThresholds?.chronic.practical_lt1 ? (
                        <article
                          className="threshold-legend-card practical-lt1"
                          title={dynamicReferenceHoverLabel(dynamicThresholds.chronic.practical_lt1, disciplineKey, athleteWeight, plotView.practicalLt1Support)}
                        >
                          <span className="threshold-dot practical-lt1" />
                          <div>
                            <strong>LT1 práctico</strong>
                            <p>Referencia operativa algo más conservadora que LT1.</p>
                            <small>{dynamicReferencePrimaryValue(dynamicThresholds.chronic.practical_lt1, disciplineKey)}</small>
                          </div>
                        </article>
                      ) : null}
                      {dynamicThresholds?.chronic.practical_lt2 ? (
                        <article
                          className="threshold-legend-card practical-lt2"
                          title={dynamicReferenceHoverLabel(dynamicThresholds.chronic.practical_lt2, disciplineKey, athleteWeight, plotView.practicalLt2Support)}
                        >
                          <span className="threshold-dot practical-lt2" />
                          <div>
                            <strong>LT2 práctico</strong>
                            <p>Referencia operativa para trabajo exigente sin usar 4 mmol de forma literal.</p>
                            <small>{dynamicReferencePrimaryValue(dynamicThresholds.chronic.practical_lt2, disciplineKey)}</small>
                          </div>
                        </article>
                      ) : null}
                    </>
                  )}
                </div>
                {pendingDetectionLabels.length ? (
                  <div className="threshold-disclaimer warning">
                    <strong>Señal pendiente de confirmación</strong>
                    <p>
                      {joinLabels(pendingDetectionLabels)} {pendingDetectionLabels.length === 1 ? "aparece" : "aparecen"} como
                      señal fisiológica, pero {pendingDetectionLabels.length === 1 ? "debe" : "deben"} esperar confirmación
                      antes de que el coach {pendingDetectionLabels.length === 1 ? "la use" : "las use"} como umbral cerrado.
                      {" "}Todavía no {pendingDetectionLabels.length === 1 ? "es válida" : "son válidas"} para cálculos.
                    </p>
                    <div className="threshold-disclaimer-meta">
                      <span>Solo orientación</span>
                      <span>Esperar confirmación</span>
                      <span>No válido para cálculos</span>
                    </div>
                  </div>
                ) : null}
                {confirmedDetectionLabels.length ? (
                  <div className="threshold-disclaimer positive">
                    <strong>Umbral confirmado</strong>
                    <p>
                      {joinLabels(confirmedDetectionLabels)} {confirmedDetectionLabels.length === 1 ? "ya está confirmado y es válido" : "ya están confirmados y son válidos"} para cálculos fisiológicos.
                      {readyToAnchorLabels.length
                        ? ` ${joinLabels(readyToAnchorLabels)} ${readyToAnchorLabels.length === 1 ? "además está listo" : "además están listos"} para anclarse al histórico.`
                        : ""}
                    </p>
                    <div className="threshold-disclaimer-meta">
                      <span>Confirmado</span>
                      <span>Válido para cálculos</span>
                      {readyToAnchorLabels.length ? <span>Listo para anclar</span> : null}
                    </div>
                  </div>
                ) : null}
                {sparseEvidence ? (
                  <div className="threshold-disclaimer warning">
                    <strong>Lectura provisional</strong>
                    <p>
                      La gráfica refleja muestras reales del atleta, pero la base de lactato todavía es escasa. Úsala como
                      orientación fisiológica, no como un umbral cerrado.
                    </p>
                    <div className="threshold-disclaimer-meta">
                      <span>{evidenceSampleCount} muestras visibles</span>
                      <span>{thresholdEvidence.length ? `${thresholdEvidence.length} umbrales detectados` : "Sin umbrales sólidos"}</span>
                      <span>{lowConfidenceThresholds ? "Confianza baja o media" : "Confianza aún por consolidar"}</span>
                    </div>
                  </div>
                ) : null}
                <div className="threshold-plot-meta">
                  {plotView.vo2max ? (
                    <HoverMetaPill
                      className="threshold-meta-pill neutral"
                      tooltip={`${Math.round(plotView.vo2max.value * 10) / 10} ml/kg/min · estimación derivada del snapshot actual.`}
                    >
                      VO2max {Math.round(plotView.vo2max.value * 10) / 10} ml/kg/min
                    </HoverMetaPill>
                  ) : null}
                  {plotView.peakPoint ? (
                    <HoverMetaPill
                      className="threshold-meta-pill warning"
                      tooltip={`Fecha ${formatDate(plotView.peakPoint.sessionDate)} · ${disciplineKey === "ciclismo" ? `Potencia ${Math.round(plotView.peakPoint.x)} W · ${formatWattsPerKg(plotView.peakPoint.x, athleteWeight)}` : `Ritmo ${formatPace(plotView.peakPoint.x)}`} · FC ${plotView.peakPoint.heartRate ?? "-"} bpm · Lactato ${plotView.peakPoint.lactate.toFixed(1)} mmol/L`}
                    >
                      VLAMAX proxy {plotView.peakPoint.lactate.toFixed(1)} mmol/L
                    </HoverMetaPill>
                  ) : null}
                  {plotLt1X !== null ? (
                    <HoverMetaPill
                      className={`threshold-meta-pill line lt1 ${thresholdReferenceVisibility.lt1 ? "active" : "inactive"}`}
                      tooltip={thresholdHoverLabel(plotView.lt1, disciplineKey, athleteWeight, plotView.lt1Support)}
                      pressed={thresholdReferenceVisibility.lt1}
                      onClick={() => toggleThresholdReference("lt1")}
                    >
                      LT1 fisiológico
                    </HoverMetaPill>
                  ) : null}
                  {plotLt2X !== null ? (
                    <HoverMetaPill
                      className={`threshold-meta-pill line lt2 ${thresholdReferenceVisibility.lt2 ? "active" : "inactive"}`}
                      tooltip={thresholdHoverLabel(plotView.lt2, disciplineKey, athleteWeight, plotView.lt2Support)}
                      pressed={thresholdReferenceVisibility.lt2}
                      onClick={() => toggleThresholdReference("lt2")}
                    >
                      LT2 fisiológico
                    </HoverMetaPill>
                  ) : null}
                  {plotLt1CandidateX !== null && plotView.lt1Detection ? (
                    <HoverMetaPill
                      className={`threshold-meta-pill line lt1-candidate ${thresholdReferenceVisibility.lt1Candidate ? "active" : "inactive"}`}
                      tooltip={thresholdDetectionTooltip(plotView.lt1Detection, plotView.lt1Candidate, disciplineKey, athleteWeight, plotView.lt1CandidateSupport)}
                      pressed={thresholdReferenceVisibility.lt1Candidate}
                      onClick={() => toggleThresholdReference("lt1Candidate")}
                    >
                      LT1 señal
                    </HoverMetaPill>
                  ) : null}
                  {plotLt2CandidateX !== null && plotView.lt2Detection ? (
                    <HoverMetaPill
                      className={`threshold-meta-pill line lt2-candidate ${thresholdReferenceVisibility.lt2Candidate ? "active" : "inactive"}`}
                      tooltip={thresholdDetectionTooltip(plotView.lt2Detection, plotView.lt2Candidate, disciplineKey, athleteWeight, plotView.lt2CandidateSupport)}
                      pressed={thresholdReferenceVisibility.lt2Candidate}
                      onClick={() => toggleThresholdReference("lt2Candidate")}
                    >
                      LT2 señal
                    </HoverMetaPill>
                  ) : null}
                  {practicalThresholdPlotReferences.lt1 ? (
                    <HoverMetaPill
                      className={`threshold-meta-pill line practical-lt1 ${thresholdReferenceVisibility.practicalLt1 ? "active" : "inactive"}`}
                      tooltip={dynamicReferenceHoverLabel(dynamicThresholds?.chronic.practical_lt1, disciplineKey, athleteWeight, plotView.practicalLt1Support)}
                      pressed={thresholdReferenceVisibility.practicalLt1}
                      onClick={() => toggleThresholdReference("practicalLt1")}
                    >
                      LT1 práctico
                    </HoverMetaPill>
                  ) : null}
                  {practicalThresholdPlotReferences.lt2 ? (
                    <HoverMetaPill
                      className={`threshold-meta-pill line practical-lt2 ${thresholdReferenceVisibility.practicalLt2 ? "active" : "inactive"}`}
                      tooltip={dynamicReferenceHoverLabel(dynamicThresholds?.chronic.practical_lt2, disciplineKey, athleteWeight, plotView.practicalLt2Support)}
                      pressed={thresholdReferenceVisibility.practicalLt2}
                      onClick={() => toggleThresholdReference("practicalLt2")}
                    >
                      LT2 práctico
                    </HoverMetaPill>
                  ) : null}
                  {plotLt1RealX !== null ? (
                    <HoverMetaPill
                      className={`threshold-meta-pill line lt1-real ${thresholdReferenceVisibility.lt1Real ? "active" : "inactive"}`}
                      tooltip={plotView.individualThresholds?.lt1_individual ? `LT1 Individual · ${disciplineKey === "ciclismo" ? `${Math.round(plotView.individualThresholds.lt1_individual.power_watts ?? 0)} W` : formatPace(plotView.individualThresholds.lt1_individual.pace_seconds_per_km ?? 0)} · ${plotView.individualThresholds.lt1_individual.lactate?.toFixed(2)} mmol/L · confianza ${((plotView.individualThresholds.lt1_individual.confidence ?? 0) * 100).toFixed(0)}%` : "LT1 Individual"}
                      pressed={thresholdReferenceVisibility.lt1Real}
                      onClick={() => toggleThresholdReference("lt1Real")}
                    >
                      LT1 Individual
                    </HoverMetaPill>
                  ) : null}
                  {plotLt2RealX !== null ? (
                    <HoverMetaPill
                      className={`threshold-meta-pill line lt2-real ${thresholdReferenceVisibility.lt2Real ? "active" : "inactive"}`}
                      tooltip={plotView.individualThresholds?.lt2_individual ? `LT2 Individual · ${disciplineKey === "ciclismo" ? `${Math.round(plotView.individualThresholds.lt2_individual.power_watts ?? 0)} W` : formatPace(plotView.individualThresholds.lt2_individual.pace_seconds_per_km ?? 0)} · ${plotView.individualThresholds.lt2_individual.lactate?.toFixed(2)} mmol/L · confianza ${((plotView.individualThresholds.lt2_individual.confidence ?? 0) * 100).toFixed(0)}%` : "LT2 Individual"}
                      pressed={thresholdReferenceVisibility.lt2Real}
                      onClick={() => toggleThresholdReference("lt2Real")}
                    >
                      LT2 Individual
                    </HoverMetaPill>
                  ) : null}
                </div>
                {disciplineKey === "ciclismo" && cyclingPowerSourceMode === "compare" ? (
                  plotView.comparePools.length ? (
                    <ResponsiveContainer width="100%" height={360}>
                      <ScatterChart margin={{ top: 16, right: 20, bottom: 16, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                        <XAxis type="number" dataKey="x" tickFormatter={(value) => `${Math.round(value)}W`} name="Potencia" domain={["auto", "auto"]} />
                        <YAxis type="number" dataKey="lactate" name="Lactato" unit=" mmol/L" domain={[0, "auto"]} />
                        <Tooltip
                          formatter={(value: number, name: string) => {
                            if (name === "Potencia") {
                              return `${Math.round(value)} W · ${formatWattsPerKg(value, athleteWeight)}`;
                            }
                            return `${Math.round(value * 10) / 10} mmol/L`;
                          }}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? "Umbral"}
                        />
                        {plotView.comparePools.map((pool) => {
                          const thresholdPoints = [
                            pool.lt1
                              ? {
                                  name: `${pool.label} LT1`,
                                  x: pool.lt1.power_watts,
                                  lactate: pool.lt1.lactate,
                                }
                              : null,
                            pool.lt2
                              ? {
                                  name: `${pool.label} LT2`,
                                  x: pool.lt2.power_watts,
                                  lactate: pool.lt2.lactate,
                                }
                              : null,
                          ].filter(isDefined);
                          return (
                            <Scatter
                              key={pool.sourceKey}
                              name={pool.label}
                              data={thresholdPoints}
                              fill={pool.color}
                              line={false}
                            />
                          );
                        })}
                        {plotView.comparePools.map((pool) =>
                          pool.lt1?.power_watts ? (
                            <ReferenceLine
                              key={`${pool.sourceKey}-lt1`}
                              x={pool.lt1.power_watts}
                              stroke={pool.color}
                              strokeDasharray="5 5"
                            />
                          ) : null,
                        )}
                        {plotView.comparePools.map((pool) =>
                          pool.lt2?.power_watts ? (
                            <ReferenceLine
                              key={`${pool.sourceKey}-lt2`}
                              x={pool.lt2.power_watts}
                              stroke={pool.color}
                              strokeDasharray="2 6"
                            />
                          ) : null,
                        )}
                      </ScatterChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="muted">Aún no hay suficientes datos ciclistas para comparar potenciómetro exterior e interior.</p>
                  )
                ) : plotView.pool.length ? (
                  /* Standard lactate scatter chart */
                  <ResponsiveContainer width="100%" height={360}>
                    <ScatterChart margin={{ top: 16, right: 20, bottom: 16, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        tickFormatter={(value) => (disciplineKey === "ciclismo" ? `${Math.round(value)}W` : formatPace(value))}
                        name={plotView.plotLabel}
                        domain={["auto", "auto"]}
                        reversed={disciplineKey !== "ciclismo"}
                      />
                      <YAxis type="number" dataKey="lactate" name="Lactato" unit=" mmol/L" domain={[0, "auto"]} />
                      <Tooltip
                        content={({ active, payload }) => customThresholdTooltip(active, payload as Array<{ payload?: Record<string, unknown> }> | undefined, disciplineKey, athleteWeight)}
                      />
                      {plotView.lt1 && plotView.lt2 && thresholdReferenceVisibility.lt1 && thresholdReferenceVisibility.lt2 ? (
                        <ReferenceArea
                          x1={plotLt1X ?? undefined}
                          x2={plotLt2X ?? undefined}
                          y1={Math.min(plotView.lt1.lactate ?? 0, plotView.lt2.lactate ?? 0)}
                          y2={Math.max(plotView.lt1.lactate ?? 0, plotView.lt2.lactate ?? 0)}
                          fill="rgba(210, 106, 54, 0.10)"
                          strokeOpacity={0}
                        />
                      ) : null}
                      {plotLt1X !== null && thresholdReferenceVisibility.lt1 ? (
                        <ReferenceLine
                          x={plotLt1X}
                          stroke="#257a4d"
                          strokeWidth={3}
                          strokeDasharray={plotView.lt1 ? "10 4" : "4 6"}
                        />
                      ) : null}
                      {plotLt2X !== null && thresholdReferenceVisibility.lt2 ? (
                        <ReferenceLine
                          x={plotLt2X}
                          stroke="#d26a36"
                          strokeWidth={3}
                          strokeDasharray={plotView.lt2 ? "10 4" : "4 6"}
                        />
                      ) : null}
                      {plotLt1CandidateX !== null && thresholdReferenceVisibility.lt1Candidate ? (
                        <ReferenceLine
                          x={plotLt1CandidateX}
                          stroke="#257a4d"
                          strokeWidth={2.2}
                          strokeDasharray={thresholdDetectionLineDasharray(plotView.lt1Detection?.state)}
                        />
                      ) : null}
                      {plotLt2CandidateX !== null && thresholdReferenceVisibility.lt2Candidate ? (
                        <ReferenceLine
                          x={plotLt2CandidateX}
                          stroke="#d26a36"
                          strokeWidth={2.2}
                          strokeDasharray={thresholdDetectionLineDasharray(plotView.lt2Detection?.state)}
                        />
                      ) : null}
                      {practicalThresholdPlotReferences.lt1 && thresholdReferenceVisibility.practicalLt1 ? (
                        <ReferenceLine
                          x={practicalThresholdPlotReferences.lt1}
                          stroke="#2d8f5b"
                          strokeWidth={2.6}
                          strokeDasharray="2 7"
                        />
                      ) : null}
                      {practicalThresholdPlotReferences.lt2 && thresholdReferenceVisibility.practicalLt2 ? (
                        <ReferenceLine
                          x={practicalThresholdPlotReferences.lt2}
                          stroke="#d26a36"
                          strokeWidth={2.6}
                          strokeDasharray="2 7"
                        />
                      ) : null}
                      {plotLt1RealX !== null && thresholdReferenceVisibility.lt1Real ? (
                        <ReferenceLine
                          x={plotLt1RealX}
                          stroke="#1a5c3a"
                          strokeWidth={2.5}
                        />
                      ) : null}
                      {plotLt2RealX !== null && thresholdReferenceVisibility.lt2Real ? (
                        <ReferenceLine
                          x={plotLt2RealX}
                          stroke="#8b3510"
                          strokeWidth={2.5}
                        />
                      ) : null}
                      {(() => {
                        const peakPoint = plotView.peakPoint;
                        return peakPoint ? (
                          <>
                            <ReferenceLine
                              y={peakPoint.lactate}
                              stroke="#b84a14"
                              strokeWidth={1.5}
                              strokeDasharray="3 4"
                              label={{ value: `Pico ${peakPoint.lactate} mmol`, position: "insideTopRight", fontSize: 11, fill: "#b84a14" }}
                            />
                            <ReferenceDot
                              x={peakPoint.x}
                              y={peakPoint.lactate}
                              r={8}
                              fill="#b84a14"
                              stroke="white"
                              strokeWidth={2}
                            />
                          </>
                        ) : null;
                      })()}
                      <Scatter data={plotView.pool} fill="rgba(22, 53, 61, 0.22)" />
                      {plotView.lt1 ? <Scatter data={plotView.plotData.filter((point) => point.name === "LT1")} fill="#257a4d" shape="circle" /> : null}
                      {plotView.lt2 ? <Scatter data={plotView.plotData.filter((point) => point.name === "LT2")} fill="#d26a36" shape="circle" /> : null}
                      {thresholdReferenceVisibility.lt1Candidate ? <Scatter data={plotView.candidatePlotData.filter((point) => point.name.startsWith("LT1"))} fill="#257a4d" shape="diamond" /> : null}
                      {thresholdReferenceVisibility.lt2Candidate ? <Scatter data={plotView.candidatePlotData.filter((point) => point.name.startsWith("LT2"))} fill="#d26a36" shape="diamond" /> : null}
                      {thresholdReferenceVisibility.practicalLt1 ? <Scatter data={plotView.practicalPlotData.filter((point) => point.name === "LT1 práctico")} fill="#2d8f5b" shape="circle" /> : null}
                      {thresholdReferenceVisibility.practicalLt2 ? <Scatter data={plotView.practicalPlotData.filter((point) => point.name === "LT2 práctico")} fill="#d26a36" shape="circle" /> : null}
                      {plotView.peakPoint ? <Scatter data={[{ ...plotView.peakPoint, name: "Pico VLaMax" }]} fill="#b84a14" shape="circle" /> : null}
                      {!plotView.lt1 && plotView.provisionalLt1 ? (
                        <Scatter data={plotView.provisionalPlotData.filter((point) => point.name === "LT1 provisional")} fill="#257a4d" shape="star" />
                      ) : null}
                      {!plotView.lt2 && plotView.provisionalLt2 ? (
                        <Scatter data={plotView.provisionalPlotData.filter((point) => point.name === "LT2 provisional")} fill="#d26a36" shape="star" />
                      ) : null}
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : (() => {
                  // HR-only interpolated cycling: render ScatterChart with HR on X-axis
                  const hrLt1 = plotView.lt1?.heart_rate ?? null;
                  const hrLt2 = plotView.lt2?.heart_rate ?? null;
                  const interpolatedCurve = (displayView.measurement_log ?? [])
                    .filter((p: Record<string, unknown>) => p.heart_rate_cycling != null && p.lactate_mmol != null)
                    .map((p: Record<string, unknown>) => ({
                      x: p.heart_rate_cycling as number,
                      lactate: p.lactate_mmol as number,
                      hr_running: p.heart_rate_running as number,
                      power_watts: p.power_watts as number | null,
                      pace_running: p.pace_running as number | null,
                      session_date: p.session_date as string,
                      interval_label: p.interval_label as string,
                      name: `${p.heart_rate_cycling} bpm`,
                    }))
                    .sort((a: { x: number }, b: { x: number }) => a.x - b.x);

                  if (disciplineKey === "ciclismo" && interpolatedCurve.length > 0) {
                    return (
                      <>
                        <ResponsiveContainer width="100%" height={360}>
                          <ScatterChart margin={{ top: 16, right: 20, bottom: 16, left: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                            <XAxis type="number" dataKey="x" name="FC ciclismo" unit=" bpm" domain={["auto", "auto"]} />
                            <YAxis type="number" dataKey="lactate" name="Lactato" unit=" mmol/L" domain={[0, "auto"]} />
                            <Tooltip
                              content={({ active, payload: tooltipPayload }) => {
                                if (!active || !tooltipPayload?.[0]?.payload) return null;
                                const d = tooltipPayload[0].payload as Record<string, unknown>;
                                return (
                                  <div style={{ background: "var(--surface-primary, #0b1d26)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#e2e8f0" }}>
                                    <strong>{d.interval_label as string}</strong>
                                    <p style={{ margin: "4px 0 0" }}>Fecha {d.session_date as string}</p>
                                    <p style={{ margin: "2px 0 0" }}>FC ciclismo <strong>{d.x as number} bpm</strong> <span style={{ color: "#94a3b8" }}>(running {d.hr_running as number} bpm)</span></p>
                                    <p style={{ margin: "2px 0 0" }}>Watts <strong>{d.power_watts ? `${d.power_watts}W` : "pendiente"}</strong></p>
                                    <p style={{ margin: "2px 0 0" }}>Lactato <strong>{(d.lactate as number).toFixed(1)} mmol/L</strong></p>
                                    {d.pace_running ? <p style={{ margin: "2px 0 0", color: "#94a3b8" }}>Ritmo running {formatPace(d.pace_running as number)}</p> : null}
                                  </div>
                                );
                              }}
                            />
                            {hrLt1 && hrLt2 && (
                              <ReferenceArea x1={hrLt1} x2={hrLt2} fill="rgba(37,122,77,0.08)" />
                            )}
                            {hrLt1 && <ReferenceLine x={hrLt1} stroke="#257a4d" strokeDasharray="5 5" label={{ value: `LT1 ${hrLt1}`, position: "top", fill: "#257a4d", fontSize: 11 }} />}
                            {hrLt2 && <ReferenceLine x={hrLt2} stroke="#d26a36" strokeDasharray="5 5" label={{ value: `LT2 ${hrLt2}`, position: "top", fill: "#d26a36", fontSize: 11 }} />}
                            <Scatter data={interpolatedCurve} fill="rgba(22, 53, 61, 0.35)" line={{ stroke: "rgba(22, 53, 61, 0.25)", strokeWidth: 1 }} />
                          </ScatterChart>
                        </ResponsiveContainer>
                        <p style={{ marginTop: 4, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
                          Curva interpolada desde running (HR bridge, Millet 2009). Eje X = FC estimada en ciclismo. Watts pendientes.
                        </p>
                      </>
                    );
                  }
                  return (
                    <p className="muted">
                      Aún no hay suficientes muestras de lactato para representar {disciplineLabel(disciplineKey).toLowerCase()}.
                    </p>
                  );
                })()}
              </div>
            );
          })()}
        </div>
      </section>

      <section id="goal-gap" className="card goal-movement-card athlete-detail-anchor ad-section">
        <div className="card-header">
          <div>
            <span className="eyebrow">Objetivo activo</span>
            <h2>Qué tiene que moverse para cumplirlo</h2>
            <p className="muted">
              Lectura aplicada a la disciplina visible ahora mismo. El bloque prioriza el objetivo más relevante guardado para esta disciplina.
            </p>
          </div>
          <button className="ghost-button" type="button" onClick={() => setTargetsOverlayOpen(true)}>
            {targetMovementInsight ? "Editar objetivo" : "Definir objetivo"}
          </button>
        </div>
        {targetMovementInsight ? (
          <>
            <div className="goal-movement-summary">
              <article className="goal-movement-kpi">
                <span className="eyebrow">Objetivo</span>
                <strong>{targetMovementInsight.targetValue}</strong>
                <small>{targetMovementInsight.target.objective}</small>
              </article>
              <article className="goal-movement-kpi">
                <span className="eyebrow">Referencia actual</span>
                <strong>{targetMovementInsight.currentValue}</strong>
                <small>{targetMovementInsight.contextLabel}</small>
              </article>
              <article className="goal-movement-kpi">
                <span className="eyebrow">Gap</span>
                <strong>{targetMovementInsight.gapLabel}</strong>
                <small>Objetivo {formatDate(targetMovementInsight.target.target_date)}</small>
              </article>
            </div>

            <div className={`goal-movement-banner ${targetMovementInsight.tone}`}>
              <div className="status-head">
                <strong>{targetMovementInsight.movementHeadline}</strong>
                <span className={`status-badge ${targetMovementInsight.tone}`}>
                  {targetMovementInsight.tone === "positive" ? "encaja" : targetMovementInsight.tone === "neutral" ? "cerca" : "gap"}
                </span>
              </div>
              <p>{targetMovementInsight.summary}</p>
            </div>

            <div className="goal-movement-grid">
              {targetMovementInsight.focuses.map((focus) => (
                <article key={`${focus.label}-${focus.current}-${focus.target ?? "na"}`} className={`goal-movement-focus-card ${focus.tone}`}>
                  <div className="status-head">
                    <span className="eyebrow">{focus.label}</span>
                    <span className={`status-badge ${focus.tone}`}>{focus.tone === "positive" ? "ok" : focus.tone === "neutral" ? "vigilar" : "mover"}</span>
                  </div>
                  <strong>{focus.current}</strong>
                  {focus.target ? <p>Objetivo fisiológico: {focus.target}</p> : null}
                  {focus.delta ? <small>{focus.delta}</small> : null}
                  <p className="goal-movement-copy">{focus.description}</p>
                </article>
              ))}
            </div>

            {targetMovementInsight.scenario ? (
              <div className="goal-scenario-card">
                <div className="goal-scenario-head">
                  <div>
                    <span className="eyebrow">Escenario objetivo</span>
                    <strong>{targetMovementInsight.scenario.title}</strong>
                  </div>
                  <p className="muted">{targetMovementInsight.scenario.description}</p>
                </div>
                <div className="goal-scenario-legend">
                  <span>
                    <i className="actual" />
                    Actual
                  </span>
                  <span>
                    <i className="target" />
                    Objetivo
                  </span>
                </div>
                <div className="goal-scenario-chart">
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 16, right: 20, bottom: 12, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name={targetMovementInsight.scenario.xLabel}
                        reversed={targetMovementInsight.scenario.reversed}
                        domain={["auto", "auto"]}
                        tickFormatter={(value) => (activeDiscipline === "ciclismo" ? `${Math.round(value)}W` : formatPace(value))}
                      />
                      <YAxis
                        type="number"
                        dataKey="lactate"
                        name="Lactato"
                        unit=" mmol/L"
                        domain={[1.6, 4.4]}
                        ticks={[2, 3.1, 4]}
                      />
                      <Tooltip
                        content={({ active, payload }) =>
                          customGoalScenarioTooltip(
                            active,
                            payload as Array<{ payload?: Record<string, unknown> }> | undefined,
                            activeDiscipline,
                            athleteWeight,
                          )
                        }
                      />
                      <Scatter
                        name="Actual"
                        data={targetMovementInsight.scenario.points.filter((point) => point.series === "Actual")}
                        fill="#16353d"
                        line={{ stroke: "#16353d", strokeWidth: 2 }}
                      />
                      <Scatter
                        name="Objetivo"
                        data={targetMovementInsight.scenario.points.filter((point) => point.series === "Objetivo")}
                        fill="#d26a36"
                        line={{ stroke: "#d26a36", strokeWidth: 2, strokeDasharray: "6 4" }}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}

            {targetMovementInsight.notes.length ? (
              <div className="goal-movement-notes">
                {targetMovementInsight.notes.map((note, index) => (
                  <div key={`${note}-${index}`} className="goal-movement-note">
                    <span className="caution-eyebrow">Nota</span>
                    <p>{note}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="goal-movement-empty">
            <strong>Sin objetivo específico para esta disciplina</strong>
            <p>
              Guarda un objetivo de running, ciclismo o triatlón y este bloque te dirá qué ancla fisiológica tiene que moverse primero para acercarte.
            </p>
          </div>
        )}
      </section>

      {activeDiscipline === "ciclismo" ? (
        <section id="cycling-insights" className="cycling-insights-row athlete-detail-anchor">
          <section className="card cycling-insight-card ad-chart-container">
            <div className="cycling-insight-head">
              <div>
                <span className="eyebrow">Cadencia y coste</span>
                <h2>Evolución por cadencia</h2>
                <p className="muted">Compara el lactato por bandas de cadencia a potencia parecida.</p>
              </div>
              <button className="ghost-button" type="button" onClick={() => setExpandedCyclingPanel("cadence")}>
                Ampliar
              </button>
            </div>
            {renderCyclingCadenceEvolution(false)}
          </section>

          <section className="card cycling-insight-card ad-chart-container">
            <div className="cycling-insight-head">
              <div>
                <span className="eyebrow">W/kg, lactato y FC</span>
                <h2>Histórico 80-95 rpm</h2>
                <p className="muted">Sigue el coste fisiológico reciente de esa franja.</p>
              </div>
              <button className="ghost-button" type="button" onClick={() => setExpandedCyclingPanel("history")}>
                Ampliar
              </button>
            </div>
            {renderCyclingCadenceHistory(false)}
          </section>

          <section className="card cycling-insight-card ad-chart-container">
            <div className="cycling-insight-head">
              <div>
                <span className="eyebrow">Potencia y umbrales</span>
                <h2>Potencia vs lactato</h2>
                <p className="muted">Ubica cada muestra respecto a LT1 y LT2.</p>
              </div>
              <button className="ghost-button" type="button" onClick={() => setExpandedCyclingPanel("threshold")}>
                Ampliar
              </button>
            </div>
            {renderCyclingThresholdRelation(false)}
          </section>
        </section>
      ) : null}

      {dynamicThresholds ? (
        <section id="dynamic-references" className="card section-card athlete-detail-anchor ad-section">
          <div className="section-heading compact">
            <span className="eyebrow">Lectura operativa</span>
            <h2 className="section-title ad-section-title">Referencias dinámicas</h2>
          </div>
          <div className="compact-table dynamic-reference-table">
            <div className="compact-row compact-head">
              <span>Referencia</span>
              <span>{activeDiscipline === "ciclismo" ? "Potencia" : "Ritmo"}</span>
              <span>FC</span>
              <span>Fiabilidad</span>
            </div>
            {chronicDynamicReferenceRows.map(({ label, reference }) => (
              <div key={label} className="compact-row">
                <strong>{label}</strong>
                <span>{dynamicReferencePrimaryValue(reference, activeDiscipline)}</span>
                <span className="dynamic-secondary-cell">{dynamicReferenceSecondaryValue(reference)}</span>
                <span>{reference ? `${Math.round(reference.reliability_score * 100)}%` : "-"}</span>
              </div>
            ))}
          </div>
          <p className="muted dynamic-footnote" style={{ marginTop: 12 }}>
            Basal actual: {dynamicThresholds.current_baseline_lactate?.toFixed(2) ?? "-"} mmol · {formatBaselineSource(dynamicThresholds.current_baseline_source)}
            {dynamicThresholds.current_baseline_state ? ` · estado ${formatBaselineState(dynamicThresholds.current_baseline_state)}` : ""}
            {typeof dynamicThresholds.current_baseline_delta_from_history === "number"
              ? ` · Δ histórico ${dynamicThresholds.current_baseline_delta_from_history >= 0 ? "+" : ""}${dynamicThresholds.current_baseline_delta_from_history.toFixed(2)}`
              : ""}
          </p>
          <p className="muted dynamic-footnote">
            LT1 relativo orientativo: {dynamicThresholds.lt1_relative_target_lactate?.toFixed(2) ?? "-"} mmol. Estas referencias no sustituyen un umbral definitivo.
          </p>
        </section>
      ) : null}

      {dynamicThresholds ? (
        <section className="card section-card">
          <div className="section-heading compact">
            <span className="eyebrow">Temporalidad</span>
            <h2 className="section-title ad-section-title">Agudo vs crónico</h2>
          </div>
          <div className="temporal-grid">
            <div className="list-item temporal-card">
              <strong className="info-line">Modelo agudo <InfoHint label="Usa la ventana corta del modelo, pensada para reflejar el estado reciente del atleta. Sirve para detectar fatiga, pico de forma o cambios rápidos." /></strong>
              <p>Ventana: {dynamicThresholds.acute.based_on_days} días · {dynamicThresholds.acute.sessions_considered} sesiones</p>
              <div className="temporal-bar-stack">
                {[
                  { label: "Confianza", value: dynamicThresholds.acute.confidence_score, tone: "neutral" },
                  { label: "Fiabilidad", value: dynamicThresholds.acute.reliability_score, tone: "positive" },
                  { label: "Validez", value: dynamicThresholds.acute.validity_score, tone: "warning" },
                ].map((item) => (
                  <div key={`acute-${item.label}`} className="temporal-bar-group">
                    <div className="temporal-bar-head">
                      <span>{item.label}</span>
                      <strong>{Math.round(item.value * 100)}%</strong>
                    </div>
                    <div className="temporal-bar-track">
                      <div className={`temporal-bar-fill ${item.tone}`} style={{ width: `${Math.max(0, Math.min(100, item.value * 100))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="list-item temporal-card">
              <strong className="info-line">Modelo crónico <InfoHint label="Usa una ventana más larga para describir la referencia más estable del atleta. Ayuda a separar tendencia real de ruido de pocas sesiones." /></strong>
              <p>Ventana: {dynamicThresholds.chronic.based_on_days} días · {dynamicThresholds.chronic.sessions_considered} sesiones</p>
              <div className="temporal-bar-stack">
                {[
                  { label: "Confianza", value: dynamicThresholds.chronic.confidence_score, tone: "neutral" },
                  { label: "Fiabilidad", value: dynamicThresholds.chronic.reliability_score, tone: "positive" },
                  { label: "Validez", value: dynamicThresholds.chronic.validity_score, tone: "warning" },
                ].map((item) => (
                  <div key={`chronic-${item.label}`} className="temporal-bar-group">
                    <div className="temporal-bar-head">
                      <span>{item.label}</span>
                      <strong>{Math.round(item.value * 100)}%</strong>
                    </div>
                    <div className="temporal-bar-track">
                      <div className={`temporal-bar-fill ${item.tone}`} style={{ width: `${Math.max(0, Math.min(100, item.value * 100))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="list-item temporal-card temporal-comparison-card">
              <strong className="info-line">Lectura comparativa <InfoHint label="Compara modelo agudo y crónico. Si el agudo se separa mucho, puede haber mejora puntual, fatiga reciente o sesiones poco comparables." /></strong>
              <p>{dynamicThresholds.comparison.summary}</p>
              <div className="temporal-bar-stack">
                <div className="temporal-bar-group">
                  <div className="temporal-bar-head">
                    <span>
                      Efecto muestral <InfoHint label="Expresa cuánto respaldo tiene la referencia por volumen de datos. Cuanto más alto, menos depende de unas pocas muestras." />
                    </span>
                    <strong>{Math.round(dynamicThresholds.chronic.sample_size_effect * 100)}%</strong>
                  </div>
                  <div className="temporal-bar-track">
                    <div className="temporal-bar-fill positive" style={{ width: `${Math.max(0, Math.min(100, dynamicThresholds.chronic.sample_size_effect * 100))}%` }} />
                  </div>
                </div>
                <div className="temporal-bar-group">
                  <div className="temporal-bar-head">
                    <span>
                      Influencia de punto nuevo <InfoHint label="Expresa cuánto podría moverse el modelo si añades una nueva muestra comparable. Cuanto más bajo, más estable es la referencia actual." />
                    </span>
                    <strong>{Math.round(dynamicThresholds.chronic.point_influence_score * 100)}%</strong>
                  </div>
                  <div className="temporal-bar-track">
                    <div className="temporal-bar-fill negative" style={{ width: `${Math.max(0, Math.min(100, dynamicThresholds.chronic.point_influence_score * 100))}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {dynamicThresholds ? (
        <section className="card split-card">
          <div>
            <details className="insight-disclosure">
              <summary className="insight-disclosure-summary">
                <div>
                  <span className="eyebrow">Lectura guiada</span>
                  <h2 className="section-title ad-section-title">Cautelas</h2>
                </div>
                <small>{dynamicWarningCards.length ? `${dynamicWarningCards.length} avisos` : "Sin avisos"}</small>
              </summary>
              <div className="list caution-list insight-disclosure-body">
                {dynamicWarningCards.length ? (
                  dynamicWarningCards.map((warning) => (
                    <div key={warning.title} className={`list-item caution-card ad-warning-card ${warning.tone}`}>
                      <span className="caution-eyebrow ad-warning-eyebrow">{warning.eyebrow}</span>
                      <strong className="ad-warning-title">{warning.title}</strong>
                      <p className="ad-warning-body">{warning.body}</p>
                    </div>
                  ))
                ) : (
                  <p className="muted">Sin warnings adicionales para esta ventana.</p>
                )}
              </div>
            </details>
          </div>
          <div>
            <details className="insight-disclosure">
              <summary className="insight-disclosure-summary">
                <div>
                  <span className="eyebrow">Trazabilidad</span>
                  <h2 className="section-title ad-section-title">Cómo se ha calculado</h2>
                </div>
                <small>{Math.min(dynamicThresholds.explanation.length, 8)} pasos</small>
              </summary>
              <div className="list explanation-list insight-disclosure-body">
                {dynamicThresholds.explanation.slice(0, 8).map((item, index) => (
                  <div key={`${item}-${index}`} className="list-item explanation-card">
                    <span className="explanation-step">{index + 1}</span>
                    <div className="explanation-copy">
                      <p>{item}</p>
                      <small className="explanation-help">
                        {explainTechnicalItem(item)}
                        <InfoHint label={explainTechnicalItem(item)} />
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </section>
      ) : null}

      <section id="estimates" className="card section-card athlete-detail-anchor ad-section">
        <div className="section-heading compact">
          <span className="eyebrow">Estimaciones</span>
          <h2 className="section-title ad-section-title">Referencias estimadas</h2>
        </div>
        {relevantEstimates.length > 1 ? (
          <div className="estimate-selector-strip">
            {relevantEstimates.map((estimate) => {
              const raceSummary = racePredictionSummary(estimate);
              const compactValue = raceSummary
                ? raceSummary.totalTime
                : estimate.estimate_type === "FTP" && estimate.unit === "W"
                  ? formatPowerWithWeight(estimate.value, athleteWeight)
                  : `${Math.round(estimate.value * 10) / 10} ${estimate.unit}`;
              return (
                <button
                  key={`estimate-picker-${estimate.estimate_type}-${estimate.discipline}-${estimate.valid_on ?? "na"}`}
                  type="button"
                  className={`estimate-selector-card ${selectedRelevantEstimate?.estimate_type === estimate.estimate_type ? "active" : ""}`}
                  onClick={() => setSelectedEstimateType(estimate.estimate_type)}
                >
                  <span className="eyebrow">{estimate.estimate_type}</span>
                  <strong>{compactValue}</strong>
                  <small>{estimate.discipline ? disciplineLabel(estimate.discipline) : "Referencia global"}</small>
                </button>
              );
            })}
          </div>
        ) : null}
        {selectedRelevantEstimate ? (
          <>
            <div className="list estimate-grid estimate-visual-grid">
              {(() => {
                const visual = estimateVisualRange(selectedRelevantEstimate, athleteWeight);
                return (
                  <div
                    key={`${selectedRelevantEstimate.estimate_type}-${selectedRelevantEstimate.discipline}-${selectedRelevantEstimate.valid_on ?? "na"}`}
                    className="list-item estimate-card estimate-card-featured"
                  >
                    <div className="status-head">
                      <strong>{selectedRelevantEstimate.estimate_type}</strong>
                      <span className={`status-badge ${selectedRelevantEstimate.reliability_label}`}>{selectedRelevantEstimate.reliability_label}</span>
                    </div>
                    <p className="estimate-main">{visual.primary}</p>
                    <p>{visual.secondary}</p>
                    <div className="estimate-range">
                      <div className="estimate-range-track">
                        <div className="estimate-range-fill" />
                        <div className="estimate-range-marker" style={{ left: `${visual.position}%` }}>
                          <span>{visual.markerLabel}</span>
                        </div>
                      </div>
                      <div className="estimate-range-labels">
                        <small>Conservador {visual.conservativeLabel}</small>
                        <small>Mejor {visual.bestLabel}</small>
                      </div>
                    </div>
                    <p className="estimate-summary">{selectedRelevantEstimate.inputs_summary}</p>
                    <div className="estimate-support-strip">
                      <small>{Math.round(selectedRelevantEstimate.confidence * 100)}% confianza</small>
                      <small>{selectedRelevantEstimate.evidence_points} cortes</small>
                      {selectedRelevantEstimate.agreement_score !== null && selectedRelevantEstimate.agreement_score !== undefined ? (
                        <small>{Math.round(selectedRelevantEstimate.agreement_score * 100)}% acuerdo</small>
                      ) : null}
                      <small>{estimateMethodLabel(selectedRelevantEstimate.method_used)}</small>
                      {selectedRelevantEstimate.primary_anchor ? <small>{estimateAnchorLabel(selectedRelevantEstimate.primary_anchor)}</small> : null}
                    </div>
                    {selectedRelevantEstimate.anchors?.length ? (
                      <div className="estimate-anchor-grid">
                        {selectedRelevantEstimate.anchors.map((anchor) => (
                          <div key={`${anchor.label}-${anchor.unit}`} className="estimate-anchor-card">
                            <span className="eyebrow">{anchor.label}</span>
                            <strong>{formatValue(anchor.value, anchor.unit)}</strong>
                            <small>{Math.round(anchor.confidence * 100)}% confianza</small>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {selectedRelevantEstimate.range_summary ? <p className="estimate-range-summary">{selectedRelevantEstimate.range_summary}</p> : null}
                  </div>
                );
              })()}
            </div>
            {(selectedRelevantEstimate.cautions?.length || selectedRelevantEstimate.calculation_steps?.length) ? (
              <div className="estimate-insight-grid">
                <details className="insight-disclosure">
                  <summary className="insight-disclosure-summary">
                    <div>
                      <span className="eyebrow">Predicción</span>
                      <h2 className="section-title ad-section-title">Cautelas</h2>
                    </div>
                    <small>{selectedRelevantEstimate.cautions?.length ?? 0} avisos</small>
                  </summary>
                  <div className="list caution-list insight-disclosure-body">
                    {selectedRelevantEstimate.cautions?.length ? (
                      selectedRelevantEstimate.cautions.map((item, index) => (
                        <div key={`${item}-${index}`} className={`list-item caution-card ad-warning-card ${selectedRelevantEstimate.low_evidence ? "warning" : "neutral"}`}>
                          <span className="caution-eyebrow ad-warning-eyebrow">Contexto</span>
                          <strong className="ad-warning-title">Cautela {index + 1}</strong>
                          <p className="ad-warning-body">{item}</p>
                        </div>
                      ))
                    ) : (
                      <p className="muted">Sin cautelas adicionales para esta estimación.</p>
                    )}
                  </div>
                </details>
                <details className="insight-disclosure">
                  <summary className="insight-disclosure-summary">
                    <div>
                      <span className="eyebrow">Predicción</span>
                      <h2 className="section-title ad-section-title">Cómo se ha calculado</h2>
                    </div>
                    <small>{selectedRelevantEstimate.calculation_steps?.length ?? 0} pasos</small>
                  </summary>
                  <div className="list explanation-list insight-disclosure-body">
                    {selectedRelevantEstimate.calculation_steps?.length ? (
                      selectedRelevantEstimate.calculation_steps.map((item, index) => (
                        <div key={`${item}-${index}`} className="list-item explanation-card">
                          <span className="explanation-step">{index + 1}</span>
                          <div className="explanation-copy">
                            <p>{item}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="muted">Sin pasos adicionales disponibles.</p>
                    )}
                  </div>
                </details>
              </div>
            ) : null}
          </>
        ) : (
          <p className="muted">No hay estimaciones relevantes para esta disciplina.</p>
        )}
      </section>

      <section id="history" className="card split-card athlete-detail-anchor ad-section">
        <div>
          <div className="section-heading compact">
            <span className="eyebrow">Longitudinal</span>
            <h2 className="section-title ad-section-title">Evolución histórica</h2>
          </div>
          <div className="list timeline-list polished-timeline-list">
            {["LT1", "LT2", "lactate_anchor"].map((key) => {
              const point = latestHistorical(displayView.historical_evolution[key]);
              if (!point) return null;
              return (
                <div key={key} className="list-item timeline-item">
                  <span className="eyebrow muted-eyebrow">{historicalMetricLabel(key)}</span>
                  <strong>{formatValue(point.value, point.unit)}</strong>
                  <p>Última actualización {point.date}</p>
                  <small>{point.label}</small>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="section-heading compact">
            <span className="eyebrow">Dirección</span>
            <h2 className="section-title ad-section-title">Tendencias</h2>
          </div>
          <div className="list trend-grid polished-trend-grid">
            {hasHistoricalEvolution && analysis.trends.length ? (
              analysis.trends.map((trend) => (
                <div key={trend.metric} className={`list-item trend-card ${metricTone(trend.direction)}`}>
                  <span className="eyebrow muted-eyebrow">{trendDirectionLabel(trend.direction)}</span>
                  <strong>{trendMetricLabel(trend.metric)}</strong>
                  <p>
                    {trendDirectionLabel(trend.direction)} {Math.round(trend.value * 1000) / 10}%
                  </p>
                  <small>Lectura longitudinal del bloque y sus anclas repetibles.</small>
                </div>
              ))
            ) : (
              <p className="muted">Aún no hay suficientes snapshots de esta disciplina para tendencias robustas.</p>
            )}
          </div>
        </div>
      </section>

      <section id="measurements" className="table-card card athlete-detail-anchor ad-section">
        <div className="card-header">
          <div>
            <span className="eyebrow">Mediciones</span>
            <h2>Histórico de muestras de lactato</h2>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Día</th>
              <th>Intervalo</th>
              <th>Duración</th>
              <th>Descanso</th>
              <th>mmol</th>
              <th>Ritmo / Potencia</th>
              <th>FC</th>
              <th>Cadencia</th>
              <th>Sesión</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayView.measurement_log.length ? (
              displayView.measurement_log.map((entry, index) => (
                <tr key={`${entry.interval_id}-${entry.session_id}-${entry.interval_label}-${index}`}>
                  <td>{entry.session_date}</td>
                  <td>{entry.interval_label}</td>
                  <td>{formatIntervalDuration(entry.duration_seconds)}</td>
                  <td>{formatIntervalDuration(entry.rest_seconds)}</td>
                  <td>{entry.lactate_mmol.toFixed(1)}</td>
                  <td>
                    {activeDiscipline === "ciclismo"
                      ? (entry.power_watts ? `${Math.round(entry.power_watts)} W` : "-")
                      : formatPace(entry.pace_seconds_per_km)}
                    {activeDiscipline === "ciclismo" && entry.power_watts ? ` · ${formatWattsPerKg(entry.power_watts, athleteWeight)}` : ""}
                  </td>
                  <td>{entry.heart_rate_avg ?? "-"}</td>
                  <td>{entry.cadence ?? "-"}</td>
                  <td>{entry.session_type}</td>
                  <td className="measurement-action-cell">
                    <button
                      className="ghost-button danger"
                      type="button"
                      onClick={() => deleteMeasurement(entry.interval_id, `${entry.interval_label} · ${entry.session_date}`)}
                      disabled={deletingMeasurementId === entry.interval_id}
                    >
                      {deletingMeasurementId === entry.interval_id ? "Borrando..." : "Borrar"}
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="muted">No hay mediciones registradas para esta disciplina.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
