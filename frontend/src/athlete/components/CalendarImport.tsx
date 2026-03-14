import React, { useState } from "react";

/* ── Types ──────────────────────────────────────────────────── */
type Provider = "google" | "apple";
type Step = "select" | "permissions" | "success";

interface CalendarImportProps {
  open: boolean;
  onClose: () => void;
}

/* ── Provider data ──────────────────────────────────────────── */
const PROVIDERS: Record<
  Provider,
  { name: string; desc: string; accent: string; accentBg: string }
> = {
  google: {
    name: "Google Calendar",
    desc: "Sincroniza entrenamientos y eventos de tu cuenta de Google.",
    accent: "#4285F4",
    accentBg: "rgba(66, 133, 244, 0.08)",
  },
  apple: {
    name: "Apple Calendar",
    desc: "Importa eventos desde iCloud y calendarios locales de Apple.",
    accent: "#1A1A2E",
    accentBg: "rgba(26, 26, 46, 0.06)",
  },
};

const PERMISSIONS = [
  { id: "read", label: "Leer eventos existentes", defaultOn: true },
  { id: "write", label: "Crear sesiones de entrenamiento", defaultOn: true },
  { id: "reminders", label: "Enviar recordatorios antes de sesiones", defaultOn: false },
  { id: "availability", label: "Consultar disponibilidad horaria", defaultOn: false },
];

/* ── Icons (inline SVG) ─────────────────────────────────────── */
const GoogleIcon = () => (
  <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
    <path
      d="M43.6 20.1H42V20H24v8h11.3C33.8 33.3 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 5.7 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z"
      fill="#FFC107"
    />
    <path
      d="M6.3 14.7l6.6 4.8C14.5 15.5 18.8 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 5.7 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      fill="#FF3D00"
    />
    <path
      d="M24 44c5.2 0 9.9-1.6 13.4-4.4l-6.2-5.2C29.2 36 26.7 36.8 24 36.8c-5.3 0-9.8-3.5-11.4-8.3l-6.5 5C9.5 39.6 16.2 44 24 44z"
      fill="#4CAF50"
    />
    <path
      d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"
      fill="#1976D2"
    />
  </svg>
);

const AppleIcon = () => (
  <svg width="32" height="32" viewBox="0 0 384 512" fill="currentColor">
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-27.1-46.9-42.6-83.8-46.4-35.7-3.7-74.6 21-88.8 21-15 0-49.1-19.8-74.5-19.8C67.5 139.5 0 183.8 0 273.2c0 26.3 4.8 53.6 14.4 81.9 12.8 37.6 59 129.6 107.2 128 25.1-.6 42.8-18 74.5-18s46.3 18 77.9 17.4c49.4-.8 90.2-82.4 102.6-120.1-65.8-31.1-64-90.4-63.9-93.7zm-59.3-187.8C280 49.6 269 12.1 267.3 0c-30.5 1.6-66 20.2-85.7 43.6-18.2 21.5-34.7 56.6-30 89.3 33.2 2.6 67.3-17.2 87.8-52z" />
  </svg>
);

