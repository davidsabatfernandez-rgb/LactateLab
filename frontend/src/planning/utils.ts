import type { Athlete, AthleteAnalysis, AthleteFocusBlockEvaluation, AthleteTarget, DynamicReference, SessionSummary } from "../types";
import { resolveAnalysisDisciplineView, resolveTrainingThreshold } from "../lib/trainingThresholds";
import type { CalendarEntry, CalendarMonthRow, CalendarWeekDisciplineMetric, CalendarWeekLoadProfile, CalendarWeekSnapshot, PlanTone, PlanningCalendarSource, SummaryQuickBar, CalendarWorkspaceTab } from "./types";

// ── Date helpers ──

export function parseDateValue(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  return new Date(value);
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isoDateFromToday(offsetDays = 0) {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() + offsetDays);
  return formatDateKey(value);
}

export function addDays(isoDate: string, days: number) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return isoDate;
  value.setDate(value.getDate() + days);
  return formatDateKey(value);
}

export function addMonths(isoDate: string, months: number) {
  const value = parseDateValue(isoDate);
  if (Number.isNaN(value.getTime())) return isoDate;
  value.setDate(1);
  value.setMonth(value.getMonth() + months);
  return formatDateKey(value);
}

export function dateValue(isoDate?: string | null) {
  if (!isoDate) return Number.NaN;
  const value = parseDateValue(isoDate);
  return value.getTime();
}

export function startOfMonth(isoDate: string) {
  const value = parseDateValue(isoDate);
  value.setDate(1);
  return formatDateKey(value);
}

export function startOfWeek(isoDate: string) {
  const value = parseDateValue(isoDate);
  const dayOfWeek = value.getDay();
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  value.setDate(value.getDate() + offset);
  return formatDateKey(value);
}

export function daysInMonth(isoDate: string) {
  const value = parseDateValue(isoDate);
  return new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
}

export function weekdayOffset(isoDate: string) {
  const value = parseDateValue(isoDate);
  const day = value.getDay();
  return day === 0 ? 6 : day - 1;
}

export function diffCalendarMonths(start: string, end: string) {
  const startDate = parseDateValue(start);
  const endDate = parseDateValue(end);
  return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
}

export function overlapsRange(start: string, end: string, rangeStart: string, rangeEnd: string) {
  return dateValue(start) <= dateValue(rangeEnd) && dateValue(end) >= dateValue(rangeStart);
}

// ── Formatting helpers ──

export function disciplineLabel(value?: string | null) {
  if (value === "running") return "Carrera a pie";
  if (value === "ciclismo") return "Ciclismo";
  if (value === "natación") return "Natación";
  if (value === "triatlón") return "Triatlón";
  return value || "Disciplina";
}

export function planningPublishStatusMeta(value?: string | null) {
  if (value === "ready") {
    return { label: "Ready", tone: "positive" as const, description: "Estructura canónica lista para enviar." };
  }
  if (value === "sent") {
    return { label: "Sent", tone: "positive" as const, description: "Workout ya publicado en un proveedor externo." };
  }
  if (value === "needs_republish") {
    return { label: "Republish", tone: "warning" as const, description: "Los umbrales han cambiado. Re-publica para actualizar targets en Garmin." };
  }
  if (value === "failed") {
    return { label: "Failed", tone: "negative" as const, description: "Falló la preparación o publicación del workout." };
  }
  return { label: "Draft", tone: "neutral" as const, description: "Todavía no hay una estructura lista para publicar." };
}

export function planningDisciplineAccent(value?: string | null) {
  if (value === "running") return "#22c55e";
  if (value === "ciclismo") return "#f59e0b";
  if (value === "natación") return "#0ea5e9";
  return "#8a98a8";
}

export function normalizeDisciplineKey(value?: string | null) {
  if (!value) return "running";
  if (value === "triatlón") return "running";
  if (value === "carrera" || value === "carrera a pie") return "running";
  return value;
}

export function firstName(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return "";
  return normalized.split(/\s+/)[0] ?? normalized;
}

