from __future__ import annotations

import io
import zipfile
from contextlib import contextmanager
from datetime import date, datetime, timezone
from threading import Lock
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decrypt_secret, encrypt_secret
from app.models.athlete import Athlete

GARMIN_SESSION_LOCK = Lock()


class GarminRequestError(ValueError):
    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(detail)
        self.status_code = status_code


def connect_garmin_account(
    db: Session,
    athlete_id: int,
    email: str,
    password: str,
    mfa_code: str | None = None,
) -> Athlete:
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise GarminRequestError("Athlete not found", status_code=404)

    with _garmin_session(email=email, password=password, token=None, mfa_code=mfa_code, allow_reauth=True) as garth:
        profile = _safe_connectapi(garth, "/userprofile-service/socialProfile")
        garmin_user_id = _extract_garmin_user_id(profile)
        exported_token = _export_token(garth)

    existing = db.scalar(select(Athlete).where(Athlete.garmin_user_id == garmin_user_id, Athlete.id != athlete_id))
    if existing is not None:
        raise GarminRequestError("This Garmin account is already linked to another athlete", status_code=400)

    athlete.garmin_user_id = garmin_user_id
    athlete.garmin_email = email
    athlete.garmin_password_encrypted = encrypt_secret(password)
    athlete.garmin_token_encrypted = encrypt_secret(exported_token) if exported_token else None
    athlete.garmin_connected_at = datetime.now(timezone.utc)
    athlete.garmin_last_sync_at = athlete.garmin_connected_at

    db.add(athlete)
    db.commit()
    db.refresh(athlete)
    return athlete


def list_garmin_activities(
    db: Session,
    athlete: Athlete,
    start_date: date,
    end_date: date,
    *,
    include_full_detail: bool = False,
    activity_limit: int | None = None,
) -> list[dict[str, Any]]:
    if not athlete.garmin_connected or not athlete.garmin_email or not athlete.garmin_password_encrypted:
        raise GarminRequestError("Athlete does not have Garmin connected", status_code=400)
    if end_date < start_date:
        raise GarminRequestError("end_date must be on or after start_date", status_code=400)

    email = athlete.garmin_email
    password = decrypt_secret(athlete.garmin_password_encrypted)
    token = decrypt_secret(athlete.garmin_token_encrypted) if athlete.garmin_token_encrypted else None

    with _garmin_session(email=email, password=password, token=token, allow_reauth=True) as garth:
        search_limit = 200 if activity_limit is None else max(1, min(activity_limit * 3, 200))
        raw_activities = _safe_connectapi(
            garth,
            f"activitylist-service/activities/search/activities?startDate={start_date.isoformat()}&limit={search_limit}",
        )
        if not isinstance(raw_activities, list):
            raise GarminRequestError("Unexpected Garmin activities payload", status_code=502)

        activities: list[dict[str, Any]] = []
        for item in raw_activities:
            if not isinstance(item, dict):
                continue
            started_at = _activity_started_at(item)
            if started_at is None:
                continue
            started_date = started_at.date()
            if started_date < start_date or started_date > end_date:
                continue

            activity_id = _coerce_int(item.get("activityId"))
            if activity_id is None:
                continue

            summary_detail: dict[str, Any] = {}
            detail_splits: list[dict[str, Any]] = []
            extras = None
            detail_scope = "preview"

            if include_full_detail:
                detail = _best_effort_connectapi(garth, f"activity-service/activity/{activity_id}/splits")
                summary_response = _best_effort_connectapi(garth, f"activity-service/activity/{activity_id}")
                summary_detail = summary_response if isinstance(summary_response, dict) else {}
                detail_splits = detail if isinstance(detail, list) else []
                extras = _collect_extended_activity_payloads(garth, activity_id)
                detail_scope = "full"

            activities.append(
                _normalize_activity(
                    item,
                    summary_detail,
                    detail_splits,
                    extras=extras,
                    detail_scope=detail_scope,
                )
            )
            if activity_limit is not None and len(activities) >= activity_limit:
                break

        athlete.garmin_last_sync_at = datetime.now(timezone.utc)
        refreshed_token = _export_token(garth)
        if refreshed_token:
            athlete.garmin_token_encrypted = encrypt_secret(refreshed_token)
        db.add(athlete)
        db.commit()

    return activities


