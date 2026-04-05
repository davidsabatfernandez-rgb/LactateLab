"""Sleep analytics service — consistency, debt, efficiency, performance score."""

from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.health_sample import HealthSample

TARGET_SLEEP_HOURS = 8.0


def _get_samples(db: Session, athlete_id: int, start_date: date, end_date: date) -> list[HealthSample]:
    """Fetch HealthSample rows for [start_date, end_date] ordered by date asc."""
    return list(
        db.scalars(
            select(HealthSample)
            .where(
                HealthSample.athlete_id == athlete_id,
                HealthSample.sample_date >= start_date,
                HealthSample.sample_date <= end_date,
            )
            .order_by(HealthSample.sample_date.asc())
        ).all()
    )


def _safe_div(num: float, den: float, default: float = 0.0) -> float:
    return num / den if den else default


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _seconds_to_hours(seconds: int | None) -> float:
    if seconds is None or seconds < 0:
        return 0.0
    return seconds / 3600.0


# ── Performance Score (0-100) ────────────────────────────────────

def _duration_score(total_hours: float) -> float:
    """40% weight. 8h = 100, <6h = 0, linear."""
    if total_hours >= TARGET_SLEEP_HOURS:
        return 100.0
    if total_hours <= 6.0:
        return 0.0
    return (total_hours - 6.0) / 2.0 * 100.0


def _deep_score(deep_pct: float) -> float:
    """25% weight. 15-20% ideal = 100, <10% = 0."""
    if deep_pct >= 15.0:
        return min(100.0, 100.0)
    if deep_pct <= 10.0:
        return 0.0
    return (deep_pct - 10.0) / 5.0 * 100.0


def _rem_score(rem_pct: float) -> float:
    """20% weight. 20-25% ideal = 100, <15% = 0."""
    if rem_pct >= 20.0:
        return 100.0
    if rem_pct <= 15.0:
        return 0.0
    return (rem_pct - 15.0) / 5.0 * 100.0


def _efficiency_score(efficiency_pct: float) -> float:
    """15% weight. 95%+ = 100, <80% = 0."""
    if efficiency_pct >= 95.0:
        return 100.0
    if efficiency_pct <= 80.0:
        return 0.0
    return (efficiency_pct - 80.0) / 15.0 * 100.0


def _compute_performance_score(total_hours: float, deep_pct: float, rem_pct: float, efficiency_pct: float) -> int:
    raw = (
        _duration_score(total_hours) * 0.40
        + _deep_score(deep_pct) * 0.25
        + _rem_score(rem_pct) * 0.20
        + _efficiency_score(efficiency_pct) * 0.15
    )
    return int(_clamp(round(raw), 0, 100))


# ── Single-night analytics ───────────────────────────────────────

def _analyze_sample(sample: HealthSample, baseline_samples: list[HealthSample] | None = None) -> dict[str, Any]:
    """Build analytics dict for a single HealthSample."""
    total_sec = sample.sleep_seconds or 0
    deep_sec = sample.deep_sleep_seconds or 0
    rem_sec = sample.rem_sleep_seconds or 0
    core_sec = sample.core_sleep_seconds or 0
    awake_sec = sample.awake_seconds or 0

    total_hours = _seconds_to_hours(total_sec)
    deep_hours = _seconds_to_hours(deep_sec)
    rem_hours = _seconds_to_hours(rem_sec)
    light_hours = _seconds_to_hours(core_sec)
    awake_hours = _seconds_to_hours(awake_sec)

    # Percentages relative to total
    deep_pct = _safe_div(deep_sec, total_sec) * 100 if total_sec else 0.0
    rem_pct = _safe_div(rem_sec, total_sec) * 100 if total_sec else 0.0
    light_pct = _safe_div(core_sec, total_sec) * 100 if total_sec else 0.0
    awake_pct = _safe_div(awake_sec, total_sec) * 100 if total_sec else 0.0

    # Efficiency: (total - awake) / total
    efficiency_pct = _safe_div(total_sec - awake_sec, total_sec) * 100 if total_sec else 0.0

    performance = _compute_performance_score(total_hours, deep_pct, rem_pct, efficiency_pct)

    # Baseline comparison (30-day)
    vs_baseline: dict[str, float | None] = {"total_vs_avg_pct": None, "deep_vs_avg_pct": None, "rem_vs_avg_pct": None}
    if baseline_samples:
        valid = [s for s in baseline_samples if s.sleep_seconds and s.sleep_seconds > 0]
        if valid:
            avg_total = sum(s.sleep_seconds for s in valid) / len(valid)  # type: ignore[arg-type]
            vs_baseline["total_vs_avg_pct"] = round(_safe_div(total_sec - avg_total, avg_total) * 100, 1) if avg_total else None

            deep_valid = [s for s in valid if s.deep_sleep_seconds is not None]
            if deep_valid:
                avg_deep = sum(s.deep_sleep_seconds for s in deep_valid) / len(deep_valid)  # type: ignore[arg-type]
                vs_baseline["deep_vs_avg_pct"] = round(_safe_div(deep_sec - avg_deep, avg_deep) * 100, 1) if avg_deep else None

            rem_valid = [s for s in valid if s.rem_sleep_seconds is not None]
            if rem_valid:
                avg_rem = sum(s.rem_sleep_seconds for s in rem_valid) / len(rem_valid)  # type: ignore[arg-type]
                vs_baseline["rem_vs_avg_pct"] = round(_safe_div(rem_sec - avg_rem, avg_rem) * 100, 1) if avg_rem else None

    return {
        "date": sample.sample_date.isoformat(),
        "total_hours": round(total_hours, 2),
        "stages": {
            "deep_hours": round(deep_hours, 2),
            "deep_pct": round(deep_pct, 1),
            "rem_hours": round(rem_hours, 2),
            "rem_pct": round(rem_pct, 1),
            "light_hours": round(light_hours, 2),
            "light_pct": round(light_pct, 1),
            "awake_hours": round(awake_hours, 2),
            "awake_pct": round(awake_pct, 1),
        },
        "efficiency_pct": round(efficiency_pct, 1),
        "performance_score": performance,
        "vs_baseline": vs_baseline,
    }


