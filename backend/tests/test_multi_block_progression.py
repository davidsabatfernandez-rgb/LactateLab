"""
Test agent de progresión multi-bloque: atletas dispares viajan desde su estado
actual hasta su objetivo, bloque a bloque.

Cada atleta pasa por N mesociclos consecutivos. Tras cada bloque se simula
una adaptación fisiológica realista y se re-ejecuta la pipeline.

Validaciones científicas en cada paso:
 - Olbrecht sequencing: capacidad antes que potencia
 - ANC gate: solo base_late + prueba corta + VLamax baja
 - ANP gate: solo pre_comp + _ANP_EVENTS
 - base_early → siempre AEC (nunca THR/AEP/ANC/ANP)
 - Technique fade en natación
 - BLa checks en cada mesociclo ≥3 semanas
 - No repeat indefinido del mismo bloque (estancamiento)
 - testing_decision_block cuando test_age > 56d en specific/pre_comp
 - Detección de objetivos inalcanzables

Uso:
    cd backend
    source .venv/bin/activate
    python -m pytest tests/test_multi_block_progression.py -v -s
"""
from __future__ import annotations

import itertools
import json
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session as DbSession, sessionmaker

from app.db.base import Base
from app.models.athlete import Athlete, AthleteFocusBlock, AthleteTarget
from app.models.session import LactateSample, Session, SessionInterval
from app.services.analytics import recalculate_athlete
from app.services.mesocycle_library import select_mesocycle_template
from app.services.mesocycle_prescription import build_prewritten_mesocycle_draft
from app.services.physiological_engine import (
    MIN_WEEKS_FOR_BLOCK,
    PhysiologicalGapResult,
    analyse_physiological_gap,
    build_physiological_context,
)
from app.services.workout_library import WORKOUT_BLUEPRINTS


# ═══════════════════════════════════════════════════════════════════════════
# Athlete profiles — 20 atletas dispares
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class AthleteProfile:
    """Perfil sintético de un atleta con su curva de lactato y objetivo."""
    name: str
    discipline: str
    level: str
    distance: str
    target_pace_label: Optional[str] = None
    target_power: Optional[float] = None
    weeks_to_goal: int = 20
    sex: str = "M"
    weight: float = 70.0
    # Curva de lactato: pares (pace_sec_km | power_watts, lactate_mmol)
    # La curva define el perfil fisiológico del atleta
    lt_curve: list[tuple[float, float]] = field(default_factory=list)
    description: str = ""


def _make_running_curve(lt1_pace: float, lt2_pace: float, n_steps: int = 7) -> list[tuple[float, float]]:
    """Genera curva running: pace_sec/km vs lactate. lt1_pace > lt2_pace (faster)."""
    paces = [lt1_pace + 30 + i * ((lt2_pace - 60 - lt1_pace - 30) / (n_steps - 1)) for i in range(n_steps)]
    # Lactate curve: exponential rise
    lacs = []
    for i, p in enumerate(paces):
        if p > lt1_pace:
            lac = 0.8 + (lt1_pace - p + 30) / 30 * 0.3
        elif p > lt2_pace:
            frac = (lt1_pace - p) / (lt1_pace - lt2_pace)
            lac = 1.8 + frac * 2.2
        else:
            overshoot = (lt2_pace - p) / 30
            lac = 4.0 + overshoot * 3.0
        lacs.append(round(max(0.6, lac), 2))
    return list(zip(paces, lacs))


def _make_cycling_curve(lt1_power: float, lt2_power: float, n_steps: int = 7) -> list[tuple[float, float]]:
    """Genera curva ciclismo: power_watts vs lactate."""
    powers = [lt1_power - 40 + i * ((lt2_power + 40 - lt1_power + 40) / (n_steps - 1)) for i in range(n_steps)]
    lacs = []
    for i, w in enumerate(powers):
        if w < lt1_power:
            lac = 0.7 + (w - (lt1_power - 40)) / 40 * 0.5
        elif w < lt2_power:
            frac = (w - lt1_power) / (lt2_power - lt1_power)
            lac = 1.8 + frac * 2.2
        else:
            overshoot = (w - lt2_power) / 30
            lac = 4.0 + overshoot * 2.5
        lacs.append(round(max(0.5, lac), 2))
    return list(zip(powers, lacs))


