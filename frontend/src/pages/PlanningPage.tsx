import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { WorkoutPreviewModal, WorkoutPreviewSelection } from "../components/WorkoutPreviewModal";
import { api } from "../lib/api";
import { individualThresholdReason, resolveAnalysisDisciplineView, resolveTrainingThreshold } from "../lib/trainingThresholds";
import { Athlete, AthleteAnalysis, AthleteTarget, PlanningMesocycleDraftSession, PlanningMesocycleTemplate, PlanningOverview, PlanningPlannedSession, PlanningWorkoutTemplate } from "../types";

type PlanningPageProps = {
  token: string;
};

type OpenWorkoutPreviewState = {
  template: PlanningWorkoutTemplate;
  selection: WorkoutPreviewSelection;
};

type PlanningWorkspace = "overview" | "calendar" | "builder";

type PlanTone = "positive" | "warning" | "neutral";

type MicrocycleWeek = {
  title: string;
  load: string;
  emphasis: string;
  notes: string;
  tone: PlanTone;
};

type PlanningCalendarSource = {
  id: string;
  kind: "draft" | "planned" | "historical";
  focusBlockId?: number | null;
  startDate: string;
  endDate: string;
  discipline: string;
  title: string;
  objective: string;
  energySystemFocus?: string | null;
  phase?: string | null;
  intent?: string | null;
  notes?: string | null;
  density?: string | null;
};

type CalendarSession = {
  id: string;
  date: string;
  discipline: string;
  title: string;
  sessionType: string;
  objective: string;
  description: string;
  dose: string;
  confidence: "alta" | "media";
  rawId?: number;
  blaCheck?: boolean;
};

type CalendarEntry = CalendarSession & {
  layerDiscipline: string;
  isOverlay: boolean;
};

function parseDateValue(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  return new Date(value);
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoDateFromToday(offsetDays = 0) {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() + offsetDays);
  return formatDateKey(value);
}

function addDays(isoDate: string, days: number) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return isoDate;
  value.setDate(value.getDate() + days);
  return formatDateKey(value);
}

function addMonths(isoDate: string, months: number) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return isoDate;
  value.setDate(1);
  value.setMonth(value.getMonth() + months);
  return formatDateKey(value);
}

function dateValue(isoDate?: string | null) {
  if (!isoDate) return Number.NaN;
  const value = parseDateValue(isoDate);
  return value.getTime();
}

function disciplineLabel(value?: string | null) {
  if (value === "running") return "Carrera a pie";
  if (value === "ciclismo") return "Ciclismo";
  if (value === "natación") return "Natación";
  if (value === "triatlón") return "Triatlón";
  return value || "Disciplina";
}

function firstName(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return "";
  return normalized.split(/\s+/)[0] ?? normalized;
}

function formatTargetChipDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = parseDateValue(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function targetPrimaryValue(target: AthleteTarget) {
  return target.objective || target.distance_label || "Objetivo";
}

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = parseDateValue(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function formatPace(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "n/d";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}/km`;
}

function formatSwimPace(secondsPerKm?: number | null) {
  if (typeof secondsPerKm !== "number" || !Number.isFinite(secondsPerKm)) return "n/d";
  return formatPace(secondsPerKm / 10).replace("/km", "/100m");
}

function formatThresholdPrimaryMetric(
  threshold: ReturnType<typeof resolveTrainingThreshold>,
  discipline: string,
) {
  if (!threshold) return "Sin referencia";
  if (discipline === "ciclismo" && typeof threshold.powerWatts === "number") {
    return `${Math.round(threshold.powerWatts)} W`;
  }
  if (discipline === "natación" && typeof threshold.paceSecondsPerKm === "number") {
    return formatSwimPace(threshold.paceSecondsPerKm);
  }
  if (typeof threshold.paceSecondsPerKm === "number") {
    return formatPace(threshold.paceSecondsPerKm);
  }
  if (typeof threshold.powerWatts === "number") {
    return `${Math.round(threshold.powerWatts)} W`;
  }
  if (typeof threshold.heartRate === "number") {
    return `${Math.round(threshold.heartRate)} bpm`;
  }
  return "Sin referencia";
}

function formatThresholdCoachLine(
  threshold: ReturnType<typeof resolveTrainingThreshold>,
  discipline: string,
) {
  if (!threshold) return "Sin referencia";
  const details = [formatThresholdPrimaryMetric(threshold, discipline)];
  if (typeof threshold.heartRate === "number") {
    details.push(`${Math.round(threshold.heartRate)} bpm`);
  }
  return `${details.join(" · ")} · ${threshold.sourceLabel}`;
}

function formatThresholdRange(
  lt1: ReturnType<typeof resolveTrainingThreshold>,
  lt2: ReturnType<typeof resolveTrainingThreshold>,
  discipline: string,
) {
  if (!lt1 || !lt2) return "Sin rango completo";
  const primaryMetric =
    discipline === "ciclismo" && typeof lt1.powerWatts === "number" && typeof lt2.powerWatts === "number"
      ? `${Math.round(lt1.powerWatts)}-${Math.round(lt2.powerWatts)} W`
      : discipline === "natación" && typeof lt1.paceSecondsPerKm === "number" && typeof lt2.paceSecondsPerKm === "number"
        ? `${formatSwimPace(lt1.paceSecondsPerKm)} → ${formatSwimPace(lt2.paceSecondsPerKm)}`
        : typeof lt1.paceSecondsPerKm === "number" && typeof lt2.paceSecondsPerKm === "number"
          ? `${formatPace(lt1.paceSecondsPerKm)} → ${formatPace(lt2.paceSecondsPerKm)}`
          : typeof lt1.heartRate === "number" && typeof lt2.heartRate === "number"
            ? `${Math.round(lt1.heartRate)}-${Math.round(lt2.heartRate)} bpm`
            : "Rango abierto";
  const heartRateRange =
    typeof lt1.heartRate === "number" && typeof lt2.heartRate === "number"
      ? `${Math.round(lt1.heartRate)}-${Math.round(lt2.heartRate)} bpm`
      : null;
  return heartRateRange && !primaryMetric.includes("bpm")
    ? `${primaryMetric} · ${heartRateRange}`
    : primaryMetric;
}

function planningThresholdOpinion(
  lt1: ReturnType<typeof resolveTrainingThreshold>,
  lt2: ReturnType<typeof resolveTrainingThreshold>,
  individualReason?: string | null,
) {
  const bothIndividual = lt1?.source === "individual" && lt2?.source === "individual";
  if (bothIndividual) {
    return "Esta disciplina ya está leyendo la planificación con LT1/LT2 individuales robustos.";
  }
  return individualReason || "Mientras no haya LT1/LT2 individuales robustos, la planificación usa 2.0 y 4.0 mmol como anclas fisiológicas.";
}

function buildPlanningPrescriptionHint(
  objective: string,
  title: string,
  discipline: string,
  lt1: ReturnType<typeof resolveTrainingThreshold>,
  lt2: ReturnType<typeof resolveTrainingThreshold>,
) {
  const family = objectiveFamily(`${objective} ${title}`);
  if (family === "recovery") {
    return lt1 ? `Mantén la sesión por debajo de LT1: ${formatThresholdCoachLine(lt1, discipline)}.` : "Sesión de descarga sin ancla LT1 disponible.";
  }
  if (family === "lt1") {
    return lt1 ? `Trabajo apoyado en LT1: ${formatThresholdCoachLine(lt1, discipline)}.` : "Trabajo LT1 sin referencia visible todavía.";
  }
  if (family === "lt2") {
    return lt2 ? `Trabajo apoyado en LT2: ${formatThresholdCoachLine(lt2, discipline)}.` : "Trabajo LT2 sin referencia visible todavía.";
  }
  if (family === "vo2") {
    return lt2 ? `La entrada se apoya en LT2 (${formatThresholdCoachLine(lt2, discipline)}) y las repeticiones salen por encima.` : "Sesión VO2 sin LT2 visible para afinar la lectura.";
  }
  return lt1 && lt2
    ? `Zona media entre LT1 y LT2: ${formatThresholdRange(lt1, lt2, discipline)}.`
    : "Sesión con intensidad mixta sin rango LT1-LT2 completo.";
}

function daysBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
}

function startOfMonth(isoDate: string) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return isoDate;
  value.setDate(1);
  return formatDateKey(value);
}

function monthLabel(isoDate: string) {
  const parsed = parseDateValue(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

function monthHeading(isoDate: string) {
  const label = monthLabel(isoDate);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function startOfWeek(isoDate: string) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return isoDate;
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return formatDateKey(value);
}

function daysInMonth(isoDate: string) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return 30;
  return new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
}

function weekdayOffset(isoDate: string) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return 0;
  const day = value.getDay();
  return day === 0 ? 6 : day - 1;
}

function overlapsRange(start: string, end: string, rangeStart: string, rangeEnd: string) {
  return dateValue(start) <= dateValue(rangeEnd) && dateValue(end) >= dateValue(rangeStart);
}

function focusTone(direction?: string | null): PlanTone {
  if (direction === "up" || direction === "positive") return "positive";
  if (direction === "down" || direction === "negative") return "warning";
  return "neutral";
}

function objectiveFamily(value?: string | null) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("lt2") || normalized.includes("ftp") || normalized.includes("compet")) return "lt2";
  if (normalized.includes("vo2")) return "vo2";
  if (normalized.includes("técn") || normalized.includes("tecn")) return "technique";
  if (normalized.includes("recuper")) return "recovery";
  return "lt1";
}

function dayNameShort(isoDate: string) {
  const parsed = parseDateValue(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("es-ES", { weekday: "short" });
}

function monthDayLabel(isoDate: string) {
  const parsed = parseDateValue(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("es-ES", { day: "numeric" });
}

function buildWorkoutBlueprints(source: PlanningCalendarSource) {
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

function buildSyntheticCalendarSessions(source: PlanningCalendarSource) {
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
      });
    });
    currentWeek = addDays(currentWeek, 7);
    weekIndex += 1;
  }
  return sessions.sort((a, b) => dateValue(a.date) - dateValue(b.date));
}

function buildPersistedCalendarSessions(source: PlanningCalendarSource, plannedSessions: PlanningPlannedSession[]) {
  if (source.kind !== "planned" || !source.focusBlockId) return null;
  const selected = plannedSessions
    .filter((session) => session.focus_block_id === source.focusBlockId)
    .map<CalendarSession>((session) => ({
      id: `planned-session-${session.id}`,
      date: session.scheduled_date,
      discipline: session.discipline,
      title: session.public_label,
      sessionType: session.session_role,
      objective: session.objective,
      description: [session.coach_note, session.expected_signal].filter(Boolean).join(" "),
      dose: session.dose_prescription,
      confidence: session.confidence >= 0.85 ? "alta" : "media",
      rawId: session.id,
      blaCheck: session.bla_check,
    }));

  return selected.length ? selected.sort((a, b) => dateValue(a.date) - dateValue(b.date)) : null;
}

function findWorkoutDoseStep(template: PlanningWorkoutTemplate, doseLabel?: string | null, doseStepIndex?: number | null) {
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

function resolveWorkoutTemplate(
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

function buildDraftWorkoutPreviewSelection(
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

function buildPlannedWorkoutPreviewSelection(
  template: PlanningWorkoutTemplate,
  session: PlanningPlannedSession,
): WorkoutPreviewSelection {
  const doseStepIndex = session.payload?.dose_step_index as number | null | undefined;
  const step = findWorkoutDoseStep(template, session.dose_prescription, doseStepIndex);

  return {
    source: "planning",
    templateId: template.template_id,
    label: session.dose_prescription || template.csv_examples[0] || template.public_label,
    notes: session.progression_note || session.coach_note || session.expected_signal || template.dose_guidance,
    totalDurationMin: step?.total_duration_min,
    usefulDurationMin: step?.total_useful_time_min,
    restMin: step?.rest_min,
    intensityZone: step?.intensity_zone,
    readiness: step?.readiness_required ?? (template.fatigue_cost >= 4 ? "fresh" : template.fatigue_cost >= 3 ? "medium" : "any"),
  };
}

function phaseOptionsForRecommendation(blockType?: string | null) {
  if (blockType === "competition_specific_block") return ["específico", "competición", "taper"];
  if (blockType === "recovery_consolidation_block") return ["descarga", "transición"];
  if (blockType === "technical_rebuild_block") return ["técnica", "base"];
  return ["base", "build", "específico"];
}

function defaultPhaseForRecommendation(blockType?: string | null) {
  if (blockType === "competition_specific_block") return "específico";
  if (blockType === "recovery_consolidation_block") return "descarga";
  if (blockType === "technical_rebuild_block") return "técnica";
  if (blockType === "aerobic_power_block") return "build";
  return "base";
}

function energySystemFocusForRecommendation(blockType?: string | null, primaryFocus?: string | null) {
  if (blockType === "aerobic_capacity_block") return "Aerobic Capacity";
  if (blockType === "threshold_development_block") return "Aerobic Power";
  if (blockType === "aerobic_power_block") return "Aerobic Power";
  if (blockType === "competition_specific_block") return "Specific Performance";
  if (blockType === "technical_rebuild_block") return "Technique";
  if (blockType === "recovery_consolidation_block") return "Recovery";
  return primaryFocus || "Aerobic Capacity";
}

function objectiveOptionsForDiscipline(discipline: string) {
  if (discipline === "ciclismo") {
    return ["LT1", "LT2", "VO2", "Cadencia", "FTP", "Recuperación"];
  }
  if (discipline === "natación") {
    return ["Técnica", "Aeróbico", "LT1", "LT2", "Recuperación"];
  }
  return ["LT1", "LT2", "VO2", "Economía", "Competición", "Recuperación"];
}

function weaknessOptionsForDiscipline(discipline: string) {
  if (discipline === "ciclismo") {
    return ["Base aeróbica", "Cadencia", "Torque", "FTP/LT2", "VO2", "Durabilidad", "Recuperación"];
  }
  if (discipline === "natación") {
    return ["Técnica", "Continuidad aeróbica", "CSS/LT2", "Economía acuática", "Fuerza específica", "Recuperación"];
  }
  return ["Base aeróbica", "Economía", "LT1", "LT2", "VO2", "Durabilidad", "Recuperación"];
}

function objectiveFromTemplate(template: PlanningMesocycleTemplate | null, discipline: string) {
  if (!template) return objectiveOptionsForDiscipline(discipline)[0] ?? "LT1";
  if (template.block_type === "recovery_consolidation_block") return "Recuperación";
  if (template.block_type === "technical_rebuild_block") return "Técnica";
  if (template.block_type === "aerobic_power_block") return "VO2";
  if (template.block_type === "competition_specific_block") return discipline === "ciclismo" ? "FTP" : "Competición";
  if (template.block_type === "threshold_development_block") return "LT2";
  return discipline === "natación" ? "Aeróbico" : "LT1";
}

function structureHelpText(structure: string) {
  if (structure === "1+1") return "1 semana de carga y 1 de descarga o consolidación.";
  if (structure === "2+1") return "2 semanas de carga y 1 semana final de descarga o asimilación.";
  if (structure === "3+1") return "3 semanas de carga y 1 semana de descarga.";
  if (structure === "1+1 o 2+1") return "Bloque corto: puede funcionar como 1 semana de carga + 1 de descarga, o 2 de carga + 1 de descarga.";
  if (structure === "2+1 o 3+1") return "Según nivel y fatiga: 2 o 3 semanas de carga antes de descargar.";
  if (structure === "2+1 o taper corto") return "2 semanas de trabajo y luego descarga corta/puesta a punto.";
  if (structure === "1 semana o microfase") return "No es un bloque largo: es una fase breve de descarga o consolidación.";
  return "Relación entre semanas de carga y semanas de descarga dentro del mesociclo.";
}

function durationInterpretation(template: PlanningMesocycleTemplate | null, requestedWeeks: number) {
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

function isDecisionPointDetectedBlock(block: {
  testing_weeks: number;
  session_count: number;
  weeks_count: number;
}) {
  return block.testing_weeks > 0 && block.session_count <= 2 && block.weeks_count <= 2;
}

function detectedBlockTitle(block: {
  block_label: string;
  testing_weeks: number;
  session_count: number;
  weeks_count: number;
}) {
  if (isDecisionPointDetectedBlock(block)) return `${block.block_label} · contexto de test`;
  return block.block_label;
}

function buildMicrocycle(weeks: number, discipline: string, objective: string, density: string): MicrocycleWeek[] {
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

const BLOCK_LABELS: Record<string, string> = {
  aerobic_capacity_block: "Capacidad aeróbica",
  threshold_development_block: "Desarrollo de umbral",
  aerobic_power_block: "Potencia aeróbica",
  competition_specific_block: "Especificidad competitiva",
  recovery_consolidation_block: "Consolidación / recuperación",
  technical_rebuild_block: "Reconstrucción técnica",
};

const SESSION_ROLE_LABEL: Record<string, string> = {
  key: "principal",
  support: "soporte",
  recovery: "recuperación",
  test: "test",
};

export function PlanningPage({ token }: PlanningPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const athleteId = searchParams.get("athleteId");
  const searchDiscipline = searchParams.get("discipline") ?? "running";

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [overview, setOverview] = useState<PlanningOverview | null>(null);
  const [athleteAnalysis, setAthleteAnalysis] = useState<AthleteAnalysis | null>(null);
  const [blaCheckLoading, setBlaCheckLoading] = useState<number | null>(null);
  const [disciplineOverviews, setDisciplineOverviews] = useState<Record<string, PlanningOverview>>({});
  const [loading, setLoading] = useState(Boolean(athleteId));
  const [error, setError] = useState<string | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState(searchDiscipline);
  const [activeWorkspace, setActiveWorkspace] = useState<PlanningWorkspace>("overview");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [blockObjective, setBlockObjective] = useState("LT1");
  const [primaryWeakness, setPrimaryWeakness] = useState("Base aeróbica");
  const [secondaryWeakness, setSecondaryWeakness] = useState("LT1");
  const [weeks, setWeeks] = useState("4");
  const [density, setDensity] = useState("media");
  const [priority, setPriority] = useState("controlado");
  const [blockStartDate, setBlockStartDate] = useState(() => isoDateFromToday());
  const [blockPhase, setBlockPhase] = useState("base");
  const [blockIntent, setBlockIntent] = useState("");
  const [coachNotes, setCoachNotes] = useState("");
  const [timelineFrom, setTimelineFrom] = useState(() => isoDateFromToday(-70));
  const [timelineTo, setTimelineTo] = useState(() => isoDateFromToday(140));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingBlockId, setDeletingBlockId] = useState<number | null>(null);
  const [selectedCalendarSourceId, setSelectedCalendarSourceId] = useState<string>("draft");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(isoDateFromToday()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [enabledOverlayDisciplines, setEnabledOverlayDisciplines] = useState<string[]>([]);
  const [workoutLibrary, setWorkoutLibrary] = useState<PlanningWorkoutTemplate[]>([]);
  const [openWorkoutPreview, setOpenWorkoutPreview] = useState<OpenWorkoutPreviewState | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAthletes() {
      try {
        const result = (await api.athletes(token)) as Athlete[];
        if (!cancelled) {
          setAthletes(result);
        }
      } catch {
        if (!cancelled) {
          setAthletes([]);
        }
      }
    }
    loadAthletes();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleBlaToggle = useCallback(
    async (sessionId: number, current: boolean) => {
      if (!athleteId) return;
      setBlaCheckLoading(sessionId);
      try {
        await api.toggleBlaCheck(token, sessionId, !current);
        // Refrescar el overview para que el estado quede actualizado
        const updated = await api.planningOverview(token, athleteId, selectedDiscipline);
        setOverview(updated as PlanningOverview);
      } catch {
        // error silencioso — el toggle es reversible
      } finally {
        setBlaCheckLoading(null);
      }
    },
    [athleteId, token, selectedDiscipline],
  );

  const updatePlanningRoute = useCallback(
    (nextAthleteId: string, nextDiscipline: string) => {
      const athlete = athletes.find((item) => String(item.id) === nextAthleteId);
      const params = new URLSearchParams(searchParams);
      params.set("athleteId", nextAthleteId);
      params.set("discipline", nextDiscipline);
      if (athlete) {
        params.set("athleteName", athlete.name);
      }
      setSearchParams(params);
    },
    [athletes, searchParams, setSearchParams],
  );

  useEffect(() => {
    if (athleteId || !athletes.length) return;
    const firstAthlete = athletes[0];
    const initialDiscipline = firstAthlete.primary_discipline === "triatlón" ? "running" : firstAthlete.primary_discipline ?? "running";
    updatePlanningRoute(String(firstAthlete.id), initialDiscipline);
  }, [athleteId, athletes, updatePlanningRoute]);

  async function loadPlanningContext(currentAthleteId: string, currentDiscipline: string) {
    setLoading(true);
    setError(null);
    try {
      const result = (await api.planningOverview(token, currentAthleteId, currentDiscipline)) as PlanningOverview;
      setOverview(result);
      setDisciplineOverviews((current) => ({ ...current, [currentDiscipline]: result }));
    } catch (loadError) {
      setOverview(null);
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la planificación.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedDiscipline(searchDiscipline);
  }, [searchDiscipline]);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalysis() {
      if (!athleteId) {
        setAthleteAnalysis(null);
        return;
      }
      try {
        const result = (await api.athleteAnalysis(token, athleteId)) as AthleteAnalysis;
        if (!cancelled) {
          setAthleteAnalysis(result);
        }
      } catch {
        if (!cancelled) {
          setAthleteAnalysis(null);
        }
      }
    }

    loadAnalysis();
    return () => {
      cancelled = true;
    };
  }, [athleteId, token]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!athleteId) {
        setOverview(null);
        setLoading(false);
        return;
      }
      try {
        const result = (await api.planningOverview(token, athleteId, selectedDiscipline)) as PlanningOverview;
        if (!cancelled) {
          setOverview(result);
          setDisciplineOverviews((current) => ({ ...current, [selectedDiscipline]: result }));
        }
      } catch (loadError) {
        if (!cancelled) {
          setOverview(null);
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la planificación.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [athleteId, token, selectedDiscipline]);

  const availableDisciplines = useMemo(() => {
    if (overview?.athlete_primary_discipline === "triatlón") {
      return ["natación", "ciclismo", "running"];
    }
    if (overview?.athlete_primary_discipline) {
      return [overview.athlete_primary_discipline];
    }
    return [searchDiscipline];
  }, [overview?.athlete_primary_discipline, searchDiscipline]);

  useEffect(() => {
    const overlayOptions = availableDisciplines.filter((discipline) => discipline !== selectedDiscipline);
    setEnabledOverlayDisciplines((current) => current.filter((discipline) => overlayOptions.includes(discipline)));
  }, [availableDisciplines, selectedDiscipline]);

  useEffect(() => {
    let cancelled = false;

    async function loadOverlayDisciplines() {
      if (!athleteId || availableDisciplines.length <= 1) return;
      const missingDisciplines = availableDisciplines.filter((discipline) => !disciplineOverviews[discipline]);
      if (!missingDisciplines.length) return;
      try {
        const results = await Promise.all(
          missingDisciplines.map(async (discipline) => (
            [discipline, (await api.planningOverview(token, athleteId, discipline)) as PlanningOverview] as const
          )),
        );
        if (!cancelled) {
          setDisciplineOverviews((current) => {
            const next = { ...current };
            results.forEach(([discipline, result]) => {
              next[discipline] = result;
            });
            return next;
          });
        }
      } catch {
        if (!cancelled) {
          return;
        }
      }
    }

    loadOverlayDisciplines();
    return () => {
      cancelled = true;
    };
  }, [athleteId, availableDisciplines, disciplineOverviews, token]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkoutLibrary() {
      try {
        const result = (await api.generalPlanningWorkoutLibrary(token, selectedDiscipline)) as PlanningWorkoutTemplate[];
        if (!cancelled) setWorkoutLibrary(result);
      } catch {
        if (!cancelled) setWorkoutLibrary([]);
      }
    }

    loadWorkoutLibrary();
    setOpenWorkoutPreview(null);

    return () => {
      cancelled = true;
    };
  }, [selectedDiscipline, token]);

  const templateLibrary = overview?.template_library ?? [];
  const selectedTemplate = useMemo(
    () => templateLibrary.find((template) => template.template_id === selectedTemplateId) ?? templateLibrary[0] ?? null,
    [selectedTemplateId, templateLibrary],
  );

  useEffect(() => {
    if (!availableDisciplines.includes(selectedDiscipline)) {
      if (athleteId && availableDisciplines.length) {
        updatePlanningRoute(athleteId, availableDisciplines[0] ?? "running");
        return;
      }
      setSelectedDiscipline(availableDisciplines[0] ?? "running");
    }
  }, [athleteId, availableDisciplines, selectedDiscipline, updatePlanningRoute]);

  useEffect(() => {
    if (!templateLibrary.length) {
      setSelectedTemplateId("");
      return;
    }
    const suggestedTemplateId = overview?.next_recommendation.template_id ?? "";
    if (selectedTemplateId && templateLibrary.some((template) => template.template_id === selectedTemplateId)) {
      return;
    }
    if (suggestedTemplateId && templateLibrary.some((template) => template.template_id === suggestedTemplateId)) {
      setSelectedTemplateId(suggestedTemplateId);
      return;
    }
    setSelectedTemplateId(templateLibrary[0].template_id);
  }, [overview?.next_recommendation.template_id, selectedTemplateId, templateLibrary]);

  const selectedObjectiveOptions = useMemo(() => objectiveOptionsForDiscipline(selectedDiscipline), [selectedDiscipline]);
  const selectedWeaknessOptions = useMemo(() => weaknessOptionsForDiscipline(selectedDiscipline), [selectedDiscipline]);

  useEffect(() => {
    if (!selectedObjectiveOptions.includes(blockObjective)) {
      setBlockObjective(selectedObjectiveOptions[0] ?? "LT1");
    }
  }, [blockObjective, selectedObjectiveOptions]);

  useEffect(() => {
    if (!selectedWeaknessOptions.includes(primaryWeakness)) {
      setPrimaryWeakness(selectedWeaknessOptions[0] ?? "Base aeróbica");
    }
    if (!selectedWeaknessOptions.includes(secondaryWeakness)) {
      setSecondaryWeakness(selectedWeaknessOptions[1] ?? selectedWeaknessOptions[0] ?? "LT1");
    }
  }, [primaryWeakness, secondaryWeakness, selectedWeaknessOptions]);

  useEffect(() => {
    if (!overview?.next_recommendation) return;
    setWeeks(String(overview.next_recommendation.duration_weeks));
    setBlockIntent((current) => (
      current ||
      overview.current_block.recommendation ||
      overview.next_recommendation.reasoning[0] ||
      "Bloque provisional para empezar a trabajar la limitante principal."
    ));
    setCoachNotes((current) => current || overview.next_recommendation.control_points.join(" "));
  }, [overview?.current_block.recommendation, overview?.next_recommendation]);

  useEffect(() => {
    if (!selectedTemplate) return;
    const nextObjective = objectiveFromTemplate(selectedTemplate, selectedDiscipline);
    if (selectedObjectiveOptions.includes(nextObjective)) {
      setBlockObjective(nextObjective);
    }
    setBlockPhase(defaultPhaseForRecommendation(selectedTemplate.block_type));
    setWeeks((current) => {
      const parsed = Number(current);
      if (parsed >= selectedTemplate.typical_duration_weeks_min && parsed <= selectedTemplate.typical_duration_weeks_max) {
        return current;
      }
      return String(selectedTemplate.typical_duration_weeks_min);
    });
  }, [selectedDiscipline, selectedObjectiveOptions, selectedTemplate]);

  const quickGuardrails = useMemo(() => {
    const recommendation = overview?.next_recommendation;
    const lines = [
      selectedTemplate?.entry_checks?.[0] ??
        overview?.current_block.recommendation ??
        "Mantén una única variable dominante por bloque para poder leer si el cambio fisiológico es real.",
      selectedDiscipline === "ciclismo"
        ? "En ciclismo, decide si quieres progresar por tiempo útil o por densidad antes de subir potencia objetivo."
        : selectedDiscipline === "natación"
          ? "En natación, prioriza continuidad y calidad técnica antes de endurecer el bloque."
          : "En carrera, sube minutos de trabajo o densidad, no ambas cosas en la misma semana.",
      selectedTemplate?.progression_rules?.[0] ??
        recommendation?.progression_rules?.[0] ??
        (priority === "agresivo"
          ? "Modo agresivo: deja una semana final de descarga clara para no arrastrar fatiga al siguiente bloque."
          : "Modo controlado: busca comparabilidad de lactato y una respuesta limpia al final del ciclo."),
    ];
    return lines;
  }, [overview?.current_block.recommendation, overview?.next_recommendation, priority, selectedDiscipline, selectedTemplate]);

  const microcycle = useMemo(
    () => buildMicrocycle(Number(weeks) || 4, selectedDiscipline, blockObjective, density),
    [weeks, selectedDiscipline, blockObjective, density],
  );
  const durationFeedback = useMemo(
    () => durationInterpretation(selectedTemplate, Number(weeks) || 0),
    [selectedTemplate, weeks],
  );

  const phaseOptions = useMemo(
    () => phaseOptionsForRecommendation(selectedTemplate?.block_type || overview?.next_recommendation.recommended_block_type),
    [overview?.next_recommendation.recommended_block_type, selectedTemplate?.block_type],
  );

  useEffect(() => {
    if (!phaseOptions.includes(blockPhase)) {
      setBlockPhase(phaseOptions[0] ?? "base");
    }
  }, [blockPhase, phaseOptions]);

  async function saveFocusBlockFromPlanning() {
    if (!athleteId || !overview) return;
    setSaveError(null);
    setSaveMessage(null);
    setSaving(true);
    try {
      const durationWeeks = Number(weeks) || overview.next_recommendation.duration_weeks || 4;
      const endDate = addDays(blockStartDate, durationWeeks * 7 - 1);
      await api.addFocusBlock(token, Number(athleteId), {
        start_date: blockStartDate,
        end_date: endDate,
        template_id: selectedTemplate?.template_id || null,
        energy_system_focus: selectedTemplate?.primary_focus || energySystemFocusForRecommendation(
          overview.next_recommendation.recommended_block_type,
          overview.next_recommendation.primary_focus,
        ),
        block_objective: blockObjective,
        block_intent: blockIntent || selectedTemplate?.summary || null,
        priority_discipline: selectedDiscipline,
        phase: blockPhase,
        target_event: overview.next_recommendation.next_target?.objective || null,
        target_date: overview.next_recommendation.next_target?.target_date || null,
        status: "active",
        coach_notes: [
          selectedTemplate ? `Plantilla: ${selectedTemplate.public_label}` : null,
          primaryWeakness ? `Limitante principal: ${primaryWeakness}` : null,
          secondaryWeakness ? `Limitante secundaria: ${secondaryWeakness}` : null,
          coachNotes || null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      setSaveMessage("Bloque guardado como activo desde planificación.");
      await loadPlanningContext(String(athleteId), selectedDiscipline);
    } catch (loadError) {
      setSaveError(loadError instanceof Error ? loadError.message : "No se pudo guardar el bloque.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePlannedBlock(blockId: number) {
    if (!athleteId) return;
    const confirmed = window.confirm("¿Quieres eliminar este bloque planificado? Esta acción sí borra el bloque real del atleta.");
    if (!confirmed) return;
    setDeletingBlockId(blockId);
    try {
      await api.deleteFocusBlock(token, Number(athleteId), blockId);
      await loadPlanningContext(String(athleteId), selectedDiscipline);
    } catch (loadError) {
      setSaveError(loadError instanceof Error ? loadError.message : "No se pudo eliminar el bloque.");
    } finally {
      setDeletingBlockId(null);
    }
  }

  const timelineItems = useMemo(() => {
    const from = dateValue(timelineFrom);
    const to = dateValue(timelineTo);
    const items: Array<{
      id: string;
      tone: PlanTone;
      kind: "historical" | "planned" | "target";
      date: string;
      endDate?: string | null;
      title: string;
      subtitle: string;
      meta: string;
    }> = [];

    (overview?.detected_mesocycles ?? []).forEach((block) => {
      const start = dateValue(block.start_date);
      if (!Number.isNaN(from) && start < from) return;
      if (!Number.isNaN(to) && start > to) return;
      items.push({
        id: `historical-${block.start_date}-${block.block_type}`,
        tone:
          block.block_type === "recovery_consolidation_block"
            ? "warning"
            : block.block_type === "aerobic_capacity_block" || block.block_type === "threshold_development_block" || block.block_type === "aerobic_power_block"
              ? "positive"
              : "neutral",
        kind: "historical",
        date: block.start_date,
        endDate: block.end_date,
        title: detectedBlockTitle(block),
        subtitle: "Histórico inferido",
        meta: `${block.weeks_count} sem · ${block.session_count} sesiones`,
      });
    });

    (overview?.planned_blocks ?? []).forEach((block) => {
      const start = dateValue(block.start_date);
      if (!Number.isNaN(from) && start < from) return;
      if (!Number.isNaN(to) && start > to) return;
      items.push({
        id: `planned-${block.id}`,
        tone: block.status === "active" ? "positive" : block.status === "planned" ? "neutral" : "warning",
        kind: "planned",
        date: block.start_date,
        endDate: block.end_date ?? block.target_date ?? null,
        title: `${block.energy_system_focus} · ${block.block_objective}`,
        subtitle: block.status === "active" ? "Bloque activo" : "Bloque programado",
        meta: disciplineLabel(block.priority_discipline || selectedDiscipline),
      });
    });

    const target = overview?.next_recommendation.next_target;
    if (target?.target_date) {
      const targetDate = dateValue(target.target_date);
      if ((Number.isNaN(from) || targetDate >= from) && (Number.isNaN(to) || targetDate <= to)) {
        items.push({
          id: `target-${target.target_date}-${target.objective}`,
          tone: "warning",
          kind: "target",
          date: target.target_date,
          title: target.objective || "Objetivo",
          subtitle: `Objetivo ${disciplineLabel(selectedDiscipline).toLowerCase()}`,
          meta: target.target_metric || target.distance_label || "Objetivo abierto",
        });
      }
    }

    return items.sort((a, b) => dateValue(a.date) - dateValue(b.date));
  }, [overview?.detected_mesocycles, overview?.next_recommendation.next_target, overview?.planned_blocks, selectedDiscipline, timelineFrom, timelineTo]);

  const draftCalendarSource = useMemo<PlanningCalendarSource>(() => {
    const durationWeeks = Number(weeks) || overview?.next_recommendation.duration_weeks || 4;
    return {
      id: "draft",
      kind: "draft",
      focusBlockId: null,
      startDate: blockStartDate,
      endDate: addDays(blockStartDate, durationWeeks * 7 - 1),
      discipline: selectedDiscipline,
      title: selectedTemplate?.public_label || overview?.next_recommendation.recommended_block_label || "Borrador",
      objective: blockObjective,
      energySystemFocus: selectedTemplate?.primary_focus || overview?.next_recommendation.primary_focus || null,
      phase: blockPhase,
      intent: blockIntent || selectedTemplate?.summary || null,
      notes: coachNotes || null,
      density,
    };
  }, [
    blockIntent,
    blockObjective,
    blockPhase,
    blockStartDate,
    coachNotes,
    density,
    overview?.next_recommendation.duration_weeks,
    overview?.next_recommendation.primary_focus,
    overview?.next_recommendation.recommended_block_label,
    selectedDiscipline,
    selectedTemplate?.primary_focus,
    selectedTemplate?.public_label,
    selectedTemplate?.summary,
    weeks,
  ]);

  const calendarSources = useMemo<PlanningCalendarSource[]>(() => {
    const planned = (overview?.planned_blocks ?? []).map((block) => ({
      id: `planned-${block.id}`,
      kind: "planned" as const,
      focusBlockId: block.id,
      startDate: block.start_date,
      endDate: block.end_date || block.target_date || block.start_date,
      discipline: block.priority_discipline || selectedDiscipline,
      title: `${block.energy_system_focus} · ${block.block_objective}`,
      objective: block.block_objective,
      energySystemFocus: block.energy_system_focus,
      phase: block.phase,
      intent: block.block_intent,
      notes: block.coach_notes,
      density: "media",
    }));
    const historical = (overview?.detected_mesocycles ?? []).map((block) => ({
      id: `historical-${block.start_date}-${block.block_type}`,
      kind: "historical" as const,
      focusBlockId: null,
      startDate: block.start_date,
      endDate: block.end_date,
      discipline: block.discipline,
      title: block.block_label,
      objective: block.block_label,
      energySystemFocus: block.block_type,
      phase: null,
      intent: block.explanation[0] || null,
      notes: block.explanation.join(" "),
      density: "media",
    }));
    return [draftCalendarSource, ...planned, ...historical];
  }, [draftCalendarSource, overview?.detected_mesocycles, overview?.planned_blocks, selectedDiscipline]);

  const selectedCalendarSource = useMemo(
    () => calendarSources.find((source) => source.id === selectedCalendarSourceId) ?? draftCalendarSource,
    [calendarSources, draftCalendarSource, selectedCalendarSourceId],
  );

  const overlayOptions = useMemo(
    () => availableDisciplines.filter((discipline) => discipline !== selectedDiscipline),
    [availableDisciplines, selectedDiscipline],
  );

  const overlaySources = useMemo<PlanningCalendarSource[]>(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = addDays(addMonths(monthStart, 1), -1);
    return enabledOverlayDisciplines.flatMap<PlanningCalendarSource>((discipline) => {
      const disciplineOverview = disciplineOverviews[discipline];
      if (!disciplineOverview) return [];
      const planned = disciplineOverview.planned_blocks
        .map((block) => ({
          id: `overlay-planned-${discipline}-${block.id}`,
          kind: "planned" as const,
          focusBlockId: block.id,
          startDate: block.start_date,
          endDate: block.end_date || block.target_date || block.start_date,
          discipline,
          title: `${block.energy_system_focus} · ${block.block_objective}`,
          objective: block.block_objective,
          energySystemFocus: block.energy_system_focus,
          phase: block.phase,
          intent: block.block_intent,
          notes: block.coach_notes,
          density: "media",
        }))
        .filter((source) => overlapsRange(source.startDate, source.endDate, monthStart, monthEnd));
      if (planned.length) return planned;
      return disciplineOverview.detected_mesocycles
        .map((block) => ({
          id: `overlay-historical-${discipline}-${block.start_date}-${block.block_type}`,
          kind: "historical" as const,
          focusBlockId: null,
          startDate: block.start_date,
          endDate: block.end_date,
          discipline,
          title: block.block_label,
          objective: block.block_label,
          energySystemFocus: block.block_type,
          phase: null,
          intent: block.explanation[0] || null,
          notes: block.explanation.join(" "),
          density: "media",
        }))
        .filter((source) => overlapsRange(source.startDate, source.endDate, monthStart, monthEnd))
        .slice(-1);
    });
  }, [calendarMonth, disciplineOverviews, enabledOverlayDisciplines]);

  useEffect(() => {
    if (!calendarSources.some((source) => source.id === selectedCalendarSourceId)) {
      setSelectedCalendarSourceId("draft");
    }
  }, [calendarSources, selectedCalendarSourceId]);

  useEffect(() => {
    setCalendarMonth(startOfMonth(selectedCalendarSource.startDate));
  }, [selectedCalendarSource.startDate]);

  const plannedSessions = useMemo(() => {
    const persisted = buildPersistedCalendarSessions(selectedCalendarSource, overview?.planned_sessions ?? []);
    return persisted ?? buildSyntheticCalendarSessions(selectedCalendarSource);
  }, [overview?.planned_sessions, selectedCalendarSource]);

  const overlayEntries = useMemo<CalendarEntry[]>(
    () => overlaySources.flatMap((source) => {
      const disciplineOverview = disciplineOverviews[source.discipline];
      const persisted = buildPersistedCalendarSessions(source, disciplineOverview?.planned_sessions ?? []);
      const sessions = persisted ?? buildSyntheticCalendarSessions(source);
      return sessions.map((session) => ({
        ...session,
        layerDiscipline: source.discipline,
        isOverlay: true,
      }));
    }),
    [disciplineOverviews, overlaySources],
  );

  const primaryEntries = useMemo<CalendarEntry[]>(
    () => plannedSessions.map((session) => ({
      ...session,
      layerDiscipline: selectedCalendarSource.discipline,
      isOverlay: false,
    })),
    [plannedSessions, selectedCalendarSource.discipline],
  );

  const calendarCells = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const totalDays = daysInMonth(monthStart);
    const offset = weekdayOffset(monthStart);
    return [
      ...Array.from({ length: offset }, (_, index) => ({ id: `empty-${index}`, date: null as string | null })),
      ...Array.from({ length: totalDays }, (_, index) => ({
        id: `day-${index + 1}`,
        date: addDays(monthStart, index),
      })),
    ];
  }, [calendarMonth]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    [...primaryEntries, ...overlayEntries].forEach((session) => {
      const current = map.get(session.date) ?? [];
      current.push(session);
      map.set(session.date, current);
    });
    return map;
  }, [overlayEntries, primaryEntries]);

  useEffect(() => {
    const initialDate = plannedSessions[0]?.date ?? selectedCalendarSource.startDate;
    setSelectedCalendarDate(initialDate);
  }, [plannedSessions, selectedCalendarSource.startDate, selectedCalendarSource.id]);

  const selectedDaySessions = useMemo(
    () => (selectedCalendarDate ? sessionsByDate.get(selectedCalendarDate) ?? [] : []),
    [selectedCalendarDate, sessionsByDate],
  );

  const selectedPrimarySessions = useMemo(
    () => selectedDaySessions.filter((session) => !session.isOverlay),
    [selectedDaySessions],
  );

  const selectedOverlaySessions = useMemo(
    () => selectedDaySessions.filter((session) => session.isOverlay),
    [selectedDaySessions],
  );

  const planningThresholdSource = useMemo(
    () => resolveAnalysisDisciplineView(athleteAnalysis, selectedDiscipline) ?? athleteAnalysis,
    [athleteAnalysis, selectedDiscipline],
  );
  const planningLt1 = useMemo(
    () => resolveTrainingThreshold(planningThresholdSource, "LT1"),
    [planningThresholdSource],
  );
  const planningLt2 = useMemo(
    () => resolveTrainingThreshold(planningThresholdSource, "LT2"),
    [planningThresholdSource],
  );
  const planningThresholdOpinionText = useMemo(
    () => planningThresholdOpinion(planningLt1, planningLt2, individualThresholdReason(planningThresholdSource)),
    [planningLt1, planningLt2, planningThresholdSource],
  );
  const planningThresholdBasis = useMemo(() => {
    const visibleSources = Array.from(new Set([planningLt1?.source, planningLt2?.source].filter(Boolean)));
    if (planningLt1?.source === "individual" && planningLt2?.source === "individual") {
      return "Base activa: LT1/LT2 individuales.";
    }
    if (visibleSources.length > 1) {
      return "Base activa: mixta entre referencia individual/fisiológica y análisis disponible.";
    }
    if (planningLt1?.source === "physiological" || planningLt2?.source === "physiological") {
      return "Base activa: fisiológicos 2.0 / 4.0 mmol.";
    }
    if (planningLt1 || planningLt2) {
      return "Base activa: anclas del análisis actual.";
    }
    return "Sin anclas visibles para esta disciplina.";
  }, [planningLt1, planningLt2]);

  const openDraftWorkoutPreview = useCallback((session: PlanningMesocycleDraftSession) => {
    const template = resolveWorkoutTemplate(workoutLibrary, {
      templateId: session.template_id,
      family: session.session_family,
      label: session.public_label,
    });
    if (!template) return;
    setOpenWorkoutPreview({
      template,
      selection: {
        ...buildDraftWorkoutPreviewSelection(template, session),
        prescriptionHint: buildPlanningPrescriptionHint(session.objective, session.public_label, template.discipline, planningLt1, planningLt2),
        thresholdBasis: planningThresholdBasis,
      },
    });
  }, [planningLt1, planningLt2, planningThresholdBasis, workoutLibrary]);

  const openPlannedWorkoutPreview = useCallback((sessionId: number) => {
    const plannedSession = overview?.planned_sessions.find((item) => item.id === sessionId);
    if (!plannedSession) return;
    const template = resolveWorkoutTemplate(workoutLibrary, {
      templateId: plannedSession.workout_template_id,
      family: plannedSession.session_family,
      label: plannedSession.public_label,
    });
    if (!template) return;
    setOpenWorkoutPreview({
      template,
      selection: {
        ...buildPlannedWorkoutPreviewSelection(template, plannedSession),
        prescriptionHint: buildPlanningPrescriptionHint(plannedSession.objective, plannedSession.public_label, plannedSession.discipline, planningLt1, planningLt2),
        thresholdBasis: planningThresholdBasis,
      },
    });
  }, [overview?.planned_sessions, planningLt1, planningLt2, planningThresholdBasis, workoutLibrary]);

  const draftWeeksCount = overview?.mesocycle_draft?.weeks.length ?? Math.max(1, Number(weeks) || 0);
  const draftSessionCount = overview?.mesocycle_draft?.weeks.reduce((total, week) => total + week.sessions.length, 0) ?? plannedSessions.length;
  const activeBlockLabel = overview?.current_block.energy_system_focus
    ? `${overview.current_block.energy_system_focus} · ${overview.current_block.block_objective}`
    : "Sin bloque activo";
  const nextTargetLabel = overview?.next_recommendation.next_target?.target_date
    ? formatDate(overview.next_recommendation.next_target.target_date)
    : "Sin fecha";
  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => String(athlete.id) === String(athleteId)) ?? null,
    [athleteId, athletes],
  );
  const visibleTargets = useMemo(() => {
    const today = formatDateKey(new Date());
    return (selectedAthlete?.targets ?? [])
      .filter((target) => !target.target_date || target.target_date >= today)
      .sort((left, right) => String(left.target_date).localeCompare(String(right.target_date)))
      .slice(0, 4);
  }, [selectedAthlete]);
  const coachWorkspaces: Array<{ id: PlanningWorkspace; label: string; hint: string }> = [
    { id: "overview", label: "Cockpit", hint: "lectura y decisión" },
    { id: "calendar", label: "Calendario", hint: "semana y capas" },
    { id: "builder", label: "Diseño", hint: "bloque y borrador" },
  ];

  if (loading) {
    return <div className="loading">Preparando planificación...</div>;
  }

  if (error) {
    return <div className="error">No se pudo cargar la planificación: {error}</div>;
  }

  return (
    <div className="page-grid planning-page">
      <section className="hero card planning-hero">
        <div className="planning-hero-main">
          <span className="eyebrow">Planificación</span>
          <div className="planning-hero-title-row">
            <h1>{overview ? `Planificación de ${firstName(overview.athlete_name)}` : "Planificación"}</h1>
            {overview ? (
              <Link className="ghost-button" to={`/athletes/${overview.athlete_id}`}>
                Ir Ficha Atleta
              </Link>
            ) : null}
          </div>
          <div className="planning-hero-tags">
            {athletes.length ? (
              <div className="planning-athlete-picker">
                <span className="planning-athlete-label">Atleta</span>
                <select
                  className="planning-athlete-select"
                  value={athleteId ?? ""}
                  onChange={(event) => {
                    const nextAthleteId = event.target.value;
                    const athlete = athletes.find((item) => String(item.id) === nextAthleteId);
                    const nextDiscipline = athlete?.primary_discipline === "triatlón" ? "running" : athlete?.primary_discipline ?? "running";
                    updatePlanningRoute(nextAthleteId, nextDiscipline);
                  }}
                >
                  {athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="planning-discipline-group">
              {availableDisciplines.map((discipline) => (
                <button
                  key={discipline}
                  type="button"
                  className={`discipline-tab ${selectedDiscipline === discipline ? "active" : ""}`}
                  onClick={() => {
                    if (!athleteId) return;
                    updatePlanningRoute(athleteId, discipline);
                  }}
                >
                  {disciplineLabel(discipline)}
                </button>
              ))}
            </div>
          </div>
          {visibleTargets.length ? (
            <div className="planning-targets-row">
              {visibleTargets.map((target) => (
                <article key={target.id} className="planning-target-chip">
                  <small>{target.distance_label || disciplineLabel(target.discipline)}</small>
                  <strong>{targetPrimaryValue(target)}</strong>
                  <span>{formatTargetChipDate(target.target_date)}</span>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="card section-card planning-card planning-toolbar-card">
        <div className="planning-kpi-strip">
          <article className="planning-kpi-card">
            <span className="planning-kpi-label">Bloque activo</span>
            <strong>{activeBlockLabel}</strong>
            <small>{overview?.current_block.start_date ? `${formatDate(overview.current_block.start_date)} → ${formatDate(overview.current_block.end_date || overview.current_block.target_date)}` : "Sin bloque real cargado"}</small>
          </article>
          <article className="planning-kpi-card">
            <span className="planning-kpi-label">Siguiente hito</span>
            <strong>{overview?.next_recommendation.next_target?.objective || "Objetivo abierto"}</strong>
            <small>{nextTargetLabel}</small>
          </article>
          <article className="planning-kpi-card">
            <span className="planning-kpi-label">Bloques guardados</span>
            <strong>{overview?.planned_blocks.length ?? 0}</strong>
            <small>{overview?.planned_blocks.length ? "listos para revisar o borrar" : "sin plan persistido todavía"}</small>
          </article>
          <article className="planning-kpi-card">
            <span className="planning-kpi-label">Borrador operativo</span>
            <strong>{draftWeeksCount} sem · {draftSessionCount} sesiones</strong>
            <small>{selectedTemplate?.public_label || overview?.next_recommendation.recommended_block_label || "borrador base"}</small>
          </article>
        </div>
        <div className="planning-threshold-strip">
          <article className="planning-threshold-card">
            <span className="planning-kicker">LT1 activo</span>
            <strong>{formatThresholdPrimaryMetric(planningLt1, selectedDiscipline)}</strong>
            <small>{planningLt1 ? `${planningLt1.sourceLabel}${planningLt1.heartRate != null ? ` · ${Math.round(planningLt1.heartRate)} bpm` : ""}` : "Sin LT1 visible"}</small>
          </article>
          <article className="planning-threshold-card">
            <span className="planning-kicker">LT2 activo</span>
            <strong>{formatThresholdPrimaryMetric(planningLt2, selectedDiscipline)}</strong>
            <small>{planningLt2 ? `${planningLt2.sourceLabel}${planningLt2.heartRate != null ? ` · ${Math.round(planningLt2.heartRate)} bpm` : ""}` : "Sin LT2 visible"}</small>
          </article>
          <article className="planning-threshold-card policy">
            <span className="planning-kicker">Política de lectura</span>
            <strong>{planningThresholdBasis}</strong>
            <small>{planningThresholdOpinionText}</small>
          </article>
        </div>
        <div className="planning-workspace-switch" role="tablist" aria-label="Áreas de trabajo de planificación">
          {coachWorkspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              role="tab"
              aria-selected={activeWorkspace === workspace.id}
              className={`planning-workspace-button ${activeWorkspace === workspace.id ? "active" : ""}`}
              onClick={() => setActiveWorkspace(workspace.id)}
            >
              <strong>{workspace.label}</strong>
              <small>{workspace.hint}</small>
            </button>
          ))}
        </div>
      </section>

      {activeWorkspace === "overview" && (
        <>
          <section className="planning-stack">
            <article className="card section-card planning-card">
              <div className="section-heading compact">
                <span className="eyebrow">Roadmap</span>
                <h2 className="section-title">Próximo objetivo</h2>
              </div>
              <div className="planning-target-stack">
                <div className="planning-target-main planning-target-wide">
                  <strong>{overview?.next_recommendation.next_target?.objective || "Sin competición prioritaria cargada"}</strong>
                  <p>
                    {overview?.next_recommendation.next_target
                      ? `${disciplineLabel(selectedDiscipline)} · ${overview.next_recommendation.next_target.distance_label || "Objetivo abierto"}`
                      : "Puedes ordenar esta vista mejor desde los objetivos del atleta."}
                  </p>
                  <small>
                    {overview?.next_recommendation.next_target
                      ? `Fecha objetivo: ${formatDate(overview.next_recommendation.next_target.target_date)}${
                          overview.next_recommendation.next_target.target_metric ? ` · Objetivo ${overview.next_recommendation.next_target.target_metric}` : ""
                        }`
                      : "Aún no hay una fecha futura prioritaria."}
                  </small>
                </div>
                <div className="planning-mini-list">
                  <article className="planning-mini-card">
                    <span className="eyebrow">Disciplina</span>
                    <strong>{disciplineLabel(selectedDiscipline)}</strong>
                    <p>La prescripción rápida se adapta a la disciplina activa.</p>
                  </article>
                  <article className="planning-mini-card">
                    <span className="eyebrow">Bloque sugerido</span>
                    <strong>{overview?.next_recommendation.recommended_block_label || "Sin sugerencia"}</strong>
                    <p>{overview ? `${overview.next_recommendation.structure} · ${overview.next_recommendation.primary_focus}` : "Todavía no hay recomendación disponible."}</p>
                  </article>
                </div>
              </div>
            </article>
          </section>

          <section className="planning-bottom-grid">
            <article className="card section-card planning-card">
              <div className="section-heading compact">
                <span className="eyebrow">Lectura del sistema</span>
                <h2 className="section-title">Qué ve el motor ahora mismo</h2>
              </div>
              <div className="planning-flow">
                {(overview?.next_recommendation.reasoning ?? []).map((item, index) => (
                  <article key={item} className="planning-flow-step">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{index === 0 ? "Lectura principal" : index === 1 ? "Lógica de bloque" : "Criterio adicional"}</strong>
                      <p>{item}</p>
                    </div>
                  </article>
                ))}
              </div>
              {(overview?.next_recommendation.candidates_scored?.length ?? 0) > 0 && (
                <div className="planning-candidates">
                  <span className="planning-candidates-title">Candidatos evaluados</span>
                  {overview!.next_recommendation.candidates_scored!.map((c, i) => (
                    <article key={c.block_type} className={`planning-candidate ${i === 0 ? "winner" : ""}`}>
                      <div className="candidate-header">
                        <strong>{BLOCK_LABELS[c.block_type] ?? c.block_type}</strong>
                        <span className="candidate-score">{c.score}pts</span>
                        {i === 0 && <span className="candidate-badge">elegido</span>}
                      </div>
                      {i === 0 && c.reasons.slice(0, 2).map((r) => (
                        <small key={r} className="candidate-reason">{r}</small>
                      ))}
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="card section-card planning-card">
              <div className="section-heading compact">
                <span className="eyebrow">Histórico útil</span>
                <h2 className="section-title">Bloques cerrados</h2>
              </div>
              <div className="planning-archive">
                {overview?.detected_mesocycles.length ? (
                  overview.detected_mesocycles.slice(-4).reverse().map((block) => (
                    <article key={`${block.start_date}-${block.end_date}-${block.block_type}`} className={`planning-archive-card ${block.block_type === "recovery_consolidation_block" ? "warning" : "positive"}`}>
                      <strong>{block.block_label}</strong>
                      <p>{formatDate(block.start_date)} → {formatDate(block.end_date)}</p>
                      <small>{block.explanation[block.explanation.length - 1] || "Sin recomendación guardada."}</small>
                    </article>
                  ))
                ) : (
                  <article className="planning-empty-state">
                    <strong>Todavía no hay bloques cerrados comparables.</strong>
                    <p>Aquí quedará visible lo aprendido de los bloques anteriores para no volver a planificar desde cero.</p>
                  </article>
                )}
              </div>
            </article>
          </section>
        </>
      )}

      {activeWorkspace === "calendar" && (
        <section className="planning-stack">
          <article className="card section-card planning-card">
            <div className="section-heading compact">
              <span className="eyebrow">Timeline</span>
              <h2 className="section-title">Contexto de la disciplina</h2>
              <p className="muted">Una sola línea para ver contexto reciente, bloques programados y el objetivo de la disciplina. Arrastra horizontalmente si quieres más detalle.</p>
            </div>
            <div className="planning-timeline-toolbar">
              <label>
                Desde
                <input type="date" value={timelineFrom} onChange={(event) => setTimelineFrom(event.target.value)} />
              </label>
              <label>
                Hasta
                <input type="date" value={timelineTo} onChange={(event) => setTimelineTo(event.target.value)} />
              </label>
            </div>
            {overview?.planned_blocks.length ? (
              <div className="planning-inline-actions">
                {overview.planned_blocks
                  .filter((block) => {
                    const start = dateValue(block.start_date);
                    const from = dateValue(timelineFrom);
                    const to = dateValue(timelineTo);
                    return (Number.isNaN(from) || start >= from) && (Number.isNaN(to) || start <= to);
                  })
                  .slice(0, 4)
                  .map((block) => (
                    <button
                      key={`delete-${block.id}`}
                      type="button"
                      className="planning-inline-action planning-delete-button"
                      onClick={() => deletePlannedBlock(block.id)}
                      disabled={deletingBlockId === block.id}
                    >
                      {deletingBlockId === block.id ? "Eliminando..." : `Eliminar ${block.block_objective}`}
                    </button>
                  ))}
              </div>
            ) : null}
            <div className="planning-horizontal-line">
              {timelineItems.length ? (
                <div className="planning-timeline-strip">
                  {timelineItems.map((item) => {
                    const matchingSource = calendarSources.find((source) => source.id === item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`planning-timeline-pill ${item.tone} ${item.kind} ${
                          matchingSource && selectedCalendarSourceId === item.id ? "selected" : ""
                        }`}
                        onClick={() => {
                          if (matchingSource) {
                            setSelectedCalendarSourceId(item.id);
                          }
                          setCalendarMonth(startOfMonth(item.date));
                        }}
                      >
                        <span className="planning-kicker">{item.subtitle}</span>
                        <strong>{item.title}</strong>
                        <p>{formatDate(item.date)}{item.endDate ? ` → ${formatDate(item.endDate)}` : ""}</p>
                        <small>{item.meta}</small>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <article className="planning-empty-state">
                  <strong>No hay elementos en ese rango para {disciplineLabel(selectedDiscipline).toLowerCase()}.</strong>
                  <p>Ajusta las fechas para ver más histórico reciente o próximos bloques de la disciplina.</p>
                </article>
              )}
            </div>
            <div className="planning-inline-actions">
              <button
                type="button"
                className={`planning-inline-action ${selectedCalendarSourceId === "draft" ? "active" : ""}`}
                onClick={() => setSelectedCalendarSourceId("draft")}
              >
                Ver borrador actual
              </button>
            </div>
            <div className="planning-calendar-shell">
              <div className="planning-calendar-header">
                <div className="planning-calendar-summary">
                  <span className="planning-kicker">Calendario del bloque</span>
                  <strong>{selectedCalendarSource.title}</strong>
                  <p>
                    {disciplineLabel(selectedCalendarSource.discipline)} · {selectedCalendarSource.objective} · {formatDate(selectedCalendarSource.startDate)} → {formatDate(selectedCalendarSource.endDate)}
                  </p>
                  <div className="planning-calendar-meta">
                    <span className="planning-calendar-meta-pill active-month">Mes activo: {monthHeading(calendarMonth)}</span>
                    <span className="planning-calendar-meta-pill">{selectedCalendarSource.kind === "draft" ? "borrador" : selectedCalendarSource.kind === "planned" ? "plan guardado" : "histórico traducido"}</span>
                    <span className="planning-calendar-meta-pill">{selectedCalendarSource.phase || "fase abierta"}</span>
                    <span className="planning-calendar-meta-pill">{selectedCalendarSource.energySystemFocus || selectedCalendarSource.objective}</span>
                  </div>
                </div>
                <div className="planning-calendar-month-nav">
                  <button type="button" className="planning-inline-action" onClick={() => setCalendarMonth(startOfMonth(addMonths(calendarMonth, -1)))}>
                    Mes previo
                  </button>
                  <strong>{monthLabel(calendarMonth)}</strong>
                  <button type="button" className="planning-inline-action" onClick={() => setCalendarMonth(startOfMonth(addMonths(calendarMonth, 1)))}>
                    Mes siguiente
                  </button>
                </div>
              </div>
              <div className="planning-calendar-active-month-card">
                <span className="planning-kicker">Mes de trabajo</span>
                <strong>{monthHeading(calendarMonth)}</strong>
                <p>La cuadrícula y las capas de disciplinas se están leyendo sobre este mes.</p>
              </div>
              {overlayOptions.length ? (
                <div className="planning-overlay-toolbar">
                  <span className="planning-kicker">Capas de otras disciplinas</span>
                  <div className="planning-overlay-chips">
                    {overlayOptions.map((discipline) => {
                      const active = enabledOverlayDisciplines.includes(discipline);
                      return (
                        <button
                          key={discipline}
                          type="button"
                          className={`planning-overlay-chip ${active ? "active" : ""}`}
                          onClick={() => setEnabledOverlayDisciplines((current) => (
                            current.includes(discipline)
                              ? current.filter((item) => item !== discipline)
                              : [...current, discipline]
                          ))}
                        >
                          {disciplineLabel(discipline)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="planning-calendar-layout">
                <div className="planning-calendar-grid">
                  {["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((day) => (
                    <span key={day} className="planning-calendar-weekday">{day}</span>
                  ))}
                  {calendarCells.map((cell) => {
                    if (!cell.date) {
                      return <span key={cell.id} className="planning-calendar-spacer" aria-hidden="true" />;
                    }
                    const day = cell.date;
                    const daySessions = sessionsByDate.get(day) ?? [];
                    const primaryDaySessions = daySessions.filter((session) => !session.isOverlay);
                    const overlayDaySessions = daySessions.filter((session) => session.isOverlay);
                    const isSelected = selectedCalendarDate === day;
                    const isInBlock = dateValue(day) >= dateValue(selectedCalendarSource.startDate) && dateValue(day) <= dateValue(selectedCalendarSource.endDate);
                    return (
                      <button
                        key={cell.id}
                        type="button"
                        className={`planning-calendar-day ${isSelected ? "selected" : ""} ${isInBlock ? "in-block" : ""}`}
                        onClick={() => setSelectedCalendarDate(day)}
                      >
                        <div className="planning-calendar-day-head">
                          <span>{monthDayLabel(day)}</span>
                          {daySessions.length ? <small>{daySessions.length}</small> : null}
                        </div>
                        <div className="planning-calendar-session-list">
                          {primaryDaySessions.slice(0, 2).map((session) => (
                            <span key={session.id} className={`planning-calendar-chip ${session.confidence}`}>
                              {session.title}
                            </span>
                          ))}
                          {overlayDaySessions.slice(0, 2).map((session) => (
                            <span key={session.id} className="planning-calendar-chip overlay">
                              {disciplineLabel(session.layerDiscipline)}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <aside className="planning-calendar-detail">
                  <div className="planning-calendar-detail-head">
                    <span className="planning-kicker">
                      {selectedCalendarDate ? `${dayNameShort(selectedCalendarDate)} ${formatDate(selectedCalendarDate)}` : "Selecciona un día"}
                    </span>
                    <strong>{selectedDaySessions.length ? `${selectedDaySessions.length} propuesta(s)` : "Día libre o de margen"}</strong>
                    <p>
                      {selectedCalendarSource.kind === "historical"
                        ? "Vista de traducción: sesiones tipo si repitieras hoy la lógica de este bloque histórico."
                        : "Sesiones tipo derivadas del bloque seleccionado para revisar la semana en modo calendario."}
                    </p>
                  </div>
                  {selectedPrimarySessions.length ? (
                    <div className="planning-day-stack">
                      {selectedPrimarySessions.map((session) => (
                        <article
                          key={session.id}
                          className={`planning-day-card clickable${session.blaCheck ? " bla-active" : ""}`}
                          onClick={() => {
                            if (session.rawId != null) openPlannedWorkoutPreview(session.rawId);
                          }}
                        >
                          <div className="planning-day-card-top">
                            <span className="planning-kicker">{session.sessionType}</span>
                            <span className={`planning-session-confidence ${session.confidence}`}>{session.confidence}</span>
                            {session.rawId != null && (
                              <button
                                className={`bla-toggle-btn${session.blaCheck ? " active" : ""}`}
                                title={session.blaCheck ? "BLa check activo — clic para desactivar" : "Activar BLa check en esta sesión"}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleBlaToggle(session.rawId!, session.blaCheck ?? false);
                                }}
                                disabled={blaCheckLoading === session.rawId}
                              >
                                {blaCheckLoading === session.rawId ? "…" : "🩸 BLa"}
                              </button>
                            )}
                          </div>
                          <strong>{session.title}</strong>
                          <p>{session.objective}</p>
                          <small className="planning-dose">{session.dose}</small>
                          <small className="planning-threshold-note">
                            {buildPlanningPrescriptionHint(session.objective, session.title, selectedCalendarSource.discipline, planningLt1, planningLt2)}
                          </small>
                          <small>{session.description}</small>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <article className="planning-day-card empty">
                      <strong>Sin sesión propuesta</strong>
                      <p>Úsalo como descanso, movilidad o ajuste manual según carga real del atleta.</p>
                    </article>
                  )}
                  {selectedOverlaySessions.length ? (
                    <div className="planning-day-stack">
                      <span className="planning-kicker">Otras disciplinas activas</span>
                      {selectedOverlaySessions.map((session) => (
                        <article key={session.id} className="planning-day-card overlay">
                          <div className="planning-day-card-top">
                            <span className="planning-kicker">{disciplineLabel(session.layerDiscipline)}</span>
                            <span className="planning-session-confidence media">overlay</span>
                          </div>
                          <strong>{session.title}</strong>
                          <p>{session.objective}</p>
                          <small className="planning-dose">{session.dose}</small>
                        </article>
                      ))}
                    </div>
                  ) : null}
                  <article className="planning-day-card source">
                    <span className="planning-kicker">Base del calendario</span>
                    <strong>{selectedCalendarSource.energySystemFocus || selectedCalendarSource.objective}</strong>
                    <p>{selectedCalendarSource.intent || "Sin intención operativa cargada."}</p>
                    <small className="planning-threshold-note">{planningThresholdBasis}</small>
                    <small>{selectedCalendarSource.notes || "Sin notas adicionales."}</small>
                  </article>
                </aside>
              </div>
            </div>
          </article>
        </section>
      )}

      {activeWorkspace === "builder" && (
        <>
          <section className="card section-card planning-builder-card">
            <div className="section-heading">
              <span className="eyebrow">Workbench</span>
              <h2 className="section-title">Planificación coach-led</h2>
              <p className="muted">Tú eliges disciplina, limitante y familia de bloque. El sistema aporta checks, contexto histórico y evidencia para que la decisión sea más sólida.</p>
            </div>

            <div className="planning-foundation-grid">
              {(overview?.foundations ?? []).map((foundation) => (
                <article key={foundation.foundation_id} className="planning-foundation-card">
                  <span className="planning-kicker">{foundation.anchor}</span>
                  <strong>{foundation.title}</strong>
                  <p>{foundation.summary}</p>
                </article>
              ))}
            </div>

            <div className="planning-builder-grid">
              <div className="planning-builder-controls">
                <strong className="planning-panel-title">Diagnóstico del entrenador</strong>
                <div className="planning-form-grid">
                  <label>
                    Disciplina dominante
                    <select
                      value={selectedDiscipline}
                      onChange={(event) => {
                        const nextDiscipline = event.target.value;
                        if (athleteId) {
                          updatePlanningRoute(athleteId, nextDiscipline);
                          return;
                        }
                        setSelectedDiscipline(nextDiscipline);
                      }}
                    >
                      {availableDisciplines.map((discipline) => (
                        <option key={discipline} value={discipline}>
                          {disciplineLabel(discipline)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Objetivo del bloque
                    <select value={blockObjective} onChange={(event) => setBlockObjective(event.target.value)}>
                      {selectedObjectiveOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Limitante principal
                    <select value={primaryWeakness} onChange={(event) => setPrimaryWeakness(event.target.value)}>
                      {selectedWeaknessOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Limitante secundaria
                    <select value={secondaryWeakness} onChange={(event) => setSecondaryWeakness(event.target.value)}>
                      {selectedWeaknessOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Duración
                    <select value={weeks} onChange={(event) => setWeeks(event.target.value)}>
                      <option value="1">1 semana</option>
                      <option value="2">2 semanas</option>
                      <option value="3">3 semanas</option>
                      <option value="4">4 semanas</option>
                      <option value="5">5 semanas</option>
                      <option value="6">6 semanas</option>
                    </select>
                  </label>

                  <label>
                    Densidad
                    <select value={density} onChange={(event) => setDensity(event.target.value)}>
                      <option value="baja">Baja</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                    </select>
                  </label>

                  <label>
                    Tono del bloque
                    <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                      <option value="controlado">Controlado</option>
                      <option value="agresivo">Agresivo</option>
                    </select>
                  </label>

                  <label>
                    Inicio del bloque
                    <input type="date" value={blockStartDate} onChange={(event) => setBlockStartDate(event.target.value)} />
                  </label>

                  <label>
                    Fase
                    <select value={blockPhase} onChange={(event) => setBlockPhase(event.target.value)}>
                      {phaseOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="planning-field-span-2">
                    Intención operativa
                    <textarea
                      value={blockIntent}
                      onChange={(event) => setBlockIntent(event.target.value)}
                      rows={3}
                      placeholder="Ej.: consolidar LT2 sin perder economía / resolver cadencia ineficiente / estabilizar CSS antes de apretar."
                    />
                  </label>

                  <label className="planning-field-span-2">
                    Notas del entrenador
                    <textarea
                      value={coachNotes}
                      onChange={(event) => setCoachNotes(event.target.value)}
                      rows={3}
                      placeholder="Observaciones prácticas, reglas internas, sesión ancla o criterio de corte."
                    />
                  </label>

                  {saveError ? <p className="error planning-field-span-2">{saveError}</p> : null}
                  {saveMessage ? <p className="planning-field-span-2">{saveMessage}</p> : null}
                  <button className="primary-button planning-field-span-2" type="button" onClick={saveFocusBlockFromPlanning} disabled={saving || !athleteId}>
                    {saving ? "Guardando..." : "Guardar como bloque activo"}
                  </button>
                </div>
              </div>

              <div className="planning-builder-preview">
                <div className="planning-template-browser">
                  <div className="section-heading compact">
                    <span className="eyebrow">Biblioteca</span>
                    <h3 className="section-title">Mesociclos disponibles</h3>
                  </div>
                  <div className="planning-template-strip">
                    {templateLibrary.map((template) => {
                      const isSelected = selectedTemplate?.template_id === template.template_id;
                      const matchesSystem = template.template_id === overview?.next_recommendation.template_id;
                      return (
                        <button
                          key={template.template_id}
                          type="button"
                          className={`planning-template-card ${isSelected ? "active" : ""}`}
                          onClick={() => {
                            setSelectedTemplateId(template.template_id);
                            setBlockIntent(template.summary);
                            setCoachNotes(template.control_points.join(" · "));
                          }}
                        >
                          <div className="planning-structure-row">
                            <span className="planning-kicker">{template.typical_structure}</span>
                            <button
                              type="button"
                              className="planning-info-dot"
                              title="Ver detalle del mesociclo"
                              aria-label="Ver detalle del mesociclo"
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedTemplateId((current) => (current === template.template_id ? null : template.template_id));
                              }}
                            >
                              ?
                            </button>
                          </div>
                          <strong>{template.public_label}</strong>
                          <p>{template.primary_focus}</p>
                          <small>{template.typical_duration_weeks_min}-{template.typical_duration_weeks_max} semanas</small>
                          {matchesSystem ? <span className="planning-template-match">encaje alto</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedTemplate ? (
                  <div className="planning-template-detail">
                    <div className="planning-template-detail-head">
                      <div>
                        <span className="planning-kicker">Bloque provisional elegido</span>
                        <strong>{selectedTemplate.public_label}</strong>
                        <p>{selectedTemplate.summary}</p>
                      </div>
                      {selectedTemplate.template_id === overview?.next_recommendation.template_id ? (
                        <span className="planning-tag">La lectura actual lo respalda</span>
                      ) : null}
                    </div>

                    <div className="planning-chip-row">
                      <span className="planning-chip">{selectedTemplate.primary_focus}</span>
                      <span className="planning-chip">{selectedTemplate.typical_structure}</span>
                      <span className="planning-chip">{selectedTemplate.typical_duration_weeks_min}-{selectedTemplate.typical_duration_weeks_max} semanas</span>
                      {selectedTemplate.secondary_focus ? <span className="planning-chip">{selectedTemplate.secondary_focus}</span> : null}
                    </div>

                    <div className="planning-template-columns">
                      <div>
                        <span className="planning-kicker">Lo elijo cuando</span>
                        <ul className="planning-note-list">
                          {selectedTemplate.entry_checks.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="planning-kicker">Qué vigilo dentro del bloque</span>
                        <ul className="planning-note-list">
                          {selectedTemplate.control_points.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="planning-kicker">Qué debe pasar al salir</span>
                        <ul className="planning-note-list">
                          {selectedTemplate.exit_checks.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="planning-template-rationale">
                      <article className="planning-mini-card">
                        <span className="eyebrow">Lo que veo en el CSV</span>
                        <p>{selectedTemplate.csv_rationale}</p>
                      </article>
                      <article className="planning-mini-card">
                        <span className="eyebrow">Soporte científico</span>
                        <p>{selectedTemplate.evidence_rationale}</p>
                      </article>
                    </div>
                  </div>
                ) : null}

                {selectedTemplate && expandedTemplateId === selectedTemplate.template_id ? (
                  <div className="planning-template-detail">
                    <div className="planning-template-detail-head">
                      <div>
                        <span className="planning-kicker">Interpretación del mesociclo</span>
                        <strong>{selectedTemplate.public_label}</strong>
                        <p>{structureHelpText(selectedTemplate.typical_structure)}</p>
                      </div>
                    </div>

                    <div className="planning-template-columns">
                      <div>
                        <span className="planning-kicker">Opciones dentro del bloque</span>
                        <ul className="planning-note-list">
                          {selectedTemplate.key_session_families.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="planning-kicker">Cómo lo modularías</span>
                        <ul className="planning-note-list">
                          {selectedTemplate.progression_rules.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="planning-kicker">Si quieres alargarlo</span>
                        <ul className="planning-note-list">
                          <li>No alargues la misma plantilla en línea recta sin releer al atleta.</li>
                          <li>Si pides 6 semanas para una plantilla de 3-4, úsala como fase 1 y encadena una fase 2.</li>
                          <li>Ejemplo: 3+1 de base y luego 2 semanas de continuación o transición hacia LT1/LT2.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="planning-guardrails">
                  <strong>Hipótesis del bloque</strong>
                  <div className="planning-chip-row">
                    <span className="planning-chip">{disciplineLabel(selectedDiscipline)}</span>
                    <span className="planning-chip">Limitante: {primaryWeakness}</span>
                    <span className="planning-chip">Soporte: {secondaryWeakness}</span>
                    <span className="planning-chip">{blockObjective}</span>
                    <span className="planning-chip">{weeks} semanas</span>
                    <span className="planning-chip">{density} densidad</span>
                  </div>
                  <ul className="planning-note-list">
                    {quickGuardrails.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                    {(overview?.next_recommendation.risk_flags ?? []).slice(0, 2).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {durationFeedback ? (
                    <article className={`planning-duration-note ${durationFeedback.tone}`}>
                      <strong>{durationFeedback.title}</strong>
                      <p>{durationFeedback.body}</p>
                    </article>
                  ) : null}
                </div>

                <div className="planning-microcycle">
                  {microcycle.map((week) => (
                    <article key={week.title} className={`planning-week-card ${week.tone}`}>
                      <span className="planning-kicker">{week.title}</span>
                      <strong>{week.load}</strong>
                      <p>{week.emphasis}</p>
                      <small>{week.notes}</small>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {overview?.mesocycle_draft && (
            <section className="card section-card planning-card planning-draft-section">
              <div className="section-heading compact">
                <span className="eyebrow">Propuesta generada</span>
                <h2 className="section-title">Borrador del bloque</h2>
                {overview.mesocycle_draft.state_summary && (
                  <p className="section-sub">{overview.mesocycle_draft.state_summary}</p>
                )}
              </div>
              <div className="planning-draft-grid">
                {overview.mesocycle_draft.weeks.map((week) => {
                  const weekClass =
                    week.load_type === "descarga" ? "recovery"
                    : week.load_type === "acumulación" ? "load"
                    : week.load_type === "especificidad" ? "specific"
                    : "build";
                  return (
                    <article key={week.week_index} className={`planning-draft-week ${weekClass}`}>
                      <header className="planning-draft-week-header">
                        <span className="planning-week-num">S{week.week_index}</span>
                        <span className="planning-week-theme">{week.theme}</span>
                        {(week.spacing_warnings?.length ?? 0) > 0 && (
                          <span className="planning-spacing-badge" title={week.spacing_warnings!.join(" · ")}>
                            ⚠ spacing
                          </span>
                        )}
                      </header>
                      <ul className="planning-draft-sessions">
                        {week.sessions.map((session) => {
                          const doseStep = session.payload?.dose_step_index as number | null | undefined;
                          return (
                            <li
                              key={session.session_id}
                              className={`planning-draft-session clickable role-${session.session_role}`}
                              onClick={() => openDraftWorkoutPreview(session)}
                            >
                              <span className="session-role-badge">
                                {SESSION_ROLE_LABEL[session.session_role] ?? session.session_role}
                              </span>
                              <div className="session-main">
                                <strong>{session.public_label}</strong>
                                {session.dose_prescription && (
                                  <span className="session-dose">{session.dose_prescription}</span>
                                )}
                                {doseStep != null && (
                                  <span className="session-step">peldaño {doseStep}</span>
                                )}
                                <small className="planning-threshold-note">
                                  {buildPlanningPrescriptionHint(session.objective, session.public_label, selectedDiscipline, planningLt1, planningLt2)}
                                </small>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      {week.control_points.length > 0 && (
                        <footer className="planning-draft-controls">
                          {week.control_points.slice(0, 2).map((cp) => (
                            <small key={cp}>· {cp}</small>
                          ))}
                        </footer>
                      )}
                    </article>
                  );
                })}
              </div>
              {overview.mesocycle_draft.progression_rules.length > 0 && (
                <div className="planning-draft-rules">
                  {overview.mesocycle_draft.progression_rules.map((rule) => (
                    <small key={rule}>→ {rule}</small>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {openWorkoutPreview && (
        <WorkoutPreviewModal
          template={openWorkoutPreview.template}
          selection={openWorkoutPreview.selection}
          onClose={() => setOpenWorkoutPreview(null)}
        />
      )}
    </div>
  );
}
