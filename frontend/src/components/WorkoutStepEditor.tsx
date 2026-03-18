import { useCallback, useMemo, useState } from "react";
import type { TrainingZoneItem, WorkoutDefinition, WorkoutStep, WorkoutTarget } from "../types";

// ── Constants ────────────────────────────────────────────────────────────────

const STEP_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "warmup", label: "Calentamiento" },
  { value: "interval", label: "Intervalo" },
  { value: "steady", label: "Continuo" },
  { value: "recovery", label: "Recuperación" },
  { value: "cooldown", label: "Enfriamiento" },
  { value: "repeat", label: "Repetición" },
];

const ZONE_OPTIONS: Array<{ value: string; label: string; tone: string; zoneNumber: number }> = [
  { value: "REC", label: "REC", tone: "recovery", zoneNumber: 1 },
  { value: "BASE", label: "BASE", tone: "aerobic", zoneNumber: 2 },
  { value: "LT1", label: "LT1", tone: "aerobic", zoneNumber: 3 },
  { value: "SUB", label: "SUB", tone: "steady", zoneNumber: 4 },
  { value: "LT2", label: "LT2", tone: "threshold", zoneNumber: 5 },
  { value: "VO2MAX", label: "VO2MAX", tone: "hard", zoneNumber: 6 },
  { value: "ANC", label: "ANC", tone: "neuromuscular", zoneNumber: 7 },
  { value: "free", label: "Libre", tone: "neutral", zoneNumber: 0 },
];

function zoneTone(zone: string): string {
  const found = ZONE_OPTIONS.find((z) => z.value === zone);
  return found?.tone ?? "steady";
}

