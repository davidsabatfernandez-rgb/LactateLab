import { useEffect, useMemo, useState } from "react";

import { api } from "../lib/api";
import { Athlete, GarminActivitiesPreviewResponse, GarminActivity } from "../types";

type GarminConnectPageProps = {
  token: string;
  athletes: Athlete[];
  onDataChanged: () => Promise<void>;
};

function disciplineLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "running") return "Carrera";
  if (normalized === "cycling" || normalized === "ciclismo") return "Ciclismo";
  if (normalized === "swimming" || normalized === "natación") return "Natación";
  if (normalized === "triatlón" || normalized === "triatlon") return "Triatlón";
  return value;
}

function athleteGoalLabel(athlete: Athlete) {
  if (athlete.targets && athlete.targets.length > 0) {
    return athlete.targets[0]?.objective ?? "Sin objetivo definido";
  }
  return athlete.training_goal ?? "Sin objetivo definido";
}

function athleteFocusLabel(athlete: Athlete) {
  if (athlete.focus_blocks && athlete.focus_blocks.length > 0) {
    return athlete.focus_blocks[0]?.block_objective ?? "Sin bloque activo";
  }
  return "Sin bloque activo";
}

function garminPriority(athlete: Athlete) {
  const discipline = athlete.primary_discipline.toLowerCase();
  if (discipline.includes("cycl")) return "Alta";
  if (discipline.includes("run")) return "Alta";
  if (discipline.includes("tri")) return "Alta";
  if (discipline.includes("swim")) return "Media";
  return "Media";
}

function recommendedFirstSync(athlete: Athlete) {
  const discipline = athlete.primary_discipline.toLowerCase();
  if (discipline.includes("cycl")) return "Actividades + potencia + laps";
  if (discipline.includes("run")) return "Actividades + ritmo + FC";
  if (discipline.includes("tri")) return "Actividades + multideporte + transiciones";
  if (discipline.includes("swim")) return "Actividades + series + ritmo/100m";
  return "Actividades básicas y detalle de sesión";
}

function formatDistance(distanceM: number) {
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(distanceM >= 10000 ? 1 : 2)} km`;
}

function formatDuration(totalSeconds: number) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${seconds}s`;
  return `${seconds}s`;
}

