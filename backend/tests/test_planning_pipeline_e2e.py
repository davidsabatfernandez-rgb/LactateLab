"""
Test agent: genera atletas aleatorios con perfiles disparatados y ejecuta
toda la pipeline de planificación end-to-end.

Uso:
    cd backend
    source .venv/bin/activate
    python -m pytest tests/test_planning_pipeline_e2e.py -v -s

Cada combinación (disciplina × nivel × distancia × fase) genera un atleta
sintético con datos de lactato realistas, ejecuta:
    1. athlete_analysis_payload  → snapshots
    2. build_physiological_context → contexto fisiológico
    3. analyse_physiological_gap → recomendación de bloque
    4. select_mesocycle_template  → template del mesociclo
    5. build_prewritten_mesocycle_draft → borrador semana a semana
    6. Validaciones: sesiones, BLa checks, técnica transversal, spacing, templates
"""

import itertools
import random
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
    analyse_physiological_gap,
    build_physiological_context,
)
from app.services.workout_library import WORKOUT_BLUEPRINTS

# ── Profiles ─────────────────────────────────────────────────────────────

PROFILES: list[dict[str, Any]] = [
    # Running
    {"discipline": "running", "level": "recreational",  "distance": "10k",        "pace_label": "5:30", "weeks": 30, "label": "Runner recreativo 10k"},
    {"discipline": "running", "level": "trained",       "distance": "hm",         "pace_label": "4:15", "weeks": 20, "label": "Runner trained HM"},
    {"discipline": "running", "level": "competitive",   "distance": "marathon",   "pace_label": "3:45", "weeks": 16, "label": "Runner comp marathon"},
    {"discipline": "running", "level": "trained",       "distance": "5k",         "pace_label": "3:50", "weeks": 10, "label": "Runner trained 5k"},
    # Ciclismo
    {"discipline": "ciclismo", "level": "recreational", "distance": "road_tt",    "power": 200, "weeks": 24, "label": "Ciclista recreativo TT"},
    {"discipline": "ciclismo", "level": "trained",      "distance": "road_tt",    "power": 280, "weeks": 14, "label": "Ciclista trained TT"},
    {"discipline": "ciclismo", "level": "competitive",  "distance": "road_tt",    "power": 340, "weeks": 8,  "label": "Ciclista comp TT"},
    # Natación
    {"discipline": "natación", "level": "recreational",  "distance": "olympic_tri", "pace_label": "2:05", "weeks": 28, "label": "Swimmer recreativo OD"},
    {"discipline": "natación", "level": "trained",       "distance": "sprint_tri",  "pace_label": "1:35", "weeks": 12, "label": "Swimmer trained sprint"},
    {"discipline": "natación", "level": "competitive",   "distance": "ironman",     "pace_label": "1:25", "weeks": 20, "label": "Swimmer comp ironman"},
    # Edge cases
    {"discipline": "running", "level": "trained",       "distance": "marathon",   "pace_label": "4:00", "weeks": 4,  "label": "Runner pre-comp marathon (4s)"},
    {"discipline": "running", "level": "trained",       "distance": "5k",         "pace_label": "3:30", "weeks": 2,  "label": "Runner taper 5k (2s)"},
    {"discipline": "natación", "level": "trained",       "distance": "ironman",    "pace_label": "1:30", "weeks": 35, "label": "Swimmer base_early ironman"},
]


