import { useState } from "react";
import { api } from "../../lib/api";
import type { NutritionTargetType } from "../utils/nutritionTypes";

type Props = {
  token: string;
  athleteId: number;
  targets: NutritionTargetType | null;
  onSave: (targets: NutritionTargetType) => void;
  onClose: () => void;
};

export function NutritionTargetsModal({ token, athleteId, targets, onSave, onClose }: Props) {
  const [values, setValues] = useState<NutritionTargetType>(
    targets ?? { calories_kcal: 2200, protein_g: 120, carbs_g: 280, fat_g: 75, fiber_g: 30, hydration_l: 2.5, auto_adjust: false },
  );
  const [saving, setSaving] = useState(false);
  const [autoCalculating, setAutoCalculating] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await api.updateNutritionTargets(token, athleteId, values as unknown as Record<string, unknown>);
      onSave(result);
    } catch {
      setError("Error al guardar objetivos");
    } finally {
      setSaving(false);
    }
  };

  const handleAutoCalculate = async () => {
    setAutoCalculating(true);
    setError("");
    try {
      const result = await api.autoCalculateTargets(token, athleteId);
      setValues(result);
    } catch {
      setError("Error al auto-calcular. Asegurate de tener datos suficientes.");
    } finally {
      setAutoCalculating(false);
    }
  };

  const update = (key: keyof NutritionTargetType, val: number | boolean) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <div className="ath-nutr-targets-overlay" onClick={onClose}>
      <div className="ath-nutr-targets-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ath-nutr-targets-header">
          <h3>Objetivos nutricionales</h3>
          <button type="button" className="ath-nutr-targets-close" onClick={onClose} aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="ath-nutr-targets-body">
          <div className="ath-nutr-targets-grid">
            <div className="ath-nutr-targets-field">
              <label>Calorias (kcal)</label>
              <input
                type="number"
                min={0}
                max={10000}
                value={values.calories_kcal}
                onChange={(e) => update("calories_kcal", Number(e.target.value))}
              />
            </div>
            <div className="ath-nutr-targets-field">
              <label>Proteina (g)</label>
              <input
                type="number"
                min={0}
                max={500}
                value={values.protein_g}
                onChange={(e) => update("protein_g", Number(e.target.value))}
              />
            </div>
            <div className="ath-nutr-targets-field">
              <label>Carbohidratos (g)</label>
              <input
                type="number"
                min={0}
                max={1000}
                value={values.carbs_g}
                onChange={(e) => update("carbs_g", Number(e.target.value))}
              />
            </div>
            <div className="ath-nutr-targets-field">
              <label>Grasa (g)</label>
              <input
                type="number"
                min={0}
                max={500}
                value={values.fat_g}
                onChange={(e) => update("fat_g", Number(e.target.value))}
              />
            </div>
            <div className="ath-nutr-targets-field">
              <label>Fibra (g)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={values.fiber_g ?? 0}
                onChange={(e) => update("fiber_g", Number(e.target.value))}
              />
            </div>
            <div className="ath-nutr-targets-field">
              <label>Hidratacion (L)</label>
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={values.hydration_l ?? 0}
                onChange={(e) => update("hydration_l", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="ath-nutr-targets-auto-row">
            <label className="ath-nutr-targets-auto-label">
              <input
                type="checkbox"
                checked={values.auto_adjust}
                onChange={(e) => update("auto_adjust", e.target.checked)}
              />
              Ajustar automaticamente segun entrenamiento
            </label>
          </div>

          <button
            type="button"
            className="ath-nutr-targets-auto-btn"
            onClick={handleAutoCalculate}
            disabled={autoCalculating}
          >
            {autoCalculating ? "Calculando..." : "Auto-calcular objetivos"}
          </button>

          {error && <p className="ath-nutr-targets-error">{error}</p>}
        </div>

        <div className="ath-nutr-targets-footer">
          <button type="button" className="ath-nutr-targets-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="ath-nutr-targets-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
