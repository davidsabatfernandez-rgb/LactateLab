import { useMemo } from "react";

import type { PlanningMesocycleTemplate, PlanningOverview } from "../../types";
import type { CalendarMesocycleOption } from "../types";
import { firstName, formatDate } from "../utils";
import { MesocycleTimeline, type TimelineWeek } from "./MesocycleTimeline";

type MesocycleComposerProps = {
  overview: PlanningOverview | null;
  calendarComposerDate: string;
  selectedTemplateId: string;
  weeks: string;
  blockIntent: string;
  primaryWeakness: string;
  secondaryWeakness: string;
  saving: boolean;
  saveError: string | null;
  saveMessage: string | null;
  athleteId: string | null;
  selectedTemplate: PlanningMesocycleTemplate | null;
  nextTargetPrimaryLabel: string;
  nextTargetLabel: string;
  calendarMesocycleOptions: CalendarMesocycleOption[];
  onSetSelectedTemplateId: (id: string) => void;
  onSetBlockIntent: (value: string) => void;
  onSetCoachNotes: (value: string) => void;
  onSetWeeks: (value: string | ((w: string) => string)) => void;
  closeCalendarMesocycleComposer: () => void;
  saveFocusBlockFromPlanning: () => Promise<boolean>;
};

export function MesocycleComposer({
  overview,
  calendarComposerDate,
  selectedTemplateId,
  weeks,
  blockIntent,
  primaryWeakness,
  secondaryWeakness,
  saving,
  saveError,
  saveMessage,
  athleteId,
  selectedTemplate,
  nextTargetPrimaryLabel,
  nextTargetLabel,
  calendarMesocycleOptions,
  onSetSelectedTemplateId,
  onSetBlockIntent,
  onSetCoachNotes,
  onSetWeeks,
  closeCalendarMesocycleComposer,
  saveFocusBlockFromPlanning,
}: MesocycleComposerProps) {
  const selectedComposerOption = useMemo(
    () => calendarMesocycleOptions.find((option) => option.template.template_id === selectedTemplateId) ?? calendarMesocycleOptions[0] ?? null,
    [calendarMesocycleOptions, selectedTemplateId],
  );
  const recommendedBlockExplanation = overview?.next_recommendation.physiological_analysis?.block_explanation;
  const recommendedReliabilityWarnings = overview?.next_recommendation.physiological_analysis?.reliability_warnings ?? [];

  const timelineWeeks = useMemo<TimelineWeek[]>(() => {
    return buildComposerTimelineWeeks(Number(weeks));
  }, [weeks]);

  return (
    <div className="planning-calendar-composer-shell">
      <div className="planning-calendar-app-toolbar planner">
        <div className="planning-calendar-toolbar-left">
          <div className="planning-calendar-toolbar-heading">
            <strong>Crear mesociclo</strong>
            <p>{formatDate(calendarComposerDate)} · compara opciones y activa la que mejor encaja ahora</p>
          </div>
        </div>

        <div className="planning-calendar-toolbar-center">
          <button type="button" className="planning-calendar-athlete-chip">
            {overview ? firstName(overview.athlete_name) : "Atleta"}
          </button>
        </div>

        <div className="planning-calendar-toolbar-right">
          <button type="button" className="planning-inline-action" onClick={closeCalendarMesocycleComposer}>
            Volver al calendario
          </button>
        </div>
      </div>

      <div className="planning-calendar-composer-content">
        <section className="planning-calendar-composer-main">
          <div className="planning-calendar-composer-hero">
            <article className="planning-calendar-composer-recommendation">
              <span className="planning-kicker">Mejor opción ahora</span>
              <strong>
                {overview?.next_recommendation.recommended_block_label || selectedComposerOption?.template.public_label || "Sin recomendación"}
                {overview?.next_recommendation.physiological_analysis?.borderline && (
                  <span className="borderline-badge" title={overview.next_recommendation.physiological_analysis.borderline_note || "Caso límite: dos bloques son casi equivalentes"}> ~ caso límite</span>
                )}
              </strong>
              <p className="planning-calendar-composer-headline">
                {recommendedBlockExplanation?.headline
                  || overview?.next_recommendation.physiological_analysis?.block_rationale?.summary_coach
                  || overview?.next_recommendation.template_summary
                  || overview?.next_recommendation.reasoning?.[0]
                  || "Sin explicación prioritaria disponible."}
              </p>
              <div className="planning-calendar-composer-tags">
                <span className="planning-chip">{overview?.next_recommendation.primary_focus || selectedComposerOption?.template.primary_focus || "Sin foco"}</span>
                <span className="planning-chip">{overview?.next_recommendation.duration_weeks || weeks} semanas</span>
                <span className="planning-chip">{overview?.next_recommendation.physiological_analysis?.confidence_band || "confianza media"}</span>
              </div>
              {recommendedBlockExplanation ? (
                <div className="planning-calendar-composer-insight-grid">
                  <article>
                    <span>Por qué ahora</span>
                    <p>{recommendedBlockExplanation.why_now}</p>
                  </article>
                  <article>
                    <span>Qué esperar</span>
                    <p>{recommendedBlockExplanation.what_to_expect}</p>
                  </article>
                  <article>
                    <span>Qué vigilar</span>
                    <p>{recommendedBlockExplanation.what_to_watch}</p>
                  </article>
                  <article>
                    <span>Cuándo salir</span>
                    <p>{recommendedBlockExplanation.when_to_exit}</p>
                  </article>
                </div>
              ) : null}
            </article>

            <article className="planning-calendar-composer-context">
              <span className="planning-kicker">Contexto</span>
              <p className="planning-calendar-composer-context-line">
                <strong>Target:</strong> {nextTargetPrimaryLabel}
                <span>·</span>
                <strong>Fecha objetivo:</strong> {nextTargetLabel}
                <span>·</span>
                <strong>Primary limiter:</strong> {overview?.next_recommendation.physiological_analysis?.primary_limiter || primaryWeakness}
                <span>·</span>
                <strong>Secondary limiter:</strong> {overview?.next_recommendation.physiological_analysis?.secondary_limiter || secondaryWeakness}
              </p>
            </article>
          </div>

          <div className="planning-calendar-composer-options">
            {calendarMesocycleOptions.map((option, index) => {
              const isSelected = option.template.template_id === (selectedComposerOption?.template.template_id ?? selectedTemplateId);
              return (
                <button
                  key={option.template.template_id}
                  type="button"
                  className={`planning-calendar-composer-option ${option.isBest ? "best" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    onSetSelectedTemplateId(option.template.template_id);
                    onSetBlockIntent(option.template.summary);
                    onSetCoachNotes(option.template.control_points.join(" · "));
                    onSetWeeks(String(
                      overview?.next_recommendation.duration_weeks
                      && overview.next_recommendation.duration_weeks >= option.template.typical_duration_weeks_min
                      && overview.next_recommendation.duration_weeks <= option.template.typical_duration_weeks_max
                        ? overview.next_recommendation.duration_weeks
                        : option.template.typical_duration_weeks_min,
                    ));
                  }}
                >
                  <div className="planning-calendar-composer-option-head">
                    <div>
                      <span className="planning-kicker">{option.isBest ? "Prioridad del sistema" : `Alternativa ${index + 1}`}</span>
                      <strong>{option.template.public_label}</strong>
                      <p>{option.whyItFits[0] || option.template.primary_focus}</p>
                    </div>
                    <div className="planning-calendar-composer-option-score">
                      <span>{option.score != null ? `${option.score} pts` : "sin score"}</span>
                    </div>
                  </div>

                  <div className="planning-calendar-composer-option-columns">
                    {option.whyItFits.length ? (
                      <article>
                        <span>{option.isBest ? "Lectura fisiológica" : "Encaje"}</span>
                        <ul className="planning-note-list">
                          {option.whyItFits.slice(0, 2).map((line) => <li key={line}>{line}</li>)}
                        </ul>
                      </article>
                    ) : null}
                    {option.whyNotAsGood.length ? (
                      <article>
                        <span>{option.isBest ? "Trade-off" : "Qué penaliza"}</span>
                        <ul className="planning-note-list">
                          {option.whyNotAsGood.slice(0, 2).map((line) => <li key={line}>{line}</li>)}
                        </ul>
                      </article>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="planning-calendar-composer-sidebar">
          <article className="planning-calendar-composer-sidecard">
            <span className="planning-kicker">Opción elegida</span>
            <strong>{selectedComposerOption?.template.public_label || "Sin selección"}</strong>
            <p>
              {selectedComposerOption?.isBest
                ? recommendedBlockExplanation?.what_to_expect
                || overview?.next_recommendation.physiological_analysis?.block_rationale?.physiological_goal
                || selectedComposerOption?.template.summary
                : selectedComposerOption?.template.summary
                || "Elige una opción para revisar su lógica antes de activarla."}
            </p>
            <div className="planning-chip-row">
              {selectedComposerOption?.template.primary_focus ? <span className="planning-chip">{selectedComposerOption.template.primary_focus}</span> : null}
              {selectedComposerOption?.template.typical_structure ? <span className="planning-chip">{selectedComposerOption.template.typical_structure}</span> : null}
              {selectedComposerOption ? <span className="planning-chip">{selectedComposerOption.template.typical_duration_weeks_min}-{selectedComposerOption.template.typical_duration_weeks_max} semanas</span> : null}
            </div>
          </article>

          {selectedComposerOption?.isBest && recommendedBlockExplanation ? (
            <article className="planning-calendar-composer-sidecard">
              <span className="planning-kicker">Lectura del bloque</span>
              <div className="planning-calendar-composer-mini-grid">
                <article>
                  <span>Adaptación</span>
                  <p>{recommendedBlockExplanation.what_to_expect}</p>
                </article>
                {recommendedReliabilityWarnings.length > 0 && (
                  <article>
                    <span>Alternativa</span>
                    <p>{recommendedBlockExplanation.alternative_if_wrong}</p>
                  </article>
                )}
              </div>
            </article>
          ) : null}

          {recommendedReliabilityWarnings.length ? (
            <article className="planning-calendar-composer-sidecard">
              <span className="planning-kicker">Fiabilidad de la recomendación</span>
              <div className="reliability-warnings">
                {recommendedReliabilityWarnings.slice(0, 3).map((warning) => (
                  <div key={warning.code} className={`warning-item warning-${warning.severity}`}>
                    <span className="warning-icon">
                      {warning.severity === 'critical' ? '🔴' : warning.severity === 'warning' ? '🟡' : 'ℹ️'}
                    </span>
                    <div>
                      <p className="warning-message">{warning.message}</p>
                      <p className="warning-actionable">{warning.actionable}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          <article className="planning-calendar-composer-sidecard">
            <span className="planning-kicker">Duración del bloque</span>

            <div className="composer-duration-slider-row">
              <span className="composer-duration-value">
                <strong>{weeks}</strong> semanas
              </span>
            </div>
            {selectedTemplate && (
              <>
                <input
                  type="range"
                  min={selectedTemplate.typical_duration_weeks_min}
                  max={selectedTemplate.typical_duration_weeks_max}
                  value={Number(weeks)}
                  onChange={(e) => onSetWeeks(e.target.value)}
                  style={{ width: "100%", accentColor: "var(--accent, #3b82f6)", cursor: "pointer" }}
                />
                <div className="composer-duration-endpoints">
                  <span>{selectedTemplate.typical_duration_weeks_min}s (mín Olbrecht)</span>
                  <span>{selectedTemplate.typical_duration_weeks_max}s (máx Olbrecht)</span>
                </div>
              </>
            )}

            {selectedTemplate && (
              <p className="composer-duration-hint">
                Rango óptimo: {selectedTemplate.typical_duration_weeks_min}–{selectedTemplate.typical_duration_weeks_max} semanas
                {Number(weeks) < selectedTemplate.typical_duration_weeks_min && (
                  <span className="composer-duration-warn"> · muy corto para adaptación estructural</span>
                )}
                {Number(weeks) > selectedTemplate.typical_duration_weeks_max && (
                  <span className="composer-duration-warn"> · riesgo de estancamiento por exceso</span>
                )}
              </p>
            )}

            <MesocycleTimeline weeks={timelineWeeks} />

            <label style={{marginTop: "12px"}}>
              Nota (opcional)
              <textarea
                rows={2}
                placeholder="Observaciones del entrenador para este bloque..."
                value={blockIntent}
                onChange={(event) => onSetBlockIntent(event.target.value)}
              />
            </label>

            {saveError ? <p className="error">{saveError}</p> : null}
            {saveMessage ? <p>{saveMessage}</p> : null}
            <button
              type="button"
              className="primary-button"
              disabled={saving || !athleteId || !selectedComposerOption}
              onClick={async () => {
                const saved = await saveFocusBlockFromPlanning();
                if (saved) closeCalendarMesocycleComposer();
              }}
            >
              {saving ? "Creando..." : "Crear mesociclo"}
            </button>
          </article>
        </aside>
      </div>
    </div>
  );
}

/** Generate timeline weeks following the wave principle (load / build / build_peak / recovery). */
function buildComposerTimelineWeeks(weekCount: number): TimelineWeek[] {
  if (weekCount <= 0) return [];
  const phases = phaseSequence(weekCount);
  return phases.map((phase, i) => ({
    weekIndex: i + 1,
    label: `S${i + 1}`,
    theme: PHASE_THEME[phase] ?? phase,
    loadType: phase,
  }));
}

const PHASE_THEME: Record<string, string> = {
  "acumulación": "Carga",
  "construcción": "Construcción",
  "carga máxima": "Pico",
  descarga: "Descarga",
};

function phaseSequence(n: number): string[] {
  if (n === 1) return ["acumulación"];
  if (n === 2) return ["acumulación", "descarga"];
  if (n === 3) return ["acumulación", "carga máxima", "descarga"];
  // 4+: load phases, then build, build_peak, recovery
  const result: string[] = [];
  const loadWeeks = n - 3; // remaining after build + build_peak + recovery
  for (let i = 0; i < loadWeeks; i++) result.push("acumulación");
  result.push("construcción");
  result.push("carga máxima");
  result.push("descarga");
  return result;
}