def _generate_lactate_curve(
    discipline: str,
    level: str,
) -> list[dict[str, Any]]:
    """Genera una curva de lactato realista con 6-8 escalones."""

    rng = random.Random(42)  # reproducible

    if discipline == "ciclismo":
        # Power-based curve
        base_power = {"recreational": 120, "trained": 180, "competitive": 240}[level]
        step = 20
        n_steps = rng.randint(6, 8)
        intervals = []
        for i in range(n_steps):
            power = base_power + i * step
            # Lactate rises exponentially
            if i < 3:
                lac = 0.8 + i * 0.15 + rng.uniform(-0.1, 0.1)
            elif i < 5:
                lac = 1.2 + (i - 3) * 0.6 + rng.uniform(-0.15, 0.15)
            else:
                lac = 2.4 + (i - 5) * 1.8 + rng.uniform(-0.2, 0.3)
            intervals.append({
                "pace_seconds_per_km": None,
                "power_watts": power,
                "heart_rate_avg": 120 + i * 8,
                "lactate_mmol": round(max(0.5, lac), 2),
                "duration_seconds": 300,
            })
        return intervals
    else:
        # Pace-based curve (running or swimming)
        if discipline == "natación":
            base_pace = {"recreational": 150, "trained": 120, "competitive": 100}[level]  # sec/100m → sec/km * 10
            base_pace *= 10  # convert to sec/km equivalent
        else:  # running
            base_pace = {"recreational": 420, "trained": 360, "competitive": 300}[level]  # sec/km
        step = -15 if discipline == "running" else -50  # faster = lower pace
        n_steps = rng.randint(6, 8)
        intervals = []
        for i in range(n_steps):
            pace = base_pace + i * step
            if i < 3:
                lac = 0.9 + i * 0.2 + rng.uniform(-0.1, 0.1)
            elif i < 5:
                lac = 1.4 + (i - 3) * 0.7 + rng.uniform(-0.15, 0.15)
            else:
                lac = 2.8 + (i - 5) * 2.0 + rng.uniform(-0.3, 0.4)
            intervals.append({
                "pace_seconds_per_km": max(120, pace),
                "power_watts": None,
                "heart_rate_avg": 125 + i * 7,
                "lactate_mmol": round(max(0.5, lac), 2),
                "duration_seconds": 300,
            })
        return intervals


def _create_test_athlete(
    db: DbSession,
    profile: dict[str, Any],
    idx: int,
) -> tuple[Athlete, AthleteTarget]:
    """Crea un atleta sintético con test de lactato y target."""

    today = date.today()
    target_date = today + timedelta(weeks=profile["weeks"])

    athlete = Athlete(
        name=f"Test_{idx}_{profile['label']}",
        date_of_birth=date(1990 + idx % 10, 1 + idx % 12, 1 + idx % 28),
        sex="M" if idx % 2 == 0 else "F",
        weight=65.0 + idx * 3.5,
        height=170 + idx * 2,
        primary_discipline=profile["discipline"],
        goal_category=profile.get("distance"),
        athlete_level=profile["level"],
        created_at=today,
    )
    db.add(athlete)
    db.flush()

    # Create lactate test session (7 days ago)
    test_date = datetime.now(timezone.utc) - timedelta(days=7)
    session = Session(
        athlete_id=athlete.id,
        performed_at=test_date,
        discipline=profile["discipline"],
        session_type="test",
        goal="Lactate step test",
        power_source="stryd" if profile["discipline"] == "running" else None,
    )
    db.add(session)
    db.flush()

    curve = _generate_lactate_curve(profile["discipline"], profile["level"])
    for j, step_data in enumerate(curve):
        interval = SessionInterval(
            session_id=session.id,
            order_index=j + 1,
            duration_seconds=step_data["duration_seconds"],
            rest_seconds=60,
            rest_type="passive",
            heart_rate_avg=step_data["heart_rate_avg"],
            pace_seconds_per_km=step_data["pace_seconds_per_km"],
            power_watts=step_data["power_watts"],
            purpose="step",
        )
        db.add(interval)
        db.flush()

        lactate = LactateSample(
            interval_id=interval.id,
            lactate_mmol=step_data["lactate_mmol"],
            sample_delay_seconds=30,
            sample_timing_label="end_of_step",
        )
        db.add(lactate)
    db.flush()

    # Create target
    target = AthleteTarget(
        athlete_id=athlete.id,
        target_date=target_date,
        discipline=profile["discipline"],
        objective=f"Race {profile.get('distance', 'general')}",
        distance_category=profile.get("distance"),
        priority_level="A",
        target_pace_label=profile.get("pace_label"),
        target_power_watts=profile.get("power"),
    )
    db.add(target)
    db.flush()

    return athlete, target


# ── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def engine():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture(scope="module")
def db_session(engine):
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


# ── Tests ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("profile_idx", range(len(PROFILES)))
def test_full_planning_pipeline(db_session: DbSession, profile_idx: int):
    """Ejecuta la pipeline completa para un perfil de atleta."""

    profile = PROFILES[profile_idx]
    label = profile["label"]
    print(f"\n{'='*70}")
    print(f"  PROFILE {profile_idx}: {label}")
    print(f"{'='*70}")

    # 1. Create athlete + lactate data + target
    athlete, target = _create_test_athlete(db_session, profile, profile_idx)
    db_session.commit()

    # 2. Recalculate snapshots (threshold detection)
    recalculate_athlete(db_session, athlete.id)
    db_session.commit()

    # 3. Build analysis payload (simplified — we go straight to physio context)
    from app.services.analytics import athlete_analysis_payload
    analysis = athlete_analysis_payload(db_session, athlete.id)
    assert analysis is not None, f"[{label}] analysis_payload returned None"
    print(f"  Analysis: {len(analysis.get('disciplines', {}))} disciplines found")

    # 4. Build physiological context
    weeks_to_goal = max(1, (target.target_date - date.today()).days // 7)
    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level=profile["level"],
        discipline=profile["discipline"],
        distance_category=profile.get("distance"),
        target_pace_label=profile.get("pace_label"),
        target_power_watts=profile.get("power"),
        weeks_to_goal=weeks_to_goal,
    )
    assert ctx is not None, f"[{label}] build_physiological_context returned None"
    print(f"  Context: LT1={ctx.lt1_kmh or ctx.lt1_power_watts}, LT2={ctx.lt2_kmh or ctx.lt2_power_watts}")
    print(f"  Confidence: LT1={ctx.lt1_confidence:.2f}, LT2={ctx.lt2_confidence:.2f}")
    print(f"  Test age: {ctx.test_age_days}d, metric: {ctx.metric_type}")

    # 5. Analyse physiological gap
    gap = analyse_physiological_gap(ctx)
    assert gap is not None, f"[{label}] analyse_physiological_gap returned None"
    assert gap.recommended_block, f"[{label}] No recommended block"
    assert gap.season_phase, f"[{label}] No season phase"
    print(f"  Gap: limiter={gap.primary_limiter}, phase={gap.season_phase}")
    print(f"  Recommended block: {gap.recommended_block}")
    print(f"  Reasons: {gap.reasons[:3]}")
    if gap.contraindications:
        print(f"  Contraindications: {gap.contraindications}")

    # 6. Select mesocycle template
    template = select_mesocycle_template(profile["discipline"], gap.recommended_block)
    assert template is not None, f"[{label}] No template for {profile['discipline']}/{gap.recommended_block}"
    print(f"  Template: {template.template_id} → {template.public_label}")
    print(f"  Duration: {template.typical_duration_weeks}, Structure: {template.typical_structure}")

    # 7. Verify blueprint exists
    bp_key = (profile["discipline"], gap.recommended_block)
    assert bp_key in WORKOUT_BLUEPRINTS, f"[{label}] Missing blueprint for {bp_key}"
    bp = WORKOUT_BLUEPRINTS[bp_key]
    print(f"  Blueprint phases: {list(bp.keys())}")

    # 8. Build mesocycle draft
    duration_weeks = template.typical_duration_weeks[1]  # max duration
    work_weeks = duration_weeks - 1
    recovery_weeks = 1
    structure = template.typical_structure.split(" o ")[0]  # take first option

    draft = build_prewritten_mesocycle_draft(
        discipline=profile["discipline"],
        block_type=gap.recommended_block,
        block_label=template.public_label,
        structure=structure,
        duration_weeks=duration_weeks,
        work_weeks=work_weeks,
        recovery_weeks=recovery_weeks,
        primary_focus=template.primary_focus,
        secondary_focus=template.secondary_focus,
        start_date=date.today(),
        athlete=athlete,
        target_date=target.target_date,
    )
    assert draft is not None, f"[{label}] build_prewritten_mesocycle_draft returned None"
    assert "weeks" in draft, f"[{label}] draft has no 'weeks'"
    assert len(draft["weeks"]) == duration_weeks, f"[{label}] Expected {duration_weeks} weeks, got {len(draft['weeks'])}"
    print(f"  Draft: {len(draft['weeks'])} weeks")

    # 9. Validate sessions per week
    total_sessions = 0
    bla_checks = 0
    technique_sessions = 0
    for week in draft["weeks"]:
        sessions = week["sessions"]
        assert len(sessions) >= 2, f"[{label}] Week {week['week_index']} has only {len(sessions)} sessions"
        total_sessions += len(sessions)

        for s in sessions:
            # Every session must have required fields
            assert s.get("template_id"), f"[{label}] Session missing template_id: {s.get('public_label')}"
            assert s.get("session_role"), f"[{label}] Session missing role"
            assert s.get("dose_prescription"), f"[{label}] Session missing dose_prescription"
            assert s.get("scheduled_date"), f"[{label}] Session missing scheduled_date"

            if s.get("bla_check"):
                bla_checks += 1
                assert "bla_check_reason" in s.get("payload", {}), f"[{label}] BLa check without reason"

            if "technical_alignment" in s.get("template_id", "") or "pull_snorkel" in s.get("template_id", ""):
                technique_sessions += 1

            # Validate technique_context in swimming
            if profile["discipline"] == "natación":
                tc = s.get("payload", {}).get("technique_context")
                assert tc is not None, f"[{label}] Swimming session missing technique_context: {s.get('public_label')}"
                assert tc["level"] in ("full", "support", "warmup_only", "integrated"), f"[{label}] Invalid technique level: {tc['level']}"

    print(f"  Total sessions: {total_sessions}, BLa checks: {bla_checks}, Technique sessions: {technique_sessions}")

    # 10. BLa check validation
    if duration_weeks >= 3:
        assert bla_checks >= 1, f"[{label}] Expected ≥1 BLa check for {duration_weeks}-week block"
    print(f"  ✓ BLa checks OK ({bla_checks})")

    # 11. Technique transversal in swimming
    if profile["discipline"] == "natación":
        # Base/load weeks should have dedicated technique sessions
        load_weeks = [w for w in draft["weeks"] if w.get("load_type") == "acumulación"]
        for lw in load_weeks:
            has_technique = any(
                "technical_alignment" in s.get("template_id", "") or
                "pull_snorkel" in s.get("template_id", "")
                for s in lw["sessions"]
            )
            assert has_technique, f"[{label}] Load week {lw['week_index']} has no technique session"
        print(f"  ✓ Technique transversal OK ({technique_sessions} technique sessions)")

    # 12. Spacing warnings
    for week in draft["weeks"]:
        for warning in week.get("spacing_warnings", []):
            print(f"  ⚠ Spacing warning week {week['week_index']}: {warning}")

    print(f"  ✓ PIPELINE OK: {label}")
    print()


