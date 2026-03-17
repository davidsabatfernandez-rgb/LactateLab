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
    """Build main workout steps from a dose-step label.

    Handles formats:
      - Simple repeat: ``4×3'``, ``6×800m``, ``8×30''``
      - Multi-block:   ``4×20'' + 6×4' LT1``
      - Nested repeat: ``2×(6×3')``, ``3×(3'LT1+3'LT2)``
      - Descending:    ``15-12-10-8-6' LT1``
      - Continuous:    ``55' cont``
    """
    # ── 1. Split on '+' outside parentheses first ──
    blocks = _split_outside_parentheses(label)
    if not blocks:
        blocks = [label]

    # Check if this is a multi-block label (has repeat pattern in any part)
    has_multi_block = len(blocks) > 1 and any(re.search(r"\d+\s*[x×]", b) for b in blocks)

    # ── 2. Multi-block labels: parse each block independently ──
    if has_multi_block:
        return _build_multi_block_steps(blocks, zone=zone, rest_min=rest_min, start_order=start_order)

    # ── 3. Nested repeat: N×(content) ──
    nested = re.match(r"^(\d+)\s*[x×]\s*\((.+)\)\s*(.*)", label.strip(), re.IGNORECASE)
    if nested:
        return _build_nested_repeat_steps(
            outer_reps=int(nested.group(1)),
            inner_label=nested.group(2).strip(),
            suffix=nested.group(3).strip(),
            zone=zone,
            rest_min=rest_min,
            start_order=start_order,
        )

    # ── 4. Descending intervals: 15-12-10-8-6' ZONE ──
    descending = re.match(r"^(\d+(?:-\d+)+)\s*'\s*(.*)", label.strip(), re.IGNORECASE)
    if descending:
        durations = [int(d) for d in descending.group(1).split("-")]
        block_zone = _extract_zone_from_suffix(descending.group(2)) or zone
        return _build_descending_steps(durations_min=durations, zone=block_zone, rest_min=rest_min, start_order=start_order)

    # ── 5. Simple repeat: N×T (no '+' in label, no parentheses) ──
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

    # ── 6. Fallback: single continuous / sequential parts ──
    steps: list[WorkoutStep] = []
    for index, part in enumerate(blocks):
        parsed_length = _parse_library_label_length(part)
        steps.append(
            WorkoutStep(
                order=start_order + len(steps),
                step_type="interval" if len(blocks) > 1 else "steady",
                length_type=parsed_length["length_type"],
                length_value=parsed_length["length_value"],
                target=WorkoutTarget(target_type="other", label=zone),
                intensity_label=zone,
                instructions=part,
            )
        )
        if rest_min > 0 and index < len(blocks) - 1:
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


# ── Multi-block builder ──


def _parse_single_block(text: str, fallback_zone: str) -> dict:
    """Parse a single block part like '4×20''', '6×4' LT1', '20'E1', '8' LT1'.

    Returns dict with keys: reps, duration_s, zone, rest_s_label (from c/T'' suffix).
    """
    text = text.strip()

    # Extract c/T'' or c/T' rest suffix (e.g. "c/15''", "c/20''")
    label_rest_s = 0.0
    rest_suffix = re.search(r"c/(\d+(?:[.,]\d+)?)\s*(''|'|s)", text, re.IGNORECASE)
    if rest_suffix:
        val = float(rest_suffix.group(1).replace(",", "."))
        label_rest_s = val if rest_suffix.group(2) in ("''", "s") else val * 60
        text = text[: rest_suffix.start()].strip()

    # Extract zone from suffix text (LT1, LT2, VO2, E1, SIT, MAX, ANC, CadMax, etc.)
    block_zone = _extract_zone_from_suffix(text) or fallback_zone

    # Try repeat pattern: N×T'' or N×T' or N×Dm/km
    repeat_match = re.match(
        r"^(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(''|'|km|m|s|sec)",
        text,
        re.IGNORECASE,
    )
    if repeat_match:
        reps = int(repeat_match.group(1))
        val = float(repeat_match.group(2).replace(",", "."))
        unit = repeat_match.group(3).lower()
        if unit in ("''", "s", "sec"):
            duration_s = val
        elif unit == "'":
            duration_s = val * 60
        elif unit == "km":
            duration_s = val * 1000  # distance in meters, not time
        elif unit == "m":
            duration_s = val
        else:
            duration_s = val * 60
        length_type = "distance" if unit in ("km", "m") else "time"
        return {"reps": reps, "duration_s": duration_s, "zone": block_zone, "label_rest_s": label_rest_s, "length_type": length_type}

    # Try single duration: T' or T'' or Dm
    single_sec = re.match(r"^(\d+(?:[.,]\d+)?)\s*''", text, re.IGNORECASE)
    if single_sec:
        return {"reps": 1, "duration_s": float(single_sec.group(1).replace(",", ".")), "zone": block_zone, "label_rest_s": label_rest_s, "length_type": "time"}

    single_min = re.match(r"^(\d+(?:[.,]\d+)?)\s*'", text, re.IGNORECASE)
    if single_min:
        return {"reps": 1, "duration_s": float(single_min.group(1).replace(",", ".")) * 60, "zone": block_zone, "label_rest_s": label_rest_s, "length_type": "time"}

    single_dist = re.match(r"^(\d+(?:[.,]\d+)?)\s*(km|m)\b", text, re.IGNORECASE)
    if single_dist:
        val = float(single_dist.group(1).replace(",", "."))
        meters = val * 1000 if single_dist.group(2).lower() == "km" else val
        return {"reps": 1, "duration_s": meters, "zone": block_zone, "label_rest_s": label_rest_s, "length_type": "distance"}

    return {"reps": 1, "duration_s": 0, "zone": block_zone, "label_rest_s": label_rest_s, "length_type": "open"}


