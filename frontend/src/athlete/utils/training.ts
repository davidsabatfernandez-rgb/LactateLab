import type { DisciplineView, SessionSummary, AthleteAnalysis } from "../../types";
import type { StatusHistoryPoint } from "../types";
import { formatDate, disciplineOrder } from "./formatters";

export function buildDisciplineTrend(view?: DisciplineView | null, discipline?: string) {
  if (!view) return [];
  const preferredMetric =
    discipline === "ciclismo"
      ? view.historical_evolution?.LT2_power_watts ?? view.historical_evolution?.LT1_power_watts ?? []
      : view.historical_evolution?.LT2_pace_seconds_per_km ?? view.historical_evolution?.LT1_pace_seconds_per_km ?? [];
  return preferredMetric.slice(-8).map((point) => ({
    date: formatDate(point.date),
    value: point.value ?? null,
    label: point.label,
  }));
}

export function countSessionsWithinDays(sessions: SessionSummary[], days: number) {
  const cutoff = Date.now() - days * 86400000;
  return sessions.filter((session) => new Date(session.performed_at).getTime() >= cutoff).length;
}

export function dedupeRecentSessions(analysis: AthleteAnalysis | null) {
  const seen = new Set<number>();
  const sessions = Object.values(analysis?.discipline_views ?? {})
    .flatMap((view) => view.recent_sessions ?? [])
    .filter((session) => {
      if (seen.has(session.id)) return false;
      seen.add(session.id);
      return true;
    })
    .sort((left, right) => new Date(right.performed_at).getTime() - new Date(left.performed_at).getTime());
  return sessions.slice(0, 6);
}

export function allSessionsDeduped(analysis: AthleteAnalysis | null) {
  const seen = new Set<number>();
  return Object.values(analysis?.discipline_views ?? {})
    .flatMap((view) => view.recent_sessions ?? [])
    .filter((session) => {
      if (seen.has(session.id)) return false;
      seen.add(session.id);
      return true;
    })
    .sort((left, right) => new Date(left.performed_at).getTime() - new Date(right.performed_at).getTime());
}

export function sessionDistanceKm(session?: SessionSummary) {
  if (!session?.intervals?.length) return 0;
  return session.intervals.reduce((sum, interval) => {
    if (typeof interval.pace_seconds_per_km !== "number" || !Number.isFinite(interval.pace_seconds_per_km) || interval.pace_seconds_per_km <= 0) return sum;
    return sum + (interval.duration_seconds / interval.pace_seconds_per_km);
  }, 0);
}

export function sessionDurationHours(session?: SessionSummary) {
  if (!session?.intervals?.length) return 0;
  return session.intervals.reduce((sum, interval) => sum + interval.duration_seconds, 0) / 3600;
}

export function volumeSummary(sessions: SessionSummary[]) {
  const runningKm = sessions.filter((s) => s.discipline === "running").reduce((sum, s) => sum + sessionDistanceKm(s), 0);
  const swimKm = sessions.filter((s) => s.discipline === "natación").reduce((sum, s) => sum + sessionDistanceKm(s), 0);
  const trainingHours = sessions.reduce((sum, s) => sum + sessionDurationHours(s), 0);
  const cyclingKm = sessions.filter((s) => s.discipline === "ciclismo").reduce((sum, s) => sum + sessionDistanceKm(s), 0);
  return { runningKm, swimKm, trainingHours, cyclingKm };
}

export type WeeklyVolume = { weekLabel: string; running: number; cycling: number; swimming: number };

export function buildWeeklyVolumeByDiscipline(sessions: SessionSummary[], weeks: number): WeeklyVolume[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayOfWeek = now.getDay();
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  const result: WeeklyVolume[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = new Date(currentMonday);
    weekStart.setDate(currentMonday.getDate() - w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const weekSessions = sessions.filter((s) => {
      const d = new Date(s.performed_at);
      return d >= weekStart && d < weekEnd;
    });
    const monthLabel = weekStart.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
    const dayLabel = weekStart.getDate();
    result.push({
      weekLabel: `${dayLabel} ${monthLabel}`,
      running: weekSessions.filter((s) => s.discipline === "running").reduce((sum, s) => sum + sessionDistanceKm(s), 0),
      cycling: weekSessions.filter((s) => s.discipline === "ciclismo").reduce((sum, s) => sum + sessionDistanceKm(s), 0),
      swimming: weekSessions.filter((s) => s.discipline === "natación").reduce((sum, s) => sum + sessionDistanceKm(s) * 1000, 0),
    });
  }
  return result;
}

export function buildStatusTrend(series: Array<{ stress: number | null; hrv: number | null; sleepScore: number | null }>): StatusHistoryPoint[] {
  return series.slice(-14).map((p, i) => {
    let score = 50;
    if (typeof p.sleepScore === "number") score += Math.round((p.sleepScore / 100) * 25) - 12;
    if (typeof p.hrv === "number") score += Math.min(15, Math.round(p.hrv * 0.15));
    if (typeof p.stress === "number") score -= Math.round(Math.max(0, p.stress - 30) * 0.25);
    return { label: `D${i + 1}`, score: Math.max(0, Math.min(100, score)) };
  });
}
