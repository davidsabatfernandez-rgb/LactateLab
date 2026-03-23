"""
Test script: Simulate 4 athlete profiles improving over time.
Verifies that the threshold anchor system correctly tracks improvement.

Run: python test_profiles.py (from backend dir with venv activated)
"""
import sys
import os

# Ensure backend is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session as DbSession, joinedload

from app.db.session import SessionLocal
from app.models.athlete import Athlete
from app.models.session import Session as AthleteSession, SessionInterval, LactateSample
from app.models.metrics import PhysiologicalSnapshot, PerformanceEstimate, DerivedMetric
from app.services.analytics import recalculate_athlete, _discipline_view


# ── Helpers ─────────────────────────────────────────────────────────────────

TEST_PREFIX = "__TEST_PROFILE__"
BASE_DATE = datetime(2026, 1, 5, 8, 0, 0, tzinfo=timezone.utc)  # Monday week 0


def _dt(week: int, hour: int = 8) -> datetime:
    """Return a datetime for a given week offset from BASE_DATE."""
    return BASE_DATE + timedelta(weeks=week, hours=hour - 8)


def _pace(min_per_km: float) -> float:
    """Convert pace like 5.5 (5:30/km) to seconds per km."""
    minutes = int(min_per_km)
    seconds = (min_per_km - minutes) * 100
    return minutes * 60 + seconds


def _pace_str(sec_per_km: Optional[float]) -> str:
    """Format seconds/km as M:SS."""
    if sec_per_km is None:
        return "N/A"
    m = int(sec_per_km) // 60
    s = int(sec_per_km) % 60
    return f"{m}:{s:02d}"


def _hr_from_pace(pace_sec: float, hr_base: int = 120, hr_max: int = 190) -> int:
    """Estimate HR from pace. Faster pace = higher HR. Assumes ~350-240 sec/km range."""
    # Linear mapping: 360 sec/km -> hr_base, 240 sec/km -> hr_max
    fraction = max(0, min(1, (360 - pace_sec) / 120))
    return int(hr_base + fraction * (hr_max - hr_base))


def cleanup_test_athlete(db: DbSession, name: str) -> None:
    """Delete existing test athlete and all related data."""
    existing = db.scalar(select(Athlete).where(Athlete.name == name))
    if existing:
        # Cascade delete handles sessions, snapshots, estimates, etc.
        db.delete(existing)
        db.flush()


def create_test_athlete(db: DbSession, name: str, level: str = "trained") -> Athlete:
    """Create a test athlete for running."""
    athlete = Athlete(
        name=name,
        date_of_birth=date(1990, 6, 15),
        sex="male",
        weight=72.0,
        height=178.0,
        primary_discipline="running",
        athlete_level=level,
        created_at=date.today(),
    )
    db.add(athlete)
    db.flush()
    return athlete


def add_incremental_test(
    db: DbSession,
    athlete_id: int,
    performed_at: datetime,
    stages: list[dict],
    label: str = "",
) -> AthleteSession:
    """
    Add an incremental lactate test session.
    stages: list of dicts with keys: pace_sec, lactate, hr
    """
    session = AthleteSession(
        athlete_id=athlete_id,
        performed_at=performed_at,
        discipline="running",
        session_type="lactate_test",
        goal="test incremental",
        comments=label,
    )
    db.add(session)
    db.flush()

    for i, stage in enumerate(stages):
        interval = SessionInterval(
            session_id=session.id,
            order_index=i,
            duration_seconds=stage.get("duration", 240),
            rest_seconds=30,
            pace_seconds_per_km=stage["pace_sec"],
            heart_rate_avg=stage["hr"],
            heart_rate_max=stage["hr"] + 5,
            purpose="work",
        )
        db.add(interval)
        db.flush()

        sample = LactateSample(
            interval_id=interval.id,
            lactate_mmol=stage["lactate"],
            sample_delay_seconds=45,
            sample_timing_label="post-intervalo",
        )
        db.add(sample)
    db.flush()
    return session


