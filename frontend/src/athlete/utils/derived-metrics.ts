/**
 * Derived physiological metrics — calculated from existing health + performance data.
 * All formulas backed by peer-reviewed literature.
 */

import type { WellnessSeriesPoint } from "../types";

// ═══════════════════════════════════════════════════════════════════
// 1. CARDIOVASCULAR BIOLOGICAL AGE
//    Nes et al. 2013 (HUNT3 Study, n=4,631 maximal tests within n≈37,000)
//    Fitness Age = chronological_age - 0.2 × (VO2max_measured - VO2max_expected)
//    Expected VO2max via linear regression through HUNT3 normative means.
// ═══════════════════════════════════════════════════════════════════

function expectedVO2max(age: number, sex: "male" | "female"): number {
  // Linear regression through HUNT3 decade means:
  // Men:   20s→54, 30s→49, 40s→47, 50s→42, 60s→39, 70+→34
  // Women: 20s→43, 30s→40, 40s→38, 50s→34, 60s→31, 70+→27
  if (sex === "male") return Math.max(20, 62.9 - 0.407 * age);
  return Math.max(16, 50.9 - 0.343 * age);
}

export type CardiovascularAge = {
  fitnessAge: number;
  chronologicalAge: number;
  delta: number;            // negative = younger than chronological
  vo2maxMeasured: number;
  vo2maxExpected: number;
  interpretation: string;
  reference: string;
};

export function computeCardiovascularAge(
  vo2max: number,
  chronologicalAge: number,
  sex: "male" | "female",
): CardiovascularAge | null {
  if (vo2max <= 0 || chronologicalAge < 15) return null;

  const expected = expectedVO2max(chronologicalAge, sex);
  const fitnessAge = Math.round(chronologicalAge - 0.2 * (vo2max - expected));
  const delta = fitnessAge - chronologicalAge;

  let interpretation: string;
  if (delta <= -10) interpretation = "Tu sistema cardiovascular funciona como alguien mucho mas joven. Excelente capacidad aerobica.";
  else if (delta <= -5) interpretation = "Tu corazon es significativamente mas joven que tu edad. Buen nivel de fitness.";
  else if (delta <= -1) interpretation = "Ligeramente por encima de la media para tu edad.";
  else if (delta <= 2) interpretation = "Tu capacidad cardiovascular es acorde a tu edad.";
  else if (delta <= 7) interpretation = "Tu capacidad aerobica esta por debajo de la media. El entrenamiento aerobico la mejorara.";
  else interpretation = "Capacidad aerobica significativamente baja para tu edad. Consulta con un profesional.";

  return {
    fitnessAge: Math.max(15, fitnessAge),
    chronologicalAge,
    delta,
    vo2maxMeasured: vo2max,
    vo2maxExpected: Math.round(expected * 10) / 10,
    interpretation,
    reference: "Nes et al. 2013, HUNT3 Fitness Study (Med Sci Sports Exerc)",
  };
}

// ═══════════════════════════════════════════════════════════════════
// 2. AUTONOMIC AGE (HRV)
//    Yoon et al. 2020 (Front. Aging Neurosci.) — 5-min SDNN regression:
//      SDNN = -0.502 × age + 53.907  (R²=0.343)
//    Inverted: Autonomic_Age = (53.907 - SDNN) / 0.502
//    Agelink et al. 2001 (Clin Auton Res) — normative ranges.
//    Nunan et al. 2010 (Pacing Clin Electrophysiol) — meta-analysis.
//
//    NOTE: Garmin/Apple report overnight SDNN which is closer to 5-min
//    supine recordings than 24h Holter SDNN. We use the Yoon regression.
// ═══════════════════════════════════════════════════════════════════

// Normative 5-min SDNN by decade (Yoon 2020, Table 2)
const SDNN_NORMS: Array<{ minAge: number; maxAge: number; mean: number }> = [
  { minAge: 19, maxAge: 29, mean: 43.1 },
  { minAge: 30, maxAge: 39, mean: 35.5 },
  { minAge: 40, maxAge: 49, mean: 30.2 },
  { minAge: 50, maxAge: 59, mean: 26.5 },
  { minAge: 60, maxAge: 69, mean: 23.5 },
  { minAge: 70, maxAge: 99, mean: 20.0 },
];

