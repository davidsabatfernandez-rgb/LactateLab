"""
Seed 60 days of realistic health data for athlete_id=14.

Tables seeded:
  - health_samples        (60 rows — daily)
  - wellness_checkins     (50 rows — some days skipped)
  - behavior_journal_entries (40 rows)
  - nutrition_logs        (30 rows)

Run:  .venv/bin/python3 seed_health_data.py
"""
import random
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, ".")

from app.db.session import SessionLocal
from app.models.health_sample import HealthSample
from app.models.wellness_checkin import WellnessCheckIn
from app.models.behavior_journal import BehaviorJournalEntry
from app.models.nutrition_log import NutritionLog

ATHLETE_ID = 14
NUM_DAYS = 60
random.seed(42)

today = date.today()
start_date = today - timedelta(days=NUM_DAYS)
dates = [start_date + timedelta(days=i) for i in range(NUM_DAYS)]


# ── helpers ──────────────────────────────────────────────────────────────────

def clamp(val, lo, hi):
    return max(lo, min(hi, val))


def noise(base, spread):
    return base + random.gauss(0, spread)


def is_hard_training_day(d: date) -> bool:
    """Tue, Wed, Thu are harder training days."""
    return d.weekday() in (1, 2, 3)


def is_weekend(d: date) -> bool:
    return d.weekday() in (5, 6)


def day_index(d: date) -> int:
    return (d - start_date).days


def in_illness_window(d: date) -> bool:
    idx = day_index(d)
    return 20 <= idx <= 23


def in_hard_block(d: date) -> bool:
    idx = day_index(d)
    return (10 <= idx <= 14) or (30 <= idx <= 34)


def improvement_factor(d: date) -> float:
    """0.0 at day 0 → 1.0 at day 59."""
    return day_index(d) / (NUM_DAYS - 1)


# ── 1.  HealthSample ────────────────────────────────────────────────────────

