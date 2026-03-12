from datetime import date, datetime
from types import SimpleNamespace

from app.models.athlete import Athlete
from app.services.athlete_health import _build_performance_metrics, _build_sleep_breakdown, build_athlete_health_overview


def test_athlete_health_overview_can_skip_live_garmin_fetch(db_session, monkeypatch):
    athlete = Athlete(
        name="Health Fast Mode",
        date_of_birth=date(1992, 2, 12),
        sex="female",
        weight=55,
        height=166,
        primary_discipline="running",
        created_at=date(2026, 1, 1),
        garmin_user_id=654321,
        garmin_email="health-fast@test.dev",
        garmin_password_encrypted="encrypted-password",
        garmin_token_encrypted="encrypted-token",
        garmin_connected_at=datetime(2026, 3, 11, 8, 0),
    )
    db_session.add(athlete)
    db_session.commit()

    def fail_if_called(*args, **kwargs):
        raise AssertionError("Live Garmin fetch should be skipped in fast mode")

    monkeypatch.setattr("app.services.athlete_health._load_garmin_health_snapshot", fail_if_called)

    overview = build_athlete_health_overview(
        db_session,
        athlete,
        days=28,
        include_activity=False,
        include_raw_wellness=False,
        refresh_live_health=False,
    )

    assert overview["athlete_id"] == athlete.id
    assert overview["health_metrics"] == []
    assert overview["health_days"] == []
    assert any("modo rapido" in note.lower() for note in overview["notes"])


def test_build_sleep_breakdown_extracts_richer_recovery_metrics():
    sleep_detail = SimpleNamespace(
        daily_sleep_dto=SimpleNamespace(
            sleep_time_seconds=22500,
            deep_sleep_seconds=7260,
            light_sleep_seconds=12540,
            rem_sleep_seconds=2700,
            awake_sleep_seconds=1320,
            average_respiration_value=10.0,
            sleep_score_feedback="POSITIVE_RECOVERING",
            sleep_score_insight="POSITIVE_RESTFUL_DAY",
        )
    )
    raw_sleep_detail = {
        "bodyBatteryChange": 63,
        "restingHeartRate": 40,
        "breathingDisruptionData": [{}, {}],
    }

    metrics = _build_sleep_breakdown(sleep_detail, raw_sleep_detail)
    by_key = {metric["key"]: metric for metric in metrics}

    assert by_key["sleep_time"]["value"] == "6h 15m"
    assert by_key["deep_sleep"]["value"] == "2h 01m"
    assert by_key["body_battery_change"]["value"] == "+63"
    assert by_key["resting_hr"]["value"] == "40 bpm"
    assert by_key["respiration"]["detail"] == "2 eventos visibles"
    assert by_key["sleep_feedback"]["value"] == "Positive Recovering"
    assert by_key["sleep_feedback"]["detail"] == "Positive Restful Day"


def test_build_performance_metrics_extracts_garmin_signals():
    user_settings = {
        "userData": {
            "vo2MaxRunning": 61.0,
            "vo2MaxCycling": 63.0,
            "lactateThresholdHeartRate": 184,
            "ftpAutoDetected": True,
        }
    }
    latest_activity_summary = {
        "activityName": "Tempo largo",
    }
    latest_activity_detail = {
        "summaryDTO": {
            "functionalThresholdPower": 240.0,
            "trainingEffect": 3.1,
            "anaerobicTrainingEffect": 0.0,
            "activityTrainingLoad": 95.48,
            "trainingStressScore": 16.3,
            "trainingEffectLabel": "TEMPO",
        }
    }

    metrics = _build_performance_metrics(user_settings, latest_activity_summary, latest_activity_detail)
    by_key = {metric["key"]: metric for metric in metrics}

    assert by_key["vo2max_running"]["value"] == "61"
    assert by_key["vo2max_cycling"]["value"] == "63"
    assert by_key["lt_hr"]["value"] == "184 bpm"
    assert by_key["ftp"]["value"] == "240 W"
    assert by_key["ftp"]["detail"] == "Auto-detectado por Garmin"
    assert by_key["training_effect"]["detail"] == "Tempo · Tempo largo"
    assert by_key["training_load"]["value"] == "95.5"
