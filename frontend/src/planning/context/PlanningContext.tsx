import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import type {
  Athlete,
  AthleteAnalysis,
  CoachLibrary,
  CoachPlan,
  DailyTrainingLoad,
  PlanningOverview,
  PlanningPlannedSession,
  PlanningWorkoutTemplate,
  WorkoutDefinition,
} from "../../types";
import type {
  CalendarQuickAddState,
  CalendarWorkspaceTab,
  GarminCalendarActivity,
  OpenWorkoutPreviewState,
  PlanningSourceModalState,
} from "../types";
import { isoDateFromToday, parseCalendarWorkspaceTab, startOfMonth } from "../utils";

// ── Synthetic overrides persistence ──

const SYNTHETIC_OVERRIDES_KEY = "planning_synthetic_date_overrides";

function loadSyntheticOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SYNTHETIC_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSyntheticOverrides(overrides: Record<string, string>) {
  try {
    if (Object.keys(overrides).length) {
      localStorage.setItem(SYNTHETIC_OVERRIDES_KEY, JSON.stringify(overrides));
    } else {
      localStorage.removeItem(SYNTHETIC_OVERRIDES_KEY);
    }
  } catch { /* ignore quota errors */ }
}

// ── State shape ──

export type PlanningState = {
  athletes: Athlete[];
  overview: PlanningOverview | null;
  athleteAnalysis: AthleteAnalysis | null;
  rosterAnalyses: Record<number, AthleteAnalysis | null>;
  rosterAnalysesLoading: boolean;
  disciplineOverviews: Record<string, PlanningOverview>;
  loading: boolean;
  error: string | null;
  selectedDiscipline: string;
  selectedTemplateId: string;
  expandedTemplateId: string | null;
  blockObjective: string;
  primaryWeakness: string;
  secondaryWeakness: string;
  weeks: string;
  density: string;
  priority: string;
  blockStartDate: string;
  blockPhase: string;
  blockIntent: string;
  coachNotes: string;
  saveError: string | null;
  saveMessage: string | null;
  saving: boolean;
  deletingBlockId: number | null;
  ribbonExpanded: boolean;
  calendarVisualMode: "month" | "week";
  selectedLibrarySourceId: string;
  selectedCalendarSourceId: string;
  calendarMonth: string;
  selectedCalendarDate: string | null;
  dayPanelOpen: boolean;
  enabledOverlayDisciplines: string[];
  workoutLibrary: PlanningWorkoutTemplate[];
  quickAddLibraries: Record<string, PlanningWorkoutTemplate[]>;
  coachLibraries: CoachLibrary[];
  coachPlans: CoachPlan[];
  openWorkoutPreview: OpenWorkoutPreviewState | null;
  showPlannedSessionRawInformation: boolean;
  plannedSessionStructuredPreview: WorkoutDefinition | null;
  plannedSessionStructuredPreviewLoading: boolean;
  plannedSessionStructuredPreviewError: string | null;
  plannedSessionRegeneratingId: number | null;
  planningSourceModal: PlanningSourceModalState | null;
  calendarComposerDate: string | null;
  calendarQuickAdd: CalendarQuickAddState | null;
  syntheticDateOverrides: Record<string, string>;
  garminActivities: GarminCalendarActivity[];
  garminActivitiesLoading: boolean;
  trainingLoadDays: DailyTrainingLoad[];
  trainingLoadLoading: boolean;
};

// ── Actions ──

