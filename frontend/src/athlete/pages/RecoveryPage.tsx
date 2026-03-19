import { useState, useMemo } from "react";
import { ResponsiveContainer, LineChart, ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceArea, ScatterChart, Scatter, CartesianGrid, ZAxis, PieChart, Pie, Cell } from "recharts";
import { useAthleteData } from "../context/AthleteDataContext";
import { ReadinessRing } from "../components/ReadinessRing";
import { MetricDrawer } from "../../components/athlete/MetricDrawer";
import { TimeRangeSelector, type TimeRange } from "../../components/athlete/TimeRangeSelector";
import { InsightCard } from "../../components/athlete/InsightCard";
import JetLagAssistant from "../components/JetLagAssistant";
import MetricCompareModal from "../components/MetricCompareModal";
import { useExplainer } from "../explainer/MetricExplainerContext";
import { averageNumericSeries, stressLabel, restingHrLabel } from "../utils/wellness";
import { formatDate } from "../utils/formatters";
import { computeReadinessBreakdown, type ReadinessContributor } from "../utils/readiness";
import type { WellnessSeriesPoint } from "../types";

function renderWellnessTooltip(
  active: boolean | undefined,
  payload: Array<{ payload?: WellnessSeriesPoint }> | undefined,
  metricLabel: string,
  formatter: (value?: number | null) => string,
) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const val =
    metricLabel === "HRV nocturna" ? point.hrv
    : metricLabel === "Frecuencia en reposo" ? point.restingHr
    : metricLabel === "Estrés diario" ? point.stress
    : metricLabel === "Batería corporal" ? point.bodyBatteryChange
    : point.sleepHours;
  return (
    <div className="athlete-portal-wellness-tooltip">
      <strong>{formatDate(point.date)}</strong>
      <span>{metricLabel}: {formatter(val)}</span>
    </div>
  );
}

