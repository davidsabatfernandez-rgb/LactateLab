import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

type LayoutProps = {
  onLogout: () => void;
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
  children: React.ReactNode;
};

export function Layout({ onLogout, themeMode, onToggleTheme, children }: LayoutProps) {
  const location = useLocation();
  const isLibrarySection = location.pathname.startsWith("/library");
  const [isLibraryOpen, setIsLibraryOpen] = useState(isLibrarySection);

  useEffect(() => {
    if (isLibrarySection) {
      setIsLibraryOpen(true);
    }
  }, [isLibrarySection]);

  return (
    <div className="shell">
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
      <main className="content">{children}</main>
    </div>
  );
}
