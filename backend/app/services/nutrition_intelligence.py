"""Nutrition Intelligence Service — personalized targets, recommendations, and meal suggestions.

Uses athlete profile, training load, mesocycle phase, sleep, and recovery data
to generate contextual nutrition guidance.
"""
from __future__ import annotations

import logging
import math
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict, Any

import httpx
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.athlete import Athlete, AthleteFocusBlock
from app.models.health_sample import HealthSample
from app.models.planned_session import PlannedSession
from app.models.wellness_checkin import WellnessCheckIn

# Models created by another agent — import gracefully
try:
    from app.models.nutrition import FoodItem, MealLog, MealLogItem, NutritionTarget
except ImportError:
    FoodItem = None  # type: ignore[assignment,misc]
    MealLog = None  # type: ignore[assignment,misc]
    MealLogItem = None  # type: ignore[assignment,misc]
    NutritionTarget = None  # type: ignore[assignment,misc]

logger = logging.getLogger(__name__)

PREMIUM_TIERS = {"pro", "pro_plus", "elite"}

# ── Auto-calculate Targets ───────────────────────────────────


def _calculate_bmr(weight_kg: float, height_cm: Optional[float], age_years: int, sex: str) -> float:
    """Mifflin-St Jeor equation for BMR."""
    h = height_cm or 170.0  # fallback
    if sex and sex.lower() in ("male", "m", "hombre", "masculino"):
        return 10 * weight_kg + 6.25 * h - 5 * age_years + 5
    else:
        return 10 * weight_kg + 6.25 * h - 5 * age_years - 161


def _get_activity_factor(db: Session, athlete_id: int) -> float:
    """Estimate activity factor from recent planned sessions (last 7 days)."""
    today = date.today()
    week_ago = today - timedelta(days=7)
    session_count = db.scalar(
        select(func.count(PlannedSession.id)).where(
            PlannedSession.athlete_id == athlete_id,
            PlannedSession.scheduled_date >= week_ago,
            PlannedSession.scheduled_date <= today,
            PlannedSession.status != "cancelled",
        )
    ) or 0

    if session_count >= 10:
        return 1.9  # very active
    elif session_count >= 7:
        return 1.725  # extra active
    elif session_count >= 5:
        return 1.55  # moderately active
    elif session_count >= 3:
        return 1.375  # lightly active
    return 1.2  # sedentary


def _get_current_phase(db: Session, athlete_id: int) -> Optional[str]:
    """Get the current mesocycle phase from active focus block."""
    today = date.today()
    block = db.scalar(
        select(AthleteFocusBlock).where(
            AthleteFocusBlock.athlete_id == athlete_id,
            AthleteFocusBlock.start_date <= today,
            AthleteFocusBlock.status == "active",
        ).order_by(AthleteFocusBlock.start_date.desc())
    )
    if block:
        return block.phase
    return None


