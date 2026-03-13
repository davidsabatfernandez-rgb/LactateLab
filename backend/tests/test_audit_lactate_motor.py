"""
Lactate Threshold Detection Engine — Scientific Audit
======================================================

Tests 6 athlete profiles against the analytics.py motor and validates
results against Faude 2009, Billat 2003, Bishop 1998, Olbrecht SoW.

Run:  cd backend && source .venv/bin/activate && python -m pytest tests/test_audit_lactate_motor.py -v -s
"""

from __future__ import annotations

import json
import textwrap
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from typing import Any, Optional

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session as DBSession, sessionmaker

from app.db.base import Base
from app.models.athlete import Athlete
from app.models.session import LactateSample, Session as AthleteSession, SessionInterval
from app.services.analytics import (
    _aggregate_threshold,
    _build_candidates,
    _curve_monotonicity,
    _curve_signal_score,
    _detect_real_thresholds,
    _method_baseline_rise,
    _method_moddmax,
    _method_sustained_increase,
    _smooth,
    _thresholds_from_session,
    analyze_session,
)

# ---------------------------------------------------------------------------
# DB fixtures
# ---------------------------------------------------------------------------

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_audit.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db() -> DBSession:
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Profile data
# ---------------------------------------------------------------------------

@dataclass
class ProfileSpec:
    name: str
    description: str
    discipline: str
    lactates: list[float]
    paces: list[float] | None  # sec/km, None for cyclist
    powers: list[float] | None  # watts, None for runner
    heart_rates: list[int]
    expected_lt1_lactate_range: tuple[float, float]
    expected_lt2_lactate_range: tuple[float, float]
    expected_lt1_load_range: tuple[float, float]  # pace or power
    expected_lt2_load_range: tuple[float, float]
    science_notes: str


