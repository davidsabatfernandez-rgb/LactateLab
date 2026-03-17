import React, { useState } from "react";
import { api } from "../../lib/api";

/* ── Types ──────────────────────────────────────────────────── */
type Step = "input" | "connecting" | "success" | "error";

interface CalendarImportProps {
  open: boolean;
  onClose: () => void;
  athleteId: number;
  token: string;
  onConnected: () => void;
}

/* ── Component ──────────────────────────────────────────────── */
const CalendarImport: React.FC<CalendarImportProps> = ({ open, onClose, athleteId, token, onConnected }) => {
  const [step, setStep] = useState<Step>("input");
  const [icalUrl, setIcalUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const reset = () => {
    setStep("input");
    setIcalUrl("");
    setErrorMsg("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleConnect = async () => {
    const url = icalUrl.trim();
    if (!url) {
      setErrorMsg("Introduce una URL de iCal valida.");
      return;
    }
    setStep("connecting");
    setErrorMsg("");
    try {
      await api.calendarConnect(token, athleteId, url);
      setStep("success");
      onConnected();
    } catch (err: unknown) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Error al conectar el calendario.");
    }
  };

  if (!open) return null;

  return (
    <div className="ath-cal-import-backdrop" onClick={handleClose}>
      <div
        className="ath-cal-import-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ath-cal-import-header">
          <div className="ath-cal-import-header-left">
            <h2>Conectar Google Calendar</h2>
          </div>
          <button className="ath-cal-import-close" onClick={handleClose}>
            ✕
          </button>
        </div>

        <div className="ath-cal-import-body">
          {/* ── Step: Input iCal URL ────────────── */}
          {(step === "input" || step === "error") && (
            <div className="ath-cal-import-permissions">
              <div
                className="ath-cal-import-perm-icon-wrap"
                style={{ background: "rgba(66, 133, 244, 0.08)" }}
              >
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
              </div>

              <p className="ath-cal-import-perm-desc">
                Copia la <strong>direccion secreta en formato iCal</strong> desde
                los ajustes de tu Google Calendar y pegala aqui.
              </p>

              <div className="ath-cal-import-help-steps">
                <p style={{ fontSize: "0.82rem", color: "var(--ath-text-secondary)", margin: "0 0 8px" }}>
                  1. Abre <strong>Google Calendar</strong> en el navegador<br />
                  2. Ve a <strong>Configuracion</strong> (engranaje) &rarr; tu calendario<br />
                  3. Busca <strong>"Direccion secreta en formato iCal"</strong><br />
                  4. Copia la URL y pegala abajo
                </p>
              </div>

              <input
                type="url"
                className="ath-cal-import-url-input"
                placeholder="https://calendar.google.com/calendar/ical/..."
                value={icalUrl}
                onChange={(e) => setIcalUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--ath-border, #e0e0e0)",
                  fontSize: "0.9rem",
                  marginBottom: "12px",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />

              {errorMsg && (
                <p style={{ color: "#d32f2f", fontSize: "0.82rem", margin: "0 0 8px" }}>
                  {errorMsg}
                </p>
              )}

              <button
                className="ath-cal-import-connect-btn"
                style={{ background: "#4285F4" }}
                onClick={handleConnect}
              >
                Conectar calendario
              </button>

              <p className="ath-cal-import-legal">
                La URL solo se guarda en tu cuenta. No accedemos a tu cuenta de Google.
              </p>
            </div>
          )}

          {/* ── Step: Connecting ───────────────────── */}
          {step === "connecting" && (
            <div className="ath-cal-import-permissions" style={{ textAlign: "center", padding: "40px 0" }}>
              <span className="ath-cal-import-spinner" />
              <p style={{ marginTop: "16px", color: "var(--ath-text-secondary)" }}>Conectando calendario...</p>
            </div>
          )}

          {/* ── Step: Success ───────────────────────── */}
          {step === "success" && (
            <div className="ath-cal-import-success">
              <div className="ath-cal-import-success-check">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="24" fill="var(--ath-green-bg, #e8f5e9)" />
                  <path
                    d="M15 25l6 6 12-12"
                    stroke="var(--ath-green, #43a047)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <h3 className="ath-cal-import-success-title">
                Calendario conectado
              </h3>
              <p className="ath-cal-import-success-desc">
                Tus eventos de Google Calendar apareceran en la vista semanal.
                Los eventos se obtienen en cada visita (no se cachean).
              </p>

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