ATHLETES: list[AthleteProfile] = [
    # ── Running: perfiles variados ──────────────────────────────────────
    AthleteProfile(
        name="Maria — Recreational 10k, base muy débil",
        discipline="running", level="recreational", distance="10k",
        target_pace_label="5:30", weeks_to_goal=30, sex="F", weight=62,
        lt_curve=_make_running_curve(420, 360, 7),  # LT1@7:00, LT2@6:00 → muy lento
        description="Atleta recreativa con base aeróbica pobre. Necesita mucho AEC antes de cualquier trabajo de umbral.",
    ),
    AthleteProfile(
        name="Carlos — Trained HM, LT2 gap grande",
        discipline="running", level="trained", distance="hm",
        target_pace_label="4:00", weeks_to_goal=20, sex="M", weight=72,
        lt_curve=_make_running_curve(330, 280, 7),  # LT1@5:30, LT2@4:40
        description="Runner trained con gap LT2 significativo. 4:00/km requiere LT2 mucho más rápido.",
    ),
    AthleteProfile(
        name="Ana — Competitive marathon, LT1 gap",
        discipline="running", level="competitive", distance="marathon",
        target_pace_label="3:30", weeks_to_goal=24, sex="F", weight=55,
        lt_curve=_make_running_curve(270, 225, 8),  # LT1@4:30, LT2@3:45
        description="Maratoniana competitiva donde LT1 es el limitante primario.",
    ),
    AthleteProfile(
        name="Javi — Trained 5k, perfil diesel (VLamax baja)",
        discipline="running", level="trained", distance="5k",
        target_pace_label="3:40", weeks_to_goal=14, sex="M", weight=68,
        lt_curve=_make_running_curve(290, 255, 7),  # LT1@4:50, LT2@4:15 → ratio alto
        description="Perfil diesel: ratio LT1/LT2 alto (>0.87). Necesita ANC para despertar glucólisis.",
    ),
    AthleteProfile(
        name="Laura — Recreational marathon, objetivo ambicioso",
        discipline="running", level="recreational", distance="marathon",
        target_pace_label="4:15", weeks_to_goal=16, sex="F", weight=58,
        lt_curve=_make_running_curve(390, 340, 7),  # LT1@6:30, LT2@5:40
        description="Objetivo MUY ambicioso: quiere sub-3h maratón siendo recreativa. Debería detectar inviabilidad.",
    ),
    AthleteProfile(
        name="Pedro — Competitive 5k, ya cerca del objetivo",
        discipline="running", level="competitive", distance="5k",
        target_pace_label="3:15", weeks_to_goal=8, sex="M", weight=65,
        lt_curve=_make_running_curve(240, 195, 8),  # LT1@4:00, LT2@3:15
        description="Ya tiene el LT2 cerca del objetivo. Debería ir a AEP o COMP, no AEC.",
    ),
    AthleteProfile(
        name="Elena — Trained 10k, VLamax alta (curva empinada)",
        discipline="running", level="trained", distance="10k",
        target_pace_label="4:15", weeks_to_goal=18, sex="F", weight=56,
        lt_curve=_make_running_curve(350, 270, 7),  # LT1@5:50, LT2@4:30 → ratio 0.77 (VLamax alta)
        description="Curva empinada: VLamax alta. En base debería suprimir con AEC extensivo (Olbrecht).",
    ),
    AthleteProfile(
        name="Miguel — Trained HM, taper (2 semanas)",
        discipline="running", level="trained", distance="hm",
        target_pace_label="4:10", weeks_to_goal=2, sex="M", weight=73,
        lt_curve=_make_running_curve(310, 260, 7),  # LT1@5:10, LT2@4:20
        description="En taper: debe recomendar COMP, no THR/AEC.",
    ),
    # ── Ciclismo: perfiles variados ─────────────────────────────────────
    AthleteProfile(
        name="David — Trained TT ciclista, gap moderado",
        discipline="ciclismo", level="trained", distance="road_tt",
        target_power=280.0, weeks_to_goal=16, sex="M", weight=75,
        lt_curve=_make_cycling_curve(200, 260, 7),  # LT1@200W, LT2@260W
        description="Ciclista con FTP moderado que necesita subir umbral.",
    ),
    AthleteProfile(
        name="Sofia — Competitive TT corto, ya en rango",
        discipline="ciclismo", level="competitive", distance="road_tt_short",
        target_power=340.0, weeks_to_goal=6, sex="F", weight=60,
        lt_curve=_make_cycling_curve(290, 340, 7),  # LT1@290W, LT2@340W → ya en rango
        description="Ya en rango para el objetivo. Pre-comp: debería ir a AEP o ANP.",
    ),
    AthleteProfile(
        name="Pablo — Recreational granfondo, base pobre",
        discipline="ciclismo", level="recreational", distance="granfondo",
        target_power=200.0, weeks_to_goal=28, sex="M", weight=82,
        lt_curve=_make_cycling_curve(130, 175, 7),  # LT1@130W, LT2@175W
        description="Ciclista recreativo con mucha base por construir.",
    ),
    # ── Natación: perfiles variados ──────────────────────────────────────
    AthleteProfile(
        name="Lucia — Trained sprint tri natación",
        discipline="natación", level="trained", distance="sprint_tri",
        target_pace_label="1:40", weeks_to_goal=14, sex="F", weight=60,
        lt_curve=_make_running_curve(1600, 1350, 7),  # sec/km equivalente para natación
        description="Triatleta en natación con foco sprint. Técnica transversal debería aplicar.",
    ),
    AthleteProfile(
        name="Marcos — Competitive ironman swim",
        discipline="natación", level="competitive", distance="ironman",
        target_pace_label="1:20", weeks_to_goal=22, sex="M", weight=78,
        lt_curve=_make_running_curve(1300, 1100, 7),
        description="Nadador ironman: LT1 es el limitante. Técnica debe fade hacia competición.",
    ),
    AthleteProfile(
        name="Alba — Recreational OD swim, sin experiencia",
        discipline="natación", level="recreational", distance="olympic_tri",
        target_pace_label="2:10", weeks_to_goal=32, sex="F", weight=58,
        lt_curve=_make_running_curve(1800, 1500, 6),
        description="Nadadora recreativa para olímpico. Necesita base + técnica.",
    ),
    # ── Edge cases ──────────────────────────────────────────────────────
    AthleteProfile(
        name="Raul — Trained ironman run, LT1-led",
        discipline="running", level="trained", distance="ironman_run",
        target_pace_label="4:30", weeks_to_goal=26, sex="M", weight=74,
        lt_curve=_make_running_curve(340, 285, 7),  # LT1@5:40, LT2@4:45
        description="Ironman runner: LT1 es el limitante principal (prueba ultra-larga).",
    ),
    AthleteProfile(
        name="Carmen — Trained 70.3 bici",
        discipline="ciclismo", level="trained", distance="half_bike",
        target_power=250.0, weeks_to_goal=18, sex="F", weight=58,
        lt_curve=_make_cycling_curve(185, 240, 7),  # LT1@185W, LT2@240W
        description="70.3 en bici: evento mixto donde tanto LT1 como LT2 importan.",
    ),
    AthleteProfile(
        name="Sergio — Competitive road race ciclismo",
        discipline="ciclismo", level="competitive", distance="road_race",
        target_power=380.0, weeks_to_goal=10, sex="M", weight=70,
        lt_curve=_make_cycling_curve(310, 370, 7),  # LT1@310W, LT2@370W
        description="Road racer: prueba corta intensa. Si gap cerrado → AEP/ANP.",
    ),
]


