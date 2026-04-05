import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type AggregationItem = {
  behavior_key: string;
  behavior_label: string;
  behavior_emoji: string;
  affected_athletes: number;
  total_tracked_athletes: number;
  avg_effect_pct: number;
  effect_direction: string;
  outcome_metric: string;
  outcome_label: string;
};

type Props = {
  token: string;
};

export function CoachBehaviorAggregations({ token }: Props) {
  const [data, setData] = useState<{ aggregations: AggregationItem[]; total_athletes: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await api.coachBehaviorAggregations(token) as { aggregations: AggregationItem[]; total_athletes: number };
        setData(result);
      } catch { /* no data yet */ }
      setLoading(false);
    })();
  }, [token]);

  if (loading) return null;
  if (!data || data.aggregations.length === 0) return null;

  const negative = data.aggregations.filter(a => a.effect_direction === "negative").slice(0, 5);
  const positive = data.aggregations.filter(a => a.effect_direction === "positive").slice(0, 5);

  return (
    <div className="ath-bj-card" style={{ marginTop: 20 }}>
      <h3 className="ath-bj-title">Patrones de comportamiento</h3>
      <p className="ath-bj-subtitle">{data.total_athletes} atletas con datos suficientes</p>

      {negative.length > 0 && (
        <div className="ath-insights-section" style={{ marginTop: 12 }}>
          <h4 className="ath-insights-section-title ath-insights-negative">Impacto negativo mas comun</h4>
          {negative.map((a, i) => (
            <div key={`neg-${i}`} className="ath-corr-card">
              <div className="ath-corr-card-left"><span style={{ fontSize: 22 }}>{a.behavior_emoji}</span></div>
              <div className="ath-corr-card-body">
                <p className="ath-corr-card-narrative">
                  <strong>{a.behavior_label}</strong> afecta {a.outcome_label} en {a.affected_athletes} de {a.total_tracked_athletes} atletas
                </p>
                <div className="ath-corr-card-meta">
                  <span className="ath-corr-card-effect" style={{ color: "var(--ath-red, #ef4444)" }}>
                    {"\u2193"} {Math.abs(a.avg_effect_pct).toFixed(1)}% medio
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {positive.length > 0 && (
        <div className="ath-insights-section" style={{ marginTop: 12 }}>
          <h4 className="ath-insights-section-title ath-insights-positive">Impacto positivo mas comun</h4>
          {positive.map((a, i) => (
            <div key={`pos-${i}`} className="ath-corr-card">
              <div className="ath-corr-card-left"><span style={{ fontSize: 22 }}>{a.behavior_emoji}</span></div>
              <div className="ath-corr-card-body">
                <p className="ath-corr-card-narrative">
                  <strong>{a.behavior_label}</strong> mejora {a.outcome_label} en {a.affected_athletes} de {a.total_tracked_athletes} atletas
                </p>
                <div className="ath-corr-card-meta">
                  <span className="ath-corr-card-effect" style={{ color: "var(--ath-green)" }}>
                    {"\u2191"} {Math.abs(a.avg_effect_pct).toFixed(1)}% medio
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
