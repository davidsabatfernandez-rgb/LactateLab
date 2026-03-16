"""Triathlon Integrated Motor — prescribes 3-discipline mesocycles.

Builds on the mono-discipline planning engine to produce a unified weekly
plan covering primary (weakness), secondary, and swim disciplines with:
  - TSS targets and ACWR safety
  - Cross-discipline spacing rules (Olbrecht, Millet 2002, Hausswirth 2013)
  - Estimated TSS per planned session
"""

from __future__ import annotations

import logging
import math
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ── Constants ────────────────────────────────────────────────────────────────

DISCIPLINES = ("running", "ciclismo", "natación")

# ECO load weighting (Cejuela 2022) — mechanical cost by discipline
_ECO_WEIGHT: dict[str, float] = {
    "running": 1.0,
    "ciclismo": 0.50,
    "natación": 0.75,
}

# IF approximations by intensity zone (used for TSS estimation)
_IF_BY_ZONE: dict[str, float] = {
    "sub-LT1": 0.65,
    "recovery": 0.65,
    "LT1": 0.78,
    "sub-LT2": 0.88,
    "LT2": 0.95,
    "VO2": 1.05,
    "VO2max": 1.05,
    "sprint": 1.15,
    "ANC": 1.15,
}

# Phase modifiers for TSS ramp
_PHASE_MODIFIER: dict[str, float] = {
    "load": 1.0,
    "build": 1.1,
    "build_peak": 1.2,
    "specific": 1.15,
    "recovery": 0.6,
}

# Swim block by season phase (auto mode)
_SWIM_BLOCK_BY_PHASE: dict[str, str] = {
    "base_early": "aerobic_capacity_block",
    "base_late": "aerobic_capacity_block",
    "specific": "threshold_development_block",
    "pre_comp": "competition_specific_block",
    "taper": "recovery_consolidation_block",
}

# Swim mode overrides
_SWIM_MODE_BLOCK: dict[str, str] = {
    "aerobic": "aerobic_capacity_block",
    "threshold": "threshold_development_block",
    "technical": "aerobic_capacity_block",  # same block, coach edits
}

# Phase mapping: secondary phase follows primary with damping
_SECONDARY_PHASE_MAP: dict[str, str] = {
    "load": "load",
    "build": "build",
    "build_peak": "build",      # secondary does NOT peak when primary does
    "specific": "build",
    "recovery": "recovery",
}

_SWIM_PHASE_MAP: dict[str, str] = {
    "load": "load",
    "build": "build",
    "build_peak": "build",
    "specific": "load",         # swim stays conservative in specific
    "recovery": "recovery",
}


# ── TSS Split ────────────────────────────────────────────────────────────────


def discipline_tss_split(weakness_confidence: str) -> dict[str, float]:
    """Return fractional TSS split: primary, secondary, swim."""
    if weakness_confidence == "high":
        return {"primary": 0.55, "secondary": 0.30, "swim": 0.15}
    elif weakness_confidence == "moderate":
        return {"primary": 0.50, "secondary": 0.30, "swim": 0.20}
    else:
        return {"primary": 0.40, "secondary": 0.35, "swim": 0.25}


# ── Weekly TSS targets ───────────────────────────────────────────────────────


