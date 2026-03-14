import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Area,
} from "recharts";
import type { WellnessSeriesPoint } from "../types";

type TabKey = "7d" | "28d" | "trend";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  metricKey: string;
  currentValue: number | null;
  unit: string;
  wellnessSeries: WellnessSeriesPoint[];
  average7d: number | null;
  average30d: number | null;
};

function getMetricValue(
  point: WellnessSeriesPoint,
  metricKey: string
): number | null {
  return (point as Record<string, unknown>)[metricKey] as number | null;
}

function formatDelta(current: number, avg: number): { pct: string; dir: "up" | "down" | "flat" } {
  if (avg === 0) return { pct: "--", dir: "flat" };
  const pct = ((current - avg) / Math.abs(avg)) * 100;
  const dir = pct > 1 ? "up" : pct < -1 ? "down" : "flat";
  return { pct: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`, dir };
}

function isPositiveDirection(metricKey: string, dir: "up" | "down" | "flat"): boolean {
  const invertedMetrics = ["restingHr", "stress", "breathingEvents"];
  if (dir === "flat") return true;
  if (invertedMetrics.includes(metricKey)) {
    return dir === "down";
  }
  return dir === "up";
}

function generateInsight(
  metricKey: string,
  current: number | null,
  avg: number | null,
  periodLabel: string
): string {
  if (current == null || avg == null) return "Datos insuficientes para generar insight.";

  const delta = formatDelta(current, avg);
  const positive = isPositiveDirection(metricKey, delta.dir);

  const metricNames: Record<string, string> = {
    sleepScore: "puntuacion de sueno",
    sleepHours: "horas de sueno",
    hrv: "variabilidad cardiaca",
    restingHr: "frecuencia cardiaca en reposo",
    stress: "nivel de estres",
    intensityMinutes: "minutos de intensidad",
    bodyBatteryChange: "cambio de Body Battery",
    respirationRate: "frecuencia respiratoria",
    breathingEvents: "eventos respiratorios",
    weight: "peso",
  };

  const name = metricNames[metricKey] ?? metricKey;

  if (delta.dir === "flat") {
    return `Tu ${name} se mantiene estable respecto a la media de ${periodLabel}. Buen signo de consistencia.`;
  }

  if (positive) {
    return `Tu ${name} ha mejorado ${delta.pct} respecto a la media de ${periodLabel}. La tendencia es positiva.`;
  }

  return `Tu ${name} muestra un cambio de ${delta.pct} respecto a la media de ${periodLabel}. Presta atencion a la recuperacion.`;
}

const ArrowUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

const ArrowDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </svg>
);

export default function MetricCompareModal({
  open,
  onClose,
  title,
  metricKey,
  currentValue,
  unit,
  wellnessSeries,
  average7d,
  average30d,
}: Props) {
  const [tab, setTab] = useState<TabKey>("7d");

  const chartData7d = useMemo(() => {
    const slice = wellnessSeries.slice(-7);
    return slice.map((p) => ({
      label: p.shortLabel,
      value: getMetricValue(p, metricKey),
    }));
  }, [wellnessSeries, metricKey]);

  const chartData28d = useMemo(() => {
    const slice = wellnessSeries.slice(-28);
    return slice.map((p) => ({
      label: p.shortLabel,
      value: getMetricValue(p, metricKey),
    }));
  }, [wellnessSeries, metricKey]);

  const trendData = useMemo(() => {
    const slice = wellnessSeries.slice(-28);
    return slice.map((p) => ({
      label: p.shortLabel,
      value: getMetricValue(p, metricKey),
    }));
  }, [wellnessSeries, metricKey]);

  // Compute reference bands for trend tab
  const trendStats = useMemo(() => {
    const values = trendData.map((d) => d.value).filter((v): v is number => v != null);
    if (values.length === 0) return null;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const p25 = sorted[Math.floor(sorted.length * 0.25)] ?? mean;
    const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? mean;
    return { mean, p25, p75 };
  }, [trendData]);

  if (!open) return null;

  const activeAvg = tab === "7d" ? average7d : tab === "28d" ? average30d : average30d;
  const activeData = tab === "trend" ? trendData : tab === "7d" ? chartData7d : chartData28d;
  const periodLabel = tab === "7d" ? "7 dias" : "28 dias";

  const delta =
    currentValue != null && activeAvg != null
      ? formatDelta(currentValue, activeAvg)
      : null;

  const deltaPositive =
    delta != null ? isPositiveDirection(metricKey, delta.dir) : true;

  const insight = generateInsight(metricKey, currentValue, activeAvg, periodLabel);

  return (
    <div className="ath-compare-overlay" onClick={onClose}>
      <div className="ath-compare-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ath-compare-header">
          <h2>{title}</h2>
          <button className="ath-compare-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="ath-compare-tabs">
          <button
            className={`ath-compare-tab ${tab === "7d" ? "active" : ""}`}
            onClick={() => setTab("7d")}
          >
            Hoy vs 7d
          </button>
          <button
            className={`ath-compare-tab ${tab === "28d" ? "active" : ""}`}
            onClick={() => setTab("28d")}
          >
            Hoy vs 28d
          </button>
          <button
            className={`ath-compare-tab ${tab === "trend" ? "active" : ""}`}
            onClick={() => setTab("trend")}
          >
            Tendencia
          </button>
        </div>

        <div className="ath-compare-body">
          {/* Comparison numbers */}
          {tab !== "trend" && (
            <div className="ath-compare-numbers">
              <div className="ath-compare-current">
                <span className="ath-compare-numbers-label">Hoy</span>
                <span className="ath-compare-numbers-value">
                  {currentValue != null ? currentValue.toFixed(1) : "--"}
                </span>
                <span className="ath-compare-numbers-unit">{unit}</span>
              </div>

              <div className="ath-compare-delta-block">
                {delta && delta.dir !== "flat" && (
                  <span
                    className={`ath-compare-delta-badge ${deltaPositive ? "positive" : "negative"}`}
                  >
                    {delta.dir === "up" ? <ArrowUp /> : <ArrowDown />}
                    {delta.pct}
                  </span>
                )}
                {delta && delta.dir === "flat" && (
                  <span className="ath-compare-delta-badge neutral">=</span>
                )}
              </div>

              <div className="ath-compare-avg">
                <span className="ath-compare-numbers-label">
                  Media {tab === "7d" ? "7d" : "28d"}
                </span>
                <span className="ath-compare-numbers-value">
                  {activeAvg != null ? activeAvg.toFixed(1) : "--"}
                </span>
                <span className="ath-compare-numbers-unit">{unit}</span>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="ath-compare-chart">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart
                data={activeData}
                margin={{ top: 10, right: 10, bottom: 0, left: -20 }}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "var(--ath-text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--ath-text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--ath-bg-card)",
                    border: "1px solid var(--ath-border)",
                    borderRadius: "var(--ath-radius-sm)",
                    fontSize: 12,
                    boxShadow: "var(--ath-shadow-md)",
                  }}
                  formatter={(value: number) => [`${value} ${unit}`, title]}
                />
                {tab === "trend" && trendStats && (
                  <>
                    <ReferenceLine
                      y={trendStats.mean}
                      stroke="var(--ath-accent)"
                      strokeDasharray="4 4"
                      strokeWidth={1}
                    />
                    <ReferenceLine
                      y={trendStats.p25}
                      stroke="var(--ath-text-muted)"
                      strokeDasharray="2 4"
                      strokeWidth={0.5}
                    />
                    <ReferenceLine
                      y={trendStats.p75}
                      stroke="var(--ath-text-muted)"
                      strokeDasharray="2 4"
                      strokeWidth={0.5}
                    />
                  </>
                )}
                {activeAvg != null && tab !== "trend" && (
                  <ReferenceLine
                    y={activeAvg}
                    stroke="var(--ath-text-muted)"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{
                      value: `Media: ${activeAvg.toFixed(1)}`,
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: "var(--ath-text-muted)",
                    }}
                  />
                )}
                <defs>
                  <linearGradient id="metricGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--ath-accent)" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="var(--ath-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="none"
                  fill="url(#metricGrad)"
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--ath-accent)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--ath-accent)" }}
                  activeDot={{ r: 5, fill: "var(--ath-accent)", strokeWidth: 0 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Insight */}
          <div className="ath-compare-insight">
            <div className={`ath-compare-insight-card ${deltaPositive ? "positive" : "warning"}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <p>{insight}</p>
            </div>
          </div>

          {/* Trend tab extras */}
          {tab === "trend" && trendStats && (
            <div className="ath-compare-trend-stats">
              <div className="ath-compare-trend-stat">
                <span className="ath-compare-trend-stat-label">P25</span>
                <span className="ath-compare-trend-stat-value">
                  {trendStats.p25.toFixed(1)} {unit}
                </span>
              </div>
              <div className="ath-compare-trend-stat">
                <span className="ath-compare-trend-stat-label">Media</span>
                <span className="ath-compare-trend-stat-value">
                  {trendStats.mean.toFixed(1)} {unit}
                </span>
              </div>
              <div className="ath-compare-trend-stat">
                <span className="ath-compare-trend-stat-label">P75</span>
                <span className="ath-compare-trend-stat-value">
                  {trendStats.p75.toFixed(1)} {unit}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
