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
  if (value === "running") return "Carrera a pie";
  if (value === "ciclismo") return "Ciclismo";
  if (value === "triatlón") return "Triatlón";
  if (value === "natación") return "Natación";
  return value;
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
      { label: "Atletas activos", value: String(athletes.length), tone: "neutral" },
      { label: "Con objetivo visible", value: String(withTargets), tone: "warning" },
      { label: "Triatlón", value: String(triathletes), tone: "neutral" },
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
      <section className="page-header athlete-roster-header">
        <div>
          <span className="eyebrow">Athletes</span>
          <h1>Tus Atletas</h1>
        </div>
        <div className="athlete-roster-actions">
          <button className="ghost-button" type="button" onClick={handleGenerateDemo} disabled={submitting}>
            Generar atleta demo
          </button>
          <button className="primary-button" type="button" onClick={openCreateModal}>
            Añadir atleta
          </button>
        </div>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <section className="athlete-roster-overview">
        {rosterStats.map((stat) => (
          <article key={stat.label} className={`card athlete-roster-stat ${stat.tone}`}>
            <span className="eyebrow">{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>

      <section className="card athlete-roster-toolbar">
        <label className="athlete-roster-search">
          <span className="eyebrow">Buscar</span>
          <input
            type="search"
            placeholder="Nombre, objetivo o notas"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="athlete-roster-filters">
          {[
            { key: "all", label: "Todos" },
            { key: "running", label: "Running" },
            { key: "ciclismo", label: "Ciclismo" },
            { key: "triatlón", label: "Triatlón" },
          ].map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`athlete-roster-filter-pill ${disciplineFilter === filter.key ? "active" : ""}`}
              onClick={() => setDisciplineFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      <section className="athlete-roster-grid">
        {filteredAthletes.map((athlete) => {
          const activeBlock = athlete.focus_blocks?.find((block) => block.status === "active");
          const nextTarget = (athlete.targets ?? [])
            .slice()
            .sort((left, right) => left.target_date.localeCompare(right.target_date))
            .find((target) => target.target_date >= new Date().toISOString().slice(0, 10));
          const disciplineClass =
            athlete.primary_discipline === "triatlón"
              ? "triathlon"
              : athlete.primary_discipline === "ciclismo"
                ? "cycling"
                : "running";

          return (
            <article key={athlete.id} className={`card athlete-roster-card ${disciplineClass}`}>
              <div className="athlete-roster-card-head">
                <div className="athlete-roster-card-title">
                  <div className="athlete-roster-avatar" aria-hidden="true">
                    {athlete.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                  <span className="eyebrow">{disciplineLabel(athlete.primary_discipline)}</span>
                  <h2>{athlete.name}</h2>
                  </div>
                </div>
                <span className="status-badge neutral">{goalCategoryLabel(athlete.goal_category)}</span>
              </div>

              <p className="athlete-roster-summary">
                {athlete.training_goal || athlete.notes || "Sin notas iniciales todavía. Entra para añadir contexto y trabajar mejor la ficha del atleta."}
              </p>

              <div className="athlete-roster-metadata">
                <div className="athlete-roster-meta-pill">
                  <small>Peso</small>
                  <strong>{athlete.weight.toFixed(1)} kg</strong>
                </div>
                <div className="athlete-roster-meta-pill">
                  <small>Alta</small>
                  <strong>{formatDate(athlete.created_at)}</strong>
                </div>
                <div className="athlete-roster-meta-pill">
                  <small>Foco</small>
                  <strong>{activeBlock ? activeBlock.block_objective : "Sin foco"}</strong>
                </div>
              </div>

              <div className="athlete-roster-footer">
                <div className="athlete-roster-target">
                  <small>Próximo objetivo</small>
                  <strong>{nextTarget ? nextTarget.objective : "Sin objetivo definido"}</strong>
                  <span>{nextTarget ? formatDate(nextTarget.target_date) : "Añádelo desde la ficha del atleta"}</span>
                </div>
                <div className="athlete-roster-card-actions">
                  <Link className="inline-link" to={`/athletes/${athlete.id}`}>
                    Abrir ficha
                  </Link>
                  <button className="ghost-button compact" type="button" onClick={() => openEditModal(athlete)}>
                    Editar
                  </button>
                  <button className="danger-link" type="button" onClick={() => handleDelete(athlete)}>
                    Eliminar
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!filteredAthletes.length ? (
          <article className="card athlete-roster-empty">
            <span className="eyebrow">Sin resultados</span>
            <h2>No hay atletas que encajen con ese filtro</h2>
            <p className="muted">Prueba otro texto de búsqueda o cambia la disciplina activa para volver a ver la plantilla completa.</p>
            <button className="ghost-button" type="button" onClick={() => {
              setSearch("");
              setDisciplineFilter("all");
            }}>
              Limpiar filtros
            </button>
          </article>
        ) : null}
      </section>

      {modalMode ? (
        <div className="target-modal-backdrop" onClick={closeModal}>
          <section className="card target-modal-card athlete-management-modal" onClick={(event) => event.stopPropagation()}>
            <div className="card-header">
              <div>
                <span className="eyebrow">{modalMode === "edit" ? "Editar atleta" : "Nuevo atleta"}</span>
                <h2>{modalMode === "edit" ? `Editar ${editingAthlete?.name ?? "atleta"}` : "Añadir atleta"}</h2>
                <p className="muted">
                  {modalMode === "edit"
                    ? "Actualiza la información base del atleta sin salir de la plantilla."
                    : "Crea el atleta desde una ventana rápida y mantén la página limpia."}
                </p>
              </div>
              <button className="ghost-button" type="button" onClick={closeModal}>
                Cerrar
              </button>
            </div>

            <form className="athlete-form athlete-management-form" onSubmit={handleSubmit}>
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
              {error ? <p className="error full-width">{error}</p> : null}
              <div className="button-row full-width athlete-management-actions">
                <button className="ghost-button" type="button" onClick={closeModal} disabled={submitting}>
                  Cancelar
                </button>
                <button className="primary-button" type="submit" disabled={submitting}>
                  {submitting ? "Guardando..." : modalMode === "edit" ? "Guardar cambios" : "Crear atleta"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
