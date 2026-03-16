import { useMemo, useState } from "react";

import type { AthleteAnalysis, PlanningMesocycleTemplate, PlanningOverview, PlanningPlannedSession, PlanningWorkoutTemplate } from "../../types";
import type { PlanningCalendarSource } from "../types";
import {
  disciplineLabel,
  firstName,
  formatShortDate,
  planningPublishStatusMeta,
  dateValue,
} from "../utils";
import {
  resolveMesocycleTemplateForSource,
  workoutLayerForTemplate,
} from "../utils-workout";
import { WorkoutLibraryBrowser } from "./WorkoutLibraryBrowser";

type CalendarLibraryTabProps = {
  overview: PlanningOverview | null;
  selectedDiscipline: string;
  templateLibrary: PlanningMesocycleTemplate[];
  selectedTemplateId: string;
  selectedLibrarySourceId: string;
  calendarSources: PlanningCalendarSource[];
  workoutLibrary: PlanningWorkoutTemplate[];
  onSelectTemplateId: (id: string) => void;
  onSelectLibrarySourceId: (id: string) => void;
  openCalendarWorkspaceTab: (tab: "athletes" | "library" | "calendar" | "summary") => void;
  openMesocycleLibraryFromSource: (source: PlanningCalendarSource) => void;
  openPlannedWorkoutPreview: (sessionId: number) => boolean;
  openPlannedWorkoutRawInformation: (sessionId: number) => void;
  openLibraryWorkoutPreview: (template: PlanningWorkoutTemplate) => void;
  onAddToDay?: ((template: PlanningWorkoutTemplate, date: string) => void) | null;
};

