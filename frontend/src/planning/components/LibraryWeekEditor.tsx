import { useCallback, useState } from "react";

import { api } from "../../lib/api";
import type { Athlete, CoachLibrary } from "../../types";
import type { PlanningAction } from "../context/PlanningContext";

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const FAMILY_OPTIONS = [
  { value: "recovery_regeneration", label: "Recuperación" },
  { value: "long_aerobic_durability", label: "Base / Aeróbico" },
  { value: "lt1_extensive", label: "LT1" },
  { value: "subthreshold_reps", label: "Subumbral" },
  { value: "lt2_cruise_intervals", label: "LT2 / Umbral" },
  { value: "vo2_hills", label: "VO2max" },
  { value: "economy_strides", label: "Técnica" },
  { value: "strength", label: "Fuerza" },
  { value: "specific", label: "Específico / Competición" },
  { value: "other", label: "Otro" },
];

const DISCIPLINE_OPTIONS = [
  { value: "running", label: "Running" },
  { value: "ciclismo", label: "Ciclismo" },
  { value: "natación", label: "Natación" },
];

type LocalWorkout = {
  id: string; // temp client-side id
  day_offset: number;
  discipline: string;
  session_family: string;
  public_label: string;
  objective: string;
  intensity_zone: string;
  duration_min: string;
  description: string;
};

type LibraryWeekEditorProps = {
  token: string;
  athletes: Athlete[];
  dispatch: (action: PlanningAction) => void;
  onClose: () => void;
  /** If editing an existing library, pre-populate */
  editLibrary?: CoachLibrary | null;
  /** Reload planning after apply */
  loadPlanningContext?: (athleteId: string, discipline: string) => Promise<void>;
  selectedDiscipline: string;
  athleteId: string | null;
};