def add_quick_measurement(
    db: DbSession,
    athlete_id: int,
    performed_at: datetime,
    measurements: list[dict],
    label: str = "",
) -> AthleteSession:
    """
    Add a training_lactate session with 1-3 quick measurements.
    measurements: list of dicts with keys: pace_sec, lactate, hr, duration (optional)
    """
    session = AthleteSession(
        athlete_id=athlete_id,
        performed_at=performed_at,
        discipline="running",
        session_type="training_lactate",
        goal="quick lactate check",
        comments=label,
    )
    db.add(session)
    db.flush()

    for i, m in enumerate(measurements):
        interval = SessionInterval(
            session_id=session.id,
            order_index=i,
            duration_seconds=m.get("duration", 360),
            rest_seconds=0,
            pace_seconds_per_km=m["pace_sec"],
            heart_rate_avg=m["hr"],
            heart_rate_max=m["hr"] + 5,
            purpose="work",
        )
        db.add(interval)
        db.flush()

        sample = LactateSample(
            interval_id=interval.id,
            lactate_mmol=m["lactate"],
            sample_delay_seconds=45,
            sample_timing_label="post-intervalo",
        )
        db.add(sample)
    db.flush()
    return session


def run_recalculate(db: DbSession, athlete_id: int) -> dict[str, Any]:
    """Run recalculate and return the result."""
    return recalculate_athlete(db, athlete_id)


def get_discipline_view(db: DbSession, athlete_id: int) -> dict[str, Any]:
    """Get the running discipline view for an athlete."""
    athlete = db.scalar(
        select(Athlete)
        .options(
            joinedload(Athlete.sessions).joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample),
            joinedload(Athlete.snapshots),
            joinedload(Athlete.estimates),
        )
        .where(Athlete.id == athlete_id)
    )
    if athlete is None:
        return {}

    snapshots = list(db.scalars(
        select(PhysiologicalSnapshot)
        .where(PhysiologicalSnapshot.athlete_id == athlete_id)
        .order_by(PhysiologicalSnapshot.snapshot_date)
    ).all())

    estimates = list(db.scalars(
        select(PerformanceEstimate)
        .where(PerformanceEstimate.athlete_id == athlete_id)
    ).all())

    return _discipline_view(athlete, "running", athlete.sessions, snapshots, estimates)


def print_threshold_report(view: dict[str, Any], label: str) -> None:
    """Print a formatted threshold report from a discipline view."""
    print(f"\n  --- {label} ---")

    anchor = view.get("threshold_anchor_status", {})
    lt1_status = anchor.get("lt1_status", "?")
    lt2_status = anchor.get("lt2_status", "?")
    msg_short = anchor.get("message_short", "")
    print(f"  Anchor: {msg_short}")
    print(f"    LT1 status: {lt1_status.upper()}")
    print(f"    LT2 status: {lt2_status.upper()}")

    thresholds = view.get("thresholds", [])
    for t in thresholds:
        name = t.get("name", "?")
        lac = t.get("lactate")
        pace = t.get("pace_seconds_per_km")
        hr = t.get("heart_rate")
        conf = t.get("confidence")
        lac_str = f"{lac:.2f} mmol" if lac is not None else "N/A"
        pace_str = _pace_str(pace)
        hr_str = f"{hr} bpm" if hr is not None else "N/A"
        conf_str = f"{conf:.2f}" if conf is not None else "N/A"
        print(f"    {name}: {lac_str} @ {pace_str}/km | HR {hr_str} | conf {conf_str}")

    dyn = view.get("dynamic_thresholds")
    if dyn:
        acute = dyn.get("acute", {})
        n_points = len(acute.get("points_used", []))
        print(f"  Dynamic engine: {n_points} points accumulated")
        for key in ("practical_lt1", "practical_lt2"):
            val = acute.get(key)
            if val and isinstance(val, dict):
                p = val.get("pace_seconds_per_km")
                l = val.get("lactate_mmol")
                h = val.get("heart_rate")
                print(f"    {key}: {l:.2f} mmol @ {_pace_str(p)}/km | HR {h}" if p and l else f"    {key}: incomplete")


def print_separator(title: str) -> None:
    """Print a section separator."""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


# ── Profile A: Aerobic Improver ────────────────────────────────────────────

