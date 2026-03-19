import { useCallback, useEffect, useMemo, useState } from "react";
import { useAthleteData } from "../context/AthleteDataContext";
import { SessionCard } from "../components/SessionCard";
import { SessionDetailModal } from "../components/SessionDetailModal";
import { PostWorkoutAnalysis } from "../components/PostWorkoutAnalysis";
import { formatDurationMin, disciplineLabel } from "../utils/formatters";
import { buildWeeklyVolumeByDiscipline, allSessionsDeduped } from "../utils/training";
import { detectLoadSpikes, type LoadSpikeWarning } from "../utils/readiness";
import { resolveTrainingThreshold, type ResolvedTrainingThreshold } from "../../lib/trainingThresholds";
import type { AthleteHealthActivity, GarminActivity, PlanningPlannedSession, TrainingZoneItem, TrainingZoneSet, WorkoutDefinition, WorkoutStep, WorkoutTarget } from "../../types";
import { WorkoutStepEditor } from "../../components/WorkoutStepEditor";
import { buildDemoActivity } from "../utils/demoActivity";
import { api } from "../../lib/api";
import CalendarImport from "../components/CalendarImport";

type TimeAssignment = Record<number, string>;
type CalendarMode = "week" | "month";

/** Local YYYY-MM-DD (avoids UTC shift from toISOString) */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDurShort(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}`;
  return `${m}′`;
}

/** Short discipline prefix: running→RUN, ciclismo→BIKE, natación→SWIM */
function discShort(d: string): string {
  if (d === "running" || d === "carrera") return "RUN";
  if (d === "ciclismo" || d === "cycling") return "BIKE";
  if (d === "natación" || d === "swimming") return "SWIM";
  return d.slice(0, 4).toUpperCase();
}

/** Extract a compact dose label from a planned session, e.g. "LT1 6×6'" or "Tempo 40'" */
function sessionMiniLabel(s: PlanningPlannedSession): string {
  // Try to extract from dose_prescription first (usually most concise)
  const dose = s.dose_prescription ?? "";
  // Look for patterns like "6×6' LT1" or "4x3km"
  const rxReps = /(\d+)\s*[×x]\s*(\d+['′"]?\s*(?:km|m|min)?)/i;
  const matchReps = dose.match(rxReps);

  // Determine zone/type label
  const family = s.session_family ?? "";
  const label = s.public_label ?? "";
  const combined = `${family} ${label} ${dose}`.toLowerCase();
  let zone = "";
  if (combined.includes("vo2")) zone = "VO2";
  else if (combined.includes("lt2") || combined.includes("umbral") || combined.includes("threshold") || combined.includes("cruise")) zone = "LT2";
  else if (combined.includes("sub-t") || combined.includes("sub_t") || combined.includes("subthreshold")) zone = "Sub-T";
  else if (combined.includes("lt1") || combined.includes("aerob") || combined.includes("aerób")) zone = "LT1";
  else if (combined.includes("anc") || combined.includes("sprint") || combined.includes("fuerza")) zone = "ANC";
  else if (combined.includes("tempo") || combined.includes("progresiv")) zone = "Tempo";
  else if (combined.includes("long") || s.session_role === "LONG") zone = "Long";
  else if (s.session_role === "KEY") zone = "KEY";
  else zone = "Suave";

  if (matchReps) {
    return `${zone} ${matchReps[1]}×${matchReps[2]}`;
  }

  // Fallback: show zone + duration
  const durMin = typeof s.payload?.total_duration_min === "number" ? s.payload.total_duration_min as number : null;
  if (durMin) return `${zone} ${durMin}′`;
  return zone;
}

/** Short label for a completed activity, e.g. "5.2km 25′" */
function activityMiniLabel(a: AthleteHealthActivity): string {
  const parts: string[] = [];
  if (a.distance_m > 0) {
    parts.push(a.distance_m >= 1000 ? `${(a.distance_m / 1000).toFixed(1)}km` : `${Math.round(a.distance_m)}m`);
  }
  const m = Math.floor(a.moving_time_seconds / 60);
  parts.push(`${m}′`);
  return parts.join(" ");
}

type CalendarEvent = { summary: string; start: string | null; end: string | null; all_day: boolean };

export function WeekPage() {
  const data = useAthleteData();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [timeAssignments, setTimeAssignments] = useState<TimeAssignment>({});
  const [showCalendarImport, setShowCalendarImport] = useState(false);
  const [showWorkoutBuilder, setShowWorkoutBuilder] = useState(false);
  const [builderPresetDate, setBuilderPresetDate] = useState<string | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [editingTimeId, setEditingTimeId] = useState<number | null>(null);
  const [calMode, setCalMode] = useState<CalendarMode>("week");

  // Session detail modal
  const [detailSession, setDetailSession] = useState<PlanningPlannedSession | null>(null);
  // Post-workout analysis modal
  const [analysisActivity, setAnalysisActivity] = useState<AthleteHealthActivity | null>(null);
  const [demoDetail, setDemoDetail] = useState<GarminActivity | null>(null);
  const [demoPlanned, setDemoPlanned] = useState<PlanningPlannedSession | null>(null);
  // Month day detail popover
  const [monthDetailIso, setMonthDetailIso] = useState<string | null>(null);

  // Drag state
  const [dragSessionId, setDragSessionId] = useState<number | null>(null);
  const [dragOverIso, setDragOverIso] = useState<string | null>(null);

  const athleteId = data.user.athlete_id!;

  // ── Calendar sync: check status + fetch events ──
  const fetchCalendarEvents = useCallback(async () => {
    if (!data.calendarWeek.length) return;
    const startDate = localIso(data.calendarWeek[0].date);
    const endDate = localIso(data.calendarWeek[6].date);
    setCalendarLoading(true);
    try {
      const events = await api.calendarEvents(data.token, athleteId, startDate, endDate);
      setCalendarEvents(events);
    } catch {
      setCalendarEvents([]);
    } finally {
      setCalendarLoading(false);
    }
  }, [data.token, athleteId, data.calendarWeek]);

  useEffect(() => {
    // Detect Google Calendar OAuth callback redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get("google-calendar") === "connected") {
      setCalendarConnected(true);
      fetchCalendarEvents();
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete("google-calendar");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
    api.calendarStatus(data.token, athleteId).then((res: { connected: boolean }) => {
      setCalendarConnected(res.connected);
      if (res.connected) fetchCalendarEvents();
    }).catch(() => {});
  }, [data.token, athleteId, fetchCalendarEvents]);

  // Re-fetch events when week changes and calendar is connected
  useEffect(() => {
    if (calendarConnected && data.calendarWeek.length) fetchCalendarEvents();
  }, [calendarConnected, data.calendarWeek, fetchCalendarEvents]);

  const handleCalendarConnected = useCallback(() => {
    setCalendarConnected(true);
    fetchCalendarEvents();
  }, [fetchCalendarEvents]);

  const handleCalendarDisconnect = useCallback(async () => {
    try {
      await api.calendarDisconnect(data.token, athleteId);
      setCalendarConnected(false);
      setCalendarEvents([]);
    } catch { /* ignore */ }
  }, [data.token, athleteId]);

  const calendarWeekLabel = useMemo(() => {
    if (!data.calendarWeek.length) return "";
    const first = data.calendarWeek[0].date;
    const last = data.calendarWeek[6].date;
    const fmtDay = (d: Date) => d.getDate();
    const fmtMonth = (d: Date) => d.toLocaleDateString("es-ES", { month: "short" });
    if (first.getMonth() === last.getMonth()) {
      return `${fmtDay(first)}-${fmtDay(last)} ${fmtMonth(last)} ${last.getFullYear()}`;
    }
    return `${fmtDay(first)} ${fmtMonth(first)} - ${fmtDay(last)} ${fmtMonth(last)} ${last.getFullYear()}`;
  }, [data.calendarWeek]);

  const monthData = useMemo(() => {
    if (calMode !== "month" || !data.calendarWeek.length) return null;
    const ref = data.calendarWeek[0].date;
    const year = ref.getFullYear();
    const month = ref.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7;
    const days: Array<{ date: Date; dayNum: number; isCurrentMonth: boolean; iso: string; isToday: boolean }> = [];
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, dayNum: d.getDate(), isCurrentMonth: false, iso: localIso(d), isToday: false });
    }
    const todayIso = localIso(new Date());
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dt = new Date(year, month, d);
      const iso = localIso(dt);
      days.push({ date: dt, dayNum: d, isCurrentMonth: true, iso, isToday: iso === todayIso });
    }
    while (days.length % 7 !== 0) {
      const dt = new Date(year, month + 1, days.length - lastDay.getDate() - startDow + 1);
      days.push({ date: dt, dayNum: dt.getDate(), isCurrentMonth: false, iso: localIso(dt), isToday: false });
    }
    const weeks: typeof days[] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return { weeks, monthLabel: firstDay.toLocaleDateString("es-ES", { month: "long", year: "numeric" }) };
  }, [calMode, data.calendarWeek]);

  const sessionsByDate = useMemo(() => {
    const map: Record<string, PlanningPlannedSession[]> = {};
    // Include calendarWeek sessions
    for (const day of data.calendarWeek) map[day.iso] = day.sessions;
    // Also index all planned sessions for month view
    for (const s of data.plannedSessions) {
      if (!map[s.scheduled_date]) map[s.scheduled_date] = [];
      if (!map[s.scheduled_date].some((x) => x.id === s.id)) {
        map[s.scheduled_date].push(s);
      }
    }
    return map;
  }, [data.calendarWeek, data.plannedSessions]);

  // Completed activities indexed by date
  const activitiesByDate = useMemo(() => {
    const map: Record<string, AthleteHealthActivity[]> = {};
    for (const a of data.health?.recent_activities ?? []) {
      const d = new Date(a.started_at);
      const iso = localIso(d);
      if (!map[iso]) map[iso] = [];
      map[iso].push(a);
    }
    return map;
  }, [data.health?.recent_activities]);

  const totalSessions = data.calendarWeek.reduce((sum, d) => sum + d.sessions.length, 0);
  const totalMinutes = data.calendarWeek.reduce((sum, d) =>
    sum + d.sessions.reduce((s, sess) => s + (typeof sess.payload?.total_duration_min === "number" ? sess.payload.total_duration_min as number : 0), 0), 0);

  // Load spike detection (Gabbett 2016 ACWR, uncoupled per Lolli 2019)
  const loadSpikeWarnings = useMemo<LoadSpikeWarning[]>(() => {
    const allSessions = allSessionsDeduped(data.analysis);
    const weeklyVol = buildWeeklyVolumeByDiscipline(allSessions, 5);
    const disciplines = [...new Set(data.calendarWeek.flatMap((d) => d.sessions.map((s) => s.discipline)).filter(Boolean))];
    const mappedDiscs = disciplines.map((d) => d === "ciclismo" ? "cycling" : d === "natación" ? "swimming" : d === "carrera" ? "running" : d);
    return detectLoadSpikes(weeklyVol, [...new Set(mappedDiscs)]);
  }, [data.analysis, data.calendarWeek]);

  const zoneDistribution = useMemo(() => {
    const totals = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
    for (const day of data.calendarWeek) {
      for (const s of day.sessions) {
        const dur = typeof s.payload?.total_duration_min === "number" ? s.payload.total_duration_min as number : 45;
        if (s.session_role === "LONG") { totals.z1 += dur * 0.6; totals.z2 += dur * 0.4; }
        else if (s.session_role === "SUPPORT") { totals.z2 += dur * 0.7; totals.z1 += dur * 0.3; }
        else if (s.session_role === "KEY") { totals.z3 += dur * 0.4; totals.z4 += dur * 0.4; totals.z5 += dur * 0.2; }
      }
    }
    const total = totals.z1 + totals.z2 + totals.z3 + totals.z4 + totals.z5;
    if (total === 0) return null;
    return { z1: Math.round((totals.z1 / total) * 100), z2: Math.round((totals.z2 / total) * 100), z3: Math.round((totals.z3 / total) * 100), z4: Math.round((totals.z4 / total) * 100), z5: Math.round((totals.z5 / total) * 100) };
  }, [data.calendarWeek]);

  // ── Volume summary (TSS, CTL, hours by discipline) ──
  const weekVolumeSummary = useMemo(() => {
    // Planned sessions
    let totalTSS = 0;
    const hoursByDisc: Record<string, number> = {};

    for (const day of data.calendarWeek) {
      for (const s of day.sessions) {
        totalTSS += s.estimated_tss ?? 0;
        const disc = s.discipline === "carrera" ? "running" : s.discipline === "ciclismo" ? "cycling" : s.discipline === "natación" ? "swimming" : s.discipline;
        const mins = typeof s.payload?.total_duration_min === "number" ? s.payload.total_duration_min as number : 0;
        hoursByDisc[disc] = (hoursByDisc[disc] ?? 0) + mins / 60;
      }
    }

    // Completed activities this week
    const weekDates = new Set(data.calendarWeek.map((d) => d.iso));
    for (const act of data.health?.recent_activities ?? []) {
      const iso = localIso(new Date(act.started_at));
      if (!weekDates.has(iso)) continue;
      if (act.training_load) totalTSS += act.training_load;
      const disc = act.sport_type === "running" ? "running" : act.sport_type === "cycling" ? "cycling" : act.sport_type === "swimming" ? "swimming" : act.sport_type;
      hoursByDisc[disc] = (hoursByDisc[disc] ?? 0) + act.moving_time_seconds / 3600;
    }

    // CTL estimate from 28-day activity history
    const activities = data.health?.recent_activities ?? [];
    const dayLoads: Record<string, number> = {};
    for (const a of activities) {
      const iso = localIso(new Date(a.started_at));
      const load = a.training_load && a.training_load > 0 ? a.training_load : (() => {
        const durMin = a.moving_time_seconds / 60;
        const hr = a.average_heartrate ?? 130;
        return durMin * Math.max(0.5, (hr - 60) / 100);
      })();
      dayLoads[iso] = (dayLoads[iso] ?? 0) + load;
    }
    // Sort dates and compute 42-day EWMA
    const sortedDates = Object.keys(dayLoads).sort();
    let ctl = 0;
    const ctlDecay = 2 / (42 + 1);
    for (const d of sortedDates) {
      ctl = ctl + (dayLoads[d] - ctl) * ctlDecay;
    }

    const totalHours = Object.values(hoursByDisc).reduce((s, h) => s + h, 0);
    const maxHours = Math.max(...Object.values(hoursByDisc), 0.1);

    return { totalTSS: Math.round(totalTSS), ctl: Math.round(ctl), hoursByDisc, totalHours, maxHours };
  }, [data.calendarWeek, data.health?.recent_activities]);

  function getPersonalEvents(dayIso: string): CalendarEvent[] {
    if (!calendarConnected || !calendarEvents.length) return [];
    return calendarEvents.filter((e) => {
      if (!e.start) return false;
      const eventDate = e.start.slice(0, 10); // YYYY-MM-DD
      return eventDate === dayIso;
    });
  }

  function handleTimeChange(sessionId: number, time: string) {
    setTimeAssignments((prev) => ({ ...prev, [sessionId]: time }));
    setEditingTimeId(null);
  }

  // Drag handlers
  function handleDragStart(e: React.DragEvent, sessionId: number) {
    setDragSessionId(sessionId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(sessionId));
  }

  function handleDragOver(e: React.DragEvent, iso: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIso(iso);
  }

  function handleDragLeave() {
    setDragOverIso(null);
  }

  function handleDrop(e: React.DragEvent, iso: string) {
    e.preventDefault();
    setDragOverIso(null);
    if (dragSessionId !== null) {
      data.moveSession(dragSessionId, iso);
      setDragSessionId(null);
    }
  }

  function handleDragEnd() {
    setDragSessionId(null);
    setDragOverIso(null);
  }

  // Per-day add: open builder with preset date
  function openBuilderForDate(iso: string) {
    setBuilderPresetDate(iso);
    setShowWorkoutBuilder(true);
  }

  // Delete session
  function handleDeleteSession(sessionId: number) {
    data.removeSession(sessionId);
    setDetailSession(null);
  }

  return (
    <div className="ath-page ath-week">
      {/* Header */}
      <div className="ath-week-header">
        <div className="ath-week-nav">
          <h2 className="ath-section-title" style={{ margin: 0 }}>{calMode === "week" ? "Semana" : "Mes"}</h2>
          <span className="ath-week-range">{calMode === "month" && monthData ? monthData.monthLabel : calendarWeekLabel}</span>
        </div>
        <div className="ath-week-controls">
          <div className="ath-cal-mode-toggle">
            <button type="button" className={`ath-cal-mode-btn ${calMode === "week" ? "active" : ""}`} onClick={() => setCalMode("week")}>Sem</button>
            <button type="button" className={`ath-cal-mode-btn ${calMode === "month" ? "active" : ""}`} onClick={() => setCalMode("month")}>Mes</button>
          </div>
          <button type="button" className="ath-week-btn" onClick={() => setShowCalendarImport(true)} title="Importar calendario">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button
            type="button"
            className="ath-week-btn"
            title="Ver demo de análisis post-entreno"
            onClick={() => {
              const demo = buildDemoActivity();
              setDemoDetail(demo.detail);
              setDemoPlanned(demo.plannedSession);
              setAnalysisActivity(demo.activity);
            }}
            style={{ fontSize: 11, opacity: 0.7 }}
          >Demo</button>
          <button type="button" className="ath-week-btn" onClick={() => data.setCalWeekOffset(0)}>Hoy</button>
          <button type="button" className="ath-week-btn" onClick={() => data.setCalWeekOffset((o) => o - (calMode === "month" ? 4 : 1))}>‹</button>
          <button type="button" className="ath-week-btn" onClick={() => data.setCalWeekOffset((o) => o + (calMode === "month" ? 4 : 1))}>›</button>
        </div>
      </div>

      {/* Summary bar */}
      {totalSessions > 0 && (
        <div className="ath-week-summary">
          <span>{totalSessions} sesion{totalSessions !== 1 ? "es" : ""}</span>
          {totalMinutes > 0 && <span>{formatDurationMin(totalMinutes)}</span>}
          {(() => {
            const allSessions = data.calendarWeek.flatMap((d) => d.sessions);
            const completedCount = allSessions.filter((s) => s.execution_status === "completed").length;
            if (completedCount > 0) return <span className="ath-week-completed-count">{completedCount}/{allSessions.length} completadas</span>;
            return null;
          })()}
          {zoneDistribution && (
            <div className="ath-zone-bar">
              {zoneDistribution.z1 > 0 && <div className="ath-zone z1" style={{ flex: zoneDistribution.z1 }} title={`Z1: ${zoneDistribution.z1}%`} />}
              {zoneDistribution.z2 > 0 && <div className="ath-zone z2" style={{ flex: zoneDistribution.z2 }} title={`Z2: ${zoneDistribution.z2}%`} />}
              {zoneDistribution.z3 > 0 && <div className="ath-zone z3" style={{ flex: zoneDistribution.z3 }} title={`Z3: ${zoneDistribution.z3}%`} />}
              {zoneDistribution.z4 > 0 && <div className="ath-zone z4" style={{ flex: zoneDistribution.z4 }} title={`Z4: ${zoneDistribution.z4}%`} />}
              {zoneDistribution.z5 > 0 && <div className="ath-zone z5" style={{ flex: zoneDistribution.z5 }} title={`Z5: ${zoneDistribution.z5}%`} />}
            </div>
          )}
        </div>
      )}

      {/* ── Load Spike Warnings (Gabbett 2016, ACWR 0.8-1.3 sweet spot) ── */}
      {loadSpikeWarnings.length > 0 && (
        <div className="ath-load-warnings">
          {loadSpikeWarnings.map((w, i) => (
            <div key={i} className={`ath-load-warning ${w.level}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>{w.message}</span>
              <span className="ath-load-warning-ratio">ACWR: {w.acwr.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {calendarConnected && (
        <div className="ath-cal-connected-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Calendario sincronizado{calendarLoading ? " (cargando...)" : ""}
          <button
            type="button"
            className="ath-cal-disconnect-btn"
            onClick={handleCalendarDisconnect}
            title="Desconectar calendario"
            style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", color: "var(--ath-text-secondary)", fontSize: "0.75rem", textDecoration: "underline" }}
          >
            Desconectar
          </button>
        </div>
      )}

      {/* ── WEEKLY VIEW ── */}
      {calMode === "week" && (<>
        <div className="ath-week-grid">
          {data.calendarWeek.map((day, dayIndex) => {
            const personalEvents = getPersonalEvents(day.iso);
            const isDragOver = dragOverIso === day.iso;
            return (
              <div
                key={day.iso}
                className={`ath-week-day ${day.isToday ? "today" : ""} ${isDragOver ? "drag-over" : ""}`}
                onDragOver={(e) => handleDragOver(e, day.iso)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, day.iso)}
              >
                <div className="ath-week-day-head">
                  <div>
                    <span className="ath-week-day-label">{day.label}</span>
                    <span className={`ath-week-day-num ${day.isToday ? "today" : ""}`}> {day.dayNum}</span>
                  </div>
                  <button
                    type="button"
                    className="ath-week-day-add"
                    onClick={() => openBuilderForDate(day.iso)}
                    title="Añadir entreno"
                  >
                    +
                  </button>
                </div>

                {personalEvents.map((evt, i) => {
                  const timeStr = evt.all_day ? "Todo el dia" : (evt.start ? new Date(evt.start).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "");
                  return (
                    <div key={i} className="ath-week-personal-event google">
                      <span className="ath-week-personal-time">{timeStr}</span>
                      <span className="ath-week-personal-label">{evt.summary}</span>
                    </div>
                  );
                })}

                <div className="ath-week-day-sessions">
                  {day.sessions.map((session) => (
                    <div
                      key={session.id}
                      className={`ath-week-session-slot ${dragSessionId === session.id ? "dragging" : ""}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, session.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="ath-week-time-slot">
                        {editingTimeId === session.id ? (
                          <input
                            type="time"
                            className="ath-week-time-input"
                            defaultValue={timeAssignments[session.id] ?? ""}
                            autoFocus
                            onBlur={(e) => handleTimeChange(session.id, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleTimeChange(session.id, (e.target as HTMLInputElement).value); }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="ath-week-time-btn"
                            onClick={(e) => { e.stopPropagation(); setEditingTimeId(session.id); }}
                          >
                            {timeAssignments[session.id] || "Hora"}
                          </button>
                        )}
                      </div>
                      {/* Click the card to open detail modal */}
                      <div
                        className="ath-week-session-card-wrap"
                        onClick={() => setDetailSession(session)}
                      >
                        <SessionCard session={session} />
                      </div>
                    </div>
                  ))}
                  {/* Completed activities */}
                  {(activitiesByDate[day.iso] ?? []).map((act) => (
                    <div
                      key={`act-${act.provider_activity_id}`}
                      className="ath-week-activity-card"
                      onClick={() => setAnalysisActivity(act)}
                      style={{ borderLeftColor: act.sport_color }}
                    >
                      <div className="ath-week-act-top">
                        <span className="ath-week-act-sport" style={{ color: act.sport_color }}>{act.sport_label}</span>
                        <span className="ath-week-act-check">&#10003;</span>
                      </div>
                      <span className="ath-week-act-name">{act.name}</span>
                      <div className="ath-week-act-stats">
                        <span>{fmtDurShort(act.moving_time_seconds)}</span>
                        {act.distance_m > 0 && <span>{(act.distance_m / 1000).toFixed(1)}km</span>}
                        {act.average_heartrate && <span>{Math.round(act.average_heartrate)} bpm</span>}
                      </div>
                    </div>
                  ))}
                  {day.sessions.length === 0 && !(activitiesByDate[day.iso]?.length) && (
                    <span className="ath-week-day-empty">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── VOLUME SUMMARY ── */}
        {(weekVolumeSummary.totalHours > 0 || weekVolumeSummary.totalTSS > 0) && (
          <div className="ath-week-volume">
            <div className="ath-week-volume__kpis">
              <div className="ath-week-volume__kpi">
                <span className="ath-week-volume__kpi-label">TSS semanal</span>
                <strong className="ath-week-volume__kpi-value">{weekVolumeSummary.totalTSS}</strong>
              </div>
              <div className="ath-week-volume__kpi">
                <span className="ath-week-volume__kpi-label">CTL</span>
                <strong className="ath-week-volume__kpi-value ctl">{weekVolumeSummary.ctl}</strong>
              </div>
              <div className="ath-week-volume__kpi">
                <span className="ath-week-volume__kpi-label">Horas totales</span>
                <strong className="ath-week-volume__kpi-value">{weekVolumeSummary.totalHours.toFixed(1)}h</strong>
              </div>
            </div>

            <div className="ath-week-volume__chart">
              <span className="ath-week-volume__chart-title">Volumen por disciplina</span>
              {Object.entries(weekVolumeSummary.hoursByDisc)
                .sort(([, a], [, b]) => b - a)
                .map(([disc, hours]) => {
                  const pct = (hours / weekVolumeSummary.maxHours) * 100;
                  const color = disc === "running" ? "#e85d75" : disc === "cycling" ? "#4ca4e8" : disc === "swimming" ? "#3dd5c8" : "#999";
                  const label = disc === "running" ? "Running" : disc === "cycling" ? "Ciclismo" : disc === "swimming" ? "Natacion" : disc;
                  return (
                    <div key={disc} className="ath-week-volume__bar-row">
                      <span className="ath-week-volume__bar-label">{label}</span>
                      <div className="ath-week-volume__bar-track">
                        <div className="ath-week-volume__bar-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className="ath-week-volume__bar-value">{hours.toFixed(1)}h</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </>)}

      {/* ── MONTHLY VIEW ── */}
      {calMode === "month" && monthData && (
        <div className="ath-month-grid">
          <div className="ath-month-header-row">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <span key={d} className="ath-month-header-cell">{d}</span>
            ))}
          </div>
          {monthData.weeks.map((week, wi) => (
            <div key={wi} className="ath-month-week-row">
              {week.map((day) => {
                const sessions = sessionsByDate[day.iso] ?? [];
                const acts = activitiesByDate[day.iso] ?? [];
                const hasContent = sessions.length > 0 || acts.length > 0;
                return (
                  <div
                    key={day.iso}
                    className={`ath-month-cell ${day.isCurrentMonth ? "" : "muted"} ${day.isToday ? "today" : ""} ${hasContent ? "clickable" : ""}`}
                    onDragOver={(e) => handleDragOver(e, day.iso)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, day.iso)}
                    onClick={() => hasContent && setMonthDetailIso(day.iso)}
                  >
                    <span className="ath-month-cell-num">{day.dayNum}</span>
                    {(sessions.length > 0 || acts.length > 0) && (
                      <div className="ath-month-cell-items">
                        {sessions.slice(0, 3).map((s, i) => (
                          <div key={`s${i}`} className={`ath-month-mini role-${(s.session_role ?? "support").toLowerCase()}`} title={s.public_label ?? ""}>
                            <span className="ath-month-mini-disc">{discShort(s.discipline)}</span>
                            <span className="ath-month-mini-dose">{sessionMiniLabel(s)}</span>
                          </div>
                        ))}
                        {acts.slice(0, 2).map((a, i) => (
                          <div key={`a${i}`} className="ath-month-mini completed" title={a.name}>
                            <span className="ath-month-mini-disc" style={{ color: a.sport_color }}>{a.sport_label.slice(0, 3).toUpperCase()}</span>
                            <span className="ath-month-mini-dose">{activityMiniLabel(a)}</span>
                            <span className="ath-month-mini-check">&#10003;</span>
                          </div>
                        ))}
                        {(sessions.length + acts.length) > 5 && <span className="ath-month-mini-more">+{sessions.length + acts.length - 5}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Month Day Detail Popover ── */}
      {monthDetailIso && (() => {
        const sessions = sessionsByDate[monthDetailIso] ?? [];
        const acts = activitiesByDate[monthDetailIso] ?? [];
        const dateLabel = new Date(monthDetailIso + "T00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
        return (
          <div className="ath-modal-backdrop" onClick={() => setMonthDetailIso(null)}>
            <div className="ath-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="ath-modal-header">
                <h3 style={{ textTransform: "capitalize" }}>{dateLabel}</h3>
                <button type="button" className="ath-modal-close" onClick={() => setMonthDetailIso(null)}>✕</button>
              </div>
              <div className="ath-modal-body">
                {sessions.length > 0 && (
                  <>
                    <h4 className="ath-pwd-section-title" style={{ marginBottom: 8 }}>Planificado</h4>
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className="ath-month-detail-item planned"
                        onClick={() => { setMonthDetailIso(null); setDetailSession(s); }}
                      >
                        <span className={`ath-session-role ${s.session_role === "KEY" ? "key" : s.session_role === "LONG" ? "long" : "support"}`}>{s.session_role}</span>
                        <span className="ath-month-detail-name">{s.public_label}</span>
                        <span className="ath-month-detail-disc">{disciplineLabel(s.discipline)}</span>
                      </div>
                    ))}
                  </>
                )}
                {acts.length > 0 && (
                  <>
                    <h4 className="ath-pwd-section-title" style={{ marginTop: sessions.length > 0 ? 16 : 0, marginBottom: 8 }}>Completado</h4>
                    {acts.map((a) => (
                      <div
                        key={a.provider_activity_id}
                        className="ath-month-detail-item completed"
                        onClick={() => { setMonthDetailIso(null); setAnalysisActivity(a); }}
                        style={{ borderLeftColor: a.sport_color }}
                      >
                        <span className="ath-month-detail-sport" style={{ color: a.sport_color }}>{a.sport_label}</span>
                        <span className="ath-month-detail-name">{a.name}</span>
                        <div className="ath-month-detail-stats">
                          <span>{fmtDurShort(a.moving_time_seconds)}</span>
                          {a.distance_m > 0 && <span>{(a.distance_m / 1000).toFixed(1)} km</span>}
                          {a.average_heartrate && <span>{Math.round(a.average_heartrate)} bpm</span>}
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {sessions.length === 0 && acts.length === 0 && (
                  <p style={{ color: "var(--ath-text-muted)", fontSize: 13 }}>Sin actividad este día.</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
            onDelete={handleDeleteSession}
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
        // Try to match with a planned session on the same date
        const actDate = localIso(new Date(analysisActivity.started_at));
        const matched = data.plannedSessions.find((s) => s.scheduled_date === actDate && s.discipline === disc);
        const isDemo = analysisActivity.source === "demo";
        const demoLt1: ResolvedTrainingThreshold = { label: "LT1", source: "individual", sourceLabel: "Demo", lactate: 2.0, heartRate: 148, paceSecondsPerKm: 300, powerWatts: null };
        const demoLt2: ResolvedTrainingThreshold = { label: "LT2", source: "individual", sourceLabel: "Demo", lactate: 4.0, heartRate: 165, paceSecondsPerKm: 265, powerWatts: null };
        return (
          <PostWorkoutAnalysis
            activity={analysisActivity}
            plannedSession={isDemo ? demoPlanned : matched}
            lt1={isDemo ? demoLt1 : lt1}
            lt2={isDemo ? demoLt2 : lt2}
            token={data.token}
            athleteId={data.user.athlete_id!}
            onClose={() => { setAnalysisActivity(null); setDemoDetail(null); setDemoPlanned(null); }}
            initialDetail={isDemo ? demoDetail : undefined}
          />
        );
      })()}

      {/* Calendar Import Modal */}
      <CalendarImport
        open={showCalendarImport}
        onClose={() => setShowCalendarImport(false)}
        athleteId={athleteId}
        token={data.token}
        onConnected={handleCalendarConnected}
      />

      {/* Workout Builder Modal */}
      {showWorkoutBuilder && (
        <div className="ath-modal-backdrop" onClick={() => { setShowWorkoutBuilder(false); setBuilderPresetDate(null); }}>
          <div className="ath-modal-content ath-modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="ath-modal-header">
              <h3>Crear entreno</h3>
              <button type="button" className="ath-modal-close" onClick={() => { setShowWorkoutBuilder(false); setBuilderPresetDate(null); }}>✕</button>
            </div>
            <div className="ath-modal-body">
              <WorkoutBuilderInline
                calendarWeek={data.calendarWeek}
                presetDate={builderPresetDate}
                onSave={(session) => {
                  data.addAthleteSession(session);
                  setShowWorkoutBuilder(false);
                  setBuilderPresetDate(null);
                }}
                onClose={() => { setShowWorkoutBuilder(false); setBuilderPresetDate(null); }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Inline Workout Builder ─────────────────────────────────── */
type WorkoutBlock = {
  id: number;
  type: "warmup" | "main" | "intervals" | "recovery" | "cooldown";
  lengthMode: "time" | "distance";
  durationMin: number;
  distanceM: number;
  zoneIdx: number; // index into loaded zones array
  reps: number;
  restMin: number;
  pace?: string;
  powerW?: number;
  hrTarget?: number;
};

type LoadedZone = {
  idx: number;
  label: string;
  color: string;
  hr_lower?: number | null;
  hr_upper?: number | null;
  pace_lower_seconds?: number | null;
  pace_upper_seconds?: number | null;
  power_lower?: number | null;
  power_upper?: number | null;
};

const BLOCK_LABELS: Record<string, string> = {
  warmup: "Calentamiento", main: "Bloque principal", intervals: "Intervalos",
  recovery: "Recuperación", cooldown: "Enfriamiento",
};

const BLOCK_COLORS: Record<string, string> = {
  warmup: "#94A3B8", main: "#10B981", intervals: "#F59E0B",
  recovery: "#8B5CF6", cooldown: "#3B82F6",
};

const DEFAULT_ZONE_COLORS = ["#94A3B8", "#60A5FA", "#10B981", "#84CC16", "#F59E0B", "#EF4444", "#DC2626", "#7C3AED"];

const DEFAULT_ZONES: LoadedZone[] = [
  { idx: 0, label: "REC", color: "#94A3B8" },
  { idx: 1, label: "BASE", color: "#60A5FA" },
  { idx: 2, label: "LT1", color: "#10B981" },
  { idx: 3, label: "SUB-T", color: "#84CC16" },
  { idx: 4, label: "LT2", color: "#F59E0B" },
  { idx: 5, label: "VO2", color: "#EF4444" },
  { idx: 6, label: "ANC", color: "#DC2626" },
];

const DISCIPLINE_OPTIONS: { key: string; label: string; icon: string }[] = [
  { key: "carrera", label: "Carrera", icon: "🏃" },
  { key: "ciclismo", label: "Ciclismo", icon: "🚴" },
  { key: "natación", label: "Natación", icon: "🏊" },
];

function formatPaceSec(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type BuilderProps = {
  calendarWeek: Array<{ date: Date; iso: string; label: string; dayNum: number }>;
  presetDate: string | null;
  onSave: (session: Omit<PlanningPlannedSession, "id">) => void;
  onClose: () => void;
};

function WorkoutBuilderInline({ calendarWeek, presetDate, onSave, onClose }: BuilderProps) {
  const data = useAthleteData();
  const [step, setStep] = useState<"discipline" | "blocks" | "editor" | "done">("discipline");
  const [discipline, setDiscipline] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState(presetDate ?? localIso(new Date()));
  const [blocks, setBlocks] = useState<WorkoutBlock[]>([]);
  const [nextId, setNextId] = useState(1);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [editorWorkout, setEditorWorkout] = useState<WorkoutDefinition | null>(null);
  const [zones, setZones] = useState<LoadedZone[]>(DEFAULT_ZONES);
  const [zonesLoading, setZonesLoading] = useState(false);

  const totalMin = blocks.reduce((sum, b) => {
    if (b.type === "intervals") return sum + b.reps * (b.durationMin + b.restMin);
    return sum + b.durationMin;
  }, 0);

  async function selectDiscipline(d: string) {
    setDiscipline(d);
    setBlocks([
      { id: 1, type: "warmup", lengthMode: "time", durationMin: 10, distanceM: 0, zoneIdx: 0, reps: 1, restMin: 0 },
      { id: 2, type: "cooldown", lengthMode: "time", durationMin: 5, distanceM: 0, zoneIdx: 0, reps: 1, restMin: 0 },
    ]);
    setNextId(3);
    setStep("blocks");

    // Load athlete's real zones
    const discMap: Record<string, string> = { carrera: "running", ciclismo: "ciclismo", natación: "natación" };
    const apiDisc = discMap[d] ?? d;
    setZonesLoading(true);
    try {
      const result = await api.activeTrainingZoneSet(data.token, data.user.athlete_id ?? data.user.id, apiDisc) as TrainingZoneSet;
      if (result?.zones?.length) {
        const loaded: LoadedZone[] = result.zones
          .sort((a: { zone_number: number }, b: { zone_number: number }) => a.zone_number - b.zone_number)
          .map((z: TrainingZoneItem, i: number) => ({
            idx: i,
            label: z.zone_label,
            color: z.zone_color ?? DEFAULT_ZONE_COLORS[i % DEFAULT_ZONE_COLORS.length],
            hr_lower: z.hr_lower, hr_upper: z.hr_upper,
            pace_lower_seconds: z.pace_lower_seconds, pace_upper_seconds: z.pace_upper_seconds,
            power_lower: z.power_lower, power_upper: z.power_upper,
          }));
        setZones(loaded);
      }
    } catch {
      // Keep default zones if API fails
    } finally {
      setZonesLoading(false);
    }
  }

  function addBlock(type: WorkoutBlock["type"]) {
    const defaultZone = type === "intervals" ? Math.min(4, zones.length - 1) : type === "main" ? Math.min(2, zones.length - 1) : 0;
    const newBlock: WorkoutBlock = {
      id: nextId, type, lengthMode: "time",
      durationMin: type === "warmup" || type === "cooldown" ? 10 : type === "intervals" ? 3 : 20,
      distanceM: 0,
      zoneIdx: defaultZone, reps: type === "intervals" ? 4 : 1,
      restMin: type === "intervals" ? 2 : 0,
    };
    // Auto-fill targets from zone
    autoFillFromZone(newBlock, zones[defaultZone], discipline);
    setBlocks((prev) => {
      const ci = prev.findIndex((b) => b.type === "cooldown");
      if (ci >= 0) { const c = [...prev]; c.splice(ci, 0, newBlock); return c; }
      return [...prev, newBlock];
    });
    setNextId((n) => n + 1);
    setShowAddMenu(false);
  }

  function autoFillFromZone(block: WorkoutBlock, zone: LoadedZone | undefined, disc: string | null) {
    if (!zone) return;
    if (disc === "ciclismo" && zone.power_lower) {
      block.powerW = Math.round((zone.power_lower + (zone.power_upper ?? zone.power_lower)) / 2);
    }
    if ((disc === "carrera" || disc === "natación") && zone.pace_lower_seconds) {
      const avgPace = Math.round(((zone.pace_lower_seconds ?? 0) + (zone.pace_upper_seconds ?? zone.pace_lower_seconds ?? 0)) / 2);
      block.pace = formatPaceSec(avgPace);
    }
    if (zone.hr_lower) {
      block.hrTarget = Math.round(((zone.hr_lower ?? 0) + (zone.hr_upper ?? zone.hr_lower ?? 0)) / 2);
    }
  }

  function removeBlock(id: number) { setBlocks((p) => p.filter((b) => b.id !== id)); }

  function updateBlockField(id: number, field: string, value: unknown) {
    setBlocks((p) => p.map((b) => {
      if (b.id !== id) return b;
      const updated = { ...b, [field]: value };
      // When zone changes, auto-fill targets
      if (field === "zoneIdx") {
        const zone = zones[value as number];
        autoFillFromZone(updated, zone, discipline);
      }
      return updated;
    }));
  }

  const zoneToLabel = (idx: number) => zones[idx]?.label ?? `Z${idx + 1}`;
  const zoneToIntensity = (idx: number) => zones[idx]?.label?.toLowerCase().replace(/\s/g, "_") ?? "free";

  function blocksToWorkoutSteps(bks: WorkoutBlock[]): WorkoutStep[] {
    const steps: WorkoutStep[] = [];
    let order = 1;
    for (const b of bks) {
      const zLabel = zoneToLabel(b.zoneIdx);
      const intensity = zoneToIntensity(b.zoneIdx);
      const target: WorkoutTarget = { target_type: b.zoneIdx === 0 ? "easy" : "other", label: zLabel, value_from: null, value_to: null, unit: null };
      // Add target values from zone
      const zone = zones[b.zoneIdx];
      if (zone) {
        if (b.powerW != null) { target.target_type = "power"; target.value_from = zone.power_lower ?? b.powerW; target.value_to = zone.power_upper ?? b.powerW; target.unit = "watts"; }
        else if (b.pace) { target.target_type = "pace"; target.value_from = zone.pace_lower_seconds ?? null; target.value_to = zone.pace_upper_seconds ?? null; target.unit = discipline === "natación" ? "s/100m" : "s/km"; }
        else if (zone.hr_lower) { target.target_type = "heart_rate"; target.value_from = zone.hr_lower; target.value_to = zone.hr_upper ?? null; target.unit = "bpm"; }
      }

      const lenType = b.lengthMode === "distance" ? "distance" : "time";
      const lenVal = b.lengthMode === "distance" ? b.distanceM : b.durationMin * 60;

      if (b.type === "intervals" && b.reps > 1) {
        const children: WorkoutStep[] = [
          { order: 1, step_type: "interval", length_type: lenType, length_value: lenVal, target, intensity_label: intensity, instructions: null, repeat_count: null, children: [] },
          { order: 2, step_type: "recovery", length_type: "time", length_value: b.restMin * 60, target: { target_type: "easy", label: zones[0]?.label ?? "REC", value_from: null, value_to: null, unit: null }, intensity_label: "easy", instructions: null, repeat_count: null, children: [] },
        ];
        steps.push({ order: order++, step_type: "repeat", length_type: "time", length_value: null, target: null, intensity_label: null, instructions: null, repeat_count: b.reps, children });
      } else {
        const stepType = b.type === "warmup" ? "warmup" : b.type === "cooldown" ? "cooldown" : b.type === "recovery" ? "recovery" : "steady";
        steps.push({ order: order++, step_type: stepType, length_type: lenType, length_value: lenVal, target, intensity_label: intensity, instructions: null, repeat_count: null, children: [] });
      }
    }
    return steps;
  }

  function handleGoToEditor() {
    if (!discipline || blocks.length === 0) return;
    const discMap: Record<string, string> = { carrera: "running", ciclismo: "ciclismo", natación: "natación" };
    const discLabel = DISCIPLINE_OPTIONS.find((d) => d.key === discipline);
    const label = title || `${discLabel?.label ?? discipline} — ${totalMin} min`;
    const workoutSteps = blocksToWorkoutSteps(blocks);
    setEditorWorkout({
      sport: discMap[discipline] ?? discipline,
      title: label,
      steps: workoutSteps,
      notes: [],
      source_payload: {},
    });
    setStep("editor");
  }

  function handleEditorSave(workout: WorkoutDefinition) {
    if (!discipline) return;
    const discMap: Record<string, string> = { carrera: "running", ciclismo: "ciclismo", natación: "natación" };
    const blockDesc = blocks.map((b) => {
      const zLabel = zoneToLabel(b.zoneIdx);
      const base = b.type === "intervals" ? `${b.reps}×${b.durationMin}' ${zLabel}` : `${BLOCK_LABELS[b.type]} ${b.durationMin}' ${zLabel}`;
      const extras: string[] = [];
      if (b.pace) extras.push(`@${b.pace}`);
      if (b.powerW != null) extras.push(`${b.powerW}W`);
      if (b.lengthMode === "distance" && b.distanceM > 0) extras.push(b.distanceM >= 1000 ? `${(b.distanceM / 1000).toFixed(1)}km` : `${b.distanceM}m`);
      return extras.length > 0 ? `${base} (${extras.join(", ")})` : base;
    }).join(" + ");
    onSave({
      focus_block_id: 0, scheduled_date: scheduledDate,
      discipline: discMap[discipline] ?? discipline, week_index: 0, day_offset: 0,
      session_role: "SUPPORT", session_family: "athlete_created",
      public_label: workout.title, objective: `Entreno creado por atleta: ${blockDesc}`,
      dose_prescription: blockDesc, confidence: 1, status: "athlete_created", bla_check: false,
      structured_workout_payload: workout,
      payload: { total_duration_min: totalMin, blocks: blocks.map((b) => ({ type: b.type, durationMin: b.durationMin, zone: b.zoneIdx, zoneName: zoneToLabel(b.zoneIdx), reps: b.reps, restMin: b.restMin, ...(b.pace ? { pace: b.pace } : {}), ...(b.distanceM ? { distanceM: b.distanceM } : {}), ...(b.powerW != null ? { powerW: b.powerW } : {}), ...(b.hrTarget != null ? { hrTarget: b.hrTarget } : {}) })), source: "athlete_builder" },
    });
    setStep("done");
  }

  function handleSaveDirect() {
    if (!discipline || blocks.length === 0) return;
    const workout: WorkoutDefinition = {
      sport: ({ carrera: "running", ciclismo: "ciclismo", natación: "natación" } as Record<string, string>)[discipline] ?? discipline,
      title: title || `${DISCIPLINE_OPTIONS.find((d) => d.key === discipline)?.label ?? discipline} — ${totalMin} min`,
      steps: blocksToWorkoutSteps(blocks),
      notes: [],
      source_payload: {},
    };
    handleEditorSave(workout);
  }

  if (step === "discipline") {
    return (
      <div className="ath-builder-step-discipline">
        <p className="ath-builder-step-subtitle">Elige la disciplina del entreno</p>
        <div className="ath-builder-discipline-cards">
          {DISCIPLINE_OPTIONS.map((d) => (
            <button key={d.key} type="button" className="ath-builder-disc-card" onClick={() => selectDiscipline(d.key)}>
              <span className="ath-builder-disc-card-icon">{d.icon}</span>
              <span className="ath-builder-disc-card-label">{d.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === "editor" && editorWorkout) {
    const discMap: Record<string, string> = { carrera: "running", ciclismo: "ciclismo", natación: "natación" };
    return (
      <div className="ath-builder-editor-step">
        <WorkoutStepEditor
          workout={editorWorkout}
          onSave={handleEditorSave}
          onCancel={() => setStep("blocks")}
          discipline={discMap[discipline ?? ""] ?? discipline ?? undefined}
        />
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="ath-builder-saved">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--ath-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 8 10 16 7 13"/></svg>
        <p>Entreno añadido al calendario</p>
        <span>Tu entrenador lo verá como sesión extra</span>
        <button type="button" className="ath-builder-done-btn" onClick={onClose}>Cerrar</button>
      </div>
    );
  }

  const discLabelObj = DISCIPLINE_OPTIONS.find((d) => d.key === discipline);
  const isRunOrSwim = discipline === "carrera" || discipline === "natación";
  const isCycling = discipline === "ciclismo";
  const paceUnit = discipline === "natación" ? "/100m" : "/km";

  return (
    <div className="ath-builder">
      <div className="ath-builder-top-bar">
        <button type="button" className="ath-builder-back-btn" onClick={() => setStep("discipline")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="ath-builder-disc-badge">{discLabelObj?.icon} {discLabelObj?.label}</span>
        {zonesLoading && <span className="ath-builder-zones-loading">Cargando zonas...</span>}
      </div>

      <div className="ath-builder-date-row">
        <label className="ath-builder-field">
          <span>Fecha</span>
          <div className="ath-builder-date-options">
            {calendarWeek.slice(0, 7).map((day) => (
              <button key={day.iso} type="button" className={`ath-builder-date-chip ${scheduledDate === day.iso ? "active" : ""}`} onClick={() => setScheduledDate(day.iso)}>
                <span className="ath-builder-date-chip-day">{day.label}</span>
                <span className="ath-builder-date-chip-num">{day.dayNum}</span>
              </button>
            ))}
          </div>
        </label>
      </div>

      <input type="text" className="ath-builder-title-input" placeholder="Nombre del entreno (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} />

      <div className="ath-builder-duration">Duración total: <strong>{totalMin} min</strong></div>

      <div className="ath-builder-blocks">
        {blocks.map((block) => {
          const zone = zones[block.zoneIdx];
          const zoneColor = zone?.color ?? "#94A3B8";

          return (
            <div key={block.id} className="ath-builder-block" style={{ borderLeftColor: BLOCK_COLORS[block.type] ?? "var(--ath-text-muted)" }}>
              <div className="ath-builder-block-head">
                <span className="ath-builder-block-type-badge" style={{ background: BLOCK_COLORS[block.type] }}>{BLOCK_LABELS[block.type]}</span>
                <span className="ath-builder-block-duration-label">
                  {block.type === "intervals"
                    ? `${block.reps}×${block.lengthMode === "distance" ? `${block.distanceM >= 1000 ? `${(block.distanceM / 1000).toFixed(1)}km` : `${block.distanceM}m`}` : `${block.durationMin}'`} + ${block.restMin}' desc`
                    : block.lengthMode === "distance" ? `${block.distanceM >= 1000 ? `${(block.distanceM / 1000).toFixed(1)}km` : `${block.distanceM}m`}` : `${block.durationMin} min`}
                </span>
                <button type="button" className="ath-builder-block-remove" onClick={() => removeBlock(block.id)} title="Eliminar">✕</button>
              </div>

              <div className="ath-builder-block-fields">
                {/* Length mode toggle + inputs */}
                <div className="ath-builder-length-row">
                  <div className="ath-builder-length-toggle">
                    <button type="button" className={`ath-builder-len-btn ${block.lengthMode === "time" ? "active" : ""}`} onClick={() => updateBlockField(block.id, "lengthMode", "time")}>Tiempo</button>
                    <button type="button" className={`ath-builder-len-btn ${block.lengthMode === "distance" ? "active" : ""}`} onClick={() => updateBlockField(block.id, "lengthMode", "distance")}>Distancia</button>
                  </div>
                  {block.type === "intervals" ? (
                    <div className="ath-builder-interval-row">
                      <label className="ath-builder-field"><span>Reps</span><input type="number" min={1} max={30} value={block.reps} onChange={(e) => updateBlockField(block.id, "reps", parseInt(e.target.value) || 1)} /></label>
                      <span className="ath-builder-interval-x">×</span>
                      {block.lengthMode === "time" ? (
                        <label className="ath-builder-field"><span>Min</span><input type="number" min={1} max={60} value={block.durationMin} onChange={(e) => updateBlockField(block.id, "durationMin", parseInt(e.target.value) || 1)} /></label>
                      ) : (
                        <label className="ath-builder-field"><span>{discipline === "natación" ? "m" : "km"}</span><input type="number" min={0} step={discipline === "natación" ? 25 : 0.1} value={discipline === "natación" ? block.distanceM : block.distanceM / 1000 || ""} onChange={(e) => { const v = parseFloat(e.target.value); updateBlockField(block.id, "distanceM", isNaN(v) ? 0 : discipline === "natación" ? v : v * 1000); }} /></label>
                      )}
                      <span className="ath-builder-interval-plus">+</span>
                      <label className="ath-builder-field"><span>Desc</span><input type="number" min={0} max={30} value={block.restMin} onChange={(e) => updateBlockField(block.id, "restMin", parseInt(e.target.value) || 0)} /></label>
                    </div>
                  ) : block.lengthMode === "time" ? (
                    <label className="ath-builder-field"><span>Min</span><input type="number" min={1} max={240} value={block.durationMin} onChange={(e) => updateBlockField(block.id, "durationMin", parseInt(e.target.value) || 1)} /></label>
                  ) : (
                    <label className="ath-builder-field"><span>{discipline === "natación" ? "m" : "km"}</span><input type="number" min={0} step={discipline === "natación" ? 25 : 0.1} value={discipline === "natación" ? block.distanceM : block.distanceM / 1000 || ""} onChange={(e) => { const v = parseFloat(e.target.value); updateBlockField(block.id, "distanceM", isNaN(v) ? 0 : discipline === "natación" ? v : v * 1000); }} /></label>
                  )}
                </div>

                {/* Zone chips — real athlete zones */}
                <div className="ath-builder-zones">
                  <span className="ath-builder-zones-label">Zona</span>
                  <div className="ath-builder-zone-chips">
                    {zones.map((z) => (
                      <button key={z.idx} type="button" className={`ath-builder-zone-chip ${block.zoneIdx === z.idx ? "active" : ""}`} style={{ borderColor: z.color, color: block.zoneIdx === z.idx ? "#fff" : z.color, background: block.zoneIdx === z.idx ? z.color : "transparent" }} onClick={() => updateBlockField(block.id, "zoneIdx", z.idx)}>{z.label}</button>
                    ))}
                  </div>
                </div>

                {/* Auto-filled targets from zone */}
                <div className="ath-builder-targets">
                  {isRunOrSwim && (
                    <label className="ath-builder-field">
                      <span>Ritmo ({paceUnit})</span>
                      <input type="text" placeholder={discipline === "natación" ? "1:45" : "4:30"} value={block.pace ?? ""} onChange={(e) => updateBlockField(block.id, "pace", e.target.value || undefined)} />
                      {zone?.pace_lower_seconds && zone?.pace_upper_seconds && (
                        <small className="ath-builder-zone-hint">{formatPaceSec(zone.pace_lower_seconds)} – {formatPaceSec(zone.pace_upper_seconds)}</small>
                      )}
                    </label>
                  )}
                  {isCycling && (
                    <label className="ath-builder-field">
                      <span>Potencia (W)</span>
                      <input type="number" min={0} max={2000} placeholder="220" value={block.powerW ?? ""} onChange={(e) => { const v = parseInt(e.target.value); updateBlockField(block.id, "powerW", isNaN(v) ? undefined : v); }} />
                      {zone?.power_lower && zone?.power_upper && (
                        <small className="ath-builder-zone-hint">{zone.power_lower} – {zone.power_upper} W</small>
                      )}
                    </label>
                  )}
                  {zone?.hr_lower && (
                    <label className="ath-builder-field">
                      <span>FC (bpm)</span>
                      <input type="number" min={0} max={250} placeholder="145" value={block.hrTarget ?? ""} onChange={(e) => { const v = parseInt(e.target.value); updateBlockField(block.id, "hrTarget", isNaN(v) ? undefined : v); }} />
                      <small className="ath-builder-zone-hint">{zone.hr_lower} – {zone.hr_upper ?? "?"} bpm</small>
                    </label>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="ath-builder-add-wrap">
        <button type="button" className="ath-builder-add-btn" onClick={() => setShowAddMenu(!showAddMenu)}>+</button>
        {showAddMenu && (
          <div className="ath-builder-add-menu">
            {(["warmup", "main", "intervals", "recovery", "cooldown"] as const).map((type) => (
              <button key={type} type="button" className="ath-builder-add-menu-item" onClick={() => addBlock(type)}>
                <span className="ath-builder-add-menu-dot" style={{ background: BLOCK_COLORS[type] }} />{BLOCK_LABELS[type]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ath-builder-actions">
        <button type="button" className="ath-builder-save" disabled={blocks.length === 0} onClick={handleSaveDirect}>Guardar entreno</button>
        <button type="button" className="ath-builder-save-secondary" disabled={blocks.length === 0} onClick={handleGoToEditor}>Editar estructura avanzada</button>
      </div>
    </div>
  );
}
