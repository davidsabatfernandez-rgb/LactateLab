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
        search_limit = 200 if activity_limit is None else max(1, min(activity_limit * 6, 200))
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

            detail = _best_effort_connectapi(garth, f"activity-service/activity/{activity_id}/splits")
            summary_detail = _best_effort_connectapi(garth, f"activity-service/activity/{activity_id}")
            extras = _collect_extended_activity_payloads(garth, activity_id) if include_full_detail else None

            activities.append(
                _normalize_activity(
                    item,
                    summary_detail if isinstance(summary_detail, dict) else {},
                    detail if isinstance(detail, list) else [],
                    extras=extras,
                    detail_scope="full" if include_full_detail else "summary",
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
