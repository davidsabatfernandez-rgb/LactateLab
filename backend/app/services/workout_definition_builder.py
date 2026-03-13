from __future__ import annotations

import re

from app.models.planned_session import PlannedSession
from app.schemas.workout_definition import WorkoutDefinition, WorkoutStep, WorkoutTarget
from app.services.workout_library import DoseStep, WorkoutTemplate, templates_for_discipline_library

PACE_RANGE_PATTERN = re.compile(r"(?P<from_min>\d{1,2}):(?P<from_sec>\d{2})-(?P<to_min>\d{1,2}):(?P<to_sec>\d{2})\s*/\s*km", re.IGNORECASE)
REPEAT_INTERVAL_PATTERN = re.compile(
    r"(?P<count>\d+)\s*x\s*(?P<length>\d+(?:[.,]\d+)?)\s*(?P<unit>km|m|min|minutes|')\s*(?P<target>.*)",
    re.IGNORECASE,
)
RECOVERY_PATTERN = re.compile(
    r"(?P<value>\d+(?:[.,]\d+)?)\s*(?P<unit>s|sec|seconds|''|min|minutes|')",
    re.IGNORECASE,
)


def build_workout_definition(session: PlannedSession) -> WorkoutDefinition:
    notes = [item for item in [session.coach_note, session.dose_guidance, session.expected_signal] if item]
    steps = _parse_prescription_steps(
        session.dose_prescription,
        context_text=" ".join(item for item in [session.public_label, session.objective, session.session_family] if item),
    )

    if not steps:
        steps = [
            WorkoutStep(
                order=1,
                step_type="other",
                length_type="open",
                instructions=session.dose_prescription,
                target=WorkoutTarget(target_type="free", label="Libre"),
                intensity_label=session.session_family,
            )
        ]

    return WorkoutDefinition(
        source_session_id=session.id,
        sport=_normalize_sport(session.discipline),
        title=session.public_label,
        description=session.objective,
        steps=steps,
        notes=notes,
        source_payload={
            "public_label": session.public_label,
            "objective": session.objective,
            "dose_prescription": session.dose_prescription,
            "dose_guidance": session.dose_guidance,
            "progression_note": session.progression_note,
            "expected_signal": session.expected_signal,
            "session_family": session.session_family,
            "session_role": session.session_role,
        },
    )


def build_library_workout_definition(
    *,
    discipline: str,
    template_id: str,
    source: str,
    dose_step: int | None = None,
    label: str | None = None,
) -> WorkoutDefinition:
    template = _resolve_library_template(discipline=discipline, template_id=template_id)
    selection = _resolve_library_selection(template=template, source=source, dose_step=dose_step, label=label)
    zone = selection["zone"]
    selection_label = selection["label"]
    useful_duration_min = selection["useful_duration_min"]
    rest_min = selection["rest_min"]

    steps: list[WorkoutStep] = []
    if template.calentamiento_min > 0:
        steps.append(
            WorkoutStep(
                order=len(steps) + 1,
                step_type="warmup",
                length_type="time",
                length_value=template.calentamiento_min * 60,
                target=WorkoutTarget(target_type="easy", label="Suave"),
                intensity_label="warmup",
                instructions=template.calentamiento_template or "Calentamiento",
            )
        )

    steps.extend(
        _build_library_main_steps(
            label=selection_label,
            useful_duration_min=useful_duration_min,
            rest_min=rest_min,
            zone=zone,
            start_order=len(steps) + 1,
        )
    )

    if template.enfriamiento_min > 0:
        steps.append(
            WorkoutStep(
                order=len(steps) + 1,
                step_type="cooldown",
                length_type="time",
                length_value=template.enfriamiento_min * 60,
                target=WorkoutTarget(target_type="easy", label="Suave"),
                intensity_label="cooldown",
                instructions=template.enfriamiento_template or "Enfriamiento",
            )
        )

    notes = [
        item
        for item in [
            selection.get("notes"),
            template.dose_guidance,
            template.summary,
        ]
        if item
    ]

    return WorkoutDefinition(
        source_session_id=None,
        sport=_normalize_sport(template.discipline),
        title=selection_label,
        description=template.public_label,
        steps=steps,
        notes=notes,
        source_payload={
            "source": source,
            "template_id": template.template_id,
            "template_public_label": template.public_label,
            "template_summary": template.summary,
            "zone": zone,
            "useful_duration_min": useful_duration_min,
            "rest_min": rest_min,
            "dose_step": dose_step,
            "selected_label": selection_label,
            "export_readiness": "preview_only",
        },
    )


