// Insight Engine — generates personalized text based on athlete's current values

import { METRIC_REGISTRY, type MetricDefinition } from "./metricRegistry";

export type InsightResult = {
  text: string;
  tone: "positive" | "warning" | "neutral";
  rangeLabel: string;
};

type InsightParams = {
  metricId: string;
  currentValue: number | null;
  average7d: number | null;
  average28d?: number | null;
  // For relative metrics (HRV, resting_hr) where ranges are relative to average
  useRelativeRanges?: boolean;
  // Extra context
  hrvConsecutiveLow?: number;
  discipline?: string;
};

export function generateInsight(params: InsightParams): InsightResult {
  const { metricId, currentValue, average7d } = params;
  const metric = METRIC_REGISTRY[metricId];
  if (!metric || currentValue === null) {
    return { text: "Sin datos suficientes para generar una interpretación.", tone: "neutral", rangeLabel: "n/d" };
  }

  // Special cases with custom logic
  switch (metricId) {
    case "hrv":
      return hrvInsight(params, metric);
    case "sleep":
      return absoluteRangeInsight(currentValue, metric);
    case "resting_hr":
      return restingHrInsight(params, metric);
    case "stress":
      return absoluteRangeInsight(currentValue, metric);
    case "body_battery":
      return absoluteRangeInsight(currentValue, metric);
    case "readiness":
      return absoluteRangeInsight(currentValue, metric);
    case "vo2max":
      return absoluteRangeInsight(currentValue, metric);
    default:
      return absoluteRangeInsight(currentValue, metric);
  }
}

function hrvInsight(params: InsightParams, metric: MetricDefinition): InsightResult {
  const { currentValue, average7d, hrvConsecutiveLow } = params;
  if (currentValue === null || average7d === null || average7d === 0) {
    return { text: "Sin datos suficientes de HRV.", tone: "neutral", rangeLabel: "n/d" };
  }

  const ratio = currentValue / average7d;

  if (hrvConsecutiveLow && hrvConsecutiveLow >= 3) {
    return {
      text: `Llevas ${hrvConsecutiveLow} días consecutivos por debajo de tu baseline (media 7d: ${Math.round(average7d)} ms). Esto sugiere fatiga acumulada. Valora reducir intensidad y priorizar sueño.`,
      tone: "warning",
      rangeLabel: "Baja sostenida",
    };
  }

  const range = metric.ranges.find((r) => ratio >= r.min && ratio < r.max);
  if (!range) return { text: "Datos insuficientes.", tone: "neutral", rangeLabel: "n/d" };

  const pct = Math.abs(Math.round((ratio - 1) * 100));
  let text = range.detail;
  if (ratio < 0.85) {
    text += ` Tu HRV hoy (${Math.round(currentValue)} ms) está un ${pct}% por debajo de tu media (${Math.round(average7d)} ms).`;
  } else if (ratio > 1.05) {
    text += ` Tu HRV hoy (${Math.round(currentValue)} ms) está un ${pct}% por encima de tu media (${Math.round(average7d)} ms).`;
  } else {
    text += ` Hoy: ${Math.round(currentValue)} ms · Media 7d: ${Math.round(average7d)} ms.`;
  }

  return { text, tone: range.tone, rangeLabel: range.label };
}

function restingHrInsight(params: InsightParams, metric: MetricDefinition): InsightResult {
  const { currentValue, average7d } = params;
  if (currentValue === null || average7d === null || average7d === 0) {
    return { text: "Sin datos suficientes de FC en reposo.", tone: "neutral", rangeLabel: "n/d" };
  }

  // Ranges are delta from average
  const delta = currentValue - average7d;
  const range = metric.ranges.find((r) => delta >= r.min && delta < r.max);
  if (!range) return { text: "Datos insuficientes.", tone: "neutral", rangeLabel: "n/d" };

  let text = range.detail;
  text += ` Hoy: ${Math.round(currentValue)} bpm · Media: ${Math.round(average7d)} bpm (${delta > 0 ? "+" : ""}${Math.round(delta)} bpm).`;

  return { text, tone: range.tone, rangeLabel: range.label };
}

function absoluteRangeInsight(currentValue: number, metric: MetricDefinition): InsightResult {
  const range = metric.ranges.find((r) => currentValue >= r.min && currentValue < r.max);
  if (!range) {
    // Fallback to last range
    const last = metric.ranges[metric.ranges.length - 1];
    if (last) return { text: last.detail, tone: last.tone, rangeLabel: last.label };
    return { text: "Sin interpretación disponible.", tone: "neutral", rangeLabel: "n/d" };
  }
  return { text: range.detail, tone: range.tone, rangeLabel: range.label };
}
