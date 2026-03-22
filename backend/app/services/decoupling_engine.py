"""Decoupling + CRI 30' engine — field-test-based threshold estimation.

Completely independent of the lactate motor (analytics.py / dynamic_threshold_engine.py).
Only used for athletes with threshold_mode='field_tests'.

Scientific basis:
- Decoupling (LT1): Coyle & Gonzalez-Alonso 2001, Friel heuristic (<5% = sub-LT1)
- CRI 30' (LT2): avg pace of well-paced 30-min TT ≈ MLSS (Borszcz 2019)
- Transfer running→cycling: LT1 −5%, LT2 −7% (Millet 2009, Hue 1998, Bijker 2001)
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models.field_test import DecouplingResult, FieldTestSnapshot, TimeTrial30Result


# ── Constants ────────────────────────────────────────────────────

DRIFT_COUPLED = 3.5       # % — below this = clearly sub-LT1
DRIFT_BORDERLINE = 5.0    # % — above this = clearly supra-LT1
PACE_CV_MAX = 8.0         # % — max CV of pace for a valid steady-state block
MIN_BLOCK_DURATION = 30.0 # min — minimum steady-state block for analysis
TEMP_FLAG_THRESHOLD = 28.0  # °C — above this we flag the result

PACING_GOOD = 3.0         # % — split diff below this = good pacing
PACING_ACCEPTABLE = 5.0   # % — split diff below this = acceptable
# Above PACING_ACCEPTABLE = invalid pacing

TRANSFER_FACTOR_LT1 = 0.95  # running → cycling LT1 (Millet 2009)
TRANSFER_FACTOR_LT2 = 0.93  # running → cycling LT2 (Hue 1998, Bijker 2001)
TRANSFER_CONFIDENCE_PENALTY = 0.85  # multiply confidence when transferring

# Confidence formula
CONF_BASE = 0.40
CONF_PER_CLEAR_TEST = 0.05
CONF_PER_BORDERLINE = 0.03
CONF_INCONSISTENCY_PENALTY = -0.05
CONF_HEAT_PENALTY = -0.03
CONF_CAP = 0.60

CONF_TT_BASE = 0.45
CONF_TT_GOOD_PACING = 0.05
CONF_TT_FIRST_TEST_PENALTY = -0.02
CONF_TT_RETEST_BONUS = 0.05
CONF_TT_HEAT_PENALTY = -0.03

# Cross-validation: LT1/LT2 ratio plausible range
RATIO_PACE_MIN = 0.80
RATIO_PACE_MAX = 0.92
RATIO_HR_MIN = 0.82
RATIO_HR_MAX = 0.93

# Recency weighting: tests older than this get reduced weight
RECENCY_HALF_LIFE_DAYS = 42


# ── Analysis functions ───────────────────────────────────────────

@dataclass
class DecouplingAnalysis:
    """Output of a decoupling analysis from raw stream data."""
    drift_pct: float
    verdict: str        # coupled | borderline | decoupled | invalid
    hr_avg: int
    hr_first_half: int
    hr_second_half: int
    pace_avg_s_per_km: float
    block_duration_min: float
    pace_cv_pct: float
    valid: bool
    invalid_reason: Optional[str] = None


def analyze_decoupling_streams(
    hr_stream: list[float],
    speed_stream: list[float],
    timestamps: list[float],
    temp_c: Optional[float] = None,
) -> DecouplingAnalysis:
    """Analyze FIT streams for cardiac decoupling.

    Args:
        hr_stream: heart rate values (bpm), one per sample
        speed_stream: speed values (m/s), one per sample
        timestamps: epoch seconds, one per sample
        temp_c: ambient temperature (°C) from Garmin weather

    Returns:
        DecouplingAnalysis with drift %, verdict, and quality metrics.
    """
    if len(hr_stream) < 20 or len(speed_stream) < 20:
        return DecouplingAnalysis(
            drift_pct=0, verdict="invalid", hr_avg=0,
            hr_first_half=0, hr_second_half=0,
            pace_avg_s_per_km=0, block_duration_min=0,
            pace_cv_pct=0, valid=False,
            invalid_reason="insufficient_data",
        )

    n = min(len(hr_stream), len(speed_stream), len(timestamps))
    hr_stream = hr_stream[:n]
    speed_stream = speed_stream[:n]
    timestamps = timestamps[:n]

    # Convert speed (m/s) to pace (s/km) — filter out zeros
    pace_stream = []
    for s in speed_stream:
        if s > 0.5:  # minimum ~1.8 km/h
            pace_stream.append(1000.0 / s)
        else:
            pace_stream.append(None)

    # Find longest steady-state block (CV of pace < PACE_CV_MAX)
    block = _find_steady_state_block(pace_stream, timestamps)
    if block is None:
        return DecouplingAnalysis(
            drift_pct=0, verdict="invalid", hr_avg=0,
            hr_first_half=0, hr_second_half=0,
            pace_avg_s_per_km=0, block_duration_min=0,
            pace_cv_pct=0, valid=False,
            invalid_reason="no_steady_state_block",
        )

    start_idx, end_idx, block_cv = block
    block_duration_s = timestamps[end_idx] - timestamps[start_idx]
    block_duration_min = block_duration_s / 60.0

    if block_duration_min < MIN_BLOCK_DURATION:
        return DecouplingAnalysis(
            drift_pct=0, verdict="invalid", hr_avg=0,
            hr_first_half=0, hr_second_half=0,
            pace_avg_s_per_km=0, block_duration_min=block_duration_min,
            pace_cv_pct=block_cv, valid=False,
            invalid_reason=f"block_too_short_{block_duration_min:.0f}min",
        )

    # Split block in two halves
    mid_idx = (start_idx + end_idx) // 2
    hr_1 = [hr_stream[i] for i in range(start_idx, mid_idx) if hr_stream[i] > 0]
    hr_2 = [hr_stream[i] for i in range(mid_idx, end_idx) if hr_stream[i] > 0]
    pace_1 = [pace_stream[i] for i in range(start_idx, mid_idx) if pace_stream[i] is not None]
    pace_2 = [pace_stream[i] for i in range(mid_idx, end_idx) if pace_stream[i] is not None]

    if not hr_1 or not hr_2 or not pace_1 or not pace_2:
        return DecouplingAnalysis(
            drift_pct=0, verdict="invalid", hr_avg=0,
            hr_first_half=0, hr_second_half=0,
            pace_avg_s_per_km=0, block_duration_min=block_duration_min,
            pace_cv_pct=block_cv, valid=False,
            invalid_reason="empty_half",
        )

    hr_avg_1 = sum(hr_1) / len(hr_1)
    hr_avg_2 = sum(hr_2) / len(hr_2)
    pace_avg_1 = sum(pace_1) / len(pace_1)
    pace_avg_2 = sum(pace_2) / len(pace_2)

    # Pa:Hr ratio (higher = more efficient; pace is s/km so lower pace = faster)
    # We invert pace so that faster = higher ratio (like power/HR)
    pa_hr_1 = (1.0 / pace_avg_1) / hr_avg_1 if hr_avg_1 > 0 else 0
    pa_hr_2 = (1.0 / pace_avg_2) / hr_avg_2 if hr_avg_2 > 0 else 0

    if pa_hr_1 == 0:
        drift_pct = 0.0
    else:
        drift_pct = ((pa_hr_1 - pa_hr_2) / pa_hr_1) * 100.0

    # Verdict
    if drift_pct < DRIFT_COUPLED:
        verdict = "coupled"
    elif drift_pct < DRIFT_BORDERLINE:
        verdict = "borderline"
    else:
        verdict = "decoupled"

    all_pace = [p for p in pace_stream[start_idx:end_idx] if p is not None]
    all_hr = [hr_stream[i] for i in range(start_idx, end_idx) if hr_stream[i] > 0]

    return DecouplingAnalysis(
        drift_pct=round(drift_pct, 2),
        verdict=verdict,
        hr_avg=round(sum(all_hr) / len(all_hr)) if all_hr else 0,
        hr_first_half=round(hr_avg_1),
        hr_second_half=round(hr_avg_2),
        pace_avg_s_per_km=round(sum(all_pace) / len(all_pace), 1) if all_pace else 0,
        block_duration_min=round(block_duration_min, 1),
        pace_cv_pct=round(block_cv, 2),
        valid=True,
    )


def _find_steady_state_block(
    pace_stream: list[Optional[float]],
    timestamps: list[float],
    window_min: float = MIN_BLOCK_DURATION,
) -> Optional[tuple[int, int, float]]:
    """Find the longest contiguous block where pace CV < PACE_CV_MAX.

    Uses a sliding window approach. Returns (start_idx, end_idx, cv_pct) or None.
    """
    n = len(pace_stream)
    best = None
    best_length = 0

    for start in range(n):
        if pace_stream[start] is None:
            continue
        paces = []
        for end in range(start, n):
            if pace_stream[end] is None:
                break
            paces.append(pace_stream[end])
            duration_s = timestamps[end] - timestamps[start]
            if duration_s < window_min * 60:
                continue
            # Calculate CV
            mean_p = sum(paces) / len(paces)
            if mean_p == 0:
                continue
            variance = sum((p - mean_p) ** 2 for p in paces) / len(paces)
            cv = (math.sqrt(variance) / mean_p) * 100.0
            if cv < PACE_CV_MAX and duration_s > best_length:
                best = (start, end, cv)
                best_length = duration_s

    return best


@dataclass
class TimeTrialAnalysis:
    """Output of a 30-min time trial analysis."""
    avg_pace_s_per_km: float
    avg_hr: int
    pacing_diff_pct: float
    pacing_quality: str  # good | acceptable | invalid
    pace_first_half: float
    pace_second_half: float
    distance_m: float
    valid: bool
    invalid_reason: Optional[str] = None


def analyze_time_trial_streams(
    hr_stream: list[float],
    speed_stream: list[float],
    timestamps: list[float],
    temp_c: Optional[float] = None,
) -> TimeTrialAnalysis:
    """Analyze FIT streams from a 30-min time trial.

    Auto-detects the ~30-min effort block (fastest sustained effort).
    Validates pacing quality by comparing first vs second half.
    """
    if len(hr_stream) < 20 or len(speed_stream) < 20:
        return TimeTrialAnalysis(
            avg_pace_s_per_km=0, avg_hr=0, pacing_diff_pct=0,
            pacing_quality="invalid", pace_first_half=0, pace_second_half=0,
            distance_m=0, valid=False, invalid_reason="insufficient_data",
        )

    n = min(len(hr_stream), len(speed_stream), len(timestamps))
    hr_stream = hr_stream[:n]
    speed_stream = speed_stream[:n]
    timestamps = timestamps[:n]

    # Find the effort block: longest segment with speed significantly above
    # warmup/cooldown (top ~80% of speeds sustained for ~25-35 min)
    effort = _find_effort_block(speed_stream, timestamps, target_min=30.0)
    if effort is None:
        return TimeTrialAnalysis(
            avg_pace_s_per_km=0, avg_hr=0, pacing_diff_pct=0,
            pacing_quality="invalid", pace_first_half=0, pace_second_half=0,
            distance_m=0, valid=False, invalid_reason="no_effort_block",
        )

    start_idx, end_idx = effort
    mid_idx = (start_idx + end_idx) // 2

    # First and second half metrics
    speeds_1 = [speed_stream[i] for i in range(start_idx, mid_idx) if speed_stream[i] > 0.5]
    speeds_2 = [speed_stream[i] for i in range(mid_idx, end_idx) if speed_stream[i] > 0.5]
    hrs = [hr_stream[i] for i in range(start_idx, end_idx) if hr_stream[i] > 0]

    if not speeds_1 or not speeds_2 or not hrs:
        return TimeTrialAnalysis(
            avg_pace_s_per_km=0, avg_hr=0, pacing_diff_pct=0,
            pacing_quality="invalid", pace_first_half=0, pace_second_half=0,
            distance_m=0, valid=False, invalid_reason="empty_half",
        )

    avg_speed_1 = sum(speeds_1) / len(speeds_1)
    avg_speed_2 = sum(speeds_2) / len(speeds_2)
    pace_1 = 1000.0 / avg_speed_1 if avg_speed_1 > 0 else 0
    pace_2 = 1000.0 / avg_speed_2 if avg_speed_2 > 0 else 0

    # Pacing diff: positive = second half slower (positive split)
    pacing_diff = ((pace_2 - pace_1) / pace_1 * 100.0) if pace_1 > 0 else 0

    if pacing_diff < PACING_GOOD:
        pacing_quality = "good"
    elif pacing_diff < PACING_ACCEPTABLE:
        pacing_quality = "acceptable"
    else:
        pacing_quality = "invalid"

    all_speeds = [speed_stream[i] for i in range(start_idx, end_idx) if speed_stream[i] > 0.5]
    avg_speed = sum(all_speeds) / len(all_speeds) if all_speeds else 0
    avg_pace = 1000.0 / avg_speed if avg_speed > 0 else 0

    # Estimate distance
    duration_s = timestamps[end_idx] - timestamps[start_idx]
    distance_m = avg_speed * duration_s

    return TimeTrialAnalysis(
        avg_pace_s_per_km=round(avg_pace, 1),
        avg_hr=round(sum(hrs) / len(hrs)),
        pacing_diff_pct=round(pacing_diff, 2),
        pacing_quality=pacing_quality,
        pace_first_half=round(pace_1, 1),
        pace_second_half=round(pace_2, 1),
        distance_m=round(distance_m),
        valid=pacing_quality != "invalid",
    )


def _find_effort_block(
    speed_stream: list[float],
    timestamps: list[float],
    target_min: float = 30.0,
) -> Optional[tuple[int, int]]:
    """Find the sustained high-effort block (~30 min) in the activity.

    Strategy: compute rolling average speed, find the segment of ~target_min
    with the highest average speed that is well above the overall median.
    """
    n = len(speed_stream)
    if n < 10:
        return None

    target_s = target_min * 60
    tolerance_s = 5 * 60  # allow ±5 min around target

    best_start = None
    best_end = None
    best_avg = 0

    for start in range(n):
        if speed_stream[start] < 0.5:
            continue
        speeds = []
        for end in range(start, n):
            if speed_stream[end] < 0.5:
                break
            speeds.append(speed_stream[end])
            duration = timestamps[end] - timestamps[start]
            if duration < target_s - tolerance_s:
                continue
            if duration > target_s + tolerance_s:
                break
            avg = sum(speeds) / len(speeds)
            if avg > best_avg:
                best_avg = avg
                best_start = start
                best_end = end

    if best_start is not None and best_end is not None:
        return (best_start, best_end)
    return None


# ── Session monitoring (camouflaged) ─────────────────────────────

@dataclass
class SessionCouplingAnalysis:
    """Output of coupling analysis from LT1 interval sessions."""
    drift_pct: float
    hr_per_series: list[int]
    pace_avg_s_per_km: float
    verdict: str  # coupled | borderline | decoupled
    series_count: int


def analyze_session_coupling(
    series_hr: list[int],
    series_pace: list[float],
) -> SessionCouplingAnalysis:
    """Analyze HR drift across repeated intervals at the same pace.

    Args:
        series_hr: average HR of last 60s of each work series
        series_pace: average pace (s/km) of each work series

    Returns:
        SessionCouplingAnalysis with inter-series drift.
    """
    n = len(series_hr)
    if n < 4:
        return SessionCouplingAnalysis(
            drift_pct=0, hr_per_series=series_hr,
            pace_avg_s_per_km=sum(series_pace) / len(series_pace) if series_pace else 0,
            verdict="coupled", series_count=n,
        )

    mid = n // 2
    hr_first = sum(series_hr[:mid]) / mid
    hr_second = sum(series_hr[mid:]) / (n - mid)

    drift = ((hr_second - hr_first) / hr_first * 100.0) if hr_first > 0 else 0

    if drift < DRIFT_COUPLED:
        verdict = "coupled"
    elif drift < DRIFT_BORDERLINE:
        verdict = "borderline"
    else:
        verdict = "decoupled"

    return SessionCouplingAnalysis(
        drift_pct=round(drift, 2),
        hr_per_series=series_hr,
        pace_avg_s_per_km=round(sum(series_pace) / len(series_pace), 1) if series_pace else 0,
        verdict=verdict,
        series_count=n,
    )


# ── Snapshot aggregation ─────────────────────────────────────────

def aggregate_lt1_snapshot(
    db: DbSession,
    athlete_id: int,
    discipline: str = "running",
) -> Optional[dict]:
    """Aggregate all decoupling test results into an LT1 estimate.

    Uses recency-weighted analysis of dedicated tests.
    Returns dict with lt1_pace, lt1_hr, confidence, test_count or None.
    """
    results = db.scalars(
        select(DecouplingResult)
        .where(
            DecouplingResult.athlete_id == athlete_id,
            DecouplingResult.discipline == discipline,
            DecouplingResult.source == "dedicated_test",
        )
        .order_by(DecouplingResult.test_date.desc())
    ).all()

    if not results:
        return None

    today = date.today()
    clear_tests = []      # coupled or decoupled
    borderline_tests = [] # borderline — closest to actual LT1

    for r in results:
        age_days = (today - r.test_date).days
        weight = 2 ** (-age_days / RECENCY_HALF_LIFE_DAYS)

        if r.verdict == "borderline":
            borderline_tests.append((r, weight))
        elif r.verdict in ("coupled", "decoupled"):
            clear_tests.append((r, weight))

    # LT1 estimate: weighted average of borderline tests
    # If no borderline, use midpoint between fastest coupled and slowest decoupled
    lt1_pace = None
    lt1_hr = None

    if borderline_tests:
        total_w = sum(w for _, w in borderline_tests)
        lt1_pace = sum(r.pace_seconds_per_km * w for r, w in borderline_tests) / total_w
        lt1_hr = round(sum(r.hr_avg * w for r, w in borderline_tests) / total_w)
    else:
        coupled = [(r, w) for r, w in clear_tests if r.verdict == "coupled"]
        decoupled = [(r, w) for r, w in clear_tests if r.verdict == "decoupled"]
        if coupled and decoupled:
            # Fastest coupled pace (lowest s/km)
            best_coupled = min(coupled, key=lambda x: x[0].pace_seconds_per_km)
            # Slowest decoupled pace (highest s/km)
            best_decoupled = max(decoupled, key=lambda x: x[0].pace_seconds_per_km)
            lt1_pace = (best_coupled[0].pace_seconds_per_km + best_decoupled[0].pace_seconds_per_km) / 2
            lt1_hr = round((best_coupled[0].hr_avg + best_decoupled[0].hr_avg) / 2)

    if lt1_pace is None:
        return None

    # Confidence
    confidence = CONF_BASE
    for r, _ in clear_tests:
        confidence += CONF_PER_CLEAR_TEST
    for r, _ in borderline_tests:
        confidence += CONF_PER_BORDERLINE
    if any(r.temp_flag for r, _ in clear_tests + borderline_tests):
        confidence += CONF_HEAT_PENALTY
    # Check chronological consistency
    if _has_inconsistency(results):
        confidence += CONF_INCONSISTENCY_PENALTY
    confidence = min(confidence, CONF_CAP)

    return {
        "lt1_pace_seconds_per_km": round(lt1_pace, 1),
        "lt1_hr": lt1_hr,
        "lt1_confidence": round(confidence, 3),
        "lt1_test_count": len(results),
        "lt1_last_test_date": results[0].test_date,
    }


def aggregate_lt2_snapshot(
    db: DbSession,
    athlete_id: int,
    discipline: str = "running",
) -> Optional[dict]:
    """Aggregate time trial results into an LT2 estimate.

    Returns dict with lt2_pace, lt2_hr, confidence, test_count or None.
    """
    results = db.scalars(
        select(TimeTrial30Result)
        .where(
            TimeTrial30Result.athlete_id == athlete_id,
            TimeTrial30Result.discipline == discipline,
            TimeTrial30Result.pacing_quality != "invalid",
        )
        .order_by(TimeTrial30Result.test_date.desc())
    ).all()

    if not results:
        return None

    today = date.today()
    total_w = 0
    pace_sum = 0
    hr_sum = 0

    for r in results:
        age_days = (today - r.test_date).days
        weight = 2 ** (-age_days / RECENCY_HALF_LIFE_DAYS)
        total_w += weight
        pace_sum += r.avg_pace_seconds_per_km * weight
        hr_sum += r.avg_hr * weight

    lt2_pace = pace_sum / total_w
    lt2_hr = round(hr_sum / total_w)

    # Confidence
    confidence = CONF_TT_BASE
    good_count = sum(1 for r in results if r.pacing_quality == "good")
    confidence += good_count * CONF_TT_GOOD_PACING
    if len(results) == 1:
        confidence += CONF_TT_FIRST_TEST_PENALTY
    if len(results) >= 2:
        # Retest bonus if results are consistent (within 2%)
        paces = [r.avg_pace_seconds_per_km for r in results[:2]]
        if abs(paces[0] - paces[1]) / paces[0] < 0.02:
            confidence += CONF_TT_RETEST_BONUS
    if any(r.temp_flag for r in results):
        confidence += CONF_TT_HEAT_PENALTY
    confidence = min(confidence, CONF_CAP)

    return {
        "lt2_pace_seconds_per_km": round(lt2_pace, 1),
        "lt2_hr": lt2_hr,
        "lt2_confidence": round(confidence, 3),
        "lt2_test_count": len(results),
        "lt2_last_test_date": results[0].test_date,
    }


def _has_inconsistency(results: list[DecouplingResult]) -> bool:
    """Check if results are chronologically inconsistent.

    E.g., coupled at 5:30 in month 1, then decoupled at 5:30 in month 3
    (meaning the athlete got worse, which is unlikely unless overreached).
    """
    if len(results) < 3:
        return False

    # Sort by date (oldest first)
    sorted_results = sorted(results, key=lambda r: r.test_date)

    for i in range(len(sorted_results) - 1):
        r1 = sorted_results[i]
        r2 = sorted_results[i + 1]
        # Same pace (within 5%) but opposite verdicts
        if abs(r1.pace_seconds_per_km - r2.pace_seconds_per_km) / r1.pace_seconds_per_km < 0.05:
            if (r1.verdict == "coupled" and r2.verdict == "decoupled"):
                return True
    return False


# ── Full snapshot update ─────────────────────────────────────────

def update_field_test_snapshot(
    db: DbSession,
    athlete_id: int,
    discipline: str = "running",
) -> Optional[FieldTestSnapshot]:
    """Recompute and save the FieldTestSnapshot for an athlete+discipline.

    Aggregates all decoupling results (LT1) and time trial results (LT2),
    cross-validates, and optionally generates a cycling transfer.
    """
    lt1 = aggregate_lt1_snapshot(db, athlete_id, discipline)
    lt2 = aggregate_lt2_snapshot(db, athlete_id, discipline)

    if lt1 is None and lt2 is None:
        return None

    # Upsert snapshot
    snapshot = db.scalar(
        select(FieldTestSnapshot).where(
            FieldTestSnapshot.athlete_id == athlete_id,
            FieldTestSnapshot.discipline == discipline,
            FieldTestSnapshot.transfer_source.is_(None),
        )
    )
    if snapshot is None:
        snapshot = FieldTestSnapshot(
            athlete_id=athlete_id,
            discipline=discipline,
            created_at=datetime.utcnow(),
        )
        db.add(snapshot)

    # Update LT1
    if lt1:
        snapshot.lt1_pace_seconds_per_km = lt1["lt1_pace_seconds_per_km"]
        snapshot.lt1_hr = lt1["lt1_hr"]
        snapshot.lt1_confidence = lt1["lt1_confidence"]
        snapshot.lt1_test_count = lt1["lt1_test_count"]
        snapshot.lt1_last_test_date = lt1["lt1_last_test_date"]

    # Update LT2
    if lt2:
        snapshot.lt2_pace_seconds_per_km = lt2["lt2_pace_seconds_per_km"]
        snapshot.lt2_hr = lt2["lt2_hr"]
        snapshot.lt2_confidence = lt2["lt2_confidence"]
        snapshot.lt2_test_count = lt2["lt2_test_count"]
        snapshot.lt2_last_test_date = lt2["lt2_last_test_date"]

    # Cross-validation
    if snapshot.lt1_pace_seconds_per_km and snapshot.lt2_pace_seconds_per_km:
        # LT2 pace is faster (lower s/km), so ratio = LT2/LT1 (inverted: LT1 is slower)
        ratio_pace = snapshot.lt2_pace_seconds_per_km / snapshot.lt1_pace_seconds_per_km
        snapshot.lt1_lt2_ratio_pace = round(ratio_pace, 3)
        snapshot.cross_validation_ok = RATIO_PACE_MIN <= ratio_pace <= RATIO_PACE_MAX
    if snapshot.lt1_hr and snapshot.lt2_hr:
        snapshot.lt1_lt2_ratio_hr = round(snapshot.lt1_hr / snapshot.lt2_hr, 3)

    snapshot.updated_at = datetime.utcnow()
    db.flush()

    # Generate cycling transfer if this is running
    if discipline == "running":
        _update_cycling_transfer(db, athlete_id, snapshot)

    return snapshot


def _update_cycling_transfer(
    db: DbSession,
    athlete_id: int,
    running_snapshot: FieldTestSnapshot,
) -> None:
    """Create/update a cycling FieldTestSnapshot transferred from running."""
    cycling = db.scalar(
        select(FieldTestSnapshot).where(
            FieldTestSnapshot.athlete_id == athlete_id,
            FieldTestSnapshot.discipline == "ciclismo",
            FieldTestSnapshot.transfer_source == "running",
        )
    )
    if cycling is None:
        cycling = FieldTestSnapshot(
            athlete_id=athlete_id,
            discipline="ciclismo",
            transfer_source="running",
            created_at=datetime.utcnow(),
        )
        db.add(cycling)

    cycling.transfer_factor_lt1 = TRANSFER_FACTOR_LT1
    cycling.transfer_factor_lt2 = TRANSFER_FACTOR_LT2

    if running_snapshot.lt1_hr:
        cycling.lt1_hr = round(running_snapshot.lt1_hr * TRANSFER_FACTOR_LT1)
        cycling.lt1_confidence = round(
            (running_snapshot.lt1_confidence or 0) * TRANSFER_CONFIDENCE_PENALTY, 3
        )
        cycling.lt1_test_count = running_snapshot.lt1_test_count
        cycling.lt1_last_test_date = running_snapshot.lt1_last_test_date

    if running_snapshot.lt2_hr:
        cycling.lt2_hr = round(running_snapshot.lt2_hr * TRANSFER_FACTOR_LT2)
        cycling.lt2_confidence = round(
            (running_snapshot.lt2_confidence or 0) * TRANSFER_CONFIDENCE_PENALTY, 3
        )
        cycling.lt2_test_count = running_snapshot.lt2_test_count
        cycling.lt2_last_test_date = running_snapshot.lt2_last_test_date

    if cycling.lt1_hr and cycling.lt2_hr:
        cycling.lt1_lt2_ratio_hr = round(cycling.lt1_hr / cycling.lt2_hr, 3)

    cycling.updated_at = datetime.utcnow()
    db.flush()
