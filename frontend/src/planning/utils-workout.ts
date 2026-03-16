import type { WorkoutPreviewSelection } from "../components/WorkoutPreviewModal";
import type { PlanningMesocycleDraftSession, PlanningMesocycleTemplate, PlanningPlannedSession, PlanningWorkoutTemplate } from "../types";
import type { resolveTrainingThreshold } from "../lib/trainingThresholds";
import type { CalendarEntry, CalendarSession, ComplianceStatus, GarminCalendarActivity, MicrocycleWeek, OpenWorkoutPreviewState, PlanTone, PlanningCalendarSource, WorkoutLibraryLayer } from "./types";
import { addDays, buildPlanningPrescriptionHint, dateValue, disciplineLabel, estimateMinutesFromDose, formatThresholdCoachLine, formatThresholdPrimaryMetric, formatThresholdRange, objectiveFamily, startOfWeek } from "./utils";

// ── Mesocycle template helpers ──

export function mesocycleTemplateMatchesDiscipline(template: PlanningMesocycleTemplate, discipline: string) {
  return template.discipline === discipline || template.discipline === "all";
}

export function resolveMesocycleTemplateForSource(
  source: PlanningCalendarSource,
  templates: PlanningMesocycleTemplate[],
) {
  if (source.templateId) {
    const byId = templates.find((template) => template.template_id === source.templateId);
    if (byId) return byId;
  }
  if (source.blockType) {
    return templates.find((template) => (
      template.block_type === source.blockType
      && mesocycleTemplateMatchesDiscipline(template, source.discipline)
    )) ?? null;
  }
  return null;
}

// ── Workout blueprints ──

export function buildWorkoutBlueprints(source: PlanningCalendarSource) {
  const family = objectiveFamily(source.objective || source.title);
  const density = source.density || "media";
  const highDensity = density === "alta";
  const mediumLong = density === "baja" ? "75-90'" : density === "alta" ? "105-120'" : "90-105'";

  if (source.discipline === "ciclismo") {
    if (family === "lt2") {
      return [
        { weekday: 2, sessionType: "clave", title: "LT2 sostenido", objective: "Elevar potencia estable cercana a umbral.", dose: "3 x 12-16' @ LT2", description: "Recuperación 4'. Mantén potencia y deriva de FC controladas.", confidence: "alta" as const },
        { weekday: 4, sessionType: "soporte", title: "Tempo controlado", objective: "Acumular trabajo subumbral sin fatiga excesiva.", dose: "2 x 20-30' entre LT1 alta y LT2 baja", description: "Sesión puente para sostener tiempo útil sin abrir demasiado la semana.", confidence: "media" as const },
        { weekday: 6, sessionType: "fondo", title: "Salida aeróbica con final vivo", objective: "Transferir el bloque al gesto prolongado.", dose: `${mediumLong} con 20' finales controlados`, description: "El final debe sentirse firme, no como test.", confidence: "media" as const },
      ];
    }
    if (family === "vo2") {
      return [
        { weekday: 2, sessionType: "clave", title: "VO2 corto", objective: "Abrir potencia aeróbica sin destruir la semana.", dose: "5-6 x 3' fuertes / 3' suaves", description: "Calidad alta, pero con volumen total acotado.", confidence: "alta" as const },
        { weekday: 4, sessionType: "soporte", title: "LT1 largo", objective: "Sostener base mientras el bloque es más agudo.", dose: "2 x 20-25' LT1", description: "No mezclar torque, VO2 y sprint el mismo día.", confidence: "media" as const },
        { weekday: 6, sessionType: "fondo", title: "Resistencia con cadencia", objective: "Dar continuidad sin cargar demasiado la glucólisis.", dose: `${mediumLong} con bloques de cadencia`, description: "Foco técnico y eficiencia de pedaleo.", confidence: "media" as const },
      ];
    }
    return [
      { weekday: 2, sessionType: "clave", title: "LT1 extensivo", objective: "Ampliar tiempo útil en zona estable.", dose: "3 x 20-25' LT1", description: "Controla lactato y evita irte a ritmo de competición.", confidence: "alta" as const },
      { weekday: 4, sessionType: "soporte", title: "Cadencia o torque", objective: "Ajustar el gesto dominante del bloque.", dose: "6-8 repeticiones técnicas", description: "Escoge cadencia o torque, no ambos si el atleta viene cargado.", confidence: "media" as const },
      { weekday: 6, sessionType: "fondo", title: "Fondo aeróbico", objective: "Consolidar durabilidad y economía.", dose: mediumLong, description: "Debe dejar sensación de control, no de vaciado.", confidence: "alta" as const },
    ];
  }

  if (source.discipline === "natación") {
    if (family === "lt2") {
      return [
        { weekday: 1, sessionType: "clave", title: "CSS sostenido", objective: "Fijar ritmo competitivo controlado.", dose: "3 x 600-800m CSS/LT2", description: "Recuperación corta con técnica estable.", confidence: "alta" as const },
        { weekday: 3, sessionType: "soporte", title: "Técnica + aeróbico", objective: "Sostener metros útiles con buena mecánica.", dose: "Serie técnica + 20-30' continuo", description: "No sacrificar brazada por densidad.", confidence: "media" as const },
        { weekday: 5, sessionType: "fondo", title: "Continuidad aeróbica", objective: "Construir volumen transferible al bloque.", dose: "45-70' acumulados", description: "Ritmo controlado y respiración estable.", confidence: "media" as const },
      ];
    }
    return [
      { weekday: 1, sessionType: "clave", title: "Aeróbico técnico", objective: "Elevar continuidad sin romper técnica.", dose: "4 x 400m controlados", description: "La calidad del apoyo manda sobre el reloj.", confidence: "alta" as const },
      { weekday: 3, sessionType: "soporte", title: "Educativos + pull", objective: "Refinar economía acuática.", dose: "30-45' técnica integrada", description: "Bloque de soporte, no test encubierto.", confidence: "media" as const },
      { weekday: 5, sessionType: "fondo", title: "Continuo progresivo", objective: "Extender metros útiles de forma conservadora.", dose: "1 bloque continuo o 2 bloques largos", description: "Termina con sensación de margen.", confidence: "media" as const },
    ];
  }

  if (family === "lt2") {
    return [
      { weekday: 2, sessionType: "clave", title: "LT2 específico", objective: "Sostener ritmo próximo al objetivo sin deriva excesiva.", dose: "4-5 x 6-8' @ LT2", description: "Recuperación 2'. Ritmo sólido, no final en vacío.", confidence: "alta" as const },
      { weekday: 4, sessionType: "soporte", title: "Tempo subumbral", objective: "Acumular minutos útiles y estabilidad interna.", dose: "20-30' continuos o 2 x 15'", description: "Sesión de control para que la semana no quede solo en un pico.", confidence: "media" as const },
      { weekday: 6, sessionType: "fondo", title: "Tirada con final progresivo", objective: "Transferir el bloque a durabilidad específica.", dose: mediumLong, description: "Últimos 15-20' algo más vivos, sin convertirlo en competición.", confidence: "media" as const },
    ];
  }
  if (family === "vo2") {
    return [
      { weekday: 2, sessionType: "clave", title: "VO2 controlado", objective: "Elevar techo aeróbico con volumen acotado.", dose: highDensity ? "6 x 3'" : "5 x 3'", description: "La semana necesita espacio para absorberlo.", confidence: "alta" as const },
      { weekday: 4, sessionType: "soporte", title: "Rodaje LT1", objective: "Mantener base mientras el estímulo principal es más agudo.", dose: "35-50' LT1", description: "Debe sentirse estable y comparable.", confidence: "media" as const },
      { weekday: 6, sessionType: "fondo", title: "Tirada aeróbica", objective: "No perder economía ni continuidad.", dose: mediumLong, description: "Sin final intenso si el martes dejó fatiga real.", confidence: "media" as const },
    ];
  }
  if (family === "recovery") {
    return [
      { weekday: 2, sessionType: "clave", title: "Activación ligera", objective: "Mover sin arrastrar fatiga.", dose: "30-40' suaves + 4 progresivos", description: "La sesión existe para recuperar, no para sumar carga.", confidence: "alta" as const },
      { weekday: 4, sessionType: "soporte", title: "Rodaje fácil", objective: "Mantener gesto y sensaciones.", dose: "35-50' muy controlados", description: "Si la señal fisiológica no limpia, se recorta.", confidence: "alta" as const },
      { weekday: 6, sessionType: "fondo", title: "Continuidad suave", objective: "Cerrar semana con margen.", dose: "50-70' suaves", description: "Sin estímulo duro oculto.", confidence: "media" as const },
    ];
  }
  return [
    { weekday: 2, sessionType: "clave", title: "LT1 extensivo", objective: "Ampliar base útil y estabilidad subumbral.", dose: "3 x 10-15' LT1", description: "Debe permitir leer mejor el lactato a igual carga al final del bloque.", confidence: "alta" as const },
    { weekday: 4, sessionType: "soporte", title: "Economía y técnica", objective: "Apoyar el bloque sin distorsionar la señal fisiológica.", dose: "40-50' suaves + técnica", description: "Trabajo de soporte para que el martes tenga traducción real.", confidence: "media" as const },
    { weekday: 6, sessionType: "fondo", title: "Tirada aeróbica", objective: "Construir durabilidad y control interno.", dose: mediumLong, description: "Carga sostenida con margen claro.", confidence: "alta" as const },
  ];
}

