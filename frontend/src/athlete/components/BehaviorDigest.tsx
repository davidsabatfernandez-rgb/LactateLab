import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type MetricTrend = {
  metric: string;
  label: string;
  this_period_avg: number | null;
  prev_period_avg: number | null;
  change_pct: number | null;
  trend: string | null; // "up" | "down" | "stable"
};

type DigestData = {
  period_start: string;
  period_end: string;
  days_logged: number;
  total_days: number;
  top_behaviors: Array<{ key: string; label: string; emoji: string; count: number }>;
  metric_trends: MetricTrend[];
  top_positive: Array<{ behavior_label: string; behavior_emoji: string; effect_pct: number; narrative: string }>;
  top_negative: Array<{ behavior_label: string; behavior_emoji: string; effect_pct: number; narrative: string }>;
};

type Props = {
  token: string;
  athleteId: number;
  type: "weekly" | "monthly";
};

export function BehaviorDigest({ token, athleteId, type }: Props) {
  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await api.behaviorDigest(token, athleteId, type) as DigestData;
        setData(result);
      } catch { setError(true); }
      setLoading(false);
    })();
  }, [token, athleteId, type]);

  if (loading || (!data && !error)) return null;
  if (error) return (
    <div className="ath-digest-card">
      <p style={{ fontSize: 12, color: "var(--ath-red, #ef4444)", textAlign: "center", padding: "20px 0" }}>Error al cargar datos</p>
    </div>
  );
  if (!data) return null;

  const title = type === "weekly" ? "Resumen semanal" : "Resumen mensual";
  const dateRange = `${formatShortDate(data.period_start)} \u2014 ${formatShortDate(data.period_end)}`;
  const adherence = data.total_days > 0 ? Math.round((data.days_logged / data.total_days) * 100) : 0;

  return (
    <div className="ath-digest-card">
      <button type="button" className="ath-digest-header" onClick={() => setExpanded(!expanded)}>
        <div>
          <h4 className="ath-digest-title">{title}</h4>
          <span className="ath-digest-range">{dateRange}</span>
        </div>
        <span className="ath-digest-chevron">{expanded ? "\u25BE" : "\u25B8"}</span>
      </button>

      {expanded && (
        <div className="ath-digest-body">
          {/* Adherence */}
          <div className="ath-digest-adherence">
            <div className="ath-digest-adherence-bar">
              <div className="ath-digest-adherence-fill" style={{ width: `${adherence}%` }} />
            </div>
            <span className="ath-digest-adherence-text">
              {data.days_logged}/{data.total_days} d\u00EDas registrados ({adherence}%)
            </span>
          </div>

          {/* Top behaviors */}
          {data.top_behaviors.length > 0 && (
            <div className="ath-digest-section">
              <h5 className="ath-digest-section-title">H\u00E1bitos m\u00E1s frecuentes</h5>
              <div className="ath-digest-behavior-list">
                {data.top_behaviors.map((b, i) => (
                  <div key={i} className="ath-digest-behavior-row">
                    <span>{b.emoji} {b.label}</span>
                    <span className="ath-digest-behavior-count">{b.count} d\u00EDas</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metric trends */}
          {data.metric_trends.length > 0 && (
            <div className="ath-digest-section">
              <h5 className="ath-digest-section-title">Tendencias</h5>
              <div className="ath-digest-trends">
                {data.metric_trends.map((t, i) => {
                  if (t.this_period_avg == null || t.trend == null) return null;
                  const arrow = t.trend === "up" ? "\u2191" : t.trend === "down" ? "\u2193" : "\u2192";
                  const color = t.trend === "stable" ? "var(--ath-text-muted)" :
                    // For resting_hr, down is good. For others, up is good.
                    (t.metric === "resting_hr" ? (t.trend === "down" ? "var(--ath-green)" : "var(--ath-red, #ef4444)") :
                      (t.trend === "up" ? "var(--ath-green)" : "var(--ath-red, #ef4444)"));
                  return (
                    <div key={i} className="ath-digest-trend-row">
                      <span className="ath-digest-trend-label">{t.label}</span>
                      <span className="ath-digest-trend-value">
                        {t.this_period_avg.toFixed(1)}
                      </span>
                      <span className="ath-digest-trend-change" style={{ color }}>
                        {arrow} {t.change_pct != null ? Math.abs(t.change_pct).toFixed(1) : "—"}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Correlations summary */}
          {data.top_positive && data.top_positive.length > 0 && (
            <div className="ath-digest-section">
              <h5 className="ath-digest-section-title" style={{ color: "var(--ath-green)" }}>
                Te ayud\u00F3
              </h5>
              {data.top_positive.map((c, i) => (
                <p key={i} className="ath-digest-correlation">{c.behavior_emoji} {c.narrative}</p>
              ))}
            </div>
          )}
          {data.top_negative && data.top_negative.length > 0 && (
            <div className="ath-digest-section">
              <h5 className="ath-digest-section-title" style={{ color: "var(--ath-red, #ef4444)" }}>
                Te perjudic\u00F3
              </h5>
              {data.top_negative.map((c, i) => (
                <p key={i} className="ath-digest-correlation">{c.behavior_emoji} {c.narrative}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