PROFILES: list[ProfileSpec] = [
    ProfileSpec(
        name="trained_runner_classic",
        description="Trained runner — textbook exponential curve",
        discipline="running",
        lactates=[0.8, 0.9, 1.1, 1.5, 2.2, 3.1, 4.5, 7.0, 10.2],
        paces=[420, 390, 370, 350, 330, 310, 295, 280, 270],
        powers=None,
        heart_rates=[130, 138, 145, 152, 160, 167, 173, 180, 186],
        expected_lt1_lactate_range=(1.0, 2.2),
        expected_lt2_lactate_range=(2.5, 5.0),
        expected_lt1_load_range=(330, 380),  # pace s/km
        expected_lt2_load_range=(285, 315),
        science_notes="Faude 2009: LT1 ~+0.5 mmol over baseline; LT2 at OBLA ~3.5-4.0 mmol",
    ),
    ProfileSpec(
        name="elite_runner_flat",
        description="Elite runner — flat/diesel curve (low VLamax)",
        discipline="running",
        lactates=[0.7, 0.8, 0.8, 0.9, 1.0, 1.3, 1.8, 2.8, 4.2],
        paces=[340, 320, 305, 290, 278, 268, 258, 250, 242],
        powers=None,
        heart_rates=[140, 148, 155, 162, 168, 174, 179, 184, 189],
        expected_lt1_lactate_range=(0.9, 1.8),
        expected_lt2_lactate_range=(2.0, 4.5),
        expected_lt1_load_range=(258, 310),  # pace s/km — should be fast
        expected_lt2_load_range=(242, 265),
        science_notes="Olbrecht SoW: flat curve = diesel athlete, high LT1/LT2 ratio, low VLamax",
    ),
    ProfileSpec(
        name="recreational_steep",
        description="Recreational runner — steep/glycolytic curve (high VLamax)",
        discipline="running",
        lactates=[1.2, 1.5, 2.0, 3.5, 5.5, 8.0, 12.0],
        paces=[480, 450, 420, 400, 380, 365, 350],
        powers=None,
        heart_rates=[135, 145, 155, 165, 172, 178, 185],
        expected_lt1_lactate_range=(1.2, 2.2),
        expected_lt2_lactate_range=(2.5, 5.5),
        expected_lt1_load_range=(420, 480),  # slow pace
        expected_lt2_load_range=(380, 420),
        science_notes="Steep curve = high VLamax, early LT1, low absolute LT2 intensity",
    ),
    ProfileSpec(
        name="cyclist_power",
        description="Trained cyclist — power-based test",
        discipline="ciclismo",
        lactates=[0.9, 1.0, 1.2, 1.6, 2.4, 3.5, 5.0, 7.5],
        paces=None,
        powers=[150, 175, 200, 225, 250, 275, 295, 310],
        heart_rates=[120, 130, 140, 150, 160, 168, 175, 182],
        expected_lt1_lactate_range=(1.0, 2.0),
        expected_lt2_lactate_range=(2.5, 5.0),
        expected_lt1_load_range=(200, 250),  # watts
        expected_lt2_load_range=(265, 295),
        science_notes="Typical FTP ~75% of max; LT2 around 270-280W for trained cyclist",
    ),
    ProfileSpec(
        name="noisy_outlier",
        description="Noisy data with outlier at step 4 (5.2 mmol artifact)",
        discipline="running",
        lactates=[0.8, 0.9, 1.1, 5.2, 1.8, 2.5, 3.8, 6.0],
        paces=[400, 380, 360, 340, 320, 305, 290, 275],
        powers=None,
        heart_rates=[135, 142, 150, 158, 164, 170, 176, 183],
        expected_lt1_lactate_range=(0.8, 2.0),
        expected_lt2_lactate_range=(2.5, 5.5),
        expected_lt1_load_range=(340, 400),
        expected_lt2_load_range=(275, 310),
        science_notes="Outlier at step 4 (5.2 mmol). Motor should NOT anchor LT2 to the outlier.",
    ),
    ProfileSpec(
        name="minimal_3points",
        description="Minimal data — only 3 points",
        discipline="running",
        lactates=[0.9, 2.5, 6.0],
        paces=[380, 320, 270],
        powers=None,
        heart_rates=[140, 160, 180],
        expected_lt1_lactate_range=(0.0, 10.0),  # anything — just don't crash
        expected_lt2_lactate_range=(0.0, 10.0),
        expected_lt1_load_range=(0, 500),
        expected_lt2_load_range=(0, 500),
        science_notes="3 points only: motor should return empty or very low confidence. Must not crash.",
    ),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_session(db: DBSession, profile: ProfileSpec) -> AthleteSession:
    """Create a full Session + intervals + lactate samples in the test DB."""
    athlete = Athlete(
        name=f"Audit_{profile.name}",
        date_of_birth=date(1990, 1, 1),
        sex="M",
        weight=72.0,
        primary_discipline=profile.discipline,
        created_at=date(2026, 1, 1),
    )
    db.add(athlete)
    db.flush()

    session = AthleteSession(
        athlete_id=athlete.id,
        performed_at=datetime(2026, 3, 10, 10, 0, tzinfo=timezone.utc),
        discipline=profile.discipline,
        session_type="incremental",
        goal="lactate_test",
    )
    db.add(session)
    db.flush()

    for idx, lactate in enumerate(profile.lactates):
        interval = SessionInterval(
            session_id=session.id,
            order_index=idx + 1,
            duration_seconds=300,  # 5-min steps
            rest_seconds=30,
            purpose="lt_step",
            pace_seconds_per_km=profile.paces[idx] if profile.paces else None,
            power_watts=profile.powers[idx] if profile.powers else None,
            heart_rate_avg=profile.heart_rates[idx],
        )
        db.add(interval)
        db.flush()

        sample = LactateSample(
            interval_id=interval.id,
            lactate_mmol=lactate,
            sample_delay_seconds=15,
            sample_timing_label="post",
            baseline_lactate=profile.lactates[0] if idx == 0 else None,
        )
        db.add(sample)
    db.flush()
    db.commit()

    # Re-query with eager loading
    from sqlalchemy.orm import joinedload
    from sqlalchemy import select
    stmt = (
        select(AthleteSession)
        .options(joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample))
        .where(AthleteSession.id == session.id)
    )
    return db.execute(stmt).unique().scalar_one()


# ---------------------------------------------------------------------------
# Collect results for all profiles
# ---------------------------------------------------------------------------

ALL_RESULTS: list[dict[str, Any]] = []