def get_garmin_activity_detail(
    db: Session,
    athlete: Athlete,
    activity_id: int,
) -> dict[str, Any]:
    if not athlete.garmin_connected or not athlete.garmin_email or not athlete.garmin_password_encrypted:
        raise GarminRequestError("Athlete does not have Garmin connected", status_code=400)

    email = athlete.garmin_email
    password = decrypt_secret(athlete.garmin_password_encrypted)
    token = decrypt_secret(athlete.garmin_token_encrypted) if athlete.garmin_token_encrypted else None

    with _garmin_session(email=email, password=password, token=token, allow_reauth=True) as garth:
        detail = _safe_connectapi(garth, f"activity-service/activity/{activity_id}")
        if not isinstance(detail, dict):
            raise GarminRequestError("Unexpected Garmin activity detail payload", status_code=502)

        splits = _best_effort_connectapi(garth, f"activity-service/activity/{activity_id}/splits")
        extras = _collect_extended_activity_payloads(garth, activity_id)
        activity = _normalize_activity(
            detail,
            detail,
            splits if isinstance(splits, list) else [],
            extras=extras,
            detail_scope="full",
        )

        athlete.garmin_last_sync_at = datetime.now(timezone.utc)
        refreshed_token = _export_token(garth)
        if refreshed_token:
            athlete.garmin_token_encrypted = encrypt_secret(refreshed_token)
        db.add(athlete)
        db.commit()

    return activity


@contextmanager
def _garmin_session(
    *,
    email: str,
    password: str,
    token: str | None,
    mfa_code: str | None = None,
    allow_reauth: bool = True,
):
    garth, garth_error = _import_garth()
    with GARMIN_SESSION_LOCK:
        _logout_if_available(garth)

        if token:
            try:
                _load_token(garth, token)
                _safe_connectapi(garth, "/userprofile-service/socialProfile")
                yield garth
                return
            except GarminRequestError:
                if not allow_reauth:
                    raise
                _logout_if_available(garth)

        try:
            login_result = garth.login(
                email,
                password,
                prompt_mfa=_build_mfa_prompt(mfa_code),
            )
        except garth_error as exc:
            raise GarminRequestError(f"Garmin login failed: {exc}", status_code=502) from exc
        except Exception as exc:  # pragma: no cover - defensive for library edge cases
            raise GarminRequestError(f"Garmin login failed: {exc}", status_code=502) from exc

        yield garth


def _import_garth():
    try:
        import garth
        from garth.exc import GarthException
    except ImportError as exc:  # pragma: no cover - depends on local installation
        raise GarminRequestError(
            "Garmin support is not installed. Run `pip install -r requirements.txt` in backend first.",
            status_code=503,
        ) from exc
    return garth, GarthException


def _safe_connectapi(garth: Any, path: str) -> Any:
    try:
        return garth.connectapi(path)
    except Exception as exc:
        raise GarminRequestError(f"Garmin request failed for `{path}`: {exc}", status_code=502) from exc


def _best_effort_connectapi(garth: Any, path: str) -> Any | None:
    try:
        return _safe_connectapi(garth, path)
    except GarminRequestError:
        return None


def _best_effort_download(garth: Any, path: str) -> bytes | None:
    download = getattr(garth, "download", None)
    if not callable(download):
        return None
    try:
        payload = download(path)
    except Exception:
        return None
    return payload if isinstance(payload, (bytes, bytearray)) and payload else None


def _extract_garmin_user_id(profile: dict[str, Any]) -> int:
    for key in ("id", "profileId", "userId", "garminGUID"):
        value = _coerce_int(profile.get(key))
        if value is not None:
            return value
    raise GarminRequestError("Garmin profile did not include a usable user id", status_code=502)


