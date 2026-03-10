import { useEffect, useState } from "react";
import { Route, Routes, useNavigate, useParams } from "react-router-dom";

import { AthleteLayout } from "./components/AthleteLayout";
import { Layout } from "./components/Layout";
import { LoginForm } from "./components/LoginForm";
import { api, getApiDebugInfo } from "./lib/api";
import { AthleteDetailPage } from "./pages/AthleteDetailPage";
import { AthletePortalPage } from "./pages/AthletePortalPage";
import { AthleteTargetsPage } from "./pages/AthleteTargetsPage";
import { AthletesPage } from "./pages/AthletesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LibraryGeneratorPage } from "./pages/LibraryGeneratorPage";
import { LibraryPage } from "./pages/LibraryPage";
import { NutritionPage } from "./pages/NutritionPage";
import { PlanningPage } from "./pages/PlanningPage";
import { SessionDetailPage } from "./pages/SessionDetailPage";
import { SessionsPage } from "./pages/SessionsPage";
import { Athlete, AthleteAnalysis, AuthUser, DashboardData, SessionAnalysis, SessionSummary } from "./types";

function AthleteDetailRoute({ token, onDataChanged }: { token: string; onDataChanged: () => Promise<void> }) {
  const { athleteId } = useParams();
  const [analysis, setAnalysis] = useState<AthleteAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAnalysis(currentAthleteId: string) {
    try {
      setError(null);
      const result = await api.athleteAnalysis(token, currentAthleteId);
      setAnalysis(result as AthleteAnalysis);
    } catch (loadError) {
      setAnalysis(null);
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el análisis del atleta.");
    }
  }

  useEffect(() => {
    if (!athleteId) return;
    loadAnalysis(athleteId);
  }, [athleteId, token]);

  if (error) {
    return <div className="error">No se pudo cargar el análisis del atleta: {error}</div>;
  }

  return <AthleteDetailPage analysis={analysis} token={token} onSaved={async () => {
    if (athleteId) {
      await loadAnalysis(athleteId);
    }
    await onDataChanged();
  }} />;
}

function AthleteTargetsRoute({ token, onDataChanged }: { token: string; onDataChanged: () => Promise<void> }) {
  const { athleteId } = useParams();
  const [analysis, setAnalysis] = useState<AthleteAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAnalysis(currentAthleteId: string) {
    try {
      setError(null);
      const result = await api.athleteAnalysis(token, currentAthleteId);
      setAnalysis(result as AthleteAnalysis);
    } catch (loadError) {
      setAnalysis(null);
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el análisis del atleta.");
    }
  }

  useEffect(() => {
    if (!athleteId) return;
    loadAnalysis(athleteId);
  }, [athleteId, token]);

  if (error) {
    return <div className="error">No se pudo cargar los objetivos del atleta: {error}</div>;
  }

  return <AthleteTargetsPage analysis={analysis} token={token} onSaved={async () => {
    if (athleteId) {
      await loadAnalysis(athleteId);
    }
    await onDataChanged();
  }} />;
}

function SessionDetailRoute({ token }: { token: string }) {
  const { sessionId } = useParams();
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    api.sessionAnalysis(token, sessionId).then((result) => setAnalysis(result as SessionAnalysis));
  }, [sessionId, token]);

  return <SessionDetailPage analysis={analysis} />;
}

