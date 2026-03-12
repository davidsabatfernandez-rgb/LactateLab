"""
Test de ciclo de vida completo de un atleta:
  entrada lactato → detección umbrales → recomendación mesociclo →
  bloque completado → nuevo test → progresión → siguiente bloque →
  ... hasta objetivo o max bloques.

Simula lo que haría un entrenador real en la app:
1. Crea atleta con perfil y objetivo de carrera
2. Registra un test incremental de lactato (Session + Intervals + LactateSamples)
3. Recalcula → umbrales detectados
4. Llama a recommend_next_mesocycle() (pipeline completo con planning_engine)
5. Crea FocusBlock en DB simulando la ejecución del mesociclo
6. Registra nuevo test post-bloque con adaptación simulada
7. Repite hasta llegar al objetivo o agotar semanas

Uso:
    cd backend
    source .venv/bin/activate
    python -m pytest tests/test_athlete_lifecycle.py -v -s
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session as DbSession, sessionmaker

from app.db.base import Base
from app.models.athlete import Athlete, AthleteFocusBlock, AthleteTarget
from app.models.session import LactateSample, Session, SessionInterval
from app.services.analytics import recalculate_athlete, athlete_analysis_payload
from app.services.planning_engine import recommend_next_mesocycle


# ═══════════════════════════════════════════════════════════════════════════
# Athlete profiles — perfiles realistas de atletas
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class LactateStep:
    """Un escalón de test incremental."""
    pace_sec_km: Optional[float] = None
    power_watts: Optional[float] = None
    lactate_mmol: float = 0.0
    hr: int = 140


@dataclass
class AthleteLifecycle:
    """Perfil completo de un atleta para simulación de ciclo de vida."""
    name: str
    discipline: str
    level: str  # recreational | trained | competitive
    sex: str
    weight: float
    age: int  # years

    # Objetivo
    target_distance: str  # "5k" | "10k" | "hm" | "marathon" | etc.
    target_pace_label: Optional[str] = None  # "4:30" para running
    target_power_watts: Optional[float] = None  # para ciclismo
    target_weeks: int = 20  # semanas hasta la carrera

    # Test inicial de lactato
    initial_curve: list[LactateStep] = field(default_factory=list)

    # Adaptación esperada por bloque (mejora % del gap por bloque)
    adaptation_rate: float = 0.12  # 12% del gap por bloque por defecto

    # Max bloques a simular
    max_blocks: int = 6

    description: str = ""


def _s(pace=None, power=None, lac=0.0, hr=140) -> LactateStep:
    return LactateStep(pace_sec_km=pace, power_watts=power, lactate_mmol=lac, hr=hr)


# ── Atletas ──────────────────────────────────────────────────────────────

JAVI = AthleteLifecycle(
    name="Javi — Trained runner 10k sub-40",
    discipline="running", level="trained", sex="M", weight=72, age=32,
    target_distance="10k", target_pace_label="4:00", target_weeks=20,
    description="Runner entrenado con base aeróbica decente pero LT2 lejos del objetivo. "
                "Debería pasar por AEC/THR antes de llegar a pre_comp.",
    initial_curve=[
        _s(pace=390, lac=0.8, hr=120),   # 6:30
        _s(pace=360, lac=0.9, hr=128),   # 6:00
        _s(pace=330, lac=1.2, hr=138),   # 5:30
        _s(pace=300, lac=1.8, hr=148),   # 5:00
        _s(pace=270, lac=2.8, hr=158),   # 4:30
        _s(pace=255, lac=4.2, hr=168),   # 4:15 ← LT2 zone
        _s(pace=240, lac=6.5, hr=176),   # 4:00
    ],
)

ELENA = AthleteLifecycle(
    name="Elena — Recreational HM sub-2h",
    discipline="running", level="recreational", sex="F", weight=58, age=28,
    target_distance="hm", target_pace_label="5:40", target_weeks=24,
    description="Corredora recreacional preparando su primer medio maratón. "
                "Base aeróbica débil, LT1 bajo. Necesita mucho AEC antes de THR.",
    initial_curve=[
        _s(pace=450, lac=0.9, hr=125),   # 7:30
        _s(pace=420, lac=1.1, hr=135),   # 7:00
        _s(pace=390, lac=1.5, hr=145),   # 6:30
        _s(pace=360, lac=2.5, hr=155),   # 6:00
        _s(pace=340, lac=4.0, hr=165),   # 5:40 ← LT2 justo en objetivo
        _s(pace=320, lac=6.0, hr=172),   # 5:20
    ],
)

PEDRO = AthleteLifecycle(
    name="Pedro — Competitive 5k sub-17",
    discipline="running", level="competitive", sex="M", weight=65, age=25,
    target_distance="5k", target_pace_label="3:24", target_weeks=12,
    description="Corredor competitivo con excelente base. LT2 ya cerca del objetivo. "
                "Debería ir directo a ANP/COMP en pre_comp.",
    initial_curve=[
        _s(pace=270, lac=0.7, hr=120),   # 4:30
        _s(pace=250, lac=0.8, hr=128),   # 4:10
        _s(pace=230, lac=1.1, hr=138),   # 3:50
        _s(pace=215, lac=1.8, hr=150),   # 3:35
        _s(pace=205, lac=3.0, hr=162),   # 3:25
        _s(pace=195, lac=4.5, hr=170),   # 3:15 ← LT2
        _s(pace=185, lac=7.0, hr=178),   # 3:05
        _s(pace=175, lac=11.0, hr=185),  # 2:55
    ],
)

CARLOS = AthleteLifecycle(
    name="Carlos — Trained ciclista TT 280W",
    discipline="ciclismo", level="trained", sex="M", weight=78, age=35,
    target_distance="road_tt", target_power_watts=280.0, target_weeks=16,
    description="Ciclista entrenado preparando contrarreloj. FTP actual ~250W, "
                "necesita subir LT2 unos 30W.",
    initial_curve=[
        _s(power=140, lac=0.7, hr=110),
        _s(power=170, lac=0.8, hr=120),
        _s(power=200, lac=1.2, hr=135),  # LT1
        _s(power=230, lac=2.0, hr=148),
        _s(power=250, lac=3.2, hr=158),  # LT2 ~250W
        _s(power=275, lac=5.0, hr=168),
        _s(power=300, lac=8.0, hr=178),
    ],
)

LAURA = AthleteLifecycle(
    name="Laura — Trained ironman runner sub-4h",
    discipline="running", level="trained", sex="F", weight=60, age=34,
    target_distance="ironman_run", target_pace_label="5:40", target_weeks=28,
    description="Triatleta preparando el segmento de carrera del Ironman. "
                "Necesita LT1 alto (durabilidad) más que LT2 extremo. "
                "Motor debería priorizar AEC extenso.",
    initial_curve=[
        _s(pace=420, lac=0.7, hr=118),   # 7:00
        _s(pace=390, lac=0.8, hr=125),   # 6:30
        _s(pace=360, lac=1.0, hr=135),   # 6:00
        _s(pace=330, lac=1.5, hr=145),   # 5:30 ← LT1
        _s(pace=310, lac=2.5, hr=155),   # 5:10
        _s(pace=290, lac=4.0, hr=165),   # 4:50 ← LT2
        _s(pace=270, lac=6.5, hr=175),   # 4:30
    ],
)

MIGUEL = AthleteLifecycle(
    name="Miguel — Competitive sprint tri",
    discipline="running", level="competitive", sex="M", weight=70, age=27,
    target_distance="sprint_tri", target_pace_label="3:50", target_weeks=10,
    description="Triatleta sprint con LT2 ya en rango. Fase pre_comp, "
                "debería ir a ANP o COMP directamente.",
    initial_curve=[
        _s(pace=300, lac=0.7, hr=118),   # 5:00
        _s(pace=270, lac=0.9, hr=128),   # 4:30
        _s(pace=250, lac=1.3, hr=140),   # 4:10
        _s(pace=235, lac=2.2, hr=152),   # 3:55
        _s(pace=220, lac=3.8, hr=164),   # 3:40 ← LT2 (ya en rango)
        _s(pace=210, lac=5.5, hr=172),   # 3:30
        _s(pace=200, lac=9.0, hr=180),   # 3:20
    ],
)

SERGIO = AthleteLifecycle(
    name="Sergio — Recreational marathon sub-3:30",
    discipline="running", level="trained", sex="M", weight=80, age=40,
    target_distance="marathon", target_pace_label="5:00", target_weeks=30,
    description="Corredor de maratón con base aeróbica pero LT1 insuficiente para "
                "la durabilidad que exige 42k. Motor debería priorizar AEC largo.",
    initial_curve=[
        _s(pace=420, lac=0.8, hr=120),   # 7:00
        _s(pace=390, lac=0.9, hr=128),   # 6:30
        _s(pace=360, lac=1.3, hr=140),   # 6:00 ← LT1
        _s(pace=330, lac=2.2, hr=152),   # 5:30
        _s(pace=310, lac=3.5, hr=162),   # 5:10
        _s(pace=290, lac=5.5, hr=170),   # 4:50 ← LT2
        _s(pace=270, lac=8.0, hr=178),   # 4:30
    ],
)

ALL_ATHLETES = [JAVI, ELENA, PEDRO, CARLOS, LAURA, MIGUEL, SERGIO]


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _add_lactate_test(
    db: DbSession,
    athlete: Athlete,
    curve: list[LactateStep],
    test_date: datetime,
) -> Session:
    """Inserta un test de lactato completo (sesión + intervalos + muestras)."""
    session = Session(
        athlete_id=athlete.id,
        performed_at=test_date,
        discipline=athlete.primary_discipline,
        session_type="test",
        goal="Test incremental de lactato",
    )
    db.add(session)
    db.flush()

    for j, step in enumerate(curve):
        interval = SessionInterval(
            session_id=session.id,
            order_index=j + 1,
            duration_seconds=300,  # 5 min por escalón
            rest_seconds=60,
            rest_type="passive",
            heart_rate_avg=step.hr,
            pace_seconds_per_km=step.pace_sec_km,
            power_watts=step.power_watts,
            purpose="step",
        )
        db.add(interval)
        db.flush()

        sample = LactateSample(
            interval_id=interval.id,
            lactate_mmol=step.lactate_mmol,
            sample_delay_seconds=30,
            sample_timing_label="end_of_step",
        )
        db.add(sample)

    db.flush()
    return session


def _simulate_adaptation(
    curve: list[LactateStep],
    block_type: str,
    discipline: str,
    rate: float,
) -> list[LactateStep]:
    """Simula adaptación fisiológica tras un bloque de entrenamiento.

    Según Olbrecht (SoW), cada tipo de bloque afecta LT1 y LT2 de forma
    diferente. Simulamos bajando el lactato en los escalones relevantes.
    """
    # Cuánto baja el lactato en cada zona según el bloque
    # Adaptación amplificada para que los cambios sean visibles en pasos discretos
    # de un test incremental. En la realidad la mejora es continua; aquí necesitamos
    # que el lactato a un mismo ritmo baje lo suficiente para que el motor de detección
    # recoloque el umbral en un escalón diferente (cada escalón = 15-30 sec/km).
    ADAPTATIONS = {
        "aerobic_capacity_block":       {"low": 0.30, "mid": 0.15, "high": 0.05},
        "threshold_development_block":  {"low": 0.10, "mid": 0.30, "high": 0.20},
        "aerobic_power_block":          {"low": 0.05, "mid": 0.25, "high": 0.30},
        "anaerobic_capacity_block":     {"low": 0.05, "mid": 0.10, "high": 0.15},
        "anaerobic_power_block":        {"low": 0.02, "mid": 0.10, "high": 0.25},
        "competition_specific_block":   {"low": 0.05, "mid": 0.15, "high": 0.20},
        "testing_decision_block":       {"low": 0.00, "mid": 0.00, "high": 0.00},
        "technical_rebuild_block":      {"low": 0.05, "mid": 0.03, "high": 0.02},
        "recovery_consolidation_block": {"low": 0.02, "mid": 0.02, "high": 0.02},
    }

    adapt = ADAPTATIONS.get(block_type, {"low": 0.02, "mid": 0.02, "high": 0.02})
    new_curve = []
    for i, step in enumerate(curve):
        frac = i / max(len(curve) - 1, 1)  # 0.0 → 1.0
        if frac < 0.4:
            zone = "low"
        elif frac < 0.75:
            zone = "mid"
        else:
            zone = "high"

        delta = adapt[zone] * step.lactate_mmol * rate
        new_lac = max(0.4, step.lactate_mmol - delta)

        new_curve.append(LactateStep(
            pace_sec_km=step.pace_sec_km,
            power_watts=step.power_watts,
            lactate_mmol=round(new_lac, 2),
            hr=step.hr,
        ))
    return new_curve


# ═══════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture()
def db():
    """DB en memoria, sesión fresca por test."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


