import { useCallback, useEffect } from "react";
import type { Dispatch } from "react";

import { api } from "../../lib/api";
import type { Athlete, AthleteAnalysis, CoachLibrary, CoachPlan, PlanningOverview, PlanningWorkoutTemplate } from "../../types";
import type { PlanningAction, PlanningState } from "./PlanningContext";

/**
 * Encapsulates all data-loading useEffects from PlanningPage.
 * Dispatches actions to update PlanningState via the reducer.
 */
export function usePlanningData(
  token: string,
  state: PlanningState,
  dispatch: Dispatch<PlanningAction>,
  athleteId: string | null,
  searchDiscipline: string,
  calendarPanelOpen: boolean,
  calendarWorkspaceTab: string,
  updatePlanningRoute: (nextAthleteId: string, nextDiscipline: string) => void,
) {
  const {
    athletes,
    overview,
    selectedDiscipline,
    rosterAnalyses,
    disciplineOverviews,
  } = state;

  // ── Load athletes ──
  useEffect(() => {
    let cancelled = false;
    async function loadAthletes() {
      try {
        const result = (await api.athletes(token)) as Athlete[];
        if (!cancelled) dispatch({ type: "SET_ATHLETES", payload: result });
      } catch {
        if (!cancelled) dispatch({ type: "SET_ATHLETES", payload: [] });
      }
    }
    loadAthletes();
    return () => { cancelled = true; };
  }, [token, dispatch]);

  // ── Auto-select first athlete ──
  useEffect(() => {
    if (athleteId || !athletes.length) return;
    const firstAthlete = athletes[0];
    const initialDiscipline = firstAthlete.primary_discipline === "triatlón" ? "running" : firstAthlete.primary_discipline ?? "running";
    updatePlanningRoute(String(firstAthlete.id), initialDiscipline);
  }, [athleteId, athletes, updatePlanningRoute]);

  // ── Sync selectedDiscipline from URL ──
  useEffect(() => {
    dispatch({ type: "SET_SELECTED_DISCIPLINE", payload: searchDiscipline });
  }, [searchDiscipline, dispatch]);

  // ── Load athlete analysis ──
  useEffect(() => {
    let cancelled = false;
    async function loadAnalysis() {
      if (!athleteId) {
        dispatch({ type: "SET_ATHLETE_ANALYSIS", payload: null });
        return;
      }
      try {
        const result = (await api.athleteAnalysis(token, athleteId)) as AthleteAnalysis;
        if (!cancelled) dispatch({ type: "SET_ATHLETE_ANALYSIS", payload: result });
      } catch {
        if (!cancelled) dispatch({ type: "SET_ATHLETE_ANALYSIS", payload: null });
      }
    }
    loadAnalysis();
    return () => { cancelled = true; };
  }, [athleteId, token, dispatch]);

  // ── Load roster analyses (summary tab) ──
  useEffect(() => {
    let cancelled = false;
    async function loadRosterAnalyses() {
      if (!calendarPanelOpen || calendarWorkspaceTab !== "summary" || !athletes.length) return;
      const missingAthletes = athletes.filter((athlete) => rosterAnalyses[athlete.id] === undefined);
      if (!missingAthletes.length) return;
      dispatch({ type: "SET_ROSTER_ANALYSES_LOADING", payload: true });
      try {
        const results = await Promise.allSettled(
          missingAthletes.map(async (athlete) =>
            [athlete.id, (await api.athleteAnalysis(token, athlete.id)) as AthleteAnalysis] as const,
          ),
        );
        if (!cancelled) {
          const next: Record<number, AthleteAnalysis | null> = {};
          results.forEach((result, index) => {
            const athlete = missingAthletes[index];
            next[athlete.id] = result.status === "fulfilled" ? result.value[1] : null;
          });
          dispatch({ type: "MERGE_ROSTER_ANALYSES", payload: next });
        }
      } finally {
        if (!cancelled) dispatch({ type: "SET_ROSTER_ANALYSES_LOADING", payload: false });
      }
    }
    loadRosterAnalyses();
    return () => { cancelled = true; };
  }, [athletes, calendarPanelOpen, calendarWorkspaceTab, rosterAnalyses, token, dispatch]);

  // ── Load planning overview ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!athleteId) {
        dispatch({ type: "SET_OVERVIEW", payload: null });
        dispatch({ type: "SET_LOADING", payload: false });
        return;
      }
      try {
        const result = (await api.planningOverview(token, athleteId, selectedDiscipline)) as PlanningOverview;
        if (!cancelled) {
          dispatch({ type: "SET_OVERVIEW_AND_DISCIPLINE", payload: { overview: result, discipline: selectedDiscipline } });
        }
      } catch (loadError) {
        if (!cancelled) {
          dispatch({ type: "SET_OVERVIEW", payload: null });
          dispatch({ type: "SET_ERROR", payload: loadError instanceof Error ? loadError.message : "No se pudo cargar la planificación." });
        }
      } finally {
        if (!cancelled) dispatch({ type: "SET_LOADING", payload: false });
      }
    }
    load();
    return () => { cancelled = true; };
  }, [athleteId, token, selectedDiscipline, dispatch]);

  // ── Load overlay discipline overviews ──
  const availableDisciplines = getAvailableDisciplines(overview, searchDiscipline);

  useEffect(() => {
    let cancelled = false;
    async function loadOverlayDisciplines() {
      if (!athleteId || availableDisciplines.length <= 1) return;
      const missingDisciplines = availableDisciplines.filter((discipline) => !disciplineOverviews[discipline]);
      if (!missingDisciplines.length) return;
      try {
        const results = await Promise.all(
          missingDisciplines.map(async (discipline) =>
            [discipline, (await api.planningOverview(token, athleteId, discipline)) as PlanningOverview] as const,
          ),
        );
        if (!cancelled) {
          const next: Record<string, PlanningOverview> = {};
          results.forEach(([discipline, result]) => { next[discipline] = result; });
          dispatch({ type: "MERGE_DISCIPLINE_OVERVIEWS", payload: next });
        }
      } catch {
        // silently ignore
      }
    }
    loadOverlayDisciplines();
    return () => { cancelled = true; };
  }, [athleteId, availableDisciplines, disciplineOverviews, token, dispatch]);

  // ── Load workout library for selected discipline ──
  useEffect(() => {
    let cancelled = false;
    async function loadWorkoutLibrary() {
      try {
        const result = (await api.generalPlanningWorkoutLibrary(token, selectedDiscipline)) as PlanningWorkoutTemplate[];
        if (!cancelled) dispatch({ type: "SET_WORKOUT_LIBRARY", payload: result });
      } catch {
        if (!cancelled) dispatch({ type: "SET_WORKOUT_LIBRARY", payload: [] });
      }
    }
    loadWorkoutLibrary();
    dispatch({ type: "SET_OPEN_WORKOUT_PREVIEW", payload: null });
    return () => { cancelled = true; };
  }, [selectedDiscipline, token, dispatch]);

  // ── Load quick-add libraries for all disciplines ──
  useEffect(() => {
    let cancelled = false;
    async function loadQuickAddLibraries() {
      const disciplines: Array<"running" | "ciclismo" | "natación"> = ["running", "ciclismo", "natación"];
      try {
        const results = await Promise.all(
          disciplines.map(async (discipline) =>
            [discipline, (await api.generalPlanningWorkoutLibrary(token, discipline)) as PlanningWorkoutTemplate[]] as const,
          ),
        );
        if (!cancelled) dispatch({ type: "SET_QUICK_ADD_LIBRARIES", payload: Object.fromEntries(results) });
      } catch {
        if (!cancelled) dispatch({ type: "SET_QUICK_ADD_LIBRARIES", payload: {} });
      }
    }
    loadQuickAddLibraries();
    return () => { cancelled = true; };
  }, [token, dispatch]);

  // ── Load coach libraries ──
  useEffect(() => {
    let cancelled = false;
    async function loadCoachLibraries() {
      try {
        const result = (await api.listCoachLibraries(token)) as CoachLibrary[];
        if (!cancelled) dispatch({ type: "SET_COACH_LIBRARIES", payload: result });
      } catch {
        if (!cancelled) dispatch({ type: "SET_COACH_LIBRARIES", payload: [] });
      }
    }
    loadCoachLibraries();
    return () => { cancelled = true; };
  }, [token, dispatch]);

  // ── Load coach plans ──
  useEffect(() => {
    let cancelled = false;
    async function loadCoachPlans() {
      try {
        const result = (await api.listCoachPlans(token)) as CoachPlan[];
        if (!cancelled) dispatch({ type: "SET_COACH_PLANS", payload: result });
      } catch {
        if (!cancelled) dispatch({ type: "SET_COACH_PLANS", payload: [] });
      }
    }
    loadCoachPlans();
    return () => { cancelled = true; };
  }, [token, dispatch]);

  // ── Reload planning context helper (used by save/delete callbacks) ──
  const loadPlanningContext = useCallback(async (currentAthleteId: string, currentDiscipline: string) => {
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });
    try {
      const result = (await api.planningOverview(token, currentAthleteId, currentDiscipline)) as PlanningOverview;
      dispatch({ type: "SET_OVERVIEW_AND_DISCIPLINE", payload: { overview: result, discipline: currentDiscipline } });
    } catch (loadError) {
      dispatch({ type: "SET_OVERVIEW", payload: null });
      dispatch({ type: "SET_ERROR", payload: loadError instanceof Error ? loadError.message : "No se pudo cargar la planificación." });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [token, dispatch]);

  return { loadPlanningContext };
}

// Helper to compute available disciplines (also used by components)
export function getAvailableDisciplines(overview: PlanningOverview | null, searchDiscipline: string): string[] {
  if (overview?.athlete_primary_discipline === "triatlón") {
    return ["natación", "ciclismo", "running"];
  }
  if (overview?.athlete_primary_discipline) {
    return [overview.athlete_primary_discipline];
  }
  return [searchDiscipline];
}
