import { useCallback, useMemo, useState } from "react";
import type { WorkoutDefinition, WorkoutStep, WorkoutTarget } from "../types";

// ── Constants ────────────────────────────────────────────────────────────────

const STEP_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "warmup", label: "Calentamiento" },
  { value: "interval", label: "Intervalo" },
  { value: "steady", label: "Continuo" },
  { value: "recovery", label: "Recuperación" },
  { value: "cooldown", label: "Enfriamiento" },
  { value: "repeat", label: "Repetición" },
];

const ZONE_OPTIONS: Array<{ value: string; label: string; tone: string }> = [
  { value: "easy", label: "Suave / Easy", tone: "recovery" },
  { value: "LT1", label: "LT1 / Aeróbico", tone: "aerobic" },
  { value: "SUB-T", label: "SUB-T / Zona media", tone: "steady" },
  { value: "LT2", label: "LT2 / Umbral", tone: "threshold" },
  { value: "VO2", label: "VO2 / Potencia", tone: "hard" },
  { value: "MAX", label: "MAX / Sprint", tone: "neuromuscular" },
  { value: "free", label: "Libre", tone: "neutral" },
];

function zoneTone(zone: string): string {
  const found = ZONE_OPTIONS.find((z) => z.value === zone);
  return found?.tone ?? "steady";
}

function zoneFromTarget(target?: WorkoutTarget | null, intensityLabel?: string | null): string {
  if (target?.target_type === "easy") return "easy";
  if (target?.label) {
    const lower = target.label.toLowerCase();
    if (lower.includes("vo2")) return "VO2";
    if (lower.includes("lt2") || lower.includes("umbral")) return "LT2";
    if (lower.includes("sub-t") || lower.includes("zona media")) return "SUB-T";
    if (lower.includes("lt1")) return "LT1";
    if (lower.includes("suave") || lower.includes("easy")) return "easy";
    if (lower.includes("max") || lower.includes("sprint")) return "MAX";
  }
  if (intensityLabel) {
    const lower = intensityLabel.toLowerCase();
    if (lower === "warmup" || lower === "cooldown" || lower === "recovery") return "easy";
    if (lower.includes("vo2")) return "VO2";
    if (lower.includes("lt2")) return "LT2";
    if (lower.includes("lt1")) return "LT1";
  }
  return "free";
}

function formatStepDuration(lengthType: string, lengthValue?: number | null): string {
  if (!lengthValue) return "";
  if (lengthType === "time") {
    const totalSeconds = Math.round(lengthValue);
    if (totalSeconds < 60) return `${totalSeconds}''`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds > 0 ? `${minutes}'${String(seconds).padStart(2, "0")}''` : `${minutes}'`;
  }
  if (lengthType === "distance") {
    if (lengthValue >= 1000) return `${(lengthValue / 1000).toFixed(lengthValue % 1000 === 0 ? 0 : 1)} km`;
    return `${Math.round(lengthValue)} m`;
  }
  return "";
}

function parseDurationToSeconds(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // "3:30" or "3'30''"
  const minSec = trimmed.match(/^(\d+)[:']\s*(\d+)(?:'')?$/);
  if (minSec) return Number(minSec[1]) * 60 + Number(minSec[2]);

  // "90''" or "90s"
  const seconds = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(?:''|s|sec)$/i);
  if (seconds) return Math.round(Number(seconds[1].replace(",", ".")));

  // "8'" or "8min"
  const minutes = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(?:'|min|m)$/i);
  if (minutes) return Math.round(Number(minutes[1].replace(",", ".")) * 60);

  // Just a number — assume minutes if >= 1, seconds if < 1
  const plain = Number(trimmed.replace(",", "."));
  if (!Number.isNaN(plain)) return plain >= 1 ? Math.round(plain * 60) : Math.round(plain);

  return null;
}

function parseDistanceToMeters(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const km = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*km$/i);
  if (km) return Math.round(Number(km[1].replace(",", ".")) * 1000);
  const m = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*m?$/i);
  if (m) return Math.round(Number(m[1].replace(",", ".")));
  return null;
}

