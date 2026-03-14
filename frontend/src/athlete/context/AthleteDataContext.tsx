import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../lib/api";
import { resolveTrainingThreshold } from "../../lib/trainingThresholds";
import type { AthleteAnalysis, AthleteHealthOverview, AuthUser, PlanningOverview, PlanningPlannedSession } from "../../types";
import type { DisciplineSnapshot, WellnessSeriesPoint, SleepStageSegment } from "../types";
import { disciplineOrder } from "../utils/formatters";
import { parseMetricNumber } from "../utils/formatters";
import { buildWellnessSeries, parseSleepStageSegments, describeHrvStatus, hrvStatusTone } from "../utils/wellness";
import { buildDisciplineTrend, countSessionsWithinDays, dedupeRecentSessions, volumeSummary } from "../utils/training";
import { computeReadinessScore, readinessLabel, readinessTone, computeTrainingStatus, computeHrvConsecutiveLow, computeBalancePosition, balanceLabel } from "../utils/readiness";
import { averageNumericSeries, bodyBatteryDirectionLabel, restingHrLabel } from "../utils/wellness";

function getPrimaryEstimate(view: any, type: string) {
  return view?.estimates?.find((e: any) => e.estimate_type === type);
}

type AthleteDataContextType = {
  analysis: AthleteAnalysis | null;
  health: AthleteHealthOverview | null;
  plannedSessions: PlanningPlannedSession[];
  loading: boolean;
  error: string | null;
  healthLoading: boolean;
  healthError: string | null;

  // Computed
  disciplineSnapshots: DisciplineSnapshot[];
  selectedDiscipline: string;
  setSelectedDiscipline: (d: string) => void;
  selectedSnapshot: DisciplineSnapshot | undefined;
  wellnessSeries: WellnessSeriesPoint[];
  sleepStageSegments: SleepStageSegment[];
  readiness: { score: number; label: string; tone: string };
  trainingStatus: { label: string; tone: string; score: number };
  weeklyTotal: number;
  monthlyTotal: number;
  todaySessions: PlanningPlannedSession[];
  calendarWeek: Array<{ date: Date; iso: string; label: string; dayNum: number; isToday: boolean; sessions: PlanningPlannedSession[] }>;
  calWeekOffset: number;
  setCalWeekOffset: (fn: number | ((prev: number) => number)) => void;
  weather: { temp: number; code: number } | null;

  // Wellness metrics
  currentHrv: number | null;
  hrvAverage: number | null;
  currentHrvStatus: string;
  currentHrvTone: string;
  hrvConsecutiveLow: number;
  currentRestingHr: number | null;
  restingHrAverage: number | null;
  currentStress: number | null;
  stressAverage: number | null;
  bodyBatteryDelta: number | null;
  bodyBatteryAverage: number | null;
  recoveryScore: number | null;
  currentSleepHours: number | null;
  sleepHoursAverage: number | null;
  balancePos: number;
  balanceLbl: string;
  vo2maxValue: number | null;
  vo2maxLabel: string;

  addAthleteSession: (session: Omit<PlanningPlannedSession, "id">) => void;
  moveSession: (sessionId: number, newDate: string) => void;
  removeSession: (sessionId: number) => void;
  refreshHealth: () => Promise<void>;
  user: AuthUser;
  token: string;
};

const AthleteDataContext = createContext<AthleteDataContextType | null>(null);

export function useAthleteData() {
  const ctx = useContext(AthleteDataContext);
  if (!ctx) throw new Error("useAthleteData must be inside AthleteDataProvider");
  return ctx;
}

