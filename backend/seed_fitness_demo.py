"""
Seed realistic Garmin activities for the demo athlete user (athlete@lactatelab.dev).
Generates 60 days of multi-sport training data for a triathlete profile.
Also sets plan_tier = 'pro' and HR fields on the athlete.

Usage:
    cd backend && source .venv/bin/activate && python seed_fitness_demo.py
"""
from datetime import datetime, timedelta
import random
import math

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.athlete import Athlete
from app.models.garmin_activity import GarminActivity
from app.models.user import User


def seed_fitness() -> None:
    db = SessionLocal()
    try:
        # Find the athlete user
        user = db.scalar(select(User).where(User.email == "athlete@lactatelab.dev"))
        if not user or not user.athlete_id:
            print("ERROR: athlete@lactatelab.dev not found or has no athlete_id. Run seed.py first.")
            return

        athlete = db.get(Athlete, user.athlete_id)
        if not athlete:
            print(f"ERROR: Athlete {user.athlete_id} not found.")
            return

        # Set plan to pro
        user.plan_tier = "pro"

        # Set HR fields on athlete
        athlete.training_hr_max = 188
        athlete.hr_rest = 46
        athlete.ftp_cycling_watts = 255
        athlete.vo2max_ml_kg_min = 52.0
        athlete.initial_ctl = 55
        athlete.initial_atl = 48

        # Clean existing demo activities (provider_activity_id 90000–99999)
        existing = db.scalars(
            select(GarminActivity).where(
                GarminActivity.athlete_id == athlete.id,
                GarminActivity.provider_activity_id >= 90000,
                GarminActivity.provider_activity_id < 100000,
            )
        ).all()
        for a in existing:
            db.delete(a)
        db.flush()

        # Generate 60 days of activities
        now = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        random.seed(42)
        activities: list[GarminActivity] = []
        act_id = 90000

        WORKOUTS = {
            "running": {
                "sport_type": "running",
                "discipline": "running",
                "names_easy": ["Rodaje suave", "Easy Run", "Recovery Run", "Regenerativo"],
                "names_hard": ["Tempo Run", "Intervals 5×1km", "Fartlek", "Hill Repeats", "Threshold Run"],
                "names_long": ["Long Run", "Tirada larga", "Long Run progresivo"],
            },
            "cycling": {
                "sport_type": "cycling",
                "discipline": "ciclismo",
                "names_easy": ["Endurance Ride", "Recovery Spin", "Rodillo Z2"],
                "names_hard": ["Sweet Spot", "FTP Intervals", "Tempo Ride", "Over/Under"],
                "names_long": ["Ruta larga", "Fondón fin de semana", "Gran Fondo"],
            },
            "swimming": {
                "sport_type": "lap_swimming",
                "discipline": "natación",
                "names_easy": ["Técnica + Aero", "Endurance Swim", "Pull + paddles"],
                "names_hard": ["CSS Intervals", "Threshold Set", "8×200 CSS", "Sprint Set"],
                "names_long": ["Nado largo continuo", "3000m steady"],
            },
            "strength": {
                "sport_type": "strength_training",
                "discipline": "other",
                "names_easy": ["Core + Estabilidad", "Movilidad", "Yoga"],
                "names_hard": ["Full Body", "Piernas + Core", "Upper Body"],
                "names_long": [],
            },
        }

        for day_offset in range(59, -1, -1):
            d = now - timedelta(days=day_offset)
            dow = d.weekday()  # 0=Mon

            # Rest day: Monday + random ~12%
            is_rest = dow == 0 or random.random() < 0.10
            if is_rest:
                continue

            # Determine session type
            is_hard = dow in (2, 5)   # Wed, Sat
            is_long = dow == 6        # Sun

            # Primary sport — triathlete mix
            r = random.random()
            if r < 0.40:
                sport_key = "running"
            elif r < 0.70:
                sport_key = "cycling"
            elif r < 0.88:
                sport_key = "swimming"
            else:
                sport_key = "strength"

            w = WORKOUTS[sport_key]

            # Duration
            if sport_key == "running":
                base_dur = 5400 if is_long else (3600 if is_hard else 2700)
            elif sport_key == "cycling":
                base_dur = 10800 if is_long else (5400 if is_hard else 3600)
            elif sport_key == "swimming":
                base_dur = 4200 if is_long else (3600 if is_hard else 2400)
            else:
                base_dur = 3000 if is_hard else 2400

            duration = int(base_dur * (0.85 + random.random() * 0.30))

            # Distance
            if sport_key == "running":
                pace = 270 + random.random() * 40  # ~4:30–5:10 /km
                distance = (duration / pace) * 1000
            elif sport_key == "cycling":
                speed = 25 + random.random() * 8  # 25–33 km/h
                distance = (duration / 3600) * speed * 1000
            elif sport_key == "swimming":
                distance = (duration / 105) * 100  # ~1:45/100m
            else:
                distance = 0

            distance = round(distance)

            # HR
            hr_max_athlete = 188
            if is_hard:
                avg_hr = int(155 + random.random() * 18)
            elif is_long:
                avg_hr = int(138 + random.random() * 12)
            else:
                avg_hr = int(128 + random.random() * 15)
            max_hr = min(hr_max_athlete, int(avg_hr + 12 + random.random() * 15))

            # Watts (cycling only)
            watts = None
            max_watts = None
            if sport_key == "cycling":
                ftp = 255
                if is_hard:
                    watts = round(ftp * (0.88 + random.random() * 0.15))
                elif is_long:
                    watts = round(ftp * (0.65 + random.random() * 0.10))
                else:
                    watts = round(ftp * (0.58 + random.random() * 0.12))
                max_watts = round(watts * (1.2 + random.random() * 0.3))

            # TSS
            if watts and sport_key == "cycling":
                # normalized approach
                np_est = watts * (1.02 + random.random() * 0.06)
                tss = round((duration * np_est * (np_est / 255)) / (255 * 3600) * 100)
            elif sport_key == "running":
                tss = round((65 if is_hard else 90 if is_long else 40) * (0.80 + random.random() * 0.40))
            elif sport_key == "swimming":
                tss = round((50 if is_hard else 35) * (0.80 + random.random() * 0.40))
            else:
                tss = round(25 * (0.80 + random.random() * 0.40))

            # Name
            if is_long and w["names_long"]:
                name = random.choice(w["names_long"])
            elif is_hard:
                name = random.choice(w["names_hard"])
            else:
                name = random.choice(w["names_easy"])

            # Speed
            avg_speed = distance / duration if duration > 0 and distance > 0 else None
            max_speed = avg_speed * (1.15 + random.random() * 0.2) if avg_speed else None

            # Cadence
            if sport_key == "running":
                cadence = round(170 + random.random() * 16)
            elif sport_key == "cycling":
                cadence = round(82 + random.random() * 14)
            else:
                cadence = None

            # Calories
            calories = round((duration / 60) * (avg_hr / 22))

            # Elevation (cycling/running)
            elevation = None
            if sport_key == "cycling" and is_long:
                elevation = round(500 + random.random() * 800)
            elif sport_key == "cycling":
                elevation = round(150 + random.random() * 400)
            elif sport_key == "running" and is_long:
                elevation = round(80 + random.random() * 200)
            elif sport_key == "running":
                elevation = round(30 + random.random() * 80)

            hour = 6 + int(random.random() * 3)
            minute = int(random.random() * 60)
            started_at = d.replace(hour=hour, minute=minute)

            activities.append(GarminActivity(
                athlete_id=athlete.id,
                provider_activity_id=act_id,
                sport_type=w["sport_type"],
                discipline=w["discipline"],
                name=name,
                started_at=started_at,
                distance_m=distance,
                moving_time_seconds=duration,
                elapsed_time_seconds=int(duration * (1.02 + random.random() * 0.08)),
                average_heartrate=avg_hr,
                max_heartrate=max_hr,
                average_watts=watts,
                max_watts=max_watts,
                average_speed_m_s=round(avg_speed, 3) if avg_speed else None,
                max_speed_m_s=round(max_speed, 3) if max_speed else None,
                total_elevation_gain_m=elevation,
                average_cadence=cadence,
                calories=calories,
                device_name="Garmin Forerunner 965",
                tss=tss,
                tss_method="hr",
                synced_at=datetime.utcnow(),
            ))
            act_id += 1

            # Double day on Wed/Sat ~35%
            if dow in (2, 5) and random.random() < 0.35:
                sec_key = "strength" if sport_key != "strength" else "running"
                sw = WORKOUTS[sec_key]
                sec_dur = int(2400 * (0.8 + random.random() * 0.4))
                sec_hr = int(125 + random.random() * 15)
                sec_name = random.choice(sw["names_easy"] or sw["names_hard"])
                sec_dist = 0 if sec_key == "strength" else round((sec_dur / 330) * 1000)
                sec_tss = round(25 * (0.8 + random.random() * 0.4))
                sec_speed = sec_dist / sec_dur if sec_dist > 0 else None

                activities.append(GarminActivity(
                    athlete_id=athlete.id,
                    provider_activity_id=act_id,
                    sport_type=sw["sport_type"],
                    discipline=sw["discipline"],
                    name=sec_name,
                    started_at=d.replace(hour=17, minute=int(random.random() * 60)),
                    distance_m=sec_dist,
                    moving_time_seconds=sec_dur,
                    elapsed_time_seconds=int(sec_dur * 1.05),
                    average_heartrate=sec_hr,
                    max_heartrate=int(sec_hr + 15 + random.random() * 10),
                    average_speed_m_s=round(sec_speed, 3) if sec_speed else None,
                    calories=round(sec_dur / 4),
                    device_name="Garmin Forerunner 965",
                    tss=sec_tss,
                    tss_method="hr",
                    synced_at=datetime.utcnow(),
                ))
                act_id += 1

        db.add_all(activities)
        db.commit()
        print(f"OK — {len(activities)} activities seeded for {athlete.name} (id={athlete.id})")
        print(f"     plan_tier set to 'pro' for {user.email}")
        print(f"     HR max={athlete.training_hr_max}, rest={athlete.hr_rest}, FTP={athlete.ftp_cycling_watts}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_fitness()
