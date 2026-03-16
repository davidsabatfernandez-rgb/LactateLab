import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { PlanningWorkoutTemplate, WorkoutDefinition } from "../types";
import { WorkoutStepEditor } from "./WorkoutStepEditor";

export type WorkoutPreviewSelection = {
  source: "dose" | "example" | "planning";
  templateId: string;
  label: string;
  plannedSessionId?: number;
  notes?: string;
  prescriptionHint?: string;
  thresholdBasis?: string;
  totalDurationMin?: number;
  usefulDurationMin?: number;
  restMin?: number;
  intensityZone?: string;
  readiness?: string;
};

type PreviewTimelineSegment = {
  id: string;
  label: string;
  durationMin: number;
  tone: string;
  compact?: boolean;
};

type WorkoutPreviewModalProps = {
  template: PlanningWorkoutTemplate | null;
  selection: WorkoutPreviewSelection | null;
  rawInformation?: {
    active: boolean;
    onToggle: () => void;
    label?: string;
    statusLabel?: string;
    statusTone?: "positive" | "neutral" | "negative";
    panel?: ReactNode;
  } | null;
  /** If provided, the modal shows an "Editar" button that opens the step editor. */
  workoutDefinition?: WorkoutDefinition | null;
  onSaveWorkout?: (workout: WorkoutDefinition) => Promise<void>;
  onPushToGarmin?: () => Promise<void>;
  /** Called when the user selects a dose step from the dose ladder panel. */
  onSelectDoseStep?: (stepIndex: number, label: string) => void;
  /** Called when the user renames the session title (only for persisted sessions). */
  onRenameSession?: (newTitle: string) => Promise<void>;
  /** Called when the user saves the coach note / strength prescription. */
  onSaveCoachNote?: (note: string) => Promise<void>;
  /** Current coach note from the planned session. */
  coachNote?: string | null;
  garminConnected?: boolean;
  publishStatus?: string | null;
  thresholdReference?: {
    lt1Label: string | null;
    lt1Source: string | null;
    lt2Label: string | null;
    lt2Source: string | null;
  } | null;
  onClose: () => void;
};

const STRENGTH_FAMILIES = new Set([
  "general_strength", "anatomical_adaptation", "max_strength",
  "strength_endurance_circuit", "strength_velocity", "torque_strength", "fuerza_q2",
]);

function isStrengthFamily(family: string) {
  return STRENGTH_FAMILIES.has(family);
}

function disciplineLabel(value: string, family?: string) {
  if (family && isStrengthFamily(family)) return "Fuerza";
  if (value === "all") return "Multidisciplina";
  if (value === "ciclismo") return "Ciclismo";
  if (value === "natación") return "Natación";
  return "Carrera";
}

function sessionZone(family: string): string {
  if (["lt0_recovery", "recovery_regeneration", "full_rest_day", "active_walk_hike", "mobility_restore", "restart_rebuild", "recovery_drills", "lt0_50s"].includes(family)) return "Recuperación";
  if (["long_aerobic_durability", "aerobic_continuity", "aec_base", "fatmax_endurance", "e2_steady", "varied_aerobic", "long_endurance"].includes(family)) return "Base aeróbica";
  if (["lt1_extensive", "lt1_long_reps", "lt1_blocks", "lt1_broken_sets", "progressive_aerobic"].includes(family)) return "LT1";
  if (["lt1_lt2_mix", "subthreshold_reps", "subthreshold_3min", "subthreshold_blocks", "uLT1_vo2_combo", "escalated_intervals"].includes(family)) return "SUB-T / Zona media";
  if (["lt2_cruise_intervals", "threshold_continuous", "lt2_halfpace", "css_threshold", "lt2_long_reps", "lt2_short_reps", "over_under_threshold", "lt2_vo2_combo", "lt1_to_lt2_blocks"].includes(family)) return "LT2 / Umbral";
  if (["vo2_hills", "vo2_30_30", "vo2_power", "vo2_anaerobic", "lt2_vo2_combo"].includes(family)) return "VO2 / Potencia";
  if (["economy_strides", "hill_sprints", "cadmax_neuro", "sprint_neuromuscular", "hill_threshold_combo", "submax_lt1_mix", "cadmax_lt1_combo"].includes(family)) return "Neuromuscular";
  if (["technical_alignment", "pull_snorkel_alignment", "speed_turns", "cadence_efficiency", "aero_stability"].includes(family)) return "Técnica";
  if (["specific_durability", "specific_pace_reps", "brick_transition", "race_pace_specific", "open_water_specific", "transition_specific", "team_quality"].includes(family)) return "Específico";
  if (["general_strength", "anatomical_adaptation", "max_strength", "strength_endurance_circuit", "strength_velocity", "torque_strength"].includes(family)) return "Fuerza / Soporte";
  if (["profile_test"].includes(family)) return "Test";
  return "Otros";
}

