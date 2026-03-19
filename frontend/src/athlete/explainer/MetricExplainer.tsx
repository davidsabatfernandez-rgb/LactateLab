import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  ReferenceArea, ReferenceLine, Tooltip, BarChart, Bar, Cell,
} from "recharts";
import { useAthleteData } from "../context/AthleteDataContext";
import { useExplainer } from "./MetricExplainerContext";
import { METRIC_REGISTRY } from "./metricRegistry";
import { generateInsight } from "./insightEngine";
import "./metricExplainer.css";

const ICONS: Record<string, JSX.Element> = {
  hrv: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 12 6 12 8 6 11 18 14 8 16 12 22 12" /></svg>,
  sleep: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>,
  resting_hr: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
  stress: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
  body_battery: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="18" height="12" rx="2" /><line x1="23" y1="10" x2="23" y2="14" /><line x1="7" y1="10" x2="7" y2="14" /><line x1="11" y1="10" x2="11" y2="14" /></svg>,
  readiness: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  vo2max: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
  lt1: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 13 14 20 7" /><polyline points="14 7 20 7 20 13" /></svg>,
  lt2: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 13 14 20 7" /><polyline points="14 7 20 7 20 13" /></svg>,
  training_status: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-4" /></svg>,
  training_load: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>,
  training_consistency: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
  training_streak: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
  volume_change: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>,
  sessions_month: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><circle cx="8" cy="14" r="1" /><circle cx="12" cy="14" r="1" /><circle cx="16" cy="14" r="1" /><circle cx="8" cy="18" r="1" /></svg>,
};

function formatValue(metricId: string, value: number | null, unit: string): string {
  if (value === null) return "n/d";
  switch (metricId) {
    case "hrv": return `${Math.round(value)} ms`;
    case "sleep": return `${value.toFixed(1)}h`;
    case "resting_hr": return `${Math.round(value)} bpm`;
    case "stress": return `${Math.round(value)}`;
    case "body_battery": return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
    case "readiness": return `${Math.round(value)}`;
    case "vo2max": return `${value.toFixed(1)}`;
    case "training_status": return `${Math.round(value)}`;
    case "training_load": return value.toFixed(2);
    case "training_consistency": return `${Math.round(value)}%`;
    case "training_streak": return `${Math.round(value)}`;
    case "volume_change": return `${value > 0 ? "+" : ""}${Math.round(value)}%`;
    case "sessions_month": return `${Math.round(value)}`;
    default: return `${value} ${unit}`;
  }
}

