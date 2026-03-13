import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../lib/api";
import { PlanningWorkoutTemplate } from "../types";

type LibraryPageProps = {
  token: string;
};

type LibraryPreviewSelection = {
  source: "dose" | "example";
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

const DISCIPLINES = ["running", "ciclismo", "natación"] as const;

function disciplineLabel(value: string) {
  if (value === "ciclismo") return "Ciclismo";
  if (value === "natación") return "Natación";
  return "Carrera";
}

function roleLabel(value: string) {
  if (value === "key") return "P";       // Principal
  if (value === "support") return "S";   // Soporte
  if (value === "recovery") return "R";  // Recuperación
  if (value === "test") return "T";      // Test
  return value.charAt(0).toUpperCase();
}

function roleTone(value: string) {
  if (value === "key") return "key";
  if (value === "support") return "support";
  if (value === "recovery") return "recovery";
  return "test";
}

function fatigueDots(cost: number) {
  const filled = "●".repeat(Math.min(cost, 5));
  const empty = "○".repeat(Math.max(0, 5 - cost));
  return filled + empty;
}

function durationLabel(t: PlanningWorkoutTemplate): string {
  if (t.dose_ladder.length > 0) {
    const withDuration = t.dose_ladder.filter((s) => s.total_duration_min > 0);
    if (withDuration.length > 0) {
      const first = withDuration[0].total_duration_min;
      const last = withDuration[withDuration.length - 1].total_duration_min;
      if (first !== last) return `${first}–${last}min`;
      return `~${first}min`;
    }
  }
  return "";
}

function zoneTone(zone: string) {
  if (zone === "Recuperación") return "recovery";
  if (zone === "Base aeróbica") return "aerobic";
  if (zone === "LT1") return "lt1";
  if (zone === "SUB-T / Zona media") return "subthreshold";
  if (zone === "LT2 / Umbral") return "lt2";
  if (zone === "VO2 / Potencia") return "vo2";
  if (zone === "Neuromuscular") return "neuro";
  if (zone === "Técnica") return "technical";
  if (zone === "Específico") return "specific";
  if (zone === "Fuerza / Soporte") return "strength";
  if (zone === "Test") return "test";
  return "other";
}

function zoneCue(zone: string) {
  if (zone === "Recuperación") return "Carga baja y control fino de la fatiga residual.";
  if (zone === "Base aeróbica") return "Volumen útil para consolidar oxidación y estabilidad.";
  if (zone === "LT1") return "Trabajo extensivo cerca del primer umbral.";
  if (zone === "SUB-T / Zona media") return "Transición metabólica con densidad controlada.";
  if (zone === "LT2 / Umbral") return "Minutos de calidad alrededor del máximo estado estable.";
  if (zone === "VO2 / Potencia") return "Bloques intensos para techo aeróbico y potencia.";
  if (zone === "Neuromuscular") return "Economía, coordinación y reclutamiento de alta calidad.";
  if (zone === "Técnica") return "Eficiencia mecánica con fatiga contenida.";
  if (zone === "Específico") return "Sesiones cercanas a la demanda competitiva.";
  if (zone === "Fuerza / Soporte") return "Soporte estructural y transferencia al gesto.";
  if (zone === "Test") return "Sesiones de referencia para leer el estado actual.";
  return "Sesiones complementarias fuera de las familias principales.";
}

function zoneGlyph(zone: string) {
  if (zone === "Recuperación") return "RC";
  if (zone === "Base aeróbica") return "BA";
  if (zone === "LT1") return "LT1";
  if (zone === "SUB-T / Zona media") return "ST";
  if (zone === "LT2 / Umbral") return "LT2";
  if (zone === "VO2 / Potencia") return "VO2";
  if (zone === "Neuromuscular") return "NM";
  if (zone === "Técnica") return "TEC";
  if (zone === "Específico") return "ESP";
  if (zone === "Fuerza / Soporte") return "FZ";
  if (zone === "Test") return "TS";
  return "OT";
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
  // Only for simple patterns like "3×6'", "4×800m", "6×3'" — not nested
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

  const mainDuration = inferred.reduce((acc, minutes) => acc + minutes, 0);
  const extra = template.calentamiento_min + template.enfriamiento_min;
  return extra > 0 ? mainDuration + extra : mainDuration;
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

function formatCompactDurationLabel(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "var";
  if (value < 1) return `${Math.round(value * 60)}''`;
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) return `${rounded}'`;
  return `${rounded}'`;
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

function resolveBlockDurations(
  blocks: Array<{ id: string; label: string; durationMin: number | null; tone: string; hint: string }>,
  usefulDuration?: number | null,
  fallbackDuration?: number | null,
) {
  const inferredTotal = blocks.reduce((sum, block) => sum + (block.durationMin ?? 0), 0);
  const unresolvedCount = blocks.filter((block) => block.durationMin === null).length;
  const availableTotal =
    usefulDuration && usefulDuration > 0
      ? usefulDuration
      : fallbackDuration && fallbackDuration > 0
        ? fallbackDuration
        : null;
  const fallbackPerBlock = Math.max(
    4,
    Math.round((availableTotal ?? blocks.length * 8) / Math.max(blocks.length, 1)),
  );
  const distributedDuration =
    unresolvedCount > 0 && availableTotal && availableTotal > inferredTotal
      ? (availableTotal - inferredTotal) / unresolvedCount
      : fallbackPerBlock;

  return blocks.map((block) => ({
    ...block,
    durationMin: block.durationMin ?? distributedDuration,
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
  totalDurationHint?: number,
  idPrefix = "main",
): PreviewTimelineSegment[] {
  const repeatedBlock = label.match(/^(\d+)\s*[x×]\s*(.+)$/i);
  if (!repeatedBlock) {
    const duration = inferDurationMinutes(label) ?? totalDurationHint ?? 8;
    return [{
      id: `${idPrefix}-single`,
      label,
      durationMin: duration,
      tone: fallbackTone,
    }];
  }

  const repetitions = Number(repeatedBlock[1]);
  let rawExpression = repeatedBlock[2].trim();
  if (rawExpression.startsWith("(") && rawExpression.endsWith(")")) {
    rawExpression = rawExpression.slice(1, -1);
  }

  const parts = splitOutsideParentheses(rawExpression);
  const partDurations = parts.map((part) => inferDurationMinutes(part));
  const knownPerCycle = partDurations.reduce<number>((sum, duration) => sum + (duration ?? 0), 0);
  const unresolvedPartCount = partDurations.filter((duration) => duration === null).length;
  const totalKnownAcrossReps = knownPerCycle * repetitions;
  const distributedDuration =
    unresolvedPartCount > 0 && totalDurationHint && totalDurationHint > totalKnownAcrossReps
      ? (totalDurationHint - totalKnownAcrossReps) / (unresolvedPartCount * repetitions)
      : null;
  const segments: PreviewTimelineSegment[] = [];

  for (let rep = 0; rep < repetitions; rep += 1) {
    parts.forEach((part, index) => {
      const duration = partDurations[index] ?? distributedDuration ?? Math.max(1, Math.round((totalDurationHint ?? 30) / Math.max(repetitions * parts.length, 1)));
      const tone = resolvedBlockTone(part, fallbackTone);
      segments.push({
        id: `${idPrefix}-rep-${rep + 1}-${index + 1}`,
        label: parts.length === 1 ? `Rep ${rep + 1}` : part,
        durationMin: duration,
        tone,
        compact: duration < 3,
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
    return [{
      id: "warmup-base",
      label: "Calentamiento",
      durationMin: template.calentamiento_min,
      tone: "warmup",
    }];
  }

  const reps = Number(strideMatch[1]);
  const strideMin = Number(strideMatch[2]) / 60;
  const restMin = strideMatch[3] ? parseDecimalMinutes(strideMatch[3]) : 0;
  const strideWork = reps * strideMin;
  const strideRecovery = Math.max(0, reps - 1) * restMin;
  const baseMin = Math.max(1, template.calentamiento_min - strideWork - strideRecovery);
  const segments: PreviewTimelineSegment[] = [{
    id: "warmup-base",
    label: "Calent.",
    durationMin: baseMin,
    tone: "warmup",
  }];

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
  selection: LibraryPreviewSelection,
  blocks: Array<{ id: string; label: string; durationMin: number | null; tone: string }>,
) {
  if (blocks.length === 1) {
    return expandRepeatedBlock(blocks[0].label, blocks[0].tone, selection.restMin, blocks[0].durationMin ?? undefined, blocks[0].id);
  }

  return blocks.flatMap((block, index) => {
    const expanded = expandRepeatedBlock(block.label, block.tone, undefined, block.durationMin ?? undefined, block.id);
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
  const strideMatch = template.calentamiento_template.match(
    /(\d+)\s*[x×]\s*(?:rectas?|strides?|progresivos?)\s*(\d+)\s*''/i,
  );
  if (strideMatch) {
    return `${template.calentamiento_min}' progresivo + ${strideMatch[1]} activaciones`;
  }
  return shortenPhaseCopy(template.calentamiento_template, "Entrada progresiva suave.");
}

function summarizeCooldownTemplate(template: PlanningWorkoutTemplate) {
  return shortenPhaseCopy(template.enfriamiento_template, "Salida muy suave.");
}

function previewSegmentHeight(tone: string) {
  if (tone === "warmup") return 0.34;
  if (tone === "cooldown") return 0.28;
  if (tone === "recovery") return 0.18;
  if (tone === "rest") return 0.22;
  if (tone === "aerobic") return 0.56;
  if (tone === "steady") return 0.64;
  if (tone === "progressive") return 0.74;
  if (tone === "threshold") return 0.84;
  if (tone === "hard") return 1;
  if (tone === "neuromuscular") return 0.9;
  return 0.6;
}

// Zona fisiológica a partir de la familia de sesión
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

const ZONE_ORDER = [
  "Recuperación", "Base aeróbica", "LT1", "SUB-T / Zona media",
  "LT2 / Umbral", "VO2 / Potencia", "Neuromuscular",
  "Técnica", "Específico", "Fuerza / Soporte", "Test", "Otros",
];

export function LibraryPage({ token }: LibraryPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const discipline = searchParams.get("discipline") ?? "running";
  const [library, setLibrary] = useState<PlanningWorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsedZones, setCollapsedZones] = useState<Set<string>>(new Set());
  const [selectedPreview, setSelectedPreview] = useState<LibraryPreviewSelection | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpanded(null);
    setSelectedPreview(null);
    api.generalPlanningWorkoutLibrary(token, discipline)
      .then((result) => {
        if (!cancelled) setLibrary(result as PlanningWorkoutTemplate[]);
      })
      .catch((err) => {
        if (!cancelled) {
          setLibrary([]);
          setError(err instanceof Error ? err.message : "No se pudo cargar la librería.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [discipline, token]);

  useEffect(() => {
    if (!selectedPreview) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedPreview(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPreview]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return library;
    return library.filter(
      (t) =>
        t.public_label.toLowerCase().includes(q) ||
        t.session_family.toLowerCase().includes(q) ||
        t.objective.toLowerCase().includes(q) ||
        t.dose_guidance.toLowerCase().includes(q),
    );
  }, [library, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, PlanningWorkoutTemplate[]>();
    for (const zone of ZONE_ORDER) map.set(zone, []);
    for (const t of filtered) {
      const zone = sessionZone(t.session_family);
      const list = map.get(zone) ?? [];
      list.push(t);
      map.set(zone, list);
    }
    return [...map.entries()].filter(([, ts]) => ts.length > 0);
  }, [filtered]);

  const withLadderCount = useMemo(
    () => filtered.filter((t) => t.dose_ladder.length > 0).length,
    [filtered],
  );

  const totalDoseSteps = useMemo(
    () => filtered.reduce((acc, template) => acc + template.dose_ladder.length, 0),
    [filtered],
  );

  const activeTemplate = useMemo(
    () => (selectedPreview ? library.find((template) => template.template_id === selectedPreview.templateId) ?? null : null),
    [library, selectedPreview],
  );

  const workoutPreview = useMemo(() => {
    if (!selectedPreview || !activeTemplate) return null;

    const zone = selectedPreview.intensityZone ?? sessionZone(activeTemplate.session_family);
    const usefulDuration = selectedPreview.usefulDurationMin
      ?? inferDurationMinutes(selectedPreview.label);
    const blocks = buildPreviewBlocks(selectedPreview.label);
    const defaultMainTone = zonePreviewTone(zone);
    const normalizedBlocks = blocks.length > 0
      ? resolveBlockDurations(
          blocks.map((block) => ({
            ...block,
            tone: resolvedBlockTone(block.label, defaultMainTone),
          })),
          usefulDuration,
          selectedPreview.totalDurationMin,
        )
      : [
          {
            id: "main",
            label: "Bloque principal",
            durationMin: usefulDuration ?? selectedPreview.totalDurationMin ?? 30,
            tone: defaultMainTone,
            hint: "Bloque principal de la sesión.",
          },
        ];

    const repsCount = inferRepsCount(selectedPreview.label);
    const totalRestMin = repsCount && selectedPreview.restMin && repsCount > 1
      ? Math.round((repsCount - 1) * selectedPreview.restMin)
      : 0;

    const warmupSegments = buildWarmupSegments(activeTemplate);
    const mainSegments = buildMainTimelineSegments(selectedPreview, normalizedBlocks);
    const cooldownSegments: PreviewTimelineSegment[] = activeTemplate.enfriamiento_min > 0
      ? [{
          id: "cooldown",
          label: "Enfriamiento",
          durationMin: activeTemplate.enfriamiento_min,
          tone: "cooldown",
        }]
      : [];

    const phaseTotals = {
      warmup: warmupSegments.reduce((acc, segment) => acc + segment.durationMin, 0),
      main: mainSegments.reduce((acc, segment) => acc + segment.durationMin, 0),
      cooldown: cooldownSegments.reduce((acc, segment) => acc + segment.durationMin, 0),
    };

    const computedTotal = phaseTotals.warmup + phaseTotals.main + phaseTotals.cooldown;
    const totalDuration = computedTotal > 0
      ? computedTotal
      : (selectedPreview.totalDurationMin ?? estimateExampleDuration(activeTemplate, selectedPreview.label));

    const mainWorkSegments = mainSegments.filter((segment) => segment.tone !== "recovery");
    const mainRecoverySegments = mainSegments.filter((segment) => segment.tone === "recovery");
    const warmupActivationCount = warmupSegments.filter((segment) => segment.tone === "neuromuscular").length;
    const repsCountSafe = repsCount && repsCount > 0 ? repsCount : null;
    const perRepDurationMin = repsCountSafe && usefulDuration ? usefulDuration / repsCountSafe : null;
    const showWorkDurationLabels = mainWorkSegments.length <= 6;

    return {
      template: activeTemplate,
      selection: selectedPreview,
      zone,
      totalDuration,
      totalRestMin,
      usefulDuration,
      blocks: normalizedBlocks,
      phaseDetails: {
        warmup: warmupSegments,
        main: mainSegments,
        cooldown: cooldownSegments,
      },
      phaseTotals,
      phaseMeta: {
        mainWorkCount: mainWorkSegments.length,
        mainRecoveryCount: mainRecoverySegments.length,
        repsCount: repsCountSafe,
        perRepDurationMin,
        showWorkDurationLabels,
        warmupActivationCount,
        warmupSummary: summarizeWarmupTemplate(activeTemplate),
        cooldownSummary: summarizeCooldownTemplate(activeTemplate),
      },
      disciplineIconLabel: disciplineIcon(activeTemplate.discipline),
    };
  }, [activeTemplate, selectedPreview]);

  function toggleZone(zone: string) {
    setCollapsedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zone)) next.delete(zone); else next.add(zone);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  function setDiscipline(d: string) {
    const params = new URLSearchParams(searchParams);
    params.set("discipline", d);
    setSearchParams(params);
    setSearch("");
  }

  function openDosePreview(template: PlanningWorkoutTemplate, step: PlanningWorkoutTemplate["dose_ladder"][number]) {
    setSelectedPreview({
      source: "dose",
      templateId: template.template_id,
      label: step.label,
      notes: step.notes,
      totalDurationMin: step.total_duration_min,
      usefulDurationMin: step.total_useful_time_min,
      restMin: step.rest_min,
      intensityZone: step.intensity_zone,
      readiness: step.readiness_required,
    });
  }

  function openExamplePreview(template: PlanningWorkoutTemplate, label: string) {
    setSelectedPreview({
      source: "example",
      templateId: template.template_id,
      label,
      totalDurationMin: estimateExampleDuration(template, label) ?? undefined,
      usefulDurationMin: inferDurationMinutes(label) ?? undefined,
      intensityZone: sessionZone(template.session_family),
      readiness: template.fatigue_cost >= 4 ? "fresh" : template.fatigue_cost >= 3 ? "medium" : "any",
    });
  }

  return (
    <div className="page-grid">
      <section className="hero library-hero">
        <div className="hero-main library-hero-copy">
          <span className="eyebrow">Libreria</span>
          <h1>Sesiones por zona fisiologica</h1>
          <p>
            Todas las sesiones disponibles, organizadas por zona y listas para lectura rápida.
            Abre cualquier fila para ver estructura completa, calentamiento, enfriamiento y consejos.
          </p>
          <div className="library-hero-ribbon">
            <span className="library-ribbon-pill">
              <strong>{grouped.length}</strong>
              zonas visibles
            </span>
            <span className="library-ribbon-pill">
              <strong>{withLadderCount}</strong>
              con progresión
            </span>
            <span className="library-ribbon-pill">
              <strong>{totalDoseSteps}</strong>
              pasos de carga
            </span>
          </div>
        </div>

        <div className="library-hero-aside">
          <div className="library-hero-panel">
            <div className="library-hero-panel-head">
              <span className="eyebrow">Vista activa</span>
              <strong>{disciplineLabel(discipline)}</strong>
            </div>
            <div className="library-hero-metrics">
              <div className="hero-focus-card current">
                <small>Total</small>
                <strong>{filtered.length}</strong>
                <p>{search ? "sesiones filtradas" : "sesiones disponibles"}</p>
              </div>
              <div className="hero-focus-card">
                <small>Con escalera</small>
                <strong>{withLadderCount}</strong>
                <p>dose_ladder activo</p>
              </div>
              <div className="hero-focus-card">
                <small>Búsqueda</small>
                <strong>{search ? "Activa" : "Global"}</strong>
                <p>{search ? `“${search}”` : "sin filtros de texto"}</p>
              </div>
              <div className="hero-focus-card">
                <small>Lectura</small>
                <strong>Por zonas</strong>
                <p>orden fisiológico conservado</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card section-card library-toolbar lp-filter-bar">
        <div className="library-toolbar-main">
          <div className="library-discipline-row lp-filter-section">
            {DISCIPLINES.map((item) => (
              <button
                key={item}
                type="button"
                className={`discipline-tab ${discipline === item ? "active" : ""} ${item === "natación" ? "ad-tab-swim" : item === "ciclismo" ? "ad-tab-bike" : "ad-tab-run"}`}
                onClick={() => setDiscipline(item)}
              >
                {disciplineLabel(item)}
              </button>
            ))}
          </div>
          <label className="library-search-shell">
            <span className="library-search-label">Buscar</span>
            <input
              className="library-search"
              type="search"
              placeholder="Nombre, familia, objetivo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="library-toolbar-summary">
          <span className="library-summary-pill">{disciplineLabel(discipline)}</span>
          <span className="library-summary-pill">{filtered.length} sesiones</span>
          <span className="library-summary-pill">{grouped.length} zonas</span>
        </div>
      </section>

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">Cargando librería…</div>}

      {!loading && (
        <div className="library-zones">
          {grouped.length === 0 && (
            <section className="card section-card library-empty-state">
              <span className="eyebrow">Sin coincidencias</span>
              <h3>No hay sesiones que coincidan con la búsqueda actual.</h3>
              <p>Ajusta el texto o cambia de disciplina para volver a la vista completa.</p>
            </section>
          )}
          {grouped.map(([zone, templates]) => {
            const collapsed = collapsedZones.has(zone);
            const tone = zoneTone(zone);
            return (
              <section key={zone} className={`library-zone-section zone-${tone}`}>
                <button
                  type="button"
                  className="library-zone-header"
                  onClick={() => toggleZone(zone)}
                >
                  <span className={`library-zone-glyph zone-glyph-${tone}`}>{zoneGlyph(zone)}</span>
                  <span className="library-zone-head-copy">
                    <span className="library-zone-name">{zone}</span>
                    <span className="library-zone-cue">{zoneCue(zone)}</span>
                  </span>
                  <span className="library-zone-count">{templates.length} sesiones</span>
                  <span className="library-zone-toggle">{collapsed ? "▸" : "▾"}</span>
                </button>

                {!collapsed && (
                  <div className="library-zone-rows">
                    {templates.map((t) => {
                      const isOpen = expanded === t.template_id;
                      const dur = durationLabel(t);
                      const steps = t.dose_ladder.length > 0 ? t.dose_ladder : null;
                      return (
                        <div key={t.template_id} className={`library-row ${isOpen ? "open" : ""}`}>
                          <button
                            type="button"
                            className="library-row-header"
                            onClick={() => toggleExpand(t.template_id)}
                          >
                            <span className={`lib-role lib-role-${roleTone(t.session_role)}`}>
                              {roleLabel(t.session_role)}
                            </span>
                            <span className="lib-row-copy">
                              <span className="lib-name">{t.public_label}</span>
                              <span className="lib-subtitle">{t.objective}</span>
                            </span>
                            <span className="lib-meta">
                              {dur && <span className="lib-meta-pill lib-duration">{dur}</span>}
                              <span className="lib-meta-pill">{t.dose_ladder.length > 0 ? `${t.dose_ladder.length} pasos` : "ejemplos CSV"}</span>
                              <span className="lib-meta-pill lib-fatigue" title={`Fatiga: ${t.fatigue_cost}/5`}>
                                {fatigueDots(t.fatigue_cost)}
                              </span>
                            </span>
                            <span className="lib-chevron">{isOpen ? "▲" : "▼"}</span>
                          </button>

                          {/* Escalera de dosis o ejemplos — siempre visible */}
                              <div className="library-row-steps">
                            {steps
                              ? steps.map((s) => (
                                  <button
                                    key={s.step}
                                    type="button"
                                    className={`lib-step-chip lib-step-button readiness-${s.readiness_required}`}
                                    title={`${s.total_useful_time_min}' útiles · ${s.readiness_required} · ${s.notes}`}
                                    onClick={() => openDosePreview(t, s)}
                                  >
                                    {s.label}
                                    {s.total_duration_min > 0 && (
                                      <small>{s.total_duration_min}'</small>
                                    )}
                                  </button>
                                ))
                              : t.csv_examples.slice(0, 5).map((ex) => (
                                  <button
                                    key={ex}
                                    type="button"
                                    className="lib-step-chip lib-step-button readiness-any"
                                    onClick={() => openExamplePreview(t, ex)}
                                  >
                                    {ex}
                                  </button>
                                ))}
                          </div>

                          {/* Detalle expandido */}
                          {isOpen && (
                            <div className="library-row-detail">
                              <p className="lib-detail-summary">{t.summary}</p>

                              <div className="lib-detail-grid">
                                {t.calentamiento_template && (
                                  <div className="lib-detail-block">
                                    <small>Calentamiento ({t.calentamiento_min}')</small>
                                    <p>{t.calentamiento_template}</p>
                                  </div>
                                )}
                                {t.enfriamiento_template && (
                                  <div className="lib-detail-block">
                                    <small>Enfriamiento ({t.enfriamiento_min}')</small>
                                    <p>{t.enfriamiento_template}</p>
                                  </div>
                                )}
                                <div className="lib-detail-block">
                                  <small>Objetivo</small>
                                  <p>{t.objective}</p>
                                </div>
                                {t.coach_tips.length > 0 && (
                                  <div className="lib-detail-block full">
                                    <small>Consejos del entrenador</small>
                                    <ul className="lib-tips-list">
                                      {t.coach_tips.map((tip) => (
                                        <li key={tip}>{tip}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <div className="lib-detail-block">
                                  <small>Cautelas</small>
                                  <ul className="lib-tips-list muted">
                                    {t.cautions.map((c) => (
                                      <li key={c}>{c}</li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="lib-detail-block">
                                  <small>Adaptaciones esperadas</small>
                                  <ul className="lib-tips-list">
                                    {t.expected_adaptations.map((a) => (
                                      <li key={a}>{a}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>

                              {steps && steps.length > 0 && (
                                <div className="lib-ladder-detail">
                                  <small>Escalera de dosis completa</small>
                                  <div className="lib-ladder-rows">
                                    {steps.map((s) => (
                                      <div key={s.step} className={`lib-ladder-row readiness-bg-${s.readiness_required}`}>
                                        <span className="lib-ladder-step">P{s.step}</span>
                                        <span className="lib-ladder-label">{s.label}</span>
                                        <span className="lib-ladder-zone">{s.intensity_zone}</span>
                                        <span className="lib-ladder-time">{s.total_useful_time_min}' útiles</span>
                                        {s.total_duration_min > 0 && (
                                          <span className="lib-ladder-total">{s.total_duration_min}' total</span>
                                        )}
                                        <span className="lib-ladder-readiness">{s.readiness_required}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {workoutPreview && (
        <div className="target-modal-backdrop" onClick={() => setSelectedPreview(null)}>
          <section
            className="card target-modal-card library-workout-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="library-workout-modal-head">
              <div className="library-workout-title-wrap">
                <span className="eyebrow">Workout preview</span>
                <h2>{workoutPreview.selection.label}</h2>
                <p>{workoutPreview.template.public_label} · {disciplineLabel(workoutPreview.template.discipline)}</p>
              </div>
              <div className="library-workout-head-actions">
                <span className={`library-preview-source ${workoutPreview.selection.source}`}>
                  {workoutPreview.selection.source === "dose" ? "dose_ladder" : "csv_example"}
                </span>
                <button
                  type="button"
                  className="ghost-button library-workout-close"
                  onClick={() => setSelectedPreview(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="library-workout-hero">
              <div className="library-workout-summary-card">
                <div className="library-workout-badge-row">
                  <span className="library-workout-sport">{workoutPreview.disciplineIconLabel}</span>
                  <span className="library-workout-zone">{workoutPreview.zone}</span>
                  <span className="library-workout-readiness">{readinessLabel(workoutPreview.selection.readiness)}</span>
                </div>
                <div className="library-workout-metrics">
                  <div>
                    <small>Duración planificada</small>
                    <strong>{formatMinutesLabel(workoutPreview.totalDuration)}</strong>
                  </div>
                  <div>
                    <small>Trabajo útil</small>
                    <strong>{formatMinutesLabel(workoutPreview.usefulDuration)}</strong>
                  </div>
                  <div>
                    <small>Fatiga</small>
                    <strong>{workoutPreview.template.fatigue_cost}/5</strong>
                  </div>
                  <div>
                    <small>Confianza</small>
                    <strong>{Math.round(workoutPreview.template.confidence * 100)}%</strong>
                  </div>
                </div>
                <p className="library-workout-objective">{workoutPreview.template.objective}</p>
              </div>

              <div className="library-workout-timeline-card">
                <div className="library-workout-phase-grid">
                  <article className="library-workout-phase-card warmup">
                    <header>
                      <span>Calentamiento</span>
                      <strong>{formatMinutesLabel(workoutPreview.phaseTotals.warmup)}</strong>
                    </header>
                    <div className="library-workout-phase-visual warmup">
                      <div
                        className="library-workout-phase-warmup-base"
                        style={{
                          width: `${Math.max(
                            42,
                            ((workoutPreview.phaseDetails.warmup.find((segment) => segment.tone === "warmup")?.durationMin ?? 0)
                              / Math.max(workoutPreview.phaseTotals.warmup, 1)) * 100,
                          )}%`,
                        }}
                      />
                      <div className="library-workout-phase-warmup-markers">
                        {workoutPreview.phaseDetails.warmup
                          .filter((segment) => segment.tone !== "warmup")
                          .map((segment) => (
                            <span
                              key={segment.id}
                              className={`library-workout-phase-warmup-marker ${segment.tone}`}
                              title={`${segment.label} · ${formatMinutesLabel(segment.durationMin)}`}
                            />
                          ))}
                      </div>
                    </div>
                    <p>{workoutPreview.phaseMeta.warmupSummary}</p>
                  </article>

                  <article className="library-workout-phase-card main">
                    <header>
                      <span>Bloque principal</span>
                      <strong>{formatMinutesLabel(workoutPreview.phaseTotals.main)}</strong>
                    </header>
                    <div className="library-workout-phase-visual main">
                      <div className="library-workout-phase-main-sequence">
                        {workoutPreview.phaseDetails.main.map((segment) => (
                          <div
                            key={segment.id}
                            className={`library-workout-phase-main-item ${segment.tone} ${segment.tone === "recovery" ? "recovery" : "work"}`}
                            style={{
                              flexGrow: Math.max(segment.durationMin, segment.tone === "recovery" ? 0.5 : 1),
                            }}
                            title={`${segment.label} · ${formatMinutesLabel(segment.durationMin)}`}
                          >
                            {segment.tone !== "recovery" && (
                              <span
                                className="library-workout-phase-main-bar"
                                style={{ height: `${previewSegmentHeight(segment.tone) * 100}%` }}
                              />
                            )}
                            {segment.tone === "recovery" && <span className="library-workout-phase-main-link" />}
                            {workoutPreview.phaseMeta.showWorkDurationLabels && segment.tone !== "recovery" && (
                              <small>{formatCompactDurationLabel(segment.durationMin)}</small>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="library-workout-phase-caption">
                      <strong>{workoutPreview.selection.label}</strong>
                      <small>
                        {workoutPreview.phaseMeta.repsCount ? `${workoutPreview.phaseMeta.repsCount} repeticiones` : `${workoutPreview.phaseMeta.mainWorkCount} bloques de trabajo`}
                        {workoutPreview.phaseMeta.perRepDurationMin ? ` · ~${formatCompactDurationLabel(workoutPreview.phaseMeta.perRepDurationMin)} por rep` : ""}
                        {workoutPreview.phaseMeta.mainRecoveryCount > 0 ? ` · ${workoutPreview.phaseMeta.mainRecoveryCount} recuperaciones` : ""}
                        {workoutPreview.selection.restMin ? ` · rec ${workoutPreview.selection.restMin} min` : ""}
                      </small>
                    </div>
                  </article>

                  <article className="library-workout-phase-card cooldown">
                    <header>
                      <span>Enfriamiento</span>
                      <strong>{formatMinutesLabel(workoutPreview.phaseTotals.cooldown)}</strong>
                    </header>
                    <div className="library-workout-phase-visual cooldown">
                      <div
                        className="library-workout-phase-cooldown-line"
                        style={{
                          width: `${Math.max(
                            38,
                            ((workoutPreview.phaseTotals.cooldown || 0) / Math.max(workoutPreview.totalDuration || 1, 1)) * 220,
                          )}%`,
                        }}
                      />
                    </div>
                    <p>{workoutPreview.phaseMeta.cooldownSummary}</p>
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
                    {workoutPreview.template.calentamiento_template && (
                      <article className="library-workout-block warmup">
                        <header>
                          <span>Calentamiento</span>
                          <strong>{workoutPreview.template.calentamiento_min}'</strong>
                        </header>
                        <p>{workoutPreview.template.calentamiento_template}</p>
                      </article>
                    )}

                    <article className="library-workout-block main">
                      <header>
                        <span>Bloque principal</span>
                        <strong>{workoutPreview.selection.label}</strong>
                      </header>
                      <div className="library-workout-block-list">
                        {workoutPreview.blocks.map((block) => (
                          <div key={block.id} className={`library-workout-interval ${block.tone}`}>
                            <div>
                              <strong>{block.label}</strong>
                              <p>{block.hint}</p>
                            </div>
                            <span>{formatMinutesLabel(block.durationMin)}</span>
                          </div>
                        ))}
                      </div>
                      <p className="library-workout-block-note">
                        {workoutPreview.selection.notes ?? workoutPreview.template.dose_guidance}
                      </p>
                    </article>

                    {workoutPreview.template.enfriamiento_template && (
                      <article className="library-workout-block cooldown">
                        <header>
                          <span>Enfriamiento</span>
                          <strong>{workoutPreview.template.enfriamiento_min}'</strong>
                        </header>
                        <p>{workoutPreview.template.enfriamiento_template}</p>
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
                    <article>
                      <small>Resumen</small>
                      <p>{workoutPreview.template.summary}</p>
                    </article>
                    <article>
                      <small>Dose guidance</small>
                      <p>{workoutPreview.template.dose_guidance}</p>
                    </article>
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
                    <div><span>Zona</span><strong>{workoutPreview.zone}</strong></div>
                    {workoutPreview.phaseMeta.perRepDurationMin ? (
                      <div><span>Trabajo por rep</span><strong>{formatCompactDurationLabel(workoutPreview.phaseMeta.perRepDurationMin)}</strong></div>
                    ) : null}
                    <div><span>Recuperación entre reps</span><strong>{workoutPreview.selection.restMin ? `${workoutPreview.selection.restMin} min` : "No marcada"}</strong></div>
                    {workoutPreview.totalRestMin > 0 && (
                      <div><span>Descanso total en sesión</span><strong>{workoutPreview.totalRestMin} min</strong></div>
                    )}
                    <div><span>Readiness</span><strong>{readinessLabel(workoutPreview.selection.readiness)}</strong></div>
                    <div><span>Fuente</span><strong>{workoutPreview.selection.source === "dose" ? "Peldaño estructurado" : "Ejemplo CSV"}</strong></div>
                  </div>
                </section>

                {workoutPreview.template.control_points.length > 0 && (
                  <section className="library-workout-panel compact">
                    <div className="library-workout-panel-head">
                      <span className="eyebrow">Control</span>
                      <h3>Puntos a vigilar</h3>
                    </div>
                    <ul className="library-workout-list">
                      {workoutPreview.template.control_points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {workoutPreview.template.coach_tips.length > 0 && (
                  <section className="library-workout-panel compact">
                    <div className="library-workout-panel-head">
                      <span className="eyebrow">Coach tips</span>
                      <h3>Consejos</h3>
                    </div>
                    <ul className="library-workout-list">
                      {workoutPreview.template.coach_tips.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {workoutPreview.template.cautions.length > 0 && (
                  <section className="library-workout-panel compact caution">
                    <div className="library-workout-panel-head">
                      <span className="eyebrow">Cautelas</span>
                      <h3>Qué no hacer</h3>
                    </div>
                    <ul className="library-workout-list">
                      {workoutPreview.template.cautions.map((caution) => (
                        <li key={caution}>{caution}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </aside>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