export function RecoveryPage() {
  const data = useAthleteData();
  const { openExplainer } = useExplainer();
  const [openDrawer, setOpenDrawer] = useState<"sleep" | "hrv" | "rhr" | "stress" | null>(null);
  const [trendRange, setTrendRange] = useState<TimeRange>("7d");
  const [showJetLag, setShowJetLag] = useState(false);
  const [compareMetric, setCompareMetric] = useState<string | null>(null);
  const [comparisonTab, setComparisonTab] = useState<"sleep-quality" | "hrv-sessions" | "load-response">("sleep-quality");
  const [showReadinessBreakdown, setShowReadinessBreakdown] = useState(false);

  const rangeSlice = trendRange === "7d" ? 7 : trendRange === "30d" ? 30 : 90;

  // Readiness breakdown (Halson 2014 multi-factor, Buchheit 2014 HRV, Saw 2016 subjective)
  const readinessBreakdown = useMemo<ReadinessContributor[]>(() => computeReadinessBreakdown({
    recoveryScore: data.recoveryScore,
    currentHrv: data.currentHrv,
    hrvAverage: data.hrvAverage,
    currentStress: data.currentStress,
    bodyBatteryDelta: data.bodyBatteryDelta,
    currentSleepHours: data.currentSleepHours,
    currentRestingHr: data.currentRestingHr,
    restingHrAverage: data.restingHrAverage,
  }), [data.recoveryScore, data.currentHrv, data.hrvAverage, data.currentStress, data.bodyBatteryDelta, data.currentSleepHours, data.currentRestingHr, data.restingHrAverage]);

  // Sleep stages from health data (Vitale 2019, Walsh 2021)
  const sleepStages = useMemo(() => {
    const breakdown = data.health?.sleep_breakdown ?? [];
    const deepMetric = breakdown.find((m) => m.key === "deep_sleep" || m.key === "deep");
    const remMetric = breakdown.find((m) => m.key === "rem_sleep" || m.key === "rem");
    const lightMetric = breakdown.find((m) => m.key === "light_sleep" || m.key === "light");
    const awakeMetric = breakdown.find((m) => m.key === "awake" || m.key === "awake_time");
    const parse = (m: typeof deepMetric): number | null => {
      if (!m) return null;
      const v = parseFloat(String(m.value));
      return isNaN(v) ? null : v;
    };
    const deep = parse(deepMetric);
    const rem = parse(remMetric);
    const light = parse(lightMetric);
    const awake = parse(awakeMetric);
    if (deep === null && rem === null) return null;
    return { deep: deep ?? 0, rem: rem ?? 0, light: light ?? 0, awake: awake ?? 0 };
  }, [data.health?.sleep_breakdown]);
  const trendData = useMemo(() => data.wellnessSeries.slice(-rangeSlice), [data.wellnessSeries, rangeSlice]);

  const hrvAvg30d = averageNumericSeries(data.wellnessSeries.slice(-30).map((p) => p.hrv));
  const restingHrAvg30d = averageNumericSeries(data.wellnessSeries.slice(-30).map((p) => p.restingHr));
  const sleepAvg30d = averageNumericSeries(data.wellnessSeries.slice(-30).map((p) => p.sleepHours));
  const stressAvg30d = averageNumericSeries(data.wellnessSeries.slice(-30).map((p) => p.stress));

  // Cross-metric comparisons
  const sleepVsQuality = useMemo(() => {
    return data.wellnessSeries.slice(-28).filter((p) => p.sleepHours !== null && p.hrv !== null).map((p) => ({
      sleep: p.sleepHours!,
      hrv: p.hrv!,
      date: p.shortLabel,
    }));
  }, [data.wellnessSeries]);

  const hrvVsStress = useMemo(() => {
    return data.wellnessSeries.slice(-28).filter((p) => p.hrv !== null && p.stress !== null).map((p) => ({
      hrv: p.hrv!,
      stress: p.stress!,
      date: p.shortLabel,
    }));
  }, [data.wellnessSeries]);

  const loadResponse = useMemo(() => {
    return data.wellnessSeries.slice(-28).filter((p) => p.intensityMinutes !== null && p.hrv !== null).map((p) => ({
      intensity: p.intensityMinutes!,
      hrvNext: p.hrv!,
      date: p.shortLabel,
    }));
  }, [data.wellnessSeries]);

  const hrvInsight = useMemo(() => {
    if (data.hrvConsecutiveLow >= 3) return { text: `${data.hrvConsecutiveLow} días seguidos por debajo de tu baseline. Valora moderar la carga.`, tone: "warning" as const };
    if (typeof data.currentHrv === "number" && data.hrvAverage !== null && data.currentHrv > data.hrvAverage * 1.05) return { text: "Recuperación autonómica mejorando. Buena señal para cargar.", tone: "positive" as const };
    return { text: "Dentro de tu rango habitual. Sin señales de alarma.", tone: "info" as const };
  }, [data.hrvConsecutiveLow, data.currentHrv, data.hrvAverage]);

  const sleepInsight = useMemo(() => {
    const recentBelow = data.wellnessSeries.slice(-3).filter((p) => p.sleepHours !== null && data.sleepHoursAverage !== null && p.sleepHours < data.sleepHoursAverage).length;
    if (recentBelow >= 3) return { text: "Últimas 3 noches por debajo de tu media. La duración limita la recuperación.", tone: "warning" as const };
    return { text: "Patrón de sueño estable. Sin señales negativas.", tone: "positive" as const };
  }, [data.wellnessSeries, data.sleepHoursAverage]);

  const rhrInsight = useMemo(() => {
    if (typeof data.currentRestingHr === "number" && data.restingHrAverage !== null && data.currentRestingHr > data.restingHrAverage + 5) return { text: "Frecuencia en reposo elevada. Puede indicar fatiga acumulada.", tone: "warning" as const };
    if (typeof data.currentRestingHr === "number" && data.restingHrAverage !== null && data.currentRestingHr < data.restingHrAverage - 3) return { text: "Reposo más bajo de lo habitual. Buena señal de recuperación.", tone: "positive" as const };
    return { text: "Frecuencia en reposo dentro de tu rango normal.", tone: "info" as const };
  }, [data.currentRestingHr, data.restingHrAverage]);

  const stressInsight = useMemo(() => {
    if (typeof data.currentStress === "number" && data.currentStress >= 60) return { text: "Estrés elevado. La carga fisiológica y/o mental está alta hoy.", tone: "warning" as const };
    if (data.bodyBatteryDelta !== null && data.bodyBatteryDelta < -10) return { text: "La batería corporal ha caído bastante.", tone: "warning" as const };
    return { text: "Estrés bajo control. La carga se está gestionando bien.", tone: "positive" as const };
  }, [data.currentStress, data.bodyBatteryDelta]);

  const axisTickStyle = { fill: "var(--ath-text-muted)", fontSize: 11 };
  const tooltipStyle = { background: "var(--ath-bg-card)", border: "1px solid var(--ath-border)", borderRadius: 10, fontSize: 12 };

  return (
    <div className="ath-page ath-recovery">
      {/* Rings row — click main ring to toggle breakdown */}
      <div className="ath-recovery-rings">
        <button type="button" className="ath-hero-ring-btn" onClick={() => openExplainer("readiness")}>
          <div style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setShowReadinessBreakdown((p) => !p); }}>
            <ReadinessRing score={data.readiness.score} label={data.readiness.label} tone={data.readiness.tone} title="Predisposición" size="large" />
          </div>
        </button>
        <button type="button" className="ath-hero-ring-btn" onClick={() => openExplainer("training_status")}>
          <ReadinessRing score={data.trainingStatus.score} label={data.trainingStatus.label} tone={data.trainingStatus.tone} title="Estado" size="small" />
        </button>
      </div>

      {/* ── Readiness Breakdown (Halson 2014, Buchheit 2014) ──── */}
      {showReadinessBreakdown && readinessBreakdown.length > 0 && (
        <div className="ath-readiness-breakdown">
          <h4 className="ath-section-title" style={{ fontSize: 13, marginBottom: 8 }}>Desglose de predisposición</h4>
          <p className="ath-breakdown-disclaimer">Pesos orientativos — no existe un composite validado en la literatura (Cortes 2025). Cada métrica se muestra individualmente para que evalúes qué limita tu recuperación.</p>
          {readinessBreakdown.map((c) => (
            <div key={c.key} className="ath-readiness-row">
              <div className="ath-readiness-row-header">
                <span className="ath-readiness-row-label">{c.label}</span>
                <span className="ath-readiness-row-score">{c.score}</span>
                <span className="ath-readiness-row-weight">{Math.round(c.weight * 100)}%</span>
              </div>
              <div className="ath-readiness-bar-bg">
                <div
                  className={`ath-readiness-bar-fill ${c.score >= 70 ? "good" : c.score >= 45 ? "mid" : "low"}`}
                  style={{ width: `${c.score}%` }}
                />
              </div>
              <span className="ath-readiness-row-desc">{c.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Balance bar */}
      <div className="ath-balance-section" onClick={() => openExplainer("training_load")} style={{ cursor: "pointer" }}>
        <span className="ath-balance-label">{data.balanceLbl}</span>
        <div className="ath-balance-bar">
          <div className="ath-balance-marker" style={{ left: `${data.balancePos}%` }} />
        </div>
        <div className="ath-balance-ends">
          <span>Infraestimulado</span>
          <span>Excesivo</span>
        </div>
      </div>

      {/* Metric cards — tap opens drawer, compare icon opens comparison modal */}
      <div className="ath-recovery-metrics">
        <button type="button" className="ath-metric-card" onClick={() => openExplainer("hrv")}>
          <small>HRV nocturna</small>
          <strong>{typeof data.currentHrv === "number" ? `${data.currentHrv.toFixed(0)} ms` : "n/d"}</strong>
          <span className={`ath-metric-status ${data.currentHrvTone}`}>{data.currentHrvStatus}</span>
          <span className="ath-metric-compare-icon" onClick={(e) => { e.stopPropagation(); setCompareMetric("hrv"); }} title="Comparar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
          </span>
        </button>
        <button type="button" className="ath-metric-card" onClick={() => openExplainer("sleep")}>
          <small>Sueño</small>
          <strong>{data.currentSleepHours !== null ? `${data.currentSleepHours.toFixed(1)}h` : "n/d"}</strong>
          <span className="ath-metric-status">{data.recoveryScore !== null ? `Score: ${data.recoveryScore}` : ""}</span>
          <span className="ath-metric-compare-icon" onClick={(e) => { e.stopPropagation(); setCompareMetric("sleep"); }} title="Comparar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
          </span>
        </button>
        <button type="button" className="ath-metric-card" onClick={() => openExplainer("resting_hr")}>
          <small>FC Reposo</small>
          <strong>{typeof data.currentRestingHr === "number" ? `${Math.round(data.currentRestingHr)} bpm` : "n/d"}</strong>
          <span className="ath-metric-status">{restingHrLabel(data.currentRestingHr, data.restingHrAverage)}</span>
          <span className="ath-metric-compare-icon" onClick={(e) => { e.stopPropagation(); setCompareMetric("rhr"); }} title="Comparar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
          </span>
        </button>
        <button type="button" className="ath-metric-card" onClick={() => openExplainer("stress")}>
          <small>Estrés</small>
          <strong>{typeof data.currentStress === "number" ? `${Math.round(data.currentStress)}` : "n/d"}</strong>
          <span className="ath-metric-status">{stressLabel(data.currentStress)}</span>
          <span className="ath-metric-compare-icon" onClick={(e) => { e.stopPropagation(); setCompareMetric("stress"); }} title="Comparar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
          </span>
        </button>
      </div>

      {/* ── Cross-Metric Comparisons ────────────────────── */}
      <section className="ath-cross-comparisons">
        <h3 className="ath-section-title">Relaciones entre métricas</h3>
        <div className="ath-comparison-tabs">
          <button
            type="button"
            className={`ath-pill small ${comparisonTab === "sleep-quality" ? "active" : ""}`}
            onClick={() => setComparisonTab("sleep-quality")}
          >
            Sueño vs Recuperación
          </button>
          <button
            type="button"
            className={`ath-pill small ${comparisonTab === "hrv-sessions" ? "active" : ""}`}
            onClick={() => setComparisonTab("hrv-sessions")}
          >
            HRV vs Estrés
          </button>
          <button
            type="button"
            className={`ath-pill small ${comparisonTab === "load-response" ? "active" : ""}`}
            onClick={() => setComparisonTab("load-response")}
          >
            Carga vs Respuesta
          </button>
        </div>

        <div className="ath-comparison-chart">
          {comparisonTab === "sleep-quality" && sleepVsQuality.length > 3 && (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ath-border-subtle)" />
                  <XAxis dataKey="sleep" name="Horas sueño" tick={axisTickStyle} unit="h" type="number" domain={["auto", "auto"]} />
                  <YAxis dataKey="hrv" name="HRV" tick={axisTickStyle} unit=" ms" type="number" domain={["auto", "auto"]} />
                  <ZAxis range={[40, 40]} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(val: number, name: string) => [name === "sleep" ? `${val.toFixed(1)}h` : `${Math.round(val)} ms`, name === "sleep" ? "Sueño" : "HRV"]} />
                  <Scatter data={sleepVsQuality} fill="#8B5CF6" fillOpacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
              <InsightCard
                text={sleepVsQuality.length > 5 ? "Más horas de sueño tienden a correlacionar con mejor HRV. Tu mejor recuperación se da con 7.5+ horas." : "Acumula más días para ver la relación entre sueño y recuperación."}
                tone={sleepVsQuality.length > 5 ? "positive" : "info"}
              />
            </>
          )}
          {comparisonTab === "sleep-quality" && sleepVsQuality.length <= 3 && (
            <div className="ap-empty">Se necesitan más datos de sueño + HRV para mostrar la relación.</div>
          )}

          {comparisonTab === "hrv-sessions" && hrvVsStress.length > 3 && (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ath-border-subtle)" />
                  <XAxis dataKey="stress" name="Estrés" tick={axisTickStyle} type="number" domain={[0, 100]} />
                  <YAxis dataKey="hrv" name="HRV" tick={axisTickStyle} unit=" ms" type="number" domain={["auto", "auto"]} />
                  <ZAxis range={[40, 40]} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Scatter data={hrvVsStress} fill="#10B981" fillOpacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
              <InsightCard
                text="HRV y estrés suelen moverse en direcciones opuestas. Los días con estrés alto muestran menor variabilidad cardíaca."
                tone="info"
              />
            </>
          )}
          {comparisonTab === "hrv-sessions" && hrvVsStress.length <= 3 && (
            <div className="ap-empty">Se necesitan más datos para mostrar la relación HRV-Estrés.</div>
          )}

          {comparisonTab === "load-response" && loadResponse.length > 3 && (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ath-border-subtle)" />
                  <XAxis dataKey="intensity" name="Minutos intensidad" tick={axisTickStyle} unit=" min" type="number" />
                  <YAxis dataKey="hrvNext" name="HRV posterior" tick={axisTickStyle} unit=" ms" type="number" domain={["auto", "auto"]} />
                  <ZAxis range={[40, 40]} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Scatter data={loadResponse} fill="#F59E0B" fillOpacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
              <InsightCard
                text="Observa cómo responde tu cuerpo a la carga. La HRV tras días de alta intensidad refleja tu capacidad de absorber el entrenamiento."
                tone="info"
              />
            </>
          )}
          {comparisonTab === "load-response" && loadResponse.length <= 3 && (
            <div className="ap-empty">Se necesitan datos de minutos de intensidad para mostrar la relación carga-respuesta.</div>
          )}
        </div>
      </section>

      {/* Jet Lag Assistant link */}
      <section className="ath-jetlag-link-section">
        <button type="button" className="ath-jetlag-link-btn" onClick={() => setShowJetLag(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <div>
            <strong>Jet Lag Assistant</strong>
            <span>Planifica tu adaptación al cambio horario</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </section>

      {/* HRV Drawer */}
      <MetricDrawer open={openDrawer === "hrv"} title="HRV nocturna" onClose={() => setOpenDrawer(null)}>
        <div className="ap-drawer-section"><TimeRangeSelector value={trendRange} onChange={setTrendRange} /></div>
        <div className="ap-drawer-chart">
          {trendData.some((p) => p.hrv !== null) ? (
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {data.hrvAverage !== null && <ReferenceArea y1={data.hrvAverage * 0.9} y2={data.hrvAverage * 1.1} fill="rgba(16, 185, 129, 0.06)" strokeOpacity={0} />}
                <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} tick={axisTickStyle} />
                <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as any, "HRV nocturna", (v) => typeof v === "number" ? `${Math.round(v)} ms` : "n/d")} />
                {data.hrvAverage !== null && <ReferenceLine y={data.hrvAverage} stroke="rgba(16, 185, 129, 0.35)" strokeDasharray="6 3" />}
                <Line type="monotone" dataKey="hrv" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3, fill: "#10B981", strokeWidth: 0 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <div className="ap-empty">Sin datos de HRV en este rango.</div>}
        </div>
        <div className="ap-drawer-kpis">
          <div className="ap-drawer-kpi"><small>Media 7d</small><strong>{data.hrvAverage !== null ? `${data.hrvAverage.toFixed(0)} ms` : "n/d"}</strong></div>
          <div className="ap-drawer-kpi"><small>Media 30d</small><strong>{hrvAvg30d !== null ? `${hrvAvg30d.toFixed(0)} ms` : "n/d"}</strong></div>
          <div className="ap-drawer-kpi"><small>Días bajos consec.</small><strong>{data.hrvConsecutiveLow}</strong></div>
        </div>
        <InsightCard text={hrvInsight.text} tone={hrvInsight.tone} />
      </MetricDrawer>

      {/* Sleep Drawer */}
      <MetricDrawer open={openDrawer === "sleep"} title="Sueño" onClose={() => setOpenDrawer(null)}>
        <div className="ap-drawer-section"><TimeRangeSelector value={trendRange} onChange={setTrendRange} /></div>
        <div className="ap-drawer-chart">
          {trendData.some((p) => p.sleepHours !== null) ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} tick={axisTickStyle} />
                <YAxis hide domain={[0, "auto"]} />
                <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as any, "Horas de sueño", (v) => typeof v === "number" ? `${v.toFixed(1)} h` : "n/d")} />
                {data.sleepHoursAverage !== null && <ReferenceLine y={data.sleepHoursAverage} stroke="rgba(139, 92, 246, 0.3)" strokeDasharray="6 3" />}
                <Line type="monotone" dataKey="sleepHours" stroke="#8B5CF6" strokeWidth={2.5} dot={{ r: 3, fill: "#8B5CF6", strokeWidth: 0 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="ap-empty">Sin datos de sueño.</div>}
        </div>

        {/* ── Sleep Stage Breakdown (Vitale 2019, Walsh 2021, Fullagar 2015) ── */}
        {sleepStages && (
          <div className="ath-sleep-stages">
            <h4 className="ath-section-title" style={{ fontSize: 12, margin: "12px 0 8px" }}>Fases del sueño</h4>
            <div className="ath-sleep-stages-row">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Profundo", value: sleepStages.deep },
                      { name: "REM", value: sleepStages.rem },
                      { name: "Ligero", value: sleepStages.light },
                      { name: "Despierto", value: sleepStages.awake },
                    ].filter((d) => d.value > 0)}
                    innerRadius={28}
                    outerRadius={42}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    <Cell fill="#6366F1" />
                    <Cell fill="#8B5CF6" />
                    <Cell fill="#C4B5FD" />
                    <Cell fill="#E5E7EB" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="ath-sleep-stages-legend">
                <div className="ath-sleep-stage-item"><span className="ath-sleep-dot" style={{ background: "#6366F1" }} />Profundo <strong>{sleepStages.deep}%</strong><span className="ath-sleep-ref">ref ~20%</span></div>
                <div className="ath-sleep-stage-item"><span className="ath-sleep-dot" style={{ background: "#8B5CF6" }} />REM <strong>{sleepStages.rem}%</strong><span className="ath-sleep-ref">ref ~22%</span></div>
                <div className="ath-sleep-stage-item"><span className="ath-sleep-dot" style={{ background: "#C4B5FD" }} />Ligero <strong>{sleepStages.light}%</strong></div>
                {sleepStages.awake > 0 && <div className="ath-sleep-stage-item"><span className="ath-sleep-dot" style={{ background: "#E5E7EB" }} />Despierto <strong>{sleepStages.awake}%</strong></div>}
              </div>
            </div>
            <p className="ath-sleep-stages-note">El sueño profundo (~20% en adultos sanos) concentra ~70-80% de la hormona de crecimiento diaria (Fullagar 2015). El REM (~22%) es clave para aprendizaje motor y regulación emocional (Walsh 2021).</p>
          </div>
        )}

        <div className="ap-drawer-kpis">
          <div className="ap-drawer-kpi"><small>Horas dormidas</small><strong>{data.currentSleepHours !== null ? `${data.currentSleepHours.toFixed(1)} h` : "n/d"}</strong></div>
          <div className="ap-drawer-kpi"><small>Media 30d</small><strong>{sleepAvg30d !== null ? `${sleepAvg30d.toFixed(1)} h` : "n/d"}</strong></div>
        </div>
        <InsightCard text={sleepInsight.text} tone={sleepInsight.tone} />
      </MetricDrawer>

      {/* RHR Drawer */}
      <MetricDrawer open={openDrawer === "rhr"} title="Frecuencia en reposo" onClose={() => setOpenDrawer(null)}>
        <div className="ap-drawer-section"><TimeRangeSelector value={trendRange} onChange={setTrendRange} /></div>
        <div className="ap-drawer-chart">
          {trendData.some((p) => p.restingHr !== null) ? (
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {data.restingHrAverage !== null && <ReferenceArea y1={data.restingHrAverage - 3} y2={data.restingHrAverage + 3} fill="rgba(59, 130, 246, 0.05)" strokeOpacity={0} />}
                <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} tick={axisTickStyle} />
                <YAxis hide domain={["dataMin - 3", "dataMax + 3"]} />
                <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as any, "Frecuencia en reposo", (v) => typeof v === "number" ? `${Math.round(v)} bpm` : "n/d")} />
                {data.restingHrAverage !== null && <ReferenceLine y={data.restingHrAverage} stroke="rgba(59, 130, 246, 0.35)" strokeDasharray="6 3" />}
                <Line type="monotone" dataKey="restingHr" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3, fill: "#3B82F6", strokeWidth: 0 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <div className="ap-empty">Sin datos de frecuencia en reposo.</div>}
        </div>
        <div className="ap-drawer-kpis">
          <div className="ap-drawer-kpi"><small>Hoy</small><strong>{typeof data.currentRestingHr === "number" ? `${Math.round(data.currentRestingHr)} bpm` : "n/d"}</strong></div>
          <div className="ap-drawer-kpi"><small>Media 30d</small><strong>{restingHrAvg30d !== null ? `${restingHrAvg30d.toFixed(0)} bpm` : "n/d"}</strong></div>
        </div>
        <InsightCard text={rhrInsight.text} tone={rhrInsight.tone} />
      </MetricDrawer>

      {/* Stress Drawer */}
      <MetricDrawer open={openDrawer === "stress"} title="Estrés y batería corporal" onClose={() => setOpenDrawer(null)}>
        <div className="ap-drawer-section"><TimeRangeSelector value={trendRange} onChange={setTrendRange} /></div>
        <div className="ap-drawer-chart">
          {trendData.some((p) => p.stress !== null) ? (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} tick={axisTickStyle} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip content={({ active, payload }) => renderWellnessTooltip(active, payload as any, "Estrés diario", (v) => typeof v === "number" ? `${Math.round(v)}` : "n/d")} />
                {data.stressAverage !== null && <ReferenceLine y={data.stressAverage} stroke="rgba(245, 158, 11, 0.3)" strokeDasharray="6 3" />}
                <Line type="monotone" dataKey="stress" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3, fill: "#F59E0B", strokeWidth: 0 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="ap-empty">Sin datos de estrés.</div>}
        </div>
        <div className="ap-drawer-kpis">
          <div className="ap-drawer-kpi"><small>Estrés hoy</small><strong>{typeof data.currentStress === "number" ? `${Math.round(data.currentStress)}` : "n/d"}</strong></div>
          <div className="ap-drawer-kpi"><small>Media 30d</small><strong>{stressAvg30d !== null ? stressAvg30d.toFixed(0) : "n/d"}</strong></div>
          <div className="ap-drawer-kpi"><small>BB delta</small><strong>{data.bodyBatteryDelta !== null ? `${data.bodyBatteryDelta >= 0 ? "+" : ""}${Math.round(data.bodyBatteryDelta)}` : "n/d"}</strong></div>
        </div>
        <InsightCard text={stressInsight.text} tone={stressInsight.tone} />
      </MetricDrawer>

      {/* Jet Lag Assistant modal */}
      <JetLagAssistant open={showJetLag} onClose={() => setShowJetLag(false)} />

      {/* Metric Compare Modal */}
      {compareMetric === "hrv" && (
        <MetricCompareModal
          open
          onClose={() => setCompareMetric(null)}
          title="HRV nocturna"
          metricKey="hrv"
          currentValue={data.currentHrv}
          unit="ms"
          wellnessSeries={data.wellnessSeries}
          average7d={data.hrvAverage}
          average30d={hrvAvg30d}
        />
      )}
      {compareMetric === "sleep" && (
        <MetricCompareModal
          open
          onClose={() => setCompareMetric(null)}
          title="Sueño"
          metricKey="sleepHours"
          currentValue={data.currentSleepHours}
          unit="h"
          wellnessSeries={data.wellnessSeries}
          average7d={data.sleepHoursAverage}
          average30d={sleepAvg30d}
        />
      )}
      {compareMetric === "rhr" && (
        <MetricCompareModal
          open
          onClose={() => setCompareMetric(null)}
          title="FC Reposo"
          metricKey="restingHr"
          currentValue={data.currentRestingHr}
          unit="bpm"
          wellnessSeries={data.wellnessSeries}
          average7d={data.restingHrAverage}
          average30d={restingHrAvg30d}
        />
      )}
      {compareMetric === "stress" && (
        <MetricCompareModal
          open
          onClose={() => setCompareMetric(null)}
          title="Estrés"
          metricKey="stress"
          currentValue={data.currentStress}
          unit=""
          wellnessSeries={data.wellnessSeries}
          average7d={data.stressAverage}
          average30d={stressAvg30d}
        />
      )}
    </div>
  );
}
