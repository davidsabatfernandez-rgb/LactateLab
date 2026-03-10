import { useEffect, useMemo, useState } from "react";

import { api } from "../lib/api";
import { Athlete, StravaActivitiesImportResponse, StravaActivity } from "../types";

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
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${seconds}s`;
  return `${seconds}s`;
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

function formatNumber(value?: number | null, suffix = "", digits = 0) {
  if (value === undefined || value === null) return "n/d";
  return `${value.toFixed(digits)}${suffix}`;
}

function streamSummary(activity: StravaActivity) {
  return Object.entries(activity.streams ?? {}).map(([key, value]) => ({
    key,
    points: Array.isArray(value.data) ? value.data.length : 0,
    resolution: value.resolution ?? "n/d",
    seriesType: value.series_type ?? "n/d",
  }));
}

function normalizeActivity(activity: StravaActivity): StravaActivity {
  return {
    ...activity,
    laps: Array.isArray(activity.laps) ? activity.laps : [],
    zones: Array.isArray(activity.zones) ? activity.zones : [],
    streams: activity.streams && typeof activity.streams === "object" ? activity.streams : {},
    raw_detail: activity.raw_detail && typeof activity.raw_detail === "object" ? activity.raw_detail : {},
  };
}

export function StravaInformationPage({ token, athletes }: StravaInformationPageProps) {
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(athletes[0]?.id ?? null);
  const [startDate, setStartDate] = useState(() => isoDateOffset(-14));
  const [endDate, setEndDate] = useState(() => isoDateOffset(0));
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<StravaActivitiesImportResponse | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);

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
    setSelectedActivityId(null);
  }, [selectedAthleteId]);

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === selectedAthleteId) ?? null,
    [athletes, selectedAthleteId],
  );

  const selectedActivity = useMemo(
    () => importResult?.activities.find((activity) => activity.provider_activity_id === selectedActivityId) ?? importResult?.activities[0] ?? null,
    [importResult, selectedActivityId],
  );

  const selectedActivityJson = useMemo(
    () => (selectedActivity ? JSON.stringify(selectedActivity, null, 2) : null),
    [selectedActivity],
  );
  const selectedActivityLaps = selectedActivity?.laps ?? [];
  const selectedActivityZones = selectedActivity?.zones ?? [];
  const selectedActivityStreams = selectedActivity?.streams ?? {};

  async function handleImport() {
    if (!selectedAthleteId) return;
    setImporting(true);
    setImportError(null);
    try {
      const payload = (await api.stravaActivities(token, selectedAthleteId, startDate, endDate)) as StravaActivitiesImportResponse;
      const normalizedPayload: StravaActivitiesImportResponse = {
        ...payload,
        activities: Array.isArray(payload.activities) ? payload.activities.map((activity) => normalizeActivity(activity as StravaActivity)) : [],
      };
      setImportResult(normalizedPayload);
      setSelectedActivityId(normalizedPayload.activities[0]?.provider_activity_id ?? null);
    } catch (error) {
      setImportResult(null);
      setSelectedActivityId(null);
      setImportError(error instanceof Error ? error.message : "No se pudieron cargar las actividades de Strava.");
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
            Carga actividades completas del atleta, revisa su resumen visual y entra al detalle de cada sesión con laps, zonas, streams y JSON crudo.
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
          <h2 className="section-title">Carga actividades completas</h2>
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
                  {importing ? "Cargando detalle..." : "Cargar actividades"}
                </button>
              </div>
            </div>
            {!selectedAthlete?.strava_connected ? <span>Este atleta todavía no tiene Strava conectado desde su portal.</span> : null}
            {endDate < startDate ? <span>La fecha final debe ser igual o posterior a la inicial.</span> : null}
          </div>
        </div>
        {importError ? <p className="error">{importError}</p> : null}
      </section>

      <section className="card section-card">
        <div className="section-heading compact">
          <span className="eyebrow">Actividades</span>
          <h2 className="section-title">Vista visual de sesiones</h2>
        </div>
        {importResult ? (
          importResult.activities.length ? (
            <div className="strava-activity-grid">
              {importResult.activities.map((activity) => {
                const isSelected = selectedActivity?.provider_activity_id === activity.provider_activity_id;
                return (
                  <button
                    key={activity.provider_activity_id}
                    type="button"
                    className={`strava-activity-card${isSelected ? " selected" : ""}`}
                    onClick={() => setSelectedActivityId(activity.provider_activity_id)}
                  >
                    <div className="strava-activity-card-top">
                      <span className="eyebrow">{activity.sport_type}</span>
                      <strong>{formatDateTime(activity.started_at)}</strong>
                    </div>
                    <h3>{activity.name}</h3>
                    <div className="strava-activity-card-metrics">
                      <span>{formatDuration(activity.moving_time_seconds)}</span>
                      <span>{formatDistance(activity.distance_m)}</span>
                      <span>{formatPace(activity.average_speed_m_s)}</span>
                    </div>
                    <div className="strava-activity-card-flags">
                      {activity.trainer ? <span>Indoor</span> : null}
                      {activity.average_heartrate ? <span>{Math.round(activity.average_heartrate)} bpm</span> : null}
                      {activity.average_watts ? <span>{Math.round(activity.average_watts)} W</span> : null}
                    </div>
                    {activity.enrichment_error ? <p className="error">Detalle incompleto: {activity.enrichment_error}</p> : null}
                  </button>
                );
              })}
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

      {selectedActivity ? (
        <section className="card section-card">
          <div className="section-heading compact">
            <span className="eyebrow">Detalle de sesión</span>
            <h2 className="section-title">{selectedActivity.name}</h2>
            <p>{formatDateTime(selectedActivity.started_at)} · {selectedActivity.sport_type}</p>
          </div>

          <div className="strava-detail-metrics">
            <div><strong>Duración útil</strong><span>{formatDuration(selectedActivity.moving_time_seconds)}</span></div>
            <div><strong>Duración total</strong><span>{formatDuration(selectedActivity.elapsed_time_seconds)}</span></div>
            <div><strong>Distancia</strong><span>{formatDistance(selectedActivity.distance_m)}</span></div>
            <div><strong>Ritmo/velocidad</strong><span>{formatPace(selectedActivity.average_speed_m_s)}</span></div>
            <div><strong>FC media</strong><span>{selectedActivity.average_heartrate ? `${Math.round(selectedActivity.average_heartrate)} bpm` : "n/d"}</span></div>
            <div><strong>FC máx</strong><span>{selectedActivity.max_heartrate ? `${Math.round(selectedActivity.max_heartrate)} bpm` : "n/d"}</span></div>
            <div><strong>Potencia media</strong><span>{selectedActivity.average_watts ? `${Math.round(selectedActivity.average_watts)} W` : "n/d"}</span></div>
            <div><strong>Potencia máx</strong><span>{selectedActivity.max_watts ? `${Math.round(selectedActivity.max_watts)} W` : "n/d"}</span></div>
            <div><strong>Elevación</strong><span>{formatNumber(selectedActivity.total_elevation_gain_m, " m", 0)}</span></div>
            <div><strong>Calorías</strong><span>{formatNumber(selectedActivity.calories, "", 0)}</span></div>
            <div><strong>Cadencia media</strong><span>{formatNumber(selectedActivity.average_cadence, "", 1)}</span></div>
            <div><strong>Weighted avg watts</strong><span>{formatNumber(selectedActivity.weighted_average_watts, " W", 0)}</span></div>
          </div>

          {selectedActivity.description ? (
            <div className="strava-detail-note">
              <span className="eyebrow">Descripción</span>
              <p>{selectedActivity.description}</p>
            </div>
          ) : null}

          <div className="strava-detail-columns">
            <div className="strava-detail-panel">
              <div className="strava-preview-header">
                <div>
                  <span className="eyebrow">Laps</span>
                  <h3>Contenido de la sesión</h3>
                </div>
                <strong>{selectedActivityLaps.length}</strong>
              </div>
              {selectedActivityLaps.length ? (
                <div className="strava-lap-list">
                  {selectedActivityLaps.map((lap) => (
                    <article key={`${selectedActivity.provider_activity_id}-${lap.lap_index}`} className="strava-lap-card">
                      <div className="strava-lap-header">
                        <strong>{lap.name}</strong>
                        <span>#{lap.lap_index}</span>
                      </div>
                      <div className="strava-lap-metrics">
                        <span>{formatDuration(lap.moving_time_seconds)}</span>
                        <span>{formatDistance(lap.distance_m)}</span>
                        <span>{formatPace(lap.average_speed_m_s)}</span>
                        <span>{lap.average_heartrate ? `${Math.round(lap.average_heartrate)} bpm` : "n/d"}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p>No hay laps disponibles para esta actividad.</p>
              )}
            </div>

            <div className="strava-detail-panel">
              <div className="strava-preview-header">
                <div>
                  <span className="eyebrow">Streams</span>
                  <h3>Series disponibles</h3>
                </div>
                <strong>{Object.keys(selectedActivityStreams).length}</strong>
              </div>
              {Object.keys(selectedActivityStreams).length ? (
                <div className="strava-stream-list">
                  {streamSummary(selectedActivity).map((stream) => (
                    <article key={stream.key} className="strava-stream-card">
                      <strong>{stream.key}</strong>
                      <span>{stream.points} puntos</span>
                      <span>{stream.resolution}</span>
                      <span>{stream.seriesType}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <p>No hay streams disponibles para esta actividad.</p>
              )}
            </div>
          </div>

          <div className="strava-detail-panel">
            <div className="strava-preview-header">
              <div>
                <span className="eyebrow">Zonas</span>
                <h3>Distribución de intensidad</h3>
              </div>
              <strong>{selectedActivityZones.length}</strong>
            </div>
            {selectedActivityZones.length ? (
              <div className="strava-zone-grid">
                {selectedActivityZones.map((zone) => (
                  <article key={zone.type} className="strava-zone-card">
                    <strong>{zone.type}</strong>
                    <span>score: {zone.score ?? "n/d"}</span>
                    <span>puntos: {zone.points ?? "n/d"}</span>
                    <div className="strava-zone-buckets">
                      {(zone.buckets ?? []).map((bucket, index) => (
                        <div key={`${zone.type}-${index}`}>
                          <strong>{bucket.time_seconds}s</strong>
                          <span>
                            {bucket.min_value ?? "?"} - {bucket.max_value ?? "?"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p>No hay zonas disponibles para esta actividad.</p>
            )}
          </div>

          {selectedActivityJson ? (
            <div className="strava-raw-json">
              <div className="strava-preview-header">
                <div>
                  <span className="eyebrow">Debug</span>
                  <h3>JSON crudo de la actividad seleccionada</h3>
                </div>
              </div>
              <pre>{selectedActivityJson}</pre>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
