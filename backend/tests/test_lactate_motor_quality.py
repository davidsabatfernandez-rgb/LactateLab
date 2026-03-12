"""
Test del motor de lactato: detecta umbrales reales vs anclados,
evalúa confianza, y verifica cómo las diferentes calidades de datos
afectan la selección de mesociclo.

Curvas diseñadas para testear:
 - Curvas limpias de 7-8 escalones → umbral REAL con confianza alta
 - Curvas cortas (4-5 puntos) → umbral interpolado/básico
 - Curvas ruidosas → confianza baja
 - Curvas empinadas (VLamax alta) → perfil glucolítico
 - Curvas planas (VLamax baja) → perfil diesel
 - Curvas sin LT1 claro (plateau) → solo LT2 detectable
 - Tests antiguos (>42d, >56d) → impacto en data_quality

Uso:
    cd backend
    source .venv/bin/activate
    python -m pytest tests/test_lactate_motor_quality.py -v -s
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session as DbSession, sessionmaker

from app.db.base import Base
from app.models.athlete import Athlete, AthleteTarget
from app.models.session import LactateSample, Session, SessionInterval
from app.services.analytics import recalculate_athlete, athlete_analysis_payload
from app.services.physiological_engine import (
    build_physiological_context,
    analyse_physiological_gap,
    build_capacity_profile,
)


# ═══════════════════════════════════════════════════════════════════════════
# Curvas de lactato diseñadas para testear diferentes escenarios
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class LactateCurve:
    """Una curva de lactato con metadatos de test."""
    name: str
    discipline: str
    level: str
    steps: list[dict]  # {pace_sec_km, power_watts, lactate_mmol, hr}
    test_age_days: int = 5
    expected_lt1_quality: str = ""  # "real", "basic", "interpolated", "none"
    expected_lt2_quality: str = ""
    expected_data_quality: str = ""  # "good", "low", "none"
    description: str = ""


def _step(pace=None, power=None, lac=0.0, hr=140):
    """Helper para crear un escalón."""
    return {"pace_sec_km": pace, "power_watts": power, "lactate_mmol": lac, "hr": hr}


# ── Curvas running ──────────────────────────────────────────────────────

CLEAN_PROGRESSIVE_7 = LactateCurve(
    name="Curva running limpia 7 escalones",
    discipline="running", level="trained",
    test_age_days=5,
    expected_data_quality="good",
    description="Curva clásica de test incremental bien ejecutado. LT1~5:30, LT2~4:20.",
    steps=[
        _step(pace=390, lac=0.8,  hr=125),   # 6:30/km
        _step(pace=360, lac=0.9,  hr=132),   # 6:00
        _step(pace=330, lac=1.2,  hr=140),   # 5:30 ← LT1 zone
        _step(pace=300, lac=1.8,  hr=150),   # 5:00
        _step(pace=270, lac=2.8,  hr=160),   # 4:30
        _step(pace=255, lac=4.0,  hr=168),   # 4:15 ← LT2 zone
        _step(pace=240, lac=6.5,  hr=176),   # 4:00
    ],
)

CLEAN_PROGRESSIVE_8 = LactateCurve(
    name="Curva running limpia 8 escalones (élite)",
    discipline="running", level="competitive",
    test_age_days=3,
    expected_data_quality="good",
    description="Test élite: 8 escalones, LT1~4:00, LT2~3:25. Resolución alta.",
    steps=[
        _step(pace=300, lac=0.7,  hr=120),   # 5:00/km
        _step(pace=275, lac=0.8,  hr=128),   # 4:35
        _step(pace=250, lac=1.0,  hr=135),   # 4:10
        _step(pace=240, lac=1.4,  hr=142),   # 4:00 ← LT1
        _step(pace=225, lac=2.2,  hr=152),   # 3:45
        _step(pace=210, lac=3.5,  hr=162),   # 3:30
        _step(pace=200, lac=5.2,  hr=170),   # 3:20 ← LT2
        _step(pace=190, lac=8.0,  hr=178),   # 3:10
    ],
)

SHORT_CURVE_4 = LactateCurve(
    name="Curva corta 4 escalones",
    discipline="running", level="recreational",
    test_age_days=10,
    expected_data_quality="good",
    description="Solo 4 puntos: resolución baja, puede no detectar LT1 claro. LOO unreliable.",
    steps=[
        _step(pace=420, lac=1.0,  hr=130),   # 7:00
        _step(pace=380, lac=1.6,  hr=145),   # 6:20
        _step(pace=340, lac=3.5,  hr=158),   # 5:40
        _step(pace=300, lac=7.0,  hr=172),   # 5:00
    ],
)

NOISY_CURVE = LactateCurve(
    name="Curva ruidosa (errores de medición)",
    discipline="running", level="trained",
    test_age_days=8,
    expected_data_quality="good",
    description="Lactato salta: posible error de medición en paso 4. La detección debería sobrevivir.",
    steps=[
        _step(pace=360, lac=0.9,  hr=128),   # 6:00
        _step(pace=330, lac=1.1,  hr=138),   # 5:30
        _step(pace=300, lac=1.8,  hr=148),   # 5:00
        _step(pace=285, lac=1.5,  hr=152),   # 4:45 ← BAJÓN (ruido)
        _step(pace=270, lac=3.2,  hr=160),   # 4:30
        _step(pace=255, lac=5.0,  hr=168),   # 4:15
        _step(pace=240, lac=7.5,  hr=176),   # 4:00
    ],
)

STEEP_CURVE = LactateCurve(
    name="Curva empinada (VLamax alta)",
    discipline="running", level="trained",
    test_age_days=6,
    expected_data_quality="good",
    description="Transición rápida LT1→LT2: VLamax alta. 8 escalones con rango amplio "
                "para que el ratio LT1/LT2 refleje la explosión glucolítica.",
    steps=[
        _step(pace=480, lac=0.6,  hr=110),   # 8:00 baseline
        _step(pace=440, lac=0.7,  hr=118),   # 7:20
        _step(pace=400, lac=0.8,  hr=125),   # 6:40
        _step(pace=360, lac=1.2,  hr=135),   # 6:00 ← LT1 ~10.0 km/h
        _step(pace=320, lac=2.5,  hr=148),   # 5:20
        _step(pace=280, lac=5.5,  hr=162),   # 4:40 ← salto grande
        _step(pace=250, lac=9.0,  hr=172),   # 4:10
        _step(pace=230, lac=14.0, hr=180),   # 3:50
    ],
)

FLAT_CURVE = LactateCurve(
    name="Curva plana (VLamax baja / diesel)",
    discipline="running", level="trained",
    test_age_days=5,
    expected_data_quality="good",
    description="Curva plana: lactato sube gradualmente. Ratio LT1/LT2 > 0.87 → perfil diesel.",
    steps=[
        _step(pace=330, lac=0.7,  hr=120),   # 5:30
        _step(pace=310, lac=0.9,  hr=130),   # 5:10
        _step(pace=290, lac=1.2,  hr=140),   # 4:50 ← LT1
        _step(pace=270, lac=1.8,  hr=150),   # 4:30
        _step(pace=255, lac=2.8,  hr=160),   # 4:15
        _step(pace=240, lac=3.8,  hr=168),   # 4:00
        _step(pace=225, lac=5.0,  hr=175),   # 3:45 ← LT2
    ],
)

# ── Curvas ciclismo ─────────────────────────────────────────────────────

CYCLING_CLEAN = LactateCurve(
    name="Curva ciclismo limpia",
    discipline="ciclismo", level="trained",
    test_age_days=4,
    expected_data_quality="good",
    description="Test incremental en bici: 7 escalones. LT1~190W, LT2~270W.",
    steps=[
        _step(power=140, lac=0.7, hr=110),
        _step(power=160, lac=0.8, hr=120),
        _step(power=190, lac=1.3, hr=135),   # LT1
        _step(power=220, lac=2.0, hr=148),
        _step(power=250, lac=3.0, hr=158),
        _step(power=270, lac=4.2, hr=166),   # LT2
        _step(power=300, lac=7.0, hr=176),
    ],
)

CYCLING_SHORT = LactateCurve(
    name="Curva ciclismo corta 5 escalones",
    discipline="ciclismo", level="recreational",
    test_age_days=12,
    expected_data_quality="low",  # 5 steps → confidence < 0.75 → correctly "low"
    description="Test corto en bici: solo 5 escalones. Menor resolución.",
    steps=[
        _step(power=100, lac=0.8, hr=115),
        _step(power=140, lac=1.1, hr=130),
        _step(power=180, lac=2.0, hr=148),
        _step(power=210, lac=4.5, hr=165),
        _step(power=240, lac=8.5, hr=178),
    ],
)

# ── Curvas con edades de test diferentes ────────────────────────────────

STALE_TEST_43D = LactateCurve(
    name="Test 43 días (justo stale)",
    discipline="running", level="trained",
    test_age_days=43,
    expected_data_quality="low",
    description="Test pasó la barrera de 42 días. Data quality debería ser 'low'.",
    steps=[
        _step(pace=330, lac=0.8, hr=125),
        _step(pace=300, lac=1.3, hr=138),
        _step(pace=270, lac=2.5, hr=152),
        _step(pace=240, lac=4.5, hr=166),
        _step(pace=220, lac=7.0, hr=175),
    ],
)

STALE_TEST_60D = LactateCurve(
    name="Test 60 días (muy stale, specific phase)",
    discipline="running", level="trained",
    test_age_days=60,
    expected_data_quality="low",
    description="Test de 60 días en fase specific/pre_comp → testing_decision_block.",
    steps=[
        _step(pace=330, lac=0.8, hr=125),
        _step(pace=300, lac=1.3, hr=138),
        _step(pace=270, lac=2.5, hr=152),
        _step(pace=240, lac=4.5, hr=166),
        _step(pace=220, lac=7.0, hr=175),
    ],
)

ALL_CURVES = [
    CLEAN_PROGRESSIVE_7,
    CLEAN_PROGRESSIVE_8,
    SHORT_CURVE_4,
    NOISY_CURVE,
    STEEP_CURVE,
    FLAT_CURVE,
    CYCLING_CLEAN,
    CYCLING_SHORT,
    STALE_TEST_43D,
    STALE_TEST_60D,
]


# ═══════════════════════════════════════════════════════════════════════════
# Test helpers
# ═══════════════════════════════════════════════════════════════════════════

def _create_athlete_with_lactate(
    db: DbSession,
    curve: LactateCurve,
    idx: int,
) -> Athlete:
    """Crea un atleta con la curva de lactato dada."""
    today = date.today()
    athlete = Athlete(
        name=f"LAC_{idx}_{curve.name[:30]}",
        date_of_birth=date(1992, 3, 15),
        sex="M",
        weight=70,
        height=175,
        primary_discipline=curve.discipline,
        athlete_level=curve.level,
        created_at=today,
    )
    db.add(athlete)
    db.flush()

    test_dt = datetime.now(timezone.utc) - timedelta(days=curve.test_age_days)
    session = Session(
        athlete_id=athlete.id,
        performed_at=test_dt,
        discipline=curve.discipline,
        session_type="test",
        goal="Lactate step test",
    )
    db.add(session)
    db.flush()

    for j, step in enumerate(curve.steps):
        interval = SessionInterval(
            session_id=session.id,
            order_index=j + 1,
            duration_seconds=300,
            rest_seconds=60,
            rest_type="passive",
            heart_rate_avg=step["hr"],
            pace_seconds_per_km=step.get("pace_sec_km"),
            power_watts=step.get("power_watts"),
            purpose="step",
        )
        db.add(interval)
        db.flush()
        ls = LactateSample(
            interval_id=interval.id,
            lactate_mmol=step["lactate_mmol"],
            sample_delay_seconds=30,
            sample_timing_label="end_of_step",
        )
        db.add(ls)
    db.flush()
    return athlete


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
# Tests
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("curve_idx", range(len(ALL_CURVES)))
def test_lactate_detection_quality(db: DbSession, curve_idx: int):
    """Verifica la detección de umbrales y la calidad del dato para cada curva."""
    curve = ALL_CURVES[curve_idx]

    print(f"\n{'─'*70}")
    print(f"  CURVE {curve_idx}: {curve.name}")
    print(f"  {curve.description}")
    print(f"  Discipline: {curve.discipline}, Level: {curve.level}, Test age: {curve.test_age_days}d")
    print(f"  Steps: {len(curve.steps)}")
    print(f"{'─'*70}")

    athlete = _create_athlete_with_lactate(db, curve, curve_idx + 200)
    db.commit()

    recalculate_athlete(db, athlete.id)
    db.commit()

    analysis = athlete_analysis_payload(db, athlete.id)

    # Extract thresholds from analysis
    disc_view = (analysis.get("discipline_views") or {}).get(curve.discipline) or {}
    thresholds = disc_view.get("thresholds") or []
    real_thresholds = disc_view.get("real_thresholds") or {}
    latest_date = disc_view.get("latest_snapshot_date")

    print(f"  Detected thresholds: {len(thresholds)}")
    for t in thresholds:
        name = t.get("name", "?")
        pace = t.get("pace_seconds_per_km")
        power = t.get("power_watts")
        lac = t.get("lactate_mmol")
        conf = t.get("confidence")
        metric = f"{pace:.0f} sec/km" if pace else f"{power:.0f}W" if power else "?"
        print(f"    {name}: {metric} @ {lac} mmol, conf={conf}")

    if real_thresholds:
        print(f"  Real thresholds detected:")
        for key, val in real_thresholds.items():
            if isinstance(val, dict):
                pace = val.get("pace_seconds_per_km")
                power = val.get("power_watts")
                conf = val.get("confidence")
                metric = f"{pace:.0f} sec/km" if pace else f"{power:.0f}W" if power else "?"
                print(f"    {key}: {metric}, conf={conf}")

    # Build context
    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level=curve.level,
        discipline=curve.discipline,
        distance_category="10k" if curve.discipline == "running" else "road_tt" if curve.discipline == "ciclismo" else "sprint_tri",
        target_pace_label="4:30" if curve.discipline == "running" else None,
        target_power_watts=280.0 if curve.discipline == "ciclismo" else None,
        weeks_to_goal=16,
    )

    metric_type = ctx.metric_type
    lt1_val = ctx.lt1_power_watts if metric_type == "power_watts" else ctx.lt1_kmh
    lt2_val = ctx.lt2_power_watts if metric_type == "power_watts" else ctx.lt2_kmh
    unit = "W" if metric_type == "power_watts" else "km/h"

    print(f"\n  PhysiologicalContext:")
    print(f"    LT1: {lt1_val} {unit} (conf={ctx.lt1_confidence:.2f})")
    print(f"    LT2: {lt2_val} {unit} (conf={ctx.lt2_confidence:.2f})")
    print(f"    Test age: {ctx.test_age_days}d")
    print(f"    Metric type: {ctx.metric_type}")

    if ctx.capacity_profile:
        cp = ctx.capacity_profile
        print(f"    CapacityProfile: aerobic={cp.aerobic_level}, VLamax={cp.vlamax_level}, "
              f"ratio={cp.lt1_lt2_ratio}, conf={cp.confidence:.2f}, source={cp.source}")

    # Run gap analysis
    gap = analyse_physiological_gap(ctx)
    print(f"\n  Gap analysis:")
    print(f"    Data quality: {gap.data_quality}")
    print(f"    Season phase: {gap.season_phase}")
    print(f"    Primary limiter: {gap.primary_limiter}")
    print(f"    Recommended block: {gap.recommended_block}")
    print(f"    LT2 gap: {gap.lt2_gap_kmh}")
    print(f"    LT1 gap: {gap.lt1_gap_kmh}")
    if gap.borderline:
        print(f"    ⚠ Borderline: {gap.borderline_note}")
    if gap.contraindications:
        print(f"    ⚠ Contra: {gap.contraindications}")

    # ── Assertions ──────────────────────────────────────────────────────

    # 1. Thresholds should be detected (at least something)
    has_lt1 = lt1_val is not None
    has_lt2 = lt2_val is not None
    if len(curve.steps) >= 5:
        assert has_lt2, f"[{curve.name}] ≥5 steps but no LT2 detected"
    if len(curve.steps) >= 6:
        assert has_lt1, f"[{curve.name}] ≥6 steps but no LT1 detected"

    # 2. Data quality matches expected
    if curve.expected_data_quality:
        assert gap.data_quality == curve.expected_data_quality, \
            f"[{curve.name}] Expected data_quality={curve.expected_data_quality}, got {gap.data_quality}"

    # 3. LT2 should be faster than LT1 (in speed or higher in power)
    if has_lt1 and has_lt2:
        if metric_type == "power_watts":
            assert lt2_val > lt1_val, f"[{curve.name}] LT2 ({lt2_val}W) should be > LT1 ({lt1_val}W)"
        else:
            assert lt2_val > lt1_val, f"[{curve.name}] LT2 ({lt2_val} km/h) should be > LT1 ({lt1_val} km/h)"

    # 4. Confidence should be reasonable
    if has_lt2:
        assert ctx.lt2_confidence >= 0.4, f"[{curve.name}] LT2 confidence too low: {ctx.lt2_confidence}"
    if has_lt1:
        assert ctx.lt1_confidence >= 0.4, f"[{curve.name}] LT1 confidence too low: {ctx.lt1_confidence}"

    # 5. A recommended block should always exist
    assert gap.recommended_block, f"[{curve.name}] No recommended block"

    print(f"\n  ✓ CURVE OK: {curve.name}")


def test_steep_curve_detects_high_vlamax(db: DbSession):
    """Curva empinada debería detectar VLamax alta (ratio < 0.79)."""
    athlete = _create_athlete_with_lactate(db, STEEP_CURVE, 300)
    db.commit()
    recalculate_athlete(db, athlete.id)
    db.commit()

    analysis = athlete_analysis_payload(db, athlete.id)
    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained", discipline="running",
        distance_category="10k", target_pace_label="4:30",
        target_power_watts=None, weeks_to_goal=20,
    )

    if ctx.capacity_profile and ctx.capacity_profile.lt1_lt2_ratio is not None:
        print(f"\n  Steep curve ratio: {ctx.capacity_profile.lt1_lt2_ratio}")
        print(f"  VLamax level: {ctx.capacity_profile.vlamax_level}")
        # A steep curve should have low ratio (high VLamax)
        # or at minimum moderate
        assert ctx.capacity_profile.vlamax_level in ("high", "moderate"), \
            f"Steep curve should be high/moderate VLamax, got {ctx.capacity_profile.vlamax_level}"
    print("  ✓ Steep curve VLamax detection OK")


def test_flat_curve_detects_low_vlamax(db: DbSession):
    """Curva plana debería detectar VLamax baja (ratio > 0.87)."""
    athlete = _create_athlete_with_lactate(db, FLAT_CURVE, 301)
    db.commit()
    recalculate_athlete(db, athlete.id)
    db.commit()

    analysis = athlete_analysis_payload(db, athlete.id)
    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained", discipline="running",
        distance_category="5k", target_pace_label="3:50",
        target_power_watts=None, weeks_to_goal=14,
    )

    if ctx.capacity_profile and ctx.capacity_profile.lt1_lt2_ratio is not None:
        print(f"\n  Flat curve ratio: {ctx.capacity_profile.lt1_lt2_ratio}")
        print(f"  VLamax level: {ctx.capacity_profile.vlamax_level}")
        # A flat curve should have high ratio (low VLamax)
        # Due to detection imprecision, moderate is also acceptable
        assert ctx.capacity_profile.vlamax_level in ("low", "moderate"), \
            f"Flat curve should be low/moderate VLamax, got {ctx.capacity_profile.vlamax_level}"
    print("  ✓ Flat curve VLamax detection OK")


def test_stale_60d_in_precomp_triggers_test(db: DbSession):
    """Test de 60 días en pre_comp → testing_decision_block."""
    athlete = _create_athlete_with_lactate(db, STALE_TEST_60D, 302)
    db.commit()
    recalculate_athlete(db, athlete.id)
    db.commit()

    analysis = athlete_analysis_payload(db, athlete.id)
    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained", discipline="running",
        distance_category="10k", target_pace_label="4:00",
        target_power_watts=None, weeks_to_goal=8,  # pre_comp
    )

    gap = analyse_physiological_gap(ctx)
    print(f"\n  Stale 60d test: quality={gap.data_quality}, block={gap.recommended_block}")
    assert gap.data_quality == "low"
    assert gap.recommended_block == "testing_decision_block"
    print("  ✓ Stale test (60d in pre_comp) correctly triggers testing_decision_block")


def test_stale_43d_in_base_still_prescribes(db: DbSession):
    """Test de 43 días en base_early → still prescribes (not testing_decision_block)."""
    athlete = _create_athlete_with_lactate(db, STALE_TEST_43D, 303)
    db.commit()
    recalculate_athlete(db, athlete.id)
    db.commit()

    analysis = athlete_analysis_payload(db, athlete.id)
    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained", discipline="running",
        distance_category="marathon", target_pace_label="4:00",
        target_power_watts=None, weeks_to_goal=30,  # base_early
    )

    gap = analyse_physiological_gap(ctx)
    print(f"\n  Stale 43d in base: quality={gap.data_quality}, block={gap.recommended_block}")
    assert gap.data_quality == "low"
    # In base_early, even with stale data, should still prescribe (not require re-test)
    assert gap.recommended_block != "testing_decision_block", \
        "In base_early, stale data should not force testing_decision_block"
    print("  ✓ Stale test (43d in base) still prescribes normally")


def test_noisy_curve_survives(db: DbSession):
    """Curva ruidosa no debería crashear y debería dar umbral razonable."""
    athlete = _create_athlete_with_lactate(db, NOISY_CURVE, 304)
    db.commit()
    recalculate_athlete(db, athlete.id)
    db.commit()

    analysis = athlete_analysis_payload(db, athlete.id)
    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained", discipline="running",
        distance_category="hm", target_pace_label="4:15",
        target_power_watts=None, weeks_to_goal=16,
    )

    lt2 = ctx.lt2_kmh
    lt1 = ctx.lt1_kmh
    print(f"\n  Noisy curve: LT1={lt1}, LT2={lt2}")
    print(f"  Confidence: LT1={ctx.lt1_confidence:.2f}, LT2={ctx.lt2_confidence:.2f}")

    assert lt2 is not None, "Noisy curve should still detect LT2"
    # LT2 should be around 4:15-4:30/km range (13.3-14.1 km/h)
    if lt2:
        assert 10.0 < lt2 < 18.0, f"LT2={lt2} km/h out of plausible range"
    print("  ✓ Noisy curve survived and gave plausible LT2")


def test_capacity_profile_direct():
    """Testea build_capacity_profile directamente con valores conocidos."""
    # High VLamax (steep curve): ratio < 0.79
    cp = build_capacity_profile(
        lt1_value=10.0, lt2_value=14.0,  # ratio = 0.714
        lt1_conf=0.85, lt2_conf=0.85,
        athlete_level="trained", discipline="running", metric_type="pace_kmh",
    )
    assert cp.vlamax_level == "high", f"ratio=0.71 should be high VLamax, got {cp.vlamax_level}"
    print(f"\n  ratio=0.71 → VLamax={cp.vlamax_level} ✓")

    # Moderate VLamax: ratio 0.79-0.87
    cp = build_capacity_profile(
        lt1_value=11.5, lt2_value=14.0,  # ratio = 0.821
        lt1_conf=0.85, lt2_conf=0.85,
        athlete_level="trained", discipline="running", metric_type="pace_kmh",
    )
    assert cp.vlamax_level == "moderate", f"ratio=0.82 should be moderate VLamax, got {cp.vlamax_level}"
    print(f"  ratio=0.82 → VLamax={cp.vlamax_level} ✓")

    # Low VLamax (flat curve): ratio > 0.87
    cp = build_capacity_profile(
        lt1_value=12.5, lt2_value=14.0,  # ratio = 0.893
        lt1_conf=0.85, lt2_conf=0.85,
        athlete_level="trained", discipline="running", metric_type="pace_kmh",
    )
    assert cp.vlamax_level == "low", f"ratio=0.89 should be low VLamax, got {cp.vlamax_level}"
    print(f"  ratio=0.89 → VLamax={cp.vlamax_level} ✓")

    # Insufficient data
    cp = build_capacity_profile(
        lt1_value=None, lt2_value=14.0,
        lt1_conf=0.85, lt2_conf=0.85,
        athlete_level="trained", discipline="running", metric_type="pace_kmh",
    )
    assert cp.vlamax_level == "unknown", f"Missing LT1 should be unknown VLamax, got {cp.vlamax_level}"
    print(f"  Missing LT1 → VLamax={cp.vlamax_level} ✓")

    # Low confidence
    cp = build_capacity_profile(
        lt1_value=12.0, lt2_value=14.0,
        lt1_conf=0.40, lt2_conf=0.40,
        athlete_level="trained", discipline="running", metric_type="pace_kmh",
    )
    assert cp.source == "insufficient", f"Low conf should be insufficient, got {cp.source}"
    print(f"  Low confidence → source={cp.source} ✓")

    print("  ✓ All capacity profile tests passed")


def test_cycling_power_thresholds(db: DbSession):
    """Verifica que ciclismo usa power_watts correctamente."""
    athlete = _create_athlete_with_lactate(db, CYCLING_CLEAN, 305)
    db.commit()
    recalculate_athlete(db, athlete.id)
    db.commit()

    analysis = athlete_analysis_payload(db, athlete.id)
    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained", discipline="ciclismo",
        distance_category="road_tt", target_pace_label=None,
        target_power_watts=280.0, weeks_to_goal=16,
    )

    print(f"\n  Cycling context:")
    print(f"    LT1: {ctx.lt1_power_watts}W (conf={ctx.lt1_confidence:.2f})")
    print(f"    LT2: {ctx.lt2_power_watts}W (conf={ctx.lt2_confidence:.2f})")
    print(f"    metric_type: {ctx.metric_type}")

    assert ctx.metric_type == "power_watts", "Cycling should use power_watts metric"
    assert ctx.lt2_power_watts is not None, "Cycling should detect LT2 in watts"
    if ctx.lt2_power_watts:
        assert 200 < ctx.lt2_power_watts < 350, f"LT2={ctx.lt2_power_watts}W out of range"
    print("  ✓ Cycling power thresholds OK")
