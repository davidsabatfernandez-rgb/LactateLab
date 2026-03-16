"""Auto-link Garmin activities to planned sessions after sync.

Matching criteria (all must pass):
- Same date (activity date == session scheduled_date)
- Same discipline/sport (via SPORT_DISCIPLINE_MAP)
- Duration within +/-25% of planned duration
- If distance available: distance within +/-20% of expected

Priority:
- Multiple activities -> one session: pick closest by duration
- Multiple sessions -> one activity: pick closest by scheduled_time
- One-to-one: each activity links to at most one session
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.garmin_activity import GarminActivity
from app.models.planned_session import PlannedSession

logger = logging.getLogger(__name__)

# Map Garmin sport types to internal disciplines (re-uses garmin.py map)
SPORT_DISCIPLINE_MAP = {
    "running": "running", "trail_running": "running", "treadmill_running": "running",
    "track_running": "running", "ultra_run": "running",
    "cycling": "ciclismo", "mountain_biking": "ciclismo", "indoor_cycling": "ciclismo",
    "virtual_ride": "ciclismo", "gravel_cycling": "ciclismo", "road_biking": "ciclismo",
    "lap_swimming": "natación", "open_water_swimming": "natación", "pool_swimming": "natación",
    "swimming": "natación",
}


def _normalize_discipline(sport_type: str) -> str:
    return SPORT_DISCIPLINE_MAP.get(sport_type.lower().replace(" ", "_"), "other")


def _extract_planned_duration_s(session: PlannedSession) -> float | None:
    """Extract planned duration in seconds from session payload."""
    payload = session.payload or {}
    total_min = payload.get("total_duration_min")
    if total_min is not None:
        try:
            return float(total_min) * 60
        except (TypeError, ValueError):
            pass
    return None


def _extract_planned_distance_m(session: PlannedSession) -> float | None:
    """Extract planned distance in meters from session payload (if available)."""
    payload = session.payload or {}
    dist = payload.get("total_distance_m") or payload.get("distance_m")
    if dist is not None:
        try:
            return float(dist)
        except (TypeError, ValueError):
            pass
    return None


def _build_actual_performance(activity: GarminActivity) -> dict[str, Any]:
    """Build actual_performance dict from a GarminActivity."""
    perf: dict[str, Any] = {}
    if activity.distance_m is not None:
        perf["distance_m"] = activity.distance_m
    if activity.moving_time_seconds is not None:
        perf["duration_s"] = activity.moving_time_seconds
    elif activity.elapsed_time_seconds is not None:
        perf["duration_s"] = activity.elapsed_time_seconds
    # Compute avg pace if running and distance > 0
    if (
        activity.distance_m
        and activity.distance_m > 0
        and perf.get("duration_s")
        and _normalize_discipline(activity.sport_type) == "running"
    ):
        perf["avg_pace_s_per_km"] = round(perf["duration_s"] / (activity.distance_m / 1000), 1)
    if activity.average_heartrate is not None:
        perf["avg_hr"] = activity.average_heartrate
    if activity.average_watts is not None:
        perf["avg_power"] = activity.average_watts
    if activity.started_at is not None:
        perf["started_at"] = activity.started_at.isoformat() if isinstance(activity.started_at, datetime) else str(activity.started_at)
    return perf


def _match_score(
    session: PlannedSession,
    activity: GarminActivity,
) -> float | None:
    """Return a match score (lower = better) or None if the pair doesn't pass criteria.

    Criteria:
    - Same date
    - Same discipline
    - Duration within +/-25%
    - Distance within +/-20% (if both available)
    """
    # Date check
    act_date: date
    if isinstance(activity.started_at, datetime):
        act_date = activity.started_at.date()
    else:
        return None

    if act_date != session.scheduled_date:
        return None

    # Discipline check
    act_discipline = _normalize_discipline(activity.sport_type)
    if act_discipline != session.discipline:
        return None

    # Duration check
    planned_dur = _extract_planned_duration_s(session)
    actual_dur = activity.moving_time_seconds or activity.elapsed_time_seconds
    if planned_dur and planned_dur > 0 and actual_dur and actual_dur > 0:
        ratio = abs(actual_dur - planned_dur) / planned_dur
        if ratio > 0.25:
            return None
        duration_diff = ratio
    elif planned_dur and planned_dur > 0 and (not actual_dur or actual_dur == 0):
        # No actual duration info, skip duration check but penalize
        duration_diff = 0.2
    else:
        # No planned duration, can't check — allow match with small penalty
        duration_diff = 0.1

    # Distance check (optional)
    planned_dist = _extract_planned_distance_m(session)
    actual_dist = activity.distance_m
    distance_diff = 0.0
    if planned_dist and planned_dist > 0 and actual_dist and actual_dist > 0:
        dist_ratio = abs(actual_dist - planned_dist) / planned_dist
        if dist_ratio > 0.20:
            return None
        distance_diff = dist_ratio

    # Score: weighted combination (lower = better match)
    return duration_diff * 0.7 + distance_diff * 0.3


def match_activities_to_sessions(
    db: Session,
    athlete_id: int,
    start_date: date,
    end_date: date,
) -> dict[str, Any]:
    """Match Garmin activities to planned sessions in a date range.

    Returns summary dict with counts of matched/updated sessions.
    """
    # Get unlinked planned sessions in range
    sessions = db.scalars(
        select(PlannedSession).where(
            PlannedSession.athlete_id == athlete_id,
            PlannedSession.scheduled_date >= start_date,
            PlannedSession.scheduled_date <= end_date,
            PlannedSession.execution_status == "planned",
        )
    ).all()

    if not sessions:
        return {"matched": 0, "sessions_checked": 0}

    # Get Garmin activities in range (with 1-day buffer for timezone issues)
    buffer_start = datetime.combine(start_date - timedelta(days=1), datetime.min.time())
    buffer_end = datetime.combine(end_date + timedelta(days=1), datetime.max.time())

    activities = db.scalars(
        select(GarminActivity).where(
            GarminActivity.athlete_id == athlete_id,
            GarminActivity.started_at >= buffer_start,
            GarminActivity.started_at <= buffer_end,
        )
    ).all()

    if not activities:
        # Mark past sessions as missed
        _mark_missed_sessions(sessions)
        db.flush()
        return {"matched": 0, "sessions_checked": len(sessions)}

    # Build score matrix
    # scores[session_idx][activity_idx] = score or None
    scores: list[list[float | None]] = []
    for session in sessions:
        row = []
        for activity in activities:
            row.append(_match_score(session, activity))
        scores.append(row)

    # Greedy matching: pick best score, assign, remove both from pool
    matched_sessions: set[int] = set()
    matched_activities: set[int] = set()
    matches: list[tuple[int, int, float]] = []

    # Collect all valid pairs with scores
    all_pairs: list[tuple[float, int, int]] = []
    for si, row in enumerate(scores):
        for ai, score in enumerate(row):
            if score is not None:
                all_pairs.append((score, si, ai))

    # Sort by score ascending (best first)
    all_pairs.sort()

    for score, si, ai in all_pairs:
        if si in matched_sessions or ai in matched_activities:
            continue
        matched_sessions.add(si)
        matched_activities.add(ai)
        matches.append((si, ai, score))

    # Apply matches
    matched_count = 0
    for si, ai, score in matches:
        session = sessions[si]
        activity = activities[ai]

        session.execution_status = "completed"
        session.linked_activity_id = activity.provider_activity_id
        session.actual_performance = _build_actual_performance(activity)

        # Also link from GarminActivity side
        activity.planned_session_id = session.id

        matched_count += 1
        logger.info(
            "Matched activity %d to session %d (score=%.3f)",
            activity.provider_activity_id,
            session.id,
            score,
        )

    # Mark past unmatched sessions
    today = date.today()
    for si, session in enumerate(sessions):
        if si not in matched_sessions and session.scheduled_date < today:
            # Don't override already-completed sessions
            if session.execution_status == "planned":
                pass  # Leave as "planned" — the coach will decide if it was skipped

    db.flush()

    return {
        "matched": matched_count,
        "sessions_checked": len(sessions),
        "activities_checked": len(activities),
    }


def _mark_missed_sessions(sessions: list[PlannedSession]) -> None:
    """For past sessions with no activities at all, leave them as planned.
    The coach or athlete can manually mark as skipped."""
    pass
