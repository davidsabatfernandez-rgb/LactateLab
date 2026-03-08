type AthleteLayoutProps = {
  onLogout: () => void;
  fullName?: string | null;
  children: React.ReactNode;
};

export function AthleteLayout({ onLogout, fullName, children }: AthleteLayoutProps) {
  return (
    <div className="athlete-shell">
      <header className="athlete-topbar">
        <div>
          <span className="eyebrow">Portal atleta</span>
          <strong>{fullName || "Atleta"}</strong>
        </div>
        <button className="ghost-button" onClick={onLogout}>
          Cerrar sesión
        </button>
      </header>
      <main className="content athlete-content">{children}</main>
    </div>
  );
}
