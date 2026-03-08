from __future__ import annotations

from datetime import date, datetime, timedelta
from random import Random
from typing import Optional

from sqlalchemy.orm import Session

from app.models.athlete import Athlete, AthleteFocusBlock, AthleteWeightHistory
from app.models.session import LactateSample, Session, SessionInterval
from app.models.user import User
from app.services.analytics import recalculate_athlete


def _running_incremental_session(
    athlete_id: int,
    performed_at: datetime,
    lt1_pace: int,
    lt2_pace: int,
    vo2_pace: int,
    temperature_c: float,
) -> Session:
    session = Session(
        athlete_id=athlete_id,
        performed_at=performed_at,
        discipline="running",
        session_type="test incremental",
        goal="Test incremental para mapear curva de lactato, LT1 y LT2.",
        surface="pista",
        temperature_c=temperature_c,
        comments="Escalones de 4 minutos con toma de muestra al final de cada escalón.",
    )
    steps = [
        (lt1_pace + 22, 146, 152, 176, 1.2),
        (lt1_pace + 10, 154, 160, 177, 1.6),
        (lt1_pace, 161, 167, 178, 2.0),
        (lt2_pace + 6, 168, 175, 179, 2.8),
        (lt2_pace, 173, 180, 180, 3.5),
        (vo2_pace, 181, 188, 182, 5.4),
    ]
    for order_index, (pace, hr_avg, hr_max, cadence, lactate) in enumerate(steps, start=1):
        interval = SessionInterval(
            order_index=order_index,
            duration_seconds=240,
            rest_seconds=60,
            rest_type="walk",
            heart_rate_avg=hr_avg,
            heart_rate_max=hr_max,
            pace_seconds_per_km=pace,
            power_watts=None,
            running_power_watts=None,
            cadence=cadence,
            rpe=min(9.0, 2.0 + order_index),
            purpose="LT1" if order_index <= 3 else ("LT2" if order_index <= 5 else "VO2max"),
            notes="Demo robusto incremental",
        )
        interval.lactate_sample = LactateSample(
            lactate_mmol=lactate,
            sample_delay_seconds=30,
            sample_timing_label="tras 30s",
            sampling_notes="Dato demo robusto.",
        )
        session.intervals.append(interval)
    return session


def _running_lt1_session(
    athlete_id: int,
    performed_at: datetime,
    lt1_pace: int,
    temperature_c: float,
    variant: str,
) -> Session:
    if variant == "8x4":
        session = Session(
            athlete_id=athlete_id,
            performed_at=performed_at,
            discipline="running",
            session_type="sesión LT1",
            goal="Control LT1 en repeticiones medias.",
            surface="asfalto",
            temperature_c=temperature_c,
            comments="8x4' LT1 con muestra intermedia y final.",
        )
        for order_index in range(1, 9):
            interval = SessionInterval(
                order_index=order_index,
                duration_seconds=240,
                rest_seconds=60,
                rest_type="jog",
                heart_rate_avg=149 + min(order_index, 5),
                heart_rate_max=155 + min(order_index, 5),
                pace_seconds_per_km=lt1_pace + (2 if order_index <= 4 else 0),
                power_watts=None,
                running_power_watts=None,
                cadence=176 + (1 if order_index >= 5 else 0),
                rpe=3.0 + (order_index * 0.2),
                purpose="LT1",
                notes="Demo LT1 8x4",
            )
            if order_index in {4, 8}:
                interval.lactate_sample = LactateSample(
                    lactate_mmol=1.7 if order_index == 4 else 1.9,
                    sample_delay_seconds=30,
                    sample_timing_label="tras 30s",
                    sampling_notes="Muestra intermedia/final.",
                )
            session.intervals.append(interval)
        return session

    session = Session(
        athlete_id=athlete_id,
        performed_at=performed_at,
        discipline="running",
        session_type="sesión LT1",
        goal="Control LT1 en bloques largos.",
        surface="asfalto",
        temperature_c=temperature_c,
        comments="2x20' LT1 con muestra al final de cada bloque.",
    )
    for order_index, lactate, hr_avg in [(1, 1.8, 151), (2, 2.0, 154)]:
        interval = SessionInterval(
            order_index=order_index,
            duration_seconds=1200,
            rest_seconds=180,
            rest_type="jog",
            heart_rate_avg=hr_avg,
            heart_rate_max=hr_avg + 6,
            pace_seconds_per_km=lt1_pace,
            power_watts=None,
            running_power_watts=None,
            cadence=177,
            rpe=4.0 + (order_index * 0.5),
            purpose="LT1",
            notes="Demo LT1 2x20",
        )
        interval.lactate_sample = LactateSample(
            lactate_mmol=lactate,
            sample_delay_seconds=45,
            sample_timing_label="tras 45s",
            sampling_notes="Muestra final de bloque.",
        )
        session.intervals.append(interval)
    return session