def _calculate_age(dob: date) -> int:
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def calculate_nutrition_targets(db: Session, athlete_id: int) -> Dict[str, Any]:
    """Calculate personalized nutrition targets based on athlete profile + training load.

    Uses:
    - BMR (Mifflin-St Jeor: weight, height, age, sex)
    - Activity factor from recent training load
    - Mesocycle phase adjustments
    - Goal adjustments (weight loss = deficit, performance = maintenance+)

    Returns: {calories_kcal, protein_g, carbs_g, fat_g, fiber_g, hydration_l}
    """
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if not athlete:
        raise ValueError(f"Atleta {athlete_id} no encontrado")

    weight = athlete.weight or 70.0
    height_cm = athlete.height  # may be None
    age = _calculate_age(athlete.date_of_birth) if athlete.date_of_birth else 30
    sex = athlete.sex or "male"

    # 1. BMR
    bmr = _calculate_bmr(weight, height_cm, age, sex)

    # 2. Activity factor
    activity_factor = _get_activity_factor(db, athlete_id)
    tdee = bmr * activity_factor

    # 3. Phase adjustments
    phase = _get_current_phase(db, athlete_id)
    phase_lower = (phase or "").lower()

    # Default macro ratios (% of calories): carbs/protein/fat
    carb_pct = 0.50
    protein_pct = 0.25
    fat_pct = 0.25

    if "base" in phase_lower or "general" in phase_lower:
        carb_pct, protein_pct, fat_pct = 0.50, 0.25, 0.25
    elif "build" in phase_lower or "specific" in phase_lower:
        carb_pct, protein_pct, fat_pct = 0.55, 0.25, 0.20
    elif "peak" in phase_lower or "competition" in phase_lower:
        carb_pct, protein_pct, fat_pct = 0.60, 0.22, 0.18
    elif "taper" in phase_lower:
        tdee *= 0.88  # reduce 12%
        carb_pct, protein_pct, fat_pct = 0.50, 0.28, 0.22
    elif "recovery" in phase_lower or "transition" in phase_lower:
        tdee *= 0.95
        carb_pct, protein_pct, fat_pct = 0.45, 0.28, 0.27

    # 4. Goal adjustments
    goal = (athlete.goal_category or "").lower()
    if "weight_loss" in goal or "pérdida" in goal or "perder" in goal:
        tdee -= 400  # moderate deficit
    elif "performance" in goal or "rendimiento" in goal:
        tdee += 100  # small surplus for adaptation

    # Ensure minimum
    tdee = max(tdee, 1200)

    # 5. Calculate grams
    calories_kcal = round(tdee)
    protein_g = round((tdee * protein_pct) / 4, 1)
    carbs_g = round((tdee * carb_pct) / 4, 1)
    fat_g = round((tdee * fat_pct) / 9, 1)

    # Protein floor: at least 1.6 g/kg for endurance athletes
    min_protein = round(weight * 1.6, 1)
    if protein_g < min_protein:
        protein_g = min_protein

    # Fiber: 14g per 1000 kcal
    fiber_g = round(tdee / 1000 * 14, 1)

    # Hydration: 35 ml/kg + activity adjustment
    base_hydration = weight * 0.035
    if activity_factor >= 1.55:
        base_hydration += 0.5
    if activity_factor >= 1.725:
        base_hydration += 0.5
    hydration_l = round(base_hydration, 1)

    return {
        "calories_kcal": calories_kcal,
        "protein_g": protein_g,
        "carbs_g": carbs_g,
        "fat_g": fat_g,
        "fiber_g": fiber_g,
        "hydration_l": hydration_l,
    }


# ── Recommendations Engine ───────────────────────────────────