def generate_health_sample(d: date) -> dict:
    imp = improvement_factor(d)
    idx = day_index(d)
    ill = in_illness_window(d)
    hard_block = in_hard_block(d)
    hard_day = is_hard_training_day(d)
    weekend = is_weekend(d)

    # --- Sleep ---
    if ill:
        sleep_s = int(noise(30600, 1800))  # ~8.5h when sick (body needs rest)
    elif hard_block and hard_day:
        sleep_s = int(noise(25200, 1800))  # ~7h overreached
    elif weekend:
        sleep_s = int(noise(30600, 1800))  # ~8.5h weekends
    else:
        sleep_s = int(noise(28800, 1800))  # ~8h normal

    # occasional bad night (~8% chance)
    if random.random() < 0.08 and not ill:
        sleep_s = int(noise(19800, 1200))  # ~5.5h

    sleep_s = clamp(sleep_s, 16200, 36000)

    deep_pct = clamp(noise(0.20, 0.03), 0.12, 0.28)
    rem_pct = clamp(noise(0.22, 0.03), 0.15, 0.28)
    awake_s = int(clamp(noise(3000, 900), 1200, 6000))
    actual_sleep = sleep_s - awake_s
    deep_s = int(actual_sleep * deep_pct)
    rem_s = int(actual_sleep * rem_pct)
    core_s = actual_sleep - deep_s - rem_s

    # --- Heart ---
    base_rhr = 54 - imp * 4  # 54→50 over 60 days
    if ill:
        rhr = int(clamp(noise(64, 2), 60, 70))
    elif hard_block:
        rhr = int(clamp(noise(base_rhr + 4, 2), 48, 62))
    else:
        rhr = int(clamp(noise(base_rhr, 2), 46, 60))

    base_hrv = 55 + imp * 15  # 55→70 over 60 days
    if ill:
        hrv = round(clamp(noise(30, 4), 20, 40), 1)
    elif hard_block:
        hrv = round(clamp(noise(base_hrv - 15, 5), 25, 55), 1)
    elif weekend:
        hrv = round(clamp(noise(base_hrv + 5, 5), 40, 95), 1)
    else:
        hrv = round(clamp(noise(base_hrv, 6), 35, 90), 1)

    # --- Respiratory / SpO2 ---
    resp = round(clamp(noise(14.0, 1.0), 11.0, 18.0), 1)
    if ill:
        spo2 = round(clamp(noise(94.5, 0.8), 92.0, 97.0), 1)
    else:
        spo2 = round(clamp(noise(97.0, 0.7), 95.0, 100.0), 1)

    # --- Activity ---
    if ill:
        ex_min = int(clamp(noise(10, 8), 0, 30))
        steps = int(clamp(noise(3000, 800), 1000, 5000))
    elif hard_day:
        ex_min = int(clamp(noise(80, 20), 40, 130))
        steps = int(clamp(noise(12000, 2000), 7000, 18000))
    elif weekend:
        ex_min = int(clamp(noise(45, 20), 0, 90))
        steps = int(clamp(noise(8000, 2000), 4000, 14000))
    else:
        ex_min = int(clamp(noise(50, 15), 0, 90))
        steps = int(clamp(noise(9000, 2000), 4000, 14000))

    active_kcal = round(clamp(ex_min * noise(8.5, 1.5) + steps * 0.03, 150, 1400), 0)

    # --- VO2max (slow improvement) ---
    vo2 = round(clamp(52.0 + imp * 3.0 + random.gauss(0, 0.3), 50.0, 56.0), 1)

    return dict(
        athlete_id=ATHLETE_ID,
        sample_date=d,
        source="garmin",
        sleep_seconds=sleep_s,
        deep_sleep_seconds=deep_s,
        rem_sleep_seconds=rem_s,
        core_sleep_seconds=core_s,
        awake_seconds=awake_s,
        resting_hr=rhr,
        hrv_sdnn=hrv,
        respiration_rate=resp,
        spo2=spo2,
        steps=steps,
        exercise_minutes=ex_min,
        active_energy_kcal=active_kcal,
        vo2max=vo2,
        synced_at=datetime.now(timezone.utc),
    )


# ── 2.  WellnessCheckIn ─────────────────────────────────────────────────────

def generate_wellness_checkin(d: date, hs: dict) -> dict:
    ill = in_illness_window(d)
    hard_block = in_hard_block(d)
    weekend = is_weekend(d)

    if ill:
        fatigue = clamp(int(noise(2, 0.5)), 1, 3)
        soreness = clamp(int(noise(2, 0.5)), 1, 3)
        mood = clamp(int(noise(2, 0.5)), 1, 3)
    elif hard_block:
        fatigue = clamp(int(noise(2.5, 0.6)), 1, 4)
        soreness = clamp(int(noise(2.5, 0.6)), 1, 4)
        mood = clamp(int(noise(3, 0.5)), 2, 4)
    elif weekend:
        fatigue = clamp(int(noise(4, 0.5)), 3, 5)
        soreness = clamp(int(noise(4, 0.5)), 3, 5)
        mood = clamp(int(noise(4.2, 0.5)), 3, 5)
    else:
        fatigue = clamp(int(noise(3.5, 0.6)), 2, 5)
        soreness = clamp(int(noise(3.5, 0.6)), 2, 5)
        mood = clamp(int(noise(3.8, 0.5)), 2, 5)

    # Sleep quality correlated with actual sleep
    sleep_h = hs["sleep_seconds"] / 3600
    if sleep_h >= 8.5:
        sq = clamp(int(noise(4.5, 0.4)), 3, 5)
    elif sleep_h >= 7:
        sq = clamp(int(noise(3.5, 0.5)), 2, 5)
    else:
        sq = clamp(int(noise(2, 0.5)), 1, 3)

    notes_pool = [
        None, None, None, None,  # most days no notes
        "Legs heavy from yesterday",
        "Feeling great today",
        "Slept poorly, tossing and turning",
        "Good recovery session",
        "Stressful day at work",
        "Massage helped a lot",
        "Energy coming back",
        "Throat a bit sore",
        "Solid night, woke up refreshed",
    ]
    notes = random.choice(notes_pool)

    return dict(
        athlete_id=ATHLETE_ID,
        check_date=d,
        fatigue=fatigue,
        soreness=soreness,
        mood=mood,
        sleep_quality=sq,
        notes=notes,
        created_at=datetime.now(timezone.utc),
    )


