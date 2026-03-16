import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../lib/api";
import type {
  Athlete,
  AthleteAnalysis,
  DailyTrainingLoad,
  PlanningMesocycleDraftSession,
  PlanningOverview,
  PlanningPlannedSession,
  PlanningWorkoutTemplate,
  WorkoutDefinition,
} from "../types";

import type {
  CalendarEntry,
  CalendarMesocycleOption,
  CalendarMonthSection,
  CalendarWorkspaceTab,
  GarminCalendarActivity,
  OpenWorkoutPreviewState,
  PlanningCalendarSource,
  PlanningSourceModalState,
  PlanTone,
  WorkoutLibraryLayer,
} from "../planning/types";
import { CalendarOverlay } from "../planning/components/CalendarOverlay";
import { CoachSessionReviewModal } from "../planning/components/CoachSessionReviewModal";
import {
  addDays, addMonths, buildCalendarMonthRows, buildCalendarWeekSnapshot,
  compactPlanningSourceTitle, dateValue, describePlanningSource, diffCalendarMonths,
  disciplineLabel, firstName, formatDate, formatDateKey, formatMinutesCompact,
  formatThresholdPrimaryMetric, isoDateFromToday, monthHeading, normalizeDisciplineKey,
  overlapsRange, parseCalendarWorkspaceTab, parseDateValue, planningDisciplineAccent,
  resolveAnalysisDisciplineView, resolveTrainingThreshold, startOfMonth, startOfWeek,
  weekHeading, buildPlanningPrescriptionHint, formatThresholdQuickRows,
  averageConfidenceLabel, buildConfidenceBars, buildRecentLoadBars,
  formatBlockMetricQuickview, nextTargetLabelFromAthlete, progressDirectionLabel,
  progressTone, targetMetricLabel, targetPrimaryValue, formatTargetCountdown,
} from "../planning/utils";
import {
  BLOCK_LABELS, buildDraftWorkoutPreviewSelection, buildLibraryWorkoutPreview,
  buildMicrocycle, buildPersistedCalendarSessions, buildPlannedWorkoutPreviewSelection,
  buildSyntheticCalendarSessions, buildSyntheticCalendarWorkoutPreview,
  computeSessionCompliance, defaultPhaseForRecommendation, detectedBlockTitle,
  durationInterpretation, energySystemFocusForRecommendation, garminSportToDiscipline,
  objectiveFromTemplate, objectiveOptionsForDiscipline,
  phaseOptionsForRecommendation, resolveMesocycleTemplateForSource, resolveWorkoutTemplate,
  weaknessOptionsForDiscipline, workoutLayerForTemplate,
} from "../planning/utils-workout";
import { PlanningProvider, usePlanning } from "../planning/context/PlanningContext";
import { usePlanningData, getAvailableDisciplines } from "../planning/context/usePlanningData";
import { useCalendarNavigation } from "../planning/context/useCalendarNavigation";

type PlanningPageProps = {
  token: string;
};

export function PlanningPage({ token }: PlanningPageProps) {
  return (
    <PlanningProvider token={token}>
      <PlanningPageInner />
    </PlanningProvider>
  );
}

