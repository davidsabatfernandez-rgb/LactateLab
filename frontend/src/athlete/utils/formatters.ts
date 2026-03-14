import type { Estimate } from "../../types";
import type { ResolvedTrainingThreshold } from "../../lib/trainingThresholds";

export function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatSecondsToClock(totalSeconds?: number | null) {
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

export function formatPace(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "n/d";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}/km`;
}

export function formatSwimPace(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "n/d";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}/100m`;
}

export function formatTarget(estimate: Estimate) {
  if (estimate.estimate_type === "FTP") return `${Math.round(estimate.value)} W`;
  if (estimate.unit === "s/km") return formatPace(estimate.value);
  return `${estimate.value.toFixed(1)} ${estimate.unit}`;
}

export function formatEstimateValue(estimate?: Estimate | null) {
  if (!estimate) return "n/d";
  if (estimate.estimate_type === "FTP") return `${Math.round(estimate.value)} W`;
  if (estimate.unit === "s/km") return formatPace(estimate.value);
  return `${Math.round(estimate.value * 10) / 10} ${estimate.unit}`;
}

export function formatLactateValue(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  return `${value.toFixed(1)} mmol/L`;
}

export function formatSleepDuration(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "n/d";
  const totalMinutes = Math.round(value / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

export function formatNumericMetric(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  return `${Math.round(value)}`;
}

export function formatTrendValue(value?: number | null, discipline?: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  if (discipline === "ciclismo") return `${Math.round(value)} W`;
  if (discipline === "natación") return formatSwimPace(value / 10);
  return formatPace(value);
}

export function renderThresholdValue(threshold?: ResolvedTrainingThreshold | null, discipline?: string) {
  if (!threshold) return "n/d";
  if (discipline === "ciclismo" && typeof threshold.powerWatts === "number") return `${Math.round(threshold.powerWatts)} W`;
  if (discipline === "natación" && typeof threshold.paceSecondsPerKm === "number") return formatSwimPace(threshold.paceSecondsPerKm / 10);
  if (typeof threshold.paceSecondsPerKm === "number") return formatPace(threshold.paceSecondsPerKm);
  if (typeof threshold.powerWatts === "number") return `${Math.round(threshold.powerWatts)} W`;
  return "n/d";
}

export function disciplineLabel(discipline: string) {
  if (discipline === "running") return "Carrera a pie";
  if (discipline === "ciclismo") return "Ciclismo";
  if (discipline === "natación") return "Natación";
  if (discipline === "triatlón") return "Triatlón";
  return discipline;
}

export function disciplineOrder(discipline: string) {
  if (discipline === "natación") return 0;
  if (discipline === "ciclismo") return 1;
  if (discipline === "running") return 2;
  return 3;
}

export function shortText(value?: string | null, maxLength = 120) {
  if (!value) return "";
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trimEnd()}...`;
}

export function confidenceLabel(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Lectura abierta";
  if (value >= 0.78) return "Alta confianza";
  if (value >= 0.58) return "Confianza media";
  return "Evidencia limitada";
}

export function relativeCountdownLabel(days: number | null) {
  if (days === null) return "Fecha pendiente";
  if (days < 0) return "Objetivo pasado";
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `${days} días`;
}

export function daysUntil(date?: string | null) {
  if (!date) return null;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function parseMetricNumber(value?: string | null) {
  if (!value) return null;
  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDurationLabelToSeconds(value?: string | null) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  const hours = normalized.match(/(\d+)\s*h/);
  const minutes = normalized.match(/(\d+)\s*m/);
  const seconds = normalized.match(/(\d+)\s*s/);
  const totalSeconds = (hours ? Number(hours[1]) * 3600 : 0) + (minutes ? Number(minutes[1]) * 60 : 0) + (seconds ? Number(seconds[1]) : 0);
  return totalSeconds > 0 ? totalSeconds : null;
}

export function formatDurationMin(minutes?: number | null) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}