def _running_lt2_session(athlete_id: int, performed_at: datetime, lt2_pace: int, temperature_c: float) -> Session:
    session = Session(
        athlete_id=athlete_id,
        performed_at=performed_at,
        discipline="running",
        session_type="sesión LT2",
        goal="Control de tolerancia en ritmo umbral.",
        surface="asfalto",
        temperature_c=temperature_c,
        comments="3x10' con muestra en bloque 2 y 3.",
    )
    data = [
        (1, lt2_pace + 4, 166, 172, None),
        (2, lt2_pace + 1, 170, 176, 3.1),
        (3, lt2_pace - 1, 173, 180, 3.8),
    ]
    for order_index, pace, hr_avg, hr_max, lactate in data:
        interval = SessionInterval(
            order_index=order_index,
            duration_seconds=600,
            rest_seconds=180,
            rest_type="jog",
            heart_rate_avg=hr_avg,
            heart_rate_max=hr_max,
            pace_seconds_per_km=pace,
            power_watts=None,
            running_power_watts=None,
            cadence=180,
            rpe=6.0 + order_index * 0.6,
            purpose="LT2",
            notes="Demo LT2",
        )
        if lactate is not None:
            interval.lactate_sample = LactateSample(
                lactate_mmol=lactate,
                sample_delay_seconds=45,
                sample_timing_label="tras 45s",
                sampling_notes="Muestra de control LT2.",
            )
        session.intervals.append(interval)
    return session


def _running_vo2_session(athlete_id: int, performed_at: datetime, vo2_pace: int, temperature_c: float) -> Session:
    session = Session(
        athlete_id=athlete_id,
        performed_at=performed_at,
        discipline="running",
        session_type="VO2max",
        goal="Control de potencia aeróbica máxima.",
        surface="pista",
        temperature_c=temperature_c,
        comments="5x3' con muestra en bloque 3 y 5.",
    )
    for order_index in range(1, 6):
        interval = SessionInterval(
            order_index=order_index,
            duration_seconds=180,
            rest_seconds=120,
            rest_type="walk",
            heart_rate_avg=173 + order_index,
            heart_rate_max=181 + order_index,
            pace_seconds_per_km=vo2_pace + (2 if order_index < 4 else 0),
            power_watts=None,
            running_power_watts=None,
            cadence=181 + (1 if order_index >= 4 else 0),
            rpe=7.0 + order_index * 0.4,
            purpose="VO2max",
            notes="Demo VO2max",
        )
        if order_index in {3, 5}:
            interval.lactate_sample = LactateSample(
                lactate_mmol=5.0 if order_index == 3 else 6.1,
                sample_delay_seconds=30,
                sample_timing_label="tras 30s",
                sampling_notes="Muestra intensa.",
            )
        session.intervals.append(interval)
    return session


def _build_robust_running_history(athlete_id: int, rng: Random) -> list[Session]:
    start = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0) - timedelta(days=210)
    base_lt2 = rng.randint(238, 248)
    base_lt1 = base_lt2 + rng.randint(28, 36)
    base_vo2 = base_lt2 - rng.randint(18, 24)

    sessions: list[Session] = []
    for block in range(7):
        performed_base = start + timedelta(days=block * 28)
        improvement = block * rng.randint(1, 2)
        lt2_pace = max(220, base_lt2 - improvement)
        lt1_pace = max(245, base_lt1 - improvement)
        vo2_pace = max(205, base_vo2 - improvement)
        temperature = 10 + (block % 5) + rng.randint(0, 3)

        sessions.append(_running_incremental_session(athlete_id, performed_base, lt1_pace, lt2_pace, vo2_pace, temperature))
        sessions.append(_running_lt1_session(athlete_id, performed_base + timedelta(days=10), lt1_pace, temperature + 1, "8x4" if block % 2 == 0 else "2x20"))
        sessions.append(_running_lt2_session(athlete_id, performed_base + timedelta(days=18), lt2_pace, temperature + 2))
        if block in {1, 3, 5}:
            sessions.append(_running_vo2_session(athlete_id, performed_base + timedelta(days=24), vo2_pace, temperature + 1))
    return sessions


