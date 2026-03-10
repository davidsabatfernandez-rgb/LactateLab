import { useEffect, useMemo, useState } from "react";

import { api } from "../lib/api";
import { Athlete } from "../types";

type StravaTestPageProps = {
  token: string;
  athletes: Athlete[];
};

export function StravaTestPage({ token, athletes }: StravaTestPageProps) {
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(athletes[0]?.id ?? null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [submittingManualConnect, setSubmittingManualConnect] = useState(false);
  const [manualConnectedAthleteId, setManualConnectedAthleteId] = useState<number | null>(null);
  const [manualStravaAthleteId, setManualStravaAthleteId] = useState<number | null>(null);

  useEffect(() => {
    if (!athletes.length) {
      setSelectedAthleteId(null);
      return;
    }
    setSelectedAthleteId((current) => (current && athletes.some((athlete) => athlete.id === current) ? current : athletes[0].id));
  }, [athletes]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stravaStatus = params.get("strava");
    const stravaReason = params.get("reason");
    const returnedCode = params.get("code");
    if (!stravaStatus) return;

    if (stravaStatus === "connected") {
      setStatusMessage("Strava conectado correctamente para el atleta seleccionado.");
    } else {
      setStatusMessage(stravaReason ? `Error Strava: ${stravaReason}` : "No se pudo completar la conexión con Strava.");
    }
    if (returnedCode) {
      setManualCode(returnedCode);
    }

    params.delete("strava");
    params.delete("reason");
    params.delete("code");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === selectedAthleteId) ?? null,
    [athletes, selectedAthleteId],
  );

  async function handleConnect() {
    if (!selectedAthleteId) return;
    setRedirecting(true);
    setStatusMessage(null);
    try {
      const payload = await api.stravaConnectStart(token, {
        athleteId: selectedAthleteId,
        returnPath: "/strava-test",
      });
      window.location.assign(payload.authorize_url);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "No se pudo iniciar la conexión con Strava.");
      setRedirecting(false);
    }
  }

  async function handleManualConnect() {
    if (!manualCode.trim() || !selectedAthleteId) return;
    setSubmittingManualConnect(true);
    setStatusMessage(null);
    try {
      const payload = await api.stravaTestConnect(token, {
        code: manualCode.trim(),
        athleteId: selectedAthleteId,
      });
      setManualConnectedAthleteId(payload.athlete_id);
      setManualStravaAthleteId(payload.strava_athlete_id);
      setStatusMessage("Strava conectado manualmente para test. Ya puedes validar el vínculo.");
      setManualCode("");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "No se pudo completar la conexión manual con Strava.");
    } finally {
      setSubmittingManualConnect(false);
    }
  }

  const resolvedStravaConnected =
    selectedAthlete && manualConnectedAthleteId === selectedAthlete.id ? true : selectedAthlete?.strava_connected ?? false;
  const resolvedStravaAthleteId =
    selectedAthlete && manualConnectedAthleteId === selectedAthlete.id
      ? manualStravaAthleteId
      : selectedAthlete?.strava_athlete_id ?? null;

  return (
    <div className="page-grid">
      <section className="hero">
        <div className="hero-main">
          <span className="eyebrow">Integración provisional</span>
          <h1>Strava test</h1>
          <p>
            Pantalla temporal para lanzar OAuth de Strava desde la cuenta coach, elegir atleta y ver el resultado del callback sin pasar por el portal atleta.
          </p>
        </div>
      </section>

      <section className="card section-card">
        <div className="library-toolbar-main">
          <label className="library-search-shell">
            <span className="library-search-label">Atleta a vincular</span>
            <select
              className="library-search"
              value={selectedAthleteId ?? ""}
              onChange={(event) => setSelectedAthleteId(event.target.value ? Number(event.target.value) : null)}
            >
              {athletes.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.name} · {athlete.primary_discipline}
                </option>
              ))}
            </select>
          </label>
          <div className="session-debug-actions">
            <button type="button" className="primary-button" onClick={handleConnect} disabled={!selectedAthleteId || redirecting}>
              {redirecting ? "Redirigiendo..." : "Conectar con Strava"}
            </button>
          </div>
        </div>
        {statusMessage ? <p className="error">{statusMessage}</p> : null}
      </section>

      <section className="card section-card">
        <span className="eyebrow">Fallback manual</span>
        <h2>Finalizar con code de Strava</h2>
        <p>
          Si el callback devuelve <code>Invalid Strava OAuth state</code>, pega aquí el <code>code</code> recibido para completar la vinculación de forma provisional.
        </p>
        <div className="library-toolbar-main">
          <label className="library-search-shell" style={{ flex: 1 }}>
            <span className="library-search-label">Code OAuth</span>
            <input
              className="library-search"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="Pega aquí el code que devuelve Strava"
            />
          </label>
          <div className="session-debug-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleManualConnect}
              disabled={!selectedAthleteId || !manualCode.trim() || submittingManualConnect}
            >
              {submittingManualConnect ? "Conectando..." : "Completar conexión manual"}
            </button>
          </div>
        </div>
      </section>

      <section className="card section-card">
        <span className="eyebrow">Estado actual</span>
        {selectedAthlete ? (
          <div className="session-debug-list">
            <div>
              <strong>Atleta</strong>
              <span>{selectedAthlete.name}</span>
            </div>
            <div>
              <strong>ID</strong>
              <span>{selectedAthlete.id}</span>
            </div>
            <div>
              <strong>Strava</strong>
              <span>{resolvedStravaConnected ? "Conectado" : "No conectado"}</span>
            </div>
            <div>
              <strong>Strava athlete id</strong>
              <span>{resolvedStravaAthleteId ?? "sin vincular"}</span>
            </div>
          </div>
        ) : (
          <p>No hay atletas disponibles para probar la integración.</p>
        )}
      </section>
    </div>
  );
}