export function AthleteDataProvider({ user, token, children }: { user: AuthUser; token: string; children: ReactNode }) {
  const [analysis, setAnalysis] = useState<AthleteAnalysis | null>(null);
  const [health, setHealth] = useState<AthleteHealthOverview | null>(null);
  const [plannedSessions, setPlannedSessions] = useState<PlanningPlannedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState("");
  const [calWeekOffset, setCalWeekOffset] = useState(0);
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);

  // Load weather
  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=41.6167&longitude=2.0861&current=temperature_2m,weather_code&timezone=auto")
      .then((r) => r.json())
      .then((data) => { if (data?.current) setWeather({ temp: Math.round(data.current.temperature_2m), code: data.current.weather_code }); })
      .catch(() => {});
  }, []);

  // Load analysis
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.athlete_id) { setError("Tu acceso atleta no está vinculado."); setLoading(false); return; }
      setLoading(true);
      setError(null);
      try {
        const result = (await api.athleteAnalysis(token, user.athlete_id)) as AthleteAnalysis;
        if (!cancelled) setAnalysis(result);
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : "Error cargando portal."); setAnalysis(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token, user?.athlete_id]);

  // Load health
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.athlete_id || loading) return;
      setHealthLoading(true);
      setHealthError(null);
      try {
        const result = (await api.athleteHealthOverview(token, user.athlete_id, 28, {
          includeActivity: false, includeRawWellness: false,
          refreshLiveHealth: Boolean(analysis?.athlete.garmin_connected),
        })) as AthleteHealthOverview;
        if (!cancelled) setHealth(result);
      } catch (e) {
        if (!cancelled) { setHealth(null); setHealthError(e instanceof Error ? e.message : "Error cargando salud."); }
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [analysis?.athlete.garmin_connected, loading, token, user?.athlete_id]);

  // Load planned sessions
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.athlete_id || loading) return;
      try {
        const result = (await api.planningOverview(token, user.athlete_id)) as PlanningOverview;
        if (!cancelled) setPlannedSessions(result.planned_sessions ?? []);
      } catch { /* silent */ }
    }
    load();
    return () => { cancelled = true; };
  }, [loading, token, user?.athlete_id]);

  async function refreshHealth() {
    if (!user?.athlete_id) return;
    setHealthLoading(true);
    setHealthError(null);
    try {
      const result = (await api.athleteHealthOverview(token, user.athlete_id, 28, {
        includeActivity: false, includeRawWellness: false, refreshLiveHealth: true,
      })) as AthleteHealthOverview;
      setHealth(result);
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : "Error refrescando salud.");
    } finally {
      setHealthLoading(false);
    }
  }

  // Add a session locally (athlete-created workout)
  function addAthleteSession(session: Omit<PlanningPlannedSession, "id">) {
    const localId = -(Date.now());
    const fullSession: PlanningPlannedSession = { id: localId, ...session };
    setPlannedSessions((prev) => [...prev, fullSession]);
  }

  // Move a session to a new date
  function moveSession(sessionId: number, newDate: string) {
    setPlannedSessions((prev) =>
      prev.map((s) => s.id === sessionId ? { ...s, scheduled_date: newDate } : s),
    );
  }

  // Remove a session
  function removeSession(sessionId: number) {
    setPlannedSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }

  // Discipline snapshots
  const disciplineSnapshots = useMemo<DisciplineSnapshot[]>(() =>
    Object.entries(analysis?.discipline_views ?? {})
      .sort(([a], [b]) => disciplineOrder(a) - disciplineOrder(b))
      .map(([discipline, view]) => ({
        discipline,
        view,
        lt1: resolveTrainingThreshold(view, "LT1"),
        lt2: resolveTrainingThreshold(view, "LT2"),
        estimate: getPrimaryEstimate(view, discipline === "ciclismo" ? "FTP" : discipline === "running" ? "10K" : "VO2max") ?? view.estimates?.[0],
        weeklySessions: countSessionsWithinDays(view.recent_sessions ?? [], 7),
        monthlySessions: countSessionsWithinDays(view.recent_sessions ?? [], 30),
        latestSession: [...(view.recent_sessions ?? [])].sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime())[0],
        trend: buildDisciplineTrend(view, discipline),
      })),
    [analysis?.discipline_views],
  );

  // Auto-select discipline
  useEffect(() => {
    if (!disciplineSnapshots.length) return;
    if (!disciplineSnapshots.some((s) => s.discipline === selectedDiscipline)) {
      const activeBlock = analysis?.active_focus_block;
      setSelectedDiscipline(activeBlock?.priority_discipline || analysis?.athlete.primary_discipline || disciplineSnapshots[0]?.discipline || "running");
    }
  }, [disciplineSnapshots, selectedDiscipline, analysis]);

  const selectedSnapshot = useMemo(
    () => disciplineSnapshots.find((s) => s.discipline === selectedDiscipline) ?? disciplineSnapshots[0],
    [disciplineSnapshots, selectedDiscipline],
  );

  const weeklyTotal = useMemo(() => disciplineSnapshots.reduce((sum, s) => sum + s.weeklySessions, 0), [disciplineSnapshots]);
  const monthlyTotal = useMemo(() => disciplineSnapshots.reduce((sum, s) => sum + s.monthlySessions, 0), [disciplineSnapshots]);

  // Wellness
  const healthDays = health?.health_days ?? [];
  const healthMetrics = health?.health_metrics ?? [];
  const performanceMetrics = health?.performance_metrics ?? [];
  const wellnessSeries = useMemo(() => buildWellnessSeries(healthDays), [healthDays]);
  const sleepStageSegments = useMemo(() => parseSleepStageSegments(health?.raw_wellness ?? {}), [health?.raw_wellness]);
  const currentWellness = wellnessSeries[wellnessSeries.length - 1] ?? null;

  const healthMetricMap = useMemo(() =>
    healthMetrics.reduce<Record<string, any>>((m, metric) => { m[metric.key] = metric; return m; }, {}),
    [healthMetrics],
  );

  const currentHrv = currentWellness?.hrv ?? parseMetricNumber(healthMetricMap.hrv?.value) ?? null;
  const hrvAverage = averageNumericSeries(wellnessSeries.map((p) => p.hrv));
  const currentHrvStatus = describeHrvStatus(healthMetricMap.hrv?.detail ?? currentWellness?.hrvStatus);
  const currentHrvTone = hrvStatusTone(healthMetricMap.hrv?.detail ?? currentWellness?.hrvStatus);
  const hrvConsecutiveLow = useMemo(() => computeHrvConsecutiveLow(wellnessSeries, hrvAverage), [wellnessSeries, hrvAverage]);

  const currentRestingHr = currentWellness?.restingHr ?? parseMetricNumber(healthMetricMap.resting_hr?.value) ?? null;
  const restingHrAverage = averageNumericSeries(wellnessSeries.map((p) => p.restingHr));
  const currentStress = currentWellness?.stress ?? parseMetricNumber(healthMetricMap.stress?.value) ?? null;
  const stressAverage = averageNumericSeries(wellnessSeries.map((p) => p.stress));
  const bodyBatteryDelta = currentWellness?.bodyBatteryChange ?? parseMetricNumber(healthMetricMap.body_battery?.value) ?? null;
  const bodyBatteryAverage = averageNumericSeries(wellnessSeries.map((p) => p.bodyBatteryChange));

  const sleepScoreValue = healthMetricMap.sleep_score?.value ?? "n/d";
  const recoveryScore = parseMetricNumber(sleepScoreValue);
  const currentSleepHours = currentWellness?.sleepHours ?? null;
  const sleepHoursAverage = averageNumericSeries(wellnessSeries.map((p) => p.sleepHours));

  const readinessScoreVal = useMemo(() => computeReadinessScore({
    recoveryScore, currentHrv, hrvAverage, currentStress, bodyBatteryDelta,
  }), [recoveryScore, currentHrv, hrvAverage, currentStress, bodyBatteryDelta]);

  const readiness = useMemo(() => ({
    score: readinessScoreVal,
    label: readinessLabel(readinessScoreVal),
    tone: readinessTone(readinessScoreVal),
  }), [readinessScoreVal]);

  const trainingStatus = useMemo(() => computeTrainingStatus({
    currentStress, hrvConsecutiveLow, weeklyTotal, currentHrv, hrvAverage,
  }), [currentStress, hrvConsecutiveLow, weeklyTotal, currentHrv, hrvAverage]);

  const balancePos = useMemo(() => computeBalancePosition({
    weeklyTotal, currentStress, hrvConsecutiveLow, currentRestingHr, restingHrAverage,
  }), [weeklyTotal, currentStress, hrvConsecutiveLow, currentRestingHr, restingHrAverage]);
  const balanceLbl = balanceLabel(balancePos);

  const vo2maxMetric = performanceMetrics.find((m) => m.key === "vo2max_running") ?? performanceMetrics.find((m) => m.key === "vo2max_cycling") ?? null;
  const vo2maxValue = vo2maxMetric ? parseFloat(vo2maxMetric.value) : null;
  const vo2maxLabel = vo2maxMetric?.key === "vo2max_cycling" ? "Ciclismo" : "Carrera";

  // Calendar week
  const calendarWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) + calWeekOffset * 7);
    const days: Array<{ date: Date; iso: string; label: string; dayNum: number; isToday: boolean; sessions: PlanningPlannedSession[] }> = [];
    const sessionsByDate = new Map<string, PlanningPlannedSession[]>();
    for (const s of plannedSessions) {
      const existing = sessionsByDate.get(s.scheduled_date) ?? [];
      existing.push(s);
      sessionsByDate.set(s.scheduled_date, existing);
    }
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      days.push({
        date: d,
        iso,
        label: d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "").toUpperCase(),
        dayNum: d.getDate(),
        isToday: d.getTime() === today.getTime(),
        sessions: sessionsByDate.get(iso) ?? [],
      });
    }
    return days;
  }, [calWeekOffset, plannedSessions]);

  const todaySessions = calendarWeek.find((d) => d.isToday)?.sessions ?? [];

  const value: AthleteDataContextType = {
    analysis, health, plannedSessions, loading, error, healthLoading, healthError,
    disciplineSnapshots, selectedDiscipline, setSelectedDiscipline, selectedSnapshot,
    wellnessSeries, sleepStageSegments,
    readiness, trainingStatus, weeklyTotal, monthlyTotal,
    todaySessions, calendarWeek, calWeekOffset, setCalWeekOffset, weather,
    currentHrv, hrvAverage, currentHrvStatus, currentHrvTone, hrvConsecutiveLow,
    currentRestingHr, restingHrAverage, currentStress, stressAverage,
    bodyBatteryDelta, bodyBatteryAverage, recoveryScore, currentSleepHours, sleepHoursAverage,
    balancePos, balanceLbl, vo2maxValue, vo2maxLabel,
    addAthleteSession, moveSession, removeSession, refreshHealth, user, token,
  };

  return <AthleteDataContext.Provider value={value}>{children}</AthleteDataContext.Provider>;
}
