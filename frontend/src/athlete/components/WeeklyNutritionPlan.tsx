// Used in: NutritionPage.tsx — weekly overview section
// Also available standalone for embedding in other pages (e.g. TodayPage)

import { useEffect, useState, useMemo } from "react";
import { api } from "../../lib/api";
import type { MealLogType, NutritionTargetType } from "../utils/nutritionTypes";

type DayData = {
  date: string;
  target_calories: number;
  logged_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meals: { breakfast: boolean; lunch: boolean; dinner: boolean; snack: boolean };
};

type Props = {
  token: string;
  athleteId: number;
  readOnly?: boolean;
  onDayClick?: (date: string) => void;
};

const DAY_NAMES = ["Lun", "Mar", "Mi\u00e9", "Jue", "Vie", "S\u00e1b", "Dom"];

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** Build 7-day data from meal history and targets */
function buildWeekData(
  weekStart: Date,
  meals: MealLogType[],
  targets: NutritionTargetType | null,
): DayData[] {
  const days: DayData[] = [];
  for (let i = 0; i < 7; i++) {
    const date = formatDateISO(addDays(weekStart, i));
    const dayMeals = meals.filter((m) => m.log_date === date);
    const logged_calories = dayMeals.reduce((s, m) => s + m.total_calories, 0);
    const protein_g = dayMeals.reduce((s, m) => s + m.total_protein, 0);
    const carbs_g = dayMeals.reduce((s, m) => s + m.total_carbs, 0);
    const fat_g = dayMeals.reduce((s, m) => s + m.total_fat, 0);
    const mealTypes = new Set(dayMeals.map((m) => m.meal_type));

    days.push({
      date,
      target_calories: targets?.calories_kcal ?? 0,
      logged_calories,
      protein_g,
      carbs_g,
      fat_g,
      meals: {
        breakfast: mealTypes.has("breakfast"),
        lunch: mealTypes.has("lunch"),
        dinner: mealTypes.has("dinner"),
        snack: mealTypes.has("snack"),
      },
    });
  }
  return days;
}