# ═══════════════════════════════════════════════════════════════════════════
# Test principal — ciclo de vida completo
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("profile_idx", range(len(ALL_ATHLETES)))
def test_athlete_lifecycle(db: DbSession, profile_idx: int):
    """Simula el ciclo de vida completo de un atleta desde el primer test de lactato."""
    profile = ALL_ATHLETES[profile_idx]
    today = date.today()

    print(f"\n{'═'*75}")
    print(f"  ATLETA: {profile.name}")
    print(f"  {profile.description}")
    print(f"  Objetivo: {profile.target_distance} @ {profile.target_pace_label or f'{profile.target_power_watts}W'}")
    print(f"  Semanas: {profile.target_weeks}, Level: {profile.level}")
    print(f"{'═'*75}")

    # ── 1. Crear atleta ──────────────────────────────────────────────────
    athlete = Athlete(
        name=profile.name,
        date_of_birth=date(today.year - profile.age, 6, 15),
        sex=profile.sex,
        weight=profile.weight,
        height=175,
        primary_discipline=profile.discipline,
        athlete_level=profile.level,
        created_at=today,
    )
    db.add(athlete)
    db.flush()

    # ── 2. Crear objetivo ────────────────────────────────────────────────
    target_date = today + timedelta(weeks=profile.target_weeks)
    target = AthleteTarget(
        athlete_id=athlete.id,
        target_date=target_date,
        discipline=profile.discipline,
        objective=f"{profile.target_distance} — {profile.target_pace_label or f'{profile.target_power_watts}W'}",
        distance_category=profile.target_distance,
        target_pace_label=profile.target_pace_label,
        target_power_watts=profile.target_power_watts,
    )
    db.add(target)
    db.flush()

    # ── 3. Test de lactato inicial ───────────────────────────────────────
    test_dt = datetime.now(timezone.utc) - timedelta(days=3)
    _add_lactate_test(db, athlete, profile.initial_curve, test_dt)
    db.commit()

    recalculate_athlete(db, athlete.id)
    db.commit()

    # ── 4. Bucle de bloques ──────────────────────────────────────────────
    current_curve = list(profile.initial_curve)
    block_history: list[dict] = []
    weeks_used = 0
    block_start = today

    for block_num in range(1, profile.max_blocks + 1):
        weeks_remaining = profile.target_weeks - weeks_used
        if weeks_remaining <= 0:
            print(f"\n  ⏰ Sin semanas restantes tras {block_num - 1} bloques")
            break

        print(f"\n  ── Bloque {block_num} (semanas restantes: {weeks_remaining}) ──")

        # Obtener recomendación completa via planning_engine
        try:
            recommendation = recommend_next_mesocycle(db, athlete.id, profile.discipline)
        except Exception as e:
            print(f"  ❌ Error en recommend_next_mesocycle: {e}")
            block_history.append({"block": block_num, "error": str(e)})
            break

        next_rec = recommendation.get("next_recommendation") or {}
        rec_block = next_rec.get("recommended_block_type", "unknown")
        scoring_ctx = next_rec.get("scoring_context") or {}
        selection_engine = scoring_ctx.get("selection_engine", "?")
        reasoning = next_rec.get("reasoning", [])
        risk_flags = next_rec.get("risk_flags", [])

        # Extraer info del gap fisiológico
        physio_info = next_rec.get("physiological_analysis") or {}
        data_quality = physio_info.get("data_quality", "?")
        primary_limiter = physio_info.get("primary_limiter", "?")
        lt2_gap = physio_info.get("lt2_gap_kmh")
        lt1_gap = physio_info.get("lt1_gap_kmh")
        season_phase = physio_info.get("season_phase", "?")

        # Extraer LT info del reasoning (el contexto no se expone directamente)
        lt1_val = None
        lt2_val = None
        lt1_conf = 0
        lt2_conf = 0
        cap_profile = {}

        # Extraer candidatos evaluados
        candidates = next_rec.get("candidates_scored") or []

        # Nombre corto del bloque para print
        short_block = (rec_block.replace("_block", "")
                       .replace("aerobic_capacity", "AEC")
                       .replace("threshold_development", "THR")
                       .replace("aerobic_power", "AEP")
                       .replace("anaerobic_power", "ANP")
                       .replace("anaerobic_capacity", "ANC")
                       .replace("competition_specific", "COMP")
                       .replace("testing_decision", "TEST")
                       .replace("recovery_consolidation", "REC")
                       .replace("technical_rebuild", "TECH"))

        print(f"    Recomendación: {short_block} ({rec_block})")
        print(f"    Motor: {selection_engine}")
        print(f"    Fase: {season_phase}, Calidad datos: {data_quality}")
        print(f"    Limitante: {primary_limiter}")
        if lt2_gap is not None:
            gap_str = f"Gap LT2: {lt2_gap:+.2f}"
            if lt1_gap is not None:
                gap_str += f", Gap LT1: {lt1_gap:+.2f}"
            print(f"    {gap_str}")
        if candidates:
            top3 = candidates[:3] if isinstance(candidates, list) else []
            for c in top3:
                cname = c.get("block_type", "?")
                cscore = c.get("score", 0)
                badge = " ← elegido" if cname == rec_block else ""
                print(f"    Candidato: {cname} (score={cscore}){badge}")
        if reasoning:
            for r in reasoning[:2]:
                print(f"    📝 {r[:120]}")
        if risk_flags:
            for rf in risk_flags[:2]:
                print(f"    ⚠️  {rf[:120]}")

        # Determinar duración del bloque
        draft = recommendation.get("mesocycle_draft") or {}
        draft_weeks = draft.get("weeks") or []
        block_duration = len(draft_weeks) if draft_weeks else 4

        # Registrar bloque
        block_entry = {
            "block": block_num,
            "type": rec_block,
            "engine": selection_engine,
            "phase": season_phase,
            "data_quality": data_quality,
            "limiter": primary_limiter,
            "lt2_gap": lt2_gap,
            "lt1_gap": lt1_gap,
            "duration": block_duration,
            "draft_sessions": sum(len(w.get("sessions", [])) for w in draft_weeks),
        }
        block_history.append(block_entry)

        # Crear FocusBlock en DB (simular que el entrenador lo acepta)
        block_end = block_start + timedelta(weeks=block_duration)
        focus_block = AthleteFocusBlock(
            athlete_id=athlete.id,
            start_date=block_start,
            end_date=block_end,
            energy_system_focus=rec_block,
            block_objective=f"Bloque {block_num}: {rec_block}",
            priority_discipline=profile.discipline,
            phase=season_phase,
            target_date=target_date,
            status="completed",
        )
        db.add(focus_block)
        db.flush()

        weeks_used += block_duration
        block_start = block_end

        # Simular adaptación
        current_curve = _simulate_adaptation(
            current_curve, rec_block, profile.discipline, profile.adaptation_rate
        )

        # Nuevo test post-bloque
        new_test_dt = datetime.now(timezone.utc) - timedelta(days=max(1, 3 - block_num))
        _add_lactate_test(db, athlete, current_curve, new_test_dt)
        db.commit()
        recalculate_athlete(db, athlete.id)
        db.commit()

    # ── 5. Resumen del viaje ─────────────────────────────────────────────
    print(f"\n  ── Resumen del viaje ({profile.name}) ──")
    journey = " → ".join(
        b.get("type", "?").replace("_block", "").replace("aerobic_capacity", "AEC")
        .replace("threshold_development", "THR").replace("aerobic_power", "AEP")
        .replace("anaerobic_power", "ANP").replace("anaerobic_capacity", "ANC")
        .replace("competition_specific", "COMP").replace("testing_decision", "TEST")
        .replace("recovery_consolidation", "REC").replace("technical_rebuild", "TECH")
        for b in block_history if "type" in b
    )
    print(f"  Secuencia: {journey}")
    print(f"  Bloques: {len(block_history)}, Semanas usadas: {weeks_used}/{profile.target_weeks}")

    # ── 6. Validaciones ──────────────────────────────────────────────────
    errors = []

    # V1: Siempre debe haber una recomendación
    for b in block_history:
        if "error" in b:
            errors.append(f"Block {b['block']}: error {b['error']}")
        if b.get("type") == "unknown":
            errors.append(f"Block {b['block']}: tipo desconocido")

    # V2: El motor fisiológico debe mandar (no solo heurística) cuando hay datos
    physio_driven = [b for b in block_history if "physiological" in (b.get("engine") or "")]
    if block_history and not physio_driven:
        # Solo error si hay al menos un bloque con data_quality=good
        good_data = [b for b in block_history if b.get("data_quality") == "good"]
        if good_data:
            errors.append("Ningún bloque fue decidido por el motor fisiológico — el test de lactato no tuvo efecto")

    # V3: data_quality debe ser "good" o al menos "low" en el primer bloque (test reciente)
    first_dq = block_history[0].get("data_quality") if block_history else None
    if first_dq and first_dq not in ("good", "low", "none"):
        errors.append(f"Primer bloque con data_quality={first_dq} — inesperado")

    # V4: Cada bloque debe generar un draft con sesiones
    for b in block_history:
        if b.get("draft_sessions", 0) == 0 and "error" not in b:
            errors.append(f"Block {b['block']}: draft sin sesiones")

    # V5: No más de 2 ANP consecutivos (Olbrecht)
    types = [b.get("type") for b in block_history if "type" in b]
    for i in range(len(types) - 2):
        if types[i] == types[i+1] == types[i+2] == "anaerobic_power_block":
            errors.append(f"3 ANP consecutivos en bloques {i+1}-{i+3} — viola Olbrecht")

    # V6: No más de 4 AEC consecutivos FUERA de base_early (guardrail de estancamiento)
    # En base_early, AEC extenso es correcto (Olbrecht R1)
    phases = [b.get("phase") for b in block_history if "phase" in b]
    for i in range(len(types) - 3):
        if all(t == "aerobic_capacity_block" for t in types[i:i+4]):
            # Solo es error si alguno de esos bloques NO está en base_early
            block_phases = phases[i:i+4] if i+4 <= len(phases) else phases[i:]
            if any(p != "base_early" for p in block_phases):
                errors.append(f"4 AEC consecutivos en bloques {i+1}-{i+4} fuera de base_early — estancamiento")

    # V7: base_early siempre AEC (R1 de Olbrecht)
    for b in block_history:
        if b.get("phase") == "base_early" and b.get("type") not in (
            "aerobic_capacity_block", "testing_decision_block",
            "technical_rebuild_block", "recovery_consolidation_block"
        ):
            errors.append(f"Block {b['block']}: {b['type']} en base_early — solo AEC permitido")

    # V8: taper ≤3 semanas → siempre COMP
    for b in block_history:
        if b.get("phase") == "taper" and b.get("type") != "competition_specific_block":
            errors.append(f"Block {b['block']}: {b['type']} en taper — debería ser COMP")

    if errors:
        print(f"\n  ❌ ERRORES:")
        for e in errors:
            print(f"    • {e}")

    assert not errors, f"{len(errors)} errores en el ciclo de vida: {errors}"
    print(f"\n  ✅ Ciclo de vida válido: {journey}")