function zoneFromTarget(target?: WorkoutTarget | null, intensityLabel?: string | null): string {
  if (target?.target_type === "easy") return "REC";
  if (target?.label) {
    const lower = target.label.toLowerCase();
    if (lower.includes("vo2")) return "VO2MAX";
    if (lower.includes("anc") || lower.includes("anaeróbic") || lower.includes("sprint") || lower.includes("max")) return "ANC";
    if (lower.includes("lt2") || lower.includes("umbral")) return "LT2";
    if (lower.includes("sub-t") || lower.includes("sub ") || lower.includes("zona media") || lower.includes("tempo")) return "SUB";
    if (lower.includes("lt1")) return "LT1";
    if (lower.includes("base") || lower.includes("fondo") || lower.includes("e2")) return "BASE";
    if (lower.includes("suave") || lower.includes("easy") || lower.includes("rec")) return "REC";
  }
  if (intensityLabel) {
    const lower = intensityLabel.toLowerCase();
    if (lower === "warmup" || lower === "cooldown" || lower === "recovery") return "REC";
    if (lower.includes("vo2")) return "VO2MAX";
    if (lower.includes("anc")) return "ANC";
    if (lower.includes("lt2")) return "LT2";
    if (lower.includes("sub")) return "SUB";
    if (lower.includes("lt1")) return "LT1";
    if (lower.includes("base") || lower.includes("e2")) return "BASE";
    if (lower.includes("rec") || lower.includes("easy")) return "REC";
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

/** Parse "4:30" or "4'30" → 270 seconds (pace per km or per 100m) */
function parsePaceToSeconds(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+)[:']\s*(\d{1,2})$/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  return null;
}

/** Format seconds → "4:30" */
function formatPace(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || totalSeconds <= 0) return "";
  const min = Math.floor(totalSeconds / 60);
  const sec = Math.round(totalSeconds % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
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
  discipline?: string;
  trainingZones?: TrainingZoneItem[];
};

type EditingStepState = {
  index: number;
  parentIndex?: number; // for children of repeat steps
};

// ── Component ────────────────────────────────────────────────────────────────

export function WorkoutStepEditor({ workout, onSave, onCancel, saving, discipline, trainingZones }: WorkoutStepEditorProps) {
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
            discipline={discipline}
            trainingZones={trainingZones}
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
  discipline?: string;
  trainingZones?: TrainingZoneItem[];
};

function StepRow({
  step, index, isEditing, onSelect, onUpdate, onRemove, onAdd, onMove,
  onSelectChild, editingChildIndex, onUpdateChild, onRemoveChild, onAddChild, discipline, trainingZones,
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
        {step.target?.target_type === "heart_rate" && step.target.value_from && step.target.value_to && (
          <span className="workout-editor-step-hr">{Math.round(step.target.value_from)}-{Math.round(step.target.value_to)} bpm</span>
        )}
        {step.target?.unit === "pace" && (step.target.value_from || step.target.value_to) && (
          <span className="workout-editor-step-hr">
            {step.target.value_from && step.target.value_to
              ? `${formatPace(step.target.value_from)}-${formatPace(step.target.value_to)}`
              : formatPace(step.target.value_from ?? step.target.value_to)}
            {discipline === "natación" ? " /100m" : " /km"}
          </span>
        )}
        {step.target?.unit === "watts" && (step.target.value_from || step.target.value_to) && (
          <span className="workout-editor-step-hr">
            {step.target.value_from && step.target.value_to
              ? `${Math.round(step.target.value_from)}-${Math.round(step.target.value_to)} W`
              : step.target.value_from
                ? `>${Math.round(step.target.value_from)} W`
                : `<${Math.round(step.target.value_to!)} W`}
          </span>
        )}
        {step.instructions && <span className="workout-editor-step-note">{step.instructions}</span>}
      </button>

      {isEditing && (
        <StepEditPanel
          step={step}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onAdd={onAdd}
          onMove={onMove}
          discipline={discipline}
          trainingZones={trainingZones}
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
                    discipline={discipline}
                    trainingZones={trainingZones}
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
  discipline?: string;
  trainingZones?: TrainingZoneItem[];
};

function StepEditPanel({ step, onUpdate, onRemove, onAdd, onMove, compact, discipline, trainingZones }: StepEditPanelProps) {
  const [durationInput, setDurationInput] = useState(formatStepDuration(step.length_type, step.length_value));
  const currentZone = zoneFromTarget(step.target, step.intensity_label);

  const hrFrom = step.target?.target_type === "heart_rate" ? step.target.value_from : null;
  const hrTo = step.target?.target_type === "heart_rate" ? step.target.value_to : null;
  const [hrMinInput, setHrMinInput] = useState(hrFrom != null ? String(Math.round(hrFrom)) : "");
  const [hrMaxInput, setHrMaxInput] = useState(hrTo != null ? String(Math.round(hrTo)) : "");

  // Discipline-specific target state
  const isRunning = discipline === "running";
  const isCycling = discipline === "ciclismo";
  const isSwimming = discipline === "natación";

  const existingPaceFrom = step.target?.unit === "pace" ? step.target.value_from : null;
  const existingPaceTo = step.target?.unit === "pace" ? step.target.value_to : null;
  const existingPowerFrom = step.target?.unit === "watts" ? step.target.value_from : null;
  const existingPowerTo = step.target?.unit === "watts" ? step.target.value_to : null;

  const [paceMinInput, setPaceMinInput] = useState(formatPace(existingPaceFrom));
  const [paceMaxInput, setPaceMaxInput] = useState(formatPace(existingPaceTo));
  const [powerMinInput, setPowerMinInput] = useState(existingPowerFrom != null ? String(Math.round(existingPowerFrom)) : "");
  const [powerMaxInput, setPowerMaxInput] = useState(existingPowerTo != null ? String(Math.round(existingPowerTo)) : "");

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

    // Look up matching training zone to auto-fill targets
    const tz = trainingZones?.find((z) => z.zone_number === (zoneOption?.zoneNumber ?? 0));

    const hasHr = tz && (tz.hr_lower || tz.hr_upper);
    const hasPace = tz && (tz.pace_lower_seconds || tz.pace_upper_seconds);
    const hasPower = tz && (tz.power_lower || tz.power_upper);

    // Decide primary target type
    let targetType: string = newZone === "REC" ? "easy" : newZone === "free" ? "free" : "other";
    let valueFrom: number | null = null;
    let valueTo: number | null = null;
    let unit: string | null = null;
    let targetLabel = label;

    if (hasHr) {
      targetType = "heart_rate";
      valueFrom = tz.hr_lower ?? null;
      valueTo = tz.hr_upper ?? null;
      unit = "bpm";
      const hrDesc = valueFrom && valueTo ? `${valueFrom}-${valueTo} bpm` : valueFrom ? `>${valueFrom} bpm` : valueTo ? `<${valueTo} bpm` : "";
      targetLabel = hrDesc ? `${label} · ${hrDesc}` : label;
    }

    onUpdate({
      target: { target_type: targetType, label: targetLabel, value_from: valueFrom, value_to: valueTo, unit },
      intensity_label: newZone,
    });

    setHrMinInput(hasHr && tz.hr_lower ? String(tz.hr_lower) : "");
    setHrMaxInput(hasHr && tz.hr_upper ? String(tz.hr_upper) : "");
    setPaceMinInput(hasPace && tz.pace_lower_seconds ? formatPace(tz.pace_lower_seconds) : "");
    setPaceMaxInput(hasPace && tz.pace_upper_seconds ? formatPace(tz.pace_upper_seconds) : "");
    setPowerMinInput(hasPower && tz.power_lower ? String(tz.power_lower) : "");
    setPowerMaxInput(hasPower && tz.power_upper ? String(tz.power_upper) : "");
  }, [onUpdate, trainingZones]);

  const handleHrBlur = useCallback(() => {
    const min = hrMinInput.trim() ? Number(hrMinInput) : null;
    const max = hrMaxInput.trim() ? Number(hrMaxInput) : null;
    if (min != null || max != null) {
      const zoneOption = ZONE_OPTIONS.find((z) => z.value === currentZone);
      const zoneLabel = zoneOption?.label ?? currentZone;
      const hrLabel = min && max ? `${zoneLabel} · ${min}-${max} bpm` : min ? `${zoneLabel} · >${min} bpm` : max ? `${zoneLabel} · <${max} bpm` : zoneLabel;
      onUpdate({
        target: {
          target_type: "heart_rate",
          value_from: min,
          value_to: max,
          unit: "bpm",
          label: hrLabel,
        },
      });
    } else if (step.target?.target_type === "heart_rate") {
      handleZoneChange(currentZone);
    }
  }, [hrMinInput, hrMaxInput, currentZone, onUpdate, step.target?.target_type, handleZoneChange]);

  const handlePaceBlur = useCallback(() => {
    const from = parsePaceToSeconds(paceMinInput);
    const to = parsePaceToSeconds(paceMaxInput);
    if (from != null || to != null) {
      const zoneOption = ZONE_OPTIONS.find((z) => z.value === currentZone);
      const zoneLabel = zoneOption?.label ?? currentZone;
      const paceUnit = isSwimming ? "/100m" : "/km";
      const label = from && to
        ? `${zoneLabel} · ${formatPace(from)}-${formatPace(to)} ${paceUnit}`
        : from
          ? `${zoneLabel} · ${formatPace(from)} ${paceUnit}`
          : to
            ? `${zoneLabel} · ${formatPace(to)} ${paceUnit}`
            : zoneLabel;
      onUpdate({
        target: {
          target_type: "pace",
          value_from: from,
          value_to: to,
          unit: "pace",
          label,
        },
      });
    } else if (step.target?.unit === "pace") {
      handleZoneChange(currentZone);
    }
  }, [paceMinInput, paceMaxInput, currentZone, isSwimming, onUpdate, step.target?.unit, handleZoneChange]);

  const handlePowerBlur = useCallback(() => {
    const from = powerMinInput.trim() ? Number(powerMinInput) : null;
    const to = powerMaxInput.trim() ? Number(powerMaxInput) : null;
    if (from != null || to != null) {
      const zoneOption = ZONE_OPTIONS.find((z) => z.value === currentZone);
      const zoneLabel = zoneOption?.label ?? currentZone;
      const label = from && to
        ? `${zoneLabel} · ${from}-${to} W`
        : from
          ? `${zoneLabel} · >${from} W`
          : to
            ? `${zoneLabel} · <${to} W`
            : zoneLabel;
      onUpdate({
        target: {
          target_type: "power",
          value_from: from,
          value_to: to,
          unit: "watts",
          label,
        },
      });
    } else if (step.target?.unit === "watts") {
      handleZoneChange(currentZone);
    }
  }, [powerMinInput, powerMaxInput, currentZone, onUpdate, step.target?.unit, handleZoneChange]);

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
            placeholder={isSwimming ? "ej: 400m, 8'" : "ej: 8', 90'', 1km"}
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

      {/* ── Discipline-specific targets ── */}
      {(isRunning || isSwimming) && (
        <div className="workout-editor-edit-row">
          <label className="workout-editor-hr-label">
            {isSwimming ? "Ritmo rápido (/100m)" : "Ritmo rápido (/km)"}
            <input
              type="text"
              value={paceMinInput}
              onChange={(e) => setPaceMinInput(e.target.value)}
              onBlur={handlePaceBlur}
              onKeyDown={(e) => { if (e.key === "Enter") handlePaceBlur(); }}
              placeholder={isSwimming ? "ej: 1:40" : "ej: 4:30"}
              className="workout-editor-hr-input"
            />
          </label>
          <label className="workout-editor-hr-label">
            {isSwimming ? "Ritmo lento (/100m)" : "Ritmo lento (/km)"}
            <input
              type="text"
              value={paceMaxInput}
              onChange={(e) => setPaceMaxInput(e.target.value)}
              onBlur={handlePaceBlur}
              onKeyDown={(e) => { if (e.key === "Enter") handlePaceBlur(); }}
              placeholder={isSwimming ? "ej: 1:50" : "ej: 4:45"}
              className="workout-editor-hr-input"
            />
          </label>
        </div>
      )}

      {isCycling && (
        <div className="workout-editor-edit-row">
          <label className="workout-editor-hr-label">
            Potencia min (W)
            <input
              type="number"
              min={0}
              max={2000}
              value={powerMinInput}
              onChange={(e) => setPowerMinInput(e.target.value)}
              onBlur={handlePowerBlur}
              onKeyDown={(e) => { if (e.key === "Enter") handlePowerBlur(); }}
              placeholder="ej: 220"
              className="workout-editor-hr-input"
            />
          </label>
          <label className="workout-editor-hr-label">
            Potencia max (W)
            <input
              type="number"
              min={0}
              max={2000}
              value={powerMaxInput}
              onChange={(e) => setPowerMaxInput(e.target.value)}
              onBlur={handlePowerBlur}
              onKeyDown={(e) => { if (e.key === "Enter") handlePowerBlur(); }}
              placeholder="ej: 260"
              className="workout-editor-hr-input"
            />
          </label>
        </div>
      )}

      <div className="workout-editor-edit-row">
        <label className="workout-editor-hr-label">
          FC min (bpm)
          <input
            type="number"
            min={30}
            max={220}
            value={hrMinInput}
            onChange={(e) => setHrMinInput(e.target.value)}
            onBlur={handleHrBlur}
            onKeyDown={(e) => { if (e.key === "Enter") handleHrBlur(); }}
            placeholder="ej: 140"
            className="workout-editor-hr-input"
          />
        </label>
        <label className="workout-editor-hr-label">
          FC max (bpm)
          <input
            type="number"
            min={30}
            max={220}
            value={hrMaxInput}
            onChange={(e) => setHrMaxInput(e.target.value)}
            onBlur={handleHrBlur}
            onKeyDown={(e) => { if (e.key === "Enter") handleHrBlur(); }}
            placeholder="ej: 155"
            className="workout-editor-hr-input"
          />
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