function expectedSDNN(age: number): number {
  return Math.max(15, 53.907 - 0.502 * age);
}

export type AutonomicAge = {
  autonomicAge: number;
  chronologicalAge: number;
  delta: number;            // negative = younger
  sdnnMeasured: number;
  sdnnExpected: number;
  percentileLabel: string;  // vs age-matched norms
  interpretation: string;
  reference: string;
};

export function computeAutonomicAge(
  sdnn: number,
  chronologicalAge: number,
): AutonomicAge | null {
  if (sdnn <= 0 || chronologicalAge < 15) return null;

  const autonomicAge = Math.round((53.907 - sdnn) / 0.502);
  const delta = autonomicAge - chronologicalAge;
  const expected = expectedSDNN(chronologicalAge);

  // Percentile vs age-matched norms
  const norm = SDNN_NORMS.find(n => chronologicalAge >= n.minAge && chronologicalAge <= n.maxAge) ?? SDNN_NORMS[SDNN_NORMS.length - 1];
  const ratio = sdnn / norm.mean;
  let percentileLabel: string;
  if (ratio >= 1.3) percentileLabel = "Superior";
  else if (ratio >= 1.1) percentileLabel = "Excelente";
  else if (ratio >= 0.9) percentileLabel = "Normal";
  else if (ratio >= 0.7) percentileLabel = "Por debajo";
  else percentileLabel = "Bajo";

  let interpretation: string;
  if (delta <= -10) interpretation = "Tu sistema nervioso autonomo funciona como alguien mucho mas joven. Excelente tono vagal.";
  else if (delta <= -5) interpretation = "Tu regulacion autonomica esta por encima de la media. Buena recuperacion parasimpatica.";
  else if (delta <= -1) interpretation = "Tu HRV es ligeramente mejor que la media para tu edad.";
  else if (delta <= 3) interpretation = "Tu tono autonomico es acorde a tu edad.";
  else if (delta <= 8) interpretation = "Tu HRV es inferior a la media. El entrenamiento aerobico y el sueno la mejoran.";
  else interpretation = "HRV significativamente baja. Puede reflejar estres cronico, fatiga o falta de actividad.";

  return {
    autonomicAge: Math.max(15, autonomicAge),
    chronologicalAge,
    delta,
    sdnnMeasured: Math.round(sdnn * 10) / 10,
    sdnnExpected: Math.round(expected * 10) / 10,
    percentileLabel,
    interpretation,
    reference: "Yoon et al. 2020 (Front. Aging Neurosci.), Agelink et al. 2001, Nunan et al. 2010",
  };
}

// ═══════════════════════════════════════════════════════════════════
// 3. RECOVERY CAPACITY
//    Buchheit 2014 (Front. Physiol.) — lnRMSSD CV as recovery marker.
//    We use overnight SDNN as proxy (Garmin/Apple don't export RMSSD).
//    Recovery = low CV (stable HRV) + high mean relative to baseline.
//    CV > 10% = high perturbation; < 5% = well-recovered or undertrained.
//
//    Additional: correlation between daily load (TSS proxy via intensity
//    minutes) and next-day HRV change → high negative correlation means
//    the athlete responds strongly to load but recovers.
// ═══════════════════════════════════════════════════════════════════

export type RecoveryCapacity = {
  score: number;          // 0-100
  label: string;
  hrvMean7d: number;
  hrvCV7d: number;        // coefficient of variation %
  reboundRate: number;    // % of sessions where HRV rebounds within 48h
  interpretation: string;
  reference: string;
};