/* ── Component ──────────────────────────────────────────────── */
const CalendarImport: React.FC<CalendarImportProps> = ({ open, onClose }) => {
  const [step, setStep] = useState<Step>("select");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [connecting, setConnecting] = useState(false);

  const reset = () => {
    setStep("select");
    setProvider(null);
    setPerms({});
    setConnecting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const selectProvider = (p: Provider) => {
    setProvider(p);
    const defaults: Record<string, boolean> = {};
    PERMISSIONS.forEach((perm) => {
      defaults[perm.id] = perm.defaultOn;
    });
    setPerms(defaults);
    setStep("permissions");
  };

  const handleConnect = () => {
    setConnecting(true);
    // Simulate connection delay
    setTimeout(() => {
      setConnecting(false);
      setStep("success");
    }, 1500);
  };

  const togglePerm = (id: string) => {
    setPerms((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!open) return null;

  const prov = provider ? PROVIDERS[provider] : null;

  return (
    <div className="ath-cal-import-backdrop" onClick={handleClose}>
      <div
        className="ath-cal-import-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ath-cal-import-header">
          <div className="ath-cal-import-header-left">
            {step !== "select" && (
              <button
                className="ath-cal-import-back"
                onClick={() => (step === "permissions" ? reset() : setStep("permissions"))}
              >
                ←
              </button>
            )}
            <h2>
              {step === "select" && "Conectar calendario"}
              {step === "permissions" && `Conectar ${prov?.name}`}
              {step === "success" && "Conectado"}
            </h2>
          </div>
          <button className="ath-cal-import-close" onClick={handleClose}>
            ✕
          </button>
        </div>

        <div className="ath-cal-import-body">
          {/* ── Step 1: Provider selection ────────────── */}
          {step === "select" && (
            <div className="ath-cal-import-providers">
              <p className="ath-cal-import-subtitle">
                Conecta tu calendario para sincronizar entrenamientos
                y gestionar tu disponibilidad.
              </p>

              {(["google", "apple"] as Provider[]).map((p) => {
                const info = PROVIDERS[p];
                return (
                  <button
                    key={p}
                    className="ath-cal-import-provider-card"
                    onClick={() => selectProvider(p)}
                  >
                    <div
                      className="ath-cal-import-provider-icon"
                      style={{ background: info.accentBg }}
                    >
                      {p === "google" ? <GoogleIcon /> : <AppleIcon />}
                    </div>
                    <div className="ath-cal-import-provider-info">
                      <span className="ath-cal-import-provider-name">
                        {info.name}
                      </span>
                      <span className="ath-cal-import-provider-desc">
                        {info.desc}
                      </span>
                    </div>
                    <span className="ath-cal-import-provider-arrow">→</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Step 2: Permissions ───────────────────── */}
          {step === "permissions" && prov && (
            <div className="ath-cal-import-permissions">
              <div
                className="ath-cal-import-perm-icon-wrap"
                style={{ background: prov.accentBg }}
              >
                {provider === "google" ? <GoogleIcon /> : <AppleIcon />}
              </div>
              <p className="ath-cal-import-perm-desc">
                Selecciona los permisos que quieres conceder a Lactate Lab
                para {prov.name}.
              </p>

              <div className="ath-cal-import-perm-list">
                {PERMISSIONS.map((perm) => (
                  <label key={perm.id} className="ath-cal-import-perm-item">
                    <div className="ath-cal-import-checkbox-wrap">
                      <input
                        type="checkbox"
                        checked={perms[perm.id] ?? false}
                        onChange={() => togglePerm(perm.id)}
                      />
                      <span className="ath-cal-import-checkbox-custom" />
                    </div>
                    <span>{perm.label}</span>
                  </label>
                ))}
              </div>

              <button
                className="ath-cal-import-connect-btn"
                style={{ background: prov.accent }}
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? (
                  <span className="ath-cal-import-spinner" />
                ) : (
                  `Conectar ${prov.name}`
                )}
              </button>

              <p className="ath-cal-import-legal">
                Al conectar aceptas que Lactate Lab acceda a tus datos de
                calendario de acuerdo con nuestra{" "}
                <span className="ath-cal-import-link">
                  pol&iacute;tica de privacidad
                </span>
                .
              </p>
            </div>
          )}

          {/* ── Step 3: Success ───────────────────────── */}
          {step === "success" && prov && (
            <div className="ath-cal-import-success">
              <div className="ath-cal-import-success-check">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="24" fill="var(--ath-green-bg)" />
                  <path
                    d="M15 25l6 6 12-12"
                    stroke="var(--ath-green)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <h3 className="ath-cal-import-success-title">
                {prov.name} conectado
              </h3>
              <p className="ath-cal-import-success-desc">
                Tu calendario se sincronizara automaticamente. Los cambios
                pueden tardar unos minutos en aparecer.
              </p>

              <div className="ath-cal-import-sync-options">
                <div className="ath-cal-import-sync-row">
                  <span>Sincronizar cada</span>
                  <select className="ath-cal-import-sync-select">
                    <option>15 minutos</option>
                    <option>30 minutos</option>
                    <option>1 hora</option>
                    <option>Manual</option>
                  </select>
                </div>
                <div className="ath-cal-import-sync-row">
                  <span>Notificar cambios</span>
                  <button className="ath-cal-import-toggle active">
                    <span className="ath-cal-import-toggle-knob" />
                  </button>
                </div>
              </div>

              <button
                className="ath-cal-import-done-btn"
                onClick={handleClose}
              >
                Listo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalendarImport;
