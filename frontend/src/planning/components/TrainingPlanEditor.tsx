import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../lib/api";
import type { Athlete, CoachPlan, TrainingZoneItem } from "../../types";
import type { PlanningAction } from "../context/PlanningContext";
import {
  type WBlock,
  WorkoutBuilderModal,
  WorkoutBlocksSummary,
  computeWorkoutStats,
  parseBlocksFromDescription,
  serializeBlocks,
} from "./WorkoutBlockBuilder";

const DAY_LABELS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const DISCIPLINE_OPTIONS = [
  { value: "running", label: "Running", color: "#22c55e" },
  { value: "ciclismo", label: "Ciclismo", color: "#f59e0b" },
  { value: "natación", label: "Natación", color: "#0ea5e9" },
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

  // Load athlete zones
  const [coachZones, setCoachZones] = useState<TrainingZoneItem[] | null>(null);
  useEffect(() => {
    if (!athleteId) return;
    const disc = selectedDiscipline || "running";
    api.activeTrainingZoneSet(token, Number(athleteId), disc)
      .then((zs: unknown) => {
        const set = zs as { zones?: TrainingZoneItem[] };
        if (set?.zones) setCoachZones(set.zones);
      })
      .catch(() => setCoachZones(null));
  }, [athleteId, selectedDiscipline, token]);

  // Block builder state for adding workouts
  const [builderBlocks, setBuilderBlocks] = useState<WBlock[]>([]);
  const [builderName, setBuilderName] = useState("");
  const [builderDiscipline, setBuilderDiscipline] = useState(selectedDiscipline || "running");
  const [builderFamily, setBuilderFamily] = useState("lt1_extensive");

  const resetBuilder = useCallback(() => {
    setBuilderBlocks([]);
    setBuilderName("");
    setBuilderFamily("lt1_extensive");
    setAddingToDay(null);
  }, []);

  const addDay = useCallback(() => {
    if (addingToDay == null || !builderName.trim() || builderBlocks.length === 0) return;
    const stats = computeWorkoutStats(builderBlocks, builderDiscipline);
    const description = serializeBlocks(builderBlocks, builderDiscipline);
    // Determine main zone from blocks
    const mainBlock = builderBlocks.find((b) => b.type === "steady" || b.type === "intervals") ?? builderBlocks[0];
    setDays((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        day_number: addingToDay,
        discipline: builderDiscipline,
        session_family: builderFamily,
        public_label: builderName.trim(),
        objective: "",
        intensity_zone: mainBlock?.zone ?? "",
        duration_min: String(stats.totalMin),
        description,
      },
    ]);
    resetBuilder();
  }, [addingToDay, builderName, builderBlocks, builderDiscipline, builderFamily, resetBuilder]);

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

  const discColor = (disc: string) => DISCIPLINE_OPTIONS.find((o) => o.value === disc)?.color ?? "#888";

  // ── Accumulated stats ──

  const planStats = useMemo(() => {
    const acc: Record<string, { km: number; tss: number; hours: number; sessions: number }> = {};
    for (const disc of ["running", "ciclismo", "natación"]) {
      acc[disc] = { km: 0, tss: 0, hours: 0, sessions: 0 };
    }
    for (const d of days) {
      const disc = d.discipline;
      if (!acc[disc]) acc[disc] = { km: 0, tss: 0, hours: 0, sessions: 0 };
      acc[disc].sessions++;
      // Try parsing blocks from description
      const blocks = parseBlocksFromDescription(d.description);
      if (blocks && blocks.length > 0) {
        const stats = computeWorkoutStats(blocks, disc);
        acc[disc].km += stats.totalKm;
        acc[disc].tss += stats.totalTSS;
        acc[disc].hours += stats.totalMin / 60;
      } else if (d.duration_min) {
        // Fallback: use duration_min with a rough IF estimate
        const dur = Number(d.duration_min);
        acc[disc].hours += dur / 60;
        acc[disc].tss += 0.7 * 0.7 * (dur / 60) * 100; // ~IF 0.7 as estimate
      }
    }
    return acc;
  }, [days]);

  const totalHours = Object.values(planStats).reduce((s, v) => s + v.hours, 0);
  const totalTSS = Object.values(planStats).reduce((s, v) => s + v.tss, 0);

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

        {/* Accumulated stats bar */}
        <div className="plan-editor-stats-bar">
          {DISCIPLINE_OPTIONS.map((disc) => {
            const s = planStats[disc.value];
            if (!s || s.sessions === 0) return null;
            return (
              <div key={disc.value} className="plan-editor-disc-stat">
                <div className="plan-editor-disc-dot" style={{ background: disc.color }} />
                <div className="plan-editor-disc-stat-values">
                  <strong>{disc.label}</strong>
                  <span>{s.sessions} ses</span>
                  <span>{s.km.toFixed(1)} km</span>
                  <span>{Math.round(s.tss)} TSS</span>
                  <span>{s.hours.toFixed(1)} h</span>
                </div>
              </div>
            );
          })}
          {days.length > 0 && (
            <div className="plan-editor-disc-stat" style={{ marginLeft: "auto" }}>
              <div className="plan-editor-disc-stat-values">
                <strong>Total</strong>
                <span>{days.length} ses</span>
                <span>{Math.round(totalTSS)} TSS</span>
                <span>{totalHours.toFixed(1)} h</span>
              </div>
            </div>
          )}
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
                      {dayWorkouts.map((w) => {
                        const blocks = parseBlocksFromDescription(w.description);
                        return (
                          <div key={w.id} className="plan-editor-cell-workout" style={{ borderLeftColor: discColor(w.discipline) }}>
                            <div className="plan-editor-cell-workout-info">
                              <strong>{w.public_label}</strong>
                              {blocks && blocks.length > 0 ? (
                                <div className="plan-editor-cell-workout-blocks">
                                  <WorkoutBlocksSummary description={w.description} discipline={w.discipline} />
                                </div>
                              ) : (
                                <small>
                                  {DISCIPLINE_OPTIONS.find((o) => o.value === w.discipline)?.label}
                                  {w.intensity_zone ? ` · ${w.intensity_zone}` : ""}
                                  {w.duration_min ? ` · ${w.duration_min}'` : ""}
                                </small>
                              )}
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
                        );
                      })}
                      <button
                        type="button"
                        className="plan-editor-cell-add"
                        onClick={() => {
                          if (isAdding) {
                            resetBuilder();
                          } else {
                            setAddingToDay(dayNum);
                          }
                        }}
                      >
                        +
                      </button>
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

      {/* Workout builder modal */}
      {addingToDay != null && (
        <WorkoutBuilderModal
          blocks={builderBlocks}
          discipline={builderDiscipline}
          name={builderName}
          family={builderFamily}
          onChange={(u) => {
            if (u.blocks !== undefined) setBuilderBlocks(u.blocks);
            if (u.discipline !== undefined) setBuilderDiscipline(u.discipline);
            if (u.name !== undefined) setBuilderName(u.name);
            if (u.family !== undefined) setBuilderFamily(u.family);
          }}
          onSave={addDay}
          onCancel={resetBuilder}
          saveLabel="Añadir al día"
          title={`Nuevo entreno — ${DAY_LABELS[addingToDay % 7]} (Semana ${Math.floor(addingToDay / 7) + 1})`}
          coachZones={coachZones}
        />
      )}
    </div>
  );
}
