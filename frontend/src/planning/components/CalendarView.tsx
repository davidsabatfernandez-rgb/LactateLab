import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

import type { AthleteAnalysis } from "../../types";
import type { CalendarEntry, CalendarMonthSection } from "../types";
import {
  addDays,
  buildCalendarWeekSnapshot,
  compactPlanningSourceTitle,
  dateValue,
  dayNameShort,
  disciplineLabel,
  firstName,
  formatDistanceCompact,
  formatMinutesCompact,
  isoDateFromToday,
  monthDayLabel,
  monthHeading,
  planningDisciplineAccent,
  planningPublishStatusMeta,
  startOfWeek,
  weekHeading,
} from "../utils";
import { api } from "../../lib/api";
import type { PlanningWorkoutTemplate } from "../../types";
import {
  compactSessionInfo,
  computeCalendarViolations,
  dayHasFreshnessConflict,
  garminStatusBadge,
  garminStatusInfo,
  sessionHasSpacingViolation,
  sessionToneBorderColor,
  sessionToneBackgroundTint,
  sessionToneFromEntry,
  type CalendarViolation,
} from "../utils-workout";
import type { PlanningCalendarSource } from "../types";
import type { CalendarNavigationRefs } from "../context/useCalendarNavigation";
import { DayDetailPanel } from "./DayDetailPanel";

type CalendarViewProps = {
  calendarVisualMode: "month" | "week";
  calendarMonth: string;
  selectedCalendarDate: string | null;
  selectedCalendarSource: PlanningCalendarSource;
  selectedWeekStart: string;
  selectedWeekEnd: string;
  continuousMonthSections: CalendarMonthSection[];
  continuousWeekStarts: string[];
  sessionsByDate: Map<string, CalendarEntry[]>;
  athleteAnalysis: AthleteAnalysis | null;
  selectedDiscipline: string;
  overview: { athlete_name: string } | null;
  calendarToolbarHeading: string;
  calendarToolbarSubheading: string;
  dayPanelOpen: boolean;
  workoutLibrary?: PlanningWorkoutTemplate[];
  athleteId?: string | null;
  token?: string;
  onBatchGarminComplete?: () => void;
  // Navigation
  jumpCalendarToToday: () => void;
  shiftCalendarBackward: () => void;
  shiftCalendarForward: () => void;
  handleContinuousWeekScroll: () => void;
  handleContinuousMonthScroll: () => void;
  // Actions
  onSetCalendarVisualMode: (mode: "month" | "week") => void;
  onSetSelectedCalendarDate: (date: string | null) => void;
  onSetDayPanelOpen: (open: boolean) => void;
  openCalendarSessionDetail: (session: CalendarEntry) => void;
  openCalendarQuickAdd: (date: string) => void;
  onCopyWeek?: () => void;
  onMoveSession?: (sessionId: number, newDate: string) => void;
  // Refs
  calendarWeekScrollerRef: CalendarNavigationRefs["calendarWeekScrollerRef"];
  calendarWeekSectionRefs: CalendarNavigationRefs["calendarWeekSectionRefs"];
  calendarMonthScrollerRef: CalendarNavigationRefs["calendarMonthScrollerRef"];
  calendarMonthSectionRefs: CalendarNavigationRefs["calendarMonthSectionRefs"];
};