# ═══════════════════════════════════════════════════════════════════════════
# Tests estructurales adicionales
# ═══════════════════════════════════════════════════════════════════════════

def test_fresh_athlete_no_test_gets_testing_decision(db: DbSession):
    """Un atleta sin ningún test de lactato debería recibir testing_decision_block o
    una recomendación conservadora (AEC) con warning de falta de datos."""
    today = date.today()
    athlete = Athlete(
        name="Atleta sin datos",
        date_of_birth=date(1995, 1, 1),
        sex="M", weight=75, height=180,
        primary_discipline="running",
        athlete_level="trained",
        created_at=today,
    )
    db.add(athlete)
    db.flush()

    target = AthleteTarget(
        athlete_id=athlete.id,
        target_date=today + timedelta(weeks=20),
        discipline="running",
        objective="10k sub-40",
        distance_category="10k",
        target_pace_label="4:00",
    )
    db.add(target)
    db.commit()

    rec = recommend_next_mesocycle(db, athlete.id, "running")
    next_rec = rec.get("next_recommendation") or {}
    block = next_rec.get("recommended_block_type", "")
    scoring_ctx = next_rec.get("scoring_context") or {}
    engine = scoring_ctx.get("selection_engine", "")
    risk_flags = next_rec.get("risk_flags", [])

    print(f"\n  Sin datos: block={block}, engine={engine}")
    print(f"  Risk flags: {risk_flags[:2]}")

    # Sin datos → el motor no puede ser physiological_primary
    assert "physiological_primary" not in engine, \
        "Sin test de lactato no debería usar motor fisiológico como primario"

    # Debe haber un warning sobre falta de datos
    all_text = " ".join(risk_flags + (rec.get("warnings") or [])).lower()
    assert "lactato" in all_text or "test" in all_text or "no_data" in all_text \
           or "sin" in all_text or "datos" in all_text or "pocos" in all_text, \
        f"Debería haber warning sobre falta de test de lactato, got: {risk_flags}"
    print("  ✅ Atleta sin datos manejado correctamente")