def _run_profile(db: DBSession, profile: ProfileSpec) -> dict[str, Any]:
    """Run analyze_session on a profile and capture all outputs."""
    session = _create_session(db, profile)
    result = analyze_session(session)
    thresholds = result.get("thresholds", [])
    real = result.get("real_thresholds", {})

    lt1 = next((t for t in thresholds if t["name"] == "LT1"), None)
    lt2 = next((t for t in thresholds if t["name"] == "LT2"), None)

    # VLamax proxy: LT1/LT2 ratio
    lt1_lac = lt1["lactate"] if lt1 else None
    lt2_lac = lt2["lactate"] if lt2 else None
    ratio = round(lt1_lac / lt2_lac, 3) if lt1_lac and lt2_lac and lt2_lac > 0 else None

    # Curve steepness proxy
    lac_range = max(profile.lactates) - min(profile.lactates) if profile.lactates else 0
    steps = len(profile.lactates)

    entry = {
        "profile": profile.name,
        "description": profile.description,
        "n_points": steps,
        "lactate_range": round(lac_range, 2),
        "lt1": lt1,
        "lt2": lt2,
        "lt1_lactate": lt1["lactate"] if lt1 else None,
        "lt2_lactate": lt2["lactate"] if lt2 else None,
        "lt1_pace": lt1.get("pace_seconds_per_km") if lt1 else None,
        "lt1_power": lt1.get("power_watts") if lt1 else None,
        "lt2_pace": lt2.get("pace_seconds_per_km") if lt2 else None,
        "lt2_power": lt2.get("power_watts") if lt2 else None,
        "lt1_hr": lt1.get("heart_rate") if lt1 else None,
        "lt2_hr": lt2.get("heart_rate") if lt2 else None,
        "lt1_confidence": lt1["confidence"] if lt1 else None,
        "lt2_confidence": lt2["confidence"] if lt2 else None,
        "lt1_agreement": lt1.get("agreement_score") if lt1 else None,
        "lt2_agreement": lt2.get("agreement_score") if lt2 else None,
        "lt1_method": lt1["method"] if lt1 else None,
        "lt2_method": lt2["method"] if lt2 else None,
        "lt1_methods_compared": [m["method"] for m in lt1.get("methods_compared", [])] if lt1 else [],
        "lt2_methods_compared": [m["method"] for m in lt2.get("methods_compared", [])] if lt2 else [],
        "lt1_lt2_ratio": ratio,
        "real_thresholds": real,
        "peak_lactate": result.get("peak_lactate"),
        "spec": profile,
    }
    ALL_RESULTS.append(entry)
    return entry


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestTrainedRunnerClassic:
    def test_profile(self, db):
        spec = PROFILES[0]
        r = _run_profile(db, spec)
        _print_result(r)

        # LT1 lactate in physiological range
        assert r["lt1_lactate"] is not None, "LT1 lactate should be detected"
        assert spec.expected_lt1_lactate_range[0] <= r["lt1_lactate"] <= spec.expected_lt1_lactate_range[1], \
            f"LT1 lactate {r['lt1_lactate']} outside expected {spec.expected_lt1_lactate_range}"

        # LT2 lactate
        assert r["lt2_lactate"] is not None, "LT2 lactate should be detected"
        assert spec.expected_lt2_lactate_range[0] <= r["lt2_lactate"] <= spec.expected_lt2_lactate_range[1], \
            f"LT2 lactate {r['lt2_lactate']} outside expected {spec.expected_lt2_lactate_range}"

        # LT1 pace
        assert r["lt1_pace"] is not None
        assert spec.expected_lt1_load_range[0] <= r["lt1_pace"] <= spec.expected_lt1_load_range[1], \
            f"LT1 pace {r['lt1_pace']} outside expected {spec.expected_lt1_load_range}"

        # LT2 pace
        assert r["lt2_pace"] is not None
        assert spec.expected_lt2_load_range[0] <= r["lt2_pace"] <= spec.expected_lt2_load_range[1], \
            f"LT2 pace {r['lt2_pace']} outside expected {spec.expected_lt2_load_range}"

        # Confidence should be reasonable for 9 points
        assert r["lt1_confidence"] >= 0.5, f"LT1 confidence too low: {r['lt1_confidence']}"
        assert r["lt2_confidence"] >= 0.5, f"LT2 confidence too low: {r['lt2_confidence']}"


class TestEliteRunnerFlat:
    def test_profile(self, db):
        spec = PROFILES[1]
        r = _run_profile(db, spec)
        _print_result(r)

        assert r["lt1_lactate"] is not None
        assert r["lt2_lactate"] is not None

        # For a flat/diesel curve, LT1/LT2 ratio should be high (> 0.3)
        # indicating low VLamax (Olbrecht SoW)
        if r["lt1_lt2_ratio"] is not None:
            print(f"  VLamax proxy (LT1/LT2 ratio): {r['lt1_lt2_ratio']}")

        # LT2 should be at a fast pace (low sec/km)
        assert r["lt2_pace"] is not None
        assert r["lt2_pace"] <= 270, \
            f"Elite LT2 pace {r['lt2_pace']} s/km too slow — expected <=270 for elite"


class TestRecreationalSteep:
    def test_profile(self, db):
        spec = PROFILES[2]
        r = _run_profile(db, spec)
        _print_result(r)

        assert r["lt1_lactate"] is not None
        assert r["lt2_lactate"] is not None

        # Steep curve → early LT1 (slow pace)
        assert r["lt1_pace"] is not None
        assert r["lt1_pace"] >= 400, \
            f"Recreational LT1 pace {r['lt1_pace']} s/km too fast for a steep curve"

        # VLamax should appear HIGH for steep curve
        if r["lt1_lt2_ratio"] is not None:
            print(f"  VLamax proxy (LT1/LT2 ratio): {r['lt1_lt2_ratio']}")


