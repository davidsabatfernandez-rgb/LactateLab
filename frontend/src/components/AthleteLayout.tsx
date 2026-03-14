import { SideNav } from "../athlete/components/SideNav";

type AthleteLayoutProps = {
  onLogout: () => void;
  fullName?: string | null;
  children: React.ReactNode;
};

export function AthleteLayout({ onLogout, fullName, children }: AthleteLayoutProps) {
  return (
    <div className="ath-shell">
      <SideNav fullName={fullName} onLogout={onLogout} />
      <main className="ath-content">{children}</main>
    </div>
  );
}
