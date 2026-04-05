"""Nutrition module — food search, meal logging, targets, recommendations."""
from __future__ import annotations

import logging
from datetime import date as date_type, datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete import Athlete
from app.models.user import User
from app.schemas.nutrition import (
    DailyNutritionSummary,
    FoodItemCreate,
    FoodItemRead,
    FoodItemUpdate,
    FoodParseRequest,
    FoodParseResponse,
    FoodSearchResult,
    MealLogCreate,
    MealLogItemRead,
    MealLogRead,
    MealSuggestionsRead,
    NutritionRecommendationsRead,
    NutritionTargetRead,
    NutritionTargetUpdate,
)

# Models created by another agent — import gracefully
try:
    from app.models.nutrition import FoodItem, MealLog, MealLogItem, NutritionTarget
except ImportError:
    FoodItem = None  # type: ignore[assignment,misc]
    MealLog = None  # type: ignore[assignment,misc]
    MealLogItem = None  # type: ignore[assignment,misc]
    NutritionTarget = None  # type: ignore[assignment,misc]

# Services created by another agent — import gracefully
try:
    from app.services.food_lookup import search_food
except ImportError:
    search_food = None  # type: ignore[assignment]

try:
    from app.services.food_parser import parse_food_input as parse_food_text
except ImportError:
    parse_food_text = None  # type: ignore[assignment]

from app.services.nutrition_intelligence import (
    calculate_nutrition_targets,
    generate_recommendations,
    get_meal_suggestions,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/nutrition", tags=["nutrition"])

PREMIUM_TIERS = {"pro", "pro_plus", "elite"}


# ── Helpers ──────────────────────────────────────────────────


def _resolve_target_athlete(db: Session, user: User, athlete_id: int) -> Athlete:
    """Resolve and authorize access to the target athlete (same pattern as athlete_health)."""
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atleta no encontrado")

    if user.is_athlete:
        if user.athlete_id != athlete_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo puedes acceder a tus propios datos de nutrición",
            )
        return athlete

    if user.is_coach:
        if athlete.coach_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo puedes acceder a los datos de atletas que entrenas",
            )
        return athlete

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso no permitido")


def _require_nutrition_models() -> None:
    """Raise 503 if nutrition models are not available yet."""
    if FoodItem is None or MealLog is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El módulo de nutrición aún no está disponible. Inténtalo más tarde.",
        )


def _require_premium(user: User) -> None:
    """Raise 403 if user is not on a premium plan."""
    if user.plan_tier not in PREMIUM_TIERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta funcionalidad requiere un plan premium (Pro, Pro+ o Elite).",
        )


def _build_meal_log_read(db: Session, meal: object) -> MealLogRead:
    """Build a MealLogRead from a MealLog ORM object, computing totals."""
    items = db.scalars(
        select(MealLogItem).where(MealLogItem.meal_log_id == meal.id)  # type: ignore[union-attr]
    ).all()

    item_reads: List[MealLogItemRead] = []
    total_cal = 0.0
    total_p = 0.0
    total_c = 0.0
    total_f = 0.0

    for item in items:
        food = db.scalar(select(FoodItem).where(FoodItem.id == item.food_item_id))
        food_name = food.name if food else "Alimento desconocido"
        food_brand = getattr(food, "brand", None) if food else None

        # Use stored macros from MealLogItem (computed at log time)
        cal = getattr(item, "calories", 0) or 0
        prot = getattr(item, "protein_g", 0) or 0
        carb = getattr(item, "carbs_g", 0) or 0
        fat = getattr(item, "fat_g", 0) or 0

        total_cal += cal
        total_p += prot
        total_c += carb
        total_f += fat

        item_reads.append(MealLogItemRead(
            id=item.id,
            food_item_id=item.food_item_id,
            food_name=food_name,
            food_brand=food_brand,
            quantity_g=item.quantity_g,
            calories=round(cal, 1),
            protein_g=round(prot, 1),
            carbs_g=round(carb, 1),
            fat_g=round(fat, 1),
        ))

    return MealLogRead(
        id=meal.id,  # type: ignore[union-attr]
        athlete_id=meal.athlete_id,  # type: ignore[union-attr]
        log_date=meal.log_date,  # type: ignore[union-attr]
        meal_type=meal.meal_type,  # type: ignore[union-attr]
        items=item_reads,
        total_calories=round(total_cal, 1),
        total_protein=round(total_p, 1),
        total_carbs=round(total_c, 1),
        total_fat=round(total_f, 1),
        notes=getattr(meal, "notes", None),
        logged_at=getattr(meal, "logged_at", None) or getattr(meal, "created_at", datetime.now(timezone.utc)),
    )


