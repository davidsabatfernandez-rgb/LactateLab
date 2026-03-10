import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { AthleteAnalysis, AthleteTarget } from "../types";

type AthleteTargetsPageProps = {
  analysis: AthleteAnalysis | null;
  token: string;
  onSaved: () => Promise<void>;
};

function disciplineLabel(value: string) {
  if (value === "ciclismo") return "Ciclismo";
  if (value === "natación") return "Natación";
  if (value === "triatlón") return "Triatlón";
  return "Running";
}

function targetSummaryForDiscipline(target: AthleteTarget) {
  if (target.discipline === "triatlón") {
    const parts = [
      target.target_running_pace_label ? `Run ${target.target_running_pace_label}` : null,
      target.target_swim_pace_label ? `Swim ${target.target_swim_pace_label}` : null,
      target.target_cycling_power_watts ? `Bike ${Math.round(target.target_cycling_power_watts)} W` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "Sin referencias de objetivo";
  }
  if (target.discipline === "ciclismo") {
    return target.target_power_watts ? `${Math.round(target.target_power_watts)} W` : "Sin potencia objetivo";
  }
  return target.target_pace_label || "Sin ritmo objetivo";
}

export function AthleteTargetsPage({ analysis, token, onSaved }: AthleteTargetsPageProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    target_date: new Date().toISOString().slice(0, 10),
    discipline: analysis?.athlete.primary_discipline === "triatlón" ? "triatlón" : analysis?.athlete.primary_discipline ?? "running",
    distance_label: "",
    priority_level: "media",
    objective: "",
    target_pace_label: "",
    target_power_watts: "",
    target_running_pace_label: "",
    target_swim_pace_label: "",
    target_cycling_power_watts: "",
    notes: "",
  });

  if (!analysis) {
    return <div className="loading">Cargando objetivos...</div>;
  }

  async function handleSave() {
    if (!analysis) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await api.addAthleteTarget(token, analysis.athlete.id, {
        target_date: form.target_date,
        discipline: form.discipline,
        objective: form.objective,
        distance_label: form.distance_label || null,
        priority_level: form.priority_level || null,
        target_pace_label: form.target_pace_label || null,
        target_power_watts: form.target_power_watts ? Number(form.target_power_watts) : null,
        target_running_pace_label: form.target_running_pace_label || null,
        target_swim_pace_label: form.target_swim_pace_label || null,
        target_cycling_power_watts: form.target_cycling_power_watts ? Number(form.target_cycling_power_watts) : null,
        notes: form.notes || null,
      });
      setMessage("Objetivo guardado.");
      setForm((current) => ({
        ...current,
        objective: "",
        distance_label: "",
        target_pace_label: "",
        target_power_watts: "",
        target_running_pace_label: "",
        target_swim_pace_label: "",
        target_cycling_power_watts: "",
        notes: "",
      }));
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el objetivo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="hero card">
        <div>
          <span className="eyebrow">Objetivos</span>
          <h1>Objetivos y competiciones</h1>
          <p>Configura pruebas objetivo, distancia, prioridad y referencias operativas para que luego los bloques tengan contexto real.</p>
        </div>
        <div className="hero-stats">
          <div>
            <span>Atleta</span>
            <strong>{analysis.athlete.name}</strong>
            <small>{disciplineLabel(analysis.athlete.primary_discipline)}</small>
          </div>
          <div>
            <span>Guardados</span>
            <strong>{analysis.athlete.targets?.length ?? 0}</strong>
            <small>Objetivos o competiciones</small>
          </div>
        </div>
      </section>

      <section className="card target-page-shell">
        <div className="card-header">
          <div>
            <span className="eyebrow">Nuevo objetivo</span>
            <h2>Definir competición u objetivo</h2>
            <p>Aquí sí puedes trabajar con más calma: distancia, prioridad y referencias por disciplina o triatlón completo.</p>
          </div>
          <Link className="ghost-button" to={`/athletes/${analysis.athlete.id}`}>
            Volver al atleta
          </Link>
        </div>
        <div className="athlete-form target-page-form">
          <label>
            Fecha
            <input type="date" value={form.target_date} onChange={(event) => setForm({ ...form, target_date: event.target.value })} />
          </label>
          <label>
            Disciplina
            <select value={form.discipline} onChange={(event) => setForm({ ...form, discipline: event.target.value })}>
              {analysis.athlete.primary_discipline === "triatlón" ? (
                <>
                  <option value="triatlón">Triatlón</option>
                  <option value="running">Running</option>
                  <option value="ciclismo">Ciclismo</option>
                  <option value="natación">Natación</option>
                </>
              ) : (
                <option value={analysis.athlete.primary_discipline}>{disciplineLabel(analysis.athlete.primary_discipline)}</option>
              )}
            </select>
          </label>
          <label>
            Distancia
            <input
              value={form.distance_label}
              onChange={(event) => setForm({ ...form, distance_label: event.target.value })}
              placeholder={form.discipline === "triatlón" ? "70.3, olímpico, Ironman..." : "5K, 10K, maratón, 1500m..."}
            />
          </label>
          <label>
            Prioridad
            <select value={form.priority_level} onChange={(event) => setForm({ ...form, priority_level: event.target.value })}>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </label>
          <label className="full-width">
            Objetivo
            <input value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder="Sub 1:15 HM, FTP 320, podio M35..." />
          </label>
          {form.discipline !== "triatlón" ? (
            <>
              <label>
                Ritmo objetivo
                <input
                  value={form.target_pace_label}
                  onChange={(event) => setForm({ ...form, target_pace_label: event.target.value })}
                  placeholder={form.discipline === "natación" ? "01:22/100m" : "03:35/km"}
                  disabled={form.discipline === "ciclismo"}
                />
              </label>
              <label>
                Potencia objetivo
                <input
                  type="number"
                  step="1"
                  value={form.target_power_watts}
                  onChange={(event) => setForm({ ...form, target_power_watts: event.target.value })}
                  placeholder="300"
                  disabled={form.discipline !== "ciclismo"}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Ritmo running
                <input value={form.target_running_pace_label} onChange={(event) => setForm({ ...form, target_running_pace_label: event.target.value })} placeholder="03:35/km" />
              </label>
              <label>
                Ritmo natación
                <input value={form.target_swim_pace_label} onChange={(event) => setForm({ ...form, target_swim_pace_label: event.target.value })} placeholder="01:22/100m" />
              </label>
              <label>
                Potencia ciclismo
                <input
                  type="number"
                  step="1"
                  value={form.target_cycling_power_watts}
                  onChange={(event) => setForm({ ...form, target_cycling_power_watts: event.target.value })}
                  placeholder="300"
                />
              </label>
            </>
          )}
          <label className="full-width">
            Notas
            <textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
          {error ? <p className="error full-width">{error}</p> : null}
          {message ? <p className="full-width">{message}</p> : null}
          <div className="button-row full-width">
            <button className="primary-button" type="button" onClick={handleSave} disabled={submitting || !form.objective}>
              {submitting ? "Guardando..." : "Aceptar y guardar"}
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <span className="eyebrow">Histórico</span>
            <h2>Objetivos guardados</h2>
          </div>
        </div>
        <div className="list target-history-list">
          {(analysis.athlete.targets ?? []).map((target) => (
            <article key={target.id} className="list-item">
              <div className="status-head">
                <strong>{target.objective}</strong>
                <span className="status-badge neutral">{target.target_date}</span>
              </div>
              <p>
                {disciplineLabel(target.discipline)}
                {target.distance_label ? ` · ${target.distance_label}` : ""}
                {target.priority_level ? ` · prioridad ${target.priority_level}` : ""}
              </p>
              <small>{targetSummaryForDiscipline(target)}</small>
              {target.notes ? <small>{target.notes}</small> : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
