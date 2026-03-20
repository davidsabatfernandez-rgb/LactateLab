from __future__ import annotations

import io
import json
import zipfile
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from threading import Lock
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decrypt_secret, encrypt_secret
from app.models.athlete import Athlete
from app.models.garmin_activity import GarminActivity

GARMIN_SESSION_LOCK = Lock()


class GarminRequestError(ValueError):
    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(detail)
        self.status_code = status_code


# ---------------------------------------------------------------------------
# Session management — garminconnect.Garmin wrapper
# ---------------------------------------------------------------------------

def _create_garmin_client(
    email: str,
    password: str,
    token_dict: dict | None = None,
    mfa_code: str | None = None,
) -> Any:
    """Create and authenticate a Garmin client.

    Uses token-first strategy: if a saved token is available, try to restore
    the session. If that fails (or no token), fall back to email/password login.

    garminconnect v0.2.x does not support prompt_mfa, so we call garth.login()
    directly with the MFA prompt and then attach the authenticated garth client
    to the Garmin wrapper.
    """
    from garminconnect import Garmin
    import garth as garth_module

    if token_dict:
        try:
            client = Garmin()
            client.login(token_dict)
            client.get_full_name()
            return client
        except Exception:
            pass  # token expired/invalid — fall through to password login

    try:
        # Use garth directly for login so we can pass prompt_mfa
        garth_client = garth_module.Client(domain="garmin.com")
        garth_client.login(email, password, prompt_mfa=_build_mfa_prompt(mfa_code))

        # Create garminconnect wrapper and inject the authenticated garth session
        client = Garmin(email=email, password=password)
        client.garth = garth_client

        # Load profile data that garminconnect.login() normally sets
        client.display_name = garth_client.profile.get("displayName", "")
        client.full_name = garth_client.profile.get("fullName", "")
        try:
            settings = client.connectapi("/userprofile-service/userprofile/user-settings")
            client.unit_system = settings.get("userData", {}).get("measurementSystem", "")
        except Exception:
            client.unit_system = ""

        return client
    except GarminRequestError:
        raise  # re-raise our own MFA error from _build_mfa_prompt
    except Exception as exc:
        raise _classify_garmin_error(exc) from exc


@contextmanager
def _garmin_session(
    *,
    email: str,
    password: str,
    token: str | None,
    mfa_code: str | None = None,
    allow_reauth: bool = True,
):
    """Context manager that yields an authenticated Garmin client."""
    token_dict = None
    if token:
        try:
            token_dict = json.loads(token)
        except (json.JSONDecodeError, TypeError):
            token_dict = None

    with GARMIN_SESSION_LOCK:
        client = _create_garmin_client(email, password, token_dict, mfa_code)
        yield client


def _export_token(client: Any) -> str | None:
    """Export the current session token as a JSON string."""
    try:
        token_dict = client.garth.dumps()
        if isinstance(token_dict, str):
            return token_dict
        return json.dumps(token_dict) if token_dict else None
    except Exception:
        return None


def _save_token_to_athlete(db: Session, athlete: Athlete, client: Any) -> None:
    """Refresh and persist the session token after an API call."""
    athlete.garmin_last_sync_at = datetime.now(timezone.utc)
    refreshed_token = _export_token(client)
    if refreshed_token:
        athlete.garmin_token_encrypted = encrypt_secret(refreshed_token)
    db.add(athlete)
    db.commit()


# ---------------------------------------------------------------------------
# Public API — connect, list, detail, sync, push
# ---------------------------------------------------------------------------

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

    with _garmin_session(email=email, password=password, token=None, mfa_code=mfa_code) as client:
        profile = client.get_full_name()
        garmin_user_id = _extract_garmin_user_id_from_client(client)
        exported_token = _export_token(client)

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

    with _garmin_session(email=email, password=password, token=token, allow_reauth=True) as client:
        try:
            raw_activities = client.get_activities_by_date(
                start_date.isoformat(),
                end_date.isoformat(),
            )
        except Exception as exc:
            raise GarminRequestError(f"Failed to fetch Garmin activities: {exc}", status_code=502) from exc

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
                try:
                    summary_detail = client.get_activity(activity_id) or {}
                except Exception:
                    summary_detail = {}
                try:
                    splits_raw = client.get_activity_splits(activity_id)
                    detail_splits = splits_raw if isinstance(splits_raw, list) else []
                except Exception:
                    detail_splits = []
                extras = _collect_extended_activity_payloads_gc(client, activity_id)
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

        _save_token_to_athlete(db, athlete, client)

    return activities