def build_profile_a(db: DbSession) -> int:
    """Recreational runner improving base over 12 weeks."""
    name = f"{TEST_PREFIX}Profile_A_Aerobic_Improver"
    cleanup_test_athlete(db, name)
    db.commit()

    athlete = create_test_athlete(db, name, level="recreational")
    aid = athlete.id

    # Week 0: Full incremental test (6 stages)
    # Starts: LT1 ~1.8mmol at 6:00/km, LT2 ~4.0mmol at 5:00/km
    add_incremental_test(db, aid, _dt(0), [
        {"pace_sec": 420, "lactate": 0.9, "hr": 125},  # 7:00/km warmup
        {"pace_sec": 390, "lactate": 1.2, "hr": 135},  # 6:30/km
        {"pace_sec": 360, "lactate": 1.8, "hr": 148},  # 6:00/km  ~ LT1
        {"pace_sec": 330, "lactate": 2.8, "hr": 158},  # 5:30/km
        {"pace_sec": 300, "lactate": 4.1, "hr": 170},  # 5:00/km  ~ LT2
        {"pace_sec": 270, "lactate": 6.5, "hr": 182},  # 4:30/km
    ], label="Week 0 - incremental test")

    # Quick measurements showing pace improvement at same lactate
    improvements = [
        # (week, pace_sec_near_lt1, lac_near_lt1, hr1, pace_sec_near_lt2, lac_near_lt2, hr2)
        (2,  355, 1.7, 146,  296, 3.9, 168),
        (4,  350, 1.8, 145,  292, 4.0, 167),
        (6,  345, 1.7, 143,  288, 3.8, 165),
        (8,  340, 1.8, 142,  284, 4.1, 164),
        (10, 338, 1.7, 140,  280, 3.9, 163),
        (12, 335, 1.8, 139,  278, 4.0, 162),  # ends ~5:35/km LT1, ~4:38/km LT2
    ]
    for week, p1, l1, h1, p2, l2, h2 in improvements:
        add_quick_measurement(db, aid, _dt(week), [
            {"pace_sec": p1, "lactate": l1, "hr": h1},
            {"pace_sec": p2, "lactate": l2, "hr": h2},
        ], label=f"Week {week} - quick measurement")

    db.commit()
    return aid


def run_profile_a(db: DbSession) -> None:
    """Run profile A with intermediate checks."""
    print_separator("PROFILE A: Aerobic Improver (recreational runner improving base)")
    print("  Expected: LT1 ~1.8mmol, pace improves 6:00->5:35/km")
    print("           LT2 ~4.0mmol, pace improves 5:00->4:38/km")

    aid = build_profile_a(db)

    # Check at multiple stages by adding data incrementally
    # First, wipe and rebuild with just the initial test
    name = f"{TEST_PREFIX}Profile_A_Aerobic_Improver"
    cleanup_test_athlete(db, name)
    db.commit()

    athlete = create_test_athlete(db, name, level="recreational")
    aid = athlete.id

    # Stage 1: Just the initial test
    add_incremental_test(db, aid, _dt(0), [
        {"pace_sec": 420, "lactate": 0.9, "hr": 125},
        {"pace_sec": 390, "lactate": 1.2, "hr": 135},
        {"pace_sec": 360, "lactate": 1.8, "hr": 148},
        {"pace_sec": 330, "lactate": 2.8, "hr": 158},
        {"pace_sec": 300, "lactate": 4.1, "hr": 170},
        {"pace_sec": 270, "lactate": 6.5, "hr": 182},
    ], label="Week 0 - incremental test")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "After initial test (week 0)")

    # Stage 2: Add weeks 2-6
    for week, p1, l1, h1, p2, l2, h2 in [
        (2, 355, 1.7, 146, 296, 3.9, 168),
        (4, 350, 1.8, 145, 292, 4.0, 167),
        (6, 345, 1.7, 143, 288, 3.8, 165),
    ]:
        add_quick_measurement(db, aid, _dt(week), [
            {"pace_sec": p1, "lactate": l1, "hr": h1},
            {"pace_sec": p2, "lactate": l2, "hr": h2},
        ], label=f"Week {week}")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "After weeks 0-6 (4 sessions)")

    # Stage 3: Add weeks 8-12
    for week, p1, l1, h1, p2, l2, h2 in [
        (8, 340, 1.8, 142, 284, 4.1, 164),
        (10, 338, 1.7, 140, 280, 3.9, 163),
        (12, 335, 1.8, 139, 278, 4.0, 162),
    ]:
        add_quick_measurement(db, aid, _dt(week), [
            {"pace_sec": p1, "lactate": l1, "hr": h1},
            {"pace_sec": p2, "lactate": l2, "hr": h2},
        ], label=f"Week {week}")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "After all 12 weeks (7 sessions)")


