import type { PlanTone, PlanningCalendarSource } from "../types";
import { compactPlanningSourceTitle, dateValue, formatDate } from "../utils";
import { MesocycleTimeline, type TimelineWeek } from "./MesocycleTimeline";

type RibbonCard = {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  date: string;
  endDate?: string | null;
  meta?: string | null;
  tone: PlanTone;
};

type BlockRibbonProps = {
  ribbonCards: RibbonCard[];
  ribbonExpanded: boolean;
  calendarSources: PlanningCalendarSource[];
  selectedCalendarSourceId: string;
  deletingBlockId: number | null;
  onToggleExpand: () => void;
  onOpenCalendar: () => void;
  onSelectSource: (sourceId: string) => void;
  onOpenSourceDetail: (source: PlanningCalendarSource) => void;
  onDeleteBlock: (blockId: number) => void;
};

export function BlockRibbon({
  ribbonCards,
  ribbonExpanded,
  calendarSources,
  selectedCalendarSourceId,
  deletingBlockId,
  onToggleExpand,
  onOpenCalendar,
  onSelectSource,
  onOpenSourceDetail,
  onDeleteBlock,
}: BlockRibbonProps) {
  return (
    <section className="card section-card planning-card planning-block-ribbon">
      <div className="planning-ribbon-header">
        <div>
          <span className="eyebrow">Historial de mesociclos</span>
          <p className="muted">{ribbonCards.length} bloques registrados · {ribbonCards.filter((c) => c.kind === "planned").length} creados por el coach</p>
        </div>
        <div className="planning-ribbon-header-actions">
          {ribbonCards.length > 3 && (
            <button type="button" className="ghost-button" onClick={onToggleExpand}>
              {ribbonExpanded ? "Ver menos" : `Ver todos (${ribbonCards.length})`}
            </button>
          )}
          <button
            type="button"
            className="planning-calendar-trigger"
            onClick={onOpenCalendar}
          >
            Calendario
          </button>
        </div>
      </div>
      <div className={`planning-ribbon-strip ${ribbonExpanded ? "expanded" : ""}`}>
        {ribbonCards.length ? (ribbonExpanded ? ribbonCards : ribbonCards.slice(-3)).map((item) => {
          const matchingSource = calendarSources.find((source) => source.id === item.id);
          const focusBlockId = item.kind === "planned" ? Number(item.id.replace("planned-", "")) : null;
          return (
            <article key={item.id} className={`planning-ribbon-item ${item.kind}`}>
              <button
                type="button"
                className={`planning-ribbon-card ${item.tone} ${item.kind === "target" ? "target" : ""} ${matchingSource && selectedCalendarSourceId === item.id ? "active" : ""}`}
                onClick={() => {
                  if (!matchingSource) return;
                  onSelectSource(item.id);
                  onOpenSourceDetail(matchingSource);
                }}
              >
                <span className="planning-kicker">{item.subtitle}</span>
                <strong>{matchingSource ? compactPlanningSourceTitle(matchingSource) : item.title}</strong>
                <p>
                  {formatDate(item.date)}
                  {item.endDate ? ` → ${formatDate(item.endDate)}` : ""}
                  {item.meta ? ` · ${item.meta}` : ""}
                </p>
              </button>
              {focusBlockId != null && (
                <button
                  type="button"
                  className="planning-ribbon-delete"
                  title="Eliminar mesociclo"
                  disabled={deletingBlockId === focusBlockId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteBlock(focusBlockId);
                  }}
                >
                  {deletingBlockId === focusBlockId ? "..." : "×"}
                </button>
              )}
              {matchingSource && selectedCalendarSourceId === item.id && item.endDate && (
                <MesocycleTimeline
                  weeks={buildRibbonTimelineWeeks(item.date, item.endDate)}
                  compact
                />
              )}
            </article>
          );
        }) : (
          <article className="planning-empty-state">
            <strong>No hay bloques ni hitos en ese rango.</strong>
            <p>Ajusta la ventana para recuperar histórico o próximos objetivos.</p>
          </article>
        )}
      </div>
    </section>
  );
}

function buildRibbonTimelineWeeks(startDate: string, endDate: string): TimelineWeek[] {
  const diffMs = dateValue(endDate) - dateValue(startDate);
  const weekCount = Math.max(1, Math.round(diffMs / (7 * 86_400_000)));
  const phases = ribbonPhaseSequence(weekCount);
  return phases.map((phase, i) => ({
    weekIndex: i + 1,
    label: `S${i + 1}`,
    theme: phase,
    loadType: phase,
  }));
}

function ribbonPhaseSequence(n: number): string[] {
  if (n === 1) return ["acumulación"];
  if (n === 2) return ["acumulación", "descarga"];
  if (n === 3) return ["acumulación", "carga máxima", "descarga"];
  const result: string[] = [];
  const loadWeeks = n - 3;
  for (let i = 0; i < loadWeeks; i++) result.push("acumulación");
  result.push("construcción");
  result.push("carga máxima");
  result.push("descarga");
  return result;
}