def get_garmin_activity_detail(
    db: Session,
    athlete: Athlete,
    activity_id: int,
) -> dict[str, Any]:
    if not athlete.garmin_connected or not athlete.garmin_email or not athlete.garmin_password_encrypted:
        raise GarminRequestError("Athlete does not have Garmin connected", status_code=400)

    # Try live Garmin API first
    live_error = None
    try:
        email = athlete.garmin_email
        password = decrypt_secret(athlete.garmin_password_encrypted)
        token = decrypt_secret(athlete.garmin_token_encrypted) if athlete.garmin_token_encrypted else None

        with _garmin_session(email=email, password=password, token=token, allow_reauth=True) as client:
            try:
                detail = client.get_activity(activity_id)
            except Exception as exc:
                raise GarminRequestError(f"Failed to fetch activity detail: {exc}", status_code=502) from exc

            if not isinstance(detail, dict):
                raise GarminRequestError("Unexpected Garmin activity detail payload", status_code=502)

            try:
                splits_raw = client.get_activity_splits(activity_id)
                splits = splits_raw if isinstance(splits_raw, list) else []
            except Exception:
                splits = []

            extras = _collect_extended_activity_payloads_gc(client, activity_id)
            activity = _normalize_activity(
                detail,
                detail,
                splits,
                extras=extras,
                detail_scope="full",
            )

            _save_token_to_athlete(db, athlete, client)

        return activity
    except Exception as exc:
        live_error = exc

    # Fallback: try to serve from stored raw_summary in DB
    stored = db.scalar(
        select(GarminActivity).where(
            GarminActivity.athlete_id == athlete.id,
            GarminActivity.provider_activity_id == activity_id,
        )
    )
    if stored and stored.raw_summary:
        raw = stored.raw_summary if isinstance(stored.raw_summary, dict) else json.loads(stored.raw_summary)
        # Support both formats:
        # Format A (manual enrichment): {detail: {...}, splits: [...], extras: {...}}
        # Format B (sync enrichment): {raw_detail: {extras: {...}}, ...activity fields...}
        if "detail" in raw and isinstance(raw["detail"], dict) and "activityId" not in raw["detail"]:
            # Format A: dedicated detail/splits/extras keys
            detail_data = raw.get("detail", {})
            splits = raw.get("splits", [])
            extras = raw.get("extras", {})
        else:
            # Format B: raw_summary IS the normalized activity dict
            detail_data = raw
            splits = raw.get("laps", [])
            rd = raw.get("raw_detail", {})
            extras = rd.get("extras", {}) if isinstance(rd, dict) else {}
        return _normalize_activity(
            detail_data,
            detail_data,
            splits,
            extras=extras,
            detail_scope="full",
        )

    # No fallback available — raise original error
    raise live_error


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------

def _classify_garmin_error(exc: Exception) -> GarminRequestError:
    msg = str(exc).lower()
    if "preauthorized" in msg and "401" in msg:
        return GarminRequestError(
            "Tu cuenta de Garmin no tiene Garmin Connect activado. "
            "Entra en https://connect.garmin.com desde un navegador, "
            "inicia sesión y completa la configuración inicial. "
            "Después vuelve a intentar la conexión aquí.",
            status_code=422,
        )
    if "mfa" in msg or "verification" in msg:
        return GarminRequestError(
            "Garmin requiere verificación MFA. Introduce el código que has recibido por email.",
            status_code=403,
        )
    if "401" in msg or "unauthorized" in msg or "authentication" in msg:
        return GarminRequestError(
            "Credenciales de Garmin incorrectas. Verifica tu email y contraseña.",
            status_code=401,
        )
    return GarminRequestError(f"Garmin login failed: {exc}", status_code=502)


def _build_mfa_prompt(mfa_code: str | None):
    def prompt() -> str:
        if not mfa_code:
            raise GarminRequestError("Garmin requires MFA. Add the MFA code and try again.", status_code=400)
        return mfa_code
    return prompt


# ---------------------------------------------------------------------------
# Extended activity payloads (garminconnect methods)
# ---------------------------------------------------------------------------

