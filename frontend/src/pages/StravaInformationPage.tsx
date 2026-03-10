import { useEffect, useMemo, useState } from "react";

import { api } from "../lib/api";
import { Athlete, StravaActivitiesImportResponse } from "../types";

type StravaInformationPageProps = {
  token: string;
  athletes: Athlete[];
};

function isoDateOffset(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function disciplineLabel(value: string) {
  if (value === "running") return "Running";
  if (value === "ciclismo") return "Ciclismo";
  if (value === "cycling") return "Cycling";
  if (value === "swimming") return "Swimming";
  if (value === "triatlon") return "Triatlón";
  return value;
}

function formatDistance(distanceM: number) {
  return `${(distanceM / 1000).toFixed(2)} km`;
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes} min`;
}

function formatPace(speed?: number | null) {
  if (!speed || speed <= 0) return "n/d";
  const secondsPerKm = 1000 / speed;
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StravaInformationPage({ token, athletes }: StravaInformationPageProps) {
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(athletes[0]?.id ?? null);
  const [startDate, setStartDate] = useState(() => isoDateOffset(-14));
  const [endDate, setEndDate] = useState(() => isoDateOffset(0));
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<StravaActivitiesImportResponse | null>(null);

  useEffect(() => {
    if (!athletes.length) {
      setSelectedAthleteId(null);
      return;
    }
    setSelectedAthleteId((current) => (current && athletes.some((athlete) => athlete.id === current) ? current : athletes[0].id));
  }, [athletes]);

  useEffect(() => {
    setImportError(null);
    setImportResult(null);
  }, [selectedAthleteId]);

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === selectedAthleteId) ?? null,
    [athletes, selectedAthleteId],
  );

  async function handleImport() {
    if (!selectedAthleteId) return;
    setImporting(true);
    setImportError(null);
    try {
      const payload = (await api.stravaActivities(token, selectedAthleteId, startDate, endDate)) as StravaActivitiesImportResponse;
      setImportResult(payload);
    } catch (error) {
      setImportResult(null);
      setImportError(error instanceof Error ? error.message : "No se pudieron importar las actividades de Strava.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="hero">
        <div className="hero-main">
          <span className="eyebrow">Coach view</span>
          <h1>Strava Information</h1>
          <p>
            Pantalla base para revisar un atleta cada vez. La conexión se sigue haciendo desde el portal del atleta; aquí iremos construyendo la lectura y gestión de su información Strava.
          </p>
        </div>
      </section>

      <section className="card section-card">
        <div className="section-heading compact">
          <span className="eyebrow">Atleta</span>
          <h2 className="section-title">Selecciona qué perfil quieres revisar</h2>
        </div>
        {athletes.length ? (
          <div className="library-toolbar-main">
            <label className="library-search-shell">
              <span className="library-search-label">Atleta</span>
              <select
                className="library-search"
                value={selectedAthleteId ?? ""}
                onChange={(event) => setSelectedAthleteId(event.target.value ? Number(event.target.value) : null)}
              >
                {athletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.name} · {disciplineLabel(athlete.primary_discipline)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p>No hay atletas disponibles todavía.</p>
        )}
      </section>

      <section className="card section-card">
        <div className="section-heading compact">
          <span className="eyebrow">Vista actual</span>
          <h2 className="section-title">{selectedAthlete ? selectedAthlete.name : "Sin atleta seleccionado"}</h2>
        </div>
        {selectedAthlete ? (
          <div className="session-debug-list">
            <div>
              <strong>Disciplina principal</strong>
              <span>{disciplineLabel(selectedAthlete.primary_discipline)}</span>
            </div>
            <div>
              <strong>Estado de Strava</strong>
              <span>{selectedAthlete.strava_connected ? "Conectado" : "Pendiente de conexión"}</span>
            </div>
            <div>
              <strong>Strava athlete id</strong>
              <span>{selectedAthlete.strava_athlete_id ?? "Todavía no disponible"}</span>
            </div>
          </div>
        ) : (
          <p>Selecciona un atleta para empezar a construir esta vista.</p>
        )}
      </section>

      <section className="card section-card">
        <div className="section-heading compact">
          <span className="eyebrow">Importación manual</span>
          <h2 className="section-title">Volcado de actividades</h2>
        </div>
        <div className="session-debug-list">
          <div>
            <strong>Rango de fechas</strong>
            <div className="strava-import-grid">
              <label className="library-search-shell">
                <span className="library-search-label">Desde</span>
                <input className="library-search" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="library-search-shell">
                <span className="library-search-label">Hasta</span>
                <input className="library-search" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
              <div className="strava-import-action">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleImport}
                  disabled={!selectedAthleteId || !selectedAthlete?.strava_connected || importing || endDate < startDate}
                >
                  {importing ? "Cargando..." : "Cargar actividades"}
                </button>
              </div>
            </div>
            {!selectedAthlete?.strava_connected ? (
              <span>Este atleta todavía no tiene Strava conectado desde su portal.</span>
            ) : null}
            {endDate < startDate ? <span>La fecha final debe ser igual o posterior a la inicial.</span> : null}
          </div>
        </div>
        {importError ? <p className="error">{importError}</p> : null}
        {importResult ? (
          importResult.activities.length ? (
            <div className="strava-preview-stack">
              <div className="strava-preview-header">
                <div>
                  <span className="eyebrow">Vista previa</span>
                  <h3>Actividades encontradas</h3>
                </div>
                <strong>{importResult.imported_count} actividades</strong>
              </div>
              <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Actividad</th>
                    <th>Tipo</th>
                    <th>Duración</th>
                    <th>Distancia</th>
                    <th>Ritmo</th>
                    <th>FC media</th>
                    <th>Potencia</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.activities.map((activity) => (
                    <tr key={activity.provider_activity_id}>
                      <td>{formatDateTime(activity.started_at)}</td>
                      <td>{activity.name}</td>
                      <td>{activity.sport_type}</td>
                      <td>{formatDuration(activity.moving_time_seconds)}</td>
                      <td>{formatDistance(activity.distance_m)}</td>
                      <td>{formatPace(activity.average_speed_m_s)}</td>
                      <td>{activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : "n/d"}</td>
                      <td>{activity.average_watts ? `${Math.round(activity.average_watts)} W` : "n/d"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          ) : (
            <div className="strava-preview-empty">
              <span className="eyebrow">Vista previa</span>
              <p>No se encontraron actividades en ese rango de fechas.</p>
            </div>
          )
        ) : (
          <div className="strava-preview-empty">
            <span className="eyebrow">Vista previa</span>
            <p>Todavía no has cargado actividades para este atleta.</p>
          </div>
        )}
      </section>
    </div>
  );
}
