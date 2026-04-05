import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type StrainData = {
  score: number;
  zone: string;
  zone_label: string;
  components: {
    active_energy_kcal: number;
    energy_strain: number;
    exercise_minutes: number;
    exercise_bonus: number;
    steps: number;
    activities_count: number;
    baseline_energy_kcal: number;
  };
};

type StrainTarget = {
  target_min: number;
  target_max: number;
  zone: string;
  zone_label: string;
  recommendation: string;
  recovery_score: number | null;
  has_planned_session: boolean;
};

type StrainHistoryItem = {
  date: string;
  score: number;
  zone: string;
  zone_label: string;
};

type Props = {
  token: string;
  athleteId: number;
  readOnly?: boolean;
};

const ZONE_COLORS: Record<string, string> = {
  light: "var(--ath-blue, #3b82f6)",
  moderate: "var(--ath-amber, #f59e0b)",
  hard: "var(--ath-red, #ef4444)",
  overreaching: "var(--ath-purple, #8b5cf6)",
};

const TARGET_ZONE_COLORS: Record<string, string> = {
  green: "var(--ath-green, #10b981)",
  yellow: "var(--ath-amber, #f59e0b)",
  red: "var(--ath-red, #ef4444)",
};

export function StrainCoachCard({ token, athleteId, readOnly }: Props) {
  const [strain, setStrain] = useState<StrainData | null>(null);
  const [target, setTarget] = useState<StrainTarget | null>(null);
  const [history, setHistory] = useState<StrainHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, t, h] = await Promise.all([
          api.strainScore(token, athleteId),
          api.strainTarget(token, athleteId),
          api.strainHistory(token, athleteId, 7),
        ]);
        if (!cancelled) {
          setStrain(s as StrainData);
          setTarget(t as StrainTarget);
          setHistory(h as StrainHistoryItem[]);
        }
      } catch { /* no data */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token, athleteId]);

  if (loading) return null;
  if (!strain) return null;

  const MAX = 21;
  const zoneColor = ZONE_COLORS[strain.zone] || "var(--ath-text-muted)";
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference * (1 - strain.score / MAX);

  const maxHistory = Math.max(...history.map((h) => h.score), 1);

  return (
    <div className="ath-strain-card">
      <div className="ath-strain-main" onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer" }}>
        <div className="ath-strain-gauge">
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
          <div className="ath-strain-gauge-text">
            <span className="ath-strain-score" style={{ color: zoneColor }}>{strain.score.toFixed(1)}</span>
            <span className="ath-strain-max">/ {MAX}</span>
          </div>
        </div>

        <div className="ath-strain-info">
          <h3 className="ath-strain-title">Strain</h3>
          <span className="ath-strain-zone-badge" style={{ background: zoneColor, color: "#fff" }}>
            {strain.zone_label}
          </span>
          {target && (
            <p className="ath-strain-target-text">
              Objetivo: {target.target_min}-{target.target_max}
              <span
                className="ath-strain-target-dot"
                style={{ background: TARGET_ZONE_COLORS[target.zone] || "var(--ath-text-muted)" }}
              />
            </p>
          )}
        </div>
      </div>

      {/* Target range indicator */}
      {target && (
        <div className="ath-strain-target-bar-wrap">
          <div className="ath-strain-target-bar-bg">
            <div
              className="ath-strain-target-bar-range"
              style={{
                left: `${(target.target_min / MAX) * 100}%`,
                width: `${((target.target_max - target.target_min) / MAX) * 100}%`,
                background: TARGET_ZONE_COLORS[target.zone] || "var(--ath-amber)",
              }}
            />
            <div
              className="ath-strain-target-bar-current"
              style={{
                left: `${Math.min(100, (strain.score / MAX) * 100)}%`,
                background: zoneColor,
              }}
            />
          </div>
        </div>
      )}

      {/* Recommendation */}
      {target && (
        <p className="ath-strain-recommendation">{target.recommendation}</p>
      )}

      {/* Mini history */}
      {history.length > 0 && (
        <div className="ath-strain-history">
          {history.map((h) => {
            const barH = h.score > 0 ? Math.max(4, (h.score / maxHistory) * 40) : 2;
            const c = ZONE_COLORS[h.zone] || "var(--ath-border)";
            const dayLabel = new Date(h.date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "narrow" });
            return (
              <div key={h.date} className="ath-strain-history-bar-col">
                <div className="ath-strain-history-bar" style={{ height: barH, background: c }} title={`${h.score.toFixed(1)} - ${h.zone_label}`} />
                <span className="ath-strain-history-day">{dayLabel}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded breakdown */}
      {expanded && (
        <div className="ath-strain-breakdown">
          <div className="ath-strain-comp">
            <span className="ath-strain-comp-label">Energia activa</span>
            <span className="ath-strain-comp-value">{strain.components.active_energy_kcal.toFixed(0)} kcal</span>
          </div>
          <div className="ath-strain-comp">
            <span className="ath-strain-comp-label">Ejercicio</span>
            <span className="ath-strain-comp-value">{strain.components.exercise_minutes} min</span>
          </div>
          <div className="ath-strain-comp">
            <span className="ath-strain-comp-label">Pasos</span>
            <span className="ath-strain-comp-value">{strain.components.steps.toLocaleString()}</span>
          </div>
          <div className="ath-strain-comp">
            <span className="ath-strain-comp-label">Actividades</span>
            <span className="ath-strain-comp-value">{strain.components.activities_count}</span>
          </div>
        </div>
      )}
    </div>
  );
}