def _collect_extended_activity_payloads_gc(client: Any, activity_id: int) -> dict[str, Any]:
    payloads: dict[str, Any] = {}

    methods: dict[str, str] = {
        "hr_time_in_zones": "get_activity_hr_in_timezones",
        "weather": "get_activity_weather",
    }

    for key, method_name in methods.items():
        method = getattr(client, method_name, None)
        if not callable(method):
            continue
        try:
            result = method(activity_id)
            if result is not None:
                payloads[key] = result
        except Exception:
            pass

    # Raw connectapi calls for endpoints without dedicated methods
    raw_paths: dict[str, str] = {
        "activity_details": f"activity-service/activity/{activity_id}/details",
        "power_time_in_zones": f"activity-service/activity/{activity_id}/powerTimeInZones",
        "pace_time_in_zones": f"activity-service/activity/{activity_id}/paceTimeInZones",
        "speed_time_in_zones": f"activity-service/activity/{activity_id}/speedTimeInZones",
        "elevation_chart_data": f"activity-service/activity/{activity_id}/elevationChartData",
    }
    for key, path in raw_paths.items():
        try:
            result = client.connectapi(path)
            if result is not None:
                payloads[key] = result
        except Exception:
            pass

    # FIT file download
    try:
        fit_data = client.download_activity(activity_id)
        if fit_data:
            parsed_fit = _best_effort_parse_fit_archive(fit_data if isinstance(fit_data, bytes) else bytes(fit_data))
            if parsed_fit:
                payloads["fit_file"] = parsed_fit
    except Exception:
        pass

    return payloads


# ---------------------------------------------------------------------------
# Helpers kept from garth — used by athlete_health.py imports
# ---------------------------------------------------------------------------

def _safe_connectapi(client: Any, path: str) -> Any:
    try:
        return client.connectapi(path)
    except Exception as exc:
        raise GarminRequestError(f"Garmin request failed for `{path}`: {exc}", status_code=502) from exc


def _best_effort_connectapi(client: Any, path: str) -> Any | None:
    try:
        return _safe_connectapi(client, path)
    except GarminRequestError:
        return None


# ---------------------------------------------------------------------------
# User ID extraction
# ---------------------------------------------------------------------------

def _extract_garmin_user_id_from_client(client: Any) -> int:
    """Extract user ID from an authenticated garminconnect client."""
    # Try the display_name / user profile methods
    try:
        profile = client.connectapi("/userprofile-service/socialProfile")
        if isinstance(profile, dict):
            for key in ("id", "profileId", "userId", "displayName"):
                value = _coerce_int(profile.get(key))
                if value is not None:
                    return value
    except Exception:
        pass

    # Fallback: use garth's underlying user data
    try:
        if hasattr(client, "garth") and hasattr(client.garth, "client"):
            user_settings = client.connectapi("/userprofile-service/usersettings")
            if isinstance(user_settings, dict):
                uid = _coerce_int(user_settings.get("id")) or _coerce_int(user_settings.get("userId"))
                if uid is not None:
                    return uid
    except Exception:
        pass

    # Last resort: hash the email to create a stable numeric ID
    import hashlib
    email = getattr(client, "email", "") or ""
    return int(hashlib.sha256(email.encode()).hexdigest()[:12], 16)


# ---------------------------------------------------------------------------
# FIT file parsing (unchanged)
# ---------------------------------------------------------------------------

def _best_effort_parse_fit_archive(archive_bytes: bytes) -> dict[str, Any] | None:
    try:
        from fitparse import FitFile
    except ImportError:
        return {"available": False, "error": "fitparse_not_installed"}

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
        "timestamp", "heart_rate", "power", "cadence", "speed", "distance",
        "altitude", "temperature", "enhanced_speed", "enhanced_altitude",
        "position_lat", "position_long", "vertical_oscillation",
        "stance_time", "stance_time_percent", "step_length",
    ]
    streams: dict[str, list[Any]] = {}
    for key in stream_keys:
        values = [record.get(key) for record in records if record.get(key) is not None]
        if values:
            streams[key] = values
    return streams