function PlanningPageInner() {
  const { state, dispatch, athleteId, searchDiscipline, calendarPanelOpen, calendarWorkspaceTab, token } = usePlanning();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── URL navigation callbacks ──

  const updatePlanningRoute = useCallback(
    (nextAthleteId: string, nextDiscipline: string) => {
      const athlete = state.athletes.find((item) => String(item.id) === nextAthleteId);
      const params = new URLSearchParams(searchParams);
      params.set("athleteId", nextAthleteId);
      params.set("discipline", nextDiscipline);
      if (athlete) params.set("athleteName", athlete.name);
      setSearchParams(params);
    },
    [state.athletes, searchParams, setSearchParams],
  );

  const openCalendarPanel = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.set("panel", "calendar");
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const openCalendarWorkspaceTab = useCallback((tab: CalendarWorkspaceTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("panel", "calendar");
    params.set("view", tab);
    setSearchParams(params);
    if (tab !== "calendar") {
      dispatch({ type: "SET_CALENDAR_COMPOSER_DATE", payload: null });
      dispatch({ type: "SET_CALENDAR_QUICK_ADD", payload: null });
    }
  }, [searchParams, setSearchParams, dispatch]);

  const closeCalendarPanel = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("panel");
    params.delete("view");
    dispatch({ type: "SET_CALENDAR_QUICK_ADD", payload: null });
    dispatch({ type: "SET_CALENDAR_COMPOSER_DATE", payload: null });
    setSearchParams(params);
  }, [searchParams, setSearchParams, dispatch]);

  // ── Data loading ──

  const { loadPlanningContext } = usePlanningData(
    token,
    state,
    dispatch,
    athleteId,
    searchDiscipline,
    calendarPanelOpen,
    calendarWorkspaceTab,
    updatePlanningRoute,
  );

  // ── Destructure state ──

  const {
    athletes, overview, athleteAnalysis, selectedDiscipline,
    selectedTemplateId, expandedTemplateId, blockObjective, primaryWeakness,
    secondaryWeakness, weeks, density, priority, blockStartDate, blockPhase,
    blockIntent, coachNotes, saveError, saveMessage, saving, deletingBlockId,
    ribbonExpanded, calendarVisualMode, selectedLibrarySourceId,
    selectedCalendarSourceId, calendarMonth, selectedCalendarDate,
    enabledOverlayDisciplines, workoutLibrary, quickAddLibraries,
    openWorkoutPreview, showPlannedSessionRawInformation,
    plannedSessionStructuredPreview, plannedSessionStructuredPreviewLoading,
    plannedSessionStructuredPreviewError, plannedSessionRegeneratingId,
    planningSourceModal, calendarComposerDate, calendarQuickAdd,
    loading, error, disciplineOverviews, syntheticDateOverrides,
    garminActivities, garminActivitiesLoading,
  } = state;

  // ── Multi-discipline calendar toggle ──

  // Default to all disciplines for triathlon athletes
  const isTriathlete = useMemo(() => {
    const athlete = athletes.find((a) => String(a.id) === String(athleteId));
    return athlete?.primary_discipline === "triatlón";
  }, [athletes, athleteId]);
  const [showAllDisciplines, setShowAllDisciplines] = useState(true);

  // Auto-enable all disciplines on load for triathletes
  useEffect(() => {
    if (isTriathlete && overview) {
      const others = (getAvailableDisciplines(overview, searchDiscipline)).filter((d) => d !== selectedDiscipline);
      if (others.length > 0) {
        setShowAllDisciplines(true);
        dispatch({ type: "SET_ENABLED_OVERLAY_DISCIPLINES", payload: others });
      }
    }
  }, [isTriathlete, overview, searchDiscipline, selectedDiscipline, dispatch]);

  const handleToggleAllDisciplines = useCallback(() => {
    setShowAllDisciplines((prev) => {
      const next = !prev;
      if (next) {
        const others = (getAvailableDisciplines(overview, searchDiscipline)).filter((d) => d !== selectedDiscipline);
        dispatch({ type: "SET_ENABLED_OVERLAY_DISCIPLINES", payload: others });
      }
      return next;
    });
  }, [overview, searchDiscipline, selectedDiscipline, dispatch]);

  // ── Computed values (same logic as before) ──

  const availableDisciplines = useMemo(() => getAvailableDisciplines(overview, searchDiscipline), [overview, searchDiscipline]);

  useEffect(() => {
    const overlayOptions = availableDisciplines.filter((d) => d !== selectedDiscipline);
    dispatch({ type: "SET_ENABLED_OVERLAY_DISCIPLINES", payload: enabledOverlayDisciplines.filter((d) => overlayOptions.includes(d)) });
  }, [availableDisciplines, selectedDiscipline]);

  const templateLibrary = overview?.template_library ?? [];
  const selectedTemplate = useMemo(
    () => templateLibrary.find((t) => t.template_id === selectedTemplateId) ?? templateLibrary[0] ?? null,
    [selectedTemplateId, templateLibrary],
  );
  const plannedBlocksById = useMemo(
    () => new Map((overview?.planned_blocks ?? []).map((block) => [String(block.id), block])),
    [overview?.planned_blocks],
  );
  const detectedMesocyclesById = useMemo(
    () => new Map((overview?.detected_mesocycles ?? []).map((block) => [`historical-${block.start_date}-${block.block_type}`, block])),
    [overview?.detected_mesocycles],
  );

  // Quick-add computed
  const quickAddDiscipline = calendarQuickAdd?.selectedDiscipline ?? "running";
  const quickAddDisciplineLibrary = useMemo(() => {
    const recommendedIds = new Set(
      (overview?.recommended_workouts ?? [])
        .filter((t) => t.discipline === quickAddDiscipline)
        .map((t) => t.template_id),
    );
    const library = quickAddLibraries[quickAddDiscipline] ?? [];
    return [...library].sort((l, r) => Number(recommendedIds.has(r.template_id)) - Number(recommendedIds.has(l.template_id)));
  }, [calendarQuickAdd?.selectedDiscipline, overview?.recommended_workouts, quickAddDiscipline, quickAddLibraries]);
  const quickAddAvailableLayers = useMemo(() => {
    const present = new Set<WorkoutLibraryLayer>(quickAddDisciplineLibrary.map(workoutLayerForTemplate));
    return (["recovery", "base", "lt1", "subthreshold", "lt2", "vo2", "technique", "strength", "specific", "other"] as WorkoutLibraryLayer[])
      .filter((layer) => present.has(layer));
  }, [quickAddDisciplineLibrary]);
  const quickAddActiveLayer = useMemo(
    () => (calendarQuickAdd?.selectedLayer && quickAddAvailableLayers.includes(calendarQuickAdd.selectedLayer) ? calendarQuickAdd.selectedLayer : quickAddAvailableLayers[0] ?? null),
    [calendarQuickAdd?.selectedLayer, quickAddAvailableLayers],
  );
  const quickAddLayerCounts = useMemo(
    () => Object.fromEntries(quickAddAvailableLayers.map((layer) => [layer, quickAddDisciplineLibrary.filter((t) => workoutLayerForTemplate(t) === layer).length])),
    [quickAddAvailableLayers, quickAddDisciplineLibrary],
  );
  const quickAddFilteredLibrary = useMemo(() => {
    const filtered = quickAddActiveLayer
      ? quickAddDisciplineLibrary.filter((t) => workoutLayerForTemplate(t) === quickAddActiveLayer)
      : quickAddDisciplineLibrary;
    return filtered.slice(0, 15);
  }, [quickAddActiveLayer, quickAddDisciplineLibrary]);

  // ── Sync effects ──

  useEffect(() => {
    if (!availableDisciplines.includes(selectedDiscipline)) {
      if (athleteId && availableDisciplines.length) {
        updatePlanningRoute(athleteId, availableDisciplines[0] ?? "running");
        return;
      }
      dispatch({ type: "SET_SELECTED_DISCIPLINE", payload: availableDisciplines[0] ?? "running" });
    }
  }, [athleteId, availableDisciplines, selectedDiscipline, updatePlanningRoute, dispatch]);

  useEffect(() => {
    if (!templateLibrary.length) {
      dispatch({ type: "SET_SELECTED_TEMPLATE_ID", payload: "" });
      return;
    }
    const suggestedTemplateId = overview?.next_recommendation.template_id ?? "";
    if (selectedTemplateId && templateLibrary.some((t) => t.template_id === selectedTemplateId)) return;
    if (suggestedTemplateId && templateLibrary.some((t) => t.template_id === suggestedTemplateId)) {
      dispatch({ type: "SET_SELECTED_TEMPLATE_ID", payload: suggestedTemplateId });
      return;
    }
    dispatch({ type: "SET_SELECTED_TEMPLATE_ID", payload: templateLibrary[0].template_id });
  }, [overview?.next_recommendation.template_id, selectedTemplateId, templateLibrary, dispatch]);

  const selectedObjectiveOptions = useMemo(() => objectiveOptionsForDiscipline(selectedDiscipline), [selectedDiscipline]);
  const selectedWeaknessOptions = useMemo(() => weaknessOptionsForDiscipline(selectedDiscipline), [selectedDiscipline]);

  useEffect(() => {
    if (!selectedObjectiveOptions.includes(blockObjective)) dispatch({ type: "SET_BLOCK_OBJECTIVE", payload: selectedObjectiveOptions[0] ?? "LT1" });
  }, [blockObjective, selectedObjectiveOptions, dispatch]);

  useEffect(() => {
    if (!selectedWeaknessOptions.includes(primaryWeakness)) dispatch({ type: "SET_PRIMARY_WEAKNESS", payload: selectedWeaknessOptions[0] ?? "Base aeróbica" });
    if (!selectedWeaknessOptions.includes(secondaryWeakness)) dispatch({ type: "SET_SECONDARY_WEAKNESS", payload: selectedWeaknessOptions[1] ?? selectedWeaknessOptions[0] ?? "LT1" });
  }, [primaryWeakness, secondaryWeakness, selectedWeaknessOptions, dispatch]);

  useEffect(() => {
    if (!overview?.next_recommendation) return;
    dispatch({ type: "SET_WEEKS", payload: String(overview.next_recommendation.duration_weeks) });
    dispatch({
      type: "SET_BLOCK_INTENT",
      payload: blockIntent || overview.current_block.recommendation || overview.next_recommendation.reasoning[0] || "Bloque provisional para empezar a trabajar la limitante principal.",
    });
    dispatch({
      type: "SET_COACH_NOTES",
      payload: coachNotes || overview.next_recommendation.control_points.join(" "),
    });
  }, [overview?.current_block.recommendation, overview?.next_recommendation]);

  useEffect(() => {
    if (!selectedTemplate) return;
    const nextObj = objectiveFromTemplate(selectedTemplate, selectedDiscipline);
    if (selectedObjectiveOptions.includes(nextObj)) dispatch({ type: "SET_BLOCK_OBJECTIVE", payload: nextObj });
    dispatch({ type: "SET_BLOCK_PHASE", payload: defaultPhaseForRecommendation(selectedTemplate.block_type) });
    const parsed = Number(weeks);
    if (!(parsed >= selectedTemplate.typical_duration_weeks_min && parsed <= selectedTemplate.typical_duration_weeks_max)) {
      dispatch({ type: "SET_WEEKS", payload: String(selectedTemplate.typical_duration_weeks_min) });
    }
  }, [selectedDiscipline, selectedObjectiveOptions, selectedTemplate]);

  const quickGuardrails = useMemo(() => {
    const recommendation = overview?.next_recommendation;
    return [
      selectedTemplate?.entry_checks?.[0] ?? overview?.current_block.recommendation ?? "Mantén una única variable dominante por bloque para poder leer si el cambio fisiológico es real.",
      selectedDiscipline === "ciclismo"
        ? "En ciclismo, decide si quieres progresar por tiempo útil o por densidad antes de subir potencia objetivo."
        : selectedDiscipline === "natación"
          ? "En natación, prioriza continuidad y calidad técnica antes de endurecer el bloque."
          : "En carrera, sube minutos de trabajo o densidad, no ambas cosas en la misma semana.",
      selectedTemplate?.progression_rules?.[0] ?? recommendation?.progression_rules?.[0] ?? (priority === "agresivo"
        ? "Modo agresivo: deja una semana final de descarga clara para no arrastrar fatiga al siguiente bloque."
        : "Modo controlado: busca comparabilidad de lactato y una respuesta limpia al final del ciclo."),
    ];
  }, [overview?.current_block.recommendation, overview?.next_recommendation, priority, selectedDiscipline, selectedTemplate]);

  const microcycle = useMemo(() => buildMicrocycle(Number(weeks) || 4, selectedDiscipline, blockObjective, density), [weeks, selectedDiscipline, blockObjective, density]);
  const durationFeedback = useMemo(() => durationInterpretation(selectedTemplate, Number(weeks) || 0), [selectedTemplate, weeks]);
  const phaseOptions = useMemo(() => phaseOptionsForRecommendation(selectedTemplate?.block_type || overview?.next_recommendation.recommended_block_type), [overview?.next_recommendation.recommended_block_type, selectedTemplate?.block_type]);

  useEffect(() => {
    if (!phaseOptions.includes(blockPhase)) dispatch({ type: "SET_BLOCK_PHASE", payload: phaseOptions[0] ?? "base" });
  }, [blockPhase, phaseOptions, dispatch]);

  // ── Timeline and calendar sources ──

  const timelineItems = useMemo(() => {
    const items: Array<{ id: string; tone: PlanTone; kind: "historical" | "planned" | "target"; date: string; endDate?: string | null; title: string; subtitle: string; meta: string }> = [];
    (overview?.detected_mesocycles ?? []).forEach((block) => {
      items.push({
        id: `historical-${block.start_date}-${block.block_type}`,
        tone: block.block_type === "recovery_consolidation_block" ? "warning" : ["aerobic_capacity_block", "threshold_development_block", "aerobic_power_block", "anaerobic_capacity_block", "anaerobic_power_block"].includes(block.block_type) ? "positive" : "neutral",
        kind: "historical",
        date: block.start_date,
        endDate: block.end_date,
        title: detectedBlockTitle(block),
        subtitle: "Histórico inferido",
        meta: `${block.weeks_count} sem · ${block.session_count} sesiones`,
      });
    });
    (overview?.planned_blocks ?? []).forEach((block) => {
      items.push({
        id: `planned-${block.id}`,
        tone: block.status === "active" ? "positive" : block.status === "planned" ? "neutral" : "warning",
        kind: "planned",
        date: block.start_date,
        endDate: block.end_date ?? block.target_date ?? null,
        title: `${block.energy_system_focus} · ${block.block_objective}`,
        subtitle: block.status === "active" ? "Bloque activo" : "Bloque programado",
        meta: disciplineLabel(block.priority_discipline || selectedDiscipline),
      });
    });
    const target = overview?.next_recommendation.next_target;
    if (target?.target_date) {
      items.push({ id: `target-${target.target_date}-${target.objective}`, tone: "warning", kind: "target", date: target.target_date, title: target.objective || "Objetivo", subtitle: `Objetivo ${disciplineLabel(selectedDiscipline).toLowerCase()}`, meta: target.target_metric || target.distance_label || "Objetivo abierto" });
    }
    return items.sort((a, b) => dateValue(a.date) - dateValue(b.date));
  }, [overview?.detected_mesocycles, overview?.next_recommendation.next_target, overview?.planned_blocks, selectedDiscipline]);

  const draftCalendarSource = useMemo<PlanningCalendarSource>(() => {
    const durationWeeks = Number(weeks) || overview?.next_recommendation.duration_weeks || 4;
    return {
      id: "draft", kind: "draft", focusBlockId: null, startDate: blockStartDate,
      endDate: addDays(blockStartDate, durationWeeks * 7 - 1), discipline: selectedDiscipline,
      templateId: selectedTemplate?.template_id || overview?.next_recommendation.template_id || null,
      blockType: selectedTemplate?.block_type || overview?.next_recommendation.recommended_block_type || null,
      status: "draft", title: selectedTemplate?.public_label || overview?.next_recommendation.recommended_block_label || "Borrador",
      objective: blockObjective, energySystemFocus: selectedTemplate?.primary_focus || overview?.next_recommendation.primary_focus || null,
      phase: blockPhase, intent: blockIntent || selectedTemplate?.summary || null, notes: coachNotes || null, density,
    };
  }, [blockIntent, blockObjective, blockPhase, blockStartDate, coachNotes, density, overview?.next_recommendation.duration_weeks, overview?.next_recommendation.primary_focus, overview?.next_recommendation.recommended_block_label, selectedDiscipline, selectedTemplate?.primary_focus, selectedTemplate?.public_label, selectedTemplate?.summary, weeks]);

  const ribbonCards = useMemo(() => {
    const items = [...timelineItems];
    const nextTarget = overview?.next_recommendation.next_target;
    if (nextTarget?.target_date && !items.some((i) => i.kind === "target")) {
      items.push({ id: `target-${nextTarget.target_date}-${nextTarget.objective}`, tone: "warning", kind: "target", date: nextTarget.target_date, title: nextTarget.objective || "Objetivo", subtitle: "Objetivo", meta: nextTarget.target_metric || nextTarget.distance_label || "Objetivo abierto" });
    }
    return items.sort((a, b) => dateValue(a.date) - dateValue(b.date));
  }, [draftCalendarSource, overview?.next_recommendation.next_target, timelineItems]);

  const calendarSources = useMemo<PlanningCalendarSource[]>(() => {
    const planned = (overview?.planned_blocks ?? []).map((block) => ({
      id: `planned-${block.id}`, kind: "planned" as const, focusBlockId: block.id,
      startDate: block.start_date, endDate: block.end_date || block.target_date || block.start_date,
      discipline: block.priority_discipline || selectedDiscipline,
      templateId: block.template_id ?? null,
      blockType: (templateLibrary.find((t) => t.template_id === block.template_id)?.block_type) ?? null,
      status: block.status, title: `${block.energy_system_focus} · ${block.block_objective}`,
      objective: block.block_objective, energySystemFocus: block.energy_system_focus,
      phase: block.phase, intent: block.block_intent, notes: block.coach_notes, density: "media",
    }));
    const historical = (overview?.detected_mesocycles ?? []).map((block) => ({
      id: `historical-${block.start_date}-${block.block_type}`, kind: "historical" as const, focusBlockId: null,
      startDate: block.start_date, endDate: block.end_date, discipline: block.discipline,
      templateId: resolveMesocycleTemplateForSource({ id: "", kind: "historical", focusBlockId: null, startDate: block.start_date, endDate: block.end_date, discipline: block.discipline, templateId: null, blockType: block.block_type, status: "historical", title: block.block_label, objective: block.block_label }, templateLibrary)?.template_id ?? null,
      blockType: block.block_type, status: "historical", title: block.block_label, objective: block.block_label,
      energySystemFocus: block.block_type, phase: null, intent: block.explanation[0] || null,
      notes: block.explanation.join(" "), density: "media",
    }));
    return [...planned, ...historical];
  }, [overview?.detected_mesocycles, overview?.planned_blocks, selectedDiscipline, templateLibrary]);

  const primaryCalendarSource = useMemo(
    () => overview?.planned_blocks?.[0] ? calendarSources.find((s) => s.kind === "planned") ?? calendarSources[0] ?? null : calendarSources[0] ?? null,
    [calendarSources, overview?.planned_blocks],
  );
  const selectedCalendarSource = useMemo(
    () => calendarSources.find((s) => s.id === selectedCalendarSourceId) ?? primaryCalendarSource ?? draftCalendarSource,
    [calendarSources, draftCalendarSource, primaryCalendarSource, selectedCalendarSourceId],
  );

  const overlayOptions = useMemo(() => availableDisciplines.filter((d) => d !== selectedDiscipline), [availableDisciplines, selectedDiscipline]);
  const overlaySources = useMemo<PlanningCalendarSource[]>(() => {
    const ms = startOfMonth(calendarMonth);
    const me = addDays(addMonths(ms, 1), -1);
    return enabledOverlayDisciplines.flatMap<PlanningCalendarSource>((discipline) => {
      const dov = disciplineOverviews[discipline];
      if (!dov) return [];
      const planned = dov.planned_blocks.map((block) => ({ id: `overlay-planned-${discipline}-${block.id}`, kind: "planned" as const, focusBlockId: block.id, startDate: block.start_date, endDate: block.end_date || block.target_date || block.start_date, discipline, title: `${block.energy_system_focus} · ${block.block_objective}`, objective: block.block_objective, energySystemFocus: block.energy_system_focus, phase: block.phase, intent: block.block_intent, notes: block.coach_notes, density: "media" })).filter((s) => overlapsRange(s.startDate, s.endDate, ms, me));
      if (planned.length) return planned;
      return dov.detected_mesocycles.map((block) => ({ id: `overlay-historical-${discipline}-${block.start_date}-${block.block_type}`, kind: "historical" as const, focusBlockId: null, startDate: block.start_date, endDate: block.end_date, discipline, title: block.block_label, objective: block.block_label, energySystemFocus: block.block_type, phase: null, intent: block.explanation[0] || null, notes: block.explanation.join(" "), density: "media" })).filter((s) => overlapsRange(s.startDate, s.endDate, ms, me)).slice(-1);
    });
  }, [calendarMonth, disciplineOverviews, enabledOverlayDisciplines]);

  // Calendar source sync effects
  useEffect(() => {
    if (!calendarSources.some((s) => s.id === selectedCalendarSourceId)) dispatch({ type: "SET_SELECTED_CALENDAR_SOURCE_ID", payload: primaryCalendarSource?.id ?? "" });
  }, [calendarSources, primaryCalendarSource?.id, selectedCalendarSourceId, dispatch]);
  useEffect(() => {
    if (selectedLibrarySourceId && !calendarSources.some((s) => s.id === selectedLibrarySourceId)) dispatch({ type: "SET_SELECTED_LIBRARY_SOURCE_ID", payload: "" });
  }, [calendarSources, selectedLibrarySourceId, dispatch]);
  useEffect(() => {
    dispatch({ type: "SET_CALENDAR_MONTH", payload: startOfMonth(selectedCalendarSource.startDate) });
  }, [selectedCalendarSource.startDate, dispatch]);

  // ── Calendar sessions ──

  const plannedSessions = useMemo(() => {
    const persisted = buildPersistedCalendarSessions(selectedCalendarSource, overview?.planned_sessions ?? []);
    return persisted ?? buildSyntheticCalendarSessions(selectedCalendarSource);
  }, [overview?.planned_sessions, selectedCalendarSource]);

  const overlayEntries = useMemo<CalendarEntry[]>(
    () => overlaySources.flatMap((source) => {
      const dov = disciplineOverviews[source.discipline];
      const persisted = buildPersistedCalendarSessions(source, dov?.planned_sessions ?? []);
      const sessions = persisted ?? buildSyntheticCalendarSessions(source);
      return sessions.map((session) => ({ ...session, layerDiscipline: source.discipline, isOverlay: true }));
    }),
    [disciplineOverviews, overlaySources],
  );

  const adjustedPlannedSessions = useMemo(() => {
    if (!Object.keys(syntheticDateOverrides).length) return plannedSessions;
    return plannedSessions.map((s) => {
      const override = syntheticDateOverrides[s.id];
      return override ? { ...s, date: override } : s;
    });
  }, [plannedSessions, syntheticDateOverrides]);

  const primaryEntries = useMemo<CalendarEntry[]>(
    () => adjustedPlannedSessions.map((session) => ({ ...session, layerDiscipline: selectedCalendarSource.discipline, isOverlay: false })),
    [adjustedPlannedSessions, selectedCalendarSource.discipline],
  );

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    const today = isoDateFromToday();

    // Index garmin activities by date+discipline for matching
    const garminByDateDiscipline = new Map<string, GarminCalendarActivity[]>();
    for (const act of garminActivities) {
      const actDate = act.started_at.slice(0, 10);
      const actDisc = garminSportToDiscipline(act.sport_type);
      const key = `${actDate}|${actDisc}`;
      const arr = garminByDateDiscipline.get(key) ?? [];
      arr.push(act);
      garminByDateDiscipline.set(key, arr);
    }
    const matchedActivityIds = new Set<number>();

    // Build primary + overlay entries with Garmin enrichment
    [...primaryEntries, ...overlayEntries].forEach((session) => {
      const enriched = { ...session };
      if (!session.isOverlay) {
        // If backend already linked an activity (execution_status != planned),
        // prefer backend compliance data
        if (enriched.compliance && enriched.garminActivity) {
          // Backend already provided compliance and activity data
          matchedActivityIds.add(enriched.garminActivity.provider_activity_id);
        } else {
          const key = `${session.date}|${session.discipline}`;
          const candidates = garminByDateDiscipline.get(key);
          if (candidates?.length) {
            const act = candidates.find((a) => !matchedActivityIds.has(a.provider_activity_id)) ?? null;
            if (act) {
              matchedActivityIds.add(act.provider_activity_id);
              enriched.garminActivity = act;
              enriched.compliance = computeSessionCompliance(session, act, today);
            } else {
              enriched.compliance = computeSessionCompliance(session, null, today);
            }
          } else {
            enriched.compliance = computeSessionCompliance(session, null, today);
          }
        }
      }
      const current = map.get(enriched.date) ?? [];
      current.push(enriched);
      map.set(enriched.date, current);
    });

    // Add unplanned Garmin activities (not matched to any session)
    for (const act of garminActivities) {
      if (matchedActivityIds.has(act.provider_activity_id)) continue;
      const actDate = act.started_at.slice(0, 10);
      const actDisc = garminSportToDiscipline(act.sport_type);
      const extraEntry: CalendarEntry = {
        id: `garmin-extra-${act.provider_activity_id}`,
        date: actDate,
        discipline: actDisc,
        title: act.sport_type.replace(/_/g, " "),
        sessionType: "extra",
        objective: "",
        description: "",
        dose: "",
        confidence: "media",
        estimatedMinutes: Math.round(act.moving_time_seconds / 60),
        garminActivity: act,
        compliance: { status: "unplanned", reasons: [] },
        layerDiscipline: actDisc,
        isOverlay: false,
      };
      const current = map.get(actDate) ?? [];
      current.push(extraEntry);
      map.set(actDate, current);
    }

    return map;
  }, [overlayEntries, primaryEntries, garminActivities]);

  useEffect(() => {
    const initialDate = plannedSessions[0]?.date ?? selectedCalendarSource.startDate;
    dispatch({ type: "SET_SELECTED_CALENDAR_DATE", payload: initialDate });
  }, [plannedSessions, selectedCalendarSource.startDate, selectedCalendarSource.id, dispatch]);
  useEffect(() => {
    if (calendarVisualMode !== "week" || !selectedCalendarDate) return;
    dispatch({ type: "SET_CALENDAR_MONTH", payload: startOfMonth(selectedCalendarDate) });
  }, [calendarVisualMode, selectedCalendarDate, dispatch]);

  // ── URL persistence for calendar view and date (2E) ──

  useEffect(() => {
    if (!calendarPanelOpen) return;
    const params = new URLSearchParams(searchParams);
    let changed = false;
    if (params.get("calView") !== calendarVisualMode) { params.set("calView", calendarVisualMode); changed = true; }
    if (selectedCalendarDate && params.get("calDate") !== selectedCalendarDate) { params.set("calDate", selectedCalendarDate); changed = true; }
    if (changed) setSearchParams(params, { replace: true });
  }, [calendarPanelOpen, calendarVisualMode, selectedCalendarDate, searchParams, setSearchParams]);

  // ── Fetch Garmin activities for visible range ──

  useEffect(() => {
    if (!calendarPanelOpen || !athleteId) return;
    let cancelled = false;
    const fetchGarmin = async () => {
      // Determine visible range based on calendar mode
      const rangeStart = calendarVisualMode === "week"
        ? startOfWeek(selectedCalendarDate || selectedCalendarSource.startDate)
        : calendarMonth;
      const rangeEnd = calendarVisualMode === "week"
        ? addDays(rangeStart, 6)
        : addDays(addMonths(calendarMonth, 1), -1);

      dispatch({ type: "SET_GARMIN_ACTIVITIES_LOADING", payload: true });
      try {
        const result = await api.garminPreview(token, Number(athleteId), rangeStart, rangeEnd);
        if (cancelled) return;
        const activities: GarminCalendarActivity[] = (result.activities || []).map((a: Record<string, unknown>) => ({
          provider_activity_id: Number(a.provider_activity_id ?? a.activityId ?? 0),
          sport_type: String(a.sport_type ?? a.activityType ?? ""),
          started_at: String(a.started_at ?? a.startTimeLocal ?? ""),
          distance_m: Number(a.distance_m ?? a.distance ?? 0),
          moving_time_seconds: Number(a.moving_time_seconds ?? a.movingDuration ?? a.duration ?? 0),
          average_heartrate: a.average_heartrate != null ? Number(a.average_heartrate) : (a.averageHR != null ? Number(a.averageHR) : null),
          max_heartrate: a.max_heartrate != null ? Number(a.max_heartrate) : (a.maxHR != null ? Number(a.maxHR) : null),
          average_watts: a.average_watts != null ? Number(a.average_watts) : null,
        }));
        dispatch({ type: "SET_GARMIN_ACTIVITIES", payload: activities });
      } catch {
        // Silently ignore — athlete may not have Garmin connected
        if (!cancelled) dispatch({ type: "SET_GARMIN_ACTIVITIES", payload: [] });
      } finally {
        if (!cancelled) dispatch({ type: "SET_GARMIN_ACTIVITIES_LOADING", payload: false });
      }
    };
    fetchGarmin();
    return () => { cancelled = true; };
  }, [calendarPanelOpen, athleteId, token, calendarVisualMode, selectedCalendarDate, calendarMonth, selectedCalendarSource.startDate, dispatch]);

  // ── Fetch Training Load for visible range ──

  useEffect(() => {
    if (!calendarPanelOpen || !athleteId) return;
    let cancelled = false;
    const fetchTrainingLoad = async () => {
      // Fetch a wide range: 90 days back from visible start to visible end
      const visibleStart = calendarVisualMode === "week"
        ? startOfWeek(selectedCalendarDate || selectedCalendarSource.startDate)
        : calendarMonth;
      const visibleEnd = calendarVisualMode === "week"
        ? addDays(visibleStart, 6)
        : addDays(addMonths(calendarMonth, 1), -1);
      // Start 42 days before visible start for EWMA warmup context
      const fetchStart = addDays(visibleStart, -42);

      dispatch({ type: "SET_TRAINING_LOAD_LOADING", payload: true });
      try {
        const result = await api.trainingLoad(token, Number(athleteId), fetchStart, visibleEnd) as { days?: DailyTrainingLoad[] };
        if (cancelled) return;
        dispatch({ type: "SET_TRAINING_LOAD_DAYS", payload: result.days ?? [] });
      } catch {
        if (!cancelled) dispatch({ type: "SET_TRAINING_LOAD_DAYS", payload: [] });
      } finally {
        if (!cancelled) dispatch({ type: "SET_TRAINING_LOAD_LOADING", payload: false });
      }
    };
    fetchTrainingLoad();
    return () => { cancelled = true; };
  }, [calendarPanelOpen, athleteId, token, calendarVisualMode, selectedCalendarDate, calendarMonth, selectedCalendarSource.startDate, dispatch]);

  // ── Threshold state ──

  const planningThresholdSource = useMemo(() => resolveAnalysisDisciplineView(athleteAnalysis, selectedDiscipline) ?? athleteAnalysis, [athleteAnalysis, selectedDiscipline]);
  const planningLt1 = useMemo(() => resolveTrainingThreshold(planningThresholdSource, "LT1"), [planningThresholdSource]);
  const planningLt2 = useMemo(() => resolveTrainingThreshold(planningThresholdSource, "LT2"), [planningThresholdSource]);
  const planningPracticalLt1 = planningThresholdSource?.dynamic_thresholds?.chronic.practical_lt1 ?? null;
  const planningPracticalLt2 = planningThresholdSource?.dynamic_thresholds?.chronic.practical_lt2 ?? null;
  const planningThresholdBasis = useMemo(() => {
    const visibleSources = Array.from(new Set([planningLt1?.source, planningLt2?.source].filter(Boolean)));
    if (planningLt1?.source === "individual" && planningLt2?.source === "individual") return "LT1/LT2 individuales";
    if (visibleSources.length > 1) return "Referencia mixta";
    if (planningLt1?.source === "physiological" || planningLt2?.source === "physiological") return "LT1/LT2 activos";
    if (planningLt1 || planningLt2) return "Anclas actuales";
    return "Sin anclas visibles";
  }, [planningLt1, planningLt2]);

  // ── Workout preview callbacks ──

  const openDraftWorkoutPreview = useCallback((session: PlanningMesocycleDraftSession) => {
    const template = resolveWorkoutTemplate(workoutLibrary, { templateId: session.template_id, family: session.session_family, label: session.public_label });
    if (!template) return;
    dispatch({ type: "SET_OPEN_WORKOUT_PREVIEW", payload: { template, selection: { ...buildDraftWorkoutPreviewSelection(template, session), prescriptionHint: buildPlanningPrescriptionHint(session.objective, session.public_label, template.discipline, planningLt1, planningLt2), thresholdBasis: planningThresholdBasis } } });
  }, [planningLt1, planningLt2, planningThresholdBasis, workoutLibrary, dispatch]);

  const openPlannedWorkoutPreview = useCallback((sessionId: number) => {
    const plannedSession = overview?.planned_sessions.find((i) => i.id === sessionId);
    if (!plannedSession) return false;
    const template = resolveWorkoutTemplate(workoutLibrary, { templateId: plannedSession.workout_template_id, family: plannedSession.session_family, label: plannedSession.public_label });
    if (!template) return false;
    dispatch({ type: "SET_OPEN_WORKOUT_PREVIEW", payload: { template, selection: { ...buildPlannedWorkoutPreviewSelection(template, plannedSession), prescriptionHint: buildPlanningPrescriptionHint(plannedSession.objective, plannedSession.public_label, plannedSession.discipline, planningLt1, planningLt2), thresholdBasis: planningThresholdBasis } } });
    return true;
  }, [overview?.planned_sessions, planningLt1, planningLt2, planningThresholdBasis, workoutLibrary, dispatch]);

  const openPlannedWorkoutRawInformation = useCallback((sessionId: number) => {
    const opened = openPlannedWorkoutPreview(sessionId);
    if (!opened) return;
    dispatch({ type: "SET_SHOW_PLANNED_SESSION_RAW_INFORMATION", payload: true });
  }, [openPlannedWorkoutPreview, dispatch]);

  const openCalendarSessionDetail = useCallback((session: CalendarEntry) => {
    dispatch({ type: "SET_SELECTED_CALENDAR_DATE", payload: session.date });
    if (session.rawId != null && openPlannedWorkoutPreview(session.rawId)) return;
    dispatch({ type: "SET_OPEN_WORKOUT_PREVIEW", payload: buildSyntheticCalendarWorkoutPreview(session, selectedCalendarSource, planningLt1, planningLt2, planningThresholdBasis) });
  }, [openPlannedWorkoutPreview, planningLt1, planningLt2, planningThresholdBasis, selectedCalendarSource, dispatch]);

  // ── Coach review modal ──
  const [reviewSessionId, setReviewSessionId] = useState<number | null>(null);

  const handleReviewSession = useCallback((session: CalendarEntry) => {
    if (session.rawId != null) {
      setReviewSessionId(session.rawId);
    }
  }, []);

  const handleFeedbackSaved = useCallback((updated: PlanningPlannedSession) => {
    // Refresh the overview to reflect changes in the calendar
    if (overview) {
      const idx = overview.planned_sessions.findIndex((s: PlanningPlannedSession) => s.id === updated.id);
      if (idx >= 0) {
        const updatedSessions = [...overview.planned_sessions];
        updatedSessions[idx] = updated;
        dispatch({ type: "SET_OVERVIEW", payload: { ...overview, planned_sessions: updatedSessions } });
      }
    }
  }, [overview, dispatch]);

  const reviewSession = useMemo(
    () => reviewSessionId != null ? overview?.planned_sessions.find((s: PlanningPlannedSession) => s.id === reviewSessionId) ?? null : null,
    [reviewSessionId, overview?.planned_sessions],
  );

  const activePlannedPreviewSession = useMemo(
    () => openWorkoutPreview?.selection.plannedSessionId != null ? overview?.planned_sessions.find((s) => s.id === openWorkoutPreview.selection.plannedSessionId) ?? null : null,
    [openWorkoutPreview, overview?.planned_sessions],
  );

  // Structured preview effects
  useEffect(() => {
    if (!activePlannedPreviewSession) {
      dispatch({ type: "SET_SHOW_PLANNED_SESSION_RAW_INFORMATION", payload: false });
      dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW", payload: null });
      dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_ERROR", payload: null });
      dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_LOADING", payload: false });
      return;
    }
    if (activePlannedPreviewSession.structured_workout_payload) {
      dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW", payload: activePlannedPreviewSession.structured_workout_payload });
      dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_ERROR", payload: null });
      dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_LOADING", payload: false });
    } else {
      let cancelled = false;
      dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_LOADING", payload: true });
      api.plannedSessionWorkoutDefinitionPreview(token, activePlannedPreviewSession.id)
        .then((payload) => { if (!cancelled) dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW", payload: payload as WorkoutDefinition }); })
        .catch(() => {})
        .finally(() => { if (!cancelled) dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_LOADING", payload: false }); });
      return () => { cancelled = true; };
    }
  }, [activePlannedPreviewSession?.id, activePlannedPreviewSession?.structured_workout_payload, token, dispatch]);

  useEffect(() => {
    if (!showPlannedSessionRawInformation || !activePlannedPreviewSession?.id) return;
    let cancelled = false;
    dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_LOADING", payload: true });
    dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_ERROR", payload: null });
    api.plannedSessionWorkoutDefinitionPreview(token, activePlannedPreviewSession.id)
      .then((payload) => { if (!cancelled) dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW", payload: payload as WorkoutDefinition }); })
      .catch((err) => { if (!cancelled) dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_ERROR", payload: err instanceof Error ? err.message : "No se pudo cargar la estructura canónica." }); })
      .finally(() => { if (!cancelled) dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_LOADING", payload: false }); });
    return () => { cancelled = true; };
  }, [activePlannedPreviewSession?.id, showPlannedSessionRawInformation, token, dispatch]);

  // ── Action callbacks ──

  const saveFocusBlockFromPlanning = useCallback(async () => {
    if (!athleteId || !overview) return false;
    dispatch({ type: "SET_SAVE_ERROR", payload: null });
    dispatch({ type: "SET_SAVE_MESSAGE", payload: null });
    dispatch({ type: "SET_SAVING", payload: true });
    try {
      const durationWeeks = Number(weeks) || overview.next_recommendation.duration_weeks || 4;
      const endDate = addDays(blockStartDate, durationWeeks * 7 - 1);
      await api.addFocusBlock(token, Number(athleteId), {
        start_date: blockStartDate, end_date: endDate,
        template_id: selectedTemplate?.template_id || null,
        energy_system_focus: selectedTemplate?.primary_focus || energySystemFocusForRecommendation(overview.next_recommendation.recommended_block_type, overview.next_recommendation.primary_focus),
        block_objective: blockObjective, block_intent: blockIntent || selectedTemplate?.summary || null,
        priority_discipline: selectedDiscipline, phase: blockPhase,
        target_event: overview.next_recommendation.next_target?.objective || null,
        target_date: overview.next_recommendation.next_target?.target_date || null,
        status: "active",
        coach_notes: [selectedTemplate ? `Plantilla: ${selectedTemplate.public_label}` : null, primaryWeakness ? `Limitante principal: ${primaryWeakness}` : null, secondaryWeakness ? `Limitante secundaria: ${secondaryWeakness}` : null, coachNotes || null].filter(Boolean).join(" · "),
      });
      dispatch({ type: "SET_SAVE_MESSAGE", payload: "Bloque guardado como activo desde planificación." });
      dispatch({ type: "SET_SAVING", payload: false });
      loadPlanningContext(String(athleteId), selectedDiscipline);
      return true;
    } catch (err) {
      dispatch({ type: "SET_SAVE_ERROR", payload: err instanceof Error ? err.message : "No se pudo guardar el bloque." });
      return false;
    } finally {
      dispatch({ type: "SET_SAVING", payload: false });
    }
  }, [athleteId, blockIntent, blockObjective, blockPhase, blockStartDate, coachNotes, loadPlanningContext, overview, primaryWeakness, secondaryWeakness, selectedDiscipline, selectedTemplate, token, weeks, dispatch]);

  const deletePlannedBlock = useCallback(async (blockId: number) => {
    if (!athleteId) return;
    const confirmed = window.confirm("¿Quieres eliminar este bloque planificado? Esta acción sí borra el bloque real del atleta.");
    if (!confirmed) return;
    dispatch({ type: "SET_DELETING_BLOCK_ID", payload: blockId });
    try {
      await api.deleteFocusBlock(token, Number(athleteId), blockId);
      await loadPlanningContext(String(athleteId), selectedDiscipline);
      return true;
    } catch (err) {
      dispatch({ type: "SET_SAVE_ERROR", payload: err instanceof Error ? err.message : "No se pudo eliminar el bloque." });
      return false;
    } finally {
      dispatch({ type: "SET_DELETING_BLOCK_ID", payload: null });
    }
  }, [athleteId, loadPlanningContext, selectedDiscipline, token, dispatch]);

  const deletePlanningSourceFromModal = useCallback(async () => {
    if (!planningSourceModal?.source.focusBlockId || planningSourceModal.source.kind !== "planned") return;
    const deleted = await deletePlannedBlock(planningSourceModal.source.focusBlockId);
    if (deleted) dispatch({ type: "SET_PLANNING_SOURCE_MODAL", payload: null });
  }, [planningSourceModal, deletePlannedBlock, dispatch]);

  const openMesocycleLibraryFromSource = useCallback((source: PlanningCalendarSource) => {
    const linkedTemplate = resolveMesocycleTemplateForSource(source, templateLibrary);
    dispatch({ type: "SET_SELECTED_LIBRARY_SOURCE_ID", payload: source.id });
    if (linkedTemplate) dispatch({ type: "SET_SELECTED_TEMPLATE_ID", payload: linkedTemplate.template_id });
    dispatch({ type: "SET_PLANNING_SOURCE_MODAL", payload: null });
    openCalendarWorkspaceTab("library");
  }, [openCalendarWorkspaceTab, templateLibrary, dispatch]);

  const openCalendarMesocycleComposer = useCallback((date: string) => {
    dispatch({ type: "SET_SELECTED_CALENDAR_DATE", payload: date });
    dispatch({ type: "SET_BLOCK_START_DATE", payload: date });
    dispatch({ type: "SET_CALENDAR_QUICK_ADD", payload: null });
    dispatch({ type: "SET_CALENDAR_COMPOSER_DATE", payload: date });
  }, [dispatch]);

  const closeCalendarMesocycleComposer = useCallback(() => {
    dispatch({ type: "SET_CALENDAR_COMPOSER_DATE", payload: null });
  }, [dispatch]);

  const openCalendarQuickAdd = useCallback((date: string) => {
    dispatch({ type: "SET_SELECTED_CALENDAR_DATE", payload: date });
    dispatch({ type: "SET_CALENDAR_MONTH", payload: startOfMonth(date) });
    dispatch({ type: "SET_CALENDAR_QUICK_ADD", payload: { date, mode: "actions", selectedKind: "running", selectedDiscipline: "running" } });
  }, [dispatch]);

  const closeCalendarQuickAdd = useCallback(() => {
    dispatch({ type: "SET_CALENDAR_QUICK_ADD", payload: null });
  }, [dispatch]);

  const openCalendarWorkoutLibrary = useCallback((date: string, discipline: "running" | "ciclismo" | "natación") => {
    dispatch({ type: "SET_SELECTED_CALENDAR_DATE", payload: date });
    dispatch({ type: "SET_CALENDAR_MONTH", payload: startOfMonth(date) });
    dispatch({ type: "SET_CALENDAR_QUICK_ADD", payload: { date, mode: "library", selectedKind: discipline, selectedDiscipline: discipline } });
  }, [dispatch]);

  const openLibraryWorkoutPreview = useCallback((template: PlanningWorkoutTemplate) => {
    dispatch({ type: "SET_CALENDAR_QUICK_ADD", payload: null });
    dispatch({ type: "SET_OPEN_WORKOUT_PREVIEW", payload: buildLibraryWorkoutPreview(template, planningLt1, planningLt2, planningThresholdBasis) });
  }, [planningLt1, planningLt2, planningThresholdBasis, dispatch]);

  const regeneratePlannedSessionStructure = useCallback(async (sessionId: number) => {
    if (!athleteId) return;
    dispatch({ type: "SET_PLANNED_SESSION_REGENERATING_ID", payload: sessionId });
    dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_ERROR", payload: null });
    try {
      const payload = (await api.preparePlannedSessionPublish(token, sessionId)) as PlanningPlannedSession;
      dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW", payload: payload.structured_workout_payload ?? null });
      await loadPlanningContext(String(athleteId), selectedDiscipline);
      dispatch({ type: "SET_SHOW_PLANNED_SESSION_RAW_INFORMATION", payload: true });
    } catch (err) {
      dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_ERROR", payload: err instanceof Error ? err.message : "No se pudo regenerar la estructura del entreno." });
    } finally {
      dispatch({ type: "SET_PLANNED_SESSION_REGENERATING_ID", payload: null });
    }
  }, [athleteId, loadPlanningContext, selectedDiscipline, token, dispatch]);

  const handleSaveWorkoutSteps = useCallback(async (workout: WorkoutDefinition) => {
    if (!activePlannedPreviewSession) return;
    const result = (await api.saveWorkoutSteps(token, activePlannedPreviewSession.id, workout as unknown as Record<string, unknown>)) as PlanningPlannedSession;
    dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW", payload: result.structured_workout_payload ?? null });
    if (athleteId) await loadPlanningContext(String(athleteId), selectedDiscipline);
  }, [activePlannedPreviewSession, athleteId, loadPlanningContext, selectedDiscipline, token, dispatch]);

  const handlePushToGarmin = useCallback(async () => {
    if (!activePlannedPreviewSession || !athleteId) return;
    await api.pushWorkoutToGarmin(token, Number(athleteId), activePlannedPreviewSession.id);
    if (athleteId) await loadPlanningContext(String(athleteId), selectedDiscipline);
  }, [activePlannedPreviewSession, athleteId, loadPlanningContext, selectedDiscipline, token]);

  const handleChangeTargetMode = useCallback(async (mode: "pace" | "hr" | "power") => {
    if (!activePlannedPreviewSession) return;
    const result = (await api.updateTargetMode(token, activePlannedPreviewSession.id, mode)) as PlanningPlannedSession;
    dispatch({ type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW", payload: result.structured_workout_payload ?? null });
    if (athleteId) await loadPlanningContext(String(athleteId), selectedDiscipline);
  }, [activePlannedPreviewSession, athleteId, loadPlanningContext, selectedDiscipline, token, dispatch]);

  // ── Display labels ──

  const activeBlockLabel = overview?.current_block.energy_system_focus ? `${overview.current_block.energy_system_focus} · ${overview.current_block.block_objective}` : "Sin bloque activo";
  const nextTargetPrimaryLabel = overview?.next_recommendation.next_target?.distance_label || overview?.next_recommendation.next_target?.objective || "Objetivo abierto";
  const nextTargetLabel = overview?.next_recommendation.next_target ? [overview.next_recommendation.next_target.target_date ? formatDate(overview.next_recommendation.next_target.target_date) : "Sin fecha", overview.next_recommendation.next_target.target_metric ? `Ritmo objetivo ${overview.next_recommendation.next_target.target_metric}` : null].filter(Boolean).join(" · ") : "Sin fecha";
  const selectedAthlete = useMemo(() => athletes.find((a) => String(a.id) === String(athleteId)) ?? null, [athleteId, athletes]);
  const visibleTargets = useMemo(() => {
    const today = formatDateKey(new Date());
    return (selectedAthlete?.targets ?? []).filter((t) => !t.target_date || t.target_date >= today).sort((l, r) => String(l.target_date).localeCompare(String(r.target_date))).slice(0, 4);
  }, [selectedAthlete]);

  // ── Calendar navigation (week/month grid) ──

  const selectedWeekStart = useMemo(() => startOfWeek(selectedCalendarDate || selectedCalendarSource.startDate), [selectedCalendarDate, selectedCalendarSource.startDate]);
  const selectedWeekEnd = useMemo(() => addDays(selectedWeekStart, 6), [selectedWeekStart]);
  const selectedWeekdayOffset = useMemo(() => {
    if (!selectedCalendarDate) return 0;
    return Math.max(0, Math.min(6, Math.round((dateValue(selectedCalendarDate) - dateValue(selectedWeekStart)) / 86400000)));
  }, [selectedCalendarDate, selectedWeekStart]);

  // ── Copy Week (2D) ──

  const copyCurrentWeek = useCallback(async () => {
    if (!athleteId || !overview) return;
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(selectedWeekStart, i));
    const sessionsThisWeek = weekDates.flatMap((d) => sessionsByDate.get(d) ?? []).filter((s) => !s.isOverlay && s.rawId != null);
    if (!sessionsThisWeek.length) {
      alert("No hay sesiones planificadas esta semana para copiar.");
      return;
    }
    const nextWeekStart = addDays(selectedWeekStart, 7);
    const confirmed = window.confirm(`¿Copiar ${sessionsThisWeek.length} sesiones a la semana del ${nextWeekStart}?`);
    if (!confirmed) return;
    try {
      const plannedSessions2 = overview.planned_sessions ?? [];
      for (const session of sessionsThisWeek) {
        const original = plannedSessions2.find((p) => p.id === session.rawId);
        if (!original) continue;
        const dayOffset = weekDates.indexOf(session.date);
        const newDate = addDays(nextWeekStart, dayOffset >= 0 ? dayOffset : 0);
        await api.addFocusBlock(token, Number(athleteId), {
          start_date: newDate,
          end_date: newDate,
          template_id: original.workout_template_id || null,
          energy_system_focus: selectedCalendarSource.energySystemFocus || "Aerobic Capacity",
          block_objective: original.objective || "Copia de semana",
          block_intent: `Copiado de la semana ${selectedWeekStart}`,
          priority_discipline: selectedDiscipline,
          phase: selectedCalendarSource.phase || "base",
          status: "planned",
          coach_notes: `Sesión copiada: ${original.public_label}`,
        });
      }
      await loadPlanningContext(String(athleteId), selectedDiscipline);
      dispatch({ type: "SET_SELECTED_CALENDAR_DATE", payload: nextWeekStart });
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudieron copiar las sesiones.");
    }
  }, [athleteId, dispatch, loadPlanningContext, overview, selectedCalendarSource, selectedDiscipline, selectedWeekStart, sessionsByDate, token]);

  const continuousMonthStarts = useMemo(() => {
    const allDates = [selectedCalendarSource.startDate, selectedCalendarSource.endDate, selectedCalendarDate, calendarMonth, isoDateFromToday(), ...primaryEntries.map((s) => s.date), ...overlayEntries.map((s) => s.date)].filter(Boolean) as string[];
    const sorted = allDates.map((v) => startOfMonth(v)).sort((l, r) => dateValue(l) - dateValue(r));
    const minMonth = sorted[0] ?? startOfMonth(isoDateFromToday());
    const maxMonth = sorted[sorted.length - 1] ?? minMonth;
    const rangeStart = startOfMonth(addMonths(minMonth, -6));
    const rangeEnd = startOfMonth(addMonths(maxMonth, 6));
    const totalMonths = Math.max(1, diffCalendarMonths(rangeStart, rangeEnd) + 1);
    return Array.from({ length: totalMonths }, (_, i) => startOfMonth(addMonths(rangeStart, i)));
  }, [calendarMonth, overlayEntries, primaryEntries, selectedCalendarDate, selectedCalendarSource.endDate, selectedCalendarSource.startDate]);

  const continuousMonthSections = useMemo<CalendarMonthSection[]>(() => continuousMonthStarts.map((monthStart) => {
    const rows = buildCalendarMonthRows(monthStart, sessionsByDate, athleteAnalysis, selectedDiscipline);
    const totalMinutes = rows.reduce((sum, row) => sum + row.snapshot.totalMinutes, 0);
    const totalSessions = rows.reduce((sum, row) => sum + row.snapshot.totalSessions, 0);
    return {
      monthStart, rows,
      scale: {
        totalMinutes: Math.max(1, ...rows.map((r) => r.snapshot.totalMinutes)),
        disciplineMinutes: ["running", "ciclismo", "natación"].reduce<Record<string, number>>((acc, d) => { acc[d] = Math.max(1, ...rows.map((r) => r.snapshot.disciplineMetrics.find((m) => m.discipline === d)?.minutes ?? 0)); return acc; }, {}),
      },
      totalMinutes, totalSessions,
    };
  }), [athleteAnalysis, continuousMonthStarts, selectedDiscipline, sessionsByDate]);

  const calendarToolbarHeading = useMemo(() => (calendarVisualMode === "week" ? weekHeading(selectedWeekStart, selectedWeekEnd) : monthHeading(calendarMonth)), [calendarMonth, calendarVisualMode, selectedWeekEnd, selectedWeekStart]);
  const calendarToolbarSubheading = useMemo(() => (calendarVisualMode === "week" ? `${compactPlanningSourceTitle(selectedCalendarSource)} · ${disciplineLabel(selectedCalendarSource.discipline)} · Semana visible` : `${compactPlanningSourceTitle(selectedCalendarSource)} · ${disciplineLabel(selectedCalendarSource.discipline)}`), [calendarVisualMode, selectedCalendarSource]);

  const continuousWeekStarts = useMemo(() => {
    const allDates = [selectedCalendarSource.startDate, selectedCalendarSource.endDate, selectedCalendarDate, isoDateFromToday(), ...primaryEntries.map((s) => s.date), ...overlayEntries.map((s) => s.date)].filter(Boolean) as string[];
    const sorted = allDates.map((v) => startOfWeek(v)).sort((l, r) => dateValue(l) - dateValue(r));
    const minWeek = sorted[0] ?? startOfWeek(isoDateFromToday());
    const maxWeek = sorted[sorted.length - 1] ?? minWeek;
    const rangeStart = addDays(minWeek, -35);
    const rangeEnd = addDays(maxWeek, 35);
    const totalWeeks = Math.max(1, Math.round((dateValue(rangeEnd) - dateValue(rangeStart)) / 86400000 / 7) + 1);
    return Array.from({ length: totalWeeks }, (_, i) => addDays(rangeStart, i * 7));
  }, [overlayEntries, primaryEntries, selectedCalendarDate, selectedCalendarSource.endDate, selectedCalendarSource.startDate]);

  const calendarMesocycleOptions = useMemo<CalendarMesocycleOption[]>(() => {
    const recommendation = overview?.next_recommendation;
    const candidateOrder = recommendation?.candidates_scored ?? [];
    const options = candidateOrder.map<CalendarMesocycleOption | null>((candidate) => {
      const template = templateLibrary.find((i) => i.block_type === candidate.block_type);
      if (!template) return null;
      const isBest = template.template_id === recommendation?.template_id || candidate.block_type === recommendation?.recommended_block_type;
      return { template, score: candidate.score ?? null, isBest, whyItFits: (isBest ? recommendation?.reasoning : candidate.reasons) ?? [], whyNotAsGood: (isBest ? recommendation?.risk_flags : candidate.contraindications) ?? [] };
    }).filter((o): o is CalendarMesocycleOption => o !== null);
    if (options.length) return options.map((o) => ({ ...o, whyItFits: o.whyItFits.slice(0, 3), whyNotAsGood: o.whyNotAsGood.slice(0, 3) }));
    return templateLibrary.map((template, i) => {
      const isBest = template.template_id === recommendation?.template_id || i === 0;
      return { template, score: null, isBest, whyItFits: isBest ? (recommendation?.reasoning ?? []).slice(0, 3) : [], whyNotAsGood: isBest ? (recommendation?.risk_flags ?? []).slice(0, 3) : [] };
    });
  }, [overview?.next_recommendation, templateLibrary]);

  const calendarNavigation = useCalendarNavigation(dispatch, calendarMonth, calendarVisualMode, selectedWeekStart, selectedWeekdayOffset, continuousWeekStarts, continuousMonthStarts);

  // ── Add session to day (from library or manual) ──

  const handleAddSessionToDay = useCallback(async (date: string, discipline: string, template: PlanningWorkoutTemplate | null, manualLabel?: string, opts?: { bla_check?: boolean }) => {
    if (!athleteId) return;
    const label = template?.public_label || manualLabel || "Sesión manual";
    await api.addPlannedSession(token, {
      athlete_id: Number(athleteId),
      scheduled_date: date,
      discipline,
      template_id: template?.template_id ?? null,
      public_label: label,
      objective: template?.objective ?? "",
      session_family: template?.session_family ?? "manual",
      session_role: template ? "support" : "support",
      dose_step: template?.dose_ladder?.[0] ? 0 : null,
      bla_check: opts?.bla_check ?? false,
    });
    await loadPlanningContext(athleteId, selectedDiscipline);
  }, [athleteId, token, selectedDiscipline, loadPlanningContext]);

  // ── Render ──

  if (loading) return <div className="loading">Preparando planificación...</div>;
  if (error) return <div className="error">No se pudo cargar la planificación: {error}</div>;

  const thresholdWarnings = overview?.threshold_warnings ?? [];

  const handleRefreshStaleTargets = async () => {
    if (!athleteId) return;
    try {
      await api.refreshStaleTargets(token, Number(athleteId));
      await loadPlanningContext(athleteId, selectedDiscipline);
    } catch (err) {
      console.error("Failed to refresh stale targets:", err);
    }
  };

  return (
    <>
    {thresholdWarnings.length > 0 && (
      <div style={{ padding: "0 16px" }}>
        {thresholdWarnings.map((w, i) => (
          <div key={i} className={`threshold-warning-banner severity-${w.severity}`}>
            <span className="warning-message">{w.message}</span>
          </div>
        ))}
        <button
          onClick={handleRefreshStaleTargets}
          style={{
            marginBottom: 12,
            padding: "6px 14px",
            fontSize: "0.78rem",
            fontWeight: 600,
            borderRadius: 6,
            border: "1px solid #fbbf24",
            background: "#fef3c7",
            color: "#92400e",
            cursor: "pointer",
          }}
        >
          Actualizar targets desactualizados
        </button>
      </div>
    )}
    <CalendarOverlay
      state={state}
      dispatch={dispatch}
      token={token}
      athleteId={athleteId}
      calendarWorkspaceTab={calendarPanelOpen ? calendarWorkspaceTab : "calendar"}
      selectedAthlete={selectedAthlete}
      activeBlockLabel={activeBlockLabel}
      nextTargetPrimaryLabel={nextTargetPrimaryLabel}
      nextTargetLabel={nextTargetLabel}
      templateLibrary={templateLibrary}
      calendarSources={calendarSources}
      selectedCalendarSource={selectedCalendarSource}
      draftCalendarSource={draftCalendarSource}
      calendarMesocycleOptions={calendarMesocycleOptions}
      continuousMonthSections={continuousMonthSections}
      continuousWeekStarts={continuousWeekStarts}
      sessionsByDate={sessionsByDate}
      primaryEntries={primaryEntries}
      overlayEntries={overlayEntries}
      selectedWeekStart={selectedWeekStart}
      selectedWeekEnd={selectedWeekEnd}
      calendarToolbarHeading={calendarToolbarHeading}
      calendarToolbarSubheading={calendarToolbarSubheading}
      planningLt1={planningLt1}
      planningLt2={planningLt2}
      planningThresholdBasis={planningThresholdBasis}
      quickAddDisciplineLibrary={quickAddDisciplineLibrary}
      quickAddAvailableLayers={quickAddAvailableLayers}
      quickAddActiveLayer={quickAddActiveLayer}
      quickAddLayerCounts={quickAddLayerCounts}
      quickAddFilteredLibrary={quickAddFilteredLibrary}
      quickAddDiscipline={quickAddDiscipline}
      closeCalendarPanel={closeCalendarPanel}
      openCalendarWorkspaceTab={openCalendarWorkspaceTab}
      updatePlanningRoute={updatePlanningRoute}
      openCalendarMesocycleComposer={openCalendarMesocycleComposer}
      closeCalendarMesocycleComposer={closeCalendarMesocycleComposer}
      openCalendarQuickAdd={openCalendarQuickAdd}
      closeCalendarQuickAdd={closeCalendarQuickAdd}
      openCalendarWorkoutLibrary={openCalendarWorkoutLibrary}
      openCalendarSessionDetail={openCalendarSessionDetail}
      openPlannedWorkoutPreview={openPlannedWorkoutPreview}
      openPlannedWorkoutRawInformation={openPlannedWorkoutRawInformation}
      openLibraryWorkoutPreview={openLibraryWorkoutPreview}
      openMesocycleLibraryFromSource={openMesocycleLibraryFromSource}
      deletePlanningSourceFromModal={deletePlanningSourceFromModal}
      saveFocusBlockFromPlanning={saveFocusBlockFromPlanning}
      regeneratePlannedSessionStructure={regeneratePlannedSessionStructure}
      handleSaveWorkoutSteps={handleSaveWorkoutSteps}
      handlePushToGarmin={handlePushToGarmin}
      handleChangeTargetMode={handleChangeTargetMode}
      loadPlanningContext={loadPlanningContext}
      onCopyWeek={copyCurrentWeek}
      onReviewSession={handleReviewSession}
      showAllDisciplines={showAllDisciplines}
      onToggleAllDisciplines={handleToggleAllDisciplines}
      hasMultipleDisciplines={availableDisciplines.length > 1}
      navRefs={calendarNavigation}
      jumpCalendarToToday={calendarNavigation.jumpCalendarToToday}
      shiftCalendarBackward={calendarNavigation.shiftCalendarBackward}
      shiftCalendarForward={calendarNavigation.shiftCalendarForward}
      handleContinuousWeekScroll={calendarNavigation.handleContinuousWeekScroll}
      handleContinuousMonthScroll={calendarNavigation.handleContinuousMonthScroll}
      onAddSessionToDay={handleAddSessionToDay}
      compactHeader={{
        athletes,
        availableDisciplines,
        visibleTargets,
        planningLt1,
        planningLt2,
      }}
    />
    {reviewSession && (
      <CoachSessionReviewModal
        session={reviewSession}
        token={token}
        onClose={() => setReviewSessionId(null)}
        onFeedbackSaved={handleFeedbackSaved}
      />
    )}
    </>
  );
}