function splitOutsideParentheses(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "+" && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function inferDurationMinutes(value: string): number | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  const repeatedBlock = normalized.match(/^(\d+)\s*[x×]\s*\((.+)\)$/i);
  if (repeatedBlock) {
    const reps = Number(repeatedBlock[1]);
    const nested = splitOutsideParentheses(repeatedBlock[2])
      .map((part) => inferDurationMinutes(part))
      .filter((minutes): minutes is number => minutes !== null);
    if (nested.length > 0) return nested.reduce((acc, minutes) => acc + minutes, 0) * reps;
  }

  const repeatedMinutes = normalized.match(/(\d+)\s*[x×]\s*(\d+)\s*'/i);
  if (repeatedMinutes) return Number(repeatedMinutes[1]) * Number(repeatedMinutes[2]);

  const repeatedSeconds = normalized.match(/(\d+)\s*[x×]\s*(\d+)\s*''/i);
  if (repeatedSeconds) return Math.max(1, Math.round((Number(repeatedSeconds[1]) * Number(repeatedSeconds[2])) / 60));

  const hoursAndMinutes = normalized.match(/(\d+)\s*h(?:\s*(\d+))?/i);
  if (hoursAndMinutes) return Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2] ?? 0);

  const directMinutes = normalized.match(/(\d+)\s*'/i);
  if (directMinutes) return Number(directMinutes[1]);

  // Short unnamed reps: "4 progresivos", "6 strides", "8 rectas" (~2 min each including recovery)
  const progressives = normalized.match(/(\d+)\s*(?:progresivos?|strides?|rectas?|aceleraciones?)/i);
  if (progressives) return Math.round(Number(progressives[1]) * 2);

  return null;
}

function inferRepsCount(label: string): number | null {
  if (label.includes("(") || label.includes(")")) return null;
  const normalized = label.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(\d+)\s*[×x]/i);
  if (match) return Number(match[1]);
  return null;
}

function parseDecimalMinutes(value: string) {
  return Number(value.replace(",", "."));
}

function estimateExampleDuration(template: PlanningWorkoutTemplate, label: string): number | null {
  const parts = splitOutsideParentheses(label);
  const inferred = parts
    .map((part) => inferDurationMinutes(part))
    .filter((minutes): minutes is number => minutes !== null);

  if (inferred.length === 0) return null;

  return inferred.reduce((acc, minutes) => acc + minutes, 0) + template.calentamiento_min + template.enfriamiento_min;
}

function formatMinutesLabel(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "Variable";
  const rounded = Math.round(value);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

function readinessLabel(value?: string) {
  if (value === "fresh") return "Fresco";
  if (value === "medium") return "Carga media";
  if (value === "any") return "Flexible";
  return value ?? "Sin requisito";
}

function disciplineIcon(value: string, family?: string) {
  if (family && isStrengthFamily(family)) return "Fuerza";
  if (value === "all") return "Multi";
  if (value === "ciclismo") return "Bike";
  if (value === "natación") return "Swim";
  return "Run";
}

function previewBlockTone(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("vo2")) return "hard";
  if (lower.includes("lt2")) return "threshold";
  if (lower.includes("sub-t")) return "steady";
  if (lower.includes("lt1")) return "aerobic";
  if (lower.includes("prog")) return "progressive";
  if (lower.includes("cadmax") || lower.includes("sprint") || lower.includes("cuesta")) return "neuromuscular";
  return "steady";
}

function zonePreviewTone(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("vo2")) return "hard";
  if (lower.includes("lt2")) return "threshold";
  if (lower.includes("sub-t")) return "steady";
  if (lower.includes("lt1")) return "aerobic";
  if (lower.includes("neurom")) return "neuromuscular";
  return "steady";
}

function previewBlockHint(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("progresiv")) return "Cierra más vivo, sin convertirlo en test.";
  if (lower.includes("lt0") || lower.includes("suave")) return "Bloque de descarga con sensación muy controlada.";
  if (lower.includes("lt1")) return "Dominio aeróbico alto con respiración aún estable.";
  if (lower.includes("sub-t")) return "Zona media sostenible, sin entrar plenamente en LT2.";
  if (lower.includes("lt2")) return "Ritmo de umbral sostenido con pacing estable.";
  if (lower.includes("vo2")) return "Alta exigencia; prioriza calidad sobre agresividad.";
  if (lower.includes("cadmax") || lower.includes("sprint")) return "Activación neural y calidad mecánica.";
  return "Bloque principal de la sesión.";
}

function buildPreviewBlocks(label: string) {
  return splitOutsideParentheses(label).map((part, index) => ({
    id: `${part}-${index}`,
    label: part,
    durationMin: inferDurationMinutes(part),
    tone: previewBlockTone(part),
    hint: previewBlockHint(part),
  }));
}