// ── Synthetic / Persisted calendar sessions ──

export function buildSyntheticCalendarSessions(source: PlanningCalendarSource) {
  const blueprints = buildWorkoutBlueprints(source);
  const start = startOfWeek(source.startDate);
  const end = source.endDate;
  const sessions: CalendarSession[] = [];
  let currentWeek = start;
  let weekIndex = 0;
  while (dateValue(currentWeek) <= dateValue(end) && weekIndex < 8) {
    blueprints.forEach((blueprint, blueprintIndex) => {
      const sessionDate = addDays(currentWeek, blueprint.weekday - 1);
      if (dateValue(sessionDate) < dateValue(source.startDate) || dateValue(sessionDate) > dateValue(end)) return;
      const weekTone = weekIndex === 0 ? "arranque" : dateValue(addDays(currentWeek, 13)) > dateValue(end) ? "cierre" : "construcción";
      sessions.push({
        id: `${source.id}-${sessionDate}-${blueprintIndex}`,
        date: sessionDate,
        discipline: source.discipline,
        title: blueprint.title,
        sessionType: blueprint.sessionType,
        objective: blueprint.objective,
        description: `${blueprint.description} Semana de ${weekTone} del bloque ${source.objective.toLowerCase()}.`,
        dose: blueprint.dose,
        confidence: blueprint.confidence,
        estimatedMinutes: estimateMinutesFromDose(blueprint.dose),
      });
    });
    currentWeek = addDays(currentWeek, 7);
    weekIndex += 1;
  }
  return sessions.sort((a, b) => dateValue(a.date) - dateValue(b.date));
}