# ---------------------------------------------------------------------------
# Activity normalization (unchanged — same Garmin JSON structure)
# ---------------------------------------------------------------------------

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
        "training_load": _coerce_float(summary.get("activityTrainingLoad")) or _coerce_float(summary_dto.get("activityTrainingLoad")),
        "training_effect": _coerce_float(summary.get("trainingEffect")) or _coerce_float(summary_dto.get("trainingEffect")),
        "start_latlng": _normalize_latlng(metadata_dto.get("startCoordinate")),
        "end_latlng": _normalize_latlng(metadata_dto.get("endCoordinate")),
        "device_name": metadata_dto.get("deviceName"),
        "laps": [_normalize_split(split, index) for index, split in enumerate(splits, start=1) if isinstance(split, dict)],
        "raw_detail": {
            "summary": summary,
            "detail": detail,
            "splits": splits,
            "extras": extras or {},
            "meta": {"detail_scope": detail_scope},
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


# ---------------------------------------------------------------------------
# Primitive helpers (unchanged)
# ---------------------------------------------------------------------------

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
# Garmin Workout Push — structured workouts to Garmin Connect
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
    if target_type_key in ("pace", "heart_rate", "power") and target.get("value_from") and target.get("value_to"):
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
    if not athlete.garmin_connected or not athlete.garmin_email or not athlete.garmin_password_encrypted:
        raise GarminRequestError("Athlete does not have Garmin connected", status_code=400)

    email = athlete.garmin_email
    password = decrypt_secret(athlete.garmin_password_encrypted)
    token = decrypt_secret(athlete.garmin_token_encrypted) if athlete.garmin_token_encrypted else None

    garmin_payload = workout_definition_to_garmin_payload(workout_definition)

    with _garmin_session(email=email, password=password, token=token, allow_reauth=True) as client:
        try:
            result = client.connectapi(
                "/workout-service/workout",
                method="POST",
                json=garmin_payload,
            )
        except Exception as exc:
            raise GarminRequestError(f"Failed to push workout to Garmin: {exc}", status_code=502) from exc

        garmin_workout_id = None
        if isinstance(result, dict):
            garmin_workout_id = result.get("workoutId")

        if garmin_workout_id and scheduled_date:
            try:
                client.connectapi(
                    f"/workout-service/schedule/{garmin_workout_id}",
                    method="POST",
                    json={"date": scheduled_date},
                )
            except Exception:
                pass

        _save_token_to_athlete(db, athlete, client)

    return result if isinstance(result, dict) else {"status": "sent"}


# ---------------------------------------------------------------------------
# Garmin Activity Storage — sync activities into local DB
# ---------------------------------------------------------------------------

SPORT_DISCIPLINE_MAP = {
    "running": "running", "trail_running": "running", "treadmill_running": "running",
    "track_running": "running", "ultra_run": "running",
    "cycling": "ciclismo", "mountain_biking": "ciclismo", "indoor_cycling": "ciclismo",
    "virtual_ride": "ciclismo", "gravel_cycling": "ciclismo", "road_biking": "ciclismo",
    "lap_swimming": "natación", "open_water_swimming": "natación", "pool_swimming": "natación",
    "swimming": "natación",
}


def _normalize_discipline(sport_type: str) -> str:
    return SPORT_DISCIPLINE_MAP.get(sport_type.lower().replace(" ", "_"), "other")


def sync_garmin_activities(db: Session, athlete: Athlete, days_back: int = 56) -> dict:
    """Sync Garmin activities into DB. Default 56 days (8 weeks) for CTL/ATL convergence."""
    from app.models.garmin_activity import GarminActivity

    end_date = datetime.utcnow().date()
    start_date = (datetime.utcnow() - timedelta(days=days_back)).date()

    activities = list_garmin_activities(db, athlete, start_date, end_date, include_full_detail=False)

    existing_ids = set(
        row[0] for row in db.query(GarminActivity.provider_activity_id)
        .filter(GarminActivity.athlete_id == athlete.id)
        .all()
    )

    new_count = 0
    now = datetime.utcnow()

    # Prepare Garmin client for FIT downloads (reuse the session)
    gc_client = None
    try:
        email = athlete.garmin_email
        password = decrypt_secret(athlete.garmin_password_encrypted)
        token = decrypt_secret(athlete.garmin_token_encrypted) if athlete.garmin_token_encrypted else None
        token_dict = json.loads(token) if token else None
        gc_client = _create_garmin_client(email, password, token_dict)
    except Exception:
        pass  # Will sync without FIT files

    for act in activities:
        act_id = act.get("provider_activity_id") or act.get("activityId")
        if not act_id or act_id in existing_ids:
            continue

        sport = act.get("sport_type") or act.get("activityType", {}).get("typeKey", "other")
        discipline = _normalize_discipline(sport)

        tss_val, tss_method = _estimate_tss_for_activity(act, athlete)

        # Enrich raw_summary with FIT streams and extended data
        enriched = dict(act)
        if gc_client:
            try:
                extras = _collect_extended_activity_payloads_gc(gc_client, act_id)
                if extras:
                    raw_detail = enriched.get("raw_detail", {})
                    if not isinstance(raw_detail, dict):
                        raw_detail = {}
                    raw_detail["extras"] = extras
                    enriched["raw_detail"] = raw_detail
            except Exception:
                pass

        ga = GarminActivity(
            athlete_id=athlete.id,
            provider_activity_id=act_id,
            sport_type=sport,
            discipline=discipline,
            name=act.get("name") or act.get("activityName"),
            started_at=_parse_activity_datetime(act),
            distance_m=act.get("distance_m") or act.get("distance"),
            moving_time_seconds=act.get("moving_time_seconds") or act.get("movingDuration"),
            elapsed_time_seconds=act.get("elapsed_time_seconds") or act.get("duration"),
            average_heartrate=act.get("average_heartrate") or act.get("averageHR"),
            max_heartrate=act.get("max_heartrate") or act.get("maxHR"),
            average_watts=act.get("average_watts") or act.get("avgPower"),
            max_watts=act.get("max_watts") or act.get("maxPower"),
            average_speed_m_s=act.get("average_speed_m_s") or act.get("averageSpeed"),
            max_speed_m_s=act.get("max_speed_m_s") or act.get("maxSpeed"),
            total_elevation_gain_m=act.get("total_elevation_gain_m") or act.get("elevationGain"),
            average_cadence=act.get("average_cadence") or act.get("averageRunningCadenceInStepsPerMinute"),
            calories=act.get("calories"),
            device_name=act.get("device_name") or act.get("deviceId"),
            tss=tss_val,
            tss_method=tss_method,
            raw_summary=enriched,
            synced_at=now,
        )
        db.add(ga)
        new_count += 1

    db.commit()

    # Save refreshed token if we used a client
    if gc_client:
        try:
            _save_token_to_athlete(db, athlete, gc_client)
        except Exception:
            pass

    athlete.garmin_last_sync_at = now
    db.commit()

    total = db.query(GarminActivity).filter(GarminActivity.athlete_id == athlete.id).count()

    matching_result = {}
    try:
        from app.services.activity_matching import match_activities_to_sessions
        from datetime import date as date_cls
        matching_result = match_activities_to_sessions(
            db,
            athlete.id,
            start_date=date_cls.fromisoformat(start_date),
            end_date=date_cls.fromisoformat(end_date),
        )
        db.commit()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Activity matching failed: %s", exc)
        matching_result = {"matching_error": str(exc)}

    return {
        "athlete_id": athlete.id,
        "new_activities": new_count,
        "total_activities": total,
        "sync_range_start": start_date,
        "sync_range_end": end_date,
        "matching": matching_result,
    }


def _parse_activity_datetime(act: dict):
    for key in ("started_at", "startTimeLocal", "startTimeGMT"):
        val = act.get(key)
        if val:
            if isinstance(val, datetime):
                return val
            try:
                return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
    return datetime.utcnow()


def _estimate_tss_for_activity(act: dict, athlete: Athlete) -> tuple:
    duration_s = act.get("moving_time_seconds") or act.get("movingDuration") or act.get("duration")
    if not duration_s or duration_s < 60:
        return (None, None)

    duration_h = duration_s / 3600.0

    avg_power = act.get("average_watts") or act.get("avgPower")
    if avg_power and avg_power > 0:
        ftp = getattr(athlete, "ftp_cycling_watts", None) or (avg_power * 1.2)
        if ftp > 0:
            intensity = avg_power / ftp
            tss = (duration_s * avg_power * intensity) / (ftp * 3600) * 100
            return (round(tss, 1), "power")

    avg_hr = act.get("average_heartrate") or act.get("averageHR")
    max_hr = act.get("max_heartrate") or act.get("maxHR")
    if avg_hr and avg_hr > 0:
        lthr = getattr(athlete, "training_hr_max", None)
        if lthr:
            lthr = lthr * 0.85
        else:
            lthr = max_hr * 0.85 if max_hr else 160
        if lthr > 0:
            intensity = avg_hr / lthr
            tss = duration_h * intensity * intensity * 100
            return (round(min(tss, 500), 1), "hr")

    tss = duration_h * 50
    return (round(min(tss, 400), 1), "estimate")


def get_stored_activities(db: Session, athlete_id: int, start_date: str = None, end_date: str = None, discipline: str = None):
    from app.models.garmin_activity import GarminActivity

    query = db.query(GarminActivity).filter(GarminActivity.athlete_id == athlete_id)

    if start_date:
        query = query.filter(GarminActivity.started_at >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(GarminActivity.started_at <= datetime.fromisoformat(end_date + "T23:59:59"))
    if discipline:
        query = query.filter(GarminActivity.discipline == discipline)

    return query.order_by(GarminActivity.started_at.desc()).all()
