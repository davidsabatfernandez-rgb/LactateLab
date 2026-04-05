import { BEHAVIOR_CATALOG } from "../utils/behaviorJournal";
import { BehaviorCorrelationCard } from "./BehaviorCorrelationCard";
import type { BehaviorCorrelation } from "../utils/nutrition";

type Props = {
  allEntries: Array<Record<string, unknown>>;
  correlations?: BehaviorCorrelation[];
  onViewAll?: () => void;
};

export function BehaviorInsightsTeaser({ allEntries, correlations, onViewAll }: Props) {
  // If real correlations are available, show them as mini cards
  if (correlations && correlations.length > 0) {
    const top = correlations.slice(0, 3);
    return (
      <div className="ath-insights-mini">
        <div className="ath-insights-mini-header">
          <span className="ath-insights-mini-title">Insights</span>
          {onViewAll && (
            <button type="button" className="ath-insights-mini-viewall" onClick={onViewAll}>
              Ver todos \u2192
            </button>
          )}
        </div>
        {top.map((c, i) => (
          <BehaviorCorrelationCard key={`teaser-${i}`} correlation={c} />
        ))}
      </div>
    );
  }

  // Fallback: show progress toward insights (original teaser behavior)
  if (allEntries.length < 3) return null;

  const insights: Array<{
    key: string;
    emoji: string;
    label: string;
    progress: number;
    remaining: number;
  }> = [];

  for (const item of BEHAVIOR_CATALOG) {
    if (item.inputType !== "toggle") continue;

    let yesCount = 0;
    let noCount = 0;
    for (const entry of allEntries) {
      const val = entry[item.key];
      if (val === true) yesCount++;
      else if (val === false) noCount++;
    }

    if (yesCount < 2) continue;
    if (yesCount >= 5 && noCount >= 5) continue;

    const target = 5;
    const current = yesCount < 5 ? yesCount : noCount;
    const remaining = Math.max(0, target - current);
    const progress = Math.min(1, current / target);

    insights.push({ key: item.key, emoji: item.emoji, label: item.label, progress, remaining });
  }

  insights.sort((a, b) => b.progress - a.progress);
  const top = insights.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <div className="ath-insights-mini">
      <div className="ath-insights-mini-header">
        <span className="ath-insights-mini-title">Progreso hacia insights</span>
        {onViewAll && (
          <button type="button" className="ath-insights-mini-viewall" onClick={onViewAll}>
            Ver todos \u2192
          </button>
        )}
      </div>
      {top.map((i) => (
        <div key={i.key} className="ath-insights-mini-row">
          <span className="ath-insights-mini-emoji">{i.emoji}</span>
          <div className="ath-insights-mini-bar-wrap">
            <div className="ath-insights-mini-bar" style={{ width: `${i.progress * 100}%` }} />
          </div>
          <span className="ath-insights-mini-remaining">{i.remaining}</span>
        </div>
      ))}
    </div>
  );
}