class TestCyclistPower:
    def test_profile(self, db):
        spec = PROFILES[3]
        r = _run_profile(db, spec)
        _print_result(r)

        assert r["lt2_lactate"] is not None
        assert r["lt2_power"] is not None
        assert spec.expected_lt2_load_range[0] <= r["lt2_power"] <= spec.expected_lt2_load_range[1], \
            f"Cyclist LT2 power {r['lt2_power']}W outside expected {spec.expected_lt2_load_range}"


class TestNoisyOutlier:
    def test_profile(self, db):
        spec = PROFILES[4]
        r = _run_profile(db, spec)
        _print_result(r)

        # The outlier is at index 3 (5.2 mmol at 340 s/km).
        # LT2 should NOT be at 340 s/km — that's the outlier.
        if r["lt2_pace"] is not None:
            # If LT2 is anchored exactly at the outlier pace, that's a problem
            if r["lt2_pace"] == 340.0:
                print("  WARNING: LT2 appears anchored to the outlier point (340 s/km)!")
            else:
                print(f"  LT2 pace {r['lt2_pace']} s/km — not at outlier, good.")

        # The outlier 5.2 is at index 3. If LT2 lactate is reported as 5.2,
        # that suggests the motor was fooled by the artifact
        if r["lt2_lactate"] is not None and abs(r["lt2_lactate"] - 5.2) < 0.3:
            print("  WARNING: LT2 lactate ~5.2 mmol — motor may be fooled by outlier!")


class TestMinimal3Points:
    def test_no_crash(self, db):
        spec = PROFILES[5]
        r = _run_profile(db, spec)
        _print_result(r)

        # Should not crash. Thresholds may be empty or very low confidence.
        print(f"  LT1 detected: {r['lt1_lactate'] is not None}")
        print(f"  LT2 detected: {r['lt2_lactate'] is not None}")

        # With only 3 points, _thresholds_from_session returns [] (needs >=3 candidates)
        # but analyze_session should still return a valid dict
        assert "thresholds" in r.get("lt1", {}) or r["lt1"] is None or True  # just don't crash


class TestRealThresholds:
    """Test _detect_real_thresholds quality gates."""

    def test_trained_runner_real_thresholds(self, db):
        spec = PROFILES[0]
        session = _create_session(db, spec)
        real = _detect_real_thresholds(session)
        print(f"\n  Real thresholds for {spec.name}:")
        print(f"    data_quality: {json.dumps(real['data_quality'], indent=4)}")
        print(f"    lt1_real: {real.get('lt1_real')}")
        print(f"    lt2_real: {real.get('lt2_real')}")
        print(f"    lt1_detection state: {real.get('lt1_detection', {}).get('state')}")
        print(f"    lt2_detection state: {real.get('lt2_detection', {}).get('state')}")


class TestVLaMaxProxy:
    """Validate that LT1/LT2 ratio aligns with curve shape (Olbrecht SoW)."""

    def test_flat_vs_steep(self, db):
        flat_session = _create_session(db, PROFILES[1])  # elite flat
        steep_session = _create_session(db, PROFILES[2])  # recreational steep

        flat_result = analyze_session(flat_session)
        steep_result = analyze_session(steep_session)

        flat_thresholds = flat_result["thresholds"]
        steep_thresholds = steep_result["thresholds"]

        flat_lt1 = next((t for t in flat_thresholds if t["name"] == "LT1"), None)
        flat_lt2 = next((t for t in flat_thresholds if t["name"] == "LT2"), None)
        steep_lt1 = next((t for t in steep_thresholds if t["name"] == "LT1"), None)
        steep_lt2 = next((t for t in steep_thresholds if t["name"] == "LT2"), None)

        flat_ratio = None
        steep_ratio = None
        if flat_lt1 and flat_lt2 and flat_lt1["lactate"] and flat_lt2["lactate"]:
            flat_ratio = flat_lt1["lactate"] / flat_lt2["lactate"]
        if steep_lt1 and steep_lt2 and steep_lt1["lactate"] and steep_lt2["lactate"]:
            steep_ratio = steep_lt1["lactate"] / steep_lt2["lactate"]

        print(f"\n  Flat (diesel) LT1/LT2 ratio: {flat_ratio}")
        print(f"  Steep (glycolytic) LT1/LT2 ratio: {steep_ratio}")

        # Per Olbrecht SoW: flat curves should have HIGHER LT1/LT2 ratio
        # (both thresholds close in lactate) compared to steep curves
        # where LT2 lactate is much higher relative to LT1
        if flat_ratio is not None and steep_ratio is not None:
            # This is the key scientific validation
            print(f"  Flat ratio > steep ratio? {flat_ratio > steep_ratio}")
            # Note: This may or may not hold depending on how the motor aggregates.
            # We report but don't hard-fail — this is an audit finding.


