import type { PlanningMesocycleTemplate, PlanningOverview } from "../../types";
import type { MicrocycleWeek } from "../types";
import { disciplineLabel } from "../utils";
import { structureHelpText } from "../utils-workout";

type DurationFeedback = {
  tone: string;
  title: string;
  body: string;
} | null;

type BlockBuilderProps = {
  overview: PlanningOverview | null;
  selectedDiscipline: string;
  availableDisciplines: string[];
  athleteId: string | null;
  blockObjective: string;
  primaryWeakness: string;
  secondaryWeakness: string;
  weeks: string;
  density: string;
  priority: string;
  blockStartDate: string;
  blockPhase: string;
  blockIntent: string;
  coachNotes: string;
  saveError: string | null;
  saveMessage: string | null;
  saving: boolean;
  templateLibrary: PlanningMesocycleTemplate[];
  selectedTemplate: PlanningMesocycleTemplate | null;
  expandedTemplateId: string | null;
  selectedObjectiveOptions: string[];
  selectedWeaknessOptions: string[];
  phaseOptions: string[];
  quickGuardrails: string[];
  durationFeedback: DurationFeedback;
  microcycle: MicrocycleWeek[];
  onAthleteRoute: (athleteId: string, discipline: string) => void;
  onSelectedDiscipline: (discipline: string) => void;
  onBlockObjective: (value: string) => void;
  onPrimaryWeakness: (value: string) => void;
  onSecondaryWeakness: (value: string) => void;
  onWeeks: (value: string) => void;
  onDensity: (value: string) => void;
  onPriority: (value: string) => void;
  onBlockStartDate: (value: string) => void;
  onBlockPhase: (value: string) => void;
  onBlockIntent: (value: string) => void;
  onCoachNotes: (value: string) => void;
  onSelectTemplate: (templateId: string) => void;
  onExpandTemplate: (templateId: string | null) => void;
  onSave: () => void;
};