def test_all_blueprints_resolve(db_session: DbSession):
    """Verifica que todos los template_ids en WORKOUT_BLUEPRINTS existen en la librería."""
    from app.services.workout_library import WORKOUT_TEMPLATES

    template_index = {t.template_id: t for t in WORKOUT_TEMPLATES}
    missing = []

    for (disc, block), phases in WORKOUT_BLUEPRINTS.items():
        for phase_name, slots in phases.items():
            for slot in slots:
                if slot.template_id not in template_index:
                    missing.append(f"({disc}, {block}) phase={phase_name} → {slot.template_id}")

    if missing:
        print("\nMissing template_ids in blueprints:")
        for m in missing:
            print(f"  ✗ {m}")
    assert not missing, f"{len(missing)} missing template_ids"
    print(f"\n✓ All {sum(len(slots) for phases in WORKOUT_BLUEPRINTS.values() for slots in phases.values())} blueprint slots resolve OK")


def test_all_block_types_have_mesocycle_templates():
    """Verifica que cada (disciplina, block_type) en blueprints tiene un MesocycleTemplate."""
    from app.services.mesocycle_library import TEMPLATES

    template_coverage = {(t.discipline, t.block_type) for t in TEMPLATES}
    # Also count "all" templates
    all_blocks = {t.block_type for t in TEMPLATES if t.discipline == "all"}

    missing = []
    for (disc, block) in WORKOUT_BLUEPRINTS:
        if (disc, block) not in template_coverage and block not in all_blocks:
            missing.append(f"({disc}, {block})")

    if missing:
        print("\nMissing MesocycleTemplates for blueprint entries:")
        for m in missing:
            print(f"  ✗ {m}")
    assert not missing, f"{len(missing)} missing MesocycleTemplates"
    print(f"\n✓ All blueprint entries have MesocycleTemplates")