def compute_weekly_tss_targets(
    current_ctl: float,
    phase: str,
    ramp_rate: float = 5.0,
    recovery_factor: float = 0.55,
) -> tuple[float, list[str]]:
    """Compute weekly TSS target from CTL + relative ramp + phase modifier.

    Returns (target_tss, warnings).

    ramp_rate is treated as a PERCENTAGE of daily CTL (default 5 = 5%).
    Gabbett 2016 (BJSM): >10% weekly increase doubles injury risk.
    Hulin 2014: ACWR spikes correlate with injury independent of absolute load.

    The ramp is clamped between absolute bounds:
      - min +3 TSS/week (avoid stagnation at very low CTL)
      - max +15 TSS/week (cap for very high CTL)

    ACWR is computed for informational purposes only — coach decides.
    Impellizzeri 2020: ACWR lacks causal evidence; hard caps prevent
    legitimate shock blocks (Issurin 2010).

    Recovery weeks reduce BOTH ramp and base CTL.
    Mujika & Padilla 2023 meta-analysis: optimal taper = 41-60% volume reduction.
    recovery_factor: fraction of CTL to maintain (0.41–0.60, default 0.55).
    """
    warnings: list[str] = []
    modifier = _PHASE_MODIFIER.get(phase, 1.0)
    if phase == "recovery":
        # Clamp to evidence-backed range (Mujika 2023, Bompa 2009)
        rf = max(0.41, min(0.60, recovery_factor))
        target = current_ctl * 7 * rf
    else:
        # Relative ramp: ramp_rate% of daily CTL, clamped to safe absolute bounds
        ramp_pct = ramp_rate / 100.0  # 5 → 0.05
        daily_ramp = current_ctl * ramp_pct * modifier
        # Absolute safety clamps (Gabbett 2016)
        daily_ramp = max(3.0 / 7, min(15.0 / 7, daily_ramp))  # 0.43–2.14 TSS/day
        target = (current_ctl + daily_ramp) * 7
    # ACWR as advisory warning, NOT as hard cap (Impellizzeri 2020)
    if current_ctl > 10:
        projected_daily = target / 7
        acwr = projected_daily / current_ctl
        if acwr > 1.5:
            warnings.append(f"Ratio A:C proyectado {acwr:.2f} — incremento de carga muy elevado respecto a la habitual.")
        elif acwr > 1.3:
            warnings.append(f"Ratio A:C proyectado {acwr:.2f} — incremento de carga alto, monitorizar respuesta del atleta.")
        elif phase != "recovery" and acwr < 0.8:
            warnings.append(f"Ratio A:C proyectado {acwr:.2f} — carga reciente baja respecto a la habitual.")
    return round(target, 1), warnings


# ── TSS Estimation per Session ───────────────────────────────────────────────


def estimate_session_tss(
    duration_min: float,
    intensity_zone: str,
    discipline: str,
) -> float:
    """Estimate TSS for a planned session.

    Running/cycling: IF^2 * hours * 100
    Swimming: IF^3 * hours * 100 (water resistance)
    """
    intensity_factor = _IF_BY_ZONE.get(intensity_zone, 0.75)
    hours = duration_min / 60
    if discipline == "natación":
        tss = intensity_factor ** 3 * hours * 100
    else:
        tss = intensity_factor ** 2 * hours * 100
    return round(tss, 1)


# ── Swim block selection ─────────────────────────────────────────────────────


def resolve_swim_block(season_phase: str, swim_mode: str = "auto") -> str:
    """Determine swim block type based on season phase and coach preference."""
    if swim_mode != "auto" and swim_mode in _SWIM_MODE_BLOCK:
        return _SWIM_MODE_BLOCK[swim_mode]
    return _SWIM_BLOCK_BY_PHASE.get(season_phase, "aerobic_capacity_block")


# ── Cross-discipline Day Assignment ──────────────────────────────────────────


@dataclass
class DraftSlotTri:
    """A session slot for the triathlon motor with discipline context."""
    discipline: str
    template_id: str
    session_role: str
    session_family: str
    fatigue_cost: int = 3
    requires_fresh: bool = False
    day_offset: int = 0
    scheduled_time: str | None = None


