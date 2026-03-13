import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { buildTargetObjective } from "../lib/targetCatalog";
import {
  ResolvedTrainingThreshold,
  resolveAnalysisDisciplineView,
  resolveTrainingThreshold,
} from "../lib/trainingThresholds";
import {
  Athlete,
  AthleteAnalysis,
  AthleteFocusBlock,
  AthleteFocusBlockEvaluation,
  AthleteTarget,
} from "../types";

/* ── Props ─────────────────────────────────────────────────── */
type CoachDashboardPageProps = {
  athletes: Athlete[];
  token: string;
};

/* ── Alert model ───────────────────────────────────────────── */
type AlertPriority = 0 | 1 | 2 | 3 | 4;
type AlertColor = "red" | "orange" | "yellow";

type CoachAlert = {
  athleteId: number;
  athleteName: string;
  priority: AlertPriority;
  color: AlertColor;
  label: string;
  detail: string;
  linkTo: string;
};

/* ── Discipline snapshot ───────────────────────────────────── */
type DisciplineSnapshot = {
  discipline: string;
  lt2: ResolvedTrainingThreshold | null;
  lt1: ResolvedTrainingThreshold | null;
  confidence: number | null;
  lastTestDate: string | null;
  lastTestDaysAgo: number | null;
  trend: "improving" | "stable" | "declining" | null;
};

/* ── Athlete card model ────────────────────────────────────── */
type AthleteCard = {
  athlete: Athlete;
  analysis: AthleteAnalysis | null;
  disciplines: DisciplineSnapshot[];
  activeBlock: (AthleteFocusBlock & { evaluation?: AthleteFocusBlockEvaluation }) | null;
  nextTarget: { label: string; daysRemaining: number | null } | null;
  targets: AthleteTarget[];
  alerts: CoachAlert[];
  urgency: "red" | "orange" | "green";
  averageConfidence: number | null;
  latestSessionDate: string | null;
};

/* ── Filter ────────────────────────────────────────────────── */
type FilterMode = "all" | "running" | "ciclismo" | "triatlón" | "natación" | "alerts";

/* ── Helpers ───────────────────────────────────────────────── */
function daysFromToday(value?: string | null): number | null {
  if (!value) return null;
  const today = new Date();
  const target = new Date(value);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - target.getTime()) / 86400000);
}

function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  const today = new Date();
  const target = new Date(value);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatPace(seconds: number): string {
  const rounded = Math.round(seconds);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "n/d";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(value));
}

function recencyLabel(daysAgo: number | null): string {
  if (daysAgo == null) return "Sin test";
  if (daysAgo <= 0) return "Hoy";
  if (daysAgo === 1) return "Ayer";
  return `${daysAgo}d`;
}

function disciplineLabel(d: string): string {
  const map: Record<string, string> = {
    running: "Running",
    ciclismo: "Ciclismo",
    natación: "Natación",
    "triatlón": "Triatlón",
  };
  return map[d] ?? d;
}

function disciplineAbbrev(d: string): string {
  const map: Record<string, string> = {
    running: "RUN",
    ciclismo: "BIKE",
    natación: "NAT",
  };
  return map[d] ?? d.toUpperCase().slice(0, 4);
}

function disciplineColorClass(d: string): string {
  if (d === "natación") return "cd-disc-swim";
  if (d === "ciclismo") return "cd-disc-bike";
  return "cd-disc-run";
}

function formatThresholdValue(th: ResolvedTrainingThreshold | null, discipline: string): string {
  if (!th) return "n/d";
  if (discipline === "ciclismo" && typeof th.powerWatts === "number") {
    return `${Math.round(th.powerWatts)}W`;
  }
  if (discipline === "natación" && typeof th.paceSecondsPerKm === "number") {
    return `${formatPace(th.paceSecondsPerKm / 10)}/100m`;
  }
  if (typeof th.paceSecondsPerKm === "number") {
    return `${formatPace(th.paceSecondsPerKm)}/km`;
  }
  if (typeof th.powerWatts === "number") {
    return `${Math.round(th.powerWatts)}W`;
  }
  return "n/d";
}

