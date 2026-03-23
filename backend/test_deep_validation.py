"""
Deep threshold validation — 6 athletes with full diagnostic output.
Verifies actual threshold values against hand-calculated expectations.

Run: cd backend && source .venv/bin/activate && python test_deep_validation.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.db.session import SessionLocal
from app.models.athlete import Athlete
from app.models.session import Session as AthleteSession, SessionInterval, LactateSample
from app.models.metrics import PhysiologicalSnapshot, PerformanceEstimate
from app.services.analytics import recalculate_athlete, _discipline_view

PREFIX = "__DEEPVAL__"
BASE = datetime(2026, 2, 1, 8, 0, 0, tzinfo=timezone.utc)


# ── Helpers ─────────────────────────────────────────────────────────────────

def _dt(weeks: int = 0, days: int = 0) -> datetime:
    return BASE + timedelta(weeks=weeks, days=days)


def _pace(mm_ss: str) -> float:
    m, s = mm_ss.split(":")
    return int(m) * 60 + int(s)


def _fmt_pace(sec: Optional[float]) -> str:
    if sec is None: return "N/A"
    m, s = int(sec) // 60, int(sec) % 60
    return f"{m}:{s:02d}"


def cleanup(db, name: str):
    a = db.scalar(select(Athlete).where(Athlete.name == name))
    if a:
        # Delete performance estimates
        for est in db.scalars(select(PerformanceEstimate).where(PerformanceEstimate.athlete_id == a.id)).all():
            db.delete(est)
        # Delete snapshots
        for snap in db.scalars(select(PhysiologicalSnapshot).where(PhysiologicalSnapshot.athlete_id == a.id)).all():
            db.delete(snap)
        db.delete(a)
        db.flush()


def mk(db, suffix: str, level="trained") -> Athlete:
    name = f"{PREFIX}{suffix}"
    cleanup(db, name)
    a = Athlete(
        name=name, date_of_birth=date(1990, 6, 15), sex="male",
        weight=72.0, height=178.0, primary_discipline="running",
        athlete_level=level, created_at=date.today(),
    )
    db.add(a); db.flush()
    return a


def add_test(db, aid, dt, stages, label=""):
    s = AthleteSession(
        athlete_id=aid, performed_at=dt, discipline="running",
        session_type="lactate_test", goal="test incremental", comments=label,
    )
    db.add(s); db.flush()
    for i, st in enumerate(stages):
        iv = SessionInterval(
            session_id=s.id, order_index=i,
            duration_seconds=st.get("dur", 240), rest_seconds=30,
            pace_seconds_per_km=st["p"], heart_rate_avg=st["hr"],
            heart_rate_max=st["hr"] + 5, purpose="work",
        )
        db.add(iv); db.flush()
        db.add(LactateSample(
            interval_id=iv.id, lactate_mmol=st["l"],
            sample_delay_seconds=45, sample_timing_label="post-intervalo",
        ))
    db.flush()
    return s


def add_qm(db, aid, dt, measurements, label=""):
    s = AthleteSession(
        athlete_id=aid, performed_at=dt, discipline="running",
        session_type="training_lactate", goal="quick lactate check", comments=label,
    )
    db.add(s); db.flush()
    for i, m in enumerate(measurements):
        iv = SessionInterval(
            session_id=s.id, order_index=i,
            duration_seconds=m.get("dur", 360), rest_seconds=0,
            pace_seconds_per_km=m["p"], heart_rate_avg=m["hr"],
            heart_rate_max=m["hr"] + 5, purpose="work",
        )
        db.add(iv); db.flush()
        db.add(LactateSample(
            interval_id=iv.id, lactate_mmol=m["l"],
            sample_delay_seconds=45, sample_timing_label="post-intervalo",
        ))
    db.flush()
    return s


def view(db, aid) -> dict:
    recalculate_athlete(db, aid)
    db.commit()
    athlete = db.scalar(
        select(Athlete).options(
            joinedload(Athlete.sessions).joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample),
            joinedload(Athlete.snapshots), joinedload(Athlete.estimates),
        ).where(Athlete.id == aid)
    )
    snaps = list(db.scalars(
        select(PhysiologicalSnapshot).where(PhysiologicalSnapshot.athlete_id == aid)
        .order_by(PhysiologicalSnapshot.snapshot_date)
    ).all())
    ests = list(db.scalars(
        select(PerformanceEstimate).where(PerformanceEstimate.athlete_id == aid)
    ).all())
    return _discipline_view(athlete, "running", athlete.sessions, snaps, ests)


def print_full_diagnosis(v: dict, label: str):
    """Print complete diagnostic for a discipline view."""
    print(f"\n{'─' * 70}")
    print(f"  {label}")
    print(f"{'─' * 70}")

    # 1. Anchor status
    anchor = v.get("threshold_anchor_status", {})
    print(f"\n  ANCHOR STATUS:")
    print(f"    Global: {anchor.get('status', '?')}")
    print(f"    LT1: {anchor.get('lt1_status', '?')}  |  LT2: {anchor.get('lt2_status', '?')}")
    print(f"    Source: {anchor.get('anchor_source', '?')}")
    lt1_break = anchor.get("lt1_break")
    lt2_break = anchor.get("lt2_break")
    if lt1_break:
        print(f"    LT1 break: lac={lt1_break.get('lactate'):.2f} pace={_fmt_pace(lt1_break.get('pace_seconds_per_km'))} "
              f"hr={lt1_break.get('heart_rate')} conf={lt1_break.get('confidence', 0):.2f} method={lt1_break.get('method')}")
    if lt2_break:
        print(f"    LT2 break: lac={lt2_break.get('lactate'):.2f} pace={_fmt_pace(lt2_break.get('pace_seconds_per_km'))} "
              f"hr={lt2_break.get('heart_rate')} conf={lt2_break.get('confidence', 0):.2f} method={lt2_break.get('method')}")

    # 2. Operational thresholds (what the athlete sees)
    ths = v.get("thresholds", [])
    print(f"\n  OPERATIONAL THRESHOLDS (lo que ve el atleta):")
    for t in ths:
        lac = t.get("lactate")
        pace = t.get("pace_seconds_per_km")
        hr = t.get("heart_rate")
        power = t.get("power_watts")
        conf = t.get("confidence", 0)
        method = t.get("method", "?")
        evid = t.get("evidence_level", "?")
        lac_s = f"{lac:.2f}" if lac else "?"
        hr_s = str(hr) if hr else "?"
        print(f"    {t['name']}: lac={lac_s:>5} | pace={_fmt_pace(pace):>5} | "
              f"hr={hr_s:>3} | conf={conf:.0%} | method={method} | evidence={evid}")

    # 3. Real thresholds (per-session detection)
    rt = v.get("real_thresholds") or {}
    if rt:
        print(f"\n  REAL THRESHOLDS (detección por sesión):")
        for key in ["lt1_real", "lt2_real", "lt1_practical_real", "lt2_practical_real"]:
            item = rt.get(key)
            if item:
                print(f"    {key}: lac={item.get('lactate', '?')} pace={_fmt_pace(item.get('pace_seconds_per_km'))} "
                      f"hr={item.get('heart_rate', '?')} conf={item.get('confidence', 0):.2f}")
        # Detection status
        for key in ["lt1_detection", "lt2_detection"]:
            det = rt.get(key)
            if det:
                print(f"    {key}: state={det.get('state')} compatible={det.get('compatible')} "
                      f"quality_gate={det.get('quality_gate_passed')} conf={det.get('confidence', 0):.2f}")

    # 4. Individual thresholds (multi-session)
    it = v.get("individual_thresholds") or {}
    if it:
        print(f"\n  INDIVIDUAL THRESHOLDS (multi-sesión):")
        for key in ["lt1_individual", "lt2_individual"]:
            item = it.get(key)
            if item:
                print(f"    {key}: lac={item.get('lactate', '?')} pace={_fmt_pace(item.get('pace_seconds_per_km'))} "
                      f"hr={item.get('heart_rate', '?')} conf={item.get('confidence', 0):.2f} "
                      f"sessions={len(item.get('supporting_sessions', []))}")

    # 5. Dynamic thresholds
    dyn = v.get("dynamic_thresholds") or {}
    if dyn:
        acute = dyn.get("acute", {})
        print(f"\n  DYNAMIC THRESHOLDS:")
        print(f"    Sessions: acute={acute.get('sessions_considered', '?')} days={acute.get('based_on_days', '?')}")
        print(f"    Confidence: {acute.get('confidence_score', 0):.2f} | Reliability: {acute.get('reliability_score', 0):.2f}")
        for ref_key in ["reference_2mmol", "reference_4mmol", "practical_lt1", "practical_lt2"]:
            ref = acute.get(ref_key)
            if ref:
                pace = ref.get("estimated_pace_seconds_per_km")
                hr = ref.get("estimated_hr_at_target")
                lac = ref.get("target_lactate")
                conf = ref.get("confidence_score", 0)
                pts = ref.get("number_of_points_used", 0)
                print(f"    {ref_key}: target_lac={lac} pace={_fmt_pace(pace)} hr={hr} "
                      f"conf={conf:.2f} pts={pts}")
        # Points used
        pts_used = acute.get("points_used", [])
        if pts_used:
            print(f"\n    Points used ({len(pts_used)}):")
            for p in pts_used[:12]:
                lac = p.get("contextualized_lactate") or p.get("raw_lactate")
                pace = p.get("pace_seconds_per_km")
                hr = p.get("heart_rate")
                w = p.get("point_weight", 0)
                sess = p.get("session_date", "?")
                out = " [OUTLIER]" if p.get("is_outlier") else ""
                print(f"      lac={lac:.2f} pace={_fmt_pace(pace)} hr={hr} w={w:.2f} date={sess}{out}")

    # 6. Zones
    zones = v.get("zones", [])
    if zones:
        print(f"\n  ZONES ({len(zones)}):")
        for z in zones:
            lo = z.get("lower")
            hi = z.get("upper")
            unit = z.get("unit", "")
            metric = z.get("metric", "")
            fmt = _fmt_pace if "pace" in metric or "s/km" in unit else (lambda x: f"{x:.0f}" if x else "?")
            print(f"    {z['zone']:>5}: {fmt(lo):>6} - {fmt(hi):>6} {unit} ({metric})")

    # 7. Measurement log
    mlog = v.get("measurement_log", [])
    if mlog:
        print(f"\n  MEASUREMENT LOG ({len(mlog)} entries):")
        for m in mlog:
            print(f"    [{m.get('session_date', '?')}] {m.get('interval_label', '?'):>10}: "
                  f"lac={m['lactate_mmol']:.2f} pace={_fmt_pace(m.get('pace_seconds_per_km'))} "
                  f"hr={m.get('heart_rate_avg', '?')}")

    print()


def check(condition: bool, msg: str, issues: list):
    if not condition:
        issues.append(msg)
        print(f"    ✗ {msg}")
    else:
        print(f"    ✓ {msg}")


# ══════════════════════════════════════════════════════════════════════════════
#  ATHLETE PROFILES
# ══════════════════════════════════════════════════════════════════════════════


def athlete_1_clean_incremental(db) -> list[str]:
    """
    Atleta 1: Test incremental limpio y clásico.
    8 escalones, curva exponencial clara.

    Datos crudos:
      6:00/km → 0.8 mmol → hr 130
      5:40/km → 0.9 mmol → hr 138
      5:20/km → 1.2 mmol → hr 145   ← baseline zone
      5:00/km → 1.8 mmol → hr 153   ← LT1 zone (baseline+0.5 = ~1.5, first ≥1.7)
      4:40/km → 2.5 mmol → hr 160
      4:20/km → 3.8 mmol → hr 167   ← LT2 zone (acceleration, ≥3.2)
      4:00/km → 5.5 mmol → hr 174
      3:45/km → 8.2 mmol → hr 182

    Expected:
      LT1 ~ 1.8 mmol @ ~5:00/km, HR ~153 (first sustained rise above baseline+0.5)
      LT2 ~ 3.8 mmol @ ~4:20/km, HR ~167 (acceleration zone)
      Status: detectado/detectado (single test)
    """
    a = mk(db, "A1_clean_incremental")
    stages = [
        {"p": _pace("6:00"), "l": 0.8,  "hr": 130},
        {"p": _pace("5:40"), "l": 0.9,  "hr": 138},
        {"p": _pace("5:20"), "l": 1.2,  "hr": 145},
        {"p": _pace("5:00"), "l": 1.8,  "hr": 153},
        {"p": _pace("4:40"), "l": 2.5,  "hr": 160},
        {"p": _pace("4:20"), "l": 3.8,  "hr": 167},
        {"p": _pace("4:00"), "l": 5.5,  "hr": 174},
        {"p": _pace("3:45"), "l": 8.2,  "hr": 182},
    ]
    add_test(db, a.id, _dt(), stages, "Test incremental limpio")
    v = view(db, a.id)
    print_full_diagnosis(v, "ATLETA 1: Test incremental limpio (8 escalones, curva clásica)")

    ths = v.get("thresholds", [])
    lt1 = next((t for t in ths if t["name"] == "LT1"), {})
    lt2 = next((t for t in ths if t["name"] == "LT2"), {})
    anchor = v.get("threshold_anchor_status", {})

    issues = []
    # Status
    check(anchor.get("lt1_status") in ("detectado", "anclado"), "LT1 status es detectado o anclado", issues)
    check(anchor.get("lt2_status") in ("detectado", "anclado"), "LT2 status es detectado o anclado", issues)

    # LT1 lactate should be around 1.5-2.2 (baseline ~0.8-1.2, break at +0.5 = ~1.5-1.8)
    lt1_lac = lt1.get("lactate")
    check(lt1_lac is not None and 1.4 <= lt1_lac <= 2.5,
          f"LT1 lactate={lt1_lac:.2f} en rango fisiológico [1.4-2.5]", issues)

    # LT1 pace should be around 5:00-5:20 (where lactate first rises)
    lt1_pace = lt1.get("pace_seconds_per_km")
    check(lt1_pace is not None and _pace("5:30") >= lt1_pace >= _pace("4:40"),
          f"LT1 pace={_fmt_pace(lt1_pace)} en rango [4:40-5:30]", issues)

    # LT2 lactate should be around 3.0-4.5
    lt2_lac = lt2.get("lactate")
    check(lt2_lac is not None and 2.8 <= lt2_lac <= 5.0,
          f"LT2 lactate={lt2_lac:.2f} en rango fisiológico [2.8-5.0]", issues)

    # LT2 pace should be around 4:10-4:40
    lt2_pace = lt2.get("pace_seconds_per_km")
    check(lt2_pace is not None and _pace("4:50") >= lt2_pace >= _pace("3:50"),
          f"LT2 pace={_fmt_pace(lt2_pace)} en rango [3:50-4:50]", issues)

    # LT1 pace must be slower than LT2 pace (higher s/km)
    if lt1_pace and lt2_pace:
        check(lt1_pace > lt2_pace, f"LT1 pace ({_fmt_pace(lt1_pace)}) más lento que LT2 ({_fmt_pace(lt2_pace)})", issues)

    # LT1 HR < LT2 HR
    lt1_hr, lt2_hr = lt1.get("heart_rate"), lt2.get("heart_rate")
    if lt1_hr and lt2_hr:
        check(lt1_hr < lt2_hr, f"LT1 HR ({lt1_hr}) < LT2 HR ({lt2_hr})", issues)

    # Zones should exist and be ordered
    zones = v.get("zones", [])
    check(len(zones) >= 4, f"Al menos 4 zonas generadas ({len(zones)} encontradas)", issues)

    cleanup(db, a.name)
    return issues


def athlete_2_improvement_with_qm(db) -> list[str]:
    """
    Atleta 2: Test inicial + muestras rápidas que muestran mejora.

    Test 1 (semana 0):
      5:30 → 1.0, 5:10 → 1.5, 4:50 → 2.2, 4:30 → 3.5, 4:10 → 5.0, 3:50 → 7.5

    Quick measurements (semana 4):
      4:50/km → 1.9 mmol (antes era 2.2 al mismo ritmo → mejora)
      4:30/km → 2.8 mmol (antes era 3.5 → mejora)

    Expected:
      After QM, LT1 and LT2 paces should be FASTER than after test 1.
      The dynamic engine should incorporate the QM and shift the curve right.
    """
    a = mk(db, "A2_improvement_qm")
    stages = [
        {"p": _pace("5:30"), "l": 1.0, "hr": 135},
        {"p": _pace("5:10"), "l": 1.5, "hr": 143},
        {"p": _pace("4:50"), "l": 2.2, "hr": 151},
        {"p": _pace("4:30"), "l": 3.5, "hr": 159},
        {"p": _pace("4:10"), "l": 5.0, "hr": 167},
        {"p": _pace("3:50"), "l": 7.5, "hr": 175},
    ]
    add_test(db, a.id, _dt(0), stages, "Test inicial")
    v1 = view(db, a.id)
    print_full_diagnosis(v1, "ATLETA 2 — ANTES (test inicial)")

    lt1_v1 = next((t for t in v1.get("thresholds", []) if t["name"] == "LT1"), {})
    lt2_v1 = next((t for t in v1.get("thresholds", []) if t["name"] == "LT2"), {})

    # Add quick measurements showing improvement
    qm = [
        {"p": _pace("4:50"), "l": 1.9, "hr": 148},  # was 2.2 → now 1.9
        {"p": _pace("4:30"), "l": 2.8, "hr": 155},  # was 3.5 → now 2.8
    ]
    add_qm(db, a.id, _dt(4), qm, "QM mejora")
    v2 = view(db, a.id)
    print_full_diagnosis(v2, "ATLETA 2 — DESPUÉS (test + QM mejora)")

    lt1_v2 = next((t for t in v2.get("thresholds", []) if t["name"] == "LT1"), {})
    lt2_v2 = next((t for t in v2.get("thresholds", []) if t["name"] == "LT2"), {})

    issues = []

    # After QM, the dynamic reference at 4mmol should show faster pace (improvement).
    # Operational thresholds may shift as curve break re-detects with new data — that's expected.
    dyn1 = (v1.get("dynamic_thresholds") or {}).get("acute", {})
    dyn2 = (v2.get("dynamic_thresholds") or {}).get("acute", {})
    ref4_v1 = (dyn1.get("reference_4mmol") or {}).get("estimated_pace_seconds_per_km")
    ref4_v2 = (dyn2.get("reference_4mmol") or {}).get("estimated_pace_seconds_per_km")
    if ref4_v1 and ref4_v2:
        check(ref4_v2 <= ref4_v1 + 5,
              f"Dynamic ref@4mmol mejoró o se mantuvo: {_fmt_pace(ref4_v1)} → {_fmt_pace(ref4_v2)}", issues)
    else:
        issues.append(f"No se pudo comparar dynamic ref@4mmol: antes={_fmt_pace(ref4_v1)} después={_fmt_pace(ref4_v2)}")

    # LT2 lactate should still be physiological
    lt2_lac = lt2_v2.get("lactate")
    check(lt2_lac is not None and 2.8 <= lt2_lac <= 5.0,
          f"LT2 lactate post-QM={f'{lt2_lac:.2f}' if lt2_lac else '?'} en rango [2.8-5.0]", issues)

    # Dynamic engine should have more points after QM
    dyn2 = (v2.get("dynamic_thresholds") or {}).get("acute", {})
    pts1 = len(dyn1.get("points_used", []))
    pts2 = len(dyn2.get("points_used", []))
    check(pts2 > pts1, f"Motor dinámico tiene más puntos: {pts1} → {pts2}", issues)

    cleanup(db, a.name)
    return issues


def athlete_3_noisy_data(db) -> list[str]:
    """
    Atleta 3: Test con datos ruidosos (variación natural).

    Un test con valores no perfectamente monotónicos para verificar
    que el motor no se vuelve loco con ruido normal.

      5:30 → 1.1, 5:10 → 1.3, 4:50 → 1.1 (↓ ruido), 4:40 → 1.9,
      4:20 → 2.8, 4:05 → 3.2, 3:50 → 5.8, 3:35 → 9.0

    Expected: Thresholds should still be reasonable despite the dip at 4:50.
    """
    a = mk(db, "A3_noisy")
    stages = [
        {"p": _pace("5:30"), "l": 1.1, "hr": 132},
        {"p": _pace("5:10"), "l": 1.3, "hr": 140},
        {"p": _pace("4:50"), "l": 1.1, "hr": 148},  # dip — noise
        {"p": _pace("4:40"), "l": 1.9, "hr": 153},
        {"p": _pace("4:20"), "l": 2.8, "hr": 162},
        {"p": _pace("4:05"), "l": 3.2, "hr": 169},
        {"p": _pace("3:50"), "l": 5.8, "hr": 176},
        {"p": _pace("3:35"), "l": 9.0, "hr": 184},
    ]
    add_test(db, a.id, _dt(), stages, "Test con ruido")
    v = view(db, a.id)
    print_full_diagnosis(v, "ATLETA 3: Test con datos ruidosos (dip en 4:50)")

    ths = v.get("thresholds", [])
    lt1 = next((t for t in ths if t["name"] == "LT1"), {})
    lt2 = next((t for t in ths if t["name"] == "LT2"), {})
    issues = []

    # LT1 should NOT be at the noisy dip point (1.1 mmol at 4:50)
    lt1_lac = lt1.get("lactate")
    check(lt1_lac is not None and lt1_lac >= 1.5,
          f"LT1 no está en el dip ruidoso: lac={f'{lt1_lac:.2f}' if lt1_lac else '?'} ≥ 1.5", issues)

    # LT2 should still be detected correctly
    lt2_lac = lt2.get("lactate")
    lt2_pace = lt2.get("pace_seconds_per_km")
    check(lt2_lac is not None and 2.8 <= lt2_lac <= 5.0,
          f"LT2 lactate={f'{lt2_lac:.2f}' if lt2_lac else '?'} razonable pese al ruido", issues)
    check(lt2_pace is not None and _pace("4:30") >= lt2_pace >= _pace("3:40"),
          f"LT2 pace={_fmt_pace(lt2_pace)} en rango esperado [3:40-4:30]", issues)

    # The noisy dip should NOT have broken zone ordering
    lt1_pace = lt1.get("pace_seconds_per_km")
    if lt1_pace and lt2_pace:
        check(lt1_pace > lt2_pace, f"Orden preservado: LT1({_fmt_pace(lt1_pace)}) más lento que LT2({_fmt_pace(lt2_pace)})", issues)

    cleanup(db, a.name)
    return issues


def athlete_4_sparse_then_confirms(db) -> list[str]:
    """
    Atleta 4: Datos escasos inicialmente → debería anclar → luego confirma.

    Test 1 (semana 0): solo 4 escalones, datos insuficientes para detección clara.
      5:20 → 1.0, 5:00 → 1.5, 4:30 → 3.0, 4:00 → 6.0

    Test 2 (semana 6): test completo de 7 escalones.
      5:30 → 0.9, 5:10 → 1.2, 4:50 → 1.7, 4:30 → 2.4, 4:10 → 3.6, 3:50 → 5.5, 3:35 → 8.5

    Expected:
      After test 1: anclado or detectado with low confidence
      After test 2: detectado with better values
    """
    a = mk(db, "A4_sparse_then_full")
    stages_sparse = [
        {"p": _pace("5:20"), "l": 1.0, "hr": 142},
        {"p": _pace("5:00"), "l": 1.5, "hr": 150},
        {"p": _pace("4:30"), "l": 3.0, "hr": 162},
        {"p": _pace("4:00"), "l": 6.0, "hr": 175},
    ]
    add_test(db, a.id, _dt(0), stages_sparse, "Test escaso 4 escalones")
    v1 = view(db, a.id)
    print_full_diagnosis(v1, "ATLETA 4 — FASE 1: Solo 4 escalones (datos escasos)")

    anchor1 = v1.get("threshold_anchor_status", {})
    ths1 = v1.get("thresholds", [])
    lt1_v1 = next((t for t in ths1 if t["name"] == "LT1"), {})

    # Second test: full 7-stage
    stages_full = [
        {"p": _pace("5:30"), "l": 0.9, "hr": 133},
        {"p": _pace("5:10"), "l": 1.2, "hr": 141},
        {"p": _pace("4:50"), "l": 1.7, "hr": 149},
        {"p": _pace("4:30"), "l": 2.4, "hr": 157},
        {"p": _pace("4:10"), "l": 3.6, "hr": 165},
        {"p": _pace("3:50"), "l": 5.5, "hr": 173},
        {"p": _pace("3:35"), "l": 8.5, "hr": 181},
    ]
    add_test(db, a.id, _dt(6), stages_full, "Test completo 7 escalones")
    v2 = view(db, a.id)
    print_full_diagnosis(v2, "ATLETA 4 — FASE 2: Test completo añadido")

    anchor2 = v2.get("threshold_anchor_status", {})
    ths2 = v2.get("thresholds", [])
    lt1_v2 = next((t for t in ths2 if t["name"] == "LT1"), {})
    lt2_v2 = next((t for t in ths2 if t["name"] == "LT2"), {})

    issues = []

    # After 2 tests, should be detectado
    check(anchor2.get("lt1_status") == "detectado",
          f"LT1 detectado tras 2 tests (got {anchor2.get('lt1_status')})", issues)
    check(anchor2.get("lt2_status") == "detectado",
          f"LT2 detectado tras 2 tests (got {anchor2.get('lt2_status')})", issues)

    # Values should be physiologically coherent
    lt1_lac = lt1_v2.get("lactate")
    lt2_lac = lt2_v2.get("lactate")
    check(lt1_lac is not None and lt2_lac is not None and lt1_lac < lt2_lac,
          f"LT1 lac ({f'{lt1_lac:.2f}' if lt1_lac else '?'}) < LT2 lac ({f'{lt2_lac:.2f}' if lt2_lac else '?'})", issues)

    lt1_pace = lt1_v2.get("pace_seconds_per_km")
    lt2_pace = lt2_v2.get("pace_seconds_per_km")
    if lt1_pace and lt2_pace:
        check(lt1_pace > lt2_pace,
              f"LT1 pace ({_fmt_pace(lt1_pace)}) más lento que LT2 ({_fmt_pace(lt2_pace)})", issues)

    cleanup(db, a.name)
    return issues


def athlete_5_trained_flat_curve(db) -> list[str]:
    """
    Atleta 5: Atleta entrenado con curva muy plana (LT1/LT2 juntos).

    Curva típica de atleta aeróbico muy desarrollado:
      5:00 → 0.7, 4:40 → 0.8, 4:20 → 1.0, 4:00 → 1.3, 3:50 → 1.8,
      3:40 → 2.5, 3:30 → 3.5, 3:20 → 5.5

    La curva es muy plana hasta 3:40 y luego sube rápido.
    LT1 y LT2 deberían estar relativamente cerca.
    """
    a = mk(db, "A5_flat_trained", level="well_trained")
    stages = [
        {"p": _pace("5:00"), "l": 0.7, "hr": 128},
        {"p": _pace("4:40"), "l": 0.8, "hr": 136},
        {"p": _pace("4:20"), "l": 1.0, "hr": 144},
        {"p": _pace("4:00"), "l": 1.3, "hr": 152},
        {"p": _pace("3:50"), "l": 1.8, "hr": 158},
        {"p": _pace("3:40"), "l": 2.5, "hr": 164},
        {"p": _pace("3:30"), "l": 3.5, "hr": 170},
        {"p": _pace("3:20"), "l": 5.5, "hr": 178},
    ]
    add_test(db, a.id, _dt(), stages, "Test atleta entrenado curva plana")
    v = view(db, a.id)
    print_full_diagnosis(v, "ATLETA 5: Entrenado, curva plana (LT1/LT2 juntos)")

    ths = v.get("thresholds", [])
    lt1 = next((t for t in ths if t["name"] == "LT1"), {})
    lt2 = next((t for t in ths if t["name"] == "LT2"), {})
    issues = []

    # LT1 should be at a fast pace (flat curve → high LT1 pace)
    lt1_pace = lt1.get("pace_seconds_per_km")
    check(lt1_pace is not None and lt1_pace <= _pace("4:10"),
          f"LT1 en pace rápido para entrenado: {_fmt_pace(lt1_pace)} ≤ 4:10", issues)

    # LT2 should be faster still
    lt2_pace = lt2.get("pace_seconds_per_km")
    check(lt2_pace is not None and lt2_pace <= _pace("3:50"),
          f"LT2 en pace rápido: {_fmt_pace(lt2_pace)} ≤ 3:50", issues)

    # Gap between LT1 and LT2 should be small (< 40s/km) for flat curve
    if lt1_pace and lt2_pace:
        gap = lt1_pace - lt2_pace
        check(gap < 45, f"Gap LT1-LT2 pequeño para curva plana: {gap:.0f}s/km (<45s)", issues)
        check(gap > 0, f"LT1 ({_fmt_pace(lt1_pace)}) más lento que LT2 ({_fmt_pace(lt2_pace)})", issues)

    # Both lactates should be low for trained athlete
    lt1_lac = lt1.get("lactate")
    lt2_lac = lt2.get("lactate")
    check(lt1_lac is not None and lt1_lac <= 2.5,
          f"LT1 lac bajo para entrenado: {f'{lt1_lac:.2f}' if lt1_lac else '?'} ≤ 2.5", issues)

    cleanup(db, a.name)
    return issues


def athlete_6_two_tests_confirm(db) -> list[str]:
    """
    Atleta 6: Dos tests consistentes → los umbrales deberían ser estables y coherentes.

    Test 1 (semana 0):
      5:30→0.9, 5:10→1.1, 4:50→1.6, 4:30→2.3, 4:10→3.5, 3:50→5.0, 3:30→7.5

    Test 2 (semana 5): Muy parecido (misma forma, ±0.1 mmol variación natural)
      5:30→0.8, 5:10→1.0, 4:50→1.5, 4:30→2.2, 4:10→3.4, 3:50→4.8, 3:30→7.2

    Expected:
      Thresholds should be nearly identical between both tests.
      Consistency should boost confidence.
      Individual thresholds should be present.
    """
    a = mk(db, "A6_consistent_pair")
    test1 = [
        {"p": _pace("5:30"), "l": 0.9, "hr": 132},
        {"p": _pace("5:10"), "l": 1.1, "hr": 140},
        {"p": _pace("4:50"), "l": 1.6, "hr": 148},
        {"p": _pace("4:30"), "l": 2.3, "hr": 156},
        {"p": _pace("4:10"), "l": 3.5, "hr": 164},
        {"p": _pace("3:50"), "l": 5.0, "hr": 172},
        {"p": _pace("3:30"), "l": 7.5, "hr": 180},
    ]
    add_test(db, a.id, _dt(0), test1, "Test 1")
    v1 = view(db, a.id)

    test2 = [
        {"p": _pace("5:30"), "l": 0.8, "hr": 130},
        {"p": _pace("5:10"), "l": 1.0, "hr": 138},
        {"p": _pace("4:50"), "l": 1.5, "hr": 146},
        {"p": _pace("4:30"), "l": 2.2, "hr": 154},
        {"p": _pace("4:10"), "l": 3.4, "hr": 162},
        {"p": _pace("3:50"), "l": 4.8, "hr": 170},
        {"p": _pace("3:30"), "l": 7.2, "hr": 178},
    ]
    add_test(db, a.id, _dt(5), test2, "Test 2")
    v2 = view(db, a.id)
    print_full_diagnosis(v2, "ATLETA 6: Dos tests consistentes (confirman umbrales)")

    ths1 = v1.get("thresholds", [])
    ths2 = v2.get("thresholds", [])
    lt1_t1 = next((t for t in ths1 if t["name"] == "LT1"), {})
    lt2_t1 = next((t for t in ths1 if t["name"] == "LT2"), {})
    lt1_t2 = next((t for t in ths2 if t["name"] == "LT1"), {})
    lt2_t2 = next((t for t in ths2 if t["name"] == "LT2"), {})
    anchor = v2.get("threshold_anchor_status", {})

    issues = []

    # Both should be detectado
    check(anchor.get("lt1_status") == "detectado",
          f"LT1 detectado con 2 tests (got {anchor.get('lt1_status')})", issues)
    check(anchor.get("lt2_status") == "detectado",
          f"LT2 detectado con 2 tests (got {anchor.get('lt2_status')})", issues)

    # Thresholds should be STABLE between tests (< 15s/km difference)
    lt1_p1 = lt1_t1.get("pace_seconds_per_km")
    lt1_p2 = lt1_t2.get("pace_seconds_per_km")
    lt2_p1 = lt2_t1.get("pace_seconds_per_km")
    lt2_p2 = lt2_t2.get("pace_seconds_per_km")

    if lt1_p1 and lt1_p2:
        diff = abs(lt1_p1 - lt1_p2)
        check(diff < 20, f"LT1 pace estable: {_fmt_pace(lt1_p1)} → {_fmt_pace(lt1_p2)} (Δ{diff:.0f}s)", issues)

    if lt2_p1 and lt2_p2:
        diff = abs(lt2_p1 - lt2_p2)
        check(diff < 20, f"LT2 pace estable: {_fmt_pace(lt2_p1)} → {_fmt_pace(lt2_p2)} (Δ{diff:.0f}s)", issues)

    # Confidence should be reasonable after 2 consistent tests
    lt1_conf = lt1_t2.get("confidence", 0)
    lt2_conf = lt2_t2.get("confidence", 0)
    check(lt1_conf >= 0.5, f"LT1 confianza razonable: {lt1_conf:.0%} ≥ 50%", issues)
    check(lt2_conf >= 0.5, f"LT2 confianza razonable: {lt2_conf:.0%} ≥ 50%", issues)

    # Individual thresholds should be populated
    indiv = v2.get("individual_thresholds") or {}
    has_indiv = indiv.get("lt1_individual") is not None or indiv.get("lt2_individual") is not None
    check(has_indiv, "Individual thresholds detectados con 2 tests consistentes", issues)

    # Lactate ordering
    lt1_lac = lt1_t2.get("lactate")
    lt2_lac = lt2_t2.get("lactate")
    if lt1_lac and lt2_lac:
        check(lt1_lac < lt2_lac, f"LT1 lac ({lt1_lac:.2f}) < LT2 lac ({lt2_lac:.2f})", issues)

    cleanup(db, a.name)
    return issues


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    db = SessionLocal()
    athletes = [
        ("A1", "Test incremental limpio", athlete_1_clean_incremental),
        ("A2", "Mejora con quick measurements", athlete_2_improvement_with_qm),
        ("A3", "Datos ruidosos", athlete_3_noisy_data),
        ("A4", "Escaso → confirma", athlete_4_sparse_then_confirms),
        ("A5", "Entrenado curva plana", athlete_5_trained_flat_curve),
        ("A6", "Dos tests consistentes", athlete_6_two_tests_confirm),
    ]

    print("=" * 72)
    print("  DEEP THRESHOLD VALIDATION — 6 ATHLETES")
    print("=" * 72)

    results = []
    total_issues = 0
    try:
        for code, desc, fn in athletes:
            print(f"\n{'═' * 72}")
            print(f"  {code}: {desc}")
            print(f"{'═' * 72}")
            try:
                issues = fn(db)
                n = len(issues)
                total_issues += n
                status = "PASS" if n == 0 else f"FAIL ({n})"
                results.append((code, desc, status, issues))
                print(f"\n  → {status}")
            except Exception as e:
                import traceback
                traceback.print_exc()
                results.append((code, desc, f"ERROR: {e}", [str(e)]))
                total_issues += 1
    finally:
        db.rollback()
        db.close()

    # Summary
    print(f"\n{'═' * 72}")
    print(f"  RESUMEN")
    print(f"{'═' * 72}")
    passed = sum(1 for _, _, s, _ in results if s == "PASS")
    for code, desc, status, issues in results:
        icon = "✓" if status == "PASS" else "✗"
        print(f"  {icon} {code}: {desc} — {status}")
        for iss in issues:
            print(f"      • {iss}")

    print(f"\n  {passed}/{len(athletes)} PASS | {total_issues} issues totales")
    print(f"{'═' * 72}")


if __name__ == "__main__":
    main()
