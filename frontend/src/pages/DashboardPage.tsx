import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { buildTargetObjective } from "../lib/targetCatalog";
import { ResolvedTrainingThreshold, resolveAnalysisDisciplineView, resolveTrainingThreshold } from "../lib/trainingThresholds";
import { Athlete, AthleteAnalysis, AthleteFocusBlockEvaluation, AthleteTarget, DisciplineView, SessionSummary } from "../types";

type DashboardPageProps = {
  athletes: Athlete[];
  token: string;
  viewerId: number;
};

type AthleteAnalysisMap = Record<number, AthleteAnalysis>;
type HomeTemplateId = "coach" | "thresholds" | "monitoring" | "attention";
type DashboardTone = "positive" | "warning" | "negative" | "neutral";

type HomeTemplate = {
  id: HomeTemplateId;
  title: string;
  description: string;
  insight: string;
};

type DashboardSummaryCard = {
  label: string;
  value: string;
  detail: string;
  tone: DashboardTone;
};

type DashboardAttentionItem = {
  label: string;
  detail: string;
  tone: DashboardTone;
};

type DashboardRow = {
  athlete: Athlete;
  analysis?: AthleteAnalysis;
  disciplines: string[];
  activeBlocks: NonNullable<Athlete["focus_blocks"]>;
  nextTarget: ReturnType<typeof nextTargetSummary>;
  latestSession: SessionSummary | null;
  latestSnapshotDate: string | null;
  averageConfidence: number | null;
  activeEvaluation: AthleteFocusBlockEvaluation | null;
  featuredComment: string | null;
  attentionItems: DashboardAttentionItem[];
};

const HOME_TEMPLATES: HomeTemplate[] = [
  {
    id: "coach",
    title: "Vista coach",
    description: "Panorámica rápida para entrar y detectar foco, objetivo y tendencia útil por atleta.",
    insight: "Ideal para abrir el día y ver qué atletas merecen seguimiento inmediato.",
  },
  {
    id: "thresholds",
    title: "Umbrales",
    description: "Muestra referencias LT1/LT2 y anclas de rendimiento para decidir ritmos, potencias y control de evolución.",
    insight: "Prioriza datos fisiológicos que un coach necesita antes de planificar o ajustar cargas.",
  },
  {
    id: "monitoring",
    title: "Seguimiento",
    description: "Resume operativa diaria: actividad reciente, bloque activo, estado de sincronización y snapshot disponible.",
    insight: "Pensada para control de cumplimiento cuando Strava ya forma parte del flujo por atleta.",
  },
  {
    id: "attention",
    title: "Atención",
    description: "Lista banderas de revisión: datos fríos, poca señal, bloque inestable o falta de conexión.",
    insight: "Sirve como bandeja de triage antes de entrar al detalle de cada atleta.",
  },
];

const DEFAULT_TEMPLATE_ID: HomeTemplateId = "coach";

function isTemplateId(value: string | null): value is HomeTemplateId {
  return HOME_TEMPLATES.some((template) => template.id === value);
}

function templateStorageKey(viewerId: number) {
  return `lactate-home-template:${viewerId}`;
}

function readStoredTemplate(viewerId: number): HomeTemplateId {
  if (typeof window === "undefined") return DEFAULT_TEMPLATE_ID;
  const stored = window.localStorage.getItem(templateStorageKey(viewerId));
  return isTemplateId(stored) ? stored : DEFAULT_TEMPLATE_ID;
}

function disciplineLabel(value: string) {
  if (value === "ciclismo") return "Ciclismo";
  if (value === "triatlón") return "Triatlón";
  if (value === "natación") return "Natación";
  return "Carrera a pie";
}

function formatDate(value?: string | null) {
  if (!value) return "n/d";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(value));
}

function daysUntil(targetDate?: string | null) {
  if (!targetDate) return null;
  const today = new Date();
  const target = new Date(targetDate);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / 86400000);
}

function nextTargetSummary(athlete: Athlete) {
  const targets = (athlete.targets ?? [])
    .filter((target) => target.target_date)
    .sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)));
  const upcoming = targets.find((target) => (daysUntil(target.target_date) ?? -1) >= 0) ?? targets[0];
  if (!upcoming) return null;
  const remaining = daysUntil(upcoming.target_date);
  return {
    label: buildTargetObjective({ category: upcoming.distance_category, distanceLabel: upcoming.distance_label, fallback: upcoming.objective || upcoming.discipline }),
    remaining,
  };
}

function formatConfidence(value?: number | null) {
  if (typeof value !== "number") return "n/d";
  return `${Math.round(value * 100)}%`;
}