# ── 3.  BehaviorJournalEntry ────────────────────────────────────────────────

def generate_behavior_entry(d: date, hs: dict) -> dict:
    ill = in_illness_window(d)
    weekend = is_weekend(d)
    hard_day = is_hard_training_day(d)

    had_alcohol = weekend and random.random() < 0.35  # ~15% overall
    screens_time = f"{random.choice(['22','23'])}:{random.choice(['00','15','30','45'])}" if random.random() < 0.50 else None
    caffeine_time = f"{random.choice(['14','15','16'])}:{random.choice(['00','30'])}" if random.random() < 0.30 else None
    late_meal_time = f"{random.choice(['21','22'])}:{random.choice(['00','30'])}" if random.random() < 0.20 else None

    return dict(
        athlete_id=ATHLETE_ID,
        entry_date=d,
        # Recovery
        ice_bath=random.random() < 0.15 and hard_day,
        sauna=random.random() < 0.20,
        massage=random.random() < 0.08,
        foam_rolling=random.random() < 0.40,
        stretching=random.random() < 0.80,
        compression_garments=random.random() < 0.10,
        cold_shower=random.random() < 0.12,
        # Nutrition
        alcohol=random.randint(1, 3) if had_alcohol else None,
        late_meal=late_meal_time,
        creatine=random.random() < 0.60,
        caffeine_after_2pm=caffeine_time,
        fasting=None,
        # Supplements
        melatonin=False,
        omega_3=random.random() < 0.50,
        vitamin_d=random.random() < 0.50,
        electrolytes=hard_day and random.random() < 0.70,
        probiotics=False,
        ashwagandha=False,
        cbd=False,
        pre_workout=hard_day and random.random() < 0.25,
        # Mental
        meditation=random.random() < 0.40,
        journaling=random.random() < 0.15,
        breathwork=random.random() < 0.20,
        # Sleep
        screens_before_bed=screens_time,
        consistent_bedtime=random.random() < 0.60,
        sleep_mask=False,
        magnesium=random.random() < 0.45,
        mouth_tape=False,
        nasal_strip=False,
        weighted_blanket=False,
        white_noise=False,
        reading_before_bed=random.random() < 0.30,
        blue_light_glasses=False,
        # Work
        working_late=random.random() < 0.15 and not weekend,
        shift_work=False,
        # Lifestyle
        travel_jet_lag=False,
        high_work_stress=random.choice([1, 2, 3]) if random.random() < 0.15 else None,
        nap=random.choice([20, 30]) if (weekend and random.random() < 0.25) else None,
        morning_sunlight=random.random() < 0.50,
        nature_outdoors=random.random() < 0.35,
        social_activity=weekend and random.random() < 0.40,
        sex=random.random() < 0.15,
        # Life status
        illness=ill,
        injury=False,
        allergies=False,
        high_altitude=False,
        # Medication
        antihistamine=False,
        pain_reliever=ill and random.random() < 0.50,
        birth_control=False,
        cpap_machine=False,
        prescription_medication=False,
        anti_inflammatory=False,
        notes=None,
        created_at=datetime.now(timezone.utc),
    )


# ── 4.  NutritionLog ────────────────────────────────────────────────────────

