import { useCallback, useEffect, useMemo, useState } from "react";

import { TrainingZonesEditor, TrainingZonesDisplay } from "../../components/TrainingZonesEditor";
import "../../components/training-zones.css";
import { WorkoutPreviewModal } from "../../components/WorkoutPreviewModal";
import { api } from "../../lib/api";
import type {
  Athlete,
  AthleteAnalysis,
  PlanningMesocycleDraftSession,
  PlanningMesocycleTemplate,
  PlanningOverview,
  PlanningPlannedSession,
  PlanningWorkoutTemplate,
  TrainingZoneSet,
  WorkoutDefinition,
} from "../../types";
import type {
  CalendarEntry,
  CalendarMesocycleOption,
  CalendarMonthSection,
  CalendarQuickAddState,
  CalendarWorkspaceTab,
  OpenWorkoutPreviewState,
  PlanningCalendarSource,
  PlanningSourceModalState,
  WorkoutLibraryLayer,
} from "../types";
import {
  disciplineLabel,
  firstName,
  formatDate,
  formatThresholdPrimaryMetric,
  planningPublishStatusMeta,
  startOfMonth,
} from "../utils";
import {
  BLOCK_LABELS,
  buildLibraryWorkoutPreview,
  workoutLayerCue,
  workoutLayerForTemplate,
  workoutLayerGlyph,
  workoutLayerLabel,
  workoutLayerTone,
} from "../utils-workout";
import type { CalendarNavigationRefs } from "../context/useCalendarNavigation";
import { QuickAddIcon } from "./QuickAddIcon";
import { CalendarAthletesTab } from "./CalendarAthletesTab";
import { CalendarLibraryTab } from "./CalendarLibraryTab";
import { CalendarSummaryTab } from "./CalendarSummaryTab";
import { MesocycleComposer } from "./MesocycleComposer";
import { CalendarView } from "./CalendarView";
import { IntelligenceBanner } from "./IntelligenceBanner";
import type { PlanningState } from "../context/PlanningContext";

// ── Inline CalendarZonesTab ────────────────────────────────────────────────

