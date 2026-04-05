"""Weekly and Monthly Performance Reports.

Generates Whoop-style performance assessments combining recovery, training,
sleep, vitals, behaviors, and nutrition data into a single digest.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models.behavior_correlation import BehaviorCorrelation
from app.models.behavior_journal import BehaviorJournalEntry, BEHAVIOR_KEYS
from app.models.garmin_activity import GarminActivity
from app.models.health_sample import HealthSample
from app.models.nutrition_log import NutritionLog
from app.models.wellness_checkin import WellnessCheckIn
from app.services.athlete_health import SPORT_TYPE_MAPPINGS, compute_recovery_score

logger = logging.getLogger(__name__)

# ── Helpers ──────────────────────────────────────────────────────

BEHAVIOR_EMOJIS: dict[str, str] = {
    "ice_bath": "\u2744\uFE0F", "sauna": "\U0001F9D6", "massage": "\U0001F486",
    "foam_rolling": "\U0001F9D8", "stretching": "\U0001F938", "compression_garments": "\U0001F9E6",
    "cold_shower": "\U0001F6BF", "creatine": "\U0001F4AA", "melatonin": "\U0001F31C",
    "omega_3": "\U0001F41F", "vitamin_d": "\u2600\uFE0F", "electrolytes": "\u26A1",
    "probiotics": "\U0001F9AB", "ashwagandha": "\U0001F33F", "cbd": "\U0001F343",
    "pre_workout": "\U0001F525", "meditation": "\U0001F9D8", "journaling": "\U0001F4DD",
    "breathwork": "\U0001F32C\uFE0F", "consistent_bedtime": "\U0001F319",
    "sleep_mask": "\U0001F60E", "magnesium": "\U0001F48A", "morning_sunlight": "\U0001F305",
    "nature_outdoors": "\U0001F333", "social_activity": "\U0001F46B",
}

BEHAVIOR_LABELS: dict[str, str] = {
    "ice_bath": "Bano de hielo", "sauna": "Sauna", "massage": "Masaje",
    "foam_rolling": "Foam rolling", "stretching": "Estiramientos",
    "compression_garments": "Compresion", "cold_shower": "Ducha fria",
    "creatine": "Creatina", "melatonin": "Melatonina", "omega_3": "Omega-3",
    "vitamin_d": "Vitamina D", "electrolytes": "Electrolitos",
    "probiotics": "Probioticos", "ashwagandha": "Ashwagandha", "cbd": "CBD",
    "pre_workout": "Pre-entreno", "meditation": "Meditacion",
    "journaling": "Journaling", "breathwork": "Respiracion",
    "consistent_bedtime": "Horario fijo", "sleep_mask": "Antifaz",
    "magnesium": "Magnesio", "morning_sunlight": "Sol manana",
    "nature_outdoors": "Naturaleza", "social_activity": "Social",
    "alcohol": "Alcohol", "late_meal": "Cena tardia",
    "caffeine_after_2pm": "Cafeina tarde", "fasting": "Ayuno",
    "screens_before_bed": "Pantallas", "working_late": "Trabajo tarde",
    "shift_work": "Turno nocturno", "travel_jet_lag": "Jet lag",
    "high_work_stress": "Estres laboral", "nap": "Siesta",
    "sex": "Sexo", "illness": "Enfermedad", "injury": "Lesion",
    "mouth_tape": "Tape bucal", "nasal_strip": "Tira nasal",
    "weighted_blanket": "Manta pesada", "white_noise": "Ruido blanco",
    "reading_before_bed": "Lectura", "blue_light_glasses": "Gafas filtro azul",
}


def _safe_round(val: float | None, decimals: int = 1) -> float | None:
    if val is None:
        return None
    return round(val, decimals)


def _trend(current: float | None, previous: float | None) -> str:
    if current is None or previous is None or previous == 0:
        return "stable"
    pct = (current - previous) / abs(previous) * 100
    if pct > 5:
        return "improving"
    if pct < -5:
        return "declining"
    return "stable"


def _trend_inverted(current: float | None, previous: float | None) -> str:
    """For metrics where lower is better (resting HR)."""
    if current is None or previous is None or previous == 0:
        return "stable"
    pct = (current - previous) / abs(previous) * 100
    if pct < -5:
        return "improving"
    if pct > 5:
        return "declining"
    return "stable"


def _pct_change(current: float | None, previous: float | None) -> float | None:
    if current is None or previous is None or previous == 0:
        return None
    return round((current - previous) / abs(previous) * 100, 1)


def _recovery_zone(score: float) -> str:
    if score >= 67:
        return "green"
    if score >= 34:
        return "yellow"
    return "red"


def _get_week_bounds(week_start: date | None = None) -> tuple[date, date]:
    """Return (monday, sunday) of the requested week. Default: last completed week."""
    if week_start is not None:
        monday = week_start
    else:
        today = date.today()
        # Last completed week: previous Monday through Sunday
        days_since_monday = today.weekday()  # 0=Mon
        last_monday = today - timedelta(days=days_since_monday + 7)
        monday = last_monday
    sunday = monday + timedelta(days=6)
    return monday, sunday


def _get_month_bounds(year_month: str | None = None) -> tuple[date, date]:
    """Return (first_day, last_day) of the requested month."""
    if year_month:
        parts = year_month.split("-")
        year, month = int(parts[0]), int(parts[1])
    else:
        today = date.today()
        # Previous month
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        year, month = last_prev.year, last_prev.month
    first_day = date(year, month, 1)
    if month == 12:
        last_day = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        last_day = date(year, month + 1, 1) - timedelta(days=1)
    return first_day, last_day


# ── Recovery Section ─────────────────────────────────────────────

def _build_recovery(db: Session, athlete_id: int, start: date, end: date, prev_start: date, prev_end: date) -> dict:
    daily = []
    scores = []
    day = start
    while day <= end:
        try:
            result = compute_recovery_score(db, athlete_id, day)
            score = result.get("score")
        except Exception:
            score = None
        zone = _recovery_zone(score) if score is not None else None
        daily.append({"date": day.isoformat(), "score": score, "zone": zone})
        if score is not None:
            scores.append((day, score))
        day += timedelta(days=1)

    avg_score = _safe_round(sum(s for _, s in scores) / len(scores)) if scores else None
    best_day = max(scores, key=lambda x: x[1])[0].isoformat() if scores else None
    worst_day = min(scores, key=lambda x: x[1])[0].isoformat() if scores else None

    # Previous period average for trend
    prev_scores = []
    pday = prev_start
    while pday <= prev_end:
        try:
            result = compute_recovery_score(db, athlete_id, pday)
            s = result.get("score")
            if s is not None:
                prev_scores.append(s)
        except Exception:
            pass
        pday += timedelta(days=1)
    prev_avg = (sum(prev_scores) / len(prev_scores)) if prev_scores else None

    return {
        "avg_score": avg_score,
        "trend": _trend(avg_score, prev_avg),
        "best_day": best_day,
        "worst_day": worst_day,
        "daily": daily,
    }


# ── Training Section ─────────────────────────────────────────────

def _build_training(db: Session, athlete_id: int, start: date, end: date) -> dict:
    from datetime import datetime as dt
    activities = db.scalars(
        select(GarminActivity).where(
            GarminActivity.athlete_id == athlete_id,
            GarminActivity.started_at >= dt.combine(start, dt.min.time()),
            GarminActivity.started_at <= dt.combine(end, dt.max.time()),
        ).order_by(GarminActivity.started_at)
    ).all()

    total_sessions = len(activities)
    sport_agg: dict[str, dict] = defaultdict(lambda: {"count": 0, "duration_min": 0, "distance_km": 0.0})
    total_duration_min = 0
    total_distance_km = 0.0
    easy_count = 0
    moderate_count = 0
    hard_count = 0
    total_strain = 0.0

    for a in activities:
        sport_key = a.sport_type or "generic"
        mapping = SPORT_TYPE_MAPPINGS.get(sport_key, SPORT_TYPE_MAPPINGS.get("generic", {"label": "Actividad", "color": "#64748b"}))
        label = mapping["label"]
        dur = (a.moving_time_seconds or 0) / 60
        dist = (a.distance_m or 0) / 1000
        sport_agg[label]["count"] += 1
        sport_agg[label]["duration_min"] += dur
        sport_agg[label]["distance_km"] += dist
        sport_agg[label].setdefault("sport", label)
        total_duration_min += dur
        total_distance_km += dist

        # TSS-based strain
        if a.tss:
            total_strain += a.tss

        # Intensity classification by average HR or TSS
        if a.tss is not None:
            if a.tss < 50:
                easy_count += 1
            elif a.tss < 100:
                moderate_count += 1
            else:
                hard_count += 1
        elif a.average_heartrate:
            if a.average_heartrate < 140:
                easy_count += 1
            elif a.average_heartrate < 160:
                moderate_count += 1
            else:
                hard_count += 1
        else:
            easy_count += 1

    by_sport = []
    for label, data in sorted(sport_agg.items(), key=lambda x: -x[1]["count"]):
        by_sport.append({
            "sport": label,
            "count": data["count"],
            "duration_min": round(data["duration_min"], 1),
            "distance_km": round(data["distance_km"], 1),
        })

    total_int = easy_count + moderate_count + hard_count
    intensity_distribution = {
        "easy_pct": round(easy_count / total_int * 100) if total_int else 0,
        "moderate_pct": round(moderate_count / total_int * 100) if total_int else 0,
        "hard_pct": round(hard_count / total_int * 100) if total_int else 0,
    }

    # Simple load status
    if total_sessions == 0:
        load_status = "sin_datos"
    elif total_strain > 0:
        if total_strain > 600:
            load_status = "sobrecarga"
        elif total_strain > 350:
            load_status = "optima"
        elif total_strain > 150:
            load_status = "mantenimiento"
        else:
            load_status = "baja"
    else:
        load_status = "sin_tss"

    return {
        "total_sessions": total_sessions,
        "by_sport": by_sport,
        "intensity_distribution": intensity_distribution,
        "load_status": load_status,
        "total_duration_min": round(total_duration_min, 1),
        "total_distance_km": round(total_distance_km, 1),
        "total_strain": round(total_strain, 1),
    }


# ── Sleep Section ────────────────────────────────────────────────

def _build_sleep(db: Session, athlete_id: int, start: date, end: date, prev_start: date, prev_end: date) -> dict:
    samples = db.scalars(
        select(HealthSample).where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date >= start,
            HealthSample.sample_date <= end,
        ).order_by(HealthSample.sample_date)
    ).all()

    sleep_hours_list = []
    deep_pcts = []
    rem_pcts = []

    for s in samples:
        if s.sleep_seconds and s.sleep_seconds > 0:
            hours = s.sleep_seconds / 3600
            sleep_hours_list.append(hours)
            total = s.sleep_seconds
            if s.deep_sleep_seconds is not None:
                deep_pcts.append(s.deep_sleep_seconds / total * 100)
            if s.rem_sleep_seconds is not None:
                rem_pcts.append(s.rem_sleep_seconds / total * 100)

    avg_hours = _safe_round(sum(sleep_hours_list) / len(sleep_hours_list)) if sleep_hours_list else None
    avg_deep_pct = _safe_round(sum(deep_pcts) / len(deep_pcts)) if deep_pcts else None
    avg_rem_pct = _safe_round(sum(rem_pcts) / len(rem_pcts)) if rem_pcts else None

    # Consistency: std deviation of sleep hours → score 0-100
    consistency_score = None
    if len(sleep_hours_list) >= 3:
        mean = sum(sleep_hours_list) / len(sleep_hours_list)
        variance = sum((h - mean) ** 2 for h in sleep_hours_list) / len(sleep_hours_list)
        std = variance ** 0.5
        # Lower std → higher consistency. std of 0 → 100, std of 2+ → 0
        consistency_score = max(0, min(100, round(100 - std * 50)))

    # Debt: target 8h, accumulate shortfall
    debt_hours = None
    if sleep_hours_list:
        debt_hours = _safe_round(sum(max(0, 8.0 - h) for h in sleep_hours_list))

    # Previous period for trend
    prev_samples = db.scalars(
        select(HealthSample).where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date >= prev_start,
            HealthSample.sample_date <= prev_end,
        )
    ).all()
    prev_hours = [s.sleep_seconds / 3600 for s in prev_samples if s.sleep_seconds and s.sleep_seconds > 0]
    prev_avg = (sum(prev_hours) / len(prev_hours)) if prev_hours else None
    trend = _trend(avg_hours, prev_avg)

    return {
        "avg_hours": avg_hours,
        "avg_deep_pct": avg_deep_pct,
        "avg_rem_pct": avg_rem_pct,
        "consistency_score": consistency_score,
        "debt_hours": debt_hours,
        "trend": trend,
    }


# ── Vitals Section ───────────────────────────────────────────────

def _build_vitals(db: Session, athlete_id: int, start: date, end: date, prev_start: date, prev_end: date) -> dict:
    samples = db.scalars(
        select(HealthSample).where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date >= start,
            HealthSample.sample_date <= end,
        )
    ).all()

    rhr_vals = [s.resting_hr for s in samples if s.resting_hr is not None]
    hrv_vals = [s.hrv_sdnn for s in samples if s.hrv_sdnn is not None]
    spo2_vals = [s.spo2 for s in samples if s.spo2 is not None]

    avg_rhr = _safe_round(sum(rhr_vals) / len(rhr_vals)) if rhr_vals else None
    avg_hrv = _safe_round(sum(hrv_vals) / len(hrv_vals)) if hrv_vals else None
    avg_spo2 = _safe_round(sum(spo2_vals) / len(spo2_vals)) if spo2_vals else None

    # Previous period
    prev_samples = db.scalars(
        select(HealthSample).where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date >= prev_start,
            HealthSample.sample_date <= prev_end,
        )
    ).all()
    prev_rhr = [s.resting_hr for s in prev_samples if s.resting_hr is not None]
    prev_hrv = [s.hrv_sdnn for s in prev_samples if s.hrv_sdnn is not None]
    prev_avg_rhr = (sum(prev_rhr) / len(prev_rhr)) if prev_rhr else None
    prev_avg_hrv = (sum(prev_hrv) / len(prev_hrv)) if prev_hrv else None

    return {
        "avg_rhr": avg_rhr,
        "rhr_trend": _trend_inverted(avg_rhr, prev_avg_rhr),
        "avg_hrv": avg_hrv,
        "hrv_trend": _trend(avg_hrv, prev_avg_hrv),
        "avg_spo2": avg_spo2,
    }


# ── Behaviors Section ────────────────────────────────────────────

def _build_behaviors(db: Session, athlete_id: int, start: date, end: date) -> dict:
    entries = db.scalars(
        select(BehaviorJournalEntry).where(
            BehaviorJournalEntry.athlete_id == athlete_id,
            BehaviorJournalEntry.entry_date >= start,
            BehaviorJournalEntry.entry_date <= end,
        )
    ).all()

    total_logged_days = len(entries)
    counts: dict[str, int] = {}
    for entry in entries:
        for key in BEHAVIOR_KEYS:
            val = getattr(entry, key, None)
            if val is not None and val is not False and val != 0:
                counts[key] = counts.get(key, 0) + 1

    top_adherent = []
    for key, days in sorted(counts.items(), key=lambda x: -x[1])[:5]:
        top_adherent.append({
            "behavior": BEHAVIOR_LABELS.get(key, key),
            "emoji": BEHAVIOR_EMOJIS.get(key, "\U0001F4CA"),
            "days": days,
        })

    # Top correlations from cache
    top_pos = None
    top_neg = None
    corrs = db.scalars(
        select(BehaviorCorrelation).where(
            BehaviorCorrelation.athlete_id == athlete_id,
        ).order_by(BehaviorCorrelation.effect_pct.desc())
    ).all()

    for c in corrs:
        if c.effect_direction == "positive" and c.confidence in ("medium", "high") and top_pos is None:
            top_pos = {
                "behavior": BEHAVIOR_LABELS.get(c.behavior_key, c.behavior_key),
                "emoji": BEHAVIOR_EMOJIS.get(c.behavior_key, "\U0001F4CA"),
                "effect": f"+{round(c.effect_pct, 1)}% {c.outcome_metric}",
            }
        if c.effect_direction == "negative" and c.confidence in ("medium", "high") and top_neg is None:
            top_neg = {
                "behavior": BEHAVIOR_LABELS.get(c.behavior_key, c.behavior_key),
                "emoji": BEHAVIOR_EMOJIS.get(c.behavior_key, "\U0001F4CA"),
                "effect": f"{round(c.effect_pct, 1)}% {c.outcome_metric}",
            }

    return {
        "total_logged_days": total_logged_days,
        "top_adherent": top_adherent,
        "top_positive_correlation": top_pos,
        "top_negative_correlation": top_neg,
    }


# ── Nutrition Section ────────────────────────────────────────────

def _build_nutrition(db: Session, athlete_id: int, start: date, end: date) -> dict:
    logs = db.scalars(
        select(NutritionLog).where(
            NutritionLog.athlete_id == athlete_id,
            NutritionLog.log_date >= start,
            NutritionLog.log_date <= end,
        )
    ).all()

    days_logged = len(logs)
    if not logs:
        return {
            "avg_calories": None, "avg_carbs": None, "avg_protein": None,
            "avg_hydration": None, "days_logged": 0,
        }

    cals = [l.calories_kcal for l in logs if l.calories_kcal is not None]
    carbs = [l.carbs_g for l in logs if l.carbs_g is not None]
    protein = [l.protein_g for l in logs if l.protein_g is not None]
    hydration = [l.hydration_l for l in logs if l.hydration_l is not None]

    return {
        "avg_calories": _safe_round(sum(cals) / len(cals)) if cals else None,
        "avg_carbs": _safe_round(sum(carbs) / len(carbs)) if carbs else None,
        "avg_protein": _safe_round(sum(protein) / len(protein)) if protein else None,
        "avg_hydration": _safe_round(sum(hydration) / len(hydration)) if hydration else None,
        "days_logged": days_logged,
    }


# ── Highlights ───────────────────────────────────────────────────

def _generate_highlights(
    recovery: dict, training: dict, sleep: dict, vitals: dict, behaviors: dict,
    prev_recovery_avg: float | None = None,
    prev_sleep_avg: float | None = None,
) -> list[str]:
    """Generate top 3 notable highlights in Spanish."""
    highlights: list[str] = []

    # Recovery trend
    if recovery["avg_score"] is not None:
        if recovery["trend"] == "improving":
            pct = _pct_change(recovery["avg_score"], prev_recovery_avg)
            if pct:
                highlights.append(f"Tu recuperacion mejoro un {abs(pct)}% respecto al periodo anterior")
            else:
                highlights.append("Tu recuperacion muestra una tendencia positiva")
        elif recovery["trend"] == "declining":
            highlights.append("Tu recuperacion ha bajado respecto al periodo anterior. Prioriza el descanso")

    # HRV trend
    if vitals["avg_hrv"] is not None:
        if vitals["hrv_trend"] == "improving":
            highlights.append("Tu HRV mejoro, senal de buena adaptacion al entrenamiento")
        elif vitals["hrv_trend"] == "declining":
            highlights.append("Tu HRV ha descendido. Considera reducir la carga")

    # Sleep
    if sleep["avg_hours"] is not None:
        if sleep["avg_hours"] < 7:
            highlights.append(f"Media de sueno: {sleep['avg_hours']}h. Intenta alcanzar 7-8h")
        elif sleep["avg_hours"] >= 8:
            highlights.append(f"Excelente media de sueno: {sleep['avg_hours']}h")

    # Training volume
    if training["total_sessions"] > 0:
        highlights.append(
            f"{training['total_sessions']} sesiones completadas, "
            f"{training['total_duration_min']:.0f} min totales"
        )

    # Behavior consistency
    if behaviors["total_logged_days"] >= 5:
        highlights.append(
            f"Registraste habitos {behaviors['total_logged_days']} dias. Gran consistencia"
        )

    # Nutrition
    # (skipped if no data)

    return highlights[:3]


# ── Public API ───────────────────────────────────────────────────

def generate_weekly_report(db: Session, athlete_id: int, week_start_date: date | None = None) -> dict:
    """Generate weekly performance assessment."""
    start, end = _get_week_bounds(week_start_date)
    prev_start = start - timedelta(days=7)
    prev_end = start - timedelta(days=1)

    recovery = _build_recovery(db, athlete_id, start, end, prev_start, prev_end)
    training = _build_training(db, athlete_id, start, end)
    sleep = _build_sleep(db, athlete_id, start, end, prev_start, prev_end)
    vitals = _build_vitals(db, athlete_id, start, end, prev_start, prev_end)
    behaviors = _build_behaviors(db, athlete_id, start, end)
    nutrition = _build_nutrition(db, athlete_id, start, end)

    # Previous period recovery avg for highlights
    prev_scores = []
    pday = prev_start
    while pday <= prev_end:
        try:
            r = compute_recovery_score(db, athlete_id, pday)
            s = r.get("score")
            if s is not None:
                prev_scores.append(s)
        except Exception:
            pass
        pday += timedelta(days=1)
    prev_recovery_avg = (sum(prev_scores) / len(prev_scores)) if prev_scores else None

    highlights = _generate_highlights(recovery, training, sleep, vitals, behaviors, prev_recovery_avg)

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat(), "type": "weekly"},
        "summary": {
            "avg_recovery": recovery["avg_score"],
            "total_strain": training["total_strain"],
            "avg_sleep_hours": sleep["avg_hours"],
            "total_activities": training["total_sessions"],
            "total_duration_min": training["total_duration_min"],
            "total_distance_km": training["total_distance_km"],
        },
        "recovery": recovery,
        "training": training,
        "sleep": sleep,
        "vitals": vitals,
        "behaviors": behaviors,
        "nutrition": nutrition,
        "highlights": highlights,
    }


def generate_monthly_report(db: Session, athlete_id: int, year_month: str | None = None) -> dict:
    """Generate monthly performance assessment with week-over-week comparisons."""
    start, end = _get_month_bounds(year_month)
    # Previous month
    prev_end = start - timedelta(days=1)
    prev_start = prev_end.replace(day=1)

    recovery = _build_recovery(db, athlete_id, start, end, prev_start, prev_end)
    training = _build_training(db, athlete_id, start, end)
    sleep = _build_sleep(db, athlete_id, start, end, prev_start, prev_end)
    vitals = _build_vitals(db, athlete_id, start, end, prev_start, prev_end)
    behaviors = _build_behaviors(db, athlete_id, start, end)
    nutrition = _build_nutrition(db, athlete_id, start, end)

    # Previous month for comparisons
    prev_training = _build_training(db, athlete_id, prev_start, prev_end)
    prev_sleep_data = _build_sleep(db, athlete_id, prev_start, prev_end, prev_start - timedelta(days=30), prev_start - timedelta(days=1))
    prev_vitals = _build_vitals(db, athlete_id, prev_start, prev_end, prev_start - timedelta(days=30), prev_start - timedelta(days=1))

    prev_recovery_avg = None
    prev_scores = []
    pday = prev_start
    while pday <= prev_end:
        try:
            r = compute_recovery_score(db, athlete_id, pday)
            s = r.get("score")
            if s is not None:
                prev_scores.append(s)
        except Exception:
            pass
        pday += timedelta(days=1)
    if prev_scores:
        prev_recovery_avg = sum(prev_scores) / len(prev_scores)

    highlights = _generate_highlights(recovery, training, sleep, vitals, behaviors, prev_recovery_avg)

    # Week-over-week breakdown
    weekly_breakdown = []
    week_start = start
    while week_start <= end:
        week_end = min(week_start + timedelta(days=6), end)
        wt = _build_training(db, athlete_id, week_start, week_end)
        weekly_breakdown.append({
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "sessions": wt["total_sessions"],
            "duration_min": wt["total_duration_min"],
            "strain": wt["total_strain"],
        })
        week_start = week_end + timedelta(days=1)

    month_comparison = {
        "recovery_change_pct": _pct_change(recovery["avg_score"], prev_recovery_avg),
        "sessions_change": (training["total_sessions"] - prev_training["total_sessions"]) if prev_training else None,
        "sleep_change_pct": _pct_change(sleep["avg_hours"], prev_sleep_data.get("avg_hours")),
        "hrv_change_pct": _pct_change(vitals["avg_hrv"], prev_vitals.get("avg_hrv")),
        "rhr_change_pct": _pct_change(vitals["avg_rhr"], prev_vitals.get("avg_rhr")),
    }

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat(), "type": "monthly"},
        "summary": {
            "avg_recovery": recovery["avg_score"],
            "total_strain": training["total_strain"],
            "avg_sleep_hours": sleep["avg_hours"],
            "total_activities": training["total_sessions"],
            "total_duration_min": training["total_duration_min"],
            "total_distance_km": training["total_distance_km"],
        },
        "recovery": recovery,
        "training": training,
        "sleep": sleep,
        "vitals": vitals,
        "behaviors": behaviors,
        "nutrition": nutrition,
        "highlights": highlights,
        "weekly_breakdown": weekly_breakdown,
        "month_comparison": month_comparison,
    }


def get_available_reports(db: Session, athlete_id: int) -> list[dict]:
    """Returns available report periods (weeks and months with data)."""
    # Find date range of existing data
    min_date_q = db.scalar(
        select(func.min(HealthSample.sample_date)).where(
            HealthSample.athlete_id == athlete_id,
        )
    )
    min_activity_date = db.scalar(
        select(func.min(GarminActivity.started_at)).where(
            GarminActivity.athlete_id == athlete_id,
        )
    )

    if min_date_q is None and min_activity_date is None:
        return []

    earliest = min_date_q
    if min_activity_date:
        act_date = min_activity_date.date() if hasattr(min_activity_date, "date") else min_activity_date
        if earliest is None or act_date < earliest:
            earliest = act_date

    today = date.today()
    reports: list[dict] = []

    # Weekly reports: each completed week from earliest to last completed week
    # Find the Monday of the earliest week
    days_since_monday = earliest.weekday()
    first_monday = earliest - timedelta(days=days_since_monday)
    # Last completed week's Monday
    current_monday = today - timedelta(days=today.weekday() + 7)

    week_monday = first_monday
    while week_monday <= current_monday:
        week_sunday = week_monday + timedelta(days=6)
        reports.append({
            "type": "weekly",
            "start": week_monday.isoformat(),
            "end": week_sunday.isoformat(),
            "label": f"Semana del {week_monday.strftime('%d/%m')} al {week_sunday.strftime('%d/%m/%Y')}",
        })
        week_monday += timedelta(days=7)

    # Monthly reports: each completed month
    current = earliest.replace(day=1)
    last_complete_month = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    while current <= last_complete_month:
        if current.month == 12:
            month_end = date(current.year + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = date(current.year, current.month + 1, 1) - timedelta(days=1)
        month_names = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                       "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
        reports.append({
            "type": "monthly",
            "start": current.isoformat(),
            "end": month_end.isoformat(),
            "year_month": f"{current.year}-{current.month:02d}",
            "label": f"{month_names[current.month - 1]} {current.year}",
        })
        if current.month == 12:
            current = date(current.year + 1, 1, 1)
        else:
            current = date(current.year, current.month + 1, 1)

    # Reverse so most recent first
    reports.reverse()
    return reports
