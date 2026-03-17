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
import { WorkoutBlockBuilder, blocksToDescription, type WBlock } from "./WorkoutBlockBuilder";
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
import { PlanningCompactHeader } from "./PlanningCompactHeader";
import { QuickAddIcon } from "./QuickAddIcon";
import { CalendarAthletesTab } from "./CalendarAthletesTab";
import { CalendarLibraryTab } from "./CalendarLibraryTab";
import { CalendarSummaryTab } from "./CalendarSummaryTab";
import { MesocycleComposer } from "./MesocycleComposer";
import { CalendarView } from "./CalendarView";
import { IntelligenceBanner } from "./IntelligenceBanner";
import { LibraryWeekEditor } from "./LibraryWeekEditor";
import { TrainingPlanEditor } from "./TrainingPlanEditor";
import { TrainingPlansPanel } from "./TrainingPlansPanel";
import { WorkoutLibraryPanel } from "./WorkoutLibraryPanel";
import type { PlanningState } from "../context/PlanningContext";

// ── Inline CalendarZonesTab (multi-discipline) ───────────────────────────

type StalenessResult = {
  is_stale: boolean; reason: string | null;
  lt2_pace_delta_seconds: number | null; lt2_hr_delta: number | null; lt2_power_delta: number | null;
  lt1_pace_delta_seconds: number | null; lt1_hr_delta: number | null; lt1_power_delta: number | null;
};