def _cycling_incremental_session(
    athlete_id: int,
    performed_at: datetime,
    lt1_power: int,
    lt2_power: int,
    vo2_power: int,
    temperature_c: float,
    power_source: str = "outdoor",
) -> Session:
    session = Session(
        athlete_id=athlete_id,
        performed_at=performed_at,
        discipline="ciclismo",
        power_source=power_source,
        session_type="test incremental",
        goal="Test incremental ciclista para mapear curva de lactato, LT1 y LT2.",
        surface="rodillo" if power_source == "indoor" else "carretera",
        temperature_c=temperature_c,
        comments="Escalones de 4 minutos en potencia con toma de muestra al final de cada escalón.",
    )
    steps = [
        (lt1_power - 40, 132, 140, 90, 1.2),
        (lt1_power - 20, 140, 148, 91, 1.6),
        (lt1_power, 148, 156, 92, 2.0),
        (lt2_power - 15, 156, 164, 93, 2.8),
        (lt2_power, 164, 172, 94, 3.6),
        (vo2_power, 172, 180, 96, 5.2),
    ]
    for order_index, (power, hr_avg, hr_max, cadence, lactate) in enumerate(steps, start=1):
        interval = SessionInterval(
            order_index=order_index,
            duration_seconds=240,
            rest_seconds=60,
            rest_type="easy_spin",
            heart_rate_avg=hr_avg,
            heart_rate_max=hr_max,
            pace_seconds_per_km=None,
            power_watts=power,
            running_power_watts=None,
            cadence=cadence,
            rpe=min(9.0, 2.0 + order_index),
            purpose="LT1" if order_index <= 3 else ("LT2" if order_index <= 5 else "VO2max"),
            notes="Demo robusto incremental ciclismo",
        )
        interval.lactate_sample = LactateSample(
            lactate_mmol=lactate,
            sample_delay_seconds=30,
            sample_timing_label="tras 30s",
            sampling_notes="Dato demo robusto ciclismo.",
        )
        session.intervals.append(interval)
    return session


def _cycling_lt1_session(athlete_id: int, performed_at: datetime, lt1_power: int, temperature_c: float) -> Session:
    session = Session(
        athlete_id=athlete_id,
        performed_at=performed_at,
        discipline="ciclismo",
        power_source="outdoor",
        session_type="sesión LT1",
        goal="Control LT1 en bloques largos ciclistas.",
        surface="rodillo",
        temperature_c=temperature_c,
        comments="2x20' LT1 en bicicleta con muestra final de bloque.",
    )
    for order_index, lactate, hr_avg, power in [(1, 1.7, 143, lt1_power - 5), (2, 1.9, 147, lt1_power)]:
        interval = SessionInterval(
            order_index=order_index,
            duration_seconds=1200,
            rest_seconds=180,
            rest_type="easy_spin",
            heart_rate_avg=hr_avg,
            heart_rate_max=hr_avg + 7,
            pace_seconds_per_km=None,
            power_watts=power,
            running_power_watts=None,
            cadence=92,
            rpe=4.0 + order_index * 0.4,
            purpose="LT1",
            notes="Demo LT1 ciclismo",
        )
        interval.lactate_sample = LactateSample(
            lactate_mmol=lactate,
            sample_delay_seconds=40,
            sample_timing_label="tras 40s",
            sampling_notes="Muestra final de bloque ciclismo.",
        )
        session.intervals.append(interval)
    return session


