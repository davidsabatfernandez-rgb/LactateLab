from __future__ import annotations

from datetime import datetime, timezone

from app.models.planned_session import PlannedSession
from app.schemas.workout_definition import WorkoutDefinition
from app.services.workout_definition_builder import build_library_workout_definition, build_workout_definition


def prepare_planned_session_for_publish(session: PlannedSession) -> PlannedSession:
    try:
        workout = build_structured_workout_for_planned_session(session)
        session.structured_workout_payload = workout.model_dump()
        session.publish_status = "ready"
        session.publish_error = None
        session.structured_workout_generated_at = datetime.now(timezone.utc)
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
        dose_step = session.dose_step_override or payload.get("dose_step_index")
        source = "dose" if dose_step else "example"
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
