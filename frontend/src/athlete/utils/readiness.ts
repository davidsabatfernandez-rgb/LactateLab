import type { WellnessSeriesPoint } from "../types";
import { averageNumericSeries, describeHrvStatus } from "./wellness";
import { parseMetricNumber } from "./formatters";
import type { AthleteHealthMetric } from "../../types";

export function computeReadinessScore(params: {
  recoveryScore: number | null;
  currentHrv: number | null;
  hrvAverage: number | null;
  currentStress: number | null;
  bodyBatteryDelta: number | null;
  currentRestingHr?: number | null;
  restingHrAverage?: number | null;
  currentSleepHours?: number | null;
}) {
  const { recoveryScore, currentHrv, hrvAverage, currentStress, bodyBatteryDelta,
    currentRestingHr, restingHrAverage, currentSleepHours } = params;

  // Use breakdown-based score: weighted sum of all available contributors
  const breakdown = computeReadinessBreakdown({
    recoveryScore, currentHrv, hrvAverage, currentStress, bodyBatteryDelta,
    currentSleepHours: currentSleepHours ?? null,
    currentRestingHr: currentRestingHr ?? null,
    restingHrAverage: restingHrAverage ?? null,
  });

  if (breakdown.length === 0) return 50; // no data

  const weightedSum = breakdown.reduce((sum, c) => sum + c.score * c.weight, 0);
  return Math.max(0, Math.min(100, Math.round(weightedSum)));
}

export function readinessLabel(score: number) {
  if (score >= 80) return "Óptimo";
  if (score >= 60) return "Preparado";
  if (score >= 40) return "Moderado";
  if (score >= 20) return "Bajo";
  return "Crítico";
}

export function readinessTone(score: number) {
  if (score >= 80) return "high";
  if (score >= 60) return "good";
  if (score >= 40) return "mid";
  if (score >= 20) return "low";
  return "critical";
}

export function computeTrainingStatus(params: {
  currentStress: number | null;
  hrvConsecutiveLow: number;
  weeklyTotal: number;
  currentHrv: number | null;
  hrvAverage: number | null;
}) {
  const { currentStress, hrvConsecutiveLow, weeklyTotal, currentHrv, hrvAverage } = params;
  const hasHighStress = typeof currentStress === "number" && currentStress >= 65;
  const hasLowHrv = hrvConsecutiveLow >= 3;
  const hasMildStress = typeof currentStress === "number" && currentStress >= 45;
  if (hasHighStress && hasLowHrv) return { label: "Sobrecarga", tone: "alert" as const, score: 15 };
  if (hasHighStress || hasLowHrv) return { label: "Fatigado", tone: "warning" as const, score: 35 };
  if (hasMildStress && hrvConsecutiveLow >= 1) return { label: "Funcional", tone: "neutral" as const, score: 55 };
  if (weeklyTotal >= 3 && typeof currentHrv === "number" && hrvAverage !== null && currentHrv >= hrvAverage * 0.95) return { label: "Productivo", tone: "good" as const, score: 85 };
  if (weeklyTotal >= 1) return { label: "Mantenimiento", tone: "neutral" as const, score: 50 };
  return { label: "Desentrenado", tone: "low" as const, score: 20 };
}

export function computeHrvConsecutiveLow(wellnessSeries: WellnessSeriesPoint[], hrvAverage: number | null) {
  let count = 0;
  for (let i = wellnessSeries.length - 1; i >= 0; i--) {
    const p = wellnessSeries[i];
    if (p.hrv === null) break;
    if (hrvAverage !== null && p.hrv < hrvAverage * 0.9) count++;
    else break;
  }
  return count;
}

export function computeBalancePosition(params: {
  weeklyTotal: number;
  currentStress: number | null;
  hrvConsecutiveLow: number;
  currentRestingHr: number | null;
  restingHrAverage: number | null;
}) {
  const { weeklyTotal, currentStress, hrvConsecutiveLow, currentRestingHr, restingHrAverage } = params;
  if (weeklyTotal === 0) return 20;
  const hasHighStress = typeof currentStress === "number" && currentStress >= 65;
  const hasLowHrv = hrvConsecutiveLow >= 2;
  const hasHighRhr = typeof currentRestingHr === "number" && restingHrAverage !== null && currentRestingHr > restingHrAverage + 4;
  if (hasHighStress && hasLowHrv) return 80;
  if (hasHighStress || hasLowHrv || hasHighRhr) return 65;
  if (weeklyTotal >= 4) return 50;
  return 35;
}

export function balanceLabel(position: number) {
  if (position <= 25) return "Infraestimulado";
  if (position <= 40) return "Construyendo";
  if (position <= 60) return "Productivo";
  if (position <= 75) return "Cargado";
  return "Excesivo";
}

