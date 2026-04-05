"""Sleep Coach — personalized sleep need, performance scoring, and history."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import func as sa_func, select
from sqlalchemy.orm import Session

from app.models.health_sample import HealthSample

# Defaults
DEFAULT_BASE_SLEEP_HOURS = 8.0
DEBT_LOOKBACK_DAYS = 7


def _get_sample(db: Session, athlete_id: int, target_date: date) -> HealthSample | None:
    return db.scalar(
        select(HealthSample).where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date == target_date,
        )
    )


def _seconds_to_hours(s: int | None) -> float:
    if s is None or s <= 0:
        return 0.0
    return round(s / 3600, 2)


def _compute_sleep_debt(db: Session, athlete_id: int, target_date: date, base_need_hours: float) -> float:
    """Accumulated sleep deficit over the past 7 days (positive = debt)."""
    total_deficit = 0.0
    for i in range(1, DEBT_LOOKBACK_DAYS + 1):
        d = target_date - timedelta(days=i)
        sample = _get_sample(db, athlete_id, d)
        actual = _seconds_to_hours(sample.sleep_seconds if sample else None)
        if actual > 0:
            total_deficit += max(0, base_need_hours - actual)
    return round(total_deficit, 2)


def _get_nap_minutes(db: Session, athlete_id: int, target_date: date) -> int:
    """Get nap minutes from behavior journal if available."""
    from app.models.behavior_journal import BehaviorJournalEntry
    entry = db.scalar(
        select(BehaviorJournalEntry).where(
            BehaviorJournalEntry.athlete_id == athlete_id,
            BehaviorJournalEntry.entry_date == target_date,
        )
    )
    if entry and entry.nap and isinstance(entry.nap, int):
        return entry.nap
    return 0


def _strain_sleep_adjustment(db: Session, athlete_id: int, target_date: date) -> int:
    """Extra sleep minutes needed based on previous day's strain."""
    from app.services.strain_coach import compute_daily_strain
    prev_day = target_date - timedelta(days=1)
    try:
        strain = compute_daily_strain(db, athlete_id, prev_day)
        score = strain.get("score", 0) or 0
    except Exception:
        return 0

    if score >= 18:
        return 60  # overreaching: +60min
    elif score >= 14:
        return 30  # hard: +30min
    elif score >= 8:
        return 15  # moderate: +15min
    return 0


def compute_sleep_need(db: Session, athlete_id: int, target_date: date | None = None) -> dict[str, Any]:
    """Compute personalized sleep need for the target date.

    Returns {base_need_hours, strain_adjustment_min, debt_hours, nap_credit_min,
             total_need_hours, actual_hours, deficit_hours, recommendation, target_date}.
    """
    if target_date is None:
        target_date = date.today()

    base_need = DEFAULT_BASE_SLEEP_HOURS
    strain_adj = _strain_sleep_adjustment(db, athlete_id, target_date)
    debt = _compute_sleep_debt(db, athlete_id, target_date, base_need)
    nap_credit = _get_nap_minutes(db, athlete_id, target_date)

    # Total need = base + strain adjustment + debt recovery (aim to recover 1/3 of debt per night) - nap credit
    debt_recovery_hours = min(debt, 2.0) / 3.0  # recover up to ~40min per night
    total_need = base_need + (strain_adj / 60.0) + debt_recovery_hours - (nap_credit / 60.0)
    total_need = max(6.0, round(total_need, 2))  # minimum 6h need

    # Actual sleep
    sample = _get_sample(db, athlete_id, target_date)
    actual_hours = _seconds_to_hours(sample.sleep_seconds if sample else None)
    deficit = round(total_need - actual_hours, 2) if actual_hours > 0 else None

    # Recommendation
    if actual_hours <= 0:
        recommendation = "Sin datos de sueno para hoy. Objetivo: {:.0f}h {:02.0f}min.".format(
            int(total_need), (total_need % 1) * 60
        )
    elif deficit is not None and deficit > 1.0:
        recommendation = "Deficit significativo. Intenta acostarte mas temprano esta noche."
    elif deficit is not None and deficit > 0:
        recommendation = "Cerca del objetivo. Una siesta corta puede ayudar a cerrar el deficit."
    elif debt > 3.0:
        recommendation = "Dormiste bien hoy, pero acumulas deuda de sueno. Mantente consistente."
    else:
        recommendation = "Buen descanso. Sueno alineado con tus necesidades."

    return {
        "base_need_hours": base_need,
        "strain_adjustment_min": strain_adj,
        "debt_hours": debt,
        "nap_credit_min": nap_credit,
        "total_need_hours": total_need,
        "actual_hours": actual_hours if actual_hours > 0 else None,
        "deficit_hours": deficit,
        "recommendation": recommendation,
        "target_date": target_date.isoformat(),
    }