# ── Food Search & Library ────────────────────────────────────


@router.get("/athletes/{athlete_id}/food-search", response_model=FoodSearchResult)
async def food_search(
    athlete_id: int,
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Search for food items across internal library and external sources."""
    _resolve_target_athlete(db, user, athlete_id)
    _require_nutrition_models()

    # First search internal library
    results: List[FoodItemRead] = []
    source = "library"

    internal = db.scalars(
        select(FoodItem).where(
            FoodItem.name.ilike(f"%{q}%"),
        ).limit(limit)
    ).all()

    for item in internal:
        results.append(FoodItemRead.model_validate(item))

    # If not enough results, try external APIs (skip local since we already searched)
    if len(results) < limit and search_food is not None:
        try:
            external = await search_food(q, athlete_id=athlete_id, db=None)  # db=None skips local
            if external:
                source = "mixed"
                for ext_item in external:
                    # Auto-cache external results in food_items so they get a real id
                    if "id" not in ext_item or ext_item.get("id") is None:
                        try:
                            from app.services.food_lookup import cache_food_item
                            cached = cache_food_item(db, athlete_id, ext_item)
                            results.append(FoodItemRead.model_validate(cached))
                        except Exception:
                            logger.warning("No se pudo cachear alimento externo: %s", ext_item.get("name"))
                    else:
                        results.append(FoodItemRead.model_validate(ext_item))
        except Exception as e:
            logger.warning("Error en búsqueda externa de alimentos: %s", e)

    return FoodSearchResult(items=results[:limit], source=source)


@router.post("/athletes/{athlete_id}/food-library", response_model=FoodItemRead, status_code=status.HTTP_201_CREATED)
def create_food_item(
    athlete_id: int,
    payload: FoodItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add a custom food item to the library."""
    _resolve_target_athlete(db, user, athlete_id)
    _require_nutrition_models()

    food = FoodItem(
        name=payload.name,
        brand=payload.brand,
        source="custom",
        calories_per_100g=payload.calories_per_100g,
        protein_per_100g=payload.protein_per_100g,
        carbs_per_100g=payload.carbs_per_100g,
        fat_per_100g=payload.fat_per_100g,
        fiber_per_100g=payload.fiber_per_100g,
        sugar_per_100g=payload.sugar_per_100g,
        saturated_fat_per_100g=payload.saturated_fat_per_100g,
        default_serving_g=payload.default_serving_g,
        serving_description=payload.serving_description,
        category=payload.category,
        athlete_id=athlete_id,
    )
    db.add(food)
    db.commit()
    db.refresh(food)
    return FoodItemRead.model_validate(food)


@router.get("/athletes/{athlete_id}/food-library", response_model=List[FoodItemRead])
def browse_food_library(
    athlete_id: int,
    q: Optional[str] = Query(None, max_length=200),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Browse food library (internal items, optionally filtered)."""
    _resolve_target_athlete(db, user, athlete_id)
    _require_nutrition_models()

    query = select(FoodItem)
    if q:
        query = query.where(FoodItem.name.ilike(f"%{q}%"))
    query = query.order_by(FoodItem.name).limit(limit)

    items = db.scalars(query).all()
    return [FoodItemRead.model_validate(item) for item in items]


@router.put("/athletes/{athlete_id}/food-library/{food_id}", response_model=FoodItemRead)
def update_food_item(
    athlete_id: int,
    food_id: int,
    payload: FoodItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Edit a custom food item."""
    _resolve_target_athlete(db, user, athlete_id)
    _require_nutrition_models()

    food = db.scalar(select(FoodItem).where(FoodItem.id == food_id))
    if not food:
        raise HTTPException(status_code=404, detail="Alimento no encontrado")

    # Only allow editing custom items
    if getattr(food, "source", "") != "custom":
        raise HTTPException(status_code=403, detail="Solo se pueden editar alimentos personalizados")

    data = payload.model_dump(exclude_none=True)
    for k, v in data.items():
        setattr(food, k, v)

    db.commit()
    db.refresh(food)
    return FoodItemRead.model_validate(food)


# ── Text / Voice Parsing ────────────────────────────────────


@router.post("/athletes/{athlete_id}/parse-food", response_model=FoodParseResponse)
async def parse_food(
    athlete_id: int,
    payload: FoodParseRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Parse natural language text into structured food items."""
    _resolve_target_athlete(db, user, athlete_id)

    if parse_food_text is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El servicio de parsing de alimentos aún no está disponible.",
        )

    try:
        parsed_items = await parse_food_text(payload.text)

        from app.services.food_lookup import estimate_with_ai, cache_food_item
        from app.schemas.nutrition import ParsedFoodItem

        # Try to match parsed items against food library, auto-create via AI if no match
        response_items = []
        any_needs_clarification = False
        for item in parsed_items:
            matched_food = None
            food_name = item["food_name"]

            if db and FoodItem:
                # 1. Search food library for a match
                match = db.scalars(
                    select(FoodItem).where(
                        FoodItem.name.ilike(f"%{food_name}%")
                    ).limit(1)
                ).first()
                if match:
                    matched_food = FoodItemRead.model_validate(match)

                # 2. No match → estimate with AI and auto-cache
                if matched_food is None:
                    try:
                        estimated = await estimate_with_ai(food_name)
                        if estimated:
                            estimated["source"] = "ai_estimated"
                            cached = cache_food_item(db, athlete_id, estimated)
                            matched_food = FoodItemRead.model_validate(cached)
                    except Exception:
                        logger.warning("No se pudo estimar/cachear: %s", food_name)

            needs_clarification = item.get("needs_clarification", False)
            if needs_clarification:
                any_needs_clarification = True

            response_items.append(ParsedFoodItem(
                food_name=food_name,
                quantity_g=item["quantity_g"],
                brand=item.get("brand"),
                matched_food_item=matched_food,
                needs_clarification=needs_clarification,
                clarification_question=item.get("clarification_question"),
            ))

        return FoodParseResponse(items=response_items, needs_clarification=any_needs_clarification)
    except Exception as e:
        logger.error("Error al parsear texto de alimentos: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error al procesar el texto de alimentos")


# ── Meal Logging ─────────────────────────────────────────────


@router.post("/athletes/{athlete_id}/meals", response_model=MealLogRead, status_code=status.HTTP_201_CREATED)
def create_meal_log(
    athlete_id: int,
    payload: MealLogCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Log a complete meal with items."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    _require_nutrition_models()

    # Resolve food items — auto-create if food_item_id is missing but food_name is provided
    resolved_foods: List[tuple] = []  # [(food_item_id, quantity_g)]
    for item in payload.items:
        if item.food_item_id:
            food = db.scalar(select(FoodItem).where(FoodItem.id == item.food_item_id))
            if not food:
                raise HTTPException(
                    status_code=400,
                    detail=f"Alimento con id {item.food_item_id} no encontrado",
                )
            resolved_foods.append((food, item.quantity_g))
        elif item.food_name:
            # Auto-create a basic food item from name
            from app.services.food_lookup import cache_food_item
            food_data = {
                "name": item.food_name,
                "source": "manual",
                "calories_per_100g": 0,
                "protein_per_100g": 0,
                "carbs_per_100g": 0,
                "fat_per_100g": 0,
            }
            food = cache_food_item(db, athlete.id, food_data)
            resolved_foods.append((food, item.quantity_g))
        else:
            raise HTTPException(
                status_code=400,
                detail="Cada item necesita food_item_id o food_name",
            )

    # Create meal log
    meal = MealLog(
        athlete_id=athlete.id,
        log_date=payload.log_date,
        meal_type=payload.meal_type,
        notes=payload.notes,
    )
    db.add(meal)
    db.flush()  # get meal.id

    # Create items with computed macros
    for food, qty_g in resolved_foods:
        factor = qty_g / 100.0
        meal_item = MealLogItem(
            meal_log_id=meal.id,
            food_item_id=food.id,
            quantity_g=qty_g,
            calories=round(food.calories_per_100g * factor, 1),
            protein_g=round(food.protein_per_100g * factor, 1),
            carbs_g=round(food.carbs_per_100g * factor, 1),
            fat_g=round(food.fat_per_100g * factor, 1),
            fiber_g=round(food.fiber_per_100g * factor, 1) if food.fiber_per_100g else None,
        )
        db.add(meal_item)
        # Increment use_count for food item
        food.use_count = (food.use_count or 0) + 1

    db.commit()
    db.refresh(meal)
    return _build_meal_log_read(db, meal)


@router.get("/athletes/{athlete_id}/meals", response_model=List[MealLogRead])
def list_meals_by_date(
    athlete_id: int,
    date: str = Query(..., description="Fecha en formato YYYY-MM-DD"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get all meals for a specific date."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    _require_nutrition_models()

    try:
        target_date = date_type.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Usa YYYY-MM-DD")

    meals = db.scalars(
        select(MealLog).where(
            MealLog.athlete_id == athlete.id,
            MealLog.log_date == target_date,
        ).order_by(MealLog.meal_type)
    ).all()

    return [_build_meal_log_read(db, m) for m in meals]


@router.get("/athletes/{athlete_id}/meals/history", response_model=List[MealLogRead])
def meal_history(
    athlete_id: int,
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get meal history for the last N days."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    _require_nutrition_models()

    since = date_type.today() - timedelta(days=days)
    meals = db.scalars(
        select(MealLog).where(
            MealLog.athlete_id == athlete.id,
            MealLog.log_date >= since,
        ).order_by(MealLog.log_date.desc(), MealLog.meal_type)
    ).all()

    return [_build_meal_log_read(db, m) for m in meals]


@router.delete("/athletes/{athlete_id}/meals/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meal_log(
    athlete_id: int,
    meal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a meal log and its items."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    _require_nutrition_models()

    meal = db.scalar(
        select(MealLog).where(
            MealLog.id == meal_id,
            MealLog.athlete_id == athlete.id,
        )
    )
    if not meal:
        raise HTTPException(status_code=404, detail="Registro de comida no encontrado")

    # Delete items first
    items = db.scalars(
        select(MealLogItem).where(MealLogItem.meal_log_id == meal.id)
    ).all()
    for item in items:
        db.delete(item)

    db.delete(meal)
    db.commit()


# ── Daily Summary ────────────────────────────────────────────


@router.get("/athletes/{athlete_id}/daily-summary", response_model=DailyNutritionSummary)
def daily_summary(
    athlete_id: int,
    date: str = Query(..., description="Fecha en formato YYYY-MM-DD"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get complete daily nutrition summary with all meals, totals, targets, and percentages."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    _require_nutrition_models()

    try:
        target_date = date_type.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Usa YYYY-MM-DD")

    # Get meals
    meals = db.scalars(
        select(MealLog).where(
            MealLog.athlete_id == athlete.id,
            MealLog.log_date == target_date,
        ).order_by(MealLog.meal_type)
    ).all()

    meal_reads = [_build_meal_log_read(db, m) for m in meals]

    # Totals
    total_cal = sum(m.total_calories for m in meal_reads)
    total_p = sum(m.total_protein for m in meal_reads)
    total_c = sum(m.total_carbs for m in meal_reads)
    total_f = sum(m.total_fat for m in meal_reads)

    # Fiber total (if items have fiber data)
    total_fiber: Optional[float] = None
    fiber_sum = 0.0
    has_fiber = False
    for meal in meals:
        items = db.scalars(
            select(MealLogItem).where(MealLogItem.meal_log_id == meal.id)
        ).all()
        for item in items:
            food = db.scalar(select(FoodItem).where(FoodItem.id == item.food_item_id))
            if food and getattr(food, "fiber_per_100g", None):
                fiber_sum += food.fiber_per_100g * item.quantity_g / 100.0
                has_fiber = True
    if has_fiber:
        total_fiber = round(fiber_sum, 1)

    # Get targets
    targets_read: Optional[NutritionTargetRead] = None
    calories_pct: Optional[float] = None
    protein_pct: Optional[float] = None
    carbs_pct: Optional[float] = None
    fat_pct: Optional[float] = None

    if NutritionTarget is not None:
        target = db.scalar(
            select(NutritionTarget).where(NutritionTarget.athlete_id == athlete.id)
        )
        if target:
            targets_read = NutritionTargetRead.model_validate(target)
            if targets_read.calories_kcal > 0:
                calories_pct = round(total_cal / targets_read.calories_kcal * 100, 1)
            if targets_read.protein_g > 0:
                protein_pct = round(total_p / targets_read.protein_g * 100, 1)
            if targets_read.carbs_g > 0:
                carbs_pct = round(total_c / targets_read.carbs_g * 100, 1)
            if targets_read.fat_g > 0:
                fat_pct = round(total_f / targets_read.fat_g * 100, 1)

    # Hydration from legacy log
    total_hydration: Optional[float] = None
    from app.models.nutrition_log import NutritionLog
    legacy = db.scalar(
        select(NutritionLog).where(
            NutritionLog.athlete_id == athlete.id,
            NutritionLog.log_date == target_date,
        )
    )
    if legacy and legacy.hydration_l:
        total_hydration = legacy.hydration_l

    return DailyNutritionSummary(
        date=target_date,
        meals=meal_reads,
        total_calories=round(total_cal, 1),
        total_protein=round(total_p, 1),
        total_carbs=round(total_c, 1),
        total_fat=round(total_f, 1),
        total_fiber=total_fiber,
        total_hydration=total_hydration,
        targets=targets_read,
        calories_pct=calories_pct,
        protein_pct=protein_pct,
        carbs_pct=carbs_pct,
        fat_pct=fat_pct,
    )


# ── Targets ──────────────────────────────────────────────────


@router.get("/athletes/{athlete_id}/targets", response_model=Optional[NutritionTargetRead])
def get_targets(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get current nutrition targets for the athlete."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    _require_nutrition_models()

    if NutritionTarget is None:
        return None

    target = db.scalar(
        select(NutritionTarget).where(NutritionTarget.athlete_id == athlete.id)
    )
    if not target:
        return None
    return NutritionTargetRead.model_validate(target)


@router.put("/athletes/{athlete_id}/targets", response_model=NutritionTargetRead)
def update_targets(
    athlete_id: int,
    payload: NutritionTargetUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update nutrition targets manually."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    _require_nutrition_models()

    target = db.scalar(
        select(NutritionTarget).where(NutritionTarget.athlete_id == athlete.id)
    )

    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No se proporcionaron campos para actualizar")

    if target:
        for k, v in data.items():
            setattr(target, k, v)
    else:
        # Create with defaults + overrides
        defaults = {
            "athlete_id": athlete.id,
            "calories_kcal": 2000,
            "protein_g": 120,
            "carbs_g": 250,
            "fat_g": 70,
            "auto_adjust": False,
        }
        defaults.update(data)
        target = NutritionTarget(**defaults)
        db.add(target)

    db.commit()
    db.refresh(target)
    return NutritionTargetRead.model_validate(target)


@router.post("/athletes/{athlete_id}/targets/auto-calculate", response_model=NutritionTargetRead)
def auto_calculate_targets(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Auto-calculate nutrition targets based on athlete profile and training load."""
    athlete = _resolve_target_athlete(db, user, athlete_id)
    _require_nutrition_models()

    calculated = calculate_nutrition_targets(db, athlete.id)

    # Upsert target
    target = None
    if NutritionTarget is not None:
        target = db.scalar(
            select(NutritionTarget).where(NutritionTarget.athlete_id == athlete.id)
        )

    if target:
        for k, v in calculated.items():
            setattr(target, k, v)
        target.auto_adjust = True
    else:
        if NutritionTarget is not None:
            target = NutritionTarget(
                athlete_id=athlete.id,
                auto_adjust=True,
                **calculated,
            )
            db.add(target)

    db.commit()
    if target:
        db.refresh(target)
        return NutritionTargetRead.model_validate(target)

    # Fallback if model not available
    return NutritionTargetRead(
        auto_adjust=True,
        **calculated,
    )


# ── Premium: Recommendations ────────────────────────────────


@router.get("/athletes/{athlete_id}/recommendations", response_model=NutritionRecommendationsRead)
async def get_recommendations(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get contextual nutrition recommendations based on training, sleep, recovery.

    Requires premium plan (Pro, Pro+ or Elite).
    """
    athlete = _resolve_target_athlete(db, user, athlete_id)
    _require_premium(user)

    recs = await generate_recommendations(db, athlete.id)

    # Build context summary
    context_parts = []
    if recs:
        high_count = sum(1 for r in recs if r["priority"] == "high")
        if high_count:
            context_parts.append(f"{high_count} recomendaciones prioritarias")
        context_parts.append(f"{len(recs)} recomendaciones totales")
    context = " | ".join(context_parts) if context_parts else "Sin recomendaciones para hoy"

    return NutritionRecommendationsRead(
        recommendations=recs,  # type: ignore[arg-type]
        context=context,
    )


# ── Premium: Meal Suggestions ───────────────────────────────


@router.get("/athletes/{athlete_id}/meal-suggestions", response_model=MealSuggestionsRead)
def get_meal_suggestions_endpoint(
    athlete_id: int,
    meal_type: str = Query(
        ...,
        pattern="^(breakfast|lunch|dinner|snack|pre_workout|post_workout|intra_workout)$",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get suggested meals based on history and current training day type.

    Requires premium plan + 7+ days of meal logs.
    """
    athlete = _resolve_target_athlete(db, user, athlete_id)
    _require_premium(user)

    result = get_meal_suggestions(db, athlete.id, meal_type)
    return MealSuggestionsRead(**result)