def _parse_prescription_steps(text: str | None, *, context_text: str = "") -> list[WorkoutStep]:
    if not text:
        return []

    normalized = " ".join(text.replace("\n", " ").split())
    repeat_match = REPEAT_INTERVAL_PATTERN.search(normalized)
    if not repeat_match:
        return []

    repeat_count = int(repeat_match.group("count"))
    work_length = _parse_length(repeat_match.group("length"), repeat_match.group("unit"))
    work_target = _parse_target(repeat_match.group("target"))
    interval_label = work_target.label if work_target and work_target.label else repeat_match.group("target").strip() or None

    intensity_label = _infer_intensity_label(f"{context_text} {normalized}", fallback="work")

    repeat_children = [
        WorkoutStep(
            order=1,
            step_type="interval",
            length_type=work_length["length_type"],
            length_value=work_length["length_value"],
            target=work_target,
            intensity_label=intensity_label,
            instructions="Bloque principal",
        )
    ]

    recovery = _parse_recovery(normalized)
    if recovery is not None:
        repeat_children.append(
            WorkoutStep(
                order=2,
                step_type="recovery",
                length_type=recovery["length_type"],
                length_value=recovery["length_value"],
                target=WorkoutTarget(target_type="easy", label="Suave"),
                intensity_label="recovery",
                instructions="Recuperación suave",
            )
        )

    return [
        WorkoutStep(
            order=1,
            step_type="repeat",
            length_type="open",
            repeat_count=repeat_count,
            intensity_label=intensity_label or interval_label,
            instructions="Bloque repetido",
            children=repeat_children,
        )
    ]


def _parse_length(raw_value: str, raw_unit: str) -> dict[str, float | str | None]:
    value = float(raw_value.replace(",", "."))
    unit = raw_unit.lower()

    if unit == "km":
        return {"length_type": "distance", "length_value": value * 1000}
    if unit == "m":
        return {"length_type": "distance", "length_value": value}
    return {"length_type": "time", "length_value": value * 60}


def _resolve_library_template(*, discipline: str, template_id: str) -> WorkoutTemplate:
    for template in templates_for_discipline_library(discipline):
        if template.template_id == template_id:
            return template
    raise ValueError(f"Workout template `{template_id}` not found for discipline `{discipline}`")


def _resolve_library_selection(
    *,
    template: WorkoutTemplate,
    source: str,
    dose_step: int | None,
    label: str | None,
) -> dict[str, str | float | int | None]:
    if source == "dose":
        step = _resolve_dose_step(template, dose_step, label)
        return {
            "label": step.label,
            "zone": step.intensity_zone,
            "useful_duration_min": float(step.total_useful_time_min),
            "rest_min": float(step.rest_min or 0),
            "notes": step.notes,
        }

    chosen_label = (label or "").strip()
    if not chosen_label:
        raise ValueError("A label is required for non-dose library previews")

    return {
        "label": chosen_label,
        "zone": _library_zone_from_family(template.session_family),
        "useful_duration_min": float(_infer_duration_minutes(chosen_label) or 0),
        "rest_min": 0.0,
        "notes": None,
    }


def _resolve_dose_step(template: WorkoutTemplate, dose_step: int | None, label: str | None) -> DoseStep:
    if dose_step is not None:
        for step in template.dose_ladder:
            if step.step == dose_step:
                return step
    if label:
        for step in template.dose_ladder:
            if step.label == label:
                return step
    raise ValueError(f"Dose step not found for template `{template.template_id}`")


