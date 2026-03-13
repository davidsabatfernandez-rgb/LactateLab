import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { Athlete } from "../types";

type AthletesPageProps = {
  athletes: Athlete[];
  token: string;
  onRefresh: () => Promise<void>;
};

type AthleteFormState = {
  name: string;
  date_of_birth: string;
  sex: string;
  weight: string;
  height: string;
  primary_discipline: string;
  goal_category: string;
  notes: string;
  training_goal: string;
  athlete_level: string;
};

const initialForm: AthleteFormState = {
  name: "",
  date_of_birth: "",
  sex: "female",
  weight: "",
  height: "",
  primary_discipline: "running",
  goal_category: "media_distancia",
  notes: "",
  training_goal: "",
  athlete_level: "trained",
};

function disciplineLabel(value: string) {
  if (value === "running") return "Running";
  if (value === "ciclismo") return "Ciclismo";
  if (value === "triatlón") return "Triatlon";
  if (value === "natación") return "Natacion";
  return value;
}

function disciplineColorClass(value: string) {
  if (value === "natación") return "ap-disc-swim";
  if (value === "ciclismo") return "ap-disc-bike";
  if (value === "triatlón") return "ap-disc-tri";
  return "ap-disc-run";
}

function disciplineBadgeClass(value: string) {
  if (value === "natación") return "rd-disc-swim";
  if (value === "ciclismo") return "rd-disc-bike";
  if (value === "triatlón") return "rd-disc-tri";
  return "rd-disc-run";
}