function TrendChart({ metricId, color, data, average, invertedAxis }: {
  metricId: string;
  color: string;
  data: Array<{ label: string; value: number | null }>;
  average: number | null;
  invertedAxis?: boolean;
}) {
  const filtered = data.filter((d) => d.value !== null);
  if (filtered.length < 2) {
    return <div className="mex-chart-empty">Sin datos suficientes para mostrar tendencia.</div>;
  }

  const values = filtered.map((d) => d.value!);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * 0.15 || 5;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {average !== null && (
          <ReferenceArea
            y1={average * (invertedAxis ? 1.05 : 0.92)}
            y2={average * (invertedAxis ? 0.95 : 1.08)}
            fill={color}
            fillOpacity={0.08}
          />
        )}
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "var(--ath-text-muted)" }}
          interval="preserveStartEnd"
        />
        <YAxis hide domain={[min - padding, max + padding]} reversed={invertedAxis} />
        <Tooltip
          contentStyle={{ background: "var(--ath-bg-card)", border: "1px solid var(--ath-border)", borderRadius: 8, fontSize: 13 }}
          formatter={(v: number) => [typeof v === "number" ? Math.round(v * 10) / 10 : "n/d", ""]}
          labelFormatter={(l) => l}
        />
        {average !== null && (
          <ReferenceLine y={average} stroke={color} strokeDasharray="6 3" strokeOpacity={0.4} />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
          connectNulls
          activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ReadinessChart({ data, color }: {
  data: Array<{ label: string; value: number | null; tone: string }>;
  color: string;
}) {
  const toneColor = (tone: string) => {
    if (tone === "high" || tone === "good") return "#22C55E";
    if (tone === "mid") return "#F59E0B";
    return "#EF4444";
  };

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--ath-text-muted)" }} interval="preserveStartEnd" />
        <YAxis hide domain={[0, 100]} />
        <Tooltip
          contentStyle={{ background: "var(--ath-bg-card)", border: "1px solid var(--ath-border)", borderRadius: 8, fontSize: 13 }}
          formatter={(v: number) => [Math.round(v), "Predisposición"]}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={toneColor(entry.tone)} fillOpacity={0.7} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function AccordionSection({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`mex-accordion-item ${open ? "open" : ""}`}>
      <button type="button" className="mex-accordion-header" onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mex-accordion-chevron">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="mex-accordion-body">{children}</div>}
    </div>
  );
}

export function MetricExplainer() {
  const { activeMetric, closeExplainer } = useExplainer();
  const data = useAthleteData();

  const chartData = useMemo(() => {
    if (!activeMetric) return [];
    const metric = METRIC_REGISTRY[activeMetric.metricId];
    if (!metric) return [];

    if (metric.chartSource === "wellness" && metric.wellnessKey) {
      return data.wellnessSeries.slice(-28).map((p) => ({
        label: p.shortLabel,
        value: (p as any)[metric.wellnessKey!] as number | null,
        tone: "",
      }));
    }

    if (metric.chartSource === "readiness") {
      // Compute readiness per day from wellness data
      return data.wellnessSeries.slice(-14).map((p) => {
        let score = 50;
        if (p.sleepHours !== null) score += Math.min(15, Math.round((p.sleepHours / 8) * 15)) - 7;
        if (p.hrv !== null && data.hrvAverage !== null && data.hrvAverage > 0) {
          const ratio = p.hrv / data.hrvAverage;
          score += Math.round(Math.min(1.2, Math.max(0.7, ratio)) * 25) - 20;
        }
        if (p.stress !== null) score -= Math.round(Math.max(0, p.stress - 30) * 0.3);
        if (p.bodyBatteryChange !== null && p.bodyBatteryChange > 0) score += Math.min(10, Math.round(p.bodyBatteryChange * 0.15));
        score = Math.max(0, Math.min(100, Math.round(score)));
        const tone = score >= 80 ? "high" : score >= 60 ? "good" : score >= 40 ? "mid" : "low";
        return { label: p.shortLabel, value: score, tone };
      });
    }

    return [];
  }, [activeMetric, data.wellnessSeries, data.hrvAverage]);

  const currentValue = useMemo(() => {
    if (!activeMetric) return null;
    switch (activeMetric.metricId) {
      case "hrv": return data.currentHrv;
      case "sleep": return data.currentSleepHours;
      case "resting_hr": return data.currentRestingHr;
      case "stress": return data.currentStress;
      case "body_battery": return data.bodyBatteryDelta;
      case "readiness": return data.readiness.score;
      case "vo2max": return data.vo2maxValue;
      case "training_status": return data.trainingStatus.score;
      case "training_load": return null; // ratio displayed separately
      case "training_consistency":
      case "training_streak":
      case "volume_change":
      case "sessions_month":
        return activeMetric.value ?? null;
      default: return null;
    }
  }, [activeMetric, data]);

  const average = useMemo(() => {
    if (!activeMetric) return null;
    switch (activeMetric.metricId) {
      case "hrv": return data.hrvAverage;
      case "sleep": return data.sleepHoursAverage;
      case "resting_hr": return data.restingHrAverage;
      case "stress": return data.stressAverage;
      case "body_battery": return data.bodyBatteryAverage;
      default: return null;
    }
  }, [activeMetric, data]);

  const insight = useMemo(() => {
    if (!activeMetric) return null;
    return generateInsight({
      metricId: activeMetric.metricId,
      currentValue,
      average7d: average,
      hrvConsecutiveLow: data.hrvConsecutiveLow,
      discipline: activeMetric.discipline,
    });
  }, [activeMetric, currentValue, average, data.hrvConsecutiveLow]);

  if (!activeMetric) return null;

  const metric = METRIC_REGISTRY[activeMetric.metricId];
  if (!metric) return null;

  const icon = ICONS[activeMetric.metricId];

  return (
    <>
      <div className="mex-backdrop" onClick={closeExplainer} />
      <div className="mex-sheet">
        {/* Header */}
        <div className="mex-header">
          <button type="button" className="mex-close" onClick={closeExplainer}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <div className="mex-header-content">
            <div className="mex-icon" style={{ color: metric.color }}>{icon}</div>
            <div>
              <h2 className="mex-title">{metric.title}</h2>
              {metric.unit && <span className="mex-unit">{metric.unit}</span>}
            </div>
          </div>
          <div className="mex-current-value" style={{ color: metric.color }}>
            {formatValue(activeMetric.metricId, currentValue, metric.unit)}
          </div>
          {average !== null && (
            <span className="mex-average">Media 7d: {formatValue(activeMetric.metricId, average, metric.unit)}</span>
          )}
        </div>

        {/* Scrollable content */}
        <div className="mex-body">
          {/* Chart */}
          <section className="mex-section">
            <h3 className="mex-section-title">Tendencia</h3>
            <div className="mex-chart-wrap">
              {metric.chartSource === "readiness" ? (
                <ReadinessChart data={chartData} color={metric.color} />
              ) : (
                <TrendChart
                  metricId={activeMetric.metricId}
                  color={metric.color}
                  data={chartData}
                  average={average}
                  invertedAxis={metric.invertedAxis}
                />
              )}
            </div>
          </section>

          {/* Personal Insight */}
          {insight && (
            <section className="mex-section">
              <h3 className="mex-section-title">Tu lectura</h3>
              <div className={`mex-insight mex-insight--${insight.tone}`}>
                <div className="mex-insight-badge">{insight.rangeLabel}</div>
                <p>{insight.text}</p>
              </div>
            </section>
          )}

          {/* Fun fact — right after insight */}
          <section className="mex-section mex-funfact-section">
            <div className="mex-funfact">
              <span className="mex-funfact-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="9" y1="18" x2="15" y2="18" />
                  <line x1="10" y1="22" x2="14" y2="22" />
                  <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
                </svg>
              </span>
              <div>
                <strong>Sabías que...</strong>
                <p>{metric.funFact}</p>
              </div>
            </div>
          </section>

          {/* Collapsible info sections */}
          <div className="mex-accordion">
            <AccordionSection title="Qué es" defaultOpen={false}>
              <p className="mex-text">{metric.whatIsThis}</p>
            </AccordionSection>
            <AccordionSection title="Por qué importa" defaultOpen={false}>
              <p className="mex-text">{metric.whyItMatters}</p>
            </AccordionSection>
            <AccordionSection title="Cómo mejorar" defaultOpen={false}>
              <p className="mex-text">{metric.howToImprove}</p>
            </AccordionSection>
          </div>
        </div>
      </div>
    </>
  );
}
