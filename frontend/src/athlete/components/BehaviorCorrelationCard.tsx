type Props = {
  correlation: {
    behavior_emoji: string;
    behavior_label: string;
    outcome_label: string;
    effect_pct: number;
    effect_direction: string;
    confidence: string;
    narrative: string;
    sample_size_with: number;
  };
  onClick?: () => void;
};

export function BehaviorCorrelationCard({ correlation: c, onClick }: Props) {
  const isPositive = c.effect_direction === "positive";
  const color = isPositive ? "var(--ath-green)" : "var(--ath-red, #ef4444)";
  const arrow = isPositive ? "\u2191" : "\u2193";
  const confidenceBadge = c.confidence === "high" ? "Alta" : c.confidence === "medium" ? "Media" : "Baja";

  return (
    <div className="ath-corr-card" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div className="ath-corr-card-left">
        <span className="ath-corr-card-emoji">{c.behavior_emoji}</span>
      </div>
      <div className="ath-corr-card-body">
        <p className="ath-corr-card-narrative">{c.narrative}</p>
        <div className="ath-corr-card-meta">
          <span className="ath-corr-card-effect" style={{ color }}>
            {arrow} {Math.abs(c.effect_pct).toFixed(1)}%
          </span>
          <span className="ath-corr-card-confidence">Confianza: {confidenceBadge}</span>
          <span className="ath-corr-card-sample">{c.sample_size_with} d\u00EDas</span>
        </div>
      </div>
    </div>
  );
}
