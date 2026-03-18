/**
 * MesocycleTimeline — visual wave showing load distribution across weeks.
 * Pure presentational component: receives normalized week data as props.
 */

export type TimelineWeek = {
  weekIndex: number;
  label: string;
  theme: string;
  loadType: string;
  loadFactor?: number | null;
  isCurrent?: boolean;
};

type MesocycleTimelineProps = {
  weeks: TimelineWeek[];
  /** Compact mode for ribbon cards */
  compact?: boolean;
};

const LOAD_HEIGHT: Record<string, number> = {
  recovery: 25,
  descarga: 25,
  load: 60,
  "acumulación": 60,
  build: 80,
  "construcción": 80,
  build_peak: 100,
  "carga máxima": 100,
  specific: 70,
  especificidad: 70,
};

const LOAD_COLOR: Record<string, string> = {
  load: "#22c55e",
  "acumulación": "#22c55e",
  build: "#f59e0b",
  "construcción": "#f59e0b",
  build_peak: "#ef4444",
  "carga máxima": "#ef4444",
  recovery: "#3b82f6",
  descarga: "#3b82f6",
  specific: "#8b5cf6",
  especificidad: "#8b5cf6",
};

function resolveHeight(loadType: string): number {
  return LOAD_HEIGHT[loadType] ?? 60;
}

function resolveColor(loadType: string): string {
  return LOAD_COLOR[loadType] ?? "#94a3b8";
}

export function MesocycleTimeline({ weeks, compact = false }: MesocycleTimelineProps) {
  if (!weeks.length) return null;

  const maxHeight = compact ? 40 : 72;
  const barGap = compact ? 2 : 4;

  return (
    <div className={`mesocycle-timeline ${compact ? "compact" : ""}`}>
      <div className="mesocycle-timeline-bars" style={{ gap: `${barGap}px` }}>
        {weeks.map((week) => {
          const pct = week.loadFactor != null ? Math.round(week.loadFactor * 100) : resolveHeight(week.loadType);
          const height = Math.round((pct / 100) * maxHeight);
          const color = resolveColor(week.loadType);

          return (
            <div
              key={week.weekIndex}
              className={`mesocycle-timeline-col ${week.isCurrent ? "current" : ""}`}
            >
              <div
                className="mesocycle-timeline-bar"
                style={{
                  height: `${height}px`,
                  backgroundColor: color,
                  borderColor: week.isCurrent ? color : "transparent",
                }}
                title={`${week.label}: ${week.theme} (${week.loadType})`}
              >
                {!compact && height >= 28 && (
                  <span className="mesocycle-timeline-bar-label">{week.theme}</span>
                )}
              </div>
              <span className="mesocycle-timeline-week-label">
                S{week.weekIndex}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