export function BlockBuilder({
  overview,
  selectedDiscipline,
  availableDisciplines,
  athleteId,
  blockObjective,
  primaryWeakness,
  secondaryWeakness,
  weeks,
  density,
  priority,
  blockStartDate,
  blockPhase,
  blockIntent,
  coachNotes,
  saveError,
  saveMessage,
  saving,
  templateLibrary,
  selectedTemplate,
  expandedTemplateId,
  selectedObjectiveOptions,
  selectedWeaknessOptions,
  phaseOptions,
  quickGuardrails,
  durationFeedback,
  microcycle,
  onAthleteRoute,
  onSelectedDiscipline,
  onBlockObjective,
  onPrimaryWeakness,
  onSecondaryWeakness,
  onWeeks,
  onDensity,
  onPriority,
  onBlockStartDate,
  onBlockPhase,
  onBlockIntent,
  onCoachNotes,
  onSelectTemplate,
  onExpandTemplate,
  onSave,
}: BlockBuilderProps) {
  return (
    <section className="card section-card planning-builder-card">
      <div className="section-heading">
        <span className="eyebrow">Diseño del bloque</span>
        <h2 className="section-title">Editor coach-led del bloque</h2>
        <p className="muted">Aquí ajustas diagnóstico, plantilla y reglas del bloque sin depender del calendario central.</p>
      </div>

      <div className="planning-foundation-grid">
        {(overview?.foundations ?? []).map((foundation) => (
          <article key={foundation.foundation_id} className="planning-foundation-card">
            <span className="planning-kicker">{foundation.anchor}</span>
            <strong>{foundation.title}</strong>
            <p>{foundation.summary}</p>
          </article>
        ))}
      </div>

      <div className="planning-builder-grid">
        <div className="planning-builder-controls">
          <strong className="planning-panel-title">Diagnóstico del entrenador</strong>
          <div className="planning-form-grid">
            <label>
              Disciplina dominante
              <select
                value={selectedDiscipline}
                onChange={(event) => {
                  const nextDiscipline = event.target.value;
                  if (athleteId) {
                    onAthleteRoute(athleteId, nextDiscipline);
                    return;
                  }
                  onSelectedDiscipline(nextDiscipline);
                }}
              >
                {availableDisciplines.map((discipline) => (
                  <option key={discipline} value={discipline}>
                    {disciplineLabel(discipline)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Objetivo del bloque
              <select value={blockObjective} onChange={(event) => onBlockObjective(event.target.value)}>
                {selectedObjectiveOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Limitante principal
              <select value={primaryWeakness} onChange={(event) => onPrimaryWeakness(event.target.value)}>
                {selectedWeaknessOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Limitante secundaria
              <select value={secondaryWeakness} onChange={(event) => onSecondaryWeakness(event.target.value)}>
                {selectedWeaknessOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Duración
              <select value={weeks} onChange={(event) => onWeeks(event.target.value)}>
                <option value="1">1 semana</option>
                <option value="2">2 semanas</option>
                <option value="3">3 semanas</option>
                <option value="4">4 semanas</option>
                <option value="5">5 semanas</option>
                <option value="6">6 semanas</option>
              </select>
            </label>

            <label>
              Densidad
              <select value={density} onChange={(event) => onDensity(event.target.value)}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </label>

            <label>
              Tono del bloque
              <select value={priority} onChange={(event) => onPriority(event.target.value)}>
                <option value="controlado">Controlado</option>
                <option value="agresivo">Agresivo</option>
              </select>
            </label>

            <label>
              Inicio del bloque
              <input type="date" value={blockStartDate} onChange={(event) => onBlockStartDate(event.target.value)} />
            </label>

            <label>
              Fase
              <select value={blockPhase} onChange={(event) => onBlockPhase(event.target.value)}>
                {phaseOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="planning-field-span-2">
              Intención operativa
              <textarea
                value={blockIntent}
                onChange={(event) => onBlockIntent(event.target.value)}
                rows={3}
                placeholder="Ej.: consolidar LT2 sin perder economía / resolver cadencia ineficiente / estabilizar CSS antes de apretar."
              />
            </label>

            <label className="planning-field-span-2">
              Notas del entrenador
              <textarea
                value={coachNotes}
                onChange={(event) => onCoachNotes(event.target.value)}
                rows={3}
                placeholder="Observaciones prácticas, reglas internas, sesión ancla o criterio de corte."
              />
            </label>

            {saveError ? <p className="error planning-field-span-2">{saveError}</p> : null}
            {saveMessage ? <p className="planning-field-span-2">{saveMessage}</p> : null}
            <button className="primary-button planning-field-span-2" type="button" onClick={onSave} disabled={saving || !athleteId}>
              {saving ? "Guardando..." : "Guardar como bloque activo"}
            </button>
          </div>
        </div>

        <div className="planning-builder-preview">
          <div className="planning-template-browser">
            <div className="section-heading compact">
              <span className="eyebrow">Biblioteca</span>
              <h3 className="section-title">Mesociclos disponibles</h3>
            </div>
            <div className="planning-template-strip">
              {templateLibrary.map((template) => {
                const isSelected = selectedTemplate?.template_id === template.template_id;
                const matchesSystem = template.template_id === overview?.next_recommendation.template_id;
                return (
                  <button
                    key={template.template_id}
                    type="button"
                    className={`planning-template-card ${isSelected ? "active" : ""}`}
                    onClick={() => {
                      onSelectTemplate(template.template_id);
                      onBlockIntent(template.summary);
                      onCoachNotes(template.control_points.join(" · "));
                    }}
                  >
                    <div className="planning-structure-row">
                      <span className="planning-kicker">{template.typical_structure}</span>
                      <button
                        type="button"
                        className="planning-info-dot"
                        title="Ver detalle del mesociclo"
                        aria-label="Ver detalle del mesociclo"
                        onClick={(event) => {
                          event.stopPropagation();
                          onExpandTemplate(expandedTemplateId === template.template_id ? null : template.template_id);
                        }}
                      >
                        ?
                      </button>
                    </div>
                    <strong>{template.public_label}</strong>
                    <p>{template.primary_focus}</p>
                    <small>{template.typical_duration_weeks_min}-{template.typical_duration_weeks_max} semanas</small>
                    {matchesSystem ? <span className="planning-template-match">encaje alto</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedTemplate ? (
            <div className="planning-template-detail">
              <div className="planning-template-detail-head">
                <div>
                  <span className="planning-kicker">Bloque provisional elegido</span>
                  <strong>{selectedTemplate.public_label}</strong>
                  <p>{selectedTemplate.summary}</p>
                </div>
                {selectedTemplate.template_id === overview?.next_recommendation.template_id ? (
                  <span className="planning-tag">La lectura actual lo respalda</span>
                ) : null}
              </div>

              <div className="planning-chip-row">
                <span className="planning-chip">{selectedTemplate.primary_focus}</span>
                <span className="planning-chip">{selectedTemplate.typical_structure}</span>
                <span className="planning-chip">{selectedTemplate.typical_duration_weeks_min}-{selectedTemplate.typical_duration_weeks_max} semanas</span>
                {selectedTemplate.secondary_focus ? <span className="planning-chip">{selectedTemplate.secondary_focus}</span> : null}
              </div>

              <div className="planning-template-columns">
                <div>
                  <span className="planning-kicker">Lo elijo cuando</span>
                  <ul className="planning-note-list">
                    {selectedTemplate.entry_checks.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="planning-kicker">Qué vigilo dentro del bloque</span>
                  <ul className="planning-note-list">
                    {selectedTemplate.control_points.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="planning-kicker">Qué debe pasar al salir</span>
                  <ul className="planning-note-list">
                    {selectedTemplate.exit_checks.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="planning-template-rationale">
                <article className="planning-mini-card">
                  <span className="eyebrow">Lo que veo en el CSV</span>
                  <p>{selectedTemplate.csv_rationale}</p>
                </article>
                <article className="planning-mini-card">
                  <span className="eyebrow">Soporte científico</span>
                  <p>{selectedTemplate.evidence_rationale}</p>
                </article>
              </div>
            </div>
          ) : null}

          {selectedTemplate && expandedTemplateId === selectedTemplate.template_id ? (
            <div className="planning-template-detail">
              <div className="planning-template-detail-head">
                <div>
                  <span className="planning-kicker">Interpretación del mesociclo</span>
                  <strong>{selectedTemplate.public_label}</strong>
                  <p>{structureHelpText(selectedTemplate.typical_structure)}</p>
                </div>
              </div>

              <div className="planning-template-columns">
                <div>
                  <span className="planning-kicker">Opciones dentro del bloque</span>
                  <ul className="planning-note-list">
                    {selectedTemplate.key_session_families.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="planning-kicker">Cómo lo modularías</span>
                  <ul className="planning-note-list">
                    {selectedTemplate.progression_rules.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="planning-kicker">Si quieres alargarlo</span>
                  <ul className="planning-note-list">
                    <li>No alargues la misma plantilla en línea recta sin releer al atleta.</li>
                    <li>Si pides 6 semanas para una plantilla de 3-4, úsala como fase 1 y encadena una fase 2.</li>
                    <li>Ejemplo: 3+1 de base y luego 2 semanas de continuación o transición hacia LT1/LT2.</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          <div className="planning-guardrails">
            <strong>Hipótesis del bloque</strong>
            <div className="planning-chip-row">
              <span className="planning-chip">{disciplineLabel(selectedDiscipline)}</span>
              <span className="planning-chip">Limitante: {primaryWeakness}</span>
              <span className="planning-chip">Soporte: {secondaryWeakness}</span>
              <span className="planning-chip">{blockObjective}</span>
              <span className="planning-chip">{weeks} semanas</span>
              <span className="planning-chip">{density} densidad</span>
            </div>
            <ul className="planning-note-list">
              {quickGuardrails.map((line) => (
                <li key={line}>{line}</li>
              ))}
              {(overview?.next_recommendation.risk_flags ?? []).slice(0, 2).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {durationFeedback ? (
              <article className={`planning-duration-note ${durationFeedback.tone}`}>
                <strong>{durationFeedback.title}</strong>
                <p>{durationFeedback.body}</p>
              </article>
            ) : null}
          </div>

          <div className="planning-microcycle">
            {microcycle.map((week) => (
              <article key={week.title} className={`planning-week-card ${week.tone}`}>
                <span className="planning-kicker">{week.title}</span>
                <strong>{week.load}</strong>
                <p>{week.emphasis}</p>
                <small>{week.notes}</small>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
