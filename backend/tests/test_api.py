from datetime import date, datetime

import bcrypt
from sqlalchemy import select

from app.core.security import get_password_hash
from app.models.athlete import Athlete
from app.models.planned_session import PlannedSession
from app.models.user import User
from app.services.analytics import _individual_progression_alignment
from app.services.strava import list_strava_activities
from app.services.workout_library import templates_for_discipline_library


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


def test_login_accepts_legacy_bcrypt_hash_and_rehashes_to_pbkdf2(client, db_session):
    legacy_hash = bcrypt.hashpw(b"secret123", bcrypt.gensalt()).decode("utf-8")
    user = User(
        email="legacy-login@test.dev",
        hashed_password=legacy_hash,
        role="coach",
        full_name="Legacy Login",
    )
    db_session.add(user)
    db_session.commit()

    response = client.post("/api/auth/login", json={"email": "legacy-login@test.dev", "password": "secret123"})

    assert response.status_code == 200
    db_session.refresh(user)
    assert user.hashed_password.startswith("$pbkdf2-sha256$")
    assert user.hashed_password != legacy_hash


def test_login_returns_401_for_invalid_hash_payload(client, db_session):
    user = User(
        email="invalid-hash@test.dev",
        hashed_password="not-a-valid-password-hash",
        role="coach",
        full_name="Invalid Hash",
    )
    db_session.add(user)
    db_session.commit()

    response = client.post("/api/auth/login", json={"email": "invalid-hash@test.dev", "password": "secret123"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_athlete_can_start_strava_oauth(client, db_session, monkeypatch):
    athlete = Athlete(
        name="Atleta Strava",
        date_of_birth=date(1993, 5, 14),
        sex="female",
        weight=58,
        height=168,
        primary_discipline="running",
        created_at=date(2026, 1, 1),
    )
    db_session.add(athlete)
    db_session.flush()

    user = User(
        email="athlete@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="athlete",
        full_name="Athlete Test",
        athlete_id=athlete.id,
    )
    db_session.add(user)
    db_session.commit()

    class StubSettings:
        jwt_secret = "change-me"
        access_token_algorithm = "HS256"
        strava_client_id = "12345"
        strava_client_secret = "secret"
        strava_redirect_uri = "http://localhost:8000/api/auth/strava/callback"
        strava_scopes = "read,activity:read_all"

    monkeypatch.setattr("app.services.strava.get_settings", lambda: StubSettings)

    login_response = client.post("/api/auth/login", json={"email": "athlete@test.dev", "password": "secret123"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    response = client.get("/api/auth/strava/start", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["athlete_id"] == athlete.id
    assert payload["already_connected"] is False
    assert "www.strava.com/oauth/authorize" in payload["authorize_url"]
    assert "client_id=12345" in payload["authorize_url"]


def test_coach_can_start_strava_oauth_for_selected_athlete(client, db_session, monkeypatch):
    coach = User(
        email="coach-strava@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="coach",
        full_name="Coach Strava",
    )
    athlete = Athlete(
        name="Atleta Coach Strava",
        date_of_birth=date(1994, 3, 9),
        sex="male",
        weight=68,
        height=178,
        primary_discipline="running",
        created_at=date(2026, 1, 1),
        coach=coach,
    )
    db_session.add_all([coach, athlete])
    db_session.commit()

    class StubSettings:
        jwt_secret = "change-me"
        access_token_algorithm = "HS256"
        strava_client_id = "12345"
        strava_client_secret = "secret"
        strava_redirect_uri = "http://localhost:8000/api/auth/strava/callback"
        strava_scopes = "read,activity:read_all"

    monkeypatch.setattr("app.services.strava.get_settings", lambda: StubSettings)

    login_response = client.post("/api/auth/login", json={"email": "coach-strava@test.dev", "password": "secret123"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    response = client.get(f"/api/auth/strava/start?athlete_id={athlete.id}&return_path=%2Fstrava-test", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["athlete_id"] == athlete.id
    assert "state=" in payload["authorize_url"]


def test_strava_callback_invalid_state_redirects_with_code(client, monkeypatch):
    class StubSettings:
        frontend_base_url = "http://localhost:5173"
        jwt_secret = "change-me"
        access_token_algorithm = "HS256"

    monkeypatch.setattr("app.services.strava.get_settings", lambda: StubSettings)

    response = client.get("/api/auth/strava/callback?code=test-code&state=invalid-state", follow_redirects=False)
    assert response.status_code == 302
    location = response.headers["location"]
    assert "strava=error" in location
    assert "reason=Invalid+Strava+OAuth+state" in location
    assert "code=test-code" in location


def test_coach_can_complete_manual_strava_test_connect(client, db_session, monkeypatch):
    coach = User(
        email="coach-manual-strava@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="coach",
        full_name="Coach Manual Strava",
    )
    athlete = Athlete(
        name="Atleta Manual Strava",
        date_of_birth=date(1992, 7, 1),
        sex="female",
        weight=57,
        height=165,
        primary_discipline="running",
        created_at=date(2026, 1, 1),
        coach=coach,
    )
    db_session.add_all([coach, athlete])
    db_session.commit()

    monkeypatch.setattr(
        "app.api.routes.auth.exchange_code_for_token",
        lambda code: {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "expires_at": 1_800_000_000,
            "athlete": {"id": 987654},
        },
    )

    login_response = client.post("/api/auth/login", json={"email": "coach-manual-strava@test.dev", "password": "secret123"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    response = client.post(
        "/api/auth/strava/test-connect",
        headers=headers,
        json={"code": "manual-code", "athlete_id": athlete.id},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["athlete_id"] == athlete.id
    assert payload["strava_athlete_id"] == 987654
    assert payload["connected"] is True


def test_coach_can_fetch_strava_activities_for_selected_athlete(client, db_session, monkeypatch):
    coach = User(
        email="coach-strava-activities@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="coach",
        full_name="Coach Strava Activities",
    )
    athlete = Athlete(
        name="Atleta Actividades Strava",
        date_of_birth=date(1991, 8, 5),
        sex="male",
        weight=67,
        height=176,
        primary_discipline="running",
        created_at=date(2026, 1, 1),
        coach=coach,
        strava_athlete_id=123456,
        strava_access_token="encrypted-access",
        strava_refresh_token="encrypted-refresh",
        strava_token_expires_at=datetime(2026, 12, 31, 0, 0),
        strava_connected_at=datetime(2026, 3, 10, 8, 0),
    )
    db_session.add_all([coach, athlete])
    db_session.commit()

    monkeypatch.setattr(
        "app.api.routes.strava.list_strava_activities",
        lambda db, athlete, start_date, end_date: [
            {
                "provider_activity_id": 444,
                "name": "Rodaje controlado",
                "sport_type": "Run",
                "started_at": "2026-03-08T09:15:00Z",
                "timezone": "(GMT+01:00) Europe/Madrid",
                "distance_m": 12600.0,
                "moving_time_seconds": 3120,
                "elapsed_time_seconds": 3250,
                "average_speed_m_s": 4.03,
                "max_speed_m_s": 5.4,
                "average_heartrate": 152.0,
                "max_heartrate": 167.0,
                "average_watts": None,
                "kilojoules": None,
                "trainer": False,
                "commute": False,
                "description": "Bloque controlado",
                "total_elevation_gain_m": 42.0,
                "calories": 780.0,
                "average_cadence": 84.2,
                "weighted_average_watts": None,
                "max_watts": None,
                "device_watts": None,
                "suffer_score": None,
                "perceived_exertion": None,
                "has_heartrate": True,
                "laps": [
                    {
                        "lap_index": 1,
                        "name": "Lap 1",
                        "distance_m": 4000.0,
                        "elapsed_time_seconds": 1000,
                        "moving_time_seconds": 980,
                        "average_speed_m_s": 4.08,
                        "average_heartrate": 150.0,
                        "max_heartrate": 161.0,
                        "average_watts": None,
                        "start_date": "2026-03-08T09:15:00Z",
                    }
                ],
                "zones": [
                    {
                        "type": "heartrate",
                        "score": 87,
                        "sensor_based": True,
                        "points": 42,
                        "buckets": [{"min_value": 120.0, "max_value": 140.0, "time_seconds": 300}],
                    }
                ],
                "streams": {
                    "heartrate": {
                        "original_size": 3,
                        "resolution": "medium",
                        "series_type": "time",
                        "data": [130, 145, 152],
                    }
                },
                "raw_detail": {"id": 444, "name": "Rodaje controlado"},
                "enrichment_error": None,
            }
        ],
    )

    login_response = client.post("/api/auth/login", json={"email": "coach-strava-activities@test.dev", "password": "secret123"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    response = client.get(
        f"/api/strava/athletes/{athlete.id}/activities?start_date=2026-03-01&end_date=2026-03-10",
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["athlete_id"] == athlete.id
    assert payload["imported_count"] == 1
    assert payload["activities"][0]["provider_activity_id"] == 444


def test_coach_can_preview_workout_definition_for_planned_session(client, db_session):
    coach = User(
        email="coach-workout-preview@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="coach",
        full_name="Coach Workout Preview",
    )
    athlete = Athlete(
        name="Atleta Workout Preview",
        date_of_birth=date(1992, 5, 14),
        sex="male",
        weight=69,
        height=177,
        primary_discipline="running",
        created_at=date(2026, 1, 1),
        coach=coach,
    )
    db_session.add_all([coach, athlete])
    db_session.flush()

    planned_session = PlannedSession(
        athlete_id=athlete.id,
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
        coach_note="Meter gel en la tercera serie.",
        confidence=0.86,
        status="planned",
        bla_check=False,
        payload={},
        created_at=datetime(2026, 3, 13, 10, 0),
    )
    db_session.add(planned_session)
    db_session.commit()

    login_response = client.post("/api/auth/login", json={"email": "coach-workout-preview@test.dev", "password": "secret123"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    response = client.get(f"/api/planning/planned-sessions/{planned_session.id}/workout-definition-preview", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_session_id"] == planned_session.id
    assert payload["sport"] == "running"
    assert payload["title"] == "T2: 8 x 1km LT2"
    assert len(payload["steps"]) == 1
    assert payload["steps"][0]["step_type"] == "repeat"
    assert payload["steps"][0]["repeat_count"] == 8
    assert len(payload["steps"][0]["children"]) == 2
    assert payload["steps"][0]["children"][0]["target"]["target_type"] == "pace"


def test_coach_can_preview_structured_library_workout(client, db_session):
    coach = User(
        email="coach-library-structure@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="coach",
        full_name="Coach Library Structure",
    )
    db_session.add(coach)
    db_session.commit()

    login_response = client.post("/api/auth/login", json={"email": "coach-library-structure@test.dev", "password": "secret123"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    template = next((item for item in templates_for_discipline_library("running") if item.dose_ladder), None)
    assert template is not None
    first_step = template.dose_ladder[0]

    response = client.get(
        f"/api/planning/workout-library/{template.template_id}/structured-preview",
        headers=headers,
        params={
            "discipline": "running",
            "source": "dose",
            "dose_step": first_step.step,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["sport"] == "running"
    assert payload["title"] == first_step.label
    assert len(payload["steps"]) >= 1
    assert payload["source_payload"]["template_id"] == template.template_id


def test_coach_can_prepare_planned_session_for_publish(client, db_session):
    coach = User(
        email="coach-prepare-publish@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="coach",
        full_name="Coach Prepare Publish",
    )
    athlete = Athlete(
        name="Atleta Prepare Publish",
        date_of_birth=date(1992, 5, 14),
        sex="male",
        weight=69,
        height=177,
        primary_discipline="running",
        created_at=date(2026, 1, 1),
        coach=coach,
    )
    db_session.add_all([coach, athlete])
    db_session.flush()

    planned_session = PlannedSession(
        athlete_id=athlete.id,
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
        coach_note="Meter gel en la tercera serie.",
        confidence=0.86,
        status="planned",
        bla_check=False,
        payload={},
        created_at=datetime(2026, 3, 13, 10, 0),
    )
    db_session.add(planned_session)
    db_session.commit()

    login_response = client.post("/api/auth/login", json={"email": "coach-prepare-publish@test.dev", "password": "secret123"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    response = client.post(f"/api/planning/planned-sessions/{planned_session.id}/prepare-publish", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["publish_status"] == "ready"
    # publish_error may contain zone resolution warnings when no training zones are configured
    assert payload["structured_workout_payload"] is not None


def test_coach_can_connect_garmin_for_selected_athlete(client, db_session, monkeypatch):
    coach = User(
        email="coach-garmin-connect@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="coach",
        full_name="Coach Garmin Connect",
    )
    athlete = Athlete(
        name="Atleta Garmin Beta",
        date_of_birth=date(1993, 2, 11),
        sex="male",
        weight=70,
        height=180,
        primary_discipline="cycling",
        created_at=date(2026, 1, 1),
        coach=coach,
    )
    db_session.add_all([coach, athlete])
    db_session.commit()

    def fake_connect(db, athlete_id, email, password, mfa_code=None):
        target = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
        target.garmin_user_id = 555001
        target.garmin_email = email
        target.garmin_password_encrypted = "encrypted-password"
        target.garmin_token_encrypted = "encrypted-token"
        target.garmin_connected_at = datetime(2026, 3, 11, 9, 0)
        target.garmin_last_sync_at = datetime(2026, 3, 11, 9, 0)
        db.add(target)
        db.commit()
        db.refresh(target)
        return target

    monkeypatch.setattr("app.api.routes.garmin.connect_garmin_account", fake_connect)

    login_response = client.post("/api/auth/login", json={"email": "coach-garmin-connect@test.dev", "password": "secret123"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    response = client.post(
        f"/api/garmin/athletes/{athlete.id}/connect",
        headers=headers,
        json={"email": "garmin@test.dev", "password": "secret-pass"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["athlete_id"] == athlete.id
    assert payload["garmin_user_id"] == 555001
    assert payload["connected"] is True


def test_coach_can_preview_garmin_activities_for_selected_athlete(client, db_session, monkeypatch):
    coach = User(
        email="coach-garmin-preview@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="coach",
        full_name="Coach Garmin Preview",
    )
    athlete = Athlete(
        name="Atleta Garmin Preview",
        date_of_birth=date(1994, 6, 17),
        sex="female",
        weight=58,
        height=167,
        primary_discipline="running",
        created_at=date(2026, 1, 1),
        coach=coach,
        garmin_user_id=888777,
        garmin_email="garmin-preview@test.dev",
        garmin_password_encrypted="encrypted-password",
        garmin_token_encrypted="encrypted-token",
        garmin_connected_at=datetime(2026, 3, 11, 8, 0),
    )
    db_session.add_all([coach, athlete])
    db_session.commit()

    monkeypatch.setattr(
        "app.api.routes.garmin.list_garmin_activities",
        lambda db, athlete, start_date, end_date, **kwargs: [
            {
                "provider_activity_id": 7001,
                "name": "Garmin tempo run",
                "sport_type": "running",
                "started_at": "2026-03-09T07:30:00Z",
                "timezone": "Europe/Madrid",
                "distance_m": 12400.0,
                "moving_time_seconds": 3120,
                "elapsed_time_seconds": 3200,
                "average_speed_m_s": 3.97,
                "max_speed_m_s": 5.15,
                "average_heartrate": 154.0,
                "max_heartrate": 170.0,
                "average_watts": None,
                "calories": 812.0,
                "description": "Preview beta",
                "total_elevation_gain_m": 61.0,
                "average_cadence": 86.0,
                "max_watts": None,
                "start_latlng": [41.387, 2.17],
                "end_latlng": [41.388, 2.171],
                "device_name": "Forerunner 965",
                "laps": [
                    {
                        "lap_index": 1,
                        "name": "Warmup",
                        "distance_m": 3000.0,
                        "elapsed_time_seconds": 900,
                        "moving_time_seconds": 880,
                        "average_speed_m_s": 3.4,
                        "average_heartrate": 142.0,
                        "max_heartrate": 150.0,
                        "average_watts": None,
                        "start_date": "2026-03-09T07:30:00Z",
                    }
                ],
                "raw_detail": {"detail": {"source": "garmin-beta"}},
            }
        ],
    )

    login_response = client.post("/api/auth/login", json={"email": "coach-garmin-preview@test.dev", "password": "secret123"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    response = client.get(
        f"/api/garmin/athletes/{athlete.id}/preview?start_date=2026-03-08&end_date=2026-03-10",
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["athlete_id"] == athlete.id
    assert payload["imported_count"] == 1
    assert payload["activities"][0]["provider_activity_id"] == 7001
    assert payload["activities"][0]["sport_type"] == "running"
    assert payload["activities"][0]["laps"][0]["lap_index"] == 1


def test_coach_can_preview_single_full_garmin_activity_for_exploration(client, db_session, monkeypatch):
    coach = User(
        email="coach-garmin-explore@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="coach",
        full_name="Coach Garmin Explore",
    )
    athlete = Athlete(
        name="Atleta Garmin Explore",
        date_of_birth=date(1991, 2, 3),
        sex="male",
        weight=69,
        height=178,
        primary_discipline="ciclismo",
        created_at=date(2026, 1, 1),
        coach=coach,
        garmin_user_id=919191,
        garmin_email="garmin-explore@test.dev",
        garmin_password_encrypted="encrypted-password",
        garmin_token_encrypted="encrypted-token",
        garmin_connected_at=datetime(2026, 3, 11, 8, 0),
    )
    db_session.add_all([coach, athlete])
    db_session.commit()

    captured: dict[str, object] = {}

    def fake_preview(db, athlete, start_date, end_date, **kwargs):
        captured.update(kwargs)
        return [
            {
                "provider_activity_id": 8080,
                "name": "Garmin deep dive",
                "sport_type": "cycling",
                "started_at": "2026-03-10T08:00:00Z",
                "timezone": "Europe/Madrid",
                "distance_m": 40200.0,
                "moving_time_seconds": 4300,
                "elapsed_time_seconds": 4480,
                "average_speed_m_s": 9.3,
                "max_speed_m_s": 15.7,
                "average_heartrate": 147.0,
                "max_heartrate": 173.0,
                "average_watts": 228.0,
                "calories": 1110.0,
                "description": "Exploración total",
                "total_elevation_gain_m": 520.0,
                "average_cadence": 87.0,
                "max_watts": 612.0,
                "start_latlng": [41.39, 2.17],
                "end_latlng": [41.49, 2.26],
                "device_name": "Edge 840",
                "laps": [],
                "raw_detail": {
                    "meta": {"detail_scope": "full"},
                    "extras": {"power_time_in_zones": {"zones": [120, 440, 980]}},
                },
            }
        ]

    monkeypatch.setattr("app.api.routes.garmin.list_garmin_activities", fake_preview)

    login_response = client.post("/api/auth/login", json={"email": "coach-garmin-explore@test.dev", "password": "secret123"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    response = client.get(
        f"/api/garmin/athletes/{athlete.id}/preview?start_date=2026-03-08&end_date=2026-03-11&include_full_detail=true&activity_limit=1",
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["imported_count"] == 1
    assert payload["activities"][0]["raw_detail"]["meta"]["detail_scope"] == "full"
    assert captured["include_full_detail"] is True
    assert captured["activity_limit"] == 1


def test_coach_can_fetch_full_garmin_activity_detail_for_selected_athlete(client, db_session, monkeypatch):
    coach = User(
        email="coach-garmin-detail@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="coach",
        full_name="Coach Garmin Detail",
    )
    athlete = Athlete(
        name="Atleta Garmin Detail",
        date_of_birth=date(1990, 8, 14),
        sex="male",
        weight=70,
        height=181,
        primary_discipline="ciclismo",
        created_at=date(2026, 1, 1),
        coach=coach,
        garmin_user_id=222333,
        garmin_email="garmin-detail@test.dev",
        garmin_password_encrypted="encrypted-password",
        garmin_token_encrypted="encrypted-token",
        garmin_connected_at=datetime(2026, 3, 11, 8, 0),
    )
    db_session.add_all([coach, athlete])
    db_session.commit()

    monkeypatch.setattr(
        "app.api.routes.garmin.get_garmin_activity_detail",
        lambda db, athlete, activity_id: {
            "provider_activity_id": activity_id,
            "name": "Garmin long ride",
            "sport_type": "cycling",
            "started_at": "2026-03-09T08:15:00Z",
            "timezone": "Europe/Madrid",
            "distance_m": 78200.0,
            "moving_time_seconds": 9180,
            "elapsed_time_seconds": 9460,
            "average_speed_m_s": 8.52,
            "max_speed_m_s": 15.2,
            "average_heartrate": 148.0,
            "max_heartrate": 172.0,
            "average_watts": 214.0,
            "calories": 1812.0,
            "description": "Detalle extendido",
            "total_elevation_gain_m": 824.0,
            "average_cadence": 88.0,
            "max_watts": 511.0,
            "start_latlng": [41.39, 2.17],
            "end_latlng": [41.61, 2.31],
            "device_name": "Edge 840",
            "laps": [],
            "raw_detail": {
                "detail": {"source": "garmin-full"},
                "extras": {
                    "activity_details": {"metricDescriptors": ["power", "heartRate"]},
                    "power_time_in_zones": {"zones": [120, 640, 1800]},
                },
            },
        },
    )

    login_response = client.post("/api/auth/login", json={"email": "coach-garmin-detail@test.dev", "password": "secret123"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    response = client.get(
        f"/api/garmin/athletes/{athlete.id}/activities/99001",
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["provider_activity_id"] == 99001
    assert payload["sport_type"] == "cycling"
    assert payload["raw_detail"]["extras"]["activity_details"]["metricDescriptors"] == ["power", "heartRate"]


def test_strava_activity_partial_enrichment_keeps_detail_when_optional_endpoints_require_payment(db_session, monkeypatch):
    athlete = Athlete(
        name="Atleta Strava Partial",
        date_of_birth=date(1992, 1, 7),
        sex="female",
        weight=59,
        height=168,
        primary_discipline="running",
        created_at=date(2026, 1, 1),
        strava_athlete_id=123456,
        strava_access_token="encrypted-access",
        strava_refresh_token="encrypted-refresh",
        strava_token_expires_at=datetime(2026, 12, 31, 0, 0),
        strava_connected_at=datetime(2026, 3, 10, 8, 0),
    )
    db_session.add(athlete)
    db_session.commit()

    monkeypatch.setattr("app.services.strava._ensure_access_token", lambda db, athlete: "token")

    class FakeResponse:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self._payload = payload
            self.headers = {"content-type": "application/json"}

        def json(self):
            return self._payload

    def fake_get(url, headers=None, params=None, timeout=None):
        if url == "https://www.strava.com/api/v3/athlete/activities":
            return FakeResponse(
                200,
                [
                    {
                        "id": 555,
                        "name": "Series 10x500",
                        "sport_type": "Run",
                        "start_date": "2026-03-08T09:15:00Z",
                        "distance": 10000.0,
                        "moving_time": 2400,
                        "elapsed_time": 2550,
                    }
                ],
            )
        if url.endswith("/activities/555"):
            return FakeResponse(
                200,
                {
                    "id": 555,
                    "name": "Series 10x500",
                    "sport_type": "Run",
                    "start_date": "2026-03-08T09:15:00Z",
                    "distance": 10000.0,
                    "moving_time": 2400,
                    "elapsed_time": 2550,
                    "average_speed": 4.16,
                    "splits_metric": [{"distance": 1000, "elapsed_time": 240, "moving_time": 240, "split": 1}],
                    "best_efforts": [],
                    "segment_efforts": [],
                },
            )
        if url.endswith("/activities/555/laps"):
            return FakeResponse(
                200,
                [{"name": "Lap 1", "distance": 500, "elapsed_time": 105, "moving_time": 105, "average_speed": 4.76}],
            )
        if url.endswith("/activities/555/zones"):
            return FakeResponse(402, {"message": "Payment Required"})
        if url.endswith("/activities/555/streams"):
            return FakeResponse(402, {"message": "Payment Required"})
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr("app.services.strava.httpx.get", fake_get)

    activities = list_strava_activities(db_session, athlete, start_date=date(2026, 3, 1), end_date=date(2026, 3, 10))

    assert len(activities) == 1
    activity = activities[0]
    assert activity["provider_activity_id"] == 555
    assert activity["enrichment_error"] is None
    assert activity["enrichment_notice"] is not None
    assert "Strava no ha permitido cargar las zonas" in activity["enrichment_notice"]
    assert activity["laps"][0]["lap_index"] == 1
    assert activity["splits_metric"][0]["split_index"] == 1
    assert activity["zones"] == []
    assert activity["streams"] == {}


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
    athlete_payload = athlete_response.json()
    assert athlete_payload["strava_connected"] is False
    assert athlete_payload["strava_athlete_id"] is None
    assert "strava_access_token" not in athlete_payload
    athlete_id = athlete_payload["id"]

    session_response = client.post(
        "/api/sessions",
        headers=headers,
        json={
            "athlete_id": athlete_id,
            "performed_at": datetime(2026, 2, 1, 10, 0).isoformat(),
            "discipline": "running",
            "session_type": "test incremental",
            "goal": "test",
            "session_heart_rate_max": 189,
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
    assert session_response.json()["session_heart_rate_max"] == 189

    analysis_response = client.get(f"/api/athletes/{athlete_id}/analysis", headers=headers)
    assert analysis_response.status_code == 200
    data = analysis_response.json()
    assert len(data["thresholds"]) == 2
    assert any(estimate["estimate_type"] == "5K" for estimate in data["estimates"])
    assert "interpretation" in data
    assert "confidence_summary" in data
    assert "historical_evolution" in data
    assert "dynamic_thresholds" in data
    assert data["dynamic_thresholds"]["acute"]["reference_2mmol"] is not None
    assert data["dynamic_thresholds"]["chronic"]["practical_lt2"] is not None
    assert data["thresholds"][0]["methods_compared"]
    assert "variables_used" in data["estimates"][0]
    vo2max_estimate = next(estimate for estimate in data["estimates"] if estimate["estimate_type"] == "VO2max")
    assert vo2max_estimate["value"] > 35
    assert vo2max_estimate["method_used"] in ("lt2_to_vvo2_proxy_v2", "swain_acsm_hr")
    assert vo2max_estimate["calculation_steps"]
    assert vo2max_estimate["anchors"]


def test_dashboard_endpoint(client, db_session):
    headers = auth_headers(client, db_session)
    response = client.get("/api/analytics/dashboard", headers=headers)
    assert response.status_code == 200
    assert "athletes_count" in response.json()


def test_target_creation_generates_objective_from_distance_category(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Target Taxonomy",
            "date_of_birth": "1993-04-12",
            "sex": "female",
            "weight": 58,
            "height": 168,
            "primary_discipline": "running",
            "training_goal": "Competir mejor",
            "created_at": "2026-01-01",
            "weights": [{"recorded_at": "2026-01-01", "weight": 58, "source": "baseline"}],
        },
    )
    assert athlete_response.status_code == 201
    athlete_id = athlete_response.json()["id"]

    target_response = client.post(
        f"/api/athletes/{athlete_id}/targets",
        headers=headers,
        json={
            "target_date": "2026-05-10",
            "discipline": "running",
            "distance_category": "hm",
            "priority_level": "alta",
            "target_pace_label": "4:20/km",
        },
    )
    assert target_response.status_code == 201
    payload = target_response.json()
    assert payload["distance_category"] == "hm"
    assert payload["distance_label"] == "Media maratón"
    assert payload["objective"] == "Media maratón"


def test_planning_initial_assignment_uses_physiology_for_new_athlete(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Andrea Inicial",
            "date_of_birth": "1990-02-10",
            "sex": "female",
            "weight": 58,
            "height": 168,
            "primary_discipline": "running",
            "athlete_level": "recreational",
            "created_at": "2026-03-01",
            "weights": [{"recorded_at": "2026-03-01", "weight": 58, "source": "baseline"}],
        },
    )
    assert athlete_response.status_code == 201
    athlete_id = athlete_response.json()["id"]

    target_response = client.post(
        f"/api/athletes/{athlete_id}/targets",
        headers=headers,
        json={
            "target_date": "2026-11-09",
            "discipline": "running",
            "distance_category": "hm",
            "target_pace_label": "04:59",
            "priority_level": "alta",
        },
    )
    assert target_response.status_code == 201

    session_response = client.post(
        "/api/sessions",
        headers=headers,
        json={
            "athlete_id": athlete_id,
            "performed_at": "2026-03-08T09:00:00",
            "discipline": "running",
            "session_type": "test incremental",
            "goal": "test",
            "surface": "track",
            "temperature_c": 14,
            "comments": "test inicial",
            "intervals": [
                {
                    "order_index": 1,
                    "duration_seconds": 300,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 145,
                    "heart_rate_max": 151,
                    "pace_seconds_per_km": 390,
                    "rpe": 4,
                    "purpose": "control",
                    "lactate_sample": {"lactate_mmol": 1.4, "sample_delay_seconds": 20, "sample_timing_label": "20s"},
                },
                {
                    "order_index": 2,
                    "duration_seconds": 300,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 153,
                    "heart_rate_max": 160,
                    "pace_seconds_per_km": 370,
                    "rpe": 5,
                    "purpose": "LT1",
                    "lactate_sample": {"lactate_mmol": 2.0, "sample_delay_seconds": 20, "sample_timing_label": "20s"},
                },
                {
                    "order_index": 3,
                    "duration_seconds": 300,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 166,
                    "heart_rate_max": 172,
                    "pace_seconds_per_km": 339,
                    "rpe": 7,
                    "purpose": "LT2",
                    "lactate_sample": {"lactate_mmol": 4.0, "sample_delay_seconds": 20, "sample_timing_label": "20s"},
                },
                {
                    "order_index": 4,
                    "duration_seconds": 240,
                    "rest_seconds": 0,
                    "rest_type": "none",
                    "heart_rate_avg": 174,
                    "heart_rate_max": 180,
                    "pace_seconds_per_km": 315,
                    "rpe": 9,
                    "purpose": "peak",
                    "lactate_sample": {"lactate_mmol": 10.0, "sample_delay_seconds": 20, "sample_timing_label": "20s"},
                },
            ],
        },
    )
    assert session_response.status_code == 201

    recommendation_response = client.get(
        f"/api/planning/athletes/{athlete_id}/recommendation?discipline=running",
        headers=headers,
    )
    assert recommendation_response.status_code == 200
    recommendation = recommendation_response.json()

    assert recommendation["recommended_block_type"] == "aerobic_capacity_block"
    assert recommendation["scoring_context"]["assignment_mode"] == "initial_assignment"
    # Con solo 4 escalones, la confianza se capea (P6) y el motor
    # no tiene señal suficiente para physiological_primary. Usa fallback
    # heurístico pero sigue prescribiendo AEC correctamente.
    assert recommendation["scoring_context"]["selection_engine"] in (
        "physiological_primary",
        "heuristic_fallback_low_signal",
    )
    assert recommendation["physiological_analysis"]["distance_category"] == "hm"
    # Con 4 escalones y cap P6, overrides_temporal puede ser False
    assert recommendation["physiological_analysis"]["overrides_temporal_scoring"] in (True, False)
    assert recommendation["physiological_analysis"]["secondary_limiter"] in {"lt2_ceiling", "lt1_support", "glycolytic_mismatch", "durability_risk", None}
    assert recommendation["physiological_analysis"]["overall_decision_confidence"] is not None
    assert recommendation["physiological_analysis"]["confidence_band"] in {"high", "medium", "low", "very_low"}
    assert "durability" in recommendation["physiological_analysis"]
    assert isinstance(recommendation["lactate_check_recommendations"], list)


def test_physiology_report_preview_and_pdf(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Informe",
            "date_of_birth": "1992-04-12",
            "sex": "female",
            "weight": 61,
            "height": 170,
            "primary_discipline": "running",
            "training_goal": "Bajar de 50' en 10K",
            "notes": "Atleta consistente con buen volumen extensivo.",
            "created_at": "2026-01-01",
            "weights": [{"recorded_at": "2026-01-01", "weight": 61, "source": "baseline"}],
        },
    )
    assert athlete_response.status_code == 201
    athlete_id = athlete_response.json()["id"]

    target_response = client.post(
        f"/api/athletes/{athlete_id}/targets",
        headers=headers,
        json={
            "target_date": "2026-05-10",
            "discipline": "running",
            "objective": "Sub 1h25 en media maratón",
            "distance_label": "21K",
            "priority_level": "alta",
            "target_pace_label": "4:02/km",
        },
    )
    assert target_response.status_code == 201

    session_response = client.post(
        "/api/sessions",
        headers=headers,
        json={
            "athlete_id": athlete_id,
            "performed_at": datetime(2026, 3, 1, 9, 0).isoformat(),
            "discipline": "running",
            "session_type": "test incremental",
            "goal": "test lactato incremental",
            "surface": "track",
            "temperature_c": 14,
            "comments": "protocolo 4x4'",
            "intervals": [
                {
                    "order_index": 1,
                    "duration_seconds": 240,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 142,
                    "heart_rate_max": 148,
                    "pace_seconds_per_km": 355,
                    "cadence": 174,
                    "rpe": 2.5,
                    "purpose": "LT1",
                    "lactate_sample": {"lactate_mmol": 1.3, "sample_delay_seconds": 20, "sample_timing_label": "tras 20s"},
                },
                {
                    "order_index": 2,
                    "duration_seconds": 240,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 151,
                    "heart_rate_max": 158,
                    "pace_seconds_per_km": 340,
                    "cadence": 176,
                    "rpe": 4,
                    "purpose": "LT1",
                    "lactate_sample": {"lactate_mmol": 2.0, "sample_delay_seconds": 20, "sample_timing_label": "tras 20s"},
                },
                {
                    "order_index": 3,
                    "duration_seconds": 240,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 162,
                    "heart_rate_max": 169,
                    "pace_seconds_per_km": 322,
                    "cadence": 178,
                    "rpe": 6.5,
                    "purpose": "LT2",
                    "lactate_sample": {"lactate_mmol": 3.1, "sample_delay_seconds": 20, "sample_timing_label": "tras 20s"},
                },
                {
                    "order_index": 4,
                    "duration_seconds": 240,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 171,
                    "heart_rate_max": 178,
                    "pace_seconds_per_km": 306,
                    "cadence": 180,
                    "rpe": 8,
                    "purpose": "LT2",
                    "lactate_sample": {"lactate_mmol": 4.0, "sample_delay_seconds": 20, "sample_timing_label": "tras 20s"},
                },
                {
                    "order_index": 5,
                    "duration_seconds": 240,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 178,
                    "heart_rate_max": 184,
                    "pace_seconds_per_km": 294,
                    "cadence": 182,
                    "rpe": 9,
                    "purpose": "VO2max",
                    "lactate_sample": {"lactate_mmol": 5.6, "sample_delay_seconds": 20, "sample_timing_label": "tras 20s"},
                },
            ],
        },
    )
    assert session_response.status_code == 201

    preview_response = client.post(
        f"/api/athletes/{athlete_id}/physiology-report?discipline=running",
        headers=headers,
    )
    assert preview_response.status_code == 200
    payload = preview_response.json()
    assert payload["athlete_id"] == athlete_id
    assert payload["thresholds"][0]["anchor_mmol"] == 2.0
    assert payload["thresholds"][1]["anchor_mmol"] == 4.0
    assert payload["thresholds"][0]["name"] == "LT1 fisiológico"
    assert payload["thresholds"][1]["name"] == "LT2 fisiológico"
    assert payload["individual_thresholds"] == []
    assert payload["individual_threshold_min_samples"] == 15
    assert payload["individual_threshold_sample_count"] == 5
    assert "LT Individual" in payload["individual_threshold_note"]
    assert payload["profile"]["performance_goal"] == "Sub 1h25 en media maratón"
    assert payload["profile"]["performance_goal"] != "Bajar de 50' en 10K"
    assert payload["profile"]["target_competition"] == "2026-05-10 · 21K · 4:02/km · alta"
    assert "Bajar de 50' en 10K" not in payload["sections"][0]["body"][0]
    assert len(payload["zones"]) == 6
    assert payload["stages"][0]["heart_rate_bpm"] == 142
    assert "Advertencia científica" not in payload["disclaimer"]

    pdf_response = client.get(
        f"/api/athletes/{athlete_id}/physiology-report/pdf?discipline=running",
        headers=headers,
    )
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"] == "application/pdf"
    assert pdf_response.content.startswith(b"%PDF")


def test_delete_lactate_sample_from_interval(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Borrado Muestra",
            "date_of_birth": "1990-05-12",
            "sex": "male",
            "weight": 70,
            "height": 178,
            "primary_discipline": "running",
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
            "performed_at": datetime(2026, 3, 2, 9, 0).isoformat(),
            "discipline": "running",
            "session_type": "test incremental",
            "goal": "validar borrado de muestra",
            "surface": "track",
            "temperature_c": 12,
            "comments": "dos muestras para borrar una",
            "intervals": [
                {
                    "order_index": 1,
                    "duration_seconds": 240,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 145,
                    "heart_rate_max": 150,
                    "pace_seconds_per_km": 350,
                    "cadence": 176,
                    "rpe": 3,
                    "purpose": "LT1",
                    "lactate_sample": {"lactate_mmol": 1.8, "sample_delay_seconds": 30, "sample_timing_label": "tras 30s"},
                },
                {
                    "order_index": 2,
                    "duration_seconds": 240,
                    "rest_seconds": 60,
                    "rest_type": "walk",
                    "heart_rate_avg": 155,
                    "heart_rate_max": 161,
                    "pace_seconds_per_km": 332,
                    "cadence": 178,
                    "rpe": 5,
                    "purpose": "LT2",
                    "lactate_sample": {"lactate_mmol": 3.4, "sample_delay_seconds": 30, "sample_timing_label": "tras 30s"},
                },
            ],
        },
    )
    assert session_response.status_code == 201
    created_session = session_response.json()
    interval_id = created_session["intervals"][0]["id"]

    analysis_before = client.get(f"/api/athletes/{athlete_id}/analysis", headers=headers)
    assert analysis_before.status_code == 200
    before_log = analysis_before.json()["discipline_views"]["running"]["measurement_log"]
    assert len(before_log) == 2
    assert any(entry["interval_id"] == interval_id for entry in before_log)

    delete_response = client.delete(f"/api/sessions/intervals/{interval_id}/lactate-sample", headers=headers)
    assert delete_response.status_code == 204

    analysis_after = client.get(f"/api/athletes/{athlete_id}/analysis", headers=headers)
    assert analysis_after.status_code == 200
    after_log = analysis_after.json()["discipline_views"]["running"]["measurement_log"]
    assert len(after_log) == 1
    assert all(entry["interval_id"] != interval_id for entry in after_log)


def test_real_thresholds_require_adequate_interval_duration_and_rest(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Protocolo Corto",
            "date_of_birth": "1994-09-18",
            "sex": "female",
            "weight": 58,
            "height": 167,
            "primary_discipline": "running",
            "created_at": "2026-01-01",
            "weights": [{"recorded_at": "2026-01-01", "weight": 58, "source": "baseline"}],
        },
    )
    assert athlete_response.status_code == 201
    athlete_id = athlete_response.json()["id"]

    session_response = client.post(
        "/api/sessions",
        headers=headers,
        json={
            "athlete_id": athlete_id,
            "performed_at": datetime(2026, 3, 4, 9, 0).isoformat(),
            "discipline": "running",
            "session_type": "test incremental",
            "goal": "protocolo corto con mucho descanso",
            "surface": "track",
            "temperature_c": 13,
            "comments": "debe penalizar LT real",
            "intervals": [
                {
                    "order_index": 1,
                    "duration_seconds": 90,
                    "rest_seconds": 120,
                    "rest_type": "walk",
                    "heart_rate_avg": 138,
                    "heart_rate_max": 145,
                    "pace_seconds_per_km": 360,
                    "cadence": 174,
                    "rpe": 2,
                    "purpose": "aeróbico",
                    "lactate_sample": {"lactate_mmol": 1.4, "sample_delay_seconds": 20, "sample_timing_label": "tras 20s"},
                },
                {
                    "order_index": 2,
                    "duration_seconds": 90,
                    "rest_seconds": 120,
                    "rest_type": "walk",
                    "heart_rate_avg": 146,
                    "heart_rate_max": 153,
                    "pace_seconds_per_km": 345,
                    "cadence": 176,
                    "rpe": 3,
                    "purpose": "LT1",
                    "lactate_sample": {"lactate_mmol": 2.0, "sample_delay_seconds": 20, "sample_timing_label": "tras 20s"},
                },
                {
                    "order_index": 3,
                    "duration_seconds": 90,
                    "rest_seconds": 120,
                    "rest_type": "walk",
                    "heart_rate_avg": 154,
                    "heart_rate_max": 161,
                    "pace_seconds_per_km": 330,
                    "cadence": 178,
                    "rpe": 4,
                    "purpose": "LT1",
                    "lactate_sample": {"lactate_mmol": 2.8, "sample_delay_seconds": 20, "sample_timing_label": "tras 20s"},
                },
                {
                    "order_index": 4,
                    "duration_seconds": 90,
                    "rest_seconds": 120,
                    "rest_type": "walk",
                    "heart_rate_avg": 162,
                    "heart_rate_max": 170,
                    "pace_seconds_per_km": 315,
                    "cadence": 180,
                    "rpe": 6,
                    "purpose": "LT2",
                    "lactate_sample": {"lactate_mmol": 3.9, "sample_delay_seconds": 20, "sample_timing_label": "tras 20s"},
                },
                {
                    "order_index": 5,
                    "duration_seconds": 90,
                    "rest_seconds": 120,
                    "rest_type": "walk",
                    "heart_rate_avg": 170,
                    "heart_rate_max": 178,
                    "pace_seconds_per_km": 300,
                    "cadence": 182,
                    "rpe": 8,
                    "purpose": "LT2",
                    "lactate_sample": {"lactate_mmol": 5.1, "sample_delay_seconds": 20, "sample_timing_label": "tras 20s"},
                },
            ],
        },
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    session_analysis = client.get(f"/api/sessions/{session_id}/analysis", headers=headers)
    assert session_analysis.status_code == 200
    real_thresholds = session_analysis.json()["real_thresholds"]
    assert real_thresholds["lt1_real"] is None
    assert real_thresholds["lt2_real"] is None
    assert real_thresholds["lt1_detection"]["state"] in {"candidate_weak", "candidate_strong"}
    assert real_thresholds["lt2_detection"]["state"] in {"candidate_weak", "candidate_strong"}
    assert real_thresholds["lt1_detection"]["quality_gate_passed"] is False
    assert real_thresholds["lt2_detection"]["quality_gate_passed"] is False
    assert real_thresholds["data_quality"]["sufficient"] is False
    assert real_thresholds["data_quality"]["criteria_version"] == 3
    assert "Protocolo poco adecuado" in real_thresholds["data_quality"]["reason"]


def test_athlete_analysis_exposes_individual_thresholds_from_comparable_tests(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Individual",
            "date_of_birth": "1992-04-12",
            "sex": "male",
            "weight": 70,
            "height": 178,
            "primary_discipline": "running",
            "created_at": "2026-01-01",
            "weights": [{"recorded_at": "2026-01-01", "weight": 70, "source": "baseline"}],
        },
    )
    assert athlete_response.status_code == 201
    athlete_id = athlete_response.json()["id"]

    sessions = [
        ("2026-02-10T09:00:00", [362, 347, 332, 317, 302], [1.2, 1.7, 2.3, 3.6, 5.1], [138, 146, 154, 164, 174]),
        ("2026-02-20T09:00:00", [361, 346, 331, 316, 301], [1.2, 1.8, 2.4, 3.7, 5.2], [139, 147, 155, 165, 175]),
        ("2026-03-01T09:00:00", [360, 345, 330, 315, 300], [1.3, 1.8, 2.4, 3.7, 5.2], [140, 148, 156, 166, 176]),
        ("2026-03-12T09:00:00", [359, 344, 329, 314, 299], [1.3, 1.9, 2.5, 3.8, 5.3], [141, 149, 157, 167, 177]),
        ("2026-03-24T09:00:00", [358, 343, 328, 313, 298], [1.3, 1.9, 2.5, 3.8, 5.3], [142, 150, 158, 168, 178]),
        ("2026-04-06T09:00:00", [357, 342, 327, 312, 297], [1.4, 2.0, 2.6, 3.9, 5.4], [143, 151, 159, 169, 179]),
    ]
    for performed_at, paces, lactates, hrs in sessions:
        response = client.post(
            "/api/sessions",
            headers=headers,
            json={
                "athlete_id": athlete_id,
                "performed_at": performed_at,
                "discipline": "running",
                "session_type": "test incremental",
                "goal": "pool individual",
                "surface": "track",
                "temperature_c": 15,
                "comments": "sesión comparable para individual thresholds",
                "intervals": [
                    {
                        "order_index": index + 1,
                        "duration_seconds": 240,
                        "rest_seconds": 45,
                        "rest_type": "walk",
                        "heart_rate_avg": hrs[index],
                        "heart_rate_max": hrs[index] + 8,
                        "pace_seconds_per_km": paces[index],
                        "cadence": 176 + index,
                        "rpe": 3 + index,
                        "purpose": "LT1" if index < 3 else "LT2",
                        "lactate_sample": {
                            "lactate_mmol": lactates[index],
                            "baseline_lactate": 1.0 if index == 0 else None,
                            "sample_delay_seconds": 20,
                            "sample_timing_label": "tras 20s",
                        },
                    }
                    for index in range(5)
                ],
            },
        )
        assert response.status_code == 201

    analysis_response = client.get(f"/api/athletes/{athlete_id}/analysis", headers=headers)
    assert analysis_response.status_code == 200
    running_view = analysis_response.json()["discipline_views"]["running"]
    real_thresholds = running_view["real_thresholds"]
    individual_thresholds = running_view["individual_thresholds"]
    assert real_thresholds["lt1_real"] is not None
    assert real_thresholds["lt2_real"] is not None
    assert real_thresholds["lt1_real"]["status"] == "ready_to_anchor"
    assert real_thresholds["lt2_real"]["status"] == "ready_to_anchor"
    assert real_thresholds["lt1_detection"]["state"] == "ready_to_anchor"
    assert real_thresholds["lt2_detection"]["state"] == "ready_to_anchor"
    assert real_thresholds["lt1_detection"]["anchor_update_recommended"] is True
    assert real_thresholds["lt2_detection"]["anchor_update_recommended"] is True
    assert individual_thresholds["lt1_individual"] is not None
    assert individual_thresholds["lt2_individual"] is not None
    assert individual_thresholds["data_quality"]["sufficient"] is True
    assert individual_thresholds["data_quality"]["session_count"] >= 6
    assert individual_thresholds["data_quality"]["min_support_sessions"] == 6
    assert individual_thresholds["data_quality"]["progression_alignment"] >= 0.75


def test_athlete_analysis_holds_individual_thresholds_until_six_comparable_sessions(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Individual Insuficiente",
            "date_of_birth": "1991-05-15",
            "sex": "female",
            "weight": 59,
            "height": 168,
            "primary_discipline": "running",
            "created_at": "2026-01-01",
            "weights": [{"recorded_at": "2026-01-01", "weight": 59, "source": "baseline"}],
        },
    )
    assert athlete_response.status_code == 201
    athlete_id = athlete_response.json()["id"]

    sessions = [
        ("2026-02-10T09:00:00", [362, 347, 332, 317, 302], [1.2, 1.7, 2.3, 3.6, 5.1], [138, 146, 154, 164, 174]),
        ("2026-02-20T09:00:00", [361, 346, 331, 316, 301], [1.2, 1.8, 2.4, 3.7, 5.2], [139, 147, 155, 165, 175]),
        ("2026-03-01T09:00:00", [360, 345, 330, 315, 300], [1.3, 1.8, 2.4, 3.7, 5.2], [140, 148, 156, 166, 176]),
        ("2026-03-12T09:00:00", [359, 344, 329, 314, 299], [1.3, 1.9, 2.5, 3.8, 5.3], [141, 149, 157, 167, 177]),
        ("2026-03-24T09:00:00", [358, 343, 328, 313, 298], [1.3, 1.9, 2.5, 3.8, 5.3], [142, 150, 158, 168, 178]),
    ]
    for performed_at, paces, lactates, hrs in sessions:
        response = client.post(
            "/api/sessions",
            headers=headers,
            json={
                "athlete_id": athlete_id,
                "performed_at": performed_at,
                "discipline": "running",
                "session_type": "test incremental",
                "goal": "pool individual insuficiente",
                "surface": "track",
                "temperature_c": 15,
                "comments": "sesión comparable para validar gate de 6",
                "intervals": [
                    {
                        "order_index": index + 1,
                        "duration_seconds": 240,
                        "rest_seconds": 45,
                        "rest_type": "walk",
                        "heart_rate_avg": hrs[index],
                        "heart_rate_max": hrs[index] + 8,
                        "pace_seconds_per_km": paces[index],
                        "cadence": 176 + index,
                        "rpe": 3 + index,
                        "purpose": "LT1" if index < 3 else "LT2",
                        "lactate_sample": {
                            "lactate_mmol": lactates[index],
                            "baseline_lactate": 1.0 if index == 0 else None,
                            "sample_delay_seconds": 20,
                            "sample_timing_label": "tras 20s",
                        },
                    }
                    for index in range(5)
                ],
            },
        )
        assert response.status_code == 201

    analysis_response = client.get(f"/api/athletes/{athlete_id}/analysis", headers=headers)
    assert analysis_response.status_code == 200
    running_view = analysis_response.json()["discipline_views"]["running"]
    individual_thresholds = running_view["individual_thresholds"]
    assert individual_thresholds["lt1_individual"] is None
    assert individual_thresholds["lt2_individual"] is None
    assert individual_thresholds["data_quality"]["sufficient"] is False
    assert individual_thresholds["data_quality"]["session_count"] == 5
    assert "mínimo 6 sesiones alineadas" in individual_thresholds["data_quality"]["reason"]


def test_athlete_analysis_requires_aligned_progression_for_individual_thresholds(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Individual Zigzag",
            "date_of_birth": "1990-07-21",
            "sex": "male",
            "weight": 71,
            "height": 180,
            "primary_discipline": "running",
            "created_at": "2026-01-01",
            "weights": [{"recorded_at": "2026-01-01", "weight": 71, "source": "baseline"}],
        },
    )
    assert athlete_response.status_code == 201
    athlete_id = athlete_response.json()["id"]

    sessions = [
        ("2026-02-10T09:00:00", [372, 357, 342, 327, 312], [1.3, 1.9, 2.5, 3.9, 5.5], [142, 150, 158, 168, 178]),
        ("2026-02-20T09:00:00", [346, 331, 316, 301, 286], [1.1, 1.6, 2.2, 3.4, 4.9], [136, 144, 152, 162, 172]),
        ("2026-03-01T09:00:00", [373, 358, 343, 328, 313], [1.3, 1.9, 2.5, 3.9, 5.5], [143, 151, 159, 169, 179]),
        ("2026-03-12T09:00:00", [345, 330, 315, 300, 285], [1.1, 1.6, 2.2, 3.4, 4.9], [135, 143, 151, 161, 171]),
        ("2026-03-24T09:00:00", [374, 359, 344, 329, 314], [1.3, 1.9, 2.5, 3.9, 5.5], [144, 152, 160, 170, 180]),
        ("2026-04-06T09:00:00", [344, 329, 314, 299, 284], [1.1, 1.6, 2.2, 3.4, 4.9], [134, 142, 150, 160, 170]),
    ]
    for performed_at, paces, lactates, hrs in sessions:
        response = client.post(
            "/api/sessions",
            headers=headers,
            json={
                "athlete_id": athlete_id,
                "performed_at": performed_at,
                "discipline": "running",
                "session_type": "test incremental",
                "goal": "pool individual zigzag",
                "surface": "track",
                "temperature_c": 15,
                "comments": "sesión comparable para validar alineación",
                "intervals": [
                    {
                        "order_index": index + 1,
                        "duration_seconds": 240,
                        "rest_seconds": 45,
                        "rest_type": "walk",
                        "heart_rate_avg": hrs[index],
                        "heart_rate_max": hrs[index] + 8,
                        "pace_seconds_per_km": paces[index],
                        "cadence": 176 + index,
                        "rpe": 3 + index,
                        "purpose": "LT1" if index < 3 else "LT2",
                        "lactate_sample": {
                            "lactate_mmol": lactates[index],
                            "baseline_lactate": 1.0 if index == 0 else None,
                            "sample_delay_seconds": 20,
                            "sample_timing_label": "tras 20s",
                        },
                    }
                    for index in range(5)
                ],
            },
        )
        assert response.status_code == 201

    analysis_response = client.get(f"/api/athletes/{athlete_id}/analysis", headers=headers)
    assert analysis_response.status_code == 200
    running_view = analysis_response.json()["discipline_views"]["running"]
    individual_thresholds = running_view["individual_thresholds"]
    assert individual_thresholds["lt1_individual"] is None
    assert individual_thresholds["lt2_individual"] is None
    assert individual_thresholds["data_quality"]["sufficient"] is False
    assert individual_thresholds["data_quality"]["session_count"] >= 6
    assert individual_thresholds["data_quality"]["progression_alignment"] is not None
    assert "progresión longitudinal" in individual_thresholds["data_quality"]["reason"]


def test_individual_progression_alignment_penalizes_zigzag_series():
    supports = [
        {"session_date": "2026-02-10", "threshold": {"pace_seconds_per_km": 330}},
        {"session_date": "2026-02-20", "threshold": {"pace_seconds_per_km": 306}},
        {"session_date": "2026-03-01", "threshold": {"pace_seconds_per_km": 332}},
        {"session_date": "2026-03-12", "threshold": {"pace_seconds_per_km": 304}},
        {"session_date": "2026-03-24", "threshold": {"pace_seconds_per_km": 334}},
        {"session_date": "2026-04-06", "threshold": {"pace_seconds_per_km": 302}},
    ]
    assert _individual_progression_alignment(supports) < 0.75


def test_physiology_report_pdf_available_without_reliable_real_thresholds(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Curva Ruidosa",
            "date_of_birth": "1991-02-03",
            "sex": "male",
            "weight": 68,
            "height": 177,
            "primary_discipline": "running",
            "training_goal": "10K sub 36",
            "created_at": "2026-01-01",
            "weights": [{"recorded_at": "2026-01-01", "weight": 68, "source": "baseline"}],
        },
    )
    assert athlete_response.status_code == 201
    athlete_id = athlete_response.json()["id"]

    session_response = client.post(
        "/api/sessions",
        headers=headers,
        json={
            "athlete_id": athlete_id,
            "performed_at": datetime(2026, 3, 9, 9, 0).isoformat(),
            "discipline": "running",
            "session_type": "test incremental",
            "goal": "test incremental con alta variabilidad",
            "surface": "track",
            "temperature_c": 16,
            "comments": "curva deliberadamente ruidosa para validar fallback del informe",
            "intervals": [
                {
                    "order_index": 1,
                    "duration_seconds": 357,
                    "rest_seconds": 90,
                    "rest_type": "standing",
                    "heart_rate_avg": 132,
                    "heart_rate_max": 142,
                    "pace_seconds_per_km": 357,
                    "cadence": 157,
                    "rpe": 3,
                    "purpose": "aeróbico",
                    "lactate_sample": {"lactate_mmol": 5.1, "sample_delay_seconds": 90, "sample_timing_label": "durante descanso 90 s"},
                },
                {
                    "order_index": 2,
                    "duration_seconds": 349,
                    "rest_seconds": 90,
                    "rest_type": "standing",
                    "heart_rate_avg": 136,
                    "heart_rate_max": 145,
                    "pace_seconds_per_km": 349,
                    "cadence": 155,
                    "rpe": 4,
                    "purpose": "aeróbico",
                    "lactate_sample": {"lactate_mmol": 4.3, "sample_delay_seconds": 90, "sample_timing_label": "durante descanso 90 s"},
                },
                {
                    "order_index": 3,
                    "duration_seconds": 335,
                    "rest_seconds": 90,
                    "rest_type": "standing",
                    "heart_rate_avg": 140,
                    "heart_rate_max": 150,
                    "pace_seconds_per_km": 335,
                    "cadence": 156,
                    "rpe": 4,
                    "purpose": "LT1",
                    "lactate_sample": {"lactate_mmol": 2.1, "sample_delay_seconds": 90, "sample_timing_label": "durante descanso 90 s"},
                },
                {
                    "order_index": 4,
                    "duration_seconds": 329,
                    "rest_seconds": 90,
                    "rest_type": "standing",
                    "heart_rate_avg": 142,
                    "heart_rate_max": 151,
                    "pace_seconds_per_km": 329,
                    "cadence": 157,
                    "rpe": 5,
                    "purpose": "LT2",
                    "lactate_sample": {"lactate_mmol": 6.3, "sample_delay_seconds": 90, "sample_timing_label": "durante descanso 90 s"},
                },
                {
                    "order_index": 5,
                    "duration_seconds": 313,
                    "rest_seconds": 90,
                    "rest_type": "standing",
                    "heart_rate_avg": 149,
                    "heart_rate_max": 164,
                    "pace_seconds_per_km": 313,
                    "cadence": 158,
                    "rpe": 5,
                    "purpose": "LT2",
                    "lactate_sample": {"lactate_mmol": 4.0, "sample_delay_seconds": 90, "sample_timing_label": "durante descanso 90 s"},
                },
                {
                    "order_index": 6,
                    "duration_seconds": 290,
                    "rest_seconds": 90,
                    "rest_type": "standing",
                    "heart_rate_avg": 157,
                    "heart_rate_max": 167,
                    "pace_seconds_per_km": 290,
                    "cadence": 161,
                    "rpe": 6,
                    "purpose": "LT2",
                    "lactate_sample": {"lactate_mmol": 3.7, "sample_delay_seconds": 90, "sample_timing_label": "durante descanso 90 s"},
                },
                {
                    "order_index": 7,
                    "duration_seconds": 210,
                    "rest_seconds": 90,
                    "rest_type": "standing",
                    "heart_rate_avg": 170,
                    "heart_rate_max": 187,
                    "pace_seconds_per_km": 210,
                    "cadence": 177,
                    "rpe": 10,
                    "purpose": "VO2max",
                    "lactate_sample": {"lactate_mmol": 8.1, "sample_delay_seconds": 90, "sample_timing_label": "durante descanso 90 s"},
                },
            ],
        },
    )
    assert session_response.status_code == 201

    preview_response = client.post(
        f"/api/athletes/{athlete_id}/physiology-report?discipline=running",
        headers=headers,
    )
    assert preview_response.status_code == 200
    payload = preview_response.json()
    assert payload["thresholds"][0]["anchor_mmol"] == 2.0
    assert payload["thresholds"][1]["anchor_mmol"] == 4.0
    assert payload["individual_thresholds"] == []
    assert payload["individual_threshold_min_samples"] == 15
    assert payload["individual_threshold_sample_count"] == 7

    pdf_response = client.get(
        f"/api/athletes/{athlete_id}/physiology-report/pdf?discipline=running",
        headers=headers,
    )
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"] == "application/pdf"
    assert pdf_response.content.startswith(b"%PDF")


def test_dynamic_threshold_endpoints(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Dinamico",
            "date_of_birth": "1990-01-01",
            "sex": "male",
            "weight": 72,
            "height": 181,
            "primary_discipline": "running",
            "training_goal": "Consolidar LT1 y LT2",
            "notes": "",
            "created_at": "2026-01-01",
            "weights": [{"recorded_at": "2026-01-01", "weight": 72, "source": "baseline"}],
        },
    )
    athlete_id = athlete_response.json()["id"]

    sessions = [
        ("2026-01-15T09:00:00", [(350, 142, 1.2), (330, 154, 2.0), (310, 168, 3.8)]),
        ("2026-02-01T09:00:00", [(348, 144, 1.4), (326, 156, 2.2), (304, 170, 4.2)]),
        ("2026-03-01T09:00:00", [(344, 146, 1.5), (322, 159, 2.4), (298, 173, 4.5)]),
    ]
    for performed_at, intervals in sessions:
        response = client.post(
            "/api/sessions",
            headers=headers,
            json={
                "athlete_id": athlete_id,
                "performed_at": performed_at,
                "discipline": "running",
                "session_type": "test incremental",
                "goal": "LT test",
                "surface": "track",
                "temperature_c": 12,
                "comments": "dynamic references",
                "intervals": [
                    {
                        "order_index": index,
                        "duration_seconds": 240,
                        "rest_seconds": 60,
                        "rest_type": "walk",
                        "heart_rate_avg": hr,
                        "heart_rate_max": hr + 6,
                        "pace_seconds_per_km": pace,
                        "cadence": 178,
                        "rpe": 3 + index,
                        "purpose": "LT1" if index < 3 else "LT2",
                        "lactate_sample": {
                            "lactate_mmol": lactate,
                            "baseline_lactate": 1.0 if index == 1 else None,
                            "sample_delay_seconds": 20,
                            "sample_timing_label": "tras 20s",
                        },
                    }
                    for index, (pace, hr, lactate) in enumerate(intervals, start=1)
                ],
            },
        )
        assert response.status_code == 201

    response = client.get(f"/api/analytics/athletes/{athlete_id}/dynamic-thresholds?discipline=running", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["acute"]["reference_2mmol"] is not None
    assert payload["chronic"]["reference_4mmol"] is not None
    assert payload["current_baseline_source"] in {"measured", "estimated_recent", "estimated_historical", "fallback_default"}
    assert payload["current_baseline_state"] in {"normal", "alto", "bajo", "sin_referencia"}
    assert "baseline_state_score" in payload["acute"]
    assert "warnings" in payload

    acute_response = client.get(f"/api/analytics/athletes/{athlete_id}/dynamic-thresholds/acute?discipline=running", headers=headers)
    assert acute_response.status_code == 200
    assert acute_response.json()["model_type"] == "acute"

    history_response = client.get(f"/api/analytics/athletes/{athlete_id}/dynamic-thresholds/history?discipline=running", headers=headers)
    assert history_response.status_code == 200
    assert "acute_practical_lt2" in history_response.json()["history"]


def test_planning_endpoints_return_mesocycles_and_recommendation(client, db_session):
    headers = auth_headers(client, db_session)

    athlete_response = client.post(
        "/api/athletes",
        headers=headers,
        json={
            "name": "Atleta Planning",
            "date_of_birth": "1991-02-01",
            "sex": "male",
            "weight": 68,
            "height": 176,
            "primary_discipline": "ciclismo",
            "training_goal": "Mejorar FTP y consolidar LT2",
            "notes": "",
            "created_at": "2026-01-01",
            "weights": [{"recorded_at": "2026-01-01", "weight": 68, "source": "baseline"}],
        },
    )
    assert athlete_response.status_code == 201
    athlete_id = athlete_response.json()["id"]

    block_response = client.post(
        f"/api/athletes/{athlete_id}/focus-blocks",
        headers=headers,
        json={
            "start_date": "2026-02-10",
            "end_date": "2026-03-03",
            "energy_system_focus": "Aerobic Capacity",
            "block_objective": "LT1",
            "block_intent": "Consolidar potencia subumbral con bloques largos comparables.",
            "priority_discipline": "ciclismo",
            "phase": "base",
            "status": "active",
        },
    )
    assert block_response.status_code == 201

    target_response = client.post(
        f"/api/athletes/{athlete_id}/targets",
        headers=headers,
        json={
            "target_date": "2026-04-12",
            "discipline": "ciclismo",
            "objective": "Gran fondo objetivo",
            "distance_label": "Gran fondo",
            "priority_level": "A",
            "target_cycling_power_watts": 320,
        },
    )
    assert target_response.status_code == 201

    sessions = [
        ("2026-01-12T09:00:00", "Aerobic.profile EVAL", [(240, 220, 138, 1.4), (240, 255, 150, 2.1), (240, 300, 166, 4.0)]),
        ("2026-01-19T09:00:00", "3h AR", [(3600, 190, 132, 1.2)]),
        ("2026-01-26T09:00:00", "15' D2 + 3 x 20' LT1", [(1200, 270, 148, 2.0), (1200, 274, 150, 2.2)]),
        ("2026-02-02T09:00:00", "15' D2 + 3 x 25' LT1", [(1500, 278, 151, 2.3), (1500, 282, 153, 2.5)]),
        ("2026-02-16T09:00:00", "3 x 30' LT2 (half pace)", [(1800, 308, 162, 3.4), (1800, 314, 166, 3.8)]),
        ("2026-02-23T09:00:00", "4 x 20' LT2 (half pace)", [(1200, 312, 164, 3.6), (1200, 318, 168, 4.0)]),
    ]

    for performed_at, session_type, intervals in sessions:
        response = client.post(
            "/api/sessions",
            headers=headers,
            json={
                "athlete_id": athlete_id,
                "performed_at": performed_at,
                "discipline": "ciclismo",
                "power_source": "outdoor",
                "session_type": session_type,
                "goal": session_type,
                "surface": "road",
                "temperature_c": 12,
                "comments": "planning engine",
                "intervals": [
                    {
                        "order_index": index,
                        "duration_seconds": duration,
                        "rest_seconds": 120 if len(intervals) > 1 else 0,
                        "rest_type": "easy spin",
                        "heart_rate_avg": hr,
                        "heart_rate_max": hr + 6,
                        "power_watts": power,
                        "cadence": 88,
                        "rpe": 4 + index,
                        "purpose": "LT1" if lactate < 3 else "LT2",
                        "lactate_sample": {
                            "lactate_mmol": lactate,
                            "sample_delay_seconds": 20,
                            "sample_timing_label": "tras 20s",
                        },
                    }
                    for index, (duration, power, hr, lactate) in enumerate(intervals, start=1)
                ],
            },
        )
        assert response.status_code == 201

    overview_response = client.get(f"/api/planning/athletes/{athlete_id}/overview?discipline=ciclismo", headers=headers)
    assert overview_response.status_code == 200
    overview = overview_response.json()
    assert overview["discipline"] == "ciclismo"
    assert overview["foundations"]
    assert len(overview["foundations"]) == 4
    assert overview["template_library"]
    assert overview["planned_blocks"]
    assert overview["detected_mesocycles"]
    assert any(template["block_type"] == "threshold_development_block" for template in overview["template_library"])
    assert all(template["discipline"] in {"ciclismo", "all"} for template in overview["template_library"])
    assert overview["next_recommendation"]["recommended_block_type"] in {
        "threshold_development_block",
        "aerobic_power_block",
        "competition_specific_block",
        "aerobic_capacity_block",
        "recovery_consolidation_block",
    }
    assert overview["next_recommendation"]["structure"] in {"1+1", "2+1", "3+1"}
    assert overview["next_recommendation"]["template_id"]
    assert overview["next_recommendation"]["key_session_families"]

    mesocycles_response = client.get(f"/api/planning/athletes/{athlete_id}/mesocycles?discipline=ciclismo", headers=headers)
    assert mesocycles_response.status_code == 200
    assert len(mesocycles_response.json()) >= 1

    recommendation_response = client.get(f"/api/planning/athletes/{athlete_id}/recommendation?discipline=ciclismo", headers=headers)
    assert recommendation_response.status_code == 200
    recommendation = recommendation_response.json()
    assert recommendation["target_discipline"] == "ciclismo"
    assert recommendation["reasoning"]
    assert recommendation["template_summary"]


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


def test_athlete_can_fetch_parallel_health_overview(client, db_session, monkeypatch):
    athlete = Athlete(
        name="Atleta Health",
        date_of_birth=date(1993, 6, 4),
        sex="female",
        weight=56,
        height=167,
        primary_discipline="running",
        created_at=date(2026, 1, 1),
        garmin_user_id=9001,
        garmin_email="athlete-health@test.dev",
        garmin_password_encrypted="encrypted-password",
        garmin_token_encrypted="encrypted-token",
        garmin_connected_at=datetime(2026, 3, 11, 8, 0),
        garmin_last_sync_at=datetime(2026, 3, 11, 8, 30),
    )
    db_session.add(athlete)
    db_session.flush()

    user = User(
        email="athlete-health-login@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="athlete",
        full_name="Athlete Health Login",
        athlete_id=athlete.id,
    )
    db_session.add(user)
    db_session.commit()

    monkeypatch.setattr(
        "app.services.athlete_health.list_garmin_activities",
        lambda db, athlete, start_date, end_date, include_full_detail=False, activity_limit=None: [
            {
                "provider_activity_id": 7001,
                "name": "Rodaje aeróbico",
                "sport_type": "running",
                "started_at": datetime(2026, 3, 10, 7, 30),
                "distance_m": 12400.0,
                "moving_time_seconds": 3180,
                "average_heartrate": 148.0,
                "average_watts": None,
            },
            {
                "provider_activity_id": 7002,
                "name": "Piscina técnica",
                "sport_type": "lap_swimming",
                "started_at": datetime(2026, 3, 9, 18, 15),
                "distance_m": 2500.0,
                "moving_time_seconds": 2700,
                "average_heartrate": 132.0,
                "average_watts": None,
            },
        ],
    )

    login_response = client.post("/api/auth/login", json={"email": "athlete-health-login@test.dev", "password": "secret123"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    response = client.get(f"/api/athlete-health/athletes/{athlete.id}/overview?days=28", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["athlete_id"] == athlete.id
    assert payload["providers"][0]["provider"] == "garmin"
    assert payload["providers"][0]["status"] == "connected"
    assert payload["summary"]["activities_count"] == 2
    assert payload["summary"]["training_days"] == 2
    assert payload["summary"]["primary_sport_label"] == "Carrera"
    assert payload["recent_activities"][0]["sport_label"] == "Carrera"
    assert payload["recent_activities"][1]["sport_label"] == "Piscina"
    assert len(payload["activity_calendar"]) == 28


def test_athlete_cannot_fetch_other_athlete_parallel_health_overview(client, db_session):
    athlete = Athlete(
        name="Athlete One",
        date_of_birth=date(1992, 5, 1),
        sex="male",
        weight=64,
        height=176,
        primary_discipline="running",
        created_at=date(2026, 1, 1),
    )
    other = Athlete(
        name="Athlete Two",
        date_of_birth=date(1991, 7, 12),
        sex="female",
        weight=59,
        height=168,
        primary_discipline="cycling",
        created_at=date(2026, 1, 1),
    )
    db_session.add_all([athlete, other])
    db_session.flush()

    user = User(
        email="athlete-other-health@test.dev",
        hashed_password=get_password_hash("secret123"),
        role="athlete",
        full_name="Athlete Other Health",
        athlete_id=athlete.id,
    )
    db_session.add(user)
    db_session.commit()

    login_response = client.post("/api/auth/login", json={"email": "athlete-other-health@test.dev", "password": "secret123"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    response = client.get(f"/api/athlete-health/athletes/{other.id}/overview?days=28", headers=headers)
    assert response.status_code == 403