def _cycling_lt2_session(athlete_id: int, performed_at: datetime, lt2_power: int, temperature_c: float) -> Session:
    session = Session(
        athlete_id=athlete_id,
        performed_at=performed_at,
        discipline="ciclismo",
        power_source="outdoor",
        session_type="sesión LT2",
        goal="Control de tolerancia al umbral ciclista.",
        surface="rodillo",
        temperature_c=temperature_c,
        comments="3x10' LT2 en bicicleta con muestra en bloque 2 y 3.",
    )
    data = [
        (1, lt2_power - 10, 155, 163, None),
        (2, lt2_power, 162, 170, 3.1),
        (3, lt2_power + 8, 167, 175, 3.9),
    ]
    for order_index, power, hr_avg, hr_max, lactate in data:
        interval = SessionInterval(
            order_index=order_index,
            duration_seconds=600,
            rest_seconds=180,
            rest_type="easy_spin",
            heart_rate_avg=hr_avg,
            heart_rate_max=hr_max,
            pace_seconds_per_km=None,
            power_watts=power,
            running_power_watts=None,
            cadence=94,
            rpe=6.0 + order_index * 0.5,
            purpose="LT2",
            notes="Demo LT2 ciclismo",
        )
        if lactate is not None:
            interval.lactate_sample = LactateSample(
                lactate_mmol=lactate,
                sample_delay_seconds=35,
                sample_timing_label="tras 35s",
                sampling_notes="Muestra LT2 ciclismo.",
            )
        session.intervals.append(interval)
    return session


def _cycling_power_profile_session(athlete_id: int, performed_at: datetime, base_power: int, temperature_c: float) -> Session:
    session = Session(
        athlete_id=athlete_id,
        performed_at=performed_at,
        discipline="ciclismo",
        power_source="outdoor",
        session_type="VO2max",
        goal="Perfil de potencia corto y medio plazo.",
        surface="rodillo",
        temperature_c=temperature_c,
        comments="Bloques de potencia de distintas duraciones para alimentar mejores registros.",
    )
    blocks = [
        (1, 5, base_power + 420, 148, 160),
        (2, 10, base_power + 360, 151, 163),
        (3, 30, base_power + 250, 156, 168),
        (4, 60, base_power + 180, 160, 172),
        (5, 180, base_power + 120, 166, 176),
        (6, 300, base_power + 90, 169, 179),
        (7, 600, base_power + 40, 171, 181),
        (8, 1200, base_power, 168, 178),
    ]
    for order_index, duration_seconds, power, hr_avg, hr_max in blocks:
        session.intervals.append(
            SessionInterval(
                order_index=order_index,
                duration_seconds=duration_seconds,
                rest_seconds=120 if duration_seconds < 180 else 240,
                rest_type="easy_spin",
                heart_rate_avg=hr_avg,
                heart_rate_max=hr_max,
                pace_seconds_per_km=None,
                power_watts=power,
                running_power_watts=None,
                cadence=96 if duration_seconds <= 60 else 92,
                rpe=6.5 + min(order_index, 4) * 0.4,
                purpose="VO2max",
                notes="Perfil de potencia demo",
            )
        )
    return session


def _cycling_indoor_threshold_session(
    athlete_id: int,
    performed_at: datetime,
    lt1_power: int,
    lt2_power: int,
    temperature_c: float,
) -> Session:
    session = Session(
        athlete_id=athlete_id,
        performed_at=performed_at,
        discipline="ciclismo",
        power_source="indoor",
        session_type="test incremental",
        goal="Control específico indoor para separar perfil de rodillo y exterior.",
        surface="rodillo",
        temperature_c=temperature_c,
        comments="Test indoor específico para ver diferencia entre potenciómetro de interior y exterior.",
    )
    steps = [
        (lt1_power - 30, 136, 144, 82, 1.4),
        (lt1_power - 12, 144, 152, 84, 1.8),
        (lt1_power, 151, 159, 86, 2.2),
        (lt2_power - 14, 159, 167, 88, 3.0),
        (lt2_power, 166, 174, 90, 3.8),
        (lt2_power + 18, 172, 180, 92, 5.0),
    ]
    for order_index, (power, hr_avg, hr_max, cadence, lactate) in enumerate(steps, start=1):
        interval = SessionInterval(
            order_index=order_index,
            duration_seconds=240,
            rest_seconds=60,
            rest_type="easy_spin",
            heart_rate_avg=hr_avg,
            heart_rate_max=hr_max,
            pace_seconds_per_km=None,
            power_watts=power,
            running_power_watts=None,
            cadence=cadence,
            rpe=min(9.0, 2.2 + order_index),
            purpose="LT1" if order_index <= 3 else ("LT2" if order_index <= 5 else "VO2max"),
            notes="Demo incremental indoor",
        )
        interval.lactate_sample = LactateSample(
            lactate_mmol=lactate,
            sample_delay_seconds=25,
            sample_timing_label="tras 25s",
            sampling_notes="Dato demo indoor para comparar rodillo con exterior.",
        )
        session.intervals.append(interval)
    return session