export function buildPersistedCalendarSessions(source: PlanningCalendarSource, plannedSessions: PlanningPlannedSession[]) {
  if (source.kind !== "planned" || !source.focusBlockId) return null;
  const selected = plannedSessions
    .filter((session) => session.focus_block_id === source.focusBlockId || session.focus_block_id == null)
    .map<CalendarSession>((session) => {
      // Derive compliance from backend execution_status when available
      let compliance: ComplianceStatus | null = null;
      const execStatus = session.execution_status;
      if (execStatus === "completed") {
        compliance = { status: "completed", reasons: [] };
      } else if (execStatus === "partial") {
        compliance = { status: "partial", reasons: ["Sesion parcialmente completada"] };
      } else if (execStatus === "skipped") {
        compliance = { status: "missed", reasons: ["Sesion marcada como no realizada"] };
      }

      // Build garminActivity from actual_performance if available
      let garminActivity: GarminCalendarActivity | null = null;
      const perf = session.actual_performance;
      if (perf && session.linked_activity_id) {
        garminActivity = {
          provider_activity_id: session.linked_activity_id,
          sport_type: session.discipline,
          started_at: perf.started_at || session.scheduled_date,
          distance_m: perf.distance_m || 0,
          moving_time_seconds: perf.duration_s || 0,
          average_heartrate: perf.avg_hr ?? null,
          max_heartrate: null,
          average_watts: perf.avg_power ?? null,
        };
      }

      return {
        id: `planned-session-${session.id}`,
        date: session.scheduled_date,
        discipline: session.discipline,
        title: session.public_label,
        sessionType: session.session_role,
        objective: session.objective,
        description: [session.coach_note, session.expected_signal].filter(Boolean).join(" "),
        dose: session.dose_prescription,
        confidence: session.confidence >= 0.85 ? "alta" : "media",
        estimatedMinutes: typeof session.payload?.total_duration_min === "number"
          ? Number(session.payload.total_duration_min)
          : estimateMinutesFromDose(session.dose_prescription),
        rawId: session.id,
        blaCheck: session.bla_check,
        publishStatus: session.publish_status,
        publishError: session.publish_error,
        targetsStale: session.targets_stale,
        thresholdSnapshotDate: session.threshold_snapshot_date,
        garminActivity,
        compliance,
        coachFeedback: session.coach_feedback ?? null,
        coachFeedbackAt: session.coach_feedback_at ?? null,
        executionRating: session.execution_rating ?? null,
      };
    });

  return selected.length ? selected.sort((a, b) => dateValue(a.date) - dateValue(b.date)) : null;
}

// ── Workout template resolution ──

export function findWorkoutDoseStep(template: PlanningWorkoutTemplate, doseLabel?: string | null, doseStepIndex?: number | null) {
  if (!template.dose_ladder.length) return null;
  if (doseLabel) {
    const byLabel = template.dose_ladder.find((step) => step.label === doseLabel);
    if (byLabel) return byLabel;
  }
  if (doseStepIndex != null) {
    return template.dose_ladder.find((step) => step.step === doseStepIndex || step.step === doseStepIndex + 1) ?? null;
  }
  return null;
}

export function resolveWorkoutTemplate(
  workoutLibrary: PlanningWorkoutTemplate[],
  options: {
    templateId?: string | null;
    family?: string | null;
    label?: string | null;
  },
) {
  return workoutLibrary.find((template) => template.template_id === options.templateId)
    ?? workoutLibrary.find((template) => template.session_family === options.family)
    ?? workoutLibrary.find((template) => template.public_label === options.label)
    ?? null;
}

export function buildDraftWorkoutPreviewSelection(
  template: PlanningWorkoutTemplate,
  session: PlanningMesocycleDraftSession,
): WorkoutPreviewSelection {
  const doseStepIndex = session.payload?.dose_step_index as number | null | undefined;
  const doseLabel = session.dose_prescription || template.csv_examples[0] || template.public_label;
  const step = findWorkoutDoseStep(template, session.dose_prescription, doseStepIndex);

  return {
    source: "planning",
    templateId: template.template_id,
    label: doseLabel,
    notes: session.progression_note || session.coach_note || session.expected_signal || template.dose_guidance,
    totalDurationMin: step?.total_duration_min,
    usefulDurationMin: step?.total_useful_time_min,
    restMin: step?.rest_min,
    intensityZone: step?.intensity_zone,
    readiness: step?.readiness_required ?? (template.fatigue_cost >= 4 ? "fresh" : template.fatigue_cost >= 3 ? "medium" : "any"),
  };
}

export function buildPlannedWorkoutPreviewSelection(
  template: PlanningWorkoutTemplate,
  session: PlanningPlannedSession,
): WorkoutPreviewSelection {
  const doseStepIndex = session.payload?.dose_step_index as number | null | undefined;
  const step = findWorkoutDoseStep(template, session.dose_prescription, doseStepIndex);

  return {
    source: "planning",
    templateId: template.template_id,
    plannedSessionId: session.id,
    label: session.dose_prescription || template.csv_examples[0] || template.public_label,
    notes: session.progression_note || session.coach_note || session.expected_signal || template.dose_guidance,
    totalDurationMin: step?.total_duration_min,
    usefulDurationMin: step?.total_useful_time_min,
    restMin: step?.rest_min,
    intensityZone: step?.intensity_zone,
    readiness: step?.readiness_required ?? (template.fatigue_cost >= 4 ? "fresh" : template.fatigue_cost >= 3 ? "medium" : "any"),
  };
}

// ── Synthetic preview builders ──

function syntheticWarmupTemplate(discipline: string) {
  if (discipline === "ciclismo") return "12-15' progresivos + 3 activaciones de cadencia.";
  if (discipline === "natación") return "Entrada progresiva + técnica básica antes del bloque principal.";
  return "12-15' suaves + movilidad dinámica + 4 activaciones cortas.";
}