function formatPace(value: number) {
  const rounded = Math.round(value);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}/km`;
}

function formatClock(value: number) {
  const rounded = Math.round(value);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function latestSession(sessions?: SessionSummary[]) {
  if (!sessions?.length) return null;
  const sorted = [...sessions].sort((a, b) => String(b.performed_at).localeCompare(String(a.performed_at)));
  return sorted[0] ?? null;
}

function daysFromToday(value?: string | null) {
  if (!value) return null;
  const today = new Date();
  const target = new Date(value);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - target.getTime();
  return Math.round(diffMs / 86400000);
}

function recencyLabel(value?: string | null) {
  const diff = daysFromToday(value);
  if (diff == null) return "Sin dato";
  if (diff <= 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return `Hace ${diff} d`;
}

function recencyTone(diff: number | null, staleAfter: number, dangerAfter: number): DashboardTone {
  if (diff == null) return "warning";
  if (diff <= staleAfter) return "positive";
  if (diff <= dangerAfter) return "warning";
  return "negative";
}

function averageConfidence(analysis?: AthleteAnalysis) {
  const values = analysis?.confidence_summary?.map((item) => item.score).filter((value) => typeof value === "number") ?? [];
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatThresholdAnchor(threshold: ResolvedTrainingThreshold | null, discipline: string) {
  if (!threshold) return "n/d";
  if (discipline === "ciclismo" && typeof threshold.powerWatts === "number") {
    return `${Math.round(threshold.powerWatts)} W`;
  }
  if (discipline === "natación" && typeof threshold.paceSecondsPerKm === "number") {
    return formatPace(threshold.paceSecondsPerKm / 10).replace("/km", "/100m");
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
  if (typeof threshold.lactate === "number") {
    return `${Math.round(threshold.lactate * 10) / 10} mmol/L`;
  }
  return "n/d";
}

function formatThresholdMeta(threshold: ResolvedTrainingThreshold | null) {
  if (!threshold) return "Sin referencia";
  const lactate = typeof threshold.lactate === "number" ? `${Math.round(threshold.lactate * 10) / 10} mmol/L` : "Lactato n/d";
  const confidence = threshold.confidence != null ? formatConfidence(threshold.confidence) : "n/d";
  return `${threshold.sourceLabel} · ${lactate} · ${confidence}`;
}

function firstSentence(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const match = normalized.match(/.+?[.!?](\s|$)/);
  return match ? match[0].trim() : normalized;
}

function buildAttentionItems({
  athlete,
  analysis,
  latestSession: lastSession,
  latestSnapshotDate,
  activeBlocks,
  averageConfidence: confidence,
}: {
  athlete: Athlete;
  analysis?: AthleteAnalysis;
  latestSession: SessionSummary | null;
  latestSnapshotDate: string | null;
  activeBlocks: NonNullable<Athlete["focus_blocks"]>;
  averageConfidence: number | null;
}) {
  const items: DashboardAttentionItem[] = [];
  const sessionAge = daysFromToday(lastSession?.performed_at);
  const snapshotAge = daysFromToday(latestSnapshotDate);
  const activeEvaluation = analysis?.active_focus_block?.evaluation ?? analysis?.focus_block_evaluations?.[0] ?? null;
  const thresholdSource = resolveAnalysisDisciplineView(analysis, athlete.primary_discipline) ?? analysis;
  const lt2 = resolveTrainingThreshold(thresholdSource, "LT2");

  if (!athlete.strava_connected) {
    items.push({
      label: "Strava pendiente",
      detail: "El atleta no tiene sincronización activa para contrastar plan con actividad real.",
      tone: "warning",
    });
  }
  if (sessionAge == null || sessionAge > 14) {
    items.push({
      label: "Poca actividad visible",
      detail: lastSession ? `La última sesión visible es del ${formatDate(lastSession.performed_at)}.` : "No hay sesiones recientes visibles en el análisis.",
      tone: sessionAge != null && sessionAge > 28 ? "negative" : "warning",
    });
  }
  if (snapshotAge == null || snapshotAge > 35) {
    items.push({
      label: "Snapshot frío",
      detail: latestSnapshotDate ? `La referencia fisiológica más reciente es del ${formatDate(latestSnapshotDate)}.` : "No hay snapshot fisiológico utilizable todavía.",
      tone: snapshotAge != null && snapshotAge > 60 ? "negative" : "warning",
    });
  }
  if (!activeBlocks.length) {
    items.push({
      label: "Sin bloque activo",
      detail: "No hay un foco actual marcado para contextualizar la revisión del atleta.",
      tone: "neutral",
    });
  }
  if (activeEvaluation?.direction === "negative" || (typeof activeEvaluation?.confidence === "number" && activeEvaluation.confidence < 0.6)) {
    items.push({
      label: "Bloque inestable",
      detail: activeEvaluation?.summary ?? "La evaluación del bloque activo necesita revisión manual.",
      tone: activeEvaluation?.direction === "negative" ? "negative" : "warning",
    });
  }
  if (confidence != null && confidence < 0.6) {
    items.push({
      label: "Confianza baja",
      detail: `El promedio de confianza visible está en ${formatConfidence(confidence)}.`,
      tone: "warning",
    });
  }
  if (!lt2) {
    items.push({
      label: "Referencia LT2 ausente",
      detail: "Falta una ancla clara de LT2 para el preview rápido del atleta.",
      tone: "warning",
    });
  }

  return items.slice(0, 4);
}

function templateSummary(rows: DashboardRow[], templateId: HomeTemplateId): DashboardSummaryCard[] {
  const stravaConnected = rows.filter((row) => row.athlete.strava_connected).length;
  const activeFocus = rows.filter((row) => row.activeBlocks.length > 0).length;
  const nearTargets = rows.filter((row) => row.nextTarget?.remaining != null && row.nextTarget.remaining >= 0 && row.nextTarget.remaining <= 14).length;
  const freshSessions = rows.filter((row) => {
    const diff = daysFromToday(row.latestSession?.performed_at);
    return diff != null && diff <= 7;
  }).length;
  const staleSnapshots = rows.filter((row) => {
    const diff = daysFromToday(row.latestSnapshotDate);
    return diff == null || diff > 35;
  }).length;
  const highConfidence = rows.filter((row) => row.averageConfidence != null && row.averageConfidence >= 0.7).length;
  const missingLt2 = rows.filter((row) => !resolveTrainingThreshold(resolveAnalysisDisciplineView(row.analysis, row.athlete.primary_discipline) ?? row.analysis, "LT2")).length;
  const urgent = rows.filter((row) => row.attentionItems.some((item) => item.tone === "negative" || item.tone === "warning")).length;

  if (templateId === "thresholds") {
    return [
      { label: "LT2 visible", value: `${rows.length - missingLt2}/${rows.length}`, detail: "Atletas con referencia LT2 usable en preview.", tone: missingLt2 ? "warning" : "positive" },
      { label: "Alta confianza", value: String(highConfidence), detail: "Promedio de confianza >= 70%.", tone: highConfidence ? "positive" : "neutral" },
      { label: "Snapshot reciente", value: String(rows.length - staleSnapshots), detail: "Referencias de 35 dias o menos.", tone: staleSnapshots ? "warning" : "positive" },
    ];
  }
  if (templateId === "monitoring") {
    return [
      { label: "Sesión <= 7d", value: String(freshSessions), detail: "Atletas con actividad reciente visible.", tone: freshSessions ? "positive" : "warning" },
      { label: "Strava conectado", value: String(stravaConnected), detail: "Perfiles listos para leer actividad real.", tone: stravaConnected ? "positive" : "warning" },
      { label: "Bloque activo", value: String(activeFocus), detail: "Atletas con foco actual definido.", tone: activeFocus ? "positive" : "neutral" },
      { label: "Objetivo cercano", value: String(nearTargets), detail: "Eventos o metas dentro de 14 dias.", tone: nearTargets ? "warning" : "neutral" },
    ];
  }
  if (templateId === "attention") {
    return [
      { label: "Revisión prioritaria", value: String(urgent), detail: "Atletas con al menos una bandera de atención.", tone: urgent ? "negative" : "positive" },
      { label: "Sin Strava", value: String(rows.length - stravaConnected), detail: "Perfiles aún sin sincronización.", tone: rows.length - stravaConnected ? "warning" : "positive" },
      { label: "Datos fríos", value: String(staleSnapshots), detail: "Snapshot ausente o con más de 35 dias.", tone: staleSnapshots ? "warning" : "positive" },
      { label: "Alta confianza", value: String(highConfidence), detail: "Casos con señal más estable para decidir rápido.", tone: highConfidence ? "positive" : "neutral" },
    ];
  }

  return [
    { label: "Atletas", value: String(rows.length), detail: "Equipo visible en el inicio.", tone: "neutral" },
    { label: "Snapshot reciente", value: String(rows.length - staleSnapshots), detail: "Referencias fisiológicas utilizables.", tone: staleSnapshots ? "warning" : "positive" },
    { label: "Objetivo <= 14d", value: String(nearTargets), detail: "Atletas que requieren seguimiento más cercano.", tone: nearTargets ? "warning" : "neutral" },
  ];
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

type GoalScenarioPoint = {
  label: "LT1" | "LT2";
  lactate: number;
  value: number;
};

type GoalScenarioPreview = {
  targetLabel: string;
  currentLabel: string;
  targetValueLabel: string;
  deltaLabel: string;
  tone: DashboardTone;
  reversed: boolean;
  actual: GoalScenarioPoint[];
  objective: GoalScenarioPoint[];
};

function parseRunningPaceLabel(label?: string | null) {
  if (!label) return null;
  const match = label.trim().match(/(\d{1,2}):(\d{2})(?:\s*\/?\s*(?:km|k))?$/i);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseSwimPaceLabel(label?: string | null) {
  if (!label) return null;
  const match = label.trim().match(/(\d{1,2}):(\d{2})(?:\s*\/?\s*(?:100m|100))?$/i);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseDistanceKm(label?: string | null) {
  if (!label) return null;
  const normalized = label.toLowerCase();
  if (normalized.includes("hm") || normalized.includes("media")) return 21.0975;
  if (normalized.includes("marat")) return 42.195;
  const kilometerMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*k/);
  if (kilometerMatch) {
    return Number(kilometerMatch[1].replace(",", "."));
  }
  const kmTextMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*km/);
  if (kmTextMatch) {
    return Number(kmTextMatch[1].replace(",", "."));
  }
  return null;
}

function parseSubTargetSeconds(objective?: string | null, context?: { distanceKm?: number | null; discipline?: string }) {
  if (!objective) return null;
  const normalized = objective.toLowerCase().replace(",", ".");
  const threePart = normalized.match(/sub\s*(\d{1,2})[:h](\d{2})[:m](\d{2})/i) || normalized.match(/sub\s*(\d{1,2}):(\d{2}):(\d{2})/i);
  if (threePart) {
    return Number(threePart[1]) * 3600 + Number(threePart[2]) * 60 + Number(threePart[3]);
  }

  const twoPart = normalized.match(/sub\s*(\d{1,3})[:h](\d{2})/i) || normalized.match(/sub\s*(\d{1,3}):(\d{2})/i);
  if (twoPart) {
    const first = Number(twoPart[1]);
    const second = Number(twoPart[2]);
    const shouldTreatAsHours =
      normalized.includes("h") ||
      context?.discipline === "triatlón" ||
      ((context?.distanceKm ?? 0) >= 21 && first <= 5);
    if (shouldTreatAsHours) {
      return first * 3600 + second * 60;
    }
    return first * 60 + second;
  }

  const hourOnly = normalized.match(/sub\s*(\d+(?:\.\d+)?)\s*h/);
  if (hourOnly) {
    return Math.round(Number(hourOnly[1]) * 3600);
  }

  const minuteOnly = normalized.match(/sub\s*(\d{1,3})(?!\d)/);
  if (minuteOnly) {
    return Number(minuteOnly[1]) * 60;
  }

  return null;
}

function extractFtpWatts(objective: string) {
  const normalized = objective.toLowerCase();
  const ftpMatch = normalized.match(/ftp\s*(\d{2,4})\s*w?/i);
  if (ftpMatch) return Number(ftpMatch[1]);
  return null;
}

function targetPriorityRank(priority?: string | null) {
  const normalized = (priority ?? "").toLowerCase();
  if (normalized.startsWith("a") || normalized.includes("alta")) return 0;
  if (normalized.startsWith("b") || normalized.includes("baja")) return 2;
  return 1;
}

function selectRelevantTarget(targets: AthleteTarget[], activeDiscipline: string) {
  const today = new Date().toISOString().slice(0, 10);
  const primaryPool = targets.filter((target) => target.discipline === activeDiscipline);
  const fallbackPool = activeDiscipline !== "triatlón" ? targets.filter((target) => target.discipline === "triatlón") : [];
  const pool = primaryPool.length ? primaryPool : fallbackPool;
  return (
    pool
      .slice()
      .sort((a, b) => {
        const aFuture = a.target_date >= today ? 0 : 1;
        const bFuture = b.target_date >= today ? 0 : 1;
        if (aFuture !== bFuture) return aFuture - bFuture;
        const priorityDiff = targetPriorityRank(a.priority_level) - targetPriorityRank(b.priority_level);
        if (priorityDiff !== 0) return priorityDiff;
        return a.target_date.localeCompare(b.target_date);
      })[0] ?? null
  );
}

function formatSwimPacePer100m(value: number) {
  const rounded = Math.round(value);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}/100m`;
}

