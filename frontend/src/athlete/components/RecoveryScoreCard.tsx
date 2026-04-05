import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type RecoveryData = {
  score: number | null;
  zone: string | null;
  zone_label: string | null;
  components: {
    wellness: { score: number; raw_avg: number; weight: number };
    hrv: { score: number; value: number | null; baseline: number | null; weight: number };
    resting_hr: { score: number; value: number | null; baseline: number | null; weight: number };
  } | null;
  has_objective_data: boolean;
};

type Props = {
  token: string;
  athleteId: number;
  gated?: boolean;
};

export function RecoveryScoreCard({ token, athleteId, gated }: Props) {
  const [data, setData] = useState<RecoveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await api.recoveryScore(token, athleteId) as RecoveryData;
        setData(result);
      } catch { /* no data */ }
      setLoading(false);
    })();
  }, [token, athleteId]);

  if (loading) return null;
  if (!data || data.score === null) return null;

  if (gated) {
    return (
      <div className="ath-recovery-card ath-recovery-gated">
        <div className="ath-recovery-score-circle ath-recovery-locked">
          <span className="ath-recovery-lock">&#x1f512;</span>
        </div>
        <p className="ath-recovery-gated-text">Completa tu diario de habitos para ver tu puntuacion de recuperacion</p>
      </div>
    );
  }

  const zoneColor = data.zone === "green" ? "var(--ath-green)" : data.zone === "yellow" ? "var(--ath-amber, #f59e0b)" : "var(--ath-red, #ef4444)";
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference * (1 - data.score / 100);

  return (
    <div className="ath-recovery-card">
      <div className="ath-recovery-main" onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer" }}>
        <div className="ath-recovery-score-circle">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--ath-border-subtle)" strokeWidth="6" />
            <circle
              cx="50" cy="50" r="45"
              fill="none"
              stroke={zoneColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 50 50)"
              style={{ transition: "stroke-dashoffset 0.8s ease" }}
            />
          </svg>
          <div className="ath-recovery-score-text">
            <span className="ath-recovery-score-number" style={{ color: zoneColor }}>{data.score}</span>
            <span className="ath-recovery-score-label">{data.zone_label}</span>
          </div>
        </div>

        <div className="ath-recovery-info">
          <h3 className="ath-recovery-title">Recuperacion</h3>
          <p className="ath-recovery-subtitle">
            {data.has_objective_data ? "Subjetivo + objetivo" : "Solo subjetivo"}
          </p>
        </div>
      </div>

      {expanded && data.components && (
        <div className="ath-recovery-breakdown">
          <div className="ath-recovery-component">
            <span className="ath-recovery-comp-label">Bienestar</span>
            <div className="ath-recovery-comp-bar-bg">
              <div className="ath-recovery-comp-bar" style={{ width: `${data.components.wellness.score}%`, background: zoneColor }} />
            </div>
            <span className="ath-recovery-comp-value">{data.components.wellness.raw_avg.toFixed(1)}/5</span>
          </div>
          {data.components.hrv.value !== null && (
            <div className="ath-recovery-component">
              <span className="ath-recovery-comp-label">HRV</span>
              <div className="ath-recovery-comp-bar-bg">
                <div className="ath-recovery-comp-bar" style={{ width: `${data.components.hrv.score}%`, background: zoneColor }} />
              </div>
              <span className="ath-recovery-comp-value">{data.components.hrv.value.toFixed(0)} ms</span>
            </div>
          )}
          {data.components.resting_hr.value !== null && (
            <div className="ath-recovery-component">
              <span className="ath-recovery-comp-label">FC reposo</span>
              <div className="ath-recovery-comp-bar-bg">
                <div className="ath-recovery-comp-bar" style={{ width: `${data.components.resting_hr.score}%`, background: zoneColor }} />
              </div>
              <span className="ath-recovery-comp-value">{data.components.resting_hr.value.toFixed(0)} bpm</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
