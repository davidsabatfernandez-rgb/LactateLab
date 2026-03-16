import React, { useState, useRef, useCallback, useMemo, type KeyboardEvent } from "react";
import { MicroContent } from "./MicroContent";
import { disciplineLabel } from "../utils/formatters";
import type { PlanningPlannedSession, WorkoutStep } from "../../types";

/* ── Types ───────────────────────────────────────────────────── */

type Step = {
  label: string;
  durationMin?: number;
  zone?: string;
  zoneColor?: string;
  /** For repeat children: how many reps exist */
  repeatCount?: number;
  /** Index within a repeat group (1-based), undefined for non-repeat steps */
  repIndex?: number;
  /** Unique key for grouping reps of same block */
  repeatGroupId?: string;
};

export type StepValue = {
  step: string;
  lactate: number | null;
};

export type LactateSubmission = {
  sessionId: number | null;
  sessionLabel: string;
  discipline: string;
  values: StepValue[];
};

type LactateStepInputProps = {
  /** All planned sessions available for selection (today + recent) */
  sessions: PlanningPlannedSession[];
  onSubmit: (submission: LactateSubmission) => void;
};

/* ── Zone color mapping ──────────────────────────────────────── */

const ZONE_COLORS: Record<string, string> = {
  easy: "#58a6ff", LT1: "#3fb950", "SUB-T": "#d29922",
  LT2: "#db6d28", VO2: "#f85149", MAX: "#bc4c9c", free: "#8b949e",
};

function resolveZone(target?: { target_type?: string; label?: string | null } | null, intensityLabel?: string | null, stepType?: string): string {
  if (stepType === "warmup" || stepType === "cooldown" || stepType === "recovery") return "easy";
  if (target?.target_type === "easy") return "easy";
  const l = (target?.label ?? "").toLowerCase();
  if (l.includes("vo2")) return "VO2";
  if (l.includes("max") || l.includes("sprint")) return "MAX";
  if (l.includes("lt2") || l.includes("umbral") || l.includes("threshold")) return "LT2";
  if (l.includes("sub-t") || l.includes("zona media")) return "SUB-T";
  if (l.includes("lt1") || l.includes("aerob") || l.includes("aerób")) return "LT1";
  if (l.includes("suave") || l.includes("easy") || l.includes("recup")) return "easy";
  const il = (intensityLabel ?? "").toLowerCase();
  if (il === "warmup" || il === "cooldown" || il === "recovery") return "easy";
  if (il.includes("vo2")) return "VO2";
  if (il.includes("lt2") || il.includes("threshold")) return "LT2";
  if (il.includes("lt1")) return "LT1";
  return "free";
}

function stepTypeLabel(t: string): string {
  switch (t) {
    case "warmup": return "Calentamiento";
    case "cooldown": return "Enfriamiento";
    case "recovery": return "Recuperación";
    case "interval": return "Intervalo";
    case "steady": return "Continuo";
    case "repeat": return "Serie";
    default: return t;
  }
}