export function formatTargetChipDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = parseDateValue(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export function formatTargetCountdown(value?: string | null) {
  if (!value) return "Sin fecha objetivo";
  const target = parseDateValue(value);
  if (Number.isNaN(target.getTime())) return "Fecha no válida";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "Objetivo pasado";
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Mañana";
  const weeks = Math.floor(diffDays / 7);
  const days = diffDays % 7;
  if (weeks <= 0) return `${diffDays} días`;
  if (days === 0) return `${weeks} sem`;
  return `${weeks} sem · ${days} días`;
}

export function targetMetricLabel(target: AthleteTarget) {
  const runningPace = target.target_running_pace_label || target.target_pace_label;
  const swimPace = target.target_swim_pace_label;
  const cyclingWatts = target.target_cycling_power_watts || target.target_power_watts;

  if (target.discipline === "ciclismo" && typeof cyclingWatts === "number") {
    return `${Math.round(cyclingWatts)} W objetivo`;
  }
  if (target.discipline === "natación" && swimPace) {
    return `Ritmo objetivo ${swimPace}`;
  }
  if (runningPace) {
    return `Ritmo objetivo ${runningPace}`;
  }
  if (typeof cyclingWatts === "number") {
    return `${Math.round(cyclingWatts)} W objetivo`;
  }
  return "Sin métrica objetivo";
}

export function targetPrimaryValue(target: AthleteTarget) {
  return target.objective || target.distance_label || "Objetivo";
}

export function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = parseDateValue(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatShortDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = parseDateValue(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export function parseCalendarWorkspaceTab(value: string | null): CalendarWorkspaceTab {
  const valid: CalendarWorkspaceTab[] = ["athletes", "library", "summary", "zones", "workouts", "plans"];
  if (valid.includes(value as CalendarWorkspaceTab)) return value as CalendarWorkspaceTab;
  return "calendar";
}

export function progressTone(direction?: string | null): PlanTone {
  const normalized = direction?.toLowerCase() ?? "";
  if (normalized.includes("mejor") || normalized.includes("posit") || normalized.includes("up") || normalized.includes("good")) {
    return "positive";
  }
  if (normalized.includes("peor") || normalized.includes("negat") || normalized.includes("down") || normalized.includes("fatiga") || normalized.includes("risk")) {
    return "warning";
  }
  return "neutral";
}

export function progressDirectionLabel(direction?: string | null) {
  const normalized = direction?.toLowerCase() ?? "";
  if (normalized.includes("mejor") || normalized.includes("posit") || normalized.includes("up") || normalized.includes("good")) {
    return "Mejorando";
  }
  if (normalized.includes("peor") || normalized.includes("negat") || normalized.includes("down") || normalized.includes("fatiga") || normalized.includes("risk")) {
    return "Vigilar";
  }
  return "Estable";
}

export function averageConfidenceLabel(analysis?: AthleteAnalysis | null) {
  const scores = analysis?.confidence_summary?.map((item) => item.score).filter((value) => Number.isFinite(value)) ?? [];
  if (!scores.length) return "Sin señal";
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return `${Math.round(average * 100)}%`;
}

export function normalizeConfidenceScore(score?: number | null) {
  if (typeof score !== "number" || Number.isNaN(score)) return 0;
  if (score > 1) return Math.max(0, Math.min(score / 100, 1));
  return Math.max(0, Math.min(score, 1));
}

export function shortConfidenceLabel(label?: string | null) {
  const normalized = label?.trim();
  if (!normalized) return "SIG";
  return normalized.split(/\s+/).slice(0, 1).join("").slice(0, 3).toUpperCase();
}

export function shortMetricLabel(metric?: string | null) {
  const normalized = metric?.trim().toLowerCase() ?? "";
  if (normalized.includes("lt1")) return "LT1";
  if (normalized.includes("lt2")) return "LT2";
  if (normalized.includes("lact")) return "LAC";
  if (normalized.includes("dur")) return "DUR";
  if (normalized.includes("ftp")) return "FTP";
  if (normalized.includes("css")) return "CSS";
  return (metric || "MET").slice(0, 3).toUpperCase();
}

export function toneFromScore(score: number): PlanTone {
  if (score >= 0.72) return "positive";
  if (score <= 0.42) return "warning";
  return "neutral";
}

export function focusTone(direction?: string | null): PlanTone {
  if (direction === "mejora" || direction === "positivo" || direction === "up") return "positive";
  if (direction === "empeora" || direction === "negativo" || direction === "down") return "warning";
  return "neutral";
}

export function objectiveFamily(value?: string | null): string {
  if (!value) return "general";
  const lower = value.toLowerCase();
  if (lower.includes("lt1") || lower.includes("aeróbi")) return "lt1";
  if (lower.includes("lt2") || lower.includes("umbral")) return "lt2";
  if (lower.includes("vo2") || lower.includes("potencia")) return "vo2";
  return "general";
}

export function dayNameShort(isoDate: string) {
  const value = parseDateValue(isoDate);
  return value.toLocaleDateString("es-ES", { weekday: "short" }).toUpperCase().slice(0, 3);
}

export function monthDayLabel(isoDate: string) {
  const value = parseDateValue(isoDate);
  return `${value.getDate()}`;
}

export function monthLabel(isoDate: string) {
  const value = parseDateValue(isoDate);
  return value.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

export function monthHeading(isoDate: string) {
  const value = parseDateValue(isoDate);
  return value.toLocaleDateString("es-ES", { month: "long", year: "numeric" }).replace(/^\w/, (c) => c.toUpperCase());
}

export function weekHeading(startIsoDate: string, endIsoDate: string) {
  const start = parseDateValue(startIsoDate);
  const end = parseDateValue(endIsoDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Semana";
  }

  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} ${start.toLocaleDateString("es-ES", { month: "short" })}`;
  }
  return `${start.getDate()} ${start.toLocaleDateString("es-ES", { month: "short" })} – ${end.getDate()} ${end.toLocaleDateString("es-ES", { month: "short" })}`;
}

export function compactPlanningSourceTitle(source: PlanningCalendarSource) {
  if (source.kind === "draft") return source.title;
  if (source.kind === "planned") {
    return source.energySystemFocus ? `${source.energySystemFocus} · ${source.objective}` : source.title;
  }
  return source.title;
}

export function describePlanningSource(source: PlanningCalendarSource) {
  const parts: string[] = [];
  if (source.energySystemFocus) parts.push(`Foco: ${source.energySystemFocus}`);
  if (source.phase) parts.push(`Fase: ${source.phase}`);
  if (source.density) parts.push(`Densidad: ${source.density}`);
  parts.push(`${formatDate(source.startDate)} → ${formatDate(source.endDate)}`);
  parts.push(`Disciplina: ${disciplineLabel(source.discipline)}`);
  if (source.intent) parts.push(source.intent);
  return {
    title: compactPlanningSourceTitle(source),
    summary: source.intent || source.objective || "Sin intención definida.",
    details: parts,
  };
}

// ── Threshold formatting ──
// These functions use ReturnType<typeof resolveTrainingThreshold> which is ResolvedTrainingThreshold | null.

export function formatPace(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "n/d";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}/km`;
}

export function formatSwimPace(secondsPerKm?: number | null) {
  if (typeof secondsPerKm !== "number" || !Number.isFinite(secondsPerKm)) return "n/d";
  return formatPace(secondsPerKm / 10).replace("/km", "/100m");
}

export function formatThresholdPrimaryMetric(
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

export function formatDynamicReferencePrimaryMetric(reference: DynamicReference | null | undefined, discipline: string) {
  if (!reference) return "Sin referencia";
  if (discipline === "ciclismo" && typeof reference.estimated_power_watts === "number") {
    return `${Math.round(reference.estimated_power_watts)} W`;
  }
  if (discipline === "natación" && typeof reference.estimated_pace_seconds_per_km === "number") {
    return formatSwimPace(reference.estimated_pace_seconds_per_km);
  }
  if (typeof reference.estimated_pace_seconds_per_km === "number") {
    return formatPace(reference.estimated_pace_seconds_per_km);
  }
  if (typeof reference.estimated_power_watts === "number") {
    return `${Math.round(reference.estimated_power_watts)} W`;
  }
  if (typeof reference.estimated_hr_at_target === "number") {
    return `${Math.round(reference.estimated_hr_at_target)} bpm`;
  }
  return "Sin referencia";
}

export function formatThresholdSecondaryMetric(
  threshold: ReturnType<typeof resolveTrainingThreshold>,
  discipline: string,
) {
  if (!threshold) return "Sin referencia visible";
  const details = [threshold.sourceLabel];
  const primaryMetric = formatThresholdPrimaryMetric(threshold, discipline);
  if (typeof threshold.heartRate === "number" && !primaryMetric.includes("bpm")) {
    details.unshift(`${Math.round(threshold.heartRate)} bpm`);
  }
  return details.join(" · ");
}

export function formatThresholdQuickRows(
  source: AthleteAnalysis | ReturnType<typeof resolveAnalysisDisciplineView> | null | undefined,
  discipline: string,
) {
  const lt1 = resolveTrainingThreshold(source, "LT1");
  const lt2 = resolveTrainingThreshold(source, "LT2");

  return {
    lt1Label: formatThresholdPrimaryMetric(lt1, discipline),
    lt1Hint: formatThresholdSecondaryMetric(lt1, discipline),
    lt2Label: formatThresholdPrimaryMetric(lt2, discipline),
    lt2Hint: formatThresholdSecondaryMetric(lt2, discipline),
  };
}

export function formatThresholdCoachLine(
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

export function formatThresholdRange(
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

export function planningThresholdOpinion(
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

export function buildPlanningPrescriptionHint(
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

// ── Roster / Confidence bar helpers ──

export function buildRecentLoadBars(sessions?: SessionSummary[] | null): SummaryQuickBar[] {
  const today = isoDateFromToday();
  const labels = ["L", "M", "X", "J", "V", "S", "D"];
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const counts = new Map<string, number>();

  (sessions ?? []).forEach((session) => {
    const key = formatDateKey(parseDateValue(session.performed_at));
    if (!days.includes(key)) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const maxCount = Math.max(1, ...days.map((day) => counts.get(day) ?? 0));
  return days.map((day) => {
    const parsed = parseDateValue(day);
    const weekday = parsed.getDay();
    const label = labels[weekday === 0 ? 6 : weekday - 1] ?? "·";
    const count = counts.get(day) ?? 0;
    return {
      label,
      value: count / maxCount,
      tone: count >= maxCount && count > 0 ? "positive" : count === 0 ? "neutral" : "warning",
    };
  });
}

export function buildConfidenceBars(analysis?: AthleteAnalysis | null): SummaryQuickBar[] {
  const items = analysis?.confidence_summary ?? [];
  if (!items.length) {
    return [{ label: "SIG", value: 0.1, tone: "neutral" }];
  }
  return items.slice(0, 5).map((item) => {
    const score = normalizeConfidenceScore(item.score);
    return {
      label: shortConfidenceLabel(item.label),
      value: Math.max(0.08, score),
      tone: toneFromScore(score),
    };
  });
}

export function formatBlockMetricQuickview(evaluation?: AthleteFocusBlockEvaluation | null) {
  if (!evaluation) {
    return {
      label: "Sin métrica activa",
      hint: "Todavía no hay una lectura comparativa del bloque.",
    };
  }

  const delta = evaluation.delta_relative ?? evaluation.delta;
  const unit = evaluation.relative_unit ?? evaluation.unit ?? "";
  const deltaLabel = typeof delta === "number"
    ? `${delta > 0 ? "+" : ""}${delta.toFixed(Math.abs(delta) >= 10 ? 0 : 1)} ${unit}`.trim()
    : "sin delta";

  return {
    label: shortMetricLabel(evaluation.key_metric),
    hint: `${deltaLabel} · ${evaluation.recommendation || evaluation.summary}`,
  };
}

export function nextTargetLabelFromAthlete(athlete: Athlete) {
  const nextTarget = (athlete.targets ?? [])
    .filter((target) => target.target_date)
    .sort((left, right) => String(left.target_date).localeCompare(String(right.target_date)))[0];
  if (!nextTarget) return "Sin objetivo";
  return `${nextTarget.objective || nextTarget.distance_label || "Objetivo"} · ${formatTargetChipDate(nextTarget.target_date)}`;
}

export function formatMinutesCompact(totalMinutes: number) {
  if (!totalMinutes) return "0h";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatDistanceCompact(distanceMeters?: number | null) {
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return "n/d";
  }
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(distanceMeters >= 10000 ? 0 : 1)} km`;
  }
  return `${Math.round(distanceMeters)} m`;
}

export function estimateMinutesFromDose(dose?: string | null) {
  if (!dose) return 0;
  // Normalize Unicode multiplication sign to ASCII "x" so regex match uniformly.
  // Strip sprint intervals in seconds (e.g. "4x20''") before minute parsing —
  // they're noise for a minutes total (80s ≈ 1.3 min, ignored on purpose).
  const normalized = dose
    .replace(/×/g, "x")
    .replace(/\d+\s*x\s*\d+\s*''/gi, "")
    .replace(/\d+\s*''/g, "");
  const rangeRepeat = normalized.match(/(\d+)\s*x\s*(\d+)\s*-\s*(\d+)\s*'(?!')/i);
  if (rangeRepeat) {
    return Number(rangeRepeat[1]) * Math.round((Number(rangeRepeat[2]) + Number(rangeRepeat[3])) / 2);
  }
  const repeat = normalized.match(/(\d+)\s*x\s*(\d+)\s*'(?!')/i);
  if (repeat) {
    return Number(repeat[1]) * Number(repeat[2]);
  }
  const range = normalized.match(/(\d+)\s*-\s*(\d+)\s*'(?!')/);
  if (range) {
    return Math.round((Number(range[1]) + Number(range[2])) / 2);
  }
  const single = normalized.match(/(\d+)\s*'(?!')/);
  if (single) {
    return Number(single[1]);
  }
  // Fallback: parse km-based doses (e.g., "3x2km", "7km E") using ~5 min/km
  // as a conservative estimate for running. Better than 0 min in totals.
  const kmRepeat = normalized.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*km/i);
  if (kmRepeat) {
    return Math.round(Number(kmRepeat[1]) * Number(kmRepeat[2]) * 5);
  }
  const kmSingle = normalized.match(/(\d+(?:\.\d+)?)\s*km/i);
  if (kmSingle) {
    return Math.round(Number(kmSingle[1]) * 5);
  }
  return 0;
}

// ── Calendar week computations ──

function averageThresholdPaceSeconds(
  left?: number | null,
  right?: number | null,
) {
  if (typeof left === "number" && typeof right === "number") return (left + right) / 2;
  if (typeof left === "number") return left;
  if (typeof right === "number") return right;
  return null;
}

function estimatedPaceForCalendarSession(
  session: CalendarEntry,
  lt1: ReturnType<typeof resolveTrainingThreshold>,
  lt2: ReturnType<typeof resolveTrainingThreshold>,
) {
  const family = objectiveFamily(`${session.sessionType} ${session.objective} ${session.title}`);
  if (family === "lt2" || family === "vo2") {
    return lt2?.paceSecondsPerKm ?? lt1?.paceSecondsPerKm ?? null;
  }
  return averageThresholdPaceSeconds(lt1?.paceSecondsPerKm, lt2?.paceSecondsPerKm) ?? lt1?.paceSecondsPerKm ?? lt2?.paceSecondsPerKm ?? null;
}

function parseDistanceMetersFromText(text?: string | null) {
  if (!text) return null;
  const normalized = text.toLowerCase().replace(/,/g, ".");
  const patterns: Array<{ regex: RegExp; resolve: (match: RegExpMatchArray) => number }> = [
    {
      regex: /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*km\b/i,
      resolve: (match) => Number(match[1]) * ((Number(match[2]) + Number(match[3])) / 2) * 1000,
    },
    {
      regex: /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*km\b/i,
      resolve: (match) => Number(match[1]) * Number(match[2]) * 1000,
    },
    {
      regex: /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*km\b/i,
      resolve: (match) => ((Number(match[1]) + Number(match[2])) / 2) * 1000,
    },
    {
      regex: /(\d+(?:\.\d+)?)\s*km\b/i,
      resolve: (match) => Number(match[1]) * 1000,
    },
    {
      regex: /(\d+)\s*x\s*(\d+)\s*-\s*(\d+)\s*m\b/i,
      resolve: (match) => Number(match[1]) * ((Number(match[2]) + Number(match[3])) / 2),
    },
    {
      regex: /(\d+)\s*x\s*(\d+)\s*m\b/i,
      resolve: (match) => Number(match[1]) * Number(match[2]),
    },
    {
      regex: /(\d+)\s*-\s*(\d+)\s*m\b/i,
      resolve: (match) => (Number(match[1]) + Number(match[2])) / 2,
    },
    {
      regex: /(\d+)\s*m\b/i,
      resolve: (match) => Number(match[1]),
    },
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (!match) continue;
    return pattern.resolve(match);
  }

  return null;
}

function estimateCalendarSessionDistanceMeters(
  session: CalendarEntry,
  thresholdSource: ReturnType<typeof resolveAnalysisDisciplineView> | AthleteAnalysis | null,
) {
  const explicitDistance = parseDistanceMetersFromText(session.dose || session.title || session.objective);
  if (typeof explicitDistance === "number" && Number.isFinite(explicitDistance) && explicitDistance > 0) {
    return { distanceMeters: explicitDistance, estimated: true };
  }

  const discipline = normalizeDisciplineKey(session.layerDiscipline || session.discipline);
  if (discipline !== "running" && discipline !== "natación") {
    return { distanceMeters: null, estimated: false };
  }

  const minutes = session.estimatedMinutes ?? estimateMinutesFromDose(session.dose);
  if (!minutes) {
    return { distanceMeters: null, estimated: false };
  }

  const lt1 = resolveTrainingThreshold(thresholdSource, "LT1");
  const lt2 = resolveTrainingThreshold(thresholdSource, "LT2");
  const paceSecondsPerKm = estimatedPaceForCalendarSession(session, lt1, lt2);
  if (typeof paceSecondsPerKm !== "number" || !Number.isFinite(paceSecondsPerKm) || paceSecondsPerKm <= 0) {
    return { distanceMeters: null, estimated: false };
  }

  return {
    distanceMeters: (minutes * 60 / paceSecondsPerKm) * 1000,
    estimated: true,
  };
}

export function calendarWeekLoadProfile(totalMinutes: number, keySessions: number, totalSessions: number): CalendarWeekLoadProfile {
  if (!totalSessions) {
    return {
      label: "Semana vacía",
      tone: "neutral",
      hint: "Sin sesiones visibles todavía.",
      intensityPct: 0,
    };
  }
  if (totalMinutes >= 420 || keySessions >= 3) {
    return {
      label: "Carga alta",
      tone: "warning",
      hint: "Semana densa: conviene vigilar recuperación y orden de estímulos.",
      intensityPct: 100,
    };
  }
  if (totalMinutes >= 240 || keySessions >= 2) {
    return {
      label: "Construcción",
      tone: "positive",
      hint: "Carga útil para mover el bloque sin perder comparabilidad.",
      intensityPct: Math.max(48, Math.min(88, (totalMinutes / 420) * 100)),
    };
  }
  return {
    label: "Carga ligera",
    tone: "neutral",
    hint: "Semana de soporte, técnica o asimilación.",
    intensityPct: Math.max(18, Math.min(44, (totalMinutes / 420) * 100)),
  };
}

export function buildCalendarWeekSnapshot(
  entries: CalendarEntry[],
  athleteAnalysis: AthleteAnalysis | null,
  selectedDiscipline: string,
): CalendarWeekSnapshot {
  const buckets = new Map<string, CalendarWeekDisciplineMetric>();
  const dayMinutes = new Map<string, number>();
  let totalMinutes = 0;
  let totalSessions = 0;
  let keySessions = 0;
  let supportSessions = 0;
  let recoverySessions = 0;

  entries.forEach((session) => {
    const discipline = normalizeDisciplineKey(session.layerDiscipline || session.discipline);
    const current = buckets.get(discipline) ?? {
      discipline,
      minutes: 0,
      distanceMeters: null,
      distanceEstimated: false,
      sessions: 0,
    };
    const minutes = session.estimatedMinutes ?? estimateMinutesFromDose(session.dose);
    const thresholdSource = resolveAnalysisDisciplineView(athleteAnalysis, discipline)
      ?? (discipline === normalizeDisciplineKey(selectedDiscipline) ? athleteAnalysis : null);
    const distance = estimateCalendarSessionDistanceMeters(session, thresholdSource);
    const sessionType = (session.sessionType || "").toLowerCase();

    totalMinutes += minutes;
    totalSessions += 1;
    if (sessionType.includes("clave") || sessionType.includes("test")) {
      keySessions += 1;
    } else if (sessionType.includes("recuper")) {
      recoverySessions += 1;
    } else {
      supportSessions += 1;
    }

    dayMinutes.set(session.date, (dayMinutes.get(session.date) ?? 0) + minutes);

    current.minutes += minutes;
    current.sessions += 1;
    if (typeof distance.distanceMeters === "number" && Number.isFinite(distance.distanceMeters)) {
      current.distanceMeters = (current.distanceMeters ?? 0) + distance.distanceMeters;
      current.distanceEstimated = current.distanceEstimated || distance.estimated;
    }
    buckets.set(discipline, current);
  });

  const disciplineMetrics = Array.from(buckets.values()).sort((left, right) => right.minutes - left.minutes);
  const peakDayEntry = Array.from(dayMinutes.entries()).sort((left, right) => right[1] - left[1])[0] ?? null;
  const totalDistance = disciplineMetrics.reduce<number | null>((sum, metric) => {
    if (typeof metric.distanceMeters !== "number" || !Number.isFinite(metric.distanceMeters)) return sum;
    return (sum ?? 0) + metric.distanceMeters;
  }, null);

  return {
    totalMinutes,
    totalSessions,
    keySessions,
    supportSessions,
    recoverySessions,
    disciplineMetrics,
    primaryDiscipline: disciplineMetrics[0]?.discipline ?? null,
    peakDay: peakDayEntry ? { date: peakDayEntry[0], minutes: peakDayEntry[1] } : null,
    totalDistanceMeters: totalDistance,
    loadProfile: calendarWeekLoadProfile(totalMinutes, keySessions, totalSessions),
  };
}

// ── Calendar month grid computation ──

export function buildCalendarMonthCells(monthStart: string) {
  const total = daysInMonth(monthStart);
  const offset = weekdayOffset(monthStart);
  const cells: Array<{ id: string; date: string | null }> = [];
  for (let i = 0; i < offset; i++) {
    cells.push({ id: `spacer-before-${i}`, date: null });
  }
  for (let i = 1; i <= total; i++) {
    cells.push({ id: `${monthStart}-${i}`, date: addDays(monthStart, i - 1) });
  }
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < remaining; i++) {
    cells.push({ id: `spacer-after-${i}`, date: null });
  }
  return cells;
}

export function buildCalendarMonthRows(
  monthStart: string,
  sessionsByDate: Map<string, CalendarEntry[]>,
  analysis: AthleteAnalysis | null | undefined,
  discipline: string,
): CalendarMonthRow[] {
  const cells = buildCalendarMonthCells(monthStart);
  const rows: CalendarMonthRow[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const weekCells = cells.slice(i, i + 7);
    const inMonthDays = weekCells.filter((cell) => cell.date != null).length;
    const firstDate = weekCells.find((cell) => cell.date != null)?.date;
    const lastDate = weekCells.filter((cell) => cell.date != null).pop()?.date;
    const weekStart = firstDate ? startOfWeek(firstDate) : monthStart;
    const weekEnd = lastDate ?? addDays(weekStart, 6);
    const weekEntries = weekCells.flatMap((cell) => (cell.date ? sessionsByDate.get(cell.date) ?? [] : []));
    const snapshot = buildCalendarWeekSnapshot(weekEntries, analysis ?? null, discipline);
    rows.push({
      weekStart,
      weekEnd,
      cells: weekCells,
      inMonthDays,
      snapshot,
    });
  }
  return rows;
}

// Re-export for convenience
export { resolveAnalysisDisciplineView, resolveTrainingThreshold };