# ── Public API ───────────────────────────────────────────────────

def compute_sleep_analytics(db: Session, athlete_id: int, target_date: date | None = None) -> dict[str, Any]:
    """Comprehensive sleep analysis for a single night."""
    d = target_date or date.today()

    # Fetch target sample
    sample = db.scalar(
        select(HealthSample).where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date == d,
        )
    )

    # 30-day baseline for comparison
    baseline_start = d - timedelta(days=30)
    baseline_samples = _get_samples(db, athlete_id, baseline_start, d - timedelta(days=1))

    # 7-day window for consistency & debt
    week_start = d - timedelta(days=6)
    week_samples = _get_samples(db, athlete_id, week_start, d)

    if not sample or not sample.sleep_seconds:
        return {
            "date": d.isoformat(),
            "total_hours": None,
            "stages": None,
            "efficiency_pct": None,
            "performance_score": None,
            "consistency": _compute_consistency(week_samples),
            "debt": _compute_debt(week_samples),
            "vs_baseline": {"total_vs_avg_pct": None, "deep_vs_avg_pct": None, "rem_vs_avg_pct": None},
        }

    result = _analyze_sample(sample, baseline_samples)
    result["consistency"] = _compute_consistency(week_samples)
    result["debt"] = _compute_debt(week_samples)
    return result


def _compute_consistency(week_samples: list[HealthSample]) -> dict[str, Any]:
    """Consistency metrics over a 7-day window."""
    durations = [s.sleep_seconds for s in week_samples if s.sleep_seconds and s.sleep_seconds > 0]
    if len(durations) < 2:
        return {"score": None, "avg_bedtime": None, "avg_waketime": None, "variability_min": None}

    mean_dur = sum(durations) / len(durations)
    variance = sum((d - mean_dur) ** 2 for d in durations) / len(durations)
    std_dev_sec = math.sqrt(variance)
    variability_min = round(std_dev_sec / 60.0, 1)

    # Score: low variability = high consistency. < 15 min std = 100, > 60 min = 0
    if variability_min <= 15:
        score = 100
    elif variability_min >= 60:
        score = 0
    else:
        score = int(round(100 - (variability_min - 15) / 45 * 100))

    return {
        "score": _clamp(score, 0, 100),
        "avg_bedtime": None,  # Not available from HealthSample
        "avg_waketime": None,
        "variability_min": variability_min,
    }


def _compute_debt(week_samples: list[HealthSample]) -> dict[str, Any]:
    """Sleep debt: sum of deficit vs 8h target over past 7 nights."""
    target_sec = TARGET_SLEEP_HOURS * 3600
    daily_deficits: list[float] = []
    for s in week_samples:
        actual = s.sleep_seconds or 0
        deficit = max(0, target_sec - actual)
        daily_deficits.append(deficit)

    accumulated_hours = round(sum(daily_deficits) / 3600.0, 1) if daily_deficits else 0.0

    # Trend: compare first half vs second half of the week
    if len(daily_deficits) >= 4:
        mid = len(daily_deficits) // 2
        first_avg = sum(daily_deficits[:mid]) / mid
        second_avg = sum(daily_deficits[mid:]) / (len(daily_deficits) - mid)
        if second_avg < first_avg * 0.85:
            trend = "improving"
        elif second_avg > first_avg * 1.15:
            trend = "worsening"
        else:
            trend = "stable"
    else:
        trend = "stable"

    return {
        "accumulated_hours": accumulated_hours,
        "trend": trend,
    }


