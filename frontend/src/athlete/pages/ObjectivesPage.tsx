import { useState } from "react";
import { useAthleteData } from "../context/AthleteDataContext";
import { api } from "../../lib/api";
import { buildTargetObjective, targetCategoryLabel, targetCategoryOptions } from "../../lib/targetCatalog";
import type { AthleteTarget } from "../../types";

function disciplineLabel(value: string) {
  if (value === "ciclismo") return "Ciclismo";
  if (value === "natación") return "Natacion";
  if (value === "triatlón") return "Triatlon";
  return "Running";
}

function priorityBadgeClass(priority?: string | null) {
  if (priority === "alta") return "ath-obj-priority-alta";
  if (priority === "baja") return "ath-obj-priority-baja";
  return "ath-obj-priority-media";
}

function targetSummary(target: AthleteTarget) {
  if (target.discipline === "triatlón") {
    const parts = [
      target.target_running_pace_label ? `Run ${target.target_running_pace_label}` : null,
      target.target_swim_pace_label ? `Swim ${target.target_swim_pace_label}` : null,
      target.target_cycling_power_watts ? `Bike ${Math.round(target.target_cycling_power_watts)} W` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }
  if (target.discipline === "ciclismo") {
    return target.target_power_watts ? `${Math.round(target.target_power_watts)} W` : null;
  }
  return target.target_pace_label || null;
}

function daysUntil(dateStr: string) {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function ObjectivesPage() {
  const { analysis, token, user, loading, refreshAnalysis } = useAthleteData();
  const athleteId = user.athlete_id;

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const primaryDiscipline = analysis?.athlete?.primary_discipline ?? "running";
  const [form, setForm] = useState({
    target_date: new Date().toISOString().slice(0, 10),
    discipline: primaryDiscipline === "triatlón" ? "triatlón" : primaryDiscipline,
    distance_label: "",
    distance_category: "",
    priority_level: "media",
    target_pace_label: "",
    target_power_watts: "",
    target_running_pace_label: "",
    target_swim_pace_label: "",
    target_cycling_power_watts: "",
    notes: "",
  });

  const targets: AthleteTarget[] = analysis?.athlete?.targets ?? [];

  async function handleSave() {
    if (!athleteId) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const objective = buildTargetObjective({
        category: form.distance_category,
        distanceLabel: form.distance_label,
        fallback: disciplineLabel(form.discipline),
      });
      await api.addAthleteTarget(token, athleteId, {
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
      setMessage("Objetivo guardado correctamente.");
      setForm((c) => ({
        ...c,
        distance_label: "",
        distance_category: "",
        target_pace_label: "",
        target_power_watts: "",
        target_running_pace_label: "",
        target_swim_pace_label: "",
        target_cycling_power_watts: "",
        notes: "",
      }));
      setShowForm(false);
      await refreshAnalysis();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el objetivo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(targetId: number) {
    if (!athleteId) return;
    setDeleting(targetId);
    setError(null);
    setMessage(null);
    try {
      await api.deleteAthleteTarget(token, athleteId, targetId);
      setMessage("Objetivo eliminado.");
      await refreshAnalysis();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el objetivo.");
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return (
      <div className="ath-page">
        <div className="ath-page-header">
          <h1 className="ath-page-title">Objetivos</h1>
        </div>
        <p className="ath-obj-loading">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="ath-page">
      {/* Header */}
      <div className="ath-page-header">
        <div>
          <h1 className="ath-page-title">Objetivos</h1>
          <p className="ath-page-subtitle">Tus pruebas y competiciones objetivo</p>
        </div>
        <button
          type="button"
          className="ath-obj-add-btn"
          onClick={() => { setShowForm(!showForm); setError(null); setMessage(null); }}
        >
          {showForm ? "Cancelar" : "+ Nuevo objetivo"}
        </button>
      </div>

      {/* Messages */}
      {error && <div className="ath-obj-msg ath-obj-msg-error">{error}</div>}
      {message && <div className="ath-obj-msg ath-obj-msg-success">{message}</div>}

      {/* Form */}
      {showForm && (
        <div className="ath-obj-form-card">
          <h2 className="ath-obj-form-title">Nuevo objetivo</h2>
          <div className="ath-obj-form-grid">
            <label className="ath-obj-field">
              <span className="ath-obj-field-label">Fecha objetivo</span>
              <input
                type="date"
                className="ath-obj-input"
                value={form.target_date}
                onChange={(e) => setForm({ ...form, target_date: e.target.value })}
              />
            </label>

            <label className="ath-obj-field">
              <span className="ath-obj-field-label">Disciplina</span>
              <select
                className="ath-obj-input"
                value={form.discipline}
                onChange={(e) => setForm({ ...form, discipline: e.target.value, distance_category: "", distance_label: "" })}
              >
                {primaryDiscipline === "triatlón" ? (
                  <>
                    <option value="triatlón">Triatlon</option>
                    <option value="running">Running</option>
                    <option value="ciclismo">Ciclismo</option>
                    <option value="natación">Natacion</option>
                  </>
                ) : (
                  <>
                    <option value={primaryDiscipline}>{disciplineLabel(primaryDiscipline)}</option>
                    {primaryDiscipline !== "running" && <option value="running">Running</option>}
                    {primaryDiscipline !== "ciclismo" && <option value="ciclismo">Ciclismo</option>}
                    {primaryDiscipline !== "natación" && <option value="natación">Natacion</option>}
                    {primaryDiscipline !== "triatlón" && <option value="triatlón">Triatlon</option>}
                  </>
                )}
              </select>
            </label>

            <label className="ath-obj-field">
              <span className="ath-obj-field-label">Prueba objetivo</span>
              <select
                className="ath-obj-input"
                value={form.distance_category}
                onChange={(e) => {
                  const category = e.target.value;
                  setForm((c) => ({
                    ...c,
                    distance_category: category,
                    distance_label: targetCategoryLabel(category, c.distance_label) ?? c.distance_label,
                  }));
                }}
              >
                <option value="">-- Selecciona prueba --</option>
                {targetCategoryOptions(form.discipline).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label className="ath-obj-field">
              <span className="ath-obj-field-label">Etiqueta visible</span>
              <input
                className="ath-obj-input"
                value={form.distance_label}
                onChange={(e) => setForm({ ...form, distance_label: e.target.value })}
                placeholder={targetCategoryLabel(form.distance_category, form.discipline) ?? "Nombre visible"}
              />
            </label>

            <label className="ath-obj-field">
              <span className="ath-obj-field-label">Prioridad</span>
              <select
                className="ath-obj-input"
                value={form.priority_level}
                onChange={(e) => setForm({ ...form, priority_level: e.target.value })}
              >
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </label>

            {form.discipline !== "triatlón" ? (
              <>
                <label className="ath-obj-field">
                  <span className="ath-obj-field-label">Ritmo objetivo</span>
                  <input
                    className="ath-obj-input"
                    value={form.target_pace_label}
                    onChange={(e) => setForm({ ...form, target_pace_label: e.target.value })}
                    placeholder={form.discipline === "natación" ? "01:22/100m" : "03:35/km"}
                    disabled={form.discipline === "ciclismo"}
                  />
                </label>
                <label className="ath-obj-field">
                  <span className="ath-obj-field-label">Potencia objetivo</span>
                  <input
                    className="ath-obj-input"
                    type="number"
                    step="1"
                    value={form.target_power_watts}
                    onChange={(e) => setForm({ ...form, target_power_watts: e.target.value })}
                    placeholder="300"
                    disabled={form.discipline !== "ciclismo"}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="ath-obj-field">
                  <span className="ath-obj-field-label">Ritmo running</span>
                  <input
                    className="ath-obj-input"
                    value={form.target_running_pace_label}
                    onChange={(e) => setForm({ ...form, target_running_pace_label: e.target.value })}
                    placeholder="03:35/km"
                  />
                </label>
                <label className="ath-obj-field">
                  <span className="ath-obj-field-label">Ritmo natacion</span>
                  <input
                    className="ath-obj-input"
                    value={form.target_swim_pace_label}
                    onChange={(e) => setForm({ ...form, target_swim_pace_label: e.target.value })}
                    placeholder="01:22/100m"
                  />
                </label>
                <label className="ath-obj-field">
                  <span className="ath-obj-field-label">Potencia ciclismo</span>
                  <input
                    className="ath-obj-input"
                    type="number"
                    step="1"
                    value={form.target_cycling_power_watts}
                    onChange={(e) => setForm({ ...form, target_cycling_power_watts: e.target.value })}
                    placeholder="300"
                  />
                </label>
              </>
            )}

            <label className="ath-obj-field ath-obj-field-full">
              <span className="ath-obj-field-label">Notas</span>
              <textarea
                className="ath-obj-input ath-obj-textarea"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notas adicionales (opcional)"
              />
            </label>
          </div>

          <div className="ath-obj-form-actions">
            <button
              type="button"
              className="ath-obj-save-btn"
              onClick={handleSave}
              disabled={submitting || !form.distance_category}
            >
              {submitting ? "Guardando..." : "Guardar objetivo"}
            </button>
            <button
              type="button"
              className="ath-obj-cancel-btn"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Target list */}
      {targets.length === 0 ? (
        <div className="ath-obj-empty">
          <p>No tienes objetivos definidos todavia.</p>
          <p>Pulsa "+ Nuevo objetivo" para crear tu primera competicion.</p>
        </div>
      ) : (
        <div className="ath-obj-list">
          {targets.map((target) => {
            const days = daysUntil(target.target_date);
            const summary = targetSummary(target);
            const isPast = days < 0;

            return (
              <div key={target.id} className={`ath-obj-card ${isPast ? "ath-obj-card-past" : ""}`}>
                <div className="ath-obj-card-top">
                  <div className="ath-obj-card-name">
                    {buildTargetObjective({ category: target.distance_category, distanceLabel: target.distance_label, fallback: target.objective })}
                  </div>
                  <span className={`ath-obj-priority-badge ${priorityBadgeClass(target.priority_level)}`}>
                    {target.priority_level ?? "media"}
                  </span>
                </div>

                <div className="ath-obj-card-meta">
                  <span className="ath-obj-card-discipline">{disciplineLabel(target.discipline)}</span>
                  <span className="ath-obj-card-date">{target.target_date}</span>
                  <span className={`ath-obj-card-countdown ${isPast ? "ath-obj-past" : days <= 14 ? "ath-obj-soon" : ""}`}>
                    {isPast ? `hace ${Math.abs(days)}d` : days === 0 ? "Hoy" : `en ${days}d`}
                  </span>
                </div>

                {summary && <div className="ath-obj-card-ref">{summary}</div>}
                {target.notes && <div className="ath-obj-card-notes">{target.notes}</div>}

                <button
                  type="button"
                  className="ath-obj-delete-btn"
                  onClick={() => handleDelete(target.id)}
                  disabled={deleting === target.id}
                  title="Eliminar objetivo"
                >
                  {deleting === target.id ? "..." : "Eliminar"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