function resolvedBlockTone(label: string, fallbackTone: string) {
  const tone = previewBlockTone(label);
  if (tone === "steady" && fallbackTone !== "steady") return fallbackTone;
  return tone;
}

function expandRepeatedBlock(
  label: string,
  fallbackTone: string,
  restMin?: number,
  idPrefix = "main",
): PreviewTimelineSegment[] {
  const repeatedBlock = label.match(/^(\d+)\s*[x×]\s*(.+)$/i);
  if (!repeatedBlock) {
    return [{
      id: `${idPrefix}-single`,
      label,
      durationMin: inferDurationMinutes(label) ?? 8,
      tone: fallbackTone,
    }];
  }

  const repetitions = Number(repeatedBlock[1]);
  let rawExpression = repeatedBlock[2].trim();
  if (rawExpression.startsWith("(") && rawExpression.endsWith(")")) rawExpression = rawExpression.slice(1, -1);
  const parts = splitOutsideParentheses(rawExpression);
  const segments: PreviewTimelineSegment[] = [];

  for (let rep = 0; rep < repetitions; rep += 1) {
    parts.forEach((part, index) => {
      segments.push({
        id: `${idPrefix}-rep-${rep + 1}-${index + 1}`,
        label: parts.length === 1 ? `Rep ${rep + 1}` : part,
        durationMin: inferDurationMinutes(part) ?? 8,
        tone: resolvedBlockTone(part, fallbackTone),
        compact: inferDurationMinutes(part) !== null && inferDurationMinutes(part)! < 3,
      });
    });
    if (restMin && rep < repetitions - 1) {
      segments.push({
        id: `${idPrefix}-rest-${rep + 1}`,
        label: "Rec",
        durationMin: restMin,
        tone: "recovery",
        compact: true,
      });
    }
  }
  return segments;
}

