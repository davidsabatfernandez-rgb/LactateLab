function defaultApiUrls() {
  if (typeof window === "undefined") {
    return ["http://127.0.0.1:8000/api", "http://localhost:8000/api"];
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const candidates = [
    `${protocol}//${window.location.hostname}:8000/api`,
    `${protocol}//localhost:8000/api`,
    `${protocol}//127.0.0.1:8000/api`,
  ];

  return [...new Set(candidates)];
}

const API_URLS = import.meta.env.VITE_API_URL ? [import.meta.env.VITE_API_URL] : defaultApiUrls();

type FetchOptions = RequestInit & { token?: string | null };

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  let lastError: unknown = null;
  for (const apiUrl of API_URLS) {
    try {
      const response = await fetch(`${apiUrl}${path}`, { ...options, headers });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail ?? "Request failed");
      }
      if (response.status === 204) {
        return undefined as T;
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
  }

  if (lastError instanceof TypeError) {
    throw new Error(`No se pudo conectar con la API (${API_URLS.join(" o ")}). Comprueba que el backend esté levantado y accesible.`);
  }
  throw lastError;
}

async function requestForm<T>(path: string, body: FormData, token: string): Promise<T> {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  let lastError: unknown = null;
  for (const apiUrl of API_URLS) {
    try {
      const response = await fetch(`${apiUrl}${path}`, { method: "POST", headers, body });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail ?? "Request failed");
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
  }

  if (lastError instanceof TypeError) {
    throw new Error(`No se pudo conectar con la API (${API_URLS.join(" o ")}). Comprueba que el backend esté levantado y accesible.`);
  }
  throw lastError;
}

async function requestBlob(path: string, options: FetchOptions = {}): Promise<Blob> {
  const headers = new Headers(options.headers);
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }
  let lastError: unknown = null;
  for (const apiUrl of API_URLS) {
    try {
      const response = await fetch(`${apiUrl}${path}`, { ...options, headers });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail ?? "Request failed");
      }
      return response.blob();
    } catch (error) {
      lastError = error;
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
  }

  if (lastError instanceof TypeError) {
    throw new Error(`No se pudo conectar con la API (${API_URLS.join(" o ")}). Comprueba que el backend esté levantado y accesible.`);
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
  stravaConnectStart: (token: string) =>
    request<{ authorize_url: string; athlete_id: number; already_connected: boolean }>("/auth/strava/start", { token }),
  dashboard: (token: string) => request("/analytics/dashboard", { token }),
  athletes: (token: string) => request("/athletes", { token }),
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
  planningMesocycleDraft: (token: string, athleteId: string | number, discipline?: string) =>
    request(`/planning/athletes/${athleteId}/mesocycle-draft${discipline ? `?discipline=${encodeURIComponent(discipline)}` : ""}`, { token }),
  toggleBlaCheck: (token: string, sessionId: number, blaCheck: boolean) =>
    request(`/planning/planned-sessions/${sessionId}/bla-check`, {
      token,
      method: "PATCH",
      body: JSON.stringify({ bla_check: blaCheck }),
    }),
  sessions: (token: string) => request("/sessions", { token }),
  createSession: (token: string, payload: unknown) =>
    request("/sessions", { token, method: "POST", body: JSON.stringify(payload) }),
  updateInterval: (token: string, intervalId: number, payload: unknown) =>
    request(`/sessions/intervals/${intervalId}`, { token, method: "PATCH", body: JSON.stringify(payload) }),
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
};
