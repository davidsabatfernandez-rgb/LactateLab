from __future__ import annotations

"""NLP pipeline to parse free-text food input into structured items."""

import json
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Standard conversions for approximate quantities (in grams)
QUANTITY_MAP: Dict[str, float] = {
    # English
    "a cup": 240,
    "a glass": 250,
    "a handful": 30,
    "a slice": 30,
    "a piece": 100,
    "a bowl": 300,
    "a plate": 400,
    "half a plate": 200,
    "a tablespoon": 15,
    "a teaspoon": 5,
    "a scoop": 30,
    # Spanish
    "una taza": 240,
    "un vaso": 250,
    "un puñado": 30,
    "una rebanada": 30,
    "un trozo": 100,
    "un plato": 400,
    "medio plato": 200,
    "una cucharada": 15,
    "una cucharadita": 5,
    "un cazo": 30,
}

# Serialise for inclusion in the LLM prompt
_QUANTITY_MAP_JSON = json.dumps(QUANTITY_MAP, ensure_ascii=False, indent=2)


async def parse_food_input(
    text: str,
    settings: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """Parse free text (Spanish or English) into structured food items.

    Each returned dict contains:
        - food_name: str
        - quantity_g: float (approximate grams)
        - brand: str | None
        - needs_clarification: bool
        - clarification_question: str | None

    Uses LLM via OpenRouter.  Falls back to a single unknown item on failure.
    """
    if settings is None:
        settings = get_settings()

    if not settings.openrouter_api_key:
        # No LLM available – return raw text as single item
        return [
            {
                "food_name": text.strip(),
                "quantity_g": 100.0,
                "brand": None,
                "needs_clarification": True,
                "clarification_question": "Could not parse automatically. Please specify food name and quantity in grams.",
            }
        ]

    system_prompt = (
        "You are a bilingual (English/Spanish) food-input parser for an athlete nutrition tracker.\n"
        "Given a user's free-text food description, extract EACH distinct food item.\n\n"
        "Use the following approximate quantity map when the user uses colloquial measures:\n"
        f"{_QUANTITY_MAP_JSON}\n\n"
        "For each item return a JSON object with these fields:\n"
        '  - "food_name": string (normalised name, in the same language as input)\n'
        '  - "quantity_g": number (weight in grams; use the map above or your best estimate)\n'
        '  - "brand": string or null\n'
        '  - "needs_clarification": boolean (true if you are very unsure about quantity or identity)\n'
        '  - "clarification_question": string or null (question to ask the user, in input language)\n\n'
        "Return ONLY a JSON array of objects. No markdown fences, no extra text."
    )

    # Try primary model, fall back to alternatives on rate limit
    models_to_try = [
        settings.openrouter_model,
        "nvidia/nemotron-nano-9b-v2:free",
        "qwen/qwen3-coder:free",
        "openai/gpt-oss-20b:free",
    ]

    data = None
    async with httpx.AsyncClient(timeout=30) as client:
        for attempt, model in enumerate(models_to_try):
            # First try with system message, if 400 retry same model without system message
            for use_system in ([True, False] if attempt == 0 else [True]):
                if use_system:
                    messages = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": text},
                    ]
                else:
                    messages = [
                        {"role": "user", "content": system_prompt + "\n\nUser input:\n" + text},
                    ]
                resp = await client.post(
                    f"{settings.openrouter_base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.openrouter_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": messages,
                        "temperature": 0.1,
                    },
                )
                if resp.status_code == 400 and use_system:
                    logger.warning("Model %s rejected system message, retrying without", model)
                    continue
                if resp.status_code in (429, 400, 404, 503):
                    logger.warning("Model %s failed (HTTP %s), trying next", model, resp.status_code)
                    break
                resp.raise_for_status()
                candidate = resp.json()
                try:
                    _ = candidate["choices"][0]["message"]["content"]
                    data = candidate
                except (KeyError, IndexError):
                    logger.warning("Model %s returned malformed response, trying next", model)
                    break
                break  # success
            if data is not None:
                break

    if data is None:
        raise RuntimeError("All LLM models unavailable")

    try:
        content = data["choices"][0]["message"]["content"].strip()
        # Strip markdown code fences if present
        if content.startswith("```"):
            content = content.split("\n", 1)[-1]
        if content.endswith("```"):
            content = content.rsplit("```", 1)[0]
        content = content.strip()

        items = json.loads(content)
        if isinstance(items, dict):
            items = [items]
        # Validate expected shape
        validated: List[Dict[str, Any]] = []
        for item in items:
            validated.append(
                {
                    "food_name": str(item.get("food_name", "")),
                    "quantity_g": float(item.get("quantity_g", 100)),
                    "brand": item.get("brand"),
                    "needs_clarification": bool(item.get("needs_clarification", False)),
                    "clarification_question": item.get("clarification_question"),
                }
            )
        return validated
    except (KeyError, json.JSONDecodeError, ValueError, TypeError):
        logger.exception("Failed to parse food input via LLM: %s", text)
        return [
            {
                "food_name": text.strip(),
                "quantity_g": 100.0,
                "brand": None,
                "needs_clarification": True,
                "clarification_question": "Could not parse automatically. Please specify food name and quantity in grams.",
            }
        ]


async def resolve_ambiguity(
    original_text: str,
    clarification_response: str,
    settings: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """After user provides clarification, re-parse with context."""
    if settings is None:
        settings = get_settings()

    combined = (
        f"Original input: {original_text}\n"
        f"User clarification: {clarification_response}"
    )
    return await parse_food_input(combined, settings=settings)
