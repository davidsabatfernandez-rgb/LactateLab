"""Strain Coach — daily strain scoring (0-21 scale) and recovery-based targets."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import func as sa_func, select
from sqlalchemy.orm import Session

from app.models.garmin_activity import GarminActivity
from app.models.health_sample import HealthSample
from app.models.planned_session import PlannedSession
from app.services.athlete_health import compute_recovery_score

# Default baseline active energy (kcal) when no personal baseline is available
DEFAULT_BASELINE_ENERGY = 500.0
BASELINE_WINDOW_DAYS = 30
MAX_STRAIN = 21


def _get_athlete_baseline_energy(db: Session, athlete_id: int, target_date: date) -> float:
    """Rolling 30-day average of active_energy_kcal for the athlete."""
    start = target_date - timedelta(days=BASELINE_WINDOW_DAYS)
    avg = db.scalar(
        select(sa_func.avg(HealthSample.active_energy_kcal)).where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date >= start,
            HealthSample.sample_date < target_date,
            HealthSample.active_energy_kcal.isnot(None),
            HealthSample.active_energy_kcal > 0,
        )
    )
    return float(avg) if avg else DEFAULT_BASELINE_ENERGY


def _activity_intensity_factor(activity: GarminActivity) -> float:
    """Return 0.0-1.0 intensity factor based on heart rate relative to estimated max."""
    if activity.average_heartrate and activity.max_heartrate:
        ratio = activity.average_heartrate / activity.max_heartrate
        return min(1.0, max(0.0, ratio))
    # Fallback: moderate intensity
    return 0.5


def compute_daily_strain(db: Session, athlete_id: int, target_date: date | None = None) -> dict[str, Any]:
    """Compute daily strain score (0-21 scale).

    Returns {score, zone, zone_label, components, target_date}.
    """
    if target_date is None:
        target_date = date.today()

    # 1. Get health sample for the day
    sample = db.scalar(
        select(HealthSample).where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date == target_date,
        )
    )

    active_energy = float(sample.active_energy_kcal) if sample and sample.active_energy_kcal else 0.0
    exercise_minutes = int(sample.exercise_minutes) if sample and sample.exercise_minutes else 0
    steps = int(sample.steps) if sample and sample.steps else 0

    # 2. Get activities for the day
    day_start = target_date
    day_end = target_date + timedelta(days=1)
    activities = db.scalars(
        select(GarminActivity).where(
            GarminActivity.athlete_id == athlete_id,
            GarminActivity.started_at >= day_start.isoformat(),
            GarminActivity.started_at < day_end.isoformat(),
        )
    ).all()

    # 3. Base strain from active energy
    baseline_energy = _get_athlete_baseline_energy(db, athlete_id, target_date)
    energy_strain = (active_energy / baseline_energy) * 10 if baseline_energy > 0 else 0
    energy_strain = min(energy_strain, 15.0)

    # 4. Exercise bonus (1-6 based on duration and intensity)
    exercise_bonus = 0.0
    if exercise_minutes > 0:
        # Duration component: 0-3 points
        duration_pts = min(3.0, exercise_minutes / 30.0)  # 90 min = 3 pts

        # Intensity component from activities: 0-3 points
        if activities:
            avg_intensity = sum(_activity_intensity_factor(a) for a in activities) / len(activities)
            intensity_pts = avg_intensity * 3.0
        else:
            # No activity data, estimate from exercise minutes alone
            intensity_pts = min(1.5, exercise_minutes / 60.0)

        exercise_bonus = min(6.0, duration_pts + intensity_pts)

    # 5. Total strain
    total = min(MAX_STRAIN, energy_strain + exercise_bonus)
    total = round(total, 1)

    # 6. Determine zone
    if total >= 18:
        zone, zone_label = "overreaching", "Sobresfuerzo"
    elif total >= 14:
        zone, zone_label = "hard", "Intenso"
    elif total >= 8:
        zone, zone_label = "moderate", "Moderado"
    else:
        zone, zone_label = "light", "Ligero"

    return {
        "score": total,
        "zone": zone,
        "zone_label": zone_label,
        "components": {
            "active_energy_kcal": round(active_energy, 1),
            "energy_strain": round(energy_strain, 1),
            "exercise_minutes": exercise_minutes,
            "exercise_bonus": round(exercise_bonus, 1),
            "steps": steps,
            "activities_count": len(activities),
            "baseline_energy_kcal": round(baseline_energy, 1),
        },
        "target_date": target_date.isoformat(),
    }


def compute_strain_target(db: Session, athlete_id: int, target_date: date | None = None) -> dict[str, Any]:
    """Compute recommended strain target based on recovery score.

    Returns {target_min, target_max, zone, zone_label, recommendation, recovery_score}.
    """
    if target_date is None:
        target_date = date.today()

    recovery = compute_recovery_score(db, athlete_id, target_date)
    recovery_score = recovery.get("score")

    # Check for planned sessions today
    planned = db.scalars(
        select(PlannedSession).where(
            PlannedSession.athlete_id == athlete_id,
            PlannedSession.scheduled_date == target_date,
            PlannedSession.execution_status == "planned",
        )
    ).all()

    has_planned = len(planned) > 0
    planned_labels = [s.public_label for s in planned if s.public_label]

    if recovery_score is not None and recovery_score >= 67:
        target_min, target_max = 14, 18
        zone = "green"
        zone_label = "Dia de empujar"
        recommendation = "Recuperacion alta. Buen dia para sesiones de calidad o volumen alto."
    elif recovery_score is not None and recovery_score >= 34:
        target_min, target_max = 8, 13
        zone = "yellow"
        zone_label = "Dia moderado"
        recommendation = "Recuperacion moderada. Manten intensidad media, evita sobreesfuerzos."
    elif recovery_score is not None:
        target_min, target_max = 0, 7
        zone = "red"
        zone_label = "Dia de descanso"
        recommendation = "Recuperacion baja. Prioriza descanso activo o sesion suave."
    else:
        # No recovery score available — default to moderate
        target_min, target_max = 8, 13
        zone = "yellow"
        zone_label = "Dia moderado"
        recommendation = "Sin datos de recuperacion. Objetivo moderado por defecto."

    if has_planned:
        recommendation += f" Sesion planificada: {', '.join(planned_labels[:2])}."

    return {
        "target_min": target_min,
        "target_max": target_max,
        "zone": zone,
        "zone_label": zone_label,
        "recommendation": recommendation,
        "recovery_score": recovery_score,
        "has_planned_session": has_planned,
        "target_date": target_date.isoformat(),
    }


def get_strain_history(db: Session, athlete_id: int, days: int = 7) -> list[dict[str, Any]]:
    """Return daily strain scores for the last N days."""
    today = date.today()
    result = []
    for i in range(days):
        d = today - timedelta(days=i)
        strain = compute_daily_strain(db, athlete_id, d)
        result.append({
            "date": d.isoformat(),
            "score": strain["score"],
            "zone": strain["zone"],
            "zone_label": strain["zone_label"],
        })
    result.reverse()
    return result
