from __future__ import annotations

"""Three-tier food lookup: FatSecret -> Open Food Facts -> AI estimation."""

import hashlib
import hmac
import json
import logging
import time
import urllib.parse
import uuid
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.nutrition import FoodItem

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def search_food(
    query: str,
    athlete_id: Optional[int] = None,
    db: Optional[Session] = None,
) -> List[Dict[str, Any]]:
    """Search for food items. Returns list of matches with nutritional data.

    Pipeline:
        1. Check user's food library first (food_items where athlete_id matches or is NULL)
        2. If <3 results, query FatSecret API
        3. If still <3, query Open Food Facts
        4. Return merged + deduplicated results
    """
    results: List[Dict[str, Any]] = []

    # 1. Local DB lookup
    if db is not None:
        local = get_user_food_library(db, athlete_id, query=query)
        for item in local:
            results.append(_food_item_to_dict(item))

    # 2. FatSecret
    if len(results) < 3:
        try:
            fs_results = await search_fatsecret(query)
            results.extend(fs_results)
        except Exception:
            logger.exception("FatSecret search failed for query=%s", query)

    # 3. Open Food Facts
    if len(results) < 3:
        try:
            off_results = await search_openfoodfacts(query)
            results.extend(off_results)
        except Exception:
            logger.exception("OpenFoodFacts search failed for query=%s", query)

    # Deduplicate by (name_lower, brand_lower)
    seen: set[tuple[str, str]] = set()
    deduped: List[Dict[str, Any]] = []
    for r in results:
        key = (r.get("name", "").lower().strip(), (r.get("brand") or "").lower().strip())
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    return deduped


async def get_food_details(food_id: str, source: str) -> Dict[str, Any]:
    """Get detailed nutritional data for a specific food item."""
    if source == "fatsecret":
        return await _fatsecret_food_get(food_id)
    elif source == "openfoodfacts":
        return await _openfoodfacts_product_get(food_id)
    return {}


# ---------------------------------------------------------------------------
# FatSecret (OAuth 1.0)
# ---------------------------------------------------------------------------


async def search_fatsecret(query: str) -> List[Dict[str, Any]]:
    """Query FatSecret API using OAuth 1.0a.

    If no API key configured, returns empty list.
    """
    settings = get_settings()
    if not settings.fatsecret_consumer_key or not settings.fatsecret_consumer_secret:
        return []

    params = {
        "method": "foods.search",
        "search_expression": query,
        "format": "json",
        "max_results": "10",
    }

    signed = _fatsecret_sign(
        "GET",
        "https://platform.fatsecret.com/rest/server.api",
        params,
        settings.fatsecret_consumer_key,
        settings.fatsecret_consumer_secret,
    )

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://platform.fatsecret.com/rest/server.api",
            params=signed,
        )
        resp.raise_for_status()
        data = resp.json()

    foods = data.get("foods", {}).get("food", [])
    if isinstance(foods, dict):
        foods = [foods]

    results: List[Dict[str, Any]] = []
    for f in foods:
        desc = f.get("food_description", "")
        macros = _parse_fatsecret_description(desc)
        results.append(
            {
                "name": f.get("food_name", ""),
                "brand": f.get("brand_name"),
                "source": "fatsecret",
                "source_id": str(f.get("food_id", "")),
                "calories_per_100g": macros.get("calories", 0),
                "protein_per_100g": macros.get("protein", 0),
                "carbs_per_100g": macros.get("carbs", 0),
                "fat_per_100g": macros.get("fat", 0),
            }
        )
    return results


def _fatsecret_sign(
    method: str,
    url: str,
    params: Dict[str, str],
    consumer_key: str,
    consumer_secret: str,
) -> Dict[str, str]:
    """Create OAuth 1.0 signed parameters for FatSecret."""
    oauth_params = {
        "oauth_consumer_key": consumer_key,
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_nonce": uuid.uuid4().hex,
        "oauth_version": "1.0",
    }
    all_params = {**params, **oauth_params}

    sorted_params = sorted(all_params.items())
    param_string = "&".join(f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe='')}" for k, v in sorted_params)

    base_string = "&".join(
        [
            method.upper(),
            urllib.parse.quote(url, safe=""),
            urllib.parse.quote(param_string, safe=""),
        ]
    )
    signing_key = f"{urllib.parse.quote(consumer_secret, safe='')}&"

    signature = hmac.new(
        signing_key.encode(),
        base_string.encode(),
        hashlib.sha1,
    ).digest()

    import base64

    all_params["oauth_signature"] = base64.b64encode(signature).decode()
    return all_params