async def generate_recommendations(db: Session, athlete_id: int) -> List[Dict[str, Any]]:
    """Generate contextual nutrition recommendations based on training, sleep, recovery.

    Input data:
    - Today's and tomorrow's planned sessions
    - Recent recovery score / wellness check-in
    - Sleep data (last night)
    - Current mesocycle phase
    - Nutrition logs (last 3 days for deficit detection)
    - Athlete profile

    All text in Spanish.
    """
    today = date.today()
    tomorrow = today + timedelta(days=1)
    three_days_ago = today - timedelta(days=3)

    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if not athlete:
        return []

    recommendations: List[Dict[str, Any]] = []

    # ── Gather data ──

    # Tomorrow's sessions
    tomorrow_sessions = db.scalars(
        select(PlannedSession).where(
            PlannedSession.athlete_id == athlete_id,
            PlannedSession.scheduled_date == tomorrow,
            PlannedSession.status != "cancelled",
        )
    ).all()

    # Today's sessions
    today_sessions = db.scalars(
        select(PlannedSession).where(
            PlannedSession.athlete_id == athlete_id,
            PlannedSession.scheduled_date == today,
            PlannedSession.status != "cancelled",
        )
    ).all()

    # Latest wellness check-in
    latest_wellness = db.scalar(
        select(WellnessCheckIn).where(
            WellnessCheckIn.athlete_id == athlete_id,
            WellnessCheckIn.check_date >= three_days_ago,
        ).order_by(WellnessCheckIn.check_date.desc())
    )

    # Last night's sleep
    latest_sleep = db.scalar(
        select(HealthSample).where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date >= today - timedelta(days=1),
        ).order_by(HealthSample.sample_date.desc())
    )

    # Current phase
    phase = _get_current_phase(db, athlete_id)
    phase_lower = (phase or "").lower()

    # Recent nutrition data (legacy logs)
    from app.models.nutrition_log import NutritionLog
    recent_nutrition = db.scalars(
        select(NutritionLog).where(
            NutritionLog.athlete_id == athlete_id,
            NutritionLog.log_date >= three_days_ago,
        ).order_by(NutritionLog.log_date.desc())
    ).all()

    # ── Generate recommendations ──

    # 1. High training load tomorrow → increase carbs
    has_hard_tomorrow = False
    for s in tomorrow_sessions:
        role = (s.session_role or "").lower()
        if role in ("key", "quality", "race"):
            has_hard_tomorrow = True
            break
        if s.estimated_tss and s.estimated_tss > 80:
            has_hard_tomorrow = True
            break

    if has_hard_tomorrow:
        recommendations.append({
            "category": "carbs",
            "title": "Carga de carbohidratos",
            "message": "Mañana tienes una sesión exigente. Aumenta los carbohidratos en la cena de hoy a 100-120g para optimizar las reservas de glucógeno.",
            "priority": "high",
            "icon": "🍝",
        })

    # 2. Post hard session today → protein recovery
    has_hard_today = False
    for s in today_sessions:
        role = (s.session_role or "").lower()
        if role in ("key", "quality", "race"):
            has_hard_today = True
            break
        if s.estimated_tss and s.estimated_tss > 80:
            has_hard_today = True
            break

    if has_hard_today:
        recommendations.append({
            "category": "protein",
            "title": "Recuperación post-sesión",
            "message": "Después de tu sesión intensa de hoy, asegúrate de consumir 30-40g de proteína dentro de los 45 minutos siguientes para optimizar la recuperación muscular.",
            "priority": "high",
            "icon": "💪",
        })

    # 3. Rest day (no sessions today and tomorrow)
    if not today_sessions and not tomorrow_sessions:
        recommendations.append({
            "category": "rest_day",
            "title": "Día de descanso",
            "message": "Hoy es día de descanso. Mantén una ingesta moderada de carbohidratos y prioriza proteína y grasas saludables para la recuperación.",
            "priority": "low",
            "icon": "🧘",
        })

    # 4. Poor sleep → magnesium
    if latest_sleep and latest_sleep.sleep_seconds:
        sleep_hours = latest_sleep.sleep_seconds / 3600
        if sleep_hours < 6.5:
            recommendations.append({
                "category": "micronutrient",
                "title": "Mejorar calidad del sueño",
                "message": f"Anoche dormiste solo {sleep_hours:.1f}h. Considera incluir alimentos ricos en magnesio (espinacas, almendras, plátano) en la cena para mejorar la calidad del sueño.",
                "priority": "medium",
                "icon": "😴",
            })

    # 5. Poor wellness → general recovery
    if latest_wellness:
        avg_wellness = (latest_wellness.fatigue + latest_wellness.soreness + latest_wellness.mood + latest_wellness.sleep_quality) / 4
        if avg_wellness < 2.5:
            recommendations.append({
                "category": "micronutrient",
                "title": "Apoyo a la recuperación",
                "message": "Tu bienestar general está bajo. Prioriza alimentos antiinflamatorios: frutos rojos, pescado azul (omega-3), cúrcuma y vegetales de hoja verde.",
                "priority": "high",
                "icon": "🥗",
            })

    # 6. Phase-specific recommendations
    if "taper" in phase_lower:
        recommendations.append({
            "category": "pre_competition",
            "title": "Fase de tapering",
            "message": "Estás en fase de tapering. Reduce las calorías totales un 10-15% respecto a tu fase de carga, pero mantén la proteína alta (1.8-2.0 g/kg) para preservar la masa muscular.",
            "priority": "medium",
            "icon": "📉",
        })
    elif "peak" in phase_lower or "competition" in phase_lower:
        recommendations.append({
            "category": "pre_competition",
            "title": "Preparación competición",
            "message": "Estás cerca de la competición. Aumenta progresivamente los carbohidratos a 8-10 g/kg en los 2-3 días previos. Reduce la fibra para evitar molestias digestivas.",
            "priority": "high",
            "icon": "🏁",
        })

    # 7. Hydration check (from legacy logs)
    recent_hydration = [n.hydration_l for n in recent_nutrition if n.hydration_l]
    if recent_hydration:
        avg_hydration = sum(recent_hydration) / len(recent_hydration)
        weight = athlete.weight or 70
        target_hydration = weight * 0.035
        if avg_hydration < target_hydration * 0.8:
            recommendations.append({
                "category": "hydration",
                "title": "Aumentar hidratación",
                "message": f"Tu hidratación media de los últimos días ({avg_hydration:.1f}L) está por debajo del objetivo ({target_hydration:.1f}L). Intenta beber al menos {target_hydration:.1f}L hoy.",
                "priority": "high",
                "icon": "💧",
            })

    # 8. Calorie deficit detection
    if recent_nutrition and len(recent_nutrition) >= 2:
        avg_cals = sum(n.calories_kcal for n in recent_nutrition if n.calories_kcal) / max(
            len([n for n in recent_nutrition if n.calories_kcal]), 1
        )
        if avg_cals > 0 and avg_cals < 1500 and (athlete.weight or 70) > 55:
            recommendations.append({
                "category": "carbs",
                "title": "Posible déficit calórico",
                "message": f"Tu ingesta media reciente ({avg_cals:.0f} kcal) parece baja para tu perfil. Un déficit excesivo puede comprometer la recuperación y el rendimiento.",
                "priority": "high",
                "icon": "⚠️",
            })

    return recommendations