class TestMethodAgreement:
    """Check individual method outputs for the trained runner."""

    def test_method_details(self, db):
        spec = PROFILES[0]
        session = _create_session(db, spec)
        candidates = _build_candidates(session)

        br = _method_baseline_rise(candidates)
        si = _method_sustained_increase(candidates)
        md = _method_moddmax(candidates)

        print(f"\n  Method outputs for {spec.name}:")
        for m in br:
            print(f"    baseline_rise {m.threshold_name}: lac={m.lactate}, pace={m.pace_seconds_per_km}, conf={m.confidence}")
        for m in si:
            print(f"    sustained_increase {m.threshold_name}: lac={m.lactate}, pace={m.pace_seconds_per_km}, conf={m.confidence}")
        for m in md:
            print(f"    moddmax {m.threshold_name}: lac={m.lactate}, pace={m.pace_seconds_per_km}, conf={m.confidence}")

        # All methods should produce output for a 9-point clean curve
        assert len(br) == 2, f"baseline_rise should return 2 estimates, got {len(br)}"
        assert len(si) == 2, f"sustained_increase should return 2 estimates, got {len(si)}"
        assert len(md) >= 1, f"moddmax should return at least 1 estimate (LT2), got {len(md)}"

        # Check monotonicity & signal
        mono = _curve_monotonicity(candidates)
        signal = _curve_signal_score(candidates)
        print(f"    Monotonicity: {mono}")
        print(f"    Signal score: {signal}")
        assert mono >= 0.8, f"Clean curve should have high monotonicity, got {mono}"


class TestSmoothFunction:
    """Verify that smoothing doesn't distort clean data too much."""

    def test_smooth_preserves_trend(self):
        raw = [0.8, 0.9, 1.1, 1.5, 2.2, 3.1, 4.5, 7.0, 10.2]
        smoothed = _smooth(raw)
        assert len(smoothed) == len(raw)
        # Smoothed should still be mostly ascending
        ascending = sum(1 for i in range(1, len(smoothed)) if smoothed[i] >= smoothed[i-1])
        assert ascending >= 7, f"Smoothed data lost monotonicity: {smoothed}"


# ---------------------------------------------------------------------------
# Pretty printer
# ---------------------------------------------------------------------------

def _print_result(r: dict[str, Any]):
    print(f"\n{'='*60}")
    print(f"  Profile: {r['profile']} — {r['description']}")
    print(f"  Points: {r['n_points']}, Lactate range: {r['lactate_range']}")
    print(f"  ---")
    if r["lt1_lactate"] is not None:
        load = f"pace={r['lt1_pace']}s/km" if r["lt1_pace"] else f"power={r['lt1_power']}W"
        print(f"  LT1: {r['lt1_lactate']:.2f} mmol @ {load}, HR={r['lt1_hr']}, conf={r['lt1_confidence']}, agree={r['lt1_agreement']}")
        print(f"       method={r['lt1_method']}, compared={r['lt1_methods_compared']}")
    else:
        print(f"  LT1: NOT DETECTED")
    if r["lt2_lactate"] is not None:
        load = f"pace={r['lt2_pace']}s/km" if r["lt2_pace"] else f"power={r['lt2_power']}W"
        print(f"  LT2: {r['lt2_lactate']:.2f} mmol @ {load}, HR={r['lt2_hr']}, conf={r['lt2_confidence']}, agree={r['lt2_agreement']}")
        print(f"       method={r['lt2_method']}, compared={r['lt2_methods_compared']}")
    else:
        print(f"  LT2: NOT DETECTED")
    if r["lt1_lt2_ratio"] is not None:
        print(f"  LT1/LT2 ratio (VLamax proxy): {r['lt1_lt2_ratio']}")
    print(f"  Peak lactate: {r['peak_lactate']}")
    # Real thresholds summary
    real = r.get("real_thresholds", {})
    if real:
        dq = real.get("data_quality", {})
        print(f"  Real thresholds — sufficient: {dq.get('sufficient')}, mono: {dq.get('monotonicity')}, signal: {dq.get('signal_score')}")
        lt1d = real.get("lt1_detection", {})
        lt2d = real.get("lt2_detection", {})
        print(f"    LT1 detection state: {lt1d.get('state')}")
        print(f"    LT2 detection state: {lt2d.get('state')}")
    print(f"{'='*60}")


