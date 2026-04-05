import { CapacitorHttp, HttpResponse } from "@capacitor/core";
import { isNative } from "./native";

const PRODUCTION_API = "https://lactate-lab-api.onrender.com/api";

function defaultApiUrls() {
  // Native app (Capacitor): use local API in dev, production otherwise
  if (isNative) {
    if (import.meta.env.DEV) {
      return ["http://192.168.1.42:8000/api", PRODUCTION_API];
    }
    return [PRODUCTION_API];
  }

  if (typeof window === "undefined") {
    return ["http://127.0.0.1:8000/api", "http://localhost:8000/api"];
  }

  if (import.meta.env.DEV) {
    return ["/api", "http://127.0.0.1:8000/api", "http://localhost:8000/api"];
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const candidates = [
    `${protocol}//${window.location.hostname}:8000/api`,
    `${protocol}//localhost:8000/api`,
    `${protocol}//127.0.0.1:8000/api`,
  ];

  return [...new Set(candidates)];
}

/** Native HTTP via Capacitor — bypasses CORS entirely */
async function nativeRequest<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = `${PRODUCTION_API}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  const method = (options.method ?? "GET").toUpperCase();
  let data: unknown = undefined;
  if (options.body && typeof options.body === "string") {
    try { data = JSON.parse(options.body); } catch { data = options.body; }
  }

  const response: HttpResponse = await CapacitorHttp.request({
    url,
    method,
    headers,
    data: data as any,
  });

  if (response.status === 401 && !path.includes("/garmin/")) {
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
  }
  if (response.status >= 400) {
    const detail = response.data?.detail ?? response.data?.message ?? response.data;
    const detailText = typeof detail === "string" ? detail : JSON.stringify(detail);
    throw new Error(`API ${method} ${path} fallo (${response.status}). ${detailText}`);
  }
  if (response.status === 204) return undefined as T;
  return response.data as T;
}

function normalizeApiUrl(url: string) {
  return url.replace(/\/+$/, "");
}

const API_URLS = (
  import.meta.env.VITE_API_URL ? [import.meta.env.VITE_API_URL] : defaultApiUrls()
).map((url) => normalizeApiUrl(url));

type FetchOptions = RequestInit & { token?: string | null };
const API_REQUEST_TIMEOUT_MS = 30000;

type ApiDebugInfo = {
  configuredApiUrls: string[];
  environmentApiUrl: string | null;
  appOrigin: string | null;
};

function getRequestMethod(options: FetchOptions) {
  return options.method ?? "GET";
}

function formatErrorDetail(detail: unknown) {
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

async function parseErrorPayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => ({}));
    return body?.detail ?? body?.message ?? body;
  }

  const text = await response.text().catch(() => "");
  return text.trim() || null;
}

function buildHttpError(url: string, path: string, options: FetchOptions, response: Response, detail: unknown) {
  const method = getRequestMethod(options);
  const detailText = formatErrorDetail(detail);
  const summary = `API ${method} ${path} fallo en ${url} (${response.status} ${response.statusText})`;
  return new Error(detailText ? `${summary}. ${detailText}` : summary);
}

function logApiFailure(url: string, path: string, options: FetchOptions, error: unknown) {
  const method = getRequestMethod(options);
  console.error("[api]", {
    method,
    path,
    url,
    error: error instanceof Error ? error.message : error,
    configuredApiUrls: API_URLS,
  });
}

function mergeAbortSignals(...signals: Array<AbortSignal | null | undefined>) {
  const availableSignals = signals.filter(Boolean) as AbortSignal[];
  if (!availableSignals.length) {
    return null;
  }

  const controller = new AbortController();
  const onAbort = () => {
    controller.abort();
    availableSignals.forEach((signal) => signal.removeEventListener("abort", onAbort));
  };

  availableSignals.forEach((signal) => {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });

  return controller.signal;
}

async function fetchWithTimeout(url: string, options: FetchOptions) {
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), API_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: mergeAbortSignals(options.signal, timeoutController.signal) ?? timeoutController.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Timeout al conectar con ${url} tras ${Math.round(API_REQUEST_TIMEOUT_MS / 1000)}s`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function getApiDebugInfo(): ApiDebugInfo {
  return {
    configuredApiUrls: API_URLS,
    environmentApiUrl: import.meta.env.VITE_API_URL ?? null,
    appOrigin: typeof window === "undefined" ? null : window.location.origin,
  };
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  // On native, use Capacitor's native HTTP (bypasses CORS)
  if (isNative) return nativeRequest<T>(path, options);

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  let lastError: unknown = null;
  for (const apiUrl of API_URLS) {
    const requestUrl = `${apiUrl}${path}`;
    try {
      const response = await fetchWithTimeout(requestUrl, { ...options, headers });
      if (!response.ok) {
        if (response.status === 401 && !path.includes("/garmin/")) {
          window.dispatchEvent(new CustomEvent("auth:unauthorized"));
        }
        const detail = await parseErrorPayload(response);
        const httpError = buildHttpError(requestUrl, path, options, response, detail);
        logApiFailure(requestUrl, path, options, httpError);
        throw httpError;
      }
      if (response.status === 204) {
        return undefined as T;
      }
      return response.json();
    } catch (error) {
      lastError = error;
      logApiFailure(requestUrl, path, options, error);
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
  }

  if (lastError instanceof TypeError) {
    throw new Error(
      `No se pudo conectar con la API usando ${API_URLS.join(" o ")}. Comprueba VITE_API_URL y que el backend esté accesible.`,
    );
  }
  throw lastError;
}

async function requestForm<T>(path: string, body: FormData, token: string): Promise<T> {
  if (isNative) {
    // Convert FormData to plain object for CapacitorHttp
    const data: Record<string, string> = {};
    body.forEach((v, k) => { data[k] = String(v); });
    return nativeRequest<T>(path, { method: "POST", token, body: JSON.stringify(data) });
  }

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  let lastError: unknown = null;
  for (const apiUrl of API_URLS) {
    const requestUrl = `${apiUrl}${path}`;
    try {
      const response = await fetchWithTimeout(requestUrl, { method: "POST", headers, body });
      if (!response.ok) {
        if (response.status === 401 && !path.includes("/garmin/")) {
          window.dispatchEvent(new CustomEvent("auth:unauthorized"));
        }
        const detail = await parseErrorPayload(response);
        const httpError = buildHttpError(requestUrl, path, { method: "POST" }, response, detail);
        logApiFailure(requestUrl, path, { method: "POST" }, httpError);
        throw httpError;
      }
      return response.json();
    } catch (error) {
      lastError = error;
      logApiFailure(requestUrl, path, { method: "POST" }, error);
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
  }

  if (lastError instanceof TypeError) {
    throw new Error(
      `No se pudo conectar con la API usando ${API_URLS.join(" o ")}. Comprueba VITE_API_URL y que el backend esté accesible.`,
    );
  }
  throw lastError;
}

async function requestBlob(path: string, options: FetchOptions = {}): Promise<Blob> {
  // Blob requests on native fall back to fetch (CapacitorHttp doesn't return Blob)
  const headers = new Headers(options.headers);
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }
  let lastError: unknown = null;
  for (const apiUrl of API_URLS) {
    const requestUrl = `${apiUrl}${path}`;
    try {
      const response = await fetchWithTimeout(requestUrl, { ...options, headers });
      if (!response.ok) {
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent("auth:unauthorized"));
        }
        const detail = await parseErrorPayload(response);
        const httpError = buildHttpError(requestUrl, path, options, response, detail);
        logApiFailure(requestUrl, path, options, httpError);
        throw httpError;
      }
      return response.blob();
    } catch (error) {
      lastError = error;
      logApiFailure(requestUrl, path, options, error);
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
  }

  if (lastError instanceof TypeError) {
    throw new Error(
      `No se pudo conectar con la API usando ${API_URLS.join(" o ")}. Comprueba VITE_API_URL y que el backend esté accesible.`,
    );
  }
  throw lastError;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: (token: string) => request<{ id: number; email: string; role: string; full_name: string; athlete_id?: number | null }>("/auth/me", { token }),
  register: (payload: { email: string; password: string; full_name: string }) =>
    request<{ message: string; user_id: number }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  registerAthlete: (payload: {
    email: string;
    password: string;
    full_name: string;
    sex: string;
    weight_kg: number;
    height_cm?: number;
    date_of_birth?: string;
    primary_discipline: string;
    athlete_level?: string;
    goals: {
      event_name: string;
      target_date?: string;
      discipline: string;
      target_value?: string;
      target_type?: string;
    }[];
    garmin_email?: string;
    garmin_password?: string;
  }) =>
    request<{ message: string; user_id: number }>("/auth/register-athlete", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  inviteAthlete: (token: string, payload: { athlete_id: number; email: string; password: string }) =>
    request("/auth/invite-athlete", {
      token,
      method: "POST",
      body: JSON.stringify(payload),
    }),
  refreshToken: (token: string) =>
    request<{ access_token: string; token_type: string }>("/auth/refresh", {
      token,
      method: "POST",
      body: JSON.stringify({}),
    }),
  resetPassword: (payload: { email: string; new_password: string }) =>
    request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  changePassword: (token: string, payload: { current_password: string; new_password: string }) =>
    request("/auth/change-password", {
      token,
      method: "POST",
      body: JSON.stringify(payload),
    }),
  pendingUsers: (token: string) =>
    request<{ id: number; email: string; full_name: string; role: string; created_at: string }[]>("/auth/pending-users", { token }),
  activateUser: (token: string, userId: number) =>
    request<{ message: string }>(`/auth/users/${userId}/activate`, { token, method: "PATCH" }),
  rejectUser: (token: string, userId: number) =>
    request<{ message: string }>(`/auth/users/${userId}/reject`, { token, method: "DELETE" }),
  stravaConnectStart: (token: string, options?: { athleteId?: number; returnPath?: string }) => {
    const params = new URLSearchParams();
    if (options?.athleteId) params.set("athlete_id", String(options.athleteId));
    if (options?.returnPath) params.set("return_path", options.returnPath);
    return request<{ authorize_url: string; athlete_id: number; already_connected: boolean }>(
      `/auth/strava/start${params.size ? `?${params.toString()}` : ""}`,
      { token },
    );
  },
  stravaTestConnect: (token: string, payload: { code: string; athleteId?: number }) =>
    request<{ athlete_id: number; strava_athlete_id: number; connected: boolean }>("/auth/strava/test-connect", {
      token,
      method: "POST",
      body: JSON.stringify({
        code: payload.code,
        ...(payload.athleteId ? { athlete_id: payload.athleteId } : {}),
      }),
    }),
  stravaActivities: (token: string, athleteId: number, startDate: string, endDate: string) =>
    request<{ athlete_id: number; athlete_name: string; start_date: string; end_date: string; imported_count: number; activities: Array<Record<string, unknown>> }>(
      `/strava/athletes/${athleteId}/activities?${new URLSearchParams({ start_date: startDate, end_date: endDate }).toString()}`,
      { token },
    ),
  garminConnect: (token: string, athleteId: number, payload: { email: string; password: string; mfa_code?: string }) =>
    request<{ athlete_id: number; garmin_user_id: number; garmin_email: string; connected: boolean }>(
      `/garmin/athletes/${athleteId}/connect`,
      {
        token,
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  garminPreview: (
    token: string,
    athleteId: number,
    startDate: string,
    endDate: string,
    options?: { includeFullDetail?: boolean; activityLimit?: number }
  ) =>
    request<{ athlete_id: number; athlete_name: string; start_date: string; end_date: string; imported_count: number; activities: Array<Record<string, unknown>> }>(
      `/garmin/athletes/${athleteId}/preview?${new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        ...(options?.includeFullDetail ? { include_full_detail: "true" } : {}),
        ...(options?.activityLimit ? { activity_limit: String(options.activityLimit) } : {}),
      }).toString()}`,
      { token },
    ),
  garminActivityDetail: (token: string, athleteId: number, activityId: number) =>
    request<Record<string, unknown>>(
      `/garmin/athletes/${athleteId}/activities/${activityId}`,
      { token },
    ),
  athleteHealthOverview: (
    token: string,
    athleteId: number,
    days = 28,
    options?: { includeActivity?: boolean; includeRawWellness?: boolean; refreshLiveHealth?: boolean }
  ) =>
    request(
      `/athlete-health/athletes/${athleteId}/overview?${new URLSearchParams({
        days: String(days),
        ...(options?.includeActivity !== undefined ? { include_activity: String(options.includeActivity) } : {}),
        ...(options?.includeRawWellness !== undefined ? { include_raw_wellness: String(options.includeRawWellness) } : {}),
        ...(options?.refreshLiveHealth !== undefined ? { refresh_live_health: String(options.refreshLiveHealth) } : {}),
      }).toString()}`,
      { token },
    ),
  appleHealthSync: (token: string, athleteId: number, samples: unknown[]) =>
    request(`/athlete-health/athletes/${athleteId}/apple-health-sync`, {
      token,
      method: "POST",
      body: JSON.stringify({ samples }),
    }),
  appleHealthDisconnect: (token: string, athleteId: number) =>
    request(`/athlete-health/athletes/${athleteId}/apple-health-disconnect`, {
      token,
      method: "POST",
    }),
  athletePlannedWorkouts: (token: string, athleteId: number, daysAhead = 14) =>
    request(`/athlete-health/athletes/${athleteId}/planned-workouts?days_ahead=${daysAhead}`, {
      token,
    }),
  dashboard: (token: string) => request("/analytics/dashboard", { token }),
  athletes: (token: string) => request("/athletes", { token }),
  dashboardSummary: (token: string) => request("/athletes/dashboard-summary", { token }),
  createAthlete: (token: string, payload: unknown) =>
    request("/athletes", { token, method: "POST", body: JSON.stringify(payload) }),
  generateDemoAthlete: (token: string) =>
    request("/athletes/generate-demo", { token, method: "POST" }),
  generateChimAthlete: (token: string) =>
    request("/athletes/generate-demo-chim", { token, method: "POST" }),
  updateAthlete: (token: string, athleteId: number, payload: unknown) =>
    request(`/athletes/${athleteId}`, { token, method: "PATCH", body: JSON.stringify(payload) }),
  generatePhysiologyReport: (token: string, athleteId: number, discipline?: string, powerSource?: string) =>
    request(
      `/athletes/${athleteId}/physiology-report${discipline || powerSource ? `?${new URLSearchParams(
        Object.fromEntries(
          Object.entries({
            ...(discipline ? { discipline } : {}),
            ...(powerSource ? { power_source: powerSource } : {}),
          }).filter(([, value]) => value !== undefined),
        ) as Record<string, string>,
      ).toString()}` : ""}`,
      { token, method: "POST" },
    ),
  downloadPhysiologyReportPdf: (token: string, athleteId: number, discipline?: string, powerSource?: string) =>
    requestBlob(
      `/athletes/${athleteId}/physiology-report/pdf${discipline || powerSource ? `?${new URLSearchParams(
        Object.fromEntries(
          Object.entries({
            ...(discipline ? { discipline } : {}),
            ...(powerSource ? { power_source: powerSource } : {}),
          }).filter(([, value]) => value !== undefined),
        ) as Record<string, string>,
      ).toString()}` : ""}`,
      { token },
    ),
  addAthleteWeight: (token: string, athleteId: number, payload: unknown) =>
    request(`/athletes/${athleteId}/weights`, { token, method: "POST", body: JSON.stringify(payload) }),
  addFocusBlock: (token: string, athleteId: number, payload: unknown) =>
    request(`/athletes/${athleteId}/focus-blocks`, { token, method: "POST", body: JSON.stringify(payload) }),
  updateFocusBlock: (token: string, athleteId: number, blockId: number, payload: unknown) =>
    request(`/athletes/${athleteId}/focus-blocks/${blockId}`, { token, method: "PATCH", body: JSON.stringify(payload) }),
  deleteFocusBlock: (token: string, athleteId: number, blockId: number) =>
    request(`/athletes/${athleteId}/focus-blocks/${blockId}`, { token, method: "DELETE" }),
  addAthleteTarget: (token: string, athleteId: number, payload: unknown) =>
    request(`/athletes/${athleteId}/targets`, { token, method: "POST", body: JSON.stringify(payload) }),
  updateAthleteTarget: (token: string, athleteId: number, targetId: number, payload: unknown) =>
    request(`/athletes/${athleteId}/targets/${targetId}`, { token, method: "PATCH", body: JSON.stringify(payload) }),
  deleteAthleteTarget: (token: string, athleteId: number, targetId: number) =>
    request(`/athletes/${athleteId}/targets/${targetId}`, { token, method: "DELETE" }),
  athleteAIInterpretation: (token: string, athleteId: number, payload: unknown) =>
    request(`/athletes/${athleteId}/ai-interpretation`, { token, method: "POST", body: JSON.stringify(payload) }),
  deleteAthlete: (token: string, athleteId: number) =>
    request(`/athletes/${athleteId}`, { token, method: "DELETE" }),
  athleteAnalysis: (token: string, athleteId: string | number) => request(`/athletes/${athleteId}/analysis`, { token }),
  athletePlannedSessions: (token: string, athleteId: string | number) =>
    request(`/planning/athletes/${athleteId}/sessions`, { token }),
  planningGarminSync: (token: string, athleteId: string | number) =>
    request(`/planning/athletes/${athleteId}/garmin-sync`, { token, method: "POST" }),
  planningOverview: (token: string, athleteId: string | number, discipline?: string) =>
    request(`/planning/athletes/${athleteId}/overview${discipline ? `?discipline=${encodeURIComponent(discipline)}` : ""}`, { token }),
  planningMesocycles: (token: string, athleteId: string | number, discipline?: string) =>
    request(`/planning/athletes/${athleteId}/mesocycles${discipline ? `?discipline=${encodeURIComponent(discipline)}` : ""}`, { token }),
  planningRecommendation: (token: string, athleteId: string | number, discipline?: string) =>
    request(`/planning/athletes/${athleteId}/recommendation${discipline ? `?discipline=${encodeURIComponent(discipline)}` : ""}`, { token }),
  planningWorkoutLibrary: (token: string, athleteId: string | number, discipline?: string) =>
    request(`/planning/athletes/${athleteId}/workout-library${discipline ? `?discipline=${encodeURIComponent(discipline)}` : ""}`, { token }),
  generalPlanningWorkoutLibrary: (token: string, discipline: string) =>
    request(`/planning/workout-library?discipline=${encodeURIComponent(discipline)}`, { token }),
  saveWorkoutTemplateOverride: (token: string, templateId: string, data: Record<string, unknown>) =>
    request(`/planning/workout-library/${encodeURIComponent(templateId)}/override`, { token, method: "PATCH", body: JSON.stringify(data) }),
  deleteWorkoutTemplateOverride: (token: string, templateId: string) =>
    request(`/planning/workout-library/${encodeURIComponent(templateId)}/override`, { token, method: "DELETE" }),
  planningWorkoutLibraryStructuredPreview: (
    token: string,
    options: {
      discipline: string;
      templateId: string;
      source: "dose" | "example";
      doseStep?: number;
      label?: string;
    },
  ) => {
    const params = new URLSearchParams({
      discipline: options.discipline,
      source: options.source,
    });
    if (options.doseStep != null) params.set("dose_step", String(options.doseStep));
    if (options.label) params.set("label", options.label);
    return request(`/planning/workout-library/${options.templateId}/structured-preview?${params.toString()}`, { token });
  },
  addPlannedSession: (token: string, payload: {
    athlete_id: number;
    scheduled_date: string;
    discipline: string;
    template_id?: string | null;
    public_label: string;
    objective?: string;
    session_family?: string;
    session_role?: string;
    dose_step?: number | null;
    coach_note?: string | null;
    bla_check?: boolean;
  }) =>
    request("/planning/planned-sessions", {
      token,
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // Coach custom libraries
  listCoachLibraries: (token: string) =>
    request("/planning/coach-libraries", { token }),
  createCoachLibrary: (token: string, payload: { name: string; description?: string | null; discipline?: string | null }) =>
    request("/planning/coach-libraries", { token, method: "POST", body: JSON.stringify(payload) }),
  deleteCoachLibrary: (token: string, libraryId: number) =>
    request(`/planning/coach-libraries/${libraryId}`, { token, method: "DELETE" }),
  addWorkoutToLibrary: (token: string, libraryId: number, payload: {
    day_offset?: number;
    discipline: string;
    session_family: string;
    public_label: string;
    objective?: string;
    intensity_zone?: string | null;
    duration_min?: number | null;
    description?: string | null;
  }) =>
    request(`/planning/coach-libraries/${libraryId}/workouts`, { token, method: "POST", body: JSON.stringify(payload) }),
  deleteWorkoutFromLibrary: (token: string, libraryId: number, workoutId: number) =>
    request(`/planning/coach-libraries/${libraryId}/workouts/${workoutId}`, { token, method: "DELETE" }),
  applyLibraryToAthlete: (token: string, libraryId: number, payload: { athlete_id: number; start_date: string }) =>
    request(`/planning/coach-libraries/${libraryId}/apply`, { token, method: "POST", body: JSON.stringify(payload) }),
  // Coach training plans
  listCoachPlans: (token: string) =>
    request("/planning/coach-plans", { token }),
  createCoachPlan: (token: string, payload: { name: string; description?: string | null; duration_weeks?: number }) =>
    request("/planning/coach-plans", { token, method: "POST", body: JSON.stringify(payload) }),
  updateCoachPlan: (token: string, planId: number, payload: { name: string; description?: string | null; duration_weeks: number }) =>
    request(`/planning/coach-plans/${planId}`, { token, method: "PATCH", body: JSON.stringify(payload) }),
  deleteCoachPlan: (token: string, planId: number) =>
    request(`/planning/coach-plans/${planId}`, { token, method: "DELETE" }),
  addDayToPlan: (token: string, planId: number, payload: {
    day_number: number; discipline: string; session_family: string; public_label: string;
    objective?: string; intensity_zone?: string | null; duration_min?: number | null; description?: string | null;
  }) =>
    request(`/planning/coach-plans/${planId}/days`, { token, method: "POST", body: JSON.stringify(payload) }),
  deleteDayFromPlan: (token: string, planId: number, dayId: number) =>
    request(`/planning/coach-plans/${planId}/days/${dayId}`, { token, method: "DELETE" }),
  applyPlanToAthlete: (token: string, planId: number, payload: { athlete_id: number; start_date: string }) =>
    request(`/planning/coach-plans/${planId}/apply`, { token, method: "POST", body: JSON.stringify(payload) }),

  plannedSessionWorkoutDefinitionPreview: (token: string, sessionId: number) =>
    request(`/planning/planned-sessions/${sessionId}/workout-definition-preview`, { token }),
  preparePlannedSessionPublish: (token: string, sessionId: number) =>
    request(`/planning/planned-sessions/${sessionId}/prepare-publish`, {
      token,
      method: "POST",
    }),
  planningMesocycleDraft: (token: string, athleteId: string | number, discipline?: string) =>
    request(`/planning/athletes/${athleteId}/mesocycle-draft${discipline ? `?discipline=${encodeURIComponent(discipline)}` : ""}`, { token }),
  submitCoachFeedback: (
    token: string,
    sessionId: number,
    feedback: string | null,
    rating: string | null,
  ) =>
    request(`/planning/planned-sessions/${sessionId}/coach-feedback`, {
      token,
      method: "PATCH",
      body: JSON.stringify({ feedback, rating }),
    }),
  toggleBlaCheck: (token: string, sessionId: number, blaCheck: boolean) =>
    request(`/planning/planned-sessions/${sessionId}/bla-check`, {
      token,
      method: "PATCH",
      body: JSON.stringify({ bla_check: blaCheck }),
    }),
  updateTargetMode: (token: string, sessionId: number, targetMode: "pace" | "hr" | "power") =>
    request(`/planning/planned-sessions/${sessionId}/target-mode`, {
      token,
      method: "PATCH",
      body: JSON.stringify({ target_mode: targetMode }),
    }),
  autoGenerateZones: (token: string, athleteId: number, discipline: string) =>
    request<{ zone_set_id: number | null; auto_generated: boolean; warning: string | null }>(
      `/planning/athletes/${athleteId}/auto-generate-zones?discipline=${encodeURIComponent(discipline)}`,
      { token, method: "POST" },
    ),
  coachEditSession: (
    token: string,
    sessionId: number,
    edit: { coach_note?: string; dose_step_override?: number | null; swapped_template_id?: string | null; scheduled_date?: string; public_label?: string }
  ) =>
    request(`/planning/planned-sessions/${sessionId}/coach-edit`, {
      token,
      method: "PATCH",
      body: JSON.stringify(edit),
    }),
  athleteEditSession: (
    token: string,
    sessionId: number,
    edit: { public_label?: string; athlete_note?: string; scheduled_date?: string; scheduled_time?: string }
  ) =>
    request(`/planning/planned-sessions/${sessionId}/athlete-edit`, {
      token,
      method: "PATCH",
      body: JSON.stringify(edit),
    }),
  deletePlannedSession: (token: string, sessionId: number) =>
    request(`/planning/planned-sessions/${sessionId}`, {
      token,
      method: "DELETE",
    }),
  saveWorkoutSteps: (token: string, sessionId: number, workout: Record<string, unknown>) =>
    request(`/planning/planned-sessions/${sessionId}/workout-steps`, {
      token,
      method: "PATCH",
      body: JSON.stringify({ workout }),
    }),
  refreshStaleTargets: (token: string, athleteId: number, discipline?: string) =>
    request<{ refreshed: number; needs_republish: number; skipped_coach_edited: number }>(
      `/planning/athletes/${athleteId}/refresh-stale-targets${discipline ? `?discipline=${encodeURIComponent(discipline)}` : ""}`,
      { token, method: "POST" },
    ),
  republishPlannedSession: (token: string, sessionId: number) =>
    request(`/planning/planned-sessions/${sessionId}/republish`, {
      token,
      method: "POST",
    }),
  pushWorkoutToGarmin: (token: string, athleteId: number, sessionId: number) =>
    request(`/garmin/athletes/${athleteId}/push-workout/${sessionId}`, {
      token,
      method: "POST",
    }),
  publishSessionForWatch: (token: string, athleteId: number, sessionId: number) =>
    request(`/athlete-health/athletes/${athleteId}/publish-for-watch/${sessionId}`, {
      token,
      method: "POST",
    }),
  garminSyncStatus: (token: string, athleteId: number) =>
    request<{ connected: boolean; last_sync_at: string | null; stale: boolean; garmin_email: string | null }>(
      `/garmin/athletes/${athleteId}/sync-status`,
      { token },
    ),
  garminSync: (token: string, athleteId: number, daysBack = 56) =>
    request<{ athlete_id: number; synced: boolean; new_activities: number; total_activities: number; sync_range_start: string; sync_range_end: string; last_sync_at: string | null }>(
      `/garmin/athletes/${athleteId}/sync?days_back=${daysBack}`, {
      token,
      method: "POST",
    }),
  garminStoredActivities: (token: string, athleteId: number, startDate?: string, endDate?: string, discipline?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (discipline) params.set("discipline", discipline);
    const qs = params.toString();
    return request(`/garmin/athletes/${athleteId}/stored-activities${qs ? `?${qs}` : ""}`, { token });
  },
  sessions: (token: string) => request("/sessions", { token }),
  athleteSessions: (token: string, athleteId: number) => request(`/sessions?athlete_id=${athleteId}`, { token }),
  createSession: (token: string, payload: unknown) =>
    request("/sessions", { token, method: "POST", body: JSON.stringify(payload) }),
  updateSession: (token: string, sessionId: number, payload: unknown) =>
    request(`/sessions/${sessionId}`, { token, method: "PATCH", body: JSON.stringify(payload) }),
  deleteSession: (token: string, sessionId: number) =>
    request(`/sessions/${sessionId}`, { token, method: "DELETE" }),
  getSession: (token: string, sessionId: number) =>
    request(`/sessions/${sessionId}`, { token }),
  updateInterval: (token: string, intervalId: number, payload: unknown) =>
    request(`/sessions/intervals/${intervalId}`, { token, method: "PATCH", body: JSON.stringify(payload) }),
  addInterval: (token: string, sessionId: number, payload: unknown) =>
    request(`/sessions/${sessionId}/intervals`, { token, method: "POST", body: JSON.stringify(payload) }),
  deleteInterval: (token: string, intervalId: number) =>
    request(`/sessions/intervals/${intervalId}`, { token, method: "DELETE" }),
  deleteLactateSample: (token: string, intervalId: number) =>
    request(`/sessions/intervals/${intervalId}/lactate-sample`, { token, method: "DELETE" }),
  sessionAnalysis: (token: string, sessionId: string | number) => request(`/sessions/${sessionId}/analysis`, { token }),
  athleteDynamicThresholds: (token: string, athleteId: string | number, discipline?: string, powerSource?: string) =>
    request(
      `/analytics/athletes/${athleteId}/dynamic-thresholds${discipline || powerSource ? `?${new URLSearchParams(
        Object.fromEntries(
          Object.entries({
            ...(discipline ? { discipline } : {}),
            ...(powerSource ? { power_source: powerSource } : {}),
          }).filter(([, value]) => value !== undefined),
        ) as Record<string, string>,
      ).toString()}` : ""}`,
      { token },
    ),
  importPreview: (token: string, formData: FormData) => requestForm("/sessions/import/preview", formData, token),
  importCommit: (token: string, formData: FormData) => requestForm("/sessions/import/commit", formData, token),
  compare: (token: string, sessionA: number, sessionB: number) =>
    request(`/analytics/compare?session_a=${sessionA}&session_b=${sessionB}`, { token }),
  // ── Training Zones ──
  trainingZoneSets: (token: string, athleteId: number, discipline?: string, activeOnly?: boolean) => {
    const params = new URLSearchParams();
    if (discipline) params.set("discipline", discipline);
    if (activeOnly) params.set("active_only", "true");
    return request(`/athletes/${athleteId}/training-zones${params.size ? `?${params.toString()}` : ""}`, { token });
  },
  activeTrainingZoneSet: (token: string, athleteId: number, discipline: string) =>
    request(`/athletes/${athleteId}/training-zones/active?discipline=${encodeURIComponent(discipline)}`, { token }),
  thresholdProfileForZones: (token: string, athleteId: number, discipline: string) =>
    request(`/athletes/${athleteId}/training-zones/threshold-profile?discipline=${encodeURIComponent(discipline)}`, { token }),
  zoneStalenessCheck: (token: string, athleteId: number, discipline: string) =>
    request<{
      is_stale: boolean; reason: string | null;
      zones_created_at: string | null; zones_threshold_source: string | null;
      current_snapshot_date: string | null;
      lt2_pace_delta_seconds: number | null; lt2_hr_delta: number | null; lt2_power_delta: number | null;
      lt1_pace_delta_seconds: number | null; lt1_hr_delta: number | null; lt1_power_delta: number | null;
    }>(`/athletes/${athleteId}/training-zones/staleness-check?discipline=${encodeURIComponent(discipline)}`, { token }),
  createTrainingZoneSet: (token: string, athleteId: number, payload: unknown) =>
    request(`/athletes/${athleteId}/training-zones`, { token, method: "POST", body: JSON.stringify(payload) }),
  updateTrainingZoneSet: (token: string, athleteId: number, zoneSetId: number, payload: unknown) =>
    request(`/athletes/${athleteId}/training-zones/${zoneSetId}`, { token, method: "PATCH", body: JSON.stringify(payload) }),
  activateTrainingZoneSet: (token: string, athleteId: number, zoneSetId: number) =>
    request(`/athletes/${athleteId}/training-zones/${zoneSetId}/activate`, { token, method: "PATCH" }),
  deleteTrainingZoneSet: (token: string, athleteId: number, zoneSetId: number) =>
    request(`/athletes/${athleteId}/training-zones/${zoneSetId}`, { token, method: "DELETE" }),
  interpolateCyclingFromRunning: (token: string, athleteId: number) =>
    request<{ status: string; lt1_hr_cycling: number | null; lt2_hr_cycling: number | null; lt1_hr_running: number | null; lt2_hr_running: number | null; hr_offset_applied: number; confidence: number; warnings: string[]; snapshot_id: number }>(
      `/athletes/${athleteId}/interpolate-cycling-from-running`,
      { token, method: "POST" },
    ),

  // ── Training Load ──
  trainingLoad: (token: string, athleteId: number, startDate: string, endDate: string) =>
    request(`/athletes/${athleteId}/training-load?start_date=${startDate}&end_date=${endDate}`, { token }),

  // ── Wellness Check-ins ──
  submitWellnessCheckin: (token: string, athleteId: number, payload: { check_date: string; fatigue: number; soreness: number; mood: number; sleep_quality: number; notes?: string }) =>
    request(`/athlete-health/athletes/${athleteId}/wellness-checkins`, { token, method: "POST", body: JSON.stringify(payload) }),
  wellnessCheckins: (token: string, athleteId: number, days = 28) =>
    request<Array<{ id: number; athlete_id: number; check_date: string; fatigue: number; soreness: number; mood: number; sleep_quality: number; notes: string | null; average: number; created_at: string }>>(
      `/athlete-health/athletes/${athleteId}/wellness-checkins?days=${days}`, { token },
    ),

  // ── Behavior Journal ──
  submitBehaviorJournal: (token: string, athleteId: number, payload: Record<string, unknown>) =>
    request(`/athlete-health/athletes/${athleteId}/behavior-journal`, { token, method: "POST", body: JSON.stringify(payload) }),
  behaviorJournal: (token: string, athleteId: number, days = 28) =>
    request<Array<Record<string, unknown>>>(`/athlete-health/athletes/${athleteId}/behavior-journal?days=${days}`, { token }),
  deleteBehaviorJournal: (token: string, athleteId: number, entryDate: string) =>
    request(`/athlete-health/athletes/${athleteId}/behavior-journal/${entryDate}`, { token, method: "DELETE" }),
  behaviorPreferences: (token: string, athleteId: number) =>
    request<Record<string, boolean>>(`/athlete-health/athletes/${athleteId}/behavior-preferences`, { token }),
  updateBehaviorPreferences: (token: string, athleteId: number, payload: Record<string, boolean>) =>
    request<Record<string, boolean>>(`/athlete-health/athletes/${athleteId}/behavior-preferences`, { token, method: "PUT", body: JSON.stringify(payload) }),
  behaviorStreak: (token: string, athleteId: number) =>
    request<{ current_streak: number; longest_streak: number; total_entries: number }>(`/athlete-health/athletes/${athleteId}/behavior-journal/streak`, { token }),
  behaviorWeeklySummary: (token: string, athleteId: number) =>
    request<Array<{ behavior: string; days_active: number; total_days: number }>>(`/athlete-health/athletes/${athleteId}/behavior-journal/weekly-summary`, { token }),

  // ── Custom Behaviors ──
  createCustomBehavior: (token: string, athleteId: number, payload: { name: string; emoji?: string; category?: string }) =>
    request(`/athlete-health/athletes/${athleteId}/custom-behaviors`, { token, method: "POST", body: JSON.stringify(payload) }),
  customBehaviors: (token: string, athleteId: number) =>
    request<Array<{ id: number; athlete_id: number; name: string; emoji: string; category: string; is_active: boolean }>>(`/athlete-health/athletes/${athleteId}/custom-behaviors`, { token }),
  deleteCustomBehavior: (token: string, athleteId: number, behaviorId: number) =>
    request(`/athlete-health/athletes/${athleteId}/custom-behaviors/${behaviorId}`, { token, method: "DELETE" }),
  submitCustomBehaviorLog: (token: string, athleteId: number, payload: { log_date: string; custom_behavior_id: number; value: boolean }) =>
    request(`/athlete-health/athletes/${athleteId}/custom-behavior-logs`, { token, method: "POST", body: JSON.stringify(payload) }),
  customBehaviorLogs: (token: string, athleteId: number, days = 28) =>
    request<Array<{ id: number; custom_behavior_id: number; log_date: string; value: boolean }>>(`/athlete-health/athletes/${athleteId}/custom-behavior-logs?days=${days}`, { token }),

  // ── Nutrition ──
  submitNutritionLog: (token: string, athleteId: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/athlete-health/athletes/${athleteId}/nutrition-log`, { token, method: "POST", body: JSON.stringify(data) }),
  nutritionLogs: (token: string, athleteId: number, days = 28) =>
    request<Record<string, unknown>[]>(`/athlete-health/athletes/${athleteId}/nutrition-log?days=${days}`, { token }),
  deleteNutritionLog: (token: string, athleteId: number, logDate: string) =>
    request(`/athlete-health/athletes/${athleteId}/nutrition-log/${logDate}`, { token, method: "DELETE" }),
  nutritionPresets: (token: string, athleteId: number) =>
    request<{ presets: Array<{ key: string; label: string; emoji: string; carbs_g: number; protein_g: number; fat_g: number; calories_kcal: number }> }>(`/athlete-health/athletes/${athleteId}/nutrition-presets`, { token }),

  // ── Correlations ──
  behaviorCorrelations: (token: string, athleteId: number, windowDays = 90, minConfidence = "low") =>
    request<Array<{
      behavior_key: string; behavior_label: string; behavior_emoji: string;
      outcome_metric: string; outcome_label: string;
      sample_size_with: number; sample_size_without: number;
      mean_with: number; mean_without: number;
      effect_pct: number; effect_direction: string; confidence: string;
      p_value: number | null; lag_days: number; narrative: string;
    }>>(`/athlete-health/athletes/${athleteId}/behavior-correlations?window_days=${windowDays}&min_confidence=${minConfidence}`, { token }),
  behaviorCorrelationDetail: (token: string, athleteId: number, behaviorKey: string) =>
    request<Array<Record<string, unknown>>>(`/athlete-health/athletes/${athleteId}/behavior-correlations/${behaviorKey}`, { token }),
  refreshCorrelations: (token: string, athleteId: number) =>
    request<{ refreshed: number }>(`/athlete-health/athletes/${athleteId}/behavior-correlations/refresh`, { token, method: "POST" }),
  behaviorInsights: (token: string, athleteId: number) =>
    request<{
      top_positive: Array<Record<string, unknown>>;
      top_negative: Array<Record<string, unknown>>;
      data_completeness_pct: number;
      total_days_tracked: number;
      min_days_remaining: number | null;
    }>(`/athlete-health/athletes/${athleteId}/behavior-insights`, { token }),
  behaviorDigest: (token: string, athleteId: number, type: "weekly" | "monthly" = "weekly") =>
    request<Record<string, unknown>>(`/athlete-health/athletes/${athleteId}/behavior-digest?digest_type=${type}`, { token }),
  coachBehaviorAggregations: (token: string) =>
    request<{ aggregations: Array<Record<string, unknown>>; total_athletes: number }>(`/athlete-health/coach/behavior-aggregations`, { token }),

  // ── AI Coach ──
  aiCoachChat: (
    token: string,
    athleteId: number,
    message: string,
  ) =>
    request<{ response: string; context_summary: string }>(
      `/athlete-health/athletes/${athleteId}/ai-coach/chat`,
      {
        token,
        method: "POST",
        body: JSON.stringify({ message }),
      },
    ),

  aiCoachHistory: (token: string, athleteId: number) =>
    request<{ messages: Array<{ role: "user" | "assistant"; content: string; created_at: string }> }>(
      `/athlete-health/athletes/${athleteId}/ai-coach/history`,
      { token },
    ),

  aiCoachClearHistory: (token: string, athleteId: number) =>
    request<{ deleted: number }>(
      `/athlete-health/athletes/${athleteId}/ai-coach/history`,
      { token, method: "DELETE" },
    ),

  // ── Science Advisor ──
  scienceAdvisorAsk: (token: string, body: { question: string; athlete_id?: number; discipline?: string }) =>
    request("/science-advisor/ask", { token, method: "POST", body: JSON.stringify(body) }),

  // ── Lap Match ──
  plannedSessionLapMatch: (token: string, sessionId: number) =>
    request<{
      planned_session_id: number;
      discipline: string;
      scheduled_date: string;
      dose_prescription: string;
      matched: boolean;
      n_work_steps: number;
      steps: Array<{
        order: number;
        planned_duration_s: number;
        intensity_label: string;
        garmin_matched: boolean;
        hr_avg: number | null;
        power_watts: number | null;
        pace_seconds_per_km: number | null;
        pace_seconds_per_100m?: number | null;
      }>;
    }>(`/planning/planned-sessions/${sessionId}/lap-match`, { token }),

  // ── Calendar Sync ──
  calendarConnect: (token: string, athleteId: number, icalUrl: string) =>
    request<{ athlete_id: number; connected: boolean }>(`/calendar/athletes/${athleteId}/connect`, {
      token,
      method: "POST",
      body: JSON.stringify({ ical_url: icalUrl }),
    }),
  calendarEvents: (token: string, athleteId: number, startDate: string, endDate: string) =>
    request<Array<{ summary: string; start: string | null; end: string | null; all_day: boolean }>>(
      `/calendar/athletes/${athleteId}/events?start_date=${startDate}&end_date=${endDate}`,
      { token },
    ),
  calendarDisconnect: (token: string, athleteId: number) =>
    request<{ athlete_id: number; disconnected: boolean }>(`/calendar/athletes/${athleteId}/disconnect`, {
      token,
      method: "DELETE",
    }),
  calendarStatus: (token: string, athleteId: number) =>
    request<{ athlete_id: number; connected: boolean; provider?: string | null }>(`/calendar/athletes/${athleteId}/status`, { token }),
  calendarGoogleStart: (token: string, athleteId: number) =>
    request<{ authorize_url: string; athlete_id: number; already_connected: boolean }>(
      `/calendar/athletes/${athleteId}/google/start`,
      { token, method: "POST" },
    ),
  calendarGoogleDisconnect: (token: string, athleteId: number) =>
    request<{ athlete_id: number; disconnected: boolean }>(
      `/calendar/athletes/${athleteId}/google/disconnect`,
      { token, method: "DELETE" },
    ),
  calendarGoogleSyncPlanned: (token: string, athleteId: number) =>
    request<{ synced: number; errors: number }>(
      `/calendar/athletes/${athleteId}/google/sync-planned`,
      { token, method: "POST" },
    ),

  // ── Menstrual Cycle ──
  cycleDashboard: (token: string, athleteId: number) =>
    request<import("../types").CycleDashboard>(`/menstrual-cycle/athletes/${athleteId}/dashboard`, { token }),
  cycleCreatePreferences: (token: string, athleteId: number, data: Record<string, unknown>) =>
    request<import("../types").CyclePreferences>(`/menstrual-cycle/athletes/${athleteId}/preferences`, {
      token,
      method: "POST",
      body: JSON.stringify(data),
    }),
  cycleUpdatePreferences: (token: string, athleteId: number, data: Record<string, unknown>) =>
    request<import("../types").CyclePreferences>(`/menstrual-cycle/athletes/${athleteId}/preferences`, {
      token,
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  cycleLogPeriod: (token: string, athleteId: number, data: { cycle_start_date: string; period_end_date?: string; notes?: string }) =>
    request<import("../types").CycleLog>(`/menstrual-cycle/athletes/${athleteId}/cycles`, {
      token,
      method: "POST",
      body: JSON.stringify(data),
    }),
  cycleListLogs: (token: string, athleteId: number) =>
    request<import("../types").CycleLog[]>(`/menstrual-cycle/athletes/${athleteId}/cycles`, { token }),
  cycleDailyLog: (token: string, athleteId: number, data: Record<string, unknown>) =>
    request<import("../types").CycleDailyLog>(`/menstrual-cycle/athletes/${athleteId}/daily-logs`, {
      token,
      method: "POST",
      body: JSON.stringify(data),
    }),
  cycleListDailyLogs: (token: string, athleteId: number, days?: number) =>
    request<import("../types").CycleDailyLog[]>(`/menstrual-cycle/athletes/${athleteId}/daily-logs?days=${days ?? 60}`, { token }),

  // ── Recovery Score ──
  recoveryScore: (token: string, athleteId: number, targetDate?: string) =>
    request<{
      score: number | null;
      zone: string | null;
      zone_label: string | null;
      components: Record<string, unknown> | null;
      has_objective_data: boolean;
      target_date: string;
    }>(`/athlete-health/athletes/${athleteId}/recovery-score${targetDate ? `?target_date=${targetDate}` : ""}`, { token }),

  // ── Health Alerts ──
  healthAlerts: (token: string, athleteId: number, days = 1) =>
    request<Array<{
      metric: string;
      metric_label: string;
      severity: string;
      current_value: number;
      baseline_value: number | null;
      deviation_pct: number;
      message: string;
      icon: string;
      created_date: string;
    }>>(`/athlete-health/athletes/${athleteId}/health-alerts?days=${days}`, { token }),

  healthAlertHistory: (token: string, athleteId: number, days = 14) =>
    request<{
      athlete_id: number;
      days: number;
      history: Array<{
        date: string;
        alerts: Array<{
          metric: string;
          metric_label: string;
          severity: string;
          current_value: number;
          baseline_value: number | null;
          deviation_pct: number;
          message: string;
          icon: string;
          created_date: string;
        }>;
      }>;
    }>(`/athlete-health/athletes/${athleteId}/health-alert-history?days=${days}`, { token }),

  coachHealthAlerts: (token: string) =>
    request<{
      athletes: Array<{
        athlete_id: number;
        athlete_name: string;
        alerts: Array<{
          metric: string;
          metric_label: string;
          severity: string;
          current_value: number;
          baseline_value: number | null;
          deviation_pct: number;
          message: string;
          icon: string;
          created_date: string;
        }>;
      }>;
    }>("/athlete-health/coach/health-alerts", { token }),

  // ── Strain Coach ──
  strainScore: (token: string, athleteId: number, targetDate?: string) =>
    request<{
      score: number;
      zone: string;
      zone_label: string;
      components: {
        active_energy_kcal: number;
        energy_strain: number;
        exercise_minutes: number;
        exercise_bonus: number;
        steps: number;
        activities_count: number;
        baseline_energy_kcal: number;
      };
      target_date: string;
    }>(`/athlete-health/athletes/${athleteId}/strain-score${targetDate ? `?target_date=${targetDate}` : ""}`, { token }),

  strainTarget: (token: string, athleteId: number, targetDate?: string) =>
    request<{
      target_min: number;
      target_max: number;
      zone: string;
      zone_label: string;
      recommendation: string;
      recovery_score: number | null;
      has_planned_session: boolean;
      target_date: string;
    }>(`/athlete-health/athletes/${athleteId}/strain-target${targetDate ? `?target_date=${targetDate}` : ""}`, { token }),

  strainHistory: (token: string, athleteId: number, days = 7) =>
    request<{ date: string; score: number; zone: string; zone_label: string }[]>(
      `/athlete-health/athletes/${athleteId}/strain-history?days=${days}`,
      { token },
    ),

  // ── Sleep Coach ──
  sleepCoach: (token: string, athleteId: number, targetDate?: string) =>
    request<{
      base_need_hours: number;
      strain_adjustment_min: number;
      debt_hours: number;
      nap_credit_min: number;
      total_need_hours: number;
      actual_hours: number | null;
      deficit_hours: number | null;
      recommendation: string;
      target_date: string;
    }>(`/athlete-health/athletes/${athleteId}/sleep-coach${targetDate ? `?target_date=${targetDate}` : ""}`, { token }),

  sleepPerformance: (token: string, athleteId: number, targetDate?: string) =>
    request<{
      score: number | null;
      efficiency_pct: number | null;
      consistency_score: number | null;
      debt_hours: number | null;
      breakdown: { deep_pct: number; rem_pct: number; light_pct: number; awake_pct: number } | null;
      target_date: string;
    }>(`/athlete-health/athletes/${athleteId}/sleep-performance${targetDate ? `?target_date=${targetDate}` : ""}`, { token }),

  sleepHistory: (token: string, athleteId: number, days = 7) =>
    request<{ date: string; sleep_hours: number | null; deep_sleep_hours: number | null; rem_sleep_hours: number | null; score: number | null; efficiency_pct: number | null }[]>(
      `/athlete-health/athletes/${athleteId}/sleep-history?days=${days}`,
      { token },
    ),

  // ── Sleep Analytics (enhanced) ──
  sleepAnalytics: (token: string, athleteId: number, targetDate?: string) =>
    request<{
      date: string;
      total_hours: number | null;
      stages: { deep_hours: number; deep_pct: number; rem_hours: number; rem_pct: number; light_hours: number; light_pct: number; awake_hours: number; awake_pct: number } | null;
      efficiency_pct: number | null;
      performance_score: number | null;
      consistency: { score: number | null; avg_bedtime: string | null; avg_waketime: string | null; variability_min: number | null } | null;
      debt: { accumulated_hours: number; trend: string } | null;
      vs_baseline: { total_vs_avg_pct: number | null; deep_vs_avg_pct: number | null; rem_vs_avg_pct: number | null } | null;
    }>(`/athlete-health/athletes/${athleteId}/sleep-analytics${targetDate ? `?target_date=${targetDate}` : ""}`, { token }),

  sleepAnalyticsHistory: (token: string, athleteId: number, days = 14) =>
    request<Array<{
      date: string;
      total_hours: number;
      stages: { deep_hours: number; deep_pct: number; rem_hours: number; rem_pct: number; light_hours: number; light_pct: number; awake_hours: number; awake_pct: number };
      efficiency_pct: number;
      performance_score: number;
      vs_baseline: { total_vs_avg_pct: number | null; deep_vs_avg_pct: number | null; rem_vs_avg_pct: number | null } | null;
    }>>(`/athlete-health/athletes/${athleteId}/sleep-analytics-history?days=${days}`, { token }),

  sleepAnalyticsSummary: (token: string, athleteId: number, days = 7) =>
    request<{
      avg_hours: number | null;
      avg_efficiency: number | null;
      avg_deep_pct: number | null;
      avg_rem_pct: number | null;
      consistency_score: number | null;
      total_debt_hours: number;
      performance_trend: string;
      days_with_data: number;
    }>(`/athlete-health/athletes/${athleteId}/sleep-analytics-summary?days=${days}`, { token }),

  // ── Performance Reports ──
  weeklyReport: (token: string, athleteId: number, weekStart?: string) =>
    request<Record<string, unknown>>(
      `/athlete-health/athletes/${athleteId}/reports/weekly${weekStart ? `?week_start=${weekStart}` : ""}`,
      { token },
    ),
  monthlyReport: (token: string, athleteId: number, yearMonth?: string) =>
    request<Record<string, unknown>>(
      `/athlete-health/athletes/${athleteId}/reports/monthly${yearMonth ? `?year_month=${yearMonth}` : ""}`,
      { token },
    ),
  availableReports: (token: string, athleteId: number) =>
    request<{
      reports: Array<{
        type: string;
        start: string;
        end: string;
        label: string;
        year_month?: string;
      }>;
    }>(`/athlete-health/athletes/${athleteId}/reports/available`, { token }),

  // ── Beta Signup (public, no auth) ──
  betaSignup: (email: string) =>
    request<{ status: string }>("/beta-signup", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  // ── Plan Management ──
  getPlan: (token: string) =>
    request<{ plan_tier: string; plan_name: string; features: Record<string, unknown> }>("/auth/plan", { token }),
  updatePlan: (token: string, plan_tier: string) =>
    request<{ plan_tier: string; plan_name: string; features: Record<string, unknown> }>("/auth/plan", {
      token,
      method: "PATCH",
      body: JSON.stringify({ plan_tier }),
    }),

  // ── Nutrition Module ──
  searchFood: (token: string, athleteId: number, query: string, limit = 10) =>
    request<{ items: import("../athlete/utils/nutritionTypes").FoodItemType[]; source: string }>(
      `/nutrition/athletes/${athleteId}/food-search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { token },
    ),

  addFoodItem: (token: string, athleteId: number, data: Record<string, unknown>) =>
    request<import("../athlete/utils/nutritionTypes").FoodItemType>(
      `/nutrition/athletes/${athleteId}/food-library`,
      { token, method: "POST", body: JSON.stringify(data) },
    ),

  foodLibrary: (token: string, athleteId: number, query = "", limit = 20) =>
    request<import("../athlete/utils/nutritionTypes").FoodItemType[]>(
      `/nutrition/athletes/${athleteId}/food-library?q=${encodeURIComponent(query)}&limit=${limit}`,
      { token },
    ),

  parseFood: (token: string, athleteId: number, text: string, mealType?: string) =>
    request<{ items: import("../athlete/utils/nutritionTypes").ParsedFoodItemType[]; needs_clarification: boolean }>(
      `/nutrition/athletes/${athleteId}/parse-food`,
      { token, method: "POST", body: JSON.stringify({ text, meal_type: mealType }) },
    ),

  logMeal: (token: string, athleteId: number, data: Record<string, unknown>) =>
    request<import("../athlete/utils/nutritionTypes").MealLogType>(
      `/nutrition/athletes/${athleteId}/meals`,
      { token, method: "POST", body: JSON.stringify(data) },
    ),

  getMeals: (token: string, athleteId: number, date: string) =>
    request<import("../athlete/utils/nutritionTypes").MealLogType[]>(
      `/nutrition/athletes/${athleteId}/meals?date=${date}`,
      { token },
    ),

  mealHistory: (token: string, athleteId: number, days = 7) =>
    request<import("../athlete/utils/nutritionTypes").MealLogType[]>(
      `/nutrition/athletes/${athleteId}/meals/history?days=${days}`,
      { token },
    ),

  deleteMeal: (token: string, athleteId: number, mealId: number) =>
    request<void>(
      `/nutrition/athletes/${athleteId}/meals/${mealId}`,
      { token, method: "DELETE" },
    ),

  nutritionDailySummary: (token: string, athleteId: number, date: string) =>
    request<import("../athlete/utils/nutritionTypes").DailyNutritionSummaryType>(
      `/nutrition/athletes/${athleteId}/daily-summary?date=${date}`,
      { token },
    ),

  nutritionTargets: (token: string, athleteId: number) =>
    request<import("../athlete/utils/nutritionTypes").NutritionTargetType>(
      `/nutrition/athletes/${athleteId}/targets`,
      { token },
    ),

  updateNutritionTargets: (token: string, athleteId: number, data: Record<string, unknown>) =>
    request<import("../athlete/utils/nutritionTypes").NutritionTargetType>(
      `/nutrition/athletes/${athleteId}/targets`,
      { token, method: "PUT", body: JSON.stringify(data) },
    ),

  autoCalculateTargets: (token: string, athleteId: number) =>
    request<import("../athlete/utils/nutritionTypes").NutritionTargetType>(
      `/nutrition/athletes/${athleteId}/targets/auto-calculate`,
      { token, method: "POST" },
    ),

  nutritionRecommendations: (token: string, athleteId: number) =>
    request<{ recommendations: import("../athlete/utils/nutritionTypes").NutritionRecommendationType[]; context: string }>(
      `/nutrition/athletes/${athleteId}/recommendations`,
      { token },
    ),

  mealSuggestions: (token: string, athleteId: number, mealType: string) =>
    request<{ suggestions: import("../athlete/utils/nutritionTypes").MealSuggestionType[]; has_enough_data: boolean }>(
      `/nutrition/athletes/${athleteId}/meal-suggestions?meal_type=${mealType}`,
      { token },
    ),

};
