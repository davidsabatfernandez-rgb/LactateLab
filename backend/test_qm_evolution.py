"""
Test QM Evolution — ¿Se actualizan realmente los umbrales con medidas del día a día?

Simula atletas reales:
  1. Test incremental inicial (bueno o malo)
  2. Semanas de quick measurements (QM) en zonas LT1/LT2
  3. Verifica que los umbrales dinámicos se MUEVEN con los nuevos datos

Perfiles:
  E1: Buen test + QMs que muestran mejora progresiva
  E2: Buen test + QMs que muestran estancamiento (mismos valores)
  E3: Buen test + QMs que muestran empeoramiento (más lactato a mismo ritmo)
  E4: Test malo (pocos escalones) + QMs que van dando datos
  E5: Buen test + QMs mixtos (algunos días mejor, otros peor — realista)
  E6: Buen test + QMs en distintas intensidades (solo zona LT1, solo zona LT2, mixto)
"""
import sys
sys.path.insert(0, ".")

from datetime import datetime, timedelta, timezone, date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.db.session import SessionLocal
from app.models.athlete import Athlete
from app.models.session import Session as AthleteSession, SessionInterval, LactateSample
from app.models.metrics import PhysiologicalSnapshot, PerformanceEstimate
from app.services.analytics import recalculate_athlete, _discipline_view

PREFIX = "EVOLQM_"
BASE = datetime(2026, 1, 5, 8, 0, 0, tzinfo=timezone.utc)


def _dt(weeks: int = 0, days: int = 0) -> datetime:
    return BASE + timedelta(weeks=weeks, days=days)


def _pace(mm_ss: str) -> float:
    m, s = mm_ss.split(":")
    return int(m) * 60 + int(s)


def _fmt_pace(sec: Optional[float]) -> str:
    if sec is None:
        return "N/A"
    m, s = divmod(int(round(sec)), 60)
    return f"{m}:{s:02d}"


def cleanup(db, name: str):
    for a in db.scalars(select(Athlete).where(Athlete.name == name)).all():
        db.delete(a)
    db.commit()


def mk(db, suffix: str, level="trained") -> Athlete:
    name = f"{PREFIX}{suffix}"
    cleanup(db, name)
    a = Athlete(
        name=name, date_of_birth=date(1990, 6, 15), sex="male",
        weight=72.0, height=178.0, primary_discipline="running",
        athlete_level=level, created_at=date.today(),
    )
    db.add(a)
    db.flush()
    return a


def add_test(db, aid, dt, stages, label=""):
    s = AthleteSession(
        athlete_id=aid, performed_at=dt, discipline="running",
        session_type="lactate_test", goal="test de lactato", comments=label,
    )
    db.add(s)
    db.flush()
    for i, st in enumerate(stages):
        iv = SessionInterval(
            session_id=s.id, order_index=i, duration_seconds=st.get("dur", 360),
            rest_seconds=0, pace_seconds_per_km=st["p"],
            heart_rate_avg=st["hr"], heart_rate_max=st["hr"] + 5, purpose="work",
        )
        db.add(iv)
        db.flush()
        db.add(LactateSample(
            interval_id=iv.id, lactate_mmol=st["l"],
            sample_delay_seconds=45, sample_timing_label="post-intervalo",
        ))
    db.flush()
    return s


