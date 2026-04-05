import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";
import { useAthleteDataSafe } from "../context/AthleteDataContext";
import { BehaviorCorrelationCard } from "../components/BehaviorCorrelationCard";
import { BehaviorDetailModal } from "../components/BehaviorDetailModal";
import { BehaviorDigest } from "../components/BehaviorDigest";
import type { BehaviorCorrelation } from "../utils/nutrition";

type InsightsSummary = {
  top_positive: BehaviorCorrelation[];
  top_negative: BehaviorCorrelation[];
  data_completeness_pct: number;
  total_days_tracked: number;
  min_days_remaining: number | null;
};

type Props = {
  token?: string;
  athleteId?: number;
  readOnly?: boolean;
};

export function InsightsPage(props: Props) {
  const data = useAthleteDataSafe();
  const token = props.token ?? data?.token ?? "";
  const athleteId = props.athleteId ?? data?.user.athlete_id!;
  const readOnly = props.readOnly;
  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBehavior, setSelectedBehavior] = useState<{ key: string; label: string; emoji: string } | null>(null);

  const load = useCallback(async () => {
    if (!token || !athleteId) { setLoading(false); return; }
    try {
      const data = await api.behaviorInsights(token, athleteId);
      setSummary(data as InsightsSummary);
    } catch {
      setError("Error al cargar insights");
    } finally {
      setLoading(false);
    }
  }, [token, athleteId]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    if (!token || !athleteId) return;
    setRefreshing(true);
    try {
      await api.refreshCorrelations(token, athleteId);
      await load();
    } catch {
      setError("Error al actualizar");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="ath-insights-page">
        <div className="ath-bj-card">
          <h3 className="ath-bj-title">Insights</h3>
          <p style={{ fontSize: 12, color: "var(--ath-text-muted)", textAlign: "center", padding: "20px 0" }}>Cargando...</p>
        </div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="ath-insights-page">
        <div className="ath-bj-card">
          <h3 className="ath-bj-title">Insights</h3>
          <p className="ath-bj-error ath-bj-error-center">{error}</p>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const notReady = summary.min_days_remaining !== null && summary.min_days_remaining > 0;

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="ath-insights-page">
      {/* Print-only header */}
      <div className="ath-report-print-header">
        <h1 className="ath-report-print-title">PeakAerobic — Insights de comportamiento</h1>
        <p className="ath-report-print-subtitle">{summary.total_days_tracked} dias analizados</p>
      </div>

      <div className="ath-bj-card">
        <div className="ath-insights-header">
          <h3 className="ath-bj-title">Insights de comportamiento</h3>
          <div className="ath-insights-header-actions">
            {!readOnly && !notReady && (
              <button type="button" className="ath-insights-refresh" onClick={handleRefresh} disabled={refreshing}>
                {refreshing ? "Actualizando..." : "\u21BB Actualizar"}
              </button>
            )}
            <button
              type="button"
              className="ath-report-export-btn"
              onClick={handleExportPDF}
              title="Exportar como PDF"
            >
              Exportar PDF
            </button>
          </div>
        </div>

        {/* Data readiness */}
        {notReady ? (
          <div className="ath-insights-not-ready">
            <div className="ath-insights-progress">
              <div className="ath-insights-progress-bar" style={{ width: `${summary.data_completeness_pct}%` }} />
            </div>
            <p className="ath-insights-not-ready-text">
              Registra tus h\u00E1bitos durante <strong>{summary.min_days_remaining} d\u00EDas m\u00E1s</strong> para ver tus primeros insights
            </p>
            <p className="ath-insights-days-count">{summary.total_days_tracked} de 14 d\u00EDas registrados</p>
          </div>
        ) : (
          <>
            {/* Data completeness */}
            <div className="ath-insights-completeness">
              <span>{summary.total_days_tracked} d\u00EDas analizados</span>
              <span>\u00B7</span>
              <span>{Math.round(summary.data_completeness_pct)}% completitud</span>
            </div>

            {/* Top positive */}
            {summary.top_positive.length > 0 && (
              <div className="ath-insights-section">
                <h4 className="ath-insights-section-title ath-insights-positive">\u2705 Lo que te ayuda</h4>
                {summary.top_positive.map((c, i) => (
                  <BehaviorCorrelationCard key={`pos-${i}`} correlation={c} onClick={() => setSelectedBehavior({ key: c.behavior_key, label: c.behavior_label, emoji: c.behavior_emoji })} />
                ))}
              </div>
            )}

            {/* Top negative */}
            {summary.top_negative.length > 0 && (
              <div className="ath-insights-section">
                <h4 className="ath-insights-section-title ath-insights-negative">\u26A0\uFE0F Lo que te perjudica</h4>
                {summary.top_negative.map((c, i) => (
                  <BehaviorCorrelationCard key={`neg-${i}`} correlation={c} onClick={() => setSelectedBehavior({ key: c.behavior_key, label: c.behavior_label, emoji: c.behavior_emoji })} />
                ))}
              </div>
            )}

            {/* Digests */}
            <BehaviorDigest token={token} athleteId={athleteId} type="weekly" />
            <BehaviorDigest token={token} athleteId={athleteId} type="monthly" />

            {/* Empty state */}
            {summary.top_positive.length === 0 && summary.top_negative.length === 0 && (
              <p className="ath-insights-empty">
                A\u00FAn no hay correlaciones significativas. Sigue registrando tus h\u00E1bitos para descubrir patrones.
              </p>
            )}
          </>
        )}
      </div>
      {selectedBehavior && (
        <BehaviorDetailModal
          token={token}
          athleteId={athleteId}
          behaviorKey={selectedBehavior.key}
          behaviorLabel={selectedBehavior.label}
          behaviorEmoji={selectedBehavior.emoji}
          onClose={() => setSelectedBehavior(null)}
        />
      )}
    </div>
  );
}