# ── Profile B: Glycolytic Shifter ──────────────────────────────────────────

def run_profile_b(db: DbSession) -> None:
    """Trained runner whose lactate curve shifts right (VLamax dropping)."""
    print_separator("PROFILE B: Glycolytic Shifter (trained runner, VLamax dropping)")
    print("  Expected: LT2 lactate drops 3.5->3.0 (rightward shift)")
    print("           Pace improves at same/lower lactate")

    name = f"{TEST_PREFIX}Profile_B_Glycolytic_Shifter"
    cleanup_test_athlete(db, name)
    db.commit()
    athlete = create_test_athlete(db, name, level="trained")
    aid = athlete.id

    # Week 0: First incremental test - high glycolytic profile
    # LT1 ~2.0mmol at 5:20/km, LT2 ~3.5mmol at 4:30/km
    add_incremental_test(db, aid, _dt(0), [
        {"pace_sec": 360, "lactate": 1.0, "hr": 130},  # 6:00/km
        {"pace_sec": 340, "lactate": 1.5, "hr": 140},  # 5:40/km
        {"pace_sec": 320, "lactate": 2.0, "hr": 150},  # 5:20/km ~ LT1
        {"pace_sec": 300, "lactate": 2.8, "hr": 160},  # 5:00/km
        {"pace_sec": 270, "lactate": 3.5, "hr": 172},  # 4:30/km ~ LT2
        {"pace_sec": 250, "lactate": 5.8, "hr": 185},  # 4:10/km
    ], label="Week 0 - test 1 (high glycolytic)")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "After test 1 (week 0) - high glycolytic")

    # Weeks 3, 5, 7: Quick measurements showing gradual shift
    quick_data = [
        (3, [
            {"pace_sec": 315, "lactate": 1.9, "hr": 148},
            {"pace_sec": 268, "lactate": 3.3, "hr": 170},
        ]),
        (5, [
            {"pace_sec": 312, "lactate": 1.8, "hr": 147},
            {"pace_sec": 265, "lactate": 3.2, "hr": 169},
        ]),
        (7, [
            {"pace_sec": 308, "lactate": 1.7, "hr": 145},
            {"pace_sec": 262, "lactate": 3.1, "hr": 168},
        ]),
    ]
    for week, measurements in quick_data:
        add_quick_measurement(db, aid, _dt(week), measurements, label=f"Week {week}")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "After weeks 0-7 (4 sessions)")

    # Week 8: Second incremental test - curve has shifted right
    add_incremental_test(db, aid, _dt(8), [
        {"pace_sec": 360, "lactate": 0.8, "hr": 128},  # 6:00/km
        {"pace_sec": 335, "lactate": 1.2, "hr": 138},  # 5:35/km
        {"pace_sec": 310, "lactate": 1.7, "hr": 148},  # 5:10/km ~ LT1 (shifted)
        {"pace_sec": 285, "lactate": 2.4, "hr": 158},  # 4:45/km
        {"pace_sec": 260, "lactate": 3.0, "hr": 170},  # 4:20/km ~ LT2 (shifted)
        {"pace_sec": 240, "lactate": 5.2, "hr": 184},  # 4:00/km
    ], label="Week 8 - test 2 (rightward shift)")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "After test 2 (week 8) - rightward shift")

    # Weeks 10, 12: Final quick measurements
    for week, measurements in [
        (10, [
            {"pace_sec": 305, "lactate": 1.6, "hr": 146},
            {"pace_sec": 258, "lactate": 3.0, "hr": 168},
        ]),
        (12, [
            {"pace_sec": 300, "lactate": 1.5, "hr": 144},
            {"pace_sec": 255, "lactate": 2.9, "hr": 167},
        ]),
    ]:
        add_quick_measurement(db, aid, _dt(week), measurements, label=f"Week {week}")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "Final state (week 12) - 7 sessions")


# ── Profile C: Economy Improver ────────────────────────────────────────────

