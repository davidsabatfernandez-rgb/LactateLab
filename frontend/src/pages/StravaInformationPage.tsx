import { useMemo } from "react";

import { Athlete } from "../types";

type StravaInformationPageProps = {
  athletes: Athlete[];
};

export function StravaInformationPage({ athletes }: StravaInformationPageProps) {
  const connectedAthletes = useMemo(
    () => athletes.filter((athlete) => athlete.strava_connected),
    [athletes],
  );
  const pendingAthletes = Math.max(athletes.length - connectedAthletes.length, 0);

  return (
    <div className="page-grid">
      <section className="hero">
        <div className="hero-main">
          <span className="eyebrow">Integración Strava</span>
          <h1>Strava Information</h1>
          <p>
            Vista provisional para entrenador. La conexión se hace desde el portal del atleta y aquí centralizaremos más adelante el estado, actividad importada y validaciones.
          </p>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="card metric-card">
          <span className="eyebrow">Atletas</span>
          <strong>{athletes.length}</strong>
          <p>Total de perfiles visibles en tu cuenta.</p>
        </article>
        <article className="card metric-card">
          <span className="eyebrow">Conectados</span>
          <strong>{connectedAthletes.length}</strong>
          <p>Atletas con Strava ya vinculado.</p>
        </article>
        <article className="card metric-card">
          <span className="eyebrow">Pendientes</span>
          <strong>{pendingAthletes}</strong>
          <p>Atletas que todavía deben autorizar desde su portal.</p>
        </article>
      </section>

      <section className="card section-card">
        <span className="eyebrow">Estado actual</span>
        <h2>Vinculación por atleta</h2>
        {athletes.length ? (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Atleta</th>
                  <th>Disciplina</th>
                  <th>Estado</th>
                  <th>Strava athlete id</th>
                </tr>
              </thead>
              <tbody>
                {athletes.map((athlete) => (
                  <tr key={athlete.id}>
                    <td>{athlete.name}</td>
                    <td>{athlete.primary_discipline}</td>
                    <td>{athlete.strava_connected ? "Conectado" : "Pendiente"}</td>
                    <td>{athlete.strava_athlete_id ?? "sin vincular"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No hay atletas disponibles todavía.</p>
        )}
      </section>

      <section className="card section-card">
        <span className="eyebrow">Siguiente bloque</span>
        <h2>Pendiente de definir</h2>
        <p>
          Esta pestaña queda preparada para decidir después qué información mostrar: sincronización de actividades, estado del webhook, matching con sesiones planificadas o revisión manual.
        </p>
      </section>
    </div>
  );
}