def _cross_discipline_day_assignment(
    primary_slots: list[DraftSlotTri],
    secondary_slots: list[DraftSlotTri],
    swim_slots: list[DraftSlotTri],
) -> list[DraftSlotTri]:
    """Assign days to all sessions across 3 disciplines respecting spacing rules.

    Rules (Olbrecht, Millet 2002, Hausswirth 2013):
    1. No 2 KEY from different disciplines on consecutive days
    2. Same-day brick: bike before run
    3. No same energy system in 2 disciplines same day
    4. Swim is free in spacing (different muscle groups)
    5. Only 1 LONG session per weekend
    """
    all_slots: list[DraftSlotTri] = []
    used_days: set[int] = set()
    key_days: list[int] = []  # days with KEY sessions (non-swim)

    # Classify primary sessions
    primary_long = [s for s in primary_slots if "long" in s.template_id or "tirada" in s.template_id]
    primary_keys = [s for s in primary_slots if s.session_role == "key" and s not in primary_long]
    primary_support = [s for s in primary_slots if s not in primary_keys and s not in primary_long]

    # 1. Place primary KEY sessions → days 2, 4 (Tue, Thu)
    preferred_key_days = [2, 4]
    for i, slot in enumerate(primary_keys[:2]):
        day = preferred_key_days[i] if i < len(preferred_key_days) else _find_free_day(used_days, [3, 5], exclude_adjacent=key_days)
        slot.day_offset = day
        used_days.add(day)
        key_days.append(day)
        all_slots.append(slot)

    # 2. Place primary LONG → Saturday (6), only 1
    for slot in primary_long[:1]:
        day = 6 if 6 not in used_days else 7
        slot.day_offset = day
        used_days.add(day)
        all_slots.append(slot)

    # 3. Place secondary KEY → ≥2 days from any primary KEY
    secondary_keys = [s for s in secondary_slots if s.session_role == "key"]
    secondary_support = [s for s in secondary_slots if s not in secondary_keys]

    for slot in secondary_keys[:1]:
        day = _find_free_day(used_days, [5, 3, 1, 7], exclude_adjacent=key_days, min_distance=2)
        slot.day_offset = day
        used_days.add(day)
        key_days.append(day)
        all_slots.append(slot)

    # 4. Place primary support → remaining gaps
    for slot in primary_support:
        day = _find_free_day(used_days, [1, 3, 5, 7])
        slot.day_offset = day
        used_days.add(day)
        all_slots.append(slot)

    # 5. Place secondary support → remaining gaps
    dropped: list[str] = []
    for slot in secondary_support:
        day = _find_free_day(used_days, [1, 3, 5, 7])
        if day in used_days:
            dropped.append(f"Soporte {slot.discipline} ({slot.template_id}) forzada a día {day} ya ocupado — considerar ajustar manualmente")
        slot.day_offset = day
        used_days.add(day)
        all_slots.append(slot)

    # 6. Place swim sessions — can double up (AM swim + PM land)
    for slot in swim_slots:
        # Try to find a day with an existing session (double session)
        double_day = _find_double_day(used_days, all_slots)
        if double_day:
            slot.day_offset = double_day
            slot.scheduled_time = "07:00"
            # Set the existing session on that day to PM
            for existing in all_slots:
                if existing.day_offset == double_day and existing.scheduled_time is None:
                    existing.scheduled_time = "17:00"
            all_slots.append(slot)
        else:
            day = _find_free_day(used_days, [1, 3, 5, 7])
            slot.day_offset = day
            used_days.add(day)
            all_slots.append(slot)

    return sorted(all_slots, key=lambda s: (s.day_offset, s.scheduled_time or "12:00")), dropped


def _find_free_day(
    used: set[int],
    preferred: list[int],
    exclude_adjacent: list[int] | None = None,
    min_distance: int = 0,
) -> int:
    """Find first available day from preferred list respecting constraints."""
    for day in preferred:
        if day in used:
            continue
        if exclude_adjacent and min_distance > 0:
            if any(abs(day - k) < min_distance for k in exclude_adjacent):
                continue
        return day
    # Fallback: any day 1-7
    for day in range(1, 8):
        if day not in used:
            return day
    return 1  # worst case, double up


def _find_double_day(used: set[int], slots: list[DraftSlotTri]) -> int | None:
    """Find a day that already has a non-swim session for doubling."""
    day_counts: dict[int, int] = {}
    for s in slots:
        if s.discipline != "natación":
            day_counts[s.day_offset] = day_counts.get(s.day_offset, 0) + 1
    # Prefer days with exactly 1 non-swim session
    for day in sorted(day_counts.keys()):
        if day_counts[day] == 1:
            # Check no swim already on this day
            swim_on_day = any(s.day_offset == day and s.discipline == "natación" for s in slots)
            if not swim_on_day:
                return day
    return None


# ── Spacing Validation ───────────────────────────────────────────────────────


