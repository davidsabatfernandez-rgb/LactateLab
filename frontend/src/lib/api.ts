const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

type FetchOptions = RequestInit & { token?: string | null };

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? "Request failed");
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

async function requestForm<T>(path: string, body: FormData, token: string): Promise<T> {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { method: "POST", headers, body });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail ?? "Request failed");
  }
  return response.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: (token: string) => request<{ id: number; email: string; role: string; full_name: string; athlete_id?: number | null }>("/auth/me", { token }),
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
  sessions: (token: string) => request("/sessions", { token }),
  createSession: (token: string, payload: unknown) =>
    request("/sessions", { token, method: "POST", body: JSON.stringify(payload) }),
  updateInterval: (token: string, intervalId: number, payload: unknown) =>
    request(`/sessions/intervals/${intervalId}`, { token, method: "PATCH", body: JSON.stringify(payload) }),
  sessionAnalysis: (token: string, sessionId: string | number) => request(`/sessions/${sessionId}/analysis`, { token }),
  importPreview: (token: string, formData: FormData) => requestForm("/sessions/import/preview", formData, token),
  importCommit: (token: string, formData: FormData) => requestForm("/sessions/import/commit", formData, token),
  compare: (token: string, sessionA: number, sessionB: number) =>
    request(`/analytics/compare?session_a=${sessionA}&session_b=${sessionB}`, { token }),
};
