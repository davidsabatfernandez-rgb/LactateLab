import { useLocation } from "react-router-dom";
import { SideNav } from "../athlete/components/SideNav";

type AthleteLayoutProps = {
  onLogout: () => void;
  fullName?: string | null;
  themeMode?: "light" | "dark";
  onToggleTheme?: () => void;
  children: React.ReactNode;
};

export function AthleteLayout({ onLogout, fullName, themeMode, onToggleTheme, children }: AthleteLayoutProps) {
  const location = useLocation();
  return (
    <div className="ath-shell">
      <SideNav fullName={fullName} onLogout={onLogout} themeMode={themeMode} onToggleTheme={onToggleTheme} />
      <main className="ath-content" key={location.pathname}>
        <div className="page-transition">{children}</div>
      </main>
    </div>
  );
}
