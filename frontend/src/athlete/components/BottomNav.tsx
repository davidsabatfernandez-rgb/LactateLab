import { useLocation, useNavigate } from "react-router-dom";

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
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const currentPath = location.pathname;

  return (
    <nav className="ath-bottom-nav">
      {tabs.map((tab) => {
        const active = currentPath.startsWith(tab.path);
        return (
          <button
            key={tab.id}
            type="button"
            className={`ath-bottom-nav-btn ${active ? "active" : ""}`}
            onClick={() => navigate(tab.path)}
          >
            {tab.icon}
            <span className="ath-bottom-nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
