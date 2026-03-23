"""
Test battery: 50 diverse athlete profiles validating the threshold anchor system.
Run: cd backend && source .venv/bin/activate && python test_battery_50.py
"""
import sys
import os
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Optional

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.db.session import SessionLocal
from app.models.athlete import Athlete
from app.models.session import Session as AthleteSession, SessionInterval, LactateSample
from app.models.metrics import PhysiologicalSnapshot, PerformanceEstimate
from app.services.analytics import recalculate_athlete, _discipline_view


# ── Constants ────────────────────────────────────────────────────────────────
TEST_PREFIX = "__BATTERY50__"
BASE_DATE = datetime(2026, 1, 5, 8, 0, 0, tzinfo=timezone.utc)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _dt(week: int, day: int = 0, hour: int = 8) -> datetime:
    return BASE_DATE + timedelta(weeks=week, days=day, hours=hour - 8)


def _pace_str(sec_per_km: Optional[float]) -> str:
    if sec_per_km is None:
        return "N/A"
    m = int(sec_per_km) // 60
    s = int(sec_per_km) % 60
    return f"{m}:{s:02d}"


def _hr(pace_sec: float, base: int = 120, mx: int = 190) -> int:
    """HR from pace. 360s/km->base, 240s/km->mx."""
    frac = max(0.0, min(1.0, (360 - pace_sec) / 120))
    return int(base + frac * (mx - base))


def cleanup(db, name: str):
    a = db.scalar(select(Athlete).where(Athlete.name == name))
    if a:
        db.delete(a)
        db.flush()


def mk_athlete(db, name: str, level: str = "trained", discipline: str = "running") -> Athlete:
    a = Athlete(
        name=name, date_of_birth=date(1990, 6, 15), sex="male",
        weight=72.0, height=178.0, primary_discipline=discipline,
        athlete_level=level, created_at=date.today(),
    )
    db.add(a)
    db.flush()
    return a


def add_test(db, aid: int, dt: datetime, stages: list[dict], label: str = "",
             discipline: str = "running") -> AthleteSession:
    s = AthleteSession(
        athlete_id=aid, performed_at=dt, discipline=discipline,
        session_type="lactate_test", goal="test incremental", comments=label,
    )
    db.add(s)
    db.flush()
    for i, st in enumerate(stages):
        iv = SessionInterval(
            session_id=s.id, order_index=i,
            duration_seconds=st.get("dur", 240), rest_seconds=30,
            pace_seconds_per_km=st["p"], heart_rate_avg=st["hr"],
            heart_rate_max=st["hr"] + 5, purpose="work",
        )
        db.add(iv)
        db.flush()
        db.add(LactateSample(
            interval_id=iv.id, lactate_mmol=st["l"],
            sample_delay_seconds=45, sample_timing_label="post-intervalo",
        ))
    db.flush()
    return s


def add_qm(db, aid: int, dt: datetime, measurements: list[dict], label: str = "",
            discipline: str = "running") -> AthleteSession:
    s = AthleteSession(
        athlete_id=aid, performed_at=dt, discipline=discipline,
        session_type="training_lactate", goal="quick lactate check", comments=label,
    )
    db.add(s)
    db.flush()
    for i, m in enumerate(measurements):
        iv = SessionInterval(
            session_id=s.id, order_index=i,
            duration_seconds=m.get("dur", 360), rest_seconds=0,
            pace_seconds_per_km=m["p"], heart_rate_avg=m["hr"],
            heart_rate_max=m["hr"] + 5, purpose="work",
        )
        db.add(iv)
        db.flush()
        db.add(LactateSample(
            interval_id=iv.id, lactate_mmol=m["l"],
            sample_delay_seconds=45, sample_timing_label="post-intervalo",
        ))
    db.flush()
    return s


def check_state(db, aid: int) -> dict:
    recalculate_athlete(db, aid)
    db.commit()
    athlete = db.scalar(
        select(Athlete)
        .options(
            joinedload(Athlete.sessions).joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample),
            joinedload(Athlete.snapshots),
            joinedload(Athlete.estimates),
        )
        .where(Athlete.id == aid)
    )
    if not athlete:
        return {}
    snaps = list(db.scalars(
        select(PhysiologicalSnapshot).where(PhysiologicalSnapshot.athlete_id == aid)
        .order_by(PhysiologicalSnapshot.snapshot_date)
    ).all())
    ests = list(db.scalars(
        select(PerformanceEstimate).where(PerformanceEstimate.athlete_id == aid)
    ).all())
    return _discipline_view(athlete, "running", athlete.sessions, snaps, ests)


def extract_thresholds(view: dict):
    """Return (lt1_info, lt2_info, anchor_status) from a discipline view."""
    anchor = view.get("threshold_anchor_status", {})
    thresholds = view.get("thresholds", [])
    lt1 = next((t for t in thresholds if t.get("name") == "LT1"), {})
    lt2 = next((t for t in thresholds if t.get("name") == "LT2"), {})
    return lt1, lt2, anchor


# ── Profile spec ─────────────────────────────────────────────────────────────

ProfileSpec = dict[str, Any]


def default_spec(**kw) -> ProfileSpec:
    d = {
        "expected_lt1_status": "any",
        "expected_lt2_status": "any",
        "expected_lt1_direction": "any",
        "expected_lt2_direction": "any",
        "expected_lt1_lactate_range": (0.5, 4.0),
        "expected_lt2_lactate_range": (2.0, 8.0),
        "validation_fn": None,
    }
    d.update(kw)
    return d


# ── Validation ───────────────────────────────────────────────────────────────

def validate_profile(spec: ProfileSpec, view_initial: Optional[dict], view_final: dict) -> list[str]:
    """Return list of failure messages (empty = pass)."""
    failures = []
    lt1, lt2, anchor = extract_thresholds(view_final)

    # Status checks
    for key, expected_key in [("lt1", "expected_lt1_status"), ("lt2", "expected_lt2_status")]:
        expected = spec[expected_key]
        actual = anchor.get(f"{key}_status", "unknown")
        if expected != "any" and actual != expected:
            failures.append(f"{key.upper()} status={actual} (expected {expected})")

    # Lactate range checks
    for name, th, range_key in [("LT1", lt1, "expected_lt1_lactate_range"), ("LT2", lt2, "expected_lt2_lactate_range")]:
        lac = th.get("lactate")
        lo, hi = spec[range_key]
        status_key = f"expected_{name.lower()}_status"
        if spec[status_key] in ("detectado", "consolidado"):
            if lac is None:
                failures.append(f"{name} lactate is None (expected {lo}-{hi})")
            elif not (lo <= lac <= hi):
                failures.append(f"{name} lactate={lac:.2f} outside ({lo},{hi})")

    # Pace direction checks
    if view_initial is not None:
        lt1_i, lt2_i, _ = extract_thresholds(view_initial)
        for name, th_i, th_f, dir_key in [
            ("LT1", lt1_i, lt1, "expected_lt1_direction"),
            ("LT2", lt2_i, lt2, "expected_lt2_direction"),
        ]:
            expected_dir = spec[dir_key]
            if expected_dir == "any":
                continue
            p_i = th_i.get("pace_seconds_per_km")
            p_f = th_f.get("pace_seconds_per_km")
            if p_i is None or p_f is None:
                # Only fail if we expect a specific direction AND status is detected
                status_key = f"expected_{name.lower()}_status"
                if spec[status_key] in ("detectado", "consolidado"):
                    if p_f is None:
                        failures.append(f"{name} final pace is N/A")
                continue
            delta = p_f - p_i
            if expected_dir == "improving" and delta > 5:  # pace should decrease (faster)
                failures.append(f"{name} pace not improving: {_pace_str(p_i)}->{_pace_str(p_f)} (+{delta:.0f}s)")
            elif expected_dir == "stable" and abs(delta) > 15:
                failures.append(f"{name} pace not stable: {_pace_str(p_i)}->{_pace_str(p_f)} ({delta:+.0f}s)")
            elif expected_dir == "degrading" and delta < -5:
                failures.append(f"{name} pace not degrading: {_pace_str(p_i)}->{_pace_str(p_f)} ({delta:+.0f}s)")

    # Custom validation
    fn = spec.get("validation_fn")
    if fn:
        extra = fn(view_initial, view_final)
        if extra:
            failures.extend(extra)

    return failures


