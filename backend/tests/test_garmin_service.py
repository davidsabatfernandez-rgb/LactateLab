from contextlib import contextmanager
from datetime import date, datetime

from app.models.athlete import Athlete
from app.services.garmin import list_garmin_activities


def test_garmin_preview_stays_lightweight_without_full_detail(db_session, monkeypatch):
    athlete = Athlete(
        name="Garmin Preview",
        date_of_birth=date(1991, 4, 7),
        sex="male",
        weight=70,
        height=178,
        primary_discipline="running",
        created_at=date(2026, 1, 1),
        garmin_user_id=123456,
        garmin_email="preview@test.dev",
        garmin_password_encrypted="encrypted-password",
        garmin_token_encrypted="encrypted-token",
        garmin_connected_at=datetime(2026, 3, 11, 8, 0),
    )
    db_session.add(athlete)
    db_session.commit()

    connectapi_calls: list[str] = []

    class FakeClient:
        def dumps(self):
            return "refreshed-token"

    class FakeGarth:
        client = FakeClient()

        def connectapi(self, path: str):
            connectapi_calls.append(path)
            if path.startswith("activitylist-service/activities/search/activities"):
                return [
                    {
                        "activityId": 91001,
                        "activityName": "Rodaje controlado",
                        "activityType": {"typeKey": "running"},
                        "startTimeGMT": "2026-03-10T07:30:00+00:00",
                        "distance": 10250.0,
                        "duration": 3120,
                        "elapsedDuration": 3200,
                        "averageSpeed": 3.28,
                        "averageHR": 146,
                    }
                ]
            raise AssertionError(f"Unexpected preview call to {path}")

    @contextmanager
    def fake_garmin_session(**kwargs):
        yield FakeGarth()

    monkeypatch.setattr("app.services.garmin.decrypt_secret", lambda value: value)
    monkeypatch.setattr("app.services.garmin._garmin_session", fake_garmin_session)

    activities = list_garmin_activities(
        db_session,
        athlete,
        start_date=date(2026, 3, 8),
        end_date=date(2026, 3, 12),
        include_full_detail=False,
        activity_limit=6,
    )

    assert len(activities) == 1
    assert activities[0]["provider_activity_id"] == 91001
    assert connectapi_calls == ["activitylist-service/activities/search/activities?startDate=2026-03-08&limit=18"]