function formatTargetForDiscipline(targets: AthleteTarget[], discipline: string): string | null {
  // Find the next upcoming target matching this discipline
  const matching = targets
    .filter((t) => {
      if (!t.target_date) return false;
      const remaining = daysUntil(t.target_date);
      if (remaining == null || remaining < 0) return false;
      // Match discipline or triathlon targets to any sub-discipline
      if (t.discipline === discipline) return true;
      if (t.discipline === "triatlón") return true;
      return false;
    })
    .sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)));
  const target = matching[0];
  if (!target) return null;
  if (discipline === "ciclismo" && target.target_cycling_power_watts) {
    return `${Math.round(target.target_cycling_power_watts)}W`;
  }
  if (discipline === "natación" && target.target_swim_pace_label) {
    return target.target_swim_pace_label;
  }
  if (discipline === "running" && target.target_running_pace_label) {
    return target.target_running_pace_label;
  }
  if (target.target_pace_label) return target.target_pace_label;
  if (target.target_power_watts) return `${Math.round(target.target_power_watts)}W`;
  return null;
}

function trendArrow(trend: string | null): string {
  if (trend === "improving") return "\u2197";
  if (trend === "declining") return "\u2198";
  if (trend === "stable") return "\u2192";
  return "";
}

function trendClass(trend: string | null): string {
  if (trend === "improving") return "cd-trend-up";
  if (trend === "declining") return "cd-trend-down";
  return "cd-trend-flat";
}

function confLabel(value: number | null): string {
  if (value == null) return "";
  return `${Math.round(value * 100)}%`;
}

function confClass(value: number | null): string {
  if (value == null) return "";
  if (value >= 0.7) return "cd-conf-high";
  if (value >= 0.5) return "cd-conf-mid";
  return "cd-conf-low";
}

function avatarInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

/* ── Build athlete card data ───────────────────────────────── */
function buildDisciplineSnapshots(
  athlete: Athlete,
  analysis: AthleteAnalysis | null,
): DisciplineSnapshot[] {
  const triDisciplines = ["natación", "ciclismo", "running"];
  const disciplines =
    athlete.primary_discipline === "triatlón" ? triDisciplines : [athlete.primary_discipline];

  return disciplines.map((disc) => {
    const view = resolveAnalysisDisciplineView(analysis, disc);
    const lt2 = resolveTrainingThreshold(view ?? analysis ?? undefined, "LT2");
    const lt1 = resolveTrainingThreshold(view ?? analysis ?? undefined, "LT1");

    const lastTestDate = view?.latest_snapshot_date ?? null;
    const lastTestDaysAgo = daysFromToday(lastTestDate);

    // Determine trend from historical evolution
    let trend: "improving" | "stable" | "declining" | null = null;
    if (analysis?.trends?.length) {
      const lt2Trend = analysis.trends.find(
        (t) => t.metric.toLowerCase().includes("lt2") || t.metric.toLowerCase().includes("threshold"),
      );
      if (lt2Trend) {
        if (lt2Trend.direction === "improving" || lt2Trend.value > 0) trend = "improving";
        else if (lt2Trend.direction === "declining" || lt2Trend.value < 0) trend = "declining";
        else trend = "stable";
      }
    }

    const confValues =
      analysis?.confidence_summary?.map((c) => c.score).filter((v) => typeof v === "number") ?? [];
    const avgConf = confValues.length ? confValues.reduce((a, b) => a + b, 0) / confValues.length : null;

    return {
      discipline: disc,
      lt2,
      lt1,
      confidence: lt2?.confidence ?? avgConf,
      lastTestDate,
      lastTestDaysAgo,
      trend,
    };
  });
}

