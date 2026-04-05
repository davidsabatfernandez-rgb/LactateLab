from __future__ import annotations

from datetime import date, datetime
from typing import Optional, List

from pydantic import BaseModel, Field


# ── Food Items ───────────────────────────────────────────────


class FoodItemRead(BaseModel):
    id: int
    name: str
    brand: Optional[str] = None
    source: str
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    fiber_per_100g: Optional[float] = None
    sugar_per_100g: Optional[float] = None
    saturated_fat_per_100g: Optional[float] = None
    default_serving_g: float
    serving_description: Optional[str] = None
    category: Optional[str] = None
    # Micros (premium)
    iron_mg_per_100g: Optional[float] = None
    calcium_mg_per_100g: Optional[float] = None
    vitamin_d_ug_per_100g: Optional[float] = None
    vitamin_c_mg_per_100g: Optional[float] = None
    magnesium_mg_per_100g: Optional[float] = None
    potassium_mg_per_100g: Optional[float] = None
    zinc_mg_per_100g: Optional[float] = None
    omega3_g_per_100g: Optional[float] = None

    class Config:
        from_attributes = True


class FoodItemCreate(BaseModel):
    name: str = Field(..., max_length=200)
    brand: Optional[str] = Field(None, max_length=100)
    calories_per_100g: float = Field(..., ge=0)
    protein_per_100g: float = Field(..., ge=0)
    carbs_per_100g: float = Field(..., ge=0)
    fat_per_100g: float = Field(..., ge=0)
    fiber_per_100g: Optional[float] = Field(None, ge=0)
    sugar_per_100g: Optional[float] = Field(None, ge=0)
    saturated_fat_per_100g: Optional[float] = Field(None, ge=0)
    default_serving_g: float = Field(100, ge=1)
    serving_description: Optional[str] = None
    category: Optional[str] = None


class FoodItemUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    brand: Optional[str] = Field(None, max_length=100)
    calories_per_100g: Optional[float] = Field(None, ge=0)
    protein_per_100g: Optional[float] = Field(None, ge=0)
    carbs_per_100g: Optional[float] = Field(None, ge=0)
    fat_per_100g: Optional[float] = Field(None, ge=0)
    fiber_per_100g: Optional[float] = Field(None, ge=0)
    sugar_per_100g: Optional[float] = Field(None, ge=0)
    saturated_fat_per_100g: Optional[float] = Field(None, ge=0)
    default_serving_g: Optional[float] = Field(None, ge=1)
    serving_description: Optional[str] = None
    category: Optional[str] = None


# ── Meal Logging ─────────────────────────────────────────────


class MealLogItemCreate(BaseModel):
    food_item_id: Optional[int] = None
    food_name: Optional[str] = None
    quantity_g: float = Field(..., ge=0.1)


class MealLogCreate(BaseModel):
    log_date: date
    meal_type: str = Field(
        ...,
        pattern="^(breakfast|lunch|dinner|snack|pre_workout|post_workout|intra_workout)$",
    )
    items: List[MealLogItemCreate]
    notes: Optional[str] = Field(None, max_length=500)


class MealLogItemRead(BaseModel):
    id: int
    food_item_id: int
    food_name: str  # denormalized from FoodItem
    food_brand: Optional[str] = None
    quantity_g: float
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float

    class Config:
        from_attributes = True


class MealLogRead(BaseModel):
    id: int
    athlete_id: int
    log_date: date
    meal_type: str
    items: List[MealLogItemRead]
    total_calories: float
    total_protein: float
    total_carbs: float
    total_fat: float
    notes: Optional[str] = None
    logged_at: datetime

    class Config:
        from_attributes = True


# ── Targets ──────────────────────────────────────────────────


class NutritionTargetRead(BaseModel):
    calories_kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: Optional[float] = None
    hydration_l: Optional[float] = None
    auto_adjust: bool

    class Config:
        from_attributes = True


class NutritionTargetUpdate(BaseModel):
    calories_kcal: Optional[float] = Field(None, ge=500, le=10000)
    protein_g: Optional[float] = Field(None, ge=20, le=500)
    carbs_g: Optional[float] = Field(None, ge=20, le=1000)
    fat_g: Optional[float] = Field(None, ge=10, le=500)
    fiber_g: Optional[float] = Field(None, ge=0, le=100)
    hydration_l: Optional[float] = Field(None, ge=0.5, le=15)
    auto_adjust: Optional[bool] = None


# ── Daily Summary ────────────────────────────────────────────


class DailyNutritionSummary(BaseModel):
    date: date
    meals: List[MealLogRead]
    total_calories: float
    total_protein: float
    total_carbs: float
    total_fat: float
    total_fiber: Optional[float] = None
    total_hydration: Optional[float] = None
    targets: Optional[NutritionTargetRead] = None
    calories_pct: Optional[float] = None  # % of target
    protein_pct: Optional[float] = None
    carbs_pct: Optional[float] = None
    fat_pct: Optional[float] = None


# ── Food Search ──────────────────────────────────────────────


class FoodSearchResult(BaseModel):
    items: List[FoodItemRead]
    source: str  # "library", "fatsecret", "openfoodfacts", "ai"


# ── Text Parsing ─────────────────────────────────────────────


class FoodParseRequest(BaseModel):
    text: str = Field(..., max_length=1000)
    meal_type: Optional[str] = None


class ParsedFoodItem(BaseModel):
    food_name: str
    quantity_g: float
    brand: Optional[str] = None
    matched_food_item: Optional[FoodItemRead] = None
    needs_clarification: bool
    clarification_question: Optional[str] = None


class FoodParseResponse(BaseModel):
    items: List[ParsedFoodItem]
    needs_clarification: bool


# ── Recommendations (premium) ────────────────────────────────


class NutritionRecommendation(BaseModel):
    category: str  # "carbs", "protein", "hydration", "micronutrient", "rest_day", "pre_competition"
    title: str
    message: str
    priority: str  # "high", "medium", "low"
    icon: str  # emoji


class NutritionRecommendationsRead(BaseModel):
    recommendations: List[NutritionRecommendation]
    context: str  # Brief context summary


# ── Meal Suggestions (premium) ───────────────────────────────


class MealSuggestion(BaseModel):
    meal_type: str
    suggested_items: List[dict]  # [{food_name, quantity_g, calories, protein, carbs, fat}]
    total_calories: float
    confidence: float  # 0-1, how confident based on meal history
    reason: str  # "Sueles desayunar esto los días de entrenamiento"


class MealSuggestionsRead(BaseModel):
    suggestions: List[MealSuggestion]
    has_enough_data: bool
