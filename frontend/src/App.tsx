import { useEffect, useState, useCallback } from "react";
import { Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { isNative, getStoredToken, setStoredToken, removeStoredToken, setStoredTheme } from "./lib/native";
import { NativeLogin } from "./components/NativeLogin";

import { AthleteLayout } from "./components/AthleteLayout";
import { Layout } from "./components/Layout";
import { LoginForm } from "./components/LoginForm";
import { api, getApiDebugInfo } from "./lib/api";
import { AthleteDetailPage } from "./pages/AthleteDetailPage";
import { AthleteDataProvider } from "./athlete/context/AthleteDataContext";
import { MetricExplainerProvider } from "./athlete/explainer/MetricExplainerContext";
import { MetricExplainer } from "./athlete/explainer/MetricExplainer";
import { TodayPage } from "./athlete/pages/TodayPage";
import { WeekPage } from "./athlete/pages/WeekPage";
import { ProgressPage } from "./athlete/pages/ProgressPage";
import { RecoveryPage } from "./athlete/pages/RecoveryPage";
import { SettingsPage } from "./athlete/pages/SettingsPage";
import { ObjectivesPage } from "./athlete/pages/ObjectivesPage";
import { MyTestsPage } from "./athlete/pages/MyTestsPage";
import { ZonesPage } from "./athlete/pages/ZonesPage";
import { AthleteTargetsPage } from "./pages/AthleteTargetsPage";
import { AthletesPage } from "./pages/AthletesPage";
import { CoachDashboardPage } from "./pages/CoachDashboardPage";
import { DashboardPage } from "./pages/DashboardPage";
import { GarminConnectPage } from "./pages/GarminConnectPage";
import { LibraryGeneratorPage } from "./pages/LibraryGeneratorPage";
import { LibraryPage } from "./pages/LibraryPage";
import { PlanningPage } from "./pages/PlanningPage";
import { SessionDetailPage } from "./pages/SessionDetailPage";
import { SessionsPage } from "./pages/SessionsPage";
import { StravaInformationPage } from "./pages/StravaInformationPage";
import { VirtualRidePage } from "./pages/VirtualRidePage";
import { LandingPage } from "./pages/LandingPage";
import { CoachLandingPage } from "./pages/CoachLandingPage";
import { ResourcesPage } from "./pages/ResourcesPage";
import { ArticlePage } from "./pages/ArticlePage";
import { ComparePlansPage } from "./pages/ComparePlansPage";
import { AthleteLandingPage } from "./pages/AthleteLandingPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import { PageErrorBoundary } from "./components/PageErrorBoundary";
import { ScienceAdvisor } from "./components/ScienceAdvisor";
import { Athlete, AthleteAnalysis, AuthUser, DashboardData, SessionAnalysis, SessionSummary } from "./types";

type ThemeMode = "light" | "dark";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    setError(null);
    api.sessionAnalysis(token, sessionId)
      .then((result) => setAnalysis(result as SessionAnalysis))
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el análisis de la sesión."));
  }, [sessionId, token]);

  if (error) {
    return <div className="error">No se pudo cargar la sesión: {error}</div>;
  }

  return <SessionDetailPage analysis={analysis} />;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("lactate-token"));
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const storedTheme = localStorage.getItem("lactate-theme");
    return storedTheme === "dark" ? "dark" : "light";
  });
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [sessionInitError, setSessionInitError] = useState<string | null>(null);
  const [authCheckInFlight, setAuthCheckInFlight] = useState(false);
  const [nativeReady, setNativeReady] = useState(!isNative); // web is ready immediately
  const apiDebug = getApiDebugInfo();

  // On native, load token from Capacitor Preferences (async)
  useEffect(() => {
    if (!isNative) return;
    getStoredToken().then((stored) => {
      if (stored) setToken(stored);
      setNativeReady(true);
    });
  }, []);

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

  useEffect(() => {
    const handler = () => {
      removeStoredToken();
      setToken(null);
    };
    window.addEventListener("auth:unauthorized", handler);
    return () => window.removeEventListener("auth:unauthorized", handler);
  }, []);

  // Refresh token every 20 hours (token expires in 24h)
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(async () => {
      try {
        const result = await api.refreshToken(token);
        await setStoredToken(result.access_token);
        setToken(result.access_token);
      } catch {
        // If refresh fails, don't force logout — let normal 401 handling kick in
      }
    }, 20 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [token]);

  // Force light theme on unauthenticated screens (login, landing, register)
  const effectiveTheme = token ? themeMode : "light";

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.style.colorScheme = effectiveTheme === "dark" ? "dark" : "light";
    if (token) setStoredTheme(effectiveTheme);
  }, [effectiveTheme, token]);

  async function handleLogin(email: string, password: string, mode: "coach" | "athlete") {
    const result = await api.login(email, password);
    const me = (await api.me(result.access_token)) as AuthUser;
    if (mode === "athlete" && me.role !== "athlete") {
      throw new Error("Este acceso es solo para atletas.");
    }
    if (mode === "coach" && me.role === "athlete") {
      throw new Error("Este acceso es para entrenador. Usa el acceso atleta.");
    }
    await setStoredToken(result.access_token);
    setAuthUser(me);
    setToken(result.access_token);
    navigate(me.role === "athlete" ? "/athlete" : "/");
  }

  const handleLogout = useCallback(() => {
    setToken(null);
    setAuthUser(null);
    setDataLoadError(null);
    setSessionInitError(null);
    removeStoredToken();
  }, []);

  // Wait for native token to load before rendering
  if (!nativeReady) {
    return <div className="loading">Cargando...</div>;
  }

  if (!token) {
    // On native app: show minimal dark login (athlete only)
    if (isNative) {
      return <NativeLogin onLogin={handleLogin} />;
    }
    if (location.pathname === "/virtual-ride") {
      return <VirtualRidePage />;
    }
    if (location.pathname === "/privacy") {
      return <PrivacyPolicyPage />;
    }
    /* COACH — hidden: coach landing page route
    if (location.pathname === "/coach") {
      return <CoachLandingPage />;
    }
    */
    if (location.pathname === "/resources") {
      return <ResourcesPage />;
    }
    if (location.pathname.startsWith("/resources/")) {
      return <ArticlePage />;
    }
    if (location.pathname === "/athlete") {
      return <AthleteLandingPage />;
    }
    if (location.pathname === "/compare-plans") {
      return <ComparePlansPage />;
    }
    if (location.pathname === "/login") {
      return <LoginForm onLogin={handleLogin} />;
    }
    return <LandingPage />;
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
      <AthleteLayout onLogout={handleLogout} fullName={authUser.full_name} themeMode={themeMode} onToggleTheme={() => setThemeMode((c) => (c === "dark" ? "light" : "dark"))}>
        <AthleteDataProvider user={authUser} token={token}>
          <MetricExplainerProvider>
            <Routes>
              <Route path="/athlete/today" element={<TodayPage />} />
              <Route path="/athlete/week" element={<WeekPage />} />
              <Route path="/athlete/progress" element={<ProgressPage />} />
              <Route path="/athlete/recovery" element={<RecoveryPage />} />
              <Route path="/athlete/zones" element={<ZonesPage />} />
              <Route path="/athlete/tests" element={<MyTestsPage />} />
              <Route path="/athlete/objectives" element={<ObjectivesPage />} />
              <Route path="/athlete/settings" element={<SettingsPage />} />
              <Route path="*" element={<TodayPage />} />
            </Routes>
            <MetricExplainer />
          </MetricExplainerProvider>
        </AthleteDataProvider>
      </AthleteLayout>
    );
  }

  return (
    <>
      <Layout
        onLogout={handleLogout}
        themeMode={themeMode}
        onToggleTheme={() => setThemeMode((currentTheme) => (currentTheme === "dark" ? "light" : "dark"))}
      >
        {dataLoadError ? <div className="error">{dataLoadError}</div> : null}
        <Routes>
          <Route path="/" element={<CoachDashboardPage athletes={athletes} token={token} />} />
          <Route path="/coach" element={<CoachDashboardPage athletes={athletes} token={token} />} />
          <Route path="/lab" element={<PageErrorBoundary><DashboardPage athletes={athletes} token={token} viewerId={authUser.id} /></PageErrorBoundary>} />
          <Route path="/planning" element={<PageErrorBoundary><PlanningPage token={token} /></PageErrorBoundary>} />

          <Route path="/library" element={<LibraryPage token={token} />} />
          <Route path="/library-generator" element={<LibraryGeneratorPage />} />
          <Route path="/strava-information" element={<StravaInformationPage token={token} athletes={athletes} />} />
          <Route path="/garmin-connect" element={<GarminConnectPage token={token} athletes={athletes} onDataChanged={() => refreshData(token)} />} />
          <Route path="/virtual-ride" element={<VirtualRidePage />} />
          <Route path="/athletes" element={<AthletesPage athletes={athletes} token={token} onRefresh={() => refreshData(token)} />} />
          <Route path="/athletes/:athleteId" element={<PageErrorBoundary><AthleteDetailRoute token={token} onDataChanged={() => refreshData(token)} /></PageErrorBoundary>} />
          <Route path="/athletes/:athleteId/targets" element={<AthleteTargetsRoute token={token} onDataChanged={() => refreshData(token)} />} />
          <Route path="/sessions" element={<SessionsPage sessions={sessions} token={token} onRefresh={() => refreshData(token)} />} />
          <Route path="/sessions/:sessionId" element={<PageErrorBoundary><SessionDetailRoute token={token} /></PageErrorBoundary>} />
        </Routes>
      </Layout>
      <ScienceAdvisor token={token} />
    </>
  );
}