function syntheticCooldownTemplate(discipline: string) {
  if (discipline === "ciclismo") return "8-10' muy suaves soltando cadencia.";
  if (discipline === "natación") return "200-400m suaves para soltar.";
  return "8-10' trote muy suave para salir limpio.";
}

function syntheticSessionZone(session: CalendarEntry) {
  const family = objectiveFamily(`${session.sessionType} ${session.objective} ${session.title}`);
  if (family === "lt2") return "LT2";
  if (family === "vo2") return "VO2";
  if (family === "technique") return "Técnica";
  if (family === "recovery") return "Recuperación";
  return "LT1";
}

export function buildSyntheticCalendarWorkoutPreview(
  session: CalendarEntry,
  source: PlanningCalendarSource,
  lt1: ReturnType<typeof resolveTrainingThreshold>,
  lt2: ReturnType<typeof resolveTrainingThreshold>,
  thresholdBasis: string,
): OpenWorkoutPreviewState {
  const discipline = session.layerDiscipline || session.discipline;
  const warmupMin = session.sessionType === "clave" ? 18 : session.sessionType === "fondo" ? 12 : 10;
  const cooldownMin = session.sessionType === "clave" ? 10 : 8;
  const totalDurationMin = session.estimatedMinutes ?? (estimateMinutesFromDose(session.dose) || undefined);
  const usefulDurationMin = totalDurationMin ? Math.max(10, totalDurationMin - warmupMin - cooldownMin) : undefined;
  const family = objectiveFamily(`${session.sessionType} ${session.objective} ${session.title}`);
  const fatigueCost = session.sessionType === "clave" ? 4 : session.sessionType === "fondo" ? 3 : family === "recovery" ? 1 : 2;
  const templateId = `calendar-preview-${session.id}`;

  return {
    template: {
      template_id: templateId,
      discipline,
      compatible_block_types: [],
      session_role: session.sessionType,
      session_family: family,
      public_label: session.title,
      summary: session.description || session.objective,
      objective: session.objective,
      dose_guidance: session.description || "Sesión editable desde calendario, sin automatismos sobre la semana.",
      progression_axes: [source.objective],
      control_points: [
        "Mantener la intención fisiológica del bloque sin forzar la deriva.",
        "Revisar sensaciones y calidad mecánica al terminar.",
      ],
      expected_adaptations: [session.objective],
      cautions: [
        "No convertir la sesión en test si no estaba previsto.",
        "Ajusta manualmente si el atleta llega sin margen de recuperación.",
      ],
      confidence: session.confidence === "alta" ? 0.9 : 0.76,
      evidence: [],
      variants: [],
      builder_variables: [],
      csv_examples: [session.dose],
      fatigue_cost: fatigueCost,
      calentamiento_min: warmupMin,
      calentamiento_template: syntheticWarmupTemplate(discipline),
      enfriamiento_min: cooldownMin,
      enfriamiento_template: syntheticCooldownTemplate(discipline),
      coach_tips: [
        source.intent || "Usa esta sesión como referencia operativa del bloque actual.",
        session.description || "Mantén el criterio del entrenador por encima de cualquier sugerencia.",
      ],
      dose_ladder: [],
    },
    selection: {
      source: "planning",
      templateId,
      plannedSessionId: session.rawId,
      label: session.dose || session.title,
      notes: session.description,
      prescriptionHint: buildPlanningPrescriptionHint(session.objective, session.title, discipline, lt1, lt2),
      thresholdBasis,
      totalDurationMin,
      usefulDurationMin,
      intensityZone: syntheticSessionZone(session),
      readiness: fatigueCost >= 4 ? "fresh" : fatigueCost >= 3 ? "medium" : "any",
    },
  };
}

export function buildLibraryWorkoutPreview(
  template: PlanningWorkoutTemplate,
  lt1: ReturnType<typeof resolveTrainingThreshold>,
  lt2: ReturnType<typeof resolveTrainingThreshold>,
  thresholdBasis: string,
): OpenWorkoutPreviewState {
  const firstStep = template.dose_ladder[0] ?? null;
  const fallbackLabel = template.csv_examples[0] || template.public_label;

  return {
    template,
    selection: {
      source: "planning",
      templateId: template.template_id,
      label: firstStep?.label || fallbackLabel,
      notes: template.dose_guidance || template.summary,
      totalDurationMin: firstStep?.total_duration_min,
      usefulDurationMin: firstStep?.total_useful_time_min,
      restMin: firstStep?.rest_min,
      intensityZone: firstStep?.intensity_zone,
      readiness: firstStep?.readiness_required ?? (template.fatigue_cost >= 4 ? "fresh" : template.fatigue_cost >= 3 ? "medium" : "any"),
      prescriptionHint: buildPlanningPrescriptionHint(template.objective, template.public_label, template.discipline, lt1, lt2),
      thresholdBasis,
    },
  };
}

// ── Workout library classification ──

export function workoutLayerForTemplate(template: PlanningWorkoutTemplate): WorkoutLibraryLayer {
  const family = template.session_family.toLowerCase();
  const objective = template.objective.toLowerCase();
  const zone = (template.dose_ladder[0]?.intensity_zone || "").toLowerCase();
  const combined = `${family} ${objective} ${zone}`;

  if (combined.includes("recovery") || combined.includes("regener") || combined.includes("lt0") || combined.includes("rest")) return "recovery";
  if (combined.includes("specific") || combined.includes("race pace") || combined.includes("compet") || combined.includes("brick") || combined.includes("css")) return "specific";
  if (combined.includes("strength") || combined.includes("torque") || combined.includes("fuerza")) return "strength";
  if (combined.includes("tech") || combined.includes("técn") || combined.includes("economy") || combined.includes("cadence") || combined.includes("aero_stability")) return "technique";
  if (combined.includes("vo2")) return "vo2";
  if (combined.includes("lt2") || combined.includes("threshold") || combined.includes("umbral")) return "lt2";
  if (combined.includes("subthreshold") || combined.includes("sub-t") || combined.includes("e2") || combined.includes("lt1→lt2") || combined.includes("lt1->lt2")) return "subthreshold";
  if (combined.includes("lt1")) return "lt1";
  if (combined.includes("base") || combined.includes("endur") || combined.includes("aerób") || combined.includes("aerob") || combined.includes("durability")) return "base";
  return "other";
}