def _parse_fatsecret_description(desc: str) -> Dict[str, float]:
    """Parse FatSecret food_description string like 'Per 100g - Calories: 52kcal | Fat: 0.17g | Carbs: 13.81g | Protein: 0.26g'."""
    result: Dict[str, float] = {"calories": 0, "fat": 0, "carbs": 0, "protein": 0}
    try:
        parts = desc.split("|")
        for part in parts:
            part = part.strip().lower()
            if "calories:" in part or "calorías:" in part:
                result["calories"] = float("".join(c for c in part.split(":")[-1] if c.isdigit() or c == "."))
            elif "fat:" in part or "grasa:" in part:
                result["fat"] = float("".join(c for c in part.split(":")[-1] if c.isdigit() or c == "."))
            elif "carbs:" in part or "carbohidratos:" in part:
                result["carbs"] = float("".join(c for c in part.split(":")[-1] if c.isdigit() or c == "."))
            elif "protein:" in part or "proteína:" in part:
                result["protein"] = float("".join(c for c in part.split(":")[-1] if c.isdigit() or c == "."))
    except (ValueError, IndexError):
        pass
    return result


async def _fatsecret_food_get(food_id: str) -> Dict[str, Any]:
    """Get detailed food info from FatSecret by food_id."""
    settings = get_settings()
    if not settings.fatsecret_consumer_key:
        return {}

    params = {
        "method": "food.get.v2",
        "food_id": food_id,
        "format": "json",
    }
    signed = _fatsecret_sign(
        "GET",
        "https://platform.fatsecret.com/rest/server.api",
        params,
        settings.fatsecret_consumer_key,
        settings.fatsecret_consumer_secret,
    )
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://platform.fatsecret.com/rest/server.api",
            params=signed,
        )
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Open Food Facts
# ---------------------------------------------------------------------------


async def search_openfoodfacts(query: str) -> List[Dict[str, Any]]:
    """Query Open Food Facts API (no auth needed)."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://world.openfoodfacts.org/cgi/search.pl",
            params={
                "search_terms": query,
                "search_simple": "1",
                "action": "process",
                "json": "1",
                "page_size": "10",
            },
            headers={"User-Agent": "PeakAerobic/1.0"},
        )
        resp.raise_for_status()
        data = resp.json()

    products = data.get("products", [])
    results: List[Dict[str, Any]] = []
    for p in products:
        nutr = p.get("nutriments", {})
        name = p.get("product_name") or p.get("product_name_en") or ""
        if not name:
            continue
        results.append(
            {
                "name": name,
                "brand": p.get("brands"),
                "source": "openfoodfacts",
                "source_id": p.get("code", ""),
                "calories_per_100g": nutr.get("energy-kcal_100g", 0) or 0,
                "protein_per_100g": nutr.get("proteins_100g", 0) or 0,
                "carbs_per_100g": nutr.get("carbohydrates_100g", 0) or 0,
                "fat_per_100g": nutr.get("fat_100g", 0) or 0,
                "fiber_per_100g": nutr.get("fiber_100g"),
                "sugar_per_100g": nutr.get("sugars_100g"),
                "saturated_fat_per_100g": nutr.get("saturated-fat_100g"),
                "sodium_mg_per_100g": _mg_from_g(nutr.get("sodium_100g")),
                "iron_mg_per_100g": _mg_from_g(nutr.get("iron_100g")),
                "calcium_mg_per_100g": _mg_from_g(nutr.get("calcium_100g")),
                "vitamin_c_mg_per_100g": _mg_from_g(nutr.get("vitamin-c_100g")),
                "magnesium_mg_per_100g": _mg_from_g(nutr.get("magnesium_100g")),
                "potassium_mg_per_100g": _mg_from_g(nutr.get("potassium_100g")),
            }
        )
    return results


def _mg_from_g(val: Optional[float]) -> Optional[float]:
    """Convert g to mg if value is present, or pass through if already mg."""
    if val is None:
        return None
    # OFF stores some values in g, some in mg – values < 1 are likely g
    return float(val) * 1000 if float(val) < 1 else float(val)


async def _openfoodfacts_product_get(barcode: str) -> Dict[str, Any]:
    """Get a single product from Open Food Facts by barcode."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json",
            headers={"User-Agent": "PeakAerobic/1.0"},
        )
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# AI Estimation (OpenRouter)
# ---------------------------------------------------------------------------