function formatScenarioValue(value: number, discipline: string, athleteWeight?: number | null) {
  if (discipline === "ciclismo") {
    const watts = Math.round(value);
    const perKg = athleteWeight ? ` · ${(value / athleteWeight).toFixed(2)} W/kg` : "";
    return `${watts} W${perKg}`;
  }
  if (discipline === "natación") {
    return formatSwimPacePer100m(value);
  }
  return formatPace(value);
}

function formatScenarioGap(current?: number | null, target?: number | null, discipline?: string) {
  if (current == null || target == null) return "Sin referencia objetivo";
  if (discipline === "ciclismo") {
    const delta = Math.round(target - current);
    if (delta <= 0) return "Ya entra en el objetivo";
    return `Faltan ${delta} W`;
  }
  const delta = Math.round(current - target);
  if (delta <= 0) return "Ya entra en el objetivo";
  return `Faltan ${discipline === "natación" ? formatSwimPacePer100m(delta).replace("/100m", "/100") : formatClock(delta)}/${
    discipline === "natación" ? "100" : "km"
  }`;
}

function runningTargetLt2Factor(target: AthleteTarget) {
  const category = target.distance_category ?? "";
  if (category === "5k" || category === "sprint_tri") return 1.03;
  if (category === "10k" || category === "olympic_tri") return 1;
  if (category === "hm" || category === "half_tri") return 0.94;
  if (category === "marathon" || category === "ironman") return 0.89;
  return 0.96;
}