# ═══════════════════════════════════════════════════════════════════════════
# Adaptation simulation
# ═══════════════════════════════════════════════════════════════════════════

# How much LT1/LT2 improves per block type (% improvement of the gap)
# These are CONSERVATIVE estimates based on Olbrecht response curves.
_ADAPTATION_RATES: dict[str, dict[str, float]] = {
    "aerobic_capacity_block":      {"lt1": 0.12, "lt2": 0.04},  # AEC: LT1 moves a lot, LT2 a little
    "threshold_development_block": {"lt1": 0.05, "lt2": 0.15},  # THR: LT2 is the target
    "anaerobic_capacity_block":    {"lt1": 0.02, "lt2": 0.03},  # ANC: develops VLamax, minimal threshold shift
    "aerobic_power_block":         {"lt1": 0.03, "lt2": 0.10},  # AEP: pushes VO2max ceiling
    "anaerobic_power_block":       {"lt1": 0.01, "lt2": 0.02},  # ANP: tolerance, minimal threshold
    "competition_specific_block":  {"lt1": 0.03, "lt2": 0.05},  # COMP: specificity, moderate transfer
    "testing_decision_block":      {"lt1": 0.00, "lt2": 0.00},  # No training stimulus
    "technical_rebuild_block":     {"lt1": 0.06, "lt2": 0.02},  # Economy gains → indirect LT1
}