function buildAlerts(
  athlete: Athlete,
  analysis: AthleteAnalysis | null,
  disciplines: DisciplineSnapshot[],
): CoachAlert[] {
  const alerts: CoachAlert[] = [];
  const targets = (athlete.targets ?? [])
    .filter((t) => t.target_date)
    .sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)));
  const nextTarget = targets.find((t) => (daysUntil(t.target_date) ?? -1) >= 0);

  // P0: target imminent, no block
  if (nextTarget) {
    const remaining = daysUntil(nextTarget.target_date);
    const activeBlocks = (athlete.focus_blocks ?? []).filter((b) => b.status === "active");
    if (remaining != null && remaining < 14 && activeBlocks.length === 0) {
      alerts.push({
        athleteId: athlete.id,
        athleteName: athlete.name,
        priority: 0,
        color: "red",
        label: "Objetivo inminente sin bloque",
        detail: `${nextTarget.objective || nextTarget.discipline} en ${remaining}d`,
        linkTo: `/athletes/${athlete.id}/targets`,
      });
    }
  }

  // P1: block failing
  const activeBlock = analysis?.active_focus_block;
  if (activeBlock?.evaluation?.direction === "negative") {
    alerts.push({
      athleteId: athlete.id,
      athleteName: athlete.name,
      priority: 1,
      color: "red",
      label: "Bloque en regresion",
      detail: activeBlock.evaluation.summary || "La evaluacion muestra tendencia negativa",
      linkTo: `/planning?athlete=${athlete.id}`,
    });
  }

  // P2: stale thresholds (>40d)
  for (const d of disciplines) {
    if (d.lastTestDaysAgo != null && d.lastTestDaysAgo > 40) {
      alerts.push({
        athleteId: athlete.id,
        athleteName: athlete.name,
        priority: 2,
        color: "orange",
        label: `Test obsoleto (${disciplineAbbrev(d.discipline)})`,
        detail: `Ultimo test hace ${d.lastTestDaysAgo}d`,
        linkTo: `/athletes/${athlete.id}`,
      });
    }
  }

  // P3: low confidence
  const confValues =
    analysis?.confidence_summary?.map((c) => c.score).filter((v) => typeof v === "number") ?? [];
  const avgConf = confValues.length ? confValues.reduce((a, b) => a + b, 0) / confValues.length : null;
  if (avgConf != null && avgConf < 0.6) {
    alerts.push({
      athleteId: athlete.id,
      athleteName: athlete.name,
      priority: 3,
      color: "orange",
      label: "Confianza baja",
      detail: `Promedio ${Math.round(avgConf * 100)}%`,
      linkTo: `/athletes/${athlete.id}`,
    });
  }

  // P4: no connectivity
  if (!athlete.strava_connected && !athlete.garmin_connected) {
    alerts.push({
      athleteId: athlete.id,
      athleteName: athlete.name,
      priority: 4,
      color: "yellow",
      label: "Sin conectividad",
      detail: "Ni Strava ni Garmin conectados",
      linkTo: `/athletes/${athlete.id}`,
    });
  }

  return alerts.sort((a, b) => a.priority - b.priority);
}

function buildAthleteCard(
  athlete: Athlete,
  analysis: AthleteAnalysis | null,
): AthleteCard {
  const disciplines = buildDisciplineSnapshots(athlete, analysis);
  const alerts = buildAlerts(athlete, analysis, disciplines);
  const activeBlock = analysis?.active_focus_block ?? null;

  const targets = (athlete.targets ?? [])
    .filter((t) => t.target_date)
    .sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)));
  const nextTarget = targets.find((t) => (daysUntil(t.target_date) ?? -1) >= 0);
  const nextTargetSummary = nextTarget
    ? {
        label: buildTargetObjective({
          category: nextTarget.distance_category,
          distanceLabel: nextTarget.distance_label,
          fallback: nextTarget.objective || nextTarget.discipline,
        }),
        daysRemaining: daysUntil(nextTarget.target_date),
      }
    : null;

  const confValues =
    analysis?.confidence_summary?.map((c) => c.score).filter((v) => typeof v === "number") ?? [];
  const avgConf = confValues.length ? confValues.reduce((a, b) => a + b, 0) / confValues.length : null;

  const sessions = analysis?.recent_sessions ?? [];
  const latestSession = sessions.length
    ? [...sessions].sort((a, b) => String(b.performed_at).localeCompare(String(a.performed_at)))[0]
    : null;

  let urgency: "red" | "orange" | "green" = "green";
  if (alerts.some((a) => a.color === "red")) urgency = "red";
  else if (alerts.some((a) => a.color === "orange")) urgency = "orange";

  return {
    athlete,
    analysis,
    disciplines,
    activeBlock,
    nextTarget: nextTargetSummary,
    targets,
    alerts,
    urgency,
    averageConfidence: avgConf,
    latestSessionDate: latestSession?.performed_at ?? null,
  };
}