function runningTargetLt1Multiplier(target: AthleteTarget) {
  const category = target.distance_category ?? "";
  if (category === "marathon" || category === "ironman") return 1.15;
  if (category === "hm" || category === "half_tri") return 1.11;
  return 1.08;
}

function cyclingEnduranceFactor(target: AthleteTarget) {
  const category = target.distance_category ?? "";
  if (category === "ironman" || category === "ironman_bike") return 0.72;
  if (category === "half_tri" || category === "half_bike") return 0.82;
  if (category === "granfondo") return 0.8;
  return 0.86;
}

function buildGoalScenarioPreview(
  athlete: Athlete,
  discipline: string,
  view?: DisciplineView | AthleteAnalysis | null,
): GoalScenarioPreview | null {
  const lt1 = resolveTrainingThreshold(view, "LT1");
  const lt2 = resolveTrainingThreshold(view, "LT2");
  if (!lt1 && !lt2) return null;

  const actual: GoalScenarioPoint[] = [];
  if (discipline === "ciclismo") {
    if (typeof lt1?.powerWatts === "number") actual.push({ label: "LT1", lactate: lt1.lactate ?? 2, value: lt1.powerWatts });
    if (typeof lt2?.powerWatts === "number") actual.push({ label: "LT2", lactate: lt2.lactate ?? 4, value: lt2.powerWatts });
  } else if (discipline === "natación") {
    if (typeof lt1?.paceSecondsPerKm === "number") actual.push({ label: "LT1", lactate: lt1.lactate ?? 2, value: lt1.paceSecondsPerKm / 10 });
    if (typeof lt2?.paceSecondsPerKm === "number") actual.push({ label: "LT2", lactate: lt2.lactate ?? 4, value: lt2.paceSecondsPerKm / 10 });
  } else {
    if (typeof lt1?.paceSecondsPerKm === "number") actual.push({ label: "LT1", lactate: lt1.lactate ?? 2, value: lt1.paceSecondsPerKm });
    if (typeof lt2?.paceSecondsPerKm === "number") actual.push({ label: "LT2", lactate: lt2.lactate ?? 4, value: lt2.paceSecondsPerKm });
  }
  if (!actual.length) return null;

  const target = selectRelevantTarget(athlete.targets ?? [], discipline);
  if (!target) {
    return {
      targetLabel: "Sin objetivo con línea fisiológica",
      currentLabel: actual.find((point) => point.label === "LT2") ? formatScenarioValue(actual.find((point) => point.label === "LT2")!.value, discipline, athlete.weight) : "n/d",
      targetValueLabel: "Añade target",
      deltaLabel: "Sin referencia objetivo",
      tone: "neutral",
      reversed: discipline !== "ciclismo",
      actual,
      objective: [],
    };
  }

  const objective: GoalScenarioPoint[] = [];
  if (discipline === "ciclismo") {
    const targetLabel = buildTargetObjective({ category: target.distance_category, distanceLabel: target.distance_label, fallback: target.objective });
    const targetPower = target.discipline === "triatlón" ? target.target_cycling_power_watts ?? extractFtpWatts(targetLabel) : target.target_power_watts ?? extractFtpWatts(targetLabel);
    const targetLt2 = targetPower ? targetPower / 0.94 : null;
    const targetLt1 = targetPower ? targetPower * cyclingEnduranceFactor(target) : null;
    if (typeof targetLt1 === "number") objective.push({ label: "LT1", lactate: 2, value: targetLt1 });
    if (typeof targetLt2 === "number") objective.push({ label: "LT2", lactate: 4, value: targetLt2 });
  } else if (discipline === "natación") {
    const targetPace = target.discipline === "triatlón" ? parseSwimPaceLabel(target.target_swim_pace_label) : parseSwimPaceLabel(target.target_pace_label);
    if (typeof targetPace === "number") {
      objective.push({ label: "LT1", lactate: 2, value: targetPace * 1.08 });
      objective.push({ label: "LT2", lactate: 4, value: targetPace });
    }
  } else {
    const targetLabel = buildTargetObjective({ category: target.distance_category, distanceLabel: target.distance_label, fallback: target.objective });
    const distanceKm = parseDistanceKm(target.distance_label || targetLabel);
    const explicitTargetPace =
      target.discipline === "triatlón"
        ? parseRunningPaceLabel(target.target_running_pace_label)
        : parseRunningPaceLabel(target.target_pace_label);
    const derivedTargetSeconds =
      explicitTargetPace || !distanceKm
        ? null
        : parseSubTargetSeconds(target.objective || targetLabel, { distanceKm, discipline: target.discipline });
    const targetPace = explicitTargetPace ?? (derivedTargetSeconds && distanceKm ? derivedTargetSeconds / distanceKm : null);
    if (typeof targetPace === "number") {
      const targetLt2 = targetPace * runningTargetLt2Factor(target);
      objective.push({ label: "LT1", lactate: 2, value: targetLt2 * runningTargetLt1Multiplier(target) });
      objective.push({ label: "LT2", lactate: 4, value: targetLt2 });
    }
  }

  const currentLt2 = actual.find((point) => point.label === "LT2")?.value ?? actual[actual.length - 1]?.value ?? null;
  const objectiveLt2 = objective.find((point) => point.label === "LT2")?.value ?? null;
  const tone =
    currentLt2 == null || objectiveLt2 == null
      ? "neutral"
      : discipline === "ciclismo"
        ? currentLt2 >= objectiveLt2
          ? "positive"
          : objectiveLt2 - currentLt2 <= 15
            ? "warning"
            : "negative"
        : currentLt2 <= objectiveLt2
          ? "positive"
          : currentLt2 - objectiveLt2 <= (discipline === "natación" ? 3 : 8)
            ? "warning"
            : "negative";

  return {
    targetLabel: buildTargetObjective({ category: target.distance_category, distanceLabel: target.distance_label, fallback: target.objective }),
    currentLabel: currentLt2 != null ? formatScenarioValue(currentLt2, discipline, athlete.weight) : "n/d",
    targetValueLabel: objectiveLt2 != null ? formatScenarioValue(objectiveLt2, discipline, athlete.weight) : "Sin línea objetivo",
    deltaLabel: formatScenarioGap(currentLt2, objectiveLt2, discipline),
    tone,
    reversed: discipline !== "ciclismo",
    actual,
    objective,
  };
}