function DisciplineZoneCard({ athleteId, discipline, token, onEdit, onCreateNew }: {
  athleteId: number;
  discipline: string;
  token: string;
  onEdit: (zoneSet: TrainingZoneSet) => void;
  onCreateNew: () => void;
}) {
  const [zoneSets, setZoneSets] = useState<TrainingZoneSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [staleness, setStaleness] = useState<StalenessResult | null>(null);

  const loadZones = useCallback(() => {
    setLoading(true);
    api.trainingZoneSets(token, athleteId, discipline)
      .then((data) => setZoneSets(data as TrainingZoneSet[]))
      .catch(() => setZoneSets([]))
      .finally(() => setLoading(false));
  }, [token, athleteId, discipline]);

  useEffect(() => { loadZones(); }, [loadZones]);

  useEffect(() => {
    api.zoneStalenessCheck(token, athleteId, discipline)
      .then((data) => setStaleness(data))
      .catch(() => setStaleness(null));
  }, [token, athleteId, discipline]);

  const activeSet = zoneSets.find((zs) => zs.is_active) ?? null;
  const discLabel = discipline === "ciclismo" ? "Ciclismo" : discipline === "natación" ? "Natación" : "Carrera a pie";
  const discAccent = discipline === "running" ? "#22c55e" : discipline === "ciclismo" ? "#f59e0b" : "#0ea5e9";

  return (
    <div className="zones-discipline-card" style={{ borderLeftColor: discAccent }}>
      <div className="zones-discipline-card-head">
        <strong>{discLabel}</strong>
        {staleness?.is_stale ? (
          <span className="zones-stale-badge" title={staleness.reason ?? ""}>Actualizar zonas</span>
        ) : activeSet ? (
          <span className="zones-ok-badge">OK</span>
        ) : null}
      </div>

      {loading ? (
        <p className="zones-discipline-loading">Cargando...</p>
      ) : activeSet ? (
        <>
          <TrainingZonesDisplay zoneSet={activeSet} discipline={discipline} onEdit={() => onEdit(activeSet)} compact />
          {staleness?.is_stale ? (
            <div className="zones-stale-detail">
              <p>{staleness.reason}</p>
              {staleness.lt2_pace_delta_seconds != null ? (
                <span>LT2 pace: {staleness.lt2_pace_delta_seconds > 0 ? "+" : ""}{staleness.lt2_pace_delta_seconds.toFixed(0)}s/km</span>
              ) : null}
              {staleness.lt2_hr_delta != null ? (
                <span>LT2 FC: {staleness.lt2_hr_delta > 0 ? "+" : ""}{staleness.lt2_hr_delta} bpm</span>
              ) : null}
              {staleness.lt2_power_delta != null ? (
                <span>LT2 pot: {staleness.lt2_power_delta > 0 ? "+" : ""}{staleness.lt2_power_delta.toFixed(0)}W</span>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="zones-discipline-empty">Sin zonas definidas</p>
      )}

      <div className="zones-discipline-card-actions">
        {activeSet ? (
          <>
            <button type="button" className="tz-edit-btn" onClick={() => onEdit(activeSet)}>Editar</button>
            <button type="button" className="tz-suggest-btn" onClick={onCreateNew}>Nuevo conjunto</button>
          </>
        ) : (
          <button type="button" className="tz-suggest-btn" onClick={onCreateNew}>Crear zonas</button>
        )}
        {zoneSets.filter((zs) => !zs.is_active).length > 0 ? (
          <details className="zones-archived-detail">
            <summary>{zoneSets.filter((zs) => !zs.is_active).length} archivado{zoneSets.filter((zs) => !zs.is_active).length > 1 ? "s" : ""}</summary>
            <div className="zones-archived-list">
              {zoneSets.filter((zs) => !zs.is_active).map((zs) => (
                <div key={zs.id} className="zones-archived-item">
                  <span>{zs.name}</span>
                  <button type="button" className="tz-edit-btn" onClick={() => {
                    api.activateTrainingZoneSet(token, athleteId, zs.id).then(() => loadZones());
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

function CalendarZonesTab({ athleteId, disciplines, token, athleteName }: {
  athleteId: string | null;
  disciplines: string[];
  token: string;
  athleteName: string;
}) {
  const [editingDiscipline, setEditingDiscipline] = useState<string | null>(null);
  const [editingSet, setEditingSet] = useState<TrainingZoneSet | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!athleteId) {
    return <div className="planning-calendar-tab-empty"><p>Selecciona un atleta para ver sus zonas.</p></div>;
  }

  if (editingDiscipline) {
    return (
      <div style={{ padding: "24px 28px", overflowY: "auto", height: "100%" }}>
        <TrainingZonesEditor
          athleteId={Number(athleteId)}
          discipline={editingDiscipline}
          token={token}
          existingSet={editingSet}
          onSave={() => { setEditingDiscipline(null); setEditingSet(null); setRefreshKey((k) => k + 1); }}
          onCancel={() => { setEditingDiscipline(null); setEditingSet(null); }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px", display: "grid", gap: 20, overflowY: "auto", height: "100%", alignContent: "start" }}>
      <div style={{ display: "grid", gap: 6 }}>
        <span className="eyebrow">Zonas de entrenamiento</span>
        <h2 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.3rem" }}>
          {athleteName}
        </h2>
      </div>

      {disciplines.map((disc) => (
        <DisciplineZoneCard
          key={`${disc}-${refreshKey}`}
          athleteId={Number(athleteId)}
          discipline={disc}
          token={token}
          onEdit={(zs) => { setEditingSet(zs); setEditingDiscipline(disc); }}
          onCreateNew={() => { setEditingSet(null); setEditingDiscipline(disc); }}
        />
      ))}
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
  handleChangeTargetMode?: (mode: "pace" | "hr" | "power") => Promise<void>;
  loadPlanningContext: (athleteId: string, discipline: string) => Promise<void>;
  onCopyWeek?: () => void;
  showAllDisciplines?: boolean;
  onToggleAllDisciplines?: () => void;
  hasMultipleDisciplines?: boolean;
  // Navigation refs and handlers
  navRefs: CalendarNavigationRefs;
  jumpCalendarToToday: () => void;
  shiftCalendarBackward: () => void;
  shiftCalendarForward: () => void;
  handleContinuousWeekScroll: () => void;
  handleContinuousMonthScroll: () => void;
  onAddSessionToDay: (date: string, discipline: string, template: PlanningWorkoutTemplate | null, manualLabel?: string, opts?: { bla_check?: boolean; objective?: string; session_family?: string }) => Promise<void>;
  onReviewSession?: (session: CalendarEntry) => void;
  // Compact header data (calendar-first redesign)
  compactHeader?: {
    athletes: Athlete[];
    availableDisciplines: string[];
    visibleTargets: import("../../types").AthleteTarget[];
    planningLt1: ReturnType<typeof import("../utils").resolveTrainingThreshold>;
    planningLt2: ReturnType<typeof import("../utils").resolveTrainingThreshold>;
  };
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
  handleChangeTargetMode,
  loadPlanningContext,
  onCopyWeek,
  showAllDisciplines,
  onToggleAllDisciplines,
  hasMultipleDisciplines,
  navRefs,
  jumpCalendarToToday,
  shiftCalendarBackward,
  shiftCalendarForward,
  handleContinuousWeekScroll,
  handleContinuousMonthScroll,
  onAddSessionToDay,
  onReviewSession,
  compactHeader,
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
    coachLibraries,
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

  // ── Library Week Editor ──
  const [libraryWeekEditorOpen, setLibraryWeekEditorOpen] = useState(false);
  const [libraryWeekEditorTarget, setLibraryWeekEditorTarget] = useState<import("../../types").CoachLibrary | null>(null);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [planEditorTarget, setPlanEditorTarget] = useState<import("../../types").CoachPlan | null>(null);

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

  const handleDeleteSession = useCallback(async (session: CalendarEntry) => {
    if (session.rawId == null) return;
    dispatch({ type: "DELETE_SESSION", payload: { sessionId: session.rawId } });
    try {
      await api.deletePlannedSession(token, session.rawId);
      if (athleteId) await loadPlanningContext(String(athleteId), selectedDiscipline);
    } catch (err) {
      console.error("[DnD] Error al eliminar sesión:", err);
      if (athleteId) await loadPlanningContext(String(athleteId), selectedDiscipline);
    }
  }, [athleteId, dispatch, loadPlanningContext, selectedDiscipline, token]);

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
          onAddToDay={(template, date) => {
            onAddSessionToDay(date, template.discipline, template);
          }}
        />
      );
    }

    if (calendarWorkspaceTab === "workouts") {
      return (
        <WorkoutLibraryPanel
          workoutLibrary={workoutLibrary}
          coachLibraries={coachLibraries}
          overview={overview}
          selectedDiscipline={selectedDiscipline}
          token={token}
          dispatch={dispatch}
          onPreview={openLibraryWorkoutPreview}
          onAddSessionToDay={onAddSessionToDay}
          onOpenWeekEditor={(lib) => { setLibraryWeekEditorTarget(lib ?? null); setLibraryWeekEditorOpen(true); }}
          athleteId={athleteId}
        />
      );
    }

    if (calendarWorkspaceTab === "plans") {
      return (
        <TrainingPlansPanel
          coachPlans={state.coachPlans}
          token={token}
          dispatch={dispatch}
          onCreatePlan={() => { setPlanEditorTarget(null); setPlanEditorOpen(true); }}
          onEditPlan={(plan) => { setPlanEditorTarget(plan); setPlanEditorOpen(true); }}
        />
      );
    }

    if (calendarWorkspaceTab === "zones") {
      const allDisciplines = ["running", "ciclismo", "natación"];
      return (
        <CalendarZonesTab
          athleteId={athleteId}
          disciplines={allDisciplines}
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
        onDeleteSession={handleDeleteSession}
        onReviewSession={onReviewSession}
        showAllDisciplines={showAllDisciplines}
        onToggleAllDisciplines={onToggleAllDisciplines}
        hasMultipleDisciplines={hasMultipleDisciplines}
        calendarWeekScrollerRef={navRefs.calendarWeekScrollerRef}
        calendarWeekSectionRefs={navRefs.calendarWeekSectionRefs}
        calendarMonthScrollerRef={navRefs.calendarMonthScrollerRef}
        calendarMonthSectionRefs={navRefs.calendarMonthSectionRefs}
      />
    );
  };

  return (
    <div className="planning-calendar-overlay-page planning-redesign">
      {compactHeader ? (
        <PlanningCompactHeader
          overview={overview ? { athlete_name: overview.athlete_name, athlete_id: overview.athlete_id } : null}
          athletes={compactHeader.athletes}
          athleteId={athleteId}
          selectedDiscipline={selectedDiscipline}
          availableDisciplines={compactHeader.availableDisciplines}
          visibleTargets={compactHeader.visibleTargets}
          planningLt1={compactHeader.planningLt1}
          planningLt2={compactHeader.planningLt2}
          activeBlockLabel={activeBlockLabel}
          onAthleteChange={updatePlanningRoute}
        />
      ) : (
        <button type="button" className="planning-calendar-overlay-close" onClick={closeCalendarPanel} aria-label="Cerrar calendario">
          ×
        </button>
      )}

      <div className="planning-calendar-app">
        <nav className="planning-calendar-app-nav-strip">
          <button
            type="button"
            className={`planning-nav-tab ${calendarWorkspaceTab === "calendar" ? "active" : ""}`}
            onClick={() => openCalendarWorkspaceTab("calendar")}
          >
            Calendario
          </button>
          <button
            type="button"
            className={`planning-nav-tab ${calendarWorkspaceTab === "athletes" ? "active" : ""}`}
            onClick={() => openCalendarWorkspaceTab("athletes")}
          >
            Atletas
          </button>
          <button
            type="button"
            className={`planning-nav-tab ${calendarWorkspaceTab === "library" ? "active" : ""}`}
            onClick={() => openCalendarWorkspaceTab("library")}
          >
            Biblioteca
          </button>
          <button
            type="button"
            className={`planning-nav-tab ${calendarWorkspaceTab === "summary" ? "active" : ""}`}
            onClick={() => openCalendarWorkspaceTab("summary")}
          >
            Resumen
          </button>
          <button
            type="button"
            className={`planning-nav-tab ${calendarWorkspaceTab === "zones" ? "active" : ""}`}
            onClick={() => openCalendarWorkspaceTab("zones")}
          >
            Zonas
          </button>
          <button
            type="button"
            className={`planning-nav-tab ${calendarWorkspaceTab === "workouts" ? "active" : ""}`}
            onClick={() => openCalendarWorkspaceTab("workouts")}
          >
            Entrenos
          </button>
          <button
            type="button"
            className={`planning-nav-tab ${calendarWorkspaceTab === "plans" ? "active" : ""}`}
            onClick={() => openCalendarWorkspaceTab("plans")}
          >
            Planes
          </button>
        </nav>

        <IntelligenceBanner overview={overview} />

        <div className="planning-calendar-app-body">
          <section className="planning-calendar-app-workspace">
            {renderWorkspace()}
          </section>
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
          onAddSessionToDay={onAddSessionToDay}
          coachLibraries={coachLibraries}
          token={token}
          onOpenWeekEditor={(lib) => { setLibraryWeekEditorTarget(lib ?? null); setLibraryWeekEditorOpen(true); }}
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
          targetMode={activePlannedPreviewSession?.target_mode ?? null}
          onChangeTargetMode={activePlannedPreviewSession && handleChangeTargetMode ? handleChangeTargetMode : undefined}
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
                  <span className="planning-kicker">Sugerencia del motor (modelo experto Olbrecht)</span>
                  <p className="muted" style={{ fontSize: 11, marginBottom: 6 }}>Basado en lógica fisiológica, no en RCTs. El entrenador decide.</p>
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

      {/* Training Plan Editor */}
      {planEditorOpen && (
        <TrainingPlanEditor
          token={token}
          athletes={athletes}
          dispatch={dispatch}
          onClose={() => { setPlanEditorOpen(false); setPlanEditorTarget(null); }}
          editPlan={planEditorTarget}
          loadPlanningContext={loadPlanningContext}
          selectedDiscipline={selectedDiscipline}
          athleteId={athleteId}
        />
      )}

      {/* Library Week Editor */}
      {libraryWeekEditorOpen && (
        <LibraryWeekEditor
          token={token}
          athletes={athletes}
          dispatch={dispatch}
          onClose={() => { setLibraryWeekEditorOpen(false); setLibraryWeekEditorTarget(null); }}
          editLibrary={libraryWeekEditorTarget}
          loadPlanningContext={loadPlanningContext}
          selectedDiscipline={selectedDiscipline}
          athleteId={athleteId}
        />
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
  onAddSessionToDay,
  coachLibraries,
  token,
  onOpenWeekEditor,
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
  onAddSessionToDay: (date: string, discipline: string, template: PlanningWorkoutTemplate | null, manualLabel?: string, opts?: { bla_check?: boolean; objective?: string; session_family?: string }) => Promise<void>;
  coachLibraries: import("../../types").CoachLibrary[];
  token: string;
  onOpenWeekEditor?: (lib?: import("../../types").CoachLibrary) => void;
}) {
  const [addingTemplate, setAddingTemplate] = useState<string | null>(null);
  const [expandedLayer, setExpandedLayer] = useState<WorkoutLibraryLayer | null>(null);
  const [blaCheck, setBlaCheck] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualLabel, setManualLabel] = useState("");

  // WorkoutBlockBuilder state for manual session creation
  const [builderBlocks, setBuilderBlocks] = useState<WBlock[]>([]);
  const [builderDiscipline, setBuilderDiscipline] = useState(quickAddDiscipline);
  const [builderName, setBuilderName] = useState("");
  const [builderFamily, setBuilderFamily] = useState("lt1_extensive");
  const [builderSaving, setBuilderSaving] = useState(false);

  // Templates for the expanded layer
  const expandedTemplates = useMemo(() => {
    if (!expandedLayer) return [];
    return quickAddDisciplineLibrary.filter((t) => workoutLayerForTemplate(t) === expandedLayer);
  }, [expandedLayer, quickAddDisciplineLibrary]);

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
            {/* Discipline tabs */}
            <div className="planning-calendar-quick-add-discipline-tabs">
              {(["running", "ciclismo", "natación"] as const).map((discipline) => (
                <button
                  key={discipline}
                  type="button"
                  className={`planning-calendar-quick-add-tab ${quickAddDiscipline === discipline ? "active" : ""}`}
                  onClick={() => {
                    setExpandedLayer(null);
                    setManualMode(false);
                    dispatch({
                      type: "SET_CALENDAR_QUICK_ADD",
                      payload: {
                        ...calendarQuickAdd,
                        mode: "library",
                        selectedKind: discipline,
                        selectedDiscipline: discipline,
                        selectedLayer: undefined,
                      },
                    });
                  }}
                >
                  <span className="planning-calendar-quick-add-tab-label">
                    <QuickAddIcon kind={discipline} />
                    {disciplineLabel(discipline)}
                  </span>
                </button>
              ))}
            </div>

            {/* BLa check toggle */}
            <label className="planning-bla-check-toggle">
              <input type="checkbox" checked={blaCheck} onChange={(e) => setBlaCheck(e.target.checked)} />
              <span className={`planning-bla-check-pill ${blaCheck ? "active" : ""}`}>
                <span className="planning-bla-check-icon">🩸</span> BLa check
              </span>
            </label>

            {/* Accordion categories */}
            <div className="planning-calendar-quick-add-accordion">
              {quickAddAvailableLayers.map((layer) => {
                const tone = workoutLayerTone(layer);
                const isExpanded = expandedLayer === layer;
                const count = quickAddLayerCounts[layer] ?? 0;
                const layerTemplates = isExpanded ? expandedTemplates : [];
                return (
                  <div key={layer} className={`planning-accordion-section ${isExpanded ? "expanded" : ""}`}>
                    <button
                      type="button"
                      className={`planning-accordion-header tone-${tone}`}
                      onClick={() => { setExpandedLayer(isExpanded ? null : layer); setManualMode(false); }}
                    >
                      <span className={`planning-calendar-quick-add-category-glyph tone-${tone}`}>{workoutLayerGlyph(layer)}</span>
                      <span className="planning-accordion-header-copy">
                        <strong>{workoutLayerLabel(layer)}</strong>
                        <small>{workoutLayerCue(layer)}</small>
                      </span>
                      <span className="planning-accordion-header-meta">
                        <span className="planning-calendar-quick-add-category-count">{count}</span>
                        <span className={`planning-accordion-chevron ${isExpanded ? "open" : ""}`}>▾</span>
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="planning-accordion-body">
                        {layerTemplates.map((template) => {
                          const isRecommended = (overview?.recommended_workouts ?? []).some((item) => item.template_id === template.template_id);
                          const firstDose = template.dose_ladder[0];
                          const isAdding = addingTemplate === template.template_id;
                          return (
                            <div key={template.template_id} className={`planning-accordion-item ${isRecommended ? "recommended" : ""}`}>
                              <button
                                type="button"
                                className="planning-accordion-item-info"
                                onClick={() => openLibraryWorkoutPreview(template)}
                              >
                                <strong>{template.public_label}</strong>
                                <small>
                                  {firstDose?.intensity_zone || template.objective}
                                  {firstDose?.total_duration_min ? ` · ${firstDose.total_duration_min} min` : ""}
                                </small>
                                {isRecommended ? <span className="planning-calendar-quick-add-badge">Sugerida</span> : null}
                              </button>
                              <button
                                type="button"
                                className="planning-accordion-item-add"
                                disabled={isAdding}
                                onClick={async () => {
                                  setAddingTemplate(template.template_id);
                                  try {
                                    await onAddSessionToDay(calendarQuickAdd.date, quickAddDiscipline, template, undefined, { bla_check: blaCheck });
                                    closeCalendarQuickAdd();
                                  } catch {
                                    setAddingTemplate(null);
                                  }
                                }}
                              >
                                {isAdding ? "..." : "+"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Manual session creation — full WorkoutBlockBuilder */}
              <div className={`planning-accordion-section ${manualMode ? "expanded" : ""}`}>
                <button
                  type="button"
                  className="planning-accordion-header tone-manual"
                  onClick={() => {
                    setManualMode(!manualMode);
                    setExpandedLayer(null);
                    if (!manualMode) {
                      setBuilderDiscipline(quickAddDiscipline);
                      setBuilderBlocks([]);
                      setBuilderName("");
                      setBuilderFamily("lt1_extensive");
                    }
                  }}
                >
                  <span className="planning-calendar-quick-add-category-glyph tone-manual">✏️</span>
                  <span className="planning-accordion-header-copy">
                    <strong>Crear entreno</strong>
                    <small>Diseña un entreno personalizado con bloques</small>
                  </span>
                  <span className="planning-accordion-header-meta">
                    <span className={`planning-accordion-chevron ${manualMode ? "open" : ""}`}>▾</span>
                  </span>
                </button>
                {manualMode && (
                  <div className="planning-accordion-body" style={{ padding: 0 }}>
                    <WorkoutBlockBuilder
                      blocks={builderBlocks}
                      discipline={builderDiscipline}
                      name={builderName}
                      family={builderFamily}
                      compact
                      saving={builderSaving}
                      saveLabel="Añadir entreno"
                      onChange={(update) => {
                        if (update.blocks !== undefined) setBuilderBlocks(update.blocks);
                        if (update.discipline !== undefined) setBuilderDiscipline(update.discipline);
                        if (update.name !== undefined) setBuilderName(update.name);
                        if (update.family !== undefined) setBuilderFamily(update.family);
                      }}
                      onSave={async () => {
                        setBuilderSaving(true);
                        try {
                          const label = builderName.trim() || `Sesión ${builderDiscipline}`;
                          const description = blocksToDescription(builderBlocks, builderDiscipline);
                          await onAddSessionToDay(
                            calendarQuickAdd.date,
                            builderDiscipline,
                            null,
                            label,
                            { bla_check: blaCheck, objective: description, session_family: builderFamily },
                          );
                          closeCalendarQuickAdd();
                        } catch {
                          setBuilderSaving(false);
                        }
                      }}
                      onCancel={() => {
                        setManualMode(false);
                        setBuilderBlocks([]);
                        setBuilderName("");
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Coach custom libraries */}
              <CoachLibrariesAccordion
                coachLibraries={coachLibraries}
                discipline={quickAddDiscipline}
                date={calendarQuickAdd.date}
                blaCheck={blaCheck}
                token={token}
                onOpenWeekEditor={onOpenWeekEditor}
                dispatch={dispatch}
                onAddSessionToDay={onAddSessionToDay}
                closeCalendarQuickAdd={closeCalendarQuickAdd}
              />
            </div>
          </div>
        ) : calendarQuickAdd.mode === "manual" ? (
          <ManualEntryForm
            calendarQuickAdd={calendarQuickAdd}
            onAddSessionToDay={onAddSessionToDay}
            closeCalendarQuickAdd={closeCalendarQuickAdd}
          />
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
                  <strong>{discipline === "running" ? "Carrera a pie" : discipline === "ciclismo" ? "Ciclismo" : "Natación"}</strong>
                  <small>{(quickAddLibraries[discipline] ?? []).length} plantillas</small>
                </button>
              ))}

              <button
                type="button"
                className="planning-calendar-quick-add-card primary"
                onClick={() => {
                  // Open library filtered to strength layer for running (most common strength context)
                  dispatch({
                    type: "SET_SELECTED_CALENDAR_DATE",
                    payload: calendarQuickAdd.date,
                  });
                  dispatch({
                    type: "SET_CALENDAR_QUICK_ADD",
                    payload: {
                      date: calendarQuickAdd.date,
                      mode: "library",
                      selectedKind: "fuerza",
                      selectedDiscipline: "running",
                      selectedLayer: "strength",
                    },
                  });
                }}
              >
                <div className="planning-calendar-quick-add-card-top">
                  <div className="planning-calendar-quick-add-card-hero">
                    <QuickAddIcon kind="fuerza" large />
                  </div>
                  <span className="planning-kicker">Disciplina</span>
                </div>
                <strong>Fuerza</strong>
                <small>Sesiones de fuerza y gym</small>
              </button>

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

// ── Manual Entry Form (event / off / note) ──

function ManualEntryForm({
  calendarQuickAdd,
  onAddSessionToDay,
  closeCalendarQuickAdd,
}: {
  calendarQuickAdd: CalendarQuickAddState;
  onAddSessionToDay: (date: string, discipline: string, template: PlanningWorkoutTemplate | null, manualLabel?: string, opts?: { bla_check?: boolean; objective?: string; session_family?: string }) => Promise<void>;
  closeCalendarQuickAdd: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const kind = calendarQuickAdd.selectedKind;

  const kindConfig = kind === "event"
    ? { title: "Evento", discipline: "running", family: "event", role: "event", placeholder: "Nombre del evento (ej: Carrera popular 10k)" }
    : kind === "off"
      ? { title: "Día de descanso", discipline: "running", family: "off", role: "off", placeholder: "" }
      : { title: "Nota del entrenador", discipline: "running", family: "note", role: "note", placeholder: "Escribe tu nota..." };

  const handleSave = async () => {
    setSaving(true);
    try {
      const finalLabel = kind === "off" ? "Día de descanso" : label.trim() || kindConfig.title;
      await onAddSessionToDay(calendarQuickAdd.date, kindConfig.discipline, null, finalLabel);
      closeCalendarQuickAdd();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="planning-calendar-quick-add-manual">
      <div className="planning-calendar-quick-add-section-head">
        <span className="planning-kicker">Entrada manual</span>
        <strong>{kindConfig.title}</strong>
      </div>
      <div className="planning-calendar-quick-add-manual-form">
        <div className="planning-calendar-quick-add-card-hero" style={{ marginBottom: 8 }}>
          <QuickAddIcon kind={kind} large />
        </div>
        {kind !== "off" && (
          <input
            type="text"
            className="planning-manual-input"
            placeholder={kindConfig.placeholder}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
        )}
        {kind === "note" && (
          <textarea
            className="planning-manual-textarea"
            placeholder="Detalles adicionales (opcional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            rows={3}
          />
        )}
        <button
          type="button"
          className="planning-manual-save-btn"
          disabled={saving || (kind !== "off" && !label.trim())}
          onClick={handleSave}
        >
          {saving ? "Guardando..." : `Añadir ${kindConfig.title.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}

// ── Coach Libraries Accordion ──

const COACH_FAMILY_OPTIONS = [
  { value: "recovery_regeneration", label: "Recuperación" },
  { value: "long_aerobic_durability", label: "Base / Aeróbico" },
  { value: "lt1_extensive", label: "LT1" },
  { value: "subthreshold_reps", label: "Subumbral" },
  { value: "lt2_cruise_intervals", label: "LT2 / Umbral" },
  { value: "vo2_hills", label: "VO2max" },
  { value: "economy_strides", label: "Técnica" },
  { value: "strength", label: "Fuerza" },
  { value: "specific", label: "Específico / Competición" },
  { value: "other", label: "Otro" },
];

function CoachLibrariesAccordion({
  coachLibraries,
  discipline,
  date,
  blaCheck,
  token,
  dispatch,
  onAddSessionToDay,
  closeCalendarQuickAdd,
  onOpenWeekEditor,
}: {
  coachLibraries: import("../../types").CoachLibrary[];
  discipline: string;
  date: string;
  blaCheck: boolean;
  token: string;
  dispatch: (action: import("../context/PlanningContext").PlanningAction) => void;
  onAddSessionToDay: (date: string, discipline: string, template: PlanningWorkoutTemplate | null, manualLabel?: string, opts?: { bla_check?: boolean; objective?: string; session_family?: string }) => Promise<void>;
  closeCalendarQuickAdd: () => void;
  onOpenWeekEditor?: (lib?: import("../../types").CoachLibrary) => void;
}) {
  const [expandedLibraryId, setExpandedLibraryId] = useState<number | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [creatingLibrary, setCreatingLibrary] = useState(false);
  const [newLibName, setNewLibName] = useState("");
  const [newLibDesc, setNewLibDesc] = useState("");
  // Add workout form
  const [addingWorkoutTo, setAddingWorkoutTo] = useState<number | null>(null);
  const [wLabel, setWLabel] = useState("");
  const [wFamily, setWFamily] = useState("lt1_extensive");
  const [wZone, setWZone] = useState("");
  const [wDuration, setWDuration] = useState("");
  const [wDesc, setWDesc] = useState("");
  const [savingWorkout, setSavingWorkout] = useState(false);

  const reloadLibraries = async () => {
    const updated = (await api.listCoachLibraries(token)) as import("../../types").CoachLibrary[];
    dispatch({ type: "SET_COACH_LIBRARIES", payload: updated });
  };

  const handleCreateLibrary = async () => {
    if (!newLibName.trim()) return;
    setCreatingLibrary(true);
    try {
      await api.createCoachLibrary(token, { name: newLibName.trim(), description: newLibDesc.trim() || null });
      await reloadLibraries();
      setNewLibName(""); setNewLibDesc("");
    } finally {
      setCreatingLibrary(false);
    }
  };

  const handleDeleteLibrary = async (id: number) => {
    await api.deleteCoachLibrary(token, id);
    await reloadLibraries();
  };

  const handleAddWorkout = async (libraryId: number) => {
    if (!wLabel.trim()) return;
    setSavingWorkout(true);
    try {
      await api.addWorkoutToLibrary(token, libraryId, {
        discipline,
        session_family: wFamily,
        public_label: wLabel.trim(),
        intensity_zone: wZone.trim() || null,
        duration_min: wDuration ? Number(wDuration) : null,
        description: wDesc.trim() || null,
      });
      await reloadLibraries();
      setWLabel(""); setWZone(""); setWDuration(""); setWDesc(""); setAddingWorkoutTo(null);
    } finally {
      setSavingWorkout(false);
    }
  };

  const handleDeleteWorkout = async (libraryId: number, workoutId: number) => {
    await api.deleteWorkoutFromLibrary(token, libraryId, workoutId);
    await reloadLibraries();
  };

  // Filter libraries: show all (discipline=null means multi-discipline) or matching discipline
  const visible = coachLibraries.filter((lib) => !lib.discipline || lib.discipline === discipline);
  const totalWorkouts = visible.reduce((sum, lib) => sum + lib.workouts.length, 0);

  return (
    <>
      {/* Libraries header */}
      <div className="planning-accordion-section coach expanded">
        <div className="planning-accordion-header tone-coach" style={{ cursor: "default" }}>
          <span className="planning-calendar-quick-add-category-glyph tone-coach">📋</span>
          <span className="planning-accordion-header-copy">
            <strong>Mis bibliotecas</strong>
            <small>{visible.length} bibliotecas · {totalWorkouts} entrenos</small>
          </span>
        </div>
        <div className="planning-accordion-body">
          {/* Each library */}
          {visible.map((lib) => {
            const isExpanded = expandedLibraryId === lib.id;
            const libWorkouts = lib.workouts.filter((w) => w.discipline === discipline);
            return (
              <div key={lib.id} className={`planning-coach-library ${isExpanded ? "expanded" : ""}`}>
                <div className="planning-coach-library-header">
                  <button
                    type="button"
                    className="planning-coach-library-toggle"
                    onClick={() => setExpandedLibraryId(isExpanded ? null : lib.id)}
                  >
                    <span className={`planning-accordion-chevron ${isExpanded ? "open" : ""}`}>▾</span>
                    <span className="planning-coach-library-name">
                      <strong>{lib.name}</strong>
                      <small>{libWorkouts.length} entrenos{lib.description ? ` · ${lib.description}` : ""}</small>
                    </span>
                  </button>
                  {onOpenWeekEditor && (
                    <button
                      type="button"
                      className="planning-accordion-item-add"
                      title="Editar semana"
                      onClick={() => onOpenWeekEditor(lib)}
                      style={{ fontSize: "0.68rem" }}
                    >
                      Ed
                    </button>
                  )}
                  <button
                    type="button"
                    className="planning-accordion-item-delete"
                    title="Eliminar biblioteca"
                    onClick={() => handleDeleteLibrary(lib.id)}
                  >
                    ×
                  </button>
                </div>
                {isExpanded && (
                  <div className="planning-coach-library-body">
                    {libWorkouts.map((w) => {
                      const isAddingThis = adding === w.id;
                      return (
                        <div key={w.id} className="planning-accordion-item">
                          <div className="planning-accordion-item-info" style={{ cursor: "default" }}>
                            <strong>{w.public_label}</strong>
                            <small>
                              {w.intensity_zone || COACH_FAMILY_OPTIONS.find((o) => o.value === w.session_family)?.label || w.session_family}
                              {w.duration_min ? ` · ${w.duration_min} min` : ""}
                            </small>
                          </div>
                          <button
                            type="button"
                            className="planning-accordion-item-add"
                            disabled={isAddingThis}
                            title="Añadir al día"
                            onClick={async () => {
                              setAdding(w.id);
                              try {
                                await onAddSessionToDay(date, discipline, null, w.public_label, { bla_check: blaCheck });
                                closeCalendarQuickAdd();
                              } catch {
                                setAdding(null);
                              }
                            }}
                          >
                            {isAddingThis ? "..." : "+"}
                          </button>
                          <button
                            type="button"
                            className="planning-accordion-item-delete"
                            title="Eliminar entreno"
                            onClick={() => handleDeleteWorkout(lib.id, w.id)}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}

                    {/* Add workout form */}
                    {addingWorkoutTo === lib.id ? (
                      <div className="planning-accordion-manual-form coach-create-form">
                        <input type="text" className="planning-manual-input" placeholder="Nombre del entreno" value={wLabel} onChange={(e) => setWLabel(e.target.value)} autoFocus />
                        <select className="planning-manual-input" value={wFamily} onChange={(e) => setWFamily(e.target.value)}>
                          {COACH_FAMILY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                        <div className="planning-coach-form-row">
                          <input type="text" className="planning-manual-input" placeholder="Zona (ej: LT2)" value={wZone} onChange={(e) => setWZone(e.target.value)} />
                          <input type="number" className="planning-manual-input" placeholder="Min" value={wDuration} onChange={(e) => setWDuration(e.target.value)} style={{ width: 80 }} />
                        </div>
                        <textarea className="planning-manual-textarea" placeholder="Descripción (opcional)" value={wDesc} onChange={(e) => setWDesc(e.target.value)} rows={2} />
                        <div className="planning-coach-form-row">
                          <button type="button" className="planning-manual-save-btn" disabled={!wLabel.trim() || savingWorkout} onClick={() => handleAddWorkout(lib.id)}>
                            {savingWorkout ? "Guardando..." : "Añadir entreno"}
                          </button>
                          <button type="button" className="ghost-button" onClick={() => setAddingWorkoutTo(null)}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="planning-coach-add-template-btn" onClick={() => setAddingWorkoutTo(lib.id)}>
                        + Nuevo entreno
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Create new library */}
          <div className="planning-coach-new-library">
            <input type="text" className="planning-manual-input" placeholder="Nueva biblioteca (ej: IRONMAN Base)" value={newLibName} onChange={(e) => setNewLibName(e.target.value)} />
            {newLibName.trim() && (
              <>
                <input type="text" className="planning-manual-input" placeholder="Descripción (opcional)" value={newLibDesc} onChange={(e) => setNewLibDesc(e.target.value)} />
                <button type="button" className="planning-manual-save-btn" disabled={creatingLibrary} onClick={handleCreateLibrary}>
                  {creatingLibrary ? "Creando..." : "Crear biblioteca"}
                </button>
              </>
            )}
          </div>
          {/* Open week editor */}
          {onOpenWeekEditor && (
            <button
              type="button"
              className="planning-coach-add-template-btn"
              style={{ marginTop: 6, fontWeight: 600 }}
              onClick={() => onOpenWeekEditor()}
            >
              + Crear semana tipo (calendario)
            </button>
          )}
        </div>
      </div>
    </>
  );
}