export function WeeklyNutritionPlan({ token, athleteId, readOnly, onDayClick }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [days, setDays] = useState<DayData[]>([]);
  const [targets, setTargets] = useState<NutritionTargetType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const weekStart = useMemo(() => {
    const today = new Date();
    const monday = getMonday(today);
    return addDays(monday, weekOffset * 7);
  }, [weekOffset]);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    (async () => {
      try {
        // Fetch meal history for the week (use 14 days to ensure coverage)
        const [mealsResult, targetsResult] = await Promise.all([
          api.mealHistory(token, athleteId, 28),
          api.nutritionTargets(token, athleteId),
        ]);

        if (!cancelled) {
          setTargets(targetsResult);
          // Filter meals within week range
          const startStr = formatDateISO(weekStart);
          const endStr = formatDateISO(weekEnd);
          const weekMeals = (mealsResult || []).filter(
            (m: MealLogType) => m.log_date >= startStr && m.log_date <= endStr
          );
          setDays(buildWeekData(weekStart, weekMeals, targetsResult));
        }
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [token, athleteId, weekStart, weekEnd]);

  const handlePrev = () => setWeekOffset((o) => o - 1);
  const handleNext = () => setWeekOffset((o) => o + 1);

  const weekLabel = `${formatShortDate(formatDateISO(weekStart))} \u2014 ${formatShortDate(formatDateISO(weekEnd))}`;

  // Weekly averages
  const daysWithData = days.filter((d) => d.logged_calories > 0);
  const avgCalories = daysWithData.length > 0
    ? daysWithData.reduce((s, d) => s + d.logged_calories, 0) / daysWithData.length
    : 0;
  const avgProtein = daysWithData.length > 0
    ? daysWithData.reduce((s, d) => s + d.protein_g, 0) / daysWithData.length
    : 0;
  const avgCarbs = daysWithData.length > 0
    ? daysWithData.reduce((s, d) => s + d.carbs_g, 0) / daysWithData.length
    : 0;
  const avgFat = daysWithData.length > 0
    ? daysWithData.reduce((s, d) => s + d.fat_g, 0) / daysWithData.length
    : 0;

  if (error) {
    return (
      <div className="ath-nutr-week-container">
        <p className="ath-nutr-week-error">Error al cargar el plan semanal</p>
      </div>
    );
  }

  const todayStr = formatDateISO(new Date());

  return (
    <div className="ath-nutr-week-container">
      <div className="ath-nutr-week-nav">
        <button className="ath-nutr-week-nav-btn" onClick={handlePrev} aria-label="Semana anterior">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="ath-nutr-week-nav-label">{weekLabel}</span>
        <button
          className="ath-nutr-week-nav-btn"
          onClick={handleNext}
          disabled={weekOffset >= 0}
          aria-label="Semana siguiente"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="ath-nutr-week-grid">
        {loading
          ? DAY_NAMES.map((name, i) => (
              <div key={i} className="ath-nutr-week-day ath-nutr-week-day--loading">
                <span className="ath-nutr-week-day-name">{name}</span>
                <div className="ath-nutr-week-day-skeleton" />
              </div>
            ))
          : days.map((day, i) => {
              const pct = day.target_calories > 0
                ? Math.min(120, Math.round((day.logged_calories / day.target_calories) * 100))
                : (day.logged_calories > 0 ? 50 : 0);
              const barColor =
                pct >= 90 && pct <= 110
                  ? "var(--ath-green, #10B981)"
                  : pct > 110
                    ? "var(--ath-amber, #F59E0B)"
                    : "var(--ath-accent, #2563EB)";
              const isToday = day.date === todayStr;

              return (
                <div
                  key={day.date}
                  className={`ath-nutr-week-day${isToday ? " ath-nutr-week-day--today" : ""}${onDayClick && !readOnly ? " ath-nutr-week-day--clickable" : ""}`}
                  onClick={() => !readOnly && onDayClick?.(day.date)}
                >
                  <span className="ath-nutr-week-day-name">{DAY_NAMES[i]}</span>
                  <span className="ath-nutr-week-day-date">{formatShortDate(day.date)}</span>

                  <div className="ath-nutr-week-day-bar-container">
                    <div className="ath-nutr-week-day-bar-target" />
                    <div
                      className="ath-nutr-week-day-bar-logged"
                      style={{ height: `${Math.min(pct, 100)}%`, background: barColor }}
                    />
                  </div>

                  <span className="ath-nutr-week-day-cals">
                    {day.logged_calories > 0 ? Math.round(day.logged_calories) : "\u2014"}
                  </span>

                  <div className="ath-nutr-week-day-macros">
                    <span>P:{Math.round(day.protein_g)}</span>
                    <span>C:{Math.round(day.carbs_g)}</span>
                    <span>G:{Math.round(day.fat_g)}</span>
                  </div>

                  <div className="ath-nutr-week-day-meals">
                    <span className={`ath-nutr-week-meal-dot${day.meals.breakfast ? " ath-nutr-week-meal-dot--done" : ""}`} title="Desayuno" />
                    <span className={`ath-nutr-week-meal-dot${day.meals.lunch ? " ath-nutr-week-meal-dot--done" : ""}`} title="Comida" />
                    <span className={`ath-nutr-week-meal-dot${day.meals.dinner ? " ath-nutr-week-meal-dot--done" : ""}`} title="Cena" />
                    {day.meals.snack && (
                      <span className="ath-nutr-week-meal-dot ath-nutr-week-meal-dot--done" title="Snack" />
                    )}
                  </div>
                </div>
              );
            })}
      </div>

      {/* Weekly summary row */}
      {!loading && daysWithData.length > 0 && (
        <div className="ath-nutr-week-summary">
          <div className="ath-nutr-week-summary-item">
            <span className="ath-nutr-week-summary-label">Media diaria</span>
            <span className="ath-nutr-week-summary-value">
              {Math.round(avgCalories)} kcal
            </span>
          </div>
          {targets && (
            <div className="ath-nutr-week-summary-item">
              <span className="ath-nutr-week-summary-label">Objetivo</span>
              <span className="ath-nutr-week-summary-value">
                {Math.round(targets.calories_kcal)} kcal
              </span>
            </div>
          )}
          <div className="ath-nutr-week-summary-item">
            <span className="ath-nutr-week-summary-label">Macros (media)</span>
            <span className="ath-nutr-week-summary-value">
              P:{Math.round(avgProtein)}g C:{Math.round(avgCarbs)}g G:{Math.round(avgFat)}g
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
