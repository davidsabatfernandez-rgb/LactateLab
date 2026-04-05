export type FoodItemType = {
  id: number;
  name: string;
  brand?: string;
  source: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g?: number;
  sugar_per_100g?: number;
  saturated_fat_per_100g?: number;
  default_serving_g: number;
  serving_description?: string;
  category?: string;
};

export type MealLogItemType = {
  id: number;
  food_item_id: number;
  food_name: string;
  food_brand?: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type MealLogType = {
  id: number;
  athlete_id: number;
  log_date: string;
  meal_type: string;
  items: MealLogItemType[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  notes?: string;
  logged_at: string;
};

export type DailyNutritionSummaryType = {
  date: string;
  meals: MealLogType[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_fiber?: number;
  total_hydration?: number;
  targets?: NutritionTargetType;
  calories_pct?: number;
  protein_pct?: number;
  carbs_pct?: number;
  fat_pct?: number;
};

export type NutritionTargetType = {
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  hydration_l?: number;
  auto_adjust: boolean;
};

export type ParsedFoodItemType = {
  food_name: string;
  quantity_g: number;
  brand?: string;
  matched_food_item?: FoodItemType;
  needs_clarification: boolean;
  clarification_question?: string;
};

export type NutritionRecommendationType = {
  category: string;
  title: string;
  message: string;
  priority: string;
  icon: string;
};

export type MealSuggestionType = {
  meal_type: string;
  suggested_items: {
    food_name: string;
    quantity_g: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }[];
  total_calories: number;
  confidence: number;
  reason: string;
};

export const MEAL_TYPES = [
  { key: "breakfast", label: "Desayuno", emoji: "\u{1F305}", time: "07:00-10:00" },
  { key: "lunch", label: "Comida", emoji: "\u{1F37D}\uFE0F", time: "13:00-15:00" },
  { key: "dinner", label: "Cena", emoji: "\u{1F319}", time: "20:00-22:00" },
  { key: "snack", label: "Snack", emoji: "\u{1F34E}", time: "" },
  { key: "pre_workout", label: "Pre-entreno", emoji: "\u26A1", time: "" },
  { key: "post_workout", label: "Post-entreno", emoji: "\u{1F4AA}", time: "" },
  { key: "intra_workout", label: "Intra-entreno", emoji: "\u{1F6B4}", time: "" },
] as const;
