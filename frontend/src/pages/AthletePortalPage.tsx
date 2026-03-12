import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "../lib/api";
import { buildTargetObjective } from "../lib/targetCatalog";
import { ResolvedTrainingThreshold, resolveTrainingThreshold } from "../lib/trainingThresholds";
import { AthleteAnalysis, AthleteHealthMetric, AthleteHealthOverview, AuthUser, CurvePoint, DisciplineView, Estimate, GarminActivity, GarminActivitiesPreviewResponse, HistoricalPoint, SessionSummary } from "../types";

type AthletePortalPageProps = {
  user: AuthUser | null;
  token: string;
};

type DisciplineSnapshot = {
  discipline: string;
  view: DisciplineView;
  lt1?: ResolvedTrainingThreshold | null;
  lt2?: ResolvedTrainingThreshold | null;
  estimate?: Estimate;
  weeklySessions: number;
  monthlySessions: number;
  latestSession?: SessionSummary;
  trend: Array<{ date: string; value: number | null }>;
};

type PortalCurvePoint = {
  id: string;
  label: string;
  sessionDate?: string | null;
  load: number;
  lactate: number;
  adjusted: number;
  powerSource?: string | null;
};

type PortalStatusTone = "surging" | "steady" | "building";

type PortalStatus = {
  tone: PortalStatusTone;
  label: string;
  headline: string;
  summary: string;
  emphasis: string;
};

type GarminFieldRow = {
  key: string;
  label: string;
  value: string;
};

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSecondsToClock(totalSeconds?: number | null) {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds)) return "n/d";
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatPace(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "n/d";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}/km`;
}

function formatSwimPace(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "n/d";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}/100m`;
}

function formatTarget(estimate: Estimate) {
  if (estimate.estimate_type === "FTP") {
    return `${Math.round(estimate.value)} W`;
  }
  if (estimate.unit === "s/km") {
    return formatPace(estimate.value);
  }
  return `${estimate.value.toFixed(1)} ${estimate.unit}`;
}

function formatEstimateValue(estimate?: Estimate | null) {
  if (!estimate) return "n/d";
  if (estimate.estimate_type === "FTP") {
    return `${Math.round(estimate.value)} W`;
  }
  if (estimate.unit === "s/km") {
    return formatPace(estimate.value);
  }
  return `${Math.round(estimate.value * 10) / 10} ${estimate.unit}`;
}

function estimateTypeClassName(type?: string | null) {
  const normalized = (type ?? "").toLowerCase();
  if (normalized === "10k") return "ten-k";
  if (normalized === "hm") return "half-marathon";
  if (normalized === "maratón" || normalized === "maraton") return "marathon";
  return normalized.replace(/[^a-z0-9]+/g, "-") || "generic";
}

function formatCyclingTarget(targetPowerWatts?: number | null, athleteWeight?: number | null) {
  if (typeof targetPowerWatts !== "number" || !Number.isFinite(targetPowerWatts)) return "n/d";
  if (typeof athleteWeight === "number" && athleteWeight > 0) {
    return `${Math.round(targetPowerWatts)} W · ${(targetPowerWatts / athleteWeight).toFixed(2)} W/kg`;
  }
  return `${Math.round(targetPowerWatts)} W`;
}

function formatLactateValue(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  return `${value.toFixed(1)} mmol/L`;
}

function formatDistanceKm(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "0 km";
  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} km`;
}

function formatSteps(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  return value.toLocaleString("es-ES");
}

function formatMinutes(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  return `${Math.round(value)} min`;
}

function formatNumericMetric(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  return `${Math.round(value)}`;
}

function parseMetricNumber(value?: string | null) {
  if (!value) return null;
  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function recoveryHeadline(score?: number | null) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "Lectura rápida de recuperación";
  if (score >= 82) return "Recuperación premium";
  if (score >= 70) return "Buena base de recuperación";
  if (score >= 55) return "Recuperación aceptable";
  return "Noche mejorable";
}

function recoveryTone(score?: number | null) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "neutral";
  if (score >= 82) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function formatGarminFieldValue(value: unknown) {
  if (value == null) return "n/d";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === "object") return `${Object.keys(value as Record<string, unknown>).length} campos`;
  return String(value);
}

function humanizeGarminFieldKey(key: string) {
  return key
    .replace(/\./g, " / ")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function flattenGarminObject(value: unknown, prefix = "", rows: GarminFieldRow[] = [], limit = 120): GarminFieldRow[] {
  if (rows.length >= limit) return rows;
  if (value == null || typeof value !== "object") {
    if (prefix) {
      rows.push({ key: prefix, label: humanizeGarminFieldKey(prefix), value: formatGarminFieldValue(value) });
    }
    return rows;
  }

  if (Array.isArray(value)) {
    if (prefix) {
      rows.push({ key: prefix, label: humanizeGarminFieldKey(prefix), value: `${value.length} items` });
    }
    value.slice(0, 4).forEach((item, index) => {
      flattenGarminObject(item, prefix ? `${prefix}[${index}]` : `[${index}]`, rows, limit);
    });
    return rows;
  }

  Object.entries(value).forEach(([key, nested]) => {
    if (rows.length >= limit) return;
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (nested != null && typeof nested === "object") {
      if (Array.isArray(nested)) {
        rows.push({ key: nextKey, label: humanizeGarminFieldKey(nextKey), value: `${nested.length} items` });
        nested.slice(0, 3).forEach((item, index) => {
          flattenGarminObject(item, `${nextKey}[${index}]`, rows, limit);
        });
      } else {
        rows.push({
          key: nextKey,
          label: humanizeGarminFieldKey(nextKey),
          value: `${Object.keys(nested as Record<string, unknown>).length} campos`,
        });
        flattenGarminObject(nested, nextKey, rows, limit);
      }
    } else {
      rows.push({ key: nextKey, label: humanizeGarminFieldKey(nextKey), value: formatGarminFieldValue(nested) });
    }
  });

  return rows;
}

function sportToneClass(sportType: string) {
  const normalized = sportType.toLowerCase();
  if (normalized.includes("run")) return "run";
  if (normalized.includes("cycl") || normalized.includes("bike")) return "ride";
  if (normalized.includes("swim")) return "swim";
  if (normalized.includes("strength") || normalized.includes("yoga")) return "strength";
  return "other";
}

function sportLabel(sportType: string) {
  const normalized = sportType.toLowerCase();
  if (normalized === "running") return "Running";
  if (normalized === "lap_swimming") return "Pool Swim";
  return humanizeGarminFieldKey(sportType);
}

function daysUntil(date?: string | null) {
  if (!date) return null;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function disciplineOrder(discipline: string) {
  if (discipline === "natación") return 0;
  if (discipline === "ciclismo") return 1;
  if (discipline === "running") return 2;
  return 3;
}

function formatTrendValue(value?: number | null, discipline?: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  if (discipline === "ciclismo") return `${Math.round(value)} W`;
  if (discipline === "natación") return formatSwimPace(value / 10);
  return formatPace(value);
}

function buildDisciplineTrend(view?: DisciplineView | null, discipline?: string) {
  if (!view) return [];
  const preferredMetric =
    discipline === "ciclismo"
      ? view.historical_evolution?.LT2_power_watts ?? view.historical_evolution?.LT1_power_watts ?? []
      : view.historical_evolution?.LT2_pace_seconds_per_km ?? view.historical_evolution?.LT1_pace_seconds_per_km ?? [];
  return preferredMetric.slice(-8).map((point) => ({
    date: formatDate(point.date),
    value: point.value ?? null,
    label: point.label,
  }));
}

function getPrimaryEstimate(view?: DisciplineView | null, type?: string) {
  return view?.estimates?.find((estimate) => estimate.estimate_type === type);
}

function disciplineLabel(discipline: string) {
  if (discipline === "running") return "Carrera a pie";
  if (discipline === "ciclismo") return "Ciclismo";
  if (discipline === "natación") return "Natación";
  if (discipline === "triatlón") return "Triatlón";
  return discipline;
}

function disciplineAccent(discipline: string) {
  if (discipline === "natación") return "#2563eb";
  if (discipline === "ciclismo") return "#157f66";
  if (discipline === "running") return "#d26a36";
  return "#16353d";
}

function renderThresholdValue(threshold?: ResolvedTrainingThreshold | null, discipline?: string) {
  if (!threshold) return "n/d";
  if (discipline === "ciclismo" && typeof threshold.powerWatts === "number") {
    return `${Math.round(threshold.powerWatts)} W`;
  }
  if (discipline === "natación" && typeof threshold.paceSecondsPerKm === "number") {
    return formatSwimPace(threshold.paceSecondsPerKm / 10);
  }
  if (typeof threshold.paceSecondsPerKm === "number") {
    return formatPace(threshold.paceSecondsPerKm);
  }
  if (typeof threshold.powerWatts === "number") {
    return `${Math.round(threshold.powerWatts)} W`;
  }
  return "n/d";
}

function countSessionsWithinDays(sessions: SessionSummary[], days: number) {
  const cutoff = Date.now() - days * 86400000;
  return sessions.filter((session) => new Date(session.performed_at).getTime() >= cutoff).length;
}

function buildDisciplineLactateSeries(view?: DisciplineView | null) {
  if (!view) return [];
  const lt1Points = view.historical_evolution?.LT1 ?? [];
  const lt2Points = view.historical_evolution?.LT2 ?? [];
  const peakPoints = view.historical_evolution?.peak_lactate ?? [];
  const byDate = new Map<string, { date: string; label: string; lt1?: number | null; lt2?: number | null; vlamaxProxy?: number | null }>();

  lt1Points.forEach((point) => {
    const current = byDate.get(point.date);
    byDate.set(point.date, {
      date: point.date,
      label: formatDate(point.date),
      lt1: point.value ?? null,
      lt2: current?.lt2 ?? null,
      vlamaxProxy: current?.vlamaxProxy ?? null,
    });
  });

  lt2Points.forEach((point) => {
    const current = byDate.get(point.date);
    byDate.set(point.date, {
      date: point.date,
      label: formatDate(point.date),
      lt1: current?.lt1 ?? null,
      lt2: point.value ?? null,
      vlamaxProxy: current?.vlamaxProxy ?? null,
    });
  });

  peakPoints.forEach((point) => {
    const current = byDate.get(point.date);
    byDate.set(point.date, {
      date: point.date,
      label: formatDate(point.date),
      lt1: current?.lt1 ?? null,
      lt2: current?.lt2 ?? null,
      vlamaxProxy: point.value ?? null,
    });
  });

  return [...byDate.values()].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

function formatLoadLabel(value?: number | null, discipline?: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  if (discipline === "ciclismo") return `${Math.round(value)} W`;
  if (discipline === "natación") return formatSwimPace(value / 10);
  return formatPace(value);
}

function smoothCurveValue(points: CurvePoint[], index: number) {
  const current = points[index];
  const previous = points[index - 1];
  const next = points[index + 1];
  if (!current) return null;
  if (!previous || !next) return current.lactate;
  return previous.lactate * 0.22 + current.lactate * 0.56 + next.lactate * 0.22;
}

function buildDisciplineCurvePlot(view?: DisciplineView | null, discipline?: string): PortalCurvePoint[] {
  if (!view || !discipline) return [];
  const source = discipline === "ciclismo" ? view.curve_history?.power ?? [] : view.curve_history?.pace ?? [];
  const sorted = [...source]
    .filter((point) => typeof point.x === "number" && typeof point.lactate === "number")
    .sort((left, right) => left.x - right.x);

  return sorted.map((point, index) => ({
    id: `${discipline}-${point.interval_id}-${index}`,
    label: point.label,
    sessionDate: point.session_date,
    load: point.x,
    lactate: point.lactate,
    adjusted: Math.round((smoothCurveValue(sorted, index) ?? point.lactate) * 100) / 100,
    powerSource: point.power_source ?? null,
  }));
}

function portalCurveTooltip(
  active: boolean | undefined,
  payload: Array<{ payload?: PortalCurvePoint; dataKey?: string }> | undefined,
  discipline?: string,
) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="athlete-portal-curve-tooltip">
      <strong>{point.label}</strong>
      {point.sessionDate ? <span>Fecha {formatDate(point.sessionDate)}</span> : null}
      <span>Carga {formatLoadLabel(point.load, discipline)}</span>
      <span>Lactato {formatLactateValue(point.lactate)}</span>
      <span>Ajuste {formatLactateValue(point.adjusted)}</span>
      {point.powerSource ? <span>Fuente {point.powerSource}</span> : null}
    </div>
  );
}

function formatPrimaryAxisValue(value?: number | null, discipline?: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  if (discipline === "ciclismo") return `${Math.round(value)} W`;
  if (discipline === "natación") return formatSwimPace(value / 10);
  return formatPace(value);
}

function latestHistorical(points?: HistoricalPoint[]) {
  if (!points?.length) return null;
  return points[points.length - 1] ?? null;
}

function relativeCountdownLabel(days: number | null) {
  if (days === null) return "Fecha pendiente";
  if (days < 0) return "Objetivo pasado";
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `${days} días`;
}

function shortText(value?: string | null, maxLength = 120) {
  if (!value) return "";
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trimEnd()}...`;
}