def run_profile_c(db: DbSession) -> None:
    """Same physiology, faster at same lactate (economy improvement)."""
    print_separator("PROFILE C: Economy Improver (same lactate, faster pace)")
    print("  Expected: Lactate levels stable, pace drops significantly")
    print("           LT1 ~2.0mmol, pace 5:30->5:00/km")
    print("           LT2 ~4.0mmol, pace 4:40->4:10/km")

    name = f"{TEST_PREFIX}Profile_C_Economy_Improver"
    cleanup_test_athlete(db, name)
    db.commit()
    athlete = create_test_athlete(db, name, level="trained")
    aid = athlete.id

    # Week 0: Initial incremental test
    # LT1 ~2.0mmol at 5:30/km, LT2 ~4.0mmol at 4:40/km
    add_incremental_test(db, aid, _dt(0), [
        {"pace_sec": 390, "lactate": 0.9, "hr": 128},  # 6:30/km
        {"pace_sec": 360, "lactate": 1.3, "hr": 138},  # 6:00/km
        {"pace_sec": 330, "lactate": 2.0, "hr": 150},  # 5:30/km ~ LT1
        {"pace_sec": 310, "lactate": 2.9, "hr": 160},  # 5:10/km
        {"pace_sec": 280, "lactate": 4.0, "hr": 172},  # 4:40/km ~ LT2
        {"pace_sec": 260, "lactate": 6.2, "hr": 184},  # 4:20/km
    ], label="Week 0 - initial test")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "After initial test (week 0)")

    # Quick measurements every 2 weeks showing progressive pace improvement
    # Lactate stays the same, pace drops
    economy_progression = [
        # (week, lt1_pace, lt1_lac, lt1_hr, lt2_pace, lt2_lac, lt2_hr)
        (2,  325, 2.0, 149, 276, 4.0, 171),
        (4,  322, 1.9, 148, 272, 4.1, 170),
        (6,  318, 2.0, 147, 268, 3.9, 169),
        (8,  314, 2.0, 146, 264, 4.0, 168),
        (10, 310, 1.9, 145, 260, 4.1, 167),
        (12, 306, 2.0, 144, 256, 3.9, 166),
        (14, 300, 2.0, 143, 250, 4.0, 165),  # ends ~5:00/km LT1, ~4:10/km LT2
    ]

    # Add first half
    for week, p1, l1, h1, p2, l2, h2 in economy_progression[:4]:
        add_quick_measurement(db, aid, _dt(week), [
            {"pace_sec": p1, "lactate": l1, "hr": h1},
            {"pace_sec": p2, "lactate": l2, "hr": h2},
        ], label=f"Week {week}")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "After weeks 0-8 (5 sessions)")

    # Add second half
    for week, p1, l1, h1, p2, l2, h2 in economy_progression[4:]:
        add_quick_measurement(db, aid, _dt(week), [
            {"pace_sec": p1, "lactate": l1, "hr": h1},
            {"pace_sec": p2, "lactate": l2, "hr": h2},
        ], label=f"Week {week}")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "Final state (week 14) - 8 sessions")


# ── Profile D: Mixed/Sparse Data ──────────────────────────────────────────

