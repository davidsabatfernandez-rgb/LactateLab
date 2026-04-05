import { useState, useEffect, useMemo } from "react";
import { api } from "../../lib/api";

type SleepStages = {
  deep_hours: number;
  deep_pct: number;
  rem_hours: number;
  rem_pct: number;
  light_hours: number;
  light_pct: number;
  awake_hours: number;
  awake_pct: number;
};

type SleepAnalytics = {
  date: string;
  total_hours: number | null;
  stages: SleepStages | null;
  efficiency_pct: number | null;
  performance_score: number | null;
  consistency: { score: number | null; avg_bedtime: string | null; avg_waketime: string | null; variability_min: number | null } | null;
  debt: { accumulated_hours: number; trend: string } | null;
  vs_baseline: { total_vs_avg_pct: number | null; deep_vs_avg_pct: number | null; rem_vs_avg_pct: number | null } | null;
};

type SleepHistoryItem = {
  date: string;
  total_hours: number;
  stages: SleepStages;
  efficiency_pct: number;
  performance_score: number;
};

type SleepSummary = {
  avg_hours: number | null;
  avg_efficiency: number | null;
  avg_deep_pct: number | null;
  avg_rem_pct: number | null;
  consistency_score: number | null;
  total_debt_hours: number;
  performance_trend: string;
  days_with_data: number;
};

type Props = {
  token: string;
  athleteId: number;
  readOnly?: boolean;
};

function scoreTone(score: number | null | undefined): string {
  if (score == null) return "";
  if (score >= 80) return "good";
  if (score >= 50) return "mid";
  return "low";
}

function trendLabel(trend: string): string {
  switch (trend) {
    case "improving": return "Mejorando";
    case "worsening": return "Empeorando";
    case "declining": return "En descenso";
    default: return "Estable";
  }
}

function trendIcon(trend: string): string {
  switch (trend) {
    case "improving": return "\u2191";
    case "worsening":
    case "declining": return "\u2193";
    default: return "\u2192";
  }
}