function confidenceLabel(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Lectura abierta";
  if (value >= 0.78) return "Alta confianza";
  if (value >= 0.58) return "Confianza media";
  return "Evidencia limitada";
}

function buildPortalStatus(params: {
  confidence?: number | null;
  nextTargetCountdown: number | null;
  summary?: string | null;
  recommendation?: string | null;
  hasTarget: boolean;
}): PortalStatus {
  const { confidence, nextTargetCountdown, summary, recommendation, hasTarget } = params;
  const baseSummary = shortText(summary || recommendation || "Tu portal irá afinando esta lectura cuando entren más sesiones comparables.", 150);
  const baseRecommendation = shortText(recommendation || summary || "Sigue acumulando sesiones comparables para convertir los datos en dirección útil.", 150);

  if (typeof confidence === "number" && confidence >= 0.78) {
    return {
      tone: "surging",
      label: hasTarget && nextTargetCountdown !== null && nextTargetCountdown <= 21 ? "Ventana de afinación" : "Bloque en línea",
      headline:
        hasTarget && nextTargetCountdown !== null && nextTargetCountdown <= 21
          ? "Llegas a una fase buena para afinar sin perder estabilidad."
          : "El bloque está respondiendo y la foto actual es bastante sólida.",
      summary: baseSummary,
      emphasis: baseRecommendation,
    };
  }

  if (typeof confidence === "number" && confidence >= 0.58) {
    return {
      tone: "steady",
      label: hasTarget && nextTargetCountdown !== null && nextTargetCountdown <= 21 ? "Ajuste fino" : "Progreso útil",
      headline:
        hasTarget && nextTargetCountdown !== null && nextTargetCountdown <= 21
          ? "Vas bien, pero todavía conviene consolidar antes de apretar más."
          : "Hay señales útiles, aunque el bloque aún no está del todo cerrado.",
      summary: baseSummary,
      emphasis: baseRecommendation,
    };
  }

  return {
    tone: "building",
    label: hasTarget ? "Base en construcción" : "Lectura abierta",
    headline:
      hasTarget && nextTargetCountdown !== null && nextTargetCountdown <= 35
        ? "Todavía falta convertir el trabajo reciente en una referencia más estable."
        : "Ahora mismo el foco es construir base y acumular comparables de calidad.",
    summary: baseSummary,
    emphasis: baseRecommendation,
  };
}

function dedupeRecentSessions(analysis: AthleteAnalysis | null) {
  const seen = new Set<number>();
  const sessions = Object.values(analysis?.discipline_views ?? {})
    .flatMap((view) => view.recent_sessions ?? [])
    .filter((session) => {
      if (seen.has(session.id)) return false;
      seen.add(session.id);
      return true;
    })
    .sort((left, right) => new Date(right.performed_at).getTime() - new Date(left.performed_at).getTime());
  return sessions.slice(0, 6);
}

function sessionDurationHours(session?: SessionSummary) {
  if (!session?.intervals?.length) return 0;
  return session.intervals.reduce((sum, interval) => sum + interval.duration_seconds, 0) / 3600;
}

function sessionDistanceKm(session?: SessionSummary) {
  if (!session?.intervals?.length) return 0;
  return session.intervals.reduce((sum, interval) => {
    if (typeof interval.pace_seconds_per_km !== "number" || !Number.isFinite(interval.pace_seconds_per_km) || interval.pace_seconds_per_km <= 0) {
      return sum;
    }
    return sum + (interval.duration_seconds / interval.pace_seconds_per_km);
  }, 0);
}

function volumeSummary(sessions: SessionSummary[]) {
  const runningKm = sessions.filter((session) => session.discipline === "running").reduce((sum, session) => sum + sessionDistanceKm(session), 0);
  const swimKm = sessions.filter((session) => session.discipline === "natación").reduce((sum, session) => sum + sessionDistanceKm(session), 0);
  const trainingHours = sessions.reduce((sum, session) => sum + sessionDurationHours(session), 0);
  const cyclingHasDistance = sessions.some((session) => session.discipline === "ciclismo" && sessionDistanceKm(session) > 0);
  const cyclingKm = sessions.filter((session) => session.discipline === "ciclismo").reduce((sum, session) => sum + sessionDistanceKm(session), 0);
  return { runningKm, swimKm, trainingHours, cyclingKm, cyclingHasDistance };
}