export default function App() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("lactate-token"));
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [sessionInitError, setSessionInitError] = useState<string | null>(null);
  const [authCheckInFlight, setAuthCheckInFlight] = useState(false);
  const apiDebug = getApiDebugInfo();

  async function refreshData(activeToken: string) {
    setAuthCheckInFlight(true);
    return api
      .me(activeToken)
      .then(async (meResult) => {
        setAuthUser(meResult as AuthUser);
        setDataLoadError(null);
        setSessionInitError(null);
        const [dashboardResult, athletesResult, sessionsResult] = await Promise.allSettled([
          api.dashboard(activeToken),
          api.athletes(activeToken),
          api.sessions(activeToken),
        ]);

        if (dashboardResult.status === "fulfilled") {
          setDashboard(dashboardResult.value as DashboardData);
        }
        if (athletesResult.status === "fulfilled") {
          setAthletes(athletesResult.value as Athlete[]);
        }
        if (sessionsResult.status === "fulfilled") {
          setSessions(sessionsResult.value as SessionSummary[]);
        }

        const loadErrors = [
          dashboardResult.status === "rejected" ? `dashboard: ${dashboardResult.reason instanceof Error ? dashboardResult.reason.message : "error desconocido"}` : null,
          athletesResult.status === "rejected" ? `athletes: ${athletesResult.reason instanceof Error ? athletesResult.reason.message : "error desconocido"}` : null,
          sessionsResult.status === "rejected" ? `sessions: ${sessionsResult.reason instanceof Error ? sessionsResult.reason.message : "error desconocido"}` : null,
        ].filter(Boolean) as string[];

        if (loadErrors.length) {
          setDataLoadError(`No se pudieron cargar algunos datos: ${loadErrors.join(" · ")}`);
        }
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "No se pudo validar la sesion actual contra la API.";
        console.error("[app] Error cargando la sesion", {
          error: message,
          apiDebug,
        });
        setAuthUser(null);
        setDashboard(null);
        setAthletes([]);
        setSessions([]);
        setDataLoadError(null);
        setSessionInitError(message);
      })
      .finally(() => {
        setAuthCheckInFlight(false);
      });
  }

  useEffect(() => {
    if (!token) return;
    setSessionInitError(null);
    refreshData(token);
  }, [token]);

  async function handleLogin(email: string, password: string, mode: "coach" | "athlete") {
    const result = await api.login(email, password);
    const me = (await api.me(result.access_token)) as AuthUser;
    if (mode === "athlete" && me.role !== "athlete") {
      throw new Error("Este acceso es solo para atletas.");
    }
    if (mode === "coach" && me.role === "athlete") {
      throw new Error("Este acceso es para entrenador. Usa el acceso atleta.");
    }
    localStorage.setItem("lactate-token", result.access_token);
    setAuthUser(me);
    setToken(result.access_token);
    navigate(me.role === "athlete" ? "/athlete" : "/");
  }

  function handleLogout() {
    setToken(null);
    setAuthUser(null);
    setDataLoadError(null);
    setSessionInitError(null);
    localStorage.removeItem("lactate-token");
  }

  if (!token) {
    return <LoginForm onLogin={handleLogin} />;
  }

  if (!authUser && authCheckInFlight) {
    return <div className="loading">Cargando acceso...</div>;
  }

  if (!authUser && sessionInitError) {
    return (
      <div className="loading">
        <div className="card session-debug-card">
          <span className="eyebrow">Diagnostico de acceso</span>
          <h2>No se pudo validar la sesion</h2>
          <p className="error">{sessionInitError}</p>
          <div className="session-debug-list">
            <div>
              <strong>Origen app</strong>
              <span>{apiDebug.appOrigin ?? "desconocido"}</span>
            </div>
            <div>
              <strong>VITE_API_URL</strong>
              <span>{apiDebug.environmentApiUrl ?? "no definida"}</span>
            </div>
            <div>
              <strong>API probadas</strong>
              <span>{apiDebug.configuredApiUrls.join(" · ")}</span>
            </div>
          </div>
          <p className="session-debug-hint">
            Si esto ocurre en Vercel, casi seguro falta configurar <code>VITE_API_URL</code> con la URL publica del backend.
          </p>
          <div className="session-debug-actions">
            <button type="button" className="primary-button" onClick={() => refreshData(token)}>
              Reintentar
            </button>
            <button type="button" className="ghost-button" onClick={handleLogout}>
              Cerrar sesion
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <div className="loading">Cargando acceso...</div>;
  }

  if (authUser?.role === "athlete") {
    return (
      <AthleteLayout onLogout={handleLogout} fullName={authUser.full_name}>
        <Routes>
          <Route path="*" element={<AthletePortalPage user={authUser} token={token} />} />
        </Routes>
      </AthleteLayout>
    );
  }

  return (
    <Layout onLogout={handleLogout}>
      {dataLoadError ? <div className="error">{dataLoadError}</div> : null}
      <Routes>
        <Route path="/" element={<DashboardPage athletes={athletes} token={token} />} />
        <Route path="/lab" element={<DashboardPage athletes={athletes} token={token} />} />
        <Route path="/planning" element={<PlanningPage token={token} />} />
        <Route path="/nutrition" element={<NutritionPage />} />
        <Route path="/library" element={<LibraryPage token={token} />} />
        <Route path="/library-generator" element={<LibraryGeneratorPage />} />
        <Route path="/athletes" element={<AthletesPage athletes={athletes} token={token} onRefresh={() => refreshData(token)} />} />
        <Route path="/athletes/:athleteId" element={<AthleteDetailRoute token={token} onDataChanged={() => refreshData(token)} />} />
        <Route path="/athletes/:athleteId/targets" element={<AthleteTargetsRoute token={token} onDataChanged={() => refreshData(token)} />} />
        <Route path="/sessions" element={<SessionsPage sessions={sessions} token={token} onRefresh={() => refreshData(token)} />} />
        <Route path="/sessions/:sessionId" element={<SessionDetailRoute token={token} />} />
      </Routes>
    </Layout>
  );
}
