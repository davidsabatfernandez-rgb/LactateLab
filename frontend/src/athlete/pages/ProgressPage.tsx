import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from "recharts";
import { useAthleteData } from "../context/AthleteDataContext";
import { useExplainer } from "../explainer/MetricExplainerContext";
import { SimpleLactateCurve } from "../components/SimpleLactateCurve";
import type { ScatterPoint } from "../components/SimpleLactateCurve";
import { ThresholdAnchorBanner } from "../components/ThresholdAnchorBanner";
import { CurveAdvisories } from "../components/CurveAdvisories";
import { MicroContent } from "../components/MicroContent";
import { disciplineLabel, formatTrendValue, formatPace, formatEstimateValue, formatSecondsToClock } from "../utils/formatters";
import { buildWeeklyVolumeByDiscipline, allSessionsDeduped } from "../utils/training";
import type { Estimate, MeasurementLog } from "../../types";

/* ── Race prediction helpers ───────────────────────────── */
const RACE_DISTANCES: Record<string, number> = { "5K": 5, "10K": 10, HM: 21.0975, "Maratón": 42.195 };
const SWIM_DISTANCES: Record<string, number> = { "100m": 100, "200m": 200, "400m": 400, "1500m": 1500 };
const RACE_TYPES = new Set(["5K", "10K", "HM", "Maratón"]);
const SWIM_RACE_TYPES = new Set(["100m", "200m", "400m", "1500m"]);
const METABOLIC_TYPES = new Set(["VO2max", "VLAMAX", "FTP", "CSS"]);

function raceTime(paceSkm: number | null | undefined, distKm: number) {
  if (typeof paceSkm !== "number" || !Number.isFinite(paceSkm)) return null;
  return formatSecondsToClock(paceSkm * distKm);
}

function swimTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatSwimPace(sPer100m: number) {
  const mins = Math.floor(sPer100m / 60);
  const secs = Math.round(sPer100m % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/100m`;
}

/* ── Engagement helpers ─────────────────────────────────── */
function computeStreak(calendarWeeks: Array<{ sessions: any[] }[]>): number {
  let streak = 0;
  for (const week of calendarWeeks) {
    const hasSessions = week.some((d) => d.sessions.length > 0);
    if (hasSessions) streak++;
    else break;
  }
  return streak;
}

function consistencyScore(weeklyVolume: Array<Record<string, any>>, discipline: string): number {
  const vals = weeklyVolume.map((w) => (typeof w[discipline] === "number" ? w[discipline] : 0) as number).filter((v) => v > 0);
  if (vals.length < 2) return 100;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / vals.length;
  const cv = Math.sqrt(variance) / (avg || 1);
  return Math.max(0, Math.round((1 - cv) * 100));
}

function volumeChange(weeklyVolume: Array<Record<string, any>>, discipline: string): { pct: number; direction: "up" | "down" | "same" } {
  if (weeklyVolume.length < 2) return { pct: 0, direction: "same" };
  const current = (typeof weeklyVolume[weeklyVolume.length - 1]?.[discipline] === "number" ? weeklyVolume[weeklyVolume.length - 1][discipline] : 0) as number;
  const previous = (typeof weeklyVolume[weeklyVolume.length - 2]?.[discipline] === "number" ? weeklyVolume[weeklyVolume.length - 2][discipline] : 0) as number;
  if (previous === 0) return { pct: 0, direction: "same" };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct: Math.abs(pct), direction: pct > 0 ? "up" : pct < 0 ? "down" : "same" };
}

export function ProgressPage() {
  const data = useAthleteData();
  const { openExplainer } = useExplainer();
  const activeBlock = data.analysis?.active_focus_block;
  const snapshots = data.disciplineSnapshots;
  const selectedSnapshot = data.selectedSnapshot;
  const allEstimates = selectedSnapshot?.view.estimates ?? [];
  const raceEstimates = allEstimates.filter((e) =>
    RACE_TYPES.has(e.estimate_type) || SWIM_RACE_TYPES.has(e.estimate_type)
  );
  const metabolicEstimates = allEstimates.filter((e) => METABOLIC_TYPES.has(e.estimate_type));

  const allSessions = useMemo(() => allSessionsDeduped(data.analysis), [data.analysis]);
  const weeklyVolume12 = useMemo(() => buildWeeklyVolumeByDiscipline(allSessions, 12), [allSessions]);
  // Map selectedDiscipline to volume key
  const volumeDiscipline: "running" | "cycling" | "swimming" =
    data.selectedDiscipline === "ciclismo" ? "cycling"
    : data.selectedDiscipline === "natación" ? "swimming"
    : "running";
  const volumeUnit = volumeDiscipline === "swimming" ? "m" : "km";

  const trendData = selectedSnapshot?.trend ?? [];
  const trendDiscipline = selectedSnapshot?.discipline ?? "running";

  // Thresholds for lactate curve
  const selectedView = selectedSnapshot?.view;
  const lt1Th = selectedView?.thresholds?.find((t) => t.name === "LT1");
  const lt2Th = selectedView?.thresholds?.find((t) => t.name === "LT2");

  // Determine primary axis: pace for running/natación, power for ciclismo
  const isPaceDisc = trendDiscipline === "running" || trendDiscipline === "natación";
  const isPowerDisc = trendDiscipline === "ciclismo";

  // LT1/LT2 on the primary axis
  const lt1X = isPaceDisc ? (lt1Th?.pace_seconds_per_km ?? null)
    : isPowerDisc ? (lt1Th?.power_watts ?? null)
    : (lt1Th?.heart_rate ?? null);
  const lt2X = isPaceDisc ? (lt2Th?.pace_seconds_per_km ?? null)
    : isPowerDisc ? (lt2Th?.power_watts ?? null)
    : (lt2Th?.heart_rate ?? null);

  // Real LT1/LT2 on primary axis
  const indiv = selectedView?.individual_thresholds;
  const real = selectedView?.real_thresholds;
  const realLt1X = isPaceDisc
    ? (indiv?.lt1_individual?.pace_seconds_per_km ?? real?.lt1_real?.pace_seconds_per_km ?? null)
    : isPowerDisc
      ? (indiv?.lt1_individual?.power_watts ?? real?.lt1_real?.power_watts ?? null)
      : (indiv?.lt1_individual?.heart_rate ?? real?.lt1_real?.heart_rate ?? null);
  const realLt2X = isPaceDisc
    ? (indiv?.lt2_individual?.pace_seconds_per_km ?? real?.lt2_real?.pace_seconds_per_km ?? null)
    : isPowerDisc
      ? (indiv?.lt2_individual?.power_watts ?? real?.lt2_real?.power_watts ?? null)
      : (indiv?.lt2_individual?.heart_rate ?? real?.lt2_real?.heart_rate ?? null);

  // X-axis configuration
  const curveXLabel = isPaceDisc ? "Ritmo (min/km)" : isPowerDisc ? "Potencia (W)" : "FC (bpm)";
  const curveReversed = isPaceDisc; // pace: high value = slow = left
  const curveKey = isPaceDisc ? "pace" : isPowerDisc ? "power" : "hr";
  const xTickFmt = isPaceDisc ? (v: number) => formatPace(v) : undefined;

  // All measurement log entries
  const allMeasurements = useMemo(() => {
    const views = data.analysis?.discipline_views ?? {};
    const disc = data.selectedDiscipline;
    const view = views[disc];
    if (!view?.measurement_log) return [];
    return view.measurement_log;
  }, [data.analysis?.discipline_views, data.selectedDiscipline]);

  // Date range for scatter filter
  const [scatterMonths, setScatterMonths] = useState(6);
  const scatterDateCutoff = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - scatterMonths);
    return d.toISOString().slice(0, 10);
  }, [scatterMonths]);

  // Build scatter points on primary axis
  const scatterPoints: ScatterPoint[] = useMemo(() => {
    return allMeasurements
      .filter((m: MeasurementLog) => {
        if (m.lactate_mmol == null || m.lactate_mmol <= 0) return false;
        if (m.session_date < scatterDateCutoff) return false;
        if (isPaceDisc) return m.pace_seconds_per_km != null && m.pace_seconds_per_km > 0;
        if (isPowerDisc) return m.power_watts != null && m.power_watts > 0;
        return m.heart_rate_avg != null;
      })
      .map((m: MeasurementLog) => ({
        xVal: isPaceDisc ? m.pace_seconds_per_km! : isPowerDisc ? m.power_watts! : Math.round(m.heart_rate_avg!),
        hr: m.heart_rate_avg ?? null,
        lactate: m.lactate_mmol,
        session_date: m.session_date,
        session_id: m.session_id,
      }));
  }, [allMeasurements, scatterDateCutoff, isPaceDisc, isPowerDisc]);

  // Build interval_id → full metrics lookup from measurement_log
  const metricsByInterval = useMemo(() => {
    const map = new Map<number, { hr: number | null; pace: number | null; power: number | null }>();
    for (const m of (selectedView?.measurement_log ?? [])) {
      map.set(m.interval_id, {
        hr: m.heart_rate_avg ?? null,
        pace: m.pace_seconds_per_km ?? null,
        power: m.power_watts ?? null,
      });
    }
    return map;
  }, [selectedView?.measurement_log]);

  // Legacy compat
  const hrByInterval = useMemo(() => {
    const map = new Map<number, number>();
    for (const [id, m] of metricsByInterval) {
      if (m.hr != null) map.set(id, m.hr);
    }
    return map;
  }, [metricsByInterval]);

  // Extract real curve data on primary axis from curve_history
  // Split by session: latest test = main curve, other sessions = background curves
  const { realCurveData, backgroundCurves } = useMemo(() => {
    const curveData = selectedView?.curve_history?.[curveKey];
    const mlog = selectedView?.measurement_log ?? [];
    const peakVal = selectedView?.measured_vlamax?.peak_lactate;

    // Build session_date → session_type lookup from measurement_log
    const sessionTypeByDate = new Map<string, string>();
    for (const m of mlog) {
      if (m.session_date && m.session_type) sessionTypeByDate.set(m.session_date, m.session_type);
    }

    if (curveData && curveData.length >= 3) {
      // Group points by session_date
      const bySession = new Map<string, typeof curveData>();
      for (const p of curveData) {
        if (typeof p.x !== "number" || typeof p.lactate !== "number") continue;
        const key = p.session_date ?? "unknown";
        const arr = bySession.get(key) ?? [];
        arr.push(p);
        bySession.set(key, arr);
      }

      // Find the latest test incremental with ≥5 points (main curve)
      let mainSessionDate: string | null = null;
      const sortedDates = [...bySession.keys()].sort().reverse();
      for (const date of sortedDates) {
        const pts = bySession.get(date)!;
        const sType = sessionTypeByDate.get(date) ?? "";
        if (sType.includes("test") && pts.length >= 5) {
          mainSessionDate = date;
          break;
        }
      }
      // Fallback: latest session with ≥5 points
      if (!mainSessionDate) {
        for (const date of sortedDates) {
          if ((bySession.get(date)?.length ?? 0) >= 5) { mainSessionDate = date; break; }
        }
      }

      const toPoint = (p: any) => {
        const metrics = metricsByInterval.get(p.interval_id);
        return {
          xVal: isPaceDisc ? p.x : Math.round(p.x),
          hr: metrics?.hr ?? null,
          pace: metrics?.pace ?? null,
          power: metrics?.power ?? null,
          lactate: p.lactate as number,
          contextual_lactate: typeof p.contextual_lactate === "number" ? p.contextual_lactate : undefined,
          is_peak: peakVal != null && Math.abs(p.lactate - peakVal) < 0.05,
        };
      };

      const sortFn = (a: { xVal: number }, b: { xVal: number }) => isPaceDisc ? b.xVal - a.xVal : a.xVal - b.xVal;

      // If no single session qualifies, pick the one with the most points
      if (!mainSessionDate) {
        let bestDate: string | null = null;
        let bestCount = 0;
        for (const [date, pts] of bySession) {
          if (pts.length > bestCount) { bestCount = pts.length; bestDate = date; }
        }
        if (bestDate && bestCount >= 3) mainSessionDate = bestDate;
      }

      const main = mainSessionDate
        ? bySession.get(mainSessionDate)!.map(toPoint).sort(sortFn)
        : undefined;

      // Background: all OTHER sessions with ≥2 points, each as its own curve
      const bg: Array<Array<{ xVal: number; lactate: number }>> = [];
      for (const [date, pts] of bySession) {
        if (date === mainSessionDate || pts.length < 2) continue;
        bg.push(
          pts.map((p) => ({ xVal: isPaceDisc ? p.x : Math.round(p.x), lactate: p.lactate }))
            .sort(sortFn)
        );
      }

      return { realCurveData: main, backgroundCurves: bg };
    }

    // Fallback: measurement_log
    const points = mlog
      .filter((entry) => {
        if (entry.lactate_mmol == null || entry.lactate_mmol <= 0) return false;
        if (isPaceDisc) return entry.pace_seconds_per_km != null && entry.pace_seconds_per_km > 0;
        if (isPowerDisc) return entry.power_watts != null && entry.power_watts > 0;
        return entry.heart_rate_avg != null;
      })
      .map((entry) => ({
        xVal: isPaceDisc ? entry.pace_seconds_per_km! : isPowerDisc ? entry.power_watts! : Math.round(entry.heart_rate_avg!),
        hr: entry.heart_rate_avg ?? null,
        lactate: entry.lactate_mmol,
      }))
      .sort((a, b) => isPaceDisc ? b.xVal - a.xVal : a.xVal - b.xVal);
    return { realCurveData: points.length >= 3 ? points : undefined, backgroundCurves: [] };
  }, [selectedView?.curve_history, selectedView?.measurement_log, selectedView?.measured_vlamax, curveKey, isPaceDisc, isPowerDisc, metricsByInterval]);

  // maxX for fallback mock curve
  const maxX = useMemo(() => {
    if (realCurveData?.length) {
      const vals = realCurveData.map((p) => p.xVal);
      return isPaceDisc ? Math.min(...vals) - 10 : Math.max(...vals) + 10;
    }
    if (typeof lt2X === "number") return isPaceDisc ? lt2X - 30 : lt2X + 30;
    return isPaceDisc ? 240 : isPowerDisc ? 350 : 190;
  }, [realCurveData, lt2X, isPaceDisc, isPowerDisc]);

  // Build overlay chips (LT1/LT2 values + confidence)
  const curveOverlays = useMemo(() => {
    const chips: Array<{ label: string; value: string; tone: "green" | "red" | "amber" | "neutral" }> = [];
    const fmtTh = (th: typeof lt1Th) => {
      if (!th) return null;
      const parts: string[] = [];
      if (th.pace_seconds_per_km) parts.push(formatPace(th.pace_seconds_per_km));
      if (th.power_watts) parts.push(`${Math.round(th.power_watts)} W`);
      if (th.heart_rate) parts.push(`${Math.round(th.heart_rate)} bpm`);
      if (th.lactate != null) parts.push(`${th.lactate.toFixed(1)} mmol`);
      return parts.join(" · ");
    };
    const lt1Str = fmtTh(lt1Th);
    if (lt1Str) chips.push({ label: "LT1", value: lt1Str, tone: "green" });
    const lt2Str = fmtTh(lt2Th);
    if (lt2Str) chips.push({ label: "LT2", value: lt2Str, tone: "red" });
    if (lt1Th || lt2Th) {
      const conf = Math.round(((lt1Th?.confidence ?? 0) + (lt2Th?.confidence ?? 0)) / ((lt1Th ? 1 : 0) + (lt2Th ? 1 : 0)) * 100);
      chips.push({ label: "Confianza", value: `${conf}%`, tone: conf >= 70 ? "green" : conf >= 50 ? "amber" : "neutral" });
    }
    return chips;
  }, [lt1Th, lt2Th]);

  // Peak lactate
  const peakLactate = selectedView?.measured_vlamax?.peak_lactate ?? null;

  // Engagement metrics
  const consistency = useMemo(() => consistencyScore(weeklyVolume12, volumeDiscipline), [weeklyVolume12, volumeDiscipline]);
  const volChange = useMemo(() => volumeChange(weeklyVolume12, volumeDiscipline), [weeklyVolume12, volumeDiscipline]);
  const weekStreak = useMemo(() => {
    const weeks = [];
    for (let i = weeklyVolume12.length - 1; i >= 0; i--) {
      const w = weeklyVolume12[i];
      const total = (w.running ?? 0) + (w.cycling ?? 0) + (w.swimming ?? 0);
      if (total > 0) weeks.push(true);
      else break;
    }
    return weeks.length;
  }, [weeklyVolume12]);

  // Readiness evolution (mock from wellness)
  const readinessEvolution = useMemo(() => {
    return data.wellnessSeries.slice(-14).map((p) => {
      const hrv = p.hrv ?? 50;
      const stress = p.stress ?? 30;
      const sleep = p.sleepHours ?? 7;
      const score = Math.min(100, Math.round(hrv * 0.4 + (100 - stress) * 0.3 + sleep * 4));
      return { date: p.shortLabel, readiness: score };
    });
  }, [data.wellnessSeries]);

  // Recovery evolution
  const recoveryEvolution = useMemo(() => {
    return data.wellnessSeries.slice(-14).map((p) => ({
      date: p.shortLabel,
      hrv: p.hrv,
      sleep: p.sleepHours ? Math.round(p.sleepHours * 10) : null,
    }));
  }, [data.wellnessSeries]);

  const axisTickStyle = { fill: "var(--ath-text-muted)", fontSize: 10 };
  const gridStroke = "var(--ath-border-subtle)";
  const tooltipStyle = {
    background: "var(--ath-bg-card)",
    border: "1px solid var(--ath-border)",
    borderRadius: 10,
    fontSize: 12,
  };

  return (
    <div className="ath-page ath-progress">
      {/* Discipline selector — always show all main disciplines */}
      <div className="ath-discipline-pills">
        {(["running", "ciclismo", "natación"] as const).map((disc) => (
          <button
            key={disc}
            type="button"
            className={`ath-pill ${data.selectedDiscipline === disc ? "active" : ""}`}
            onClick={() => data.setSelectedDiscipline(disc)}
          >
            {disciplineLabel(disc)}
          </button>
        ))}
      </div>

      <ThresholdAnchorBanner anchorStatus={selectedView?.threshold_anchor_status} />

      {/* ── Engagement Stats Row ───────────────────────── */}
      <div className="ath-engagement-row">
        <button type="button" className="ath-engagement-stat" onClick={() => openExplainer("training_streak", undefined, weekStreak)}>
          <span className="ath-engagement-value">{weekStreak}</span>
          <span className="ath-engagement-label">semanas seguidas</span>
          {weekStreak >= 4 && <span className="ath-engagement-badge">Racha</span>}
        </button>
        <button type="button" className="ath-engagement-stat" onClick={() => openExplainer("training_consistency", undefined, consistency)}>
          <span className="ath-engagement-value">{consistency}%</span>
          <span className="ath-engagement-label">consistencia</span>
        </button>
        <button type="button" className="ath-engagement-stat" onClick={() => openExplainer("volume_change", undefined, volChange.direction === "down" ? -volChange.pct : volChange.pct)}>
          <span className={`ath-engagement-value ${volChange.direction === "up" ? "up" : volChange.direction === "down" ? "down" : ""}`}>
            {volChange.direction === "up" ? "+" : volChange.direction === "down" ? "-" : ""}{volChange.pct}%
          </span>
          <span className="ath-engagement-label">vol. vs sem. anterior</span>
        </button>
        <button type="button" className="ath-engagement-stat" onClick={() => openExplainer("sessions_month", undefined, data.monthlyTotal)}>
          <span className="ath-engagement-value">{data.monthlyTotal}</span>
          <span className="ath-engagement-label">sesiones / mes</span>
        </button>
      </div>

      {/* ── Active Block by Discipline ─────────────────── */}
      {activeBlock && (
        <section className="ath-block-summary">
          <div className="ath-block-header-row">
            <h3 className="ath-section-title" style={{ margin: 0 }}>Bloque activo</h3>
            {activeBlock.priority_discipline && (
              <span className="ath-block-discipline-badge">
                {activeBlock.priority_discipline === "running" ? "Carrera"
                  : activeBlock.priority_discipline === "ciclismo" ? "Ciclismo"
                  : activeBlock.priority_discipline === "natación" ? "Natación"
                  : disciplineLabel(activeBlock.priority_discipline)}
              </span>
            )}
          </div>
          <div className="ath-block-info">
            <span className="ath-block-objective">{activeBlock.block_objective ?? "Base abierta"}</span>
            {activeBlock.phase && <span className="ath-block-phase">{activeBlock.phase}</span>}
            {activeBlock.block_intent && <p className="ath-block-intent">{activeBlock.block_intent}</p>}
          </div>
        </section>
      )}

      {/* ── Readiness Evolution ─────────────────────────── */}
      {readinessEvolution.length > 2 && (
        <section className="ath-trend-section">
          <h3 className="ath-section-title">Evolución de predisposición — 14 días</h3>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={readinessEvolution} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" tick={axisTickStyle} tickLine={false} axisLine={false} />
              <YAxis hide domain={[0, 100]} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value}`, "Predisposición"]} />
              <Bar dataKey="readiness" radius={[4, 4, 0, 0]} maxBarSize={24}>
                {readinessEvolution.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.readiness >= 75 ? "var(--ath-green)" : entry.readiness >= 50 ? "var(--ath-amber)" : "var(--ath-red)"}
                    fillOpacity={0.7}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* ── Threshold evolution ─────────────────────────── */}
      {trendData.length > 1 && (
        <section className="ath-trend-section">
          <h3 className="ath-section-title">Evolución de umbrales — {disciplineLabel(trendDiscipline)}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="date" tick={axisTickStyle} tickLine={false} axisLine={false} />
              <YAxis
                tick={axisTickStyle}
                tickLine={false}
                axisLine={false}
                width={50}
                reversed={trendDiscipline !== "ciclismo"}
                tickFormatter={(v: number) => trendDiscipline === "ciclismo" ? `${Math.round(v)} W` : formatPace(v)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => [formatTrendValue(value, trendDiscipline), "Umbral"]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#10B981"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#10B981", strokeWidth: 0 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* ── Simplified Lactate Curve ────────────────────── */}
      <section className="ath-trend-section">
        <div className="ath-curve-header">
          <h3 className="ath-section-title" style={{ margin: 0 }}>Tu curva de lactato — {disciplineLabel(trendDiscipline)}</h3>
          {allMeasurements.length > 0 && (
            <div className="ath-scatter-range">
              {[3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`ath-scatter-range__btn ${scatterMonths === m ? "active" : ""}`}
                  onClick={() => setScatterMonths(m)}
                >
                  {m}m
                </button>
              ))}
            </div>
          )}
        </div>
        {realCurveData ? (
          <SimpleLactateCurve
            lt1X={typeof lt1X === "number" ? lt1X : null}
            lt2X={typeof lt2X === "number" ? lt2X : null}
            lt1Lactate={lt1Th?.lactate ?? null}
            lt2Lactate={lt2Th?.lactate ?? null}
            maxX={maxX}
            dataPoints={realCurveData}
            overlays={curveOverlays}
            peakLactate={peakLactate}
            scatterPoints={scatterPoints}
            backgroundCurves={backgroundCurves}
            realLt1X={typeof realLt1X === "number" ? realLt1X : null}
            realLt2X={typeof realLt2X === "number" ? realLt2X : null}
            xLabel={curveXLabel}
            reversed={curveReversed}
            xTickFormatter={xTickFmt}
          />
        ) : (
          <p style={{ color: "var(--ath-text-muted, #888)", fontSize: "0.9rem", padding: "24px 0" }}>
            Aún no tienes tests de lactato registrados. Cuando tu entrenador suba un test, tu curva aparecerá aquí.
          </p>
        )}
        <CurveAdvisories
          curveInsights={selectedView?.curve_insights ?? null}
          latestSnapshotDate={selectedView?.latest_snapshot_date ?? null}
          measurementCount={selectedView?.measurement_log?.length ?? 0}
          aiAdvisory={selectedView?.ai_advisory ?? null}
        />
        <MicroContent title="¿Qué significan LT1 y LT2?">
          <p><strong>LT1 (Umbral aeróbico)</strong> es la intensidad a la que el lactato empieza a subir por encima del reposo. Por debajo de este punto, puedes mantener el esfuerzo durante mucho tiempo.</p>
          <p><strong>LT2 (Umbral anaeróbico)</strong> es donde el lactato se acumula más rápido de lo que tu cuerpo puede eliminar. Es tu límite sostenible — por encima de él, la fatiga llega rápido.</p>
          <p>Mejorar estos umbrales significa que puedes ir más rápido con menos coste metabólico.</p>
        </MicroContent>
      </section>

      {/* ── Race Predictions ────────────────────────────── */}
      {raceEstimates.length > 0 && (
        <section className="ath-predictions">
          <h3 className="ath-section-title">
            {data.selectedDiscipline === "natación" ? "Tiempos estimados" : "Referencias de carrera"}
          </h3>
          <div className="ath-predictions-grid">
            {raceEstimates.map((estimate: Estimate) => {
              const distKm = RACE_DISTANCES[estimate.estimate_type];
              const isRunning = distKm && estimate.unit === "s/km" && estimate.ritmo_objetivo;
              const isSwim = SWIM_RACE_TYPES.has(estimate.estimate_type) && estimate.unit === "s_total";
              return (
                <div key={estimate.estimate_type} className="ath-prediction-card">
                  <span className="ath-prediction-type">{estimate.estimate_type}</span>
                  <strong className="ath-prediction-value">
                    {isRunning
                      ? raceTime(estimate.ritmo_objetivo, distKm) ?? formatEstimateValue(estimate)
                      : isSwim
                        ? swimTime(estimate.value)
                        : formatEstimateValue(estimate)}
                  </strong>
                  {isRunning ? (
                    <div className="ath-prediction-paces">
                      <span className="ath-prediction-pace-row">
                        <span className="ath-prediction-pace-label">Techo</span>
                        <span>{raceTime(estimate.ritmo_techo, distKm) ?? "-"}</span>
                      </span>
                      <span className="ath-prediction-pace-row objetivo">
                        <span className="ath-prediction-pace-label">Objetivo</span>
                        <span>{raceTime(estimate.ritmo_objetivo, distKm)}</span>
                      </span>
                      <span className="ath-prediction-pace-row">
                        <span className="ath-prediction-pace-label">Seguro</span>
                        <span>{raceTime(estimate.ritmo_seguro, distKm) ?? "-"}</span>
                      </span>
                    </div>
                  ) : isSwim && estimate.ritmo_objetivo ? (
                    <div className="ath-prediction-paces">
                      <span className="ath-prediction-pace-row">
                        <span className="ath-prediction-pace-label">Techo</span>
                        <span>{estimate.ritmo_techo ? formatSwimPace(estimate.ritmo_techo) : "-"}</span>
                      </span>
                      <span className="ath-prediction-pace-row objetivo">
                        <span className="ath-prediction-pace-label">Objetivo</span>
                        <span>{formatSwimPace(estimate.ritmo_objetivo)}</span>
                      </span>
                      <span className="ath-prediction-pace-row">
                        <span className="ath-prediction-pace-label">Seguro</span>
                        <span>{estimate.ritmo_seguro ? formatSwimPace(estimate.ritmo_seguro) : "-"}</span>
                      </span>
                    </div>
                  ) : null}
                  {estimate.reliability_label && (
                    <span className="ath-prediction-reliability">{estimate.reliability_label}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Metabolic Markers ──────────────────────────── */}
      {metabolicEstimates.length > 0 && (
        <section className="ath-predictions">
          <h3 className="ath-section-title">Marcadores metabólicos</h3>
          <div className="ath-predictions-grid">
            {metabolicEstimates.map((estimate: Estimate) => (
              <div key={estimate.estimate_type} className="ath-prediction-card">
                <span className="ath-prediction-type">{estimate.estimate_type}</span>
                <strong className="ath-prediction-value">
                  {estimate.estimate_type === "CSS" && estimate.unit === "s/100m"
                    ? formatSwimPace(estimate.value)
                    : formatEstimateValue(estimate)}
                </strong>
                {estimate.reliability_label && (
                  <span className="ath-prediction-reliability">{estimate.reliability_label}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 12-week volume ─────────────────────────────── */}
      <section className="ath-volume-section">
        <div className="ath-volume-header">
          <h3 className="ath-section-title">Volumen 12 semanas</h3>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={weeklyVolume12} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <XAxis dataKey="weekLabel" tick={axisTickStyle} axisLine={{ stroke: gridStroke }} tickLine={false} />
            <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} width={36} unit={volumeUnit} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [`${value.toFixed(1)} ${volumeUnit}`, volumeDiscipline === "running" ? "Carrera" : volumeDiscipline === "cycling" ? "Bici" : "Natación"]}
            />
            <Line
              type="monotone"
              dataKey={volumeDiscipline}
              stroke={volumeDiscipline === "running" ? "var(--ath-disc-running)" : volumeDiscipline === "cycling" ? "var(--ath-disc-cycling)" : "var(--ath-disc-swimming)"}
              strokeWidth={2}
              dot={{ r: 2.5, fill: volumeDiscipline === "running" ? "#22c55e" : volumeDiscipline === "cycling" ? "#f59e0b" : "#0ea5e9", strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* ── Recovery Evolution ──────────────────────────── */}
      {recoveryEvolution.length > 2 && (
        <section className="ath-trend-section">
          <h3 className="ath-section-title">Evolución de recuperación — 14 días</h3>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={recoveryEvolution} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" tick={axisTickStyle} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="hrv" stroke="#10B981" strokeWidth={2} dot={false} connectNulls name="HRV" />
              <Line type="monotone" dataKey="sleep" stroke="#8B5CF6" strokeWidth={2} dot={false} connectNulls name="Sueño (×10)" />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* ── Weekly session breakdown ───────────────────── */}
      <section className="ath-weekly-breakdown">
        <h3 className="ath-section-title">Actividad semanal</h3>
        <div className="ath-breakdown-grid">
          {snapshots.map((snap) => (
            <div key={snap.discipline} className="ath-breakdown-row">
              <span className="ath-breakdown-disc">{disciplineLabel(snap.discipline)}</span>
              <div className="ath-breakdown-bar-wrap">
                <div
                  className={`ath-breakdown-bar disc-${snap.discipline}`}
                  style={{ width: `${Math.min(100, (snap.weeklySessions / Math.max(1, ...snapshots.map((s) => s.weeklySessions))) * 100)}%` }}
                />
              </div>
              <span className="ath-breakdown-count">{snap.weeklySessions}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
