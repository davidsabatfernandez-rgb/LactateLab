import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

type LayoutProps = {
  onLogout: () => void;
  children: React.ReactNode;
};

export function Layout({ onLogout, children }: LayoutProps) {
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
      <aside className="sidebar">
        <Link to="/lab" className="brand">
          <span className="brand-mark">LL</span>
          <div>
            <strong>Lactate Lab</strong>
            <p>Endurance physiology</p>
          </div>
        </Link>
        <nav className="nav">
          <NavLink to="/lab">Lab</NavLink>
          <NavLink to="/athletes">Atletas</NavLink>
          <NavLink to="/planning">Planificación</NavLink>
          <NavLink to="/nutrition">Nutrición</NavLink>
          <div className={`nav-group ${isLibraryOpen ? "open" : ""}`}>
            <button
              type="button"
              className={`nav-group-trigger ${isLibrarySection ? "active" : ""}`}
              onClick={() => setIsLibraryOpen((current) => !current)}
            >
              <span>Librería</span>
              <span className="nav-group-chevron">{isLibraryOpen ? "▾" : "▸"}</span>
            </button>
            {isLibraryOpen ? (
              <div className="nav-group-links">
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
        <button className="ghost-button" onClick={onLogout}>
          Cerrar sesión
        </button>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