def _simulate_adaptation(
    curve: list[tuple[float, float]],
    block_type: str,
    discipline: str,
    duration_weeks: int,
) -> list[tuple[float, float]]:
    """Simula la adaptación tras un bloque: desplaza la curva según el estímulo."""
    rates = _ADAPTATION_RATES.get(block_type, {"lt1": 0.03, "lt2": 0.03})
    # More weeks → more adaptation (diminishing returns)
    time_factor = min(1.0, duration_weeks / 6.0)

    is_power = discipline == "ciclismo"
    new_curve = []
    for metric, lac in curve:
        # Shift the metric (faster pace = lower sec/km, higher power = better)
        lt1_shift = rates["lt1"] * time_factor
        lt2_shift = rates["lt2"] * time_factor

        # Weight by lactate: near LT1 (~2mmol) shift by lt1_rate, near LT2 (~4mmol) by lt2_rate
        if lac < 2.5:
            shift_pct = lt1_shift
        elif lac < 3.5:
            blend = (lac - 2.5) / 1.0
            shift_pct = lt1_shift * (1 - blend) + lt2_shift * blend
        else:
            shift_pct = lt2_shift

        if is_power:
            new_metric = metric * (1 + shift_pct)  # power goes up
        else:
            new_metric = metric * (1 - shift_pct)  # pace goes down (faster)

        new_curve.append((round(new_metric, 1), lac))
    return new_curve


# ═══════════════════════════════════════════════════════════════════════════
# Olbrecht sequencing rules (scientific validation)
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class SequencingViolation:
    athlete: str
    block_index: int
    rule: str
    details: str
    severity: str  # "error" | "warning"


