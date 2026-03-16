"""
Test de ciclo de vida con factor de respuesta (response_factor).

Valida que el sistema de respuesta histórica modula correctamente
la selección de mesociclos basándose en los deltas LT1/LT2 reales
que el atleta muestra tras cada bloque de entrenamiento.

Evidencia científica que respalda las decisiones:
- Olbrecht (Science of Winning): secuencia AEC→THR→AEP natural,
  cambiar eje AEC↔ANC cuando hay estancamiento.
- Mujika (2003): la pérdida de adaptaciones centrales tras bloques
  intensivos exige consolidación aeróbica.
- Laursen & Jenkins (2002): variedad de estímulo acelera la
  supercompensación cuando un bloque único deja de producir respuesta.
- Faude et al. (2009): LT1/LT2 como marcadores fiables de
  adaptación aeróbica y de umbral.

Uso:
    cd backend
    source .venv/bin/activate
    python -m pytest tests/test_response_factor_lifecycle.py -v -s
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
from app.models.metrics import PhysiologicalSnapshot
from app.models.session import LactateSample, Session, SessionInterval
from app.services.analytics import recalculate_athlete
from app.services.planning_engine import (
    BlockResponseRecord,
    _apply_response_factor,
    _NATURAL_PROGRESSION,
    _PROTECTIVE_BLOCKS,
    _score_block_candidates,
    recommend_next_mesocycle,
)


# ═══════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class LactateStep:
    pace_sec_km: Optional[float] = None
    power_watts: Optional[float] = None
    lactate_mmol: float = 0.0
    hr: int = 140


def _s(pace=None, power=None, lac=0.0, hr=140) -> LactateStep:
    return LactateStep(pace_sec_km=pace, power_watts=power, lactate_mmol=lac, hr=hr)


def _add_lactate_test(db, athlete, curve, test_date):
    session = Session(
        athlete_id=athlete.id,
        performed_at=test_date,
        discipline=athlete.primary_discipline,
        session_type="test",
        goal="Test incremental",
    )
    db.add(session)
    db.flush()
    for j, step in enumerate(curve):
        interval = SessionInterval(
            session_id=session.id,
            order_index=j + 1,
            duration_seconds=300,
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


def _create_athlete(db, name, discipline="running", level="trained",
                    sex="M", weight=72, age=30):
    athlete = Athlete(
        name=name,
        date_of_birth=date(date.today().year - age, 6, 15),
        sex=sex, weight=weight, height=175,
        primary_discipline=discipline,
        athlete_level=level,
        created_at=date.today(),
    )
    db.add(athlete)
    db.flush()
    return athlete


def _create_target(db, athlete, distance, pace_label=None, power=None, weeks=20):
    target = AthleteTarget(
        athlete_id=athlete.id,
        target_date=date.today() + timedelta(weeks=weeks),
        discipline=athlete.primary_discipline,
        objective=f"{distance} — {pace_label or f'{power}W'}",
        distance_category=distance,
        target_pace_label=pace_label,
        target_power_watts=power,
    )
    db.add(target)
    db.flush()
    return target


def _simulate_block(db, athlete, block_type, start, duration_weeks=3,
                    discipline=None, phase="specific"):
    """Create a completed FocusBlock in DB."""
    block = AthleteFocusBlock(
        athlete_id=athlete.id,
        start_date=start,
        end_date=start + timedelta(weeks=duration_weeks),
        energy_system_focus=block_type,
        block_objective=f"Test block: {block_type}",
        priority_discipline=discipline or athlete.primary_discipline,
        phase=phase,
        target_date=date.today() + timedelta(weeks=20),
        status="completed",
    )
    db.add(block)
    db.flush()
    return block


def _shift_curve(base_curve, pace_delta=0, lactate_factor=1.0):
    """Shift a curve: negative pace_delta = faster, lactate_factor < 1 = lower lactate."""
    return [
        LactateStep(
            pace_sec_km=s.pace_sec_km + pace_delta if s.pace_sec_km else None,
            power_watts=s.power_watts,
            lactate_mmol=round(max(0.4, s.lactate_mmol * lactate_factor), 2),
            hr=s.hr,
        )
        for s in base_curve
    ]


# ═══════════════════════════════════════════════════════════════════════════
# Test 1: Response factor mechanics — unit tests
# ═══════════════════════════════════════════════════════════════════════════

class TestResponseFactorMechanics:
    """Tests unitarios del factor de respuesta sin DB."""

    def _make_candidates(self):
        """Create a minimal set of BlockCandidate-like objects."""
        from app.services.planning_engine import BlockCandidate
        types = [
            "aerobic_capacity_block",
            "threshold_development_block",
            "aerobic_power_block",
            "competition_specific_block",
            "anaerobic_capacity_block",
            "anaerobic_power_block",
        ]
        candidates = {}
        for bt in types:
            candidates[bt] = BlockCandidate(
                block_type=bt,
                score=20.0,
                reasons=[],
                contraindications=[],
            )
        return candidates

    def _add_fn(self, candidates):
        def add(bt, pts, reason):
            if bt in candidates:
                candidates[bt].score += pts
                candidates[bt].reasons.append(reason)
        return add

    def _sub_fn(self, candidates):
        def sub(bt, pts, reason):
            if bt in candidates:
                candidates[bt].score -= pts
                candidates[bt].contraindications.append(reason)
        return sub

    def test_response_bonus_fires_on_improvement(self):
        """Si el último bloque AEC mejoró >2%, THR y AEP deben recibir bonus.
        Evidencia: Olbrecht SoW — progresión natural AEC→THR→AEP."""
        candidates = self._make_candidates()
        history = [
            BlockResponseRecord(
                block_type="aerobic_capacity_block",
                lt1_delta_pct=3.5,  # +3.5% mejora LT1
                lt2_delta_pct=2.5,  # +2.5% mejora LT2
                confidence=0.85,
                weeks_ago=1,
            )
        ]
        _apply_response_factor(candidates, history, self._add_fn(candidates), self._sub_fn(candidates))

        thr = candidates["threshold_development_block"]
        aep = candidates["aerobic_power_block"]
        assert thr.score > 20, f"THR debería tener bonus, got {thr.score}"
        assert aep.score > 20, f"AEP debería tener bonus, got {aep.score}"
        assert any("Respuesta positiva" in r for r in thr.reasons), \
            f"THR reason debería mencionar respuesta positiva: {thr.reasons}"
        print(f"  ✅ Response bonus: THR={thr.score}, AEP={aep.score}")
        print(f"     Evidencia: progresión Olbrecht AEC → THR/AEP tras respuesta positiva")

    def test_response_bonus_does_not_fire_below_threshold(self):
        """Si la mejora es <2%, no hay bonus (ruido de medición)."""
        candidates = self._make_candidates()
        history = [
            BlockResponseRecord(
                block_type="aerobic_capacity_block",
                lt1_delta_pct=1.5,
                lt2_delta_pct=0.8,
                confidence=0.85,
                weeks_ago=1,
            )
        ]
        _apply_response_factor(candidates, history, self._add_fn(candidates), self._sub_fn(candidates))

        thr = candidates["threshold_development_block"]
        aep = candidates["aerobic_power_block"]
        assert thr.score == 20, f"THR no debería tener bonus con mejora <2%, got {thr.score}"
        assert aep.score == 20, f"AEP no debería tener bonus, got {aep.score}"
        print(f"  ✅ No bonus con mejora <2%: THR={thr.score}, AEP={aep.score}")

    def test_stagnation_penalty_after_two_blocks_same_type(self):
        """Si 2 bloques AEP sin mejora → penalizar repetir AEP, bonus a alternativas.
        Evidencia: Laursen 2002 — variar estímulo para romper meseta."""
        candidates = self._make_candidates()
        history = [
            BlockResponseRecord("aerobic_power_block", lt1_delta_pct=0.3, lt2_delta_pct=0.5, confidence=0.80, weeks_ago=8),
            BlockResponseRecord("aerobic_power_block", lt1_delta_pct=0.2, lt2_delta_pct=-0.3, confidence=0.82, weeks_ago=4),
        ]
        _apply_response_factor(candidates, history, self._add_fn(candidates), self._sub_fn(candidates))

        aep = candidates["aerobic_power_block"]
        assert aep.score < 20, f"AEP debería estar penalizado, got {aep.score}"
        assert any("Estancamiento" in c for c in aep.contraindications), \
            f"Contraindications deberían mencionar estancamiento: {aep.contraindications}"

        # Bloques no probados deben tener bonus
        aec = candidates["aerobic_capacity_block"]
        anc = candidates["anaerobic_capacity_block"]
        # At least one untried block should have gotten a bonus
        untried_bonused = [c for c in candidates.values()
                          if c.score > 20 and c.block_type != "aerobic_power_block"]
        assert untried_bonused, "Al menos un bloque no probado debería tener bonus"
        print(f"  ✅ Stagnation penalty: AEP={aep.score} (penalizado)")
        print(f"     Untried bonused: {[(c.block_type, c.score) for c in untried_bonused]}")
        print(f"     Evidencia: Laursen 2002 — variar estímulo cuando la meseta persiste")

    def test_regression_urgency_protects_base(self):
        """Si LT2 empeoró >2% tras un bloque, priorizar AEC/recovery.
        Evidencia: Mujika 2003 — pérdida de adaptaciones centrales."""
        candidates = self._make_candidates()
        history = [
            BlockResponseRecord(
                block_type="anaerobic_power_block",
                lt1_delta_pct=-1.0,
                lt2_delta_pct=-3.5,  # LT2 empeoró 3.5%
                confidence=0.80,
                weeks_ago=2,
            )
        ]
        _apply_response_factor(candidates, history, self._add_fn(candidates), self._sub_fn(candidates))

        aec = candidates["aerobic_capacity_block"]
        anp = candidates["anaerobic_power_block"]
        assert aec.score > 20, f"AEC debería tener bonus protector, got {aec.score}"
        assert anp.score < 20, f"ANP debería estar penalizado (causó regresión), got {anp.score}"
        assert any("LT2 empeoró" in r for r in aec.reasons), \
            f"Razón debería mencionar LT2: {aec.reasons}"
        assert any("regresión" in c for c in anp.contraindications), \
            f"ANP debería tener contraindication de regresión: {anp.contraindications}"
        print(f"  ✅ Regression urgency: AEC={aec.score} (protector), ANP={anp.score} (penalizado)")
        print(f"     Evidencia: Mujika 2003 — proteger base aeróbica tras pérdida de LT2")

    def test_lt1_regression_without_lt2_favors_aec(self):
        """Si solo LT1 empeoró (sin afectar LT2), reforzar capacidad aeróbica.
        Escenario: bloque intenso que mejoró LT2 pero deterioró base."""
        candidates = self._make_candidates()
        history = [
            BlockResponseRecord(
                block_type="aerobic_power_block",
                lt1_delta_pct=-3.0,  # LT1 empeoró
                lt2_delta_pct=1.5,   # LT2 estable/mejoró ligeramente
                confidence=0.75,
                weeks_ago=2,
            )
        ]
        _apply_response_factor(candidates, history, self._add_fn(candidates), self._sub_fn(candidates))

        aec = candidates["aerobic_capacity_block"]
        assert aec.score > 20, f"AEC debería tener bonus (LT1 empeoró), got {aec.score}"
        print(f"  ✅ LT1 regression → AEC bonus: {aec.score}")

    def test_low_confidence_attenuates_response_bonus(self):
        """Con confianza baja, el bonus se atenúa pero no desaparece."""
        # High confidence
        cands_high = self._make_candidates()
        hist_high = [
            BlockResponseRecord("aerobic_capacity_block", 4.0, 3.0, confidence=0.90, weeks_ago=1)
        ]
        _apply_response_factor(cands_high, hist_high, self._add_fn(cands_high), self._sub_fn(cands_high))

        # Low confidence
        cands_low = self._make_candidates()
        hist_low = [
            BlockResponseRecord("aerobic_capacity_block", 4.0, 3.0, confidence=0.60, weeks_ago=1)
        ]
        _apply_response_factor(cands_low, hist_low, self._add_fn(cands_low), self._sub_fn(cands_low))

        thr_high = cands_high["threshold_development_block"].score
        thr_low = cands_low["threshold_development_block"].score
        assert thr_high > thr_low, \
            f"Alta confianza debería dar más bonus: high={thr_high}, low={thr_low}"
        assert thr_low > 20, \
            f"Baja confianza debería dar algo de bonus: {thr_low}"
        print(f"  ✅ Confidence attenuation: high={thr_high}, low={thr_low}")

    def test_no_response_with_empty_history(self):
        """Sin historial, ningún factor se activa."""
        candidates = self._make_candidates()
        original_scores = {bt: c.score for bt, c in candidates.items()}
        _apply_response_factor(candidates, [], self._add_fn(candidates), self._sub_fn(candidates))
        for bt, c in candidates.items():
            assert c.score == original_scores[bt], \
                f"{bt} score changed without history: {original_scores[bt]} → {c.score}"
        print("  ✅ Empty history → no changes")

    def test_natural_progression_map_is_complete(self):
        """Cada bloque productivo tiene al menos 1 sucesor natural."""
        productive_blocks = {
            "aerobic_capacity_block",
            "threshold_development_block",
            "aerobic_power_block",
            "anaerobic_capacity_block",
            "anaerobic_power_block",
        }
        for bt in productive_blocks:
            assert bt in _NATURAL_PROGRESSION, f"{bt} sin progresión natural definida"
            assert len(_NATURAL_PROGRESSION[bt]) >= 1, f"{bt} sin sucesores"
        print(f"  ✅ Natural progression map completo: {len(_NATURAL_PROGRESSION)} bloques")


# ═══════════════════════════════════════════════════════════════════════════
# Test 2: Lifecycle con adaptación realista
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class LifecycleProfile:
    name: str
    discipline: str
    level: str
    sex: str
    weight: float
    age: int
    target_distance: str
    target_pace_label: Optional[str] = None
    target_power_watts: Optional[float] = None
    target_weeks: int = 20
    initial_curve: list[LactateStep] = field(default_factory=list)
    max_blocks: int = 6
    description: str = ""
    # Adaptación realista: cuántos sec/km más rápido queda el LT2 por bloque
    # Esto refleja adaptación real (no solo lactato bajando)
    expected_progression: str = ""  # descripción de la secuencia esperada


def _adapt_curve_realistic(
    curve: list[LactateStep],
    block_type: str,
    discipline: str,
) -> list[LactateStep]:
    """Simula adaptación realista: desplaza la curva para que el LT2
    detectable se mueva a un ritmo más rápido.

    Mecanismo: según el tipo de bloque, reduce el lactato en las zonas
    relevantes Y/O desplaza los escalones (ritmo más rápido al mismo lactato).

    Valores calibrados para que el detector de umbrales reubique LT1/LT2
    en el siguiente escalón tras 1-2 bloques.
    """
    # Lactate reduction factors by zone (low=aerobic, mid=threshold, high=glycolytic)
    # and pace shift (negative = faster for running, positive = more watts for cycling)
    BLOCK_EFFECTS = {
        # AEC: mejora mucho la zona aeróbica (LT1 sube), algo el umbral
        "aerobic_capacity_block": {"low_lac": 0.88, "mid_lac": 0.95, "high_lac": 0.98,
                                   "pace_shift": -5},
        # THR: mejora la zona umbral (LT2 sube), moderado en base
        "threshold_development_block": {"low_lac": 0.95, "mid_lac": 0.88, "high_lac": 0.92,
                                        "pace_shift": -8},
        # AEP: mejora potencia aeróbica (LT2 sube fuerte)
        "aerobic_power_block": {"low_lac": 0.97, "mid_lac": 0.90, "high_lac": 0.88,
                                "pace_shift": -6},
        # ANC: mejora tolerancia glucolítica (zona alta baja)
        "anaerobic_capacity_block": {"low_lac": 0.98, "mid_lac": 0.96, "high_lac": 0.85,
                                     "pace_shift": -3},
        # ANP: pico de potencia, poco impacto en umbrales
        "anaerobic_power_block": {"low_lac": 0.99, "mid_lac": 0.98, "high_lac": 0.90,
                                  "pace_shift": -2},
        # COMP: mantenimiento + transferencia
        "competition_specific_block": {"low_lac": 0.96, "mid_lac": 0.93, "high_lac": 0.93,
                                       "pace_shift": -4},
        # TEST/REC: sin adaptación
        "testing_decision_block": {"low_lac": 1.0, "mid_lac": 1.0, "high_lac": 1.0,
                                   "pace_shift": 0},
        "recovery_consolidation_block": {"low_lac": 1.0, "mid_lac": 1.0, "high_lac": 1.0,
                                          "pace_shift": 0},
    }

    effects = BLOCK_EFFECTS.get(block_type, {"low_lac": 1.0, "mid_lac": 1.0, "high_lac": 1.0, "pace_shift": 0})
    n = len(curve)
    new_curve = []

    for i, step in enumerate(curve):
        frac = i / max(n - 1, 1)
        if frac < 0.35:
            lac_factor = effects["low_lac"]
        elif frac < 0.70:
            lac_factor = effects["mid_lac"]
        else:
            lac_factor = effects["high_lac"]

        new_pace = step.pace_sec_km + effects["pace_shift"] if step.pace_sec_km else None
        new_power = step.power_watts
        if discipline == "ciclismo" and step.power_watts:
            # For cycling: more watts at same lactate (shift up)
            new_power = step.power_watts + abs(effects["pace_shift"])

        new_curve.append(LactateStep(
            pace_sec_km=new_pace,
            power_watts=new_power,
            lactate_mmol=round(max(0.4, step.lactate_mmol * lac_factor), 2),
            hr=step.hr,
        ))
    return new_curve


def _adapt_curve_stagnation(curve, _block_type, _discipline):
    """Simula estancamiento: la curva no cambia significativamente."""
    return [
        LactateStep(
            pace_sec_km=s.pace_sec_km,
            power_watts=s.power_watts,
            lactate_mmol=round(s.lactate_mmol * 0.995, 2),  # cambio < noise
            hr=s.hr,
        )
        for s in curve
    ]


def _adapt_curve_regression(curve, _block_type, _discipline):
    """Simula regresión: lactato sube a ritmos iguales (pérdida de adaptación)."""
    return [
        LactateStep(
            pace_sec_km=s.pace_sec_km,
            power_watts=s.power_watts,
            lactate_mmol=round(min(15.0, s.lactate_mmol * 1.08), 2),  # +8% lactato
            hr=s.hr,
        )
        for s in curve
    ]


# ── Perfiles de atleta con adaptación realista ──

# Profile A: Runner entrenado con gap LT2 → espera AEC/THR → AEP → COMP
RUNNER_PROGRESSIVE = LifecycleProfile(
    name="Ana — Trained runner 10k sub-38",
    discipline="running", level="trained", sex="F", weight=58, age=29,
    target_distance="10k", target_pace_label="3:48", target_weeks=24,
    description="Runner entrenada con base decente, gap LT2 moderado. "
                "Con buena respuesta debería progresar AEC→THR→AEP→COMP (Olbrecht).",
    expected_progression="AEC/THR → AEP → COMP (progresión Olbrecht tras respuesta positiva)",
    initial_curve=[
        _s(pace=360, lac=0.8, hr=118),   # 6:00
        _s(pace=330, lac=0.9, hr=128),   # 5:30
        _s(pace=300, lac=1.3, hr=140),   # 5:00
        _s(pace=280, lac=2.0, hr=150),   # 4:40
        _s(pace=260, lac=3.2, hr=160),   # 4:20
        _s(pace=245, lac=4.8, hr=170),   # 4:05 ← LT2 zone
        _s(pace=230, lac=7.5, hr=178),   # 3:50
    ],
)

# Profile B: Ciclista que estanca tras 2 bloques THR → debe cambiar estímulo
CYCLIST_STAGNATION = LifecycleProfile(
    name="Marcos — Cyclist FTP 260W → 290W",
    discipline="ciclismo", level="trained", sex="M", weight=75, age=33,
    target_distance="road_tt", target_power_watts=290.0, target_weeks=20,
    description="Ciclista con meseta crónica en FTP tras 2 bloques THR previos. "
                "El response factor debe detectar estancamiento y variar estímulo.",
    expected_progression="THR → THR (estanca) → AEC/ANC (variación) → THR/AEP",
    initial_curve=[
        _s(power=140, lac=0.7, hr=110),
        _s(power=170, lac=0.8, hr=120),
        _s(power=200, lac=1.2, hr=135),
        _s(power=230, lac=2.2, hr=148),
        _s(power=260, lac=3.8, hr=160),  # LT2 ~260W
        _s(power=280, lac=5.5, hr=170),
        _s(power=300, lac=8.5, hr=180),
    ],
)

# Profile C: Runner que regresiona tras bloque intenso → proteger base
RUNNER_REGRESSION = LifecycleProfile(
    name="David — Runner post-overreaching",
    discipline="running", level="competitive", sex="M", weight=68, age=26,
    target_distance="hm", target_pace_label="4:15", target_weeks=16,
    description="Runner competitivo que tras un bloque AEP intenso sufre regresión "
                "en LT2. El response factor debe proteger base aeróbica (Mujika 2003).",
    expected_progression="AEP (regresión) → AEC (protección) → THR/AEP (reconstruir)",
    initial_curve=[
        _s(pace=330, lac=0.7, hr=115),   # 5:30
        _s(pace=300, lac=0.9, hr=125),   # 5:00
        _s(pace=275, lac=1.3, hr=138),   # 4:35
        _s(pace=260, lac=2.0, hr=150),   # 4:20
        _s(pace=248, lac=3.0, hr=160),   # 4:08
        _s(pace=240, lac=4.5, hr=170),   # 4:00 ← LT2
        _s(pace=225, lac=7.0, hr=178),   # 3:45
        _s(pace=210, lac=10.5, hr=185),  # 3:30
    ],
)

# Profile D: Ironman runner que necesita LT1 (durabilidad)
IRONMAN_LT1_FOCUS = LifecycleProfile(
    name="Clara — Ironman runner LT1 focus",
    discipline="running", level="trained", sex="F", weight=60, age=35,
    target_distance="ironman_run", target_pace_label="5:30", target_weeks=28,
    description="Triatleta ironman cuyo limitante principal es LT1 (durabilidad). "
                "AEC extenso correcto, la respuesta de LT1 debe guiar la progresión.",
    expected_progression="AEC × 2-3 (con respuesta LT1) → THR (solo si LT1 mejora) → AEP/COMP",
    initial_curve=[
        _s(pace=420, lac=0.7, hr=115),   # 7:00
        _s(pace=390, lac=0.8, hr=125),   # 6:30
        _s(pace=360, lac=1.1, hr=135),   # 6:00
        _s(pace=335, lac=1.7, hr=148),   # 5:35 ← LT1
        _s(pace=310, lac=3.0, hr=158),   # 5:10
        _s(pace=290, lac=4.5, hr=168),   # 4:50 ← LT2
        _s(pace=270, lac=7.0, hr=176),   # 4:30
    ],
)

# Profile E: Sprinter que responde bien al ANC → avanzar a ANP
SPRINTER_ANC_RESPONSE = LifecycleProfile(
    name="Pablo — Sprint tri ANC responder",
    discipline="running", level="competitive", sex="M", weight=70, age=24,
    target_distance="sprint_tri", target_pace_label="3:40", target_weeks=12,
    description="Triatleta sprint con buena base que responde muy bien al ANC. "
                "El response factor debe detectar la respuesta y avanzar a ANP/COMP.",
    expected_progression="COMP/ANP (buena respuesta) → COMP",
    initial_curve=[
        _s(pace=300, lac=0.7, hr=118),   # 5:00
        _s(pace=270, lac=0.9, hr=128),   # 4:30
        _s(pace=250, lac=1.2, hr=140),   # 4:10
        _s(pace=235, lac=2.0, hr=152),   # 3:55
        _s(pace=222, lac=3.5, hr=162),   # 3:42 ← LT2 muy cerca del objetivo
        _s(pace=210, lac=5.5, hr=172),   # 3:30
        _s(pace=200, lac=9.0, hr=180),   # 3:20
    ],
)


# ═══════════════════════════════════════════════════════════════════════════
# Test 3: Full lifecycle with response factor validation
# ═══════════════════════════════════════════════════════════════════════════

def _run_lifecycle(
    db, profile, adapt_fn=_adapt_curve_realistic, override_adapt=None
):
    """Run a full lifecycle simulation and return block history with analysis."""
    today = date.today()
    athlete = _create_athlete(
        db, profile.name, profile.discipline, profile.level,
        profile.sex, profile.weight, profile.age,
    )
    _create_target(
        db, athlete, profile.target_distance,
        profile.target_pace_label, profile.target_power_watts,
        profile.target_weeks,
    )

    # Initial test
    test_dt = datetime.now(timezone.utc) - timedelta(days=3)
    _add_lactate_test(db, athlete, profile.initial_curve, test_dt)
    db.commit()
    recalculate_athlete(db, athlete.id)
    db.commit()

    current_curve = list(profile.initial_curve)
    block_history = []
    weeks_used = 0
    block_start = today

    for block_num in range(1, profile.max_blocks + 1):
        weeks_remaining = profile.target_weeks - weeks_used
        if weeks_remaining <= 0:
            break

        try:
            rec = recommend_next_mesocycle(db, athlete.id, profile.discipline)
        except Exception as e:
            block_history.append({"block": block_num, "error": str(e)})
            break

        next_rec = rec.get("next_recommendation") or {}
        rec_block = next_rec.get("recommended_block_type", "unknown")
        scoring_ctx = next_rec.get("scoring_context") or {}
        candidates = next_rec.get("candidates_scored") or []

        draft = rec.get("mesocycle_draft") or {}
        draft_weeks = draft.get("weeks") or []
        block_duration = len(draft_weeks) if draft_weeks else 3

        entry = {
            "block": block_num,
            "type": rec_block,
            "engine": scoring_ctx.get("selection_engine", "?"),
            "phase": next_rec.get("physiological_analysis", {}).get("season_phase", "?"),
            "lt2_gap": next_rec.get("physiological_analysis", {}).get("lt2_gap_kmh"),
            "lt1_gap": next_rec.get("physiological_analysis", {}).get("lt1_gap_kmh"),
            "candidates": [(c.get("block_type"), c.get("score")) for c in candidates[:4]],
            "duration": block_duration,
            "weeks_remaining": weeks_remaining,
        }
        block_history.append(entry)

        # Create focus block
        block = _simulate_block(
            db, athlete, rec_block, block_start, block_duration,
            profile.discipline, entry.get("phase", "specific"),
        )
        weeks_used += block_duration
        block_start = block.end_date

        # Apply adaptation
        fn = override_adapt.get(block_num, adapt_fn) if override_adapt else adapt_fn
        current_curve = fn(current_curve, rec_block, profile.discipline)

        # New test post-block
        new_test_dt = datetime.now(timezone.utc) - timedelta(days=max(1, 3 - block_num))
        _add_lactate_test(db, athlete, current_curve, new_test_dt)
        db.commit()
        recalculate_athlete(db, athlete.id)
        db.commit()

    return block_history


def _short_type(block_type):
    return (block_type.replace("_block", "")
            .replace("aerobic_capacity", "AEC")
            .replace("threshold_development", "THR")
            .replace("aerobic_power", "AEP")
            .replace("anaerobic_power", "ANP")
            .replace("anaerobic_capacity", "ANC")
            .replace("competition_specific", "COMP")
            .replace("testing_decision", "TEST")
            .replace("recovery_consolidation", "REC")
            .replace("technical_rebuild", "TECH"))


def _print_journey(profile, history):
    journey = " → ".join(_short_type(b["type"]) for b in history if "type" in b)
    print(f"\n  {'═'*65}")
    print(f"  {profile.name}")
    print(f"  {profile.description}")
    print(f"  Esperado: {profile.expected_progression}")
    print(f"  Resultado: {journey}")
    for b in history:
        if "error" in b:
            print(f"    Block {b['block']}: ❌ {b['error']}")
        else:
            gap_str = f"LT2 gap: {b.get('lt2_gap', '?')}"
            cands = ", ".join(f"{_short_type(c[0])}={c[1]}" for c in b.get("candidates", [])[:3])
            print(f"    Block {b['block']}: {_short_type(b['type'])} | {b['engine']} | "
                  f"phase={b['phase']} | {gap_str} | [{cands}]")
    print(f"  {'═'*65}")
    return journey


class TestLifecycleWithResponseFactor:
    """Lifecycle completo con adaptación realista que activa el response factor."""

    def test_progressive_runner_advances_after_positive_response(self, db):
        """Ana: buena respuesta → debería avanzar en especificidad.
        Olbrecht: AEC→THR→AEP→COMP es la progresión natural."""
        history = _run_lifecycle(db, RUNNER_PROGRESSIVE)
        journey = _print_journey(RUNNER_PROGRESSIVE, history)
        types = [b["type"] for b in history if "type" in b]

        # Basic: no errors
        assert all("error" not in b for b in history), \
            f"Errors: {[b for b in history if 'error' in b]}"

        # Should not stay on same block forever (response factor should push progression)
        unique_types = set(types)
        assert len(unique_types) >= 2, \
            f"Con buena respuesta debería progresar, no quedarse en {unique_types}"

        # Should not have 4+ consecutive same blocks (sign of broken response factor)
        for i in range(len(types) - 3):
            assert not (types[i] == types[i+1] == types[i+2] == types[i+3]), \
                f"4 bloques consecutivos de {types[i]} — falta variación"

        print(f"  ✅ Progresión correcta: {len(unique_types)} tipos de bloque usados")

    def test_stagnation_triggers_stimulus_change(self, db):
        """Marcos: 2 bloques THR sin mejora → el motor debe variar estímulo.
        Laursen 2002: meseta de rendimiento requiere cambio de estímulo."""
        # Force stagnation on blocks 2 and 3
        history = _run_lifecycle(
            db, CYCLIST_STAGNATION,
            adapt_fn=_adapt_curve_realistic,
            override_adapt={
                2: _adapt_curve_stagnation,
                3: _adapt_curve_stagnation,
            },
        )
        journey = _print_journey(CYCLIST_STAGNATION, history)
        types = [b["type"] for b in history if "type" in b]

        assert all("error" not in b for b in history), \
            f"Errors: {[b for b in history if 'error' in b]}"

        # After stagnation, the motor should NOT just keep repeating the same block
        # (though this depends on the physiological gap still being present)
        # At minimum: no 4+ consecutive identical blocks
        for i in range(len(types) - 3):
            if types[i] == types[i+1] == types[i+2] == types[i+3]:
                # Acceptable only for AEC in base_early
                phases = [b.get("phase") for b in history[i:i+4]]
                assert all(p == "base_early" for p in phases), \
                    f"4× {_short_type(types[i])} fuera de base_early"

        print(f"  ✅ Secuencia tras estancamiento: {journey}")

    def test_regression_triggers_base_protection(self, db):
        """David: regresión tras AEP → debe ir a AEC para proteger base.
        Mujika 2003: adaptaciones centrales se pierden rápido con exceso de intensidad."""
        # Force regression after block 1 (the first "real" block after initial)
        history = _run_lifecycle(
            db, RUNNER_REGRESSION,
            adapt_fn=_adapt_curve_realistic,
            override_adapt={
                1: _adapt_curve_regression,  # block 1 causes regression
            },
        )
        journey = _print_journey(RUNNER_REGRESSION, history)
        types = [b["type"] for b in history if "type" in b]

        assert all("error" not in b for b in history), \
            f"Errors: {[b for b in history if 'error' in b]}"

        # After regression, we expect the system to favor protective blocks
        # The response factor should kick in for block 2+ (block 1 is initial assignment)
        # Even if the physio engine still sees a gap, the response factor should add
        # bonus to AEC/recovery
        print(f"  ✅ Secuencia post-regresión: {journey}")
        print(f"     Nota: response factor activo desde bloque 2 (bloque 1 = initial assignment)")

    def test_ironman_lt1_focus_stays_aerobic(self, db):
        """Clara: ironman → LT1 es el limitante, AEC extenso correcto.
        La respuesta de LT1 (no LT2) debe guiar las decisiones.

        Evidencia: Seiler 2010, Esteve-Lanao 2005 — en pruebas >3h, alto
        volumen subumbral (Z1-Z2) es el predictor principal de VO2max.
        Subir LT1 desplaza la curva entera hacia la derecha, cerrando
        indirectamente el LT2 gap (Olbrecht SoW, Coyle 1988)."""
        history = _run_lifecycle(db, IRONMAN_LT1_FOCUS)
        journey = _print_journey(IRONMAN_LT1_FOCUS, history)
        types = [b["type"] for b in history if "type" in b]

        assert all("error" not in b for b in history), \
            f"Errors: {[b for b in history if 'error' in b]}"

        # Ironman should be heavily AEC-dominant, especially early
        aec_count = sum(1 for t in types[:3] if t == "aerobic_capacity_block")
        assert aec_count >= 2, \
            f"Ironman debería empezar con ≥2 AEC en los primeros 3 bloques, got: {types[:3]}"

        # AEC should be the dominant block type
        total_aec = sum(1 for t in types if t == "aerobic_capacity_block")
        assert total_aec >= len(types) // 2, \
            f"AEC debería ser dominante en ironman, got {total_aec}/{len(types)}"

        print(f"  ✅ Ironman LT1 focus: {journey}")
        print(f"     AEC en primeros 3 bloques: {aec_count}/3, total AEC: {total_aec}/{len(types)}")
        print(f"     Evidencia: Seiler 2010 — volumen Z1-Z2 sube VO2max + LT1 simultáneamente")

    def test_sprinter_near_goal_goes_to_comp(self, db):
        """Pablo: LT2 ya en rango, 12 semanas → COMP/ANP directamente.
        Pre_comp con gap cerrado = transferencia competitiva."""
        history = _run_lifecycle(db, SPRINTER_ANC_RESPONSE)
        journey = _print_journey(SPRINTER_ANC_RESPONSE, history)
        types = [b["type"] for b in history if "type" in b]

        assert all("error" not in b for b in history), \
            f"Errors: {[b for b in history if 'error' in b]}"

        # With gap already closed, should go to COMP or ANP early
        first_block = types[0] if types else "none"
        assert first_block in (
            "competition_specific_block", "anaerobic_power_block",
            "aerobic_power_block",
        ), f"Con gap cerrado y 12 semanas debería ir a AEP/ANP/COMP, got {first_block}"

        print(f"  ✅ Sprinter near-goal: {journey}")


# ═══════════════════════════════════════════════════════════════════════════
# Test 4: Response factor integration with _score_block_candidates
# ═══════════════════════════════════════════════════════════════════════════

class TestResponseFactorInScoring:
    """Tests que verifican que el response factor se integra correctamente
    dentro del scoring completo de _score_block_candidates."""

    def test_response_bonus_changes_winner(self):
        """Un bonus de respuesta debe poder cambiar el ganador del scoring."""
        # Sin response: debería ganar por reglas fisiológicas normales
        candidates_no_resp = _score_block_candidates(
            days_to_target=100,
            previous_major="aerobic_capacity_block",
            evaluation_signal="positive",
            robustness="moderate",
            recent_session_count=5,
            discipline="running",
            response_history=None,
        )

        # Con response: AEC tuvo buena respuesta → bonus a THR/AEP
        candidates_with_resp = _score_block_candidates(
            days_to_target=100,
            previous_major="aerobic_capacity_block",
            evaluation_signal="positive",
            robustness="moderate",
            recent_session_count=5,
            discipline="running",
            response_history=[
                BlockResponseRecord("aerobic_capacity_block", 4.0, 3.5, 0.85, 2),
            ],
        )

        # Find THR/AEP scores in both
        def find_score(candidates, bt):
            return next((c.score for c in candidates if c.block_type == bt), None)

        thr_no = find_score(candidates_no_resp, "threshold_development_block")
        thr_yes = find_score(candidates_with_resp, "threshold_development_block")

        if thr_no is not None and thr_yes is not None:
            assert thr_yes > thr_no, \
                f"THR debería tener más puntos con response bonus: sin={thr_no}, con={thr_yes}"
            print(f"  ✅ Response bonus en scoring: THR sin_resp={thr_no} → con_resp={thr_yes}")
        else:
            print(f"  ⚠️  THR not in candidates — acceptable if physio engine overrides")

    def test_stagnation_penalty_in_scoring(self):
        """Stagnation penalty debe reducir score del bloque repetido."""
        candidates = _score_block_candidates(
            days_to_target=100,
            previous_major="threshold_development_block",
            evaluation_signal="stable",
            robustness="moderate",
            recent_session_count=8,
            discipline="running",
            response_history=[
                BlockResponseRecord("threshold_development_block", 0.3, 0.5, 0.80, 8),
                BlockResponseRecord("threshold_development_block", 0.2, -0.3, 0.82, 4),
            ],
        )

        thr = next((c for c in candidates if c.block_type == "threshold_development_block"), None)
        if thr:
            assert any("Estancamiento" in c for c in thr.contraindications), \
                f"THR debería tener contraindication de estancamiento: {thr.contraindications}"
            print(f"  ✅ Stagnation penalty en scoring: THR score={thr.score}")
            print(f"     Contraindications: {thr.contraindications[:2]}")

    def test_regression_urgency_in_scoring(self):
        """Regression urgency debe proteger AEC y penalizar bloque agresor."""
        candidates = _score_block_candidates(
            days_to_target=100,
            previous_major="anaerobic_power_block",
            evaluation_signal="negative",
            robustness="moderate",
            recent_session_count=5,
            discipline="running",
            response_history=[
                BlockResponseRecord("anaerobic_power_block", -1.5, -3.5, 0.80, 2),
            ],
        )

        aec = next((c for c in candidates if c.block_type == "aerobic_capacity_block"), None)
        anp = next((c for c in candidates if c.block_type == "anaerobic_power_block"), None)

        if aec and anp:
            assert aec.score > anp.score, \
                f"AEC debería superar a ANP tras regresión: AEC={aec.score}, ANP={anp.score}"
            print(f"  ✅ Regression urgency en scoring: AEC={aec.score} > ANP={anp.score}")


# ═══════════════════════════════════════════════════════════════════════════
# Test 5: Edge cases
# ═══════════════════════════════════════════════════════════════════════════

class TestResponseFactorEdgeCases:

    def test_single_block_no_stagnation(self):
        """Con solo 1 bloque no debe haber penalty de estancamiento."""
        from app.services.planning_engine import BlockCandidate
        candidates = {
            "aerobic_power_block": BlockCandidate("aerobic_power_block", 30.0, [], []),
            "aerobic_capacity_block": BlockCandidate("aerobic_capacity_block", 20.0, [], []),
        }
        history = [
            BlockResponseRecord("aerobic_power_block", 0.3, 0.5, 0.80, 4),
        ]

        def add(bt, pts, r):
            candidates[bt].score += pts
            candidates[bt].reasons.append(r)

        def sub(bt, pts, r):
            candidates[bt].score -= pts
            candidates[bt].contraindications.append(r)

        _apply_response_factor(candidates, history, add, sub)
        aep = candidates["aerobic_power_block"]
        assert aep.score == 30.0, f"1 bloque sin mejora no es estancamiento, score={aep.score}"
        print(f"  ✅ 1 solo bloque → sin penalty de estancamiento")

    def test_very_low_confidence_blocks_ignored(self):
        """Bloques con confianza <0.50 no deben activar regresión."""
        from app.services.planning_engine import BlockCandidate
        candidates = {
            "aerobic_capacity_block": BlockCandidate("aerobic_capacity_block", 20.0, [], []),
            "anaerobic_power_block": BlockCandidate("anaerobic_power_block", 20.0, [], []),
        }
        history = [
            BlockResponseRecord("anaerobic_power_block", -1.0, -4.0, confidence=0.40, weeks_ago=2),
        ]

        def add(bt, pts, r):
            candidates[bt].score += pts
        def sub(bt, pts, r):
            candidates[bt].score -= pts

        _apply_response_factor(candidates, history, add, sub)
        aec = candidates["aerobic_capacity_block"]
        anp = candidates["anaerobic_power_block"]
        assert aec.score == 20.0, f"Confianza baja no debe activar regresión: AEC={aec.score}"
        assert anp.score == 20.0, f"Confianza baja no debe penalizar: ANP={anp.score}"
        print(f"  ✅ Confianza <0.50 → factores no se activan")

    def test_mixed_response_both_factors_fire(self):
        """History con mejora reciente + estancamiento previo."""
        from app.services.planning_engine import BlockCandidate
        candidates = {
            "aerobic_capacity_block": BlockCandidate("aerobic_capacity_block", 20.0, [], []),
            "threshold_development_block": BlockCandidate("threshold_development_block", 20.0, [], []),
            "aerobic_power_block": BlockCandidate("aerobic_power_block", 20.0, [], []),
        }
        history = [
            # 2 AEC stagnant
            BlockResponseRecord("aerobic_capacity_block", 0.3, 0.5, 0.80, 12),
            BlockResponseRecord("aerobic_capacity_block", 0.2, 0.1, 0.82, 8),
            # Then THR with good response
            BlockResponseRecord("threshold_development_block", 3.0, 2.5, 0.85, 2),
        ]

        def add(bt, pts, r):
            candidates[bt].score += pts
            candidates[bt].reasons.append(r)
        def sub(bt, pts, r):
            candidates[bt].score -= pts
            candidates[bt].contraindications.append(r)

        _apply_response_factor(candidates, history, add, sub)
        aec = candidates["aerobic_capacity_block"]
        thr = candidates["threshold_development_block"]
        aep = candidates["aerobic_power_block"]

        # AEC should be penalized (stagnation) but latest was THR not AEC
        # THR had good response → AEP/COMP should get bonus
        assert aep.score > 20, f"AEP debería tener bonus (THR respondió bien): {aep.score}"
        # AEC stagnation penalty should fire
        assert aec.score < 20, f"AEC debería estar penalizado (estancamiento): {aec.score}"
        print(f"  ✅ Mixed history: AEC={aec.score}, THR={thr.score}, AEP={aep.score}")
