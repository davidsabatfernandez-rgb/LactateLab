"""Resolve zone labels (e.g. "LT2") into actual pace/HR/power targets.

Given an athlete's active training zones and a WorkoutDefinition, replaces
label-only WorkoutTargets with concrete values (value_from, value_to, unit).
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.training_zone import TrainingZoneSet
from app.schemas.workout_definition import WorkoutDefinition, WorkoutStep, WorkoutTarget
from app.services.zone_generator import get_active_zone_set


# Zone label → zone number mapping for lookup
# Maps common labels found in workout templates to zone labels in the zone set
_ZONE_LABEL_ALIASES: dict[str, list[str]] = {
    "LT1": ["lt1", "e2", "aerobic", "aeróbico", "base aeróbica", "fondo aeróbico"],
    "LT2": ["lt2", "umbral", "threshold", "lt2 / umbral", "css", "ftp"],
    "SUB-T": ["sub-t", "zona media", "sub-t / zona media", "tempo"],
    "VO2": ["vo2", "vo2max", "vo2 / potencia", "potencia"],
    "BASE": ["base", "base aeróbica", "e1", "recuperación", "recovery"],
}


def _normalize_zone_label(label: str) -> str:
    """Normalize a zone label for matching."""
    return label.strip().lower()


def _find_matching_zone(zone_set: TrainingZoneSet, target_label: str) -> Optional[dict]:
    """Find the zone in the set that matches the given target label.

    Returns dict with pace/hr/power boundaries, or None.
    """
    normalized = _normalize_zone_label(target_label)

    # Direct match against zone labels
    for zone in zone_set.zones:
        zone_norm = _normalize_zone_label(zone.zone_label)
        if normalized in zone_norm or zone_norm in normalized:
            return {
                "zone_number": zone.zone_number,
                "zone_label": zone.zone_label,
                "pace_lower": zone.pace_lower_seconds,
                "pace_upper": zone.pace_upper_seconds,
                "hr_lower": zone.hr_lower,
                "hr_upper": zone.hr_upper,
                "power_lower": zone.power_lower,
                "power_upper": zone.power_upper,
            }

    # Try alias matching
    for canonical, aliases in _ZONE_LABEL_ALIASES.items():
        if normalized in [a.lower() for a in aliases] or canonical.lower() in normalized:
            for zone in zone_set.zones:
                zone_norm = _normalize_zone_label(zone.zone_label)
                if canonical.lower() in zone_norm or any(a.lower() in zone_norm for a in aliases):
                    return {
                        "zone_number": zone.zone_number,
                        "zone_label": zone.zone_label,
                        "pace_lower": zone.pace_lower_seconds,
                        "pace_upper": zone.pace_upper_seconds,
                        "hr_lower": zone.hr_lower,
                        "hr_upper": zone.hr_upper,
                        "power_lower": zone.power_lower,
                        "power_upper": zone.power_upper,
                    }

    return None


def _pace_label(seconds: float | None) -> str:
    """Convert seconds per km to min:sec/km label."""
    if seconds is None or seconds <= 0:
        return ""
    mins = int(seconds) // 60
    secs = int(seconds) % 60
    return f"{mins}:{secs:02d}/km"


def _resolve_target_from_zone(
    zone: dict,
    target_mode: str,
    discipline: str,
    original_label: str | None,
) -> WorkoutTarget:
    """Build a concrete WorkoutTarget from zone boundaries."""
    if target_mode == "hr" and zone.get("hr_lower") and zone.get("hr_upper"):
        return WorkoutTarget(
            target_type="heart_rate",
            value_from=float(zone["hr_lower"]),
            value_to=float(zone["hr_upper"]),
            unit="bpm",
            label=f"{zone['zone_label']} ({zone['hr_lower']}-{zone['hr_upper']} bpm)",
        )

    if target_mode == "power" and zone.get("power_lower") and zone.get("power_upper"):
        return WorkoutTarget(
            target_type="power",
            value_from=float(zone["power_lower"]),
            value_to=float(zone["power_upper"]),
            unit="watts",
            label=f"{zone['zone_label']} ({int(zone['power_lower'])}-{int(zone['power_upper'])}W)",
        )

    # Default: pace for running/swimming, power for cycling
    if discipline == "ciclismo":
        if zone.get("power_lower") and zone.get("power_upper"):
            return WorkoutTarget(
                target_type="power",
                value_from=float(zone["power_lower"]),
                value_to=float(zone["power_upper"]),
                unit="watts",
                label=f"{zone['zone_label']} ({int(zone['power_lower'])}-{int(zone['power_upper'])}W)",
            )
        elif zone.get("hr_lower") and zone.get("hr_upper"):
            return WorkoutTarget(
                target_type="heart_rate",
                value_from=float(zone["hr_lower"]),
                value_to=float(zone["hr_upper"]),
                unit="bpm",
                label=f"{zone['zone_label']} ({zone['hr_lower']}-{zone['hr_upper']} bpm)",
            )
    else:
        # Running / swimming: prefer pace
        if zone.get("pace_lower") and zone.get("pace_upper"):
            from_label = _pace_label(zone["pace_upper"])  # faster pace = lower seconds
            to_label = _pace_label(zone["pace_lower"])  # slower pace = higher seconds
            return WorkoutTarget(
                target_type="pace",
                value_from=float(zone["pace_upper"]),
                value_to=float(zone["pace_lower"]),
                unit="s_per_km",
                label=f"{zone['zone_label']} ({from_label}-{to_label})",
            )
        elif zone.get("hr_lower") and zone.get("hr_upper"):
            return WorkoutTarget(
                target_type="heart_rate",
                value_from=float(zone["hr_lower"]),
                value_to=float(zone["hr_upper"]),
                unit="bpm",
                label=f"{zone['zone_label']} ({zone['hr_lower']}-{zone['hr_upper']} bpm)",
            )

    # Fallback: keep original label-only target
    return WorkoutTarget(
        target_type="other",
        label=original_label or zone.get("zone_label", ""),
    )


def _resolve_step_targets(
    step: WorkoutStep,
    zone_set: TrainingZoneSet,
    target_mode: str,
    discipline: str,
) -> WorkoutStep:
    """Recursively resolve zone targets in a step and its children."""
    # Resolve this step's target
    if step.target and step.target.target_type == "other" and step.target.label:
        # Only resolve if there's no concrete value yet
        if step.target.value_from is None and step.target.value_to is None:
            zone = _find_matching_zone(zone_set, step.target.label)
            if zone:
                step.target = _resolve_target_from_zone(
                    zone, target_mode, discipline, step.target.label
                )

    # Resolve children (repeat blocks)
    if step.children:
        step.children = [
            _resolve_step_targets(child, zone_set, target_mode, discipline)
            for child in step.children
        ]

    return step


def resolve_workout_targets(
    db: Session,
    athlete_id: int,
    discipline: str,
    workout: WorkoutDefinition,
    *,
    target_mode: str = "auto",
) -> tuple[WorkoutDefinition, list[str]]:
    """Resolve all zone-label targets in a workout to concrete values.

    Args:
        db: Database session
        athlete_id: Athlete ID
        discipline: Discipline name
        workout: WorkoutDefinition to resolve
        target_mode: "pace", "hr", "power", or "auto" (discipline default)

    Returns:
        (resolved_workout, warnings) — warnings list may contain zone-missing notices
    """
    warnings: list[str] = []

    zone_set = get_active_zone_set(db, athlete_id, discipline)
    if zone_set is None:
        warnings.append(f"No hay zonas activas para {discipline}. Objetivos sin resolver.")
        return workout, warnings

    if not zone_set.zones:
        warnings.append(f"Zonas vacías para {discipline}. Objetivos sin resolver.")
        return workout, warnings

    # Determine effective target mode
    if target_mode == "auto":
        if discipline == "ciclismo":
            target_mode = "power"
        else:
            target_mode = "pace"

    # Resolve each step
    resolved_steps = [
        _resolve_step_targets(step, zone_set, target_mode, discipline)
        for step in workout.steps
    ]
    workout.steps = resolved_steps

    # Record in source payload
    workout.source_payload["zone_targets_resolved"] = True
    workout.source_payload["zone_target_mode"] = target_mode
    workout.source_payload["zone_set_id"] = zone_set.id
    workout.source_payload["zone_set_name"] = zone_set.name

    return workout, warnings
