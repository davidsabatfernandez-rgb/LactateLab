import { useCallback, useState } from "react";

import { api } from "../../lib/api";
import type { Athlete, CoachPlan } from "../../types";
import type { PlanningAction } from "../context/PlanningContext";

const DAY_LABELS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

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

type LocalDay = {
  id: string;
  day_number: number;
  discipline: string;
  session_family: string;
  public_label: string;
  objective: string;
  intensity_zone: string;
  duration_min: string;
  description: string;
};

type TrainingPlanEditorProps = {
  token: string;
  athletes: Athlete[];
  dispatch: (action: PlanningAction) => void;
  onClose: () => void;
  editPlan?: CoachPlan | null;
  loadPlanningContext?: (athleteId: string, discipline: string) => Promise<void>;
  selectedDiscipline: string;
  athleteId: string | null;
};

export function TrainingPlanEditor({
  token,
  athletes,
  dispatch,
  onClose,
  editPlan,
  loadPlanningContext,
  selectedDiscipline,
  athleteId,
}: TrainingPlanEditorProps) {
  const [planName, setPlanName] = useState(editPlan?.name ?? "");
  const [planDesc, setPlanDesc] = useState(editPlan?.description ?? "");
  const [durationWeeks, setDurationWeeks] = useState(editPlan?.duration_weeks ?? 4);
  const [days, setDays] = useState<LocalDay[]>(() => {
    if (!editPlan) return [];
    return editPlan.days.map((d) => ({
      id: `existing-${d.id}`,
      day_number: d.day_number,
      discipline: d.discipline,
      session_family: d.session_family,
      public_label: d.public_label,
      objective: d.objective,
      intensity_zone: d.intensity_zone ?? "",
      duration_min: d.duration_min != null ? String(d.duration_min) : "",
      description: d.description ?? "",
    }));
  });

  const [addingToDay, setAddingToDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyAthleteId, setApplyAthleteId] = useState<string>(athleteId ?? "");
  const [applyStartDate, setApplyStartDate] = useState(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const monday = new Date(now.getTime() + daysUntilMonday * 86400000);
    return monday.toISOString().slice(0, 10);
  });
  const [savedPlanId, setSavedPlanId] = useState<number | null>(editPlan?.id ?? null);
  const [message, setMessage] = useState<string | null>(null);

  // New workout form
  const [newLabel, setNewLabel] = useState("");
  const [newDiscipline, setNewDiscipline] = useState(selectedDiscipline || "running");
  const [newFamily, setNewFamily] = useState("lt1_extensive");
  const [newZone, setNewZone] = useState("");
  const [newDuration, setNewDuration] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const addDay = useCallback(() => {
    if (addingToDay == null || !newLabel.trim()) return;
    setDays((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        day_number: addingToDay,
        discipline: newDiscipline,
        session_family: newFamily,
        public_label: newLabel.trim(),
        objective: "",
        intensity_zone: newZone.trim(),
        duration_min: newDuration,
        description: newDesc.trim(),
      },
    ]);
    setNewLabel(""); setNewZone(""); setNewDuration(""); setNewDesc("");
    setAddingToDay(null);
  }, [addingToDay, newLabel, newDiscipline, newFamily, newZone, newDuration, newDesc]);

  const removeDay = useCallback((id: string) => {
    setDays((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const handleSave = useCallback(async () => {
    if (!planName.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      let planId = savedPlanId;
      if (editPlan) {
        await api.updateCoachPlan(token, editPlan.id, {
          name: planName.trim(),
          description: planDesc.trim() || null,
          duration_weeks: durationWeeks,
        });
        // Delete old days, add new
        for (const d of editPlan.days) {
          try { await api.deleteDayFromPlan(token, editPlan.id, d.id); } catch { /* ignore */ }
        }
        planId = editPlan.id;
      } else {
        if (savedPlanId) {
          try { await api.deleteCoachPlan(token, savedPlanId); } catch { /* ignore */ }
        }
        const plan = (await api.createCoachPlan(token, {
          name: planName.trim(),
          description: planDesc.trim() || null,
          duration_weeks: durationWeeks,
        })) as CoachPlan;
        planId = plan.id;
      }
      for (const d of days) {
        await api.addDayToPlan(token, planId!, {
          day_number: d.day_number,
          discipline: d.discipline,
          session_family: d.session_family,
          public_label: d.public_label,
          objective: d.objective,
          intensity_zone: d.intensity_zone || null,
          duration_min: d.duration_min ? Number(d.duration_min) : null,
          description: d.description || null,
        });
      }
      setSavedPlanId(planId);
      // Reload plans
      const updated = (await api.listCoachPlans(token)) as CoachPlan[];
      dispatch({ type: "SET_COACH_PLANS", payload: updated });
      setMessage("Plan guardado");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [planName, planDesc, durationWeeks, days, token, savedPlanId, editPlan, dispatch]);

  const handleApply = useCallback(async () => {
    if (!savedPlanId || !applyAthleteId || !applyStartDate) return;
    setApplying(true);
    setMessage(null);
    try {
      await api.applyPlanToAthlete(token, savedPlanId, {
        athlete_id: Number(applyAthleteId),
        start_date: applyStartDate,
      });
      setMessage("Plan aplicado al atleta");
      if (loadPlanningContext && athleteId) {
        await loadPlanningContext(athleteId, selectedDiscipline);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al aplicar");
    } finally {
      setApplying(false);
    }
  }, [savedPlanId, applyAthleteId, applyStartDate, token, loadPlanningContext, athleteId, selectedDiscipline]);

  const discColor = (disc: string) => disc === "running" ? "#22c55e" : disc === "ciclismo" ? "#f59e0b" : "#0ea5e9";

  // Build week grid
  const weeks = Array.from({ length: durationWeeks }, (_, w) => w);

  return (
    <div className="plan-editor-overlay">
      <div className="plan-editor-modal">
        {/* Header */}
        <div className="plan-editor-header">
          <div className="plan-editor-header-left">
            <h3>{editPlan ? `Editar: ${editPlan.name}` : "Nuevo plan de entrenamiento"}</h3>
            <input
              type="text"
              className="planning-manual-input"
              placeholder="Nombre del plan (ej: IRONMAN Base 12 sem)"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              style={{ minWidth: 220 }}
            />
            <input
              type="text"
              className="planning-manual-input"
              placeholder="Descripción (opcional)"
              value={planDesc}
              onChange={(e) => setPlanDesc(e.target.value)}
              style={{ minWidth: 160 }}
            />
          </div>
          <div className="plan-editor-header-controls">
            <div className="plan-editor-weeks-control">
              <button type="button" className="plan-editor-weeks-btn" onClick={() => setDurationWeeks(Math.max(1, durationWeeks - 1))}>-</button>
              <span>{durationWeeks} sem</span>
              <button type="button" className="plan-editor-weeks-btn" onClick={() => setDurationWeeks(Math.min(52, durationWeeks + 1))}>+</button>
            </div>
            <button type="button" className="ghost-button" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        {/* Multi-week grid */}
        <div className="plan-editor-body">
          {/* Day headers */}
          <div className="plan-editor-week" style={{ marginBottom: 0 }}>
            <div />
            {DAY_LABELS.map((label) => (
              <div key={label} className="plan-editor-day-header">{label}</div>
            ))}
          </div>

          {weeks.map((weekIdx) => {
            const dayBase = weekIdx * 7;
            return (
              <div key={weekIdx} className="plan-editor-week">
                <div className="plan-editor-week-label">
                  <strong>Semana {weekIdx + 1}</strong>
                  <small>Día {dayBase + 1}</small>
                </div>
                {Array.from({ length: 7 }, (_, d) => {
                  const dayNum = dayBase + d;
                  const dayWorkouts = days.filter((w) => w.day_number === dayNum);
                  const isAdding = addingToDay === dayNum;
                  return (
                    <div key={d} className="plan-editor-cell" style={{ position: "relative" }}>
                      {dayWorkouts.map((w) => (
                        <div key={w.id} className="plan-editor-cell-workout" style={{ borderLeftColor: discColor(w.discipline) }}>
                          <div className="plan-editor-cell-workout-info">
                            <strong>{w.public_label}</strong>
                            <small>
                              {DISCIPLINE_OPTIONS.find((o) => o.value === w.discipline)?.label}
                              {w.intensity_zone ? ` · ${w.intensity_zone}` : ""}
                            </small>
                          </div>
                          <button
                            type="button"
                            className="planning-accordion-item-delete"
                            onClick={() => removeDay(w.id)}
                            style={{ fontSize: "0.6rem", padding: "1px 3px" }}
                          >
                            x
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="plan-editor-cell-add"
                        onClick={() => setAddingToDay(isAdding ? null : dayNum)}
                      >
                        +
                      </button>
                      {isAdding && (
                        <div className="plan-editor-add-form" onClick={(e) => e.stopPropagation()}>
                          <input type="text" className="planning-manual-input" placeholder="Nombre" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} autoFocus />
                          <div className="plan-editor-add-form-row">
                            <select className="planning-manual-input" value={newDiscipline} onChange={(e) => setNewDiscipline(e.target.value)}>
                              {DISCIPLINE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <select className="planning-manual-input" value={newFamily} onChange={(e) => setNewFamily(e.target.value)}>
                              {FAMILY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                          <div className="plan-editor-add-form-row">
                            <input type="text" className="planning-manual-input" placeholder="Zona" value={newZone} onChange={(e) => setNewZone(e.target.value)} />
                            <input type="number" className="planning-manual-input" placeholder="Min" value={newDuration} onChange={(e) => setNewDuration(e.target.value)} style={{ width: 55 }} />
                          </div>
                          <div className="plan-editor-add-form-row">
                            <button type="button" className="planning-manual-save-btn" disabled={!newLabel.trim()} onClick={addDay}>OK</button>
                            <button type="button" className="ghost-button" onClick={() => setAddingToDay(null)}>x</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="plan-editor-footer">
          <div className="plan-editor-footer-left">
            <button
              type="button"
              className="planning-manual-save-btn"
              disabled={!planName.trim() || saving}
              onClick={handleSave}
            >
              {saving ? "Guardando..." : savedPlanId ? "Actualizar plan" : "Guardar plan"}
            </button>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{days.length} sesiones</span>
            {message && <span className="plan-editor-message">{message}</span>}
          </div>

          {savedPlanId && (
            <div className="plan-editor-apply-section">
              <span className="plan-editor-apply-label">Aplicar plan:</span>
              <select className="planning-manual-input" value={applyAthleteId} onChange={(e) => setApplyAthleteId(e.target.value)}>
                <option value="">Seleccionar atleta</option>
                {athletes.map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
              </select>
              <input type="date" className="planning-manual-input" value={applyStartDate} onChange={(e) => setApplyStartDate(e.target.value)} title="Fecha inicio (lunes)" />
              <button type="button" className="planning-manual-save-btn" disabled={!applyAthleteId || !applyStartDate || applying} onClick={handleApply}>
                {applying ? "Aplicando..." : "Aplicar"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
