import { useState, useMemo } from "react";
import { useAthleteData } from "../context/AthleteDataContext";
import { api } from "../../lib/api";
import { type PlanTier, PLAN_FEATURES, PLAN_HIERARCHY } from "../../types";

/* ── Plan change modal ──────────────────────────────────── */
type PlanModalProps = {
  targetTier: PlanTier;
  currentTier: PlanTier;
  onClose: () => void;
  onConfirm: (tier: PlanTier) => void;
  updating: boolean;
};

const PLAN_PRICES: Record<PlanTier, number> = {
  free: 0, lactate: 7.99, pro: 19.99, pro_plus: 39.99, elite: 199,
};

const PLAN_COLORS: Record<PlanTier, string> = {
  free: "#9ca3af", lactate: "#22c55e", pro: "#3b82f6", pro_plus: "#d26a36", elite: "#d4af37",
};

const PLAN_DESCRIPTIONS: Record<PlanTier, string> = {
  free: "Acceso básico para empezar. Ve tu día, tu semana y tus objetivos.",
  lactate: "Analiza tus tests de lactato, obtén umbrales reales y zonas basadas en tu fisiología.",
  pro: "Planificación inteligente, seguimiento de progreso y recuperación. Todo basado en tus umbrales.",
  pro_plus: "Todo de Pro con soporte para hasta 3 disciplinas. Ideal para triatletas y multideportistas.",
  elite: "Tu especialista dedicado. Revisión personal de cada test, contacto directo y plan 100% personalizado.",
};

const PLAN_ALL_FEATURES: Record<PlanTier, string[]> = {
  free: ["Panel de hoy", "Vista semanal", "Objetivos", "1 disciplina", "Conexión Garmin/Apple"],
  lactate: ["Todo de Gratis", "Laboratorio de lactato ilimitado", "Umbrales dinámicos LT1/LT2", "Zonas de entrenamiento personalizadas", "Curva de lactato interactiva", "Tests ilimitados"],
  pro: ["Todo de Lactate Lab", "Planificación de mesociclos", "Motor fisiológico completo", "Seguimiento de progreso", "Panel de recuperación", "Métricas avanzadas"],
  pro_plus: ["Todo de Pro", "Hasta 3 disciplinas", "Umbrales cruzados (ej. running→ciclismo)", "Planificación multideporte"],
  elite: ["Todo ilimitado", "Especialista dedicado", "Revisión personal de cada test", "Contacto directo (WhatsApp/email)", "Plan 100% personalizado", "Prioridad en soporte"],
};

/* Demo lactate curve data for Lactate Lab preview */
const DEMO_LACTATE = [
  { pace: "6:00", lactate: 0.9, hr: 128 },
  { pace: "5:40", lactate: 1.1, hr: 138 },
  { pace: "5:20", lactate: 1.4, hr: 147 },
  { pace: "5:00", lactate: 1.8, hr: 155 },
  { pace: "4:45", lactate: 2.3, hr: 163 },
  { pace: "4:30", lactate: 3.1, hr: 170 },
  { pace: "4:15", lactate: 4.2, hr: 176 },
  { pace: "4:00", lactate: 6.1, hr: 183 },
  { pace: "3:50", lactate: 8.8, hr: 189 },
];