function formatMovementMetric(speed?: number | null, sportType?: string) {
  if (!speed || speed <= 0) return "n/d";
  const normalized = (sportType ?? "").toLowerCase();
  if (normalized.includes("swim")) {
    const secondsPer100m = 100 / speed;
    const minutes = Math.floor(secondsPer100m / 60);
    const seconds = Math.round(secondsPer100m % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}/100m`;
  }
  if (normalized.includes("ride") || normalized.includes("cycle") || normalized.includes("bike")) {
    return `${(speed * 3.6).toFixed(1)} km/h`;
  }
  const secondsPerKm = 1000 / speed;
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}/km`;
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

function isoDateOffset(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function GarminConnectPage({ token, athletes, onDataChanged }: GarminConnectPageProps) {
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(athletes[0]?.id ?? null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [startDate, setStartDate] = useState(isoDateOffset(-14));
  const [endDate, setEndDate] = useState(isoDateOffset(0));
  const [preview, setPreview] = useState<GarminActivitiesPreviewResponse | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === selectedAthleteId) ?? athletes[0] ?? null,
    [athletes, selectedAthleteId],
  );

  const selectedActivity = useMemo(
    () => preview?.activities.find((activity) => activity.provider_activity_id === selectedActivityId) ?? preview?.activities[0] ?? null,
    [preview, selectedActivityId],
  );

  const connectedToStravaCount = useMemo(
    () => athletes.filter((athlete) => athlete.strava_connected).length,
    [athletes],
  );

  const connectedToGarminCount = useMemo(
    () => athletes.filter((athlete) => athlete.garmin_connected).length,
    [athletes],
  );

  const coveredDisciplines = useMemo(() => {
    const values = new Set(athletes.map((athlete) => disciplineLabel(athlete.primary_discipline)));
    return values.size;
  }, [athletes]);

  useEffect(() => {
    setConnectMessage(null);
    setConnectError(null);
    setPreviewError(null);
    setPreview(null);
    setSelectedActivityId(null);
    setEmail("");
    setPassword("");
    setMfaCode("");
  }, [selectedAthleteId]);

  async function handleConnect() {
    if (!selectedAthlete) return;
    setIsConnecting(true);
    setConnectMessage(null);
    setConnectError(null);

    try {
      const result = await api.garminConnect(token, selectedAthlete.id, {
        email,
        password,
        ...(mfaCode.trim() ? { mfa_code: mfaCode.trim() } : {}),
      });
      setConnectMessage(`Cuenta Garmin conectada para ${selectedAthlete.name} (${result.garmin_email}).`);
      setPassword("");
      setMfaCode("");
      await onDataChanged();
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : "No se pudo conectar Garmin.");
    } finally {
      setIsConnecting(false);
    }
  }

  async function handlePreview() {
    if (!selectedAthlete) return;
    setIsLoadingPreview(true);
    setPreviewError(null);

    try {
      const result = (await api.garminPreview(token, selectedAthlete.id, startDate, endDate)) as GarminActivitiesPreviewResponse;
      setPreview(result);
      setSelectedActivityId(result.activities[0]?.provider_activity_id ?? null);
    } catch (error) {
      setPreview(null);
      setSelectedActivityId(null);
      setPreviewError(error instanceof Error ? error.message : "No se pudo cargar el preview Garmin.");
    } finally {
      setIsLoadingPreview(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="hero">
        <div className="hero-main">
          <span className="eyebrow">Beta integration</span>
          <h1>Garmin Connect</h1>
          <p>
            Beta inicial para conectar Garmin, previsualizar actividades por atleta y validar si el
            dato encaja en el flujo analítico de Lactate Lab antes de importar.
          </p>
        </div>
        <div className="hero-focus-stack">
          <div className="hero-focus-card current">
            <small>Atletas</small>
            <strong>{athletes.length}</strong>
            <p>Base disponible para probar la beta</p>
          </div>
          <div className="hero-focus-card">
            <small>Disciplinas</small>
            <strong>{coveredDisciplines}</strong>
            <p>Running, cycling, triathlon y variantes</p>
          </div>
          <div className="hero-focus-card">
            <small>Strava conectado</small>
            <strong>{connectedToStravaCount}</strong>
            <p>Sirve para contrastar lo que devuelve Garmin</p>
          </div>
          <div className="hero-focus-card evaluation">
            <small>Garmin conectado</small>
            <strong>{connectedToGarminCount}</strong>
            <p>Atletas listos para preview beta</p>
          </div>
        </div>
      </section>

      <section className="card section-card planning-toolbar-card">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2 className="section-title">Selecciona atleta para trabajar Garmin</h2>
          </div>
        </div>
        <div className="planning-workspace-switch">
          {athletes.map((athlete) => {
            const isActive = athlete.id === selectedAthlete?.id;
            return (
              <button
                key={athlete.id}
                type="button"
                className="planning-workspace-button"
                onClick={() => setSelectedAthleteId(athlete.id)}
                aria-pressed={isActive}
              >
                <strong>{athlete.name}</strong>
                <small>
                  {disciplineLabel(athlete.primary_discipline)}
                  {athlete.garmin_connected ? " · Garmin ok" : ""}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      {selectedAthlete ? (
        <>
          <section className="strava-summary-strip">
            <article className="strava-summary-card">
              <span>Disciplina base</span>
              <strong>{disciplineLabel(selectedAthlete.primary_discipline)}</strong>
              <small>Prioridad Garmin: {garminPriority(selectedAthlete)}</small>
            </article>
            <article className="strava-summary-card">
              <span>Objetivo actual</span>
              <strong>{athleteGoalLabel(selectedAthlete)}</strong>
              <small>Lectura útil para decidir qué datos importar primero</small>
            </article>
            <article className="strava-summary-card">
              <span>Bloque activo</span>
              <strong>{athleteFocusLabel(selectedAthlete)}</strong>
              <small>Sirve para priorizar carga, laps y contexto</small>
            </article>
            <article className="strava-summary-card">
              <span>Primer sync recomendado</span>
              <strong>{recommendedFirstSync(selectedAthlete)}</strong>
              <small>{selectedAthlete.garmin_connected ? "Cuenta Garmin ya conectada" : "Pendiente de conectar"}</small>
            </article>
          </section>

          <section className="card section-card">
            <div className="strava-preview-header">
              <div>
                <span className="eyebrow">Conexión beta</span>
                <h3>Conectar Garmin para {selectedAthlete.name}</h3>
              </div>
              <strong>{selectedAthlete.garmin_connected ? "Conectado" : "Pendiente"}</strong>
            </div>
            <div className="strava-import-grid">
              <label className="library-search-shell">
                <span className="library-search-label">Email Garmin</span>
                <input
                  className="library-search"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="usuario@correo.com"
                />
              </label>
              <label className="library-search-shell">
                <span className="library-search-label">Password</span>
                <input
                  className="library-search"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password Garmin"
                />
              </label>
              <label className="library-search-shell">
                <span className="library-search-label">MFA code</span>
                <input
                  className="library-search"
                  type="text"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value)}
                  placeholder="Opcional si Garmin lo pide"
                />
              </label>
              <div className="strava-import-action">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleConnect}
                  disabled={isConnecting || !email.trim() || !password}
                >
                  {isConnecting ? "Conectando..." : "Conectar Garmin"}
                </button>
              </div>
            </div>
            {connectMessage ? <p>{connectMessage}</p> : null}
            {connectError ? <p className="error">{connectError}</p> : null}
          </section>

          <section className="card section-card">
            <div className="strava-preview-header">
              <div>
                <span className="eyebrow">Preview</span>
                <h3>Actividades Garmin por rango de fechas</h3>
              </div>
              <strong>{preview ? `${preview.imported_count} actividades` : "Sin cargar"}</strong>
            </div>
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
                  onClick={handlePreview}
                  disabled={isLoadingPreview || !selectedAthlete.garmin_connected || endDate < startDate}
                >
                  {isLoadingPreview ? "Cargando..." : "Cargar preview"}
                </button>
              </div>
            </div>
            {!selectedAthlete.garmin_connected ? <p>Conecta primero la cuenta Garmin de este atleta.</p> : null}
            {endDate < startDate ? <p>La fecha final debe ser igual o posterior a la inicial.</p> : null}
            {previewError ? <p className="error">{previewError}</p> : null}
          </section>

          {preview?.activities.length ? (
            <>
              <section className="card section-card">
                <div className="strava-preview-header">
                  <div>
                    <span className="eyebrow">Listado</span>
                    <h3>Actividades Garmin visibles</h3>
                  </div>
                  <strong>{preview.athlete_name}</strong>
                </div>
                <div className="strava-activity-grid">
                  {preview.activities.map((activity) => (
                    <button
                      key={activity.provider_activity_id}
                      type="button"
                      className={`strava-activity-card${selectedActivity?.provider_activity_id === activity.provider_activity_id ? " selected" : ""}`}
                      onClick={() => setSelectedActivityId(activity.provider_activity_id)}
                    >
                      <div className="strava-activity-card-head">
                        <div className="strava-activity-card-topline">
                          <span className="strava-sport-pill other">{activity.sport_type}</span>
                          <span className="strava-subtle-pill">{formatDateTime(activity.started_at)}</span>
                        </div>
                        <div className="strava-activity-title-block">
                          <strong>{activity.name}</strong>
                          <p>{activity.description ?? "Sin descripción"}</p>
                        </div>
                      </div>
                      <div className="strava-activity-kpi-grid">
                        <div>
                          <span>Duración</span>
                          <strong>{formatDuration(activity.moving_time_seconds)}</strong>
                        </div>
                        <div>
                          <span>Distancia</span>
                          <strong>{formatDistance(activity.distance_m)}</strong>
                        </div>
                        <div>
                          <span>Ritmo / velocidad</span>
                          <strong>{formatMovementMetric(activity.average_speed_m_s, activity.sport_type)}</strong>
                        </div>
                        <div>
                          <span>FC / potencia</span>
                          <strong>
                            {activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : "n/d"}
                            {activity.average_watts ? ` · ${Math.round(activity.average_watts)} W` : ""}
                          </strong>
                        </div>
                      </div>
                      <div className="strava-activity-card-flags">
                        <span>{activity.laps.length ? `${activity.laps.length} laps` : "Sin laps"}</span>
                        <span>{activity.device_name ?? "Dispositivo n/d"}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {selectedActivity ? (
                <section className="card section-card">
                  <div className="strava-preview-header">
                    <div>
                      <span className="eyebrow">Detalle</span>
                      <h3>{selectedActivity.name}</h3>
                    </div>
                    <strong>{selectedActivity.device_name ?? "Garmin device n/d"}</strong>
                  </div>
                  <div className="strava-detail-hero-shell">
                    <div className="strava-detail-hero-main">
                      <div className="strava-detail-hero-topline">
                        <span className="strava-sport-pill other">{selectedActivity.sport_type}</span>
                        <span className="strava-subtle-pill">{formatDateTime(selectedActivity.started_at)}</span>
                      </div>
                      <h3>Preview Garmin listo para mapear a sesión interna</h3>
                      <p className="strava-detail-hero-copy">
                        Esta actividad ya trae suficiente estructura base para validar el mapeo
                        hacia sesión, intervalos y lectura de bloques.
                      </p>
                      <div className="strava-detail-tag-list">
                        <span>{formatDistance(selectedActivity.distance_m)}</span>
                        <span>{formatDuration(selectedActivity.elapsed_time_seconds)}</span>
                        <span>{selectedActivity.laps.length} laps</span>
                        <span>{selectedActivity.raw_detail ? "Payload crudo disponible" : "Sin payload"}</span>
                      </div>
                    </div>
                    <div className="strava-detail-hero-side">
                      <div>
                        <span>Ritmo / velocidad</span>
                        <strong>{formatMovementMetric(selectedActivity.average_speed_m_s, selectedActivity.sport_type)}</strong>
                      </div>
                      <div>
                        <span>FC media</span>
                        <strong>{selectedActivity.average_heartrate ? `${Math.round(selectedActivity.average_heartrate)} bpm` : "n/d"}</strong>
                      </div>
                      <div>
                        <span>Potencia media</span>
                        <strong>{selectedActivity.average_watts ? `${Math.round(selectedActivity.average_watts)} W` : "n/d"}</strong>
                      </div>
                      <div>
                        <span>Desnivel</span>
                        <strong>{selectedActivity.total_elevation_gain_m ? `${Math.round(selectedActivity.total_elevation_gain_m)} m` : "n/d"}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="strava-phase-lap-grid">
                    {selectedActivity.laps.length ? (
                      selectedActivity.laps.map((lap) => (
                        <article key={`${selectedActivity.provider_activity_id}-${lap.lap_index}`} className="strava-phase-lap-card">
                          <div className="strava-phase-lap-topline">
                            <strong>#{lap.lap_index}</strong>
                            <span>{lap.name}</span>
                          </div>
                          <div className="strava-phase-lap-meta">
                            <span>{formatDistance(lap.distance_m)}</span>
                            <span>{formatDuration(lap.moving_time_seconds)}</span>
                            <span>{formatMovementMetric(lap.average_speed_m_s, selectedActivity.sport_type)}</span>
                            <span>{lap.average_heartrate ? `${Math.round(lap.average_heartrate)} bpm` : "n/d"}</span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="strava-preview-empty">
                        <p>Esta actividad no trae laps visibles en el preview actual.</p>
                      </div>
                    )}
                  </div>
                </section>
              ) : null}
            </>
          ) : preview ? (
            <section className="card section-card">
              <div className="strava-preview-empty">
                <p>No se encontraron actividades Garmin en ese rango de fechas.</p>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="card section-card">
          <div className="strava-preview-empty">
            <p>No hay atletas disponibles todavía para preparar la beta Garmin.</p>
          </div>
        </section>
      )}
    </div>
  );
}
