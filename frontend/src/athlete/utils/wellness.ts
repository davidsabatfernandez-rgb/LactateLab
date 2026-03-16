import type { AthleteHealthDaily } from "../../types";
import type { WellnessSeriesPoint, SleepStageKey, SleepStageSegment } from "../types";

export function buildWellnessSeries(days: AthleteHealthDaily[]): WellnessSeriesPoint[] {
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
      steps: typeof day.steps === "number" ? day.steps : null,
    }));
}

export function describeHrvStatus(status?: string | null) {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) return "HRV pendiente";
  if (normalized.includes("very low") || normalized.includes("muy bajo")) return "Muy por debajo";
  if (normalized.includes("low") || normalized.includes("bajo")) return "Por debajo";
  if (normalized.includes("very high") || normalized.includes("muy alto")) return "Muy por encima";
  if (normalized.includes("high") || normalized.includes("alto")) return "Por encima";
  if (normalized.includes("balanced") || normalized.includes("normal") || normalized.includes("on path") || normalized.includes("ok")) return "En rango";
  if (normalized.includes("unbalanced")) return "Fuera de rango";
  return status ?? "HRV pendiente";
}

export function hrvStatusTone(status?: string | null) {
  const normalized = describeHrvStatus(status).toLowerCase();
  if (normalized.includes("muy por encima")) return "high";
  if (normalized.includes("por encima")) return "good";
  if (normalized.includes("en rango")) return "neutral";
  if (normalized.includes("por debajo")) return "warning";
  if (normalized.includes("muy por debajo") || normalized.includes("fuera")) return "alert";
  return "neutral";
}

export function recoveryTone(score?: number | null) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "neutral";
  if (score >= 82) return "high";
  if (score >= 65) return "medium";
  return "low";
}

export function sleepScoreLabel(score?: number | null) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "Lectura pendiente";
  if (score >= 88) return "Muy reparador";
  if (score >= 75) return "Sueño sólido";
  if (score >= 60) return "Sueño aceptable";
  return "Sueño mejorable";
}

export function stressLabel(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Sin lectura";
  if (value >= 76) return "Muy alto";
  if (value >= 56) return "Alto";
  if (value >= 31) return "Moderado";
  return "Controlado";
}

export function bodyBatteryDirectionLabel(current?: number | null, average?: number | null) {
  if (typeof current !== "number" || !Number.isFinite(current)) return "Sin referencia";
  if (typeof average !== "number" || !Number.isFinite(average)) return "Sin referencia";
  const delta = current - average;
  if (delta >= 3) return "Subiendo";
  if (delta <= -3) return "Bajando";
  return "Estable";
}

export function restingHrLabel(current?: number | null, average?: number | null) {
  if (typeof current !== "number" || !Number.isFinite(current)) return "Sin lectura";
  if (typeof average !== "number" || !Number.isFinite(average)) return "Sin referencia";
  const delta = current - average;
  if (delta >= 6) return "Muy alta";
  if (delta >= 3) return "Alta";
  if (delta <= -4) return "Muy baja";
  if (delta <= -2) return "Baja";
  return "En rango";
}

export function averageNumericSeries(values: Array<number | null | undefined>) {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

export function parseSleepStageSegments(payload: Record<string, unknown>): SleepStageSegment[] {
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
    awake: "awake", wake: "awake", rem: "rem", light: "light", core: "light", deep: "deep",
  };

  function parseTimestamp(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value > 1_000_000_000_000 ? value : value * 1000;
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    }
    return null;
  }

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
