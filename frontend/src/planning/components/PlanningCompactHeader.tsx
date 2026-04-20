import { Link } from "react-router-dom";
import type { Athlete, AthleteTarget } from "../../types";
import type { ResolvedTrainingThreshold } from "../../lib/trainingThresholds";
import { disciplineLabel, formatThresholdPrimaryMetric, formatTargetCountdown, targetPrimaryValue } from "../utils";

type PlanningCompactHeaderProps = {
  overview: { athlete_name: string; athlete_id: number } | null;
  athletes: Athlete[];
  athleteId: string | null;
  selectedDiscipline: string;
  availableDisciplines: string[];
  visibleTargets: AthleteTarget[];
  planningLt1: ResolvedTrainingThreshold | null;
  planningLt2: ResolvedTrainingThreshold | null;
  activeBlockLabel: string;
  onAthleteChange: (athleteId: string, discipline: string) => void;
  showAllDisciplines?: boolean;
  onToggleAllDisciplines?: () => void;
};

export function PlanningCompactHeader({
  overview,
  athletes,
  athleteId,
  selectedDiscipline,
  availableDisciplines,
  visibleTargets,
  planningLt1,
  planningLt2,
  activeBlockLabel,
  onAthleteChange,
  showAllDisciplines,
  onToggleAllDisciplines,
}: PlanningCompactHeaderProps) {
  const nextTarget = visibleTargets[0] ?? null;

  return (
    <header className="planning-compact-header">
      <div className="planning-compact-left">
        <div className="planning-compact-athlete-row">
          {athletes.length > 1 ? (
            <select
              className="planning-compact-athlete-select"
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
          ) : (
            <span className="planning-compact-athlete-name">
              {overview?.athlete_name ?? "Atleta"}
            </span>
          )}
          {overview ? (
            <Link className="planning-compact-link" to={`/athletes/${overview.athlete_id}`}>
              Ficha
            </Link>
          ) : null}
        </div>
        <div className="planning-compact-discipline-row">
          {availableDisciplines.map((discipline) => (
            <button
              key={discipline}
              type="button"
              className={`planning-compact-disc-tab ${!showAllDisciplines && selectedDiscipline === discipline ? "active" : ""}`}
              onClick={() => {
                if (!athleteId) return;
                if (showAllDisciplines && onToggleAllDisciplines) {
                  onToggleAllDisciplines();
                }
                onAthleteChange(athleteId, discipline);
              }}
            >
              {disciplineLabel(discipline)}
            </button>
          ))}
          {availableDisciplines.length > 1 && onToggleAllDisciplines ? (
            <button
              type="button"
              className={`planning-compact-disc-tab ${showAllDisciplines ? "active" : ""}`}
              onClick={onToggleAllDisciplines}
              title="Mostrar todas las disciplinas superpuestas en el calendario"
            >
              Todas
            </button>
          ) : null}
        </div>
      </div>

      <div className="planning-compact-center">
        <div className="planning-compact-thresholds">
          {planningLt1 ? (
            <span className="planning-compact-threshold">
              <span className="planning-compact-th-label">LT1</span>
              <span className="planning-compact-th-value">{formatThresholdPrimaryMetric(planningLt1, selectedDiscipline)}</span>
              {planningLt1.heartRate != null ? <span className="planning-compact-th-hr">{Math.round(planningLt1.heartRate)}</span> : null}
            </span>
          ) : null}
          {planningLt2 ? (
            <span className="planning-compact-threshold">
              <span className="planning-compact-th-label">LT2</span>
              <span className="planning-compact-th-value">{formatThresholdPrimaryMetric(planningLt2, selectedDiscipline)}</span>
              {planningLt2.heartRate != null ? <span className="planning-compact-th-hr">{Math.round(planningLt2.heartRate)}</span> : null}
            </span>
          ) : null}
        </div>
        {activeBlockLabel !== "Sin bloque activo" ? (
          <span className="planning-compact-block-badge">{activeBlockLabel}</span>
        ) : null}
      </div>

      <div className="planning-compact-right">
        {nextTarget ? (
          <span className="planning-compact-target">
            <span className="planning-compact-target-name">{nextTarget.distance_label || disciplineLabel(nextTarget.discipline)}</span>
            <span className="planning-compact-target-value">{targetPrimaryValue(nextTarget)}</span>
            <span className="planning-compact-target-countdown">{formatTargetCountdown(nextTarget.target_date)}</span>
          </span>
        ) : null}
      </div>
    </header>
  );
}