def test_single_test_triggers_real_thresholds_with_enough_steps(db: DbSession):
    """Un test limpio de 7 escalones debería producir umbrales reales (source=real)
    con confianza suficiente para guiar la prescripción."""
    today = date.today()
    athlete = Athlete(
        name="Test calidad umbral",
        date_of_birth=date(1990, 5, 15),
        sex="M", weight=72, height=178,
        primary_discipline="running",
        athlete_level="trained",
        created_at=today,
    )
    db.add(athlete)
    db.flush()

    target = AthleteTarget(
        athlete_id=athlete.id,
        target_date=today + timedelta(weeks=16),
        discipline="running",
        objective="10k",
        distance_category="10k",
        target_pace_label="4:15",
    )
    db.add(target)
    db.flush()

    # Test limpio de 7 escalones
    curve = [
        _s(pace=390, lac=0.8, hr=120),
        _s(pace=360, lac=0.9, hr=128),
        _s(pace=330, lac=1.2, hr=138),
        _s(pace=300, lac=1.8, hr=148),
        _s(pace=270, lac=2.8, hr=158),
        _s(pace=255, lac=4.2, hr=168),
        _s(pace=240, lac=6.5, hr=176),
    ]
    _add_lactate_test(db, athlete, curve,
                      datetime.now(timezone.utc) - timedelta(days=2))
    db.commit()
    recalculate_athlete(db, athlete.id)
    db.commit()

    analysis = athlete_analysis_payload(db, athlete.id)
    disc_view = (analysis.get("discipline_views") or {}).get("running") or {}

    thresholds = disc_view.get("thresholds") or []
    real_thresholds = disc_view.get("real_thresholds") or {}

    print(f"\n  Thresholds detectados: {len(thresholds)}")
    for t in thresholds:
        print(f"    {t.get('name')}: pace={t.get('pace_seconds_per_km')}, "
              f"conf={t.get('confidence')}, evidence={t.get('evidence_level')}")

    has_real = bool(real_thresholds.get("lt2_real"))
    print(f"  Real thresholds: {'Sí' if has_real else 'No'}")

    # Un test limpio de 7 escalones debe detectar al menos LT2
    assert len(thresholds) >= 1, "7 escalones limpios deben detectar al menos 1 umbral"

    lt2 = next((t for t in thresholds if t.get("name") == "LT2"), None)
    assert lt2 is not None, "7 escalones limpios deben detectar LT2"
    assert lt2["confidence"] >= 0.70, f"LT2 conf={lt2['confidence']}, esperado ≥0.70"

    # El motor fisiológico debe poder usar estos datos
    rec = recommend_next_mesocycle(db, athlete.id, "running")
    next_rec = rec.get("next_recommendation") or {}
    scoring_ctx = next_rec.get("scoring_context") or {}
    engine = scoring_ctx.get("selection_engine", "")
    print(f"  Selection engine: {engine}")
    assert "physiological" in engine, \
        f"Con test limpio el motor fisiológico debería mandar, got {engine}"

    print("  ✅ Umbrales reales detectados y usados por el motor")


