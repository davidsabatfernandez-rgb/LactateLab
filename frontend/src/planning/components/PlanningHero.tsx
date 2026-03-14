import { Link } from "react-router-dom";
import type { Athlete, AthleteTarget } from "../../types";
import { disciplineLabel, firstName, formatDate, formatTargetCountdown, targetMetricLabel, targetPrimaryValue } from "../utils";

type PlanningHeroProps = {
  overview: { athlete_name: string; athlete_id: number } | null;
  athletes: Athlete[];
  athleteId: string | null;
  selectedDiscipline: string;
  availableDisciplines: string[];
  visibleTargets: AthleteTarget[];
  onAthleteChange: (athleteId: string, discipline: string) => void;
};

export function PlanningHero({
  overview,
  athletes,
  athleteId,
  selectedDiscipline,
  availableDisciplines,
  visibleTargets,
  onAthleteChange,
}: PlanningHeroProps) {
  return (
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
                  onAthleteChange(nextAthleteId, nextDiscipline);
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
                  onAthleteChange(athleteId, discipline);
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
                <span>{formatDate(target.target_date)}</span>
                <span>{formatTargetCountdown(target.target_date)} · {targetMetricLabel(target)}</span>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
