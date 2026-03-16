import { useState, useMemo, useCallback } from "react";
import { useAthleteData } from "../context/AthleteDataContext";
import { SessionDetailModal } from "../components/SessionDetailModal";
import { InlineWorkoutPreview } from "../components/InlineWorkoutPreview";
import { PostWorkoutAnalysis } from "../components/PostWorkoutAnalysis";
import { ReadinessRing } from "../components/ReadinessRing";
import { VitalChip } from "../components/VitalChip";
import { LactateStepInput, type LactateSubmission } from "../components/LactateStepInput";
import { MicroContent } from "../components/MicroContent";
import { stressLabel } from "../utils/wellness";
import { formatSleepDuration, disciplineLabel } from "../utils/formatters";
import { resolveTrainingThreshold } from "../../lib/trainingThresholds";
import { WELLNESS_CHECK_ITEMS, wellnessCheckAverage, wellnessCheckTone, type WellnessCheckEntry } from "../utils/readiness";
import { api } from "../../lib/api";
import type { AthleteHealthActivity, PlanningPlannedSession } from "../../types";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  PieChart, Pie, LineChart, Line,
} from "recharts";

function weatherLabel(code: number): { icon: string; desc: string } {
  if (code === 0) return { icon: "☀", desc: "Despejado" };
  if (code <= 3) return { icon: "⛅", desc: "Parcialmente nublado" };
  if (code <= 48) return { icon: "☁", desc: "Nublado" };
  if (code <= 67) return { icon: "🌧", desc: "Lluvia" };
  if (code <= 86) return { icon: "❄", desc: "Nieve" };
  if (code <= 99) return { icon: "⛈", desc: "Tormenta" };
  return { icon: "☁", desc: "" };
}

