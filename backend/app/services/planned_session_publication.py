from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session as DbSession

from app.models.planned_session import PlannedSession
from app.schemas.workout_definition import WorkoutDefinition
from app.services.workout_definition_builder import build_library_workout_definition, build_workout_definition


def prepare_planned_session_for_publish(
    session: PlannedSession,
    *,
    db: Optional[DbSession] = None,
    target_mode: Optional[str] = None,
) -> PlannedSession:
    """Build structured workout and optionally resolve zone targets.

    If ``db`` is provided, zone targets are resolved from the athlete's active zones.
    ``target_mode`` can be "pace", "hr", "power", or None (auto = discipline default).
    """
    # If the coach manually edited the workout steps, preserve that payload.
    existing = session.structured_workout_payload
    if isinstance(existing, dict):
        sp = existing.get("source_payload") or {}
        if sp.get("coach_edited"):
            session.publish_status = "ready"
            session.publish_error = None
            return session

    effective_mode = target_mode or session.target_mode or "auto"

    try:
        workout = build_structured_workout_for_planned_session(session)

        # Resolve zone targets if we have a DB session
        zone_warnings: list[str] = []
        if db is not None:
            try:
                from app.services.zone_target_resolver import resolve_workout_targets
                workout, zone_warnings = resolve_workout_targets(
                    db,
                    session.athlete_id,
                    session.discipline,
                    workout,
                    target_mode=effective_mode,
                )
            except Exception:
                pass  # Zone resolution failure should not block publishing

        session.structured_workout_payload = workout.model_dump()
        session.publish_status = "ready"
        session.publish_error = "; ".join(zone_warnings) if zone_warnings else None
        now = datetime.now(timezone.utc)
        session.structured_workout_generated_at = now
        session.threshold_snapshot_date = now
        session.targets_stale = False
    except Exception as exc:
        session.structured_workout_payload = None
        session.publish_status = "draft"
        session.publish_error = str(exc)
        session.structured_workout_generated_at = datetime.now(timezone.utc)
    return session


def build_structured_workout_for_planned_session(session: PlannedSession) -> WorkoutDefinition:
    template_id = session.swapped_template_id or session.workout_template_id
    payload = session.payload or {}

    if template_id:
        dose_step = session.dose_step_override if session.dose_step_override is not None else payload.get("dose_step_index")
        source = "dose" if dose_step is not None else "example"
        try:
            return build_library_workout_definition(
                discipline=session.discipline,
                template_id=template_id,
                source=source,
                dose_step=dose_step,
                label=session.dose_prescription,
            )
        except ValueError:
            pass

    return build_workout_definition(session)