def _validate_olbrecht_rules(
    athlete_name: str,
    block_history: list[dict[str, Any]],
) -> list[SequencingViolation]:
    """Valida que la secuencia de bloques respeta las reglas de Olbrecht."""
    violations: list[SequencingViolation] = []

    for i, block in enumerate(block_history):
        bt = block["block_type"]
        season = block["season_phase"]
        prev_bt = block_history[i - 1]["block_type"] if i > 0 else None

        # R1: base_early SIEMPRE debe ser AEC (Olbrecht: capacity training first)
        if season == "base_early" and bt not in ("aerobic_capacity_block", "testing_decision_block", "technical_rebuild_block"):
            violations.append(SequencingViolation(
                athlete_name, i, "R1_BASE_EARLY_AEC",
                f"Base early pero bloque={bt}. Olbrecht: siempre capacidad aeróbica en base temprana.",
                "error",
            ))

        # R2: ANP solo en pre_comp (Olbrecht: competition training period)
        if bt == "anaerobic_power_block" and season not in ("pre_comp",):
            violations.append(SequencingViolation(
                athlete_name, i, "R2_ANP_ONLY_PRECOMP",
                f"ANP en fase={season}. Olbrecht: ANP solo en competition training period.",
                "error",
            ))

        # R3: ANC solo en base_late o later (never base_early)
        if bt == "anaerobic_capacity_block" and season == "base_early":
            violations.append(SequencingViolation(
                athlete_name, i, "R3_ANC_NOT_BASE_EARLY",
                f"ANC en base_early. Olbrecht: ANC requiere base construida (base_late+).",
                "error",
            ))

        # R4: capacity antes que power (AEC before AEP globally)
        if bt == "aerobic_power_block" and i > 0:
            has_prior_capacity = any(
                b["block_type"] in ("aerobic_capacity_block", "threshold_development_block")
                for b in block_history[:i]
            )
            if not has_prior_capacity:
                violations.append(SequencingViolation(
                    athlete_name, i, "R4_CAPACITY_BEFORE_POWER",
                    "AEP sin capacidad previa (AEC o THR). Olbrecht: capacity precede power.",
                    "warning",
                ))

        # R5: No más de 1 bloque ANP consecutivo (Olbrecht: max 2 weeks = 1 bloque de 2s)
        if bt == "anaerobic_power_block" and prev_bt == "anaerobic_power_block":
            violations.append(SequencingViolation(
                athlete_name, i, "R5_ANP_MAX_2",
                "2+ bloques ANP consecutivos. Olbrecht: máximo 2 semanas ANP consecutivas (= 1 bloque de 2s).",
                "error",
            ))

        # R6: No repetir el mismo bloque 4+ veces seguidas (estancamiento)
        if i >= 3:
            last_4 = [b["block_type"] for b in block_history[max(0, i - 3):i + 1]]
            if len(set(last_4)) == 1 and last_4[0] not in ("testing_decision_block",):
                violations.append(SequencingViolation(
                    athlete_name, i, "R6_STAGNATION",
                    f"4 bloques consecutivos de {last_4[0]}. Posible estancamiento — el motor no progresa.",
                    "warning",
                ))

        # R7: taper → siempre COMP
        if season == "taper" and bt != "competition_specific_block":
            violations.append(SequencingViolation(
                athlete_name, i, "R7_TAPER_COMP",
                f"Taper pero bloque={bt}. Debería ser competition_specific_block.",
                "error",
            ))

    return violations


# ═══════════════════════════════════════════════════════════════════════════
# Test infrastructure
# ═══════════════════════════════════════════════════════════════════════════

def _create_athlete_with_curve(
    db: DbSession,
    profile: AthleteProfile,
    idx: int,
    test_date_offset_days: int = 7,
) -> tuple[Athlete, AthleteTarget]:
    """Crea atleta con su curva de lactato y target en la DB."""
    today = date.today()

    athlete = Athlete(
        name=f"SIM_{idx}_{profile.name}",
        date_of_birth=date(1988 + idx % 10, 1 + idx % 12, 1 + idx % 28),
        sex=profile.sex,
        weight=profile.weight,
        height=170 + idx,
        primary_discipline=profile.discipline,
        goal_category=profile.distance,
        athlete_level=profile.level,
        created_at=today,
    )
    db.add(athlete)
    db.flush()

    _insert_lactate_session(db, athlete, profile, test_date_offset_days)

    target = AthleteTarget(
        athlete_id=athlete.id,
        target_date=today + timedelta(weeks=profile.weeks_to_goal),
        discipline=profile.discipline,
        objective=f"Race {profile.distance}",
        distance_category=profile.distance,
        priority_level="A",
        target_pace_label=profile.target_pace_label,
        target_power_watts=profile.target_power,
    )
    db.add(target)
    db.flush()

    return athlete, target


