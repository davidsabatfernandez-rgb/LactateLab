import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAthleteDataSafe } from "../context/AthleteDataContext";

const tabs = [
  {
    id: "today",
    path: "/athlete/today",
    label: "Hoy",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    id: "week",
    path: "/athlete/week",
    label: "Semana",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: "progress",
    path: "/athlete/progress",
    label: "Progreso",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    id: "recovery",
    path: "/athlete/recovery",
    label: "Recuperación",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
  {
    id: "fitness",
    path: "/athlete/fitness",
    label: "Fitness",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    ),
  },
  {
    id: "tests",
    path: "/athlete/tests",
    label: "Tests",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20V10" />
        <path d="M18 20V4" />
        <path d="M6 20v-4" />
      </svg>
    ),
  },
];

// Tabs that only appear in "Más" menu on mobile, but show normally on desktop sidebar
const secondaryTabs = [
  {
    id: "zones",
    path: "/athlete/zones",
    label: "Mis Zonas",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18" />
        <path d="M3 15h18" />
        <path d="M9 3v18" />
      </svg>
    ),
  },
  {
    id: "objectives",
    path: "/athlete/objectives",
    label: "Objetivos",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
  },
  {
    id: "settings",
    path: "/athlete/settings",
    label: "Ajustes",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const cycleTab = {
  id: "cycle",
  path: "/athlete/cycle",
  label: "Ciclo",
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
      <path d="M16 16c-1.5 2-3.5 3-5.5 2.5S7 16 7.5 14" />
    </svg>
  ),
};

const allTabs = [...tabs, ...secondaryTabs];

type Props = {
  fullName?: string | null;
  onLogout: () => void;
  themeMode?: "light" | "dark";
  onToggleTheme?: () => void;
};

function formatRelativeTime(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "ahora";
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH}h`;
    return `hace ${Math.floor(diffH / 24)}d`;
  } catch {
    return "";
  }
}

function GarminSyncIndicator() {
  const data = useAthleteDataSafe();
  const navigate = useNavigate();

  if (!data) return null;
  const { garminSyncStatus, garminSyncing, garminSyncError, triggerGarminSync } = data;

  if (!garminSyncStatus) return null;

  if (!garminSyncStatus.connected) {
    return (
      <button
        type="button"
        className="ath-garmin-indicator not-connected"
        onClick={() => navigate("/athlete/settings")}
        title="Conectar Garmin"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        <span>Garmin</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`ath-garmin-indicator connected ${garminSyncing ? "syncing" : ""} ${garminSyncError ? "error" : ""}`}
      onClick={() => { if (garminSyncError || garminSyncStatus.stale) triggerGarminSync(); }}
      title={garminSyncing ? "Sincronizando..." : garminSyncError ? `Error: ${garminSyncError}. Pulsa para reintentar.` : garminSyncStatus.last_sync_at ? `Garmin: ${formatRelativeTime(garminSyncStatus.last_sync_at)}` : "Garmin conectado"}
    >
      {garminSyncing ? (
        <span className="ath-garmin-spinner" />
      ) : garminSyncError ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      <span>
        {garminSyncing ? "Sync..." : garminSyncError ? "Error" : garminSyncStatus.last_sync_at ? formatRelativeTime(garminSyncStatus.last_sync_at) : "Garmin"}
      </span>
    </button>
  );
}

export function SideNav({ fullName, onLogout, themeMode, onToggleTheme }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const [moreOpen, setMoreOpen] = useState(false);
  const data = useAthleteDataSafe();

  // Show cycle tab only for female athletes
  const athleteSex = data?.analysis?.athlete?.sex?.toLowerCase() ?? "";
  const isFemale = ["female", "f", "mujer", "femenino"].includes(athleteSex);
  const activeTabs = isFemale ? [...tabs, cycleTab] : tabs;
  const activeAllTabs = isFemale ? [...tabs, cycleTab, ...secondaryTabs] : allTabs;

  // Check if any secondary tab is active (to highlight "Más" button)
  const secondaryActive = secondaryTabs.some((t) => currentPath.startsWith(t.path));

  return (
    <>
    <nav className="ath-side-nav">
      <div className="ath-side-nav-top">
        <span className="ath-side-nav-name">{fullName ?? "Atleta"}</span>
        <GarminSyncIndicator />
      </div>

      {/* Desktop: show all tabs */}
      <div className="ath-side-nav-links ath-side-nav-links--desktop">
        {activeAllTabs.map((tab) => {
          const active = currentPath.startsWith(tab.path);
          return (
            <button
              key={tab.id}
              type="button"
              className={`ath-side-nav-btn ${active ? "active" : ""}`}
              onClick={() => navigate(tab.path)}
            >
              {tab.icon}
              <span className="ath-side-nav-label">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Mobile: show primary tabs + "Más" button */}
      <div className="ath-side-nav-links ath-side-nav-links--mobile">
        {activeTabs.map((tab) => {
          const active = currentPath.startsWith(tab.path);
          return (
            <button
              key={tab.id}
              type="button"
              className={`ath-side-nav-btn ${active ? "active" : ""}`}
              onClick={() => { setMoreOpen(false); navigate(tab.path); }}
            >
              {tab.icon}
              <span className="ath-side-nav-label">{tab.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`ath-side-nav-btn ${secondaryActive || moreOpen ? "active" : ""}`}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="1.5" fill="currentColor" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            <circle cx="12" cy="19" r="1.5" fill="currentColor" />
          </svg>
          <span className="ath-side-nav-label">Más</span>
        </button>
      </div>

      <div className="ath-side-nav-bottom">
        {onToggleTheme && (
          <button className="ath-side-nav-btn ath-theme-toggle" onClick={onToggleTheme} title={themeMode === "dark" ? "Modo claro" : "Modo oscuro"}>
            {themeMode === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
            <span className="ath-side-nav-label">{themeMode === "dark" ? "Modo claro" : "Modo oscuro"}</span>
          </button>
        )}
        <button className="ath-side-nav-logout" onClick={onLogout} title="Cerrar sesión">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Salir</span>
        </button>
      </div>
    </nav>

    {/* "Más" fullscreen overlay (mobile only) — outside nav to avoid backdrop-filter containing block */}
    {moreOpen && (
      <div className="ath-more-overlay">
        <div className="ath-more-overlay__header">
          <span className="ath-more-overlay__title">Menu</span>
          <button type="button" className="ath-more-overlay__close" onClick={() => setMoreOpen(false)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="ath-more-overlay__list">
          {secondaryTabs.map((tab) => {
            const active = currentPath.startsWith(tab.path);
            return (
              <button
                key={tab.id}
                type="button"
                className={`ath-more-overlay__btn ${active ? "active" : ""}`}
                onClick={() => { setMoreOpen(false); navigate(tab.path); }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
          {onToggleTheme && (
            <button
              type="button"
              className="ath-more-overlay__btn"
              onClick={() => { onToggleTheme(); setMoreOpen(false); }}
            >
              {themeMode === "dark" ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              <span>{themeMode === "dark" ? "Modo claro" : "Modo oscuro"}</span>
            </button>
          )}
        </div>
        <div className="ath-more-overlay__footer">
          <button
            type="button"
            className="ath-more-overlay__btn ath-more-overlay__btn--logout"
            onClick={() => { setMoreOpen(false); onLogout(); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Cerrar sesion</span>
          </button>
        </div>
      </div>
    )}
    </>
  );
}