function segmentHeight(tone: string): number {
  if (tone === "warmup" || tone === "recovery") return 0.28;
  if (tone === "aerobic") return 0.56;
  if (tone === "steady") return 0.64;
  if (tone === "threshold") return 0.84;
  if (tone === "hard") return 1;
  if (tone === "neuromuscular") return 0.95;
  return 0.5;
}

// ── Types ────────────────────────────────────────────────────────────────────

type WorkoutStepEditorProps = {
  workout: WorkoutDefinition;
  onSave: (workout: WorkoutDefinition) => void;
  onCancel: () => void;
  saving?: boolean;
};

type EditingStepState = {
  index: number;
  parentIndex?: number; // for children of repeat steps
};

// ── Component ────────────────────────────────────────────────────────────────

export function WorkoutStepEditor({ workout, onSave, onCancel, saving }: WorkoutStepEditorProps) {
  const [steps, setSteps] = useState<WorkoutStep[]>(() => structuredClone(workout.steps));
  const [title, setTitle] = useState(workout.title);
  const [editingStep, setEditingStep] = useState<EditingStepState | null>(null);
  const [dirty, setDirty] = useState(false);

  const totalDurationMin = useMemo(() => {
    let total = 0;
    for (const step of steps) {
      if (step.step_type === "repeat" && step.repeat_count && step.children.length > 0) {
        const childTotal = step.children.reduce((acc, c) => acc + (c.length_value ?? 0), 0);
        total += childTotal * step.repeat_count;
      } else {
        total += step.length_value ?? 0;
      }
    }
    return Math.round(total / 60);
  }, [steps]);

  const updateStep = useCallback((index: number, patch: Partial<WorkoutStep>, parentIndex?: number) => {
    setSteps((prev) => {
      const next = structuredClone(prev);
      if (parentIndex != null) {
        const parent = next[parentIndex];
        if (parent?.children?.[index]) {
          Object.assign(parent.children[index], patch);
        }
      } else {
        if (next[index]) Object.assign(next[index], patch);
      }
      return next;
    });
    setDirty(true);
  }, []);

  const removeStep = useCallback((index: number, parentIndex?: number) => {
    setSteps((prev) => {
      const next = structuredClone(prev);
      if (parentIndex != null) {
        next[parentIndex].children.splice(index, 1);
        // Re-order
        next[parentIndex].children.forEach((c, i) => { c.order = i + 1; });
      } else {
        next.splice(index, 1);
        next.forEach((s, i) => { s.order = i + 1; });
      }
      return next;
    });
    setDirty(true);
    setEditingStep(null);
  }, []);

  const addStep = useCallback((afterIndex: number, stepType: string, parentIndex?: number) => {
    const newStep: WorkoutStep = {
      order: 0,
      step_type: stepType as WorkoutStep["step_type"],
      length_type: "time",
      length_value: stepType === "recovery" ? 60 : 180,
      target: { target_type: stepType === "recovery" ? "easy" : "other", label: stepType === "recovery" ? "Suave" : "LT2", value_from: null, value_to: null, unit: null },
      intensity_label: stepType === "recovery" ? "recovery" : "LT2",
      instructions: null,
      repeat_count: null,
      children: [],
    };
    setSteps((prev) => {
      const next = structuredClone(prev);
      if (parentIndex != null) {
        next[parentIndex].children.splice(afterIndex + 1, 0, newStep);
        next[parentIndex].children.forEach((c, i) => { c.order = i + 1; });
      } else {
        next.splice(afterIndex + 1, 0, newStep);
        next.forEach((s, i) => { s.order = i + 1; });
      }
      return next;
    });
    setDirty(true);
  }, []);

  const moveStep = useCallback((index: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const next = structuredClone(prev);
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      next.forEach((s, i) => { s.order = i + 1; });
      return next;
    });
    setDirty(true);
    setEditingStep((prev) => prev ? { ...prev, index: prev.index + direction } : null);
  }, []);

  const handleSave = useCallback(() => {
    const edited: WorkoutDefinition = {
      ...workout,
      title,
      steps,
    };
    onSave(edited);
  }, [workout, title, steps, onSave]);

  // ── Mini timeline preview ──────────────────────────────────────────────────

  const timelineSegments = useMemo(() => {
    const segments: Array<{ key: string; label: string; durationSec: number; tone: string }> = [];
    for (const step of steps) {
      if (step.step_type === "repeat" && step.repeat_count && step.children.length > 0) {
        for (let rep = 0; rep < step.repeat_count; rep++) {
          for (const child of step.children) {
            const zone = zoneFromTarget(child.target, child.intensity_label);
            segments.push({
              key: `${step.order}-${rep}-${child.order}`,
              label: child.step_type === "recovery" ? "Rec" : `R${rep + 1}`,
              durationSec: child.length_value ?? 60,
              tone: zoneTone(zone),
            });
          }
        }
      } else {
        const zone = zoneFromTarget(step.target, step.intensity_label);
        segments.push({
          key: `${step.order}`,
          label: step.step_type === "warmup" ? "Cal" : step.step_type === "cooldown" ? "Enf" : step.step_type === "recovery" ? "Rec" : "Work",
          durationSec: step.length_value ?? 60,
          tone: step.step_type === "warmup" ? "warmup" : step.step_type === "cooldown" ? "warmup" : zoneTone(zone),
        });
      }
    }
    return segments;
  }, [steps]);

  const totalTimelineSec = useMemo(() => timelineSegments.reduce((acc, s) => acc + s.durationSec, 0), [timelineSegments]);

  return (
    <div className="workout-editor">
      <div className="workout-editor-header">
        <div className="workout-editor-title-row">
          <span className="eyebrow">Editor de entreno</span>
          <input
            type="text"
            className="workout-editor-title-input"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          />
        </div>
        <div className="workout-editor-meta">
          <span>{totalDurationMin} min</span>
          <span>{steps.length} pasos</span>
          {dirty && <span className="workout-editor-dirty-badge">Sin guardar</span>}
        </div>
      </div>

      {/* Mini timeline */}
      <div className="workout-editor-timeline">
        {timelineSegments.map((seg) => (
          <div
            key={seg.key}
            className={`workout-editor-timeline-segment ${seg.tone}`}
            style={{
              flexGrow: Math.max(seg.durationSec, 15),
              height: `${segmentHeight(seg.tone) * 100}%`,
            }}
            title={`${seg.label} · ${formatStepDuration("time", seg.durationSec)}`}
          />
        ))}
      </div>

      {/* Steps list */}
      <div className="workout-editor-steps">
        {steps.map((step, index) => (
          <StepRow
            key={`${step.order}-${index}`}
            step={step}
            index={index}
            isEditing={editingStep?.index === index && editingStep?.parentIndex == null}
            onSelect={() => setEditingStep(editingStep?.index === index && editingStep?.parentIndex == null ? null : { index })}
            onUpdate={(patch) => updateStep(index, patch)}
            onRemove={() => removeStep(index)}
            onAdd={(type) => addStep(index, type)}
            onMove={(dir) => moveStep(index, dir)}
            onSelectChild={(childIndex) => setEditingStep({ index: childIndex, parentIndex: index })}
            editingChildIndex={editingStep?.parentIndex === index ? editingStep.index : null}
            onUpdateChild={(childIndex, patch) => updateStep(childIndex, patch, index)}
            onRemoveChild={(childIndex) => removeStep(childIndex, index)}
            onAddChild={(afterIndex, type) => addStep(afterIndex, type, index)}
          />
        ))}

        <button
          type="button"
          className="workout-editor-add-step-btn"
          onClick={() => addStep(steps.length - 1, "interval")}
        >
          + Nuevo paso
        </button>
      </div>

      {/* Actions */}
      <div className="workout-editor-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

// ── Step Row ─────────────────────────────────────────────────────────────────

type StepRowProps = {
  step: WorkoutStep;
  index: number;
  isEditing: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<WorkoutStep>) => void;
  onRemove: () => void;
  onAdd: (type: string) => void;
  onMove: (direction: -1 | 1) => void;
  onSelectChild: (childIndex: number) => void;
  editingChildIndex: number | null;
  onUpdateChild: (childIndex: number, patch: Partial<WorkoutStep>) => void;
  onRemoveChild: (childIndex: number) => void;
  onAddChild: (afterIndex: number, type: string) => void;
};

