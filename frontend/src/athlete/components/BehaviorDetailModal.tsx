import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { BehaviorCorrelation } from "../utils/nutrition";

type Props = {
  token: string;
  athleteId: number;
  behaviorKey: string;
  behaviorLabel: string;
  behaviorEmoji: string;
  onClose: () => void;
};

export function BehaviorDetailModal({ token, athleteId, behaviorKey, behaviorLabel, behaviorEmoji, onClose }: Props) {
  const [correlations, setCorrelations] = useState<BehaviorCorrelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.behaviorCorrelationDetail(token, athleteId, behaviorKey) as BehaviorCorrelation[];
        setCorrelations(data);
      } catch { setError(true); }
      setLoading(false);
    })();
  }, [token, athleteId, behaviorKey]);

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="ath-modal-overlay" onClick={onClose}>
      <div className="ath-behavior-detail-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="ath-behavior-detail-header">
          <div className="ath-behavior-detail-title-row">
            <span className="ath-behavior-detail-emoji">{behaviorEmoji}</span>
            <h3 className="ath-behavior-detail-title">{behaviorLabel}</h3>
          </div>
          <button type="button" className="ath-day-detail-close" onClick={onClose} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {loading ? (
          <p style={{ fontSize: 12, color: "var(--ath-text-muted)", textAlign: "center", padding: "20px 0" }}>Cargando...</p>
        ) : error ? (
          <p style={{ fontSize: 12, color: "var(--ath-red, #ef4444)", textAlign: "center", padding: "20px 0" }}>Error al cargar datos</p>
        ) : correlations.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--ath-text-muted)", textAlign: "center", padding: "20px 0" }}>
            No hay suficientes datos para este comportamiento. Necesitas al menos 5 días con y 5 días sin.
          </p>
        ) : (
          <div className="ath-behavior-detail-metrics">
            {correlations.map((c, i) => {
              const isPositive = c.effect_direction === "positive";
              const isNeutral = c.effect_direction === "neutral";
              const color = isNeutral ? "var(--ath-text-muted)" : isPositive ? "var(--ath-green)" : "var(--ath-red, #ef4444)";
              const arrow = isNeutral ? "\u2192" : isPositive ? "\u2191" : "\u2193";
              const confidenceLabel = c.confidence === "high" ? "Alta" : c.confidence === "medium" ? "Media" : "Baja";

              return (
                <div key={i} className="ath-behavior-detail-metric">
                  <div className="ath-behavior-detail-metric-header">
                    <span className="ath-behavior-detail-metric-name">{c.outcome_label}</span>
                    <span className="ath-behavior-detail-metric-effect" style={{ color }}>
                      {arrow} {Math.abs(c.effect_pct).toFixed(1)}%
                    </span>
                  </div>

                  {/* Comparison bars */}
                  <div className="ath-behavior-detail-comparison">
                    <div className="ath-behavior-detail-bar-group">
                      <span className="ath-behavior-detail-bar-label">Con {behaviorLabel.toLowerCase()}</span>
                      <div className="ath-behavior-detail-bar-row">
                        <div className="ath-behavior-detail-bar" style={{
                          width: `${Math.min(100, (c.mean_with / Math.max(c.mean_with, c.mean_without)) * 100)}%`,
                          background: color,
                        }} />
                        <span className="ath-behavior-detail-bar-value">{c.mean_with.toFixed(1)}</span>
                      </div>
                      <span className="ath-behavior-detail-bar-sample">{c.sample_size_with} d\u00edas</span>
                    </div>
                    <div className="ath-behavior-detail-bar-group">
                      <span className="ath-behavior-detail-bar-label">Sin {behaviorLabel.toLowerCase()}</span>
                      <div className="ath-behavior-detail-bar-row">
                        <div className="ath-behavior-detail-bar" style={{
                          width: `${Math.min(100, (c.mean_without / Math.max(c.mean_with, c.mean_without)) * 100)}%`,
                          background: "var(--ath-border-subtle)",
                        }} />
                        <span className="ath-behavior-detail-bar-value">{c.mean_without.toFixed(1)}</span>
                      </div>
                      <span className="ath-behavior-detail-bar-sample">{c.sample_size_without} d\u00edas</span>
                    </div>
                  </div>

                  <div className="ath-behavior-detail-metric-footer">
                    <span>Confianza: {confidenceLabel}</span>
                    {c.p_value !== null && <span>p = {c.p_value.toFixed(3)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