export function workoutLayerLabel(layer: WorkoutLibraryLayer) {
  if (layer === "base") return "Base";
  if (layer === "lt1") return "LT1";
  if (layer === "subthreshold") return "Subumbral";
  if (layer === "lt2") return "LT2";
  if (layer === "vo2") return "VO2";
  if (layer === "technique") return "Técnica";
  if (layer === "strength") return "Fuerza";
  if (layer === "specific") return "Específico";
  if (layer === "recovery") return "Recuperación";
  if (layer === "other") return "Otros";
  return "Otros";
}

export function workoutLayerTone(layer: WorkoutLibraryLayer) {
  if (layer === "recovery") return "recovery";
  if (layer === "base") return "aerobic";
  if (layer === "lt1") return "lt1";
  if (layer === "subthreshold") return "subthreshold";
  if (layer === "lt2") return "lt2";
  if (layer === "vo2") return "vo2";
  if (layer === "technique") return "technical";
  if (layer === "specific") return "specific";
  if (layer === "strength") return "strength";
  return "other";
}

export function workoutLayerCue(layer: WorkoutLibraryLayer) {
  if (layer === "recovery") return "Carga baja y control fino de la fatiga residual.";
  if (layer === "base") return "Volumen útil para consolidar oxidación y estabilidad.";
  if (layer === "lt1") return "Trabajo extensivo cerca del primer umbral.";
  if (layer === "subthreshold") return "Transición metabólica con densidad controlada.";
  if (layer === "lt2") return "Minutos de calidad alrededor del máximo estado estable.";
  if (layer === "vo2") return "Bloques intensos para techo aeróbico y potencia.";
  if (layer === "technique") return "Eficiencia mecánica con fatiga contenida.";
  if (layer === "specific") return "Sesiones cercanas a la demanda competitiva.";
  if (layer === "strength") return "Soporte estructural y transferencia al gesto.";
  return "Sesiones complementarias fuera de las familias principales.";
}

export function workoutLayerGlyph(layer: WorkoutLibraryLayer) {
  if (layer === "recovery") return "RC";
  if (layer === "base") return "BA";
  if (layer === "lt1") return "LT1";
  if (layer === "subthreshold") return "ST";
  if (layer === "lt2") return "LT2";
  if (layer === "vo2") return "VO2";
  if (layer === "technique") return "TEC";
  if (layer === "specific") return "ESP";
  if (layer === "strength") return "FZ";
  return "OT";
}

// ── Mesocycle configuration helpers ──

export function phaseOptionsForRecommendation(blockType?: string | null) {
  if (blockType === "competition_specific_block") return ["específico", "competición", "taper"];
  if (blockType === "recovery_consolidation_block") return ["descarga", "transición"];
  if (blockType === "technical_rebuild_block") return ["técnica", "base"];
  return ["base", "build", "específico"];
}

export function defaultPhaseForRecommendation(blockType?: string | null) {
  if (blockType === "competition_specific_block") return "específico";
  if (blockType === "recovery_consolidation_block") return "descarga";
  if (blockType === "technical_rebuild_block") return "técnica";
  if (blockType === "aerobic_power_block") return "build";
  return "base";
}

export function energySystemFocusForRecommendation(blockType?: string | null, primaryFocus?: string | null) {
  if (blockType === "aerobic_capacity_block") return "Aerobic Capacity";
  if (blockType === "threshold_development_block") return "Aerobic Power";
  if (blockType === "anaerobic_capacity_block") return "Anaerobic Capacity";
  if (blockType === "aerobic_power_block") return "Aerobic Power";
  if (blockType === "anaerobic_power_block") return "Anaerobic Power";
  if (blockType === "competition_specific_block") return "Specific Performance";
  if (blockType === "technical_rebuild_block") return "Technique";
  if (blockType === "recovery_consolidation_block") return "Recovery";
  return primaryFocus || "Aerobic Capacity";
}

export function objectiveOptionsForDiscipline(discipline: string) {
  if (discipline === "ciclismo") {
    return ["LT1", "LT2", "VO2", "Cadencia", "FTP", "Recuperación"];
  }
  if (discipline === "natación") {
    return ["Técnica", "Aeróbico", "LT1", "LT2", "Recuperación"];
  }
  return ["LT1", "LT2", "VO2", "Economía", "Competición", "Recuperación"];
}

export function weaknessOptionsForDiscipline(discipline: string) {
  if (discipline === "ciclismo") {
    return ["Base aeróbica", "Cadencia", "Torque", "FTP/LT2", "VO2", "Durabilidad", "Recuperación"];
  }
  if (discipline === "natación") {
    return ["Técnica", "Continuidad aeróbica", "CSS/LT2", "Economía acuática", "Fuerza específica", "Recuperación"];
  }
  return ["Base aeróbica", "Economía", "LT1", "LT2", "VO2", "Durabilidad", "Recuperación"];
}

