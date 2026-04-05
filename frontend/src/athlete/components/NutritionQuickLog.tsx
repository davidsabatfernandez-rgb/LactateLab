import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";
import { NUTRITION_PRESETS, calcCalories } from "../utils/nutrition";

type Props = {
  token: string;
  athleteId: number;
  readOnly?: boolean;
};

type NutritionValues = {
  carbs_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  calories_kcal: number | null;
  hydration_l: number | null;
  preset: string | null;
  notes: string;
};

const EMPTY: NutritionValues = {
  carbs_g: null, protein_g: null, fat_g: null, calories_kcal: null, hydration_l: null, preset: null, notes: ""
};

export function NutritionQuickLog({ token, athleteId, readOnly }: Props) {
  // Figure out target date (yesterday if before noon, today otherwise) — same logic as BehaviorJournalSection
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);
  const targetDate = now.getHours() < 12 ? yesterdayIso : todayIso;

  const [values, setValues] = useState<NutritionValues>({ ...EMPTY });
  const [saved, setSaved] = useState(false);
  const [savedValues, setSavedValues] = useState<NutritionValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [caloriesManual, setCaloriesManual] = useState(false);

  const load = useCallback(async () => {
    try {
      const logs = await api.nutritionLogs(token, athleteId, 7) as Array<Record<string, unknown>>;
      const existing = logs.find((l) => l.log_date === targetDate);
      if (existing) {
        const v: NutritionValues = {
          carbs_g: (existing.carbs_g as number) ?? null,
          protein_g: (existing.protein_g as number) ?? null,
          fat_g: (existing.fat_g as number) ?? null,
          calories_kcal: (existing.calories_kcal as number) ?? null,
          hydration_l: (existing.hydration_l as number) ?? null,
          preset: (existing.preset as string) ?? null,
          notes: (existing.notes as string) ?? "",
        };
        setSavedValues(v);
        setValues(v);
        setSaved(true);
      }
    } catch { /* first time, no data */ }
    setLoading(false);
  }, [token, athleteId, targetDate]);

  useEffect(() => { load(); }, [load]);

  // Auto-calculate calories
  useEffect(() => {
    if (caloriesManual) return;
    const c = values.carbs_g ?? 0;
    const p = values.protein_g ?? 0;
    const f = values.fat_g ?? 0;
    if (c || p || f) {
      setValues((prev) => ({ ...prev, calories_kcal: calcCalories(c, p, f) }));
    }
  }, [values.carbs_g, values.protein_g, values.fat_g, caloriesManual]);

  const selectPreset = (key: string) => {
    const preset = NUTRITION_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setValues({
      carbs_g: preset.carbs_g,
      protein_g: preset.protein_g,
      fat_g: preset.fat_g,
      calories_kcal: preset.calories_kcal,
      hydration_l: values.hydration_l,
      preset: key,
      notes: values.notes,
    });
    setCaloriesManual(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = { log_date: targetDate };
      if (values.carbs_g !== null) body.carbs_g = values.carbs_g;
      if (values.protein_g !== null) body.protein_g = values.protein_g;
      if (values.fat_g !== null) body.fat_g = values.fat_g;
      if (values.calories_kcal !== null) body.calories_kcal = values.calories_kcal;
      if (values.hydration_l !== null) body.hydration_l = values.hydration_l;
      if (values.preset) body.preset = values.preset;
      if (values.notes.trim()) body.notes = values.notes.trim();
      await api.submitNutritionLog(token, athleteId, body);
      setSavedValues({ ...values });
      setSaved(true);
    } catch {
      setError("Error al guardar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setSaved(false);
  };

  const hasMacros = values.carbs_g !== null || values.protein_g !== null || values.fat_g !== null || values.hydration_l !== null;

  if (loading) {
    return (
      <div className="ath-bj-card">
        <h3 className="ath-bj-title">Nutrición</h3>
        <p style={{ fontSize: 12, color: "var(--ath-text-muted)", textAlign: "center", padding: "20px 0" }}>Cargando...</p>
      </div>
    );
  }

  // Saved state
  if (saved && savedValues) {
    const presetInfo = NUTRITION_PRESETS.find((p) => p.key === savedValues.preset);
    return (
      <div className="ath-bj-card">
        <div className="ath-bj-header">
          <h3 className="ath-bj-title">Nutrición</h3>
          {!readOnly && (
            <button type="button" className="ath-bj-settings" onClick={handleEdit} aria-label="Editar">
              ✏️
            </button>
          )}
        </div>
        <div className="ath-nutr-saved">
          {presetInfo && <span className="ath-nutr-saved-preset">{presetInfo.emoji} {presetInfo.label}</span>}
          <div className="ath-nutr-saved-macros">
            {savedValues.carbs_g !== null && <span>🍞 {savedValues.carbs_g}g CH</span>}
            {savedValues.protein_g !== null && <span>🥩 {savedValues.protein_g}g Prot</span>}
            {savedValues.fat_g !== null && <span>🧈 {savedValues.fat_g}g Grasa</span>}
            {savedValues.calories_kcal !== null && <span>🔥 {Math.round(savedValues.calories_kcal)} kcal</span>}
            {savedValues.hydration_l !== null && <span>💧 {savedValues.hydration_l}L</span>}
          </div>
          {savedValues.notes && <p className="ath-bj-saved-notes">{savedValues.notes}</p>}
        </div>
      </div>
    );
  }

  // Edit state
  if (readOnly) return null;

  return (
    <div className="ath-bj-card">
      <h3 className="ath-bj-title">Nutrición</h3>
      <p className="ath-bj-subtitle">¿Qué comiste {targetDate === todayIso ? "hoy" : "ayer"}?</p>

      {/* Preset pills */}
      <div className="ath-nutr-presets">
        {NUTRITION_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`ath-nutr-preset-pill${values.preset === p.key ? " active" : ""}`}
            onClick={() => selectPreset(p.key)}
          >
            {p.emoji} {p.label}
          </button>
        ))}
      </div>

      {/* Macro grid */}
      <div className="ath-nutr-grid">
        <div className="ath-nutr-input-group">
          <label>🍞 Carbohidratos (g)</label>
          <input
            type="number"
            min={0}
            max={1000}
            value={values.carbs_g ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, carbs_g: e.target.value ? Number(e.target.value) : null, preset: null }))}
            placeholder="g"
          />
        </div>
        <div className="ath-nutr-input-group">
          <label>🥩 Proteína (g)</label>
          <input
            type="number"
            min={0}
            max={500}
            value={values.protein_g ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, protein_g: e.target.value ? Number(e.target.value) : null, preset: null }))}
            placeholder="g"
          />
        </div>
        <div className="ath-nutr-input-group">
          <label>🧈 Grasa (g)</label>
          <input
            type="number"
            min={0}
            max={500}
            value={values.fat_g ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, fat_g: e.target.value ? Number(e.target.value) : null, preset: null }))}
            placeholder="g"
          />
        </div>
        <div className="ath-nutr-input-group">
          <label>🔥 Calorías (kcal)</label>
          <input
            type="number"
            min={0}
            max={10000}
            value={values.calories_kcal ?? ""}
            onChange={(e) => {
              setCaloriesManual(true);
              setValues((v) => ({ ...v, calories_kcal: e.target.value ? Number(e.target.value) : null }));
            }}
            placeholder="kcal"
          />
        </div>
      </div>

      {/* Hydration */}
      <div className="ath-nutr-hydration">
        <label>💧 Hidratación</label>
        <div className="ath-nutr-hydration-row">
          <input
            type="range"
            min={0}
            max={6}
            step={0.1}
            value={values.hydration_l ?? 0}
            onChange={(e) => setValues((v) => ({ ...v, hydration_l: Number(e.target.value) }))}
          />
          <span className="ath-nutr-hydration-value">{(values.hydration_l ?? 0).toFixed(1)}L</span>
        </div>
      </div>

      {/* Notes */}
      <textarea
        className="ath-bj-notes"
        rows={2}
        maxLength={500}
        placeholder="Notas sobre comida (opcional)"
        value={values.notes}
        onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
      />

      {/* Error */}
      {error && <p className="ath-bj-error ath-bj-error-center">{error}</p>}

      {/* Save */}
      <button
        type="button"
        className="ath-bj-save"
        onClick={handleSave}
        disabled={saving || !hasMacros}
      >
        {saving ? "Guardando..." : "Guardar nutrición"}
      </button>
      {!hasMacros && <p className="ath-bj-hint">Selecciona un preset o introduce valores</p>}
    </div>
  );
}
