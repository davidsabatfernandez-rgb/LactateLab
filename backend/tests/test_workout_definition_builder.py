from datetime import date, datetime, timezone

from app.models.planned_session import PlannedSession
from app.services.planned_session_publication import prepare_planned_session_for_publish
from app.services.workout_definition_builder import build_library_workout_definition, build_workout_definition
from app.services.workout_library import DoseStep, WorkoutTemplate


def test_build_workout_definition_for_repeated_running_session():
    session = PlannedSession(
        id=42,
        athlete_id=1,
        focus_block_id=1,
        scheduled_date=date(2026, 3, 20),
        discipline="running",
        week_index=2,
        day_offset=3,
        session_role="key",
        session_family="threshold",
        workout_template_id="run_lt2_cruise",
        public_label="T2: 8 x 1km LT2",
        objective="Sesión de umbral alto con recuperación corta",
        dose_prescription="8 x 1km 4:35-4:45/km + 75s descanso entre series",
        dose_guidance="Mantener control interno estable en todas las repeticiones.",
        progression_note="Si la respuesta es sólida, subir densidad la próxima semana.",
        expected_signal="RPE alto pero estable, sin deriva excesiva.",
        coach_note="Meter gel de 25-30 g en la tercera serie.",
        confidence=0.86,
        status="planned",
        bla_check=False,
        payload={},
        created_at=datetime(2026, 3, 13, tzinfo=timezone.utc),
    )

    workout = build_workout_definition(session)

    assert workout.source_session_id == 42
    assert workout.sport == "running"
    assert workout.title == "T2: 8 x 1km LT2"
    assert workout.description == "Sesión de umbral alto con recuperación corta"
    assert "Meter gel de 25-30 g en la tercera serie." in workout.notes
    assert len(workout.steps) == 1

    repeat_step = workout.steps[0]
    assert repeat_step.step_type == "repeat"
    assert repeat_step.repeat_count == 8
    assert repeat_step.intensity_label == "LT2"
    assert len(repeat_step.children) == 2

    interval_step = repeat_step.children[0]
    assert interval_step.step_type == "interval"
    assert interval_step.length_type == "distance"
    assert interval_step.length_value == 1000
    assert interval_step.target is not None
    assert interval_step.target.target_type == "pace"
    assert interval_step.target.value_from == 275
    assert interval_step.target.value_to == 285
    assert interval_step.target.unit == "s_per_km"

    recovery_step = repeat_step.children[1]
    assert recovery_step.step_type == "recovery"
    assert recovery_step.length_type == "time"
    assert recovery_step.length_value == 75
    assert recovery_step.target is not None
    assert recovery_step.target.target_type == "easy"


def test_build_library_workout_definition_for_dose_step(monkeypatch):
    template = WorkoutTemplate(
        template_id="run_lt1_extensive_test",
        discipline="running",
        compatible_block_types=("aerobic_capacity_block",),
        session_role="key",
        session_family="lt1_extensive",
        public_label="LT1 extensivo de carrera",
        summary="Trabajo extensivo cerca del primer umbral.",
        objective="Construir estabilidad subumbral.",
        dose_guidance="Mantener control interno estable.",
        progression_axes=("volume",),
        control_points=("Ritmo repetible",),
        expected_adaptations=("Durabilidad",),
        cautions=("No convertirlo en LT2",),
        confidence=0.9,
        evidence_ids=(),
        csv_examples=("3x8'",),
        fatigue_cost=3,
        dose_ladder=(
            DoseStep(
                step=1,
                label="3x8'",
                total_useful_time_min=24,
                rest_min=1.5,
                intensity_zone="LT1",
                readiness_required="any",
                notes="Versión base",
                total_duration_min=57,
            ),
        ),
        calentamiento_min=20,
        calentamiento_template="15' progresivo + 4 rectas",
        enfriamiento_min=10,
        enfriamiento_template="10' trote muy suave",
        coach_tips=("Controlar respiración",),
    )

    monkeypatch.setattr(
        "app.services.workout_definition_builder.templates_for_discipline_library",
        lambda discipline: [template] if discipline == "running" else [],
    )

    workout = build_library_workout_definition(
        discipline="running",
        template_id=template.template_id,
        source="dose",
        dose_step=1,
        label=None,
    )

    assert workout.sport == "running"
    assert workout.title == "3x8'"
    assert workout.description == "LT1 extensivo de carrera"
    assert len(workout.steps) == 3
    assert workout.steps[0].step_type == "warmup"
    assert workout.steps[1].step_type == "repeat"
    assert workout.steps[1].repeat_count == 3
    assert workout.steps[1].children[0].step_type == "interval"
    assert workout.steps[1].children[0].length_value == 480
    assert workout.steps[1].children[1].step_type == "recovery"
    assert workout.steps[1].children[1].length_value == 90
    assert workout.steps[2].step_type == "cooldown"


def test_prepare_planned_session_for_publish_sets_ready_state(monkeypatch):
    session = PlannedSession(
        id=77,
        athlete_id=1,
        focus_block_id=1,
        scheduled_date=date(2026, 3, 21),
        discipline="running",
        week_index=2,
        day_offset=4,
        session_role="key",
        session_family="lt1_extensive",
        workout_template_id="run_lt1_extensive_test",
        public_label="LT1 extensivo de carrera",
        objective="Construir estabilidad subumbral.",
        dose_prescription="3x8'",
        dose_guidance="Control estable",
        progression_note="Subir si hay buena respuesta",
        expected_signal="Respiración controlada",
        coach_note="Mirar sensación al final",
        confidence=0.88,
        status="planned",
        bla_check=False,
        payload={"dose_step_index": 1},
        created_at=datetime(2026, 3, 13, tzinfo=timezone.utc),
    )

    monkeypatch.setattr(
        "app.services.planned_session_publication.build_library_workout_definition",
        lambda **kwargs: build_workout_definition(session),
    )

    prepare_planned_session_for_publish(session)

    assert session.publish_status == "ready"
    assert session.publish_error is None
    assert session.structured_workout_generated_at is not None
    assert session.structured_workout_payload is not None
    assert session.structured_workout_payload["title"] == "LT1 extensivo de carrera"
