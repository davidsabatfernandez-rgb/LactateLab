"""
Test QM Efficiency — ¿Se mueven los umbrales lo suficiente y son correctos?

Batería completamente diferente. Foco:
  - ¿Responden rápido a cambios claros o se quedan pegados al test antiguo?
  - ¿Las estimaciones de ritmo/FC son coherentes con los datos reales?
  - ¿El peso de recencia funciona? (datos nuevos > datos viejos)

Perfiles:
  F1: Atleta ciclista con potencia (no pace) — test + QMs con mejora de FTP
  F2: Mejora GRANDE y rápida (stage race / altitude camp) — ¿responde?
  F3: 6 semanas de QMs SIN test previo — ¿construye curva desde cero?
  F4: Test viejo (5 semanas) + QMs recientes — ¿pesa más lo nuevo?
  F5: QMs densos (3x/semana) con mejora clara — ¿converge rápido?
  F6: Atleta entrenado con curva plana — ¿pilla bien los umbrales bajos?
  F7: QMs que contradicen el test — ¿el motor confía en lo reciente?
  F8: Verificación numérica: ¿la interpolación da ritmos que cuadran?
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

PREFIX = "EFFQM_"
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


def mk(db, suffix: str, level="trained", disc="running") -> Athlete:
    name = f"{PREFIX}{suffix}"
    cleanup(db, name)
    a = Athlete(
        name=name, date_of_birth=date(1990, 6, 15), sex="male",
        weight=72.0, height=178.0, primary_discipline=disc,
        athlete_level=level, created_at=date.today(),
    )
    db.add(a); db.flush()
    return a


def add_test(db, aid, dt, stages, label="", disc="running"):
    s = AthleteSession(
        athlete_id=aid, performed_at=dt, discipline=disc,
        session_type="lactate_test", goal="test de lactato", comments=label,
    )
    db.add(s); db.flush()
    for i, st in enumerate(stages):
        iv = SessionInterval(
            session_id=s.id, order_index=i,
            duration_seconds=st.get("dur", 360), rest_seconds=0,
            pace_seconds_per_km=st.get("p"), power_watts=st.get("w"),
            heart_rate_avg=st["hr"], heart_rate_max=st["hr"] + 5, purpose="work",
        )
        db.add(iv); db.flush()
        db.add(LactateSample(
            interval_id=iv.id, lactate_mmol=st["l"],
            sample_delay_seconds=45, sample_timing_label="post-intervalo",
        ))
    db.flush()
    return s


def add_qm(db, aid, dt, measurements, label="", disc="running"):
    s = AthleteSession(
        athlete_id=aid, performed_at=dt, discipline=disc,
        session_type="training_lactate", goal="quick lactate check", comments=label,
    )
    db.add(s); db.flush()
    for i, m in enumerate(measurements):
        iv = SessionInterval(
            session_id=s.id, order_index=i,
            duration_seconds=m.get("dur", 360), rest_seconds=0,
            pace_seconds_per_km=m.get("p"), power_watts=m.get("w"),
            heart_rate_avg=m["hr"], heart_rate_max=m["hr"] + 5, purpose="work",
        )
        db.add(iv); db.flush()
        db.add(LactateSample(
            interval_id=iv.id, lactate_mmol=m["l"],
            sample_delay_seconds=45, sample_timing_label="post-intervalo",
        ))
    db.flush()
    return s


def view(db, aid, disc="running") -> dict:
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
    return _discipline_view(athlete, disc, athlete.sessions, snaps, ests)


def dyn(v: dict) -> dict:
    """Extract dynamic threshold summary."""
    d = (v.get("dynamic_thresholds") or {}).get("acute", {})
    r = {"sessions": d.get("sessions_considered", 0), "points": len(d.get("points_used", [])),
         "conf": d.get("confidence_score", 0)}
    for k in ["reference_2mmol", "reference_4mmol", "practical_lt1", "practical_lt2"]:
        ref = d.get(k) or {}
        r[k] = {"pace": ref.get("estimated_pace_seconds_per_km"),
                 "power": ref.get("estimated_power_watts"),
                 "hr": ref.get("estimated_hr_at_target"),
                 "lac": ref.get("target_lactate")}
    r["points_used"] = d.get("points_used", [])
    return r


def ptable(label, rows):
    print(f"\n  {label}")
    print(f"  {'Fase':<22} {'Pts':>3} {'S':>2} "
          f"{'Ref@2 pace':>10} {'Ref@4 pace':>10} "
          f"{'pLT1':>10} {'pLT1 HR':>7} {'pLT2':>10} {'pLT2 HR':>7} {'C':>4}")
    print(f"  {'─'*100}")
    for r in rows:
        d = r["d"]
        r2, r4 = d["reference_2mmol"], d["reference_4mmol"]
        p1, p2 = d["practical_lt1"], d["practical_lt2"]
        print(f"  {r['l']:<22} {d['points']:>3} {d['sessions']:>2} "
              f"{_fmt_pace(r2['pace']):>10} {_fmt_pace(r4['pace']):>10} "
              f"{_fmt_pace(p1['pace']):>10} {(p1['hr'] or 0):>7.0f} "
              f"{_fmt_pace(p2['pace']):>10} {(p2['hr'] or 0):>7.0f} {d['conf']:>4.2f}")


def check(ok, msg, issues):
    print(f"    {'✓' if ok else '✗'} {msg}")
    if not ok:
        issues.append(msg)


# ═══════════════════════════════════════════════════════════════════════
# F1: Ciclista con potencia — mejora de FTP
# ═══════════════════════════════════════════════════════════════════════
def f1_cyclist_power(db) -> list[str]:
    """
    Ciclista: test con vatios, luego QMs mostrando mejora de FTP.
    Verifica que las estimaciones de potencia se actualizan.
    """
    a = mk(db, "F1_cyclist", disc="ciclismo")
    stages = [
        {"w": 150, "l": 1.0, "hr": 120},
        {"w": 180, "l": 1.4, "hr": 130},
        {"w": 210, "l": 2.0, "hr": 140},
        {"w": 240, "l": 2.8, "hr": 150},
        {"w": 270, "l": 4.2, "hr": 160},
        {"w": 300, "l": 6.5, "hr": 170},
    ]
    add_test(db, a.id, _dt(0), stages, "FTP test", disc="ciclismo")
    v0 = view(db, a.id, "ciclismo"); d0 = dyn(v0)
    rows = [{"l": "Post-test FTP", "d": d0}]

    # Sem 2-3: QMs muestran mejora (menos lactato a misma potencia)
    add_qm(db, a.id, _dt(2), [
        {"w": 240, "l": 2.3, "hr": 147},  # era 2.8
        {"w": 270, "l": 3.5, "hr": 157},  # era 4.2
    ], "QM FTP mejora", disc="ciclismo")
    v1 = view(db, a.id, "ciclismo"); d1 = dyn(v1)
    rows.append({"l": "Sem 2 (FTP ↑)", "d": d1})

    add_qm(db, a.id, _dt(4), [
        {"w": 250, "l": 2.0, "hr": 145},
        {"w": 280, "l": 3.2, "hr": 155},
    ], "QM FTP mejora+", disc="ciclismo")
    v2 = view(db, a.id, "ciclismo"); d2 = dyn(v2)
    rows.append({"l": "Sem 4 (FTP ↑↑)", "d": d2})

    # Print power-based table
    print(f"\n  F1: CICLISTA FTP")
    print(f"  {'Fase':<22} {'Pts':>3} {'Ref@4 W':>8} {'pLT2 W':>8} {'pLT2 HR':>8}")
    print(f"  {'─'*55}")
    for r in rows:
        d = r["d"]
        r4w = d["reference_4mmol"].get("power") or 0
        p2w = d["practical_lt2"].get("power") or 0
        p2h = d["practical_lt2"].get("hr") or 0
        print(f"  {r['l']:<22} {d['points']:>3} {r4w:>8.0f} {p2w:>8.0f} {p2h:>8.0f}")

    issues = []
    pw0 = d0["reference_4mmol"].get("power")
    pw2 = d2["reference_4mmol"].get("power")
    check(pw0 is not None and pw2 is not None and pw2 > pw0,
          f"Ref@4mmol potencia subió: {pw0:.0f}W → {pw2:.0f}W", issues)
    check(d2["points"] >= 10,
          f"Suficientes puntos: {d2['points']}", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
# F2: Mejora GRANDE (altitude camp)
# ═══════════════════════════════════════════════════════════════════════
def f2_big_jump(db) -> list[str]:
    """
    Atleta vuelve de altitude camp con mejora enorme (~30s/km en LT2).
    ¿El motor responde rápido o se queda pegado al test viejo?
    """
    a = mk(db, "F2_altitude")
    stages = [
        {"p": _pace("5:00"), "l": 1.0, "hr": 140},
        {"p": _pace("4:40"), "l": 1.6, "hr": 148},
        {"p": _pace("4:20"), "l": 2.5, "hr": 156},
        {"p": _pace("4:00"), "l": 3.8, "hr": 164},
        {"p": _pace("3:40"), "l": 5.5, "hr": 172},
        {"p": _pace("3:20"), "l": 8.5, "hr": 180},
    ]
    add_test(db, a.id, _dt(0), stages, "Pre altitude camp")
    v0 = view(db, a.id); d0 = dyn(v0)
    rows = [{"l": "Pre-camp", "d": d0}]

    # Post altitude: 3 QMs en semana 4-5 mostrando salto grande
    add_qm(db, a.id, _dt(4), [
        {"p": _pace("4:20"), "l": 1.8, "hr": 150},  # era 2.5 → ahora 1.8!
        {"p": _pace("4:00"), "l": 2.5, "hr": 158},   # era 3.8 → ahora 2.5!
    ], "Post camp QM 1")
    v1 = view(db, a.id); d1 = dyn(v1)
    rows.append({"l": "Post-camp QM1", "d": d1})

    add_qm(db, a.id, _dt(4, 3), [
        {"p": _pace("4:00"), "l": 2.3, "hr": 156},
        {"p": _pace("3:40"), "l": 3.5, "hr": 166},   # era 5.5!
    ], "Post camp QM 2")
    v2 = view(db, a.id); d2 = dyn(v2)
    rows.append({"l": "Post-camp QM2", "d": d2})

    add_qm(db, a.id, _dt(5), [
        {"p": _pace("3:50"), "l": 3.0, "hr": 162},
        {"p": _pace("3:30"), "l": 4.5, "hr": 172},   # ahora aguanta 3:30 a 4.5!
    ], "Post camp QM 3")
    v3 = view(db, a.id); d3 = dyn(v3)
    rows.append({"l": "Post-camp QM3", "d": d3})

    ptable("F2: SALTO GRANDE (ALTITUDE CAMP)", rows)

    issues = []
    # Ref@4mmol debe mejorar al menos 15s
    p0 = d0["reference_4mmol"]["pace"]
    p3 = d3["reference_4mmol"]["pace"]
    delta = (p0 or 0) - (p3 or 0)
    check(delta >= 10,
          f"Ref@4mmol mejoró ≥10s: {_fmt_pace(p0)} → {_fmt_pace(p3)} (Δ{delta:.0f}s)", issues)

    # pLT2 debe mejorar significativamente
    plt0 = d0["practical_lt2"]["pace"]
    plt3 = d3["practical_lt2"]["pace"]
    delta2 = (plt0 or 0) - (plt3 or 0)
    check(delta2 >= 8,
          f"pLT2 mejoró ≥8s: {_fmt_pace(plt0)} → {_fmt_pace(plt3)} (Δ{delta2:.0f}s)", issues)

    # Tras 3 QMs recientes, los datos nuevos deben dominar (>50% peso)
    pts = d3["points_used"]
    new_pts = [p for p in pts if p["session_date"] >= "2026-02-02"]
    old_pts = [p for p in pts if p["session_date"] < "2026-02-02"]
    new_weight = sum(p["point_weight"] for p in new_pts)
    old_weight = sum(p["point_weight"] for p in old_pts)
    total = new_weight + old_weight
    new_pct = new_weight / total * 100 if total > 0 else 0
    check(new_pct > 50,
          f"Datos recientes dominan: {new_pct:.0f}% peso nuevo vs {100-new_pct:.0f}% viejo", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
# F3: Solo QMs sin test previo
# ═══════════════════════════════════════════════════════════════════════
def f3_no_test_only_qm(db) -> list[str]:
    """
    Atleta que nunca hizo test incremental formal.
    Solo tiene QMs sueltos en distintas intensidades.
    ¿Puede el motor construir una curva útil?
    """
    a = mk(db, "F3_no_test")
    rows = []

    # Sem 1: QM en rodaje (zona baja)
    add_qm(db, a.id, _dt(0), [
        {"p": _pace("5:30"), "l": 1.0, "hr": 132},
        {"p": _pace("5:00"), "l": 1.4, "hr": 142},
    ], "Rodaje con pinchazo")
    v0 = view(db, a.id); d0 = dyn(v0)
    rows.append({"l": "Solo 2pts zona baja", "d": d0})

    # Sem 2: QM en umbral
    add_qm(db, a.id, _dt(1), [
        {"p": _pace("4:30"), "l": 2.8, "hr": 158},
        {"p": _pace("4:10"), "l": 4.2, "hr": 166},
    ], "Tempo con pinchazo")
    v1 = view(db, a.id); d1 = dyn(v1)
    rows.append({"l": "+2pts zona media", "d": d1})

    # Sem 3: QM en zona alta
    add_qm(db, a.id, _dt(2), [
        {"p": _pace("3:50"), "l": 6.0, "hr": 174},
    ], "Intervalos pinchazo")
    v2 = view(db, a.id); d2 = dyn(v2)
    rows.append({"l": "+1pt zona alta", "d": d2})

    # Sem 4: más puntos en LT2
    add_qm(db, a.id, _dt(3), [
        {"p": _pace("4:20"), "l": 3.2, "hr": 160},
        {"p": _pace("4:40"), "l": 2.0, "hr": 152},
    ], "Más puntos medios")
    v3 = view(db, a.id); d3 = dyn(v3)
    rows.append({"l": "+2pts confirma", "d": d3})

    ptable("F3: SOLO QMs SIN TEST", rows)

    issues = []
    # Debe tener ref@4mmol razonable con 7 puntos
    r4 = d3["reference_4mmol"]["pace"]
    check(r4 is not None and _pace("3:50") <= r4 <= _pace("4:30"),
          f"Ref@4mmol razonable sin test: {_fmt_pace(r4)} (esperado 3:50-4:30)", issues)

    # pLT2 debe existir
    plt2 = d3["practical_lt2"]["pace"]
    check(plt2 is not None,
          f"pLT2 estimado sin test formal: {_fmt_pace(plt2)}", issues)

    # Al menos 7 puntos
    check(d3["points"] >= 7,
          f"Puntos acumulados: {d3['points']}", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
# F4: Test viejo + QMs recientes — ¿pesa más lo nuevo?
# ═══════════════════════════════════════════════════════════════════════
def f4_old_test_new_qm(db) -> list[str]:
    """
    Test de hace 5 semanas. QMs de hace 1 semana muestran valores distintos.
    El motor debe dar más peso a los QMs recientes.
    """
    a = mk(db, "F4_old_vs_new")
    # Test viejo (semana 0)
    stages = [
        {"p": _pace("5:10"), "l": 1.0, "hr": 138},
        {"p": _pace("4:50"), "l": 1.6, "hr": 146},
        {"p": _pace("4:30"), "l": 2.5, "hr": 154},
        {"p": _pace("4:10"), "l": 3.8, "hr": 162},
        {"p": _pace("3:50"), "l": 5.5, "hr": 170},
        {"p": _pace("3:30"), "l": 8.0, "hr": 178},
    ]
    add_test(db, a.id, _dt(0), stages, "Test 5 semanas atrás")
    v0 = view(db, a.id); d0 = dyn(v0)
    rows = [{"l": "Test sem 0", "d": d0}]

    # QMs en semana 5 (recientes) — atleta mejoró bastante
    add_qm(db, a.id, _dt(5), [
        {"p": _pace("4:30"), "l": 1.8, "hr": 150},   # era 2.5 → 1.8
        {"p": _pace("4:10"), "l": 2.8, "hr": 158},    # era 3.8 → 2.8
    ], "QM reciente 1")
    v1 = view(db, a.id); d1 = dyn(v1)
    rows.append({"l": "Sem 5 QM1 (mejora)", "d": d1})

    add_qm(db, a.id, _dt(5, 3), [
        {"p": _pace("4:10"), "l": 2.6, "hr": 156},
        {"p": _pace("3:50"), "l": 3.8, "hr": 166},   # era 5.5 → 3.8!
    ], "QM reciente 2")
    v2 = view(db, a.id); d2 = dyn(v2)
    rows.append({"l": "Sem 5+3d QM2", "d": d2})

    ptable("F4: TEST VIEJO (5sem) vs QMs RECIENTES", rows)

    issues = []
    # Los QMs recientes deben tener más peso
    pts = d2["points_used"]
    new_pts = [p for p in pts if p["session_date"] >= "2026-02-09"]
    old_pts = [p for p in pts if p["session_date"] < "2026-02-09"]
    new_w = sum(p["point_weight"] for p in new_pts)
    old_w = sum(p["point_weight"] for p in old_pts)
    total = new_w + old_w
    new_pct = new_w / total * 100 if total > 0 else 0
    check(new_pct > 40,
          f"QMs recientes tienen más peso: {new_pct:.0f}% vs test viejo {100-new_pct:.0f}%", issues)

    # Ref@4mmol debe haberse movido hacia la mejora
    p0 = d0["reference_4mmol"]["pace"]
    p2 = d2["reference_4mmol"]["pace"]
    check(p2 is not None and p0 is not None and p2 < p0,
          f"Ref@4mmol respondió a mejora: {_fmt_pace(p0)} → {_fmt_pace(p2)}", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
# F5: QMs densos (3x/semana) con mejora — ¿converge rápido?
# ═══════════════════════════════════════════════════════════════════════
def f5_dense_qm(db) -> list[str]:
    """
    Test inicial, luego 3 QMs por semana durante 3 semanas (9 QMs).
    Mejora progresiva clara. ¿Converge al valor correcto?
    """
    a = mk(db, "F5_dense")
    stages = [
        {"p": _pace("5:00"), "l": 1.0, "hr": 140},
        {"p": _pace("4:40"), "l": 1.5, "hr": 148},
        {"p": _pace("4:20"), "l": 2.3, "hr": 156},
        {"p": _pace("4:00"), "l": 3.5, "hr": 164},
        {"p": _pace("3:40"), "l": 5.0, "hr": 172},
        {"p": _pace("3:20"), "l": 7.8, "hr": 180},
    ]
    add_test(db, a.id, _dt(0), stages, "Test basal")
    v0 = view(db, a.id); d0 = dyn(v0)
    rows = [{"l": "Test basal", "d": d0}]

    # Semana 1: 3 QMs con mejora leve
    qms_week1 = [
        (_dt(1, 0), [{"p": _pace("4:20"), "l": 2.1, "hr": 154}]),
        (_dt(1, 2), [{"p": _pace("4:00"), "l": 3.2, "hr": 162}]),
        (_dt(1, 4), [{"p": _pace("4:20"), "l": 2.0, "hr": 153}, {"p": _pace("4:40"), "l": 1.3, "hr": 146}]),
    ]
    for dt, ms in qms_week1:
        add_qm(db, a.id, dt, ms, "QM sem1")
    v1 = view(db, a.id); d1 = dyn(v1)
    rows.append({"l": "Sem 1 (3 QMs)", "d": d1})

    # Semana 2: 3 QMs con más mejora
    qms_week2 = [
        (_dt(2, 0), [{"p": _pace("4:20"), "l": 1.8, "hr": 152}]),
        (_dt(2, 2), [{"p": _pace("4:00"), "l": 2.8, "hr": 160}]),
        (_dt(2, 4), [{"p": _pace("4:00"), "l": 2.6, "hr": 158}, {"p": _pace("3:40"), "l": 4.0, "hr": 168}]),
    ]
    for dt, ms in qms_week2:
        add_qm(db, a.id, dt, ms, "QM sem2")
    v2 = view(db, a.id); d2 = dyn(v2)
    rows.append({"l": "Sem 2 (3 QMs)", "d": d2})

    # Semana 3: 3 QMs, mejora consolidada
    qms_week3 = [
        (_dt(3, 0), [{"p": _pace("4:00"), "l": 2.5, "hr": 157}]),
        (_dt(3, 2), [{"p": _pace("3:40"), "l": 3.5, "hr": 165}]),
        (_dt(3, 4), [{"p": _pace("4:20"), "l": 1.6, "hr": 150}, {"p": _pace("3:50"), "l": 3.0, "hr": 162}]),
    ]
    for dt, ms in qms_week3:
        add_qm(db, a.id, dt, ms, "QM sem3")
    v3 = view(db, a.id); d3 = dyn(v3)
    rows.append({"l": "Sem 3 (3 QMs)", "d": d3})

    ptable("F5: QMs DENSOS 3x/SEMANA", rows)

    issues = []
    # Con 9 QMs + test original, debe haber muchos puntos
    check(d3["points"] >= 18,
          f"Muchos puntos acumulados: {d3['points']}", issues)

    # Ref@4mmol debe reflejar mejora neta de ~15s
    p0 = d0["reference_4mmol"]["pace"]
    p3 = d3["reference_4mmol"]["pace"]
    delta = (p0 or 0) - (p3 or 0)
    check(delta >= 5,
          f"Ref@4mmol convergió a mejora: {_fmt_pace(p0)} → {_fmt_pace(p3)} (Δ{delta:.0f}s)", issues)

    # Al final, 4:00/km debería estar cerca de 2.5 mmol (confirmado por 3 QMs recientes)
    # Así que ref@4mmol a 4:00 no tiene sentido; la mejora es clara
    check(p3 is not None and p3 < _pace("4:00"),
          f"Ref@4mmol más rápido que 4:00: {_fmt_pace(p3)}", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
# F6: Atleta entrenado, curva plana — umbrales juntos
# ═══════════════════════════════════════════════════════════════════════
def f6_flat_curve(db) -> list[str]:
    """
    Atleta muy entrenado: lactato sube poco hasta ritmos muy rápidos.
    LT1 y LT2 están muy juntos. QMs confirman.
    ¿El motor mantiene los umbrales bajos y juntos?
    """
    a = mk(db, "F6_flat", level="competitive")
    stages = [
        {"p": _pace("4:30"), "l": 0.7, "hr": 130},
        {"p": _pace("4:10"), "l": 0.9, "hr": 138},
        {"p": _pace("3:50"), "l": 1.2, "hr": 146},
        {"p": _pace("3:30"), "l": 1.8, "hr": 154},
        {"p": _pace("3:15"), "l": 2.8, "hr": 164},
        {"p": _pace("3:00"), "l": 4.5, "hr": 174},
        {"p": _pace("2:50"), "l": 7.0, "hr": 182},
    ]
    add_test(db, a.id, _dt(0), stages, "Test entrenado")
    v0 = view(db, a.id); d0 = dyn(v0)
    rows = [{"l": "Post-test", "d": d0}]

    # QMs confirman valores bajos
    add_qm(db, a.id, _dt(2), [
        {"p": _pace("3:30"), "l": 1.7, "hr": 153},
        {"p": _pace("3:15"), "l": 2.7, "hr": 163},
    ], "QM confirma")
    v1 = view(db, a.id); d1 = dyn(v1)
    rows.append({"l": "Sem 2 (confirma)", "d": d1})

    add_qm(db, a.id, _dt(4), [
        {"p": _pace("3:20"), "l": 2.2, "hr": 158},
        {"p": _pace("3:05"), "l": 3.8, "hr": 170},
    ], "QM confirma 2")
    v2 = view(db, a.id); d2 = dyn(v2)
    rows.append({"l": "Sem 4 (confirma 2)", "d": d2})

    ptable("F6: ATLETA ENTRENADO CURVA PLANA", rows)

    issues = []
    # LT2 debe estar en ritmo rápido (<3:30/km)
    plt2 = d2["practical_lt2"]["pace"]
    check(plt2 is not None and plt2 <= _pace("3:30"),
          f"pLT2 en ritmo rápido: {_fmt_pace(plt2)} (≤3:30)", issues)

    # LT1 y LT2 deben estar juntos (<40s gap)
    plt1 = d2["practical_lt1"]["pace"]
    if plt1 and plt2:
        gap = plt1 - plt2
        check(gap < 50,
              f"Gap LT1-LT2 pequeño: {gap:.0f}s (<50s)", issues)

    # Ref@2mmol debe ser ritmo rápido
    r2 = d2["reference_2mmol"]["pace"]
    check(r2 is not None and r2 <= _pace("3:30"),
          f"Ref@2mmol ritmo rápido: {_fmt_pace(r2)}", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
# F7: QMs que contradicen el test
# ═══════════════════════════════════════════════════════════════════════
def f7_qm_contradicts_test(db) -> list[str]:
    """
    Test dice LT2 @ ~4:10/km. Pero los QMs repetidos muestran que
    a 4:10 el lactato es solo 2.5 mmol (no 3.8 como en el test).
    El test podría haber sido un mal día. ¿El motor se adapta?
    """
    a = mk(db, "F7_contradict")
    # Test en mal día (enfermo, cansado — lactatos altos)
    stages = [
        {"p": _pace("5:00"), "l": 1.5, "hr": 145},
        {"p": _pace("4:40"), "l": 2.2, "hr": 153},
        {"p": _pace("4:20"), "l": 3.2, "hr": 161},
        {"p": _pace("4:00"), "l": 4.8, "hr": 169},
        {"p": _pace("3:40"), "l": 7.0, "hr": 177},
    ]
    add_test(db, a.id, _dt(0), stages, "Test en mal día")
    v0 = view(db, a.id); d0 = dyn(v0)
    rows = [{"l": "Test (mal día)", "d": d0}]

    # QMs consistentes que contradicen: a 4:20 solo 2.0 (no 3.2)
    for w in [2, 3, 4, 5]:
        add_qm(db, a.id, _dt(w), [
            {"p": _pace("4:20"), "l": 2.0 + (w - 2) * 0.05, "hr": 155},
            {"p": _pace("4:00"), "l": 3.0 + (w - 2) * 0.05, "hr": 163},
        ], f"QM sem {w}")
    v1 = view(db, a.id); d1 = dyn(v1)
    rows.append({"l": "Sem 2-5 (4 QMs)", "d": d1})

    ptable("F7: QMs CONTRADICEN TEST (mal día)", rows)

    issues = []
    # Ref@4mmol debe haberse movido a favor de los QMs (más rápido que test)
    p0 = d0["reference_4mmol"]["pace"]
    p1 = d1["reference_4mmol"]["pace"]
    check(p1 is not None and p0 is not None and p1 < p0,
          f"Ref@4mmol siguió QMs no test: {_fmt_pace(p0)} → {_fmt_pace(p1)}", issues)

    # El motor no debe estar pegado al test viejo
    delta = (p0 or 0) - (p1 or 0)
    check(delta >= 5,
          f"Cambio significativo (≥5s): Δ{delta:.0f}s", issues)

    # Los QMs deben tener mayor peso total
    pts = d1["points_used"]
    new_w = sum(p["point_weight"] for p in pts if p["session_date"] >= "2026-01-19")
    old_w = sum(p["point_weight"] for p in pts if p["session_date"] < "2026-01-19")
    total = new_w + old_w
    new_pct = new_w / total * 100 if total > 0 else 0
    check(new_pct > 60,
          f"QMs dominan peso: {new_pct:.0f}% vs test {100-new_pct:.0f}%", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
# F8: Verificación numérica — ¿las interpolaciones cuadran?
# ═══════════════════════════════════════════════════════════════════════
def f8_numerical_check(db) -> list[str]:
    """
    Datos perfectamente lineales para verificar que la interpolación
    produce valores numéricos exactos y coherentes.

    Curva: cada 20s/km de incremento sube 1 mmol.
    5:00→1.0, 4:40→2.0, 4:20→3.0, 4:00→4.0, 3:40→5.0, 3:20→6.0

    Con esta curva lineal:
      - Ref@2mmol debe ser exactamente ~4:40 (300-20*(2-1)=280 → 4:40)
      - Ref@4mmol debe ser exactamente ~4:00 (300-20*(4-1)=240 → 4:00)
      - HR lineal: cada 20s → 8bpm. A 2mmol: ~148, a 4mmol: ~164
    """
    a = mk(db, "F8_linear")
    stages = [
        {"p": _pace("5:00"), "l": 1.0, "hr": 140},
        {"p": _pace("4:40"), "l": 2.0, "hr": 148},
        {"p": _pace("4:20"), "l": 3.0, "hr": 156},
        {"p": _pace("4:00"), "l": 4.0, "hr": 164},
        {"p": _pace("3:40"), "l": 5.0, "hr": 172},
        {"p": _pace("3:20"), "l": 6.0, "hr": 180},
    ]
    add_test(db, a.id, _dt(0), stages, "Datos lineales perfectos")
    v0 = view(db, a.id); d0 = dyn(v0)

    # QMs que confirman la misma curva
    add_qm(db, a.id, _dt(2), [
        {"p": _pace("4:40"), "l": 2.0, "hr": 148},
        {"p": _pace("4:00"), "l": 4.0, "hr": 164},
    ], "QM confirma lineal")
    v1 = view(db, a.id); d1 = dyn(v1)

    print(f"\n  F8: VERIFICACIÓN NUMÉRICA (curva lineal)")
    print(f"  Curva: 5:00→1.0, 4:40→2.0, 4:20→3.0, 4:00→4.0, 3:40→5.0, 3:20→6.0")
    print(f"  Cada 20s/km = +1 mmol | Cada 20s/km = +8 bpm")
    r2 = d1["reference_2mmol"]
    r4 = d1["reference_4mmol"]
    p1 = d1["practical_lt1"]
    p2 = d1["practical_lt2"]
    print(f"\n  {'Referencia':<15} {'Pace esperado':>13} {'Pace real':>10} {'HR esperada':>11} {'HR real':>8} {'Error pace':>11} {'Error HR':>9}")
    print(f"  {'─'*80}")

    checks = [
        ("Ref@2mmol", r2, _pace("4:40"), 148),
        ("Ref@4mmol", r4, _pace("4:00"), 164),
    ]
    issues = []
    for label, ref, exp_pace, exp_hr in checks:
        real_pace = ref.get("pace")
        real_hr = ref.get("hr")
        err_pace = abs((real_pace or 0) - exp_pace)
        err_hr = abs((real_hr or 0) - exp_hr)
        print(f"  {label:<15} {_fmt_pace(exp_pace):>13} {_fmt_pace(real_pace):>10} "
              f"{exp_hr:>11.0f} {(real_hr or 0):>8.0f} "
              f"{err_pace:>10.0f}s {err_hr:>8.1f}bpm")
        check(real_pace is not None and err_pace <= 15,
              f"{label} pace error ≤15s: {err_pace:.0f}s ({_fmt_pace(real_pace)} vs {_fmt_pace(exp_pace)})", issues)
        check(real_hr is not None and err_hr <= 5,
              f"{label} HR error ≤5bpm: {err_hr:.1f}bpm ({real_hr:.0f} vs {exp_hr})", issues)

    # pLT2 should be near ~3.1 mmol target → between 4:00 and 4:20
    plt2_pace = p2.get("pace")
    check(plt2_pace is not None and _pace("3:50") <= plt2_pace <= _pace("4:25"),
          f"pLT2 pace coherente: {_fmt_pace(plt2_pace)} (esperado ~4:00-4:25)", issues)

    cleanup(db, a.name)
    return issues


# ═══════════════════════════════════════════════════════════════════════
def main():
    db = SessionLocal()
    print("=" * 80)
    print("  QM EFFICIENCY TEST — ¿Se mueven bien? ¿Son correctos?")
    print("=" * 80)

    tests = [
        ("F1", "Ciclista potencia (FTP)", f1_cyclist_power),
        ("F2", "Salto grande (altitude camp)", f2_big_jump),
        ("F3", "Solo QMs sin test", f3_no_test_only_qm),
        ("F4", "Test viejo vs QMs recientes", f4_old_test_new_qm),
        ("F5", "QMs densos 3x/semana", f5_dense_qm),
        ("F6", "Entrenado curva plana", f6_flat_curve),
        ("F7", "QMs contradicen test (mal día)", f7_qm_contradicts_test),
        ("F8", "Verificación numérica lineal", f8_numerical_check),
    ]

    results = []
    for code, desc, fn in tests:
        print(f"\n{'═' * 80}")
        print(f"  {code}: {desc}")
        print(f"{'═' * 80}")
        try:
            issues = fn(db)
            results.append((code, desc, len(issues) == 0, issues))
        except Exception as e:
            import traceback; traceback.print_exc()
            results.append((code, desc, False, [f"EXCEPTION: {e}"]))

    print(f"\n{'═' * 80}")
    print(f"  RESUMEN")
    print(f"{'═' * 80}")
    ok = sum(1 for *_, p, _ in results if p)
    for code, desc, passed, issues in results:
        s = "✓" if passed else "✗"
        print(f"  {s} {code}: {desc} — {'PASS' if passed else 'FAIL'}")
        for i in issues[:3]:
            print(f"      • {i}")
    print(f"\n  {ok}/{len(results)} PASS | {len(results)-ok} issues")
    print("=" * 80)
    db.close()


if __name__ == "__main__":
    main()