/* ── Readiness Breakdown (Halson 2014 multi-factor approach) ─────────
   No validated composite weights exist in literature (Cortes 2025).
   We expose the individual contributors transparently — each scaled
   0-100 — so the athlete sees WHY, not just a magic number.
   ─────────────────────────────────────────────────────────────────── */
export type ReadinessContributor = {
  key: string;
  label: string;
  score: number;     // 0-100 individual
  weight: number;    // 0-1, displayed as %
  description: string;
};

export function computeReadinessBreakdown(params: {
  recoveryScore: number | null;
  currentHrv: number | null;
  hrvAverage: number | null;
  currentStress: number | null;
  bodyBatteryDelta: number | null;
  currentSleepHours: number | null;
  currentRestingHr: number | null;
  restingHrAverage: number | null;
}): ReadinessContributor[] {
  const {
    recoveryScore, currentHrv, hrvAverage, currentStress,
    bodyBatteryDelta, currentSleepHours, currentRestingHr, restingHrAverage,
  } = params;

  const raw: ReadinessContributor[] = [];

  // Sleep score (Saw 2016 — subjective sleep is among most sensitive markers)
  const sleepScore = typeof recoveryScore === "number"
    ? Math.min(100, Math.round(recoveryScore))
    : typeof currentSleepHours === "number"
      ? Math.min(100, Math.round((currentSleepHours / 8) * 100))
      : null;
  if (sleepScore !== null) {
    raw.push({
      key: "sleep", label: "Sueño", score: sleepScore, weight: 0.30,
      description: sleepScore >= 75 ? "Buen descanso nocturno" : sleepScore >= 50 ? "Descanso aceptable" : "Sueño insuficiente — limita la recuperación",
    });
  }

  // HRV ratio vs baseline (Buchheit 2014 — LnRMSSD weekly avg is best autonomic marker)
  if (typeof currentHrv === "number" && hrvAverage !== null && hrvAverage > 0) {
    const ratio = currentHrv / hrvAverage;
    const hrvScore = Math.min(100, Math.max(0, Math.round((ratio - 0.7) * 200)));
    raw.push({
      key: "hrv", label: "HRV nocturna", score: hrvScore, weight: 0.25,
      description: ratio >= 1.05 ? "Por encima de tu baseline — buena señal autonómica"
        : ratio >= 0.95 ? "Dentro de tu rango normal"
        : ratio >= 0.85 ? "Ligeramente por debajo de tu baseline"
        : "Significativamente baja — el sistema nervioso está cargado",
    });
  }

  // Stress (inverted — Halson 2014: sympathetic stress as fatigue marker)
  // Garmin-only metric. For Apple-only users this is skipped and weight redistributed.
  if (typeof currentStress === "number") {
    const stressScore = Math.min(100, Math.max(0, Math.round(100 - currentStress)));
    raw.push({
      key: "stress", label: "Estrés", score: stressScore, weight: 0.20,
      description: currentStress <= 30 ? "Estrés bajo — sistema relajado"
        : currentStress <= 50 ? "Estrés moderado — dentro de lo normal"
        : "Estrés elevado — reduce la capacidad de asimilar carga",
    });
  }

  // Body battery / energy delta — Garmin-only.
  if (bodyBatteryDelta !== null) {
    const bbScore = Math.min(100, Math.max(0, Math.round(50 + bodyBatteryDelta * 1.5)));
    raw.push({
      key: "battery", label: "Batería corporal", score: bbScore, weight: 0.15,
      description: bodyBatteryDelta >= 5 ? "Buena recarga energética"
        : bodyBatteryDelta >= -5 ? "Recarga neutra"
        : "Gasto neto — el cuerpo no recargó lo suficiente",
    });
  }

  // Resting HR vs average (Buchheit 2014 — elevated RHR as overreaching signal)
  if (typeof currentRestingHr === "number" && restingHrAverage !== null && restingHrAverage > 0) {
    const rhrDelta = currentRestingHr - restingHrAverage;
    const rhrScore = Math.min(100, Math.max(0, Math.round(80 - rhrDelta * 8)));
    raw.push({
      key: "rhr", label: "FC Reposo", score: rhrScore, weight: 0.10,
      description: rhrDelta <= -2 ? "Por debajo de tu media — buena recuperación"
        : rhrDelta <= 3 ? "Dentro de tu rango habitual"
        : "Elevada — puede indicar fatiga, deshidratación o estrés",
    });
  }

  // HRV-based stress proxy for Apple-only users (Buchheit 2014: low HRV ≈ high sympathetic load)
  // Only activates when stress & body_battery are both absent but HRV is present
  const hasStress = raw.some(c => c.key === "stress");
  const hasBattery = raw.some(c => c.key === "battery");
  if (!hasStress && !hasBattery && typeof currentHrv === "number" && hrvAverage !== null && hrvAverage > 0) {
    const ratio = currentHrv / hrvAverage;
    // Low HRV relative to baseline → high sympathetic stress proxy
    const proxyScore = Math.min(100, Math.max(0, Math.round((ratio - 0.6) * 166)));
    raw.push({
      key: "stress_proxy", label: "Estrés (estimado)", score: proxyScore, weight: 0.20,
      description: ratio >= 1.0 ? "HRV normal — estrés simpático bajo"
        : ratio >= 0.85 ? "HRV ligeramente baja — estrés moderado estimado"
        : "HRV significativamente baja — estrés elevado probable",
    });
  }

  // ── Redistribute weights so they always sum to 1.0 ──
  const totalWeight = raw.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight > 0 && Math.abs(totalWeight - 1.0) > 0.01) {
    const scale = 1.0 / totalWeight;
    for (const c of raw) c.weight = Math.round(c.weight * scale * 100) / 100;
  }

  return raw;
}