export function objectiveFromTemplate(template: PlanningMesocycleTemplate | null, discipline: string) {
  if (!template) return objectiveOptionsForDiscipline(discipline)[0] ?? "LT1";
  if (template.block_type === "recovery_consolidation_block") return "Recuperación";
  if (template.block_type === "technical_rebuild_block") return "Técnica";
  if (template.block_type === "aerobic_power_block") return "VO2";
  if (template.block_type === "competition_specific_block") return discipline === "ciclismo" ? "FTP" : "Competición";
  if (template.block_type === "threshold_development_block") return "LT2";
  return discipline === "natación" ? "Aeróbico" : "LT1";
}

export function structureHelpText(structure: string) {
  if (structure === "1+1") return "1 semana de carga y 1 de descarga o consolidación.";
  if (structure === "2+1") return "2 semanas de carga y 1 semana final de descarga o asimilación.";
  if (structure === "3+1") return "3 semanas de carga y 1 semana de descarga.";
  if (structure === "1+1 o 2+1") return "Bloque corto: puede funcionar como 1 semana de carga + 1 de descarga, o 2 de carga + 1 de descarga.";
  if (structure === "2+1 o 3+1") return "Según nivel y fatiga: 2 o 3 semanas de carga antes de descargar.";
  if (structure === "2+1 o taper corto") return "2 semanas de trabajo y luego descarga corta/puesta a punto.";
  if (structure === "1 semana o microfase") return "No es un bloque largo: es una fase breve de descarga o consolidación.";
  return "Relación entre semanas de carga y semanas de descarga dentro del mesociclo.";
}

export function durationInterpretation(template: PlanningMesocycleTemplate | null, requestedWeeks: number) {
  if (!template) return null;
  if (requestedWeeks < template.typical_duration_weeks_min) {
    return {
      tone: "warning" as PlanTone,
      title: "Bloque más corto de lo habitual",
      body: `Esta plantilla suele funcionar mejor en ${template.typical_duration_weeks_min}-${template.typical_duration_weeks_max} semanas. Si la acortas, úsala como microfase o bloque puente, no como lectura completa del mesociclo.`,
    };
  }
  if (requestedWeeks > template.typical_duration_weeks_max) {
    return {
      tone: "warning" as PlanTone,
      title: "Conviene partirlo en dos fases",
      body: `Has pedido ${requestedWeeks} semanas para una plantilla pensada para ${template.typical_duration_weeks_min}-${template.typical_duration_weeks_max}. El sistema no debería estirar sin más el mismo bloque: lo sólido es encadenar dos subfases con relectura intermedia.`,
    };
  }
  return {
    tone: "positive" as PlanTone,
    title: "Duración coherente con la plantilla",
    body: `La duración elegida encaja con el rango habitual (${template.typical_duration_weeks_min}-${template.typical_duration_weeks_max} semanas).`,
  };
}

export function isDecisionPointDetectedBlock(block: {
  testing_weeks: number;
  session_count: number;
  weeks_count: number;
}) {
  return block.testing_weeks > 0 && block.session_count <= 2 && block.weeks_count <= 2;
}

export function detectedBlockTitle(block: {
  block_label: string;
  testing_weeks: number;
  session_count: number;
  weeks_count: number;
}) {
  if (isDecisionPointDetectedBlock(block)) return `${block.block_label} · contexto de test`;
  return block.block_label;
}

export function buildMicrocycle(weeks: number, discipline: string, objective: string, density: string): MicrocycleWeek[] {
  const toneByWeek: PlanTone[] = ["positive", "positive", "warning", "neutral"];
  const loadByWeek = density === "alta"
    ? ["Acumulación sostenida", "Pico controlado", "Estabilizar", "Descarga activa"]
    : density === "baja"
      ? ["Introducción", "Asimilación", "Consolidación", "Descarga activa"]
      : ["Construcción", "Construcción", "Afinar", "Descarga activa"];
  const notesByDiscipline =
    discipline === "ciclismo"
      ? [
          "Bloque principal en potencia controlada y una sesión técnica de cadencia.",
          "Sube tiempo útil o densidad, no ambas a la vez.",
          "Semana de contraste con un estímulo más exigente y una tirada sólida.",
          "Reduce carga y confirma que el lactato vuelve a caer con el mismo gesto.",
        ]
      : discipline === "natación"
        ? [
            "Más metros útiles a intensidad controlada y foco técnico.",
            "Mantén continuidad y controla la fatiga global del triatleta.",
            "Semana de transferencia sin perder economía de brazada.",
            "Recupera sensaciones y limpia la fatiga antes del siguiente bloque.",
          ]
        : [
            "Base del ciclo con un día clave y otro de soporte aeróbico.",
            "Extiende minutos de trabajo o repeticiones comparables.",
            "Semana específica con estímulo más fino sobre el objetivo.",
            "Afloja para absorber el bloque y llegar con lectura fisiológica limpia.",
          ];

  return Array.from({ length: weeks }, (_, index) => ({
    title: `Semana ${index + 1}`,
    load: loadByWeek[index] ?? "Construcción",
    emphasis: `${objective} · ${disciplineLabel(discipline)}`,
    notes: notesByDiscipline[index] ?? "Semana de mantenimiento bajo criterio del entrenador.",
    tone: toneByWeek[index] ?? "neutral",
  }));
}

export const BLOCK_LABELS: Record<string, string> = {
  aerobic_capacity_block: "Capacidad aeróbica",
  threshold_development_block: "Desarrollo de umbral",
  anaerobic_capacity_block: "Cap. Anaeróbica",
  aerobic_power_block: "Potencia aeróbica",
  anaerobic_power_block: "Potencia Anaeróbica",
  competition_specific_block: "Especificidad competitiva",
  recovery_consolidation_block: "Consolidación / recuperación",
  technical_rebuild_block: "Reconstrucción técnica",
};

// ── Session card tone (for left border color in calendar) ──