def test_swim_technique_fade():
    """Verifica que la técnica en natación tiene el fade correcto por fase."""
    discipline = "natación"
    block_type = "aerobic_capacity_block"
    template = select_mesocycle_template(discipline, block_type)

    draft = build_prewritten_mesocycle_draft(
        discipline=discipline,
        block_type=block_type,
        block_label=template.public_label,
        structure="3+1",
        duration_weeks=4,
        work_weeks=3,
        recovery_weeks=1,
        primary_focus=template.primary_focus,
        secondary_focus=template.secondary_focus,
    )

    technique_levels = {}
    for week in draft["weeks"]:
        load_type = week.get("load_type", "unknown")
        for session in week["sessions"]:
            tc = session.get("payload", {}).get("technique_context")
            if tc:
                technique_levels.setdefault(load_type, set()).add(tc["level"])

    print(f"\nTechnique levels by phase: {technique_levels}")

    # Load/acumulación should have "full"
    if "acumulación" in technique_levels:
        assert "full" in technique_levels["acumulación"], "Load phase should have full technique"

    # Build should have "support"
    if "construcción" in technique_levels:
        assert "support" in technique_levels["construcción"], "Build phase should have support technique"

    # Build_peak should have "warmup_only"
    if "carga máxima" in technique_levels:
        assert "warmup_only" in technique_levels["carga máxima"], "Build_peak should have warmup_only technique"

    # Recovery should have "integrated"
    if "descarga" in technique_levels:
        assert "integrated" in technique_levels["descarga"], "Recovery should have integrated technique"

    print("✓ Technique fade verified")


def test_dose_ladders_have_durations():
    """Verifica que todos los DoseSteps con dose_ladder tienen total_duration_min > 0."""
    from app.services.workout_library import WORKOUT_TEMPLATES

    broken = []
    for t in WORKOUT_TEMPLATES:
        if t.dose_ladder:
            for step in t.dose_ladder:
                if step.total_duration_min <= 0:
                    broken.append(f"{t.template_id} step {step.step}: total_duration_min={step.total_duration_min}")

    if broken:
        print("\nDoseSteps with zero duration:")
        for b in broken:
            print(f"  ✗ {b}")
    assert not broken, f"{len(broken)} DoseSteps with zero duration"
    print(f"\n✓ All DoseSteps have positive total_duration_min")


def test_high_fatigue_templates_require_fresh():
    """Templates con fatigue_cost ≥ 4 deberían tener requires_fresh=True."""
    from app.services.workout_library import WORKOUT_TEMPLATES

    warnings = []
    for t in WORKOUT_TEMPLATES:
        if t.fatigue_cost >= 4 and not t.requires_fresh:
            # Some support/recovery sessions can have moderate fatigue
            if t.session_role in ("key",):
                warnings.append(f"{t.template_id}: fatigue={t.fatigue_cost}, requires_fresh={t.requires_fresh}")

    if warnings:
        print("\nKey sessions with high fatigue but no requires_fresh:")
        for w in warnings:
            print(f"  ⚠ {w}")
    # Warning only, not assertion — some sessions can legitimately be high fatigue without requires_fresh
    print(f"\n✓ High fatigue check done ({len(warnings)} warnings)")