export function TodayPage() {
  const data = useAthleteData();
  const [detailSession, setDetailSession] = useState<PlanningPlannedSession | null>(null);
  const [analysisActivity, setAnalysisActivity] = useState<AthleteHealthActivity | null>(null);
  const [showLactateInput, setShowLactateInput] = useState(false);
  const [wellnessValues, setWellnessValues] = useState<WellnessCheckEntry>({});
  const [wellnessSaved, setWellnessSaved] = useState(false);

  const todayLabel = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  // ── Target countdown ────────────────────────────────────────────
  const primaryTarget = data.analysis?.athlete?.targets?.[0] ?? null;
  const activeBlock = data.analysis?.active_focus_block;

  const targetCountdown = useMemo(() => {
    if (!primaryTarget?.target_date) return null;
    const diff = Math.ceil((new Date(primaryTarget.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return null;
    return diff;
  }, [primaryTarget?.target_date]);

  // ── Phase timeline ──────────────────────────────────────────────
  const phaseTimeline = useMemo(() => {
    if (!activeBlock?.start_date) return null;
    const phases = ["base", "específico", "pre-competición", "taper"];
    const phaseLabels: Record<string, string> = {
      base_early: "base", base_late: "base", base: "base",
      specific: "específico", pre_comp: "pre-competición",
      taper: "taper", competition: "taper",
    };
    const currentPhase = phaseLabels[activeBlock.phase ?? "base"] ?? "base";
    const currentIdx = phases.indexOf(currentPhase);
    const blockStart = new Date(activeBlock.start_date).getTime();
    const blockEnd = activeBlock.end_date ? new Date(activeBlock.end_date).getTime() : (blockStart + 28 * 86400000);
    const totalDays = Math.max(1, (blockEnd - blockStart) / 86400000);
    const elapsedDays = Math.max(0, (Date.now() - blockStart) / 86400000);
    const blockProgress = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
    const weeksLeft = Math.max(0, Math.ceil((blockEnd - Date.now()) / (7 * 86400000)));
    return { phases, currentIdx, currentPhase, blockProgress, weeksLeft };
  }, [activeBlock]);

  // Sessions available for lactate logging (today's + recent with bla_check)
  const lactateEligibleSessions = useMemo(() => {
    const todayIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
    const recent = data.plannedSessions.filter((s) => {
      const diff = (new Date(todayIso).getTime() - new Date(s.scheduled_date).getTime()) / 86400000;
      // Today's sessions + sessions from last 3 days with bla_check
      return s.scheduled_date === todayIso || (diff >= 0 && diff <= 3 && s.bla_check);
    });
    return recent;
  }, [data.plannedSessions]);

  // ── Training Load (TRIMP-simplified from recent_activities) ─────
  const trainingLoadData = useMemo(() => {
    const activities = data.health?.recent_activities ?? [];
    const now = new Date();
    const days: { date: string; label: string; load: number }[] = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
      const dayActs = activities.filter((a) => a.started_at.slice(0, 10) === iso);
      let load = 0;
      for (const a of dayActs) {
        // Simplified TRIMP: duration_min × HR_factor
        const durMin = a.moving_time_seconds / 60;
        const hr = a.average_heartrate ?? 130;
        const hrFactor = Math.max(0.5, (hr - 60) / 100); // normalized intensity
        load += durMin * hrFactor;
      }
      days.push({ date: iso, label: dayLabel, load: Math.round(load) });
    }
    // Acute (7d) vs chronic (28d) ratio
    const last7 = days.slice(-7).reduce((s, d) => s + d.load, 0);
    const all28 = days.reduce((s, d) => s + d.load, 0);
    const acute = Math.round(last7 / 7);
    const chronic = Math.round(all28 / 28);
    const ratio = chronic > 0 ? (acute / chronic) : 0;
    const loadStatus = ratio < 0.8 ? "Carga baja" : ratio < 1.0 ? "Descargando" : ratio < 1.3 ? "Estable" : ratio < 1.5 ? "Carga alta" : "Pico de carga";
    const loadTone = ratio < 0.8 ? "warning" : ratio < 1.0 ? "neutral" : ratio < 1.3 ? "good" : ratio < 1.5 ? "warning" : "danger";
    return { days, acute, chronic, ratio: Math.round(ratio * 100) / 100, loadStatus, loadTone, totalWeek: last7 };
  }, [data.health?.recent_activities]);

  // ── Last 7 days by sport ─────────────────────────────────────
  const last7DaysSummary = useMemo(() => {
    const activities = data.health?.recent_activities ?? [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const recent = activities.filter((a) => new Date(a.started_at) >= cutoff);
    const bySport = new Map<string, { count: number; distance: number; duration: number; color: string; label: string }>();
    for (const a of recent) {
      const key = a.sport_type;
      const existing = bySport.get(key) ?? { count: 0, distance: 0, duration: 0, color: a.sport_color, label: a.sport_label };
      existing.count++;
      existing.distance += a.distance_m;
      existing.duration += a.moving_time_seconds;
      bySport.set(key, existing);
    }
    return Array.from(bySport.entries())
      .map(([sport, d]) => ({ sport, ...d }))
      .sort((a, b) => b.duration - a.duration);
  }, [data.health?.recent_activities]);

  // ── Weight input ──────────────────────────────────────────────
  const [showWeightInput, setShowWeightInput] = useState(false);
  const [weightDraft, setWeightDraft] = useState("");
  const [weightSaving, setWeightSaving] = useState(false);

  const athleteWeight = data.analysis?.athlete?.weight ?? null;
  const athleteHeight = data.analysis?.athlete?.height ?? null;
  const athleteSex = data.analysis?.athlete?.sex ?? "male";
  const athleteDob = data.analysis?.athlete?.date_of_birth ?? null;
  const weightHistory = data.analysis?.athlete?.weights ?? [];

  const athleteAge = useMemo(() => {
    if (!athleteDob) return 30;
    const diff = Date.now() - new Date(athleteDob).getTime();
    return Math.floor(diff / (365.25 * 86400000));
  }, [athleteDob]);

  // Mifflin-St Jeor BMR (most accurate validated equation)
  const bmr = useMemo(() => {
    const w = athleteWeight ?? 70;
    const h = (athleteHeight ?? 175); // cm
    if (athleteSex === "female") {
      return Math.round(10 * w + 6.25 * h - 5 * athleteAge - 161);
    }
    return Math.round(10 * w + 6.25 * h - 5 * athleteAge + 5);
  }, [athleteWeight, athleteHeight, athleteSex, athleteAge]);

  // NEAT (non-exercise activity thermogenesis) ≈ 15-20% of BMR for active people
  const neat = Math.round(bmr * 0.18);

  // TEF (thermic effect of food) ≈ 10% of total intake ≈ 10% of (BMR+NEAT)
  const tef = Math.round((bmr + neat) * 0.10);

  const restingDaily = bmr + neat + tef;

  const handleSaveWeight = useCallback(async () => {
    const val = parseFloat(weightDraft);
    if (isNaN(val) || val < 20 || val > 300) return;
    setWeightSaving(true);
    try {
      await api.addAthleteWeight(data.token, data.user.athlete_id!, {
        recorded_at: new Date().toISOString().slice(0, 10),
        weight: val,
        source: "manual",
      });
      setShowWeightInput(false);
      setWeightDraft("");
      // Trigger refresh
      window.location.reload();
    } catch {
      // silent
    } finally {
      setWeightSaving(false);
    }
  }, [weightDraft, data.token, data.user.athlete_id]);

  // Weight chart data (last 30 entries)
  const weightChartData = useMemo(() => {
    return [...weightHistory]
      .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
      .slice(-30)
      .map((w) => ({
        date: new Date(w.recorded_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
        weight: w.weight,
      }));
  }, [weightHistory]);

  // ── Calories estimate (daily + weekly) ─────────────────────────
  const [calMode, setCalMode] = useState<"daily" | "weekly">("daily");
  const caloriesData = useMemo(() => {
    const activities = data.health?.recent_activities ?? [];
    const wellness = data.wellnessSeries;
    const todayIso = new Date().toISOString().slice(0, 10);

    // Exercise calories: Keytel et al. (2005)
    function exerciseCal(durationMin: number, avgHr: number, weight: number, isMale: boolean): number {
      if (isMale) {
        return Math.round(durationMin * (0.6309 * avgHr + 0.1988 * weight + 0.2017 * athleteAge - 55.0969) / 4.184);
      }
      return Math.round(durationMin * (0.4472 * avgHr - 0.1263 * weight + 0.074 * athleteAge - 20.4022) / 4.184);
    }

    // Steps calories: ~0.04 kcal/step/kg (Weyand et al.) — net of BMR already counted
    // Approx 0.035 kcal per step for a 70kg person, scales with weight
    function stepsCal(steps: number, weight: number): number {
      return Math.round(steps * 0.0005 * weight); // ~0.035 kcal/step @ 70kg
    }

    const w = athleteWeight ?? 70;
    const isMale = athleteSex !== "female";

    // Daily
    const todayActs = activities.filter((a) => a.started_at.slice(0, 10) === todayIso);
    let dailyExercise = 0;
    for (const a of todayActs) {
      dailyExercise += exerciseCal(a.moving_time_seconds / 60, a.average_heartrate ?? 130, w, isMale);
    }
    dailyExercise = Math.max(0, dailyExercise);
    const todayWellness = wellness.find((p) => p.date === todayIso);
    const dailySteps = todayWellness?.steps ?? 0;
    const dailyStepsCal = stepsCal(dailySteps, w);

    // Weekly
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const weekActs = activities.filter((a) => new Date(a.started_at) >= cutoff);
    let weeklyExercise = 0;
    for (const a of weekActs) {
      weeklyExercise += exerciseCal(a.moving_time_seconds / 60, a.average_heartrate ?? 130, w, isMale);
    }
    weeklyExercise = Math.max(0, weeklyExercise);
    const weekWellness = wellness.filter((p) => p.date >= cutoffIso);
    const weeklySteps = weekWellness.reduce((s, p) => s + (p.steps ?? 0), 0);
    const weeklyStepsCal = stepsCal(weeklySteps, w);

    return {
      daily: {
        exercise: dailyExercise,
        stepsCal: dailyStepsCal,
        steps: dailySteps,
        active: dailyExercise + dailyStepsCal,
        resting: restingDaily,
        total: dailyExercise + dailyStepsCal + restingDaily,
      },
      weekly: {
        exercise: weeklyExercise,
        stepsCal: weeklyStepsCal,
        steps: weeklySteps,
        active: weeklyExercise + weeklyStepsCal,
        resting: restingDaily * 7,
        total: weeklyExercise + weeklyStepsCal + restingDaily * 7,
      },
      bmr, neat, tef,
    };
  }, [data.health?.recent_activities, data.wellnessSeries, athleteWeight, athleteSex, athleteAge, restingDaily, bmr, neat, tef]);

  const todayFirstSession = data.todaySessions[0];
  const sessionSteps = todayFirstSession?.payload?.steps
    ? (todayFirstSession.payload.steps as Array<{ label?: string; duration_min?: number }>).map((s) => ({
        label: s.label ?? "Paso",
        durationMin: s.duration_min,
      }))
    : todayFirstSession
      ? [{ label: "Calentamiento" }, { label: "Bloque 1" }, { label: "Bloque 2" }, { label: "Enfriamiento" }]
      : [];

  // Next session hint (for rest days)
  const nextSession = useMemo(() => {
    const todayIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
    return data.plannedSessions
      .filter((s) => s.scheduled_date > todayIso)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0] ?? null;
  }, [data.plannedSessions]);

  // Block context phrase for sessions
  const blockContext = useMemo(() => {
    if (!activeBlock) return null;
    const parts: string[] = [];
    if (phaseTimeline) {
      const phaseLabels: Record<string, string> = { base: "Fase base", "específico": "Fase específica", "pre-competición": "Pre-competición", taper: "Taper" };
      parts.push(phaseLabels[phaseTimeline.currentPhase] ?? phaseTimeline.currentPhase);
    }
    if (activeBlock.block_objective) parts.push(activeBlock.block_objective);
    if (activeBlock.block_intent) parts.push(activeBlock.block_intent);
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [activeBlock, phaseTimeline]);

  // Garmin push handler
  const [garminPushing, setGarminPushing] = useState<number | null>(null);
  const [garminPushResult, setGarminPushResult] = useState<Record<number, "ok" | "error">>({});
  const garminConnected = data.analysis?.athlete?.garmin_connected ?? false;

  const handleGarminPush = useCallback(async (session: PlanningPlannedSession) => {
    if (!data.user?.athlete_id || garminPushing) return;
    setGarminPushing(session.id);
    try {
      await api.pushWorkoutToGarmin(data.token, data.user.athlete_id, session.id);
      setGarminPushResult((prev) => ({ ...prev, [session.id]: "ok" }));
    } catch {
      setGarminPushResult((prev) => ({ ...prev, [session.id]: "error" }));
    } finally {
      setGarminPushing(null);
    }
  }, [data.token, data.user?.athlete_id, garminPushing]);

  return (
    <div className="ath-page ath-today">
      {/* Date + weather header */}
      <div className="ath-today-header">
        <h1 className="ath-today-date">{todayLabel}</h1>
        {data.weather && (() => {
          const w = weatherLabel(data.weather.code);
          return <span className="ath-today-weather">{w.icon} {data.weather.temp}°C</span>;
        })()}
      </div>

      {/* ════ TODAY'S SESSION — FIRST THING THE ATHLETE SEES ════ */}
      <section className="ath-today-sessions">
        {data.todaySessions.length > 0 ? (
          <>
            <h2 className="ath-section-title">Hoy te toca</h2>
            {blockContext && <p className="ath-block-context">{blockContext}</p>}
            <div className="ath-session-list">
              {data.todaySessions.map((session) => {
                const view = data.analysis?.discipline_views?.[session.discipline];
                const sLt1 = resolveTrainingThreshold(view, "LT1");
                const sLt2 = resolveTrainingThreshold(view, "LT2");
                const pushStatus = garminPushResult[session.id];
                const isPushing = garminPushing === session.id;
                const alreadyPublished = session.publish_status === "published";
                return (
                  <div key={session.id}>
                    <InlineWorkoutPreview
                      session={session}
                      lt1={sLt1}
                      lt2={sLt2}
                      onOpenDetail={() => setDetailSession(session)}
                    />
                    {/* Garmin push + lactate actions */}
                    {(garminConnected && session.structured_workout_payload) && (
                      <div className="ath-session-actions">
                        {alreadyPublished || pushStatus === "ok" ? (
                          <span className="ath-garmin-sent">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Enviado a Garmin
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="ath-garmin-push-btn"
                            disabled={isPushing}
                            onClick={(e) => { e.stopPropagation(); handleGarminPush(session); }}
                          >
                            {isPushing ? (
                              <span className="ath-garmin-spinner" />
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polygon points="12 6 15.09 11.5 21 12.27 16.91 16.97 17.82 22.81 12 19.77 6.18 22.81 7.09 16.97 3 12.27 8.91 11.5 12 6" fill="none" /></svg>
                            )}
                            Enviar a Garmin
                          </button>
                        )}
                        {pushStatus === "error" && <span className="ath-garmin-error">Error al enviar</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="ath-rest-day">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <p>Día de descanso — recupérate bien</p>
            {nextSession && (
              <div className="ath-next-session-hint">
                <span className="ath-next-label">Próxima sesión</span>
                <span className="ath-next-detail">
                  {new Date(nextSession.scheduled_date + "T00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric" })}
                  {" · "}
                  <span className={`ath-session-role ${nextSession.session_role === "KEY" ? "key" : nextSession.session_role === "LONG" ? "long" : "support"}`}>
                    {nextSession.session_role}
                  </span>
                  {" "}
                  {nextSession.public_label}
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Hero: 3 symmetrical rings — Estado (left) · Predisposición (center, large) · VO2max (right) */}
      <div className="ath-hero">
        <ReadinessRing
          score={data.trainingStatus.score}
          label={data.trainingStatus.label}
          tone={data.trainingStatus.tone}
          title="Estado"
          size="small"
        />
        <ReadinessRing
          score={data.readiness.score}
          label={data.readiness.label}
          tone={data.readiness.tone}
          title="Predisposición"
          size="large"
        />
        {data.vo2maxValue !== null && Number.isFinite(data.vo2maxValue) ? (
          <ReadinessRing
            score={Math.min(100, Math.max(0, Math.round(((data.vo2maxValue - 25) / 45) * 100)))}
            label={`${data.vo2maxValue.toFixed(1)}`}
            tone="vo2"
            title="VO₂max"
            size="small"
            subtitle={data.vo2maxLabel}
          />
        ) : (
          <ReadinessRing
            score={0}
            label="—"
            tone="neutral"
            title="VO₂max"
            size="small"
          />
        )}
      </div>

      {/* ── Target countdown + Phase timeline ──────────── */}
      {(primaryTarget || phaseTimeline) && (
        <div className="ath-today-plan-bar">
          {primaryTarget && targetCountdown !== null && (
            <div className="ath-target-card">
              <div className="ath-target-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div className="ath-target-info">
                <span className="ath-target-name">{primaryTarget.objective}</span>
                <span className="ath-target-countdown">
                  {targetCountdown} día{targetCountdown !== 1 ? "s" : ""}
                  {primaryTarget.discipline && ` · ${disciplineLabel(primaryTarget.discipline)}`}
                </span>
              </div>
            </div>
          )}

          {phaseTimeline && (
            <div className="ath-phase-timeline">
              <div className="ath-phase-bar">
                {phaseTimeline.phases.map((phase, i) => (
                  <div
                    key={phase}
                    className={`ath-phase-segment ${i === phaseTimeline.currentIdx ? "current" : i < phaseTimeline.currentIdx ? "done" : ""}`}
                  >
                    <span className="ath-phase-label">{phase}</span>
                  </div>
                ))}
              </div>
              <div className="ath-phase-progress">
                <div className="ath-phase-progress-fill" style={{ width: `${phaseTimeline.blockProgress}%` }} />
              </div>
              <span className="ath-phase-detail">
                {activeBlock?.block_objective ?? "Bloque activo"}
                {phaseTimeline.weeksLeft > 0 && ` · ${phaseTimeline.weeksLeft} sem. restantes`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Vital chips */}
      <div className="ath-vitals-row">
        <VitalChip
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          label="Sueño"
          value={data.currentSleepHours !== null ? formatSleepDuration(data.currentSleepHours * 3600) : "n/d"}
          delta={data.sleepHoursAverage !== null && data.currentSleepHours !== null
            ? `${(data.currentSleepHours - data.sleepHoursAverage) > 0 ? "+" : ""}${Math.round((data.currentSleepHours - data.sleepHoursAverage) * 60)} min vs 7d`
            : undefined}
          sparkData={data.wellnessSeries.slice(-14)}
          sparkKey="sleepHours"
          sparkColor="#8B5CF6"
        />
        <VitalChip
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 12 6 12 8 6 11 18 14 8 16 12 22 12"/></svg>}
          label="HRV"
          value={typeof data.currentHrv === "number" ? `${data.currentHrv.toFixed(0)} ms` : "n/d"}
          status={data.currentHrvStatus}
          statusTone={data.currentHrvTone}
          delta={data.hrvAverage !== null ? `Media ${data.hrvAverage.toFixed(0)} ms` : undefined}
          sparkData={data.wellnessSeries.slice(-14)}
          sparkKey="hrv"
          sparkColor="#10B981"
          sparkRefBand={data.hrvAverage !== null ? { y1: data.hrvAverage * 0.92, y2: data.hrvAverage * 1.08 } : null}
        />
        <VitalChip
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>}
          label="FC Reposo"
          value={typeof data.currentRestingHr === "number" ? `${data.currentRestingHr.toFixed(0)} bpm` : "n/d"}
          sparkData={data.wellnessSeries.slice(-14)}
          sparkKey="restingHr"
          sparkColor="#3B82F6"
          sparkRefBand={data.restingHrAverage !== null ? { y1: data.restingHrAverage - 3, y2: data.restingHrAverage + 3 } : null}
          delta={data.restingHrAverage !== null ? `Media ${data.restingHrAverage.toFixed(0)} bpm` : undefined}
        />
        <VitalChip
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>}
          label="Estrés"
          value={typeof data.currentStress === "number" ? `${Math.round(data.currentStress)}` : "n/d"}
          status={stressLabel(data.currentStress)}
          statusTone={typeof data.currentStress === "number" && data.currentStress >= 60 ? "warning" : "good"}
          sparkData={data.wellnessSeries.slice(-14)}
          sparkKey="stress"
          sparkColor="#F59E0B"
        />
      </div>

      {/* (Sessions moved to top of page) */}

      {/* ── Dashboard Widgets (Garmin-inspired) ──────────────── */}
      <div className="ath-dashboard-grid">
        {/* 1. Training Status Card */}
        <div className="ath-dash-card ath-dash-status">
          <div className="ath-dash-card-header">
            <span className="ath-dash-card-title">Estado de entrenamiento</span>
          </div>
          <div className="ath-dash-status-body">
            <div className={`ath-dash-status-badge tone-${data.trainingStatus.tone}`}>
              {data.trainingStatus.label}
            </div>
            <div className="ath-dash-status-metrics">
              <div className="ath-dash-status-metric">
                <span className="ath-dash-metric-label">VO₂max</span>
                <span className="ath-dash-metric-value">
                  {data.vo2maxValue !== null ? data.vo2maxValue.toFixed(1) : "—"}
                </span>
                {data.vo2maxLabel && <span className="ath-dash-metric-sub">{data.vo2maxLabel}</span>}
              </div>
              <div className="ath-dash-status-metric">
                <span className="ath-dash-metric-label">Carga A/C</span>
                <span className="ath-dash-metric-value">{trainingLoadData.ratio}</span>
                <span className={`ath-dash-metric-sub tone-${trainingLoadData.loadTone}`}>
                  {trainingLoadData.loadStatus}
                </span>
              </div>
              <div className="ath-dash-status-metric">
                <span className="ath-dash-metric-label">HRV</span>
                <span className="ath-dash-metric-value">
                  {typeof data.currentHrv === "number" ? `${data.currentHrv.toFixed(0)}` : "—"}
                </span>
                <span className={`ath-dash-metric-sub tone-${data.currentHrvTone === "good" ? "good" : data.currentHrvTone === "warning" ? "warning" : "neutral"}`}>
                  {data.currentHrvStatus || "ms"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Training Load 4-week chart */}
        <div className="ath-dash-card ath-dash-load">
          <div className="ath-dash-card-header">
            <span className="ath-dash-card-title">Carga de entrenamiento</span>
            <span className="ath-dash-card-period">28 días</span>
          </div>
          <div className="ath-dash-load-summary">
            <div className="ath-dash-load-stat">
              <span className="ath-dash-load-num">{trainingLoadData.acute}</span>
              <span className="ath-dash-load-lbl">Aguda (7d)</span>
            </div>
            <div className="ath-dash-load-stat">
              <span className="ath-dash-load-num">{trainingLoadData.chronic}</span>
              <span className="ath-dash-load-lbl">Crónica (28d)</span>
            </div>
            <div className="ath-dash-load-stat">
              <span className={`ath-dash-load-num tone-${trainingLoadData.loadTone}`}>{trainingLoadData.ratio}</span>
              <span className="ath-dash-load-lbl">Ratio A:C</span>
            </div>
          </div>
          <div className="ath-dash-load-chart">
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={trainingLoadData.days} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ath-border-subtle)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: "var(--ath-text-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  interval={6}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: "var(--ath-bg-card)",
                    border: "1px solid var(--ath-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v}`, "Carga"]}
                  labelFormatter={(l) => `${l}`}
                />
                <Bar dataKey="load" radius={[3, 3, 0, 0]}>
                  {trainingLoadData.days.map((d, i) => (
                    <Cell
                      key={d.date}
                      fill={i >= 21 ? "var(--ath-accent)" : i >= 14 ? "var(--ath-blue)" : "var(--ath-text-muted)"}
                      opacity={i >= 21 ? 1 : i >= 14 ? 0.7 : 0.4}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Last 7 Days summary */}
        <div className="ath-dash-card ath-dash-week">
          <div className="ath-dash-card-header">
            <span className="ath-dash-card-title">Últimos 7 días</span>
            <span className="ath-dash-card-period">{last7DaysSummary.reduce((s, d) => s + d.count, 0)} actividades</span>
          </div>
          {last7DaysSummary.length > 0 ? (
            <div className="ath-dash-week-list">
              {last7DaysSummary.map((s) => (
                <div key={s.sport} className="ath-dash-week-sport">
                  <div className="ath-dash-week-dot" style={{ background: s.color }} />
                  <div className="ath-dash-week-info">
                    <span className="ath-dash-week-name">{s.count} {s.label}</span>
                    <span className="ath-dash-week-detail">
                      {(s.distance / 1000).toFixed(1)} km · {Math.round(s.duration / 60)} min
                    </span>
                  </div>
                  <div className="ath-dash-week-bar-wrap">
                    <div
                      className="ath-dash-week-bar-fill"
                      style={{
                        width: `${Math.min(100, (s.duration / Math.max(1, last7DaysSummary[0].duration)) * 100)}%`,
                        background: s.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ath-dash-week-empty">Sin actividades esta semana</div>
          )}
          <div className="ath-dash-week-totals">
            <span>{(last7DaysSummary.reduce((s, d) => s + d.distance, 0) / 1000).toFixed(1)} km total</span>
            <span>{Math.round(last7DaysSummary.reduce((s, d) => s + d.duration, 0) / 3600)}h {Math.round((last7DaysSummary.reduce((s, d) => s + d.duration, 0) % 3600) / 60)}m</span>
          </div>
        </div>

        {/* 4. Weight card */}
        <div className="ath-dash-card ath-dash-weight">
          <div className="ath-dash-card-header">
            <span className="ath-dash-card-title">Peso</span>
            <button
              type="button"
              className="ath-dash-weight-add"
              onClick={() => { setShowWeightInput(!showWeightInput); setWeightDraft(athleteWeight ? String(athleteWeight) : ""); }}
            >
              {showWeightInput ? "Cancelar" : "+ Registrar"}
            </button>
          </div>
          <div className="ath-dash-weight-current">
            <span className="ath-dash-metric-value">{athleteWeight ? `${athleteWeight.toFixed(1)}` : "—"}</span>
            <span className="ath-dash-metric-sub">kg</span>
          </div>
          {showWeightInput && (
            <div className="ath-dash-weight-form">
              <input
                type="text"
                inputMode="decimal"
                className="ath-dash-weight-input"
                placeholder="72.5"
                value={weightDraft}
                onChange={(e) => { if (e.target.value === "" || /^\d*\.?\d*$/.test(e.target.value)) setWeightDraft(e.target.value); }}
                onKeyDown={(e) => e.key === "Enter" && handleSaveWeight()}
                autoFocus
              />
              <button
                type="button"
                className="ath-dash-weight-save"
                onClick={handleSaveWeight}
                disabled={weightSaving || !weightDraft}
              >
                {weightSaving ? "..." : "Guardar"}
              </button>
            </div>
          )}
          {weightChartData.length > 1 && (
            <div className="ath-dash-weight-chart">
              <ResponsiveContainer width="100%" height={60}>
                <LineChart data={weightChartData}>
                  <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                  <XAxis dataKey="date" hide />
                  <Tooltip
                    contentStyle={{ background: "var(--ath-bg-card)", border: "1px solid var(--ath-border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`${v.toFixed(1)} kg`, "Peso"]}
                  />
                  <Line type="monotone" dataKey="weight" stroke="var(--ath-accent)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {weightChartData.length > 1 && (() => {
            const first = weightChartData[0].weight;
            const last = weightChartData[weightChartData.length - 1].weight;
            const diff = last - first;
            return (
              <div className="ath-dash-weight-delta">
                <span className={diff > 0 ? "up" : diff < 0 ? "down" : ""}>
                  {diff > 0 ? "+" : ""}{diff.toFixed(1)} kg
                </span>
                <span className="ath-dash-weight-period">último mes</span>
              </div>
            );
          })()}
        </div>

        {/* 5. Calories donut (daily/weekly toggle) */}
        {(() => {
          const cal = calMode === "daily" ? caloriesData.daily : caloriesData.weekly;
          const totalLabel = cal.total >= 10000 ? `${(cal.total / 1000).toFixed(1)}k` : cal.total.toLocaleString();
          const mult = calMode === "weekly" ? 7 : 1;
          return (
            <div className="ath-dash-card ath-dash-cal">
              <div className="ath-dash-card-header">
                <span className="ath-dash-card-title">Calorías</span>
                <div className="ath-dash-cal-toggle">
                  <button type="button" className={calMode === "daily" ? "active" : ""} onClick={() => setCalMode("daily")}>Hoy</button>
                  <button type="button" className={calMode === "weekly" ? "active" : ""} onClick={() => setCalMode("weekly")}>7 días</button>
                </div>
              </div>
              <div className="ath-dash-cal-body">
                <div className="ath-dash-cal-donut">
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Entreno", value: cal.exercise, fill: "var(--ath-green)" },
                          { name: "Pasos", value: cal.stepsCal, fill: "var(--ath-amber)" },
                          { name: "BMR", value: caloriesData.bmr * mult, fill: "var(--ath-blue)" },
                          { name: "NEAT+TEF", value: (caloriesData.neat + caloriesData.tef) * mult, fill: "var(--ath-bg-hover)" },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={52}
                        paddingAngle={1}
                        dataKey="value"
                        strokeWidth={0}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="ath-dash-cal-center">
                    <span className="ath-dash-cal-total">{totalLabel}</span>
                    <span className="ath-dash-cal-unit">kcal</span>
                  </div>
                </div>
                <div className="ath-dash-cal-legend">
                  <div className="ath-dash-cal-row">
                    <span className="ath-dash-cal-dot" style={{ background: "var(--ath-green)" }} />
                    <span>Entreno</span>
                    <span className="ath-dash-cal-val">{cal.exercise.toLocaleString()}</span>
                  </div>
                  <div className="ath-dash-cal-row">
                    <span className="ath-dash-cal-dot" style={{ background: "var(--ath-amber)" }} />
                    <span>Pasos</span>
                    <span className="ath-dash-cal-val">
                      {cal.stepsCal.toLocaleString()}
                      <span className="ath-dash-cal-steps-count"> ({cal.steps.toLocaleString()} pasos)</span>
                    </span>
                  </div>
                  <div className="ath-dash-cal-row">
                    <span className="ath-dash-cal-dot" style={{ background: "var(--ath-blue)" }} />
                    <span>BMR</span>
                    <span className="ath-dash-cal-val">{(caloriesData.bmr * mult).toLocaleString()}</span>
                  </div>
                  <div className="ath-dash-cal-row">
                    <span className="ath-dash-cal-dot" style={{ background: "var(--ath-bg-hover)" }} />
                    <span>NEAT+TEF</span>
                    <span className="ath-dash-cal-val">{((caloriesData.neat + caloriesData.tef) * mult).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Morning Wellness Check-in (McLean 2010, Saw 2016) ── */}
      {!wellnessSaved && (
        <section className="ath-wellness-checkin">
          <h2 className="ath-section-title">Check-in matinal</h2>
          <p className="ath-checkin-subtitle">30 segundos — tu coach lo verá</p>
          <div className="ath-checkin-items">
            {WELLNESS_CHECK_ITEMS.map((item) => (
              <div key={item.key} className="ath-checkin-item">
                <div className="ath-checkin-item-header">
                  <span className="ath-checkin-item-label">{item.label}</span>
                  <span className="ath-checkin-item-value">
                    {wellnessValues[item.key] ? `${wellnessValues[item.key]}/5` : "—"}
                  </span>
                </div>
                <div className="ath-checkin-anchors">
                  <span>{item.anchors[0]}</span>
                  <span>{item.anchors[1]}</span>
                </div>
                <div className="ath-checkin-dots">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`ath-checkin-dot ${wellnessValues[item.key] === v ? "active" : ""} ${wellnessValues[item.key] === v ? `tone-${v <= 2 ? "low" : v <= 3 ? "mid" : "high"}` : ""}`}
                      onClick={() => setWellnessValues((prev) => ({ ...prev, [item.key]: v }))}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {Object.keys(wellnessValues).length === WELLNESS_CHECK_ITEMS.length && (
            <div className="ath-checkin-summary">
              <span className={`ath-checkin-avg tone-${wellnessCheckTone(wellnessCheckAverage(wellnessValues))}`}>
                Media: {wellnessCheckAverage(wellnessValues).toFixed(1)} / 5
              </span>
              <button type="button" className="ath-checkin-save" onClick={async () => {
                if (!data.user?.athlete_id) return;
                try {
                  await api.submitWellnessCheckin(data.token, data.user.athlete_id, {
                    check_date: new Date().toISOString().slice(0, 10),
                    fatigue: wellnessValues.fatigue,
                    soreness: wellnessValues.soreness,
                    mood: wellnessValues.mood,
                    sleep_quality: wellnessValues.sleep_quality,
                  });
                  setWellnessSaved(true);
                } catch (e) {
                  console.error("Wellness check-in failed:", e);
                  setWellnessSaved(true); // Still hide form on error
                }
              }}>
                Enviar
              </button>
            </div>
          )}
        </section>
      )}
      {wellnessSaved && (
        <div className="ath-checkin-done">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ath-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Check-in registrado — media {wellnessCheckAverage(wellnessValues).toFixed(1)}/5
        </div>
      )}

      {/* Today's completed activities */}
      {(() => {
        const todayIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
        const todayActivities = (data.health?.recent_activities ?? []).filter((a) => {
          const d = new Date(a.started_at);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` === todayIso;
        });
        if (todayActivities.length === 0) return null;
        return (
          <section className="ath-today-completed">
            <h2 className="ath-section-title">Entrenos completados</h2>
            <div className="ath-today-act-list">
              {todayActivities.map((act) => (
                <button
                  key={act.provider_activity_id}
                  type="button"
                  className="ath-today-act-card"
                  onClick={() => setAnalysisActivity(act)}
                  style={{ borderLeftColor: act.sport_color }}
                >
                  <div className="ath-today-act-top">
                    <span className="ath-today-act-sport" style={{ color: act.sport_color }}>{act.sport_label}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ath-green)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <span className="ath-today-act-name">{act.name}</span>
                  <div className="ath-today-act-stats">
                    <span>{Math.floor(act.moving_time_seconds / 60)}′</span>
                    {act.distance_m > 0 && <span>{(act.distance_m / 1000).toFixed(1)} km</span>}
                    {act.average_heartrate && <span>{Math.round(act.average_heartrate)} bpm</span>}
                  </div>
                  <span className="ath-today-act-cta">Ver analisis &rarr;</span>
                </button>
              ))}
            </div>
          </section>
        );
      })()}

      {/* Lactate step input (optional, collapsible) */}
      {lactateEligibleSessions.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          {!showLactateInput ? (
            <button
              type="button"
              className="ath-lactate-toggle-btn"
              onClick={() => setShowLactateInput(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20V10"/>
                <path d="M18 20V4"/>
                <path d="M6 20v-4"/>
              </svg>
              Registrar lactato
            </button>
          ) : (
            <LactateStepInput
              sessions={lactateEligibleSessions}
              onSubmit={async (submission: LactateSubmission) => {
                if (!data.user?.athlete_id) return;
                try {
                  const validValues = submission.values.filter((v) => v.lactate !== null && v.lactate > 0);
                  if (validValues.length === 0) { setShowLactateInput(false); return; }
                  await api.createSession(data.token, {
                    athlete_id: data.user.athlete_id,
                    performed_at: new Date().toISOString(),
                    discipline: submission.discipline,
                    session_type: "test",
                    goal: "Lactate test — " + submission.sessionLabel,
                    comments: "Registrado desde el portal del atleta",
                    intervals: validValues.map((v, i) => ({
                      order_index: i + 1,
                      duration_seconds: 300,
                      purpose: "step",
                      notes: v.step,
                      lactate_sample: {
                        lactate_mmol: v.lactate,
                        sample_delay_seconds: 0,
                        sample_timing_label: v.step || `Step ${i + 1}`,
                      },
                    })),
                  });
                } catch (e) {
                  console.error("Lactate submission failed:", e);
                }
                setShowLactateInput(false);
              }}
            />
          )}
        </section>
      )}

      {/* ── Session Detail Modal ── */}
      {detailSession && (() => {
        const view = data.analysis?.discipline_views?.[detailSession.discipline];
        const lt1 = resolveTrainingThreshold(view, "LT1");
        const lt2 = resolveTrainingThreshold(view, "LT2");
        return (
          <SessionDetailModal
            session={detailSession}
            lt1={lt1}
            lt2={lt2}
            onClose={() => setDetailSession(null)}
            onDelete={() => { data.removeSession(detailSession.id); setDetailSession(null); }}
          />
        );
      })()}

      {/* ── Post-Workout Analysis Modal ── */}
      {analysisActivity && (() => {
        const disc = analysisActivity.sport_type === "cycling" ? "ciclismo"
          : analysisActivity.sport_type === "swimming" ? "natación"
          : "running";
        const view = data.analysis?.discipline_views?.[disc];
        const lt1 = resolveTrainingThreshold(view, "LT1");
        const lt2 = resolveTrainingThreshold(view, "LT2");
        const todayIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
        const matched = data.plannedSessions.find((s) => s.scheduled_date === todayIso && s.discipline === disc);
        return (
          <PostWorkoutAnalysis
            activity={analysisActivity}
            plannedSession={matched}
            lt1={lt1}
            lt2={lt2}
            token={data.token}
            athleteId={data.user.athlete_id!}
            onClose={() => setAnalysisActivity(null)}
          />
        );
      })()}
    </div>
  );
}
