import { useLocation } from "react-router-dom";
import { SideNav } from "../athlete/components/SideNav";
import { AiCoachChat } from "../athlete/components/AiCoachChat";
import { useAthleteDataSafe } from "../athlete/context/AthleteDataContext";

type AthleteLayoutProps = {
  onLogout: () => void;
  fullName?: string | null;
  themeMode?: "light" | "dark";
  onToggleTheme?: () => void;
  children: React.ReactNode;
  token?: string;
  athleteId?: number | null;
};

export function AthleteLayout({ onLogout, fullName, themeMode, onToggleTheme, children, token, athleteId }: AthleteLayoutProps) {
  const location = useLocation();
  const ctx = useAthleteDataSafe();
  const chatToken = token || ctx?.token;
  const chatAthleteId = athleteId || ctx?.user?.athlete_id;
  return (
    <div className="ath-shell">
      <SideNav fullName={fullName} onLogout={onLogout} themeMode={themeMode} onToggleTheme={onToggleTheme} />
      <main className="ath-content" key={location.pathname}>
        <div className="page-transition">{children}</div>
      </main>
      {chatToken && chatAthleteId && (
        <AiCoachChat token={chatToken} athleteId={chatAthleteId} />
      )}
    </div>
  );
}
