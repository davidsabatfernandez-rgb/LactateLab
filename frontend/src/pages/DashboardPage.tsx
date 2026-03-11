import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

import { api } from "../lib/api";
import { ResolvedTrainingThreshold, resolveAnalysisDisciplineView, resolveTrainingThreshold } from "../lib/trainingThresholds";
import { Athlete, AthleteAnalysis, AthleteFocusBlockEvaluation, DisciplineView, HistoricalPoint, SessionSummary } from "../types";

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
    label: upcoming.objective || upcoming.distance_label || upcoming.discipline,
    remaining,
  };
}

function objectiveMetricKey(objective?: string | null) {
  if (!objective) return "LT1";
  const normalized = objective.toLowerCase();
  if (normalized.includes("lt2")) return "LT2";
  if (normalized.includes("vo2")) return "VO2max";
  if (normalized.includes("peak")) return "peak_power";
  if (normalized.includes("base") || normalized.includes("recuper") || normalized.includes("readapt") || normalized.includes("estabilidad")) {
    return "LT1";
  }
  return "LT1";
}

function metricLabel(metricKey: string) {
  if (metricKey === "LT2") return "LT2";
  if (metricKey === "VO2max") return "VO2max";
  if (metricKey === "peak_power") return "Peak";
  return "LT1";
}

function formatConfidence(value?: number | null) {
  if (typeof value !== "number") return "n/d";
  return `${Math.round(value * 100)}%`;
}

function formatPace(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}/km`;
}

function formatMetricValue(point?: HistoricalPoint | null, discipline?: string) {
  if (!point || typeof point.value !== "number") return "n/d";
  if (discipline === "ciclismo") {
    return `${Math.round(point.value)} ${point.unit}`;
  }
  if ((discipline === "running" || discipline === "triatlón") && point.unit === "s/km") {
    const minutes = Math.floor(point.value / 60);
    const seconds = Math.round(point.value % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}/km`;
  }
  return `${Math.round(point.value * 10) / 10} ${point.unit}`;
}

function latestPoint(points?: HistoricalPoint[]) {
  if (!points?.length) return null;
  const sorted = [...points].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return sorted[sorted.length - 1] ?? null;
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

function seriesDelta(points?: HistoricalPoint[]) {
  if (!points || points.length < 2) return null;
  const sorted = [...points].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (typeof first.value !== "number" || typeof last.value !== "number") return null;
  return last.value - first.value;
}

function normalizeSeries(points?: HistoricalPoint[]) {
  if (!points?.length) return [];
  return [...points]
    .filter((point) => typeof point.value === "number")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((point, index) => ({
      index,
      date: point.date,
      value: point.value as number,
      label: point.label,
      unit: point.unit,
    }));
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
      { label: "Strava activo", value: String(stravaConnected), detail: "Útil para contrastar umbral con realidad de entrenamiento.", tone: stravaConnected ? "positive" : "warning" },
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
    { label: "Strava activo", value: String(stravaConnected), detail: "Con actividad real vinculada.", tone: stravaConnected ? "positive" : "warning" },
    { label: "Foco activo", value: String(activeFocus), detail: "Bloques que ya tienen contexto de trabajo.", tone: activeFocus ? "positive" : "neutral" },
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

function AthleteSparkline({
  points,
  color,
}: {
  points: Array<{ index: number; date: string; value: number; label: string; unit: string }>;
  color: string;
}) {
  if (!points.length) {
    return <div className="lab-sparkline-empty">Sin histórico suficiente</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={92}>
      <LineChart data={points} margin={{ top: 12, right: 6, left: 0, bottom: 0 }}>
        <Tooltip
          formatter={(value: number, _name, payload) => [`${Math.round(value * 10) / 10} ${payload?.payload?.unit ?? ""}`, payload?.payload?.label ?? ""]}
          labelFormatter={(label) => `Muestra ${Number(label) + 1}`}
        />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={3} dot={false} />
      </LineChart>
    </ResponsiveContainer>
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
  discipline,
  analysis,
  blockObjective,
}: {
  discipline: string;
  analysis?: AthleteAnalysis;
  blockObjective?: string | null;
}) {
  const view = analysis?.discipline_views?.[discipline];
  const metricKey = objectiveMetricKey(blockObjective);
  const rawPoints = metricKey === "VO2max" ? view?.historical_evolution?.VO2max ?? [] : view?.historical_evolution?.[metricKey] ?? [];
  const points = normalizeSeries(rawPoints);
  const latest = latestPoint(rawPoints);
  const delta = seriesDelta(rawPoints);
  const toneClass = delta == null ? "neutral" : delta >= 0 ? "positive" : "negative";
  const color = toneClass === "positive" ? "#257a4d" : toneClass === "negative" ? "#8d2e0f" : "#6d7a7f";

  return (
    <div className="lab-discipline-trend">
      <div className="lab-discipline-head">
        <strong>{disciplineLabel(discipline)}</strong>
        <span>{metricLabel(metricKey)}</span>
      </div>
      <AthleteSparkline points={points} color={color} />
      <div className="lab-discipline-foot">
        <span>{formatMetricValue(latest, discipline)}</span>
        <span className={`lab-delta ${toneClass}`}>
          {delta == null ? "Sin delta" : `${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10}`}
        </span>
      </div>
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
    <div className="page-grid">
      <section className="card lab-athlete-list-card lab-dashboard-shell">
        <div className="card-header lab-home-header lab-dashboard-hero">
          <div className="lab-dashboard-head-copy">
            <span className="eyebrow">Inicio</span>
            <h2>Vista previa del equipo</h2>
            <p>{selectedTemplate.description}</p>
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

        <div className="lab-home-note lab-dashboard-note">{selectedTemplate.insight}</div>

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
                  <span className={`lab-inline-pill ${athlete.strava_connected ? "positive" : "warning"}`}>
                    Strava {athlete.strava_connected ? "activo" : "pendiente"}
                  </span>
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
                    const matchingBlock =
                      activeBlocks.find((block) => (block.priority_discipline || athlete.primary_discipline) === discipline) ??
                      activeBlocks[0];
                    return (
                      <DisciplineMiniTrend
                        key={`${athlete.id}-${discipline}`}
                        discipline={discipline}
                        analysis={analysis}
                        blockObjective={matchingBlock?.block_objective}
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