function buildWarmupSegments(template: PlanningWorkoutTemplate): PreviewTimelineSegment[] {
  if (template.calentamiento_min <= 0) return [];
  const strideMatch = template.calentamiento_template.match(
    /(\d+)\s*[x×]\s*(?:rectas?|strides?|progresivos?)\s*(\d+)\s*''(?:\s*(?:con|c\/)\s*(\d+(?:[.,]\d+)?)\s*')?/i,
  );

  if (!strideMatch) {
    return [{ id: "warmup-base", label: "Calentamiento", durationMin: template.calentamiento_min, tone: "warmup" }];
  }

  const reps = Number(strideMatch[1]);
  const strideMin = Number(strideMatch[2]) / 60;
  const restMin = strideMatch[3] ? parseDecimalMinutes(strideMatch[3]) : 0;
  const baseMin = Math.max(1, template.calentamiento_min - (reps * strideMin) - (Math.max(0, reps - 1) * restMin));
  const segments: PreviewTimelineSegment[] = [{ id: "warmup-base", label: "Calent.", durationMin: baseMin, tone: "warmup" }];

  for (let rep = 0; rep < reps; rep += 1) {
    segments.push({
      id: `warmup-stride-${rep + 1}`,
      label: "Recta",
      durationMin: Math.max(strideMin, 0.2),
      tone: "neuromuscular",
      compact: true,
    });
    if (restMin && rep < reps - 1) {
      segments.push({
        id: `warmup-rest-${rep + 1}`,
        label: "Rec",
        durationMin: restMin,
        tone: "recovery",
        compact: true,
      });
    }
  }
  return segments;
}

function buildMainTimelineSegments(
  selection: WorkoutPreviewSelection,
  blocks: Array<{ id: string; label: string; durationMin: number | null; tone: string }>,
) {
  if (blocks.length === 1) return expandRepeatedBlock(blocks[0].label, blocks[0].tone, selection.restMin, blocks[0].id);

  return blocks.flatMap((block, index) => {
    const expanded = expandRepeatedBlock(block.label, block.tone, undefined, block.id);
    if (selection.restMin && index < blocks.length - 1) {
      expanded.push({
        id: `${block.id}-between`,
        label: "Rec",
        durationMin: selection.restMin,
        tone: "recovery",
        compact: true,
      });
    }
    return expanded;
  });
}

function shortenPhaseCopy(value: string, fallback: string, max = 56) {
  const normalized = value.trim();
  if (!normalized) return fallback;
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function summarizeWarmupTemplate(template: PlanningWorkoutTemplate) {
  const strideMatch = template.calentamiento_template.match(/(\d+)\s*[x×]\s*(?:rectas?|strides?|progresivos?)\s*(\d+)\s*''/i);
  if (strideMatch) return `${template.calentamiento_min}' progresivo + ${strideMatch[1]} activaciones`;
  return shortenPhaseCopy(template.calentamiento_template, "Entrada progresiva suave.");
}

function summarizeCooldownTemplate(template: PlanningWorkoutTemplate) {
  return shortenPhaseCopy(template.enfriamiento_template, "Salida muy suave.");
}

function previewSegmentHeight(tone: string) {
  if (tone === "warmup") return 0.34;
  if (tone === "cooldown") return 0.28;
  if (tone === "recovery") return 0.18;
  if (tone === "aerobic") return 0.56;
  if (tone === "steady") return 0.64;
  if (tone === "progressive") return 0.74;
  if (tone === "threshold") return 0.84;
  if (tone === "hard") return 1;
  if (tone === "neuromuscular") return 0.9;
  return 0.6;
}

export function WorkoutPreviewModal({ template, selection, rawInformation, workoutDefinition, onSaveWorkout, onPushToGarmin, onSelectDoseStep, onRenameSession, onSaveCoachNote, coachNote, garminConnected, publishStatus, thresholdReference, onClose }: WorkoutPreviewModalProps) {
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<"ok" | "error" | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [strengthNote, setStrengthNote] = useState("");
  const [strengthNoteEditing, setStrengthNoteEditing] = useState(false);
  const [strengthNoteSaving, setStrengthNoteSaving] = useState(false);

  // Initialize strength note when modal opens
  useEffect(() => {
    if (coachNote != null) setStrengthNote(coachNote);
  }, [coachNote]);

  const handleSaveStrengthNote = useCallback(async () => {
    if (!onSaveCoachNote) return;
    setStrengthNoteSaving(true);
    try {
      await onSaveCoachNote(strengthNote);
      setStrengthNoteEditing(false);
    } finally {
      setStrengthNoteSaving(false);
    }
  }, [onSaveCoachNote, strengthNote]);

  const handlePushToGarmin = useCallback(async () => {
    if (!onPushToGarmin) return;
    setPushing(true);
    setPushResult(null);
    try {
      await onPushToGarmin();
      setPushResult("ok");
    } catch {
      setPushResult("error");
    } finally {
      setPushing(false);
    }
  }, [onPushToGarmin]);

  useEffect(() => {
    if (!template || !selection) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (editMode) { setEditMode(false); return; }
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, selection, template, editMode]);

  const handleSaveWorkout = useCallback(async (workout: WorkoutDefinition) => {
    if (!onSaveWorkout) return;
    setSaving(true);
    try {
      await onSaveWorkout(workout);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  }, [onSaveWorkout]);

  const canEdit = !!(workoutDefinition && onSaveWorkout);

  const preview = useMemo(() => {
    if (!template || !selection) return null;

    const zone = selection.intensityZone ?? sessionZone(template.session_family);
    const usefulDuration = selection.usefulDurationMin ?? inferDurationMinutes(selection.label);
    const blocks = buildPreviewBlocks(selection.label);
    const defaultMainTone = zonePreviewTone(zone);
    const normalizedBlocks = blocks.length > 0
      ? blocks.map((block) => ({
          ...block,
          tone: resolvedBlockTone(block.label, defaultMainTone),
          durationMin: block.durationMin ?? Math.max(8, Math.round((usefulDuration ?? selection.totalDurationMin ?? 30) / blocks.length)),
        }))
      : [{ id: "main", label: "Bloque principal", durationMin: usefulDuration ?? selection.totalDurationMin ?? 30, tone: defaultMainTone, hint: "Bloque principal de la sesión." }];

    const repsCount = inferRepsCount(selection.label);
    const totalRestMin = repsCount && selection.restMin && repsCount > 1 ? Math.round((repsCount - 1) * selection.restMin) : 0;
    const warmupSegments = buildWarmupSegments(template);
    const mainSegments = buildMainTimelineSegments(selection, normalizedBlocks);
    const cooldownSegments: PreviewTimelineSegment[] = template.enfriamiento_min > 0
      ? [{ id: "cooldown", label: "Enfriamiento", durationMin: template.enfriamiento_min, tone: "cooldown" }]
      : [];

    const phaseTotals = {
      warmup: warmupSegments.reduce((acc, segment) => acc + segment.durationMin, 0),
      main: mainSegments.reduce((acc, segment) => acc + segment.durationMin, 0),
      cooldown: cooldownSegments.reduce((acc, segment) => acc + segment.durationMin, 0),
    };

    const totalDuration = phaseTotals.warmup + phaseTotals.main + phaseTotals.cooldown || selection.totalDurationMin || estimateExampleDuration(template, selection.label);
    const mainWorkSegments = mainSegments.filter((segment) => segment.tone !== "recovery");
    const mainRecoverySegments = mainSegments.filter((segment) => segment.tone === "recovery");

    return {
      template,
      selection,
      zone,
      totalDuration,
      totalRestMin,
      usefulDuration,
      blocks: normalizedBlocks,
      phaseDetails: { warmup: warmupSegments, main: mainSegments, cooldown: cooldownSegments },
      phaseTotals,
      phaseMeta: {
        mainWorkCount: mainWorkSegments.length,
        mainRecoveryCount: mainRecoverySegments.length,
        warmupSummary: summarizeWarmupTemplate(template),
        cooldownSummary: summarizeCooldownTemplate(template),
      },
      isStrength: isStrengthFamily(template.session_family),
      disciplineIconLabel: disciplineIcon(template.discipline, template.session_family),
      disciplineText: disciplineLabel(template.discipline, template.session_family),
    };
  }, [selection, template]);

  if (!preview) return null;

  const previewSourceLabel = preview.selection.source === "dose" ? "Peldaño" : preview.selection.source === "example" ? "Ejemplo" : "Planificación";

  return (
    <div className="target-modal-backdrop" onClick={onClose}>
      <section className="card target-modal-card library-workout-modal" onClick={(event) => event.stopPropagation()}>
        {/* ── Header ── */}
        <div className="wpm-header">
          <div className="wpm-header-left">
            <div className="wpm-header-badges">
              <span className="wpm-badge-sport">{preview.disciplineIconLabel}</span>
              <span className="wpm-badge-zone">{preview.zone}</span>
              <span className="wpm-badge-source">{previewSourceLabel}</span>
              {rawInformation?.statusLabel ? (
                <span className={`wpm-badge-status ${rawInformation.statusTone ?? "neutral"}`}>{rawInformation.statusLabel}</span>
              ) : null}
            </div>
            {editingTitle ? (
              <form className="library-workout-title-edit" onSubmit={(e) => {
                e.preventDefault();
                const trimmed = titleDraft.trim();
                if (trimmed && onRenameSession) {
                  onRenameSession(trimmed).then(() => setEditingTitle(false));
                } else {
                  setEditingTitle(false);
                }
              }}>
                <input
                  className="library-workout-title-input"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  autoFocus
                  onBlur={() => setEditingTitle(false)}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingTitle(false); }}
                />
              </form>
            ) : (
              <h2
                className={`wpm-title ${onRenameSession ? "wpm-title-editable" : ""}`}
                onClick={() => {
                  if (!onRenameSession) return;
                  setTitleDraft(preview.template.public_label);
                  setEditingTitle(true);
                }}
                title={onRenameSession ? "Clic para cambiar el título" : undefined}
              >
                {preview.selection.label}
              </h2>
            )}
            <p className="wpm-subtitle">{preview.template.public_label} · {preview.disciplineText}</p>
          </div>
          <div className="wpm-header-actions">
            {rawInformation ? (
              <button type="button" className={`wpm-action-btn ${rawInformation.active ? "active" : ""}`} onClick={rawInformation.onToggle}>
                {rawInformation.label ?? "Raw"}
              </button>
            ) : null}
            {canEdit && (
              <button type="button" className={`wpm-action-btn ${editMode ? "active" : ""}`} onClick={() => setEditMode((v) => !v)}>
                {editMode ? "Vista previa" : "Editar"}
              </button>
            )}
            {garminConnected && onPushToGarmin && !editMode && (
              <button
                type="button"
                className={`wpm-action-btn wpm-garmin-btn ${publishStatus === "published" ? "published" : ""} ${pushResult === "ok" ? "success" : pushResult === "error" ? "error" : ""}`}
                onClick={handlePushToGarmin}
                disabled={pushing}
              >
                {pushing ? "Enviando..." : pushResult === "ok" ? "Enviado" : publishStatus === "published" ? "Reenviar Garmin" : "Enviar Garmin"}
              </button>
            )}
            <button type="button" className="wpm-close-btn" onClick={onClose} aria-label="Cerrar">&times;</button>
          </div>
        </div>

        {editMode && workoutDefinition && onSaveWorkout ? (
          <div className="library-workout-editor-container">
            <WorkoutStepEditor
              workout={workoutDefinition}
              onSave={handleSaveWorkout}
              onCancel={() => setEditMode(false)}
              saving={saving}
              discipline={template?.discipline}
            />
          </div>
        ) : (
        <>
        {preview.isStrength ? (
        /* ── Strength-specific layout ── */
        <div className="library-workout-modal-body strength-layout">
          <div className="library-workout-main-column">
            <section className="library-workout-panel">
              <div className="library-workout-panel-head">
                <span className="eyebrow">Objetivo</span>
                <h3>{preview.template.objective}</h3>
              </div>
              <div className="library-workout-copy-grid">
                <article><small>Resumen</small><p>{preview.template.summary}</p></article>
                <article><small>Dose guidance</small><p>{preview.template.dose_guidance}</p></article>
              </div>
            </section>

            <section className="library-workout-panel strength-prescription-panel">
              <div className="library-workout-panel-head">
                <span className="eyebrow">Prescripción de ejercicios</span>
                <h3>Nota del entrenador</h3>
              </div>
              {strengthNoteEditing ? (
                <div className="strength-prescription-editor">
                  <textarea
                    className="strength-prescription-textarea"
                    value={strengthNote}
                    onChange={(e) => setStrengthNote(e.target.value)}
                    placeholder={"Ej:\n3×12 Sentadilla búlgara\n3×10 Hip thrust\n3×15 Gemelos excéntricos\n2×20'' Plancha lateral\n\nNotas: RPE 7, descanso 90'' entre series"}
                    rows={10}
                    autoFocus
                  />
                  <div className="strength-prescription-actions">
                    <button type="button" className="ghost-button" onClick={() => { setStrengthNoteEditing(false); setStrengthNote(coachNote ?? ""); }}>Cancelar</button>
                    <button type="button" className="ghost-button accent" onClick={handleSaveStrengthNote} disabled={strengthNoteSaving}>
                      {strengthNoteSaving ? "Guardando..." : "Guardar prescripción"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="strength-prescription-display">
                  {strengthNote ? (
                    <pre className="strength-prescription-content">{strengthNote}</pre>
                  ) : (
                    <p className="strength-prescription-empty">Sin prescripción de ejercicios todavía. Haz clic en "Editar" para añadir ejercicios, series y repeticiones.</p>
                  )}
                  {onSaveCoachNote && (
                    <button type="button" className="ghost-button strength-prescription-edit-btn" onClick={() => setStrengthNoteEditing(true)}>
                      {strengthNote ? "Editar prescripción" : "Añadir prescripción"}
                    </button>
                  )}
                </div>
              )}
            </section>

            {preview.template.csv_examples.length > 0 && (
              <section className="library-workout-panel">
                <div className="library-workout-panel-head">
                  <span className="eyebrow">Ejemplos</span>
                  <h3>Sesiones de referencia</h3>
                </div>
                <div className="library-workout-dose-ladder">
                  {preview.template.csv_examples.map((example, i) => (
                    <div key={example} className="library-workout-dose-step">
                      <span className="library-workout-dose-step-index">{i + 1}</span>
                      <div className="library-workout-dose-step-body"><strong>{example}</strong></div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="library-workout-side-column">
            <section className="library-workout-panel compact">
              <div className="library-workout-panel-head"><span className="eyebrow">Métricas</span><h3>Ficha</h3></div>
              <div className="library-workout-stats-list">
                <div><span>Zona</span><strong>{preview.zone}</strong></div>
                <div><span>Fatiga</span><strong>{preview.template.fatigue_cost}/5</strong></div>
                <div><span>Confianza</span><strong>{Math.round(preview.template.confidence * 100)}%</strong></div>
                <div><span>Readiness</span><strong>{readinessLabel(preview.selection.readiness)}</strong></div>
              </div>
            </section>
            {preview.template.control_points.length > 0 && (
              <section className="library-workout-panel compact">
                <div className="library-workout-panel-head"><span className="eyebrow">Control</span><h3>Puntos a vigilar</h3></div>
                <ul className="library-workout-list">{preview.template.control_points.map((point) => <li key={point}>{point}</li>)}</ul>
              </section>
            )}
            {preview.template.coach_tips.length > 0 && (
              <section className="library-workout-panel compact">
                <div className="library-workout-panel-head"><span className="eyebrow">Coach tips</span><h3>Consejos</h3></div>
                <ul className="library-workout-list">{preview.template.coach_tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
              </section>
            )}
            {preview.template.cautions.length > 0 && (
              <section className="library-workout-panel compact caution">
                <div className="library-workout-panel-head"><span className="eyebrow">Cautelas</span><h3>Qué no hacer</h3></div>
                <ul className="library-workout-list">{preview.template.cautions.map((caution) => <li key={caution}>{caution}</li>)}</ul>
              </section>
            )}
          </aside>
        </div>
        ) : (
        /* ── Cardio layout (redesigned) ── */
        <>
        {/* ── Metrics strip ── */}
        <div className="wpm-metrics-strip">
          <div className="wpm-metric"><small>Duración</small><strong>{formatMinutesLabel(preview.totalDuration)}</strong></div>
          <div className="wpm-metric"><small>Trabajo útil</small><strong>{formatMinutesLabel(preview.usefulDuration)}</strong></div>
          <div className="wpm-metric"><small>Fatiga</small><strong>{preview.template.fatigue_cost}/5</strong></div>
          <div className="wpm-metric"><small>Readiness</small><strong>{readinessLabel(preview.selection.readiness)}</strong></div>
          {preview.selection.restMin ? (
            <div className="wpm-metric"><small>Rec reps</small><strong>{preview.selection.restMin} min</strong></div>
          ) : null}
        </div>

        {/* ── Threshold reference (prominent for coaches) ── */}
        {thresholdReference && (thresholdReference.lt1Label || thresholdReference.lt2Label) ? (
          <div className="wpm-threshold-bar">
            {thresholdReference.lt1Label ? (
              <span className="wpm-threshold-item lt1">
                <strong>LT1</strong> {thresholdReference.lt1Label}
                {thresholdReference.lt1Source ? <em> · {thresholdReference.lt1Source}</em> : null}
              </span>
            ) : null}
            {thresholdReference.lt2Label ? (
              <span className="wpm-threshold-item lt2">
                <strong>LT2</strong> {thresholdReference.lt2Label}
                {thresholdReference.lt2Source ? <em> · {thresholdReference.lt2Source}</em> : null}
              </span>
            ) : null}
            {preview.selection.prescriptionHint ? (
              <span className="wpm-threshold-hint">{preview.selection.prescriptionHint}</span>
            ) : null}
          </div>
        ) : preview.selection.prescriptionHint ? (
          <div className="wpm-threshold-bar">
            <span className="wpm-threshold-hint">{preview.selection.prescriptionHint}</span>
            {preview.selection.thresholdBasis ? <span className="wpm-threshold-basis">{preview.selection.thresholdBasis}</span> : null}
          </div>
        ) : null}

        {/* ── Timeline visualization (hero) ── */}
        <div className="wpm-timeline">
          <div className="wpm-timeline-phases">
            {/* Warmup */}
            <div className="wpm-phase wpm-phase-warmup">
              <div className="wpm-phase-label"><span>Calentamiento</span><strong>{formatMinutesLabel(preview.phaseTotals.warmup)}</strong></div>
              <div className="wpm-phase-visual warmup">
                <div className="library-workout-phase-warmup-base" style={{ width: `${Math.max(42, ((preview.phaseDetails.warmup.find((s) => s.tone === "warmup")?.durationMin ?? 0) / Math.max(preview.phaseTotals.warmup, 1)) * 100)}%` }} />
                <div className="library-workout-phase-warmup-markers">
                  {preview.phaseDetails.warmup.filter((s) => s.tone !== "warmup").map((s) => (
                    <span key={s.id} className={`library-workout-phase-warmup-marker ${s.tone}`} title={`${s.label} · ${formatMinutesLabel(s.durationMin)}`} />
                  ))}
                </div>
              </div>
              <p className="wpm-phase-desc">{preview.phaseMeta.warmupSummary}</p>
            </div>

            {/* Main block */}
            <div className="wpm-phase wpm-phase-main">
              <div className="wpm-phase-label"><span>Bloque principal</span><strong>{formatMinutesLabel(preview.phaseTotals.main)}</strong></div>
              <div className="wpm-phase-visual main">
                <div className="library-workout-phase-main-sequence">
                  {preview.phaseDetails.main.map((segment, index) => (
                    <div
                      key={segment.id}
                      className={`library-workout-phase-main-item ${segment.tone} ${segment.tone === "recovery" ? "recovery" : "work"}`}
                      style={{ flexGrow: Math.max(segment.durationMin, segment.tone === "recovery" ? 0.5 : 1) }}
                      title={`${segment.label} · ${formatMinutesLabel(segment.durationMin)}`}
                    >
                      {segment.tone !== "recovery" && <span className="library-workout-phase-main-bar" style={{ height: `${previewSegmentHeight(segment.tone) * 100}%` }} />}
                      {segment.tone === "recovery" && <span className="library-workout-phase-main-link" />}
                      {index < preview.phaseDetails.main.length - 1 && segment.tone !== "recovery" && <small>{formatMinutesLabel(segment.durationMin)}</small>}
                    </div>
                  ))}
                </div>
              </div>
              <p className="wpm-phase-desc">
                <strong>{preview.selection.label}</strong>
                <span> · {preview.phaseMeta.mainWorkCount} bloques{preview.phaseMeta.mainRecoveryCount > 0 ? ` · ${preview.phaseMeta.mainRecoveryCount} rec` : ""}{preview.selection.restMin ? ` · rec ${preview.selection.restMin}'` : ""}</span>
              </p>
            </div>

            {/* Cooldown */}
            <div className="wpm-phase wpm-phase-cooldown">
              <div className="wpm-phase-label"><span>Vuelta calma</span><strong>{formatMinutesLabel(preview.phaseTotals.cooldown)}</strong></div>
              <div className="wpm-phase-visual cooldown">
                <div className="library-workout-phase-cooldown-line" style={{ width: `${Math.max(38, ((preview.phaseTotals.cooldown || 0) / Math.max(preview.totalDuration || 1, 1)) * 220)}%` }} />
              </div>
              <p className="wpm-phase-desc">{preview.phaseMeta.cooldownSummary}</p>
            </div>
          </div>
        </div>

        {/* ── Body: structure + sidebar ── */}
        <div className="wpm-body">
          <div className="wpm-main">
            {/* Objective + guidance */}
            <div className="wpm-objective-block">
              <p className="wpm-objective">{preview.template.objective}</p>
              {(preview.selection.notes ?? preview.template.dose_guidance) ? (
                <p className="wpm-guidance">{preview.selection.notes ?? preview.template.dose_guidance}</p>
              ) : null}
            </div>

            {/* Structure */}
            <div className="wpm-structure">
              {preview.template.calentamiento_template && (
                <div className="wpm-structure-phase warmup">
                  <div className="wpm-structure-phase-head"><span>Calentamiento</span><strong>{preview.template.calentamiento_min}'</strong></div>
                  <p>{preview.template.calentamiento_template}</p>
                </div>
              )}
              <div className="wpm-structure-phase main">
                <div className="wpm-structure-phase-head"><span>Bloque principal</span><strong>{preview.selection.label}</strong></div>
                {preview.blocks.map((block) => (
                  <div key={block.id} className={`wpm-interval ${block.tone}`}>
                    <div className="wpm-interval-content"><strong>{block.label}</strong><p>{block.hint}</p></div>
                    <span className="wpm-interval-duration">{formatMinutesLabel(block.durationMin)}</span>
                  </div>
                ))}
              </div>
              {preview.template.enfriamiento_template && (
                <div className="wpm-structure-phase cooldown">
                  <div className="wpm-structure-phase-head"><span>Vuelta calma</span><strong>{preview.template.enfriamiento_min}'</strong></div>
                  <p>{preview.template.enfriamiento_template}</p>
                </div>
              )}
            </div>

            {/* Coach note */}
            {onSaveCoachNote && (
              <div className="wpm-coach-note">
                <div className="wpm-coach-note-head">
                  <span className="eyebrow">Nota del entrenador</span>
                  {!strengthNoteEditing && (
                    <button type="button" className="wpm-action-btn small" onClick={() => setStrengthNoteEditing(true)}>
                      {strengthNote ? "Editar" : "Añadir nota"}
                    </button>
                  )}
                </div>
                {strengthNoteEditing ? (
                  <div className="wpm-coach-note-editor">
                    <textarea
                      className="wpm-coach-note-textarea"
                      value={strengthNote}
                      onChange={(e) => setStrengthNote(e.target.value)}
                      placeholder="Notas para esta sesión..."
                      rows={4}
                      autoFocus
                    />
                    <div className="wpm-coach-note-actions">
                      <button type="button" className="wpm-action-btn" onClick={() => { setStrengthNoteEditing(false); setStrengthNote(coachNote ?? ""); }}>Cancelar</button>
                      <button type="button" className="wpm-action-btn accent" onClick={handleSaveStrengthNote} disabled={strengthNoteSaving}>
                        {strengthNoteSaving ? "Guardando..." : "Guardar"}
                      </button>
                    </div>
                  </div>
                ) : strengthNote ? (
                  <p className="wpm-coach-note-text">{strengthNote}</p>
                ) : null}
              </div>
            )}
          </div>

          <aside className="wpm-sidebar">
            {/* Dose ladder */}
            {preview.template.dose_ladder.length > 0 && (
              <div className="wpm-sidebar-section">
                <span className="eyebrow">Peldaños ({preview.template.dose_ladder.length})</span>
                <div className="wpm-dose-ladder">
                  {preview.template.dose_ladder.map((step) => {
                    const isActive = preview.selection.label === step.label;
                    return (
                      <button
                        key={step.step}
                        type="button"
                        className={`wpm-dose-step ${isActive ? "active" : ""}`}
                        onClick={() => onSelectDoseStep?.(step.step, step.label)}
                        title={step.notes || step.label}
                      >
                        <span className="wpm-dose-index">{step.step}</span>
                        <div className="wpm-dose-body">
                          <strong>{step.label}</strong>
                          {step.total_duration_min > 0 && <small>{step.total_duration_min}'</small>}
                        </div>
                        {isActive && <span className="wpm-dose-active">Activo</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Control points */}
            {preview.template.control_points.length > 0 && (
              <div className="wpm-sidebar-section">
                <span className="eyebrow">Puntos a vigilar</span>
                <ul className="wpm-sidebar-list">{preview.template.control_points.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            )}

            {/* Coach tips */}
            {preview.template.coach_tips.length > 0 && (
              <div className="wpm-sidebar-section">
                <span className="eyebrow">Consejos</span>
                <ul className="wpm-sidebar-list">{preview.template.coach_tips.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}

            {/* Cautions */}
            {preview.template.cautions.length > 0 && (
              <div className="wpm-sidebar-section wpm-caution">
                <span className="eyebrow">Cautelas</span>
                <ul className="wpm-sidebar-list">{preview.template.cautions.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
            )}
          </aside>
        </div>

        {rawInformation?.active && rawInformation.panel ? rawInformation.panel : null}
        </>
        )}
        </>
        )}
      </section>
    </div>
  );
}