function CalendarZonesTab({ athleteId, discipline, token, athleteName }: {
  athleteId: string | null;
  discipline: string;
  token: string;
  athleteName: string;
}) {
  const [zoneSets, setZoneSets] = useState<TrainingZoneSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingSet, setEditingSet] = useState<TrainingZoneSet | null>(null);

  const loadZones = useCallback(() => {
    if (!athleteId) return;
    setLoading(true);
    api.trainingZoneSets(token, Number(athleteId), discipline)
      .then((data) => setZoneSets(data as TrainingZoneSet[]))
      .catch(() => setZoneSets([]))
      .finally(() => setLoading(false));
  }, [token, athleteId, discipline]);

  useEffect(() => { loadZones(); }, [loadZones]);

  const activeSet = zoneSets.find((zs) => zs.is_active) ?? null;

  if (!athleteId) {
    return <div className="planning-calendar-tab-empty"><p>Selecciona un atleta para ver sus zonas.</p></div>;
  }

  if (editing) {
    return (
      <div style={{ padding: "24px 28px" }}>
        <TrainingZonesEditor
          athleteId={Number(athleteId)}
          discipline={discipline}
          token={token}
          existingSet={editingSet}
          onSave={() => { setEditing(false); setEditingSet(null); loadZones(); }}
          onCancel={() => { setEditing(false); setEditingSet(null); }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px", display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <span className="eyebrow">Zonas de entrenamiento</span>
        <h2 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.3rem" }}>
          {athleteName} — {discipline === "ciclismo" ? "Ciclismo" : discipline === "natación" ? "Natación" : "Carrera a pie"}
        </h2>
      </div>

      {loading ? (
        <p style={{ color: "var(--muted)", fontSize: "0.84rem", margin: 0 }}>Cargando zonas...</p>
      ) : activeSet ? (
        <TrainingZonesDisplay
          zoneSet={activeSet}
          discipline={discipline}
          onEdit={() => { setEditingSet(activeSet); setEditing(true); }}
        />
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "0.84rem", margin: 0 }}>
          No hay zonas definidas. Crea un conjunto para esta disciplina.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="tz-suggest-btn" onClick={() => { setEditingSet(null); setEditing(true); }}>
          {activeSet ? "Crear nuevo conjunto" : "Crear zonas de entrenamiento"}
        </button>
        {zoneSets.filter((zs) => !zs.is_active).length > 0 ? (
          <details style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
            <summary>{zoneSets.filter((zs) => !zs.is_active).length} archivado{zoneSets.filter((zs) => !zs.is_active).length > 1 ? "s" : ""}</summary>
            <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
              {zoneSets.filter((zs) => !zs.is_active).map((zs) => (
                <div key={zs.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span>{zs.name}</span>
                  <button type="button" className="tz-edit-btn" onClick={() => {
                    api.activateTrainingZoneSet(token, Number(athleteId), zs.id).then(() => loadZones());
                  }}>Activar</button>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

type CalendarOverlayProps = {
  state: PlanningState;
  dispatch: (action: import("../context/PlanningContext").PlanningAction) => void;
  token: string;
  athleteId: string | null;
  calendarWorkspaceTab: CalendarWorkspaceTab;
  // Computed values
  selectedAthlete: Athlete | null;
  activeBlockLabel: string;
  nextTargetPrimaryLabel: string;
  nextTargetLabel: string;
  templateLibrary: PlanningMesocycleTemplate[];
  calendarSources: PlanningCalendarSource[];
  selectedCalendarSource: PlanningCalendarSource;
  draftCalendarSource: PlanningCalendarSource;
  calendarMesocycleOptions: CalendarMesocycleOption[];
  continuousMonthSections: CalendarMonthSection[];
  continuousWeekStarts: string[];
  sessionsByDate: Map<string, CalendarEntry[]>;
  primaryEntries: CalendarEntry[];
  overlayEntries: CalendarEntry[];
  selectedWeekStart: string;
  selectedWeekEnd: string;
  calendarToolbarHeading: string;
  calendarToolbarSubheading: string;
  planningLt1: ReturnType<typeof import("../utils").resolveTrainingThreshold>;
  planningLt2: ReturnType<typeof import("../utils").resolveTrainingThreshold>;
  planningThresholdBasis: string;
  quickAddDisciplineLibrary: PlanningWorkoutTemplate[];
  quickAddAvailableLayers: WorkoutLibraryLayer[];
  quickAddActiveLayer: WorkoutLibraryLayer | null;
  quickAddLayerCounts: Record<string, number>;
  quickAddFilteredLibrary: PlanningWorkoutTemplate[];
  quickAddDiscipline: string;
  // Callbacks
  closeCalendarPanel: () => void;
  openCalendarWorkspaceTab: (tab: CalendarWorkspaceTab) => void;
  updatePlanningRoute: (nextAthleteId: string, nextDiscipline: string) => void;
  openCalendarMesocycleComposer: (date: string) => void;
  closeCalendarMesocycleComposer: () => void;
  openCalendarQuickAdd: (date: string) => void;
  closeCalendarQuickAdd: () => void;
  openCalendarWorkoutLibrary: (date: string, discipline: "running" | "ciclismo" | "natación") => void;
  openCalendarSessionDetail: (session: CalendarEntry) => void;
  openPlannedWorkoutPreview: (sessionId: number) => boolean;
  openPlannedWorkoutRawInformation: (sessionId: number) => void;
  openLibraryWorkoutPreview: (template: PlanningWorkoutTemplate) => void;
  openMesocycleLibraryFromSource: (source: PlanningCalendarSource) => void;
  deletePlanningSourceFromModal: () => Promise<void>;
  saveFocusBlockFromPlanning: () => Promise<boolean>;
  regeneratePlannedSessionStructure: (sessionId: number) => Promise<void>;
  handleSaveWorkoutSteps: (workout: WorkoutDefinition) => Promise<void>;
  handlePushToGarmin: () => Promise<void>;
  loadPlanningContext: (athleteId: string, discipline: string) => Promise<void>;
  onCopyWeek?: () => void;
  // Navigation refs and handlers
  navRefs: CalendarNavigationRefs;
  jumpCalendarToToday: () => void;
  shiftCalendarBackward: () => void;
  shiftCalendarForward: () => void;
  handleContinuousWeekScroll: () => void;
  handleContinuousMonthScroll: () => void;
};

export function CalendarOverlay({
  state,
  dispatch,
  token,
  athleteId,
  calendarWorkspaceTab,
  selectedAthlete,
  activeBlockLabel,
  nextTargetPrimaryLabel,
  nextTargetLabel,
  templateLibrary,
  calendarSources,
  selectedCalendarSource,
  draftCalendarSource,
  calendarMesocycleOptions,
  continuousMonthSections,
  continuousWeekStarts,
  sessionsByDate,
  primaryEntries,
  overlayEntries,
  selectedWeekStart,
  selectedWeekEnd,
  calendarToolbarHeading,
  calendarToolbarSubheading,
  planningLt1,
  planningLt2,
  planningThresholdBasis,
  quickAddDisciplineLibrary,
  quickAddAvailableLayers,
  quickAddActiveLayer,
  quickAddLayerCounts,
  quickAddFilteredLibrary,
  quickAddDiscipline,
  closeCalendarPanel,
  openCalendarWorkspaceTab,
  updatePlanningRoute,
  openCalendarMesocycleComposer,
  closeCalendarMesocycleComposer,
  openCalendarQuickAdd,
  closeCalendarQuickAdd,
  openCalendarWorkoutLibrary,
  openCalendarSessionDetail,
  openPlannedWorkoutPreview,
  openPlannedWorkoutRawInformation,
  openLibraryWorkoutPreview,
  openMesocycleLibraryFromSource,
  deletePlanningSourceFromModal,
  saveFocusBlockFromPlanning,
  regeneratePlannedSessionStructure,
  handleSaveWorkoutSteps,
  handlePushToGarmin,
  loadPlanningContext,
  onCopyWeek,
  navRefs,
  jumpCalendarToToday,
  shiftCalendarBackward,
  shiftCalendarForward,
  handleContinuousWeekScroll,
  handleContinuousMonthScroll,
}: CalendarOverlayProps) {
  const {
    overview,
    athleteAnalysis,
    athletes,
    rosterAnalyses,
    rosterAnalysesLoading,
    selectedDiscipline,
    selectedTemplateId,
    selectedLibrarySourceId,
    workoutLibrary,
    quickAddLibraries,
    calendarVisualMode,
    calendarMonth,
    selectedCalendarDate,
    calendarComposerDate,
    calendarQuickAdd,
    openWorkoutPreview,
    showPlannedSessionRawInformation,
    plannedSessionStructuredPreview,
    plannedSessionStructuredPreviewLoading,
    plannedSessionStructuredPreviewError,
    plannedSessionRegeneratingId,
    planningSourceModal,
    weeks,
    blockIntent,
    primaryWeakness,
    secondaryWeakness,
    saving,
    saveError,
    saveMessage,
    deletingBlockId,
  } = state;

  const selectedTemplate = useMemo(
    () => templateLibrary.find((t) => t.template_id === selectedTemplateId) ?? templateLibrary[0] ?? null,
    [selectedTemplateId, templateLibrary],
  );

  const activePlannedPreviewSession = useMemo(
    () => openWorkoutPreview?.selection.plannedSessionId != null
      ? overview?.planned_sessions.find((session) => session.id === openWorkoutPreview.selection.plannedSessionId) ?? null
      : null,
    [openWorkoutPreview, overview?.planned_sessions],
  );

  const plannedSessionStructuredPreviewJson = useMemo(
    () => (plannedSessionStructuredPreview ? JSON.stringify(plannedSessionStructuredPreview, null, 2) : null),
    [plannedSessionStructuredPreview],
  );

  const editableWorkoutDefinition = useMemo<WorkoutDefinition | null>(() => {
    if (!activePlannedPreviewSession) return null;
    if (plannedSessionStructuredPreview) return plannedSessionStructuredPreview;
    return null;
  }, [activePlannedPreviewSession, plannedSessionStructuredPreview]);

  // ── Drag-and-drop: move session to a different day ──
  const handleMoveSession = useCallback(async (session: CalendarEntry, newDate: string) => {
    console.log("[DnD] handleMoveSession called:", { sessionId: session.id, rawId: session.rawId, newDate });

    if (session.rawId != null) {
      // Persisted session — API call
      const originalSession = overview?.planned_sessions.find((s) => s.id === session.rawId);
      const originalDate = originalSession?.scheduled_date;
      console.log("[DnD] Persisted session:", { originalDate, found: !!originalSession });

      // Optimistic update
      dispatch({ type: "MOVE_SESSION", payload: { sessionId: session.rawId, newDate } });

      try {
        const result = await api.coachEditSession(token, session.rawId, { scheduled_date: newDate });
        console.log("[DnD] API response:", result);
        // Reload to sync fully
        if (athleteId) {
          await loadPlanningContext(String(athleteId), selectedDiscipline);
        }
        console.log("[DnD] Context reloaded successfully");
      } catch (err) {
        console.error("[DnD] Error al mover sesión:", err);
        // Revert optimistic update
        if (originalDate) {
          dispatch({ type: "MOVE_SESSION", payload: { sessionId: session.rawId, newDate: originalDate } });
        }
      }
    } else {
      // Synthetic session — local-only override
      console.log("[DnD] Synthetic session override:", { syntheticId: session.id, newDate });
      dispatch({ type: "MOVE_SYNTHETIC_SESSION", payload: { syntheticId: session.id, newDate } });
    }
  }, [athleteId, dispatch, loadPlanningContext, overview?.planned_sessions, selectedDiscipline, token]);

  const handleRenameSession = useCallback(async (newTitle: string) => {
    const sessionId = activePlannedPreviewSession?.id;
    if (!sessionId || !athleteId) return;
    await api.coachEditSession(token, sessionId, { public_label: newTitle });
    await loadPlanningContext(String(athleteId), selectedDiscipline);
  }, [activePlannedPreviewSession, athleteId, loadPlanningContext, selectedDiscipline, token]);

  const handleSaveCoachNote = useCallback(async (note: string) => {
    const sessionId = activePlannedPreviewSession?.id;
    if (!sessionId || !athleteId) return;
    await api.coachEditSession(token, sessionId, { coach_note: note });
    await loadPlanningContext(String(athleteId), selectedDiscipline);
  }, [activePlannedPreviewSession, athleteId, loadPlanningContext, selectedDiscipline, token]);

  // Lock body overflow when overlay is open
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Render workspace content
  const renderWorkspace = () => {
    if (calendarWorkspaceTab === "athletes") {
      return (
        <CalendarAthletesTab
          state={state}
          athleteId={athleteId}
          selectedDiscipline={selectedDiscipline}
          activeBlockLabel={activeBlockLabel}
          nextTargetPrimaryLabel={nextTargetPrimaryLabel}
          openCalendarWorkspaceTab={openCalendarWorkspaceTab}
          updatePlanningRoute={updatePlanningRoute}
        />
      );
    }

    if (calendarWorkspaceTab === "library") {
      return (
        <CalendarLibraryTab
          overview={overview}
          selectedDiscipline={selectedDiscipline}
          templateLibrary={templateLibrary}
          selectedTemplateId={selectedTemplateId}
          selectedLibrarySourceId={selectedLibrarySourceId}
          calendarSources={calendarSources}
          workoutLibrary={workoutLibrary}
          onSelectTemplateId={(id) => dispatch({ type: "SET_SELECTED_TEMPLATE_ID", payload: id })}
          onSelectLibrarySourceId={(id) => dispatch({ type: "SET_SELECTED_LIBRARY_SOURCE_ID", payload: id })}
          openCalendarWorkspaceTab={openCalendarWorkspaceTab}
          openMesocycleLibraryFromSource={openMesocycleLibraryFromSource}
          openPlannedWorkoutPreview={openPlannedWorkoutPreview}
          openPlannedWorkoutRawInformation={openPlannedWorkoutRawInformation}
          openLibraryWorkoutPreview={openLibraryWorkoutPreview}
        />
      );
    }

    if (calendarWorkspaceTab === "zones") {
      return (
        <CalendarZonesTab
          athleteId={athleteId}
          discipline={selectedDiscipline}
          token={token}
          athleteName={overview?.athlete_name ?? "Atleta"}
        />
      );
    }

    if (calendarWorkspaceTab === "summary") {
      return (
        <CalendarSummaryTab
          athletes={athletes}
          athleteAnalysis={athleteAnalysis}
          rosterAnalyses={rosterAnalyses}
          rosterAnalysesLoading={rosterAnalysesLoading}
          selectedDiscipline={selectedDiscipline}
          selectedAthlete={selectedAthlete}
          openCalendarWorkspaceTab={openCalendarWorkspaceTab}
          updatePlanningRoute={updatePlanningRoute}
        />
      );
    }

    // Calendar tab (default)
    if (calendarComposerDate) {
      return (
        <MesocycleComposer
          overview={overview}
          calendarComposerDate={calendarComposerDate}
          selectedTemplateId={selectedTemplateId}
          weeks={weeks}
          blockIntent={blockIntent}
          primaryWeakness={primaryWeakness}
          secondaryWeakness={secondaryWeakness}
          saving={saving}
          saveError={saveError}
          saveMessage={saveMessage}
          athleteId={athleteId}
          selectedTemplate={selectedTemplate}
          nextTargetPrimaryLabel={nextTargetPrimaryLabel}
          nextTargetLabel={nextTargetLabel}
          calendarMesocycleOptions={calendarMesocycleOptions}
          onSetSelectedTemplateId={(id) => dispatch({ type: "SET_SELECTED_TEMPLATE_ID", payload: id })}
          onSetBlockIntent={(v) => dispatch({ type: "SET_BLOCK_INTENT", payload: v })}
          onSetCoachNotes={(v) => dispatch({ type: "SET_COACH_NOTES", payload: v })}
          onSetWeeks={(v) => {
            if (typeof v === "function") {
              dispatch({ type: "SET_WEEKS", payload: v(weeks) });
            } else {
              dispatch({ type: "SET_WEEKS", payload: v });
            }
          }}
          closeCalendarMesocycleComposer={closeCalendarMesocycleComposer}
          saveFocusBlockFromPlanning={saveFocusBlockFromPlanning}
        />
      );
    }

    return (
      <CalendarView
        calendarVisualMode={calendarVisualMode}
        calendarMonth={calendarMonth}
        selectedCalendarDate={selectedCalendarDate}
        selectedCalendarSource={selectedCalendarSource}
        selectedWeekStart={selectedWeekStart}
        selectedWeekEnd={selectedWeekEnd}
        continuousMonthSections={continuousMonthSections}
        continuousWeekStarts={continuousWeekStarts}
        sessionsByDate={sessionsByDate}
        athleteAnalysis={athleteAnalysis}
        selectedDiscipline={selectedDiscipline}
        overview={overview ? { athlete_name: overview.athlete_name } : null}
        calendarToolbarHeading={calendarToolbarHeading}
        calendarToolbarSubheading={calendarToolbarSubheading}
        dayPanelOpen={state.dayPanelOpen}
        workoutLibrary={workoutLibrary}
        athleteId={athleteId}
        token={token}
        onBatchGarminComplete={athleteId ? () => loadPlanningContext(String(athleteId), selectedDiscipline) : undefined}
        trainingLoadDays={state.trainingLoadDays}
        jumpCalendarToToday={jumpCalendarToToday}
        shiftCalendarBackward={shiftCalendarBackward}
        shiftCalendarForward={shiftCalendarForward}
        handleContinuousWeekScroll={handleContinuousWeekScroll}
        handleContinuousMonthScroll={handleContinuousMonthScroll}
        onSetCalendarVisualMode={(mode) => dispatch({ type: "SET_CALENDAR_VISUAL_MODE", payload: mode })}
        onSetSelectedCalendarDate={(date) => dispatch({ type: "SET_SELECTED_CALENDAR_DATE", payload: date })}
        onSetDayPanelOpen={(open) => dispatch({ type: "SET_DAY_PANEL_OPEN", payload: open })}
        openCalendarSessionDetail={openCalendarSessionDetail}
        openCalendarQuickAdd={openCalendarQuickAdd}
        onCopyWeek={onCopyWeek}
        onMoveSession={handleMoveSession}
        calendarWeekScrollerRef={navRefs.calendarWeekScrollerRef}
        calendarWeekSectionRefs={navRefs.calendarWeekSectionRefs}
        calendarMonthScrollerRef={navRefs.calendarMonthScrollerRef}
        calendarMonthSectionRefs={navRefs.calendarMonthSectionRefs}
      />
    );
  };

  return (
    <div className="planning-calendar-overlay-page">
      <button type="button" className="planning-calendar-overlay-close" onClick={closeCalendarPanel} aria-label="Cerrar calendario">
        ×
      </button>

      <div className="planning-calendar-app">
        <header className="planning-calendar-app-topnav">
          <div className="planning-calendar-app-brand">PeakAerobic</div>
          <nav className="planning-calendar-app-nav">
            <button type="button" className="planning-calendar-app-tab" onClick={closeCalendarPanel}>Planificación</button>
            <button
              type="button"
              className={`planning-calendar-app-tab ${calendarWorkspaceTab === "athletes" ? "active" : ""}`}
              onClick={() => openCalendarWorkspaceTab("athletes")}
            >
              Atletas
            </button>
            <button
              type="button"
              className={`planning-calendar-app-tab ${calendarWorkspaceTab === "library" ? "active" : ""}`}
              onClick={() => openCalendarWorkspaceTab("library")}
            >
              Biblioteca
            </button>
            <button
              type="button"
              className={`planning-calendar-app-tab ${calendarWorkspaceTab === "calendar" ? "active" : ""}`}
              onClick={() => openCalendarWorkspaceTab("calendar")}
            >
              Calendario
            </button>
            <button
              type="button"
              className={`planning-calendar-app-tab ${calendarWorkspaceTab === "summary" ? "active" : ""}`}
              onClick={() => openCalendarWorkspaceTab("summary")}
            >
              Resumen
            </button>
            <button
              type="button"
              className={`planning-calendar-app-tab ${calendarWorkspaceTab === "zones" ? "active" : ""}`}
              onClick={() => openCalendarWorkspaceTab("zones")}
            >
              Zonas
            </button>
            <button type="button" className="planning-calendar-app-tab">Panel de control</button>
          </nav>
          <div className="planning-calendar-app-user">
            <span>{overview ? firstName(overview.athlete_name) : "Atleta"}</span>
            <button type="button" className="planning-calendar-back subtle" onClick={closeCalendarPanel}>
              Volver
            </button>
          </div>
        </header>

        <div className="planning-calendar-app-body">
          <section className="planning-calendar-app-workspace">
            {renderWorkspace()}
          </section>
          <IntelligenceBanner overview={overview} />
        </div>
      </div>

      {/* Quick Add Modal */}
      {calendarQuickAdd && (
        <QuickAddModal
          calendarQuickAdd={calendarQuickAdd}
          quickAddDiscipline={quickAddDiscipline}
          quickAddDisciplineLibrary={quickAddDisciplineLibrary}
          quickAddAvailableLayers={quickAddAvailableLayers}
          quickAddActiveLayer={quickAddActiveLayer}
          quickAddLayerCounts={quickAddLayerCounts}
          quickAddFilteredLibrary={quickAddFilteredLibrary}
          quickAddLibraries={quickAddLibraries}
          overview={overview}
          templateLibrary={templateLibrary}
          dispatch={dispatch}
          closeCalendarQuickAdd={closeCalendarQuickAdd}
          openCalendarWorkoutLibrary={openCalendarWorkoutLibrary}
          openLibraryWorkoutPreview={openLibraryWorkoutPreview}
          openCalendarMesocycleComposer={openCalendarMesocycleComposer}
        />
      )}

      {/* Workout Preview Modal */}
      {openWorkoutPreview && (
        <WorkoutPreviewModal
          template={openWorkoutPreview.template}
          selection={openWorkoutPreview.selection}
          rawInformation={activePlannedPreviewSession ? {
            active: showPlannedSessionRawInformation,
            onToggle: () => dispatch({ type: "SET_SHOW_PLANNED_SESSION_RAW_INFORMATION", payload: !showPlannedSessionRawInformation }),
            label: "Raw information",
            statusLabel: planningPublishStatusMeta(activePlannedPreviewSession.publish_status).label,
            statusTone: planningPublishStatusMeta(activePlannedPreviewSession.publish_status).tone,
            panel: (
              <>
                {plannedSessionStructuredPreviewJson ? (
                  <section className="library-workout-panel library-workout-raw-panel">
                    <div className="planning-session-raw-head">
                      <div className="library-workout-panel-head">
                        <span className="eyebrow">Raw information</span>
                        <h3>Bloque estructurado para publicación futura</h3>
                      </div>
                      <button
                        type="button"
                        className="planning-inline-action"
                        onClick={() => regeneratePlannedSessionStructure(activePlannedPreviewSession.id)}
                        disabled={plannedSessionRegeneratingId === activePlannedPreviewSession.id}
                      >
                        {plannedSessionRegeneratingId === activePlannedPreviewSession.id ? "Regenerando..." : "Regenerar estructura"}
                      </button>
                    </div>
                    <p className="library-workout-raw-copy">
                      Estado actual: {planningPublishStatusMeta(activePlannedPreviewSession.publish_status).description}
                      {activePlannedPreviewSession.publish_provider ? ` Proveedor: ${activePlannedPreviewSession.publish_provider}.` : ""}
                    </p>
                    <div className="library-workout-raw-json">
                      <pre>{plannedSessionStructuredPreviewJson}</pre>
                    </div>
                  </section>
                ) : null}

                {showPlannedSessionRawInformation && plannedSessionStructuredPreviewLoading && !plannedSessionStructuredPreviewJson ? (
                  <section className="library-workout-panel library-workout-raw-panel">
                    <div className="library-workout-panel-head">
                      <span className="eyebrow">Raw information</span>
                      <h3>Construyendo bloque estructurado…</h3>
                    </div>
                    <p className="library-workout-raw-copy">Estamos pidiendo al backend la versión canónica de la sesión planificada.</p>
                  </section>
                ) : null}

                {showPlannedSessionRawInformation && plannedSessionStructuredPreviewError && !plannedSessionStructuredPreviewLoading ? (
                  <section className="library-workout-panel library-workout-raw-panel">
                    <div className="planning-session-raw-head">
                      <div className="library-workout-panel-head">
                        <span className="eyebrow">Raw information</span>
                        <h3>No se pudo construir el bloque</h3>
                      </div>
                      <button
                        type="button"
                        className="planning-inline-action"
                        onClick={() => regeneratePlannedSessionStructure(activePlannedPreviewSession.id)}
                        disabled={plannedSessionRegeneratingId === activePlannedPreviewSession.id}
                      >
                        {plannedSessionRegeneratingId === activePlannedPreviewSession.id ? "Regenerando..." : "Reintentar"}
                      </button>
                    </div>
                    <p className="library-workout-raw-copy">{plannedSessionStructuredPreviewError}</p>
                  </section>
                ) : null}
              </>
            ),
          } : null}
          workoutDefinition={editableWorkoutDefinition}
          onRenameSession={activePlannedPreviewSession ? handleRenameSession : undefined}
          onSaveCoachNote={activePlannedPreviewSession ? handleSaveCoachNote : undefined}
          coachNote={activePlannedPreviewSession?.coach_note ?? null}
          onSaveWorkout={activePlannedPreviewSession ? handleSaveWorkoutSteps : undefined}
          onPushToGarmin={activePlannedPreviewSession ? handlePushToGarmin : undefined}
          garminConnected={selectedAthlete?.garmin_connected ?? false}
          publishStatus={activePlannedPreviewSession?.publish_status ?? null}
          thresholdReference={{
            lt1Label: planningLt1 ? `${formatThresholdPrimaryMetric(planningLt1, selectedDiscipline)}${planningLt1.heartRate ? ` · ${Math.round(planningLt1.heartRate)} bpm` : ""}` : null,
            lt1Source: planningLt1?.sourceLabel ?? null,
            lt2Label: planningLt2 ? `${formatThresholdPrimaryMetric(planningLt2, selectedDiscipline)}${planningLt2.heartRate ? ` · ${Math.round(planningLt2.heartRate)} bpm` : ""}` : null,
            lt2Source: planningLt2?.sourceLabel ?? null,
          }}
          onClose={() => {
            dispatch({ type: "SET_SHOW_PLANNED_SESSION_RAW_INFORMATION", payload: false });
            dispatch({ type: "SET_OPEN_WORKOUT_PREVIEW", payload: null });
          }}
        />
      )}

      {/* Planning Source Modal */}
      {planningSourceModal && (
        <div className="target-modal-backdrop" onClick={() => dispatch({ type: "SET_PLANNING_SOURCE_MODAL", payload: null })}>
          <section className="card target-modal-card planning-source-modal" onClick={(event) => event.stopPropagation()}>
            <div className="library-workout-modal-head">
              <div>
                <span className="eyebrow">
                  {planningSourceModal.source.kind === "draft" ? "Borrador" : planningSourceModal.source.kind === "planned" ? "Bloque real" : "Histórico útil"}
                </span>
                <h2>{planningSourceModal.title}</h2>
                <p>{planningSourceModal.summary}</p>
              </div>
              <button type="button" className="ghost-button" onClick={() => dispatch({ type: "SET_PLANNING_SOURCE_MODAL", payload: null })}>
                Cerrar
              </button>
            </div>
            <div className="planning-source-modal-body">
              <article className="planning-source-modal-card">
                <span className="planning-kicker">Objetivo del mesociclo</span>
                <strong>{planningSourceModal.source.objective}</strong>
                <p>{planningSourceModal.source.intent || "Sin intención operativa detallada."}</p>
              </article>
              {overview?.next_recommendation ? (
                <article className="planning-source-modal-card">
                  <span className="planning-kicker">Por qué el sistema prioriza este mesociclo</span>
                  <strong>{overview.next_recommendation.recommended_block_label}</strong>
                  <p>{overview.next_recommendation.template_summary || overview.next_recommendation.reasoning[0] || "Sin explicación prioritaria disponible."}</p>
                  <div className="planning-modal-reading-grid">
                    {(overview.next_recommendation.reasoning ?? []).slice(0, 3).map((item, index) => (
                      <article key={item} className="planning-modal-reading-item">
                        <span>{index === 0 ? "Lectura principal" : index === 1 ? "Bloque sugerido" : "Criterio adicional"}</span>
                        <strong>{item}</strong>
                      </article>
                    ))}
                  </div>
                </article>
              ) : null}
              <article className="planning-source-modal-card">
                <span className="planning-kicker">Características</span>
                <ul className="planning-note-list">
                  {planningSourceModal.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </article>
              {(overview?.next_recommendation.candidates_scored?.length ?? 0) > 0 ? (
                <article className="planning-source-modal-card">
                  <span className="planning-kicker">Posiciones por scoring entre mesociclos</span>
                  <div className="planning-modal-score-list">
                    {overview!.next_recommendation.candidates_scored!.map((candidate, index) => (
                      <article key={candidate.block_type} className={`planning-modal-score-item ${index === 0 ? "winner" : ""}`}>
                        <div className="planning-modal-score-head">
                          <strong>{index + 1}. {BLOCK_LABELS[candidate.block_type] ?? candidate.block_type}</strong>
                          <span>{candidate.score} pts</span>
                        </div>
                        <p>{candidate.reasons[0] || "Sin argumento resumido."}</p>
                      </article>
                    ))}
                  </div>
                </article>
              ) : null}
              {planningSourceModal.source.notes ? (
                <article className="planning-source-modal-card">
                  <span className="planning-kicker">Notas</span>
                  <p>{planningSourceModal.source.notes}</p>
                </article>
              ) : null}
              {planningSourceModal.source.kind === "planned" && planningSourceModal.source.focusBlockId ? (
                <div className="planning-source-modal-actions">
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={deletePlanningSourceFromModal}
                    disabled={deletingBlockId === planningSourceModal.source.focusBlockId}
                  >
                    {deletingBlockId === planningSourceModal.source.focusBlockId ? "Eliminando..." : "Eliminar mesociclo"}
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ── Quick Add Modal (internal) ──

function QuickAddModal({
  calendarQuickAdd,
  quickAddDiscipline,
  quickAddDisciplineLibrary,
  quickAddAvailableLayers,
  quickAddActiveLayer,
  quickAddLayerCounts,
  quickAddFilteredLibrary,
  quickAddLibraries,
  overview,
  templateLibrary,
  dispatch,
  closeCalendarQuickAdd,
  openCalendarWorkoutLibrary,
  openLibraryWorkoutPreview,
  openCalendarMesocycleComposer,
}: {
  calendarQuickAdd: CalendarQuickAddState;
  quickAddDiscipline: string;
  quickAddDisciplineLibrary: PlanningWorkoutTemplate[];
  quickAddAvailableLayers: WorkoutLibraryLayer[];
  quickAddActiveLayer: WorkoutLibraryLayer | null;
  quickAddLayerCounts: Record<string, number>;
  quickAddFilteredLibrary: PlanningWorkoutTemplate[];
  quickAddLibraries: Record<string, PlanningWorkoutTemplate[]>;
  overview: PlanningOverview | null;
  templateLibrary: PlanningMesocycleTemplate[];
  dispatch: (action: import("../context/PlanningContext").PlanningAction) => void;
  closeCalendarQuickAdd: () => void;
  openCalendarWorkoutLibrary: (date: string, discipline: "running" | "ciclismo" | "natación") => void;
  openLibraryWorkoutPreview: (template: PlanningWorkoutTemplate) => void;
  openCalendarMesocycleComposer: (date: string) => void;
}) {
  return (
    <div className="target-modal-backdrop" onClick={closeCalendarQuickAdd}>
      <section className="card target-modal-card planning-calendar-quick-add-modal" onClick={(event) => event.stopPropagation()}>
        <div className="planning-calendar-quick-add-head">
          <div className="planning-calendar-quick-add-title">
            <span className="eyebrow">Anadir al calendario</span>
            <h2>{formatDate(calendarQuickAdd.date)}</h2>
            <p>
              {calendarQuickAdd.mode === "library"
                ? `Biblioteca de ${disciplineLabel(quickAddDiscipline)} con subcapas para moverte por base, subumbral, LT2 y mas.`
                : calendarQuickAdd.mode === "manual"
                  ? "Accion manual del dia preparada como acceso directo. La persistencia la conectamos despues sin tocar esta navegacion."
                  : "Elige el tipo de elemento que quieres anadir hoy, con una entrada directa por disciplina y accesos rapidos manuales."}
            </p>
          </div>
          <div className="planning-calendar-quick-add-actions">
            {calendarQuickAdd.mode !== "actions" ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => dispatch({
                  type: "SET_CALENDAR_QUICK_ADD",
                  payload: {
                    date: calendarQuickAdd.date,
                    mode: "actions",
                    selectedKind: "running",
                    selectedDiscipline: "running",
                  },
                })}
              >
                Volver
              </button>
            ) : null}
            <button type="button" className="ghost-button" onClick={closeCalendarQuickAdd}>
              Cerrar
            </button>
          </div>
        </div>

        {calendarQuickAdd.mode === "library" ? (
          <div className="planning-calendar-quick-add-library">
            <div className="planning-calendar-quick-add-section-head">
              <span className="planning-kicker">Biblioteca de sesiones</span>
              <strong>{disciplineLabel(quickAddDiscipline)} · {quickAddFilteredLibrary.length} opciones visibles</strong>
            </div>
            <div className="planning-calendar-quick-add-discipline-tabs">
              {(["running", "ciclismo", "natación"] as const).map((discipline) => (
                <button
                  key={discipline}
                  type="button"
                  className={`planning-calendar-quick-add-tab ${quickAddDiscipline === discipline ? "active" : ""}`}
                  onClick={() => dispatch({
                    type: "SET_CALENDAR_QUICK_ADD",
                    payload: {
                      ...calendarQuickAdd,
                      mode: "library",
                      selectedKind: discipline,
                      selectedDiscipline: discipline,
                      selectedLayer: undefined,
                    },
                  })}
                >
                  <span className="planning-calendar-quick-add-tab-label">
                    <QuickAddIcon kind={discipline} />
                    {disciplineLabel(discipline)}
                  </span>
                </button>
              ))}
            </div>
            <div className="planning-calendar-quick-add-category-list">
              {quickAddAvailableLayers.map((layer) => {
                const tone = workoutLayerTone(layer);
                const isActive = quickAddActiveLayer === layer;
                return (
                  <button
                    key={layer}
                    type="button"
                    className={`planning-calendar-quick-add-category tone-${tone} ${isActive ? "active" : ""}`}
                    onClick={() => dispatch({
                      type: "SET_CALENDAR_QUICK_ADD",
                      payload: { ...calendarQuickAdd, selectedLayer: layer },
                    })}
                  >
                    <span className={`planning-calendar-quick-add-category-glyph tone-${tone}`}>{workoutLayerGlyph(layer)}</span>
                    <span className="planning-calendar-quick-add-category-copy">
                      <strong>{workoutLayerLabel(layer)}</strong>
                      <small>{workoutLayerCue(layer)}</small>
                    </span>
                    <span className="planning-calendar-quick-add-category-count">{quickAddLayerCounts[layer] ?? 0} sesiones</span>
                  </button>
                );
              })}
            </div>
            <div className="planning-calendar-quick-add-grid library">
              {quickAddFilteredLibrary.map((template) => {
                const isRecommended = (overview?.recommended_workouts ?? []).some((item) => item.template_id === template.template_id);
                const firstDose = template.dose_ladder[0];
                return (
                  <button
                    key={template.template_id}
                    type="button"
                    className={`planning-calendar-quick-add-card ${isRecommended ? "recommended" : ""}`}
                    onClick={() => openLibraryWorkoutPreview(template)}
                  >
                    <div className="planning-calendar-quick-add-card-top">
                      <div className="planning-calendar-quick-add-card-hero">
                        <QuickAddIcon kind={quickAddDiscipline as "running" | "ciclismo" | "natación"} large />
                      </div>
                      <span className="planning-kicker">{workoutLayerLabel(workoutLayerForTemplate(template))}</span>
                      {isRecommended ? <span className="planning-calendar-quick-add-badge">Sugerida</span> : null}
                    </div>
                    <strong>{template.public_label}</strong>
                    <small>
                      {firstDose?.intensity_zone || template.objective}
                      {firstDose?.total_duration_min ? ` · ${firstDose.total_duration_min} min` : ""}
                    </small>
                  </button>
                );
              })}
              {!quickAddFilteredLibrary.length ? (
                <article className="planning-empty-state">
                  <strong>Sin sesiones en esta subcapa.</strong>
                  <p>Cambia de capa o de disciplina para seguir navegando la biblioteca.</p>
                </article>
              ) : null}
            </div>
          </div>
        ) : calendarQuickAdd.mode === "manual" ? (
          <div className="planning-calendar-quick-add-manual">
            <div className="planning-calendar-quick-add-section-head">
              <span className="planning-kicker">Entrada manual</span>
              <strong>
                {calendarQuickAdd.selectedKind === "event"
                  ? "Evento"
                  : calendarQuickAdd.selectedKind === "off"
                    ? "Dia off"
                    : "Nota"}
              </strong>
            </div>
            <div className="planning-calendar-quick-add-grid">
              <article className="planning-calendar-quick-add-card accent">
                <div className="planning-calendar-quick-add-card-top">
                  <div className="planning-calendar-quick-add-card-hero">
                    <QuickAddIcon kind={calendarQuickAdd.selectedKind} large />
                  </div>
                  <span className="planning-kicker">Acceso preparado</span>
                </div>
                <strong>
                  {calendarQuickAdd.selectedKind === "event"
                    ? "Evento del calendario"
                    : calendarQuickAdd.selectedKind === "off"
                      ? "Dia de descanso"
                      : "Nota del entrenador"}
                </strong>
                <small>UI lista. Falta conectar el guardado manual real.</small>
              </article>
            </div>
          </div>
        ) : (
          <div className="planning-calendar-quick-add-body">
            <div className="planning-calendar-quick-add-grid actions">
              {(["running", "ciclismo", "natación"] as const).map((discipline) => (
                <button
                  key={discipline}
                  type="button"
                  className="planning-calendar-quick-add-card primary"
                  onClick={() => openCalendarWorkoutLibrary(calendarQuickAdd.date, discipline)}
                >
                  <div className="planning-calendar-quick-add-card-top">
                    <div className="planning-calendar-quick-add-card-hero">
                      <QuickAddIcon kind={discipline} large />
                    </div>
                    <span className="planning-kicker">Disciplina</span>
                  </div>
                  <strong>{discipline === "running" ? "Carrera a pie" : discipline === "ciclismo" ? "Ciclismo" : "Natacion"}</strong>
                  <small>{(quickAddLibraries[discipline] ?? []).length} plantillas</small>
                </button>
              ))}

              <button
                type="button"
                className="planning-calendar-quick-add-card"
                onClick={() => dispatch({
                  type: "SET_CALENDAR_QUICK_ADD",
                  payload: { ...calendarQuickAdd, mode: "manual", selectedKind: "event" },
                })}
              >
                <div className="planning-calendar-quick-add-card-top">
                  <div className="planning-calendar-quick-add-card-hero">
                    <QuickAddIcon kind="event" large />
                  </div>
                  <span className="planning-kicker">Manual</span>
                </div>
                <strong>Evento</strong>
                <small>Acceso rapido del calendario</small>
              </button>

              <button
                type="button"
                className="planning-calendar-quick-add-card"
                onClick={() => dispatch({
                  type: "SET_CALENDAR_QUICK_ADD",
                  payload: { ...calendarQuickAdd, mode: "manual", selectedKind: "off" },
                })}
              >
                <div className="planning-calendar-quick-add-card-top">
                  <div className="planning-calendar-quick-add-card-hero">
                    <QuickAddIcon kind="off" large />
                  </div>
                  <span className="planning-kicker">Manual</span>
                </div>
                <strong>Dia off</strong>
                <small>Descanso y disponibilidad</small>
              </button>

              <button
                type="button"
                className="planning-calendar-quick-add-card"
                onClick={() => dispatch({
                  type: "SET_CALENDAR_QUICK_ADD",
                  payload: { ...calendarQuickAdd, mode: "manual", selectedKind: "note" },
                })}
              >
                <div className="planning-calendar-quick-add-card-top">
                  <div className="planning-calendar-quick-add-card-hero">
                    <QuickAddIcon kind="note" large />
                  </div>
                  <span className="planning-kicker">Manual</span>
                </div>
                <strong>Nota</strong>
                <small>Contexto, recordatorios y consignas</small>
              </button>

              <button
                type="button"
                className="planning-calendar-quick-add-card accent"
                onClick={() => openCalendarMesocycleComposer(calendarQuickAdd.date)}
              >
                <div className="planning-calendar-quick-add-card-top">
                  <div className="planning-calendar-quick-add-card-hero">
                    <QuickAddIcon kind="mesocycle" large />
                  </div>
                  <span className="planning-kicker">Bloques</span>
                </div>
                <strong>Mesociclo</strong>
                <small>{templateLibrary.length} mesociclos utilizables</small>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