def _build_library_main_steps(
    *,
    label: str,
    useful_duration_min: float,
    rest_min: float,
    zone: str,
    start_order: int,
) -> list[WorkoutStep]:
    reps_count = _infer_reps_count(label)
    if reps_count and useful_duration_min > 0:
        per_rep_seconds = round((useful_duration_min / reps_count) * 60)
        children = [
            WorkoutStep(
                order=1,
                step_type="interval",
                length_type="time",
                length_value=per_rep_seconds,
                target=WorkoutTarget(target_type="other", label=zone),
                intensity_label=zone,
                instructions=f"Trabajo principal {label}",
            )
        ]
        if rest_min > 0:
            children.append(
                WorkoutStep(
                    order=2,
                    step_type="recovery",
                    length_type="time",
                    length_value=round(rest_min * 60),
                    target=WorkoutTarget(target_type="easy", label="Suave"),
                    intensity_label="recovery",
                    instructions="Recuperación entre repeticiones",
                )
            )

        return [
            WorkoutStep(
                order=start_order,
                step_type="repeat",
                length_type="open",
                length_value=None,
                target=WorkoutTarget(target_type="other", label=zone),
                intensity_label=zone,
                instructions=label,
                repeat_count=reps_count,
                children=children,
            )
        ]

    parts = _split_outside_parentheses(label)
    if not parts:
        parts = [label]

    steps: list[WorkoutStep] = []
    for index, part in enumerate(parts):
        parsed_length = _parse_library_label_length(part)
        steps.append(
            WorkoutStep(
                order=start_order + len(steps),
                step_type="interval" if len(parts) > 1 else "steady",
                length_type=parsed_length["length_type"],
                length_value=parsed_length["length_value"],
                target=WorkoutTarget(target_type="other", label=zone),
                intensity_label=zone,
                instructions=part,
            )
        )
        if rest_min > 0 and index < len(parts) - 1:
            steps.append(
                WorkoutStep(
                    order=start_order + len(steps),
                    step_type="recovery",
                    length_type="time",
                    length_value=round(rest_min * 60),
                    target=WorkoutTarget(target_type="easy", label="Suave"),
                    intensity_label="recovery",
                    instructions="Recuperación entre bloques",
                )
            )
    return steps


def _parse_target(text: str | None) -> WorkoutTarget | None:
    if not text:
        return None

    pace_match = PACE_RANGE_PATTERN.search(text)
    if pace_match:
        from_seconds = int(pace_match.group("from_min")) * 60 + int(pace_match.group("from_sec"))
        to_seconds = int(pace_match.group("to_min")) * 60 + int(pace_match.group("to_sec"))
        return WorkoutTarget(
            target_type="pace",
            value_from=from_seconds,
            value_to=to_seconds,
            unit="s_per_km",
            label=pace_match.group(0).replace(" ", ""),
        )

    lowered = text.lower()
    if "easy" in lowered or "suave" in lowered:
        return WorkoutTarget(target_type="easy", label="Suave")

    return WorkoutTarget(target_type="other", label=text.strip())


def _parse_library_label_length(label: str) -> dict[str, float | str | None]:
    normalized = label.strip()
    distance_match = re.search(r"(\d+(?:[.,]\d+)?)\s*(km|m)\b", normalized, re.IGNORECASE)
    if distance_match:
        value = float(distance_match.group(1).replace(",", "."))
        unit = distance_match.group(2).lower()
        return {
            "length_type": "distance",
            "length_value": value * 1000 if unit == "km" else value,
        }

    seconds_match = re.search(r"(\d+(?:[.,]\d+)?)\s*''", normalized, re.IGNORECASE)
    if seconds_match:
        return {"length_type": "time", "length_value": float(seconds_match.group(1).replace(",", "."))}

    minutes_match = re.search(r"(\d+(?:[.,]\d+)?)\s*'", normalized, re.IGNORECASE)
    if minutes_match:
        return {"length_type": "time", "length_value": float(minutes_match.group(1).replace(",", ".")) * 60}

    hours_match = re.search(r"(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d+(?:[.,]\d+)?))?", normalized, re.IGNORECASE)
    if hours_match:
        hours = float(hours_match.group(1).replace(",", "."))
        minutes = float((hours_match.group(2) or "0").replace(",", "."))
        return {"length_type": "time", "length_value": (hours * 60 + minutes) * 60}

    inferred = _infer_duration_minutes(normalized)
    if inferred is not None:
        return {"length_type": "time", "length_value": inferred * 60}
    return {"length_type": "open", "length_value": None}