def compute_sleep_performance(db: Session, athlete_id: int, target_date: date | None = None) -> dict[str, Any]:
    """Compute sleep performance score (0-100).

    Returns {score, efficiency_pct, consistency_score, debt_hours, breakdown, target_date}.
    """
    if target_date is None:
        target_date = date.today()

    sample = _get_sample(db, athlete_id, target_date)

    if not sample or not sample.sleep_seconds or sample.sleep_seconds <= 0:
        return {
            "score": None,
            "efficiency_pct": None,
            "consistency_score": None,
            "debt_hours": None,
            "breakdown": None,
            "target_date": target_date.isoformat(),
        }

    total_sleep_s = sample.sleep_seconds
    deep_s = sample.deep_sleep_seconds or 0
    rem_s = sample.rem_sleep_seconds or 0
    core_s = sample.core_sleep_seconds or 0
    awake_s = sample.awake_seconds or 0

    # If stages don't add up, infer light sleep
    accounted = deep_s + rem_s + core_s + awake_s
    if accounted == 0:
        # No stage breakdown available
        breakdown = None
    else:
        time_in_bed = total_sleep_s + awake_s
        breakdown = {
            "deep_pct": round(deep_s / time_in_bed * 100, 1) if time_in_bed > 0 else 0,
            "rem_pct": round(rem_s / time_in_bed * 100, 1) if time_in_bed > 0 else 0,
            "light_pct": round(core_s / time_in_bed * 100, 1) if time_in_bed > 0 else 0,
            "awake_pct": round(awake_s / time_in_bed * 100, 1) if time_in_bed > 0 else 0,
        }

    # Efficiency: sleep / time_in_bed * 100
    time_in_bed = total_sleep_s + awake_s
    efficiency = round(total_sleep_s / time_in_bed * 100, 1) if time_in_bed > 0 else 0

    # Consistency: compare total sleep to 7-day average
    start = target_date - timedelta(days=7)
    avg_sleep = db.scalar(
        select(sa_func.avg(HealthSample.sleep_seconds)).where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date >= start,
            HealthSample.sample_date < target_date,
            HealthSample.sleep_seconds.isnot(None),
            HealthSample.sleep_seconds > 0,
        )
    )
    if avg_sleep and avg_sleep > 0:
        deviation = abs(total_sleep_s - avg_sleep) / avg_sleep
        consistency = max(0, min(100, round(100 * (1 - deviation * 2))))  # 50% deviation = 0
    else:
        consistency = 50  # neutral if no baseline

    # Debt
    debt = _compute_sleep_debt(db, athlete_id, target_date, DEFAULT_BASE_SLEEP_HOURS)

    # Score: weighted composite
    # 40% duration adequacy, 30% efficiency, 20% consistency, 10% stage quality
    hours = _seconds_to_hours(total_sleep_s)
    duration_score = min(100, (hours / DEFAULT_BASE_SLEEP_HOURS) * 100)

    stage_score = 50.0  # neutral default
    if breakdown:
        # Ideal: deep ~15-20%, REM ~20-25%
        deep_ok = min(1.0, breakdown["deep_pct"] / 15.0)  # 15% deep = perfect
        rem_ok = min(1.0, breakdown["rem_pct"] / 20.0)   # 20% REM = perfect
        stage_score = (deep_ok * 50 + rem_ok * 50)

    score = round(
        duration_score * 0.40
        + efficiency * 0.30
        + consistency * 0.20
        + stage_score * 0.10
    )
    score = max(0, min(100, score))

    return {
        "score": score,
        "efficiency_pct": efficiency,
        "consistency_score": consistency,
        "debt_hours": debt,
        "breakdown": breakdown,
        "target_date": target_date.isoformat(),
    }


def get_sleep_history(db: Session, athlete_id: int, days: int = 7) -> list[dict[str, Any]]:
    """Return nightly sleep data with scores for the last N days."""
    today = date.today()
    result = []
    for i in range(days):
        d = today - timedelta(days=i)
        sample = _get_sample(db, athlete_id, d)

        if sample and sample.sleep_seconds and sample.sleep_seconds > 0:
            perf = compute_sleep_performance(db, athlete_id, d)
            result.append({
                "date": d.isoformat(),
                "sleep_hours": _seconds_to_hours(sample.sleep_seconds),
                "deep_sleep_hours": _seconds_to_hours(sample.deep_sleep_seconds),
                "rem_sleep_hours": _seconds_to_hours(sample.rem_sleep_seconds),
                "score": perf.get("score"),
                "efficiency_pct": perf.get("efficiency_pct"),
            })
        else:
            result.append({
                "date": d.isoformat(),
                "sleep_hours": None,
                "deep_sleep_hours": None,
                "rem_sleep_hours": None,
                "score": None,
                "efficiency_pct": None,
            })
    result.reverse()
    return result