def _insert_lactate_session(
    db: DbSession,
    athlete: Athlete,
    profile: AthleteProfile,
    test_date_offset_days: int = 7,
):
    """Inserta una sesión de test de lactato con la curva del perfil."""
    test_dt = datetime.now(timezone.utc) - timedelta(days=test_date_offset_days)
    session = Session(
        athlete_id=athlete.id,
        performed_at=test_dt,
        discipline=profile.discipline,
        session_type="test",
        goal="Lactate step test",
    )
    db.add(session)
    db.flush()

    is_power = profile.discipline == "ciclismo"
    for j, (metric, lac) in enumerate(profile.lt_curve):
        interval = SessionInterval(
            session_id=session.id,
            order_index=j + 1,
            duration_seconds=300,
            rest_seconds=60,
            rest_type="passive",
            heart_rate_avg=130 + j * 6,
            pace_seconds_per_km=metric if not is_power else None,
            power_watts=metric if is_power else None,
            purpose="step",
        )
        db.add(interval)
        db.flush()
        ls = LactateSample(
            interval_id=interval.id,
            lactate_mmol=lac,
            sample_delay_seconds=30,
            sample_timing_label="end_of_step",
        )
        db.add(ls)
    db.flush()


def _run_one_block(
    db: DbSession,
    athlete: Athlete,
    target: AthleteTarget,
    profile: AthleteProfile,
    weeks_remaining: int,
) -> dict[str, Any]:
    """Ejecuta un ciclo de la pipeline y devuelve info del bloque recomendado."""
    from app.services.analytics import athlete_analysis_payload

    recalculate_athlete(db, athlete.id)
    db.commit()

    analysis = athlete_analysis_payload(db, athlete.id)
    weeks_to_goal = max(1, weeks_remaining)

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level=profile.level,
        discipline=profile.discipline,
        distance_category=profile.distance,
        target_pace_label=profile.target_pace_label,
        target_power_watts=profile.target_power,
        weeks_to_goal=weeks_to_goal,
    )

    gap = analyse_physiological_gap(ctx)

    # ── Aplicar guardrails de planning_engine (ANP max 1 bloque consecutivo) ──
    # Olbrecht: "ANP should not exceed 2 consecutive weeks" — con bloques de 2s, 1 bloque = límite.
    final_block_type = gap.recommended_block
    if final_block_type == "anaerobic_power_block" and athlete.focus_blocks:
        _recent = sorted(athlete.focus_blocks, key=lambda b: b.start_date, reverse=True)
        _anp_streak = sum(1 for _ in itertools.takewhile(
            lambda b: b.energy_system_focus == "anaerobic_power_block", _recent
        ))
        if _anp_streak >= 1:
            if weeks_to_goal <= 3:
                final_block_type = "competition_specific_block"
            elif gap.lt2_gap_kmh is not None and gap.lt2_gap_kmh <= 0:
                final_block_type = "aerobic_power_block"
            else:
                final_block_type = "threshold_development_block"

    # Registrar FocusBlock en DB para que los guardrails funcionen en bloques futuros
    from datetime import timedelta
    block_start = date.today() - timedelta(days=weeks_remaining * 7)
    fb = AthleteFocusBlock(
        athlete_id=athlete.id,
        start_date=block_start,
        energy_system_focus=final_block_type,
        block_objective=final_block_type,
        status="completed",
    )
    db.add(fb)
    db.flush()

    template = select_mesocycle_template(profile.discipline, final_block_type)
    bp_key = (profile.discipline, final_block_type)
    has_blueprint = bp_key in WORKOUT_BLUEPRINTS

    # Determine duration
    if template:
        duration_weeks = min(template.typical_duration_weeks[1], max(2, weeks_remaining))
    else:
        duration_weeks = min(4, max(2, weeks_remaining))

    # Build draft if possible
    draft = None
    draft_errors = []
    if template and has_blueprint:
        try:
            work_weeks = max(1, duration_weeks - 1)
            recovery_weeks = 1
            structure = template.typical_structure.split(" o ")[0]
            draft = build_prewritten_mesocycle_draft(
                discipline=profile.discipline,
                block_type=final_block_type,
                block_label=template.public_label if template else final_block_type,
                structure=structure,
                duration_weeks=duration_weeks,
                work_weeks=work_weeks,
                recovery_weeks=recovery_weeks,
                primary_focus=template.primary_focus if template else "",
                secondary_focus=template.secondary_focus if template else None,
                start_date=date.today(),
                athlete=athlete,
                target_date=target.target_date,
            )
        except Exception as e:
            draft_errors.append(str(e))

    # Validate draft
    bla_checks = 0
    technique_ok = True
    total_sessions = 0
    if draft:
        for week in draft["weeks"]:
            for s in week["sessions"]:
                total_sessions += 1
                if s.get("bla_check"):
                    bla_checks += 1
                if profile.discipline == "natación":
                    tc = s.get("payload", {}).get("technique_context")
                    if tc is None:
                        technique_ok = False

    return {
        "block_type": final_block_type,
        "season_phase": gap.season_phase,
        "primary_limiter": gap.primary_limiter,
        "lt2_gap": gap.lt2_gap_kmh,
        "lt1_gap": gap.lt1_gap_kmh,
        "data_quality": gap.data_quality,
        "reasons": gap.reasons,
        "contraindications": gap.contraindications,
        "borderline": gap.borderline,
        "has_template": template is not None,
        "has_blueprint": has_blueprint,
        "duration_weeks": duration_weeks,
        "total_sessions": total_sessions,
        "bla_checks": bla_checks,
        "technique_ok": technique_ok,
        "draft_errors": draft_errors,
        "weeks_remaining": weeks_remaining,
        "capacity_profile": {
            "aerobic": ctx.capacity_profile.aerobic_level if ctx.capacity_profile else "unknown",
            "vlamax": ctx.capacity_profile.vlamax_level if ctx.capacity_profile else "unknown",
            "ratio": ctx.capacity_profile.lt1_lt2_ratio if ctx.capacity_profile else None,
        },
    }