def _parse_recovery(text: str) -> dict[str, float | str] | None:
    if "descanso" not in text.lower() and "recovery" not in text.lower() and "rest" not in text.lower():
        return None

    matches = list(RECOVERY_PATTERN.finditer(text))
    if not matches:
        return None

    recovery_match = matches[-1]
    value = float(recovery_match.group("value").replace(",", "."))
    unit = recovery_match.group("unit").lower()
    if unit in {"s", "sec", "seconds", "''"}:
        return {"length_type": "time", "length_value": value}
    return {"length_type": "time", "length_value": value * 60}


def _split_outside_parentheses(value: str) -> list[str]:
    parts: list[str] = []
    current = ""
    depth = 0
    for char in value:
        if char == "(":
            depth += 1
        if char == ")":
            depth = max(0, depth - 1)
        if char == "+" and depth == 0:
            if current.strip():
                parts.append(current.strip())
            current = ""
            continue
        current += char
    if current.strip():
        parts.append(current.strip())
    return parts


def _infer_duration_minutes(value: str) -> int | None:
    normalized = " ".join(value.split())
    repeated_block = re.match(r"^(\d+)\s*[x×]\s*\((.+)\)$", normalized, re.IGNORECASE)
    if repeated_block:
        reps = int(repeated_block.group(1))
        nested = [
            minutes
            for minutes in (_infer_duration_minutes(part) for part in _split_outside_parentheses(repeated_block.group(2)))
            if minutes is not None
        ]
        if nested:
            return sum(nested) * reps

    repeated_minutes = re.search(r"(\d+)\s*[x×]\s*(\d+)\s*'", normalized, re.IGNORECASE)
    if repeated_minutes:
        return int(repeated_minutes.group(1)) * int(repeated_minutes.group(2))

    repeated_seconds = re.search(r"(\d+)\s*[x×]\s*(\d+)\s*''", normalized, re.IGNORECASE)
    if repeated_seconds:
        return max(1, round((int(repeated_seconds.group(1)) * int(repeated_seconds.group(2))) / 60))

    hours_match = re.search(r"(\d+)\s*h(?:\s*(\d+))?", normalized, re.IGNORECASE)
    if hours_match:
        return int(hours_match.group(1)) * 60 + int(hours_match.group(2) or 0)

    minutes_match = re.search(r"(\d+)\s*'", normalized, re.IGNORECASE)
    if minutes_match:
        return int(minutes_match.group(1))
    return None


def _infer_reps_count(label: str) -> int | None:
    if "(" in label or ")" in label:
        return None
    match = re.match(r"^(\d+)\s*[x×]", " ".join(label.split()), re.IGNORECASE)
    return int(match.group(1)) if match else None


def _library_zone_from_family(family: str) -> str:
    if family in {"lt1_extensive", "lt1_long_reps", "lt1_blocks", "lt1_broken_sets", "progressive_aerobic"}:
        return "LT1"
    if family in {"lt1_lt2_mix", "subthreshold_reps", "subthreshold_3min", "subthreshold_blocks", "uLT1_vo2_combo", "escalated_intervals"}:
        return "SUB-T / Zona media"
    if family in {"lt2_cruise_intervals", "threshold_continuous", "lt2_halfpace", "css_threshold", "lt2_long_reps", "lt2_short_reps", "over_under_threshold", "lt2_vo2_combo", "lt1_to_lt2_blocks"}:
        return "LT2 / Umbral"
    if family in {"vo2_hills", "vo2_30_30", "vo2_power", "vo2_anaerobic"}:
        return "VO2 / Potencia"
    if family in {"long_aerobic_durability", "aerobic_continuity", "aec_base", "fatmax_endurance", "e2_steady", "varied_aerobic", "long_endurance"}:
        return "Base aeróbica"
    return "Otros"


def _infer_intensity_label(text: str, *, fallback: str | None = None) -> str | None:
    lowered = text.lower()
    for label in ("lt1", "lt2", "vo2", "easy"):
        if label in lowered:
            return label.upper() if label != "easy" else "easy"
    return fallback


def _normalize_sport(value: str | None) -> str:
    if not value:
        return "other"
    lowered = value.lower()
    if lowered in {"running", "carrera", "carrera a pie"}:
        return "running"
    if lowered in {"ciclismo", "cycling", "bike"}:
        return "ciclismo"
    if lowered in {"natación", "natacion", "swimming", "swim"}:
        return "natación"
    if lowered in {"triatlón", "triatlon", "triathlon"}:
        return "triatlón"
    return "other"
