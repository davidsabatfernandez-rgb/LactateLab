import { useCallback, useState } from "react";

import { api } from "../../lib/api";
import type { CoachPlan } from "../../types";
import type { PlanningAction } from "../context/PlanningContext";

type TrainingPlansPanelProps = {
  coachPlans: CoachPlan[];
  token: string;
  dispatch: (action: PlanningAction) => void;
  onCreatePlan: () => void;
  onEditPlan: (plan: CoachPlan) => void;
};

export function TrainingPlansPanel({
  coachPlans,
  token,
  dispatch,
  onCreatePlan,
  onEditPlan,
}: TrainingPlansPanelProps) {
  const [searchText, setSearchText] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const search = searchText.toLowerCase().trim();

  const filteredPlans = search
    ? coachPlans.filter((p) => p.name.toLowerCase().includes(search) || (p.description ?? "").toLowerCase().includes(search))
    : coachPlans;

  const reloadPlans = useCallback(async () => {
    const updated = (await api.listCoachPlans(token)) as CoachPlan[];
    dispatch({ type: "SET_COACH_PLANS", payload: updated });
  }, [token, dispatch]);

  const handleDelete = useCallback(async (id: number) => {
    await api.deleteCoachPlan(token, id);
    await reloadPlans();
  }, [token, reloadPlans]);

  const totalSessions = coachPlans.reduce((s, p) => s + p.days.length, 0);

  return (
    <div className="tpp-root">
      <div className="tpp-header">
        <h3>Planes de entrenamiento</h3>
        <button type="button" className="planning-manual-save-btn" onClick={onCreatePlan}>
          + Nuevo plan
        </button>
      </div>

      <div className="tpp-toolbar">
        <input
          type="text"
          className="wlp-search"
          placeholder="Buscar plan..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
          {coachPlans.length} planes · {totalSessions} sesiones
        </span>
      </div>

      <div className="tpp-plan-list">
        {/* Mis planes */}
        <div className="wlp-folder">
          <button
            type="button"
            className="wlp-folder-header"
            onClick={() => setExpandedId(expandedId === -1 ? null : -1)}
          >
            <span className={`wlp-folder-chevron ${expandedId === -1 ? "open" : ""}`}>&#9654;</span>
            <span className="wlp-folder-name">Mis planes</span>
            <span className="wlp-folder-count">({filteredPlans.length})</span>
          </button>

          {expandedId === -1 && (
            <div className="wlp-folder-body">
              {filteredPlans.map((plan) => (
                <div key={plan.id} className="tpp-plan-item">
                  <div className="tpp-plan-info" onClick={() => onEditPlan(plan)}>
                    <strong>{plan.name}</strong>
                    <small>
                      {plan.duration_weeks} semanas · {plan.days.length} sesiones
                      {plan.description ? ` · ${plan.description}` : ""}
                    </small>
                  </div>
                  <div className="tpp-plan-actions">
                    <button type="button" className="tpp-plan-action primary" onClick={() => onEditPlan(plan)}>
                      Editar
                    </button>
                    <button type="button" className="tpp-plan-action danger" onClick={() => handleDelete(plan.id)}>
                      x
                    </button>
                  </div>
                </div>
              ))}
              {filteredPlans.length === 0 && (
                <div className="wlp-empty" style={{ padding: "16px 10px" }}>
                  <p>Sin planes. Crea uno con el botón + arriba.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
