import type { PlanningOverview } from "../../types";
import type { PlanningSourceModalState } from "../types";
import { BLOCK_LABELS } from "../utils-workout";

type PlanningSourceModalProps = {
  modal: PlanningSourceModalState;
  nextRecommendation: PlanningOverview["next_recommendation"] | null;
  deletingBlockId: number | null;
  onClose: () => void;
  onDelete: () => void;
};

export function PlanningSourceModal({
  modal,
  nextRecommendation,
  deletingBlockId,
  onClose,
  onDelete,
}: PlanningSourceModalProps) {
  return (
    <div className="target-modal-backdrop" onClick={onClose}>
      <section className="card target-modal-card planning-source-modal" onClick={(event) => event.stopPropagation()}>
        <div className="library-workout-modal-head">
          <div>
            <span className="eyebrow">
              {modal.source.kind === "draft" ? "Borrador" : modal.source.kind === "planned" ? "Bloque real" : "Histórico útil"}
            </span>
            <h2>{modal.title}</h2>
            <p>{modal.summary}</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="planning-source-modal-body">
          <article className="planning-source-modal-card">
            <span className="planning-kicker">Objetivo del mesociclo</span>
            <strong>{modal.source.objective}</strong>
            <p>{modal.source.intent || "Sin intención operativa detallada."}</p>
          </article>
          {nextRecommendation ? (
            <article className="planning-source-modal-card">
              <span className="planning-kicker">Por qué el sistema prioriza este mesociclo</span>
              <strong>{nextRecommendation.recommended_block_label}</strong>
              <p>{nextRecommendation.template_summary || nextRecommendation.reasoning[0] || "Sin explicación prioritaria disponible."}</p>
              <div className="planning-modal-reading-grid">
                {(nextRecommendation.reasoning ?? []).slice(0, 3).map((item, index) => (
                  <article key={item} className="planning-modal-reading-item">
                    <span>{index === 0 ? "Lectura principal" : index === 1 ? "Bloque sugerido" : "Criterio adicional"}</span>
                    <strong>{item}</strong>
                  </article>
                ))}
              </div>
            </article>
          ) : null}
          <article className="planning-source-modal-card">
            <span className="planning-kicker">Características</span>
            <ul className="planning-note-list">
              {modal.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </article>
          {(nextRecommendation?.candidates_scored?.length ?? 0) > 0 ? (
            <article className="planning-source-modal-card">
              <span className="planning-kicker">Posiciones por scoring entre mesociclos</span>
              <div className="planning-modal-score-list">
                {nextRecommendation!.candidates_scored!.map((candidate, index) => (
                  <article key={candidate.block_type} className={`planning-modal-score-item ${index === 0 ? "winner" : ""}`}>
                    <div className="planning-modal-score-head">
                      <strong>{index + 1}. {BLOCK_LABELS[candidate.block_type] ?? candidate.block_type}</strong>
                      <span>{candidate.score} pts</span>
                    </div>
                    <p>{candidate.reasons[0] || "Sin argumento resumido."}</p>
                  </article>
                ))}
              </div>
            </article>
          ) : null}
          {modal.source.notes ? (
            <article className="planning-source-modal-card">
              <span className="planning-kicker">Notas</span>
              <p>{modal.source.notes}</p>
            </article>
          ) : null}
          {modal.source.kind === "planned" && modal.source.focusBlockId ? (
            <div className="planning-source-modal-actions">
              <button
                type="button"
                className="ghost-button danger"
                onClick={onDelete}
                disabled={deletingBlockId === modal.source.focusBlockId}
              >
                {deletingBlockId === modal.source.focusBlockId ? "Eliminando..." : "Eliminar mesociclo"}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