export function computeRecoveryCapacity(
  wellnessSeries: WellnessSeriesPoint[],
): RecoveryCapacity | null {
  // Need at least 7 days of HRV data
  const hrvValues = wellnessSeries
    .slice(-14) // last 14 days
    .map(p => p.hrv)
    .filter((v): v is number => v !== null && v > 0);

  if (hrvValues.length < 5) return null;

  const mean = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;
  const sd = Math.sqrt(hrvValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / hrvValues.length);
  const cv = (sd / mean) * 100;

  // Rebound rate: after a low day (< mean - 0.5*sd), does HRV come back up within 2 days?
  let rebounds = 0;
  let dips = 0;
  for (let i = 0; i < hrvValues.length - 2; i++) {
    if (hrvValues[i] < mean - 0.5 * sd) {
      dips++;
      const next1 = hrvValues[i + 1];
      const next2 = hrvValues[i + 2];
      if (next1 >= mean * 0.9 || next2 >= mean * 0.9) rebounds++;
    }
  }
  const reboundRate = dips > 0 ? Math.round((rebounds / dips) * 100) : 100;

  // Score: composite of CV (lower = better, but too low = undertrained) and rebound
  let cvScore: number;
  if (cv < 3) cvScore = 60;       // suspiciously stable — could be undertrained
  else if (cv < 6) cvScore = 95;  // excellent recovery dynamics
  else if (cv < 10) cvScore = 80; // good — normal oscillation
  else if (cv < 15) cvScore = 55; // moderate perturbation
  else cvScore = 30;              // high instability

  const score = Math.round(cvScore * 0.6 + reboundRate * 0.4);

  let label: string;
  if (score >= 85) label = "Excelente";
  else if (score >= 70) label = "Buena";
  else if (score >= 50) label = "Moderada";
  else if (score >= 30) label = "Limitada";
  else label = "Comprometida";

  let interpretation: string;
  if (score >= 85) interpretation = "Tu sistema nervioso recupera bien tras la carga. Puedes tolerar bloques exigentes.";
  else if (score >= 70) interpretation = "Buena capacidad de rebote. Tu HRV vuelve a baseline en 24-48h tras sesiones intensas.";
  else if (score >= 50) interpretation = "Recuperacion moderada. Vigila la acumulacion de fatiga en semanas de carga.";
  else interpretation = "Tu HRV muestra dificultad para recuperarse. Prioriza sueno y reduce carga si persiste.";

  return {
    score,
    label,
    hrvMean7d: Math.round(mean * 10) / 10,
    hrvCV7d: Math.round(cv * 10) / 10,
    reboundRate,
    interpretation,
    reference: "Buchheit 2014 (Front. Physiol.) — lnRMSSD CV monitoring framework",
  };
}

// ═══════════════════════════════════════════════════════════════════
// 4. AEROBIC RESERVE
//    ACSM / Cooper Institute normative VO2max tables.
//    Reserve = how far above/below the population median for age & sex.
//    Heyward 1998, ACSM Guidelines for Exercise Testing (11th ed.)
// ═══════════════════════════════════════════════════════════════════

type VO2maxCategory = "very_poor" | "poor" | "fair" | "good" | "excellent" | "superior";

// Cooper Institute VO2max classifications (ml/kg/min)
// Format: [very_poor_max, poor_max, fair_max, good_max, excellent_max]
// Superior = anything above excellent_max
const VO2_NORMS_MALE: Record<string, number[]> = {
  "13-19": [35.0, 38.3, 45.1, 50.9, 55.9],
  "20-29": [33.0, 36.4, 42.4, 46.4, 52.4],
  "30-39": [31.5, 35.4, 40.9, 44.9, 49.4],
  "40-49": [30.2, 33.5, 38.9, 43.7, 48.0],
  "50-59": [26.1, 30.9, 35.7, 40.9, 45.3],
  "60+":   [20.5, 26.0, 32.2, 36.4, 44.2],
};

const VO2_NORMS_FEMALE: Record<string, number[]> = {
  "13-19": [25.0, 30.9, 34.9, 38.9, 41.9],
  "20-29": [23.6, 28.9, 32.9, 36.9, 41.0],
  "30-39": [22.8, 26.9, 31.4, 35.6, 40.0],
  "40-49": [21.0, 24.4, 28.9, 32.8, 36.9],
  "50-59": [20.2, 22.7, 26.9, 31.4, 35.7],
  "60+":   [17.5, 20.1, 24.4, 30.2, 31.4],
};

function ageKey(age: number): string {
  if (age < 20) return "13-19";
  if (age < 30) return "20-29";
  if (age < 40) return "30-39";
  if (age < 50) return "40-49";
  if (age < 60) return "50-59";
  return "60+";
}

