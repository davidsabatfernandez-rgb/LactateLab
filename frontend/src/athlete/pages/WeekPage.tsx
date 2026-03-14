import { useMemo, useState } from "react";
import { useAthleteData } from "../context/AthleteDataContext";
import { SessionCard } from "../components/SessionCard";
import { formatDurationMin, disciplineLabel } from "../utils/formatters";
import { buildWeeklyVolumeByDiscipline, allSessionsDeduped } from "../utils/training";
import { detectLoadSpikes, type LoadSpikeWarning } from "../utils/readiness";
import type { PlanningPlannedSession } from "../../types";

type TimeAssignment = Record<number, string>;
type CalendarMode = "week" | "month";

const MOCK_PERSONAL_EVENTS: Array<{ dayOffset: number; time: string; label: string; source: "google" | "apple" }> = [
  { dayOffset: 1, time: "09:00", label: "Reunión trabajo", source: "google" },
  { dayOffset: 3, time: "13:00", label: "Comida equipo", source: "google" },
  { dayOffset: 5, time: "18:00", label: "Cena familiar", source: "apple" },
];

export function WeekPage() {
  const data = useAthleteData();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [timeAssignments, setTimeAssignments] = useState<TimeAssignment>({});
  const [showCalendarImport, setShowCalendarImport] = useState(false);
  const [showWorkoutBuilder, setShowWorkoutBuilder] = useState(false);
  const [builderPresetDate, setBuilderPresetDate] = useState<string | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [editingTimeId, setEditingTimeId] = useState<number | null>(null);
  const [calMode, setCalMode] = useState<CalendarMode>("week");

  // Session detail modal
  const [detailSession, setDetailSession] = useState<PlanningPlannedSession | null>(null);

  // Drag state
  const [dragSessionId, setDragSessionId] = useState<number | null>(null);
  const [dragOverIso, setDragOverIso] = useState<string | null>(null);

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
      days.push({ date: d, dayNum: d.getDate(), isCurrentMonth: false, iso: d.toISOString().slice(0, 10), isToday: false });
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dt = new Date(year, month, d);
      const iso = dt.toISOString().slice(0, 10);
      days.push({ date: dt, dayNum: d, isCurrentMonth: true, iso, isToday: iso === todayIso });
    }
    while (days.length % 7 !== 0) {
      const dt = new Date(year, month + 1, days.length - lastDay.getDate() - startDow + 1);
      days.push({ date: dt, dayNum: dt.getDate(), isCurrentMonth: false, iso: dt.toISOString().slice(0, 10), isToday: false });
    }
    const weeks: typeof days[] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return { weeks, monthLabel: firstDay.toLocaleDateString("es-ES", { month: "long", year: "numeric" }) };
  }, [calMode, data.calendarWeek]);

  const sessionsByDate = useMemo(() => {
    const map: Record<string, PlanningPlannedSession[]> = {};
    for (const day of data.calendarWeek) map[day.iso] = day.sessions;
    return map;
  }, [data.calendarWeek]);

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

  function getPersonalEvents(dayIndex: number) {
    if (!calendarConnected) return [];
    return MOCK_PERSONAL_EVENTS.filter((e) => e.dayOffset === dayIndex);
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
          <button type="button" className="ath-week-btn" onClick={() => data.setCalWeekOffset(0)}>Hoy</button>
          <button type="button" className="ath-week-btn" onClick={() => data.setCalWeekOffset((o) => o - (calMode === "month" ? 4 : 1))}>‹</button>
          <button type="button" className="ath-week-btn" onClick={() => data.setCalWeekOffset((o) => o + (calMode === "month" ? 4 : 1))}>›</button>
        </div>
      </div>

      {/* Summary bar */}
      {totalSessions > 0 && (
        <div className="ath-week-summary">
          <span>{totalSessions} sesión{totalSessions !== 1 ? "es" : ""}</span>
          {totalMinutes > 0 && <span>{formatDurationMin(totalMinutes)}</span>}
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
          Calendario sincronizado
        </div>
      )}

      {/* ── WEEKLY VIEW ── */}
      {calMode === "week" && (
        <div className="ath-week-grid">
          {data.calendarWeek.map((day, dayIndex) => {
            const personalEvents = getPersonalEvents(dayIndex);
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

                {personalEvents.map((evt, i) => (
                  <div key={i} className={`ath-week-personal-event ${evt.source}`}>
                    <span className="ath-week-personal-time">{evt.time}</span>
                    <span className="ath-week-personal-label">{evt.label}</span>
                  </div>
                ))}

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
                  {day.sessions.length === 0 && (
                    <span className="ath-week-day-empty">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
                return (
                  <div
                    key={day.iso}
                    className={`ath-month-cell ${day.isCurrentMonth ? "" : "muted"} ${day.isToday ? "today" : ""}`}
                    onDragOver={(e) => handleDragOver(e, day.iso)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, day.iso)}
                  >
                    <span className="ath-month-cell-num">{day.dayNum}</span>
                    {sessions.length > 0 && (
                      <div className="ath-month-cell-dots">
                        {sessions.slice(0, 3).map((s, i) => (
                          <span key={i} className={`ath-month-dot role-${(s.session_role ?? "support").toLowerCase()}`} title={s.public_label ?? s.session_role ?? ""} />
                        ))}
                        {sessions.length > 3 && <span className="ath-month-dot-more">+{sessions.length - 3}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Session Detail Modal ── */}
      {detailSession && (
        <div className="ath-modal-backdrop" onClick={() => setDetailSession(null)}>
          <div className="ath-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="ath-modal-header">
              <h3>{detailSession.public_label}</h3>
              <button type="button" className="ath-modal-close" onClick={() => setDetailSession(null)}>✕</button>
            </div>
            <div className="ath-modal-body">
              <div className="ath-detail-meta">
                <span className={`ath-session-role ${detailSession.session_role === "KEY" ? "key" : detailSession.session_role === "LONG" ? "long" : "support"}`}>
                  {detailSession.session_role}
                </span>
                <span className="ath-detail-disc">{disciplineLabel(detailSession.discipline)}</span>
                <span className="ath-detail-date">{detailSession.scheduled_date}</span>
                {typeof detailSession.payload?.total_duration_min === "number" && (
                  <span className="ath-detail-dur">{formatDurationMin(detailSession.payload.total_duration_min as number)}</span>
                )}
              </div>

              {detailSession.dose_prescription && (
                <div className="ath-detail-section">
                  <small>Prescripción</small>
                  <p>{detailSession.dose_prescription}</p>
                </div>
              )}

              {detailSession.objective && (
                <div className="ath-detail-section">
                  <small>Objetivo</small>
                  <p>{detailSession.objective}</p>
                </div>
              )}

              {detailSession.dose_guidance && (
                <div className="ath-detail-section">
                  <small>Guía</small>
                  <p>{detailSession.dose_guidance}</p>
                </div>
              )}

              {detailSession.coach_note && (
                <div className="ath-detail-section">
                  <small>Nota del coach</small>
                  <p>{detailSession.coach_note}</p>
                </div>
              )}

              {detailSession.expected_signal && (
                <div className="ath-detail-section">
                  <small>Señal esperada</small>
                  <p>{detailSession.expected_signal}</p>
                </div>
              )}

              {/* Blocks if athlete-created */}
              {Array.isArray(detailSession.payload?.blocks) && (
                <div className="ath-detail-section">
                  <small>Bloques</small>
                  <div className="ath-detail-blocks">
                    {(detailSession.payload!.blocks as Array<{ type: string; durationMin: number; zone: number; reps: number; restMin: number }>).map((b, i) => (
                      <div key={i} className="ath-detail-block-row">
                        <span className="ath-detail-block-type">{b.type}</span>
                        <span>{b.type === "intervals" ? `${b.reps}×${b.durationMin}' Z${b.zone} +${b.restMin}' desc` : `${b.durationMin}' Z${b.zone}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="ath-detail-actions">
                <button
                  type="button"
                  className="ath-detail-delete-btn"
                  onClick={() => handleDeleteSession(detailSession.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  Eliminar entreno
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Import Modal */}
      {showCalendarImport && (
        <div className="ath-modal-backdrop" onClick={() => setShowCalendarImport(false)}>
          <div className="ath-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="ath-modal-header">
              <h3>Importar calendario</h3>
              <button type="button" className="ath-modal-close" onClick={() => setShowCalendarImport(false)}>✕</button>
            </div>
            <div className="ath-modal-body">
              <p className="ath-modal-desc">Sincroniza tu calendario personal para ver tus eventos junto a los entrenos.</p>
              <button type="button" className="ath-cal-option" onClick={() => { setCalendarConnected(true); setShowCalendarImport(false); }}>
                <div className="ath-cal-option-icon google">G</div>
                <div className="ath-cal-option-info"><strong>Google Calendar</strong><span>Sincronizar eventos de Google</span></div>
                <span className="ath-cal-option-action">Conectar</span>
              </button>
              <button type="button" className="ath-cal-option" onClick={() => { setCalendarConnected(true); setShowCalendarImport(false); }}>
                <div className="ath-cal-option-icon apple">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                </div>
                <div className="ath-cal-option-info"><strong>Apple Calendar</strong><span>Sincronizar eventos de iPhone</span></div>
                <span className="ath-cal-option-action">Conectar</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
  durationMin: number;
  zone: number;
  reps: number;
  restMin: number;
};

const BLOCK_LABELS: Record<string, string> = {
  warmup: "Calentamiento", main: "Bloque principal", intervals: "Intervalos",
  recovery: "Recuperación", cooldown: "Enfriamiento",
};

const BLOCK_COLORS: Record<string, string> = {
  warmup: "#94A3B8", main: "#10B981", intervals: "#F59E0B",
  recovery: "#8B5CF6", cooldown: "#3B82F6",
};

const ZONE_COLORS = ["", "#94A3B8", "#10B981", "#F59E0B", "#EF4444", "#DC2626"];

const DISCIPLINE_OPTIONS: { key: string; label: string; icon: string }[] = [
  { key: "carrera", label: "Carrera", icon: "🏃" },
  { key: "ciclismo", label: "Ciclismo", icon: "🚴" },
  { key: "natación", label: "Natación", icon: "🏊" },
];

type BuilderProps = {
  calendarWeek: Array<{ date: Date; iso: string; label: string; dayNum: number }>;
  presetDate: string | null;
  onSave: (session: Omit<PlanningPlannedSession, "id">) => void;
  onClose: () => void;
};

function WorkoutBuilderInline({ calendarWeek, presetDate, onSave, onClose }: BuilderProps) {
  const [step, setStep] = useState<"discipline" | "blocks" | "done">("discipline");
  const [discipline, setDiscipline] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState(presetDate ?? new Date().toISOString().slice(0, 10));
  const [blocks, setBlocks] = useState<WorkoutBlock[]>([]);
  const [nextId, setNextId] = useState(1);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const totalMin = blocks.reduce((sum, b) => {
    if (b.type === "intervals") return sum + b.reps * (b.durationMin + b.restMin);
    return sum + b.durationMin;
  }, 0);

  function selectDiscipline(d: string) {
    setDiscipline(d);
    setBlocks([
      { id: 1, type: "warmup", durationMin: 10, zone: 1, reps: 1, restMin: 0 },
      { id: 2, type: "cooldown", durationMin: 5, zone: 1, reps: 1, restMin: 0 },
    ]);
    setNextId(3);
    setStep("blocks");
  }

  function addBlock(type: WorkoutBlock["type"]) {
    const newBlock: WorkoutBlock = {
      id: nextId, type,
      durationMin: type === "warmup" || type === "cooldown" ? 10 : type === "intervals" ? 3 : 20,
      zone: type === "intervals" ? 4 : 2, reps: type === "intervals" ? 4 : 1,
      restMin: type === "intervals" ? 2 : 0,
    };
    setBlocks((prev) => {
      const ci = prev.findIndex((b) => b.type === "cooldown");
      if (ci >= 0) { const c = [...prev]; c.splice(ci, 0, newBlock); return c; }
      return [...prev, newBlock];
    });
    setNextId((n) => n + 1);
    setShowAddMenu(false);
  }

  function removeBlock(id: number) { setBlocks((p) => p.filter((b) => b.id !== id)); }
  function updateBlock(id: number, field: keyof WorkoutBlock, value: number) {
    setBlocks((p) => p.map((b) => b.id === id ? { ...b, [field]: value } : b));
  }

  function handleSave() {
    if (!discipline || blocks.length === 0) return;
    const discMap: Record<string, string> = { carrera: "running", ciclismo: "ciclismo", natación: "natación" };
    const discLabel = DISCIPLINE_OPTIONS.find((d) => d.key === discipline);
    const label = title || `${discLabel?.label ?? discipline} — ${totalMin} min`;
    const blockDesc = blocks.map((b) => b.type === "intervals" ? `${b.reps}×${b.durationMin}' Z${b.zone}` : `${BLOCK_LABELS[b.type]} ${b.durationMin}' Z${b.zone}`).join(" + ");
    onSave({
      focus_block_id: 0, scheduled_date: scheduledDate,
      discipline: discMap[discipline] ?? discipline, week_index: 0, day_offset: 0,
      session_role: "SUPPORT", session_family: "athlete_created",
      public_label: label, objective: `Entreno creado por atleta: ${blockDesc}`,
      dose_prescription: blockDesc, confidence: 1, status: "athlete_created", bla_check: false,
      payload: { total_duration_min: totalMin, blocks: blocks.map((b) => ({ type: b.type, durationMin: b.durationMin, zone: b.zone, reps: b.reps, restMin: b.restMin })), source: "athlete_builder" },
    });
    setStep("done");
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

  return (
    <div className="ath-builder">
      <div className="ath-builder-top-bar">
        <button type="button" className="ath-builder-back-btn" onClick={() => setStep("discipline")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="ath-builder-disc-badge">{discLabelObj?.icon} {discLabelObj?.label}</span>
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
        {blocks.map((block) => (
          <div key={block.id} className="ath-builder-block" style={{ borderLeftColor: BLOCK_COLORS[block.type] ?? "var(--ath-text-muted)" }}>
            <div className="ath-builder-block-head">
              <span className="ath-builder-block-type-badge" style={{ background: BLOCK_COLORS[block.type] }}>{BLOCK_LABELS[block.type]}</span>
              <span className="ath-builder-block-duration-label">{block.type === "intervals" ? `${block.reps}×${block.durationMin}' + ${block.restMin}' desc` : `${block.durationMin} min`}</span>
              <button type="button" className="ath-builder-block-remove" onClick={() => removeBlock(block.id)} title="Eliminar">✕</button>
            </div>
            <div className="ath-builder-block-fields">
              {block.type === "intervals" ? (
                <div className="ath-builder-interval-row">
                  <label className="ath-builder-field"><span>Reps</span><input type="number" min={1} max={30} value={block.reps} onChange={(e) => updateBlock(block.id, "reps", parseInt(e.target.value) || 1)} /></label>
                  <span className="ath-builder-interval-x">×</span>
                  <label className="ath-builder-field"><span>Min</span><input type="number" min={1} max={60} value={block.durationMin} onChange={(e) => updateBlock(block.id, "durationMin", parseInt(e.target.value) || 1)} /></label>
                  <span className="ath-builder-interval-plus">+</span>
                  <label className="ath-builder-field"><span>Desc</span><input type="number" min={0} max={30} value={block.restMin} onChange={(e) => updateBlock(block.id, "restMin", parseInt(e.target.value) || 0)} /></label>
                </div>
              ) : (
                <label className="ath-builder-field"><span>Min</span><input type="number" min={1} max={240} value={block.durationMin} onChange={(e) => updateBlock(block.id, "durationMin", parseInt(e.target.value) || 1)} /></label>
              )}
              <div className="ath-builder-zones">
                <span className="ath-builder-zones-label">Zona</span>
                <div className="ath-builder-zone-chips">
                  {[1, 2, 3, 4, 5].map((z) => (
                    <button key={z} type="button" className={`ath-builder-zone-chip ${block.zone === z ? "active" : ""}`} style={{ borderColor: ZONE_COLORS[z], color: block.zone === z ? "#fff" : ZONE_COLORS[z], background: block.zone === z ? ZONE_COLORS[z] : "transparent" }} onClick={() => updateBlock(block.id, "zone", z)}>Z{z}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
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

      <button type="button" className="ath-builder-save" disabled={blocks.length === 0} onClick={handleSave}>Guardar entreno</button>
    </div>
  );
}
