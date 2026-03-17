import { SideNav } from "../athlete/components/SideNav";

type AthleteLayoutProps = {
  onLogout: () => void;
  fullName?: string | null;
  themeMode?: "light" | "dark";
  onToggleTheme?: () => void;
  children: React.ReactNode;
};

export function AthleteLayout({ onLogout, fullName, themeMode, onToggleTheme, children }: AthleteLayoutProps) {
  return (
    <div className="ath-shell">
      <SideNav fullName={fullName} onLogout={onLogout} themeMode={themeMode} onToggleTheme={onToggleTheme} />
      <main className="ath-content">{children}</main>
    </div>
  );
}