def _build_robust_cycling_history(athlete_id: int) -> list[Session]:
    start = datetime.now().replace(hour=8, minute=30, second=0, microsecond=0) - timedelta(days=210)
    base_lt2 = 286
    base_lt1 = 235
    base_vo2 = 330
    sessions: list[Session] = []
    for block in range(7):
        performed_base = start + timedelta(days=block * 28 + 4)
        improvement = block * 4
        lt2_power = base_lt2 + improvement
        lt1_power = base_lt1 + improvement
        vo2_power = base_vo2 + improvement
        temperature = 18 + (block % 4)
        sessions.append(_cycling_incremental_session(athlete_id, performed_base, lt1_power, lt2_power, vo2_power, temperature))
        sessions.append(_cycling_lt1_session(athlete_id, performed_base + timedelta(days=8), lt1_power, temperature))
        sessions.append(_cycling_lt2_session(athlete_id, performed_base + timedelta(days=16), lt2_power, temperature + 1))
        if block in {2, 4, 6}:
            sessions.append(
                _cycling_indoor_threshold_session(
                    athlete_id,
                    performed_base + timedelta(days=12),
                    lt1_power - 8,
                    lt2_power - 10,
                    temperature + 1,
                )
            )
        if block in {1, 3, 5, 6}:
            sessions.append(_cycling_power_profile_session(athlete_id, performed_base + timedelta(days=22), lt2_power, temperature + 2))
    return sessions


def _swimming_threshold_session(
    athlete_id: int,
    performed_at: datetime,
    pace_100m_seconds: int,
    lactate: float,
    session_type: str,
) -> Session:
    session = Session(
        athlete_id=athlete_id,
        performed_at=performed_at,
        discipline="natación",
        session_type=session_type,
        goal=f"Control {session_type} en natación.",
        surface="piscina",
        temperature_c=27.0,
        comments="Bloques de nado con muestra final para definir umbrales de natación.",
    )
    blocks = [
        (1, pace_100m_seconds + 6, 148, 156, 1.6 if session_type == "sesión LT1" else None),
        (2, pace_100m_seconds + (2 if session_type == "sesión LT1" else 0), 154, 162, lactate),
    ]
    for order_index, pace, hr_avg, hr_max, block_lactate in blocks:
        interval = SessionInterval(
            order_index=order_index,
            duration_seconds=600,
            rest_seconds=60,
            rest_type="pool_rest",
            heart_rate_avg=hr_avg,
            heart_rate_max=hr_max,
            pace_seconds_per_km=pace * 10,
            power_watts=None,
            running_power_watts=None,
            cadence=None,
            rpe=4.2 if session_type == "sesión LT1" else 6.1,
            purpose="LT1" if session_type == "sesión LT1" else "LT2",
            notes="Demo natación umbral",
        )
        if block_lactate is not None:
            interval.lactate_sample = LactateSample(
                lactate_mmol=block_lactate,
                sample_delay_seconds=25,
                sample_timing_label="tras 25s",
                sampling_notes="Muestra de natación demo.",
            )
        session.intervals.append(interval)
    return session


def _build_swimming_history(athlete_id: int) -> list[Session]:
    start = datetime.now().replace(hour=7, minute=0, second=0, microsecond=0) - timedelta(days=180)
    sessions: list[Session] = []
    for block in range(4):
        base_day = start + timedelta(days=block * 42 + 6)
        sessions.append(_swimming_threshold_session(athlete_id, base_day, 95 - block, 2.0 + block * 0.05, "sesión LT1"))
        sessions.append(_swimming_threshold_session(athlete_id, base_day + timedelta(days=18), 89 - block, 3.6 + block * 0.08, "sesión LT2"))
    return sessions


