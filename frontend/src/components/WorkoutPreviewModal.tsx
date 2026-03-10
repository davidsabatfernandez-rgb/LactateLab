import { useEffect, useMemo } from "react";

import { PlanningWorkoutTemplate } from "../types";

export type WorkoutPreviewSelection = {
  source: "dose" | "example" | "planning";
  templateId: string;
  label: string;
  notes?: string;
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
  onClose: () => void;
};

function disciplineLabel(value: string) {
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

function disciplineIcon(value: string) {
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

export function WorkoutPreviewModal({ template, selection, onClose }: WorkoutPreviewModalProps) {
  useEffect(() => {
    if (!template || !selection) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, selection, template]);

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
      disciplineIconLabel: disciplineIcon(template.discipline),
    };
  }, [selection, template]);

  if (!preview) return null;

  const previewToneClass = preview.selection.source === "example" ? "example" : "dose";
  const previewSourceLabel = preview.selection.source === "dose" ? "dose_ladder" : preview.selection.source === "example" ? "csv_example" : "planning";

  return (
    <div className="target-modal-backdrop" onClick={onClose}>
      <section className="card target-modal-card library-workout-modal" onClick={(event) => event.stopPropagation()}>
        <div className="library-workout-modal-head">
          <div className="library-workout-title-wrap">
            <span className="eyebrow">Workout preview</span>
            <h2>{preview.selection.label}</h2>
            <p>{preview.template.public_label} · {disciplineLabel(preview.template.discipline)}</p>
          </div>
          <div className="library-workout-head-actions">
            <span className={`library-preview-source ${previewToneClass}`}>{previewSourceLabel}</span>
            <button type="button" className="ghost-button library-workout-close" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div className="library-workout-hero">
          <div className="library-workout-summary-card">
            <div className="library-workout-badge-row">
              <span className="library-workout-sport">{preview.disciplineIconLabel}</span>
              <span className="library-workout-zone">{preview.zone}</span>
              <span className="library-workout-readiness">{readinessLabel(preview.selection.readiness)}</span>
            </div>
            <div className="library-workout-metrics">
              <div><small>Duración planificada</small><strong>{formatMinutesLabel(preview.totalDuration)}</strong></div>
              <div><small>Trabajo útil</small><strong>{formatMinutesLabel(preview.usefulDuration)}</strong></div>
              <div><small>Fatiga</small><strong>{preview.template.fatigue_cost}/5</strong></div>
              <div><small>Confianza</small><strong>{Math.round(preview.template.confidence * 100)}%</strong></div>
            </div>
            <p className="library-workout-objective">{preview.template.objective}</p>
          </div>

          <div className="library-workout-timeline-card">
            <div className="library-workout-phase-grid">
              <article className="library-workout-phase-card warmup">
                <header><span>Calentamiento</span><strong>{formatMinutesLabel(preview.phaseTotals.warmup)}</strong></header>
                <div className="library-workout-phase-visual warmup">
                  <div
                    className="library-workout-phase-warmup-base"
                    style={{ width: `${Math.max(42, ((preview.phaseDetails.warmup.find((segment) => segment.tone === "warmup")?.durationMin ?? 0) / Math.max(preview.phaseTotals.warmup, 1)) * 100)}%` }}
                  />
                  <div className="library-workout-phase-warmup-markers">
                    {preview.phaseDetails.warmup.filter((segment) => segment.tone !== "warmup").map((segment) => (
                      <span key={segment.id} className={`library-workout-phase-warmup-marker ${segment.tone}`} title={`${segment.label} · ${formatMinutesLabel(segment.durationMin)}`} />
                    ))}
                  </div>
                </div>
                <p>{preview.phaseMeta.warmupSummary}</p>
              </article>

              <article className="library-workout-phase-card main">
                <header><span>Bloque principal</span><strong>{formatMinutesLabel(preview.phaseTotals.main)}</strong></header>
                <div className="library-workout-phase-visual main">
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
                <div className="library-workout-phase-caption">
                  <strong>{preview.selection.label}</strong>
                  <small>
                    {preview.phaseMeta.mainWorkCount} bloques de trabajo
                    {preview.phaseMeta.mainRecoveryCount > 0 ? ` · ${preview.phaseMeta.mainRecoveryCount} recuperaciones` : ""}
                    {preview.selection.restMin ? ` · rec ${preview.selection.restMin} min` : ""}
                  </small>
                </div>
              </article>

              <article className="library-workout-phase-card cooldown">
                <header><span>Enfriamiento</span><strong>{formatMinutesLabel(preview.phaseTotals.cooldown)}</strong></header>
                <div className="library-workout-phase-visual cooldown">
                  <div className="library-workout-phase-cooldown-line" style={{ width: `${Math.max(38, ((preview.phaseTotals.cooldown || 0) / Math.max(preview.totalDuration || 1, 1)) * 220)}%` }} />
                </div>
                <p>{preview.phaseMeta.cooldownSummary}</p>
              </article>
            </div>
          </div>
        </div>

        <div className="library-workout-modal-body">
          <div className="library-workout-main-column">
            <section className="library-workout-panel">
              <div className="library-workout-panel-head">
                <span className="eyebrow">Estructura</span>
                <h3>Vista rápida del entreno</h3>
              </div>
              <div className="library-workout-structure">
                {preview.template.calentamiento_template && (
                  <article className="library-workout-block warmup">
                    <header><span>Calentamiento</span><strong>{preview.template.calentamiento_min}'</strong></header>
                    <p>{preview.template.calentamiento_template}</p>
                  </article>
                )}
                <article className="library-workout-block main">
                  <header><span>Bloque principal</span><strong>{preview.selection.label}</strong></header>
                  <div className="library-workout-block-list">
                    {preview.blocks.map((block) => (
                      <div key={block.id} className={`library-workout-interval ${block.tone}`}>
                        <div><strong>{block.label}</strong><p>{block.hint}</p></div>
                        <span>{formatMinutesLabel(block.durationMin)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="library-workout-block-note">{preview.selection.notes ?? preview.template.dose_guidance}</p>
                </article>
                {preview.template.enfriamiento_template && (
                  <article className="library-workout-block cooldown">
                    <header><span>Enfriamiento</span><strong>{preview.template.enfriamiento_min}'</strong></header>
                    <p>{preview.template.enfriamiento_template}</p>
                  </article>
                )}
              </div>
            </section>

            <section className="library-workout-panel">
              <div className="library-workout-panel-head">
                <span className="eyebrow">Guía</span>
                <h3>Lectura del entrenador</h3>
              </div>
              <div className="library-workout-copy-grid">
                <article><small>Resumen</small><p>{preview.template.summary}</p></article>
                <article><small>Dose guidance</small><p>{preview.template.dose_guidance}</p></article>
              </div>
            </section>
          </div>

          <aside className="library-workout-side-column">
            <section className="library-workout-panel compact">
              <div className="library-workout-panel-head">
                <span className="eyebrow">Métricas</span>
                <h3>Ficha</h3>
              </div>
              <div className="library-workout-stats-list">
                <div><span>Zona</span><strong>{preview.zone}</strong></div>
                <div><span>Recuperación entre reps</span><strong>{preview.selection.restMin ? `${preview.selection.restMin} min` : "No marcada"}</strong></div>
                {preview.totalRestMin > 0 && <div><span>Descanso total en sesión</span><strong>{preview.totalRestMin} min</strong></div>}
                <div><span>Readiness</span><strong>{readinessLabel(preview.selection.readiness)}</strong></div>
                <div><span>Fuente</span><strong>{preview.selection.source === "dose" ? "Peldaño estructurado" : preview.selection.source === "planning" ? "Planificación" : "Ejemplo CSV"}</strong></div>
              </div>
            </section>

            {preview.template.control_points.length > 0 && (
              <section className="library-workout-panel compact">
                <div className="library-workout-panel-head">
                  <span className="eyebrow">Control</span>
                  <h3>Puntos a vigilar</h3>
                </div>
                <ul className="library-workout-list">
                  {preview.template.control_points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </section>
            )}

            {preview.template.coach_tips.length > 0 && (
              <section className="library-workout-panel compact">
                <div className="library-workout-panel-head">
                  <span className="eyebrow">Coach tips</span>
                  <h3>Consejos</h3>
                </div>
                <ul className="library-workout-list">
                  {preview.template.coach_tips.map((tip) => <li key={tip}>{tip}</li>)}
                </ul>
              </section>
            )}

            {preview.template.cautions.length > 0 && (
              <section className="library-workout-panel compact caution">
                <div className="library-workout-panel-head">
                  <span className="eyebrow">Cautelas</span>
                  <h3>Qué no hacer</h3>
                </div>
                <ul className="library-workout-list">
                  {preview.template.cautions.map((caution) => <li key={caution}>{caution}</li>)}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
