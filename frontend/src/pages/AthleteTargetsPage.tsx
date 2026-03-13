import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { buildTargetObjective, targetCategoryLabel, targetCategoryOptions } from "../lib/targetCatalog";
import { AthleteAnalysis, AthleteTarget } from "../types";

type AthleteTargetsPageProps = {
  analysis: AthleteAnalysis | null;
  token: string;
  onSaved: () => Promise<void>;
};

function disciplineLabel(value: string) {
  if (value === "ciclismo") return "Ciclismo";
  if (value === "natación") return "Natacion";
  if (value === "triatlón") return "Triatlon";
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
    distance_category: "",
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
    return (
      <div className="rd-page">
        <div className="rd-page-header">
          <div className="rd-page-header-left">
            <h1 className="rd-page-title">Cargando objetivos...</h1>
          </div>
        </div>
      </div>
    );
  }

  async function handleSave() {
    if (!analysis) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const objective = buildTargetObjective({
        category: form.distance_category,
        distanceLabel: form.distance_label,
        fallback: disciplineLabel(form.discipline),
      });
      await api.addAthleteTarget(token, analysis.athlete.id, {
        target_date: form.target_date,
        discipline: form.discipline,
        objective,
        distance_label: form.distance_label || targetCategoryLabel(form.distance_category) || null,
        distance_category: form.distance_category || null,
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
        distance_label: "",
        distance_category: "",
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
    <div className="rd-page">
      {/* Hero */}
      <div className="tp-hero">
        <div>
          <h1 className="rd-page-title">Objetivos y competiciones</h1>
          <p className="rd-page-subtitle">Configura pruebas objetivo, distancia, prioridad y referencias operativas.</p>
        </div>
        <div className="tp-hero-stats">
          <div className="tp-hero-stat">
            <span>Atleta</span>
            <strong>{analysis.athlete.name}</strong>
            <small>{disciplineLabel(analysis.athlete.primary_discipline)}</small>
          </div>
          <div className="tp-hero-stat">
            <span>Guardados</span>
            <strong>{analysis.athlete.targets?.length ?? 0}</strong>
            <small>Objetivos</small>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="tp-form-section">
        <div className="tp-form-card">
          <div className="tp-form-card-header">
            <div>
              <span className="rd-eyebrow">Nuevo objetivo</span>
              <h2 className="rd-page-title" style={{ fontSize: "0.95rem", marginTop: "4px" }}>Definir competicion u objetivo</h2>
            </div>
            <Link className="rd-btn rd-btn-ghost" to={`/athletes/${analysis.athlete.id}`}>
              Volver al atleta
            </Link>
          </div>
          <div className="rd-form">
            <label>
              Fecha
              <input type="date" value={form.target_date} onChange={(event) => setForm({ ...form, target_date: event.target.value })} />
            </label>
            <label>
              Disciplina
              <select value={form.discipline} onChange={(event) => setForm({ ...form, discipline: event.target.value })}>
                {analysis.athlete.primary_discipline === "triatlón" ? (
                  <>
                    <option value="triatlón">Triatlon</option>
                    <option value="running">Running</option>
                    <option value="ciclismo">Ciclismo</option>
                    <option value="natación">Natacion</option>
                  </>
                ) : (
                  <option value={analysis.athlete.primary_discipline}>{disciplineLabel(analysis.athlete.primary_discipline)}</option>
                )}
              </select>
            </label>
            <label>
              Prueba objetivo
              <select
                value={form.distance_category}
                onChange={(event) => {
                  const category = event.target.value;
                  setForm((current) => ({
                    ...current,
                    distance_category: category,
                    distance_label: targetCategoryLabel(category, current.distance_label) ?? current.distance_label,
                  }));
                }}
              >
                <option value="">-- Selecciona prueba --</option>
                {targetCategoryOptions(form.discipline).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Etiqueta visible
              <input
                value={form.distance_label}
                onChange={(event) => setForm({ ...form, distance_label: event.target.value })}
                placeholder={targetCategoryLabel(form.distance_category, form.discipline) ?? "Nombre visible de la prueba"}
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
            <div className="full-width">
              <div className="tp-preview-box">
                <small>Nombre que guardara el sistema</small>
                <strong>{buildTargetObjective({ category: form.distance_category, distanceLabel: form.distance_label, fallback: disciplineLabel(form.discipline) })}</strong>
                <p>El motor usa la categoria de prueba. El texto libre queda como etiqueta visible.</p>
              </div>
            </div>
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
                  Ritmo natacion
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
            {error ? <p className="rd-error full-width">{error}</p> : null}
            {message ? <p className="rd-success full-width">{message}</p> : null}
            <div className="button-row full-width">
              <button className="rd-btn rd-btn-primary" type="button" onClick={handleSave} disabled={submitting || !form.distance_category}>
                {submitting ? "Guardando..." : "Aceptar y guardar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Target history */}
      <div className="tp-target-list">
        <span className="rd-eyebrow">Objetivos guardados</span>
        {(analysis.athlete.targets ?? []).map((target) => (
          <div key={target.id} className="tp-target-item">
            <div className="tp-target-item-head">
              <span className="tp-target-name">
                {buildTargetObjective({ category: target.distance_category, distanceLabel: target.distance_label, fallback: target.objective })}
              </span>
              <span className="tp-target-date-badge">{target.target_date}</span>
            </div>
            <span className="tp-target-detail">
              {disciplineLabel(target.discipline)}
              {target.distance_label ? ` · ${target.distance_label}` : ""}
              {target.priority_level ? ` · prioridad ${target.priority_level}` : ""}
            </span>
            <span className="tp-target-ref">{targetSummaryForDiscipline(target)}</span>
            {target.notes ? <span className="tp-target-ref">{target.notes}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
