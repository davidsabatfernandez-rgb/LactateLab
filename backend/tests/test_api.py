from datetime import date, datetime

from app.core.security import get_password_hash
from app.models.user import User


def auth_headers(client, db_session):
    user = User(
        email="coach@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="coach",
        full_name="Coach Test",
    )
    db_session.add(user)
    db_session.commit()
    response = client.post("/api/auth/login", json={"email": "coach@test.dev", "password": "secret123"})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_athlete_and_session_analysis(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Test",
            "date_of_birth": "1995-06-01",
            "sex": "male",
            "weight": 70,
            "height": 180,
            "primary_discipline": "running",
            "notes": "perfil demo",
            "created_at": "2026-01-01",
            "weights": [{"recorded_at": "2026-01-01", "weight": 70, "source": "baseline"}],
        },
    )
    assert athlete_response.status_code == 201
    athlete_id = athlete_response.json()["id"]

    session_response = client.post(
        "/api/sessions",
        headers=headers,
        json={
            "athlete_id": athlete_id,
            "performed_at": datetime(2026, 2, 1, 10, 0).isoformat(),
            "discipline": "running",
            "session_type": "test incremental",
            "goal": "test",
            "surface": "track",
            "temperature_c": 12,
            "comments": "none",
            "intervals": [
                {
                    "order_index": 1,
                    "duration_seconds": 240,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 150,
                    "heart_rate_max": 155,
                    "pace_seconds_per_km": 340,
                    "cadence": 176,
                    "rpe": 3,
                    "purpose": "LT1",
                    "lactate_sample": {"lactate_mmol": 1.5, "sample_delay_seconds": 30, "sample_timing_label": "tras 30s"},
                },
                {
                    "order_index": 2,
                    "duration_seconds": 240,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 160,
                    "heart_rate_max": 166,
                    "pace_seconds_per_km": 320,
                    "cadence": 178,
                    "rpe": 5,
                    "purpose": "LT2",
                    "lactate_sample": {"lactate_mmol": 2.4, "sample_delay_seconds": 30, "sample_timing_label": "tras 30s"},
                },
                {
                    "order_index": 3,
                    "duration_seconds": 240,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 172,
                    "heart_rate_max": 178,
                    "pace_seconds_per_km": 300,
                    "cadence": 180,
                    "rpe": 8,
                    "purpose": "VO2max",
                    "lactate_sample": {"lactate_mmol": 4.6, "sample_delay_seconds": 30, "sample_timing_label": "tras 30s"},
                },
            ],
        },
    )
    assert session_response.status_code == 201

    analysis_response = client.get(f"/api/athletes/{athlete_id}/analysis", headers=headers)
    assert analysis_response.status_code == 200
    data = analysis_response.json()
    assert len(data["thresholds"]) == 2
    assert any(estimate["estimate_type"] == "5K" for estimate in data["estimates"])
    assert "interpretation" in data
    assert "confidence_summary" in data
    assert "historical_evolution" in data
    assert data["thresholds"][0]["methods_compared"]
    assert "variables_used" in data["estimates"][0]


def test_dashboard_endpoint(client, db_session):
    headers = auth_headers(client, db_session)
    response = client.get("/api/analytics/dashboard", headers=headers)
    assert response.status_code == 200
    assert "athletes_count" in response.json()


