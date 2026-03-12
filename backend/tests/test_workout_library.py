from app.core.security import get_password_hash
from app.models.user import User
from app.services.workout_library import build_mesocycle_draft, templates_for_block, templates_for_discipline_library


def auth_headers(client, db_session):
    user = User(
        email="planning@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="coach",
        full_name="Coach Planning",
    )
    db_session.add(user)
    db_session.commit()
    response = client.post("/api/auth/login", json={"email": "planning@test.dev", "password": "secret123"})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_templates_for_running_threshold_include_evidence_and_csv_examples():
    templates = templates_for_block("running", "threshold_development_block")

    ids = {template.template_id for template in templates}
    assert "run_lt2_cruise" in ids
    threshold_template = next(template for template in templates if template.template_id == "run_lt2_cruise")
    assert threshold_template.evidence_ids
    assert "6 x 1km LT2" in threshold_template.csv_examples


def test_general_workout_templates_include_variants_and_builder_variables():
    templates = templates_for_discipline_library("running")
    template = next(item for item in templates if item.template_id == "run_lt1_extensive")

    from app.services.workout_library import builder_variables_for_template, variants_for_template

    variants = variants_for_template(template)
    variables = builder_variables_for_template(template)

    assert len(variants) >= 3
    assert any(variable.name == "Volumen" for variable in variables)
    assert any(variable.name == "Terreno" for variable in variables)
    assert "40' continuo LT1" in template.csv_examples
    assert "4 x 6' LT1" not in template.csv_examples
    assert "4 x 2km LT1" not in template.csv_examples


def test_library_examples_are_representative_and_not_generic_labels():
    templates = templates_for_discipline_library("running")
    templates += templates_for_discipline_library("ciclismo")
    templates += templates_for_discipline_library("natación")

    forbidden_examples = {
        "Running",
        "Road Cycling",
        "Mixed Surface Cycling",
        "Cycling",
        "Lap Swimming",
        "Swimming",
        "Open Water Swimming",
        "E",
        "E1",
        "LT2",
        "SUB-T",
        "Transition",
        "reinicio",
    }

    flattened_examples = {example for template in templates for example in template.csv_examples}
    assert flattened_examples.isdisjoint(forbidden_examples)


def test_build_mesocycle_draft_for_cycling_specific_block_contains_specific_and_recovery_week():
    draft = build_mesocycle_draft(
        discipline="ciclismo",
        block_type="competition_specific_block",
        block_label="Especificidad competitiva",
        structure="2+1",
        duration_weeks=3,
        work_weeks=2,
        recovery_weeks=1,
        primary_focus="Especificidad competitiva",
        secondary_focus="Half pace",
    )

    assert draft["weeks"][1]["load_type"] == "especificidad"
    assert any(session["session_family"] == "transition_specific" for session in draft["weeks"][1]["sessions"])
    assert draft["weeks"][-1]["load_type"] == "descarga"


def test_build_mesocycle_draft_prewrites_prescriptions_and_dates():
    draft = build_mesocycle_draft(
        discipline="running",
        block_type="threshold_development_block",
        block_label="Desarrollo LT1-LT2 de carrera",
        structure="2+1",
        duration_weeks=3,
        work_weeks=2,
        recovery_weeks=1,
        primary_focus="LT1/LT2",
        secondary_focus="Ritmo sostenible",
    )

    first_session = draft["weeks"][0]["sessions"][0]
    assert first_session["scheduled_date"] is not None
    assert first_session["dose_prescription"]
    assert first_session["selection_reason"]


def test_build_mesocycle_draft_progresses_lt1_across_work_weeks_and_finishes_in_recovery():
    draft = build_mesocycle_draft(
        discipline="running",
        block_type="aerobic_capacity_block",
        block_label="Capacidad aeróbica de carrera",
        structure="2+1",
        duration_weeks=4,
        work_weeks=3,
        recovery_weeks=1,
        primary_focus="Capacidad aeróbica",
        secondary_focus="Economía de carrera",
    )

    # build_peak = semana 3 del working phase (clímax del wave principle de Olbrecht)
    assert [week["load_type"] for week in draft["weeks"]] == ["acumulación", "construcción", "carga máxima", "descarga"]

    # El wave principle de Olbrecht: load→build→build_peak→recovery
    # build_peak usa ANC spice (run_anc_submax_spice) + run_lt1_long_reps, no run_lt1_extensive
    # Por eso buscamos las sesiones LT1 en cualquiera de las familias lt1_* usadas
    lt1_families = {"lt1_extensive", "lt1_long_reps", "anc_submax_spice"}
    lt1_sessions = []
    for week in draft["weeks"][:-1]:  # Excluir semana de recovery
        for s in week["sessions"]:
            if any(fam in s.get("session_family", "") for fam in lt1_families):
                lt1_sessions.append(s)
                break  # Una por semana

    # Las 3 semanas de trabajo tienen sesiones LT1 o ANC+LT1; recovery no
    assert len(lt1_sessions) == 3
    # Semana de recovery no tiene sesiones LT1 key
    recovery_families = {s.get("session_family", "") for s in draft["weeks"][-1]["sessions"]}
    assert "lt1_extensive" not in recovery_families

    # load→build→build_peak deben tener sesiones con template_id diferente (progresión real)
    load_templates = {s["template_id"] for s in draft["weeks"][0]["sessions"]}
    peak_templates = {s["template_id"] for s in draft["weeks"][2]["sessions"]}
    # build_peak debe diferenciarse de load (tiene run_anc_submax_spice o run_lt1_long_reps)
    assert load_templates != peak_templates, "build_peak debe diferenciarse de load"

    # La selection_reason menciona el peldaño seleccionado
    assert any("peldaño" in r.lower() for r in lt1_sessions[0]["selection_reason"])