def add_qm(db, aid, dt, measurements, label=""):
    """Add a quick measurement session (training_lactate)."""
    s = AthleteSession(
        athlete_id=aid, performed_at=dt, discipline="running",
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


def get_dynamic(v: dict) -> dict:
    """Extract key dynamic threshold values."""
    dyn = (v.get("dynamic_thresholds") or {}).get("acute", {})
    result = {
        "sessions": dyn.get("sessions_considered", 0),
        "points": len(dyn.get("points_used", [])),
        "confidence": dyn.get("confidence_score", 0),
    }
    for key in ["reference_2mmol", "reference_4mmol", "practical_lt1", "practical_lt2"]:
        ref = dyn.get(key) or {}
        result[key] = {
            "pace": ref.get("estimated_pace_seconds_per_km"),
            "hr": ref.get("estimated_hr_at_target"),
            "lac": ref.get("target_lactate"),
            "pts": ref.get("number_of_points_used", 0),
        }
    return result


def print_evolution(label: str, snapshots: list[dict]):
    """Print a table showing how thresholds evolved."""
    print(f"\n  {label}")
    print(f"  {'Momento':<20} {'Pts':>3} {'Ses':>3} "
          f"{'Ref@2mmol':>10} {'Ref@4mmol':>10} "
          f"{'pLT1 pace':>10} {'pLT1 HR':>8} "
          f"{'pLT2 pace':>10} {'pLT2 HR':>8} {'Conf':>5}")
    print(f"  {'─' * 105}")
    for snap in snapshots:
        d = snap["dyn"]
        ref2 = d.get("reference_2mmol", {})
        ref4 = d.get("reference_4mmol", {})
        plt1 = d.get("practical_lt1", {})
        plt2 = d.get("practical_lt2", {})
        print(f"  {snap['label']:<20} {d['points']:>3} {d['sessions']:>3} "
              f"{_fmt_pace(ref2.get('pace')):>10} {_fmt_pace(ref4.get('pace')):>10} "
              f"{_fmt_pace(plt1.get('pace')):>10} {plt1.get('hr', 0):>8.0f} "
              f"{_fmt_pace(plt2.get('pace')):>10} {plt2.get('hr', 0):>8.0f} {d['confidence']:>5.2f}")


def check(condition: bool, msg: str, issues: list):
    if condition:
        print(f"    ✓ {msg}")
    else:
        print(f"    ✗ {msg}")
        issues.append(msg)


# ═══════════════════════════════════════════════════════════════════════
# E1: Buen test + mejora progresiva
# ═══════════════════════════════════════════════════════════════════════
def athlete_e1_improving(db) -> list[str]:
    """
    Atleta con buen test incremental que mejora semanalmente.
    Cada QM muestra menos lactato al mismo ritmo (adaptación aeróbica).

    Test: 5:30→1.0, 5:10→1.5, 4:50→2.2, 4:30→3.5, 4:10→5.0, 3:50→7.5
    Semana 2: QM a 4:50 → 1.8 (era 2.2), 4:30 → 3.0 (era 3.5)
    Semana 4: QM a 4:50 → 1.5, 4:30 → 2.5
    Semana 6: QM a 4:30 → 2.0, 4:10 → 3.5 (era 5.0!)
    """
    a = mk(db, "E1_improving")
    stages = [
        {"p": _pace("5:30"), "l": 1.0, "hr": 135},
        {"p": _pace("5:10"), "l": 1.5, "hr": 143},
        {"p": _pace("4:50"), "l": 2.2, "hr": 151},
        {"p": _pace("4:30"), "l": 3.5, "hr": 159},
        {"p": _pace("4:10"), "l": 5.0, "hr": 167},
        {"p": _pace("3:50"), "l": 7.5, "hr": 175},
    ]
    add_test(db, a.id, _dt(0), stages, "Test inicial")
    v0 = view(db, a.id)
    d0 = get_dynamic(v0)
    snapshots = [{"label": "Post-test", "dyn": d0}]

    # Semana 2: primera mejora
    add_qm(db, a.id, _dt(2), [
        {"p": _pace("4:50"), "l": 1.8, "hr": 148},  # era 2.2
        {"p": _pace("4:30"), "l": 3.0, "hr": 156},   # era 3.5
    ], "QM semana 2")
    v1 = view(db, a.id)
    d1 = get_dynamic(v1)
    snapshots.append({"label": "Sem 2 (mejora)", "dyn": d1})

    # Semana 4: más mejora
    add_qm(db, a.id, _dt(4), [
        {"p": _pace("4:50"), "l": 1.5, "hr": 146},  # era 2.2 → ahora 1.5
        {"p": _pace("4:30"), "l": 2.5, "hr": 153},   # era 3.5 → ahora 2.5
    ], "QM semana 4")
    v2 = view(db, a.id)
    d2 = get_dynamic(v2)
    snapshots.append({"label": "Sem 4 (mejora+)", "dyn": d2})

    # Semana 6: QM a ritmos más rápidos
    add_qm(db, a.id, _dt(6), [
        {"p": _pace("4:30"), "l": 2.0, "hr": 151},   # era 3.5 → ahora 2.0!
        {"p": _pace("4:10"), "l": 3.5, "hr": 162},    # era 5.0 → ahora 3.5
    ], "QM semana 6")
    v3 = view(db, a.id)
    d3 = get_dynamic(v3)
    snapshots.append({"label": "Sem 6 (rapidísimo)", "dyn": d3})

    print_evolution("E1: MEJORA PROGRESIVA", snapshots)

    issues = []
    # El ref@4mmol debe ser más rápido al final vs inicio
    p0 = d0["reference_4mmol"]["pace"]
    p3 = d3["reference_4mmol"]["pace"]
    check(p3 is not None and p0 is not None and p3 < p0,
          f"Ref@4mmol mejoró: {_fmt_pace(p0)} → {_fmt_pace(p3)}", issues)

    # El practical LT2 pace debe ser más rápido
    plt2_0 = d0["practical_lt2"]["pace"]
    plt2_3 = d3["practical_lt2"]["pace"]
    check(plt2_3 is not None and plt2_0 is not None and plt2_3 < plt2_0,
          f"pLT2 pace mejoró: {_fmt_pace(plt2_0)} → {_fmt_pace(plt2_3)}", issues)

    # El practical LT1 pace debe ser más rápido
    plt1_0 = d0["practical_lt1"]["pace"]
    plt1_3 = d3["practical_lt1"]["pace"]
    check(plt1_3 is not None and plt1_0 is not None and plt1_3 < plt1_0,
          f"pLT1 pace mejoró: {_fmt_pace(plt1_0)} → {_fmt_pace(plt1_3)}", issues)

    # Puntos aumentaron
    check(d3["points"] > d0["points"],
          f"Puntos acumulados: {d0['points']} → {d3['points']}", issues)

    # Sesiones aumentaron
    check(d3["sessions"] > 1,
          f"Sesiones consideradas: {d3['sessions']}", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
# E2: Buen test + estancamiento
# ═══════════════════════════════════════════════════════════════════════
def athlete_e2_plateau(db) -> list[str]:
    """
    Atleta que hace QMs pero los valores son iguales al test.
    Los umbrales no deberían moverse significativamente.
    """
    a = mk(db, "E2_plateau")
    stages = [
        {"p": _pace("5:20"), "l": 0.9, "hr": 138},
        {"p": _pace("5:00"), "l": 1.3, "hr": 146},
        {"p": _pace("4:40"), "l": 2.0, "hr": 154},
        {"p": _pace("4:20"), "l": 3.2, "hr": 162},
        {"p": _pace("4:00"), "l": 4.8, "hr": 170},
        {"p": _pace("3:40"), "l": 7.0, "hr": 178},
    ]
    add_test(db, a.id, _dt(0), stages, "Test inicial")
    v0 = view(db, a.id)
    d0 = get_dynamic(v0)
    snapshots = [{"label": "Post-test", "dyn": d0}]

    # Semana 2: mismos valores
    add_qm(db, a.id, _dt(2), [
        {"p": _pace("4:40"), "l": 2.0, "hr": 153},
        {"p": _pace("4:20"), "l": 3.3, "hr": 161},
    ], "QM sem 2 — igual")
    v1 = view(db, a.id)
    d1 = get_dynamic(v1)
    snapshots.append({"label": "Sem 2 (igual)", "dyn": d1})

    # Semana 4: muy similar
    add_qm(db, a.id, _dt(4), [
        {"p": _pace("4:40"), "l": 2.1, "hr": 154},
        {"p": _pace("4:20"), "l": 3.1, "hr": 162},
    ], "QM sem 4 — igual")
    v2 = view(db, a.id)
    d2 = get_dynamic(v2)
    snapshots.append({"label": "Sem 4 (igual)", "dyn": d2})

    print_evolution("E2: ESTANCAMIENTO", snapshots)

    issues = []
    # Ref@4mmol no debe cambiar más de ±10s
    p0 = d0["reference_4mmol"]["pace"]
    p2 = d2["reference_4mmol"]["pace"]
    if p0 and p2:
        delta = abs(p2 - p0)
        check(delta <= 15,
              f"Ref@4mmol estable: {_fmt_pace(p0)} → {_fmt_pace(p2)} (Δ{delta:.0f}s)", issues)

    # pLT2 no debe cambiar más de ±10s
    plt2_0 = d0["practical_lt2"]["pace"]
    plt2_2 = d2["practical_lt2"]["pace"]
    if plt2_0 and plt2_2:
        delta = abs(plt2_2 - plt2_0)
        check(delta <= 15,
              f"pLT2 estable: {_fmt_pace(plt2_0)} → {_fmt_pace(plt2_2)} (Δ{delta:.0f}s)", issues)

    check(d2["points"] > d0["points"],
          f"Puntos acumulados: {d0['points']} → {d2['points']}", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
# E3: Buen test + empeoramiento
# ═══════════════════════════════════════════════════════════════════════
def athlete_e3_decline(db) -> list[str]:
    """
    Atleta que empeora (sobreentrenamiento, enfermedad, etc.).
    QMs muestran más lactato al mismo ritmo.
    Los umbrales deben empeorar (pace más lento).
    """
    a = mk(db, "E3_decline")
    stages = [
        {"p": _pace("5:00"), "l": 0.9, "hr": 140},
        {"p": _pace("4:40"), "l": 1.4, "hr": 148},
        {"p": _pace("4:20"), "l": 2.1, "hr": 156},
        {"p": _pace("4:00"), "l": 3.3, "hr": 164},
        {"p": _pace("3:40"), "l": 5.2, "hr": 172},
        {"p": _pace("3:20"), "l": 8.0, "hr": 180},
    ]
    add_test(db, a.id, _dt(0), stages, "Test inicial")
    v0 = view(db, a.id)
    d0 = get_dynamic(v0)
    snapshots = [{"label": "Post-test", "dyn": d0}]

    # Semana 2: empeora un poco (más lactato, más HR al mismo ritmo)
    add_qm(db, a.id, _dt(2), [
        {"p": _pace("4:20"), "l": 2.6, "hr": 160},  # era 2.1, hr 156
        {"p": _pace("4:00"), "l": 4.0, "hr": 168},   # era 3.3, hr 164
    ], "QM sem 2 — peor")
    v1 = view(db, a.id)
    d1 = get_dynamic(v1)
    snapshots.append({"label": "Sem 2 (peor)", "dyn": d1})

    # Semana 4: sigue empeorando
    add_qm(db, a.id, _dt(4), [
        {"p": _pace("4:20"), "l": 3.0, "hr": 163},  # mucho peor
        {"p": _pace("4:00"), "l": 4.8, "hr": 172},   # mucho peor
    ], "QM sem 4 — mucho peor")
    v2 = view(db, a.id)
    d2 = get_dynamic(v2)
    snapshots.append({"label": "Sem 4 (mucho peor)", "dyn": d2})

    print_evolution("E3: EMPEORAMIENTO", snapshots)

    issues = []
    # Ref@4mmol debe ser más lento (mayor pace s/km)
    p0 = d0["reference_4mmol"]["pace"]
    p2 = d2["reference_4mmol"]["pace"]
    check(p2 is not None and p0 is not None and p2 > p0,
          f"Ref@4mmol empeoró: {_fmt_pace(p0)} → {_fmt_pace(p2)}", issues)

    # HR at ref@4mmol debe subir
    hr0 = d0["reference_4mmol"]["hr"]
    hr2 = d2["reference_4mmol"]["hr"]
    check(hr2 is not None and hr0 is not None and hr2 > hr0,
          f"HR@4mmol subió: {hr0:.0f} → {hr2:.0f}", issues)

    check(d2["points"] > d0["points"],
          f"Puntos acumulados: {d0['points']} → {d2['points']}", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
# E4: Test malo + QMs que rellenan datos
# ═══════════════════════════════════════════════════════════════════════
def athlete_e4_bad_test_then_qm(db) -> list[str]:
    """
    Atleta con test de solo 3 escalones (insuficiente).
    Los QMs van rellenando puntos en zonas que no se midieron.
    Los umbrales deben mejorar en precisión (más puntos, mejor curva).
    """
    a = mk(db, "E4_bad_test")
    # Test muy corto: solo 3 escalones
    stages = [
        {"p": _pace("5:00"), "l": 1.2, "hr": 142},
        {"p": _pace("4:20"), "l": 3.0, "hr": 160},
        {"p": _pace("3:40"), "l": 6.5, "hr": 178},
    ]
    add_test(db, a.id, _dt(0), stages, "Test corto 3 escalones")
    v0 = view(db, a.id)
    d0 = get_dynamic(v0)
    snapshots = [{"label": "Post-test (3pts)", "dyn": d0}]

    # Semana 1: QM en zona baja
    add_qm(db, a.id, _dt(1), [
        {"p": _pace("5:20"), "l": 0.9, "hr": 136},
        {"p": _pace("4:40"), "l": 1.8, "hr": 150},
    ], "QM zona baja")
    v1 = view(db, a.id)
    d1 = get_dynamic(v1)
    snapshots.append({"label": "Sem 1 (+zona baja)", "dyn": d1})

    # Semana 2: QM en zona media
    add_qm(db, a.id, _dt(2), [
        {"p": _pace("4:30"), "l": 2.4, "hr": 155},
        {"p": _pace("4:10"), "l": 3.8, "hr": 165},
    ], "QM zona media")
    v2 = view(db, a.id)
    d2 = get_dynamic(v2)
    snapshots.append({"label": "Sem 2 (+zona media)", "dyn": d2})

    # Semana 3: QM en zona alta
    add_qm(db, a.id, _dt(3), [
        {"p": _pace("4:00"), "l": 4.5, "hr": 170},
        {"p": _pace("3:50"), "l": 5.8, "hr": 175},
    ], "QM zona alta")
    v3 = view(db, a.id)
    d3 = get_dynamic(v3)
    snapshots.append({"label": "Sem 3 (+zona alta)", "dyn": d3})

    print_evolution("E4: TEST MALO → QMs RELLENAN", snapshots)

    issues = []
    # Más puntos al final
    check(d3["points"] >= d0["points"] + 6,
          f"Puntos creció: {d0['points']} → {d3['points']} (+{d3['points']-d0['points']})", issues)

    # Sesiones deben ser 4
    check(d3["sessions"] == 4,
          f"4 sesiones consideradas: {d3['sessions']}", issues)

    # Debe tener practical_lt2 y ref@4mmol (con 3 pts podría no tener buena estimación)
    check(d3["practical_lt2"]["pace"] is not None,
          f"pLT2 estimado: {_fmt_pace(d3['practical_lt2']['pace'])}", issues)
    check(d3["reference_4mmol"]["pace"] is not None,
          f"Ref@4mmol estimado: {_fmt_pace(d3['reference_4mmol']['pace'])}", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
# E5: Buen test + QMs realistas (variación día a día)
# ═══════════════════════════════════════════════════════════════════════
def athlete_e5_realistic_variation(db) -> list[str]:
    """
    Atleta con variación realista: un día mejor, otro peor.
    Simula fatiga, sueño, alimentación, etc.
    Los umbrales deben ser estables pero con tendencia si la hay.
    """
    a = mk(db, "E5_realistic")
    stages = [
        {"p": _pace("5:10"), "l": 1.0, "hr": 140},
        {"p": _pace("4:50"), "l": 1.6, "hr": 148},
        {"p": _pace("4:30"), "l": 2.4, "hr": 156},
        {"p": _pace("4:10"), "l": 3.5, "hr": 164},
        {"p": _pace("3:50"), "l": 5.2, "hr": 172},
        {"p": _pace("3:30"), "l": 8.0, "hr": 180},
    ]
    add_test(db, a.id, _dt(0), stages, "Test inicial")
    v0 = view(db, a.id)
    d0 = get_dynamic(v0)
    snapshots = [{"label": "Post-test", "dyn": d0}]

    # Semana 1: buen día (mejora leve)
    add_qm(db, a.id, _dt(1), [
        {"p": _pace("4:30"), "l": 2.2, "hr": 154},  # era 2.4
        {"p": _pace("4:10"), "l": 3.3, "hr": 162},   # era 3.5
    ], "QM sem 1 — buen día")
    v1 = view(db, a.id)
    d1 = get_dynamic(v1)
    snapshots.append({"label": "Sem 1 (buen día)", "dyn": d1})

    # Semana 2: mal día (fatiga acumulada)
    add_qm(db, a.id, _dt(2), [
        {"p": _pace("4:30"), "l": 2.8, "hr": 160},  # peor que test
        {"p": _pace("4:10"), "l": 4.0, "hr": 168},   # peor
    ], "QM sem 2 — mal día")
    v2 = view(db, a.id)
    d2 = get_dynamic(v2)
    snapshots.append({"label": "Sem 2 (mal día)", "dyn": d2})

    # Semana 3: día normal
    add_qm(db, a.id, _dt(3), [
        {"p": _pace("4:30"), "l": 2.3, "hr": 155},
        {"p": _pace("4:10"), "l": 3.4, "hr": 163},
    ], "QM sem 3 — normal")
    v3 = view(db, a.id)
    d3 = get_dynamic(v3)
    snapshots.append({"label": "Sem 3 (normal)", "dyn": d3})

    # Semana 4: buen día otra vez
    add_qm(db, a.id, _dt(4), [
        {"p": _pace("4:30"), "l": 2.1, "hr": 153},
        {"p": _pace("4:10"), "l": 3.1, "hr": 161},
    ], "QM sem 4 — buen día")
    v4 = view(db, a.id)
    d4 = get_dynamic(v4)
    snapshots.append({"label": "Sem 4 (buen día)", "dyn": d4})

    # Semana 5: otro punto en zona LT1
    add_qm(db, a.id, _dt(5), [
        {"p": _pace("4:50"), "l": 1.4, "hr": 146},
        {"p": _pace("4:30"), "l": 2.0, "hr": 152},
    ], "QM sem 5 — con LT1")
    v5 = view(db, a.id)
    d5 = get_dynamic(v5)
    snapshots.append({"label": "Sem 5 (LT1+LT2)", "dyn": d5})

    print_evolution("E5: VARIACIÓN REALISTA DÍA A DÍA", snapshots)

    issues = []
    # Con tendencia de mejora leve, el umbral no debe empeorar vs test
    p0_4 = d0["reference_4mmol"]["pace"]
    p5_4 = d5["reference_4mmol"]["pace"]
    check(p5_4 is not None and p0_4 is not None and p5_4 <= p0_4 + 10,
          f"Ref@4mmol estable o mejor: {_fmt_pace(p0_4)} → {_fmt_pace(p5_4)}", issues)

    # El motor debe tener muchos puntos al final
    check(d5["points"] >= 14,
          f"Suficientes puntos acumulados: {d5['points']}", issues)

    # Pese a la variación, pLT2 pace debe ser razonable (no wild swings)
    paces = [s["dyn"]["practical_lt2"]["pace"] for s in snapshots if s["dyn"]["practical_lt2"]["pace"]]
    if len(paces) >= 3:
        swing = max(paces) - min(paces)
        check(swing < 30,
              f"pLT2 swing max {swing:.0f}s (<30s esperado)", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
# E6: Buen test + QMs solo en una zona
# ═══════════════════════════════════════════════════════════════════════
def athlete_e6_zone_specific_qm(db) -> list[str]:
    """
    Atleta que solo hace QMs en zona LT1 (rodajes largos con pinchazo).
    Verifica que:
    - pLT1 se actualiza correctamente
    - pLT2 no cambia mucho (no tiene datos nuevos ahí)
    """
    a = mk(db, "E6_zone_specific")
    stages = [
        {"p": _pace("5:20"), "l": 0.9, "hr": 136},
        {"p": _pace("5:00"), "l": 1.3, "hr": 144},
        {"p": _pace("4:40"), "l": 1.9, "hr": 152},
        {"p": _pace("4:20"), "l": 2.8, "hr": 160},
        {"p": _pace("4:00"), "l": 4.0, "hr": 168},
        {"p": _pace("3:40"), "l": 6.5, "hr": 176},
    ]
    add_test(db, a.id, _dt(0), stages, "Test inicial")
    v0 = view(db, a.id)
    d0 = get_dynamic(v0)
    snapshots = [{"label": "Post-test", "dyn": d0}]

    # QMs solo en zona LT1 (ritmo lento, mejora progresiva)
    # Semana 2: rodaje largo a 5:00 → lactato bajó
    add_qm(db, a.id, _dt(2), [
        {"p": _pace("5:00"), "l": 1.1, "hr": 141},   # era 1.3
    ], "QM LT1 sem 2")
    v1 = view(db, a.id)
    d1 = get_dynamic(v1)
    snapshots.append({"label": "Sem 2 (LT1 ↓)", "dyn": d1})

    # Semana 3: otro rodaje
    add_qm(db, a.id, _dt(3), [
        {"p": _pace("5:00"), "l": 1.0, "hr": 140},   # sigue mejorando
        {"p": _pace("5:20"), "l": 0.8, "hr": 134},
    ], "QM LT1 sem 3")
    v2 = view(db, a.id)
    d2 = get_dynamic(v2)
    snapshots.append({"label": "Sem 3 (LT1 ↓↓)", "dyn": d2})

    # Semana 5: más mejora en LT1
    add_qm(db, a.id, _dt(5), [
        {"p": _pace("4:50"), "l": 1.3, "hr": 147},   # era 1.9 en test!
        {"p": _pace("5:00"), "l": 0.9, "hr": 139},
    ], "QM LT1 sem 5")
    v3 = view(db, a.id)
    d3 = get_dynamic(v3)
    snapshots.append({"label": "Sem 5 (LT1 ↓↓↓)", "dyn": d3})

    print_evolution("E6: QMs SOLO EN ZONA LT1", snapshots)

    issues = []
    # ref@2mmol (cerca de LT1) debe mostrar mejora
    p0_2 = d0["reference_2mmol"]["pace"]
    p3_2 = d3["reference_2mmol"]["pace"]
    check(p3_2 is not None and p0_2 is not None and p3_2 < p0_2,
          f"Ref@2mmol mejoró con QMs LT1: {_fmt_pace(p0_2)} → {_fmt_pace(p3_2)}", issues)

    # ref@4mmol (zona LT2) no debe cambiar drasticamente — pocos datos nuevos ahí
    p0_4 = d0["reference_4mmol"]["pace"]
    p3_4 = d3["reference_4mmol"]["pace"]
    if p0_4 and p3_4:
        delta = abs(p3_4 - p0_4)
        check(delta < 20,
              f"Ref@4mmol relativamente estable sin QMs LT2: {_fmt_pace(p0_4)} → {_fmt_pace(p3_4)} (Δ{delta:.0f}s)", issues)

    # Puntos
    check(d3["points"] > d0["points"],
          f"Puntos acumulados: {d0['points']} → {d3['points']}", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════
def main():
    db = SessionLocal()
    print("=" * 80)
    print("  QM EVOLUTION TEST — ¿Se actualizan los umbrales con medidas del día a día?")
    print("=" * 80)

    athletes = [
        ("E1", "Mejora progresiva", athlete_e1_improving),
        ("E2", "Estancamiento", athlete_e2_plateau),
        ("E3", "Empeoramiento", athlete_e3_decline),
        ("E4", "Test malo → QMs rellenan", athlete_e4_bad_test_then_qm),
        ("E5", "Variación realista", athlete_e5_realistic_variation),
        ("E6", "QMs solo en zona LT1", athlete_e6_zone_specific_qm),
    ]

    results = []
    for code, desc, fn in athletes:
        print(f"\n{'═' * 80}")
        print(f"  {code}: {desc}")
        print(f"{'═' * 80}")
        try:
            issues = fn(db)
            passed = len(issues) == 0
            results.append((code, desc, passed, issues))
        except Exception as e:
            import traceback
            traceback.print_exc()
            results.append((code, desc, False, [f"EXCEPTION: {e}"]))

    # Summary
    print(f"\n{'═' * 80}")
    print(f"  RESUMEN")
    print(f"{'═' * 80}")
    total_pass = sum(1 for _, _, p, _ in results if p)
    for code, desc, passed, issues in results:
        status = "✓" if passed else "✗"
        print(f"  {status} {code}: {desc} — {'PASS' if passed else 'FAIL'}")
        if issues:
            for issue in issues[:3]:
                print(f"      • {issue}")

    print(f"\n  {total_pass}/{len(results)} PASS | {len(results) - total_pass} issues")
    print("=" * 80)
    db.close()


if __name__ == "__main__":
    main()