def run_profile_d(db: DbSession) -> None:
    """New athlete with sparse, poor data gradually building up."""
    print_separator("PROFILE D: Mixed/Sparse Data (new athlete, few measurements)")
    print("  Expected: Starts anclado, gradually transitions as data accumulates")
    print("           Poor 4-stage test -> sparse single measurements")

    name = f"{TEST_PREFIX}Profile_D_Sparse_Data"
    cleanup_test_athlete(db, name)
    db.commit()
    athlete = create_test_athlete(db, name, level="recreational")
    aid = athlete.id

    # Week 0: Poor incremental test (only 4 stages, incomplete curve)
    add_incremental_test(db, aid, _dt(0), [
        {"pace_sec": 390, "lactate": 1.1, "hr": 130},  # 6:30/km
        {"pace_sec": 360, "lactate": 1.6, "hr": 142},  # 6:00/km
        {"pace_sec": 330, "lactate": 2.5, "hr": 155},  # 5:30/km
        {"pace_sec": 300, "lactate": 3.8, "hr": 168},  # 5:00/km
    ], label="Week 0 - poor 4-stage test")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "After poor test (week 0) - expected: ANCLADO")

    # Week 3: Single measurement
    add_quick_measurement(db, aid, _dt(3), [
        {"pace_sec": 345, "lactate": 2.1, "hr": 150},
    ], label="Week 3 - single measurement")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "After week 3 (2 sessions)")

    # Week 6: Single measurement - slightly better
    add_quick_measurement(db, aid, _dt(6), [
        {"pace_sec": 340, "lactate": 2.0, "hr": 148},
    ], label="Week 6 - single measurement")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "After week 6 (3 sessions)")

    # Week 9: Two measurements this time (more data)
    add_quick_measurement(db, aid, _dt(9), [
        {"pace_sec": 350, "lactate": 1.7, "hr": 143},
        {"pace_sec": 295, "lactate": 3.9, "hr": 170},
    ], label="Week 9 - two measurements")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "After week 9 (4 sessions)")

    # Week 12: Two measurements again
    add_quick_measurement(db, aid, _dt(12), [
        {"pace_sec": 345, "lactate": 1.6, "hr": 141},
        {"pace_sec": 290, "lactate": 3.8, "hr": 169},
    ], label="Week 12 - two measurements")
    db.commit()

    run_recalculate(db, aid)
    db.commit()
    view = get_discipline_view(db, aid)
    print_threshold_report(view, "Final state (week 12) - 5 sessions")


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("  THRESHOLD ANCHOR SYSTEM - MULTI-PROFILE IMPROVEMENT TEST")
    print("  Testing 4 athlete profiles improving over 12-14 weeks")
    print("=" * 70)

    db = SessionLocal()
    try:
        run_profile_a(db)
        run_profile_b(db)
        run_profile_c(db)
        run_profile_d(db)

        # ── Summary ──────────────────────────────────────────────────────
        print_separator("SUMMARY")
        profiles = [
            (f"{TEST_PREFIX}Profile_A_Aerobic_Improver", "A: Aerobic Improver"),
            (f"{TEST_PREFIX}Profile_B_Glycolytic_Shifter", "B: Glycolytic Shifter"),
            (f"{TEST_PREFIX}Profile_C_Economy_Improver", "C: Economy Improver"),
            (f"{TEST_PREFIX}Profile_D_Sparse_Data", "D: Sparse Data"),
        ]
        for db_name, display_name in profiles:
            athlete = db.scalar(select(Athlete).where(Athlete.name == db_name))
            if athlete is None:
                print(f"\n  {display_name}: NOT FOUND")
                continue
            view = get_discipline_view(db, athlete.id)
            anchor = view.get("threshold_anchor_status", {})
            thresholds = view.get("thresholds", [])

            lt1 = next((t for t in thresholds if t.get("name") == "LT1"), {})
            lt2 = next((t for t in thresholds if t.get("name") == "LT2"), {})

            lt1_lac = lt1.get("lactate")
            lt1_pace = lt1.get("pace_seconds_per_km")
            lt2_lac = lt2.get("lactate")
            lt2_pace = lt2.get("pace_seconds_per_km")

            print(f"\n  {display_name}")
            print(f"    Anchor: LT1={anchor.get('lt1_status', '?').upper()}, LT2={anchor.get('lt2_status', '?').upper()}")
            print(f"    LT1: {lt1_lac:.2f} mmol @ {_pace_str(lt1_pace)}/km" if lt1_lac else "    LT1: N/A")
            print(f"    LT2: {lt2_lac:.2f} mmol @ {_pace_str(lt2_pace)}/km" if lt2_lac else "    LT2: N/A")

        print("\n" + "=" * 70)
        print("  TEST COMPLETE")
        print("=" * 70)

    except Exception as e:
        db.rollback()
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        # Cleanup test data
        print("\n  Cleaning up test athletes...")
        for db_name, _ in [
            (f"{TEST_PREFIX}Profile_A_Aerobic_Improver", ""),
            (f"{TEST_PREFIX}Profile_B_Glycolytic_Shifter", ""),
            (f"{TEST_PREFIX}Profile_C_Economy_Improver", ""),
            (f"{TEST_PREFIX}Profile_D_Sparse_Data", ""),
        ]:
            cleanup_test_athlete(db, db_name)
        db.commit()
        db.close()
        print("  Done. All test data removed.\n")


if __name__ == "__main__":
    main()