def validate_triathlon_spacing(slots: list[DraftSlotTri]) -> list[str]:
    """Check cross-discipline spacing rules and return warnings."""
    warnings: list[str] = []

    # Collect KEY sessions by day (non-swim)
    key_by_day: dict[int, list[DraftSlotTri]] = {}
    for s in slots:
        if s.session_role == "key" and s.discipline != "natación":
            key_by_day.setdefault(s.day_offset, []).append(s)

    # Rule 1: No 2 KEY from different disciplines on consecutive days
    key_days_sorted = sorted(key_by_day.keys())
    for i in range(len(key_days_sorted) - 1):
        d1, d2 = key_days_sorted[i], key_days_sorted[i + 1]
        if d2 - d1 == 1:
            discs1 = {s.discipline for s in key_by_day[d1]}
            discs2 = {s.discipline for s in key_by_day[d2]}
            if discs1 != discs2:
                warnings.append(
                    f"KEY sessions on consecutive days {d1}-{d2} from different disciplines "
                    f"({', '.join(discs1)} → {', '.join(discs2)}). Olbrecht: allow ≥1 day recovery."
                )

    # Rule 2: Same-day brick order (bike before run)
    by_day: dict[int, list[DraftSlotTri]] = {}
    for s in slots:
        by_day.setdefault(s.day_offset, []).append(s)
    for day, day_slots in by_day.items():
        discs = [s.discipline for s in day_slots]
        if "running" in discs and "ciclismo" in discs:
            run_slot = next(s for s in day_slots if s.discipline == "running")
            bike_slot = next(s for s in day_slots if s.discipline == "ciclismo")
            if (run_slot.scheduled_time or "12:00") < (bike_slot.scheduled_time or "12:00"):
                warnings.append(
                    f"Day {day}: running scheduled before cycling in brick. "
                    f"Millet 2002: bike→run order preserves running economy."
                )

    # Rule 3: No same energy system in 2 disciplines same day
    # (Olbrecht SoW Triathlon: "anticipating the negative interaction")
    # Map session families to energy system categories
    _ENERGY_SYSTEM: dict[str, str] = {
        "lt1": "aerobic", "aerobic": "aerobic", "recovery": "aerobic",
        "lt2": "threshold", "threshold": "threshold", "sub-threshold": "threshold",
        "vo2": "anaerobic_power", "vo2max": "anaerobic_power",
        "anc": "anaerobic_capacity", "sprint": "anaerobic_capacity",
    }
    for day, day_slots in by_day.items():
        land_slots = [s for s in day_slots if s.discipline != "natación"]
        if len(land_slots) < 2:
            continue
        systems_by_disc: dict[str, str] = {}
        for s in land_slots:
            family_key = s.session_family.split("_")[0].lower() if s.session_family else ""
            system = _ENERGY_SYSTEM.get(family_key, "unknown")
            if system != "unknown" and s.discipline in systems_by_disc:
                if systems_by_disc[s.discipline] == system:
                    continue  # same discipline, ok
            systems_by_disc[s.discipline] = system
        # Check if 2 different disciplines target same system
        seen_systems: dict[str, str] = {}
        for disc, system in systems_by_disc.items():
            if system in seen_systems and seen_systems[system] != disc:
                warnings.append(
                    f"Day {day}: {seen_systems[system]} and {disc} both target {system}. "
                    f"Olbrecht: avoid same energy system in 2 disciplines same day."
                )
            seen_systems[system] = disc

    # Rule 5: Only 1 LONG per weekend
    weekend_longs = [s for s in slots if s.day_offset in (6, 7) and "long" in (s.template_id or "")]
    if len(weekend_longs) > 1:
        warnings.append("Multiple LONG sessions on weekend. Recommend only 1 LONG per weekend.")

    return warnings


# ── Load Projection ──────────────────────────────────────────────────────────


def project_weekly_load(
    current_ctl: float,
    current_atl: float,
    weekly_tss_targets: list[float],
) -> list[dict[str, Any]]:
    """Project CTL/ATL/TSB/ACWR week by week from current values."""
    # TrainingPeaks standard: α = 2 / (n + 1)
    atl_decay = 2.0 / (7 + 1)   # 0.25
    ctl_decay = 2.0 / (42 + 1)  # 0.04651
    projections: list[dict[str, Any]] = []
    atl = current_atl
    ctl = current_ctl

    for week_idx, weekly_tss in enumerate(weekly_tss_targets):
        daily_tss = weekly_tss / 7
        for _ in range(7):
            atl = atl + (daily_tss - atl) * atl_decay
            ctl = ctl + (daily_tss - ctl) * ctl_decay

        tsb = ctl - atl
        acwr = round(atl / ctl, 2) if ctl >= 10 else None

        if acwr and acwr > 1.5:
            flag = "spike"
        elif acwr and acwr > 1.3:
            flag = "high_acwr"
        elif acwr and acwr < 0.6:
            flag = "detraining"
        else:
            flag = "safe"

        projections.append({
            "week_index": week_idx + 1,
            "projected_tss": round(weekly_tss, 1),
            "projected_ctl": round(ctl, 1),
            "projected_atl": round(atl, 1),
            "projected_tsb": round(tsb, 1),
            "projected_acwr": acwr,
            "safety_flag": flag,
        })

    return projections


