import { useMemo } from "react";

import type { PlanningMesocycleDraftSession, PlanningOverview } from "../../types";
import type { ResolvedTrainingThreshold } from "../../lib/trainingThresholds";
import { buildPlanningPrescriptionHint } from "../utils";
import { SESSION_ROLE_LABEL } from "../utils-workout";
import { MesocycleTimeline, type TimelineWeek } from "./MesocycleTimeline";

type DraftPreviewProps = {
  draft: NonNullable<PlanningOverview["mesocycle_draft"]>;
  selectedDiscipline: string;
  planningLt1: ResolvedTrainingThreshold | null;
  planningLt2: ResolvedTrainingThreshold | null;
  onOpenSession: (session: PlanningMesocycleDraftSession) => void;
};

export function DraftPreview({
  draft,
  selectedDiscipline,
  planningLt1,
  planningLt2,
  onOpenSession,
}: DraftPreviewProps) {
  const timelineWeeks = useMemo<TimelineWeek[]>(() => {
    return draft.weeks.map((w) => ({
      weekIndex: w.week_index,
      label: `S${w.week_index}`,
      theme: w.theme,
      loadType: w.load_type,
      loadFactor: w.load_factor,
    }));
  }, [draft.weeks]);

  return (
    <section className="card section-card planning-card planning-draft-section">
      <div className="section-heading compact">
        <span className="eyebrow">Propuesta generada</span>
        <h2 className="section-title">Borrador del bloque</h2>
        {draft.state_summary && (
          <p className="section-sub">{draft.state_summary}</p>
        )}
      </div>
      <MesocycleTimeline weeks={timelineWeeks} />
      <div className="planning-draft-grid">
        {draft.weeks.map((week) => {
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
                {week.load_factor_pct && (
                  <span className="planning-load-factor-badge" title={`Carga semanal: ${week.load_factor_pct}`}>
                    {week.load_factor_pct}
                  </span>
                )}
                {week.total_planned_duration_min != null && week.total_planned_duration_min > 0 && (
                  <span className="planning-duration-badge" title="Duración total planificada">
                    {week.total_planned_duration_min}min
                  </span>
                )}
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
                      onClick={() => onOpenSession(session)}
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
                        {session.available_alternatives && session.available_alternatives.length > 0 && (
                          <div className="session-alternatives-hint">
                            <small className="alternatives-label">Alternativas:</small>
                            {session.available_alternatives.map((alt) => (
                              <small key={alt.template_id} className="alternative-chip" title={alt.summary}>
                                {alt.public_label} (fc={alt.fatigue_cost})
                              </small>
                            ))}
                          </div>
                        )}
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
      {draft.progression_rules.length > 0 && (
        <div className="planning-draft-rules">
          {draft.progression_rules.map((rule) => (
            <small key={rule}>→ {rule}</small>
          ))}
        </div>
      )}
    </section>
  );
}