def generate_nutrition_log(d: date, hs: dict) -> dict:
    hard_day = is_hard_training_day(d)
    weekend = is_weekend(d)

    if hard_day:
        carbs = round(clamp(noise(300, 30), 220, 380), 0)
        protein = round(clamp(noise(160, 15), 130, 190), 0)
        fat = round(clamp(noise(75, 10), 55, 100), 0)
    elif weekend:
        carbs = round(clamp(noise(200, 30), 140, 280), 0)
        protein = round(clamp(noise(140, 15), 110, 170), 0)
        fat = round(clamp(noise(80, 10), 55, 100), 0)
    else:
        carbs = round(clamp(noise(250, 30), 170, 320), 0)
        protein = round(clamp(noise(150, 15), 120, 180), 0)
        fat = round(clamp(noise(70, 10), 50, 95), 0)

    cal = 4 * carbs + 4 * protein + 9 * fat
    hydration = round(clamp(noise(3.0, 0.5), 1.8, 4.5), 1)

    return dict(
        athlete_id=ATHLETE_ID,
        log_date=d,
        carbs_g=carbs,
        protein_g=protein,
        fat_g=fat,
        calories_kcal=cal,
        hydration_l=hydration,
        preset=None,
        notes=None,
        created_at=datetime.now(timezone.utc),
    )


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    db = SessionLocal()

    # Delete existing seeded data for this athlete in the date range
    print(f"Clearing existing data for athlete {ATHLETE_ID} ({start_date} to {dates[-1]})...")
    for Model, date_col in [
        (HealthSample, HealthSample.sample_date),
        (WellnessCheckIn, WellnessCheckIn.check_date),
        (BehaviorJournalEntry, BehaviorJournalEntry.entry_date),
        (NutritionLog, NutritionLog.log_date),
    ]:
        db.query(Model).filter(
            Model.athlete_id == ATHLETE_ID,
            date_col >= start_date,
            date_col <= dates[-1],
        ).delete(synchronize_session=False)
    db.commit()

    # ── Generate ─────────────────────────────────────────────────────────
    health_map = {}  # date → hs dict (for cross-referencing)

    # 1) HealthSample — every day
    hs_rows = []
    for d in dates:
        hs = generate_health_sample(d)
        health_map[d] = hs
        hs_rows.append(HealthSample(**hs))
    db.add_all(hs_rows)
    print(f"  HealthSample:          {len(hs_rows)} rows")

    # 2) WellnessCheckIn — 50 of 60 days (random skip 10)
    skip_wellness = set(random.sample(range(NUM_DAYS), 10))
    wc_rows = []
    for i, d in enumerate(dates):
        if i in skip_wellness:
            continue
        wc = generate_wellness_checkin(d, health_map[d])
        wc_rows.append(WellnessCheckIn(**wc))
    db.add_all(wc_rows)
    print(f"  WellnessCheckIn:       {len(wc_rows)} rows")

    # 3) BehaviorJournalEntry — 40 of 60 days
    skip_behavior = set(random.sample(range(NUM_DAYS), 20))
    bj_rows = []
    for i, d in enumerate(dates):
        if i in skip_behavior:
            continue
        bj = generate_behavior_entry(d, health_map[d])
        bj_rows.append(BehaviorJournalEntry(**bj))
    db.add_all(bj_rows)
    print(f"  BehaviorJournalEntry:  {len(bj_rows)} rows")

    # 4) NutritionLog — 30 of 60 days
    skip_nutrition = set(random.sample(range(NUM_DAYS), 30))
    nl_rows = []
    for i, d in enumerate(dates):
        if i in skip_nutrition:
            continue
        nl = generate_nutrition_log(d, health_map[d])
        nl_rows.append(NutritionLog(**nl))
    db.add_all(nl_rows)
    print(f"  NutritionLog:          {len(nl_rows)} rows")

    db.commit()
    db.close()

    print("\nSeed complete.")


if __name__ == "__main__":
    main()
