from __future__ import annotations

from typing import Any, Optional


DISTANCE_CATEGORY_LABELS: dict[str, str] = {
    "5k": "5K",
    "10k": "10K",
    "hm": "Media maratón",
    "marathon": "Maratón",
    "road_tt": "Contrarreloj",
    "road_tt_short": "Contrarreloj corta",
    "road_tt_medium": "Contrarreloj media",
    "road_tt_long": "Contrarreloj larga",
    "granfondo": "Granfondo",
    "hill_climb": "Subida cronometrada",
    "road_race": "Carrera en ruta",
    "sprint_tri": "Triatlón sprint",
    "sprint_run": "Run sprint tri",
    "sprint_bike": "Bike sprint tri",
    "olympic_tri": "Triatlón olímpico",
    "olympic_run": "Run olímpico",
    "olympic_bike": "Bike olímpico",
    "70.3": "70.3",
    "half_tri": "Half distance",
    "half_run": "Run 70.3",
    "half_bike": "Bike 70.3",
    "ironman": "Ironman",
    "ironman_run": "Run Ironman",
    "ironman_bike": "Bike Ironman",
    "pool_400": "Piscina 400m",
    "pool_800_1500": "Piscina 800-1500m",
    "open_water_short": "Aguas abiertas corta",
    "open_water_long": "Aguas abiertas larga",
}


def normalize_distance_category(raw_value: Optional[str]) -> Optional[str]:
    if not raw_value:
        return None
    value = str(raw_value).strip().lower()
    aliases = {
        "half": "half_tri",
        "half ironman": "half_tri",
        "half_ironman": "half_tri",
        "70,3": "half_tri",
        "70.3": "half_tri",
        "hm": "hm",
        "media maraton": "hm",
        "media maratón": "hm",
        "21k": "hm",
        "21 km": "hm",
        "maraton": "marathon",
        "maratón": "marathon",
        "42k": "marathon",
        "42 km": "marathon",
        "olimpico": "olympic_tri",
        "olímpico": "olympic_tri",
        "olympic": "olympic_tri",
        "sprint": "sprint_tri",
        "ironman": "ironman",
        "road tt": "road_tt",
        "contrarreloj": "road_tt",
        "tt": "road_tt",
        "tt corta": "road_tt_short",
        "tt media": "road_tt_medium",
        "tt larga": "road_tt_long",
        "crono corta": "road_tt_short",
        "crono media": "road_tt_medium",
        "crono larga": "road_tt_long",
        "granfondo": "granfondo",
        "gran fondo": "granfondo",
        "hill climb": "hill_climb",
        "subida": "hill_climb",
        "road race": "road_race",
        "carrera en ruta": "road_race",
    }
    return aliases.get(value, value)


def infer_distance_category(target: Any, selected_discipline: str) -> Optional[str]:
    explicit = normalize_distance_category(getattr(target, "distance_category", None))
    if explicit:
        if explicit == "olympic_tri" and selected_discipline in {"running", "ciclismo"}:
            return "olympic_run" if selected_discipline == "running" else "olympic_bike"
        if explicit in {"half_tri", "70.3"} and selected_discipline in {"running", "ciclismo"}:
            return "half_run" if selected_discipline == "running" else "half_bike"
        if explicit == "ironman" and selected_discipline in {"running", "ciclismo"}:
            return "ironman_run" if selected_discipline == "running" else "ironman_bike"
        if explicit == "sprint_tri" and selected_discipline in {"running", "ciclismo"}:
            return "sprint_run" if selected_discipline == "running" else "sprint_bike"
        return explicit

    raw_text = " ".join(
        str(value)
        for value in (
            getattr(target, "distance_label", None),
            getattr(target, "objective", None),
        )
        if value
    ).lower()
    if not raw_text:
        return None

    if "ironman" in raw_text:
        if selected_discipline == "running":
            return "ironman_run"
        if selected_discipline == "ciclismo":
            return "ironman_bike"
        return "ironman"
    if "70.3" in raw_text or "half" in raw_text:
        if selected_discipline == "running":
            return "half_run"
        if selected_discipline == "ciclismo":
            return "half_bike"
        return "half_tri"
    if "olímp" in raw_text or "olimp" in raw_text or "olympic" in raw_text:
        if selected_discipline == "running":
            return "olympic_run"
        if selected_discipline == "ciclismo":
            return "olympic_bike"
        return "olympic_tri"
    if "sprint" in raw_text:
        if selected_discipline == "running":
            return "sprint_run"
        if selected_discipline == "ciclismo":
            return "sprint_bike"
        return "sprint_tri"
    if "marat" in raw_text or "42" in raw_text:
        return "marathon"
    if "media" in raw_text or "hm" in raw_text or "21" in raw_text:
        return "hm"
    if "10k" in raw_text or "10 k" in raw_text:
        return "10k"
    if "5k" in raw_text or "5 k" in raw_text:
        return "5k"
    if "granfondo" in raw_text or "gran fondo" in raw_text:
        return "granfondo"
    if "hill climb" in raw_text or "subida" in raw_text:
        return "hill_climb"
    if "road race" in raw_text or "carrera en ruta" in raw_text:
        return "road_race"
    if "tt corta" in raw_text or "crono corta" in raw_text:
        return "road_tt_short"
    if "tt media" in raw_text or "crono media" in raw_text:
        return "road_tt_medium"
    if "tt larga" in raw_text or "crono larga" in raw_text:
        return "road_tt_long"
    if "tt" in raw_text or "contrarreloj" in raw_text:
        return "road_tt"
    return None


def distance_category_label(category: Optional[str], fallback: Optional[str] = None) -> Optional[str]:
    normalized = normalize_distance_category(category)
    if normalized and normalized in DISTANCE_CATEGORY_LABELS:
        return DISTANCE_CATEGORY_LABELS[normalized]
    return fallback


def target_objective_label(
    *,
    discipline: str,
    distance_category: Optional[str],
    distance_label: Optional[str],
    objective: Optional[str],
) -> str:
    if objective and str(objective).strip():
        return str(objective).strip()
    category_label = distance_category_label(distance_category)
    if category_label:
        return category_label
    if distance_label and str(distance_label).strip():
        return str(distance_label).strip()
    return discipline