async def estimate_with_ai(query: str, settings: Optional[Any] = None) -> Optional[Dict[str, Any]]:
    """Last resort: use OpenRouter LLM to estimate nutritional values.

    Returns a dict with per-100g values, or None on failure.
    """
    if settings is None:
        settings = get_settings()

    if not settings.openrouter_api_key:
        return None

    prompt = (
        f"You are a nutrition database. For the food item '{query}', "
        "provide nutritional values per 100g in JSON format: "
        '{"calories": <number>, "protein_g": <number>, "carbs_g": <number>, '
        '"fat_g": <number>, "fiber_g": <number>, "sugar_g": <number>, '
        '"saturated_fat_g": <number>}. '
        "Be precise and use standard USDA-equivalent values. "
        "Return ONLY the JSON object, nothing else."
    )

    models_to_try = [
        settings.openrouter_model,
        "nvidia/nemotron-nano-9b-v2:free",
        "qwen/qwen3-coder:free",
        "openai/gpt-oss-20b:free",
    ]

    data = None
    async with httpx.AsyncClient(timeout=30) as client:
        for model in models_to_try:
            resp = await client.post(
                f"{settings.openrouter_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                },
            )
            if resp.status_code in (429, 400, 404, 503):
                logger.warning("Model %s failed (HTTP %s) for AI estimation, trying next", model, resp.status_code)
                continue
            resp.raise_for_status()
            candidate = resp.json()
            try:
                _ = candidate["choices"][0]["message"]["content"]
                data = candidate
                break
            except (KeyError, IndexError):
                logger.warning("Model %s returned malformed response for AI estimation, trying next", model)
                continue

    if data is None:
        return None

    try:
        content = data["choices"][0]["message"]["content"]
        # Strip markdown fences if present
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1]
        if content.endswith("```"):
            content = content.rsplit("```", 1)[0]
        content = content.strip()

        parsed = json.loads(content)
        return {
            "name": query,
            "brand": None,
            "source": "ai_estimated",
            "source_id": None,
            "calories_per_100g": float(parsed.get("calories", 0)),
            "protein_per_100g": float(parsed.get("protein_g", 0)),
            "carbs_per_100g": float(parsed.get("carbs_g", 0)),
            "fat_per_100g": float(parsed.get("fat_g", 0)),
            "fiber_per_100g": parsed.get("fiber_g"),
            "sugar_per_100g": parsed.get("sugar_g"),
            "saturated_fat_per_100g": parsed.get("saturated_fat_g"),
        }
    except (KeyError, json.JSONDecodeError, ValueError):
        logger.exception("Failed to parse AI nutrition estimate for query=%s", query)
        return None


# ---------------------------------------------------------------------------
# User food library helpers
# ---------------------------------------------------------------------------


def cache_food_item(db: Session, athlete_id: int, food_data: Dict[str, Any]) -> FoodItem:
    """Save a food item to the user's food library, or return existing if already cached."""
    name = food_data.get("name", "").strip()
    brand = (food_data.get("brand") or "").strip() or None

    # Check if already cached (upsert pattern)
    existing = db.query(FoodItem).filter(
        FoodItem.athlete_id == athlete_id,
        FoodItem.name == name,
        FoodItem.brand == brand if brand else FoodItem.brand.is_(None),
    ).first()

    if existing:
        return existing

    item = FoodItem(
        athlete_id=athlete_id,
        name=name,
        brand=brand,
        source=food_data.get("source", "manual"),
        source_id=food_data.get("source_id"),
        calories_per_100g=food_data.get("calories_per_100g", 0),
        protein_per_100g=food_data.get("protein_per_100g", 0),
        carbs_per_100g=food_data.get("carbs_per_100g", 0),
        fat_per_100g=food_data.get("fat_per_100g", 0),
        fiber_per_100g=food_data.get("fiber_per_100g"),
        sugar_per_100g=food_data.get("sugar_per_100g"),
        saturated_fat_per_100g=food_data.get("saturated_fat_per_100g"),
        sodium_mg_per_100g=food_data.get("sodium_mg_per_100g"),
        iron_mg_per_100g=food_data.get("iron_mg_per_100g"),
        calcium_mg_per_100g=food_data.get("calcium_mg_per_100g"),
        vitamin_d_ug_per_100g=food_data.get("vitamin_d_ug_per_100g"),
        vitamin_c_mg_per_100g=food_data.get("vitamin_c_mg_per_100g"),
        magnesium_mg_per_100g=food_data.get("magnesium_mg_per_100g"),
        potassium_mg_per_100g=food_data.get("potassium_mg_per_100g"),
        zinc_mg_per_100g=food_data.get("zinc_mg_per_100g"),
        omega3_g_per_100g=food_data.get("omega3_g_per_100g"),
        default_serving_g=food_data.get("default_serving_g", 100),
        serving_description=food_data.get("serving_description"),
        category=food_data.get("category"),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_user_food_library(
    db: Session,
    athlete_id: Optional[int],
    query: Optional[str] = None,
) -> List[FoodItem]:
    """Search user's cached food items, ordered by use_count desc."""
    q = db.query(FoodItem).filter(
        or_(
            FoodItem.athlete_id == athlete_id,
            FoodItem.athlete_id.is_(None),
        )
    )
    if query:
        q = q.filter(FoodItem.name.ilike(f"%{query}%"))
    return q.order_by(FoodItem.use_count.desc()).limit(20).all()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _food_item_to_dict(item: FoodItem) -> Dict[str, Any]:
    """Convert a FoodItem model to a dict matching the search result format."""
    return {
        "id": item.id,
        "name": item.name,
        "brand": item.brand,
        "source": item.source,
        "source_id": item.source_id,
        "calories_per_100g": item.calories_per_100g,
        "protein_per_100g": item.protein_per_100g,
        "carbs_per_100g": item.carbs_per_100g,
        "fat_per_100g": item.fat_per_100g,
        "fiber_per_100g": item.fiber_per_100g,
        "sugar_per_100g": item.sugar_per_100g,
        "saturated_fat_per_100g": item.saturated_fat_per_100g,
        "default_serving_g": item.default_serving_g,
        "serving_description": item.serving_description,
        "category": item.category,
        "use_count": item.use_count,
    }