export function CalendarView({
  calendarVisualMode,
  calendarMonth,
  selectedCalendarDate,
  selectedCalendarSource,
  selectedWeekStart,
  selectedWeekEnd,
  continuousMonthSections,
  continuousWeekStarts,
  sessionsByDate,
  athleteAnalysis,
  selectedDiscipline,
  overview,
  calendarToolbarHeading,
  calendarToolbarSubheading,
  dayPanelOpen,
  workoutLibrary,
  athleteId,
  token,
  onBatchGarminComplete,
  jumpCalendarToToday,
  shiftCalendarBackward,
  shiftCalendarForward,
  handleContinuousWeekScroll,
  handleContinuousMonthScroll,
  onSetCalendarVisualMode,
  onSetSelectedCalendarDate,
  onSetDayPanelOpen,
  openCalendarSessionDetail,
  openCalendarQuickAdd,
  onCopyWeek,
  onMoveSession,
  calendarWeekScrollerRef,
  calendarWeekSectionRefs,
  calendarMonthScrollerRef,
  calendarMonthSectionRefs,
}: CalendarViewProps) {
  const handleDayClick = (date: string | null) => {
    onSetSelectedCalendarDate(date);
    if (date) onSetDayPanelOpen(true);
  };

  const violations = useMemo(
    () => workoutLibrary ? computeCalendarViolations(sessionsByDate, workoutLibrary) : [],
    [sessionsByDate, workoutLibrary],
  );

  const daySessions = selectedCalendarDate ? sessionsByDate.get(selectedCalendarDate) ?? [] : [];

  return (
    <>
      <div className="planning-calendar-app-toolbar">
        <div className="planning-calendar-toolbar-left">
          <div className="planning-calendar-toolbar-heading">
            <strong>{calendarToolbarHeading}</strong>
            <p>{calendarToolbarSubheading}</p>
          </div>
          <div className="planning-calendar-toolbar-nav">
            <button type="button" className="planning-inline-action" onClick={jumpCalendarToToday}>
              Hoy
            </button>
            <button type="button" className="planning-inline-action" onClick={shiftCalendarBackward}>
              &lt;
            </button>
            <button type="button" className="planning-inline-action" onClick={shiftCalendarForward}>
              &gt;
            </button>
          </div>
        </div>

        <div className="planning-calendar-toolbar-center">
          <button type="button" className="planning-calendar-athlete-chip">
            {overview ? firstName(overview.athlete_name) : "Atleta"}
          </button>
        </div>

        <div className="planning-calendar-toolbar-right">
          {calendarVisualMode === "week" && athleteId && token ? (
            <GarminBatchPush
              sessionsByDate={sessionsByDate}
              selectedWeekStart={selectedWeekStart}
              selectedWeekEnd={selectedWeekEnd}
              athleteId={athleteId}
              token={token}
              onComplete={onBatchGarminComplete}
            />
          ) : null}
          {onCopyWeek && calendarVisualMode === "week" ? (
            <button
              type="button"
              className="planning-inline-action"
              onClick={onCopyWeek}
              title="Copiar todas las sesiones de esta semana a la siguiente"
            >
              Copiar semana
            </button>
          ) : null}
          <div className="training-calendar-view-switch">
            <button
              type="button"
              className={`planning-inline-action ${calendarVisualMode === "month" ? "active" : ""}`}
              onClick={() => onSetCalendarVisualMode("month")}
            >
              Mes
            </button>
            <button
              type="button"
              className={`planning-inline-action ${calendarVisualMode === "week" ? "active" : ""}`}
              onClick={() => onSetCalendarVisualMode("week")}
            >
              Semana
            </button>
          </div>
        </div>
      </div>

      <div className={`planning-calendar-app-content calendar-full ${dayPanelOpen && selectedCalendarDate ? "with-day-panel" : ""}`}>
        <section className={`planning-calendar-app-main ${calendarVisualMode === "month" ? "month-mode" : ""}`}>
          {calendarVisualMode === "month" ? (
            <MonthGrid
              calendarMonth={calendarMonth}
              selectedCalendarDate={selectedCalendarDate}
              selectedCalendarSource={selectedCalendarSource}
              selectedWeekStart={selectedWeekStart}
              continuousMonthSections={continuousMonthSections}
              sessionsByDate={sessionsByDate}
              violations={violations}
              onSetSelectedCalendarDate={handleDayClick}
              openCalendarSessionDetail={openCalendarSessionDetail}
              openCalendarQuickAdd={openCalendarQuickAdd}
              calendarMonthSectionRefs={calendarMonthSectionRefs}
            />
          ) : (
            <WeekGrid
              selectedCalendarDate={selectedCalendarDate}
              selectedWeekStart={selectedWeekStart}
              selectedWeekEnd={selectedWeekEnd}
              continuousWeekStarts={continuousWeekStarts}
              sessionsByDate={sessionsByDate}
              athleteAnalysis={athleteAnalysis}
              selectedDiscipline={selectedDiscipline}
              violations={violations}
              onSetSelectedCalendarDate={handleDayClick}
              openCalendarSessionDetail={openCalendarSessionDetail}
              openCalendarQuickAdd={openCalendarQuickAdd}
              onMoveSession={onMoveSession}
              calendarWeekSectionRefs={calendarWeekSectionRefs}
            />
          )}
        </section>

        {dayPanelOpen && selectedCalendarDate ? (
          <DayDetailPanel
            date={selectedCalendarDate}
            sessions={daySessions}
            selectedCalendarSource={selectedCalendarSource}
            onClose={() => onSetDayPanelOpen(false)}
            onSessionClick={openCalendarSessionDetail}
            onQuickAdd={openCalendarQuickAdd}
          />
        ) : null}
      </div>
    </>
  );
}