export function AthletePortalPage({ user, token }: AthletePortalPageProps) {
  const [analysis, setAnalysis] = useState<AthleteAnalysis | null>(null);
  const [athleteHealth, setAthleteHealth] = useState<AthleteHealthOverview | null>(null);
  const [athleteHealthLoading, setAthleteHealthLoading] = useState(false);
  const [athleteHealthError, setAthleteHealthError] = useState<string | null>(null);
  const [athleteHealthStatus, setAthleteHealthStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>("");
  const [stravaRedirecting, setStravaRedirecting] = useState(false);
  const [stravaFeedback, setStravaFeedback] = useState<string | null>(null);
  const [garminLoginOpen, setGarminLoginOpen] = useState(false);
  const [garminEmail, setGarminEmail] = useState("");
  const [garminPassword, setGarminPassword] = useState("");
  const [garminMfaCode, setGarminMfaCode] = useState("");
  const [garminConnectLoading, setGarminConnectLoading] = useState(false);
  const [garminConnectError, setGarminConnectError] = useState<string | null>(null);
  const [garminConnectMessage, setGarminConnectMessage] = useState<string | null>(null);
  const [garminPreviewLoading, setGarminPreviewLoading] = useState(false);
  const [garminPreviewError, setGarminPreviewError] = useState<string | null>(null);
  const [garminPreview, setGarminPreview] = useState<GarminActivitiesPreviewResponse | null>(null);
  const [garminActivityDetails, setGarminActivityDetails] = useState<Record<number, GarminActivity>>({});
  const [selectedGarminActivityId, setSelectedGarminActivityId] = useState<number | null>(null);
  const [garminActivityLoading, setGarminActivityLoading] = useState(false);
  const [garminActivityError, setGarminActivityError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stravaStatus = params.get("strava");
    const stravaReason = params.get("reason");
    if (!stravaStatus) return;

    if (stravaStatus === "connected") {
      setStravaFeedback("Strava conectado. Ya podemos usar la actividad real en cuanto activemos webhooks y matching.");
    } else {
      setStravaFeedback(stravaReason ? `No se pudo conectar Strava: ${stravaReason}` : "No se pudo completar la conexión con Strava.");
    }

    params.delete("strava");
    params.delete("reason");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAthletePortal() {
      if (!user?.athlete_id) {
        setError("Tu acceso atleta todavía no está vinculado a un deportista.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = (await api.athleteAnalysis(token, user.athlete_id)) as AthleteAnalysis;
        if (!cancelled) {
          setAnalysis(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar tu portal de atleta.");
          setAnalysis(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAthletePortal();
    return () => {
      cancelled = true;
    };
  }, [token, user?.athlete_id]);

  useEffect(() => {
    let cancelled = false;

    async function loadAthleteHealth() {
      if (!user?.athlete_id) return;
      setAthleteHealthLoading(true);
      setAthleteHealthError(null);
      setAthleteHealthStatus(null);
      try {
        const result = (await api.athleteHealthOverview(token, user.athlete_id, 28, {
          includeActivity: false,
          includeRawWellness: false,
          refreshLiveHealth: false,
        })) as AthleteHealthOverview;
        if (!cancelled) {
          setAthleteHealth(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setAthleteHealth(null);
          setAthleteHealthError(loadError instanceof Error ? loadError.message : "No se pudo cargar la capa paralela de actividad del atleta.");
        }
      } finally {
        if (!cancelled) {
          setAthleteHealthLoading(false);
        }
      }
    }

    loadAthleteHealth();
    return () => {
      cancelled = true;
    };
  }, [token, user?.athlete_id]);

  const activeBlock = analysis?.active_focus_block;
  const upcomingTargets = useMemo(
    () =>
      [...(analysis?.athlete.targets ?? [])]
        .filter((target) => new Date(target.target_date).getTime() >= Date.now() - 86400000)
        .sort((left, right) => new Date(left.target_date).getTime() - new Date(right.target_date).getTime())
        .slice(0, 3),
    [analysis],
  );
  const nextTarget = upcomingTargets[0] ?? null;
  const nextTargetCountdown = daysUntil(nextTarget?.target_date);

  const disciplineSnapshots = useMemo<DisciplineSnapshot[]>(() => (
    Object.entries(analysis?.discipline_views ?? {})
      .sort(([leftDiscipline], [rightDiscipline]) => disciplineOrder(leftDiscipline) - disciplineOrder(rightDiscipline))
      .map(([discipline, view]) => ({
        discipline,
        view,
        lt1: resolveTrainingThreshold(view, "LT1"),
        lt2: resolveTrainingThreshold(view, "LT2"),
        estimate: getPrimaryEstimate(view, discipline === "ciclismo" ? "FTP" : discipline === "running" ? "10K" : "VO2max") ?? view.estimates?.[0],
        weeklySessions: countSessionsWithinDays(view.recent_sessions ?? [], 7),
        monthlySessions: countSessionsWithinDays(view.recent_sessions ?? [], 30),
        latestSession: [...(view.recent_sessions ?? [])].sort((left, right) => new Date(right.performed_at).getTime() - new Date(left.performed_at).getTime())[0],
        trend: buildDisciplineTrend(view, discipline),
      }))
  ), [analysis?.discipline_views]);

  useEffect(() => {
    if (!disciplineSnapshots.length) return;
    if (!disciplineSnapshots.some((snapshot) => snapshot.discipline === selectedDiscipline)) {
      const defaultDiscipline = activeBlock?.priority_discipline || analysis?.athlete.primary_discipline || disciplineSnapshots[0]?.discipline || "running";
      setSelectedDiscipline(defaultDiscipline);
    }
  }, [activeBlock?.priority_discipline, analysis?.athlete.primary_discipline, disciplineSnapshots, selectedDiscipline]);

  const selectedSnapshot = useMemo(
    () => disciplineSnapshots.find((snapshot) => snapshot.discipline === selectedDiscipline) ?? disciplineSnapshots[0],
    [disciplineSnapshots, selectedDiscipline],
  );

  const lactateSeries = useMemo(
    () => buildDisciplineCurvePlot(selectedSnapshot?.view, selectedSnapshot?.discipline),
    [selectedSnapshot?.discipline, selectedSnapshot?.view],
  );

  const recentFeed = useMemo(
    () => dedupeRecentSessions(analysis),
    [analysis],
  );
  const visibleVolume = useMemo(
    () => volumeSummary(recentFeed),
    [recentFeed],
  );

  const weeklyTotal = useMemo(
    () => disciplineSnapshots.reduce((sum, snapshot) => sum + snapshot.weeklySessions, 0),
    [disciplineSnapshots],
  );

  const monthlyTotal = useMemo(
    () => disciplineSnapshots.reduce((sum, snapshot) => sum + snapshot.monthlySessions, 0),
    [disciplineSnapshots],
  );

  const latestAnchor = latestHistorical(selectedSnapshot?.view?.historical_evolution?.lactate_anchor);
  const latestPeak = latestHistorical(selectedSnapshot?.view?.historical_evolution?.peak_lactate);
  const latestInterpretation = analysis?.interpretation?.slice(0, 2) ?? [];
  const coachSignals = analysis?.automated_comments?.slice(0, 3) ?? [];
  const focusDiscipline = selectedSnapshot?.discipline || activeBlock?.priority_discipline || analysis?.athlete.primary_discipline || "running";
  const focusEstimate =
    selectedSnapshot?.estimate ??
    getPrimaryEstimate(selectedSnapshot?.view, focusDiscipline === "ciclismo" ? "FTP" : focusDiscipline === "running" ? "HM" : "VO2max");
  const selectedPredictions = selectedSnapshot?.view.estimates?.slice(0, 3) ?? [];
  const vlamaxEstimate = selectedSnapshot?.view.estimates?.find((estimate) => estimate.estimate_type === "VLAMAX");
  const featuredPrediction = selectedPredictions[0] ?? null;
  const secondaryPredictions = featuredPrediction ? selectedPredictions.slice(1, 3) : [];
  const portalSignals = [activeBlock?.evaluation?.recommendation, ...coachSignals].filter((item): item is string => Boolean(item)).slice(0, 3);
  const portalStatus = buildPortalStatus({
    confidence: activeBlock?.evaluation?.confidence,
    nextTargetCountdown,
    summary: activeBlock?.evaluation?.summary ?? latestInterpretation[0],
    recommendation: activeBlock?.evaluation?.recommendation ?? latestInterpretation[1],
    hasTarget: Boolean(nextTarget),
  });
  const latestVisibleSession = selectedSnapshot?.latestSession ?? recentFeed[0];
  const weeklyBreakdown = disciplineSnapshots
    .map((snapshot) => ({
      discipline: snapshot.discipline,
      label: disciplineLabel(snapshot.discipline),
      value: snapshot.weeklySessions,
    }))
    .filter((item) => item.value > 0);
  const weeklyMaxSessions = Math.max(1, ...weeklyBreakdown.map((item) => item.value));
  const selectedDisciplineLabel = disciplineLabel(selectedSnapshot?.discipline || focusDiscipline);
  const referenceValue = focusEstimate ? formatTarget(focusEstimate) : renderThresholdValue(selectedSnapshot?.lt2, focusDiscipline);
  const referenceDetail = focusEstimate ? `${focusEstimate.estimate_type} · ${disciplineLabel(focusDiscipline)}` : "Referencia LT2 visible en tu disciplina activa.";
  const syncHeadline =
    analysis?.athlete.strava_connected || analysis?.athlete.garmin_connected ? "Actividad conectada" : "Conecta tu actividad";
  const syncSummary =
    analysis?.athlete.strava_connected || analysis?.athlete.garmin_connected
      ? "Ya hay una fuente real lista para cruzar sesiones y actividad visible."
      : "Autoriza Strava para que el dashboard conecte lo planificado con lo que realmente haces.";
  const syncProviders = [
    { label: "Strava", connected: Boolean(analysis?.athlete.strava_connected) },
    { label: "Garmin", connected: Boolean(analysis?.athlete.garmin_connected) },
  ];
  const dashboardMetrics = [
    {
      label: "Próxima cita",
      value: nextTarget ? relativeCountdownLabel(nextTargetCountdown) : "Sin fecha",
      detail: nextTarget ? buildTargetObjective({ category: nextTarget.distance_category, distanceLabel: nextTarget.distance_label, fallback: nextTarget.objective }) : "Todavía no hay un objetivo fechado visible.",
    },
    {
      label: "Disciplina foco",
      value: selectedDisciplineLabel,
      detail: activeBlock?.phase ? `Fase ${activeBlock.phase}` : "Bloque abierto",
    },
    {
      label: "Referencia",
      value: referenceValue,
      detail: referenceDetail,
    },
    {
      label: "Ritmo semanal",
      value: `${weeklyTotal} sesiones`,
      detail: `${formatSecondsToClock(visibleVolume.trainingHours * 3600)} visibles en los últimos días`,
    },
  ];
  const focusChecklist = [
    {
      label: "Bloque activo",
      value: activeBlock?.block_objective ?? "Base abierta",
      detail: activeBlock?.block_intent ? shortText(activeBlock.block_intent, 110) : "Todavía no hay una intención operativa visible para este bloque.",
    },
    {
      label: "Qué mirar hoy",
      value: portalStatus.emphasis,
      detail: `Lectura actual: ${confidenceLabel(activeBlock?.evaluation?.confidence)}.`,
    },
    {
      label: "Última sesión",
      value: latestVisibleSession?.session_type ?? "Sin sesión reciente",
      detail: latestVisibleSession ? `${disciplineLabel(latestVisibleSession.discipline)} · ${formatDate(latestVisibleSession.performed_at)}` : "Todavía no hay actividad reciente vinculada a este portal.",
    },
  ];
  const athleteHealthSummary = athleteHealth?.summary;
  const athleteHealthProviders = athleteHealth?.providers ?? [];
  const athleteHealthMetrics = athleteHealth?.health_metrics ?? [];
  const athleteSleepBreakdown = athleteHealth?.sleep_breakdown ?? [];
  const athletePerformanceMetrics = athleteHealth?.performance_metrics ?? [];
  const athleteHealthDays = athleteHealth?.health_days ?? [];
  const athleteHealthCalendar = athleteHealth?.activity_calendar ?? [];
  const athleteHealthRecent = athleteHealth?.recent_activities ?? [];
  const athleteWellnessPayload = athleteHealth?.raw_wellness ?? {};
  const athleteWellnessDiagnostics = (athleteWellnessPayload.diagnostics ?? null) as Record<string, unknown> | null;
  const athleteHealthMetricMap = useMemo(
    () =>
      athleteHealthMetrics.reduce<Record<string, AthleteHealthMetric>>((map, metric) => {
        map[metric.key] = metric;
        return map;
      }, {}),
    [athleteHealthMetrics],
  );
  const athleteWellnessDiagnosticCards = athleteWellnessDiagnostics
    ? [
        { label: "Sleep raw", value: athleteWellnessDiagnostics.raw_sleep_scores_count },
        { label: "Steps raw", value: athleteWellnessDiagnostics.raw_steps_count },
        { label: "Stress raw", value: athleteWellnessDiagnostics.raw_stress_count },
        { label: "Intensity raw", value: athleteWellnessDiagnostics.raw_intensity_count },
        { label: "HRV raw", value: athleteWellnessDiagnostics.raw_hrv_count },
      ].filter((item) => typeof item.value === "number")
    : [];
  const athleteWellnessJson = useMemo(() => {
    if (!Object.keys(athleteWellnessPayload).length) return null;
    return JSON.stringify(athleteWellnessPayload, null, 2);
  }, [athleteWellnessPayload]);
  const athleteWellnessPreviewFields = useMemo(() => flattenGarminObject(athleteWellnessPayload, "", [], 24), [athleteWellnessPayload]);
  const athleteSleepFeedback = athleteSleepBreakdown.find((metric) => metric.key === "sleep_feedback") ?? null;
  const sleepScoreValue = athleteHealthMetricMap.sleep_score?.value ?? "n/d";
  const recoveryScore = parseMetricNumber(sleepScoreValue);
  const recoveryToneClass = recoveryTone(recoveryScore);
  const todayPortalLabel = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const portalQuickChips = [
    { label: "Disciplina", value: selectedDisciplineLabel },
    { label: "Recovery", value: sleepScoreValue },
    { label: "Bloque", value: portalStatus.label },
    { label: "Objetivo", value: nextTarget ? relativeCountdownLabel(nextTargetCountdown) : "Sin fecha" },
  ];
  const recoveryRingStyle = {
    "--progress": `${Math.max(6, Math.min(100, recoveryScore ?? 12))}%`,
  } as CSSProperties;
  const recoveryHeroStats = [
    athleteHealthMetricMap.hrv,
    athleteHealthMetricMap.stress,
    athleteHealthMetricMap.body_battery,
    athleteHealthMetricMap.resting_hr,
  ].filter(Boolean) as AthleteHealthMetric[];
  const selectedGarminActivity = useMemo(() => {
    if (!garminPreview?.activities.length) return null;
    const previewMatch = garminPreview.activities.find((activity) => activity.provider_activity_id === selectedGarminActivityId) ?? garminPreview.activities[0] ?? null;
    if (!previewMatch) return null;
    return garminActivityDetails[previewMatch.provider_activity_id] ?? previewMatch;
  }, [garminActivityDetails, garminPreview?.activities, selectedGarminActivityId]);
  const selectedGarminJson = useMemo(() => {
    if (!selectedGarminActivity?.raw_detail || !Object.keys(selectedGarminActivity.raw_detail).length) return null;
    return JSON.stringify(selectedGarminActivity.raw_detail, null, 2);
  }, [selectedGarminActivity]);
  const selectedGarminFields = useMemo(() => {
    if (!selectedGarminActivity?.raw_detail) return [];
    return flattenGarminObject(selectedGarminActivity.raw_detail);
  }, [selectedGarminActivity]);

  if (loading) {
    return <div className="loading">Preparando tu panel...</div>;
  }

  if (error || !analysis) {
    return (
      <div className="page-grid">
        <section className="card athlete-portal-note">
          <span className="eyebrow">Portal atleta</span>
          <h1>No hemos podido cargar tu panel</h1>
          <p>{error ?? "Falta vincular este acceso a un atleta real."}</p>
        </section>
      </div>
    );
  }

  async function handleStravaConnect() {
    setStravaRedirecting(true);
    setStravaFeedback(null);
    try {
      const payload = await api.stravaConnectStart(token);
      window.location.assign(payload.authorize_url);
    } catch (connectError) {
      setStravaFeedback(connectError instanceof Error ? connectError.message : "No se pudo iniciar la conexión con Strava.");
      setStravaRedirecting(false);
    }
  }

  async function handleGarminConnect() {
    if (!user?.athlete_id) return;
    setGarminConnectLoading(true);
    setGarminConnectError(null);
    setGarminConnectMessage(null);
    try {
      const result = await api.garminConnect(token, user.athlete_id, {
        email: garminEmail,
        password: garminPassword,
        ...(garminMfaCode.trim() ? { mfa_code: garminMfaCode.trim() } : {}),
      });
      setGarminConnectMessage(`Garmin conectado para ${analysis?.athlete.name ?? "tu atleta"} (${result.garmin_email}).`);
      setGarminPassword("");
      setGarminMfaCode("");
      setGarminLoginOpen(false);
      const refreshed = (await api.athleteAnalysis(token, user.athlete_id)) as AthleteAnalysis;
      setAnalysis(refreshed);
      const healthRefreshed = (await api.athleteHealthOverview(token, user.athlete_id, 28, {
        includeActivity: false,
        includeRawWellness: false,
        refreshLiveHealth: false,
      })) as AthleteHealthOverview;
      setAthleteHealth(healthRefreshed);
    } catch (connectError) {
      setGarminConnectError(connectError instanceof Error ? connectError.message : "No se pudo conectar Garmin.");
    } finally {
      setGarminConnectLoading(false);
    }
  }

  async function handleLoadGarminRaw() {
    if (!user?.athlete_id) return;
    setGarminPreviewLoading(true);
    setGarminPreviewError(null);
    setGarminActivityError(null);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 13);
      const result = (await api.garminPreview(
        token,
        user.athlete_id,
        startDate.toISOString().slice(0, 10),
        endDate.toISOString().slice(0, 10),
        { includeFullDetail: false, activityLimit: 6 },
      )) as GarminActivitiesPreviewResponse;
      setGarminPreview(result);
      setGarminActivityDetails({});
      const firstActivityId = result.activities[0]?.provider_activity_id ?? null;
      setSelectedGarminActivityId(firstActivityId);
      if (firstActivityId) {
        const detail = (await api.garminActivityDetail(token, user.athlete_id, firstActivityId)) as GarminActivity;
        setGarminActivityDetails({ [firstActivityId]: detail });
      }
    } catch (loadError) {
      setGarminPreview(null);
      setSelectedGarminActivityId(null);
      setGarminPreviewError(loadError instanceof Error ? loadError.message : "No se pudo cargar el payload Garmin.");
    } finally {
      setGarminPreviewLoading(false);
    }
  }

  async function handleRefreshAthleteHealth() {
    if (!user?.athlete_id) return;
      setAthleteHealthLoading(true);
      setAthleteHealthError(null);
      setAthleteHealthStatus("Consultando Garmin en vivo...");
      try {
      const refreshed = (await api.athleteHealthOverview(token, user.athlete_id, 28, {
        includeActivity: false,
        includeRawWellness: true,
        refreshLiveHealth: true,
      })) as AthleteHealthOverview;
      setAthleteHealth(refreshed);
      const diagnostics = (refreshed.raw_wellness?.diagnostics ?? {}) as Record<string, unknown>;
      const rawCount = [
        diagnostics.raw_sleep_scores_count,
        diagnostics.raw_steps_count,
        diagnostics.raw_stress_count,
        diagnostics.raw_intensity_count,
        diagnostics.raw_hrv_count,
      ].reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0);
      const hasVisibleWellness =
        refreshed.health_metrics.length > 0 ||
        refreshed.health_days.length > 0 ||
        Object.keys(refreshed.raw_wellness ?? {}).length > 0;
      setAthleteHealthStatus(
        hasVisibleWellness
          ? "Datos Garmin actualizados."
          : rawCount > 0
            ? "Garmin ha devuelto payload crudo, pero no hemos conseguido mapear métricas visibles todavía."
            : "Garmin ha respondido, pero esta cuenta no ha devuelto métricas de wellness visibles.",
      );
      } catch (loadError) {
        setAthleteHealthError(loadError instanceof Error ? loadError.message : "No se pudo refrescar la salud Garmin.");
        setAthleteHealthStatus(null);
      } finally {
        setAthleteHealthLoading(false);
      }
  }

  async function handleOpenGarminActivity(activityId: number) {
    if (!user?.athlete_id) return;
    setSelectedGarminActivityId(activityId);
    setGarminActivityError(null);
    if (garminActivityDetails[activityId]) return;
    setGarminActivityLoading(true);
    try {
      const result = (await api.garminActivityDetail(token, user.athlete_id, activityId)) as GarminActivity;
      setGarminActivityDetails((current) => ({ ...current, [activityId]: result }));
    } catch (loadError) {
      setGarminActivityError(loadError instanceof Error ? loadError.message : "No se pudo cargar el detalle Garmin.");
    } finally {
      setGarminActivityLoading(false);
    }
  }

  return (
    <div className="page-grid athlete-portal-grid">
      <section className="athlete-portal-topline">
        <div className="athlete-portal-topline-main">
          <span className="eyebrow">Today</span>
          <strong>{todayPortalLabel}</strong>
        </div>
        <div className="athlete-portal-topline-chips">
          {portalQuickChips.map((chip) => (
            <article key={chip.label} className="athlete-portal-topline-chip">
              <span className="athlete-portal-card-label">{chip.label}</span>
              <strong>{chip.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="card athlete-portal-hero-shell">
        <div className="athlete-portal-hero-copy athlete-portal-stage-main">
          <div className="athlete-portal-status-line">
            <span className={`athlete-portal-status-badge ${portalStatus.tone}`}>{portalStatus.label}</span>
            <span className="athlete-portal-status-context">
              {nextTarget ? `${relativeCountdownLabel(nextTargetCountdown)} para ${nextTarget.objective}` : "Sin objetivo fechado visible"}
            </span>
          </div>
          <span className="eyebrow">Athlete dashboard</span>
          <h1>{analysis.athlete.name}</h1>
          <p className="athlete-portal-stage-headline">{portalStatus.headline}</p>
          <p className="athlete-portal-stage-summary">{portalStatus.summary}</p>
          <div className="athlete-portal-tags">
            <span className="athlete-goal-chip">{disciplineLabel(analysis.athlete.primary_discipline)}</span>
            {analysis.athlete.goal_category ? <span className="athlete-goal-chip subtle">{analysis.athlete.goal_category}</span> : null}
            {activeBlock?.block_objective ? <span className="athlete-goal-chip subtle">{activeBlock.block_objective}</span> : null}
          </div>
          <div className="athlete-portal-dashboard-strip">
            {dashboardMetrics.map((item) => (
              <article key={item.label} className="athlete-portal-dashboard-metric">
                <span className="athlete-portal-card-label">{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
          <div className={`athlete-portal-stage-note ${portalStatus.tone}`}>
            <span className="athlete-portal-card-label">Qué toca mirar ahora</span>
            <strong>{portalStatus.emphasis}</strong>
          </div>
          {stravaFeedback ? <small className="athlete-portal-sync-note">{stravaFeedback}</small> : null}
          <small className="athlete-portal-sync-note">Esta portada prioriza lo importante hoy: estado del bloque, referencia útil, actividad reciente y siguiente objetivo.</small>
        </div>

        <div className="athlete-portal-hero-aside athlete-portal-stage-aside">
          <article className="athlete-portal-hero-card athlete-portal-spotlight-card focus">
            <span className="athlete-portal-card-label">Tablero de hoy</span>
            <strong>{selectedDisciplineLabel}</strong>
            <div className="athlete-portal-focus-list">
              {focusChecklist.map((item) => (
                <div key={item.label} className="athlete-portal-focus-list-item">
                  <span className="athlete-portal-card-label">{item.label}</span>
                  <strong>{item.value}</strong>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="athlete-portal-focus-rail">
              {disciplineSnapshots.map((snapshot) => (
                <button
                  key={snapshot.discipline}
                  type="button"
                  className={`athlete-portal-focus-chip ${snapshot.discipline === selectedSnapshot?.discipline ? "active" : ""}`}
                  onClick={() => setSelectedDiscipline(snapshot.discipline)}
                >
                  {disciplineLabel(snapshot.discipline)}
                </button>
              ))}
            </div>
            <div className="athlete-portal-focus-meta">
              <small>{activeBlock?.phase ? `Fase ${activeBlock.phase}` : "Fase abierta"}</small>
              <small>{activeBlock?.block_objective ?? "Sin objetivo de bloque visible"}</small>
            </div>
          </article>

          <article className="athlete-portal-hero-card athlete-portal-spotlight-card goal standout">
            <span className="athlete-portal-card-label">Próximo objetivo</span>
            <strong>{nextTarget ? nextTarget.objective : "Sin objetivo definido"}</strong>
            <p>
              {nextTarget
                ? `${disciplineLabel(nextTarget.discipline)} · ${relativeCountdownLabel(nextTargetCountdown)}`
                : "Cuando tu entrenador marque un objetivo, lo verás aquí."}
            </p>
            {nextTarget?.discipline === "triatlón" ? (
              <div className="athlete-portal-target-splits">
                {nextTarget.target_swim_pace_label ? (
                  <span>
                    <strong>Natación</strong>
                    {nextTarget.target_swim_pace_label}
                  </span>
                ) : null}
                {typeof nextTarget.target_cycling_power_watts === "number" ? (
                  <span>
                    <strong>Ciclismo</strong>
                    {formatCyclingTarget(nextTarget.target_cycling_power_watts, analysis.athlete.weight)}
                  </span>
                ) : null}
                {nextTarget.target_running_pace_label ? (
                  <span>
                    <strong>Carrera</strong>
                    {nextTarget.target_running_pace_label}
                  </span>
                ) : null}
              </div>
            ) : nextTarget?.target_pace_label ? (
              <div className="athlete-portal-target-splits">
                <span>
                  <strong>Referencia</strong>
                  {nextTarget.target_pace_label}
                </span>
              </div>
            ) : typeof nextTarget?.target_power_watts === "number" ? (
              <div className="athlete-portal-target-splits">
                <span>
                  <strong>Referencia</strong>
                  {formatCyclingTarget(nextTarget.target_power_watts, analysis.athlete.weight)}
                </span>
              </div>
            ) : null}
          </article>

          <article className="athlete-portal-hero-card athlete-portal-spotlight-card sync">
            <span className="athlete-portal-card-label">Sincronización</span>
            <strong>{syncHeadline}</strong>
            <p>{syncSummary}</p>
            <div className="athlete-portal-sync-provider-list">
              {syncProviders.map((provider) => (
                <span key={provider.label} className={`athlete-portal-sync-provider ${provider.connected ? "connected" : ""}`}>
                  {provider.label} · {provider.connected ? "activa" : "pendiente"}
                </span>
              ))}
            </div>
            <button className="ghost-button" type="button" onClick={handleStravaConnect} disabled={stravaRedirecting}>
              {stravaRedirecting ? "Redirigiendo..." : analysis.athlete.strava_connected ? "Reconectar Strava" : "Conectar Strava"}
            </button>
          </article>
        </div>
      </section>

      <section className="athlete-portal-command-grid athlete-portal-side-shell">
        <div className="athlete-portal-side-head">
          <span className="eyebrow">Control deck</span>
          <h2>Tu día en tres lecturas</h2>
          <p className="muted">Una columna rápida para saber cómo está el bloque, cuánto has movido la semana y cuál es tu referencia de trabajo ahora mismo.</p>
        </div>
        <article className={`card athlete-portal-command-card ${portalStatus.tone}`}>
          <span className="athlete-portal-card-label">Estado del bloque</span>
          <strong>{portalStatus.label}</strong>
          <p>{portalStatus.headline}</p>
          <div className="athlete-portal-command-list">
            {portalSignals.length ? (
              portalSignals.map((signal) => (
                <div key={signal} className="athlete-portal-command-list-item">
                  <span />
                  <small>{signal}</small>
                </div>
              ))
            ) : (
              <div className="athlete-portal-command-list-item">
                <span />
                <small>Cuando haya más comparables, esta tarjeta te dirá con mucha más claridad si el bloque está empujando o no.</small>
              </div>
            )}
          </div>
        </article>
        <article className="card athlete-portal-command-card week">
          <span className="athlete-portal-card-label">Ritmo de la semana</span>
          <div className="athlete-portal-week-kpis">
            <div>
              <strong>{weeklyTotal}</strong>
              <small>sesiones / 7 días</small>
            </div>
            <div>
              <strong>{formatSecondsToClock(visibleVolume.trainingHours * 3600)}</strong>
              <small>tiempo visible</small>
            </div>
            <div>
              <strong>{monthlyTotal}</strong>
              <small>sesiones / 30 días</small>
            </div>
          </div>
          <div className="athlete-portal-week-bars">
            {weeklyBreakdown.length ? (
              weeklyBreakdown.map((item) => (
                <div key={item.discipline} className="athlete-portal-week-bar-row">
                  <div className="athlete-portal-week-bar-head">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                  <div className="athlete-portal-week-bar-track">
                    <div
                      className="athlete-portal-week-bar-fill"
                      style={{ width: `${Math.max(18, (item.value / weeklyMaxSessions) * 100)}%`, backgroundColor: disciplineAccent(item.discipline) }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">Todavía no hay suficientes sesiones recientes para dibujar el reparto semanal.</p>
            )}
          </div>
        </article>
        <article className="card athlete-portal-command-card reference">
          <span className="athlete-portal-card-label">Referencia de trabajo</span>
          <strong>{focusEstimate ? formatTarget(focusEstimate) : renderThresholdValue(selectedSnapshot?.lt2, focusDiscipline)}</strong>
          <p>{focusEstimate ? `${focusEstimate.estimate_type} · ${disciplineLabel(focusDiscipline)}` : "Tu referencia útil se apoya de momento en LT2."}</p>
          <div className="athlete-portal-reference-strip">
            <span>
              <small>LT1</small>
              <strong>{renderThresholdValue(selectedSnapshot?.lt1, focusDiscipline)}</strong>
            </span>
            <span>
              <small>LT2</small>
              <strong>{renderThresholdValue(selectedSnapshot?.lt2, focusDiscipline)}</strong>
            </span>
            <span>
              <small>Lectura</small>
              <strong>{confidenceLabel(activeBlock?.evaluation?.confidence)}</strong>
            </span>
          </div>
          <div className="athlete-portal-volume-inline">
            <span>
              <small>Run</small>
              <strong>{visibleVolume.runningKm.toFixed(1)} km</strong>
            </span>
            <span>
              <small>Swim</small>
              <strong>{visibleVolume.swimKm.toFixed(1)} km</strong>
            </span>
            <span>
              <small>Bike</small>
              <strong>{visibleVolume.cyclingHasDistance ? `${visibleVolume.cyclingKm.toFixed(1)} km` : "GPS pendiente"}</strong>
            </span>
          </div>
        </article>
      </section>

      <section className="card athlete-portal-health-panel athlete-portal-health-bevel-shell">
        <div className="athlete-portal-section-head athlete-portal-health-bevel-head">
          <div>
            <span className="eyebrow">Athlete health</span>
            <h2>Atlas Garmin de recuperación y performance</h2>
            <p className="muted">Una capa paralela, estética y legible. No toca el motor del entrenador ni altera tus referencias fisiológicas.</p>
          </div>
          <div className="athlete-portal-health-actions athlete-portal-health-actions-bevel">
            <div className="athlete-portal-health-providers">
              {athleteHealthProviders.map((provider) => (
                <span key={provider.provider} className={`athlete-portal-health-provider ${provider.status}`}>
                  {provider.label} · {provider.status === "connected" ? "activo" : provider.status === "error" ? "error" : "pendiente"}
                </span>
              ))}
            </div>
            <button
              type="button"
              className="ghost-button athlete-portal-health-refresh"
              onClick={() => void handleRefreshAthleteHealth()}
              disabled={athleteHealthLoading || !analysis.athlete.garmin_connected}
            >
              {athleteHealthLoading ? "Consultando Garmin..." : "Actualizar salud Garmin"}
            </button>
            {athleteHealthStatus ? <small className="athlete-portal-health-status">{athleteHealthStatus}</small> : null}
          </div>
        </div>

        {athleteHealthLoading ? (
          <div className="athlete-portal-health-empty">Cargando actividad y salud conectada...</div>
        ) : athleteHealthError ? (
          <div className="athlete-portal-health-empty">{athleteHealthError}</div>
        ) : athleteHealth ? (
          <>
            <div className="athlete-portal-health-bevel-grid">
              <article className={`athlete-portal-health-bevel-hero tone-${recoveryToneClass}`}>
                <div className="athlete-portal-health-bevel-orb">
                  <div className="athlete-portal-health-bevel-ring" style={recoveryRingStyle}>
                    <div className="athlete-portal-health-bevel-ring-core">
                      <span className="athlete-portal-card-label">Recovery</span>
                      <strong>{sleepScoreValue}</strong>
                    </div>
                  </div>
                </div>
                <div className="athlete-portal-health-bevel-copy">
                  <span className="athlete-portal-card-label">Lectura de hoy</span>
                  <h3>{recoveryHeadline(recoveryScore)}</h3>
                  <p>{athleteHealthMetricMap.sleep_score?.detail ?? athleteHealthStatus ?? "Garmin te dará aquí una lectura rápida de recuperación al refrescar en vivo."}</p>
                  <div className="athlete-portal-health-chip-row">
                    <span className="athlete-portal-health-chip accent">{athleteHealthMetricMap.hrv?.detail ?? athleteHealthDays[0]?.hrv_status ?? "HRV sin estado visible"}</span>
                    {athleteSleepFeedback ? <span className="athlete-portal-health-chip">{athleteSleepFeedback.value}</span> : null}
                    {athleteSleepFeedback?.detail ? <span className="athlete-portal-health-chip soft">{athleteSleepFeedback.detail}</span> : null}
                  </div>
                  <div className="athlete-portal-health-hero-stats">
                    {(recoveryHeroStats.length ? recoveryHeroStats : athleteHealthMetrics.slice(0, 4)).map((metric) => (
                      <article key={metric.key} className={`athlete-portal-health-hero-stat metric-${metric.key}`}>
                        <span className="athlete-portal-card-label">{metric.label}</span>
                        <strong>{metric.value}</strong>
                        <p>{metric.detail ?? "Último valor visible"}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </article>

              <article className="athlete-portal-health-bevel-card athlete-portal-health-sleep-card">
                <div className="athlete-portal-chart-head">
                  <span className="athlete-portal-card-label">Sleep architecture</span>
                  <strong>Noche Garmin visible</strong>
                </div>
                {athleteSleepBreakdown.length ? (
                  <div className="athlete-portal-health-bevel-metric-grid">
                    {athleteSleepBreakdown.map((metric) => (
                      <article key={metric.key} className={`athlete-portal-health-bevel-metric metric-${metric.key}`}>
                        <span className="athlete-portal-card-label">{metric.label}</span>
                        <strong>{metric.value}</strong>
                        <p>{metric.detail ?? "Señal nocturna Garmin"}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="athlete-portal-health-empty">Al refrescar en vivo aparecerán fases de sueño, body battery, resting HR y respiración nocturna.</div>
                )}
              </article>

              <article className="athlete-portal-health-bevel-card athlete-portal-health-performance-card">
                <div className="athlete-portal-chart-head">
                  <span className="athlete-portal-card-label">Performance signals</span>
                  <strong>Lo que Garmin aporta fuera del descanso</strong>
                </div>
                {athletePerformanceMetrics.length ? (
                  <div className="athlete-portal-health-bevel-metric-grid performance">
                    {athletePerformanceMetrics.map((metric) => (
                      <article key={metric.key} className={`athlete-portal-health-bevel-metric performance metric-${metric.key}`}>
                        <span className="athlete-portal-card-label">{metric.label}</span>
                        <strong>{metric.value}</strong>
                        <p>{metric.detail ?? "Señal de rendimiento Garmin"}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="athlete-portal-health-empty">Pulsa actualizar salud Garmin para pedir VO2max, LT HR, threshold power, training effect y training load si la cuenta los expone.</div>
                )}
              </article>
            </div>

            <div className="athlete-portal-health-bevel-lower-grid">
              <article className="athlete-portal-health-bevel-card athlete-portal-health-timeline-card">
                <div className="athlete-portal-chart-head">
                  <span className="athlete-portal-card-label">Timeline de salud</span>
                  <strong>Últimos 7 días Garmin</strong>
                </div>
                {athleteHealthDays.length ? (
                  <div className="athlete-portal-health-days-list bevel">
                    {athleteHealthDays.map((day, index) => (
                      <article key={day.date} className={`athlete-portal-health-day health-metric-day bevel ${index === 0 ? "current" : ""}`}>
                        <div className="athlete-portal-health-day-head">
                          <strong>{new Date(day.date).toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" })}</strong>
                          <small>
                            {typeof day.sleep_score === "number" ? `Sleep ${day.sleep_score}` : "Sleep n/d"}
                            {typeof day.stress_level === "number" ? ` · Stress ${day.stress_level}` : ""}
                          </small>
                        </div>
                        <div className="athlete-portal-health-day-stats">
                          <span><small>HRV</small><strong>{formatNumericMetric(day.hrv_last_night_avg)}</strong></span>
                          <span><small>Pasos</small><strong>{formatSteps(day.steps)}</strong></span>
                          <span><small>Intensidad</small><strong>{formatMinutes(day.intensity_minutes)}</strong></span>
                        </div>
                        <p>{day.hrv_status ?? "Sin estado HRV visible."}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="athlete-portal-health-empty">Garmin no ha devuelto todavía una serie diaria de wellness.</div>
                )}
              </article>

              <article className="athlete-portal-health-bevel-card athlete-portal-health-raw-card">
                <div className="athlete-portal-chart-head">
                  <span className="athlete-portal-card-label">Raw wellness</span>
                  <strong>Laboratorio Garmin</strong>
                </div>
                {athleteHealthStatus ? <div className="athlete-portal-health-inline-status">{athleteHealthStatus}</div> : null}
                {athleteWellnessDiagnosticCards.length ? (
                  <div className="athlete-portal-health-diagnostic-grid">
                    {athleteWellnessDiagnosticCards.map((item) => (
                      <article key={item.label} className="athlete-portal-health-diagnostic-card">
                        <span className="athlete-portal-card-label">{item.label}</span>
                        <strong>{String(item.value)}</strong>
                      </article>
                    ))}
                  </div>
                ) : null}
                {athleteWellnessPreviewFields.length ? (
                  <div className="athlete-portal-garmin-parameters athlete-portal-health-parameters bevel">
                    {athleteWellnessPreviewFields.map((field) => (
                      <article key={field.key} className="athlete-portal-garmin-parameter-card">
                        <span className="athlete-portal-card-label">{field.label}</span>
                        <strong>{field.value}</strong>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="athlete-portal-health-empty">
                    {athleteHealthStatus ?? "La carga inicial va en modo ligero. Pulsa actualizar para abrir el laboratorio Garmin en vivo."}
                  </div>
                )}
                <details className="athlete-portal-health-raw-drawer" open={Boolean(athleteWellnessJson && athleteWellnessPreviewFields.length === 0)}>
                  <summary>{athleteWellnessJson ? "Abrir payload crudo" : "Payload crudo aún no disponible"}</summary>
                  {athleteWellnessJson ? (
                    <div className="athlete-portal-garmin-json-card athlete-portal-health-json-card">
                      <pre>{athleteWellnessJson}</pre>
                    </div>
                  ) : null}
                </details>
                {athleteHealth.notes.length ? (
                  <div className="athlete-portal-health-notes">
                    {athleteHealth.notes.map((note) => (
                      <p key={note}>{note}</p>
                    ))}
                  </div>
                ) : null}
              </article>
            </div>

            <div className="athlete-portal-health-bevel-secondary-grid">
              <article className="athlete-portal-health-bevel-card athlete-portal-health-activity-overview-card">
                <div className="athlete-portal-chart-head">
                  <span className="athlete-portal-card-label">Actividad conectada</span>
                  <strong>Huella de entreno visible</strong>
                </div>
                <div className="athlete-portal-health-summary-inline">
                  <span>
                    <small>Actividades</small>
                    <strong>{athleteHealthSummary?.activities_count ?? 0}</strong>
                  </span>
                  <span>
                    <small>Días activos</small>
                    <strong>{athleteHealthSummary?.training_days ?? 0}</strong>
                  </span>
                  <span>
                    <small>Tiempo</small>
                    <strong>{formatSecondsToClock(athleteHealthSummary?.total_duration_seconds ?? 0)}</strong>
                  </span>
                  <span>
                    <small>Ventana</small>
                    <strong>{formatDate(athleteHealth.window_start)} - {formatDate(athleteHealth.window_end)}</strong>
                  </span>
                </div>
                <div className="athlete-portal-health-calendar-grid bevel">
                  {athleteHealthCalendar.map((day) => (
                    <article key={day.date} className={`athlete-portal-health-day bevel ${day.activity_count > 0 ? "active" : ""}`}>
                      <small>{new Date(day.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</small>
                      <strong>{day.activity_count > 0 ? day.activity_count : "·"}</strong>
                      <span
                        className="athlete-portal-health-day-bar"
                        style={{ backgroundColor: day.primary_sport_color ?? "rgba(16, 34, 42, 0.1)" }}
                      />
                      <p>{day.primary_sport_label ?? "Sin actividad"}</p>
                    </article>
                  ))}
                </div>
              </article>

              <article className="athlete-portal-health-bevel-card athlete-portal-health-feed-card-bevel">
                <div className="athlete-portal-chart-head">
                  <span className="athlete-portal-card-label">Entrenos Garmin</span>
                  <strong>Feed reciente</strong>
                </div>
                <div className="athlete-portal-health-feed-list">
                  {athleteHealthRecent.length ? (
                    athleteHealthRecent.map((activity) => (
                      <article key={activity.provider_activity_id} className="athlete-portal-health-activity bevel">
                        <div className="athlete-portal-health-activity-head">
                          <span className="athlete-portal-health-sport-dot" style={{ backgroundColor: activity.sport_color }} />
                          <strong>{activity.name}</strong>
                        </div>
                        <p>{activity.sport_label} · {formatDate(activity.started_at)}</p>
                        <small>
                          {formatDistanceKm(activity.distance_m)} · {formatSecondsToClock(activity.moving_time_seconds)}
                          {typeof activity.average_heartrate === "number" ? ` · ${Math.round(activity.average_heartrate)} bpm` : ""}
                          {typeof activity.average_watts === "number" ? ` · ${Math.round(activity.average_watts)} W` : ""}
                        </small>
                      </article>
                    ))
                  ) : (
                    <div className="athlete-portal-health-empty">La actividad no se carga en el overview rápido. Si quieres auditarla, usa el bloque Garmin de abajo.</div>
                  )}
                </div>
              </article>
            </div>
          </>
        ) : (
          <div className="athlete-portal-health-empty">Todavía no hay una capa de salud Garmin conectada disponible.</div>
        )}
      </section>

      <section className="card athlete-portal-garmin-panel">
        <div className="athlete-portal-section-head">
          <div>
            <span className="eyebrow">Garmin deep dive</span>
            <h2>Actividades Garmin en segundo plano</h2>
            <p className="muted">La parte importante arriba es wellness. Aquí abajo dejamos la exploración de actividades y su payload completo por si quieres auditarlo también.</p>
          </div>
          <div className="athlete-portal-garmin-actions">
            <button type="button" className="ghost-button" onClick={() => setGarminLoginOpen((current) => !current)}>
              {garminLoginOpen ? "Cerrar login" : analysis.athlete.garmin_connected ? "Cambiar login Garmin" : "Login Garmin"}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleLoadGarminRaw()}
              disabled={garminPreviewLoading || !analysis.athlete.garmin_connected}
            >
              {garminPreviewLoading ? "Cargando Garmin..." : "Cargar lista + 1 detalle completo"}
            </button>
          </div>
        </div>

        {garminLoginOpen ? (
          <div className="athlete-portal-garmin-login-card">
            <label>
              <span className="athlete-portal-card-label">Email Garmin</span>
              <input type="email" value={garminEmail} onChange={(event) => setGarminEmail(event.target.value)} placeholder="usuario@correo.com" />
            </label>
            <label>
              <span className="athlete-portal-card-label">Password</span>
              <input type="password" value={garminPassword} onChange={(event) => setGarminPassword(event.target.value)} placeholder="Password Garmin" />
            </label>
            <label>
              <span className="athlete-portal-card-label">MFA</span>
              <input type="text" value={garminMfaCode} onChange={(event) => setGarminMfaCode(event.target.value)} placeholder="Opcional si Garmin lo pide" />
            </label>
            <div className="athlete-portal-garmin-login-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleGarminConnect()}
                disabled={garminConnectLoading || !garminEmail.trim() || !garminPassword.trim()}
              >
                {garminConnectLoading ? "Conectando..." : "Hacer login Garmin"}
              </button>
            </div>
            {garminConnectMessage ? <p>{garminConnectMessage}</p> : null}
            {garminConnectError ? <p className="error">{garminConnectError}</p> : null}
          </div>
        ) : null}

        {!analysis.athlete.garmin_connected ? (
          <div className="athlete-portal-health-empty">Haz login con Garmin para inspeccionar actividad y salud desde esta capa paralela.</div>
        ) : (
          <>
            {garminPreviewError ? <div className="athlete-portal-health-empty">{garminPreviewError}</div> : null}
            {garminPreview?.activities.length ? (
              <div className="athlete-portal-garmin-grid">
                <div className="athlete-portal-garmin-activity-list">
                  {garminPreview.activities.map((activity) => (
                    <button
                      key={activity.provider_activity_id}
                      type="button"
                      className={`athlete-portal-garmin-activity-card ${selectedGarminActivity?.provider_activity_id === activity.provider_activity_id ? "active" : ""}`}
                      onClick={() => void handleOpenGarminActivity(activity.provider_activity_id)}
                    >
                      <div className="athlete-portal-garmin-activity-head">
                        <span className={`strava-sport-pill ${sportToneClass(activity.sport_type)}`}>{sportLabel(activity.sport_type)}</span>
                        <small>{formatDateTime(activity.started_at)}</small>
                      </div>
                      <strong>{activity.name}</strong>
                      <p>{formatDistanceKm(activity.distance_m)} · {formatSecondsToClock(activity.moving_time_seconds)}</p>
                      <small>
                        {activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : "FC n/d"}
                        {activity.average_watts ? ` · ${Math.round(activity.average_watts)} W` : ""}
                      </small>
                    </button>
                  ))}
                </div>

                <div className="athlete-portal-garmin-detail">
                  {selectedGarminActivity ? (
                    <>
                      <div className="athlete-portal-garmin-hero">
                        <div>
                          <span className={`strava-sport-pill ${sportToneClass(selectedGarminActivity.sport_type)}`}>{sportLabel(selectedGarminActivity.sport_type)}</span>
                          <h3>{selectedGarminActivity.name}</h3>
                          <p>{formatDateTime(selectedGarminActivity.started_at)}</p>
                        </div>
                        <div className="athlete-portal-garmin-kpis">
                          <span><small>Distancia</small><strong>{formatDistanceKm(selectedGarminActivity.distance_m)}</strong></span>
                          <span><small>Tiempo</small><strong>{formatSecondsToClock(selectedGarminActivity.moving_time_seconds)}</strong></span>
                          <span><small>FC media</small><strong>{selectedGarminActivity.average_heartrate ? `${Math.round(selectedGarminActivity.average_heartrate)} bpm` : "n/d"}</strong></span>
                          <span><small>Potencia</small><strong>{selectedGarminActivity.average_watts ? `${Math.round(selectedGarminActivity.average_watts)} W` : "n/d"}</strong></span>
                        </div>
                      </div>

                      {garminActivityLoading ? <div className="athlete-portal-health-empty">Cargando detalle completo Garmin...</div> : null}
                      {garminActivityError ? <div className="athlete-portal-health-empty">{garminActivityError}</div> : null}

                      <div className="athlete-portal-garmin-parameters">
                        {selectedGarminFields.map((field) => (
                          <article key={field.key} className="athlete-portal-garmin-parameter-card">
                            <span className="athlete-portal-card-label">{field.label}</span>
                            <strong>{field.value}</strong>
                          </article>
                        ))}
                      </div>

                      <div className="athlete-portal-garmin-json-card">
                        <div className="athlete-portal-chart-head">
                          <span className="athlete-portal-card-label">JSON crudo</span>
                          <strong>Raw Garmin payload</strong>
                        </div>
                        <pre>{selectedGarminJson ?? "Sin raw_detail visible en esta actividad."}</pre>
                      </div>
                    </>
                  ) : (
                    <div className="athlete-portal-health-empty">Carga una actividad Garmin para ver todos sus parámetros.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="athlete-portal-health-empty">Pulsa “Cargar lista + 1 detalle completo” para traer varias actividades y abrir una con todo el payload real.</div>
            )}
          </>
        )}
      </section>

      <section className="card athlete-portal-performance-panel">
        <div className="athlete-portal-section-head">
          <div>
            <span className="eyebrow">Proyección</span>
            <h2>Cómo se traduce hoy tu rendimiento</h2>
            <p className="muted">Menos jerga, más lectura útil: referencias visibles para entender qué podrías sostener y hacia dónde te mueves.</p>
          </div>
        </div>
        <div className="athlete-portal-performance-grid">
          {featuredPrediction ? (
            <article className={`athlete-portal-performance-card featured ${estimateTypeClassName(featuredPrediction.estimate_type)}`}>
              <span className="athlete-portal-card-label">Referencia protagonista</span>
              <strong>{formatEstimateValue(featuredPrediction)}</strong>
              <p>{featuredPrediction.estimate_type} · {disciplineLabel(featuredPrediction.discipline)}</p>
              <small>{shortText(featuredPrediction.inputs_summary, 140)}</small>
              <div className="athlete-portal-performance-meta">
                <span>{featuredPrediction.reliability_label}</span>
                <span>{Math.round(featuredPrediction.confidence * 100)}% confianza</span>
              </div>
            </article>
          ) : (
            <article className="athlete-portal-performance-card featured empty">
              <span className="athlete-portal-card-label">Referencia protagonista</span>
              <strong>Sin predicción visible</strong>
              <p>Cuando entren más tests y más histórico, esta sección traducirá tu progreso a referencias mucho más claras.</p>
            </article>
          )}
          <div className="athlete-portal-performance-stack">
            {secondaryPredictions.map((estimate) => (
              <article key={`${estimate.discipline}-${estimate.estimate_type}`} className={`athlete-portal-performance-card ${estimateTypeClassName(estimate.estimate_type)}`}>
                <span className="athlete-portal-card-label">{estimate.estimate_type}</span>
                <strong>{formatEstimateValue(estimate)}</strong>
                <p>{shortText(estimate.inputs_summary, 86)}</p>
                <small>{estimate.reliability_label}</small>
              </article>
            ))}
            <article className="athlete-portal-performance-note">
              <span className="athlete-portal-card-label">Lectura rápida</span>
              <strong>{portalStatus.label}</strong>
              <p>{portalStatus.emphasis}</p>
              <small>{featuredPrediction ? `Referencia activa en ${disciplineLabel(featuredPrediction.discipline)}.` : "Aún no hay una referencia protagonista visible."}</small>
            </article>
          </div>
        </div>
      </section>

      <section className="card athlete-portal-lactate-panel">
        <div className="athlete-portal-section-head">
          <div>
            <span className="eyebrow">Lactato</span>
            <h2>Curva y umbrales en lenguaje claro</h2>
            <p className="muted">Puntos reales, ajuste visual y referencias LT1/LT2 para entender qué significa hoy tu test en la disciplina activa.</p>
          </div>
          <div className="athlete-portal-discipline-switch">
            {disciplineSnapshots.map((snapshot) => (
              <button
                key={snapshot.discipline}
                type="button"
                className={`athlete-portal-discipline-pill ${selectedSnapshot?.discipline === snapshot.discipline ? "active" : ""}`}
                onClick={() => setSelectedDiscipline(snapshot.discipline)}
              >
                {disciplineLabel(snapshot.discipline)}
              </button>
            ))}
          </div>
        </div>

        <div className="athlete-portal-lactate-grid">
          <div className="athlete-portal-chart-card">
            <div className="athlete-portal-chart-head">
              <span className="athlete-portal-card-label">Curva actual</span>
              <strong>{disciplineLabel(selectedSnapshot?.discipline || focusDiscipline)}</strong>
            </div>
            <div className="athlete-portal-lactate-chart">
              {lactateSeries.length >= 2 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={lactateSeries} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(16, 34, 42, 0.08)" />
                    <XAxis
                      type="number"
                      dataKey="load"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => formatLoadLabel(value, selectedSnapshot?.discipline || focusDiscipline)}
                      domain={["auto", "auto"]}
                      reversed={selectedSnapshot?.discipline !== "ciclismo"}
                    />
                    <YAxis
                      type="number"
                      dataKey="lactate"
                      tickLine={false}
                      axisLine={false}
                      width={46}
                      tickFormatter={(value) => `${value}`}
                      domain={[0, "auto"]}
                    />
                    <Tooltip content={({ active, payload }) => portalCurveTooltip(active, payload as Array<{ payload?: PortalCurvePoint; dataKey?: string }> | undefined, selectedSnapshot?.discipline || focusDiscipline)} />
                    {selectedSnapshot?.lt1 ? (
                      <ReferenceLine
                        x={selectedSnapshot.discipline === "ciclismo" ? selectedSnapshot.lt1.powerWatts ?? undefined : selectedSnapshot.lt1.paceSecondsPerKm ?? undefined}
                        stroke="#3156d3"
                        strokeWidth={2.6}
                        strokeDasharray="8 4"
                        label={{ value: "LT1", position: "insideTop", fill: "#3156d3", fontSize: 11 }}
                      />
                    ) : null}
                    {selectedSnapshot?.lt2 ? (
                      <ReferenceLine
                        x={selectedSnapshot.discipline === "ciclismo" ? selectedSnapshot.lt2.powerWatts ?? undefined : selectedSnapshot.lt2.paceSecondsPerKm ?? undefined}
                        stroke="#d26a36"
                        strokeWidth={2.6}
                        strokeDasharray="8 4"
                        label={{ value: "LT2", position: "insideTop", fill: "#d26a36", fontSize: 11 }}
                      />
                    ) : null}
                    <Line
                      type="monotone"
                      dataKey="lactate"
                      name="Lactato"
                      stroke="#2740c7"
                      strokeWidth={2.2}
                      dot={{ r: 3.8, strokeWidth: 0, fill: "#2740c7" }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="adjusted"
                      name="Ajuste visual"
                      stroke="#d84f3f"
                      strokeWidth={2.6}
                      dot={false}
                    />
                    <Scatter data={lactateSeries} fill="#101828" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="athlete-portal-chart-empty">Aún faltan más mediciones comparables para dibujar la curva de lactato y sus referencias.</div>
              )}
            </div>
            <div className="athlete-portal-lactate-legend">
              <span><i className="lactate" />Lactato real</span>
              <span><i className="adjusted" />Ajuste visual</span>
              <span><i className="lt1" />LT1</span>
              <span><i className="lt2" />LT2</span>
            </div>
          </div>

          <div className="athlete-portal-lactate-insights">
            <article className="athlete-portal-insight-card lt1">
              <span className="athlete-portal-card-label">LT1 actual</span>
              <strong>{renderThresholdValue(selectedSnapshot?.lt1, focusDiscipline)}</strong>
              <p>{latestAnchor ? `Ancla de lactato: ${formatLactateValue(latestAnchor.value)}` : "Sin ancla reciente visible."}</p>
            </article>
            <article className="athlete-portal-insight-card lt2">
              <span className="athlete-portal-card-label">LT2 actual</span>
              <strong>{renderThresholdValue(selectedSnapshot?.lt2, focusDiscipline)}</strong>
              <p>{selectedSnapshot?.lt2?.lactate ? `Lactato asociado: ${formatLactateValue(selectedSnapshot.lt2.lactate)}` : "Sin lactato LT2 visible."}</p>
            </article>
            <article className="athlete-portal-insight-card peak">
              <span className="athlete-portal-card-label">VLaMax proxy</span>
              <strong>{vlamaxEstimate ? formatEstimateValue(vlamaxEstimate) : latestPeak ? formatLactateValue(latestPeak.value) : "n/d"}</strong>
              <p>{vlamaxEstimate ? vlamaxEstimate.inputs_summary : "Mientras no haya estimación longitudinal, usamos el pico de lactato del test como proxy visible."}</p>
            </article>
            <article className="athlete-portal-insight-card narrative">
              <span className="athlete-portal-card-label">Qué significa</span>
              <strong>{latestInterpretation[0] ?? "Tu portal irá explicando estas señales con más claridad cuando haya más histórico."}</strong>
              <p>{latestInterpretation[1] ?? "La idea es que entiendas tu evolución sin tener que descifrar una curva de laboratorio."}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="athlete-portal-story-grid">
        <article className="card athlete-portal-week-card">
          <div className="athlete-portal-section-head compact">
            <div>
              <span className="eyebrow">Actividad reciente</span>
              <h2>Lo último que ha entrado en tu dashboard</h2>
            </div>
          </div>
          <div className="athlete-portal-balance-grid">
            {disciplineSnapshots.map((snapshot) => (
              <article key={snapshot.discipline} className="athlete-portal-balance-card">
                <div className="athlete-portal-balance-head">
                  <span className="athlete-portal-discipline-dot" style={{ backgroundColor: disciplineAccent(snapshot.discipline) }} />
                  <strong>{disciplineLabel(snapshot.discipline)}</strong>
                </div>
                <p>{snapshot.weeklySessions} sesiones en 7 días</p>
                <small>{snapshot.latestSession ? `Última: ${formatDate(snapshot.latestSession.performed_at)}` : "Sin sesiones recientes visibles"}</small>
              </article>
            ))}
          </div>
          <div className="athlete-portal-recent-feed">
            {recentFeed.length ? (
              recentFeed.map((session) => (
                <article key={session.id} className="athlete-portal-feed-item">
                  <span className="athlete-portal-card-label">{disciplineLabel(session.discipline)}</span>
                  <strong>{session.session_type}</strong>
                  <p>{session.goal}</p>
                  <small>{formatDate(session.performed_at)}</small>
                </article>
              ))
            ) : (
              <div className="athlete-portal-chart-empty">Cuando entren más actividades, aparecerán aquí ordenadas por disciplina.</div>
            )}
          </div>
        </article>

        <article className="card athlete-portal-guidance-card">
          <div className="athlete-portal-section-head compact">
            <div>
              <span className="eyebrow">Roadmap</span>
              <h2>Lo que no deberías perder de vista</h2>
            </div>
          </div>
          <div className="athlete-portal-guidance-stack">
            <article className="athlete-portal-guidance-item">
              <span className="athlete-portal-card-label">Bloque activo</span>
              <strong>{activeBlock?.block_intent ?? "Todavía no hay mensaje visible del bloque."}</strong>
              <p>{activeBlock?.evaluation?.recommendation ?? "Aquí verás una traducción clara de lo que está buscando tu entrenador en este bloque."}</p>
            </article>
            {coachSignals.length ? coachSignals.map((signal) => (
              <article key={signal} className="athlete-portal-guidance-item">
                <span className="athlete-portal-card-label">Lectura del sistema</span>
                <strong>{signal}</strong>
              </article>
            )) : null}
            {upcomingTargets.map((target) => (
              <article key={target.id} className="athlete-portal-guidance-item">
                <span className="athlete-portal-card-label">Objetivo</span>
                <strong>{buildTargetObjective({ category: target.distance_category, distanceLabel: target.distance_label, fallback: target.objective })}</strong>
                <p>{`${disciplineLabel(target.discipline)} · ${formatDate(target.target_date)}`}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="card athlete-portal-section athlete-portal-discipline-section">
        <div className="athlete-portal-section-head">
          <div>
            <span className="eyebrow">Vista por disciplina</span>
            <h2>Referencias y progreso</h2>
          </div>
        </div>
        <div className="athlete-discipline-grid athlete-discipline-grid-portal">
          {disciplineSnapshots.map((snapshot) => (
            <article key={snapshot.discipline} className="athlete-discipline-card athlete-discipline-card-portal">
              <div className="athlete-discipline-head">
                <div>
                  <strong>{disciplineLabel(snapshot.discipline)}</strong>
                  <span>{formatDate(snapshot.view.latest_snapshot_date)}</span>
                </div>
                <span className="athlete-portal-discipline-badge" style={{ backgroundColor: `${disciplineAccent(snapshot.discipline)}16`, color: disciplineAccent(snapshot.discipline) }}>
                  {snapshot.weeklySessions} / semana
                </span>
              </div>
              <div className="athlete-discipline-kpis">
                <div>
                  <small>LT1</small>
                  <strong>{renderThresholdValue(snapshot.lt1, snapshot.discipline)}</strong>
                </div>
                <div>
                  <small>LT2</small>
                  <strong>{renderThresholdValue(snapshot.lt2, snapshot.discipline)}</strong>
                </div>
                <div>
                  <small>Referencia</small>
                  <strong>{snapshot.estimate ? formatTarget(snapshot.estimate) : "n/d"}</strong>
                </div>
              </div>
              <div className="athlete-discipline-chart">
                {snapshot.trend.length >= 2 ? (
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={snapshot.trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.08)" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={16} />
                      <YAxis hide domain={["dataMin", "dataMax"]} reversed={snapshot.discipline !== "ciclismo"} />
                      <Tooltip
                        formatter={(value: number) => formatTrendValue(value, snapshot.discipline)}
                        labelFormatter={(label) => `Fecha: ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={disciplineAccent(snapshot.discipline)}
                        strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="athlete-discipline-chart-empty">Aún faltan más referencias para ver la evolución.</div>
                )}
              </div>
              <p className="athlete-discipline-footnote">
                {snapshot.estimate
                  ? `${snapshot.estimate.estimate_type}: ${formatEstimateValue(snapshot.estimate)}`
                  : "Estas referencias se actualizarán cuando entren más sesiones comparables."}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="card athlete-portal-section athlete-portal-goals-section">
        <div className="athlete-portal-section-head">
          <div>
            <span className="eyebrow">Objetivos</span>
            <h2>Hoja de ruta</h2>
          </div>
        </div>
        <div className="athlete-target-grid athlete-target-grid-portal">
          {upcomingTargets.length ? (
            upcomingTargets.map((target) => (
              <article key={target.id} className="athlete-target-card athlete-target-card-portal">
                <span className="athlete-target-date">{formatDate(target.target_date)}</span>
                <strong>{buildTargetObjective({ category: target.distance_category, distanceLabel: target.distance_label, fallback: target.objective })}</strong>
                <p>{disciplineLabel(target.discipline)}</p>
                {target.distance_label ? <p>{target.distance_label}</p> : null}
                {target.target_pace_label ? <p>Ritmo objetivo: {target.target_pace_label}</p> : null}
                {target.target_running_pace_label ? <p>Carrera: {target.target_running_pace_label}</p> : null}
                {target.target_swim_pace_label ? <p>Natación: {target.target_swim_pace_label}</p> : null}
                {typeof target.target_cycling_power_watts === "number" ? <p>Ciclismo: {Math.round(target.target_cycling_power_watts)} W</p> : null}
              </article>
            ))
          ) : (
            <p className="muted">Todavía no hay objetivos visibles para ti.</p>
          )}
        </div>
      </section>
    </div>
  );
}