export function SleepAnalyticsCard({ token, athleteId }: Props) {
  const [analytics, setAnalytics] = useState<SleepAnalytics | null>(null);
  const [history, setHistory] = useState<SleepHistoryItem[]>([]);
  const [summary, setSummary] = useState<SleepSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      api.sleepAnalytics(token, athleteId).catch(() => null),
      api.sleepAnalyticsHistory(token, athleteId, 7).catch(() => []),
      api.sleepAnalyticsSummary(token, athleteId, 7).catch(() => null),
    ]).then(([a, h, s]) => {
      if (cancelled) return;
      setAnalytics(a);
      setHistory(h as SleepHistoryItem[]);
      setSummary(s as SleepSummary | null);
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      setError(err?.message ?? "Error cargando datos de sueno");
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [token, athleteId]);

  const maxHistoryHours = useMemo(() => {
    if (!history.length) return 10;
    return Math.max(10, ...history.map((h) => h.total_hours));
  }, [history]);

  if (loading) {
    return (
      <section className="ath-sleep-analytics">
        <h3 className="ath-section-title">Analisis de sueno</h3>
        <div className="ath-sleep-analytics__loading">Cargando datos de sueno...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="ath-sleep-analytics">
        <h3 className="ath-section-title">Analisis de sueno</h3>
        <div className="ath-sleep-analytics__error">{error}</div>
      </section>
    );
  }

  const noData = !analytics?.total_hours && !history.length;
  if (noData) {
    return (
      <section className="ath-sleep-analytics">
        <h3 className="ath-section-title">Analisis de sueno</h3>
        <div className="ath-sleep-analytics__empty">
          Sin datos de sueno disponibles. Sincroniza tu dispositivo para ver el analisis.
        </div>
      </section>
    );
  }

  const score = analytics?.performance_score;
  const stages = analytics?.stages;
  const debt = analytics?.debt;
  const consistency = analytics?.consistency;
  const efficiency = analytics?.efficiency_pct;

  return (
    <section className="ath-sleep-analytics">
      <h3 className="ath-section-title">Analisis de sueno</h3>

      {/* Top row: Score ring + key metrics */}
      <div className="ath-sleep-analytics__top">
        {/* Performance Score Ring */}
        <div className="ath-sleep-analytics__score-ring">
          <SleepScoreRing score={score ?? 0} />
          <span className="ath-sleep-analytics__score-label">Rendimiento</span>
        </div>

        {/* Key metrics grid */}
        <div className="ath-sleep-analytics__metrics">
          <div className="ath-sleep-analytics__metric">
            <small>Duracion</small>
            <strong>{analytics?.total_hours != null ? `${analytics.total_hours.toFixed(1)}h` : "n/d"}</strong>
          </div>
          <div className="ath-sleep-analytics__metric">
            <small>Eficiencia</small>
            <strong>{efficiency != null ? `${efficiency.toFixed(0)}%` : "n/d"}</strong>
          </div>
          <div className="ath-sleep-analytics__metric">
            <small>Consistencia</small>
            <strong>{consistency?.score != null ? `${Math.round(consistency.score)}` : "n/d"}</strong>
          </div>
          <div className="ath-sleep-analytics__metric">
            <small>Deuda</small>
            <strong className={debt && debt.accumulated_hours > 4 ? "ath-sleep-analytics__debt-high" : ""}>
              {debt ? `${debt.accumulated_hours.toFixed(1)}h` : "n/d"}
            </strong>
            {debt && (
              <span className={`ath-sleep-analytics__trend ath-sleep-analytics__trend--${debt.trend}`}>
                {trendIcon(debt.trend)} {trendLabel(debt.trend)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sleep stages bar */}
      {stages && (
        <div className="ath-sleep-analytics__stages">
          <h4 className="ath-sleep-analytics__subtitle">Fases del sueno</h4>
          <div className="ath-sleep-stages-bar">
            {stages.deep_pct > 0 && (
              <div
                className="ath-sleep-stages-bar__segment ath-sleep-stages-bar__segment--deep"
                style={{ width: `${stages.deep_pct}%` }}
                title={`Profundo: ${stages.deep_pct.toFixed(1)}%`}
              />
            )}
            {stages.rem_pct > 0 && (
              <div
                className="ath-sleep-stages-bar__segment ath-sleep-stages-bar__segment--rem"
                style={{ width: `${stages.rem_pct}%` }}
                title={`REM: ${stages.rem_pct.toFixed(1)}%`}
              />
            )}
            {stages.light_pct > 0 && (
              <div
                className="ath-sleep-stages-bar__segment ath-sleep-stages-bar__segment--light"
                style={{ width: `${stages.light_pct}%` }}
                title={`Ligero: ${stages.light_pct.toFixed(1)}%`}
              />
            )}
            {stages.awake_pct > 0 && (
              <div
                className="ath-sleep-stages-bar__segment ath-sleep-stages-bar__segment--awake"
                style={{ width: `${stages.awake_pct}%` }}
                title={`Despierto: ${stages.awake_pct.toFixed(1)}%`}
              />
            )}
          </div>
          <div className="ath-sleep-stages-bar__legend">
            <span className="ath-sleep-stages-bar__legend-item">
              <span className="ath-sleep-stages-bar__dot ath-sleep-stages-bar__dot--deep" />
              Profundo {stages.deep_pct.toFixed(0)}%
            </span>
            <span className="ath-sleep-stages-bar__legend-item">
              <span className="ath-sleep-stages-bar__dot ath-sleep-stages-bar__dot--rem" />
              REM {stages.rem_pct.toFixed(0)}%
            </span>
            <span className="ath-sleep-stages-bar__legend-item">
              <span className="ath-sleep-stages-bar__dot ath-sleep-stages-bar__dot--light" />
              Ligero {stages.light_pct.toFixed(0)}%
            </span>
            {stages.awake_pct > 0 && (
              <span className="ath-sleep-stages-bar__legend-item">
                <span className="ath-sleep-stages-bar__dot ath-sleep-stages-bar__dot--awake" />
                Despierto {stages.awake_pct.toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Mini chart: last 7 nights */}
      {history.length > 0 && (
        <div className="ath-sleep-analytics__history">
          <h4 className="ath-sleep-analytics__subtitle">Ultimas 7 noches</h4>
          <div className="ath-sleep-history-bars">
            {history.map((item) => {
              const pct = (item.total_hours / maxHistoryHours) * 100;
              const dayLabel = (() => {
                try {
                  const d = new Date(item.date + "T00:00:00");
                  return d.toLocaleDateString("es-ES", { weekday: "short" }).slice(0, 2);
                } catch { return ""; }
              })();
              return (
                <div key={item.date} className="ath-sleep-history-bar">
                  <div className="ath-sleep-history-bar__track">
                    <div
                      className={`ath-sleep-history-bar__fill ath-sleep-history-bar__fill--${scoreTone(item.performance_score)}`}
                      style={{ height: `${Math.max(5, pct)}%` }}
                    />
                  </div>
                  <span className="ath-sleep-history-bar__hours">{item.total_hours.toFixed(1)}</span>
                  <span className="ath-sleep-history-bar__day">{dayLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary row */}
      {summary && summary.days_with_data > 0 && (
        <div className="ath-sleep-analytics__summary">
          <div className="ath-sleep-analytics__summary-item">
            <small>Media 7d</small>
            <strong>{summary.avg_hours != null ? `${summary.avg_hours.toFixed(1)}h` : "n/d"}</strong>
          </div>
          <div className="ath-sleep-analytics__summary-item">
            <small>Profundo</small>
            <strong>{summary.avg_deep_pct != null ? `${summary.avg_deep_pct.toFixed(0)}%` : "n/d"}</strong>
          </div>
          <div className="ath-sleep-analytics__summary-item">
            <small>REM</small>
            <strong>{summary.avg_rem_pct != null ? `${summary.avg_rem_pct.toFixed(0)}%` : "n/d"}</strong>
          </div>
          <div className="ath-sleep-analytics__summary-item">
            <small>Tendencia</small>
            <strong className={`ath-sleep-analytics__trend ath-sleep-analytics__trend--${summary.performance_trend}`}>
              {trendIcon(summary.performance_trend)} {trendLabel(summary.performance_trend)}
            </strong>
          </div>
        </div>
      )}
    </section>
  );
}


/* ── Score Ring (inline SVG) ──────────────────────────────────── */

function SleepScoreRing({ score }: { score: number }) {
  const r = 38;
  const strokeWidth = 5;
  const viewBox = 90;
  const cx = viewBox / 2;
  const cy = viewBox / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  const tone = scoreTone(score);

  return (
    <div className="ath-sleep-score-ring">
      <svg viewBox={`0 0 ${viewBox} ${viewBox}`} width={80} height={80}>
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="var(--ath-border-subtle)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          className={`ath-sleep-score-ring__fill ${tone}`}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${offset}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <span className="ath-sleep-score-ring__value">{score}</span>
    </div>
  );
}
