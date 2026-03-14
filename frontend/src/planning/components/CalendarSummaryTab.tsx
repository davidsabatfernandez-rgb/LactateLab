import { useMemo } from "react";
import { Link } from "react-router-dom";

import type { Athlete, AthleteAnalysis } from "../../types";
import type { RosterProgressRow } from "../types";
import {
  averageConfidenceLabel,
  buildConfidenceBars,
  buildRecentLoadBars,
  disciplineLabel,
  formatBlockMetricQuickview,
  formatDate,
  formatThresholdQuickRows,
  nextTargetLabelFromAthlete,
  normalizeDisciplineKey,
  progressDirectionLabel,
  progressTone,
  resolveAnalysisDisciplineView,
} from "../utils";

type CalendarSummaryTabProps = {
  athletes: Athlete[];
  athleteAnalysis: AthleteAnalysis | null;
  rosterAnalyses: Record<number, AthleteAnalysis | null>;
  rosterAnalysesLoading: boolean;
  selectedDiscipline: string;
  selectedAthlete: Athlete | null;
  openCalendarWorkspaceTab: (tab: "athletes" | "library" | "calendar" | "summary") => void;
  updatePlanningRoute: (nextAthleteId: string, nextDiscipline: string) => void;
};

export function CalendarSummaryTab({
  athletes,
  athleteAnalysis,
  rosterAnalyses,
  rosterAnalysesLoading,
  selectedDiscipline,
  selectedAthlete,
  openCalendarWorkspaceTab,
  updatePlanningRoute,
}: CalendarSummaryTabProps) {
  const rosterProgressRows = useMemo<RosterProgressRow[]>(() => athletes.map((athlete) => {
    const analysis = athlete.id === selectedAthlete?.id ? athleteAnalysis : rosterAnalyses[athlete.id] ?? null;
    const thresholdDiscipline = normalizeDisciplineKey(athlete.primary_discipline);
    const thresholdSource = resolveAnalysisDisciplineView(analysis, thresholdDiscipline)
      ?? (normalizeDisciplineKey(selectedDiscipline) === thresholdDiscipline ? analysis : null)
      ?? analysis;
    const evaluation = analysis?.active_focus_block?.evaluation ?? analysis?.focus_block_evaluations?.[0] ?? null;
    const direction = evaluation?.direction ?? analysis?.trends?.[0]?.direction ?? null;
    const summary = evaluation?.summary
      ?? analysis?.trends?.[0]?.summary
      ?? analysis?.interpretation?.[0]
      ?? athlete.training_goal
      ?? "Sin suficiente señal longitudinal todavía.";
    const activeBlock = athlete.focus_blocks?.find((block) => block.status === "active");
    const blockMetric = formatBlockMetricQuickview(evaluation);
    const thresholdRows = formatThresholdQuickRows(thresholdSource, thresholdDiscipline);

    return {
      athlete,
      tone: progressTone(direction),
      directionLabel: progressDirectionLabel(direction),
      summary,
      snapshotLabel: analysis?.latest_snapshot_date ? formatDate(analysis.latest_snapshot_date) : "Sin snapshot",
      confidenceLabel: averageConfidenceLabel(analysis),
      currentBlock: activeBlock ? `${activeBlock.energy_system_focus} · ${activeBlock.block_objective}` : "Sin bloque activo",
      nextTarget: nextTargetLabelFromAthlete(athlete),
      quickLoadBars: buildRecentLoadBars(analysis?.recent_sessions),
      confidenceBars: buildConfidenceBars(analysis),
      blockMetricLabel: blockMetric.label,
      blockMetricHint: blockMetric.hint,
      thresholdDisciplineLabel: disciplineLabel(thresholdDiscipline),
      lt1Label: thresholdRows.lt1Label,
      lt1Hint: thresholdRows.lt1Hint,
      lt2Label: thresholdRows.lt2Label,
      lt2Hint: thresholdRows.lt2Hint,
    };
  }), [athleteAnalysis, athletes, rosterAnalyses, selectedAthlete, selectedDiscipline]);

  const selectedRosterRow = useMemo(
    () => rosterProgressRows.find((row) => row.athlete.id === selectedAthlete?.id) ?? rosterProgressRows[0] ?? null,
    [rosterProgressRows, selectedAthlete?.id],
  );

  const rosterProgressStats = useMemo(() => {
    const improving = rosterProgressRows.filter((row) => row.tone === "positive").length;
    const warning = rosterProgressRows.filter((row) => row.tone === "warning").length;
    return { improving, warning, stable: rosterProgressRows.length - improving - warning };
  }, [rosterProgressRows]);

  return (
    <>
      <div className="planning-calendar-app-toolbar">
        <div className="planning-calendar-toolbar-left">
          <div className="planning-calendar-toolbar-heading">
            <strong>Resumen de progresión</strong>
            <p>Lectura rápida de cómo evolucionan tus atletas y quién necesita atención primero.</p>
          </div>
        </div>
        <div className="planning-calendar-toolbar-center">
          <button type="button" className="planning-calendar-athlete-chip">
            {rosterAnalysesLoading ? "Actualizando..." : `${rosterProgressRows.length} atletas`}
          </button>
        </div>
        <div className="planning-calendar-toolbar-right">
          <button type="button" className="planning-inline-action" onClick={() => openCalendarWorkspaceTab("athletes")}>
            Cambiar atleta
          </button>
        </div>
      </div>

      <div className="planning-calendar-app-content">
        <section className="planning-calendar-app-main planning-workspace-main">
          <div className="planning-workspace-grid planning-summary-grid">
            {rosterProgressRows.map((row) => {
              const athleteDiscipline = row.athlete.primary_discipline === "triatlón" ? "running" : row.athlete.primary_discipline ?? "running";
              return (
                <article
                  key={row.athlete.id}
                  className={`planning-workspace-card planning-summary-card rich ${row.tone}`}
                >
                  <div className="planning-athlete-selection-head">
                    <div>
                      <span className="planning-kicker">{disciplineLabel(row.athlete.primary_discipline)}</span>
                      <strong>{row.athlete.name}</strong>
                    </div>
                    <span className={`status-badge ${row.tone === "positive" ? "positive" : row.tone === "warning" ? "warning" : "neutral"}`}>
                      {row.directionLabel}
                    </span>
                  </div>
                  <p>{row.summary}</p>
                  <div className="planning-summary-quickviews">
                    <article className="planning-summary-quickview">
                      <div className="planning-summary-quickview-head">
                        <span>Actividad 7d</span>
                        <strong>{row.quickLoadBars.filter((bar) => bar.value > 0).length} días activos</strong>
                      </div>
                      <div className="planning-summary-mini-bars">
                        {row.quickLoadBars.map((bar) => (
                          <div key={`${row.athlete.id}-${bar.label}-load`} className={`planning-summary-mini-bar ${bar.tone}`}>
                            <span style={{ height: `${Math.max(18, Math.round(bar.value * 100))}%` }} />
                            <small>{bar.label}</small>
                          </div>
                        ))}
                      </div>
                    </article>
                    <article className="planning-summary-quickview thresholds">
                      <div className="planning-summary-quickview-head">
                        <span>LT1 / LT2</span>
                        <strong>{row.thresholdDisciplineLabel}</strong>
                      </div>
                      <div className="planning-summary-threshold-stack">
                        <div className="planning-summary-threshold-row">
                          <small>LT1</small>
                          <strong>{row.lt1Label}</strong>
                          <span>{row.lt1Hint}</span>
                        </div>
                        <div className="planning-summary-threshold-row">
                          <small>LT2</small>
                          <strong>{row.lt2Label}</strong>
                          <span>{row.lt2Hint}</span>
                        </div>
                      </div>
                    </article>
                    <article className="planning-summary-quickview">
                      <div className="planning-summary-quickview-head">
                        <span>Quick view</span>
                        <strong>{row.blockMetricLabel}</strong>
                      </div>
                      <div className="planning-summary-mini-bars compact">
                        {row.confidenceBars.map((bar) => (
                          <div key={`${row.athlete.id}-${bar.label}-confidence`} className={`planning-summary-mini-bar ${bar.tone}`}>
                            <span style={{ height: `${Math.max(18, Math.round(bar.value * 100))}%` }} />
                            <small>{bar.label}</small>
                          </div>
                        ))}
                      </div>
                      <p className="planning-summary-quickview-note">{row.blockMetricHint}</p>
                    </article>
                  </div>
                  <div className="planning-athlete-selection-meta">
                    <article>
                      <small>Snapshot</small>
                      <strong>{row.snapshotLabel}</strong>
                    </article>
                    <article>
                      <small>Confidence</small>
                      <strong>{row.confidenceLabel}</strong>
                    </article>
                    <article>
                      <small>Objetivo</small>
                      <strong>{row.nextTarget}</strong>
                    </article>
                  </div>
                  <div className="planning-summary-actions">
                    <button
                      type="button"
                      className="planning-inline-action"
                      onClick={() => {
                        updatePlanningRoute(String(row.athlete.id), athleteDiscipline);
                        openCalendarWorkspaceTab("calendar");
                      }}
                    >
                      Ver calendario
                    </button>
                    <Link className="ghost-button" to={`/athletes/${row.athlete.id}`}>
                      Abrir ficha
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="planning-calendar-app-summary">
          <div className="planning-calendar-summary-panel">
            <span className="planning-kicker">Estado global</span>
            <div className="planning-calendar-summary-stats">
              <article>
                <small>Mejorando</small>
                <strong>{rosterProgressStats.improving}</strong>
              </article>
              <article>
                <small>Estables</small>
                <strong>{rosterProgressStats.stable}</strong>
              </article>
              <article>
                <small>A vigilar</small>
                <strong>{rosterProgressStats.warning}</strong>
              </article>
              <article>
                <small>Atleta activo</small>
                <strong>{selectedAthlete?.name || "Sin atleta"}</strong>
              </article>
            </div>
          </div>

          <div className="planning-calendar-day-panel">
            <span className="planning-kicker">Foco actual</span>
            <div className="planning-day-stack">
              <article className="planning-day-card">
                <strong>{selectedRosterRow?.currentBlock || "Sin bloque activo"}</strong>
                <p>{selectedRosterRow?.summary || "Selecciona un atleta para ver más contexto."}</p>
              </article>
              {selectedRosterRow ? (
                <article className="planning-day-card">
                  <span className="planning-kicker">Quick view LT1 / LT2</span>
                  <div className="planning-summary-threshold-stack compact">
                    <div className="planning-summary-threshold-row">
                      <small>LT1</small>
                      <strong>{selectedRosterRow.lt1Label}</strong>
                      <span>{selectedRosterRow.lt1Hint}</span>
                    </div>
                    <div className="planning-summary-threshold-row">
                      <small>LT2</small>
                      <strong>{selectedRosterRow.lt2Label}</strong>
                      <span>{selectedRosterRow.lt2Hint}</span>
                    </div>
                  </div>
                  <p className="planning-summary-quickview-note">{selectedRosterRow.blockMetricHint}</p>
                  <Link className="ghost-button" to={`/athletes/${selectedRosterRow.athlete.id}`}>
                    Abrir ficha del atleta
                  </Link>
                </article>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