# ── Profile builders ─────────────────────────────────────────────────────────
# Each returns (spec, view_initial_or_None, view_final)

def run_p01(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P01 Steady aerobic improvement"""
    name = f"{TEST_PREFIX}P01"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "recreational"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 420, "l": 0.9, "hr": 125}, {"p": 390, "l": 1.2, "hr": 135},
        {"p": 360, "l": 1.8, "hr": 148}, {"p": 330, "l": 2.8, "hr": 158},
        {"p": 300, "l": 4.1, "hr": 170}, {"p": 270, "l": 6.5, "hr": 182},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    for w, p, l, hr in [(2,355,1.7,146),(4,350,1.8,145),(6,345,1.7,143),
                         (8,340,1.8,142),(10,338,1.7,140),(12,335,1.8,139)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="improving", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.2, 2.5), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p02(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P02 Steady LT2 improvement"""
    name = f"{TEST_PREFIX}P02"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.9, "hr": 130}, {"p": 330, "l": 1.4, "hr": 142},
        {"p": 300, "l": 2.2, "hr": 155}, {"p": 280, "l": 3.2, "hr": 165},
        {"p": 260, "l": 4.2, "hr": 176}, {"p": 240, "l": 6.8, "hr": 188},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    for w, p, l, hr in [(2,256,4.0,174),(4,253,4.1,173),(6,250,3.9,172),
                         (8,248,4.0,171),(10,245,4.1,170),(12,242,3.9,169)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="improving",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p03(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P03 Both thresholds improve together"""
    name = f"{TEST_PREFIX}P03"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 380, "l": 0.8, "hr": 128}, {"p": 350, "l": 1.3, "hr": 140},
        {"p": 325, "l": 2.0, "hr": 152}, {"p": 300, "l": 3.0, "hr": 162},
        {"p": 275, "l": 4.2, "hr": 174}, {"p": 255, "l": 6.0, "hr": 185},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    add_test(db, aid, _dt(8), [
        {"p": 370, "l": 0.7, "hr": 125}, {"p": 335, "l": 1.1, "hr": 137},
        {"p": 305, "l": 1.8, "hr": 149}, {"p": 280, "l": 2.8, "hr": 160},
        {"p": 258, "l": 4.0, "hr": 172}, {"p": 240, "l": 5.8, "hr": 184},
    ], "W8 test")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="improving", expected_lt2_direction="improving",
        expected_lt1_lactate_range=(1.2, 2.5), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p04(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P04 Fast improver"""
    name = f"{TEST_PREFIX}P04"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "recreational"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 420, "l": 0.9, "hr": 128}, {"p": 390, "l": 1.4, "hr": 140},
        {"p": 360, "l": 2.0, "hr": 152}, {"p": 330, "l": 3.2, "hr": 164},
        {"p": 300, "l": 4.5, "hr": 175}, {"p": 270, "l": 7.0, "hr": 188},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    for w, p1, l1, h1, p2, l2, h2 in [
        (2, 345, 1.9, 148, 288, 4.2, 172),
        (3, 335, 1.8, 145, 278, 4.0, 170),
        (5, 320, 1.7, 142, 268, 3.9, 167),
        (6, 310, 1.6, 139, 258, 4.1, 165),
    ]:
        add_qm(db, aid, _dt(w), [{"p": p1, "l": l1, "hr": h1}, {"p": p2, "l": l2, "hr": h2}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="improving", expected_lt2_direction="improving",
        expected_lt1_lactate_range=(1.0, 2.5), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p05(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P05 Slow grinder"""
    name = f"{TEST_PREFIX}P05"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.8, "hr": 130}, {"p": 340, "l": 1.3, "hr": 140},
        {"p": 320, "l": 1.9, "hr": 150}, {"p": 300, "l": 2.9, "hr": 162},
        {"p": 280, "l": 4.0, "hr": 173}, {"p": 260, "l": 6.2, "hr": 185},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Very small pace improvement: 2-3s per measurement over 16 weeks
    for w, p, l, hr in [(2,319,1.9,150),(4,317,1.8,149),(6,315,1.9,149),
                         (8,313,1.8,148),(10,311,1.9,148),(12,309,1.8,147),
                         (14,307,1.9,147),(16,305,1.8,146)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="improving", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.2, 2.5), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p06(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P06 Plateau then breakthrough"""
    name = f"{TEST_PREFIX}P06"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.9, "hr": 130}, {"p": 335, "l": 1.4, "hr": 142},
        {"p": 310, "l": 2.1, "hr": 154}, {"p": 285, "l": 3.3, "hr": 166},
        {"p": 265, "l": 4.5, "hr": 177}, {"p": 245, "l": 6.8, "hr": 188},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Weeks 2-8: flat (plateau)
    for w, p, l, hr in [(2,309,2.1,154),(4,310,2.0,153),(6,308,2.1,154),(8,310,2.0,153)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    # Weeks 10-12: breakthrough
    for w, p, l, hr in [(10,295,1.8,148),(12,285,1.7,145)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="improving", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.2, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p07(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P07 Beginner with rapid initial gains"""
    name = f"{TEST_PREFIX}P07"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "recreational"); aid = a.id

    # Poor test — beginner starts very slow
    add_test(db, aid, _dt(0), [
        {"p": 480, "l": 1.0, "hr": 130}, {"p": 450, "l": 1.5, "hr": 142},
        {"p": 420, "l": 2.3, "hr": 155}, {"p": 390, "l": 3.5, "hr": 167},
        {"p": 360, "l": 5.2, "hr": 178}, {"p": 340, "l": 7.5, "hr": 190},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Huge improvement over 12 weeks
    for w, p, l, hr in [(2,410,2.0,150),(4,395,1.9,147),(6,380,1.8,144),
                         (8,365,1.7,141),(10,350,1.6,138),(12,340,1.5,136)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="improving", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 3.0), expected_lt2_lactate_range=(2.5, 6.0),
    )
    return spec, vi, vf


def run_p08(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P08 Elite athlete fine-tuning"""
    name = f"{TEST_PREFIX}P08"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "competitive"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 280, "l": 0.7, "hr": 130}, {"p": 260, "l": 1.1, "hr": 142},
        {"p": 240, "l": 1.7, "hr": 155}, {"p": 220, "l": 2.6, "hr": 167},
        {"p": 210, "l": 3.8, "hr": 177}, {"p": 195, "l": 5.5, "hr": 188},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Very small improvements (5-8s over 12 weeks) at LT2 zone
    for w, p, l, hr in [(3,208,3.7,176),(6,206,3.8,176),(9,205,3.7,175),(12,203,3.8,175)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.5), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


# ── Category 2: Glycolytic/Metabolic Shifts (9-16) ──────────────────────────

def run_p09(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P09 VLamax dropping (classic aerobic block)"""
    name = f"{TEST_PREFIX}P09"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # Test 1: higher glycolytic — LT2 at 4.0 mmol
    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.9, "hr": 128}, {"p": 330, "l": 1.5, "hr": 140},
        {"p": 305, "l": 2.2, "hr": 153}, {"p": 280, "l": 3.2, "hr": 165},
        {"p": 260, "l": 4.0, "hr": 175}, {"p": 240, "l": 6.5, "hr": 187},
    ], "W0 high glycolytic")
    db.commit()
    vi = check_state(db, aid)

    # Test 2: curve shifted right, LT2 lactate dropped to 3.2
    add_test(db, aid, _dt(8), [
        {"p": 360, "l": 0.7, "hr": 125}, {"p": 325, "l": 1.1, "hr": 137},
        {"p": 295, "l": 1.7, "hr": 150}, {"p": 270, "l": 2.5, "hr": 162},
        {"p": 250, "l": 3.2, "hr": 173}, {"p": 230, "l": 5.0, "hr": 185},
    ], "W8 lower glycolytic")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="improving", expected_lt2_direction="improving",
        expected_lt1_lactate_range=(1.0, 2.5), expected_lt2_lactate_range=(2.5, 5.0),
    )
    return spec, vi, vf


def run_p10(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P10 VLamax rising (speed block)"""
    name = f"{TEST_PREFIX}P10"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # Test 1: aerobic profile, LT2 at 3.0 mmol
    add_test(db, aid, _dt(0), [
        {"p": 350, "l": 0.7, "hr": 128}, {"p": 320, "l": 1.1, "hr": 140},
        {"p": 295, "l": 1.6, "hr": 152}, {"p": 270, "l": 2.4, "hr": 163},
        {"p": 252, "l": 3.0, "hr": 173}, {"p": 235, "l": 4.8, "hr": 185},
    ], "W0 aerobic")
    db.commit()
    vi = check_state(db, aid)

    # Test 2: after speed block, LT2 lactate rises to 3.8 (more glycolytic)
    add_test(db, aid, _dt(8), [
        {"p": 345, "l": 0.9, "hr": 130}, {"p": 315, "l": 1.5, "hr": 142},
        {"p": 290, "l": 2.3, "hr": 155}, {"p": 268, "l": 3.2, "hr": 167},
        {"p": 248, "l": 3.8, "hr": 177}, {"p": 230, "l": 6.2, "hr": 189},
    ], "W8 glycolytic")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.5), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p11(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P11 LT1 improves, LT2 stable"""
    name = f"{TEST_PREFIX}P11"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 380, "l": 0.8, "hr": 125}, {"p": 350, "l": 1.3, "hr": 138},
        {"p": 325, "l": 2.0, "hr": 150}, {"p": 300, "l": 3.0, "hr": 162},
        {"p": 275, "l": 4.2, "hr": 174}, {"p": 255, "l": 6.5, "hr": 186},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Only measurements near LT1 zone, showing improvement
    for w, p, l, hr in [(2,348,1.9,148),(4,342,1.8,146),(6,337,1.7,144),
                         (8,332,1.8,143),(10,328,1.7,141),(12,325,1.6,140)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="improving", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.5), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p12(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P12 LT2 improves, LT1 stable"""
    name = f"{TEST_PREFIX}P12"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 370, "l": 0.8, "hr": 128}, {"p": 340, "l": 1.3, "hr": 140},
        {"p": 315, "l": 2.0, "hr": 152}, {"p": 290, "l": 3.1, "hr": 164},
        {"p": 268, "l": 4.3, "hr": 176}, {"p": 250, "l": 6.5, "hr": 187},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Only measurements near LT2 zone
    for w, p, l, hr in [(2,265,4.1,175),(4,260,4.0,173),(6,256,4.2,172),
                         (8,253,4.0,171),(10,250,4.1,170),(12,248,3.9,169)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="improving",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p13(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P13 Curve flattening (elite endurance)"""
    name = f"{TEST_PREFIX}P13"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "competitive"); aid = a.id

    # Test 1: normal curve
    add_test(db, aid, _dt(0), [
        {"p": 310, "l": 0.8, "hr": 128}, {"p": 285, "l": 1.2, "hr": 140},
        {"p": 265, "l": 1.8, "hr": 152}, {"p": 245, "l": 2.8, "hr": 164},
        {"p": 230, "l": 4.0, "hr": 175}, {"p": 215, "l": 6.0, "hr": 186},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Test 2: flatter curve, LT1 and LT2 converge
    add_test(db, aid, _dt(8), [
        {"p": 300, "l": 0.7, "hr": 125}, {"p": 275, "l": 1.0, "hr": 137},
        {"p": 255, "l": 1.5, "hr": 150}, {"p": 238, "l": 2.2, "hr": 162},
        {"p": 222, "l": 3.0, "hr": 174}, {"p": 210, "l": 4.5, "hr": 185},
    ], "W8 flat curve")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="improving",
        expected_lt1_lactate_range=(0.8, 2.5), expected_lt2_lactate_range=(2.0, 5.0),
    )
    return spec, vi, vf


def run_p14(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P14 Curve steepening (detraining)"""
    name = f"{TEST_PREFIX}P14"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # Test 1: well-trained curve
    add_test(db, aid, _dt(0), [
        {"p": 340, "l": 0.7, "hr": 125}, {"p": 310, "l": 1.1, "hr": 138},
        {"p": 285, "l": 1.7, "hr": 150}, {"p": 265, "l": 2.6, "hr": 163},
        {"p": 248, "l": 3.5, "hr": 174}, {"p": 230, "l": 5.0, "hr": 185},
    ], "W0 trained")
    db.commit()
    vi = check_state(db, aid)

    # Test 2: steeper curve after detraining (LT1 stays but LT2 lactate goes up)
    add_test(db, aid, _dt(8), [
        {"p": 345, "l": 0.8, "hr": 128}, {"p": 315, "l": 1.3, "hr": 140},
        {"p": 290, "l": 2.0, "hr": 153}, {"p": 270, "l": 3.5, "hr": 166},
        {"p": 255, "l": 5.0, "hr": 178}, {"p": 240, "l": 7.5, "hr": 190},
    ], "W8 detrained")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 6.0),
    )
    return spec, vi, vf


def run_p15(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P15 Rightward shift with efficiency"""
    name = f"{TEST_PREFIX}P15"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 370, "l": 0.8, "hr": 130}, {"p": 340, "l": 1.3, "hr": 143},
        {"p": 315, "l": 2.0, "hr": 155}, {"p": 290, "l": 3.0, "hr": 167},
        {"p": 270, "l": 4.2, "hr": 178}, {"p": 250, "l": 6.2, "hr": 189},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Same lactate, faster pace AND lower HR
    for w, p, l, hr in [(2,310,2.0,153),(4,305,1.9,150),(6,300,2.0,148),
                         (8,296,1.9,146),(10,292,2.0,144),(12,288,1.9,142)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="improving", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.2, 2.5), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p16(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P16 Same pace, lower lactate, same HR (economy adaptation)"""
    name = f"{TEST_PREFIX}P16"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.9, "hr": 128}, {"p": 330, "l": 1.5, "hr": 142},
        {"p": 305, "l": 2.2, "hr": 155}, {"p": 280, "l": 3.3, "hr": 167},
        {"p": 260, "l": 4.5, "hr": 178}, {"p": 245, "l": 6.5, "hr": 188},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Same pace 305, lactate dropping from 2.2 -> 1.5
    for w, l in [(2,2.1),(4,2.0),(6,1.9),(8,1.7),(10,1.6),(12,1.5)]:
        add_qm(db, aid, _dt(w), [{"p": 305, "l": l, "hr": 155}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


# ── Category 3: Adverse Conditions & Noise (17-26) ──────────────────────────

def run_p17(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P17 Bad day measurement"""
    name = f"{TEST_PREFIX}P17"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.8, "hr": 128}, {"p": 330, "l": 1.3, "hr": 140},
        {"p": 305, "l": 2.0, "hr": 153}, {"p": 280, "l": 3.1, "hr": 165},
        {"p": 260, "l": 4.3, "hr": 176}, {"p": 240, "l": 6.5, "hr": 188},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # W2: bad day — high lactate at slow pace
    add_qm(db, aid, _dt(2), [{"p": 330, "l": 3.5, "hr": 170}], "W2 bad day")
    # W4-8: normal measurements
    for w, p, l, hr in [(4,302,2.0,152),(6,300,1.9,151),(8,298,2.0,150)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p18(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P18 Two bad days in a row"""
    name = f"{TEST_PREFIX}P18"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.8, "hr": 128}, {"p": 335, "l": 1.3, "hr": 140},
        {"p": 310, "l": 2.0, "hr": 152}, {"p": 285, "l": 3.0, "hr": 164},
        {"p": 265, "l": 4.2, "hr": 175}, {"p": 245, "l": 6.2, "hr": 186},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # 2 bad days then 3 normal
    add_qm(db, aid, _dt(2), [{"p": 335, "l": 3.8, "hr": 172}], "W2 bad")
    add_qm(db, aid, _dt(3), [{"p": 340, "l": 3.5, "hr": 170}], "W3 bad")
    for w, p, l, hr in [(5,308,1.9,151),(7,305,2.0,150),(9,302,1.8,149)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 3.0), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p19(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P19 Altitude camp effect"""
    name = f"{TEST_PREFIX}P19"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 350, "l": 0.8, "hr": 128}, {"p": 320, "l": 1.3, "hr": 140},
        {"p": 295, "l": 2.0, "hr": 152}, {"p": 270, "l": 3.0, "hr": 164},
        {"p": 250, "l": 4.2, "hr": 176}, {"p": 235, "l": 6.0, "hr": 187},
    ], "W0 sea level test")
    db.commit()
    vi = check_state(db, aid)

    # Altitude: higher lactate at same pace
    add_qm(db, aid, _dt(3), [{"p": 295, "l": 2.8, "hr": 158}], "W3 altitude")
    add_qm(db, aid, _dt(4), [{"p": 295, "l": 2.6, "hr": 156}], "W4 altitude")
    # Return to sea level: better than before
    add_qm(db, aid, _dt(7), [{"p": 290, "l": 1.8, "hr": 148}], "W7 post-altitude")
    add_qm(db, aid, _dt(9), [{"p": 288, "l": 1.7, "hr": 146}], "W9 post-altitude")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p20(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P20 Hot day measurement"""
    name = f"{TEST_PREFIX}P20"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 355, "l": 0.8, "hr": 128}, {"p": 325, "l": 1.3, "hr": 140},
        {"p": 300, "l": 2.0, "hr": 152}, {"p": 275, "l": 3.0, "hr": 164},
        {"p": 255, "l": 4.2, "hr": 176}, {"p": 238, "l": 6.2, "hr": 187},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Hot day: same lactate/pace but higher HR
    add_qm(db, aid, _dt(3), [{"p": 298, "l": 2.0, "hr": 168}], "W3 hot day")
    # Normal days
    for w, p, l, hr in [(5,296,1.9,151),(7,294,2.0,150),(9,292,1.9,149)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p21(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P21 Inconsistent protocol"""
    name = f"{TEST_PREFIX}P21"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.8, "hr": 128}, {"p": 330, "l": 1.4, "hr": 142},
        {"p": 305, "l": 2.1, "hr": 155}, {"p": 280, "l": 3.2, "hr": 167},
        {"p": 260, "l": 4.5, "hr": 178}, {"p": 240, "l": 6.5, "hr": 189},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Varying durations
    add_qm(db, aid, _dt(2), [{"p": 303, "l": 2.0, "hr": 154, "dur": 120}], "W2 short")
    add_qm(db, aid, _dt(4), [{"p": 300, "l": 1.9, "hr": 153, "dur": 360}], "W4 long")
    add_qm(db, aid, _dt(6), [{"p": 298, "l": 2.1, "hr": 155, "dur": 180}], "W6 medium")
    add_qm(db, aid, _dt(8), [{"p": 296, "l": 1.8, "hr": 152, "dur": 300}], "W8 normal")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p22(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P22 Noisy data (jitter around trend)"""
    name = f"{TEST_PREFIX}P22"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.9, "hr": 128}, {"p": 335, "l": 1.4, "hr": 140},
        {"p": 310, "l": 2.1, "hr": 153}, {"p": 285, "l": 3.2, "hr": 165},
        {"p": 265, "l": 4.3, "hr": 176}, {"p": 245, "l": 6.5, "hr": 187},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Noisy measurements: trend is improving but +-0.3 mmol jitter
    noisy = [
        (2, 308, 2.3, 154), (3, 305, 1.8, 151), (4, 310, 2.2, 155),
        (6, 303, 1.7, 150), (7, 306, 2.1, 153), (8, 300, 1.9, 149),
        (10, 298, 2.2, 152), (11, 295, 1.6, 147),
    ]
    for w, p, l, hr in noisy:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 3.0), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p23(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P23 Outlier measurement"""
    name = f"{TEST_PREFIX}P23"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.8, "hr": 128}, {"p": 335, "l": 1.3, "hr": 140},
        {"p": 310, "l": 2.0, "hr": 152}, {"p": 285, "l": 3.0, "hr": 164},
        {"p": 265, "l": 4.2, "hr": 175}, {"p": 245, "l": 6.2, "hr": 186},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Extreme outlier: 8.0 mmol at LT1 pace
    add_qm(db, aid, _dt(2), [{"p": 310, "l": 8.0, "hr": 175}], "W2 outlier")
    # Normal follow-up
    for w, p, l, hr in [(4,308,2.0,152),(6,305,1.9,151),(8,303,2.0,150)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 3.0), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p24(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P24 Illness recovery"""
    name = f"{TEST_PREFIX}P24"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 350, "l": 0.8, "hr": 128}, {"p": 320, "l": 1.3, "hr": 140},
        {"p": 295, "l": 2.0, "hr": 152}, {"p": 270, "l": 3.0, "hr": 164},
        {"p": 250, "l": 4.2, "hr": 176}, {"p": 235, "l": 6.0, "hr": 187},
    ], "W0 healthy")
    db.commit()
    vi = check_state(db, aid)

    # Post-illness: regression
    add_qm(db, aid, _dt(3), [{"p": 310, "l": 2.5, "hr": 160}], "W3 post-illness")
    add_qm(db, aid, _dt(4), [{"p": 305, "l": 2.3, "hr": 157}], "W4 recovering")
    # Gradual return to baseline
    add_qm(db, aid, _dt(6), [{"p": 298, "l": 2.1, "hr": 154}], "W6 recovering")
    add_qm(db, aid, _dt(8), [{"p": 294, "l": 2.0, "hr": 152}], "W8 almost there")
    add_qm(db, aid, _dt(10), [{"p": 290, "l": 1.9, "hr": 150}], "W10 back")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p25(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P25 Overtraining signal"""
    name = f"{TEST_PREFIX}P25"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 350, "l": 0.8, "hr": 125}, {"p": 320, "l": 1.2, "hr": 138},
        {"p": 295, "l": 1.8, "hr": 150}, {"p": 270, "l": 2.8, "hr": 162},
        {"p": 250, "l": 4.0, "hr": 174}, {"p": 235, "l": 5.8, "hr": 185},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Increasing baseline, same pace gets harder
    for w, p, l, hr in [(2,295,2.0,152),(4,295,2.3,155),(6,295,2.6,158),
                         (8,295,2.8,160),(10,295,3.0,162)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 3.5), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p26(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P26 Dehydration artifact"""
    name = f"{TEST_PREFIX}P26"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 355, "l": 0.8, "hr": 128}, {"p": 325, "l": 1.3, "hr": 140},
        {"p": 300, "l": 2.0, "hr": 152}, {"p": 275, "l": 3.0, "hr": 164},
        {"p": 255, "l": 4.2, "hr": 176}, {"p": 238, "l": 6.2, "hr": 187},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # One dehydration artifact (0.3 elevated) then back to normal
    add_qm(db, aid, _dt(2), [{"p": 298, "l": 2.3, "hr": 154}], "W2 dehydrated")
    for w, p, l, hr in [(4,296,2.0,152),(6,294,1.9,151),(8,292,2.0,150)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


# ── Category 4: Data Availability Patterns (27-36) ──────────────────────────

def run_p27(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P27 Only 1 good test, no follow-up"""
    name = f"{TEST_PREFIX}P27"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 400, "l": 0.7, "hr": 120}, {"p": 370, "l": 1.0, "hr": 132},
        {"p": 340, "l": 1.5, "hr": 144}, {"p": 310, "l": 2.3, "hr": 156},
        {"p": 285, "l": 3.4, "hr": 168}, {"p": 260, "l": 4.8, "hr": 179},
        {"p": 240, "l": 7.0, "hr": 190},
    ], "W0 full 7-stage test")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_lactate_range=(1.0, 2.5), expected_lt2_lactate_range=(2.5, 6.0),
    )
    return spec, None, vf


def run_p28(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P28 Only 1 poor test (3 stages)"""
    name = f"{TEST_PREFIX}P28"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "recreational"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 390, "l": 1.2, "hr": 135},
        {"p": 350, "l": 2.5, "hr": 155},
        {"p": 310, "l": 4.8, "hr": 175},
    ], "W0 poor 3-stage test")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="any", expected_lt2_status="any",
        expected_lt1_lactate_range=(0.5, 4.0), expected_lt2_lactate_range=(2.0, 6.0),
    )
    return spec, None, vf


def run_p29(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P29 Only 1 medium test (5 stages)"""
    name = f"{TEST_PREFIX}P29"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 370, "l": 0.9, "hr": 128}, {"p": 340, "l": 1.5, "hr": 142},
        {"p": 310, "l": 2.5, "hr": 156}, {"p": 280, "l": 3.8, "hr": 170},
        {"p": 255, "l": 5.8, "hr": 183},
    ], "W0 5-stage test")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="any", expected_lt2_status="detectado",
        expected_lt1_lactate_range=(0.8, 3.0), expected_lt2_lactate_range=(2.5, 6.0),
    )
    return spec, None, vf


def run_p30(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P30 Only quick measurements, no test"""
    name = f"{TEST_PREFIX}P30"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # 8 measurements at various paces/lactates covering a wide range
    data = [
        (0, 360, 1.0, 128), (1, 330, 1.5, 142), (2, 305, 2.2, 155),
        (3, 280, 3.2, 167), (4, 260, 4.5, 178), (5, 340, 1.3, 138),
        (6, 290, 2.8, 162), (7, 250, 5.5, 184),
    ]
    for w, p, l, hr in data:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="any", expected_lt2_status="any",
        expected_lt1_lactate_range=(0.5, 4.0), expected_lt2_lactate_range=(2.0, 6.0),
    )
    return spec, None, vf


def run_p31(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P31 Two tests, contradictory"""
    name = f"{TEST_PREFIX}P31"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # Test 1: LT2 at ~3.5 mmol
    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.8, "hr": 128}, {"p": 330, "l": 1.3, "hr": 140},
        {"p": 305, "l": 2.0, "hr": 153}, {"p": 280, "l": 3.0, "hr": 165},
        {"p": 260, "l": 3.5, "hr": 175}, {"p": 240, "l": 5.5, "hr": 187},
    ], "W0 test 1")

    # Test 2: LT2 at ~4.2 mmol (different conditions)
    add_test(db, aid, _dt(6), [
        {"p": 355, "l": 0.9, "hr": 130}, {"p": 325, "l": 1.5, "hr": 143},
        {"p": 300, "l": 2.3, "hr": 156}, {"p": 278, "l": 3.4, "hr": 168},
        {"p": 258, "l": 4.2, "hr": 179}, {"p": 240, "l": 6.8, "hr": 190},
    ], "W6 test 2")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, None, vf


def run_p32(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P32 Long gap between test and measurements"""
    name = f"{TEST_PREFIX}P32"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.8, "hr": 128}, {"p": 330, "l": 1.3, "hr": 140},
        {"p": 305, "l": 2.0, "hr": 153}, {"p": 280, "l": 3.1, "hr": 165},
        {"p": 260, "l": 4.3, "hr": 176}, {"p": 240, "l": 6.5, "hr": 188},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # No data until week 10
    for w, p, l, hr in [(10,300,1.9,150),(11,298,2.0,149),(12,296,1.8,148)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p33(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P33 Very dense data"""
    name = f"{TEST_PREFIX}P33"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.8, "hr": 128}, {"p": 330, "l": 1.3, "hr": 140},
        {"p": 305, "l": 2.0, "hr": 153}, {"p": 280, "l": 3.1, "hr": 165},
        {"p": 260, "l": 4.3, "hr": 176}, {"p": 240, "l": 6.5, "hr": 188},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # 15 measurements over 6 weeks (almost daily at ~LT1)
    import random
    random.seed(42)
    for i in range(15):
        w = i * 0.4  # spread across 6 weeks
        day = int(w * 7)
        p = 305 - i  # gradual improvement
        l = 1.9 + random.uniform(-0.2, 0.2)
        hr = 153 - i // 3
        add_qm(db, aid, _dt(0, day=day), [{"p": p, "l": round(l, 1), "hr": hr}], f"D{day}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p34(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P34 Single point per session, spread across range"""
    name = f"{TEST_PREFIX}P34"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # 10 measurements at different lactate levels to build full curve
    data = [
        (0, 380, 0.8, 122), (1, 350, 1.2, 135), (2, 325, 1.8, 148),
        (3, 305, 2.5, 158), (4, 285, 3.2, 167), (5, 270, 3.8, 174),
        (6, 255, 4.5, 180), (7, 240, 5.5, 186), (8, 345, 1.1, 133),
        (9, 295, 2.8, 162),
    ]
    for w, p, l, hr in data:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="any", expected_lt2_status="any",
        expected_lt1_lactate_range=(0.5, 4.0), expected_lt2_lactate_range=(2.0, 6.0),
    )
    return spec, None, vf


def run_p35(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P35 Mixed discipline data (running + cycling)"""
    name = f"{TEST_PREFIX}P35"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # Running test
    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.8, "hr": 128}, {"p": 330, "l": 1.3, "hr": 140},
        {"p": 305, "l": 2.0, "hr": 153}, {"p": 280, "l": 3.1, "hr": 165},
        {"p": 260, "l": 4.3, "hr": 176}, {"p": 240, "l": 6.5, "hr": 188},
    ], "W0 running test")
    # Running measurements
    for w, p, l, hr in [(2,303,1.9,152),(4,300,2.0,151),(6,298,1.8,150)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w} run")

    # Cycling test (different discipline, should not interfere)
    # Note: we check running discipline, so cycling is independent
    add_test(db, aid, _dt(1), [
        {"p": 0, "l": 0.9, "hr": 125}, {"p": 0, "l": 1.4, "hr": 138},
        {"p": 0, "l": 2.2, "hr": 152}, {"p": 0, "l": 3.5, "hr": 165},
        {"p": 0, "l": 5.0, "hr": 178}, {"p": 0, "l": 7.0, "hr": 190},
    ], "W1 cycling test", discipline="cycling")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, None, vf


def run_p36(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P36 Test with 10 stages"""
    name = f"{TEST_PREFIX}P36"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "competitive"); aid = a.id

    add_test(db, aid, _dt(0), [
        {"p": 400, "l": 0.6, "hr": 115}, {"p": 380, "l": 0.8, "hr": 122},
        {"p": 360, "l": 1.0, "hr": 130}, {"p": 340, "l": 1.3, "hr": 138},
        {"p": 320, "l": 1.7, "hr": 147}, {"p": 300, "l": 2.3, "hr": 155},
        {"p": 280, "l": 3.0, "hr": 164}, {"p": 260, "l": 4.2, "hr": 174},
        {"p": 245, "l": 5.8, "hr": 183}, {"p": 230, "l": 8.0, "hr": 192},
    ], "W0 detailed 10-stage test")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_lactate_range=(1.0, 2.5), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, None, vf


# ── Category 5: Threshold Behavior Edge Cases (37-44) ────────────────────────

def run_p37(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P37 Very flat LT1 curve"""
    name = f"{TEST_PREFIX}P37"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "competitive"); aid = a.id

    # Very flat sub-LT1: only 0.3 mmol total rise until LT2
    add_test(db, aid, _dt(0), [
        {"p": 330, "l": 0.8, "hr": 125}, {"p": 310, "l": 0.9, "hr": 135},
        {"p": 290, "l": 1.0, "hr": 145}, {"p": 275, "l": 1.1, "hr": 155},
        {"p": 260, "l": 2.0, "hr": 165}, {"p": 245, "l": 3.5, "hr": 175},
        {"p": 230, "l": 5.8, "hr": 186},
    ], "W0 flat LT1 curve")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="any",  # may be hard to detect
        expected_lt2_status="detectado",
        expected_lt1_lactate_range=(0.5, 2.5), expected_lt2_lactate_range=(2.0, 5.5),
    )
    return spec, None, vf


def run_p38(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P38 Very steep LT2 curve"""
    name = f"{TEST_PREFIX}P38"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # Explosive rise after 3.0 mmol
    add_test(db, aid, _dt(0), [
        {"p": 380, "l": 0.7, "hr": 122}, {"p": 350, "l": 1.1, "hr": 135},
        {"p": 325, "l": 1.6, "hr": 148}, {"p": 300, "l": 2.3, "hr": 158},
        {"p": 280, "l": 3.0, "hr": 168}, {"p": 265, "l": 5.5, "hr": 180},
        {"p": 250, "l": 9.0, "hr": 192},
    ], "W0 steep LT2")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_lactate_range=(1.0, 2.5), expected_lt2_lactate_range=(2.0, 5.5),
    )
    return spec, None, vf


def run_p39(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P39 LT1 and LT2 very close"""
    name = f"{TEST_PREFIX}P39"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "competitive"); aid = a.id

    # Trained athlete: LT1~2.5, LT2~3.2 (0.7 gap)
    add_test(db, aid, _dt(0), [
        {"p": 320, "l": 0.9, "hr": 128}, {"p": 300, "l": 1.5, "hr": 140},
        {"p": 280, "l": 2.2, "hr": 152}, {"p": 265, "l": 2.5, "hr": 160},
        {"p": 250, "l": 3.2, "hr": 170}, {"p": 238, "l": 4.5, "hr": 180},
        {"p": 225, "l": 6.5, "hr": 190},
    ], "W0 close thresholds")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_lactate_range=(1.5, 3.0), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, None, vf


def run_p40(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P40 LT1 and LT2 very far apart"""
    name = f"{TEST_PREFIX}P40"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "recreational"); aid = a.id

    # Untrained: LT1~1.5, LT2~5.0 (3.5 gap)
    add_test(db, aid, _dt(0), [
        {"p": 450, "l": 0.8, "hr": 118}, {"p": 420, "l": 1.2, "hr": 130},
        {"p": 390, "l": 1.5, "hr": 142}, {"p": 360, "l": 2.5, "hr": 155},
        {"p": 330, "l": 3.8, "hr": 168}, {"p": 300, "l": 5.0, "hr": 178},
        {"p": 280, "l": 7.5, "hr": 190},
    ], "W0 wide gap")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_lactate_range=(0.8, 2.5), expected_lt2_lactate_range=(3.0, 6.5),
    )
    return spec, None, vf


def run_p41(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P41 All lactates below 2.5"""
    name = f"{TEST_PREFIX}P41"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # Initial test to establish baseline
    add_test(db, aid, _dt(0), [
        {"p": 370, "l": 0.8, "hr": 125}, {"p": 340, "l": 1.2, "hr": 138},
        {"p": 315, "l": 1.8, "hr": 150}, {"p": 290, "l": 2.8, "hr": 162},
        {"p": 270, "l": 4.0, "hr": 174}, {"p": 250, "l": 6.0, "hr": 185},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # All subsequent measurements below 2.5 (easy sessions only)
    for w, p, l, hr in [(2,340,1.2,138),(4,335,1.3,137),(6,330,1.4,136),
                         (8,325,1.5,135),(10,320,1.6,134)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.5), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p42(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P42 All lactates above 3.0"""
    name = f"{TEST_PREFIX}P42"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # Initial test to establish baseline
    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.8, "hr": 125}, {"p": 330, "l": 1.3, "hr": 140},
        {"p": 305, "l": 2.0, "hr": 153}, {"p": 280, "l": 3.2, "hr": 165},
        {"p": 260, "l": 4.5, "hr": 176}, {"p": 240, "l": 6.5, "hr": 188},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # All subsequent measurements above 3.0 (hard sessions only)
    for w, p, l, hr in [(2,265,4.0,175),(4,262,3.8,174),(6,258,4.2,176),
                         (8,255,3.9,173),(10,252,4.1,174)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="improving",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p43(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P43 Monotonically increasing without clear break"""
    name = f"{TEST_PREFIX}P43"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # Linear increase from 1.0 to 6.0, no inflection
    add_test(db, aid, _dt(0), [
        {"p": 380, "l": 1.0, "hr": 125}, {"p": 355, "l": 1.8, "hr": 135},
        {"p": 330, "l": 2.6, "hr": 147}, {"p": 305, "l": 3.4, "hr": 158},
        {"p": 280, "l": 4.2, "hr": 170}, {"p": 260, "l": 5.0, "hr": 180},
        {"p": 240, "l": 6.0, "hr": 190},
    ], "W0 linear increase")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="any", expected_lt2_status="any",
        expected_lt1_lactate_range=(0.5, 4.0), expected_lt2_lactate_range=(2.0, 6.5),
    )
    return spec, None, vf


def run_p44(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P44 Step function curve"""
    name = f"{TEST_PREFIX}P44"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # Flat at 1.2 until stage 4, then jumps to 4.5
    add_test(db, aid, _dt(0), [
        {"p": 380, "l": 1.0, "hr": 125}, {"p": 350, "l": 1.1, "hr": 136},
        {"p": 325, "l": 1.2, "hr": 147}, {"p": 300, "l": 1.2, "hr": 158},
        {"p": 280, "l": 4.5, "hr": 175}, {"p": 260, "l": 7.0, "hr": 186},
    ], "W0 step function")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_lactate_range=(0.8, 2.5), expected_lt2_lactate_range=(2.0, 6.0),
    )
    return spec, None, vf


# ── Category 6: Realistic Complex Scenarios (45-50) ─────────────────────────

def run_p45(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P45 Marathon prep cycle"""
    name = f"{TEST_PREFIX}P45"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # W0: initial test
    add_test(db, aid, _dt(0), [
        {"p": 360, "l": 0.8, "hr": 128}, {"p": 330, "l": 1.3, "hr": 140},
        {"p": 305, "l": 2.0, "hr": 153}, {"p": 280, "l": 3.0, "hr": 165},
        {"p": 260, "l": 4.2, "hr": 176}, {"p": 240, "l": 6.5, "hr": 188},
    ], "W0 test")
    db.commit()
    vi = check_state(db, aid)

    # Weekly measurements showing aerobic improvement (16-week buildup)
    marathon_data = [
        # (week, pace, lactate, hr) — gradual improvement
        (1, 303, 2.0, 152), (2, 301, 1.9, 151), (3, 299, 2.0, 150),
        (4, 297, 1.8, 149), (5, 296, 1.9, 148), (6, 294, 1.8, 147),
        (7, 292, 1.9, 146), (8, 290, 1.7, 145), (9, 289, 1.8, 144),
        (10, 288, 1.7, 143), (11, 287, 1.8, 143), (12, 286, 1.7, 142),
        (13, 285, 1.8, 142),
        # W14: taper — slightly higher lactate (normal freshness response)
        (14, 282, 2.1, 140),
    ]
    for w, p, l, hr in marathon_data:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="improving", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p46(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P46 5K specialist"""
    name = f"{TEST_PREFIX}P46"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "competitive"); aid = a.id

    # High glycolytic: LT2 at 4.5 mmol, very fast
    add_test(db, aid, _dt(0), [
        {"p": 280, "l": 0.8, "hr": 130}, {"p": 260, "l": 1.3, "hr": 142},
        {"p": 245, "l": 2.0, "hr": 155}, {"p": 228, "l": 3.0, "hr": 167},
        {"p": 215, "l": 4.5, "hr": 179}, {"p": 200, "l": 7.0, "hr": 192},
    ], "W0 5K specialist test")
    db.commit()
    vi = check_state(db, aid)

    # Measurements confirming high threshold
    for w, p, l, hr in [(2,213,4.3,178),(4,212,4.5,179),(6,210,4.4,178),(8,209,4.5,178)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.8), expected_lt2_lactate_range=(2.5, 6.0),
    )
    return spec, vi, vf


def run_p47(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P47 Ironman athlete"""
    name = f"{TEST_PREFIX}P47"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "competitive"); aid = a.id

    # Very developed aerobic system: flat curve, LT1 at 2.0 @ 4:00/km, LT2 at 3.0
    add_test(db, aid, _dt(0), [
        {"p": 300, "l": 0.7, "hr": 120}, {"p": 280, "l": 0.9, "hr": 130},
        {"p": 260, "l": 1.3, "hr": 140}, {"p": 245, "l": 1.8, "hr": 150},
        {"p": 232, "l": 2.5, "hr": 160}, {"p": 220, "l": 3.0, "hr": 170},
        {"p": 210, "l": 4.2, "hr": 180}, {"p": 198, "l": 6.0, "hr": 190},
    ], "W0 Ironman test")
    db.commit()
    vi = check_state(db, aid)

    # Measurements at LT1 zone showing stability
    for w, p, l, hr in [(2,243,1.8,149),(4,241,1.7,148),(6,240,1.8,147),(8,239,1.7,147)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(1.0, 2.5), expected_lt2_lactate_range=(2.0, 5.0),
    )
    return spec, vi, vf


def run_p48(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P48 Comeback from injury"""
    name = f"{TEST_PREFIX}P48"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # Poor initial test (only 4 stages, slow)
    add_test(db, aid, _dt(0), [
        {"p": 420, "l": 1.2, "hr": 135}, {"p": 390, "l": 2.0, "hr": 148},
        {"p": 360, "l": 3.5, "hr": 165}, {"p": 340, "l": 5.5, "hr": 180},
    ], "W0 post-injury poor test")
    db.commit()
    vi = check_state(db, aid)

    # Gradually adds measurements as they rebuild
    for w, p, l, hr in [(2,400,1.8,142),(4,385,1.7,140),(6,370,1.6,137),
                         (8,358,1.5,135),(10,348,1.4,133),(12,340,1.3,131)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    # LT2-zone measurements too
    for w, p, l, hr in [(13,310,3.8,170),(14,305,3.7,168)]:
        add_qm(db, aid, _dt(w), [{"p": p, "l": l, "hr": hr}], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="any", expected_lt2_status="any",
        expected_lt1_direction="improving", expected_lt2_direction="any",
        expected_lt1_lactate_range=(0.8, 3.0), expected_lt2_lactate_range=(2.0, 6.0),
    )
    return spec, vi, vf


def run_p49(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P49 Cyclist switching to running"""
    name = f"{TEST_PREFIX}P49"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "trained"); aid = a.id

    # Good fitness but poor running economy initially
    add_test(db, aid, _dt(0), [
        {"p": 400, "l": 0.8, "hr": 125}, {"p": 370, "l": 1.3, "hr": 138},
        {"p": 345, "l": 2.0, "hr": 150}, {"p": 320, "l": 3.0, "hr": 162},
        {"p": 300, "l": 4.2, "hr": 174}, {"p": 280, "l": 6.0, "hr": 186},
    ], "W0 poor economy")
    db.commit()
    vi = check_state(db, aid)

    # Fast improvement in pace, same physiology (lactate/HR stable at each intensity)
    for w, p1, l1, h1, p2, l2, h2 in [
        (2, 335, 1.9, 148, 292, 4.0, 172),
        (4, 325, 1.8, 146, 285, 4.1, 171),
        (6, 315, 1.9, 144, 278, 3.9, 169),
        (8, 308, 1.8, 142, 272, 4.0, 168),
        (10, 302, 1.9, 140, 266, 4.1, 167),
        (12, 296, 1.8, 138, 260, 3.9, 165),
    ]:
        add_qm(db, aid, _dt(w), [
            {"p": p1, "l": l1, "hr": h1}, {"p": p2, "l": l2, "hr": h2},
        ], f"W{w}")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="detectado", expected_lt2_status="detectado",
        expected_lt1_direction="improving", expected_lt2_direction="improving",
        expected_lt1_lactate_range=(1.0, 2.5), expected_lt2_lactate_range=(2.5, 5.5),
    )
    return spec, vi, vf


def run_p50(db) -> tuple[ProfileSpec, Optional[dict], dict]:
    """P50 Youth athlete developing"""
    name = f"{TEST_PREFIX}P50"
    cleanup(db, name); db.commit()
    a = mk_athlete(db, name, "recreational"); aid = a.id

    # Immature metabolic profile: noisy, LT1 hard to detect
    add_test(db, aid, _dt(0), [
        {"p": 420, "l": 1.2, "hr": 135}, {"p": 390, "l": 1.8, "hr": 148},
        {"p": 370, "l": 2.5, "hr": 158}, {"p": 350, "l": 3.0, "hr": 168},
        {"p": 330, "l": 4.8, "hr": 180}, {"p": 310, "l": 7.0, "hr": 192},
    ], "W0 immature test")
    db.commit()
    vi = check_state(db, aid)

    # Gradually becoming more consistent
    # Early: noisy
    add_qm(db, aid, _dt(2), [{"p": 385, "l": 2.2, "hr": 152}], "W2 noisy")
    add_qm(db, aid, _dt(3), [{"p": 395, "l": 1.5, "hr": 145}], "W3 noisy")
    add_qm(db, aid, _dt(5), [{"p": 380, "l": 2.4, "hr": 155}], "W5 noisy")
    # Later: more consistent and improving
    add_qm(db, aid, _dt(7), [{"p": 370, "l": 1.8, "hr": 148}], "W7 cleaner")
    add_qm(db, aid, _dt(9), [{"p": 365, "l": 1.7, "hr": 146}], "W9 cleaner")
    add_qm(db, aid, _dt(11), [{"p": 358, "l": 1.6, "hr": 144}], "W11 cleaner")
    add_qm(db, aid, _dt(13), [{"p": 350, "l": 1.5, "hr": 142}], "W13 cleaner")
    db.commit()
    vf = check_state(db, aid)
    spec = default_spec(
        expected_lt1_status="any", expected_lt2_status="detectado",
        expected_lt1_direction="any", expected_lt2_direction="any",
        expected_lt1_lactate_range=(0.8, 3.5), expected_lt2_lactate_range=(2.0, 6.5),
    )
    return spec, vi, vf


# ── Profile registry ─────────────────────────────────────────────────────────

PROFILES = [
    ("P01", "Steady aerobic improvement", "Basic Improvement", run_p01),
    ("P02", "Steady LT2 improvement", "Basic Improvement", run_p02),
    ("P03", "Both thresholds improve together", "Basic Improvement", run_p03),
    ("P04", "Fast improver", "Basic Improvement", run_p04),
    ("P05", "Slow grinder", "Basic Improvement", run_p05),
    ("P06", "Plateau then breakthrough", "Basic Improvement", run_p06),
    ("P07", "Beginner with rapid initial gains", "Basic Improvement", run_p07),
    ("P08", "Elite athlete fine-tuning", "Basic Improvement", run_p08),
    ("P09", "VLamax dropping (aerobic block)", "Glycolytic/Metabolic", run_p09),
    ("P10", "VLamax rising (speed block)", "Glycolytic/Metabolic", run_p10),
    ("P11", "LT1 improves, LT2 stable", "Glycolytic/Metabolic", run_p11),
    ("P12", "LT2 improves, LT1 stable", "Glycolytic/Metabolic", run_p12),
    ("P13", "Curve flattening (elite endurance)", "Glycolytic/Metabolic", run_p13),
    ("P14", "Curve steepening (detraining)", "Glycolytic/Metabolic", run_p14),
    ("P15", "Rightward shift with efficiency", "Glycolytic/Metabolic", run_p15),
    ("P16", "Same pace lower lactate (economy)", "Glycolytic/Metabolic", run_p16),
    ("P17", "Bad day measurement", "Adverse/Noise", run_p17),
    ("P18", "Two bad days in a row", "Adverse/Noise", run_p18),
    ("P19", "Altitude camp effect", "Adverse/Noise", run_p19),
    ("P20", "Hot day measurement", "Adverse/Noise", run_p20),
    ("P21", "Inconsistent protocol", "Adverse/Noise", run_p21),
    ("P22", "Noisy data (+/-0.3 jitter)", "Adverse/Noise", run_p22),
    ("P23", "Outlier measurement (8.0 mmol)", "Adverse/Noise", run_p23),
    ("P24", "Illness recovery", "Adverse/Noise", run_p24),
    ("P25", "Overtraining signal", "Adverse/Noise", run_p25),
    ("P26", "Dehydration artifact", "Adverse/Noise", run_p26),
    ("P27", "Only 1 good test (7 stages)", "Data Availability", run_p27),
    ("P28", "Only 1 poor test (3 stages)", "Data Availability", run_p28),
    ("P29", "Only 1 medium test (5 stages)", "Data Availability", run_p29),
    ("P30", "Only quick measurements, no test", "Data Availability", run_p30),
    ("P31", "Two tests, contradictory", "Data Availability", run_p31),
    ("P32", "Long gap between test and data", "Data Availability", run_p32),
    ("P33", "Very dense data (15 measurements)", "Data Availability", run_p33),
    ("P34", "Single point spread across range", "Data Availability", run_p34),
    ("P35", "Mixed discipline (run + cycle)", "Data Availability", run_p35),
    ("P36", "Test with 10 stages", "Data Availability", run_p36),
    ("P37", "Very flat LT1 curve", "Edge Cases", run_p37),
    ("P38", "Very steep LT2 curve", "Edge Cases", run_p38),
    ("P39", "LT1 and LT2 very close", "Edge Cases", run_p39),
    ("P40", "LT1 and LT2 very far apart", "Edge Cases", run_p40),
    ("P41", "All lactates below 2.5", "Edge Cases", run_p41),
    ("P42", "All lactates above 3.0", "Edge Cases", run_p42),
    ("P43", "Monotonic increase no break", "Edge Cases", run_p43),
    ("P44", "Step function curve", "Edge Cases", run_p44),
    ("P45", "Marathon prep cycle (16w)", "Complex Scenarios", run_p45),
    ("P46", "5K specialist", "Complex Scenarios", run_p46),
    ("P47", "Ironman athlete", "Complex Scenarios", run_p47),
    ("P48", "Comeback from injury", "Complex Scenarios", run_p48),
    ("P49", "Cyclist switching to running", "Complex Scenarios", run_p49),
    ("P50", "Youth athlete developing", "Complex Scenarios", run_p50),
]


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 72)
    print("  THRESHOLD ANCHOR SYSTEM - 50 PROFILE VALIDATION BATTERY")
    print("=" * 72)

    db = SessionLocal()
    results: list[tuple[str, str, str, list[str]]] = []  # (id, desc, cat, failures)

    for idx, (pid, desc, cat, fn) in enumerate(PROFILES, 1):
        name = f"{TEST_PREFIX}{pid}"
        print(f"\n[{idx}/50] {pid} ({cat})")
        print(f"  {desc}")
        try:
            spec, vi, vf = fn(db)
            lt1, lt2, anchor = extract_thresholds(vf)

            # Print initial state if available
            if vi is not None:
                lt1_i, lt2_i, anchor_i = extract_thresholds(vi)
                lt1_il = lt1_i.get("lactate")
                lt1_ip = lt1_i.get("pace_seconds_per_km")
                lt2_il = lt2_i.get("lactate")
                lt2_ip = lt2_i.get("pace_seconds_per_km")
                st_i = anchor_i.get("lt1_status", "?").upper() + "/" + anchor_i.get("lt2_status", "?").upper()
                print(f"  Initial:  LT1 {lt1_il:.2f}mmol @ {_pace_str(lt1_ip)} | LT2 {lt2_il:.2f}mmol @ {_pace_str(lt2_ip)} | {st_i}" if lt1_il and lt2_il else f"  Initial:  LT1 {'N/A' if not lt1_il else f'{lt1_il:.2f}'} | LT2 {'N/A' if not lt2_il else f'{lt2_il:.2f}'} | {st_i}")

            lt1_fl = lt1.get("lactate")
            lt1_fp = lt1.get("pace_seconds_per_km")
            lt2_fl = lt2.get("lactate")
            lt2_fp = lt2.get("pace_seconds_per_km")
            st_f = anchor.get("lt1_status", "?").upper() + "/" + anchor.get("lt2_status", "?").upper()
            print(f"  Final:    LT1 {lt1_fl:.2f}mmol @ {_pace_str(lt1_fp)} | LT2 {lt2_fl:.2f}mmol @ {_pace_str(lt2_fp)} | {st_f}" if lt1_fl and lt2_fl else f"  Final:    LT1 {'N/A' if not lt1_fl else f'{lt1_fl:.2f}'} | LT2 {'N/A' if not lt2_fl else f'{lt2_fl:.2f}'} | {st_f}")

            failures = validate_profile(spec, vi, vf)
            for f in failures:
                print(f"  X {f}")
            if not failures:
                print("  PASS")
            else:
                print(f"  FAIL ({len(failures)} issue(s))")
            results.append((pid, desc, cat, failures))

        except Exception as e:
            print(f"  ERROR: {e}")
            traceback.print_exc()
            results.append((pid, desc, cat, [f"EXCEPTION: {e}"]))
            db.rollback()
        finally:
            # Cleanup this profile
            try:
                cleanup(db, name)
                db.commit()
            except Exception:
                db.rollback()

    # ── Summary ──────────────────────────────────────────────────────────
    passed = sum(1 for _, _, _, f in results if not f)
    failed = sum(1 for _, _, _, f in results if f)

    print("\n" + "=" * 72)
    print(f"  RESULTS: {passed}/50 PASS, {failed}/50 FAIL")
    print("=" * 72)

    if failed:
        print("\nFAILED:")
        for pid, desc, cat, failures in results:
            if failures:
                print(f"  {pid} ({desc}):")
                for f in failures:
                    print(f"    - {f}")

    # Category breakdown
    cats: dict[str, list[bool]] = {}
    for _, _, cat, failures in results:
        cats.setdefault(cat, []).append(not failures)
    print("\nBy category:")
    for cat, bools in cats.items():
        p = sum(bools)
        t = len(bools)
        print(f"  {cat}: {p}/{t}")

    print("\n" + "=" * 72)
    print("  BATTERY COMPLETE")
    print("=" * 72)

    db.close()
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