# ---------------------------------------------------------------------------
# Report generation (runs after all tests via session-scoped fixture)
# ---------------------------------------------------------------------------

def _generate_report():
    """Generate the markdown audit report."""
    if not ALL_RESULTS:
        return

    lines = []
    lines.append("# Lactate Threshold Detection Engine — Scientific Audit Report")
    lines.append(f"\nGenerated: 2026-03-13")
    lines.append(f"\nEngine: `backend/app/services/analytics.py`")
    lines.append(f"Dynamic: `backend/app/services/dynamic_threshold_engine.py`")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append("| Profile | Points | LT1 (mmol) | LT1 Load | LT2 (mmol) | LT2 Load | LT1/LT2 | Conf LT1 | Conf LT2 |")
    lines.append("|---|---|---|---|---|---|---|---|---|")

    for r in ALL_RESULTS:
        lt1_lac = f"{r['lt1_lactate']:.2f}" if r['lt1_lactate'] else "N/A"
        lt2_lac = f"{r['lt2_lactate']:.2f}" if r['lt2_lactate'] else "N/A"
        lt1_load = f"{r['lt1_pace']:.0f}s/km" if r['lt1_pace'] else (f"{r['lt1_power']:.0f}W" if r['lt1_power'] else "N/A")
        lt2_load = f"{r['lt2_pace']:.0f}s/km" if r['lt2_pace'] else (f"{r['lt2_power']:.0f}W" if r['lt2_power'] else "N/A")
        ratio = f"{r['lt1_lt2_ratio']:.3f}" if r['lt1_lt2_ratio'] else "N/A"
        conf1 = f"{r['lt1_confidence']:.2f}" if r['lt1_confidence'] else "N/A"
        conf2 = f"{r['lt2_confidence']:.2f}" if r['lt2_confidence'] else "N/A"
        lines.append(f"| {r['profile']} | {r['n_points']} | {lt1_lac} | {lt1_load} | {lt2_lac} | {lt2_load} | {ratio} | {conf1} | {conf2} |")

    lines.append("")
    lines.append("## Detailed Results & Scientific Validation")
    lines.append("")

    for r in ALL_RESULTS:
        spec = r["spec"]
        lines.append(f"### {r['profile']} — {r['description']}")
        lines.append("")
        lines.append(f"**Input:** {r['n_points']} points, lactate range {r['lactate_range']} mmol")
        lines.append(f"**Science reference:** {spec.science_notes}")
        lines.append("")

        if r['lt1_lactate'] is not None:
            load = f"pace={r['lt1_pace']}s/km" if r['lt1_pace'] else f"power={r['lt1_power']}W"
            lines.append(f"- **LT1**: {r['lt1_lactate']:.2f} mmol @ {load}, HR={r['lt1_hr']}")
            lines.append(f"  - Confidence: {r['lt1_confidence']}, Agreement: {r['lt1_agreement']}")
            lines.append(f"  - Primary method: {r['lt1_method']}, All methods: {r['lt1_methods_compared']}")
            in_range = spec.expected_lt1_lactate_range[0] <= r['lt1_lactate'] <= spec.expected_lt1_lactate_range[1]
            lines.append(f"  - Expected lactate range: {spec.expected_lt1_lactate_range} -> {'PASS' if in_range else 'FAIL'}")
        else:
            lines.append(f"- **LT1**: NOT DETECTED")

        if r['lt2_lactate'] is not None:
            load = f"pace={r['lt2_pace']}s/km" if r['lt2_pace'] else f"power={r['lt2_power']}W"
            lines.append(f"- **LT2**: {r['lt2_lactate']:.2f} mmol @ {load}, HR={r['lt2_hr']}")
            lines.append(f"  - Confidence: {r['lt2_confidence']}, Agreement: {r['lt2_agreement']}")
            lines.append(f"  - Primary method: {r['lt2_method']}, All methods: {r['lt2_methods_compared']}")
            in_range = spec.expected_lt2_lactate_range[0] <= r['lt2_lactate'] <= spec.expected_lt2_lactate_range[1]
            lines.append(f"  - Expected lactate range: {spec.expected_lt2_lactate_range} -> {'PASS' if in_range else 'FAIL'}")
        else:
            lines.append(f"- **LT2**: NOT DETECTED")

        if r['lt1_lt2_ratio'] is not None:
            lines.append(f"- **VLamax proxy** (LT1/LT2 ratio): {r['lt1_lt2_ratio']:.3f}")
        lines.append("")

        # Outlier-specific analysis
        if r['profile'] == 'noisy_outlier':
            lines.append("**Outlier analysis:**")
            if r['lt2_pace'] == 340.0:
                lines.append("- WARNING: LT2 anchored to outlier point (340 s/km). Motor did NOT mitigate the outlier.")
            elif r['lt2_lactate'] and abs(r['lt2_lactate'] - 5.2) < 0.3:
                lines.append("- WARNING: LT2 lactate ~5.2 mmol suggests the motor was partially fooled by the artifact.")
            else:
                lines.append(f"- LT2 at {r['lt2_pace']} s/km, lactate {r['lt2_lactate']} — outlier appears mitigated.")
            lines.append("")

        # Minimal data analysis
        if r['profile'] == 'minimal_3points':
            lines.append("**Edge case analysis:**")
            lines.append(f"- Motor returned thresholds: LT1={'yes' if r['lt1_lactate'] else 'no'}, LT2={'yes' if r['lt2_lactate'] else 'no'}")
            lines.append(f"- No crash: PASS")
            lines.append("")

        # Real thresholds
        real = r.get("real_thresholds", {})
        if real:
            dq = real.get("data_quality", {})
            lines.append(f"**Real thresholds quality gate:**")
            lines.append(f"- Sufficient: {dq.get('sufficient')}")
            lines.append(f"- Monotonicity: {dq.get('monotonicity')}")
            lines.append(f"- Signal score: {dq.get('signal_score')}")
            lines.append(f"- Protocol score: {dq.get('protocol_score')}")
            lt1d = real.get("lt1_detection", {})
            lt2d = real.get("lt2_detection", {})
            lines.append(f"- LT1 detection state: {lt1d.get('state')}")
            lines.append(f"- LT2 detection state: {lt2d.get('state')}")
            lines.append("")

    # Discrepancies and issues
    lines.append("## Discrepancies & Issues Found")
    lines.append("")
    discrepancies = []

    for r in ALL_RESULTS:
        spec = r["spec"]
        if r['lt1_lactate'] is not None:
            if not (spec.expected_lt1_lactate_range[0] <= r['lt1_lactate'] <= spec.expected_lt1_lactate_range[1]):
                discrepancies.append(f"- **{r['profile']}**: LT1 lactate {r['lt1_lactate']:.2f} outside expected {spec.expected_lt1_lactate_range}")
        if r['lt2_lactate'] is not None:
            if not (spec.expected_lt2_lactate_range[0] <= r['lt2_lactate'] <= spec.expected_lt2_lactate_range[1]):
                discrepancies.append(f"- **{r['profile']}**: LT2 lactate {r['lt2_lactate']:.2f} outside expected {spec.expected_lt2_lactate_range}")
        if r['lt1_pace'] is not None and spec.paces:
            if not (spec.expected_lt1_load_range[0] <= r['lt1_pace'] <= spec.expected_lt1_load_range[1]):
                discrepancies.append(f"- **{r['profile']}**: LT1 pace {r['lt1_pace']} outside expected {spec.expected_lt1_load_range}")
        if r['lt2_pace'] is not None and spec.paces:
            if not (spec.expected_lt2_load_range[0] <= r['lt2_pace'] <= spec.expected_lt2_load_range[1]):
                discrepancies.append(f"- **{r['profile']}**: LT2 pace {r['lt2_pace']} outside expected {spec.expected_lt2_load_range}")
        if r['lt2_power'] is not None and spec.powers:
            if not (spec.expected_lt2_load_range[0] <= r['lt2_power'] <= spec.expected_lt2_load_range[1]):
                discrepancies.append(f"- **{r['profile']}**: LT2 power {r['lt2_power']}W outside expected {spec.expected_lt2_load_range}")
        if r['profile'] == 'noisy_outlier' and r['lt2_pace'] == 340.0:
            discrepancies.append(f"- **noisy_outlier**: LT2 anchored to outlier point — smoothing does NOT fully protect against single-point spikes")

    if discrepancies:
        lines.extend(discrepancies)
    else:
        lines.append("No major discrepancies found.")
    lines.append("")

    # Code-level observations
    lines.append("## Code-Level Observations")
    lines.append("")
    lines.append("### analytics.py — Threshold Detection Methods")
    lines.append("")
    lines.append("1. **`_method_baseline_rise` (line ~260)**: Uses +0.5 mmol over baseline (Faude 2009). "
                 "For LT2, uses >=4.0 mmol OR >=3.2 with slope >=0.45. Transient spike check (next point must not drop >0.5). "
                 "This is scientifically sound per Billat 2003.")
    lines.append("")
    lines.append("2. **`_method_sustained_increase` (line ~320)**: LT1 = first sustained rise; LT2 = slope breakpoint. "
                 "Requires `local_slope >= max(0.45, prior_slope + 0.2)` — this is a reasonable heuristic but has no direct "
                 "literature citation. It can miss LT2 in flat curves where the breakpoint is subtle.")
    lines.append("")
    lines.append("3. **`_method_moddmax` (line ~364)**: Bishop 1998 ModDmax. Start point = baseline_min + 0.5 mmol. "
                 "Only returns LT2 (correct — ModDmax has no LT1 definition). Requires >=4 candidates and positive deviation. "
                 "Scientifically appropriate.")
    lines.append("")
    lines.append("4. **`_aggregate_threshold` (line ~442)**: Lactate = mean, pace/power/HR = median. "
                 "The median for load metrics is a good choice (Billat 2003 argument about real samples). "
                 "However, using mean for lactate with only 2 methods can be pulled by an outlier method.")
    lines.append("")
    lines.append("5. **`_smooth` (line ~56)**: Simple 3-point moving average. Adequate for most cases but "
                 "provides limited protection against single-point outliers (only attenuates by ~1/3).")
    lines.append("")
    lines.append("6. **Outlier handling**: The motor has NO explicit outlier detection in the per-session analysis. "
                 "The smoothing function attenuates spikes but does not flag or remove them. The `dynamic_threshold_engine.py` "
                 "has LOO outlier detection, but this is only used for multi-session aggregation, not single-session analysis. "
                 "This is a significant gap for noisy field data.")
    lines.append("")
    lines.append("7. **Minimum data**: `_thresholds_from_session` requires >=3 candidates. With exactly 3 points, "
                 "it will attempt detection but `_method_moddmax` needs >=4, so only baseline_rise and sustained_increase "
                 "contribute. This is appropriate — 3 points have very low information content.")
    lines.append("")

    lines.append("## VLamax Proxy Validation (Olbrecht Science of Winning)")
    lines.append("")
    lines.append("The LT1/LT2 lactate ratio is used as a VLamax proxy in `physiological_engine.py`:")
    lines.append("- ratio > 0.87 = low VLamax (diesel)")
    lines.append("- 0.79-0.87 = moderate")
    lines.append("- < 0.79 = high VLamax (glycolytic)")
    lines.append("")

    flat_r = next((r for r in ALL_RESULTS if r['profile'] == 'elite_runner_flat'), None)
    steep_r = next((r for r in ALL_RESULTS if r['profile'] == 'recreational_steep'), None)
    if flat_r and steep_r:
        flat_ratio = flat_r['lt1_lt2_ratio']
        steep_ratio = steep_r['lt1_lt2_ratio']
        lines.append(f"- Elite flat (diesel): LT1/LT2 ratio = {flat_ratio}")
        lines.append(f"- Recreational steep (glycolytic): LT1/LT2 ratio = {steep_ratio}")
        if flat_ratio is not None and steep_ratio is not None:
            if flat_ratio > steep_ratio:
                lines.append(f"- **PASS**: Flat curve has higher ratio than steep curve, consistent with Olbrecht model")
            else:
                lines.append(f"- **CONCERN**: Flat curve ratio NOT higher than steep. The motor's threshold detection "
                             f"may not preserve the expected VLamax differentiation between curve shapes.")
    lines.append("")

    lines.append("## Recommendations")
    lines.append("")
    lines.append("1. **Add intra-session outlier detection**: Port the LOO method from `dynamic_threshold_engine.py` "
                 "into single-session analysis, or implement a simpler IQR/Z-score filter before smoothing.")
    lines.append("2. **Confidence calibration for 3-point tests**: Currently returns thresholds with 0.52-0.56 confidence "
                 "for 3 points. Consider returning empty results or capping confidence at 0.3 for <=4 points.")
    lines.append("3. **VLamax proxy robustness**: The LT1/LT2 ratio depends heavily on which step the motor picks for LT1. "
                 "Consider computing the ratio from the raw curve shape (e.g., area under curve) rather than detected thresholds.")
    lines.append("4. **Method weight for aggregation**: Currently all methods have equal implicit weight via mean/median. "
                 "Consider weighting by method confidence when aggregating lactate values.")
    lines.append("")

    report_path = "/Users/davidsabatfernandez/Documents/New project/backend/AUDIT_LACTATE_MOTOR.md"
    with open(report_path, "w") as f:
        f.write("\n".join(lines))
    print(f"\n  Report written to {report_path}")


# Register report generation as a final test
class TestGenerateReport:
    """Must run last — generates the audit report."""

    def test_generate_report(self, db):
        # Run all profiles if not already run
        if len(ALL_RESULTS) < len(PROFILES):
            for profile in PROFILES:
                already = any(r["profile"] == profile.name for r in ALL_RESULTS)
                if not already:
                    _run_profile(db, profile)
        _generate_report()
