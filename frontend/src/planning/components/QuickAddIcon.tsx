import type { QuickAddKind } from "../types";

function quickAddKindSlug(kind: QuickAddKind | "library") {
  if (kind === "running") return "running";
  if (kind === "ciclismo") return "cycling";
  if (kind === "natación") return "swimming";
  if (kind === "fuerza") return "strength";
  if (kind === "event") return "event";
  if (kind === "off") return "off";
  if (kind === "note") return "note";
  if (kind === "mesocycle") return "mesocycle";
  return "library";
}

export function QuickAddIcon({ kind, large = false }: { kind: QuickAddKind | "library"; large?: boolean }) {
  const slug = quickAddKindSlug(kind);
  return (
    <span className={`planning-quick-add-icon kind-${slug} ${large ? "large" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {kind === "running" ? (
          <>
            <circle cx="16.5" cy="5" r="2.2" />
            <path d="M10.5 21l2.2-5.6 2.7-2.6 1.8 2.2 3.3.4" />
            <path d="M8.4 13.4l4-3.5 1.9-3.2 3.5 1" />
            <path d="M7 10.8l2.5 1.1" />
          </>
        ) : kind === "ciclismo" ? (
          <>
            <circle cx="6.5" cy="17" r="3.5" />
            <circle cx="17.5" cy="17" r="3.5" />
            <path d="M9 17l3.1-6h3.2" />
            <path d="M11.2 11l3.3 6h3" />
            <path d="M9.8 11H7.5" />
            <path d="M14.5 7.5h1.8" />
          </>
        ) : kind === "natación" ? (
          <>
            <path d="M3 16c1.6 0 1.6-1 3.2-1s1.6 1 3.2 1 1.6-1 3.2-1 1.6 1 3.2 1 1.6-1 3.2-1 1.6 1 3.2 1" />
            <path d="M4 11.6c1.2-.6 2.8-1.1 4.3-.6 1 .3 1.7 1 2.7 1.2 1.8.4 3.1-.8 4.5-1.7" />
            <path d="M15.6 7.3l1.9 1.1" />
            <path d="M14.5 9.1c.8-.6 1.9-.8 2.8-.5" />
          </>
        ) : kind === "fuerza" ? (
          <>
            <path d="M6.5 6.5v11" strokeWidth="2.5" />
            <path d="M17.5 6.5v11" strokeWidth="2.5" />
            <path d="M6.5 12h11" strokeWidth="2" />
            <path d="M4 8v8" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M20 8v8" strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : kind === "event" ? (
          <>
            <rect x="4" y="6" width="16" height="14" rx="2.5" />
            <path d="M8 4v4" />
            <path d="M16 4v4" />
            <path d="M4 10.5h16" />
            <path d="M8 14h3" />
          </>
        ) : kind === "off" ? (
          <>
            <path d="M12 4.5v7.5" />
            <path d="M12 12l5.2 3" />
            <circle cx="12" cy="12" r="8" />
          </>
        ) : kind === "note" ? (
          <>
            <path d="M7 4.5h7l4 4V19.5H7z" />
            <path d="M14 4.5v4h4" />
            <path d="M9.5 12.5h5" />
            <path d="M9.5 16h5" />
          </>
        ) : kind === "mesocycle" ? (
          <>
            <rect x="4" y="5" width="16" height="14" rx="3" />
            <path d="M8 9h8" />
            <path d="M8 13h5" />
            <path d="M8 17h8" />
          </>
        ) : (
          <>
            <path d="M7 6h10" />
            <path d="M7 12h10" />
            <path d="M7 18h10" />
            <circle cx="5" cy="6" r="1" />
            <circle cx="5" cy="12" r="1" />
            <circle cx="5" cy="18" r="1" />
          </>
        )}
      </svg>
    </span>
  );
}
