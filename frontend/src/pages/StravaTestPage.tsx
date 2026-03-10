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
    if (!stravaStatus) return;

    if (stravaStatus === "connected") {
      setStatusMessage("Strava conectado correctamente para el atleta seleccionado.");
    } else {
      setStatusMessage(stravaReason ? `Error Strava: ${stravaReason}` : "No se pudo completar la conexión con Strava.");
    }

    params.delete("strava");
    params.delete("reason");
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
              <span>{selectedAthlete.strava_connected ? "Conectado" : "No conectado"}</span>
            </div>
            <div>
              <strong>Strava athlete id</strong>
              <span>{selectedAthlete.strava_athlete_id ?? "sin vincular"}</span>
            </div>
          </div>
        ) : (
          <p>No hay atletas disponibles para probar la integración.</p>
        )}
      </section>
    </div>
  );
}