export type PlanningAction =
  | { type: "SET_ATHLETES"; payload: Athlete[] }
  | { type: "SET_OVERVIEW"; payload: PlanningOverview | null }
  | { type: "SET_ATHLETE_ANALYSIS"; payload: AthleteAnalysis | null }
  | { type: "SET_ROSTER_ANALYSES"; payload: Record<number, AthleteAnalysis | null> }
  | { type: "MERGE_ROSTER_ANALYSES"; payload: Record<number, AthleteAnalysis | null> }
  | { type: "SET_ROSTER_ANALYSES_LOADING"; payload: boolean }
  | { type: "SET_DISCIPLINE_OVERVIEWS"; payload: Record<string, PlanningOverview> }
  | { type: "MERGE_DISCIPLINE_OVERVIEWS"; payload: Record<string, PlanningOverview> }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_SELECTED_DISCIPLINE"; payload: string }
  | { type: "SET_SELECTED_TEMPLATE_ID"; payload: string }
  | { type: "SET_EXPANDED_TEMPLATE_ID"; payload: string | null }
  | { type: "SET_BLOCK_OBJECTIVE"; payload: string }
  | { type: "SET_PRIMARY_WEAKNESS"; payload: string }
  | { type: "SET_SECONDARY_WEAKNESS"; payload: string }
  | { type: "SET_WEEKS"; payload: string }
  | { type: "SET_DENSITY"; payload: string }
  | { type: "SET_PRIORITY"; payload: string }
  | { type: "SET_BLOCK_START_DATE"; payload: string }
  | { type: "SET_BLOCK_PHASE"; payload: string }
  | { type: "SET_BLOCK_INTENT"; payload: string }
  | { type: "SET_COACH_NOTES"; payload: string }
  | { type: "SET_SAVE_ERROR"; payload: string | null }
  | { type: "SET_SAVE_MESSAGE"; payload: string | null }
  | { type: "SET_SAVING"; payload: boolean }
  | { type: "SET_DELETING_BLOCK_ID"; payload: number | null }
  | { type: "SET_RIBBON_EXPANDED"; payload: boolean }
  | { type: "SET_CALENDAR_VISUAL_MODE"; payload: "month" | "week" }
  | { type: "SET_SELECTED_LIBRARY_SOURCE_ID"; payload: string }
  | { type: "SET_SELECTED_CALENDAR_SOURCE_ID"; payload: string }
  | { type: "SET_CALENDAR_MONTH"; payload: string }
  | { type: "SET_SELECTED_CALENDAR_DATE"; payload: string | null }
  | { type: "SET_DAY_PANEL_OPEN"; payload: boolean }
  | { type: "SET_ENABLED_OVERLAY_DISCIPLINES"; payload: string[] }
  | { type: "SET_WORKOUT_LIBRARY"; payload: PlanningWorkoutTemplate[] }
  | { type: "SET_QUICK_ADD_LIBRARIES"; payload: Record<string, PlanningWorkoutTemplate[]> }
  | { type: "SET_COACH_LIBRARIES"; payload: CoachLibrary[] }
  | { type: "SET_COACH_PLANS"; payload: CoachPlan[] }
  | { type: "SET_OPEN_WORKOUT_PREVIEW"; payload: OpenWorkoutPreviewState | null }
  | { type: "SET_SHOW_PLANNED_SESSION_RAW_INFORMATION"; payload: boolean }
  | { type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW"; payload: WorkoutDefinition | null }
  | { type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_LOADING"; payload: boolean }
  | { type: "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_ERROR"; payload: string | null }
  | { type: "SET_PLANNED_SESSION_REGENERATING_ID"; payload: number | null }
  | { type: "SET_PLANNING_SOURCE_MODAL"; payload: PlanningSourceModalState | null }
  | { type: "SET_CALENDAR_COMPOSER_DATE"; payload: string | null }
  | { type: "SET_CALENDAR_QUICK_ADD"; payload: CalendarQuickAddState | null }
  | { type: "SET_OVERVIEW_AND_DISCIPLINE"; payload: { overview: PlanningOverview; discipline: string } }
  | { type: "ADD_SESSION"; payload: PlanningPlannedSession }
  | { type: "UPDATE_SESSION"; payload: { sessionId: number; changes: Partial<PlanningPlannedSession> } }
  | { type: "MOVE_SESSION"; payload: { sessionId: number; newDate: string } }
  | { type: "DELETE_SESSION"; payload: { sessionId: number } }
  | { type: "MOVE_SYNTHETIC_SESSION"; payload: { syntheticId: string; newDate: string } }
  | { type: "SET_GARMIN_ACTIVITIES"; payload: GarminCalendarActivity[] }
  | { type: "SET_GARMIN_ACTIVITIES_LOADING"; payload: boolean }
  | { type: "SET_TRAINING_LOAD_DAYS"; payload: DailyTrainingLoad[] }
  | { type: "SET_TRAINING_LOAD_LOADING"; payload: boolean };

// ── Reducer ──

function planningReducer(state: PlanningState, action: PlanningAction): PlanningState {
  switch (action.type) {
    case "SET_ATHLETES":
      return { ...state, athletes: action.payload };
    case "SET_OVERVIEW":
      return { ...state, overview: action.payload };
    case "SET_ATHLETE_ANALYSIS":
      return { ...state, athleteAnalysis: action.payload };
    case "SET_ROSTER_ANALYSES":
      return { ...state, rosterAnalyses: action.payload };
    case "MERGE_ROSTER_ANALYSES":
      return { ...state, rosterAnalyses: { ...state.rosterAnalyses, ...action.payload } };
    case "SET_ROSTER_ANALYSES_LOADING":
      return { ...state, rosterAnalysesLoading: action.payload };
    case "SET_DISCIPLINE_OVERVIEWS":
      return { ...state, disciplineOverviews: action.payload };
    case "MERGE_DISCIPLINE_OVERVIEWS":
      return { ...state, disciplineOverviews: { ...state.disciplineOverviews, ...action.payload } };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_SELECTED_DISCIPLINE":
      return { ...state, selectedDiscipline: action.payload };
    case "SET_SELECTED_TEMPLATE_ID":
      return { ...state, selectedTemplateId: action.payload };
    case "SET_EXPANDED_TEMPLATE_ID":
      return { ...state, expandedTemplateId: action.payload };
    case "SET_BLOCK_OBJECTIVE":
      return { ...state, blockObjective: action.payload };
    case "SET_PRIMARY_WEAKNESS":
      return { ...state, primaryWeakness: action.payload };
    case "SET_SECONDARY_WEAKNESS":
      return { ...state, secondaryWeakness: action.payload };
    case "SET_WEEKS":
      return { ...state, weeks: action.payload };
    case "SET_DENSITY":
      return { ...state, density: action.payload };
    case "SET_PRIORITY":
      return { ...state, priority: action.payload };
    case "SET_BLOCK_START_DATE":
      return { ...state, blockStartDate: action.payload };
    case "SET_BLOCK_PHASE":
      return { ...state, blockPhase: action.payload };
    case "SET_BLOCK_INTENT":
      return { ...state, blockIntent: action.payload };
    case "SET_COACH_NOTES":
      return { ...state, coachNotes: action.payload };
    case "SET_SAVE_ERROR":
      return { ...state, saveError: action.payload };
    case "SET_SAVE_MESSAGE":
      return { ...state, saveMessage: action.payload };
    case "SET_SAVING":
      return { ...state, saving: action.payload };
    case "SET_DELETING_BLOCK_ID":
      return { ...state, deletingBlockId: action.payload };
    case "SET_RIBBON_EXPANDED":
      return { ...state, ribbonExpanded: action.payload };
    case "SET_CALENDAR_VISUAL_MODE":
      return { ...state, calendarVisualMode: action.payload };
    case "SET_SELECTED_LIBRARY_SOURCE_ID":
      return { ...state, selectedLibrarySourceId: action.payload };
    case "SET_SELECTED_CALENDAR_SOURCE_ID":
      return { ...state, selectedCalendarSourceId: action.payload };
    case "SET_CALENDAR_MONTH":
      return { ...state, calendarMonth: action.payload };
    case "SET_SELECTED_CALENDAR_DATE":
      return { ...state, selectedCalendarDate: action.payload };
    case "SET_DAY_PANEL_OPEN":
      return { ...state, dayPanelOpen: action.payload };
    case "SET_ENABLED_OVERLAY_DISCIPLINES":
      return { ...state, enabledOverlayDisciplines: action.payload };
    case "SET_WORKOUT_LIBRARY":
      return { ...state, workoutLibrary: action.payload };
    case "SET_QUICK_ADD_LIBRARIES":
      return { ...state, quickAddLibraries: action.payload };
    case "SET_COACH_LIBRARIES":
      return { ...state, coachLibraries: action.payload };
    case "SET_COACH_PLANS":
      return { ...state, coachPlans: action.payload };
    case "SET_OPEN_WORKOUT_PREVIEW":
      return { ...state, openWorkoutPreview: action.payload };
    case "SET_SHOW_PLANNED_SESSION_RAW_INFORMATION":
      return { ...state, showPlannedSessionRawInformation: action.payload };
    case "SET_PLANNED_SESSION_STRUCTURED_PREVIEW":
      return { ...state, plannedSessionStructuredPreview: action.payload };
    case "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_LOADING":
      return { ...state, plannedSessionStructuredPreviewLoading: action.payload };
    case "SET_PLANNED_SESSION_STRUCTURED_PREVIEW_ERROR":
      return { ...state, plannedSessionStructuredPreviewError: action.payload };
    case "SET_PLANNED_SESSION_REGENERATING_ID":
      return { ...state, plannedSessionRegeneratingId: action.payload };
    case "SET_PLANNING_SOURCE_MODAL":
      return { ...state, planningSourceModal: action.payload };
    case "SET_CALENDAR_COMPOSER_DATE":
      return { ...state, calendarComposerDate: action.payload };
    case "SET_CALENDAR_QUICK_ADD":
      return { ...state, calendarQuickAdd: action.payload };
    case "SET_OVERVIEW_AND_DISCIPLINE":
      return {
        ...state,
        overview: action.payload.overview,
        disciplineOverviews: { ...state.disciplineOverviews, [action.payload.discipline]: action.payload.overview },
      };
    case "ADD_SESSION": {
      if (!state.overview) return state;
      return {
        ...state,
        overview: {
          ...state.overview,
          planned_sessions: [...state.overview.planned_sessions, action.payload],
        },
      };
    }
    case "UPDATE_SESSION": {
      if (!state.overview) return state;
      const { sessionId, changes } = action.payload;
      return {
        ...state,
        overview: {
          ...state.overview,
          planned_sessions: state.overview.planned_sessions.map((s) =>
            s.id === sessionId ? { ...s, ...changes } : s,
          ),
        },
      };
    }
    case "MOVE_SESSION": {
      if (!state.overview) return state;
      const { sessionId, newDate } = action.payload;
      return {
        ...state,
        overview: {
          ...state.overview,
          planned_sessions: state.overview.planned_sessions.map((s) =>
            s.id === sessionId ? { ...s, scheduled_date: newDate } : s,
          ),
        },
      };
    }
    case "DELETE_SESSION": {
      if (!state.overview) return state;
      const { sessionId } = action.payload;
      return {
        ...state,
        overview: {
          ...state.overview,
          planned_sessions: state.overview.planned_sessions.filter((s) => s.id !== sessionId),
        },
      };
    }
    case "SET_GARMIN_ACTIVITIES":
      return { ...state, garminActivities: action.payload };
    case "SET_GARMIN_ACTIVITIES_LOADING":
      return { ...state, garminActivitiesLoading: action.payload };
    case "SET_TRAINING_LOAD_DAYS":
      return { ...state, trainingLoadDays: action.payload };
    case "SET_TRAINING_LOAD_LOADING":
      return { ...state, trainingLoadLoading: action.payload };
    case "MOVE_SYNTHETIC_SESSION": {
      const nextOverrides = {
        ...state.syntheticDateOverrides,
        [action.payload.syntheticId]: action.payload.newDate,
      };
      saveSyntheticOverrides(nextOverrides);
      return { ...state, syntheticDateOverrides: nextOverrides };
    }
    default:
      return state;
  }
}

// ── Context ──

type PlanningContextValue = {
  state: PlanningState;
  dispatch: Dispatch<PlanningAction>;
  // URL-derived values (read-only from context perspective)
  athleteId: string | null;
  searchDiscipline: string;
  calendarPanelOpen: boolean;
  calendarWorkspaceTab: CalendarWorkspaceTab;
  token: string;
};

const PlanningContext = createContext<PlanningContextValue | null>(null);

export function usePlanning(): PlanningContextValue {
  const ctx = useContext(PlanningContext);
  if (!ctx) throw new Error("usePlanning must be used within PlanningProvider");
  return ctx;
}

type PlanningProviderProps = {
  token: string;
  children: ReactNode;
};

export function PlanningProvider({ token, children }: PlanningProviderProps) {
  const [searchParams] = useSearchParams();
  const athleteId = searchParams.get("athleteId");
  const searchDiscipline = searchParams.get("discipline") ?? "running";
  const calendarPanelOpen = searchParams.get("panel") === "calendar";
  const calendarWorkspaceTab = parseCalendarWorkspaceTab(searchParams.get("view"));

  const [state, dispatch] = useReducer(planningReducer, {
    athletes: [],
    overview: null,
    athleteAnalysis: null,
    rosterAnalyses: {},
    rosterAnalysesLoading: false,
    disciplineOverviews: {},
    loading: Boolean(athleteId),
    error: null,
    selectedDiscipline: searchDiscipline,
    selectedTemplateId: "",
    expandedTemplateId: null,
    blockObjective: "LT1",
    primaryWeakness: "Base aeróbica",
    secondaryWeakness: "LT1",
    weeks: "4",
    density: "media",
    priority: "controlado",
    blockStartDate: isoDateFromToday(),
    blockPhase: "base",
    blockIntent: "",
    coachNotes: "",
    saveError: null,
    saveMessage: null,
    saving: false,
    deletingBlockId: null,
    ribbonExpanded: false,
    calendarVisualMode: (searchParams.get("calView") as "month" | "week") || "week",
    selectedLibrarySourceId: "",
    selectedCalendarSourceId: "",
    calendarMonth: startOfMonth(isoDateFromToday()),
    selectedCalendarDate: searchParams.get("calDate") || null,
    dayPanelOpen: false,
    enabledOverlayDisciplines: [],
    workoutLibrary: [],
    quickAddLibraries: {},
    coachLibraries: [],
    coachPlans: [],
    openWorkoutPreview: null,
    showPlannedSessionRawInformation: false,
    plannedSessionStructuredPreview: null,
    plannedSessionStructuredPreviewLoading: false,
    plannedSessionStructuredPreviewError: null,
    plannedSessionRegeneratingId: null,
    planningSourceModal: null,
    calendarComposerDate: null,
    calendarQuickAdd: null,
    syntheticDateOverrides: loadSyntheticOverrides(),
    garminActivities: [],
    garminActivitiesLoading: false,
    trainingLoadDays: [],
    trainingLoadLoading: false,
  } satisfies PlanningState);

  return (
    <PlanningContext.Provider value={{ state, dispatch, athleteId, searchDiscipline, calendarPanelOpen, calendarWorkspaceTab, token }}>
      {children}
    </PlanningContext.Provider>
  );
}