def _extract_zone_from_suffix(text: str) -> str | None:
    """Extract intensity zone label from text suffix."""
    # Order matters — longer matches first
    for pattern, zone_label in [
        (r"\bCadMax\b", "ANC"),
        (r"\bSIT\b", "ANC"),
        (r"\bMAX\b", "ANC"),
        (r"\bVO2\b", "VO2"),
        (r"\bLT2b?\b", "LT2"),
        (r"\bLT1\b", "LT1"),
        (r"\bSUB-?T\b", "SUB-T"),
        (r"\bHM[_\s]?pace\b", "LT2"),
        (r"\bANC\b", "ANC"),
        (r"\bAEP\b", "VO2"),
        (r"\bAEC\b", "LT1"),
        (r"\bCSS\b", "LT2"),
        (r"\bE1\b", "E1"),
        (r"\bE2\b", "E2"),
        (r"\bD2\b", "SUB-T"),
    ]:
        if re.search(pattern, text, re.IGNORECASE):
            return zone_label
    return None


def _build_repeat_step(
    *,
    reps: int,
    duration_s: float,
    length_type: str,
    zone: str,
    rest_s: float,
    order: int,
    instructions: str,
) -> WorkoutStep:
    """Build a repeat step with work + optional rest children."""
    children = [
        WorkoutStep(
            order=1,
            step_type="interval",
            length_type=length_type,
            length_value=round(duration_s),
            target=WorkoutTarget(target_type="other", label=zone),
            intensity_label=zone,
            instructions=instructions,
        )
    ]
    if rest_s > 0:
        children.append(
            WorkoutStep(
                order=2,
                step_type="recovery",
                length_type="time",
                length_value=round(rest_s),
                target=WorkoutTarget(target_type="easy", label="Suave"),
                intensity_label="recovery",
                instructions="Recuperación",
            )
        )
    return WorkoutStep(
        order=order,
        step_type="repeat",
        length_type="open",
        repeat_count=reps,
        target=WorkoutTarget(target_type="other", label=zone),
        intensity_label=zone,
        instructions=instructions,
        children=children,
    )


def _build_multi_block_steps(
    blocks: list[str],
    *,
    zone: str,
    rest_min: float,
    start_order: int,
) -> list[WorkoutStep]:
    """Handle multi-block labels like '4×20'' + 6×4' LT1'."""
    steps: list[WorkoutStep] = []
    transition_s = max(rest_min * 60, 120)  # at least 2min between blocks

    for idx, block_text in enumerate(blocks):
        parsed = _parse_single_block(block_text, fallback_zone=zone)
        block_rest_s = parsed["label_rest_s"] or (rest_min * 60)
        order = start_order + len(steps)

        if parsed["reps"] > 1:
            steps.append(
                _build_repeat_step(
                    reps=parsed["reps"],
                    duration_s=parsed["duration_s"],
                    length_type=parsed["length_type"],
                    zone=parsed["zone"],
                    rest_s=block_rest_s,
                    order=order,
                    instructions=block_text.strip(),
                )
            )
        else:
            steps.append(
                WorkoutStep(
                    order=order,
                    step_type="interval",
                    length_type=parsed["length_type"],
                    length_value=round(parsed["duration_s"]) if parsed["duration_s"] else None,
                    target=WorkoutTarget(target_type="other", label=parsed["zone"]),
                    intensity_label=parsed["zone"],
                    instructions=block_text.strip(),
                )
            )

        # Add transition rest between blocks (not after last)
        if idx < len(blocks) - 1:
            steps.append(
                WorkoutStep(
                    order=start_order + len(steps),
                    step_type="recovery",
                    length_type="time",
                    length_value=round(transition_s),
                    target=WorkoutTarget(target_type="easy", label="Suave"),
                    intensity_label="recovery",
                    instructions="Transición entre bloques",
                )
            )

    return steps