def _export_token(garth: Any) -> str | None:
    client = getattr(garth, "client", None)
    if client is None or not hasattr(client, "dumps"):
        return None
    try:
        payload = client.dumps()
    except Exception:
        return None
    return payload if isinstance(payload, str) and payload else None


def _load_token(garth: Any, token: str) -> None:
    client = getattr(garth, "client", None)
    if client is None or not hasattr(client, "loads"):
        raise GarminRequestError("Garmin token restore is not available in the installed library", status_code=503)
    try:
        client.loads(token)
    except Exception as exc:
        raise GarminRequestError(f"Garmin saved session could not be restored: {exc}", status_code=401) from exc


def _logout_if_available(garth: Any) -> None:
    logout = getattr(garth, "logout", None)
    if callable(logout):
        try:
            logout()
        except Exception:
            pass


def _build_mfa_prompt(mfa_code: str | None):
    def prompt() -> str:
        if not mfa_code:
            raise GarminRequestError("Garmin requires MFA. Add the MFA code and try again.", status_code=400)
        return mfa_code

    return prompt


def _collect_extended_activity_payloads(garth: Any, activity_id: int) -> dict[str, Any]:
    payloads: dict[str, Any] = {}
    candidate_paths: dict[str, list[str]] = {
        "activity_details": [f"activity-service/activity/{activity_id}/details"],
        "hr_time_in_zones": [
            f"activity-service/activity/{activity_id}/hrTimeInZones",
            f"activity-service/activity/{activity_id}/heartRateTimeInZones",
        ],
        "power_time_in_zones": [
            f"activity-service/activity/{activity_id}/powerTimeInZones",
        ],
        "pace_time_in_zones": [
            f"activity-service/activity/{activity_id}/paceTimeInZones",
        ],
        "speed_time_in_zones": [
            f"activity-service/activity/{activity_id}/speedTimeInZones",
        ],
        "elevation_chart_data": [
            f"activity-service/activity/{activity_id}/elevationChartData",
        ],
        "weather": [
            f"activity-service/activity/{activity_id}/weather",
        ],
    }

    for key, paths in candidate_paths.items():
        for path in paths:
            payload = _best_effort_connectapi(garth, path)
            if payload is None:
                continue
            payloads[key] = payload
            payloads.setdefault("_sources", {})[key] = path
            break

    fit_archive = _best_effort_download(garth, f"/download-service/files/activity/{activity_id}")
    if fit_archive:
        parsed_fit = _best_effort_parse_fit_archive(fit_archive)
        if parsed_fit:
            payloads["fit_file"] = parsed_fit

    return payloads


def _best_effort_parse_fit_archive(archive_bytes: bytes) -> dict[str, Any] | None:
    try:
        from fitparse import FitFile
    except ImportError:
        return {
            "available": False,
            "error": "fitparse_not_installed",
        }

    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            names = archive.namelist()
            fit_name = next((name for name in names if name.lower().endswith(".fit")), None)
            if not fit_name:
                return {"available": False, "archive_entries": names, "error": "fit_entry_not_found"}
            fit_bytes = archive.read(fit_name)
    except Exception as exc:
        return {"available": False, "error": f"fit_archive_error:{exc.__class__.__name__}"}

    try:
        fit = FitFile(io.BytesIO(fit_bytes))
        messages = list(fit.get_messages())
    except Exception as exc:
        return {"available": False, "error": f"fit_parse_error:{exc.__class__.__name__}"}

    message_counts: dict[str, int] = {}
    record_rows: list[dict[str, Any]] = []
    session_rows: list[dict[str, Any]] = []
    lap_rows: list[dict[str, Any]] = []
    all_record_fields: set[str] = set()

    for message in messages:
        name = getattr(message, "name", "unknown")
        message_counts[name] = message_counts.get(name, 0) + 1
        values: dict[str, Any] = {}
        for field in message:
            field_name = getattr(field, "name", None)
            if not field_name:
                continue
            value = getattr(field, "value", None)
            if isinstance(value, datetime):
                values[field_name] = value.isoformat()
            elif isinstance(value, (int, float, str, bool)) or value is None:
                values[field_name] = value
            else:
                values[field_name] = str(value)

        if name == "record":
            all_record_fields.update(values.keys())
            record_rows.append(values)
        elif name == "session":
            session_rows.append(values)
        elif name == "lap":
            lap_rows.append(values)

    sampled_records = _sample_fit_records(record_rows, max_points=400)
    streams = _extract_fit_streams(sampled_records)

    return {
        "available": True,
        "archive_entries": names,
        "fit_entry_name": fit_name,
        "file_size_bytes": len(fit_bytes),
        "message_counts": message_counts,
        "record_count": len(record_rows),
        "lap_count": len(lap_rows),
        "session_count": len(session_rows),
        "record_fields": sorted(all_record_fields),
        "sessions": session_rows[:3],
        "laps": lap_rows[:50],
        "sampled_records": sampled_records,
        "streams": streams,
    }