function StepRow({
  step, index, isEditing, onSelect, onUpdate, onRemove, onAdd, onMove,
  onSelectChild, editingChildIndex, onUpdateChild, onRemoveChild, onAddChild,
}: StepRowProps) {
  const zone = zoneFromTarget(step.target, step.intensity_label);
  const tone = step.step_type === "warmup" ? "warmup" : step.step_type === "cooldown" ? "warmup" : step.step_type === "recovery" ? "recovery" : zoneTone(zone);

  return (
    <div className={`workout-editor-step ${isEditing ? "editing" : ""}`}>
      <button type="button" className="workout-editor-step-summary" onClick={onSelect}>
        <span className={`workout-editor-step-indicator ${tone}`} />
        <span className="workout-editor-step-type">
          {step.step_type === "repeat" ? `${step.repeat_count ?? 1}x` : STEP_TYPE_OPTIONS.find((o) => o.value === step.step_type)?.label ?? step.step_type}
        </span>
        <span className="workout-editor-step-duration">
          {formatStepDuration(step.length_type, step.length_value)}
        </span>
        <span className="workout-editor-step-zone">{step.target?.label ?? zone}</span>
        {step.instructions && <span className="workout-editor-step-note">{step.instructions}</span>}
      </button>

      {isEditing && (
        <StepEditPanel
          step={step}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onAdd={onAdd}
          onMove={onMove}
        />
      )}

      {/* Children for repeat steps */}
      {step.step_type === "repeat" && step.children.length > 0 && (
        <div className="workout-editor-children">
          <div className="workout-editor-repeat-header">
            <label>
              Repeticiones:
              <input
                type="number"
                min={1}
                max={50}
                value={step.repeat_count ?? 1}
                onChange={(e) => onUpdate({ repeat_count: Math.max(1, Number(e.target.value)) })}
                className="workout-editor-repeat-input"
              />
            </label>
          </div>
          {step.children.map((child, childIndex) => {
            const childZone = zoneFromTarget(child.target, child.intensity_label);
            const childTone = child.step_type === "recovery" ? "recovery" : zoneTone(childZone);
            const isChildEditing = editingChildIndex === childIndex;
            return (
              <div key={`child-${childIndex}`} className={`workout-editor-step child ${isChildEditing ? "editing" : ""}`}>
                <button type="button" className="workout-editor-step-summary" onClick={() => onSelectChild(isChildEditing ? -1 : childIndex)}>
                  <span className={`workout-editor-step-indicator ${childTone}`} />
                  <span className="workout-editor-step-type">
                    {STEP_TYPE_OPTIONS.find((o) => o.value === child.step_type)?.label ?? child.step_type}
                  </span>
                  <span className="workout-editor-step-duration">
                    {formatStepDuration(child.length_type, child.length_value)}
                  </span>
                  <span className="workout-editor-step-zone">{child.target?.label ?? childZone}</span>
                </button>
                {isChildEditing && (
                  <StepEditPanel
                    step={child}
                    onUpdate={(patch) => onUpdateChild(childIndex, patch)}
                    onRemove={() => onRemoveChild(childIndex)}
                    onAdd={(type) => onAddChild(childIndex, type)}
                    compact
                  />
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="workout-editor-add-child-btn"
            onClick={() => onAddChild(step.children.length - 1, "recovery")}
          >
            + Paso dentro del bloque
          </button>
        </div>
      )}
    </div>
  );
}

// ── Step Edit Panel ──────────────────────────────────────────────────────────

type StepEditPanelProps = {
  step: WorkoutStep;
  onUpdate: (patch: Partial<WorkoutStep>) => void;
  onRemove: () => void;
  onAdd: (type: string) => void;
  onMove?: (direction: -1 | 1) => void;
  compact?: boolean;
};

function StepEditPanel({ step, onUpdate, onRemove, onAdd, onMove, compact }: StepEditPanelProps) {
  const [durationInput, setDurationInput] = useState(formatStepDuration(step.length_type, step.length_value));
  const currentZone = zoneFromTarget(step.target, step.intensity_label);

  const handleDurationBlur = useCallback(() => {
    if (step.length_type === "distance") {
      const meters = parseDistanceToMeters(durationInput);
      if (meters != null) onUpdate({ length_value: meters });
    } else {
      const seconds = parseDurationToSeconds(durationInput);
      if (seconds != null) onUpdate({ length_type: "time", length_value: seconds });
    }
  }, [durationInput, step.length_type, onUpdate]);

  const handleZoneChange = useCallback((newZone: string) => {
    const zoneOption = ZONE_OPTIONS.find((z) => z.value === newZone);
    const label = zoneOption?.label ?? newZone;
    onUpdate({
      target: {
        target_type: newZone === "easy" ? "easy" : newZone === "free" ? "free" : "other",
        label,
        value_from: null,
        value_to: null,
        unit: null,
      },
      intensity_label: newZone,
    });
  }, [onUpdate]);

  return (
    <div className={`workout-editor-edit-panel ${compact ? "compact" : ""}`}>
      <div className="workout-editor-edit-row">
        <label>
          Tipo
          <select
            value={step.step_type}
            onChange={(e) => onUpdate({ step_type: e.target.value as WorkoutStep["step_type"] })}
          >
            {STEP_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label>
          Duración
          <input
            type="text"
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            onBlur={handleDurationBlur}
            onKeyDown={(e) => { if (e.key === "Enter") handleDurationBlur(); }}
            placeholder="ej: 8', 90'', 1km"
            className="workout-editor-duration-input"
          />
        </label>

        <label>
          Zona
          <select
            value={currentZone}
            onChange={(e) => handleZoneChange(e.target.value)}
          >
            {ZONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="workout-editor-edit-row">
        <label>
          Nota
          <input
            type="text"
            value={step.instructions ?? ""}
            onChange={(e) => onUpdate({ instructions: e.target.value || null })}
            placeholder="Instrucciones para el atleta"
          />
        </label>
      </div>

      {step.length_type !== "distance" && (
        <div className="workout-editor-edit-row">
          <label>
            Medida
            <select value={step.length_type} onChange={(e) => onUpdate({ length_type: e.target.value as WorkoutStep["length_type"] })}>
              <option value="time">Tiempo</option>
              <option value="distance">Distancia</option>
              <option value="lap_button">Lap button</option>
              <option value="open">Abierto</option>
            </select>
          </label>
        </div>
      )}

      <div className="workout-editor-edit-actions">
        {onMove && (
          <>
            <button type="button" className="ghost-button small" onClick={() => onMove(-1)} title="Subir">&#8593;</button>
            <button type="button" className="ghost-button small" onClick={() => onMove(1)} title="Bajar">&#8595;</button>
          </>
        )}
        <button type="button" className="ghost-button small" onClick={() => onAdd("interval")}>+ Intervalo</button>
        <button type="button" className="ghost-button small" onClick={() => onAdd("recovery")}>+ Recuperación</button>
        <button type="button" className="ghost-button small danger" onClick={onRemove}>Eliminar</button>
      </div>
    </div>
  );
}