def compute_sleep_history(db: Session, athlete_id: int, days: int = 14) -> list[dict[str, Any]]:
    """Returns list of nightly sleep analytics for the past N days."""
    end_date = date.today()
    start_date = end_date - timedelta(days=days - 1)

    # 30-day baseline for each entry
    baseline_start = end_date - timedelta(days=30)
    all_samples = _get_samples(db, athlete_id, baseline_start, end_date)

    # Index by date
    by_date: dict[date, HealthSample] = {s.sample_date: s for s in all_samples}

    result = []
    for i in range(days):
        d = start_date + timedelta(days=i)
        sample = by_date.get(d)
        if sample and sample.sleep_seconds and sample.sleep_seconds > 0:
            baseline = [s for s in all_samples if s.sample_date < d and s.sample_date >= d - timedelta(days=30)]
            entry = _analyze_sample(sample, baseline)
            result.append(entry)

    return result


def compute_sleep_summary(db: Session, athlete_id: int, days: int = 7) -> dict[str, Any]:
    """Returns summary stats for the period."""
    end_date = date.today()
    start_date = end_date - timedelta(days=days - 1)
    samples = _get_samples(db, athlete_id, start_date, end_date)

    valid = [s for s in samples if s.sleep_seconds and s.sleep_seconds > 0]
    if not valid:
        return {
            "avg_hours": None,
            "avg_efficiency": None,
            "avg_deep_pct": None,
            "avg_rem_pct": None,
            "consistency_score": None,
            "total_debt_hours": 0.0,
            "performance_trend": "stable",
            "days_with_data": 0,
        }

    # Averages
    total_hours_list = [_seconds_to_hours(s.sleep_seconds) for s in valid]
    avg_hours = round(sum(total_hours_list) / len(total_hours_list), 1)

    # Efficiency
    efficiencies = []
    for s in valid:
        total = s.sleep_seconds or 0
        awake = s.awake_seconds or 0
        if total > 0:
            efficiencies.append((total - awake) / total * 100)
    avg_efficiency = round(sum(efficiencies) / len(efficiencies), 1) if efficiencies else None

    # Deep %
    deep_pcts = []
    for s in valid:
        if s.deep_sleep_seconds is not None and s.sleep_seconds and s.sleep_seconds > 0:
            deep_pcts.append(s.deep_sleep_seconds / s.sleep_seconds * 100)
    avg_deep_pct = round(sum(deep_pcts) / len(deep_pcts), 1) if deep_pcts else None

    # REM %
    rem_pcts = []
    for s in valid:
        if s.rem_sleep_seconds is not None and s.sleep_seconds and s.sleep_seconds > 0:
            rem_pcts.append(s.rem_sleep_seconds / s.sleep_seconds * 100)
    avg_rem_pct = round(sum(rem_pcts) / len(rem_pcts), 1) if rem_pcts else None

    # Consistency
    consistency = _compute_consistency(samples)

    # Debt
    debt = _compute_debt(samples)

    # Performance trend
    if len(valid) >= 4:
        mid = len(valid) // 2
        first_scores = []
        second_scores = []
        for s in valid[:mid]:
            a = _analyze_sample(s)
            first_scores.append(a["performance_score"])
        for s in valid[mid:]:
            a = _analyze_sample(s)
            second_scores.append(a["performance_score"])
        first_avg = sum(first_scores) / len(first_scores) if first_scores else 0
        second_avg = sum(second_scores) / len(second_scores) if second_scores else 0
        if second_avg > first_avg + 5:
            perf_trend = "improving"
        elif second_avg < first_avg - 5:
            perf_trend = "declining"
        else:
            perf_trend = "stable"
    else:
        perf_trend = "stable"

    return {
        "avg_hours": avg_hours,
        "avg_efficiency": avg_efficiency,
        "avg_deep_pct": avg_deep_pct,
        "avg_rem_pct": avg_rem_pct,
        "consistency_score": consistency.get("score"),
        "total_debt_hours": debt["accumulated_hours"],
        "performance_trend": perf_trend,
        "days_with_data": len(valid),
    }