export type SessionTone = "green" | "amber" | "red" | "blue" | "gray";

export function sessionToneFromEntry(session: CalendarEntry): SessionTone {
  const combined = `${session.sessionType} ${session.objective} ${session.title} ${session.dose}`.toLowerCase();
  if (combined.includes("recuper") || combined.includes("recovery") || combined.includes("descarga") || combined.includes("off")) return "gray";
  if (combined.includes("vo2") || combined.includes("anaeróbi") || combined.includes("anaerob") || combined.includes("sprint")) return "red";
  if (combined.includes("lt2") || combined.includes("umbral") || combined.includes("threshold") || combined.includes("tempo") || combined.includes("cruise") || combined.includes("css") || combined.includes("ftp")) return "amber";
  if (combined.includes("técn") || combined.includes("tech") || combined.includes("cadencia") || combined.includes("educativo") || combined.includes("fuerza") || combined.includes("torque")) return "blue";
  // Default: LT1/base/aerobic
  return "green";
}

export function sessionToneBorderColor(tone: SessionTone): string {
  if (tone === "green") return "#3a9a5b";
  if (tone === "amber") return "#c27a2e";
  if (tone === "red") return "#c44040";
  if (tone === "blue") return "#3a7dc4";
  return "#8a98a8";
}

export function sessionToneBackgroundTint(session: CalendarEntry): string {
  const discipline = session.layerDiscipline || session.discipline;
  if (discipline === "running") return "rgba(40, 95, 231, 0.05)";
  if (discipline === "ciclismo") return "rgba(37, 122, 77, 0.05)";
  if (discipline === "natación") return "rgba(31, 124, 139, 0.05)";
  return "rgba(138, 152, 168, 0.05)";
}

export function garminStatusBadge(session: CalendarEntry): { label: string; tone: string } | null {
  if (!session.publishStatus) return null;
  if (session.publishStatus === "sent") return { label: "Garmin", tone: "positive" };
  if (session.publishStatus === "needs_republish") return { label: "Republish", tone: "warning" };
  if (session.publishStatus === "ready") return { label: "Ready", tone: "neutral" };
  if (session.publishStatus === "failed") return { label: "Error", tone: "negative" };
  return null;
}

export function compactSessionInfo(session: CalendarEntry): string {
  const parts: string[] = [];
  if (session.estimatedMinutes) parts.push(`${session.estimatedMinutes} min`);
  // Extract a short label from the dose or title
  const family = objectiveFamily(`${session.sessionType} ${session.objective} ${session.title}`);
  if (family === "lt2") parts.push("LT2");
  else if (family === "vo2") parts.push("VO2");
  else if (family === "lt1") parts.push("LT1");
  else if (family === "recovery") parts.push("Recuperación");
  else if (session.sessionType) parts.push(session.sessionType);
  return parts.join(" \u00B7 ");
}

export const SESSION_ROLE_LABEL: Record<string, string> = {
  key: "principal",
  support: "soporte",
  recovery: "recuperación",
  test: "test",
};

// ── Calendar annotation violations ──

export type CalendarViolation = {
  sessionId: string;
  date: string;
  kind: "spacing" | "freshness_conflict";
  message: string;
};

/**
 * Compute spacing and freshness violations for sessions on the calendar.
 * - Spacing: sessions of the same family scheduled closer than min_spacing_days_after
 * - Freshness: requires_fresh sessions on same day as high fatigue_cost sessions
 */
export function computeCalendarViolations(
  sessionsByDate: Map<string, CalendarEntry[]>,
  workoutLibrary: PlanningWorkoutTemplate[],
): CalendarViolation[] {
  const violations: CalendarViolation[] = [];
  const templateMap = new Map(workoutLibrary.map((t) => [t.template_id, t]));

  // Build a flat list of sessions with their resolved templates
  type SessionWithTemplate = { session: CalendarEntry; template: PlanningWorkoutTemplate | null; date: string };
  const allSessions: SessionWithTemplate[] = [];

  for (const [date, sessions] of sessionsByDate.entries()) {
    for (const session of sessions) {
      if (session.isOverlay) continue;
      // Try to find the template by scanning session title/objective against templates
      const template = findTemplateForSession(session, templateMap, workoutLibrary);
      allSessions.push({ session, template, date });
    }
  }

  // Sort by date
  allSessions.sort((a, b) => dateValue(a.date) - dateValue(b.date));

  // Check spacing violations
  for (let i = 0; i < allSessions.length; i++) {
    const current = allSessions[i];
    if (!current.template) continue;
    const family = current.template.session_family;
    const minSpacing = getMinSpacingDays(current.template);
    if (minSpacing <= 0) continue;

    // Look ahead for same-family sessions within the spacing window
    for (let j = i + 1; j < allSessions.length; j++) {
      const other = allSessions[j];
      const daysDiff = Math.round((dateValue(other.date) - dateValue(current.date)) / 86400000);
      if (daysDiff > minSpacing) break;
      if (daysDiff <= 0) continue;

      const otherFamily = other.template?.session_family;
      if (otherFamily === family) {
        violations.push({
          sessionId: other.session.id,
          date: other.date,
          kind: "spacing",
          message: `Sesión de ${family} a solo ${daysDiff} día${daysDiff > 1 ? "s" : ""} de otra similar (mínimo ${minSpacing})`,
        });
      }
    }
  }

  // Check freshness conflicts (same day)
  for (const [date, sessions] of sessionsByDate.entries()) {
    const primarySessions = sessions.filter((s) => !s.isOverlay);
    if (primarySessions.length < 2) continue;

    const resolved = primarySessions.map((s) => ({
      session: s,
      template: findTemplateForSession(s, templateMap, workoutLibrary),
    }));

    const hasHighFatigue = resolved.some((r) => (r.template?.fatigue_cost ?? 0) >= 4);
    const freshRequired = resolved.filter((r) => {
      if (!r.template) return false;
      const step = r.template.dose_ladder[0];
      return step?.readiness_required === "fresh" || r.template.fatigue_cost >= 4;
    });

    if (hasHighFatigue && freshRequired.length > 0) {
      for (const fr of freshRequired) {
        // Only flag if there is ANOTHER high-fatigue session on the same day
        const otherHighFatigue = resolved.some(
          (r) => r.session.id !== fr.session.id && (r.template?.fatigue_cost ?? 0) >= 4,
        );
        if (otherHighFatigue) {
          violations.push({
            sessionId: fr.session.id,
            date,
            kind: "freshness_conflict",
            message: "Sesión que requiere frescura en un día con carga alta",
          });
        }
      }
    }
  }

  return violations;
}