function fmtDur(lengthType: string, val?: number | null): string {
  if (!val) return "";
  if (lengthType === "time") {
    const s = Math.round(val);
    if (s < 60) return `${s}"`;
    const m = Math.floor(s / 60);
    return `${m}'`;
  }
  if (lengthType === "distance") {
    if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}km`;
    return `${Math.round(val)}m`;
  }
  return "";
}

/* ── Extract blocks from workout structure ────────────────────── */

function extractStepsFromWorkout(session: PlanningPlannedSession): Step[] {
  const workout = session.structured_workout_payload;
  if (!workout?.steps?.length) {
    // Fallback: generate generic steps from dose_prescription
    return [
      { label: "Calentamiento" },
      { label: "Bloque principal" },
      { label: "Enfriamiento" },
    ];
  }

  const result: Step[] = [];

  let repeatGroupCounter = 0;

  function processStep(step: WorkoutStep, prefix?: string) {
    if (step.step_type === "repeat" && step.children?.length) {
      const count = step.repeat_count ?? 1;
      repeatGroupCounter++;
      const groupId = `rg-${repeatGroupCounter}`;
      // For each child type (skip recovery), emit one row per repetition
      for (const child of step.children) {
        if (child.step_type === "recovery") continue;
        const zone = resolveZone(child.target, child.intensity_label, child.step_type);
        const dur = child.length_value
          ? fmtDur(child.length_type, child.length_value)
          : "";
        const durMin = child.length_type === "time" && child.length_value
          ? Math.round(child.length_value / 60)
          : undefined;
        const zoneLabel = child.target?.label ?? zone;
        for (let rep = 1; rep <= count; rep++) {
          result.push({
            label: `Rep ${rep}/${count} · ${dur || stepTypeLabel(child.step_type)} ${zoneLabel}`.trim(),
            durationMin: durMin,
            zone,
            zoneColor: ZONE_COLORS[zone],
            repeatCount: count,
            repIndex: rep,
            repeatGroupId: groupId,
          });
        }
      }
      return;
    }

    const zone = resolveZone(step.target, step.intensity_label, step.step_type);
    const dur = fmtDur(step.length_type, step.length_value);
    const durMin = step.length_type === "time" && step.length_value
      ? Math.round(step.length_value / 60)
      : undefined;
    const label = prefix
      ? `${prefix} · ${dur || stepTypeLabel(step.step_type)}`
      : `${stepTypeLabel(step.step_type)}${dur ? ` ${dur}` : ""}`;
    result.push({
      label,
      durationMin: durMin,
      zone,
      zoneColor: ZONE_COLORS[zone],
    });
  }

  for (const step of workout.steps) {
    processStep(step);
  }

  return result;
}

/* ── Feedback interpretation ─────────────────────────────────── */

function interpretFeedback(values: StepValue[]): string | null {
  const filled = values.filter((v) => v.lactate !== null) as Array<{ step: string; lactate: number }>;
  if (filled.length < 2) return null;
  const last = filled[filled.length - 1].lactate;
  const first = filled[0].lactate;
  const maxLac = Math.max(...filled.map((v) => v.lactate));
  if (maxLac < 2.0) return "Todos los valores en zona aeróbica baja — intensidad muy cómoda.";
  if (last > 4.0 && first < 2.0) return "Buena progresión: se ve la transición de aeróbico a alta intensidad.";
  if (last - first < 0.5) return "Valores estables — la intensidad se mantuvo constante.";
  if (last > first) return "Tendencia ascendente: la fatiga metabólica se fue acumulando.";
  return "Valores registrados correctamente.";
}

/* ── Component ───────────────────────────────────────────────── */

export function LactateStepInput({ sessions, onSubmit }: LactateStepInputProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    sessions.length === 1 ? sessions[0].id : null,
  );
  const [values, setValues] = useState<string[]>([]);
  const [enabledReps, setEnabledReps] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  const steps = useMemo(() => {
    if (!selectedSession) return [];
    return extractStepsFromWorkout(selectedSession);
  }, [selectedSession]);

  // Reset values when session changes
  const handleSelectSession = useCallback((id: number) => {
    setSelectedSessionId(id);
    setValues([]);
    setEnabledReps(new Set());
    setSubmitted(false);
    setFeedback(null);
  }, []);

  // Initialize values array and enable non-repeat steps by default
  useMemo(() => {
    if (steps.length > 0 && values.length !== steps.length) {
      setValues(steps.map(() => ""));
      // By default enable all non-repeat steps, and for repeats only the first and last
      const enabled = new Set<number>();
      steps.forEach((s, i) => {
        if (!s.repeatGroupId) {
          enabled.add(i);
        } else if (s.repIndex === 1 || s.repIndex === s.repeatCount) {
          enabled.add(i);
        }
      });
      setEnabledReps(enabled);
    }
  }, [steps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRep = useCallback((index: number) => {
    setEnabledReps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
        // Clear value when disabling
        setValues((v) => { const n = [...v]; n[index] = ""; return n; });
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Group steps by repeatGroupId for rendering headers
  const repeatGroups = useMemo(() => {
    const groups = new Map<string, { label: string; count: number; indices: number[] }>();
    steps.forEach((s, i) => {
      if (!s.repeatGroupId) return;
      if (!groups.has(s.repeatGroupId)) {
        const zoneLabel = s.zone ?? "";
        const dur = s.durationMin ? `${s.durationMin}'` : "";
        groups.set(s.repeatGroupId, {
          label: `${s.repeatCount}× ${dur} ${zoneLabel}`.trim(),
          count: s.repeatCount ?? 1,
          indices: [],
        });
      }
      groups.get(s.repeatGroupId)!.indices.push(i);
    });
    return groups;
  }, [steps]);

  const handleChange = useCallback((index: number, raw: string) => {
    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
    setValues((prev) => {
      const next = [...prev];
      next[index] = raw;
      return next;
    });
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter" || e.key === "Tab") {
      if (index < steps.length - 1 && !e.shiftKey) {
        e.preventDefault();
        inputRefs.current[index + 1]?.focus();
      }
    }
  }, [steps.length]);

  const handleSubmit = useCallback(() => {
    const result: StepValue[] = steps
      .map((s, i) => ({
        step: s.label,
        lactate: enabledReps.has(i) && values[i] !== "" ? parseFloat(values[i]) : null,
      }))
      .filter((sv, i) => !steps[i].repeatGroupId || enabledReps.has(i));
    const msg = interpretFeedback(result);
    setFeedback(msg);
    setSubmitted(true);
    onSubmit({
      sessionId: selectedSessionId,
      sessionLabel: selectedSession?.public_label ?? "Sesión",
      discipline: selectedSession?.discipline ?? "running",
      values: result,
    });
  }, [steps, values, enabledReps, onSubmit, selectedSessionId, selectedSession]);

  const handleReset = useCallback(() => {
    setValues(steps.map(() => ""));
    setSubmitted(false);
    setFeedback(null);
    const enabled = new Set<number>();
    steps.forEach((s, i) => {
      if (!s.repeatGroupId) enabled.add(i);
      else if (s.repIndex === 1 || s.repIndex === s.repeatCount) enabled.add(i);
    });
    setEnabledReps(enabled);
  }, [steps]);

  const hasAnyValue = values.some((v) => v !== "");

  return (
    <div className="ath-lactate-input-wrap">
      <div className="ath-lactate-input-header">
        <span className="ath-lactate-input-title">Registro de lactato</span>
        <span className="ath-lactate-input-unit">mmol/L</span>
      </div>

      {/* ── Session selector ── */}
      {sessions.length > 1 && (
        <div className="ath-lactate-session-select">
          <label className="ath-lactate-select-label">Sesión</label>
          <select
            className="ath-lactate-select"
            value={selectedSessionId ?? ""}
            onChange={(e) => handleSelectSession(Number(e.target.value))}
          >
            <option value="" disabled>Elige la sesión...</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.public_label} — {disciplineLabel(s.discipline)}
                {s.session_role === "KEY" ? " (KEY)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Selected session info ── */}
      {selectedSession && (
        <div className="ath-lactate-session-info">
          <span className={`ath-session-role ${selectedSession.session_role === "KEY" ? "key" : selectedSession.session_role === "LONG" ? "long" : "support"}`}>
            {selectedSession.session_role}
          </span>
          <span className="ath-lactate-session-name">{selectedSession.public_label}</span>
        </div>
      )}

      {/* ── Block-based lactate grid ── */}
      {selectedSession && steps.length > 0 && (
        <div className="ath-lactate-input-grid">
          {(() => {
            const rendered = new Set<string>();
            return steps.map((step, i) => {
              // For repeat groups: render a group header before the first rep
              let groupHeader: React.ReactNode = null;
              if (step.repeatGroupId && !rendered.has(step.repeatGroupId)) {
                rendered.add(step.repeatGroupId);
                const group = repeatGroups.get(step.repeatGroupId)!;
                const enabledCount = group.indices.filter((idx) => enabledReps.has(idx)).length;
                groupHeader = (
                  <div key={`gh-${step.repeatGroupId}`} className="ath-lactate-group-header">
                    <span className="ath-lactate-group-label">
                      {step.zoneColor && <span className="ath-lactate-zone-dot" style={{ backgroundColor: step.zoneColor }} />}
                      {group.label}
                    </span>
                    <span className="ath-lactate-group-count">
                      {enabledCount}/{group.count} mediciones
                    </span>
                  </div>
                );
              }

              const isRepeat = !!step.repeatGroupId;
              const isEnabled = enabledReps.has(i);

              return (
                <React.Fragment key={i}>
                  {groupHeader}
                  {isRepeat ? (
                    <div className={`ath-lactate-input-row ath-lactate-rep-row ${isEnabled ? "enabled" : "disabled"}`}>
                      <button
                        type="button"
                        className={`ath-lactate-rep-toggle ${isEnabled ? "on" : ""}`}
                        onClick={() => !submitted && toggleRep(i)}
                        disabled={submitted}
                        title={isEnabled ? "Quitar medición" : "Añadir medición"}
                      >
                        {isEnabled ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        )}
                      </button>
                      <div className="ath-lactate-input-label">
                        <span className="ath-lactate-input-step">Rep {step.repIndex}</span>
                      </div>
                      {isEnabled ? (
                        <input
                          ref={(el) => { inputRefs.current[i] = el; }}
                          className="ath-lactate-input-field"
                          type="text"
                          inputMode="decimal"
                          placeholder="—"
                          value={values[i] ?? ""}
                          onChange={(e) => handleChange(i, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, i)}
                          disabled={submitted}
                          autoComplete="off"
                        />
                      ) : (
                        <span className="ath-lactate-input-skip">sin medición</span>
                      )}
                    </div>
                  ) : (
                    <div className="ath-lactate-input-row">
                      <div className="ath-lactate-input-label">
                        {step.zoneColor && (
                          <span className="ath-lactate-zone-dot" style={{ backgroundColor: step.zoneColor }} />
                        )}
                        <span className="ath-lactate-input-step">{step.label}</span>
                        {step.durationMin != null && step.durationMin > 0 && (
                          <span className="ath-lactate-input-dur">{step.durationMin}′</span>
                        )}
                      </div>
                      <input
                        ref={(el) => { inputRefs.current[i] = el; }}
                        className="ath-lactate-input-field"
                        type="text"
                        inputMode="decimal"
                        placeholder="—"
                        value={values[i] ?? ""}
                        onChange={(e) => handleChange(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, i)}
                        disabled={submitted}
                        autoComplete="off"
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            });
          })()}
        </div>
      )}

      {/* ── No session selected ── */}
      {!selectedSession && sessions.length > 1 && (
        <p className="ath-lactate-empty">Selecciona una sesión para registrar lactato por bloque.</p>
      )}

      {selectedSession && !submitted && (
        <button
          className="ath-lactate-input-submit"
          onClick={handleSubmit}
          disabled={!hasAnyValue}
          type="button"
        >
          Guardar valores
        </button>
      )}

      {submitted && feedback && (
        <div className="ath-lactate-input-feedback">
          <p>{feedback}</p>
          <button className="ath-lactate-input-reset" onClick={handleReset} type="button">
            Editar valores
          </button>
        </div>
      )}

      <MicroContent title="¿Qué significan estos valores?">
        <p>
          El lactato en sangre indica cómo responde tu cuerpo a la intensidad del ejercicio.
          Valores bajos ({"<"}2 mmol/L) = zona aeróbica. Entre 2-4 mmol/L = transición.
          Por encima de 4 mmol/L = intensidad alta, fatiga rápida.
        </p>
        <p>
          Tu entrenador usa estos datos para ajustar zonas y verificar que cada sesión
          tiene el efecto deseado.
        </p>
      </MicroContent>
    </div>
  );
}