def _build_nested_repeat_steps(
    *,
    outer_reps: int,
    inner_label: str,
    suffix: str,
    zone: str,
    rest_min: float,
    start_order: int,
) -> list[WorkoutStep]:
    """Handle nested repeats like '2×(6×3')' or '3×(3'LT1+3'LT2)'."""
    inner_parts = _split_outside_parentheses(inner_label)
    if not inner_parts:
        inner_parts = [inner_label]

    # Multi-zone inner: e.g. "3'LT1+3'LT2" → build sequential children
    if len(inner_parts) > 1:
        children: list[WorkoutStep] = []
        for part in inner_parts:
            parsed = _parse_single_block(part, fallback_zone=zone)
            children.append(
                WorkoutStep(
                    order=len(children) + 1,
                    step_type="interval",
                    length_type=parsed["length_type"],
                    length_value=round(parsed["duration_s"]) if parsed["duration_s"] else None,
                    target=WorkoutTarget(target_type="other", label=parsed["zone"]),
                    intensity_label=parsed["zone"],
                    instructions=part.strip(),
                )
            )
        # Add rest between sets
        if rest_min > 0:
            children.append(
                WorkoutStep(
                    order=len(children) + 1,
                    step_type="recovery",
                    length_type="time",
                    length_value=round(rest_min * 60),
                    target=WorkoutTarget(target_type="easy", label="Suave"),
                    intensity_label="recovery",
                    instructions="Recuperación entre series",
                )
            )
        return [
            WorkoutStep(
                order=start_order,
                step_type="repeat",
                length_type="open",
                repeat_count=outer_reps,
                target=WorkoutTarget(target_type="other", label=zone),
                intensity_label=zone,
                instructions=f"{outer_reps}×({inner_label})",
                children=children,
            )
        ]

    # Single inner repeat: e.g. "6×3'" → flatten to outer*inner reps
    inner_parsed = _parse_single_block(inner_parts[0], fallback_zone=zone)
    if inner_parsed["reps"] > 1:
        total_reps = outer_reps * inner_parsed["reps"]
        block_rest_s = inner_parsed["label_rest_s"] or (rest_min * 60)
        return [
            _build_repeat_step(
                reps=total_reps,
                duration_s=inner_parsed["duration_s"],
                length_type=inner_parsed["length_type"],
                zone=inner_parsed["zone"],
                rest_s=block_rest_s,
                order=start_order,
                instructions=f"{outer_reps}×({inner_label})",
            )
        ]

    # Fallback: single inner block repeated
    return [
        _build_repeat_step(
            reps=outer_reps,
            duration_s=inner_parsed["duration_s"],
            length_type=inner_parsed["length_type"],
            zone=inner_parsed["zone"],
            rest_s=rest_min * 60,
            order=start_order,
            instructions=f"{outer_reps}×({inner_label})",
        )
    ]


def _build_descending_steps(
    *,
    durations_min: list[int],
    zone: str,
    rest_min: float,
    start_order: int,
) -> list[WorkoutStep]:
    """Handle descending intervals like '15-12-10-8-6' LT1'."""
    steps: list[WorkoutStep] = []
    for idx, dur in enumerate(durations_min):
        steps.append(
            WorkoutStep(
                order=start_order + len(steps),
                step_type="interval",
                length_type="time",
                length_value=dur * 60,
                target=WorkoutTarget(target_type="other", label=zone),
                intensity_label=zone,
                instructions=f"{dur}' {zone}",
            )
        )
        if rest_min > 0 and idx < len(durations_min) - 1:
            steps.append(
                WorkoutStep(
                    order=start_order + len(steps),
                    step_type="recovery",
                    length_type="time",
                    length_value=round(rest_min * 60),
                    target=WorkoutTarget(target_type="easy", label="Suave"),
                    intensity_label="recovery",
                    instructions="Recuperación",
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