function findTemplateForSession(
  session: CalendarEntry,
  templateMap: Map<string, PlanningWorkoutTemplate>,
  workoutLibrary: PlanningWorkoutTemplate[],
): PlanningWorkoutTemplate | null {
  // If the session id contains a template reference, try that
  const idParts = session.id.split("-");
  // Check if any template id is in session.id or session.title
  for (const [tid, t] of templateMap) {
    if (session.id.includes(tid)) return t;
  }
  // Fallback: match by title
  return workoutLibrary.find((t) => t.public_label === session.title) ?? null;
}

function getMinSpacingDays(template: PlanningWorkoutTemplate): number {
  // Heuristic based on fatigue cost since the template type doesn't have min_spacing_days_after
  if (template.fatigue_cost >= 5) return 3;
  if (template.fatigue_cost >= 4) return 2;
  if (template.fatigue_cost >= 3) return 2;
  return 0;
}

/** Check if a session has a spacing violation */
export function sessionHasSpacingViolation(sessionId: string, violations: CalendarViolation[]): boolean {
  return violations.some((v) => v.sessionId === sessionId && v.kind === "spacing");
}

/** Check if a day has a freshness conflict */
export function dayHasFreshnessConflict(date: string, violations: CalendarViolation[]): boolean {
  return violations.some((v) => v.date === date && v.kind === "freshness_conflict");
}

// ── Garmin status helpers (enhanced) ──

export type GarminStatusInfo = {
  label: string;
  tone: "draft" | "ready" | "sent" | "failed" | "warning";
  color: string;
  description: string;
};

export function garminStatusInfo(publishStatus: string | undefined | null): GarminStatusInfo | null {
  if (!publishStatus) return null;
  if (publishStatus === "draft") return { label: "Borrador", tone: "draft", color: "#8a98a8", description: "Sesión aún sin estructura publicable" };
  if (publishStatus === "ready") return { label: "Lista", tone: "ready", color: "#3a7dc4", description: "Estructura lista para enviar" };
  if (publishStatus === "sent") return { label: "Enviada", tone: "sent", color: "#3a9a5b", description: "Publicada a Garmin correctamente" };
  if (publishStatus === "needs_republish") return { label: "Re-publicar", tone: "warning", color: "#b45309", description: "Los umbrales han cambiado. Re-publica para actualizar targets." };
  if (publishStatus === "failed") return { label: "Error", tone: "failed", color: "#c44040", description: "Error al enviar a Garmin" };
  return null;
}

// ── Garmin sport mapping ──

const GARMIN_SPORT_MAP: Record<string, string> = {
  running: "running",
  trail_running: "running",
  treadmill_running: "running",
  cycling: "ciclismo",
  indoor_cycling: "ciclismo",
  road_biking: "ciclismo",
  mountain_biking: "ciclismo",
  swimming: "natación",
  pool_swimming: "natación",
  open_water: "natación",
  open_water_swimming: "natación",
  lap_swimming: "natación",
};

export function garminSportToDiscipline(sport: string): string {
  return GARMIN_SPORT_MAP[sport.toLowerCase()] ?? sport;
}

export function formatDurationHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatDistanceKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

// ── Compliance engine ──

export function computeSessionCompliance(
  session: CalendarSession,
  garminActivity: GarminCalendarActivity | null,
  today: string,
): ComplianceStatus | null {
  if (dateValue(session.date) > dateValue(today)) return null;

  if (!garminActivity) {
    return { status: "missed", reasons: ["Sin actividad registrada"] };
  }

  const reasons: string[] = [];

  // Duration check
  const plannedSeconds = (session.estimatedMinutes ?? 0) * 60;
  if (plannedSeconds > 0) {
    const actualSeconds = garminActivity.moving_time_seconds;
    const ratio = Math.abs(actualSeconds - plannedSeconds) / plannedSeconds;
    if (ratio > 0.25) {
      const actualMin = Math.round(actualSeconds / 60);
      const plannedMin = Math.round(plannedSeconds / 60);
      reasons.push(`Duración ${actualMin} min vs ${plannedMin} min planificados`);
    }
  }

  // HR zone check (simplified: use session tone as proxy)
  if (garminActivity.average_heartrate) {
    const tone = sessionToneFromEntry(session as CalendarEntry);
    const avgHr = garminActivity.average_heartrate;
    // Generic thresholds: LT1 ~145, LT2 ~165 (rough defaults)
    if (tone === "green" && avgHr > 155) {
      reasons.push(`FC media ${avgHr} bpm alta para sesión LT1`);
    } else if (tone === "amber" && avgHr < 135) {
      reasons.push(`FC media ${avgHr} bpm baja para sesión LT2`);
    }
  }

  if (reasons.length > 0) return { status: "partial", reasons };
  return { status: "completed", reasons: [] };
}