def test_recommend_produces_complete_draft(db: DbSession):
    """La recomendación debe incluir un draft de mesociclo con sesiones reales."""
    today = date.today()
    athlete = Athlete(
        name="Draft test",
        date_of_birth=date(1992, 3, 1),
        sex="F", weight=62, height=168,
        primary_discipline="running",
        athlete_level="trained",
        created_at=today,
    )
    db.add(athlete)
    db.flush()

    target = AthleteTarget(
        athlete_id=athlete.id,
        target_date=today + timedelta(weeks=16),
        discipline="running",
        objective="HM sub-1:40",
        distance_category="hm",
        target_pace_label="4:45",
    )
    db.add(target)
    db.flush()

    curve = [
        _s(pace=390, lac=0.8, hr=122),
        _s(pace=360, lac=1.0, hr=132),
        _s(pace=330, lac=1.5, hr=145),
        _s(pace=310, lac=2.5, hr=155),
        _s(pace=290, lac=4.0, hr=165),
        _s(pace=270, lac=6.5, hr=175),
    ]
    _add_lactate_test(db, athlete, curve,
                      datetime.now(timezone.utc) - timedelta(days=1))
    db.commit()
    recalculate_athlete(db, athlete.id)
    db.commit()

    rec = recommend_next_mesocycle(db, athlete.id, "running")
    draft = rec.get("mesocycle_draft") or {}
    weeks = draft.get("weeks") or []

    print(f"\n  Draft: {len(weeks)} semanas")
    total_sessions = 0
    for w in weeks:
        sessions = w.get("sessions") or []
        total_sessions += len(sessions)
        labels = [s.get("template_id", "?") for s in sessions]
        print(f"    Semana {w.get('week_index')}/{w.get('week_label', '?')}: "
              f"{len(sessions)} sesiones — {', '.join(labels)}")

    assert len(weeks) >= 2, f"Draft debe tener ≥2 semanas, got {len(weeks)}"
    assert total_sessions >= 4, f"Draft debe tener ≥4 sesiones, got {total_sessions}"

    # Cada sesión debe tener template_id y public_label
    for w in weeks:
        for s in w.get("sessions") or []:
            assert s.get("template_id"), f"Sesión sin template_id: {s}"
            assert s.get("public_label"), f"Sesión sin public_label: {s}"

    print(f"  ✅ Draft completo: {len(weeks)} semanas, {total_sessions} sesiones")