function classifyVO2max(vo2max: number, age: number, sex: "male" | "female"): { category: VO2maxCategory; label: string } {
  const norms = sex === "male" ? VO2_NORMS_MALE : VO2_NORMS_FEMALE;
  const cutoffs = norms[ageKey(age)];
  if (!cutoffs) return { category: "fair", label: "Normal" };

  if (vo2max < cutoffs[0]) return { category: "very_poor", label: "Muy bajo" };
  if (vo2max <= cutoffs[1]) return { category: "poor", label: "Bajo" };
  if (vo2max <= cutoffs[2]) return { category: "fair", label: "Normal" };
  if (vo2max <= cutoffs[3]) return { category: "good", label: "Bueno" };
  if (vo2max <= cutoffs[4]) return { category: "excellent", label: "Excelente" };
  return { category: "superior", label: "Superior" };
}

export type AerobicReserve = {
  vo2max: number;
  category: VO2maxCategory;
  categoryLabel: string;
  reservePct: number;       // % above/below median for age
  theoreticalMax: number;   // top of "excellent" for age
  roomToGrow: number;       // % gap to "superior" threshold
  interpretation: string;
  reference: string;
};

export function computeAerobicReserve(
  vo2max: number,
  age: number,
  sex: "male" | "female",
): AerobicReserve | null {
  if (vo2max <= 0 || age < 13) return null;

  const { category, label: categoryLabel } = classifyVO2max(vo2max, age, sex);
  const norms = sex === "male" ? VO2_NORMS_MALE : VO2_NORMS_FEMALE;
  const cutoffs = norms[ageKey(age)];
  if (!cutoffs) return null;

  // Median ≈ midpoint of "fair" range
  const median = (cutoffs[1] + cutoffs[2]) / 2;
  const reservePct = Math.round(((vo2max - median) / median) * 100);

  // Theoretical max for age = top of "excellent"
  const theoreticalMax = cutoffs[4];
  const roomToGrow = Math.max(0, Math.round(((theoreticalMax - vo2max) / theoreticalMax) * 100));

  let interpretation: string;
  if (category === "superior") interpretation = `Tu VO2max esta en el top 5% para tu grupo de edad. Capacidad aerobica excepcional.`;
  else if (category === "excellent") interpretation = `Estas en el top 20%. Margen de mejora limitado pero posible con entrenamiento especifico.`;
  else if (category === "good") interpretation = `Por encima de la media. Tienes un ${roomToGrow}% de margen hasta el nivel excelente.`;
  else if (category === "fair") interpretation = `Dentro de la media poblacional. El entrenamiento aerobico estructurado puede mejorar tu VO2max un 15-20%.`;
  else interpretation = `Tu VO2max esta por debajo de la media. El entrenamiento aerobico consistente es la prioridad.`;

  return {
    vo2max,
    category,
    categoryLabel,
    reservePct,
    theoreticalMax,
    roomToGrow,
    interpretation,
    reference: "ACSM / Cooper Institute (Heyward 1998, ACSM Guidelines 11th ed.)",
  };
}

// ═══════════════════════════════════════════════════════════════════
// COMPOSITE: compute all derived metrics at once
// ═══════════════════════════════════════════════════════════════════

export type DerivedMetrics = {
  cardiovascularAge: CardiovascularAge | null;
  autonomicAge: AutonomicAge | null;
  recoveryCapacity: RecoveryCapacity | null;
  aerobicReserve: AerobicReserve | null;
};

export function computeAllDerivedMetrics(params: {
  vo2max: number | null;
  hrvSdnn: number | null;          // current or 7d avg
  chronologicalAge: number | null;
  sex: string | null;              // "male" | "female" | "M" | "F" | "hombre" | "mujer"
  wellnessSeries: WellnessSeriesPoint[];
}): DerivedMetrics {
  const { vo2max, hrvSdnn, chronologicalAge, sex, wellnessSeries } = params;

  const normalizedSex: "male" | "female" =
    (sex === "male" || sex === "M" || sex === "hombre" || sex === "masculino") ? "male" : "female";

  return {
    cardiovascularAge: vo2max && chronologicalAge
      ? computeCardiovascularAge(vo2max, chronologicalAge, normalizedSex)
      : null,
    autonomicAge: hrvSdnn && chronologicalAge
      ? computeAutonomicAge(hrvSdnn, chronologicalAge)
      : null,
    recoveryCapacity: computeRecoveryCapacity(wellnessSeries),
    aerobicReserve: vo2max && chronologicalAge
      ? computeAerobicReserve(vo2max, chronologicalAge, normalizedSex)
      : null,
  };
}