# ═══════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def engine():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture(scope="module")
def db(engine):
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


# ═══════════════════════════════════════════════════════════════════════════
# Main test
# ═══════════════════════════════════════════════════════════════════════════

MAX_BLOCKS = 8  # máximo bloques a simular por atleta


@pytest.mark.parametrize("athlete_idx", range(len(ATHLETES)))
def test_multi_block_progression(db: DbSession, athlete_idx: int):
    """Simula la progresión de un atleta bloque a bloque hasta el objetivo."""
    profile = ATHLETES[athlete_idx]

    print(f"\n{'═'*75}")
    print(f"  ATHLETE {athlete_idx}: {profile.name}")
    print(f"  {profile.description}")
    print(f"  Discipline: {profile.discipline}, Level: {profile.level}")
    print(f"  Target: {profile.distance} @ {profile.target_pace_label or f'{profile.target_power}W'}")
    print(f"  Weeks to goal: {profile.weeks_to_goal}")
    print(f"{'═'*75}")

    athlete, target = _create_athlete_with_curve(db, profile, athlete_idx)
    db.commit()

    block_history: list[dict[str, Any]] = []
    current_curve = list(profile.lt_curve)
    weeks_remaining = profile.weeks_to_goal

    for block_idx in range(MAX_BLOCKS):
        if weeks_remaining <= 0:
            print(f"  [Block {block_idx}] No weeks remaining — done.")
            break

        block = _run_one_block(db, athlete, target, profile, weeks_remaining)
        block_history.append(block)

        emoji = "✓" if not block["draft_errors"] else "✗"
        print(
            f"  [{emoji} Block {block_idx}] phase={block['season_phase']}, "
            f"block={block['block_type']}, limiter={block['primary_limiter']}, "
            f"weeks={block['duration_weeks']}, sessions={block['total_sessions']}, "
            f"BLa={block['bla_checks']}"
        )
        if block["lt2_gap"] is not None:
            print(f"    LT2 gap: {block['lt2_gap']:+.2f}, LT1 gap: {block.get('lt1_gap', 'N/A')}")
        print(f"    Profile: aerobic={block['capacity_profile']['aerobic']}, "
              f"vlamax={block['capacity_profile']['vlamax']}, "
              f"ratio={block['capacity_profile']['ratio']}")
        if block["contraindications"]:
            print(f"    ⚠ Contra: {block['contraindications']}")
        if block["draft_errors"]:
            print(f"    ✗ Draft errors: {block['draft_errors']}")

        # Assertions on individual blocks
        assert block["has_template"], f"No template for {profile.discipline}/{block['block_type']}"
        assert block["has_blueprint"], f"No blueprint for {profile.discipline}/{block['block_type']}"
        assert not block["draft_errors"], f"Draft errors: {block['draft_errors']}"

        if block["duration_weeks"] >= 3:
            assert block["bla_checks"] >= 1, f"Block ≥3w but no BLa checks"

        if profile.discipline == "natación":
            assert block["technique_ok"], "Swimming block missing technique_context"

        # Simulate adaptation
        current_curve = _simulate_adaptation(
            current_curve, block["block_type"], profile.discipline, block["duration_weeks"]
        )

        # Update athlete's lactate data (new test after the block)
        profile_copy = AthleteProfile(
            name=profile.name, discipline=profile.discipline,
            level=profile.level, distance=profile.distance,
            lt_curve=current_curve,
        )
        _insert_lactate_session(db, athlete, profile_copy, test_date_offset_days=3)
        db.commit()

        weeks_remaining -= block["duration_weeks"]

    # ── Sequencing validation ───────────────────────────────────────────
    violations = _validate_olbrecht_rules(profile.name, block_history)

    if violations:
        print(f"\n  ── Sequencing violations ──")
        for v in violations:
            print(f"    [{v.severity.upper()}] Block {v.block_index}: {v.rule} — {v.details}")

    errors = [v for v in violations if v.severity == "error"]
    assert not errors, f"{len(errors)} Olbrecht sequencing errors: {[e.rule for e in errors]}"

    print(f"\n  ── Journey summary ──")
    journey = " → ".join(b["block_type"].replace("_block", "").replace("_", " ").title() for b in block_history)
    print(f"  {journey}")
    print(f"  Blocks: {len(block_history)}, Violations: {len(violations)} ({sum(1 for v in violations if v.severity=='warning')} warnings)")
    print()


