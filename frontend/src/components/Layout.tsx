import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

type LayoutProps = {
  onLogout: () => void;
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
  children: React.ReactNode;
};

/* ── SVG icons for the mobile bottom nav ─────────────────────── */

const IconHome = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const IconAthletes = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconPlanning = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconLibrary = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const IconMore = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);

export function Layout({ onLogout, themeMode, onToggleTheme, children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isLibrarySection = location.pathname.startsWith("/library");
  const [isLibraryOpen, setIsLibraryOpen] = useState(isLibrarySection);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLibrarySection) {
      setIsLibraryOpen(true);
    }
  }, [isLibrarySection]);

  /* Close "more" menu when navigating */
  useEffect(() => {
    setMoreMenuOpen(false);
  }, [location.pathname]);

  /* Close "more" menu on outside click */
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [moreMenuOpen]);

  /* Helper: is a path active? */
  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="shell">
      {/* ── Desktop sidebar (hidden on mobile via CSS) ─────────── */}
      <aside className="sidebar ly-sidebar">
        <Link to="/lab" className="brand ly-brand">
          <span className="brand-mark ly-brand-mark">PA</span>
          <div className="brand-copy ly-brand-copy">
            <strong>PeakAerobic</strong>
            <p>Endurance physiology</p>
          </div>
        </Link>
        <nav className="nav ly-nav">
          <NavLink to="/lab">Inicio</NavLink>
          <NavLink to="/athletes">Atletas</NavLink>
          <NavLink to="/planning">Planificacion</NavLink>
          <div className={`nav-group ly-nav-group ${isLibraryOpen ? "open" : ""}`}>
            <button
              type="button"
              className={`nav-group-trigger ly-nav-trigger ${isLibrarySection ? "active" : ""}`}
              onClick={() => setIsLibraryOpen((current) => !current)}
            >
              <span>Libreria</span>
              <span className={`nav-group-chevron ly-nav-chevron ${isLibraryOpen ? "open" : ""}`}>&#9656;</span>
            </button>
            {isLibraryOpen ? (
              <div className="nav-group-links ly-nav-group-links">
                <NavLink to="/library" end>
                  Repositorio
                </NavLink>
                <NavLink to="/library-generator">Repositorio inteligente</NavLink>
              </div>
            ) : null}
          </div>
          <NavLink to="/strava-information">Strava Information</NavLink>
          <NavLink to="/garmin-connect">Garmin Connect</NavLink>
        </nav>
        <div className="sidebar-actions ly-actions">
          <button className="ghost-button sidebar-logout ly-logout" onClick={onLogout}>
            Cerrar sesion
          </button>
          <button
            type="button"
            className="theme-toggle ly-theme-toggle"
            onClick={onToggleTheme}
            aria-pressed={themeMode === "dark"}
            aria-label={themeMode === "dark" ? "Desactivar modo oscuro" : "Activar modo oscuro"}
            title={themeMode === "dark" ? "Desactivar modo oscuro" : "Activar modo oscuro"}
          >
            <span className="theme-toggle-icon" aria-hidden="true">&#9790;</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="content">{children}</main>

      {/* ── Mobile bottom navigation (visible only <=768px via CSS) */}
      <nav className="mob-bottom-nav" aria-label="Navegacion principal movil">
        <button
          type="button"
          className={`mob-bottom-btn ${isActive("/lab") && location.pathname === "/lab" ? "active" : ""}`}
          onClick={() => navigate("/lab")}
        >
          <IconHome />
          <span className="mob-bottom-label">Inicio</span>
        </button>

        <button
          type="button"
          className={`mob-bottom-btn ${isActive("/athletes") ? "active" : ""}`}
          onClick={() => navigate("/athletes")}
        >
          <IconAthletes />
          <span className="mob-bottom-label">Atletas</span>
        </button>

        <button
          type="button"
          className={`mob-bottom-btn ${isActive("/planning") ? "active" : ""}`}
          onClick={() => navigate("/planning")}
        >
          <IconPlanning />
          <span className="mob-bottom-label">Planif.</span>
        </button>

        <button
          type="button"
          className={`mob-bottom-btn ${isLibrarySection ? "active" : ""}`}
          onClick={() => navigate("/library")}
        >
          <IconLibrary />
          <span className="mob-bottom-label">Libreria</span>
        </button>

        {/* "More" button with overflow menu */}
        <div className="mob-bottom-more-wrap" ref={moreMenuRef}>
          <button
            type="button"
            className={`mob-bottom-btn ${moreMenuOpen || isActive("/strava") || isActive("/garmin") ? "active" : ""}`}
            onClick={() => setMoreMenuOpen((v) => !v)}
          >
            <IconMore />
            <span className="mob-bottom-label">Mas</span>
          </button>

          {moreMenuOpen && (
            <div className="mob-more-menu">
              <button type="button" onClick={() => navigate("/library-generator")}>
                Repositorio inteligente
              </button>
              <button type="button" onClick={() => navigate("/strava-information")}>
                Strava Information
              </button>
              <button type="button" onClick={() => navigate("/garmin-connect")}>
                Garmin Connect
              </button>
              <hr />
              <button
                type="button"
                onClick={onToggleTheme}
              >
                {themeMode === "dark" ? "Modo claro" : "Modo oscuro"}
              </button>
              <button type="button" className="mob-more-logout" onClick={onLogout}>
                Cerrar sesion
              </button>
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
