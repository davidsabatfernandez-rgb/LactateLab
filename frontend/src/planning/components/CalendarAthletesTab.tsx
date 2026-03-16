import { useMemo } from "react";

import type { Athlete } from "../../types";
import {
  disciplineLabel,
  firstName,
  formatDate,
  nextTargetLabelFromAthlete,
  normalizeDisciplineKey,
} from "../utils";
import type { PlanningState } from "../context/PlanningContext";

type CalendarAthletesTabProps = {
  state: PlanningState;
  athleteId: string | null;
  selectedDiscipline: string;
  activeBlockLabel: string;
  nextTargetPrimaryLabel: string;
  openCalendarWorkspaceTab: (tab: "athletes" | "library" | "calendar" | "summary") => void;
  updatePlanningRoute: (nextAthleteId: string, nextDiscipline: string) => void;
};

export function CalendarAthletesTab({
  state,
  athleteId,
  selectedDiscipline,
  activeBlockLabel,
  nextTargetPrimaryLabel,
  openCalendarWorkspaceTab,
  updatePlanningRoute,
}: CalendarAthletesTabProps) {
  const { athletes, overview } = state;

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => String(athlete.id) === String(athleteId)) ?? null,
    [athleteId, athletes],
  );

  const visibleTargets = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (selectedAthlete?.targets ?? [])
      .filter((target) => !target.target_date || target.target_date >= today)
      .sort((left, right) => String(left.target_date).localeCompare(String(right.target_date)))
      .slice(0, 4);
  }, [selectedAthlete]);

  return (
    <>
      <div className="planning-calendar-app-toolbar">
        <div className="planning-calendar-toolbar-left">
          <div className="planning-calendar-toolbar-heading">
            <strong>Selector de atletas</strong>
            <p>Cambia de atleta sin salir del entorno de calendario y conserva la misma lectura visual.</p>
          </div>
        </div>
        <div className="planning-calendar-toolbar-center">
          <button type="button" className="planning-calendar-athlete-chip">
            {selectedAthlete ? `${selectedAthlete.name} · ${disciplineLabel(selectedDiscipline)}` : "Sin atleta"}
          </button>
        </div>
        <div className="planning-calendar-toolbar-right">
          <button type="button" className="planning-inline-action" onClick={() => openCalendarWorkspaceTab("calendar")}>
            Ir al calendario
          </button>
        </div>
      </div>

      <div className="planning-calendar-app-content">
        <section className="planning-calendar-app-main planning-workspace-main">
          <div className="planning-workspace-grid planning-athlete-selection-grid">
            {[...athletes].sort((a, b) => a.name.localeCompare(b.name)).map((athlete) => {
              const athleteDiscipline = athlete.primary_discipline === "triatlón" ? "running" : athlete.primary_discipline ?? "running";
              const isSelected = String(athlete.id) === String(selectedAthlete?.id);
              const activeBlock = athlete.focus_blocks?.find((block) => block.status === "active");
              return (
                <button
                  key={athlete.id}
                  type="button"
                  className={`planning-workspace-card planning-athlete-selection-card ${isSelected ? "selected" : ""}`}
                  onClick={() => updatePlanningRoute(String(athlete.id), athleteDiscipline)}
                >
                  <div className="planning-athlete-selection-head">
                    <div>
                      <span className="planning-kicker">{disciplineLabel(athlete.primary_discipline)}</span>
                      <strong>{athlete.name}</strong>
                    </div>
                    <span className={`status-badge ${isSelected ? "positive" : "neutral"}`}>
                      {isSelected ? "Activo" : athlete.goal_category ?? "Coach"}
                    </span>
                  </div>
                  <p>{athlete.training_goal || athlete.notes || "Sin briefing cargado todavía."}</p>
                  <div className="planning-athlete-selection-meta">
                    <article>
                      <small>Bloque</small>
                      <strong>{activeBlock ? activeBlock.block_objective : "Sin foco"}</strong>
                    </article>
                    <article>
                      <small>Objetivo</small>
                      <strong>{nextTargetLabelFromAthlete(athlete)}</strong>
                    </article>
                    <article>
                      <small>Conectado</small>
                      <strong>{athlete.strava_connected || athlete.garmin_connected ? "Sí" : "No"}</strong>
                    </article>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="planning-calendar-app-summary">
          <div className="planning-calendar-summary-panel">
            <span className="planning-kicker">Atleta activo</span>
            <div className="planning-calendar-summary-stats">
              <article>
                <small>Nombre</small>
                <strong>{selectedAthlete?.name || "Sin atleta"}</strong>
              </article>
              <article>
                <small>Disciplina</small>
                <strong>{selectedAthlete ? disciplineLabel(selectedAthlete.primary_discipline) : "Sin disciplina"}</strong>
              </article>
              <article>
                <small>Bloque actual</small>
                <strong>{activeBlockLabel}</strong>
              </article>
              <article>
                <small>Target</small>
                <strong>{nextTargetPrimaryLabel}</strong>
              </article>
            </div>
          </div>

          <div className="planning-calendar-day-panel">
            <span className="planning-kicker">Próximos objetivos</span>
            <div className="planning-day-stack">
              {visibleTargets.length ? visibleTargets.map((target) => (
                <article key={target.id} className="planning-day-card">
                  <strong>{target.objective}</strong>
                  <p>{target.distance_label || disciplineLabel(target.discipline)}</p>
                  <small>{formatDate(target.target_date)}</small>
                </article>
              )) : (
                <article className="planning-day-card empty">
                  <strong>Sin objetivos próximos</strong>
                  <p>Añade una fecha objetivo para ordenar mejor la selección del bloque.</p>
                </article>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