function goalCategoryLabel(value?: string | null) {
  if (value === "larga_distancia") return "Larga distancia";
  if (value === "corta_distancia") return "Corta distancia";
  return "Media distancia";
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function avatarInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

function athleteToForm(athlete: Athlete): AthleteFormState {
  return {
    name: athlete.name,
    date_of_birth: athlete.date_of_birth,
    sex: athlete.sex,
    weight: String(athlete.weight ?? ""),
    height: athlete.height ? String(athlete.height) : "",
    primary_discipline: athlete.primary_discipline,
    goal_category: athlete.goal_category ?? "media_distancia",
    notes: athlete.notes ?? "",
    training_goal: athlete.training_goal ?? "",
    athlete_level: athlete.athlete_level ?? "trained",
  };
}

export function AthletesPage({ athletes, token, onRefresh }: AthletesPageProps) {
  const [form, setForm] = useState<AthleteFormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingAthleteId, setEditingAthleteId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState<string>("all");

  const editingAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === editingAthleteId) ?? null,
    [athletes, editingAthleteId],
  );
  const rosterStats = useMemo(() => {
    const withTargets = athletes.filter((athlete) =>
      (athlete.targets ?? []).some((target) => target.target_date >= new Date().toISOString().slice(0, 10)),
    ).length;
    const triathletes = athletes.filter((athlete) => athlete.primary_discipline === "triatlón").length;
    return [
      { label: "Atletas activos", value: String(athletes.length) },
      { label: "Con objetivo", value: String(withTargets) },
      { label: "Triatlon", value: String(triathletes) },
    ];
  }, [athletes]);
  const filteredAthletes = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return athletes.filter((athlete) => {
      const matchesDiscipline = disciplineFilter === "all" || athlete.primary_discipline === disciplineFilter;
      const matchesSearch =
        !normalizedSearch ||
        athlete.name.toLowerCase().includes(normalizedSearch) ||
        (athlete.training_goal ?? "").toLowerCase().includes(normalizedSearch) ||
        (athlete.notes ?? "").toLowerCase().includes(normalizedSearch);
      return matchesDiscipline && matchesSearch;
    });
  }, [athletes, disciplineFilter, search]);

  function closeModal() {
    setModalMode(null);
    setEditingAthleteId(null);
    setForm(initialForm);
    setError(null);
  }

  function openCreateModal() {
    setModalMode("create");
    setEditingAthleteId(null);
    setForm(initialForm);
    setError(null);
  }

  function openEditModal(athlete: Athlete) {
    setModalMode("edit");
    setEditingAthleteId(athlete.id);
    setForm(athleteToForm(athlete));
    setError(null);
  }

  function buildPayload(currentForm: AthleteFormState) {
    return {
      name: currentForm.name,
      date_of_birth: currentForm.date_of_birth,
      sex: currentForm.sex,
      weight: Number(currentForm.weight),
      height: currentForm.height ? Number(currentForm.height) : null,
      primary_discipline: currentForm.primary_discipline,
      goal_category: currentForm.goal_category,
      training_goal: currentForm.training_goal || null,
      notes: currentForm.notes || null,
      athlete_level: currentForm.athlete_level || "trained",
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (modalMode === "edit" && editingAthlete) {
        const payload = buildPayload(form);
        await api.updateAthlete(token, editingAthlete.id, payload);

        const nextWeight = Number(form.weight);
        if (Number.isFinite(nextWeight) && Math.abs(nextWeight - editingAthlete.weight) > 0.01) {
          await api.addAthleteWeight(token, editingAthlete.id, {
            recorded_at: new Date().toISOString().slice(0, 10),
            weight: nextWeight,
            source: "manual_edit",
          });
        }
      } else {
        await api.createAthlete(token, {
          ...buildPayload(form),
          created_at: new Date().toISOString().slice(0, 10),
          weights: form.weight
            ? [{ recorded_at: new Date().toISOString().slice(0, 10), weight: Number(form.weight), source: "manual" }]
            : [],
        });
      }

      await onRefresh();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : modalMode === "edit" ? "No se pudo actualizar el atleta." : "No se pudo crear el atleta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(athlete: Athlete) {
    const confirmed = window.confirm(`Eliminar a ${athlete.name}? Esta accion borrara sus sesiones asociadas.`);
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
    <div className="rd-page">
      {/* Command bar */}
      <div className="rd-page-header">
        <div className="rd-page-header-left">
          <h1 className="rd-page-title">Tus Atletas</h1>
          <span className="rd-eyebrow">{athletes.length} en roster</span>
        </div>
        <div className="rd-page-header-right">
          <input
            type="search"
            className="rd-search-input"
            placeholder="Buscar nombre, objetivo..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="rd-filter-bar">
            {[
              { key: "all", label: "Todos" },
              { key: "running", label: "Running" },
              { key: "ciclismo", label: "Ciclismo" },
              { key: "triatlón", label: "Triatlon" },
              { key: "natación", label: "Natacion" },
            ].map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`rd-filter-pill ${disciplineFilter === filter.key ? "active" : ""}`}
                onClick={() => setDisciplineFilter(filter.key)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <button className="rd-btn rd-btn-ghost" type="button" onClick={handleGenerateDemo} disabled={submitting}>
            Demo
          </button>
          <button className="rd-btn rd-btn-primary" type="button" onClick={openCreateModal}>
            + Atleta
          </button>
        </div>
      </div>

      {/* Metrics bar */}
      <div className="rd-metrics-bar">
        {rosterStats.map((stat) => (
          <div key={stat.label} className="rd-metric-pill">
            <span className="rd-metric-pill-label">{stat.label}</span>
            <span className="rd-metric-pill-value">{stat.value}</span>
          </div>
        ))}
      </div>

      {error ? <div style={{ padding: "8px 20px" }}><p className="rd-error">{error}</p></div> : null}

      {/* Athlete grid */}
      <div className="rd-grid">
        {filteredAthletes.map((athlete) => {
          const activeBlock = athlete.focus_blocks?.find((block) => block.status === "active");
          const nextTarget = (athlete.targets ?? [])
            .slice()
            .sort((left, right) => left.target_date.localeCompare(right.target_date))
            .find((target) => target.target_date >= new Date().toISOString().slice(0, 10));

          return (
            <div key={athlete.id} className={`ap-card ${disciplineColorClass(athlete.primary_discipline)}`}>
              <div className="ap-card-header">
                <div className="rd-avatar">{avatarInitial(athlete.name)}</div>
                <div className="ap-card-header-info">
                  <div className="ap-card-name">
                    <Link to={`/athletes/${athlete.id}`}>{athlete.name}</Link>
                  </div>
                  <div className="ap-card-meta">
                    <span className={`rd-disc-badge ${disciplineBadgeClass(athlete.primary_discipline)}`}>
                      {disciplineLabel(athlete.primary_discipline)}
                    </span>
                    <span style={{ fontSize: "0.62rem", color: "var(--muted)" }}>
                      {goalCategoryLabel(athlete.goal_category)}
                    </span>
                  </div>
                </div>
              </div>

              <p className="ap-card-summary">
                {athlete.training_goal || athlete.notes || "Sin notas iniciales."}
              </p>

              <div className="ap-card-metrics">
                <div className="ap-card-metric">
                  <span className="ap-card-metric-label">Peso</span>
                  <span className="ap-card-metric-value">{athlete.weight.toFixed(1)} kg</span>
                </div>
                <div className="ap-card-metric">
                  <span className="ap-card-metric-label">Alta</span>
                  <span className="ap-card-metric-value">{formatDate(athlete.created_at)}</span>
                </div>
                <div className="ap-card-metric">
                  <span className="ap-card-metric-label">Foco</span>
                  <span className="ap-card-metric-value">{activeBlock ? activeBlock.block_objective : "Sin foco"}</span>
                </div>
              </div>

              {nextTarget ? (
                <div className="ap-card-target">
                  <span className="ap-card-target-label">Objetivo:</span>
                  <span className="ap-card-target-value">{nextTarget.objective}</span>
                  <span className="ap-card-target-date">{formatDate(nextTarget.target_date)}</span>
                </div>
              ) : (
                <div className="ap-card-target">
                  <span className="ap-card-target-label">Sin objetivo definido</span>
                </div>
              )}

              <div className="ap-card-footer">
                <Link className="rd-btn rd-btn-sm" to={`/athletes/${athlete.id}`}>
                  Ficha
                </Link>
                <button className="rd-btn rd-btn-sm rd-btn-ghost" type="button" onClick={() => openEditModal(athlete)}>
                  Editar
                </button>
                <button className="rd-btn rd-btn-sm rd-btn-danger" type="button" onClick={() => handleDelete(athlete)}>
                  Eliminar
                </button>
              </div>
            </div>
          );
        })}
        {!filteredAthletes.length ? (
          <div className="rd-empty">
            <p>No hay atletas que encajen con ese filtro.</p>
            <button className="rd-btn rd-btn-ghost" type="button" onClick={() => {
              setSearch("");
              setDisciplineFilter("all");
            }}>
              Limpiar filtros
            </button>
          </div>
        ) : null}
      </div>

      {/* Create/Edit Modal */}
      {modalMode ? (
        <div className="rd-modal-backdrop" onClick={closeModal}>
          <div className="rd-modal rd-modal-lg" onClick={(event) => event.stopPropagation()}>
            <div className="rd-modal-header">
              <div>
                <h2 className="rd-page-title">{modalMode === "edit" ? `Editar ${editingAthlete?.name ?? "atleta"}` : "Nuevo atleta"}</h2>
                <p className="rd-page-subtitle">
                  {modalMode === "edit"
                    ? "Actualiza la informacion base del atleta."
                    : "Crea el atleta desde una ventana rapida."}
                </p>
              </div>
              <button className="rd-btn rd-btn-ghost" type="button" onClick={closeModal}>
                Cerrar
              </button>
            </div>

            <form className="rd-form" onSubmit={handleSubmit}>
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
                <input type="number" step="0.1" min="0" value={form.weight} onChange={(event) => setForm({ ...form, weight: event.target.value })} required />
              </label>
              <label>
                Altura (cm)
                <input type="number" step="0.1" min="0" value={form.height} onChange={(event) => setForm({ ...form, height: event.target.value })} />
              </label>
              <label>
                Disciplina
                <select value={form.primary_discipline} onChange={(event) => setForm({ ...form, primary_discipline: event.target.value })}>
                  <option value="running">Running</option>
                  <option value="ciclismo">Ciclismo</option>
                  <option value="triatlón">Triatlon</option>
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
              <label>
                Nivel del atleta
                <select value={form.athlete_level} onChange={(event) => setForm({ ...form, athlete_level: event.target.value })}>
                  <option value="recreational">Recreativo</option>
                  <option value="trained">Entrenado</option>
                  <option value="competitive">Competitivo</option>
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
              {error ? <p className="rd-error full-width">{error}</p> : null}
              <div className="button-row full-width">
                <button className="rd-btn rd-btn-ghost" type="button" onClick={closeModal} disabled={submitting}>
                  Cancelar
                </button>
                <button className="rd-btn rd-btn-primary" type="submit" disabled={submitting}>
                  {submitting ? "Guardando..." : modalMode === "edit" ? "Guardar cambios" : "Crear atleta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
