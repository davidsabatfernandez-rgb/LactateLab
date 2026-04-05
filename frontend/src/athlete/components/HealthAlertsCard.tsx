import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type HealthAlert = {
  metric: string;
  metric_label: string;
  severity: string;
  current_value: number;
  baseline_value: number | null;
  deviation_pct: number;
  message: string;
  icon: string;
  created_date: string;
};

type HistoryDay = {
  date: string;
  alerts: HealthAlert[];
};

type Props = {
  token: string;
  athleteId: number;
  readOnly?: boolean;
};

export function HealthAlertsCard({ token, athleteId, readOnly }: Props) {
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.healthAlerts(token, athleteId);
        if (!cancelled) setAlerts(result);
      } catch {
        /* no data */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token, athleteId]);

  useEffect(() => {
    if (!expanded || history.length > 0) return;
    let cancelled = false;
    setHistoryLoading(true);
    (async () => {
      try {
        const result = await api.healthAlertHistory(token, athleteId, 14);
        if (!cancelled) setHistory(result.history);
      } catch {
        /* ignore */
      }
      if (!cancelled) setHistoryLoading(false);
    })();
    return () => { cancelled = true; };
  }, [expanded, token, athleteId, history.length]);

  if (loading) return null;

  // No alerts — show green "all normal" indicator
  if (alerts.length === 0) {
    return (
      <div className="ath-health-alert-card ath-health-alert-ok">
        <div className="ath-health-alert-ok-inner">
          <span className="ath-health-alert-ok-icon">&#x2705;</span>
          <span className="ath-health-alert-ok-text">Todo normal — sin alertas de salud</span>
        </div>
      </div>
    );
  }

  const hasCritical = alerts.some((a) => a.severity === "critical");

  return (
    <div className={`ath-health-alert-card ${hasCritical ? "ath-health-alert-critical-border" : "ath-health-alert-warn-border"}`}>
      <div className="ath-health-alert-header">
        <h3 className="ath-health-alert-title">
          {hasCritical ? "\u26a0\ufe0f" : "\u{1f7e1}"} Alertas de salud
        </h3>
        <span className="ath-health-alert-count">
          {alerts.length} {alerts.length === 1 ? "alerta" : "alertas"}
        </span>
      </div>

      <div className="ath-health-alert-list">
        {alerts.map((alert) => (
          <div
            key={`${alert.metric}-${alert.created_date}`}
            className={`ath-health-alert-item ath-health-alert-${alert.severity}`}
          >
            <div className="ath-health-alert-item-top">
              <span className="ath-health-alert-icon">{alert.icon}</span>
              <span className="ath-health-alert-metric">{alert.metric_label}</span>
              <span className={`ath-health-alert-badge ath-health-alert-badge-${alert.severity}`}>
                {alert.severity === "critical" ? "Critico" : "Atencion"}
              </span>
            </div>
            <p className="ath-health-alert-message">{alert.message}</p>
            <div className="ath-health-alert-values">
              <span className="ath-health-alert-current">
                Actual: <strong>{alert.current_value}</strong>
              </span>
              {alert.baseline_value != null && (
                <span className="ath-health-alert-baseline">
                  Media: <strong>{alert.baseline_value}</strong>
                </span>
              )}
              {alert.deviation_pct > 0 && (
                <span className="ath-health-alert-deviation">
                  {alert.deviation_pct > 0 ? "+" : ""}{alert.deviation_pct}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Expandable history */}
      {!readOnly && (
        <button
          type="button"
          className="ath-health-alert-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Ocultar historial" : "Ver historial (14 dias)"}
        </button>
      )}

      {expanded && (
        <div className="ath-health-alert-history">
          {historyLoading ? (
            <p className="ath-health-alert-history-loading">Cargando historial...</p>
          ) : history.length === 0 ? (
            <p className="ath-health-alert-history-empty">Sin alertas en los ultimos 14 dias</p>
          ) : (
            history.map((day) => (
              <div key={day.date} className="ath-health-alert-history-day">
                <span className="ath-health-alert-history-date">
                  {new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(day.date + "T12:00:00"))}
                </span>
                <div className="ath-health-alert-history-items">
                  {day.alerts.map((a) => (
                    <span
                      key={a.metric}
                      className={`ath-health-alert-history-chip ath-health-alert-badge-${a.severity}`}
                    >
                      {a.icon} {a.metric_label}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
