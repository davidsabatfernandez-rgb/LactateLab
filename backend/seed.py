from datetime import date, datetime

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.athlete import Athlete, AthleteWeightHistory
from app.models.session import LactateSample, Session, SessionInterval
from app.models.user import User
from app.services.analytics import recalculate_athlete


def seed() -> None:
    db = SessionLocal()
    try:
        coach = db.scalar(select(User).where(User.email == "coach@lactatelab.dev"))
        if coach is None:
            coach = User(
                email="coach@lactatelab.dev",
                hashed_password=get_password_hash("demo1234"),
                role="coach",
                full_name="Demo Coach",
            )
            db.add(coach)
            db.flush()

        athlete_user = db.scalar(select(User).where(User.email == "athlete@lactatelab.dev"))

        existing_athletes = db.scalars(select(Athlete).where(Athlete.coach_id == coach.id).order_by(Athlete.created_at)).all()
        if existing_athletes:
            linked_athlete = next((athlete for athlete in existing_athletes if athlete.primary_discipline == "triatlón"), existing_athletes[0])
            if athlete_user is None:
                db.add(
                    User(
                        email="athlete@lactatelab.dev",
                        hashed_password=get_password_hash("demo1234"),
                        role="athlete",
                        full_name=linked_athlete.name,
                        athlete_id=linked_athlete.id,
                    )
                )
                db.flush()
            elif athlete_user.athlete_id is None:
                athlete_user.athlete_id = linked_athlete.id
                athlete_user.full_name = linked_athlete.name
            db.commit()
            return

        athletes = [
            Athlete(
                name="Lucia Moreno",
                date_of_birth=date(1993, 4, 11),
                sex="female",
                weight=56.2,
                height=168,
                primary_discipline="running",
                notes="Corredora de fondo con foco en 10K y media maratón.",
                created_at=date(2025, 10, 1),
                coach_id=coach.id,
            ),
            Athlete(
                name="Pablo Serra",
                date_of_birth=date(1989, 8, 22),
                sex="male",
                weight=72.5,
                height=181,
                primary_discipline="ciclismo",
                notes="Ciclista amateur avanzado con perfil diésel.",
                created_at=date(2025, 9, 10),
                coach_id=coach.id,
            ),
            Athlete(
                name="Marta Vidal",
                date_of_birth=date(1996, 1, 17),
                sex="female",
                weight=60.4,
                height=170,
                primary_discipline="triatlón",
                notes="Triatleta de media distancia.",
                created_at=date(2025, 11, 2),
                coach_id=coach.id,
            ),
        ]
        db.add_all(athletes)
        db.flush()

        linked_athlete = athletes[2]
        if athlete_user is None:
            db.add(
                User(
                    email="athlete@lactatelab.dev",
                    hashed_password=get_password_hash("demo1234"),
                    role="athlete",
                    full_name=linked_athlete.name,
                    athlete_id=linked_athlete.id,
                )
            )
        else:
            athlete_user.athlete_id = linked_athlete.id
            athlete_user.full_name = linked_athlete.name

        for athlete in athletes:
            db.add(AthleteWeightHistory(athlete_id=athlete.id, recorded_at=athlete.created_at, weight=athlete.weight, source="baseline"))

        demo_sessions = [
            (
                athletes[0],
                Session(
                    athlete_id=athletes[0].id,
                    performed_at=datetime(2026, 1, 12, 9, 0),
                    discipline="running",
                    session_type="test incremental",
                    goal="Mapear curva inicial de lactato.",
                    surface="pista",
                    temperature_c=13,
                    comments="Incrementos de 4 min con muestra a 45s.",
                ),
                [
                    (1, 240, 60, "walk", 148, 153, 345, None, None, 176, 3, "aeróbico", 1.4, 45, "tras 45s"),
                    (2, 240, 60, "walk", 156, 161, 330, None, None, 178, 4, "LT1", 1.8, 45, "tras 45s"),
                    (3, 240, 60, "walk", 164, 170, 318, None, None, 180, 5, "LT1", 2.3, 45, "tras 45s"),
                    (4, 240, 60, "walk", 172, 178, 305, None, None, 182, 6, "LT2", 3.6, 45, "tras 45s"),
                    (5, 240, 60, "walk", 179, 185, 293, None, None, 184, 8, "VO2max", 5.5, 45, "tras 45s"),
                ],
            ),
            (
                athletes[0],
                Session(
                    athlete_id=athletes[0].id,
                    performed_at=datetime(2026, 2, 2, 9, 0),
                    discipline="running",
                    session_type="sesión LT1",
                    goal="Comparar 8x4' LT1 frente a bloques largos.",
                    surface="asfalto",
                    temperature_c=11,
                    comments="8x4' con 1' suave.",
                ),
                [
                    (1, 240, 60, "jog", 150, 154, 350, None, 248, 176, 3, "LT1", 1.7, 30, "tras 30s"),
                    (2, 240, 60, "jog", 151, 155, 348, None, 250, 176, 3, "LT1", 1.8, 30, "tras 30s"),
                    (3, 240, 60, "jog", 152, 156, 347, None, 251, 177, 3, "LT1", 1.9, 30, "tras 30s"),
                    (4, 240, 60, "jog", 153, 157, 346, None, 251, 177, 4, "LT1", 2.0, 30, "tras 30s"),
                    (5, 240, 60, "jog", 154, 158, 346, None, 252, 177, 4, "LT1", 2.0, 30, "tras 30s"),
                ],
            ),
            (
                athletes[0],
                Session(
                    athlete_id=athletes[0].id,
                    performed_at=datetime(2026, 2, 18, 9, 0),
                    discipline="running",
                    session_type="sesión LT1",
                    goal="Evaluar estabilidad en 2x20'.",
                    surface="asfalto",
                    temperature_c=15,
                    comments="2x20' LT1 con 3' suaves.",
                ),
                [
                    (1, 1200, 180, "jog", 154, 159, 349, None, 250, 177, 4, "LT1", 2.0, 60, "tras 60s"),
                    (2, 1200, 180, "jog", 157, 161, 346, None, 253, 177, 5, "LT1", 2.0, 60, "tras 60s"),
                ],
            ),
            (
                athletes[1],
                Session(
                    athlete_id=athletes[1].id,
                    performed_at=datetime(2026, 1, 20, 8, 0),
                    discipline="ciclismo",
                    session_type="test incremental",
                    goal="Curva inicial en rodillo.",
                    surface="indoor",
                    temperature_c=19,
                    comments="Etapas de 5 min.",
                ),
                [
                    (1, 300, 60, "easy", 128, 136, None, 190, None, 88, 2, "aeróbico", 1.2, 45, "tras 45s"),
                    (2, 300, 60, "easy", 138, 145, None, 220, None, 90, 3, "LT1", 1.7, 45, "tras 45s"),
                    (3, 300, 60, "easy", 148, 156, None, 250, None, 91, 4, "LT1", 2.2, 45, "tras 45s"),
                    (4, 300, 60, "easy", 158, 166, None, 280, None, 93, 6, "LT2", 3.4, 45, "tras 45s"),
                    (5, 300, 60, "easy", 168, 175, None, 310, None, 95, 8, "VO2max", 5.1, 45, "tras 45s"),
                ],
            ),
            (
                athletes[1],
                Session(
                    athlete_id=athletes[1].id,
                    performed_at=datetime(2026, 2, 14, 8, 0),
                    discipline="ciclismo",
                    session_type="sesión LT2",
                    goal="Bloques largos en umbral.",
                    surface="carretera",
                    temperature_c=12,
                    comments="3x12' en umbral con 4' suaves.",
                ),
                [
                    (1, 720, 240, "easy", 156, 162, None, 272, None, 92, 6, "LT2", 3.2, 75, "tras 75s"),
                    (2, 720, 240, "easy", 159, 165, None, 278, None, 92, 7, "LT2", 3.7, 75, "tras 75s"),
                    (3, 720, 240, "easy", 161, 168, None, 281, None, 93, 8, "LT2", 4.0, 75, "tras 75s"),
                ],
            ),
            # ── Marta Vidal: test incremental running (8 escalones, curva limpia) ──
            (
                athletes[2],
                Session(
                    athlete_id=athletes[2].id,
                    performed_at=datetime(2026, 1, 15, 8, 0),
                    discipline="running",
                    session_type="test incremental",
                    goal="Mapear curva de lactato running inicial.",
                    surface="pista",
                    temperature_c=12,
                    comments="8×1200m incrementos de 10s/km, muestra a 45s.",
                ),
                [
                    (1, 300, 60, "walk", 132, 138, 370, None, None, 170, 2, "aeróbico", 0.9, 45, "tras 45s"),
                    (2, 300, 60, "walk", 140, 146, 355, None, None, 172, 3, "aeróbico", 1.1, 45, "tras 45s"),
                    (3, 300, 60, "walk", 148, 154, 340, None, None, 174, 3, "aeróbico", 1.3, 45, "tras 45s"),
                    (4, 300, 60, "walk", 155, 162, 325, None, None, 176, 4, "LT1", 1.7, 45, "tras 45s"),
                    (5, 300, 60, "walk", 162, 169, 310, None, None, 178, 5, "LT1", 2.4, 45, "tras 45s"),
                    (6, 300, 60, "walk", 170, 176, 295, None, None, 180, 6, "LT2", 3.3, 45, "tras 45s"),
                    (7, 300, 60, "walk", 176, 183, 280, None, None, 182, 8, "LT2", 4.8, 45, "tras 45s"),
                    (8, 300, 60, "walk", 182, 190, 265, None, None, 185, 9, "VO2max", 7.2, 45, "tras 45s"),
                ],
            ),
            # ── Marta: sesión LT1 running con mediciones sueltas ──
            (
                athletes[2],
                Session(
                    athlete_id=athletes[2].id,
                    performed_at=datetime(2026, 2, 5, 7, 30),
                    discipline="running",
                    session_type="sesión LT1",
                    goal="6×5' LT1 con muestra en intervalos 2 y 5.",
                    surface="asfalto",
                    temperature_c=10,
                    comments="Muestreo parcial para seguimiento.",
                ),
                [
                    (1, 300, 60, "jog", 148, 153, 342, None, None, 174, 3, "LT1", None, None, None),
                    (2, 300, 60, "jog", 150, 155, 338, None, None, 175, 3, "LT1", 1.5, 30, "tras 30s"),
                    (3, 300, 60, "jog", 151, 156, 336, None, None, 175, 4, "LT1", None, None, None),
                    (4, 300, 60, "jog", 152, 157, 335, None, None, 176, 4, "LT1", None, None, None),
                    (5, 300, 60, "jog", 153, 158, 334, None, None, 176, 4, "LT1", 1.6, 30, "tras 30s"),
                    (6, 300, 60, "jog", 154, 159, 333, None, None, 176, 4, "LT1", None, None, None),
                ],
            ),
            # ── Marta: sesión LT2 running con mediciones ──
            (
                athletes[2],
                Session(
                    athlete_id=athletes[2].id,
                    performed_at=datetime(2026, 2, 20, 8, 0),
                    discipline="running",
                    session_type="sesión LT2",
                    goal="4×8' LT2 con muestra post cada intervalo.",
                    surface="asfalto",
                    temperature_c=14,
                    comments="Bloques umbral con toma completa.",
                ),
                [
                    (1, 480, 180, "jog", 168, 174, 298, None, None, 180, 6, "LT2", 3.1, 45, "tras 45s"),
                    (2, 480, 180, "jog", 171, 177, 295, None, None, 181, 7, "LT2", 3.4, 45, "tras 45s"),
                    (3, 480, 180, "jog", 173, 179, 293, None, None, 181, 7, "LT2", 3.6, 45, "tras 45s"),
                    (4, 480, 180, "jog", 175, 182, 290, None, None, 182, 8, "LT2", 3.9, 45, "tras 45s"),
                ],
            ),
            # ── Marta: test incremental ciclismo (7 escalones) ──
            (
                athletes[2],
                Session(
                    athlete_id=athletes[2].id,
                    performed_at=datetime(2026, 2, 28, 8, 0),
                    discipline="ciclismo",
                    session_type="test incremental",
                    goal="Curva de lactato en rodillo.",
                    surface="indoor",
                    temperature_c=20,
                    comments="7×5' incrementos de 30W, muestra a 45s.",
                ),
                [
                    (1, 300, 60, "easy", 120, 128, None, 130, None, 85, 2, "aeróbico", 0.8, 45, "tras 45s"),
                    (2, 300, 60, "easy", 132, 140, None, 160, None, 87, 3, "aeróbico", 1.0, 45, "tras 45s"),
                    (3, 300, 60, "easy", 144, 152, None, 190, None, 89, 4, "LT1", 1.5, 45, "tras 45s"),
                    (4, 300, 60, "easy", 155, 163, None, 220, None, 91, 5, "LT1", 2.3, 45, "tras 45s"),
                    (5, 300, 60, "easy", 164, 172, None, 250, None, 93, 7, "LT2", 3.5, 45, "tras 45s"),
                    (6, 300, 60, "easy", 172, 180, None, 280, None, 95, 8, "LT2", 5.4, 45, "tras 45s"),
                    (7, 300, 60, "easy", 179, 188, None, 310, None, 97, 9, "VO2max", 8.1, 45, "tras 45s"),
                ],
            ),
            # ── Marta: transición bike-run con bloques duros ──
            (
                athletes[2],
                Session(
                    athlete_id=athletes[2].id,
                    performed_at=datetime(2026, 3, 10, 7, 30),
                    discipline="running",
                    session_type="sesión LT1",
                    goal="Rodaje LT1 post-bici con muestra de control.",
                    surface="asfalto",
                    temperature_c=16,
                    comments="30' continuo a ritmo LT1 con muestras al inicio y final.",
                ),
                [
                    (1, 900, 0, "none", 150, 156, 340, None, None, 175, 3, "LT1", 1.4, 45, "tras 45s"),
                    (2, 900, 0, "none", 153, 159, 336, None, None, 176, 4, "LT1", 1.7, 45, "tras 45s"),
                ],
            ),
        ]

        for athlete, session, intervals in demo_sessions:
            for order_index, duration_seconds, rest_seconds, rest_type, hr_avg, hr_max, pace, power, running_power, cadence, rpe, purpose, lactate, delay, label in intervals:
                interval = SessionInterval(
                    order_index=order_index,
                    duration_seconds=duration_seconds,
                    rest_seconds=rest_seconds,
                    rest_type=rest_type,
                    heart_rate_avg=hr_avg,
                    heart_rate_max=hr_max,
                    pace_seconds_per_km=pace,
                    power_watts=power,
                    running_power_watts=running_power,
                    cadence=cadence,
                    rpe=rpe,
                    purpose=purpose,
                )
                if lactate is not None:
                    interval.lactate_sample = LactateSample(
                        lactate_mmol=lactate,
                        sample_delay_seconds=delay,
                        sample_timing_label=label,
                        sampling_notes="Muestra capilar lóbulo oreja.",
                    )
                session.intervals.append(interval)
            db.add(session)

        db.commit()

        for athlete in athletes:
            recalculate_athlete(db, athlete.id)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