/* ── Component ─────────────────────────────────────────────── */
export function CoachDashboardPage({ athletes, token }: CoachDashboardPageProps) {
  const [analysisMap, setAnalysisMap] = useState<Record<number, AthleteAnalysis>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [compareIds, setCompareIds] = useState<Set<number>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);

  // Load analysis for all athletes in parallel
  useEffect(() => {
    if (!athletes.length) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.allSettled(
      athletes.map((a) =>
        api.athleteAnalysis(token, a.id).then((result) => ({ id: a.id, analysis: result as AthleteAnalysis })),
      ),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<number, AthleteAnalysis> = {};
      for (const r of results) {
        if (r.status === "fulfilled") {
          map[r.value.id] = r.value.analysis;
        }
      }
      setAnalysisMap(map);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [athletes, token]);

  // Build cards
  const cards = useMemo(() => {
    return athletes
      .map((a) => buildAthleteCard(a, analysisMap[a.id] ?? null))
      .sort((a, b) => {
        // Red first, then orange, then green
        const urgencyOrder = { red: 0, orange: 1, green: 2 };
        const diff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        if (diff !== 0) return diff;
        return a.athlete.name.localeCompare(b.athlete.name);
      });
  }, [athletes, analysisMap]);

  // Filtered cards
  const filteredCards = useMemo(() => {
    if (filter === "all") return cards;
    if (filter === "alerts") return cards.filter((c) => c.alerts.length > 0);
    return cards.filter((c) => c.athlete.primary_discipline === filter);
  }, [cards, filter]);

  // Aggregate alerts
  const allAlerts = useMemo(() => {
    return cards.flatMap((c) => c.alerts).sort((a, b) => a.priority - b.priority);
  }, [cards]);

  const alertCounts = useMemo(() => {
    let red = 0;
    let orange = 0;
    for (const a of allAlerts) {
      if (a.color === "red") red++;
      else if (a.color === "orange") orange++;
    }
    return { red, orange, total: allAlerts.length };
  }, [allAlerts]);

  // Comparison data
  const comparedCards = useMemo(() => {
    return cards.filter((c) => compareIds.has(c.athlete.id));
  }, [cards, compareIds]);

  function toggleCompare(id: number) {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 4) {
        next.add(id);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="cd-shell">
        <div className="cd-loading">Cargando dashboard del coach...</div>
      </div>
    );
  }

  return (
    <div className="cd-shell">
      {/* ── Command bar ──────────────────────────────────── */}
      <div className="cd-command-bar">
        <div className="cd-command-left">
          <span className="cd-roster-count">{athletes.length} atletas</span>
          {alertCounts.total > 0 && (
            <button
              type="button"
              className={`cd-alert-badge ${alertCounts.red > 0 ? "cd-alert-red" : "cd-alert-orange"}`}
              onClick={() => setFilter(filter === "alerts" ? "all" : "alerts")}
            >
              {alertCounts.total} requieren atencion
            </button>
          )}
        </div>
        <div className="cd-command-filters">
          {(["all", "running", "ciclismo", "triatlón", "natación", "alerts"] as FilterMode[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`cd-filter-btn ${filter === f ? "cd-filter-active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "Todos"
                : f === "alerts"
                  ? "Alertas"
                  : disciplineLabel(f)}
            </button>
          ))}
        </div>
        <div className="cd-command-right">
          {compareIds.size >= 2 && (
            <button
              type="button"
              className="cd-compare-btn"
              onClick={() => setCompareOpen(!compareOpen)}
            >
              Comparar ({compareIds.size})
            </button>
          )}
        </div>
      </div>

      {/* ── Alert banner ─────────────────────────────────── */}
      {allAlerts.length > 0 && filter !== "alerts" && (
        <div className="cd-alert-banner">
          <div className="cd-alert-banner-inner">
            {allAlerts.slice(0, 5).map((alert, i) => (
              <Link
                key={`${alert.athleteId}-${alert.priority}-${i}`}
                to={alert.linkTo}
                className={`cd-alert-item cd-alert-item-${alert.color}`}
              >
                <span className="cd-alert-name">{alert.athleteName}</span>
                <span className="cd-alert-label">{alert.label}</span>
              </Link>
            ))}
            {allAlerts.length > 5 && (
              <button
                type="button"
                className="cd-alert-more"
                onClick={() => setFilter("alerts")}
              >
                +{allAlerts.length - 5} mas
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Athlete grid ─────────────────────────────────── */}
      <div className="cd-grid">
        {filteredCards.map((card) => (
          <AthleteCardComponent
            key={card.athlete.id}
            card={card}
            isComparing={compareIds.has(card.athlete.id)}
            onToggleCompare={() => toggleCompare(card.athlete.id)}
          />
        ))}
        {filteredCards.length === 0 && (
          <div className="cd-empty">
            {filter === "alerts"
              ? "Sin alertas activas. Todos los atletas estan al dia."
              : "No hay atletas en esta categoria."}
          </div>
        )}
      </div>

      {/* ── Comparison drawer ────────────────────────────── */}
      {compareOpen && comparedCards.length >= 2 && (
        <ComparisonDrawer
          cards={comparedCards}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Athlete card component ────────────────────────────────── */
function AthleteCardComponent({
  card,
  isComparing,
  onToggleCompare,
}: {
  card: AthleteCard;
  isComparing: boolean;
  onToggleCompare: () => void;
}) {
  const { athlete, disciplines, activeBlock, nextTarget, targets, alerts, urgency } = card;

  return (
    <div className={`cd-card cd-urgency-${urgency}`}>
      {/* Card header */}
      <div className="cd-card-header">
        <div className="cd-avatar">{avatarInitial(athlete.name)}</div>
        <div className="cd-card-header-info">
          <div className="cd-card-name">
            <Link to={`/athletes/${athlete.id}`}>{athlete.name}</Link>
          </div>
          <div className="cd-card-meta">
            <span className={`cd-disc-badge ${disciplineColorClass(athlete.primary_discipline)}`}>
              {disciplineLabel(athlete.primary_discipline)}
            </span>
            {nextTarget && (
              <span className="cd-target-badge">
                {nextTarget.label}
                {nextTarget.daysRemaining != null && (
                  <span className={`cd-target-days ${nextTarget.daysRemaining < 14 ? "cd-target-urgent" : ""}`}>
                    {nextTarget.daysRemaining}d
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          className={`cd-compare-toggle ${isComparing ? "cd-compare-active" : ""}`}
          onClick={onToggleCompare}
          title="Comparar"
        >
          {isComparing ? "\u2713" : "+"}
        </button>
      </div>

      {/* Alert badges */}
      {alerts.length > 0 && (
        <div className="cd-card-alerts">
          {alerts.slice(0, 2).map((a, i) => (
            <Link
              key={i}
              to={a.linkTo}
              className={`cd-card-alert cd-card-alert-${a.color}`}
            >
              {a.label}
            </Link>
          ))}
          {alerts.length > 2 && (
            <span className="cd-card-alert cd-card-alert-muted">+{alerts.length - 2}</span>
          )}
        </div>
      )}

      {/* Discipline strip — LT1 | LT2 | Objetivo */}
      <div className="cd-discipline-strip">
        {/* Column headers */}
        <div className="cd-disc-header">
          <span className="cd-disc-abbrev"></span>
          <span className="cd-disc-col-label">LT1</span>
          <span className="cd-disc-col-label">LT2</span>
          <span className="cd-disc-col-label cd-col-target">Objetivo</span>
          <span className="cd-disc-col-label cd-col-conf">Conf</span>
          <span className="cd-disc-col-label cd-col-recency">Test</span>
        </div>
        {disciplines.map((d) => {
          const targetValue = formatTargetForDiscipline(targets, d.discipline);
          return (
            <div key={d.discipline} className={`cd-disc-row ${disciplineColorClass(d.discipline)}`}>
              <span className="cd-disc-abbrev">{disciplineAbbrev(d.discipline)}</span>
              <span className="cd-disc-value cd-disc-lt1">
                {formatThresholdValue(d.lt1, d.discipline)}
              </span>
              <span className="cd-disc-value cd-disc-lt2-val">
                {formatThresholdValue(d.lt2, d.discipline)}
                {d.trend && (
                  <span className={`cd-disc-trend ${trendClass(d.trend)}`}>{trendArrow(d.trend)}</span>
                )}
              </span>
              <span className="cd-disc-value cd-disc-target">
                {targetValue ?? <span className="cd-muted">--</span>}
              </span>
              {d.confidence != null ? (
                <span className={`cd-disc-conf ${confClass(d.confidence)}`}>
                  {confLabel(d.confidence)}
                </span>
              ) : (
                <span className="cd-disc-conf cd-muted">--</span>
              )}
              <span
                className={`cd-disc-recency ${
                  d.lastTestDaysAgo != null && d.lastTestDaysAgo > 40 ? "cd-disc-stale" : ""
                }`}
              >
                {recencyLabel(d.lastTestDaysAgo)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Card footer */}
      <div className="cd-card-footer">
        <div className="cd-card-block-info">
          {activeBlock ? (
            <>
              <span className="cd-block-label">
                {activeBlock.energy_system_focus || activeBlock.block_objective}
              </span>
              {activeBlock.phase && <span className="cd-block-phase">{activeBlock.phase}</span>}
              {activeBlock.evaluation && (
                <span
                  className={`cd-block-eval cd-eval-${
                    activeBlock.evaluation.direction === "positive"
                      ? "up"
                      : activeBlock.evaluation.direction === "negative"
                        ? "down"
                        : "flat"
                  }`}
                >
                  {activeBlock.evaluation.direction === "positive"
                    ? "\u2197"
                    : activeBlock.evaluation.direction === "negative"
                      ? "\u2198"
                      : "\u2192"}
                </span>
              )}
            </>
          ) : (
            <span className="cd-block-none">Sin bloque activo</span>
          )}
        </div>
        <div className="cd-card-actions">
          <Link to={`/athletes/${athlete.id}`} className="cd-action-btn">
            Ficha
          </Link>
          <Link to={`/planning?athlete=${athlete.id}`} className="cd-action-btn">
            Planning
          </Link>
          <Link
            to={`/athletes/${athlete.id}`}
            className="cd-action-btn"
            title="Generar reporte"
          >
            Reporte
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Comparison drawer ─────────────────────────────────────── */
function ComparisonDrawer({
  cards,
  onClose,
}: {
  cards: AthleteCard[];
  onClose: () => void;
}) {
  // Collect all disciplines across compared athletes
  const allDisciplines = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) {
      for (const d of c.disciplines) {
        set.add(d.discipline);
      }
    }
    return Array.from(set);
  }, [cards]);

  return (
    <div className="cd-compare-drawer">
      <div className="cd-compare-header">
        <h3>Comparacion de umbrales</h3>
        <button type="button" className="cd-compare-close" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <div className="cd-compare-table-wrap">
        <table className="cd-compare-table">
          <thead>
            <tr>
              <th>Disciplina</th>
              {cards.map((c) => (
                <th key={c.athlete.id}>{c.athlete.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allDisciplines.map((disc) => (
              <tr key={disc}>
                <td className="cd-compare-disc">
                  <span className={disciplineColorClass(disc)}>{disciplineAbbrev(disc)}</span>
                </td>
                {cards.map((c) => {
                  const snapshot = c.disciplines.find((d) => d.discipline === disc);
                  return (
                    <td key={c.athlete.id} className="cd-compare-cell">
                      {snapshot ? (
                        <>
                          <span className="cd-compare-lt1">
                            LT1 {formatThresholdValue(snapshot.lt1, disc)}
                          </span>
                          <span className="cd-compare-value">
                            LT2 {formatThresholdValue(snapshot.lt2, disc)}
                          </span>
                          {snapshot.trend && (
                            <span className={`cd-disc-trend ${trendClass(snapshot.trend)}`}>
                              {trendArrow(snapshot.trend)}
                            </span>
                          )}
                          <span className={`cd-disc-conf ${confClass(snapshot.confidence)}`}>
                            {confLabel(snapshot.confidence)}
                          </span>
                        </>
                      ) : (
                        <span className="cd-compare-na">--</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