function DemoLactateCurve() {
  const W = 320, H = 180, pad = { top: 20, right: 20, bottom: 30, left: 36 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;
  const maxL = 10;

  const points = DEMO_LACTATE.map((d, i) => ({
    x: pad.left + (i / (DEMO_LACTATE.length - 1)) * cW,
    y: pad.top + cH - (d.lactate / maxL) * cH,
    ...d,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = pathD + ` L ${points[points.length - 1].x} ${pad.top + cH} L ${points[0].x} ${pad.top + cH} Z`;

  // LT1 and LT2 lines
  const lt1Y = pad.top + cH - (1.8 / maxL) * cH;
  const lt2Y = pad.top + cH - (3.1 / maxL) * cH;

  return (
    <div className="plan-modal__demo-curve">
      <div className="plan-modal__demo-label">Ejemplo: curva de lactato</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }}>
        <defs>
          <linearGradient id="demoGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[2, 4, 6, 8].map((v) => {
          const y = pad.top + cH - (v / maxL) * cH;
          return <g key={v}>
            <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#e5e7eb" strokeWidth="0.5" />
            <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize="8" fill="#9ca3af">{v}</text>
          </g>;
        })}
        {/* Area + line */}
        <path d={areaD} fill="url(#demoGrad)" />
        <path d={pathD} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round" />
        {/* LT1 / LT2 */}
        <line x1={pad.left} y1={lt1Y} x2={W - pad.right} y2={lt1Y} stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 3" />
        <text x={W - pad.right + 2} y={lt1Y + 3} fontSize="7" fill="#3b82f6" fontWeight="600">LT1</text>
        <line x1={pad.left} y1={lt2Y} x2={W - pad.right} y2={lt2Y} stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" />
        <text x={W - pad.right + 2} y={lt2Y + 3} fontSize="7" fill="#ef4444" fontWeight="600">LT2</text>
        {/* Points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#22c55e" stroke="#fff" strokeWidth="1.5" />
            <text x={p.x} y={pad.top + cH + 14} textAnchor="middle" fontSize="7" fill="#9ca3af">{p.pace}</text>
          </g>
        ))}
        {/* Axis labels */}
        <text x={pad.left - 4} y={pad.top - 6} fontSize="7" fill="#6b7280" textAnchor="end">mmol/L</text>
        <text x={W / 2} y={H - 2} fontSize="7" fill="#6b7280" textAnchor="middle">Ritmo (min/km)</text>
      </svg>
      <div className="plan-modal__demo-thresholds">
        <span className="plan-modal__demo-th" style={{ color: "#3b82f6" }}>LT1: 5:00/km · 1.8 mmol</span>
        <span className="plan-modal__demo-th" style={{ color: "#ef4444" }}>LT2: 4:30/km · 3.1 mmol</span>
      </div>
    </div>
  );
}

