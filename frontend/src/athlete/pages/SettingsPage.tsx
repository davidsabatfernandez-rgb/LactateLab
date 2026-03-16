import { useState } from "react";
import { useAthleteData } from "../context/AthleteDataContext";
import { api } from "../../lib/api";

function formatLastSync(isoDate: string): string {
  try {
    const syncDate = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - syncDate.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Ultima sincronizacion: ahora mismo";
    if (diffMin < 60) return `Ultima sincronizacion: hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Ultima sincronizacion: hace ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    return `Ultima sincronizacion: hace ${diffD}d`;
  } catch {
    return "";
  }
}

/* ── Metric config types ──────────────────────────────────── */
type MetricToggle = {
  key: string;
  label: string;
  description: string;
  garmin: boolean;
  apple: boolean;
};

const DEFAULT_METRICS: MetricToggle[] = [
  { key: "hrv", label: "HRV nocturna", description: "Variabilidad cardíaca durante el sueño", garmin: true, apple: true },
  { key: "resting_hr", label: "FC Reposo", description: "Frecuencia cardíaca en reposo", garmin: true, apple: true },
  { key: "sleep", label: "Sueño (horas + fases)", description: "Duración total y fases de sueño", garmin: true, apple: true },
  { key: "stress", label: "Estrés diario", description: "Nivel de estrés estimado por el reloj", garmin: true, apple: false },
  { key: "body_battery", label: "Batería corporal", description: "Energía disponible estimada", garmin: true, apple: false },
  { key: "respiration", label: "Frecuencia respiratoria", description: "Respiraciones por minuto nocturnas", garmin: true, apple: true },
  { key: "spo2", label: "SpO2", description: "Saturación de oxígeno en sangre", garmin: true, apple: true },
  { key: "steps", label: "Pasos diarios", description: "Conteo de pasos acumulados", garmin: true, apple: true },
  { key: "intensity_minutes", label: "Minutos de intensidad", description: "Minutos en zonas de esfuerzo", garmin: true, apple: true },
  { key: "training_effect", label: "Training Effect", description: "Efecto aeróbico y anaeróbico de la sesión", garmin: true, apple: false },
];

export function SettingsPage() {
  const data = useAthleteData();
  const garminConnected = data.analysis?.athlete?.garmin_connected ?? false;
  const garminEmail = (data.analysis?.athlete as any)?.garmin_email ?? null;

  // Garmin connection form
  const [garminForm, setGarminForm] = useState({ email: "", password: "", mfa_code: "" });
  const [garminStep, setGarminStep] = useState<"idle" | "connecting" | "mfa" | "success" | "error">("idle");
  const [garminError, setGarminError] = useState<string | null>(null);

  // Apple Watch
  const [appleStep, setAppleStep] = useState<"idle" | "info">("idle");

  // Metric toggles
  const [metrics, setMetrics] = useState<MetricToggle[]>(DEFAULT_METRICS);

  async function handleGarminConnect() {
    if (!data.user?.athlete_id) return;
    setGarminStep("connecting");
    setGarminError(null);
    try {
      const result = await api.garminConnect(data.token, data.user.athlete_id, {
        email: garminForm.email,
        password: garminForm.password,
        ...(garminForm.mfa_code ? { mfa_code: garminForm.mfa_code } : {}),
      });
      if (result.connected) {
        setGarminStep("success");
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (msg.toLowerCase().includes("mfa") || msg.toLowerCase().includes("verification")) {
        setGarminStep("mfa");
        setGarminError("Garmin requiere verificación en dos pasos. Introduce el código.");
      } else {
        setGarminStep("error");
        setGarminError(msg);
      }
    }
  }

  function toggleMetric(key: string, source: "garmin" | "apple") {
    setMetrics((prev) =>
      prev.map((m) => m.key === key ? { ...m, [source]: !m[source] } : m),
    );
  }

  return (
    <div className="ath-page ath-settings">
      <h1 className="ath-section-title" style={{ fontSize: 18, marginBottom: 20 }}>Ajustes</h1>

      {/* ═══════ Wearable Connections ═══════ */}
      <section className="ath-settings-section">
        <h2 className="ath-section-title">Dispositivos conectados</h2>

        {/* ── Garmin ──────────────────────────────── */}
        <div className={`ath-device-card ${garminConnected || garminStep === "success" ? "connected" : ""}`}>
          <div className="ath-device-header">
            <div className="ath-device-logo garmin">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polygon points="12 6 15.09 11.5 21 12.27 16.91 16.97 17.82 22.81 12 19.77 6.18 22.81 7.09 16.97 3 12.27 8.91 11.5 12 6" fill="none" />
              </svg>
            </div>
            <div className="ath-device-info">
              <strong>Garmin Connect</strong>
              {(garminConnected || garminStep === "success") ? (
                <span className="ath-device-status connected">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Conectado{garminEmail ? ` · ${garminEmail}` : ""}
                </span>
              ) : (
                <span className="ath-device-status">No conectado</span>
              )}
            </div>
          </div>

          {!garminConnected && garminStep !== "success" && (
            <div className="ath-device-connect-form">
              {garminStep === "error" && garminError && (
                <div className="ath-device-error">{garminError}</div>
              )}

              <input
                type="email"
                className="ath-settings-input"
                placeholder="Email de Garmin Connect"
                value={garminForm.email}
                onChange={(e) => setGarminForm((f) => ({ ...f, email: e.target.value }))}
              />
              <input
                type="password"
                className="ath-settings-input"
                placeholder="Contraseña"
                value={garminForm.password}
                onChange={(e) => setGarminForm((f) => ({ ...f, password: e.target.value }))}
              />

              {garminStep === "mfa" && (
                <input
                  type="text"
                  className="ath-settings-input"
                  placeholder="Código MFA"
                  value={garminForm.mfa_code}
                  onChange={(e) => setGarminForm((f) => ({ ...f, mfa_code: e.target.value }))}
                  autoFocus
                />
              )}

              <button
                type="button"
                className="ath-settings-connect-btn"
                disabled={!garminForm.email || !garminForm.password || garminStep === "connecting"}
                onClick={handleGarminConnect}
              >
                {garminStep === "connecting" ? (
                  <span className="ath-settings-spinner" />
                ) : garminStep === "mfa" ? (
                  "Verificar código"
                ) : (
                  "Conectar Garmin"
                )}
              </button>

              <p className="ath-device-help">
                Usamos tus credenciales de Garmin Connect para sincronizar actividades, sueño, HRV y métricas de bienestar. Tus credenciales se almacenan cifradas.
              </p>
            </div>
          )}

          {(garminConnected || garminStep === "success") && (
            <div className="ath-device-connected-info">
              <div className="ath-device-syncs">
                <span>Actividades, sueño, HRV, estrés, batería corporal</span>
              </div>
              <div className="ath-device-sync-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="ath-settings-connect-btn"
                  style={{ maxWidth: 240 }}
                  disabled={data.garminSyncing}
                  onClick={() => data.triggerGarminSync()}
                >
                  {data.garminSyncing ? (
                    <><span className="ath-settings-spinner" /> Sincronizando...</>
                  ) : (
                    "Sincronizar ahora"
                  )}
                </button>
                {data.garminSyncStatus?.last_sync_at && !data.garminSyncing && (
                  <span className="ath-device-last-sync" style={{ marginLeft: 12, fontSize: 12, opacity: 0.7 }}>
                    {formatLastSync(data.garminSyncStatus.last_sync_at)}
                  </span>
                )}
                {data.garminSyncError && (
                  <div className="ath-device-error" style={{ marginTop: 6, fontSize: 12 }}>{data.garminSyncError}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Apple Watch ─────────────────────────── */}
        <div className="ath-device-card">
          <div className="ath-device-header">
            <div className="ath-device-logo apple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
            </div>
            <div className="ath-device-info">
              <strong>Apple Watch</strong>
              <span className="ath-device-status">Próximamente</span>
            </div>
          </div>

          {appleStep === "idle" && (
            <div className="ath-device-apple-cta">
              <button
                type="button"
                className="ath-settings-connect-btn apple"
                onClick={() => setAppleStep("info")}
              >
                Cómo conectar Apple Watch
              </button>
            </div>
          )}

          {appleStep === "info" && (
            <div className="ath-device-apple-info">
              <h4>Integración con Apple Watch</h4>
              <p>Apple Watch sincroniza datos de salud a través de <strong>Apple HealthKit</strong>. Para que funcione:</p>
              <ol>
                <li><strong>Descarga nuestra app iOS</strong> (en desarrollo) — necesaria para acceder a HealthKit.</li>
                <li>La app pedirá permisos para leer: FC reposo, HRV, sueño, SpO2, entrenamientos.</li>
                <li>Los datos se sincronizarán automáticamente al abrir la app.</li>
              </ol>
              <div className="ath-apple-metrics-preview">
                <h5>Métricas disponibles desde Apple Watch</h5>
                <div className="ath-apple-metric-list">
                  <span className="ath-apple-metric">HRV nocturna</span>
                  <span className="ath-apple-metric">FC Reposo</span>
                  <span className="ath-apple-metric">Sueño + fases</span>
                  <span className="ath-apple-metric">SpO2</span>
                  <span className="ath-apple-metric">Respiración</span>
                  <span className="ath-apple-metric">Entrenamientos</span>
                  <span className="ath-apple-metric">Pasos</span>
                  <span className="ath-apple-metric">Minutos de ejercicio</span>
                </div>
              </div>
              <div className="ath-apple-note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>Algunas métricas (estrés, batería corporal, Training Effect) son exclusivas de Garmin y no están disponibles en Apple Watch.</span>
              </div>
              <button type="button" className="ath-settings-link-btn" onClick={() => setAppleStep("idle")}>Entendido</button>
            </div>
          )}
        </div>
      </section>

      {/* ═══════ Metric Configuration ═══════ */}
      <section className="ath-settings-section">
        <h2 className="ath-section-title">Métricas a sincronizar</h2>
        <p className="ath-settings-desc">Elige qué datos quieres importar de cada dispositivo. Las métricas activas se mostrarán en tu panel de recuperación.</p>

        <div className="ath-metrics-table">
          <div className="ath-metrics-header">
            <span className="ath-metrics-col-label">Métrica</span>
            <span className="ath-metrics-col-source">Garmin</span>
            <span className="ath-metrics-col-source">Apple</span>
          </div>
          {metrics.map((metric) => (
            <div key={metric.key} className="ath-metrics-row">
              <div className="ath-metrics-info">
                <span className="ath-metrics-name">{metric.label}</span>
                <span className="ath-metrics-desc">{metric.description}</span>
              </div>
              <div className="ath-metrics-col-source">
                {DEFAULT_METRICS.find((d) => d.key === metric.key)?.garmin ? (
                  <button
                    type="button"
                    className={`ath-metrics-toggle ${metric.garmin ? "on" : "off"}`}
                    onClick={() => toggleMetric(metric.key, "garmin")}
                    title={metric.garmin ? "Desactivar" : "Activar"}
                  >
                    <div className="ath-metrics-toggle-knob" />
                  </button>
                ) : (
                  <span className="ath-metrics-na">—</span>
                )}
              </div>
              <div className="ath-metrics-col-source">
                {DEFAULT_METRICS.find((d) => d.key === metric.key)?.apple ? (
                  <button
                    type="button"
                    className={`ath-metrics-toggle ${metric.apple ? "on" : "off"}`}
                    onClick={() => toggleMetric(metric.key, "apple")}
                    title={metric.apple ? "Desactivar" : "Activar"}
                  >
                    <div className="ath-metrics-toggle-knob" />
                  </button>
                ) : (
                  <span className="ath-metrics-na">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ Metric Comparison: Garmin vs Apple ═══════ */}
      <section className="ath-settings-section">
        <h2 className="ath-section-title">Garmin vs Apple Watch</h2>
        <div className="ath-comparison-table">
          <div className="ath-comp-row header">
            <span>Característica</span>
            <span>Garmin</span>
            <span>Apple Watch</span>
          </div>
          <div className="ath-comp-row">
            <span>HRV nocturna</span>
            <span className="yes">Automática</span>
            <span className="yes">Automática</span>
          </div>
          <div className="ath-comp-row">
            <span>FC Reposo</span>
            <span className="yes">Continua</span>
            <span className="yes">Continua</span>
          </div>
          <div className="ath-comp-row">
            <span>Fases de sueño</span>
            <span className="yes">Deep/Light/REM/Awake</span>
            <span className="yes">Core/Deep/REM</span>
          </div>
          <div className="ath-comp-row">
            <span>Estrés</span>
            <span className="yes">0-100 continuo</span>
            <span className="no">No disponible</span>
          </div>
          <div className="ath-comp-row">
            <span>Batería corporal</span>
            <span className="yes">0-100 continuo</span>
            <span className="no">No disponible</span>
          </div>
          <div className="ath-comp-row">
            <span>Training Effect</span>
            <span className="yes">Aeróbico + Anaeróbico</span>
            <span className="no">No disponible</span>
          </div>
          <div className="ath-comp-row">
            <span>SpO2</span>
            <span className="yes">Nocturno</span>
            <span className="yes">Bajo demanda</span>
          </div>
          <div className="ath-comp-row">
            <span>Push workouts</span>
            <span className="yes">Estructurados al reloj</span>
            <span className="partial">Solo via app</span>
          </div>
          <div className="ath-comp-row">
            <span>Conexión</span>
            <span>Email + contraseña</span>
            <span>HealthKit (app iOS)</span>
          </div>
        </div>
      </section>
    </div>
  );
}
