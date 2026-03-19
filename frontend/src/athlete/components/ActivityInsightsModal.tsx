import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line, CartesianGrid, Cell, PieChart, Pie,
} from "recharts";
import { useAthleteData } from "../context/AthleteDataContext";
import type { AthleteHealthActivity } from "../../types";

type Props = {
  open: boolean;
  onClose: () => void;
};

const SPORT_COLORS: Record<string, string> = {
  running: "#10B981",
  cycling: "#3B82F6",
  swimming: "#8B5CF6",
  walking: "#F59E0B",
  hiking: "#84CC16",
  strength_training: "#EF4444",
  other: "#94A3B8",
};

function sportColor(sport: string): string {
  return SPORT_COLORS[sport] ?? SPORT_COLORS.other;
}

function sportLabel(sport: string): string {
  const map: Record<string, string> = {
    running: "Carrera", cycling: "Ciclismo", swimming: "Natación",
    walking: "Caminata", hiking: "Senderismo", strength_training: "Fuerza",
    trail_running: "Trail", open_water_swimming: "Aguas abiertas",
    indoor_cycling: "Rodillo", treadmill_running: "Cinta",
  };
  return map[sport] ?? sport;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ActivityInsightsModal({ open, onClose }: Props) {
  const data = useAthleteData();
  const [range, setRange] = useState<"30d" | "60d" | "90d">("90d");
  const activities = data.health?.recent_activities ?? [];

  const rangeDays = range === "30d" ? 30 : range === "60d" ? 60 : 90;

  // ── Weekly volume aggregation ──────────────────────────
  const weeklyData = useMemo(() => {
    const now = new Date();
    const weeks: { label: string; km: number; hours: number; sessions: number; load: number }[] = [];
    const totalWeeks = Math.ceil(rangeDays / 7);

    for (let w = totalWeeks - 1; w >= 0; w--) {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);

      const weekActs = activities.filter((a) => {
        const d = new Date(a.started_at);
        return d >= weekStart && d <= weekEnd;
      });

      const km = weekActs.reduce((s, a) => s + a.distance_m, 0) / 1000;
      const hours = weekActs.reduce((s, a) => s + a.moving_time_seconds, 0) / 3600;
      const load = weekActs.reduce((s, a) => s + (a.training_load ?? 0), 0);

      const label = weekStart.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
      weeks.push({ label, km: Math.round(km * 10) / 10, hours: Math.round(hours * 10) / 10, sessions: weekActs.length, load: Math.round(load) });
    }
    return weeks;
  }, [activities, rangeDays]);

  // ── Totals for the period ──────────────────────────────
  const periodTotals = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);
    const filtered = activities.filter((a) => new Date(a.started_at) >= cutoff);
    const km = filtered.reduce((s, a) => s + a.distance_m, 0) / 1000;
    const hours = filtered.reduce((s, a) => s + a.moving_time_seconds, 0) / 3600;
    const sessions = filtered.length;
    const avgPerWeek = sessions / (rangeDays / 7);
    return { km: Math.round(km), hours: Math.round(hours * 10) / 10, sessions, avgPerWeek: Math.round(avgPerWeek * 10) / 10 };
  }, [activities, rangeDays]);

  // ── By sport breakdown ─────────────────────────────────
  const bySport = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);
    const filtered = activities.filter((a) => new Date(a.started_at) >= cutoff);
    const map = new Map<string, { sport: string; km: number; hours: number; count: number; color: string }>();
    for (const a of filtered) {
      const key = a.sport_type;
      const existing = map.get(key) ?? { sport: key, km: 0, hours: 0, count: 0, color: a.sport_color || sportColor(key) };
      existing.km += a.distance_m / 1000;
      existing.hours += a.moving_time_seconds / 3600;
      existing.count++;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.hours - a.hours);
  }, [activities, rangeDays]);

  // ── Week-over-week comparison ──────────────────────────
  const weekComparison = useMemo(() => {
    if (weeklyData.length < 2) return null;
    const current = weeklyData[weeklyData.length - 1];
    const previous = weeklyData[weeklyData.length - 2];
    if (previous.km === 0 && current.km === 0) return null;
    const kmDelta = previous.km > 0 ? ((current.km - previous.km) / previous.km) * 100 : 0;
    const hoursDelta = previous.hours > 0 ? ((current.hours - previous.hours) / previous.hours) * 100 : 0;
    return { kmDelta: Math.round(kmDelta), hoursDelta: Math.round(hoursDelta), current, previous };
  }, [weeklyData]);

  // ── Consistency score ──────────────────────────────────
  const consistency = useMemo(() => {
    const sessionCounts = weeklyData.map((w) => w.sessions);
    if (sessionCounts.length < 3) return null;
    const mean = sessionCounts.reduce((s, v) => s + v, 0) / sessionCounts.length;
    if (mean === 0) return { score: 0, label: "Sin datos" };
    const variance = sessionCounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / sessionCounts.length;
    const cv = Math.sqrt(variance) / mean;
    const score = Math.round(Math.max(0, Math.min(100, (1 - cv) * 100)));
    const label = score >= 80 ? "Muy consistente" : score >= 60 ? "Consistente" : score >= 40 ? "Irregular" : "Muy irregular";
    return { score, label };
  }, [weeklyData]);

  if (!open) return null;

  const totalHours = bySport.reduce((s, b) => s + b.hours, 0);

  return (
    <>
      <div className="mex-backdrop" onClick={onClose} />
      <div className="mex-sheet">
        {/* Header */}
        <div className="mex-header">
          <button type="button" className="mex-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <div className="mex-header-content">
            <div className="mex-icon" style={{ color: "#6366F1" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-4" /></svg>
            </div>
            <div>
              <h2 className="mex-title">Tu actividad</h2>
              <span className="mex-unit">Resumen y tendencias</span>
            </div>
          </div>
        </div>

        <div className="mex-body">
          {/* Range selector */}
          <div className="ai-range-row">
            {(["30d", "60d", "90d"] as const).map((r) => (
              <button key={r} type="button" className={`ai-range-btn ${range === r ? "active" : ""}`} onClick={() => setRange(r)}>
                {r === "30d" ? "30 días" : r === "60d" ? "60 días" : "90 días"}
              </button>
            ))}
          </div>

          {/* Summary cards */}
          <div className="ai-summary-row">
            <div className="ai-summary-card">
              <span className="ai-summary-num">{periodTotals.sessions}</span>
              <span className="ai-summary-label">Sesiones</span>
            </div>
            <div className="ai-summary-card">
              <span className="ai-summary-num">{periodTotals.km}</span>
              <span className="ai-summary-label">km totales</span>
            </div>
            <div className="ai-summary-card">
              <span className="ai-summary-num">{periodTotals.hours}</span>
              <span className="ai-summary-label">horas</span>
            </div>
            <div className="ai-summary-card">
              <span className="ai-summary-num">{periodTotals.avgPerWeek}</span>
              <span className="ai-summary-label">sesiones/sem</span>
            </div>
          </div>

          {/* Week comparison */}
          {weekComparison && (
            <div className="ai-comparison">
              <span className="ai-comparison-title">vs semana anterior</span>
              <div className="ai-comparison-chips">
                <span className={`ai-comparison-chip ${weekComparison.kmDelta >= 0 ? "up" : "down"}`}>
                  {weekComparison.kmDelta >= 0 ? "+" : ""}{weekComparison.kmDelta}% km
                </span>
                <span className={`ai-comparison-chip ${weekComparison.hoursDelta >= 0 ? "up" : "down"}`}>
                  {weekComparison.hoursDelta >= 0 ? "+" : ""}{weekComparison.hoursDelta}% tiempo
                </span>
              </div>
            </div>
          )}

          {/* Consistency */}
          {consistency && (
            <div className="ai-consistency">
              <div className="ai-consistency-bar-wrap">
                <div className="ai-consistency-bar" style={{ width: `${consistency.score}%`, background: consistency.score >= 60 ? "#10B981" : consistency.score >= 40 ? "#F59E0B" : "#EF4444" }} />
              </div>
              <span className="ai-consistency-label">Consistencia: <strong>{consistency.label}</strong> ({consistency.score}%)</span>
            </div>
          )}

          {/* Weekly volume chart */}
          <section className="mex-section">
            <h3 className="mex-section-title">Volumen semanal (km)</h3>
            <div className="mex-chart-wrap">
              {weeklyData.some((w) => w.km > 0) ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={weeklyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "var(--ath-text-muted)" }} interval="preserveStartEnd" />
                    <YAxis hide />
                    <Tooltip contentStyle={{ background: "var(--ath-bg-card)", border: "1px solid var(--ath-border)", borderRadius: 8, fontSize: 13 }} formatter={(v: number) => [`${v} km`, "Volumen"]} />
                    <Bar dataKey="km" radius={[4, 4, 0, 0]} fill="#6366F1" fillOpacity={0.7}>
                      {weeklyData.map((_, i) => (
                        <Cell key={i} fill="#6366F1" fillOpacity={i === weeklyData.length - 1 ? 1 : 0.5} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="mex-chart-empty">Sin datos de volumen en este período.</div>
              )}
            </div>
          </section>

          {/* Weekly hours chart */}
          <section className="mex-section">
            <h3 className="mex-section-title">Horas semanales</h3>
            <div className="mex-chart-wrap">
              {weeklyData.some((w) => w.hours > 0) ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={weeklyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--ath-border, #eee)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "var(--ath-text-muted)" }} interval="preserveStartEnd" />
                    <YAxis hide />
                    <Tooltip contentStyle={{ background: "var(--ath-bg-card)", border: "1px solid var(--ath-border)", borderRadius: 8, fontSize: 13 }} formatter={(v: number) => [`${v}h`, "Tiempo"]} />
                    <Line type="monotone" dataKey="hours" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3, fill: "#10B981", strokeWidth: 0 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="mex-chart-empty">Sin datos de tiempo en este período.</div>
              )}
            </div>
          </section>

          {/* Sessions per week */}
          <section className="mex-section">
            <h3 className="mex-section-title">Sesiones por semana</h3>
            <div className="mex-chart-wrap">
              {weeklyData.some((w) => w.sessions > 0) ? (
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={weeklyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "var(--ath-text-muted)" }} interval="preserveStartEnd" />
                    <YAxis hide />
                    <Tooltip contentStyle={{ background: "var(--ath-bg-card)", border: "1px solid var(--ath-border)", borderRadius: 8, fontSize: 13 }} formatter={(v: number) => [`${v}`, "Sesiones"]} />
                    <Bar dataKey="sessions" radius={[4, 4, 0, 0]} fill="#F59E0B" fillOpacity={0.6}>
                      {weeklyData.map((_, i) => (
                        <Cell key={i} fill="#F59E0B" fillOpacity={i === weeklyData.length - 1 ? 1 : 0.5} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="mex-chart-empty">Sin sesiones registradas.</div>
              )}
            </div>
          </section>

          {/* Sport breakdown */}
          {bySport.length > 0 && (
            <section className="mex-section">
              <h3 className="mex-section-title">Distribución por deporte</h3>
              <div className="ai-sport-grid">
                <div className="ai-sport-pie">
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie
                        data={bySport.map((s) => ({ name: sportLabel(s.sport), value: Math.round(s.hours * 10) / 10 }))}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={60}
                        paddingAngle={2}
                      >
                        {bySport.map((s, i) => (
                          <Cell key={i} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "var(--ath-bg-card)", border: "1px solid var(--ath-border)", borderRadius: 8, fontSize: 13 }} formatter={(v: number) => [`${v}h`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="ai-sport-list">
                  {bySport.map((s) => (
                    <div key={s.sport} className="ai-sport-row">
                      <div className="ai-sport-dot" style={{ background: s.color }} />
                      <div className="ai-sport-info">
                        <span className="ai-sport-name">{sportLabel(s.sport)}</span>
                        <span className="ai-sport-detail">
                          {s.count} sesiones · {Math.round(s.km)} km · {Math.round(s.hours * 10) / 10}h
                          {totalHours > 0 && <span className="ai-sport-pct"> ({Math.round((s.hours / totalHours) * 100)}%)</span>}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Fun fact */}
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
                <p>
                  La consistencia es más importante que el volumen. Un estudio de 2020 en Medicine & Science in Sports demostró que
                  atletas que mantenían ±10% de variación semanal en volumen tenían un 35% menos de lesiones y un 12% más de mejora
                  en VO2max que los que variaban {">"}30% entre semanas. Entrena regular, no heroico.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
