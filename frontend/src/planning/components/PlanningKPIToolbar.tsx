import type { DynamicReference } from "../../types";
import type { ResolvedTrainingThreshold } from "../../lib/trainingThresholds";
import { disciplineLabel, formatDate, formatDynamicReferencePrimaryMetric, formatThresholdPrimaryMetric } from "../utils";

type PlanningKPIToolbarProps = {
  selectedDiscipline: string;
  activeBlockLabel: string;
  currentBlockStartDate?: string | null;
  currentBlockEndDate?: string | null;
  nextTargetPrimaryLabel: string;
  nextTargetLabel: string;
  plannedBlocksCount: number;
  planningLt1: ResolvedTrainingThreshold | null;
  planningLt2: ResolvedTrainingThreshold | null;
  planningPracticalLt1: DynamicReference | null;
  planningPracticalLt2: DynamicReference | null;
  planningThresholdBasis: string;
};

export function PlanningKPIToolbar({
  selectedDiscipline,
  activeBlockLabel,
  currentBlockStartDate,
  currentBlockEndDate,
  nextTargetPrimaryLabel,
  nextTargetLabel,
  plannedBlocksCount,
  planningLt1,
  planningLt2,
  planningPracticalLt1,
  planningPracticalLt2,
  planningThresholdBasis,
}: PlanningKPIToolbarProps) {
  return (
    <section className="card section-card planning-card planning-toolbar-card">
      <div className="planning-kpi-strip">
        <article className="planning-kpi-card">
          <span className="planning-kpi-label">Bloque activo · {disciplineLabel(selectedDiscipline)}</span>
          <strong>{activeBlockLabel}</strong>
          <small>{currentBlockStartDate ? `${formatDate(currentBlockStartDate)} → ${formatDate(currentBlockEndDate)}` : "Sin bloque real cargado"}</small>
        </article>
        <article className="planning-kpi-card">
          <span className="planning-kpi-label">Siguiente hito</span>
          <strong>{nextTargetPrimaryLabel}</strong>
          <small>{nextTargetLabel}</small>
        </article>
        <article className="planning-kpi-card">
          <span className="planning-kpi-label">Bloques guardados</span>
          <strong>{plannedBlocksCount}</strong>
          <small>{plannedBlocksCount ? "listos para revisar o borrar" : "sin plan persistido todavía"}</small>
        </article>
      </div>
      <div className="planning-threshold-strip">
        <article className="planning-threshold-card">
          <span className="planning-kicker">LT1 activo</span>
          <strong>{formatThresholdPrimaryMetric(planningLt1, selectedDiscipline)}</strong>
          <small>{planningLt1 ? `${planningLt1.sourceLabel}${planningLt1.heartRate != null ? ` · ${Math.round(planningLt1.heartRate)} bpm` : ""}` : "Sin LT1 visible"}</small>
        </article>
        <article className="planning-threshold-card">
          <span className="planning-kicker">LT1 práctico</span>
          <strong>{formatDynamicReferencePrimaryMetric(planningPracticalLt1, selectedDiscipline)}</strong>
          <small>{planningPracticalLt1?.estimated_hr_at_target != null ? `${Math.round(planningPracticalLt1.estimated_hr_at_target)} bpm` : "Sin LT1 práctico visible"}</small>
        </article>
        <article className="planning-threshold-card">
          <span className="planning-kicker">LT2 activo</span>
          <strong>{formatThresholdPrimaryMetric(planningLt2, selectedDiscipline)}</strong>
          <small>{planningLt2 ? `${planningLt2.sourceLabel}${planningLt2.heartRate != null ? ` · ${Math.round(planningLt2.heartRate)} bpm` : ""}` : "Sin LT2 visible"}</small>
        </article>
        <article className="planning-threshold-card">
          <span className="planning-kicker">LT2 práctico</span>
          <strong>{formatDynamicReferencePrimaryMetric(planningPracticalLt2, selectedDiscipline)}</strong>
          <small>{planningPracticalLt2?.estimated_hr_at_target != null ? `${Math.round(planningPracticalLt2.estimated_hr_at_target)} bpm` : "Sin LT2 práctico visible"}</small>
        </article>
        <article className="planning-threshold-card policy">
          <span className="planning-kicker">Base activa</span>
          <strong>{planningThresholdBasis}</strong>
        </article>
      </div>
    </section>
  );
}