/* ── ACWR Load Spike Detection ──────────────────────────────────────
   Gabbett 2016: sweet spot 0.8-1.3, danger >1.5
   Uses uncoupled ACWR (Lolli 2019) to avoid mathematical coupling.
   Impellizzeri 2020 caveats: treat as traffic-light guide, not precise.
   ─────────────────────────────────────────────────────────────────── */
export type LoadSpikeWarning = {
  discipline: string;
  acwr: number;
  level: "safe" | "caution" | "danger";
  message: string;
  weekMinutes: number;
  chronicAvgMinutes: number;
};

export function detectLoadSpikes(
  weeklyVolume: Array<Record<string, unknown>>,
  disciplines: string[],
): LoadSpikeWarning[] {
  const warnings: LoadSpikeWarning[] = [];
  if (weeklyVolume.length < 4) return warnings;

  for (const disc of disciplines) {
    const getVal = (w: Record<string, unknown>) => typeof w[disc] === "number" ? w[disc] as number : 0;
    const currentWeek = getVal(weeklyVolume[weeklyVolume.length - 1] ?? {});
    // Uncoupled chronic: weeks 2-4 (excluding current week) — Lolli 2019
    const chronic3 = weeklyVolume.slice(-4, -1).map(getVal);
    const chronicAvg = chronic3.reduce((a, b) => a + b, 0) / chronic3.length;
    if (chronicAvg <= 0) continue;
    const acwr = currentWeek / chronicAvg;
    const discLabel = disc === "running" ? "carrera" : disc === "cycling" ? "ciclismo" : disc === "swimming" ? "natación" : disc;

    if (acwr > 1.5) {
      warnings.push({
        discipline: discLabel, acwr, level: "danger",
        message: `Tu volumen de ${discLabel} esta semana es ${Math.round((acwr - 1) * 100)}% mayor que tu media de 3 semanas. Riesgo de lesión elevado (Gabbett 2016). Considera reducir.`,
        weekMinutes: currentWeek, chronicAvgMinutes: chronicAvg,
      });
    } else if (acwr > 1.3) {
      warnings.push({
        discipline: discLabel, acwr, level: "caution",
        message: `Volumen de ${discLabel} un ${Math.round((acwr - 1) * 100)}% sobre tu media reciente. Vigila sensaciones y recuperación.`,
        weekMinutes: currentWeek, chronicAvgMinutes: chronicAvg,
      });
    }
  }
  return warnings;
}

/* ── Morning Wellness Check-in ──────────────────────────────────────
   Based on McLean 2010 (5-item) and Hooper & Mackinnon 1995 (4-item).
   Saw 2016 systematic review: subjective measures are more sensitive
   than HRV, cortisol, or blood markers for detecting training response.
   We use 4 items on a 1-5 Likert scale for compliance (Hooper format).
   ─────────────────────────────────────────────────────────────────── */
export type WellnessCheckItem = {
  key: string;
  label: string;
  anchors: [string, string]; // [worst, best]
};

export const WELLNESS_CHECK_ITEMS: WellnessCheckItem[] = [
  { key: "fatigue", label: "Fatiga", anchors: ["Agotado", "Fresco"] },
  { key: "soreness", label: "Dolor muscular", anchors: ["Muy dolorido", "Sin dolor"] },
  { key: "mood", label: "Ánimo", anchors: ["Bajo", "Muy positivo"] },
  { key: "sleep_quality", label: "Calidad de sueño", anchors: ["Muy mala", "Excelente"] },
];

export type WellnessCheckEntry = Record<string, number>; // key → 1-5

export function wellnessCheckAverage(entry: WellnessCheckEntry): number {
  const vals = Object.values(entry);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function wellnessCheckTone(avg: number): "good" | "mid" | "warning" {
  if (avg >= 4) return "good";
  if (avg >= 3) return "mid";
  return "warning";
}