// ── Month Grid Sub-component ──

function MonthGrid({
  calendarMonth,
  selectedCalendarDate,
  selectedCalendarSource,
  selectedWeekStart,
  continuousMonthSections,
  sessionsByDate,
  violations,
  onSetSelectedCalendarDate,
  openCalendarSessionDetail,
  openCalendarQuickAdd,
  calendarMonthSectionRefs,
}: {
  calendarMonth: string;
  selectedCalendarDate: string | null;
  selectedCalendarSource: PlanningCalendarSource;
  selectedWeekStart: string;
  continuousMonthSections: CalendarMonthSection[];
  sessionsByDate: Map<string, CalendarEntry[]>;
  violations: CalendarViolation[];
  onSetSelectedCalendarDate: (date: string | null) => void;
  openCalendarSessionDetail: (session: CalendarEntry) => void;
  openCalendarQuickAdd: (date: string) => void;
  calendarMonthSectionRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
}) {
  return (
    <div className="planning-calendar-month-stream planning-calendar-month-fixed">
      {continuousMonthSections.filter((s) => s.monthStart === calendarMonth).map((monthSection) => (
        <section
          key={monthSection.monthStart}
          className="planning-calendar-month-section active"
        >
          <div className="planning-calendar-month-section-head">
            <strong>{monthHeading(monthSection.monthStart)}</strong>
            <small>
              {monthSection.totalSessions
                ? `${formatMinutesCompact(monthSection.totalMinutes)} · ${monthSection.totalSessions} sesiones visibles`
                : "Sin sesiones visibles todavía"}
            </small>
          </div>

          <div className="planning-calendar-month-board">
            <div className="planning-calendar-month-header">
              {["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"].map((day) => (
                <span key={`${monthSection.monthStart}-${day}`} className="planning-calendar-app-weekday">{day}</span>
              ))}
              <span className="planning-calendar-month-summary-heading">Carga semanal</span>
            </div>

            <div className="planning-calendar-month-rows">
              {monthSection.rows.map((week) => {
                const isSelectedWeek = week.weekStart === selectedWeekStart;
                const disciplineRows = ["running", "ciclismo", "natación"].map((discipline) => ({
                  discipline,
                  minutes: week.snapshot.disciplineMetrics.find((metric) => metric.discipline === discipline)?.minutes ?? 0,
                }));

                return (
                  <section
                    key={`month-row-${monthSection.monthStart}-${week.weekStart}`}
                    className={`planning-calendar-month-row ${isSelectedWeek ? "selected" : ""}`}
                  >
                    <div className="planning-calendar-month-row-grid">
                      {week.cells.map((cell) => {
                        if (!cell.date) {
                          return <span key={cell.id} className="planning-calendar-app-spacer" aria-hidden="true" />;
                        }
                        const day = cell.date;
                        const daySessions = sessionsByDate.get(day) ?? [];
                        const primaryDaySessions = daySessions.filter((session) => !session.isOverlay);
                        const overlayDaySessions = daySessions.filter((session) => session.isOverlay);
                        const isSelected = selectedCalendarDate === day;
                        const isInBlock = dateValue(day) >= dateValue(selectedCalendarSource.startDate) && dateValue(day) <= dateValue(selectedCalendarSource.endDate);
                        const isToday = day === isoDateFromToday();
                        return (
                          <article
                            key={cell.id}
                            className={`planning-calendar-app-day ${isSelected ? "selected" : ""} ${isInBlock ? "in-block" : ""}`}
                          >
                            <button type="button" className={`planning-calendar-app-day-label ${isToday ? "today" : ""}`} onClick={() => onSetSelectedCalendarDate(day)}>
                              {isToday ? `Hoy ${monthDayLabel(day)}` : monthDayLabel(day)}
                              {dayHasFreshnessConflict(day, violations) ? <span className="calendar-day-conflict-dot" title="Conflicto de frescura" /> : null}
                            </button>
                            <div className="planning-calendar-app-day-stack">
                              {primaryDaySessions.map((session) => {
                                const tone = sessionToneFromEntry(session);
                                const garmin = garminStatusBadge(session);
                                const compact = compactSessionInfo(session);
                                const hasSpacing = sessionHasSpacingViolation(session.id, violations);
                                const gInfo = garminStatusInfo(session.publishStatus);
                                return (
                                  <button
                                    key={session.id}
                                    type="button"
                                    className={`planning-calendar-app-session ${session.layerDiscipline === "running" ? "running" : session.layerDiscipline === "ciclismo" ? "cycling" : session.layerDiscipline === "natación" ? "swimming" : ""} ${session.sessionType === "clave" ? "key" : ""}`}
                                    style={{
                                      borderLeft: `3px solid ${sessionToneBorderColor(tone)}`,
                                      background: sessionToneBackgroundTint(session),
                                    }}
                                    onClick={() => openCalendarSessionDetail(session)}
                                  >
                                    <div className="planning-session-card-head">
                                      <span>{session.sessionType}</span>
                                      <span className="planning-session-card-badges">
                                        {hasSpacing ? <span className="calendar-violation-badge spacing" title="Spacing demasiado corto">{"\u26A0"}</span> : null}
                                        {gInfo ? (
                                          <span className={`planning-session-garmin-badge garmin-${gInfo.tone}`} title={gInfo.description}>
                                            {gInfo.label}
                                          </span>
                                        ) : garmin ? (
                                          <span className={`planning-session-publish-badge ${garmin.tone}`}>
                                            {garmin.label}
                                          </span>
                                        ) : null}
                                      </span>
                                    </div>
                                    <strong className="session-card-title-truncated">{session.title}</strong>
                                    <p className="session-card-compact-info">{compact}</p>
                                  </button>
                                );
                              })}
                              {!primaryDaySessions.length ? (
                                <button type="button" className="planning-calendar-app-empty calendar-ghost-add" onClick={() => openCalendarQuickAdd(day)}>
                                  +
                                </button>
                              ) : null}
                              {overlayDaySessions.map((session) => (
                                <span key={session.id} className="planning-calendar-app-overlay">
                                  {disciplineLabel(session.layerDiscipline)}
                                </span>
                              ))}
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <aside className={`planning-calendar-month-row-summary ${week.snapshot.loadProfile.tone} ${isSelectedWeek ? "selected" : ""}`}>
                      <button
                        type="button"
                        className="planning-calendar-month-row-summary-head"
                        onClick={() => onSetSelectedCalendarDate(week.weekStart)}
                      >
                        <span>{weekHeading(week.weekStart, week.weekEnd)}</span>
                        <strong>{formatMinutesCompact(week.snapshot.totalMinutes)}</strong>
                        <small>
                          {week.snapshot.totalSessions
                            ? `${week.snapshot.totalSessions} sesiones · ${week.snapshot.loadProfile.label.toLowerCase()}`
                            : `Sin sesiones en ${week.inMonthDays} días`}
                        </small>
                      </button>

                      <div className="planning-calendar-month-row-metrics">
                        <div className="planning-calendar-month-row-metric">
                          <div className="planning-calendar-month-row-metric-head">
                            <span>Total</span>
                            <strong>{formatMinutesCompact(week.snapshot.totalMinutes)}</strong>
                          </div>
                          <div className="planning-calendar-month-row-metric-track">
                            <span
                              className={`planning-calendar-month-row-metric-fill ${week.snapshot.loadProfile.tone}`}
                              style={{
                                width: week.snapshot.totalMinutes
                                  ? `${Math.max(8, (week.snapshot.totalMinutes / monthSection.scale.totalMinutes) * 100)}%`
                                  : "0%",
                              }}
                            />
                          </div>
                        </div>

                        {disciplineRows.map((row) => (
                          <div key={`${week.weekStart}-${row.discipline}`} className="planning-calendar-month-row-metric">
                            <div className="planning-calendar-month-row-metric-head">
                              <span>{disciplineLabel(row.discipline)}</span>
                              <strong>{formatMinutesCompact(row.minutes)}</strong>
                            </div>
                            <div className="planning-calendar-month-row-metric-track">
                              <span
                                className="planning-calendar-month-row-metric-fill discipline"
                                style={{
                                  width: row.minutes
                                    ? `${Math.max(8, (row.minutes / monthSection.scale.disciplineMinutes[row.discipline]) * 100)}%`
                                    : "0%",
                                  backgroundColor: planningDisciplineAccent(row.discipline),
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </aside>
                  </section>
                );
              })}
            </div>
          </div>
        </section>
      ))}
    </div>
  ) ;
}

// ── Drag-and-Drop Primitives ──

function DraggableSessionCard({
  session,
  isDragging,
  children,
}: {
  session: CalendarEntry;
  isDragging: boolean;
  children: React.ReactNode;
}) {
  const canDrag = session.rawId != null;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: session.id,
    data: { session },
    disabled: !canDrag,
  });

  const style: React.CSSProperties = {
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
    opacity: isDragging ? 0.35 : 1,
    cursor: canDrag ? "grab" : "default",
    touchAction: "none",
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

function DroppableDayColumn({
  dayId,
  isOver,
  children,
}: {
  dayId: string;
  isOver: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: dayId });

  return (
    <div
      ref={setNodeRef}
      className={`training-calendar-week-drop-zone ${isOver ? "dnd-drop-active" : ""}`}
    >
      {children}
    </div>
  );
}

// ── Week Grid Sub-component ──

function WeekGrid({
  selectedCalendarDate,
  selectedWeekStart,
  selectedWeekEnd,
  continuousWeekStarts,
  sessionsByDate,
  athleteAnalysis,
  selectedDiscipline,
  violations,
  onSetSelectedCalendarDate,
  openCalendarSessionDetail,
  openCalendarQuickAdd,
  onMoveSession,
  calendarWeekSectionRefs,
}: {
  selectedCalendarDate: string | null;
  selectedWeekStart: string;
  selectedWeekEnd: string;
  continuousWeekStarts: string[];
  sessionsByDate: Map<string, CalendarEntry[]>;
  athleteAnalysis: AthleteAnalysis | null;
  selectedDiscipline: string;
  violations: CalendarViolation[];
  onSetSelectedCalendarDate: (date: string | null) => void;
  openCalendarSessionDetail: (session: CalendarEntry) => void;
  openCalendarQuickAdd: (date: string) => void;
  onMoveSession?: (sessionId: number, newDate: string) => void;
  calendarWeekSectionRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
}) {
  const [activeDragSession, setActiveDragSession] = useState<CalendarEntry | null>(null);
  const [overDayId, setOverDayId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const session = event.active.data.current?.session as CalendarEntry | undefined;
    if (session) setActiveDragSession(session);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragSession(null);
    setOverDayId(null);
    if (!over || !onMoveSession) return;
    const session = active.data.current?.session as CalendarEntry | undefined;
    if (!session?.rawId) return;
    const targetDate = String(over.id);
    if (targetDate === session.date) return;
    onMoveSession(session.rawId, targetDate);
  }, [onMoveSession]);

  const handleDragOver = useCallback((event: { over: { id: string | number } | null }) => {
    setOverDayId(event.over ? String(event.over.id) : null);
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragSession(null);
    setOverDayId(null);
  }, []);

  // Build the overlay card content
  const overlayContent = useMemo(() => {
    if (!activeDragSession) return null;
    const tone = sessionToneFromEntry(activeDragSession);
    const garmin = garminStatusBadge(activeDragSession);
    const compact = compactSessionInfo(activeDragSession);
    return (
      <div
        className={`training-calendar-session-card dnd-drag-overlay ${activeDragSession.layerDiscipline === "running" ? "running" : activeDragSession.layerDiscipline === "ciclismo" ? "cycling" : activeDragSession.layerDiscipline === "natación" ? "swimming" : ""} ${activeDragSession.sessionType === "clave" ? "key" : ""}`}
        style={{
          borderLeft: `3px solid ${sessionToneBorderColor(tone)}`,
          background: sessionToneBackgroundTint(activeDragSession),
        }}
      >
        <div className="planning-session-card-head">
          <span>{activeDragSession.sessionType}</span>
          {garmin ? (
            <span className={`planning-session-publish-badge ${garmin.tone}`}>
              {garmin.label}
            </span>
          ) : activeDragSession.publishStatus ? (
            <span className={`planning-session-publish-badge ${planningPublishStatusMeta(activeDragSession.publishStatus).tone}`}>
              {planningPublishStatusMeta(activeDragSession.publishStatus).label}
            </span>
          ) : null}
        </div>
        <strong className="session-card-title-truncated">{activeDragSession.title}</strong>
        <p className="session-card-compact-info">{compact}</p>
      </div>
    );
  }, [activeDragSession]);

  return (
    <>
      <div className="planning-calendar-app-header-row">
        {["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"].map((day) => (
          <span key={day} className="planning-calendar-app-weekday">{day}</span>
        ))}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
      >
        <div className="training-calendar-week-stream training-calendar-week-fixed">
          {continuousWeekStarts.filter((ws) => ws === selectedWeekStart).map((weekStart) => {
            const weekEnd = addDays(weekStart, 6);
            const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
            const isFocusedWeek = weekStart === selectedWeekStart;
            const weekEntries = weekDates.flatMap((day) => sessionsByDate.get(day) ?? []);
            const weekSnapshot = buildCalendarWeekSnapshot(weekEntries, athleteAnalysis, selectedDiscipline);
            const weekBarMaxMinutes = Math.max(1, ...weekSnapshot.disciplineMetrics.map((item) => item.minutes));

            return (
              <section
                key={weekStart}
                ref={(node) => {
                  calendarWeekSectionRefs.current[weekStart] = node;
                }}
                className={`training-calendar-week-section ${isFocusedWeek ? "selected" : ""}`}
              >
                <div className="training-calendar-week-section-head">
                  <span>{isFocusedWeek ? "Semana activa" : "Semana visible"}</span>
                  <strong>{weekHeading(weekStart, weekEnd)}</strong>
                </div>

                <div className="training-calendar-week-layout">
                  <div className="training-calendar-week-grid">
                    {weekDates.map((day) => {
                      const daySessions = sessionsByDate.get(day) ?? [];
                      const primaryDaySessions = daySessions.filter((session) => !session.isOverlay);
                      const overlayDaySessions = daySessions.filter((session) => session.isOverlay);
                      const isSelected = selectedCalendarDate === day;
                      const isToday = day === isoDateFromToday();
                      const isDayOver = overDayId === day;
                      return (
                        <article
                          key={day}
                          className={`training-calendar-week-column ${isSelected ? "selected" : ""}`}
                        >
                          <button type="button" className={`training-calendar-week-head ${isToday ? "today" : ""}`} onClick={() => onSetSelectedCalendarDate(day)}>
                            <span>{dayNameShort(day)}</span>
                            <strong>{monthDayLabel(day)}</strong>
                            {dayHasFreshnessConflict(day, violations) ? <span className="calendar-day-conflict-dot" title="Conflicto de frescura" /> : null}
                            <GarminDaySyncIndicator sessions={primaryDaySessions} />
                          </button>
                          <DroppableDayColumn dayId={day} isOver={isDayOver}>
                            <div className="training-calendar-week-stack">
                              {primaryDaySessions.length ? primaryDaySessions.map((session) => {
                                const tone = sessionToneFromEntry(session);
                                const compact = compactSessionInfo(session);
                                const isDragging = activeDragSession?.id === session.id;
                                const hasSpacing = sessionHasSpacingViolation(session.id, violations);
                                const gInfo = garminStatusInfo(session.publishStatus);
                                return (
                                  <DraggableSessionCard key={session.id} session={session} isDragging={isDragging}>
                                    <button
                                      type="button"
                                      className={`training-calendar-session-card ${session.layerDiscipline === "running" ? "running" : session.layerDiscipline === "ciclismo" ? "cycling" : session.layerDiscipline === "natación" ? "swimming" : ""} ${session.sessionType === "clave" ? "key" : ""}`}
                                      style={{
                                        borderLeft: `3px solid ${sessionToneBorderColor(tone)}`,
                                        background: sessionToneBackgroundTint(session),
                                      }}
                                      onClick={() => openCalendarSessionDetail(session)}
                                    >
                                      <div className="planning-session-card-head">
                                        <span>{session.sessionType}</span>
                                        <span className="planning-session-card-badges">
                                          {hasSpacing ? <span className="calendar-violation-badge spacing" title="Spacing demasiado corto">{"\u26A0"}</span> : null}
                                          {gInfo ? (
                                            <span className={`planning-session-garmin-badge garmin-${gInfo.tone}`} title={gInfo.description}>
                                              {gInfo.label}
                                            </span>
                                          ) : session.publishStatus ? (
                                            <span className={`planning-session-publish-badge ${planningPublishStatusMeta(session.publishStatus).tone}`}>
                                              {planningPublishStatusMeta(session.publishStatus).label}
                                            </span>
                                          ) : null}
                                        </span>
                                      </div>
                                      <strong className="session-card-title-truncated">{session.title}</strong>
                                      <p className="session-card-compact-info">{compact}</p>
                                    </button>
                                  </DraggableSessionCard>
                                );
                              }) : (
                                <button type="button" className="training-calendar-empty-slot calendar-ghost-add" onClick={() => openCalendarQuickAdd(day)}>+</button>
                              )}
                              {overlayDaySessions.map((session) => (
                                <div key={session.id} className="training-calendar-session-card overlay">
                                  <span>{disciplineLabel(session.layerDiscipline)}</span>
                                  <strong>{session.title}</strong>
                                </div>
                              ))}
                            </div>
                          </DroppableDayColumn>
                        </article>
                      );
                    })}
                  </div>

                  <aside className={`training-calendar-week-summary training-calendar-week-summary-${weekSnapshot.loadProfile.tone}`}>
                    <div className="training-calendar-week-summary-top">
                      <article className="training-calendar-week-summary-kpi load">
                        <span>Carga</span>
                        <strong>{weekSnapshot.loadProfile.label}</strong>
                        <small>{weekSnapshot.loadProfile.hint}</small>
                      </article>
                      <article className="training-calendar-week-summary-kpi">
                        <span>Sesiones</span>
                        <strong>{weekSnapshot.totalSessions}</strong>
                        <small>{weekSnapshot.keySessions} clave · {weekSnapshot.supportSessions} soporte</small>
                      </article>
                      <article className="training-calendar-week-summary-kpi">
                        <span>Dia pico</span>
                        <strong>{weekSnapshot.peakDay ? formatMinutesCompact(weekSnapshot.peakDay.minutes) : "-"}</strong>
                        <small>{weekSnapshot.peakDay ? `${dayNameShort(weekSnapshot.peakDay.date)} ${monthDayLabel(weekSnapshot.peakDay.date)}` : "Sin carga visible"}</small>
                      </article>
                    </div>

                    <div className="training-calendar-week-summary-bars">
                      <div className="training-calendar-week-metric-row">
                        <div className="training-calendar-week-metric-head">
                          <span>Total duraci&oacute;n</span>
                          <strong>{formatMinutesCompact(weekSnapshot.totalMinutes)}</strong>
                        </div>
                        <div className="training-calendar-week-metric-track">
                          <span
                            className={`training-calendar-week-metric-fill ${weekSnapshot.loadProfile.tone}`}
                            style={{ width: `${Math.max(10, weekSnapshot.loadProfile.intensityPct)}%` }}
                          />
                        </div>
                      </div>

                      <div className="training-calendar-week-metric-row">
                        <div className="training-calendar-week-metric-head">
                          <span>Densidad clave</span>
                          <strong>{weekSnapshot.totalSessions ? `${weekSnapshot.keySessions}/${weekSnapshot.totalSessions}` : "0/0"}</strong>
                        </div>
                        <div className="training-calendar-week-metric-track">
                          <span
                            className="training-calendar-week-metric-fill positive"
                            style={{ width: `${weekSnapshot.totalSessions ? Math.max(10, (weekSnapshot.keySessions / weekSnapshot.totalSessions) * 100) : 10}%` }}
                          />
                        </div>
                      </div>

                      {weekSnapshot.disciplineMetrics.length ? weekSnapshot.disciplineMetrics.map((metric) => (
                        <div key={`${weekStart}-${metric.discipline}`} className="training-calendar-week-metric-row">
                          <div className="training-calendar-week-metric-head">
                            <span>{disciplineLabel(metric.discipline)}</span>
                            <strong>{formatMinutesCompact(metric.minutes)}</strong>
                          </div>
                          <div className="training-calendar-week-metric-track">
                            <span
                              className="training-calendar-week-metric-fill discipline"
                              style={{
                                width: `${Math.max(14, (metric.minutes / weekBarMaxMinutes) * 100)}%`,
                                backgroundColor: planningDisciplineAccent(metric.discipline),
                              }}
                            />
                          </div>
                          <small>
                            {metric.distanceMeters
                              ? `${metric.distanceEstimated ? "~" : ""}${formatDistanceCompact(metric.distanceMeters)} · ${metric.sessions} sesiones`
                              : `${metric.sessions} sesiones`}
                          </small>
                        </div>
                      )) : (
                        <p className="training-calendar-week-summary-empty">Todav&iacute;a no hay sesiones visibles para esta semana.</p>
                      )}
                    </div>

                    <div className="training-calendar-week-summary-foot">
                      <div>
                        <span>Disciplina dominante</span>
                        <strong>{weekSnapshot.primaryDiscipline ? disciplineLabel(weekSnapshot.primaryDiscipline) : "Sin foco"}</strong>
                      </div>
                      <div>
                        <span>Distancia estimada</span>
                        <strong>{weekSnapshot.totalDistanceMeters ? formatDistanceCompact(weekSnapshot.totalDistanceMeters) : "n/d"}</strong>
                      </div>
                    </div>
                  </aside>
                </div>
              </section>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {overlayContent}
        </DragOverlay>
      </DndContext>
    </>
  );
}

// ── Garmin Day Sync Indicator ──

function GarminDaySyncIndicator({ sessions }: { sessions: CalendarEntry[] }) {
  const withStatus = sessions.filter((s) => s.rawId != null && s.publishStatus);
  if (withStatus.length === 0) return null;

  const sent = withStatus.filter((s) => s.publishStatus === "sent").length;
  const total = withStatus.length;

  if (sent === total) {
    return <span className="garmin-day-sync-indicator sent" title={`${sent}/${total} enviadas`}>{"\u2713"}</span>;
  }
  return (
    <span className="garmin-day-sync-indicator pending" title={`${sent}/${total} enviadas`}>
      {sent}/{total}
    </span>
  );
}

// ── Garmin Batch Push ──

function GarminBatchPush({
  sessionsByDate,
  selectedWeekStart,
  selectedWeekEnd,
  athleteId,
  token,
  onComplete,
}: {
  sessionsByDate: Map<string, CalendarEntry[]>;
  selectedWeekStart: string;
  selectedWeekEnd: string;
  athleteId: string;
  token: string;
  onComplete?: () => void;
}) {
  const [pushing, setPushing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<{ sent: number; errors: number } | null>(null);

  const pendingSessions = useMemo(() => {
    const pending: CalendarEntry[] = [];
    const startVal = dateValue(selectedWeekStart);
    const endVal = dateValue(selectedWeekEnd);
    for (const [date, sessions] of sessionsByDate.entries()) {
      const dv = dateValue(date);
      if (dv < startVal || dv > endVal) continue;
      for (const s of sessions) {
        if (s.isOverlay) continue;
        if (s.rawId != null && s.publishStatus !== "sent") {
          pending.push(s);
        }
      }
    }
    return pending;
  }, [sessionsByDate, selectedWeekStart, selectedWeekEnd]);

  const handleBatchPush = useCallback(async () => {
    if (pendingSessions.length === 0 || pushing) return;
    setPushing(true);
    setResult(null);
    const total = pendingSessions.length;
    setProgress({ current: 0, total });
    let sent = 0;
    let errors = 0;

    for (let i = 0; i < pendingSessions.length; i++) {
      const session = pendingSessions[i];
      setProgress({ current: i + 1, total });
      try {
        await api.pushWorkoutToGarmin(token, Number(athleteId), session.rawId!);
        sent++;
      } catch {
        errors++;
      }
    }

    setResult({ sent, errors });
    setPushing(false);
    if (onComplete) onComplete();
  }, [pendingSessions, pushing, token, athleteId, onComplete]);

  if (pendingSessions.length === 0 && !result) return null;

  return (
    <div className="garmin-batch-push">
      {pushing ? (
        <span className="garmin-batch-push-progress">
          Enviando {progress.current}/{progress.total}...
        </span>
      ) : result ? (
        <span className={`garmin-batch-push-result ${result.errors > 0 ? "has-errors" : ""}`}>
          {result.sent} enviada{result.sent !== 1 ? "s" : ""}{result.errors > 0 ? `, ${result.errors} error${result.errors !== 1 ? "es" : ""}` : ""}
        </span>
      ) : null}
      <button
        type="button"
        className="planning-inline-action garmin-batch-btn"
        onClick={handleBatchPush}
        disabled={pushing || pendingSessions.length === 0}
        title={`Enviar ${pendingSessions.length} sesión${pendingSessions.length !== 1 ? "es" : ""} pendiente${pendingSessions.length !== 1 ? "s" : ""} a Garmin`}
      >
        {pushing ? "Enviando..." : `Enviar semana a Garmin (${pendingSessions.length})`}
      </button>
    </div>
  );
}