# ── Meal Suggestions ─────────────────────────────────────────


def get_meal_suggestions(db: Session, athlete_id: int, meal_type: str) -> Dict[str, Any]:
    """Analyze past meal logs to suggest likely meals.

    Groups meals by meal_type + day_type (training vs rest),
    counts frequency of food combinations, and returns top 3
    most frequent for this meal_type + current day_type.

    Requires 7+ days of logged meals.
    """
    if MealLog is None or MealLogItem is None or FoodItem is None:
        return {"suggestions": [], "has_enough_data": False}

    today = date.today()
    thirty_days_ago = today - timedelta(days=30)

    # Check if there's enough data (7+ days)
    distinct_days = db.scalar(
        select(func.count(func.distinct(MealLog.log_date))).where(
            MealLog.athlete_id == athlete_id,
            MealLog.log_date >= thirty_days_ago,
        )
    ) or 0

    if distinct_days < 7:
        return {"suggestions": [], "has_enough_data": False}

    # Determine if today is a training day
    today_sessions = db.scalars(
        select(PlannedSession).where(
            PlannedSession.athlete_id == athlete_id,
            PlannedSession.scheduled_date == today,
            PlannedSession.status != "cancelled",
        )
    ).all()
    is_training_day = len(today_sessions) > 0

    # Get past meals of this type
    past_meals = db.scalars(
        select(MealLog).where(
            MealLog.athlete_id == athlete_id,
            MealLog.meal_type == meal_type,
            MealLog.log_date >= thirty_days_ago,
        ).order_by(MealLog.log_date.desc())
    ).all()

    if not past_meals:
        return {"suggestions": [], "has_enough_data": True}

    # Group meals by their food item composition (as a frozenset of food_item_ids)
    meal_compositions: List[Dict[str, Any]] = []
    for meal in past_meals:
        # Check if the meal date was a training day
        meal_session_count = db.scalar(
            select(func.count(PlannedSession.id)).where(
                PlannedSession.athlete_id == athlete_id,
                PlannedSession.scheduled_date == meal.log_date,
                PlannedSession.status != "cancelled",
            )
        ) or 0
        was_training = meal_session_count > 0

        # Filter by matching day type
        if is_training_day != was_training:
            continue

        items = db.scalars(
            select(MealLogItem).where(MealLogItem.meal_log_id == meal.id)
        ).all()
        if not items:
            continue

        food_key = frozenset((item.food_item_id, round(item.quantity_g)) for item in items)
        meal_compositions.append({
            "key": food_key,
            "items": items,
            "meal": meal,
        })

    # Count frequency of each composition
    key_counter: Counter = Counter()
    key_to_data: Dict[Any, Dict] = {}
    for comp in meal_compositions:
        k = comp["key"]
        key_counter[k] += 1
        key_to_data[k] = comp  # keep last occurrence for item details

    # Build top 3 suggestions
    suggestions = []
    day_type_label = "entrenamiento" if is_training_day else "descanso"

    for composition_key, count in key_counter.most_common(3):
        data = key_to_data[composition_key]
        items_detail = []
        total_cals = 0.0

        for item in data["items"]:
            food = db.scalar(select(FoodItem).where(FoodItem.id == item.food_item_id))
            if not food:
                continue
            factor = item.quantity_g / 100.0
            cals = food.calories_per_100g * factor
            total_cals += cals
            items_detail.append({
                "food_name": food.name,
                "quantity_g": item.quantity_g,
                "calories": round(cals, 1),
                "protein": round(food.protein_per_100g * factor, 1),
                "carbs": round(food.carbs_per_100g * factor, 1),
                "fat": round(food.fat_per_100g * factor, 1),
            })

        confidence = min(count / max(len(meal_compositions), 1), 1.0)
        suggestions.append({
            "meal_type": meal_type,
            "suggested_items": items_detail,
            "total_calories": round(total_cals, 1),
            "confidence": round(confidence, 2),
            "reason": f"Has registrado esta comida {count} veces en días de {day_type_label}",
        })

    return {"suggestions": suggestions, "has_enough_data": True}