function scenarioPointX(value: number, minValue: number, maxValue: number, reversed: boolean) {
  if (maxValue <= minValue) return 120;
  const ratio = (value - minValue) / (maxValue - minValue);
  const usableRatio = reversed ? 1 - ratio : ratio;
  return 24 + usableRatio * 212;
}

function scenarioPointY(lactate: number) {
  const minLactate = 1.5;
  const maxLactate = 4.5;
  const ratio = (lactate - minLactate) / (maxLactate - minLactate);
  return 94 - ratio * 58;
}

function scenarioPolyline(points: GoalScenarioPoint[], minValue: number, maxValue: number, reversed: boolean) {
  return points
    .map((point) => `${scenarioPointX(point.value, minValue, maxValue, reversed)},${scenarioPointY(point.lactate)}`)
    .join(" ");
}

function GoalScenarioChart({
  preview,
}: {
  preview: GoalScenarioPreview;
}) {
  const allValues = [...preview.actual, ...preview.objective].map((point) => point.value);
  if (!allValues.length) {
    return <div className="lab-sparkline-empty">Sin línea fisiológica suficiente</div>;
  }

  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);

  return (
    <div className={`lab-goal-scenario ${preview.objective.length ? "has-target" : "no-target"} ${preview.tone}`}>
      <div className="lab-goal-scenario-meta">
        <span>{preview.targetLabel}</span>
        <strong>{preview.objective.length ? preview.deltaLabel : "Falta objetivo específico"}</strong>
      </div>
      <svg viewBox="0 0 260 110" className="lab-goal-scenario-chart" aria-hidden="true">
        <line x1="22" y1="94" x2="238" y2="94" className="lab-goal-axis" />
        <line x1="22" y1="36" x2="238" y2="36" className="lab-goal-axis subtle" />
        <text x="8" y="97" className="lab-goal-axis-label">2.0</text>
        <text x="8" y="39" className="lab-goal-axis-label">4.0</text>
        {preview.objective.length >= 2 ? (
          <polyline points={scenarioPolyline(preview.objective, minValue, maxValue, preview.reversed)} className="lab-goal-line objective" />
        ) : null}
        {preview.actual.length >= 2 ? (
          <polyline points={scenarioPolyline(preview.actual, minValue, maxValue, preview.reversed)} className="lab-goal-line actual" />
        ) : null}
        {preview.objective.map((point) => (
          <g key={`objective-${point.label}`}>
            <circle
              cx={scenarioPointX(point.value, minValue, maxValue, preview.reversed)}
              cy={scenarioPointY(point.lactate)}
              r="4"
              className="lab-goal-dot objective"
            />
          </g>
        ))}
        {preview.actual.map((point) => (
          <g key={`actual-${point.label}`}>
            <circle
              cx={scenarioPointX(point.value, minValue, maxValue, preview.reversed)}
              cy={scenarioPointY(point.lactate)}
              r="4.5"
              className="lab-goal-dot actual"
            />
            <text
              x={scenarioPointX(point.value, minValue, maxValue, preview.reversed)}
              y={scenarioPointY(point.lactate) - 8}
              textAnchor="middle"
              className="lab-goal-point-label"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="lab-goal-scenario-footer">
        <div>
          <small>Actual LT2</small>
          <strong>{preview.currentLabel}</strong>
        </div>
        <div>
          <small>Objetivo LT2</small>
          <strong>{preview.targetValueLabel}</strong>
        </div>
      </div>
    </div>
  );
}

function ThresholdSnapshot({
  discipline,
  view,
  latestSnapshotDate,
}: {
  discipline: string;
  view?: DisciplineView | AthleteAnalysis | null;
  latestSnapshotDate?: string | null;
}) {
  const lt1 = resolveTrainingThreshold(view, "LT1");
  const lt2 = resolveTrainingThreshold(view, "LT2");

  return (
    <article className="lab-template-card">
      <header className="lab-template-card-head">
        <div>
          <strong>{disciplineLabel(discipline)}</strong>
          <span>{latestSnapshotDate ? `Snapshot ${formatDate(latestSnapshotDate)}` : "Sin snapshot"}</span>
        </div>
      </header>
      <div className="lab-threshold-grid">
        <div className="lab-threshold-metric">
          <small>LT1</small>
          <strong>{formatThresholdAnchor(lt1, discipline)}</strong>
          <span>{formatThresholdMeta(lt1)}</span>
        </div>
        <div className="lab-threshold-metric">
          <small>LT2</small>
          <strong>{formatThresholdAnchor(lt2, discipline)}</strong>
          <span>{formatThresholdMeta(lt2)}</span>
        </div>
      </div>
    </article>
  );
}

function MonitoringSnapshot({
  athlete,
  analysis,
  latestSession,
  latestSnapshotDate,
  activeEvaluation,
  featuredComment,
}: Pick<DashboardRow, "athlete" | "analysis" | "latestSession" | "latestSnapshotDate" | "activeEvaluation" | "featuredComment">) {
  const sessionAge = daysFromToday(latestSession?.performed_at);
  const snapshotAge = daysFromToday(latestSnapshotDate);

  return (
    <div className="lab-template-grid monitoring">
      <article className="lab-template-card">
        <header className="lab-template-card-head">
          <div>
            <strong>Actividad visible</strong>
            <span>{latestSession ? `${disciplineLabel(latestSession.discipline)} · ${formatDate(latestSession.performed_at)}` : "Sin actividad reciente"}</span>
          </div>
        </header>
        <div className="lab-monitoring-values">
          <div>
            <small>Última sesión</small>
            <strong>{recencyLabel(latestSession?.performed_at)}</strong>
          </div>
          <div>
            <small>Sesiones visibles</small>
            <strong>{analysis?.recent_sessions?.length ?? 0}</strong>
          </div>
          <div>
            <small>Snapshot</small>
            <strong>{latestSnapshotDate ? recencyLabel(latestSnapshotDate) : "Sin snapshot"}</strong>
          </div>
        </div>
      </article>

      <article className="lab-template-card">
        <header className="lab-template-card-head">
          <div>
            <strong>Bloque y lectura</strong>
            <span>{activeEvaluation?.key_metric ?? "Sin evaluación activa"}</span>
          </div>
        </header>
        <p className="lab-template-copy">
          {firstSentence(activeEvaluation?.summary) ?? firstSentence(activeEvaluation?.recommendation) ?? "Todavía no hay evaluación operativa del bloque activo."}
        </p>
        <div className="lab-template-inline-meta">
          <span className={`lab-inline-pill ${activeEvaluation?.direction === "negative" ? "negative" : activeEvaluation?.direction === "positive" ? "positive" : "neutral"}`}>
            {activeEvaluation?.direction === "negative" ? "Riesgo" : activeEvaluation?.direction === "positive" ? "Progresando" : "Estable"}
          </span>
          <span className="lab-inline-pill neutral">Confianza {formatConfidence(activeEvaluation?.confidence)}</span>
        </div>
      </article>

      <article className="lab-template-card">
        <header className="lab-template-card-head">
          <div>
            <strong>Sincronización</strong>
            <span>{athlete.strava_connected ? "Actividad real disponible" : "Pendiente de conectar"}</span>
          </div>
        </header>
        <p className="lab-template-copy">
          {athlete.strava_connected
            ? "Este perfil ya puede cruzar actividad real de Strava con contexto fisiológico y bloque actual."
            : "Conviene activar Strava para comparar cumplimiento, densidad y realidad de carga con el plan."}
        </p>
        <div className="lab-template-inline-meta">
          <span className={`lab-inline-pill ${athlete.strava_connected ? "positive" : "warning"}`}>
            {athlete.strava_connected ? "Conectado" : "Sin conectar"}
          </span>
          <span className={`lab-inline-pill ${recencyTone(sessionAge, 7, 21)}`}>Sesión {recencyLabel(latestSession?.performed_at)}</span>
          <span className={`lab-inline-pill ${recencyTone(snapshotAge, 21, 45)}`}>Snapshot {recencyLabel(latestSnapshotDate)}</span>
        </div>
        {featuredComment ? <small className="lab-template-note">{featuredComment}</small> : null}
      </article>
    </div>
  );
}

function AttentionSnapshot({ items }: { items: DashboardAttentionItem[] }) {
  if (!items.length) {
    return (
      <div className="lab-template-grid">
        <article className="lab-template-card">
          <header className="lab-template-card-head">
            <div>
              <strong>Sin alertas prioritarias</strong>
              <span>La señal visible es suficiente para una revisión tranquila.</span>
            </div>
          </header>
        </article>
      </div>
    );
  }

  return (
    <div className="lab-template-grid attention">
      {items.map((item) => (
        <article key={`${item.label}-${item.detail}`} className={`lab-template-card attention ${item.tone}`}>
          <header className="lab-template-card-head">
            <div>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>
          </header>
        </article>
      ))}
    </div>
  );
}

function DisciplineMiniTrend({
  athlete,
  discipline,
  view,
}: {
  athlete: Athlete;
  discipline: string;
  view?: DisciplineView | AthleteAnalysis | null;
}) {
  const preview = buildGoalScenarioPreview(athlete, discipline, view);

  return (
    <div className="lab-discipline-trend">
      <div className="lab-discipline-head">
        <strong>{disciplineLabel(discipline)}</strong>
        <span>Línea de lactato</span>
      </div>
      {preview ? <GoalScenarioChart preview={preview} /> : <div className="lab-sparkline-empty">Sin línea fisiológica suficiente</div>}
    </div>
  );
}

export function DashboardPage({ athletes, token, viewerId }: DashboardPageProps) {
  const [analysisMap, setAnalysisMap] = useState<AthleteAnalysisMap>({});
  const [selectedTemplateId, setSelectedTemplateId] = useState<HomeTemplateId>(() => readStoredTemplate(viewerId));
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const templateMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalyses() {
      const entries = await Promise.all(
        athletes.map(async (athlete) => {
          try {
            const analysis = (await api.athleteAnalysis(token, athlete.id)) as AthleteAnalysis;
            return [athlete.id, analysis] as const;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;
      const nextMap: AthleteAnalysisMap = {};
      entries.forEach((entry) => {
        if (!entry) return;
        nextMap[entry[0]] = entry[1];
      });
      setAnalysisMap(nextMap);
    }

    if (athletes.length) {
      loadAnalyses();
    } else {
      setAnalysisMap({});
    }

    return () => {
      cancelled = true;
    };
  }, [athletes, token]);

  useEffect(() => {
    setSelectedTemplateId(readStoredTemplate(viewerId));
  }, [viewerId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(templateStorageKey(viewerId), selectedTemplateId);
  }, [selectedTemplateId, viewerId]);

  useEffect(() => {
    if (!isTemplateMenuOpen) return undefined;

    function handleOutsideClick(event: MouseEvent) {
      if (!templateMenuRef.current?.contains(event.target as Node)) {
        setIsTemplateMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isTemplateMenuOpen]);

  const rows = useMemo(
    () =>
      [...athletes]
        .sort((left, right) => {
          const leftPriority = left.name.trim().toLowerCase() === "chim" ? 0 : 1;
          const rightPriority = right.name.trim().toLowerCase() === "chim" ? 0 : 1;
          if (leftPriority !== rightPriority) return leftPriority - rightPriority;
          return left.name.localeCompare(right.name);
        })
        .map((athlete) => {
          const analysis = analysisMap[athlete.id];
          const disciplines =
            athlete.primary_discipline === "triatlón" ? ["natación", "ciclismo", "running"] : [athlete.primary_discipline];
          const activeBlocks = athlete.focus_blocks?.filter((block) => block.status === "active") ?? [];
          const nextTarget = nextTargetSummary(athlete);
          const currentLatestSession = latestSession(analysis?.recent_sessions);
          const latestSnapshotDate = analysis?.latest_snapshot_date ?? null;
          const averageVisibleConfidence = averageConfidence(analysis);
          const activeEvaluation = analysis?.active_focus_block?.evaluation ?? analysis?.focus_block_evaluations?.[0] ?? null;
          const featuredComment =
            firstSentence(analysis?.automated_comments?.[0]) ??
            firstSentence(analysis?.interpretation?.[0]) ??
            firstSentence(activeEvaluation?.recommendation) ??
            null;

          return {
            athlete,
            analysis,
            disciplines,
            activeBlocks,
            nextTarget,
            latestSession: currentLatestSession,
            latestSnapshotDate,
            averageConfidence: averageVisibleConfidence,
            activeEvaluation,
            featuredComment,
            attentionItems: buildAttentionItems({
              athlete,
              analysis,
              latestSession: currentLatestSession,
              latestSnapshotDate,
              activeBlocks,
              averageConfidence: averageVisibleConfidence,
            }),
          } satisfies DashboardRow;
        }),
    [analysisMap, athletes],
  );

  const selectedTemplate = HOME_TEMPLATES.find((template) => template.id === selectedTemplateId) ?? HOME_TEMPLATES[0];
  const summaryCards = useMemo(() => templateSummary(rows, selectedTemplateId), [rows, selectedTemplateId]);

  return (
    <div className="page-grid lab-dashboard-page">
      <section className="card lab-athlete-list-card lab-dashboard-shell">
        <div className="card-header lab-home-header lab-dashboard-hero">
          <div className="lab-dashboard-head-copy">
            <span className="eyebrow">Inicio</span>
            <h2>Vista previa</h2>
          </div>
          <div className="lab-template-picker" ref={templateMenuRef}>
            <button type="button" className="lab-template-trigger" onClick={() => setIsTemplateMenuOpen((current) => !current)}>
              <EyeIcon />
              <span>{selectedTemplate.title}</span>
            </button>
            {isTemplateMenuOpen ? (
              <div className="lab-template-menu">
                {HOME_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`lab-template-option ${template.id === selectedTemplateId ? "active" : ""}`}
                    onClick={() => {
                      setSelectedTemplateId(template.id);
                      setIsTemplateMenuOpen(false);
                    }}
                  >
                    <strong>{template.title}</strong>
                    <span>{template.description}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="lab-summary-strip lab-dashboard-summary">
          {summaryCards.map((card) => (
            <article key={card.label} className={`lab-summary-card lab-dashboard-summary-card ${card.tone}`}>
              <div className="lab-summary-copy">
                <span>{card.label}</span>
                <small>{card.detail}</small>
              </div>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>

        <div className="lab-athlete-list">
          {rows.map(({ athlete, analysis, disciplines, activeBlocks, nextTarget, latestSession, latestSnapshotDate, averageConfidence, activeEvaluation, featuredComment, attentionItems }) => (
            <article key={athlete.id} className="lab-athlete-row lab-dashboard-row">
              <div className="lab-athlete-meta lab-dashboard-meta">
                <div className="lab-athlete-identity">
                  <strong>{athlete.name}</strong>
                  <p>{disciplineLabel(athlete.primary_discipline)}</p>
                  {nextTarget ? (
                    <p className="lab-athlete-deadline">
                      {nextTarget.remaining == null
                        ? "Objetivo sin fecha"
                        : nextTarget.remaining < 0
                          ? `${Math.abs(nextTarget.remaining)} días desde el objetivo`
                          : `${nextTarget.remaining} días para ${nextTarget.label}`}
                    </p>
                  ) : (
                    <p className="lab-athlete-deadline">Sin objetivo próximo</p>
                  )}
                </div>
                <div className="lab-athlete-status-strip">
                  <span className={`lab-inline-pill ${recencyTone(daysFromToday(latestSession?.performed_at), 7, 21)}`}>
                    Sesión {recencyLabel(latestSession?.performed_at)}
                  </span>
                  <span className={`lab-inline-pill ${recencyTone(daysFromToday(latestSnapshotDate), 21, 45)}`}>
                    Snapshot {recencyLabel(latestSnapshotDate)}
                  </span>
                  <span className={`lab-inline-pill ${averageConfidence != null && averageConfidence >= 0.7 ? "positive" : averageConfidence != null ? "warning" : "neutral"}`}>
                    Confianza {formatConfidence(averageConfidence)}
                  </span>
                </div>
                <div className="chip-list lab-dashboard-focuses">
                  {(activeBlocks.length ? activeBlocks : [{ block_objective: "Sin foco", priority_discipline: athlete.primary_discipline } as never]).map((block, index) => (
                    <span key={`${athlete.id}-${index}`} className={`status-badge ${activeBlocks.length ? "medium" : "neutral"}`}>
                      {block.block_objective} · {disciplineLabel(block.priority_discipline ?? athlete.primary_discipline)}
                    </span>
                  ))}
                </div>
                <Link className="inline-link lab-dashboard-link" to={`/athletes/${athlete.id}`}>
                  Abrir atleta
                </Link>
              </div>

              {selectedTemplateId === "coach" ? (
                <div className={`lab-athlete-trends ${disciplines.length > 1 ? "triathlon" : ""}`}>
                  {disciplines.map((discipline) => {
                    return (
                      <DisciplineMiniTrend
                        key={`${athlete.id}-${discipline}`}
                        athlete={athlete}
                        discipline={discipline}
                        view={analysis?.discipline_views?.[discipline] ?? analysis}
                      />
                    );
                  })}
                </div>
              ) : null}

              {selectedTemplateId === "thresholds" ? (
                <div className={`lab-template-grid ${disciplines.length > 1 ? "triathlon" : ""}`}>
                  {disciplines.map((discipline) => (
                    <ThresholdSnapshot
                      key={`${athlete.id}-${discipline}`}
                      discipline={discipline}
                      view={analysis?.discipline_views?.[discipline] ?? analysis}
                      latestSnapshotDate={analysis?.discipline_views?.[discipline]?.latest_snapshot_date ?? latestSnapshotDate}
                    />
                  ))}
                </div>
              ) : null}

              {selectedTemplateId === "monitoring" ? (
                <MonitoringSnapshot
                  athlete={athlete}
                  analysis={analysis}
                  latestSession={latestSession}
                  latestSnapshotDate={latestSnapshotDate}
                  activeEvaluation={activeEvaluation}
                  featuredComment={featuredComment}
                />
              ) : null}

              {selectedTemplateId === "attention" ? <AttentionSnapshot items={attentionItems} /> : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