def create_demo_athlete(db: Session, coach: Optional[User] = None) -> Athlete:
    rng = Random()
    first_names = ["Nora", "Irene", "Hugo", "Mateo", "Clara", "Adrian", "Sofia", "Lucas"]
    last_names = ["Salas", "Rueda", "Campos", "Linares", "Serrano", "Paredes"]

    base_weight = round(rng.uniform(56, 69), 1)
    athlete = Athlete(
        name=f"{first_names[rng.randint(0, len(first_names) - 1)]} {last_names[rng.randint(0, len(last_names) - 1)]}",
        date_of_birth=date(rng.randint(1989, 1999), rng.randint(1, 12), rng.randint(1, 28)),
        sex="female" if rng.random() < 0.5 else "male",
        weight=base_weight,
        height=round(rng.uniform(166, 182), 1),
        primary_discipline="running",
        notes="Atleta demo robusto con varios meses de tests incrementales, LT1, LT2 y VO2max para visualizar curvas, tendencias y predicciones.",
        created_at=date.today(),
        coach_id=coach.id if coach else None,
    )
    db.add(athlete)
    db.flush()

    start_weight_date = date.today() - timedelta(days=210)
    for week in range(0, 31, 4):
        weight = round(base_weight + rng.uniform(-1.1, 0.8), 1)
        db.add(
            AthleteWeightHistory(
                athlete_id=athlete.id,
                recorded_at=start_weight_date + timedelta(days=week * 7),
                weight=weight,
                source="demo_generator",
            )
        )

    for session in _build_robust_running_history(athlete.id, rng):
        db.add(session)

    db.commit()
    recalculate_athlete(db, athlete.id)
    db.refresh(athlete)
    return athlete


def create_chim_demo_athlete(db: Session, coach: Optional[User] = None) -> Athlete:
    athlete = Athlete(
        name="chim",
        date_of_birth=date(1994, 6, 14),
        sex="male",
        weight=68.4,
        height=178.0,
        primary_discipline="triatlón",
        goal_category="media_distancia",
        training_goal="Mejorar el rendimiento en triatlón con foco en media distancia, consolidando umbral en carrera y ciclismo.",
        notes="Triatleta demo con histórico robusto en carrera y ciclismo para comparar piscinas de lactato por disciplina.",
        created_at=date.today(),
        coach_id=coach.id if coach else None,
    )
    db.add(athlete)
    db.flush()

    start_weight_date = date.today() - timedelta(days=210)
    for week, weight in enumerate([69.1, 68.9, 68.7, 68.5, 68.4, 68.3, 68.4, 68.2]):
        db.add(
            AthleteWeightHistory(
                athlete_id=athlete.id,
                recorded_at=start_weight_date + timedelta(days=week * 28),
                weight=weight,
                source="demo_generator_chim",
            )
        )

    db.add(
        AthleteFocusBlock(
            athlete_id=athlete.id,
            start_date=date.today() - timedelta(days=21),
            end_date=date.today() + timedelta(days=14),
            energy_system_focus="Aerobic Power",
            block_objective="LT2",
            block_intent="Consolidar LT2 en ciclismo y running sin perder eficiencia a cadencias altas.",
            priority_discipline="ciclismo",
            phase="específico",
            target_event="Media distancia",
            target_date=date.today() + timedelta(days=63),
            status="active",
            coach_notes="Vigilar diferencia entre interior y exterior y sostener respuesta en umbral.",
        )
    )
    db.add(
        AthleteFocusBlock(
            athlete_id=athlete.id,
            start_date=date.today() + timedelta(days=15),
            end_date=date.today() + timedelta(days=49),
            energy_system_focus="Aerobic Capacity",
            block_objective="LT1",
            block_intent="Volver a ampliar estabilidad subumbral tras el bloque de LT2.",
            priority_discipline="running",
            phase="acumulación",
            target_event="Media distancia",
            target_date=date.today() + timedelta(days=63),
            status="planned",
            coach_notes="Buscar respuesta más económica antes del siguiente bloque específico.",
        )
    )

    for session in _build_robust_running_history(athlete.id, Random(17)):
        db.add(session)
    for session in _build_robust_cycling_history(athlete.id):
        db.add(session)
    for session in _build_swimming_history(athlete.id):
        db.add(session)

    db.commit()
    recalculate_athlete(db, athlete.id)
    db.refresh(athlete)
    return athlete
