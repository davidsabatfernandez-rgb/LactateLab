"""Threshold cascade: when athlete thresholds change, refresh future planned sessions.

Usage:
    cascade_threshold_update(db, athlete_id, discipline)

Called from:
    - recalculate_athlete (new lactate test)
    - update_athlete (manual FTP/rFTPa/CSS edits)
    - interpolate_cycling_from_running
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.planned_session import PlannedSession
from app.services.planned_session_publication import prepare_planned_session_for_publish

logger = logging.getLogger(__name__)


def cascade_threshold_update(
    db: Session,
    athlete_id: int,
    discipline: str,
) -> dict:
    """Refresh structured workout targets for all future planned sessions
    of the given athlete+discipline whose thresholds are now stale.

    Returns a summary dict with counts for logging/API response.
    """
    today = date.today()
    now = datetime.now(timezone.utc)

    # Find all future, non-completed sessions for this athlete+discipline
    stmt = (
        select(PlannedSession)
        .where(
            PlannedSession.athlete_id == athlete_id,
            PlannedSession.discipline == discipline,
            PlannedSession.scheduled_date >= today,
            PlannedSession.execution_status != "completed",
        )
        .order_by(PlannedSession.scheduled_date)
    )
    sessions = list(db.scalars(stmt).all())

    if not sessions:
        return {"refreshed": 0, "needs_republish": 0, "skipped_coach_edited": 0}

    refreshed = 0
    needs_republish = 0
    skipped_coach_edited = 0

    for session in sessions:
        # Skip sessions that were manually edited by the coach (preserve coach intent)
        existing_payload = session.structured_workout_payload
        if isinstance(existing_payload, dict):
            sp = existing_payload.get("source_payload") or {}
            if sp.get("coach_edited"):
                # Still mark as stale so the coach is aware thresholds changed
                session.targets_stale = True
                skipped_coach_edited += 1
                continue

        # Regenerate the structured workout with updated thresholds
        try:
            prepare_planned_session_for_publish(session, db=db)
            session.threshold_snapshot_date = now
            session.targets_stale = False
            refreshed += 1

            # If the session was already sent to Garmin, mark for republish
            if session.publish_status == "sent":
                session.publish_status = "needs_republish"
                needs_republish += 1
        except Exception:
            logger.warning(
                "Failed to refresh session %d during threshold cascade",
                session.id,
                exc_info=True,
            )
            session.targets_stale = True

    db.flush()

    summary = {
        "refreshed": refreshed,
        "needs_republish": needs_republish,
        "skipped_coach_edited": skipped_coach_edited,
    }
    logger.info(
        "Threshold cascade for athlete=%d discipline=%s: %s",
        athlete_id, discipline, summary,
    )
    return summary


def mark_sessions_stale(
    db: Session,
    athlete_id: int,
    discipline: str,
) -> int:
    """Lightweight version: just mark sessions as stale without regenerating.
    Useful when you want to defer the heavy regeneration to a later point.
    """
    today = date.today()
    result = db.execute(
        update(PlannedSession)
        .where(
            PlannedSession.athlete_id == athlete_id,
            PlannedSession.discipline == discipline,
            PlannedSession.scheduled_date >= today,
            PlannedSession.execution_status != "completed",
        )
        .values(targets_stale=True)
    )
    db.flush()
    return result.rowcount


def get_threshold_staleness_days(db: Session, athlete_id: int) -> dict[str, int | None]:
    """Returns days since last threshold update per discipline.

    Looks at the most recent PhysiologicalSnapshot per discipline.
    Returns dict like {"running": 14, "ciclismo": None, "natacion": 42}
    """
    from app.models.metrics import PhysiologicalSnapshot

    result: dict[str, int | None] = {}
    today = date.today()

    for discipline in ("running", "ciclismo", "natación"):
        latest = db.scalars(
            select(PhysiologicalSnapshot)
            .where(
                PhysiologicalSnapshot.athlete_id == athlete_id,
                PhysiologicalSnapshot.discipline == discipline,
            )
            .order_by(PhysiologicalSnapshot.snapshot_date.desc())
        ).first()

        if latest and latest.snapshot_date:
            delta = today - latest.snapshot_date
            result[discipline] = delta.days
        else:
            result[discipline] = None

    return result


def build_threshold_warnings(staleness: dict[str, int | None]) -> list[dict]:
    """Build threshold staleness warnings from staleness data.

    Returns list of dicts with keys: discipline, days, severity, message.
    """
    DISCIPLINE_LABELS = {
        "running": "running",
        "ciclismo": "ciclismo",
        "natación": "natación",
    }
    warnings = []
    for discipline, days in staleness.items():
        if days is None:
            continue
        label = DISCIPLINE_LABELS.get(discipline, discipline)
        if days > 90:
            warnings.append({
                "discipline": discipline,
                "days": days,
                "severity": "critical",
                "message": f"Umbrales de {label} muy antiguos ({days} dias). Las zonas pueden no ser fiables.",
            })
        elif days > 42:
            warnings.append({
                "discipline": discipline,
                "days": days,
                "severity": "warning",
                "message": f"Umbrales de {label} tienen {days} dias. Considera re-testar.",
            })
    return warnings


def check_zone_staleness_for_disciplines(
    db: Session,
    athlete_id: int,
    disciplines: set[str],
) -> list[dict]:
    """Check zone staleness for multiple disciplines after recalculation.

    Returns a list of alerts for disciplines where zones are stale.
    Each alert has: discipline, is_stale, reason, deltas.
    """
    from app.models.metrics import PhysiologicalSnapshot
    from app.models.training_zone import TrainingZoneSet

    alerts = []
    for discipline in disciplines:
        active = db.scalars(
            select(TrainingZoneSet)
            .where(
                TrainingZoneSet.athlete_id == athlete_id,
                TrainingZoneSet.discipline == discipline,
                TrainingZoneSet.is_active == True,  # noqa: E712
            )
        ).first()
        if active is None:
            continue  # No zones to compare against

        snapshot = db.scalars(
            select(PhysiologicalSnapshot)
            .where(
                PhysiologicalSnapshot.athlete_id == athlete_id,
                PhysiologicalSnapshot.discipline == discipline,
            )
            .order_by(PhysiologicalSnapshot.snapshot_date.desc())
        ).first()
        if snapshot is None:
            continue

        # Compare practical LT2 from zones vs current snapshot
        ctx = active.threshold_context or {}
        old_prac_lt2 = ctx.get("practical_lt2", {})
        payload = snapshot.payload or {}
        dynamic = payload.get("dynamic_thresholds", {})
        chronic = dynamic.get("chronic", {})
        new_prac_lt2 = chronic.get("practical_lt2", {})

        if not old_prac_lt2 or not new_prac_lt2:
            continue

        reasons = []
        deltas = {}

        # Pace delta
        old_pace = old_prac_lt2.get("estimated_pace_seconds_per_km") or old_prac_lt2.get("pace_seconds_per_km")
        new_pace = new_prac_lt2.get("estimated_pace_seconds_per_km")
        if old_pace and new_pace:
            delta = new_pace - old_pace
            deltas["lt2_pace_delta"] = round(delta, 1)
            if abs(delta / old_pace) >= 0.03:
                reasons.append(f"LT2 pace cambió {abs(delta):.0f}s/km")

        # HR delta
        old_hr = old_prac_lt2.get("estimated_hr_at_target") or old_prac_lt2.get("heart_rate")
        new_hr = new_prac_lt2.get("estimated_hr_at_target")
        if old_hr and new_hr:
            delta = int(new_hr - old_hr)
            deltas["lt2_hr_delta"] = delta
            if abs(delta) >= 5:
                reasons.append(f"LT2 FC cambió {abs(delta)} bpm")

        # Power delta
        old_pow = old_prac_lt2.get("estimated_power_watts") or old_prac_lt2.get("power_watts")
        new_pow = new_prac_lt2.get("estimated_power_watts")
        if old_pow and new_pow:
            delta = round(new_pow - old_pow, 1)
            deltas["lt2_power_delta"] = delta
            if abs(delta / old_pow) >= 0.03:
                reasons.append(f"LT2 potencia cambió {abs(delta):.0f}W")

        if reasons:
            alerts.append({
                "discipline": discipline,
                "is_stale": True,
                "reason": "; ".join(reasons),
                "deltas": deltas,
            })

    return alerts
