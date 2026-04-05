export type NutritionPreset = {
  key: string;
  label: string;
  emoji: string;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  calories_kcal: number;
};

export const NUTRITION_PRESETS: NutritionPreset[] = [
  { key: "low_carb", label: "Bajo en CH", emoji: "\u{1F957}", carbs_g: 100, protein_g: 150, fat_g: 80, calories_kcal: 1700 },
  { key: "medium_carb", label: "Normal", emoji: "\u{1F37D}\uFE0F", carbs_g: 250, protein_g: 130, fat_g: 70, calories_kcal: 2100 },
  { key: "high_carb", label: "Alto en CH", emoji: "\u{1F35D}", carbs_g: 400, protein_g: 120, fat_g: 60, calories_kcal: 2600 },
  { key: "race_day", label: "D\u00EDa de carrera", emoji: "\u{1F3C1}", carbs_g: 500, protein_g: 100, fat_g: 50, calories_kcal: 2900 },
];

export function calcCalories(carbs: number, protein: number, fat: number): number {
  return Math.round(carbs * 4 + protein * 4 + fat * 9);
}

export type BehaviorCorrelation = {
  behavior_key: string;
  behavior_label: string;
  behavior_emoji: string;
  outcome_metric: string;
  outcome_label: string;
  sample_size_with: number;
  sample_size_without: number;
  mean_with: number;
  mean_without: number;
  effect_pct: number;
  effect_direction: string;
  confidence: string;
  p_value: number | null;
  lag_days: number;
  narrative: string;
};
