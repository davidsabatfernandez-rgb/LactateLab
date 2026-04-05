import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type SleepCoachData = {
  base_need_hours: number;
  strain_adjustment_min: number;
  debt_hours: number;
  nap_credit_min: number;
  total_need_hours: number;
  actual_hours: number | null;
  deficit_hours: number | null;
  recommendation: string;
};

type SleepPerformanceData = {
  score: number | null;
  efficiency_pct: number | null;
  consistency_score: number | null;
  debt_hours: number | null;
  breakdown: {
    deep_pct: number;
    rem_pct: number;
    light_pct: number;
    awake_pct: number;
  } | null;
};

type SleepHistoryItem = {
  date: string;
  sleep_hours: number | null;
  score: number | null;
};

type Props = {
  token: string;
  athleteId: number;
  readOnly?: boolean;
};

function fmtHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export function SleepCoachCard({ token, athleteId, readOnly }: Props) {
  const [coach, setCoach] = useState<SleepCoachData | null>(null);
  const [perf, setPerf] = useState<SleepPerformanceData | null>(null);
  const [history, setHistory] = useState<SleepHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, p, h] = await Promise.all([
          api.sleepCoach(token, athleteId),
          api.sleepPerformance(token, athleteId),
          api.sleepHistory(token, athleteId, 7),
        ]);
        if (!cancelled) {
          setCoach(c as SleepCoachData);
          setPerf(p as SleepPerformanceData);
          setHistory(h as SleepHistoryItem[]);
        }
      } catch { /* no data */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token, athleteId]);

  if (loading) return null;
  if (!coach) return null;

  const hasActual = coach.actual_hours !== null && coach.actual_hours > 0;
  const scoreColor =
    perf?.score != null
      ? perf.score >= 80
        ? "var(--ath-green, #10b981)"
        : perf.score >= 50
          ? "var(--ath-amber, #f59e0b)"
          : "var(--ath-red, #ef4444)"
      : "var(--ath-text-muted)";

  const needPct = hasActual ? Math.min(100, (coach.actual_hours! / coach.total_need_hours) * 100) : 0;

  return (
    <div className="ath-sleep-coach-card">
      <div className="ath-sleep-coach-main" onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer" }}>
        {/* Score circle */}
        {perf?.score != null ? (
          <div className="ath-sleep-coach-score-circle">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="35" fill="none" stroke="var(--ath-border-subtle)" strokeWidth="5" />
              <circle
                cx="40" cy="40" r="35"
                fill="none"
                stroke={scoreColor}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 35}
                strokeDashoffset={2 * Math.PI * 35 * (1 - perf.score / 100)}
                transform="rotate(-90 40 40)"
                style={{ transition: "stroke-dashoffset 0.8s ease" }}
              />
            </svg>
            <div className="ath-sleep-coach-score-text">
              <span className="ath-sleep-coach-score-number" style={{ color: scoreColor }}>{perf.score}</span>
            </div>
          </div>
        ) : (
          <div className="ath-sleep-coach-no-score">
            <span className="ath-sleep-coach-no-score-icon">&#x1f634;</span>
          </div>
        )}

        <div className="ath-sleep-coach-info">
          <h3 className="ath-sleep-coach-title">Sueno</h3>
          {hasActual ? (
            <p className="ath-sleep-coach-subtitle">
              {fmtHours(coach.actual_hours!)} de {fmtHours(coach.total_need_hours)} objetivo
            </p>
          ) : (
            <p className="ath-sleep-coach-subtitle">
              Objetivo: {fmtHours(coach.total_need_hours)}
            </p>
          )}
          {coach.debt_hours > 1 && (
            <span className="ath-sleep-coach-debt-badge">
              Deuda: {fmtHours(coach.debt_hours)}
            </span>
          )}
        </div>
      </div>

      {/* Need vs actual bar */}
      {hasActual && (
        <div className="ath-sleep-coach-need-bar-wrap">
          <div className="ath-sleep-coach-need-bar-bg">
            <div
              className="ath-sleep-coach-need-bar-fill"
              style={{
                width: `${needPct}%`,
                background: needPct >= 90 ? "var(--ath-green, #10b981)" : needPct >= 70 ? "var(--ath-amber, #f59e0b)" : "var(--ath-red, #ef4444)",
              }}
            />
          </div>
          <div className="ath-sleep-coach-need-labels">
            <span>{fmtHours(coach.actual_hours!)}</span>
            <span>{fmtHours(coach.total_need_hours)}</span>
          </div>
        </div>
      )}

      {/* Stage breakdown */}
      {perf?.breakdown && (
        <div className="ath-sleep-coach-stages">
          <div className="ath-sleep-coach-stage-bar">
            <div className="ath-sleep-coach-stage-seg" style={{ width: `${perf.breakdown.deep_pct}%`, background: "var(--ath-purple, #8b5cf6)" }} title={`Profundo: ${perf.breakdown.deep_pct}%`} />
            <div className="ath-sleep-coach-stage-seg" style={{ width: `${perf.breakdown.rem_pct}%`, background: "var(--ath-blue, #3b82f6)" }} title={`REM: ${perf.breakdown.rem_pct}%`} />
            <div className="ath-sleep-coach-stage-seg" style={{ width: `${perf.breakdown.light_pct}%`, background: "var(--ath-accent-light, #eff6ff)" }} title={`Ligero: ${perf.breakdown.light_pct}%`} />
            <div className="ath-sleep-coach-stage-seg" style={{ width: `${perf.breakdown.awake_pct}%`, background: "var(--ath-border, #e5e7eb)" }} title={`Despierto: ${perf.breakdown.awake_pct}%`} />
          </div>
          <div className="ath-sleep-coach-stage-legend">
            <span><i style={{ background: "var(--ath-purple, #8b5cf6)" }} /> Profundo {perf.breakdown.deep_pct}%</span>
            <span><i style={{ background: "var(--ath-blue, #3b82f6)" }} /> REM {perf.breakdown.rem_pct}%</span>
            <span><i style={{ background: "var(--ath-accent-light, #eff6ff)" }} /> Ligero {perf.breakdown.light_pct}%</span>
          </div>
        </div>
      )}

      {/* Recommendation */}
      <p className="ath-sleep-coach-recommendation">{coach.recommendation}</p>

      {/* Expanded details */}
      {expanded && (
        <div className="ath-sleep-coach-breakdown">
          <div className="ath-sleep-coach-comp">
            <span className="ath-sleep-coach-comp-label">Necesidad base</span>
            <span className="ath-sleep-coach-comp-value">{fmtHours(coach.base_need_hours)}</span>
          </div>
          {coach.strain_adjustment_min > 0 && (
            <div className="ath-sleep-coach-comp">
              <span className="ath-sleep-coach-comp-label">Ajuste por strain</span>
              <span className="ath-sleep-coach-comp-value">+{coach.strain_adjustment_min} min</span>
            </div>
          )}
          {coach.debt_hours > 0 && (
            <div className="ath-sleep-coach-comp">
              <span className="ath-sleep-coach-comp-label">Deuda acumulada (7d)</span>
              <span className="ath-sleep-coach-comp-value">{fmtHours(coach.debt_hours)}</span>
            </div>
          )}
          {coach.nap_credit_min > 0 && (
            <div className="ath-sleep-coach-comp">
              <span className="ath-sleep-coach-comp-label">Credito siesta</span>
              <span className="ath-sleep-coach-comp-value">-{coach.nap_credit_min} min</span>
            </div>
          )}
          {perf?.efficiency_pct != null && (
            <div className="ath-sleep-coach-comp">
              <span className="ath-sleep-coach-comp-label">Eficiencia</span>
              <span className="ath-sleep-coach-comp-value">{perf.efficiency_pct}%</span>
            </div>
          )}
          {perf?.consistency_score != null && (
            <div className="ath-sleep-coach-comp">
              <span className="ath-sleep-coach-comp-label">Consistencia</span>
              <span className="ath-sleep-coach-comp-value">{perf.consistency_score}/100</span>
            </div>
          )}
        </div>
      )}

      {/* Mini history */}
      {history.length > 0 && history.some((h) => h.sleep_hours != null) && (
        <div className="ath-sleep-coach-history">
          {history.map((h) => {
            const maxH = 12;
            const barH = h.sleep_hours != null ? Math.max(4, (h.sleep_hours / maxH) * 40) : 2;
            const barColor = h.score != null
              ? h.score >= 80 ? "var(--ath-green, #10b981)" : h.score >= 50 ? "var(--ath-amber, #f59e0b)" : "var(--ath-red, #ef4444)"
              : "var(--ath-border)";
            const dayLabel = new Date(h.date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "narrow" });
            return (
              <div key={h.date} className="ath-sleep-coach-history-col">
                <div className="ath-sleep-coach-history-bar" style={{ height: barH, background: barColor }} title={h.sleep_hours != null ? `${h.sleep_hours.toFixed(1)}h` : "Sin datos"} />
                <span className="ath-sleep-coach-history-day">{dayLabel}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