export function LibraryWeekEditor({
  token,
  athletes,
  dispatch,
  onClose,
  editLibrary,
  loadPlanningContext,
  selectedDiscipline,
  athleteId,
}: LibraryWeekEditorProps) {
  const [libraryName, setLibraryName] = useState(editLibrary?.name ?? "");
  const [libraryDesc, setLibraryDesc] = useState(editLibrary?.description ?? "");
  const [workouts, setWorkouts] = useState<LocalWorkout[]>(() => {
    if (!editLibrary) return [];
    return editLibrary.workouts.map((w) => ({
      id: `existing-${w.id}`,
      day_offset: w.day_offset,
      discipline: w.discipline,
      session_family: w.session_family,
      public_label: w.public_label,
      objective: w.objective,
      intensity_zone: w.intensity_zone ?? "",
      duration_min: w.duration_min != null ? String(w.duration_min) : "",
      description: w.description ?? "",
    }));
  });

  const [addingToDay, setAddingToDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyAthleteId, setApplyAthleteId] = useState<string>(athleteId ?? "");
  const [applyStartDate, setApplyStartDate] = useState(() => {
    // Default to next Monday
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const monday = new Date(now.getTime() + daysUntilMonday * 86400000);
    return monday.toISOString().slice(0, 10);
  });
  const [savedLibraryId, setSavedLibraryId] = useState<number | null>(editLibrary?.id ?? null);
  const [message, setMessage] = useState<string | null>(null);

  // New workout form state
  const [newLabel, setNewLabel] = useState("");
  const [newDiscipline, setNewDiscipline] = useState(selectedDiscipline || "running");
  const [newFamily, setNewFamily] = useState("lt1_extensive");
  const [newZone, setNewZone] = useState("");
  const [newDuration, setNewDuration] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const addWorkout = useCallback(() => {
    if (addingToDay == null || !newLabel.trim()) return;
    setWorkouts((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        day_offset: addingToDay,
        discipline: newDiscipline,
        session_family: newFamily,
        public_label: newLabel.trim(),
        objective: "",
        intensity_zone: newZone.trim(),
        duration_min: newDuration,
        description: newDesc.trim(),
      },
    ]);
    setNewLabel("");
    setNewZone("");
    setNewDuration("");
    setNewDesc("");
    setAddingToDay(null);
  }, [addingToDay, newLabel, newDiscipline, newFamily, newZone, newDuration, newDesc]);

  const removeWorkout = useCallback((id: string) => {
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const handleSaveLibrary = useCallback(async () => {
    if (!libraryName.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      // If editing, delete old library first, then recreate
      if (savedLibraryId && !editLibrary) {
        // Library was already saved in this session — delete and recreate
        try { await api.deleteCoachLibrary(token, savedLibraryId); } catch { /* ignore */ }
      }
      if (editLibrary) {
        // Delete old workouts, add new ones
        for (const w of editLibrary.workouts) {
          try { await api.deleteWorkoutFromLibrary(token, editLibrary.id, w.id); } catch { /* ignore */ }
        }
        for (const w of workouts) {
          await api.addWorkoutToLibrary(token, editLibrary.id, {
            day_offset: w.day_offset,
            discipline: w.discipline,
            session_family: w.session_family,
            public_label: w.public_label,
            objective: w.objective,
            intensity_zone: w.intensity_zone || null,
            duration_min: w.duration_min ? Number(w.duration_min) : null,
            description: w.description || null,
          });
        }
        setSavedLibraryId(editLibrary.id);
      } else {
        const lib = (await api.createCoachLibrary(token, {
          name: libraryName.trim(),
          description: libraryDesc.trim() || null,
        })) as CoachLibrary;
        for (const w of workouts) {
          await api.addWorkoutToLibrary(token, lib.id, {
            day_offset: w.day_offset,
            discipline: w.discipline,
            session_family: w.session_family,
            public_label: w.public_label,
            objective: w.objective,
            intensity_zone: w.intensity_zone || null,
            duration_min: w.duration_min ? Number(w.duration_min) : null,
            description: w.description || null,
          });
        }
        setSavedLibraryId(lib.id);
      }
      // Reload libraries in state
      const updated = (await api.listCoachLibraries(token)) as CoachLibrary[];
      dispatch({ type: "SET_COACH_LIBRARIES", payload: updated });
      setMessage("Biblioteca guardada");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [libraryName, libraryDesc, workouts, token, savedLibraryId, editLibrary, dispatch]);

  const handleApply = useCallback(async () => {
    if (!savedLibraryId || !applyAthleteId || !applyStartDate) return;
    setApplying(true);
    setMessage(null);
    try {
      await api.applyLibraryToAthlete(token, savedLibraryId, {
        athlete_id: Number(applyAthleteId),
        start_date: applyStartDate,
      });
      setMessage("Semana aplicada al atleta");
      if (loadPlanningContext && athleteId) {
        await loadPlanningContext(athleteId, selectedDiscipline);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al aplicar");
    } finally {
      setApplying(false);
    }
  }, [savedLibraryId, applyAthleteId, applyStartDate, token, loadPlanningContext, athleteId, selectedDiscipline]);

  const familyLabel = (family: string) => FAMILY_OPTIONS.find((o) => o.value === family)?.label ?? family;
  const discColor = (disc: string) => disc === "running" ? "#22c55e" : disc === "ciclismo" ? "#f59e0b" : "#0ea5e9";

  return (
    <div className="library-week-editor-overlay">
      <div className="library-week-editor-modal">
        {/* Header */}
        <div className="library-week-editor-header">
          <div className="library-week-editor-header-left">
            <h3>{editLibrary ? "Editar biblioteca" : "Nueva biblioteca semanal"}</h3>
            <div className="library-week-editor-name-row">
              <input
                type="text"
                className="planning-manual-input"
                placeholder="Nombre (ej: IRONMAN Base Semana 1)"
                value={libraryName}
                onChange={(e) => setLibraryName(e.target.value)}
                disabled={!!editLibrary}
              />
              <input
                type="text"
                className="planning-manual-input"
                placeholder="Descripción (opcional)"
                value={libraryDesc}
                onChange={(e) => setLibraryDesc(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>Cerrar</button>
        </div>

        {/* 7-day grid */}
        <div className="library-week-grid">
          {DAY_LABELS.map((dayLabel, dayIndex) => {
            const dayWorkouts = workouts.filter((w) => w.day_offset === dayIndex);
            return (
              <div key={dayIndex} className="library-week-day">
                <div className="library-week-day-header">
                  <strong>{dayLabel}</strong>
                  <small>{dayWorkouts.length} sesiones</small>
                </div>
                <div className="library-week-day-body">
                  {dayWorkouts.map((w) => (
                    <div key={w.id} className="library-week-workout-card" style={{ borderLeftColor: discColor(w.discipline) }}>
                      <div className="library-week-workout-info">
                        <strong>{w.public_label}</strong>
                        <small>
                          {DISCIPLINE_OPTIONS.find((d) => d.value === w.discipline)?.label}
                          {" · "}
                          {w.intensity_zone || familyLabel(w.session_family)}
                          {w.duration_min ? ` · ${w.duration_min}'` : ""}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="planning-accordion-item-delete"
                        title="Quitar"
                        onClick={() => removeWorkout(w.id)}
                      >
                        x
                      </button>
                    </div>
                  ))}

                  {/* Add workout form for this day */}
                  {addingToDay === dayIndex ? (
                    <div className="library-week-add-form">
                      <input
                        type="text"
                        className="planning-manual-input"
                        placeholder="Nombre del entreno"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        autoFocus
                      />
                      <div className="library-week-form-row">
                        <select
                          className="planning-manual-input"
                          value={newDiscipline}
                          onChange={(e) => setNewDiscipline(e.target.value)}
                        >
                          {DISCIPLINE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <select
                          className="planning-manual-input"
                          value={newFamily}
                          onChange={(e) => setNewFamily(e.target.value)}
                        >
                          {FAMILY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="library-week-form-row">
                        <input
                          type="text"
                          className="planning-manual-input"
                          placeholder="Zona (ej: LT2)"
                          value={newZone}
                          onChange={(e) => setNewZone(e.target.value)}
                        />
                        <input
                          type="number"
                          className="planning-manual-input"
                          placeholder="Min"
                          value={newDuration}
                          onChange={(e) => setNewDuration(e.target.value)}
                          style={{ width: 70 }}
                        />
                      </div>
                      <textarea
                        className="planning-manual-textarea"
                        placeholder="Descripción (opcional)"
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        rows={2}
                      />
                      <div className="library-week-form-row">
                        <button
                          type="button"
                          className="planning-manual-save-btn"
                          disabled={!newLabel.trim()}
                          onClick={addWorkout}
                        >
                          Añadir
                        </button>
                        <button type="button" className="ghost-button" onClick={() => setAddingToDay(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="library-week-add-btn"
                      onClick={() => setAddingToDay(dayIndex)}
                    >
                      + Sesión
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: Save + Apply */}
        <div className="library-week-editor-footer">
          <div className="library-week-editor-footer-left">
            <button
              type="button"
              className="planning-manual-save-btn"
              disabled={!libraryName.trim() || !workouts.length || saving}
              onClick={handleSaveLibrary}
            >
              {saving ? "Guardando..." : savedLibraryId ? "Actualizar biblioteca" : "Guardar biblioteca"}
            </button>
            {message && <span className="library-week-message">{message}</span>}
          </div>

          {savedLibraryId && (
            <div className="library-week-apply-section">
              <span className="library-week-apply-label">Aplicar a atleta:</span>
              <select
                className="planning-manual-input"
                value={applyAthleteId}
                onChange={(e) => setApplyAthleteId(e.target.value)}
              >
                <option value="">Seleccionar atleta</option>
                {athletes.map((a) => (
                  <option key={a.id} value={String(a.id)}>{a.name}</option>
                ))}
              </select>
              <input
                type="date"
                className="planning-manual-input"
                value={applyStartDate}
                onChange={(e) => setApplyStartDate(e.target.value)}
                title="Lunes de la semana"
              />
              <button
                type="button"
                className="planning-manual-save-btn"
                disabled={!applyAthleteId || !applyStartDate || applying}
                onClick={handleApply}
              >
                {applying ? "Aplicando..." : "Aplicar semana"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
