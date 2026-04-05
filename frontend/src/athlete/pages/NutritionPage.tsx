import { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";
import { api } from "../../lib/api";
import { useAthleteDataSafe } from "../context/AthleteDataContext";
import { FoodLogModal } from "../components/FoodLogModal";
import { NutritionTargetsModal } from "../components/NutritionTargetsModal";
import type {
  MealLogType,
  DailyNutritionSummaryType,
  NutritionTargetType,
} from "../utils/nutritionTypes";
import { MEAL_TYPES } from "../utils/nutritionTypes";

// ── Helpers ────────────────────────────────────────────
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function pctColor(pct: number | undefined): string {
  if (pct == null) return "var(--ath-text-muted)";
  if (pct >= 80 && pct <= 120) return "var(--ath-green)";
  if (pct >= 60 && pct < 80) return "var(--ath-amber)";
  return "var(--ath-red)";
}

function clampPct(pct: number | undefined): number {
  if (pct == null) return 0;
  return Math.min(pct, 100);
}

// ── SVG Ring ──────────────────────────────────────────
function MacroRing({
  label,
  current,
  target,
  pct,
  unit,
  color,
}: {
  label: string;
  current: number;
  target: number;
  pct: number | undefined;
  unit: string;
  color: string;
}) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const progress = clampPct(pct) / 100;
  const strokeColor = pctColor(pct);

  return (
    <div className="ath-nutr-summary-ring">
      <svg viewBox="0 0 100 100" className="ath-nutr-summary-ring-svg">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--ath-border-subtle)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - progress)}
          transform="rotate(-90 50 50)"
          className="ath-nutr-summary-ring-progress"
        />
        <text x="50" y="46" textAnchor="middle" className="ath-nutr-summary-ring-value" fill={color}>
          {Math.round(current)}
        </text>
        <text x="50" y="62" textAnchor="middle" className="ath-nutr-summary-ring-target" fill="var(--ath-text-muted)">
          / {Math.round(target)} {unit}
        </text>
      </svg>
      <span className="ath-nutr-summary-ring-label">{label}</span>
      {pct != null && (
        <span className="ath-nutr-summary-ring-pct" style={{ color: strokeColor }}>
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────
export function NutritionPage() {
  const data = useAthleteDataSafe();
  const token = data?.token ?? "";
  const athleteId = data?.user.athlete_id!;

  const [date, setDate] = useState(() => toIso(new Date()));
  const [summary, setSummary] = useState<DailyNutritionSummaryType | null>(null);
  const [meals, setMeals] = useState<MealLogType[]>([]);
  const [targets, setTargets] = useState<NutritionTargetType | null>(null);
  const [history, setHistory] = useState<MealLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modals
  const [showTargets, setShowTargets] = useState(false);
  const [logModalMealType, setLogModalMealType] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !athleteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");

    const results = await Promise.allSettled([
      api.nutritionDailySummary(token, athleteId, date),
      api.getMeals(token, athleteId, date),
      api.nutritionTargets(token, athleteId),
      api.mealHistory(token, athleteId, 7),
    ]);

    if (results[0].status === "fulfilled") setSummary(results[0].value);
    else setSummary(null);

    if (results[1].status === "fulfilled") setMeals(results[1].value);
    else setMeals([]);

    if (results[2].status === "fulfilled") setTargets(results[2].value);
    // Keep existing targets if fetch fails

    if (results[3].status === "fulfilled") setHistory(results[3].value);

    // Only show error if all main calls fail
    if (results[0].status === "rejected" && results[1].status === "rejected") {
      setError("Error al cargar datos de nutricion. El modulo puede no estar disponible aun.");
    }

    setLoading(false);
  }, [token, athleteId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDateChange = (delta: number) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setDate(toIso(d));
  };

  const handleDeleteMeal = async (mealId: number) => {
    try {
      await api.deleteMeal(token, athleteId, mealId);
      setMeals((prev) => prev.filter((m) => m.id !== mealId));
      // Reload summary
      try {
        const s = await api.nutritionDailySummary(token, athleteId, date);
        setSummary(s);
      } catch { /* ignore */ }
    } catch {
      setError("Error al eliminar comida");
    }
  };

  const handleMealSaved = (meal: MealLogType) => {
    setMeals((prev) => [...prev, meal]);
    setLogModalMealType(null);
    // Reload summary
    api.nutritionDailySummary(token, athleteId, date)
      .then((s) => setSummary(s))
      .catch(() => { /* ignore */ });
  };

  const handleTargetsSaved = (t: NutritionTargetType) => {
    setTargets(t);
    setShowTargets(false);
    load(); // Reload to get updated percentages
  };

  // ── Chart data ──
  const chartData = buildChartData(history, date);

  // ── Grouped meals ──
  const mealsByType = MEAL_TYPES.map((mt) => ({
    ...mt,
    meals: meals.filter((m) => m.meal_type === mt.key),
  }));

  // Compute daily totals from meals when summary not available
  const totalCalories = summary?.total_calories ?? meals.reduce((s, m) => s + m.total_calories, 0);
  const totalProtein = summary?.total_protein ?? meals.reduce((s, m) => s + m.total_protein, 0);
  const totalCarbs = summary?.total_carbs ?? meals.reduce((s, m) => s + m.total_carbs, 0);
  const totalFat = summary?.total_fat ?? meals.reduce((s, m) => s + m.total_fat, 0);

  const calPct = targets ? (totalCalories / targets.calories_kcal) * 100 : summary?.calories_pct;
  const protPct = targets ? (totalProtein / targets.protein_g) * 100 : summary?.protein_pct;
  const carbsPct = targets ? (totalCarbs / targets.carbs_g) * 100 : summary?.carbs_pct;
  const fatPct = targets ? (totalFat / targets.fat_g) * 100 : summary?.fat_pct;

  // ── Render ──
  if (loading) {
    return (
      <div className="ath-nutr-page">
        <div className="ath-bj-card">
          <h2 className="ath-nutr-page-title">Nutricion</h2>
          <p style={{ fontSize: 12, color: "var(--ath-text-muted)", textAlign: "center", padding: "20px 0" }}>
            Cargando...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ath-nutr-page">
      {/* ── Header ── */}
      <div className="ath-nutr-page-header">
        <h2 className="ath-nutr-page-title">Nutricion</h2>
        <div className="ath-nutr-page-header-actions">
          <button
            type="button"
            className="ath-nutr-page-targets-btn"
            onClick={() => setShowTargets(true)}
          >
            Objetivos
          </button>
        </div>
      </div>

      {/* ── Date picker ── */}
      <div className="ath-nutr-page-date-row">
        <button type="button" className="ath-nutr-page-date-arrow" onClick={() => handleDateChange(-1)} aria-label="Dia anterior">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <input
          type="date"
          className="ath-nutr-page-date-input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={toIso(new Date())}
        />
        <button
          type="button"
          className="ath-nutr-page-date-arrow"
          onClick={() => handleDateChange(1)}
          disabled={date >= toIso(new Date())}
          aria-label="Dia siguiente"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {error && <p className="ath-nutr-page-error">{error}</p>}

      {/* ── Daily Summary Rings ── */}
      <div className="ath-nutr-summary-card">
        <MacroRing
          label="Calorias"
          current={totalCalories}
          target={targets?.calories_kcal ?? 2200}
          pct={calPct}
          unit="kcal"
          color="var(--ath-text)"
        />
        <MacroRing
          label="Proteina"
          current={totalProtein}
          target={targets?.protein_g ?? 120}
          pct={protPct}
          unit="g"
          color="var(--ath-blue)"
        />
        <MacroRing
          label="Carbs"
          current={totalCarbs}
          target={targets?.carbs_g ?? 280}
          pct={carbsPct}
          unit="g"
          color="var(--ath-amber)"
        />
        <MacroRing
          label="Grasa"
          current={totalFat}
          target={targets?.fat_g ?? 75}
          pct={fatPct}
          unit="g"
          color="var(--ath-red)"
        />
      </div>

      {/* ── Meals by type ── */}
      <div className="ath-nutr-meals-section">
        {mealsByType.map((mt) => (
          <div key={mt.key} className="ath-nutr-meals-group">
            <div className="ath-nutr-meals-group-header">
              <span className="ath-nutr-meals-group-emoji">{mt.emoji}</span>
              <span className="ath-nutr-meals-group-label">{mt.label}</span>
              {mt.meals.length > 0 && (
                <span className="ath-nutr-meals-group-total">
                  {Math.round(mt.meals.reduce((s, m) => s + m.total_calories, 0))} kcal
                </span>
              )}
            </div>

            {mt.meals.map((meal) => (
              <div key={meal.id} className="ath-nutr-meals-card">
                <div className="ath-nutr-meals-card-items">
                  {meal.items.map((item) => (
                    <div key={item.id} className="ath-nutr-meals-item">
                      <span className="ath-nutr-meals-item-name">{item.food_name}</span>
                      <span className="ath-nutr-meals-item-qty">{item.quantity_g}g</span>
                      <span className="ath-nutr-meals-item-cals">{Math.round(item.calories)} kcal</span>
                    </div>
                  ))}
                </div>
                {meal.notes && <p className="ath-nutr-meals-card-notes">{meal.notes}</p>}
                <div className="ath-nutr-meals-card-macros">
                  <span>P: {Math.round(meal.total_protein)}g</span>
                  <span>CH: {Math.round(meal.total_carbs)}g</span>
                  <span>G: {Math.round(meal.total_fat)}g</span>
                </div>
                <div className="ath-nutr-meals-card-actions">
                  <button
                    type="button"
                    className="ath-nutr-meals-card-delete"
                    onClick={() => handleDeleteMeal(meal.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="ath-nutr-meals-add-btn"
              onClick={() => setLogModalMealType(mt.key)}
            >
              + Anadir comida
            </button>
          </div>
        ))}
      </div>

      {/* ── 7-day Macro Chart ── */}
      {chartData.length > 0 && (
        <div className="ath-nutr-chart-card">
          <h3 className="ath-nutr-chart-title">Macros ultimos 7 dias</h3>
          <div className="ath-nutr-chart-container">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ath-border-subtle)" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11, fill: "var(--ath-text-muted)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--ath-text-muted)" }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--ath-bg-card)",
                    border: "1px solid var(--ath-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = { protein: "Proteina", carbs: "Carbs", fat: "Grasa" };
                    return [`${Math.round(value)}g`, labels[name] ?? name];
                  }}
                  labelFormatter={formatDateLabel}
                />
                <Legend
                  formatter={(value: string) => {
                    const labels: Record<string, string> = { protein: "Proteina", carbs: "Carbs", fat: "Grasa" };
                    return labels[value] ?? value;
                  }}
                />
                <Bar dataKey="protein" stackId="macros" fill="var(--ath-blue)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="carbs" stackId="macros" fill="var(--ath-amber)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="fat" stackId="macros" fill="var(--ath-red)" radius={[4, 4, 0, 0]} />
                {targets && (
                  <ReferenceLine
                    y={targets.protein_g + targets.carbs_g + targets.fat_g}
                    stroke="var(--ath-accent)"
                    strokeDasharray="4 4"
                    label={{ value: "Objetivo", position: "right", fontSize: 10, fill: "var(--ath-accent)" }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {meals.length === 0 && !error && (
        <div className="ath-nutr-empty">
          <p className="ath-nutr-empty-text">
            No hay comidas registradas para este dia. Pulsa "+ Anadir comida" en cualquier seccion.
          </p>
        </div>
      )}

      {/* ── Food Log Modal ── */}
      {logModalMealType && (
        <FoodLogModal
          token={token}
          athleteId={athleteId}
          date={date}
          mealType={logModalMealType}
          onSaved={handleMealSaved}
          onClose={() => setLogModalMealType(null)}
        />
      )}

      {/* ── Targets Modal ── */}
      {showTargets && (
        <NutritionTargetsModal
          token={token}
          athleteId={athleteId}
          targets={targets}
          onSave={handleTargetsSaved}
          onClose={() => setShowTargets(false)}
        />
      )}
    </div>
  );
}

// ── Build chart data from history ──
function buildChartData(history: MealLogType[], currentDate: string) {
  // Group meals by date
  const byDate = new Map<string, { protein: number; carbs: number; fat: number }>();

  // Ensure last 7 days are present
  for (let i = 6; i >= 0; i--) {
    const d = new Date(currentDate + "T00:00:00");
    d.setDate(d.getDate() - i);
    byDate.set(toIso(d), { protein: 0, carbs: 0, fat: 0 });
  }

  for (const meal of history) {
    const key = meal.log_date;
    const existing = byDate.get(key) ?? { protein: 0, carbs: 0, fat: 0 };
    existing.protein += meal.total_protein;
    existing.carbs += meal.total_carbs;
    existing.fat += meal.total_fat;
    byDate.set(key, existing);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, macros]) => ({ date, ...macros }));
}