export function CalendarLibraryTab({
  overview,
  selectedDiscipline,
  templateLibrary,
  selectedTemplateId,
  selectedLibrarySourceId,
  calendarSources,
  workoutLibrary,
  onSelectTemplateId,
  onSelectLibrarySourceId,
  openCalendarWorkspaceTab,
  openMesocycleLibraryFromSource,
  openPlannedWorkoutPreview,
  openPlannedWorkoutRawInformation,
  openLibraryWorkoutPreview,
  onAddToDay,
}: CalendarLibraryTabProps) {
  const [librarySubTab, setLibrarySubTab] = useState<"mesocycles" | "workouts">("mesocycles");
  const selectedTemplate = useMemo(
    () => templateLibrary.find((t) => t.template_id === selectedTemplateId) ?? templateLibrary[0] ?? null,
    [selectedTemplateId, templateLibrary],
  );
  const detectedMesocyclesById = useMemo(
    () => new Map((overview?.detected_mesocycles ?? []).map((block) => [`historical-${block.start_date}-${block.block_type}`, block])),
    [overview?.detected_mesocycles],
  );
  const selectedLibrarySource = useMemo(
    () => calendarSources.find((source) => source.id === selectedLibrarySourceId) ?? null,
    [calendarSources, selectedLibrarySourceId],
  );
  const selectedLibrarySourceTemplate = useMemo(
    () => (selectedLibrarySource ? resolveMesocycleTemplateForSource(selectedLibrarySource, templateLibrary) : null),
    [selectedLibrarySource, templateLibrary],
  );
  const activeLibraryTemplate = selectedLibrarySourceTemplate ?? selectedTemplate;
  const selectedLibraryCompatibleWorkouts = useMemo(() => {
    const active = activeLibraryTemplate;
    if (!active) return [];
    const targetDiscipline = selectedLibrarySource?.discipline ?? selectedDiscipline;
    return workoutLibrary
      .filter((template) => (
        template.compatible_block_types.includes(active.block_type)
        && (template.discipline === targetDiscipline || template.discipline === "all")
      ))
      .sort((left, right) => {
        const roleWeight = (value: string) => (value === "key" ? 0 : value === "support" ? 1 : value === "recovery" ? 2 : 3);
        return roleWeight(left.session_role) - roleWeight(right.session_role) || left.public_label.localeCompare(right.public_label);
      });
  }, [activeLibraryTemplate, selectedDiscipline, selectedLibrarySource?.discipline, workoutLibrary]);
  const selectedLibraryPlannedSessions = useMemo(
    () => selectedLibrarySource?.focusBlockId
      ? (overview?.planned_sessions ?? [])
        .filter((session) => session.focus_block_id === selectedLibrarySource.focusBlockId)
        .sort((left, right) => dateValue(left.scheduled_date) - dateValue(right.scheduled_date))
      : [],
    [overview?.planned_sessions, selectedLibrarySource],
  );
  const selectedLibraryHistoricalBlock = useMemo(
    () => (selectedLibrarySource ? detectedMesocyclesById.get(selectedLibrarySource.id) ?? null : null),
    [detectedMesocyclesById, selectedLibrarySource],
  );
  const selectedLibraryCandidate = useMemo(() => {
    const blockType = activeLibraryTemplate?.block_type ?? selectedLibrarySource?.blockType ?? null;
    if (!blockType) return null;
    return overview?.next_recommendation.candidates_scored?.find((c) => c.block_type === blockType) ?? null;
  }, [activeLibraryTemplate?.block_type, overview?.next_recommendation.candidates_scored, selectedLibrarySource?.blockType]);
  const selectedLibraryWhyNow = useMemo(() => {
    const blockType = activeLibraryTemplate?.block_type ?? selectedLibrarySource?.blockType ?? null;
    if (!blockType) return [];
    if (blockType === overview?.next_recommendation.recommended_block_type) {
      return overview?.next_recommendation.reasoning ?? [];
    }
    return selectedLibraryCandidate?.reasons ?? selectedLibraryHistoricalBlock?.explanation ?? [];
  }, [
    overview?.next_recommendation.reasoning,
    overview?.next_recommendation.recommended_block_type,
    selectedLibraryCandidate?.reasons,
    selectedLibraryHistoricalBlock?.explanation,
    activeLibraryTemplate?.block_type,
    selectedLibrarySource?.blockType,
  ]);

  return (
    <>
      <div className="planning-calendar-app-toolbar">
        <div className="planning-calendar-toolbar-left">
          <div className="planning-calendar-toolbar-heading">
            <strong>Biblioteca de mesociclos</strong>
            <p>Consulta qué bloques existen, cuál encaja ahora y qué mesociclos ya se detectaron en el histórico.</p>
          </div>
        </div>
        <div className="planning-calendar-toolbar-center">
          <button type="button" className="planning-calendar-athlete-chip">
            {overview ? `${firstName(overview.athlete_name)} · ${disciplineLabel(selectedDiscipline)}` : "Sin atleta"}
          </button>
        </div>
        <div className="planning-calendar-toolbar-right">
          <div className="wlb-library-subtabs">
            <button
              type="button"
              className={`planning-inline-action ${librarySubTab === "mesocycles" ? "active" : ""}`}
              onClick={() => setLibrarySubTab("mesocycles")}
            >
              Mesociclos
            </button>
            <button
              type="button"
              className={`planning-inline-action ${librarySubTab === "workouts" ? "active" : ""}`}
              onClick={() => setLibrarySubTab("workouts")}
            >
              Sesiones
            </button>
          </div>
          <button type="button" className="planning-inline-action" onClick={() => openCalendarWorkspaceTab("calendar")}>
            Ver calendario
          </button>
        </div>
      </div>

      <div className="planning-calendar-app-content">
        {librarySubTab === "workouts" ? (
          <section className="planning-calendar-app-main planning-workspace-main" style={{ maxWidth: "100%", flex: 1 }}>
            <WorkoutLibraryBrowser
              workoutLibrary={workoutLibrary}
              overview={overview}
              selectedDiscipline={selectedDiscipline}
              onPreview={openLibraryWorkoutPreview}
              onAddToDay={onAddToDay}
            />
          </section>
        ) : (
        <>
        <section className="planning-calendar-app-main planning-workspace-main">
          <div className="planning-workspace-section">
            <div className="planning-workspace-section-head">
              <span className="planning-kicker">Plantillas disponibles</span>
              <strong>{templateLibrary.length} mesociclos utilizables</strong>
            </div>
            <div className="planning-workspace-grid planning-library-grid">
              {templateLibrary.map((template) => {
                const isSelected = template.template_id === selectedTemplate?.template_id;
                const isRecommended = template.template_id === overview?.next_recommendation.template_id;
                return (
                  <button
                    key={template.template_id}
                    type="button"
                    className={`planning-workspace-card planning-library-card ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      onSelectTemplateId(template.template_id);
                      onSelectLibrarySourceId("");
                    }}
                  >
                    <div className="planning-athlete-selection-head">
                      <div>
                        <span className="planning-kicker">{template.block_type.replace(/_/g, " ")}</span>
                        <strong>{template.public_label}</strong>
                      </div>
                      <span className={`status-badge ${isRecommended ? "positive" : "neutral"}`}>
                        {isRecommended ? "Recomendada" : `${template.typical_duration_weeks_min}-${template.typical_duration_weeks_max} sem`}
                      </span>
                    </div>
                    <p>{template.summary}</p>
                    <div className="planning-athlete-selection-meta">
                      <article>
                        <small>Foco</small>
                        <strong>{template.primary_focus}</strong>
                      </article>
                      <article>
                        <small>Estructura</small>
                        <strong>{template.typical_structure}</strong>
                      </article>
                      <article>
                        <small>Sesiones clave</small>
                        <strong>{template.key_session_families.slice(0, 2).join(" · ") || "n/d"}</strong>
                      </article>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="planning-workspace-section">
            <div className="planning-workspace-section-head">
              <span className="planning-kicker">Mesociclos detectados</span>
              <strong>{overview?.detected_mesocycles.length ?? 0} bloques en el histórico</strong>
            </div>
            <div className="planning-workspace-grid planning-history-grid">
              {(overview?.detected_mesocycles ?? []).length ? (overview?.detected_mesocycles ?? []).map((block) => {
                const sourceId = `historical-${block.start_date}-${block.block_type}`;
                const matchingSource = calendarSources.find((source) => source.id === sourceId);
                const isSelected = selectedLibrarySourceId === sourceId;
                return (
                  <button
                    key={`${block.start_date}-${block.block_type}`}
                    type="button"
                    className={`planning-workspace-card planning-history-card ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      if (matchingSource) {
                        openMesocycleLibraryFromSource(matchingSource);
                        return;
                      }
                      onSelectLibrarySourceId(sourceId);
                    }}
                  >
                    <span className="planning-kicker">{disciplineLabel(block.discipline)}</span>
                    <strong>{block.block_label}</strong>
                    <p>{block.explanation[0] || "Mesociclo detectado a partir del patrón de sesiones."}</p>
                    <div className="planning-athlete-selection-meta">
                      <article>
                        <small>Fechas</small>
                        <strong>{formatShortDate(block.start_date)} - {formatShortDate(block.end_date)}</strong>
                      </article>
                      <article>
                        <small>Semanas</small>
                        <strong>{block.weeks_count}</strong>
                      </article>
                      <article>
                        <small>Sesiones</small>
                        <strong>{block.session_count}</strong>
                      </article>
                    </div>
                  </button>
                );
              }) : (
                <article className="planning-empty-state">
                  <strong>Sin histórico suficiente todavía.</strong>
                  <p>Cuando el atleta acumule sesiones comparables aparecerán aquí los mesociclos detectados.</p>
                </article>
              )}
            </div>
          </div>
        </section>

        <aside className="planning-calendar-app-summary">
          <div className="planning-calendar-summary-panel">
            <span className="planning-kicker">Mesociclo seleccionado</span>
            <div className="planning-calendar-summary-stats">
              <article>
                <small>Bloque</small>
                <strong>{activeLibraryTemplate?.public_label || "Sin selección"}</strong>
              </article>
              {selectedLibrarySource ? (
                <article>
                  <small>Abierto desde</small>
                  <strong>{selectedLibrarySource.kind === "planned" ? "Bloque real" : selectedLibrarySource.kind === "historical" ? "Histórico detectado" : "Borrador"}</strong>
                </article>
              ) : null}
              <article>
                <small>Foco primario</small>
                <strong>{activeLibraryTemplate?.primary_focus || "Sin foco"}</strong>
              </article>
              <article>
                <small>Regla principal</small>
                <strong>{activeLibraryTemplate?.progression_rules[0] || "Sin regla"}</strong>
              </article>
              <article>
                <small>Entrada</small>
                <strong>{activeLibraryTemplate?.entry_checks[0] || "Sin chequeo"}</strong>
              </article>
            </div>
          </div>

          <div className="planning-calendar-warning-panel">
            <span className="planning-kicker">{selectedLibrarySource ? "Lectura del bloque abierto" : "Por qué encaja ahora"}</span>
            <div className="planning-day-stack">
              {selectedLibraryWhyNow.slice(0, 4).map((reason) => (
                <article key={reason} className="planning-day-card">
                  <strong>{reason}</strong>
                </article>
              ))}
              {!selectedLibraryWhyNow.length ? (
                <article className="planning-day-card empty">
                  <strong>Sin explicación disponible</strong>
                  <p>No hay razones adicionales guardadas para este mesociclo.</p>
                </article>
              ) : null}
            </div>
          </div>

          {activeLibraryTemplate ? (
            <div className="planning-calendar-day-panel">
              <span className="planning-kicker">Explicación del mesociclo</span>
              <div className="planning-day-stack">
                <article className="planning-day-card">
                  <strong>Resumen</strong>
                  <p>{activeLibraryTemplate.summary}</p>
                </article>
                <article className="planning-day-card">
                  <strong>Rationale CSV</strong>
                  <p>{activeLibraryTemplate.csv_rationale}</p>
                </article>
                <article className="planning-day-card">
                  <strong>Rationale evidencia</strong>
                  <p>{activeLibraryTemplate.evidence_rationale}</p>
                </article>
              </div>
            </div>
          ) : null}

          {selectedLibraryHistoricalBlock ? (
            <div className="planning-calendar-day-panel">
              <span className="planning-kicker">Lectura histórica detectada</span>
              <div className="planning-day-stack">
                {selectedLibraryHistoricalBlock.explanation.map((line) => (
                  <article key={line} className="planning-day-card">
                    <strong>{line}</strong>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {!!selectedLibraryPlannedSessions.length && (
            <div className="planning-calendar-day-panel">
              <span className="planning-kicker">Sesiones dentro del bloque</span>
              <div className="planning-day-stack">
                {selectedLibraryPlannedSessions.map((session) => (
                  <article key={session.id} className="planning-day-card">
                    <div className="planning-day-card-top">
                      <strong>{formatShortDate(session.scheduled_date)} · {session.public_label}</strong>
                      <span className={`status-badge ${planningPublishStatusMeta(session.publish_status).tone}`}>
                        {planningPublishStatusMeta(session.publish_status).label}
                      </span>
                    </div>
                    <p>{session.objective}</p>
                    <small>{session.dose_prescription}</small>
                    {session.publish_error ? <small>{session.publish_error}</small> : null}
                    <div className="planning-session-inline-actions">
                      <button type="button" className="planning-inline-action" onClick={() => openPlannedWorkoutPreview(session.id)}>
                        Abrir preview
                      </button>
                      <button type="button" className="planning-inline-action" onClick={() => openPlannedWorkoutRawInformation(session.id)}>
                        Ver raw
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeLibraryTemplate ? (
            <div className="planning-calendar-day-panel">
              <span className="planning-kicker">Reglas y control</span>
              <div className="planning-day-stack">
                {activeLibraryTemplate.progression_rules.slice(0, 3).map((rule) => (
                  <article key={rule} className="planning-day-card">
                    <strong>{rule}</strong>
                  </article>
                ))}
                {activeLibraryTemplate.exit_checks.slice(0, 2).map((check) => (
                  <article key={check} className="planning-day-card">
                    <strong>{check}</strong>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {selectedLibraryCompatibleWorkouts.length ? (
            <div className="planning-calendar-day-panel">
              <span className="planning-kicker">Librería compatible del mesociclo</span>
              <div className="planning-day-stack">
                {selectedLibraryCompatibleWorkouts.slice(0, 10).map((template) => (
                  <article key={template.template_id} className="planning-day-card">
                    <strong>{template.public_label}</strong>
                    <p>{template.summary}</p>
                    <small>{template.session_role} · {template.session_family}</small>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </>
        )}
      </div>
    </>
  );
}
