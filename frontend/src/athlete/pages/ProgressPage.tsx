import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from "recharts";
import { useAthleteData } from "../context/AthleteDataContext";
import { SimpleLactateCurve } from "../components/SimpleLactateCurve";
import { MicroContent } from "../components/MicroContent";
import { disciplineLabel, formatTrendValue, formatPace, formatEstimateValue, formatSecondsToClock } from "../utils/formatters";
import { buildWeeklyVolumeByDiscipline, allSessionsDeduped } from "../utils/training";
import type { Estimate } from "../../types";

/* ── Race prediction helpers ───────────────────────────── */
const RACE_DISTANCES: Record<string, number> = { "5K": 5, "10K": 10, HM: 21.0975, "Maratón": 42.195 };

function raceTime(paceSkm: number | null | undefined, distKm: number) {
  if (typeof paceSkm !== "number" || !Number.isFinite(paceSkm)) return null;
  return formatSecondsToClock(paceSkm * distKm);
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
  const activeBlock = data.analysis?.active_focus_block;
  const snapshots = data.disciplineSnapshots;
  const selectedSnapshot = data.selectedSnapshot;
  const selectedPredictions = selectedSnapshot?.view.estimates?.slice(0, 4) ?? [];

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

  // HR-based thresholds for simplified lactate curve
  const selectedView = selectedSnapshot?.view;
  const lt1Hr = selectedView?.thresholds?.find((t) => t.name === "LT1")?.heart_rate ?? null;
  const lt2Hr = selectedView?.thresholds?.find((t) => t.name === "LT2")?.heart_rate ?? null;

  // Extract real lactate curve data points from measurement_log
  const realCurveData = useMemo(() => {
    const log = selectedView?.measurement_log ?? [];
    const points = log
      .filter((entry) => entry.heart_rate_avg != null && entry.lactate_mmol != null && entry.lactate_mmol > 0)
      .map((entry) => ({ hr: Math.round(entry.heart_rate_avg!), lactate: entry.lactate_mmol }))
      .sort((a, b) => a.hr - b.hr);
    return points.length >= 3 ? points : undefined;
  }, [selectedView?.measurement_log]);

  // Derive maxHr from real data or thresholds instead of hardcoding
  const maxHr = useMemo(() => {
    if (realCurveData?.length) return Math.max(...realCurveData.map((p) => p.hr)) + 10;
    if (typeof lt2Hr === "number") return Math.round(lt2Hr + 25);
    return 190;
  }, [realCurveData, lt2Hr]);

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
      {/* Discipline selector */}
      <div className="ath-discipline-pills">
        {snapshots.map((snap) => (
          <button
            key={snap.discipline}
            type="button"
            className={`ath-pill ${data.selectedDiscipline === snap.discipline ? "active" : ""}`}
            onClick={() => data.setSelectedDiscipline(snap.discipline)}
          >
            {disciplineLabel(snap.discipline)}
          </button>
        ))}
      </div>

      {/* ── Engagement Stats Row ───────────────────────── */}
      <div className="ath-engagement-row">
        <div className="ath-engagement-stat">
          <span className="ath-engagement-value">{weekStreak}</span>
          <span className="ath-engagement-label">semanas seguidas</span>
          {weekStreak >= 4 && <span className="ath-engagement-badge">Racha</span>}
        </div>
        <div className="ath-engagement-stat">
          <span className="ath-engagement-value">{consistency}%</span>
          <span className="ath-engagement-label">consistencia</span>
        </div>
        <div className="ath-engagement-stat">
          <span className={`ath-engagement-value ${volChange.direction === "up" ? "up" : volChange.direction === "down" ? "down" : ""}`}>
            {volChange.direction === "up" ? "+" : volChange.direction === "down" ? "-" : ""}{volChange.pct}%
          </span>
          <span className="ath-engagement-label">vol. vs sem. anterior</span>
        </div>
        <div className="ath-engagement-stat">
          <span className="ath-engagement-value">{data.monthlyTotal}</span>
          <span className="ath-engagement-label">sesiones / mes</span>
        </div>
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
        <h3 className="ath-section-title">Tu curva de lactato — {disciplineLabel(trendDiscipline)}</h3>
        <SimpleLactateCurve
          lt1Hr={typeof lt1Hr === "number" ? lt1Hr : null}
          lt2Hr={typeof lt2Hr === "number" ? lt2Hr : null}
          maxHr={maxHr}
          dataPoints={realCurveData}
        />
        <MicroContent title="¿Qué significan LT1 y LT2?">
          <p><strong>LT1 (Umbral aeróbico)</strong> es la intensidad a la que el lactato empieza a subir por encima del reposo. Por debajo de este punto, puedes mantener el esfuerzo durante mucho tiempo.</p>
          <p><strong>LT2 (Umbral anaeróbico)</strong> es donde el lactato se acumula más rápido de lo que tu cuerpo puede eliminar. Es tu límite sostenible — por encima de él, la fatiga llega rápido.</p>
          <p>Mejorar estos umbrales significa que puedes ir más rápido con menos coste metabólico.</p>
        </MicroContent>
      </section>

      {/* ── Predictions ────────────────────────────────── */}
      {selectedPredictions.length > 0 && (
        <section className="ath-predictions">
          <h3 className="ath-section-title">Referencias estimadas</h3>
          <div className="ath-predictions-grid">
            {selectedPredictions.map((estimate: Estimate) => {
              const distKm = RACE_DISTANCES[estimate.estimate_type];
              const hasPaces = distKm && estimate.unit === "s/km" && estimate.ritmo_objetivo;
              return (
                <div key={estimate.estimate_type} className="ath-prediction-card">
                  <span className="ath-prediction-type">{estimate.estimate_type}</span>
                  <strong className="ath-prediction-value">
                    {hasPaces
                      ? raceTime(estimate.ritmo_objetivo, distKm) ?? formatEstimateValue(estimate)
                      : formatEstimateValue(estimate)}
                  </strong>
                  {hasPaces ? (
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