def test_templates_for_swim_library_cover_multiple_mesocycle_focuses():
    templates = templates_for_discipline_library("natación")

    ids = {template.template_id for template in templates}
    assert "swim_technical_alignment" in ids
    assert "swim_css_threshold" in ids
    assert "swim_open_water_specific" in ids
    assert len(templates) >= 8


def test_planning_endpoints_expose_workout_library_and_mesocycle_draft(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Planning",
            "date_of_birth": "1994-05-11",
            "sex": "male",
            "weight": 68,
            "height": 178,
            "primary_discipline": "running",
            "training_goal": "Media maratón",
            "created_at": "2026-01-01",
            "weights": [{"recorded_at": "2026-01-01", "weight": 68, "source": "baseline"}],
        },
    )
    assert athlete_response.status_code == 201
    athlete_id = athlete_response.json()["id"]

    target_response = client.post(
        f"/api/athletes/{athlete_id}/targets",
        headers=headers,
        json={
            "target_date": "2026-04-12",
            "discipline": "running",
            "objective": "Media maratón de referencia",
            "distance_label": "21K",
            "priority_level": "alta",
            "target_running_pace_label": "4:00/km",
        },
    )
    assert target_response.status_code == 201

    overview_response = client.get(f"/api/planning/athletes/{athlete_id}/overview?discipline=running", headers=headers)
    assert overview_response.status_code == 200
    overview_payload = overview_response.json()
    assert overview_payload["recommended_workouts"]
    assert overview_payload["mesocycle_draft"]["weeks"]

    library_response = client.get(f"/api/planning/athletes/{athlete_id}/workout-library?discipline=running", headers=headers)
    assert library_response.status_code == 200
    library_payload = library_response.json()
    assert len(library_payload) >= 8
    assert any(item["compatible_block_types"] for item in library_payload)
    assert any(item["csv_examples"] for item in library_payload)

    draft_response = client.get(f"/api/planning/athletes/{athlete_id}/mesocycle-draft?discipline=running", headers=headers)
    assert draft_response.status_code == 200
    draft_payload = draft_response.json()
    assert draft_payload["foundations"]
    assert draft_payload["weeks"][0]["sessions"]


def test_activating_focus_block_materializes_planned_sessions_in_overview(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Planning Persistido",
            "date_of_birth": "1992-02-18",
            "sex": "female",
            "weight": 57,
            "height": 168,
            "primary_discipline": "running",
            "training_goal": "10K",
            "created_at": "2026-01-01",
            "weights": [{"recorded_at": "2026-01-01", "weight": 57, "source": "baseline"}],
        },
    )
    athlete_id = athlete_response.json()["id"]

    client.post(
        f"/api/athletes/{athlete_id}/targets",
        headers=headers,
        json={
            "target_date": "2026-04-20",
            "discipline": "running",
            "objective": "10K primavera",
            "distance_label": "10K",
            "priority_level": "alta",
            "target_running_pace_label": "3:50/km",
        },
    )

    block_response = client.post(
        f"/api/athletes/{athlete_id}/focus-blocks",
        headers=headers,
        json={
            "start_date": "2026-03-16",
            "end_date": "2026-04-05",
            "template_id": "run_threshold",
            "energy_system_focus": "LT1/LT2",
            "block_objective": "LT2",
            "block_intent": "Consolidar ritmo sostenible para 10K",
            "priority_discipline": "running",
            "phase": "build",
            "target_event": "10K primavera",
            "target_date": "2026-04-20",
            "status": "active",
            "coach_notes": "Bloque de umbral preescrito",
        },
    )

    assert block_response.status_code == 201
    block_id = block_response.json()["id"]

    overview_response = client.get(f"/api/planning/athletes/{athlete_id}/overview?discipline=running", headers=headers)
    assert overview_response.status_code == 200
    overview_payload = overview_response.json()
    planned_sessions = overview_payload["planned_sessions"]

    assert planned_sessions
    assert all(item["focus_block_id"] == block_id for item in planned_sessions)
    assert all(item["dose_prescription"] for item in planned_sessions)
    assert any(item["public_label"] for item in planned_sessions)


def test_general_workout_library_endpoint_returns_templates_without_athlete_context(client, db_session):
    headers = auth_headers(client, db_session)

    response = client.get("/api/planning/workout-library?discipline=ciclismo", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) >= 10
    assert any(item["session_family"] == "fatmax_endurance" for item in payload)
    assert all(item["variants"] for item in payload[:5])
    assert all(item["builder_variables"] for item in payload[:5])
