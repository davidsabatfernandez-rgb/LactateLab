import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

import { api } from "../lib/api";
import { Athlete, AthleteAnalysis, HistoricalPoint } from "../types";

type DashboardPageProps = {
  athletes: Athlete[];
  token: string;
};

type AthleteAnalysisMap = Record<number, AthleteAnalysis>;

function disciplineLabel(value: string) {
  if (value === "ciclismo") return "Ciclismo";
  if (value === "triatlón") return "Triatlón";
  if (value === "natación") return "Natación";
  return "Carrera a pie";
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

export function DashboardPage({ athletes, token }: DashboardPageProps) {
  const [analysisMap, setAnalysisMap] = useState<AthleteAnalysisMap>({});

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
        return { athlete, analysis, disciplines, activeBlocks, nextTarget };
      }),
    [analysisMap, athletes],
  );

  return (
    <div className="page-grid">
      <section className="card lab-athlete-list-card">
        <div className="card-header">
          <div>
            <span className="eyebrow">Lab</span>
            <h2>Vista rápida de atletas</h2>
          </div>
        </div>

        <div className="lab-athlete-list">
          {rows.map(({ athlete, analysis, disciplines, activeBlocks, nextTarget }) => (
            <article key={athlete.id} className="lab-athlete-row">
              <div className="lab-athlete-meta">
                <div>
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
                <div className="chip-list">
                  {(activeBlocks.length ? activeBlocks : [{ block_objective: "Sin foco", priority_discipline: athlete.primary_discipline } as never]).map((block, index) => (
                    <span key={`${athlete.id}-${index}`} className={`status-badge ${activeBlocks.length ? "medium" : "neutral"}`}>
                      {block.block_objective} · {disciplineLabel(block.priority_discipline ?? athlete.primary_discipline)}
                    </span>
                  ))}
                </div>
                <Link className="inline-link" to={`/athletes/${athlete.id}`}>
                  Abrir atleta
                </Link>
              </div>

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
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