# ── Main Builder ─────────────────────────────────────────────────────────────


def build_triathlon_mesocycle_draft(
    *,
    primary_discipline: str,
    primary_block_type: str,
    secondary_discipline: str,
    secondary_block_type: str,
    swim_block_type: str,
    duration_weeks: int,
    structure: str,
    season_phase: str,
    start_date: date,
    weakness_confidence: str,
    current_ctl: float = 0.0,
    current_atl: float = 0.0,
    current_ctl_by_discipline: dict[str, float] | None = None,
    ramp_rate: float = 5.0,
    recovery_factor: float = 0.55,
    custom_tss_split: dict[str, float] | None = None,
    swim_mode: str = "auto",
    phases: list[str] | None = None,
) -> dict[str, Any]:
    """Build integrated triathlon mesocycle draft with 3 disciplines.

    Uses WORKOUT_BLUEPRINTS from workout_library to slot sessions,
    then applies cross-discipline spacing rules and TSS estimation.
    """
    from app.services.workout_library import WORKOUT_TEMPLATES, DraftSlot
    from app.services.workout_library import WORKOUT_BLUEPRINTS

    library = {t.template_id: t for t in WORKOUT_TEMPLATES}

    def _blueprint_for(disc: str, block: str) -> dict[str, tuple]:
        return WORKOUT_BLUEPRINTS.get((disc, block)) or {
            "load": (DraftSlot(2, "recovery_regeneration"),),
            "recovery": (DraftSlot(2, "recovery_regeneration"),),
        }

    primary_bp = _blueprint_for(primary_discipline, primary_block_type)
    secondary_bp = _blueprint_for(secondary_discipline, secondary_block_type)
    swim_bp = _blueprint_for("natación", swim_block_type)

    # TSS split
    split = custom_tss_split or discipline_tss_split(weakness_confidence)

    # Phase sequence — reuse from mesocycle_prescription
    if phases is None:
        from app.services.mesocycle_prescription import _phase_sequence
        work_weeks = max(1, duration_weeks - max(1, duration_weeks // 4))
        recovery_weeks = duration_weeks - work_weeks
        phases = _phase_sequence(structure, duration_weeks, primary_block_type, work_weeks, recovery_weeks)

    draft_weeks: list[dict[str, Any]] = []
    all_spacing_warnings: list[str] = []
    weekly_tss_targets: list[float] = []

    for week_index, phase in enumerate(phases, start=1):
        secondary_phase = _SECONDARY_PHASE_MAP.get(phase, phase)
        swim_phase = _SWIM_PHASE_MAP.get(phase, phase)

        # Weekly TSS target
        weekly_tss, acwr_warnings = compute_weekly_tss_targets(current_ctl, phase, ramp_rate, recovery_factor)
        weekly_tss_targets.append(weekly_tss)
        all_spacing_warnings.extend([f"W{week_index}: {w}" for w in acwr_warnings])

        # TSS per discipline
        tss_primary = weekly_tss * split.get("primary", 0.45)
        tss_secondary = weekly_tss * split.get("secondary", 0.30)
        tss_swim = weekly_tss * split.get("swim", 0.25)

        # Get blueprint slots for each discipline
        primary_raw = primary_bp.get(phase) or primary_bp.get("build") or primary_bp.get("load") or ()
        secondary_raw = secondary_bp.get(secondary_phase) or secondary_bp.get("build") or secondary_bp.get("load") or ()
        swim_raw = swim_bp.get(swim_phase) or swim_bp.get("build") or swim_bp.get("load") or ()

        # Convert to DraftSlotTri
        def _to_tri_slots(raw_slots: tuple, disc: str, max_count: int | None = None) -> list[DraftSlotTri]:
            result = []
            for slot in raw_slots:
                if slot.template_id not in library:
                    continue
                t = library[slot.template_id]
                result.append(DraftSlotTri(
                    discipline=disc,
                    template_id=slot.template_id,
                    session_role=t.session_role,
                    session_family=t.session_family,
                    fatigue_cost=t.fatigue_cost,
                    requires_fresh=t.requires_fresh,
                ))
            if max_count and len(result) > max_count:
                # Keep KEY first, then support
                keys = [s for s in result if s.session_role == "key"]
                others = [s for s in result if s.session_role != "key"]
                result = keys[:max_count] + others[:max(0, max_count - len(keys))]
            return result

        primary_slots = _to_tri_slots(primary_raw, primary_discipline)
        # Secondary: max 2 sessions (1 KEY + 1 support)
        secondary_slots = _to_tri_slots(secondary_raw, secondary_discipline, max_count=2)
        # Swim: 2-3 sessions
        swim_slots = _to_tri_slots(swim_raw, "natación", max_count=3)

        # Assign days across disciplines
        week_slots, placement_warnings = _cross_discipline_day_assignment(primary_slots, secondary_slots, swim_slots)
        all_spacing_warnings.extend([f"W{week_index}: {w}" for w in placement_warnings])

        # Build session dicts with TSS estimation
        sessions: list[dict[str, Any]] = []
        for slot in week_slots:
            if slot.template_id not in library:
                continue
            template = library[slot.template_id]

            # Estimate TSS
            duration = 60  # default
            intensity_zone = "LT1"
            if template.dose_ladder:
                # Use mid-ladder step for estimation
                mid_idx = len(template.dose_ladder) // 2
                step = template.dose_ladder[mid_idx]
                duration = step.total_duration_min if hasattr(step, "total_duration_min") and step.total_duration_min > 0 else step.total_useful_time_min + template.calentamiento_min + template.enfriamiento_min
                intensity_zone = step.intensity_zone
            elif hasattr(template, "calentamiento_min"):
                duration = template.calentamiento_min + 40 + template.enfriamiento_min  # estimate

            est_tss = estimate_session_tss(duration, intensity_zone, slot.discipline)
            scheduled_date = start_date + timedelta(days=(week_index - 1) * 7 + slot.day_offset - 1)

            is_swim_coach_override = slot.discipline == "natación" and swim_mode == "auto"

            sessions.append({
                "session_id": f"tri-{slot.discipline[:3]}-w{week_index}-d{slot.day_offset}-{template.template_id}-{uuid.uuid4().hex[:6]}",
                "discipline": slot.discipline,
                "scheduled_date": scheduled_date,
                "week_index": week_index,
                "day_offset": slot.day_offset,
                "template_id": template.template_id,
                "session_role": template.session_role,
                "session_family": template.session_family,
                "public_label": template.public_label,
                "objective": template.objective,
                "dose_prescription": template.dose_guidance,
                "dose_guidance": template.dose_guidance,
                "progression_note": "",
                "expected_signal": "",
                "coach_note": template.summary if not is_swim_coach_override else "Sesión de natación — el entrenador decide contenido según prioridades técnicas.",
                "confidence": template.confidence if not is_swim_coach_override else 0.5,
                "estimated_tss": est_tss,
                "coach_override_expected": is_swim_coach_override,
                "scheduled_time": slot.scheduled_time,
                "payload": {
                    "discipline": slot.discipline,
                    "phase": phase if slot.discipline == primary_discipline else (secondary_phase if slot.discipline == secondary_discipline else swim_phase),
                    "role_in_tri": "primary" if slot.discipline == primary_discipline else ("secondary" if slot.discipline == secondary_discipline else "swim"),
                },
            })

        # Spacing validation
        spacing_warnings = validate_triathlon_spacing(week_slots)
        all_spacing_warnings.extend([f"W{week_index}: {w}" for w in spacing_warnings])

        # Load label
        _LOAD_LABELS = {"load": "acumulación", "build": "construcción", "build_peak": "carga máxima", "specific": "específico", "recovery": "descarga"}

        draft_weeks.append({
            "week_index": week_index,
            "phase": phase,
            "load_label": _LOAD_LABELS.get(phase, phase),
            "sessions": sessions,
            "tss_target_total": round(weekly_tss, 1),
            "tss_target_by_discipline": {
                primary_discipline: round(tss_primary, 1),
                secondary_discipline: round(tss_secondary, 1),
                "natación": round(tss_swim, 1),
            },
            "spacing_warnings": spacing_warnings,
        })

    # Load projection
    load_projection = project_weekly_load(current_ctl, current_atl, weekly_tss_targets)

    return {
        "primary_discipline": primary_discipline,
        "primary_block_type": primary_block_type,
        "secondary_discipline": secondary_discipline,
        "secondary_block_type": secondary_block_type,
        "swim_block_type": swim_block_type,
        "duration_weeks": duration_weeks,
        "season_phase": season_phase,
        "weeks": draft_weeks,
        "spacing_warnings": all_spacing_warnings,
        "load_projection": load_projection,
    }