function PlanChangeModal({ targetTier, currentTier, onClose, onConfirm, updating }: PlanModalProps) {
  const isUpgrade = PLAN_HIERARCHY.indexOf(targetTier) > PLAN_HIERARCHY.indexOf(currentTier);
  const isDowngrade = PLAN_HIERARCHY.indexOf(targetTier) < PLAN_HIERARCHY.indexOf(currentTier);
  const targetPrice = PLAN_PRICES[targetTier];
  const currentPrice = PLAN_PRICES[currentTier];
  const diff = targetPrice - currentPrice;
  const features = PLAN_ALL_FEATURES[targetTier];
  const targetName = PLAN_FEATURES[targetTier].name;
  const color = PLAN_COLORS[targetTier];

  return (
    <div className="plan-modal__overlay" onClick={onClose}>
      <div className="plan-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="plan-modal__close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        {/* Header */}
        <div className="plan-modal__header" style={{ borderColor: color }}>
          <span className="plan-modal__tier-badge" style={{ background: color, color: targetTier === "elite" ? "#d4af37" : "#fff", backgroundColor: targetTier === "elite" ? "#1a2f38" : color }}>
            {targetName}
          </span>
          <div className="plan-modal__price">
            {targetPrice > 0 ? (
              <><span className="plan-modal__price-value">{targetPrice}€</span><span className="plan-modal__price-period">/mes</span></>
            ) : (
              <span className="plan-modal__price-value">Gratis</span>
            )}
          </div>
          <p className="plan-modal__desc">{PLAN_DESCRIPTIONS[targetTier]}</p>
        </div>

        {/* Demo curve for lactate plan */}
        {targetTier === "lactate" && <DemoLactateCurve />}

        {/* Features */}
        <div className="plan-modal__features">
          <h4>Incluido en {targetName}</h4>
          <ul>
            {features.map((f, i) => (
              <li key={i}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Price change summary */}
        {isUpgrade && currentPrice > 0 && (
          <div className="plan-modal__price-change">
            <span>Cambio de precio</span>
            <span className="plan-modal__price-diff">+{diff.toFixed(2)}€/mes</span>
          </div>
        )}
        {isDowngrade && (
          <div className="plan-modal__price-change plan-modal__price-change--down">
            <span>Ahorro mensual</span>
            <span className="plan-modal__price-diff plan-modal__price-diff--down">{diff.toFixed(2)}€/mes</span>
          </div>
        )}

        {/* Downgrade warning */}
        {isDowngrade && (
          <div className="plan-modal__warning">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Al bajar de plan perderás acceso a algunas funcionalidades al final del periodo de facturación actual.</span>
          </div>
        )}

        {/* CTA */}
        <button
          type="button"
          className="plan-modal__cta"
          style={{ background: color, color: targetTier === "elite" ? "#d4af37" : "#fff", backgroundColor: targetTier === "elite" ? "#1a2f38" : color }}
          disabled={updating}
          onClick={() => onConfirm(targetTier)}
        >
          {updating ? "Procesando..." : isDowngrade ? "Confirmar cambio" : targetPrice === 0 ? "Cambiar a Gratis" : `Activar ${targetName} — ${targetPrice}€/mes`}
        </button>

        {targetPrice > 0 && (
          <p className="plan-modal__legal">
            Se te cobrará {targetPrice}€/mes. Puedes cancelar en cualquier momento desde esta página.
          </p>
        )}
      </div>
    </div>
  );
}

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

function PhysiologicalSettings({ athleteId, token, initialHrMax }: { athleteId: number; token: string; initialHrMax: number | null }) {
  const [hrMax, setHrMax] = useState(initialHrMax?.toString() ?? "");
  const [saved, setSaved] = useState(false);

  async function saveHrMax() {
    const v = parseInt(hrMax, 10);
    try {
      await api.updateAthlete(token, athleteId, { training_hr_max: isNaN(v) ? null : v });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save HR max:", e);
    }
  }

  return (
    <section className="ath-settings-section">
      <h2 className="ath-section-title">Datos fisiológicos</h2>
      <p className="ath-settings-desc">Tu frecuencia cardíaca máxima se usa para escalar las gráficas de lactato y personalizar las zonas.</p>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", maxWidth: 280 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>FC Máxima (bpm)</span>
          <input
            type="number"
            className="ath-settings-input"
            min="100"
            max="230"
            placeholder="ej. 195"
            value={hrMax}
            onChange={(e) => setHrMax(e.target.value)}
            onBlur={saveHrMax}
          />
        </label>
        {saved && <span style={{ fontSize: 12, color: "var(--ath-green, #22c55e)", paddingBottom: 6 }}>Guardado</span>}
      </div>
    </section>
  );
}

export function SettingsPage() {
  const data = useAthleteData();
  const garminConnected = data.analysis?.athlete?.garmin_connected ?? false;
  const garminEmail = (data.analysis?.athlete as any)?.garmin_email ?? null;

  // Garmin connection form
  const [garminForm, setGarminForm] = useState({ email: "", password: "", mfa_code: "" });
  const [garminStep, setGarminStep] = useState<"idle" | "connecting" | "mfa" | "success" | "error">("idle");
  const [garminError, setGarminError] = useState<string | null>(null);

  // Apple Health
  const appleHealthConnected = data.health?.providers?.find((p: any) => p.provider === "apple_health")?.connected ?? false;
  const appleLastSync = data.health?.providers?.find((p: any) => p.provider === "apple_health")?.last_sync_at ?? null;
  const [appleStep, setAppleStep] = useState<"idle" | "connecting" | "connected" | "info" | "error">(appleHealthConnected ? "connected" : "idle");
  const [appleError, setAppleError] = useState<string | null>(null);

  // Metric toggles
  const [metrics, setMetrics] = useState<MetricToggle[]>(DEFAULT_METRICS);

  // Plan management
  const currentPlan = (data.user?.plan_tier || "free") as PlanTier;
  const [planUpdating, setPlanUpdating] = useState(false);
  const [planModal, setPlanModal] = useState<PlanTier | null>(null);

  async function handlePlanConfirm(tier: PlanTier) {
    if (tier === currentPlan || !data.token) return;
    setPlanUpdating(true);
    try {
      await api.updatePlan(data.token, tier);
      window.location.reload();
    } catch (e: any) {
      console.error("Plan update failed:", e);
      setPlanUpdating(false);
    }
  }

  async function handleGarminConnect() {
    if (!data.user?.athlete_id) return;
    const wasMfa = garminStep === "mfa";
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
      const lmsg = msg.toLowerCase();
      if (lmsg.includes("mfa") || lmsg.includes("verification") || lmsg.includes("verificación")) {
        setGarminStep("mfa");
        if (wasMfa && garminForm.mfa_code) {
          setGarminError("El código no funcionó. Garmin envía un código nuevo cada intento — usa el último código recibido por email.");
        } else {
          setGarminError("Garmin requiere verificación. Revisa tu email para obtener el código.");
        }
        return;
      } else if (lmsg.includes("garmin connect activado") || lmsg.includes("configuración inicial")) {
        setGarminStep("error");
        setGarminError("Tu cuenta de Garmin no tiene Garmin Connect configurado. Entra en connect.garmin.com desde un navegador, inicia sesión y completa la configuración. Después vuelve aquí e inténtalo de nuevo.");
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

      {/* ═══════ Plan Management ═══════ */}
      <section className="ath-settings-section">
        <h2 className="ath-section-title">Tu plan</h2>

        <div className="ath-plan-current" style={{ borderLeftColor: PLAN_COLORS[currentPlan] }}>
          <span className={`ath-plan-badge ath-plan-badge--${currentPlan}`}>
            {PLAN_FEATURES[currentPlan]?.name ?? "Gratis"}
          </span>
          <div className="ath-plan-info">
            <strong>{PLAN_PRICES[currentPlan] > 0 ? `${PLAN_PRICES[currentPlan]}€/mes` : "Gratis"}</strong>
            <span>{currentPlan === "free" ? "Actualiza para desbloquear más funcionalidades" : "Plan activo"}</span>
          </div>
        </div>

        <div className="ath-plan-strip">
          {PLAN_HIERARCHY.map((tier) => {
            const isCurrent = tier === currentPlan;
            const name = PLAN_FEATURES[tier].name;
            const price = PLAN_PRICES[tier];
            const color = PLAN_COLORS[tier];
            const tierIdx = PLAN_HIERARCHY.indexOf(tier);
            const currentIdx = PLAN_HIERARCHY.indexOf(currentPlan);
            const isUpgrade = tierIdx > currentIdx;
            const isElite = tier === "elite";

            return (
              <button
                key={tier}
                type="button"
                className={`ath-plan-chip ${isCurrent ? "ath-plan-chip--active" : ""} ${isElite ? "ath-plan-chip--elite" : ""}`}
                style={{ "--chip-color": color } as React.CSSProperties}
                onClick={() => !isCurrent && setPlanModal(tier)}
              >
                <span className="ath-plan-chip__name">{name}</span>
                <span className="ath-plan-chip__price">{price > 0 ? `${price}€` : "Gratis"}</span>
                {isCurrent && <span className="ath-plan-chip__tag">Actual</span>}
                {!isCurrent && isUpgrade && <span className="ath-plan-chip__arrow">&#8599;</span>}
              </button>
            );
          })}
        </div>
      </section>

      {/* Plan change modal */}
      {planModal && (
        <PlanChangeModal
          targetTier={planModal}
          currentTier={currentPlan}
          onClose={() => setPlanModal(null)}
          onConfirm={handlePlanConfirm}
          updating={planUpdating}
        />
      )}

      {/* ═══════ Physiological Settings ═══════ */}
      {data.user?.athlete_id && data.token && (
        <PhysiologicalSettings
          athleteId={data.user.athlete_id}
          token={data.token}
          initialHrMax={data.analysis?.athlete?.training_hr_max ?? null}
        />
      )}

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
              {(garminStep === "error" || garminStep === "mfa") && garminError && (
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

              {(garminStep === "mfa" || (garminStep === "connecting" && garminForm.mfa_code)) && (
                <>
                  <div className="ath-device-mfa-help">
                    <p><strong>Garmin requiere verificación en dos pasos.</strong></p>
                    <p>Revisa tu email ({garminForm.email}) o tu app de autenticación (Google Authenticator, Authy, etc.) para obtener el código.</p>
                    <p style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>Si no tienes acceso al código, puedes desactivar la verificación en dos pasos desde la app de Garmin Connect en tu móvil (Ajustes &gt; Seguridad).</p>
                  </div>
                  <input
                    type="text"
                    className="ath-settings-input"
                    placeholder="Código de verificación"
                    value={garminForm.mfa_code}
                    onChange={(e) => setGarminForm((f) => ({ ...f, mfa_code: e.target.value }))}
                    autoFocus
                  />
                </>
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

        {/* ── Apple Health ─────────────────────────── */}
        <div className="ath-device-card">
          <div className="ath-device-header">
            <div className="ath-device-logo apple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
            </div>
            <div className="ath-device-info">
              <strong>Apple Health</strong>
              <span className={`ath-device-status ${appleHealthConnected ? "connected" : ""}`}>
                {appleHealthConnected ? "Conectado" : "No conectado"}
              </span>
              {appleHealthConnected && appleLastSync && (
                <span className="ath-device-sync-time">{formatLastSync(appleLastSync)}</span>
              )}
            </div>
          </div>

          {!appleHealthConnected && appleStep === "idle" && (
            <div className="ath-device-apple-cta">
              <button
                type="button"
                className="ath-settings-connect-btn apple"
                onClick={async () => {
                  setAppleStep("connecting");
                  setAppleError(null);
                  try {
                    const { isAvailable, requestAuthorization, readHealthData } = await import("../../lib/healthkit");
                    if (!(await isAvailable())) {
                      setAppleError("Apple Health no esta disponible en este dispositivo. Necesitas un iPhone con la app instalada.");
                      setAppleStep("error");
                      return;
                    }
                    const granted = await requestAuthorization();
                    if (!granted) {
                      setAppleError("No se otorgaron permisos. Ve a Ajustes > Salud > Acceso a datos para habilitarlos.");
                      setAppleStep("error");
                      return;
                    }
                    const samples = await readHealthData(7);
                    if (samples.length > 0 && data.user?.athlete_id) {
                      await api.appleHealthSync(data.token, data.user.athlete_id, samples);
                    }
                    setAppleStep("connected");
                    data.refreshHealth();
                  } catch (e: any) {
                    setAppleError(e?.message ?? "Error conectando Apple Health");
                    setAppleStep("error");
                  }
                }}
              >
Conectar Apple Health
              </button>
              <p className="ath-device-apple-hint">Se sincronizaran automaticamente: HRV, FC reposo, sueno, SpO2, pasos y mas.</p>
            </div>
          )}

          {appleStep === "error" && (
            <div className="ath-device-apple-cta">
              {appleError && <p className="ath-garmin-error">{appleError}</p>}
              <button type="button" className="ath-settings-link-btn" onClick={() => setAppleStep("idle")}>Reintentar</button>
            </div>
          )}

          {(appleHealthConnected || appleStep === "connected") && (
            <div className="ath-device-apple-info">
              <div className="ath-apple-metrics-preview">
                <h5>Metricas sincronizadas</h5>
                <div className="ath-apple-metric-list">
                  <span className="ath-apple-metric">HRV nocturna</span>
                  <span className="ath-apple-metric">FC Reposo</span>
                  <span className="ath-apple-metric">Sueno + fases</span>
                  <span className="ath-apple-metric">SpO2</span>
                  <span className="ath-apple-metric">Respiracion</span>
                  <span className="ath-apple-metric">VO2max</span>
                  <span className="ath-apple-metric">Pasos</span>
                  <span className="ath-apple-metric">Minutos de ejercicio</span>
                </div>
              </div>
              <div className="ath-apple-note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>Estres, bateria corporal y Training Effect son exclusivos de Garmin. Usamos tu HRV como proxy de estres autonomico.</span>
              </div>
              <button
                type="button"
                className="ath-settings-link-btn ath-settings-link-btn--danger"
                onClick={async () => {
                  if (data.user?.athlete_id) {
                    await api.appleHealthDisconnect(data.token, data.user.athlete_id);
                    setAppleStep("idle");
                    data.refreshHealth();
                  }
                }}
              >
                Desconectar Apple Health
              </button>
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
