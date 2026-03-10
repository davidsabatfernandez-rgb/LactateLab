import { Link, NavLink } from "react-router-dom";

type LayoutProps = {
  onLogout: () => void;
  children: React.ReactNode;
};

export function Layout({ onLogout, children }: LayoutProps) {
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
          <NavLink to="/planning">Planificación</NavLink>
          <NavLink to="/nutrition">Nutrición</NavLink>
          <NavLink to="/library">Librería</NavLink>
          <NavLink to="/library-generator">Librería Generator</NavLink>
          <NavLink to="/athletes">Atletas</NavLink>
          <NavLink to="/sessions">Sesiones</NavLink>
        </nav>
        <button className="ghost-button" onClick={onLogout}>
          Cerrar sesión
        </button>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