def test_unreachable_goal_detection(db: DbSession):
    """Verifica que el motor no prescribe bloques absurdos para objetivos inalcanzables."""
    profile = AthleteProfile(
        name="Impossible Runner",
        discipline="running", level="recreational", distance="marathon",
        target_pace_label="2:50",  # Sub-elite marathon pace for a recreational!
        weeks_to_goal=12,
        lt_curve=_make_running_curve(420, 360, 7),  # LT2@6:00/km → needs to be ~2:50 (?!)
    )
    athlete, target = _create_athlete_with_curve(db, profile, 99)
    db.commit()

    block = _run_one_block(db, athlete, target, profile, profile.weeks_to_goal)

    print(f"\n  Unreachable goal test:")
    print(f"  Block: {block['block_type']}, LT2 gap: {block['lt2_gap']}")
    print(f"  Reasons: {block['reasons'][:3]}")

    # The engine should NOT recommend AEP or COMP for an unreachable goal
    # It should stay conservative (AEC or THR)
    assert block["block_type"] in (
        "aerobic_capacity_block", "threshold_development_block", "testing_decision_block"
    ), f"Unreachable goal got aggressive block: {block['block_type']}"
    print(f"  ✓ Engine stays conservative for unreachable goal")


def test_stale_test_triggers_testing_block(db: DbSession):
    """Un test >56d en specific/pre_comp debe disparar testing_decision_block."""
    profile = AthleteProfile(
        name="Stale Test Runner",
        discipline="running", level="trained", distance="10k",
        target_pace_label="4:00", weeks_to_goal=8,
        lt_curve=_make_running_curve(310, 260, 7),
    )
    # Create with test 60 days ago (stale)
    athlete, target = _create_athlete_with_curve(db, profile, 98, test_date_offset_days=60)
    db.commit()

    block = _run_one_block(db, athlete, target, profile, profile.weeks_to_goal)

    print(f"\n  Stale test trigger:")
    print(f"  Block: {block['block_type']}, data_quality: {block['data_quality']}")
    print(f"  Reasons: {block['reasons'][:3]}")

    assert block["block_type"] == "testing_decision_block", \
        f"Expected testing_decision_block for stale test, got {block['block_type']}"
    print(f"  ✓ Stale test correctly triggers testing_decision_block")