def _sample_fit_records(records: list[dict[str, Any]], max_points: int = 400) -> list[dict[str, Any]]:
    if len(records) <= max_points:
        return records

    stride = max(1, len(records) // max_points)
    sampled = [record for index, record in enumerate(records) if index % stride == 0]
    if sampled[-1] != records[-1]:
        sampled.append(records[-1])
    return sampled[: max_points + 1]


def _extract_fit_streams(records: list[dict[str, Any]]) -> dict[str, list[Any]]:
    stream_keys = [
        "timestamp",
        "heart_rate",
        "power",
        "cadence",
        "speed",
        "distance",
        "altitude",
        "temperature",
        "enhanced_speed",
        "enhanced_altitude",
        "position_lat",
        "position_long",
        "vertical_oscillation",
        "stance_time",
        "stance_time_percent",
        "step_length",
    ]
    streams: dict[str, list[Any]] = {}
    for key in stream_keys:
        values = [record.get(key) for record in records if record.get(key) is not None]
        if values:
            streams[key] = values
    return streams


def _normalize_activity(
    summary: dict[str, Any],
    detail: dict[str, Any],
    splits: list[dict[str, Any]],
    *,
    extras: dict[str, Any] | None = None,
    detail_scope: str = "summary",
) -> dict[str, Any]:
    activity_type = (
        ((detail.get("activityType") or {}).get("typeKey"))
        or ((summary.get("activityType") or {}).get("typeKey"))
        or ((summary.get("activityTypeDTO") or {}).get("typeKey"))
        or "unknown"
    )
    started_at = _activity_started_at(summary) or _datetime_from_value(
        ((detail.get("summaryDTO") or {}).get("startTimeGMT"))
        or detail.get("startTimeGMT")
        or detail.get("startTimeLocal")
    )
    if started_at is None:
        started_at = datetime.now(timezone.utc)

    summary_dto = detail.get("summaryDTO") if isinstance(detail.get("summaryDTO"), dict) else {}
    metadata_dto = detail.get("metadataDTO") if isinstance(detail.get("metadataDTO"), dict) else {}

    return {
        "provider_activity_id": int(summary.get("activityId") or detail.get("activityId") or 0),
        "name": summary.get("activityName") or detail.get("activityName") or "Garmin activity",
        "sport_type": activity_type,
        "started_at": started_at,
        "timezone": summary.get("timeZoneUnitDTO", {}).get("unitKey") if isinstance(summary.get("timeZoneUnitDTO"), dict) else None,
        "distance_m": _coerce_float(summary.get("distance")) or _coerce_float(summary_dto.get("distance")) or 0.0,
        "moving_time_seconds": _duration_to_seconds(summary.get("duration")) or _duration_to_seconds(summary_dto.get("movingDuration")) or 0,
        "elapsed_time_seconds": _duration_to_seconds(summary.get("elapsedDuration")) or _duration_to_seconds(summary_dto.get("elapsedDuration")) or _duration_to_seconds(summary.get("duration")) or 0,
        "average_speed_m_s": _coerce_float(summary.get("averageSpeed")) or _coerce_float(summary_dto.get("averageSpeed")),
        "max_speed_m_s": _coerce_float(summary.get("maxSpeed")) or _coerce_float(summary_dto.get("maxSpeed")),
        "average_heartrate": _coerce_float(summary.get("averageHR")) or _coerce_float(summary_dto.get("averageHR")),
        "max_heartrate": _coerce_float(summary.get("maxHR")) or _coerce_float(summary_dto.get("maxHR")),
        "average_watts": _coerce_float(summary.get("avgPower")) or _coerce_float(summary_dto.get("averagePower")),
        "calories": _coerce_float(summary.get("calories")) or _coerce_float(summary_dto.get("calories")),
        "description": detail.get("description"),
        "total_elevation_gain_m": _coerce_float(summary.get("elevationGain")) or _coerce_float(summary_dto.get("elevationGain")),
        "average_cadence": _coerce_float(summary.get("averageRunCadence")) or _coerce_float(summary.get("averageBikeCadence")) or _coerce_float(summary_dto.get("averageRunCadence")),
        "max_watts": _coerce_float(summary.get("maxPower")) or _coerce_float(summary_dto.get("maxPower")),
        "start_latlng": _normalize_latlng(metadata_dto.get("startCoordinate")),
        "end_latlng": _normalize_latlng(metadata_dto.get("endCoordinate")),
        "device_name": metadata_dto.get("deviceName"),
        "laps": [_normalize_split(split, index) for index, split in enumerate(splits, start=1) if isinstance(split, dict)],
        "raw_detail": {
            "summary": summary,
            "detail": detail,
            "splits": splits,
            "extras": extras or {},
            "meta": {
                "detail_scope": detail_scope,
            },
        },
    }


def _normalize_split(payload: dict[str, Any], lap_index: int) -> dict[str, Any]:
    return {
        "lap_index": lap_index,
        "name": payload.get("lapLabel") or payload.get("name") or f"Lap {lap_index}",
        "distance_m": _coerce_float(payload.get("sumDistance")) or 0.0,
        "elapsed_time_seconds": _duration_to_seconds(payload.get("sumElapsedDuration")) or _duration_to_seconds(payload.get("sumDuration")) or 0,
        "moving_time_seconds": _duration_to_seconds(payload.get("sumMovingDuration")) or _duration_to_seconds(payload.get("sumDuration")) or 0,
        "average_speed_m_s": _coerce_float(payload.get("averageSpeed")),
        "average_heartrate": _coerce_float(payload.get("averageHR")),
        "max_heartrate": _coerce_float(payload.get("maxHR")),
        "average_watts": _coerce_float(payload.get("averagePower")),
        "start_date": _datetime_from_value(payload.get("startTimeGMT") or payload.get("startTimeLocal")),
    }


def _activity_started_at(payload: dict[str, Any]) -> datetime | None:
    return _datetime_from_value(payload.get("startTimeGMT") or payload.get("startTimeLocal"))


def _datetime_from_value(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str):
        return None

    normalized = value.strip()
    if not normalized:
        return None
    normalized = normalized.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def _duration_to_seconds(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return max(0, int(round(float(value))))
    except (TypeError, ValueError):
        return None


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_latlng(value: Any) -> list[float]:
    if isinstance(value, dict):
        values = [value.get("latitude"), value.get("longitude")]
    elif isinstance(value, (list, tuple)):
        values = list(value)
    else:
        return []

    normalized: list[float] = []
    for item in values[:2]:
        parsed = _coerce_float(item)
        if parsed is not None:
            normalized.append(parsed)
    return normalized


# ---------------------------------------------------------------------------
# Garmin Workout Push — enviar entrenos estructurados a Garmin Connect
# ---------------------------------------------------------------------------

_SPORT_TYPE_MAP: dict[str, dict[str, Any]] = {
    "running": {"sportTypeId": 1, "sportTypeKey": "running"},
    "ciclismo": {"sportTypeId": 2, "sportTypeKey": "cycling"},
    "natación": {"sportTypeId": 5, "sportTypeKey": "swimming"},
    "triatlón": {"sportTypeId": 1, "sportTypeKey": "running"},
    "other": {"sportTypeId": 1, "sportTypeKey": "running"},
}

_STEP_TYPE_MAP: dict[str, dict[str, Any]] = {
    "warmup": {"stepTypeId": 1, "stepTypeKey": "warmup"},
    "cooldown": {"stepTypeId": 2, "stepTypeKey": "cooldown"},
    "interval": {"stepTypeId": 3, "stepTypeKey": "interval"},
    "recovery": {"stepTypeId": 4, "stepTypeKey": "recovery"},
    "steady": {"stepTypeId": 3, "stepTypeKey": "interval"},
    "other": {"stepTypeId": 3, "stepTypeKey": "interval"},
    "repeat": {"stepTypeId": 6, "stepTypeKey": "repeat"},
}

_END_CONDITION_MAP: dict[str, dict[str, Any]] = {
    "time": {"conditionTypeId": 2, "conditionTypeKey": "time"},
    "distance": {"conditionTypeId": 3, "conditionTypeKey": "distance"},
    "lap_button": {"conditionTypeId": 1, "conditionTypeKey": "lap.button"},
    "open": {"conditionTypeId": 1, "conditionTypeKey": "lap.button"},
}

_INTENSITY_MAP: dict[str, str] = {
    "warmup": "WARMUP",
    "cooldown": "COOLDOWN",
    "interval": "INTERVAL",
    "recovery": "RECOVERY",
    "steady": "ACTIVE",
    "other": "ACTIVE",
}

_TARGET_TYPE_MAP: dict[str, dict[str, Any]] = {
    "pace": {"workoutTargetTypeId": 6, "workoutTargetTypeKey": "pace.zone"},
    "heart_rate": {"workoutTargetTypeId": 4, "workoutTargetTypeKey": "heart.rate.zone"},
    "power": {"workoutTargetTypeId": 2, "workoutTargetTypeKey": "power.zone"},
    "cadence": {"workoutTargetTypeId": 3, "workoutTargetTypeKey": "cadence"},
    "easy": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target"},
    "free": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target"},
    "rpe": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target"},
    "other": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target"},
}


def _build_garmin_step(step: dict[str, Any], order: int) -> dict[str, Any]:
    """Convert a WorkoutStep dict to a Garmin workout step DTO."""
    step_type_key = step.get("step_type", "interval")
    length_type = step.get("length_type", "open")
    length_value = step.get("length_value")

    end_condition = _END_CONDITION_MAP.get(length_type, _END_CONDITION_MAP["open"])

    end_condition_value: Any = None
    if length_type == "time" and length_value:
        end_condition_value = float(length_value)
    elif length_type == "distance" and length_value:
        end_condition_value = float(length_value)

    target = step.get("target") or {}
    target_type_key = target.get("target_type", "free")
    garmin_target = _TARGET_TYPE_MAP.get(target_type_key, _TARGET_TYPE_MAP["free"])

    target_value_one: Any = None
    target_value_two: Any = None
    if target_type_key == "pace" and target.get("value_from") and target.get("value_to"):
        target_value_one = float(target["value_from"])
        target_value_two = float(target["value_to"])
    elif target_type_key == "heart_rate" and target.get("value_from") and target.get("value_to"):
        target_value_one = float(target["value_from"])
        target_value_two = float(target["value_to"])
    elif target_type_key == "power" and target.get("value_from") and target.get("value_to"):
        target_value_one = float(target["value_from"])
        target_value_two = float(target["value_to"])

    garmin_step: dict[str, Any] = {
        "type": "ExecutableStepDTO",
        "stepId": None,
        "stepOrder": order,
        "stepType": _STEP_TYPE_MAP.get(step_type_key, _STEP_TYPE_MAP["interval"]),
        "endCondition": end_condition,
        "preferredEndConditionUnit": None,
        "endConditionValue": end_condition_value,
        "targetType": garmin_target,
        "targetValueOne": target_value_one,
        "targetValueTwo": target_value_two,
        "intensity": _INTENSITY_MAP.get(step_type_key, "ACTIVE"),
    }

    description = step.get("instructions") or step.get("intensity_label") or ""
    if description:
        garmin_step["description"] = description[:200]

    return garmin_step


def _build_garmin_repeat_step(step: dict[str, Any], order: int, child_steps: list[dict[str, Any]]) -> dict[str, Any]:
    """Convert a repeat WorkoutStep to a Garmin repeat DTO."""
    return {
        "type": "RepeatGroupDTO",
        "stepId": None,
        "stepOrder": order,
        "stepType": _STEP_TYPE_MAP["repeat"],
        "numberOfIterations": step.get("repeat_count", 1),
        "workoutSteps": child_steps,
        "smartRepeat": False,
    }


def workout_definition_to_garmin_payload(definition: dict[str, Any]) -> dict[str, Any]:
    """Convert a full WorkoutDefinition dict to a Garmin Connect workout JSON payload."""
    sport = definition.get("sport", "running")
    sport_type = _SPORT_TYPE_MAP.get(sport, _SPORT_TYPE_MAP["running"])

    steps: list[dict[str, Any]] = []
    order = 1
    for step in definition.get("steps", []):
        if step.get("step_type") == "repeat":
            children = step.get("children", [])
            child_garmin_steps = []
            for child in children:
                child_garmin_steps.append(_build_garmin_step(child, order))
                order += 1
            steps.append(_build_garmin_repeat_step(step, order, child_garmin_steps))
            order += 1
        else:
            steps.append(_build_garmin_step(step, order))
            order += 1

    return {
        "workoutName": definition.get("title", "Workout"),
        "description": definition.get("description") or "",
        "sportType": sport_type,
        "workoutSegments": [
            {
                "segmentOrder": 1,
                "sportType": sport_type,
                "workoutSteps": steps,
            }
        ],
    }


def push_workout_to_garmin(
    db: Session,
    athlete: Athlete,
    workout_definition: dict[str, Any],
    *,
    scheduled_date: str | None = None,
) -> dict[str, Any]:
    """Push a structured workout to Garmin Connect for the athlete.

    Returns the Garmin response (includes workoutId on success).
    """
    if not athlete.garmin_connected or not athlete.garmin_email or not athlete.garmin_password_encrypted:
        raise GarminRequestError("Athlete does not have Garmin connected", status_code=400)

    email = athlete.garmin_email
    password = decrypt_secret(athlete.garmin_password_encrypted)
    token = decrypt_secret(athlete.garmin_token_encrypted) if athlete.garmin_token_encrypted else None

    garmin_payload = workout_definition_to_garmin_payload(workout_definition)

    with _garmin_session(email=email, password=password, token=token, allow_reauth=True) as garth_client:
        try:
            result = garth_client.connectapi(
                "/workout-service/workout",
                method="POST",
                json=garmin_payload,
            )
        except Exception as exc:
            raise GarminRequestError(f"Failed to push workout to Garmin: {exc}", status_code=502) from exc

        # Schedule the workout on the calendar if we have a date and workoutId
        garmin_workout_id = None
        if isinstance(result, dict):
            garmin_workout_id = result.get("workoutId")

        if garmin_workout_id and scheduled_date:
            try:
                garth_client.connectapi(
                    f"/workout-service/schedule/{garmin_workout_id}",
                    method="POST",
                    json={"date": scheduled_date},
                )
            except Exception:
                pass  # scheduling is best-effort; the workout is already created

        # Refresh token
        athlete.garmin_last_sync_at = datetime.now(timezone.utc)
        refreshed_token = _export_token(garth_client)
        if refreshed_token:
            athlete.garmin_token_encrypted = encrypt_secret(refreshed_token)
        db.add(athlete)
        db.commit()

    return result if isinstance(result, dict) else {"status": "sent"}