def test_reasoning_interpretation_preview(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Prompt",
            "date_of_birth": "1993-04-01",
            "sex": "female",
            "weight": 60,
            "height": 170,
            "primary_discipline": "running",
            "training_goal": "Mejorar LT2 para 10K",
            "notes": "perfil prompt",
            "created_at": "2026-01-01",
            "weights": [{"recorded_at": "2026-01-01", "weight": 60, "source": "baseline"}],
        },
    )
    athlete_id = athlete_response.json()["id"]

    session_response = client.post(
        "/api/sessions",
        headers=headers,
        json={
            "athlete_id": athlete_id,
            "performed_at": datetime(2026, 2, 5, 9, 0).isoformat(),
            "discipline": "running",
            "session_type": "test incremental",
            "goal": "test",
            "surface": "track",
            "temperature_c": 11,
            "comments": "reasoning prompt",
            "intervals": [
                {
                    "order_index": 1,
                    "duration_seconds": 240,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 148,
                    "heart_rate_max": 154,
                    "pace_seconds_per_km": 345,
                    "cadence": 175,
                    "rpe": 3,
                    "purpose": "LT1",
                    "lactate_sample": {"lactate_mmol": 1.4, "sample_delay_seconds": 30, "sample_timing_label": "tras 30s"},
                },
                {
                    "order_index": 2,
                    "duration_seconds": 240,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 160,
                    "heart_rate_max": 166,
                    "pace_seconds_per_km": 320,
                    "cadence": 178,
                    "rpe": 5,
                    "purpose": "LT2",
                    "lactate_sample": {"lactate_mmol": 2.5, "sample_delay_seconds": 30, "sample_timing_label": "tras 30s"},
                },
                {
                    "order_index": 3,
                    "duration_seconds": 240,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 173,
                    "heart_rate_max": 179,
                    "pace_seconds_per_km": 300,
                    "cadence": 180,
                    "rpe": 8,
                    "purpose": "VO2max",
                    "lactate_sample": {"lactate_mmol": 4.8, "sample_delay_seconds": 30, "sample_timing_label": "tras 30s"},
                },
            ],
        },
    )
    assert session_response.status_code == 201

    response = client.post(
        f"/api/athletes/{athlete_id}/reasoning-interpretation",
        headers=headers,
        json={
            "focus": "LT2",
            "question": "Que ajuste harías para el siguiente bloque",
            "provider": "local",
            "include_prompt": True,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "local"
    assert payload["model"] == "local-advisor"
    assert "Mejorar LT2 para 10K" in payload["goal_used"]
    assert "Pregunta a resolver" in payload["prompt"]
    assert payload["interpretation"].startswith("- Estado actual:")


def test_import_preview_and_commit(client, db_session):
    headers = auth_headers(client, db_session)
    create_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Import Runner",
            "date_of_birth": "1992-03-01",
            "sex": "female",
            "weight": 58,
            "height": 168,
            "primary_discipline": "running",
            "notes": "",
            "created_at": "2026-01-01",
            "weights": [],
        },
    )
    assert create_response.status_code == 201

    csv_content = (
        "Atleta,Fecha,Hora,Disciplina,Duracion,Lactato,FC Media,FC Maxima,Ritmo,Peso,Proposito\n"
        "Import Runner,2026-02-02,09:00,running,240,1.8,150,156,5:00,57.8,LT1\n"
        "Import Runner,2026-02-02,09:00,running,240,2.4,159,165,4:40,57.8,LT2\n"
    )
    preview_response = client.post(
        "/api/sessions/import/preview",
        headers=headers,
        files={"file": ("import.csv", csv_content, "text/csv")},
    )
    assert preview_response.status_code == 200
    preview_payload = preview_response.json()
    assert preview_payload["can_import"] is True
    assert preview_payload["suggested_mapping"]["athlete"] == "Atleta"

    commit_response = client.post(
        "/api/sessions/import/commit",
        headers=headers,
        data={
            "mapping": '{"athlete":"Atleta","date":"Fecha","time":"Hora","discipline":"Disciplina","interval_duration":"Duracion","lactate":"Lactato","hr_avg":"FC Media","hr_max":"FC Maxima","pace":"Ritmo","weight":"Peso","purpose":"Proposito"}'
        },
        files={"file": ("import.csv", csv_content, "text/csv")},
    )
    assert commit_response.status_code == 200
    payload = commit_response.json()
    assert payload["imported_sessions"] == 1
    assert payload["imported_intervals"] == 2
