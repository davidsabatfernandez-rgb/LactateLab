import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { Athlete } from "../types";

type AthletesPageProps = {
  athletes: Athlete[];
  token: string;
  onRefresh: () => Promise<void>;
};

const initialForm = {
  name: "",
  date_of_birth: "",
  sex: "female",
  weight: "",
  height: "",
  primary_discipline: "running",
  goal_category: "media_distancia",
  notes: "",
  training_goal: "",
};

export function AthletesPage({ athletes, token, onRefresh }: AthletesPageProps) {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createAthlete(token, {
        name: form.name,
        date_of_birth: form.date_of_birth,
        sex: form.sex,
        weight: Number(form.weight),
        height: form.height ? Number(form.height) : null,
        primary_discipline: form.primary_discipline,
        goal_category: form.goal_category,
        training_goal: form.training_goal || null,
        notes: form.notes || null,
        created_at: new Date().toISOString().slice(0, 10),
        weights: form.weight
          ? [{ recorded_at: new Date().toISOString().slice(0, 10), weight: Number(form.weight), source: "manual" }]
          : [],
      });
      setForm(initialForm);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el atleta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(athlete: Athlete) {
    const confirmed = window.confirm(`Eliminar a ${athlete.name}? Esta acción borrará sus sesiones asociadas.`);
    if (!confirmed) return;
    setError(null);
    try {
      await api.deleteAthlete(token, athlete.id);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el atleta.");
    }
  }

  async function handleGenerateDemo() {
    setError(null);
    setSubmitting(true);
    try {
      await api.generateDemoAthlete(token);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el atleta demo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="page-header">
        <span className="eyebrow">Athletes</span>
        <h1>Plantilla</h1>
      </section>
      <section className="table-card card">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Disciplina</th>
              <th>Foco activo</th>
              <th>Peso</th>
              <th>Alta</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((athlete) => {
              const activeBlock = athlete.focus_blocks?.find((block) => block.status === "active");
              return (
                <tr key={athlete.id}>
                  <td>
                    <Link className="inline-link" to={`/athletes/${athlete.id}/targets`}>
                      {athlete.name}
                    </Link>
                  </td>
                  <td>{athlete.primary_discipline}</td>
                  <td>{activeBlock ? `${activeBlock.energy_system_focus} · ${activeBlock.block_objective}` : "Sin foco"}</td>
                  <td>{athlete.weight.toFixed(1)} kg</td>
                  <td>{athlete.created_at}</td>
                  <td>
                    <Link className="inline-link" to={`/athletes/${athlete.id}`}>
                      Ver análisis
                    </Link>
                    <Link className="inline-link" to={`/athletes/${athlete.id}/targets`}>
                      Objetivos
                    </Link>
                    <Link className="inline-link" to={`/athletes/${athlete.id}`}>
                      Registrar lactato
                    </Link>
                    <button className="danger-link" type="button" onClick={() => handleDelete(athlete)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="card athlete-form-card collapsible-card">
        <details>
          <summary className="collapsible-summary">
            <div>
              <span className="eyebrow">Nuevo atleta</span>
              <h2>Añadir atleta</h2>
              <p className="muted">Ábrelo solo cuando necesites dar de alta un atleta nuevo.</p>
            </div>
          </summary>
          <form className="athlete-form" onSubmit={handleSubmit}>
            <label>
              Nombre
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              Fecha nacimiento
              <input type="date" value={form.date_of_birth} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} required />
            </label>
            <label>
              Sexo
              <select value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })}>
                <option value="female">Femenino</option>
                <option value="male">Masculino</option>
              </select>
            </label>
            <label>
              Peso (kg)
              <input type="number" step="0.1" value={form.weight} onChange={(event) => setForm({ ...form, weight: event.target.value })} required />
            </label>
            <label>
              Altura (cm)
              <input type="number" step="0.1" value={form.height} onChange={(event) => setForm({ ...form, height: event.target.value })} />
            </label>
            <label>
              Disciplina
              <select value={form.primary_discipline} onChange={(event) => setForm({ ...form, primary_discipline: event.target.value })}>
                <option value="running">Running</option>
                <option value="ciclismo">Ciclismo</option>
                <option value="triatlón">Triatlón</option>
              </select>
            </label>
            <label>
              Objetivo general
              <select value={form.goal_category} onChange={(event) => setForm({ ...form, goal_category: event.target.value })}>
                <option value="larga_distancia">Larga distancia</option>
                <option value="media_distancia">Media distancia</option>
                <option value="corta_distancia">Corta distancia</option>
              </select>
            </label>
            <label className="full-width">
              Objetivo del atleta
              <textarea value={form.training_goal} onChange={(event) => setForm({ ...form, training_goal: event.target.value })} rows={2} />
            </label>
            <label className="full-width">
              Observaciones
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} />
            </label>
            {error ? <p className="error full-width">{error}</p> : null}
            <div className="button-row full-width">
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? "Guardando..." : "Añadir atleta"}
              </button>
              <button className="ghost-button" type="button" onClick={handleGenerateDemo} disabled={submitting}>
                Generar atleta demo
              </button>
            </div>
          </form>
        </details>
      </section>
    </div>
  );
}
