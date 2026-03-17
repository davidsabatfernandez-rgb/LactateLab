from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, is_dataclass
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.core.security import decrypt_secret
from app.models.athlete import Athlete
from app.services.garmin import GarminRequestError, _best_effort_connectapi, _garmin_session, _safe_connectapi, list_garmin_activities

DEFAULT_WINDOW_DAYS = 28
MAX_WINDOW_DAYS = 84
MIN_WINDOW_DAYS = 7
WELLNESS_LOOKBACK_DAYS = 28

SPORT_TYPE_MAPPINGS: dict[str, dict[str, str]] = {
    "running": {"label": "Carrera", "color": "#d26a36"},
    "trail_running": {"label": "Trail", "color": "#b85c2e"},
    "treadmill_running": {"label": "Cinta", "color": "#c97345"},
    "cycling": {"label": "Ciclismo", "color": "#157f66"},
    "road_biking": {"label": "Ciclismo", "color": "#157f66"},
    "indoor_cycling": {"label": "Rodillo", "color": "#0f6a57"},
    "mountain_biking": {"label": "MTB", "color": "#0d8a68"},
    "swimming": {"label": "Natacion", "color": "#2563eb"},
    "lap_swimming": {"label": "Piscina", "color": "#2563eb"},
    "open_water_swimming": {"label": "Aguas abiertas", "color": "#1d4ed8"},
    "walking": {"label": "Caminata", "color": "#6b7280"},
    "hiking": {"label": "Senderismo", "color": "#7c5c37"},
    "strength_training": {"label": "Fuerza", "color": "#7c3aed"},
    "yoga": {"label": "Movilidad", "color": "#8b5cf6"},
    "cardio_training": {"label": "Cardio", "color": "#ef4444"},
    "generic": {"label": "Actividad", "color": "#64748b"},
    "unknownenumvalue_67": {"label": "Training Assessment", "color": "#8b5cf6"},
    "unknownenumvalue_68": {"label": "Recovery Check", "color": "#3b82f6"},
    "unknownenumvalue_69": {"label": "Fitness Test", "color": "#a855f7"},
}


def build_athlete_health_overview(
    db: Session,
    athlete: Athlete,
    *,
    days: int = DEFAULT_WINDOW_DAYS,
    include_activity: bool = True,
    include_raw_wellness: bool = True,
    refresh_live_health: bool = False,
) -> dict[str, Any]:
    resolved_days = max(MIN_WINDOW_DAYS, min(int(days), MAX_WINDOW_DAYS))
    window_end = date.today()
    window_start = window_end - timedelta(days=resolved_days - 1)
    notes: list[str] = []

    providers = [
        {
            "provider": "garmin",
            "label": "Garmin",
            "connected": athlete.garmin_connected,
            "status": "connected" if athlete.garmin_connected else "disconnected",
            "last_sync_at": athlete.garmin_last_sync_at,
            "detail": None,
        },
        {
            "provider": "strava",
            "label": "Strava",
            "connected": athlete.strava_connected,
            "status": "connected" if athlete.strava_connected else "disconnected",
            "last_sync_at": None,
            "detail": None,
        },
    ]

    activities: list[dict[str, Any]] = []
    if athlete.garmin_connected and include_activity:
        try:
            raw_activities = list_garmin_activities(
                db,
                athlete,
                start_date=window_start,
                end_date=window_end,
                include_full_detail=False,
                activity_limit=28,
            )
            activities = [_normalize_activity(item) for item in raw_activities]
        except GarminRequestError as exc:
            providers[0]["status"] = "error"
            providers[0]["detail"] = str(exc)
            notes.append("Garmin esta conectado, pero no hemos podido refrescar la actividad en este momento.")

    activities.sort(key=lambda item: item["started_at"], reverse=True)

    if athlete.garmin_connected and include_activity and not activities and providers[0]["status"] != "error":
        notes.append("No hay actividad Garmin visible en la ventana seleccionada.")
    if not athlete.garmin_connected:
        notes.append("Conecta Garmin para activar la capa paralela de actividad y salud del atleta.")

    summary = _build_summary(activities)
    calendar = _build_calendar(window_start, window_end, activities)
    health_metrics: list[dict[str, Any]] = []
    sleep_breakdown: list[dict[str, Any]] = []
    performance_metrics: list[dict[str, Any]] = []
    health_days: list[dict[str, Any]] = []
    raw_wellness: dict[str, Any] = {}

    if athlete.garmin_connected and athlete.garmin_email and athlete.garmin_password_encrypted and refresh_live_health:
        try:
            health_metrics, sleep_breakdown, performance_metrics, health_days, raw_wellness = _load_garmin_health_snapshot(
                athlete,
                window_end,
                include_raw_wellness=include_raw_wellness,
            )
        except GarminRequestError as exc:
            if not providers[0]["detail"]:
                providers[0]["detail"] = str(exc)
            notes.append("No hemos podido traer los parametros de salud Garmin en este momento.")
    elif athlete.garmin_connected and not refresh_live_health:
        notes.append("La portada carga en modo rapido. Pulsa actualizar salud Garmin para pedir datos en vivo.")

    return {
        "athlete_id": athlete.id,
        "athlete_name": athlete.name,
        "window_start": window_start,
        "window_end": window_end,
        "providers": providers,
        "summary": summary,
        "health_metrics": health_metrics,
        "sleep_breakdown": sleep_breakdown,
        "performance_metrics": performance_metrics,
        "health_days": health_days,
        "recent_activities": activities,
        "activity_calendar": calendar,
        "raw_wellness": raw_wellness,
        "notes": notes,
    }


def _normalize_activity(activity: dict[str, Any]) -> dict[str, Any]:
    sport_type = str(activity.get("sport_type") or "generic")
    mapping = _resolve_sport_mapping(sport_type)
    started_at = _coerce_datetime(activity.get("started_at")) or datetime.combine(date.today(), datetime.min.time())
    return {
        "provider_activity_id": int(activity.get("provider_activity_id") or 0),
        "name": str(activity.get("name") or mapping["label"]),
        "started_at": started_at,
        "sport_type": sport_type,
        "sport_label": mapping["label"],
        "sport_color": mapping["color"],
        "distance_m": float(activity.get("distance_m") or 0.0),
        "moving_time_seconds": int(activity.get("moving_time_seconds") or 0),
        "average_heartrate": _coerce_float(activity.get("average_heartrate")),
        "average_watts": _coerce_float(activity.get("average_watts")),
        "training_load": _coerce_float(activity.get("training_load")),
        "training_effect": _coerce_float(activity.get("training_effect")),
        "source": "garmin",
    }


def _build_summary(activities: list[dict[str, Any]]) -> dict[str, Any]:
    if not activities:
        return {
            "activities_count": 0,
            "training_days": 0,
            "total_duration_seconds": 0,
            "total_distance_m": 0.0,
            "most_recent_activity_at": None,
            "primary_sport_label": None,
            "primary_sport_color": None,
        }

    days_trained = {activity["started_at"].date() for activity in activities}
    load_by_sport: dict[str, int] = defaultdict(int)
    color_by_sport: dict[str, str] = {}
    for activity in activities:
        label = activity["sport_label"]
        load_by_sport[label] += activity["moving_time_seconds"]
        color_by_sport[label] = activity["sport_color"]

    primary_sport = max(load_by_sport.items(), key=lambda item: item[1])[0]
    return {
        "activities_count": len(activities),
        "training_days": len(days_trained),
        "total_duration_seconds": sum(activity["moving_time_seconds"] for activity in activities),
        "total_distance_m": round(sum(activity["distance_m"] for activity in activities), 2),
        "most_recent_activity_at": activities[0]["started_at"],
        "primary_sport_label": primary_sport,
        "primary_sport_color": color_by_sport.get(primary_sport),
    }


def _build_calendar(window_start: date, window_end: date, activities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    activities_by_day: dict[date, list[dict[str, Any]]] = defaultdict(list)
    for activity in activities:
        activities_by_day[activity["started_at"].date()].append(activity)

    days: list[dict[str, Any]] = []
    cursor = window_start
    while cursor <= window_end:
        day_activities = activities_by_day.get(cursor, [])
        primary_label = None
        primary_color = None
        if day_activities:
            by_duration: dict[str, int] = defaultdict(int)
            for activity in day_activities:
                by_duration[activity["sport_label"]] += activity["moving_time_seconds"]
            primary_label = max(by_duration.items(), key=lambda item: item[1])[0]
            primary_color = next(
                (activity["sport_color"] for activity in day_activities if activity["sport_label"] == primary_label),
                day_activities[0]["sport_color"],
            )

        days.append(
            {
                "date": cursor,
                "activity_count": len(day_activities),
                "total_duration_seconds": sum(activity["moving_time_seconds"] for activity in day_activities),
                "total_distance_m": round(sum(activity["distance_m"] for activity in day_activities), 2),
                "primary_sport_label": primary_label,
                "primary_sport_color": primary_color,
            }
        )
        cursor += timedelta(days=1)
    return days


def _resolve_sport_mapping(sport_type: str) -> dict[str, str]:
    normalized = sport_type.strip().lower().replace(" ", "_")
    if normalized in SPORT_TYPE_MAPPINGS:
        return SPORT_TYPE_MAPPINGS[normalized]

    title = sport_type.replace("_", " ").strip() or "Actividad"
    return {"label": title[:1].upper() + title[1:], "color": "#64748b"}


def _coerce_float(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _coerce_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _load_garmin_health_snapshot(
    athlete: Athlete,
    window_end: date,
    *,
    include_raw_wellness: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    assert athlete.garmin_email
    assert athlete.garmin_password_encrypted
    email = athlete.garmin_email
    try:
        password = decrypt_secret(athlete.garmin_password_encrypted)
        token = decrypt_secret(athlete.garmin_token_encrypted) if athlete.garmin_token_encrypted else None
    except ValueError as exc:
        raise GarminRequestError("Garmin credentials could not be restored for this athlete", status_code=502) from exc

    with _garmin_session(email=email, password=password, token=token, allow_reauth=True) as garth:
        window_start = window_end - timedelta(days=WELLNESS_LOOKBACK_DAYS - 1)
        sleep_scores = _best_effort_list(lambda: garth.DailySleep.list(end=window_end, period=WELLNESS_LOOKBACK_DAYS))
        steps = _best_effort_list(lambda: garth.DailySteps.list(end=window_end, period=WELLNESS_LOOKBACK_DAYS))
        stress = _best_effort_list(lambda: garth.DailyStress.list(end=window_end, period=WELLNESS_LOOKBACK_DAYS))
        intensity = _best_effort_list(lambda: garth.DailyIntensityMinutes.list(end=window_end, period=WELLNESS_LOOKBACK_DAYS))
        hrv = _best_effort_list(lambda: garth.DailyHRV.list(end=window_end, period=WELLNESS_LOOKBACK_DAYS))
        raw_sleep_scores = _best_effort_connectapi(
            garth,
            f"/wellness-service/stats/daily/sleep/score/{window_start.isoformat()}/{window_end.isoformat()}",
        )
        raw_steps = _best_effort_connectapi(
            garth,
            f"/usersummary-service/stats/steps/daily/{window_start.isoformat()}/{window_end.isoformat()}",
        )
        raw_stress = _best_effort_connectapi(
            garth,
            f"/usersummary-service/stats/stress/daily/{window_start.isoformat()}/{window_end.isoformat()}",
        )
        raw_intensity = _best_effort_connectapi(
            garth,
            f"/usersummary-service/stats/im/daily/{window_start.isoformat()}/{window_end.isoformat()}",
        )
        raw_hrv = _best_effort_connectapi(
            garth,
            f"/hrv-service/hrv/daily/{window_start.isoformat()}/{window_end.isoformat()}",
        )

        sleep_scores = sleep_scores or _normalize_stats_payload(raw_sleep_scores, {"value": ["value"]})
        steps = steps or _normalize_stats_payload(
            raw_steps,
            {
                "total_steps": ["totalSteps"],
                "total_distance": ["totalDistance"],
                "step_goal": ["stepGoal"],
            },
        )
        stress = stress or _normalize_stats_payload(
            raw_stress,
            {
                "overall_stress_level": ["overallStressLevel"],
                "rest_stress_duration": ["restStressDuration"],
                "low_stress_duration": ["lowStressDuration"],
                "medium_stress_duration": ["mediumStressDuration"],
                "high_stress_duration": ["highStressDuration"],
            },
        )
        intensity = intensity or _normalize_stats_payload(
            raw_intensity,
            {
                "weekly_goal": ["weeklyGoal"],
                "moderate_value": ["moderateValue"],
                "vigorous_value": ["vigorousValue"],
            },
        )
        hrv = hrv or _normalize_stats_payload(
            raw_hrv,
            {
                "weekly_avg": ["weeklyAvg"],
                "last_night_avg": ["lastNightAvg"],
                "last_night_5_min_high": ["lastNight5MinHigh"],
                "status": ["status"],
                "feedback_phrase": ["feedbackPhrase"],
                "baseline": ["baseline"],
                "create_time_stamp": ["createTimeStamp"],
            },
            nested_key="hrvSummaries",
        )
        sleep_detail = None
        raw_sleep_detail = None
        daily_sleep_detail_map: dict[date, dict[str, Any]] = {}
        latest_sleep_day = next(
            (_item_calendar_date(item) for item in reversed(sleep_scores) if _field(item, "value") is not None),
            None,
        )
        if latest_sleep_day:
            sleep_detail = _best_effort_item(lambda: garth.SleepData.get(latest_sleep_day))
            username = getattr(getattr(garth, "client", None), "username", None)
            raw_sleep_detail = _best_effort_connectapi(
                garth,
                f"/wellness-service/wellness/dailySleepData/{username}?date={latest_sleep_day}&nonSleepBufferMinutes=60",
            ) if username else None
            daily_sleep_detail_map = _load_daily_sleep_detail_map(garth, username, sleep_scores, window_end) if username else {}
        user_settings = _best_effort_connectapi(garth, "/userprofile-service/userprofile/user-settings")
        latest_activity_summary, latest_activity_detail = _load_latest_activity_performance_payloads(garth, window_end)

    health_days = _build_health_days(sleep_scores, steps, stress, intensity, hrv, daily_sleep_detail_map)[:7]
    health_metrics = _build_health_metrics(sleep_scores, steps, stress, intensity, hrv, sleep_detail, raw_sleep_detail)
    sleep_breakdown = _build_sleep_breakdown(sleep_detail, raw_sleep_detail)
    performance_metrics = _build_performance_metrics(user_settings, latest_activity_summary, latest_activity_detail)
    raw_wellness = (
        {
            "sleep_scores": [_serialize_dataclass(item) for item in sleep_scores],
            "steps": [_serialize_dataclass(item) for item in steps],
            "stress": [_serialize_dataclass(item) for item in stress],
            "intensity_minutes": [_serialize_dataclass(item) for item in intensity],
            "hrv": [_serialize_dataclass(item) for item in hrv],
            "sleep_detail": _serialize_dataclass(sleep_detail),
            "sleep_connectapi": raw_sleep_detail or {},
            "sleep_daily_connectapi": {item_date.isoformat(): payload for item_date, payload in daily_sleep_detail_map.items()},
            "user_settings": user_settings if isinstance(user_settings, dict) else {},
            "latest_activity_summary": latest_activity_summary or {},
            "latest_activity_detail": latest_activity_detail or {},
            "diagnostics": {
                "lookback_days": WELLNESS_LOOKBACK_DAYS,
                "sleep_scores_count": len(sleep_scores),
                "steps_count": len(steps),
                "stress_count": len(stress),
                "intensity_count": len(intensity),
                "hrv_count": len(hrv),
                "raw_sleep_scores_count": _payload_count(raw_sleep_scores),
                "raw_steps_count": _payload_count(raw_steps),
                "raw_stress_count": _payload_count(raw_stress),
                "raw_intensity_count": _payload_count(raw_intensity),
                "raw_hrv_count": _payload_count(raw_hrv),
            },
        }
        if include_raw_wellness
        else {}
    )
    return health_metrics, sleep_breakdown, performance_metrics, health_days, raw_wellness


def _build_health_days(
    sleep_scores: list[Any],
    steps: list[Any],
    stress: list[Any],
    intensity: list[Any],
    hrv: list[Any],
    sleep_detail_map: dict[date, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    by_date: dict[date, dict[str, Any]] = {}
    for item in sleep_scores:
        item_date = _item_calendar_date(item)
        if not item_date:
            continue
        by_date.setdefault(item_date, {"date": item_date})
        by_date[item_date]["sleep_score"] = _field(item, "value")
        by_date[item_date]["sleep_seconds"] = (
            _field(item, "sleep_time_seconds")
            or _field(item, "sleep_seconds")
            or by_date[item_date].get("sleep_seconds")
        )
    for item in steps:
        item_date = _item_calendar_date(item)
        if not item_date:
            continue
        by_date.setdefault(item_date, {"date": item_date})
        by_date[item_date]["steps"] = _field(item, "total_steps")
    for item in stress:
        item_date = _item_calendar_date(item)
        if not item_date:
            continue
        by_date.setdefault(item_date, {"date": item_date})
        by_date[item_date]["stress_level"] = _field(item, "overall_stress_level")
    for item in intensity:
        item_date = _item_calendar_date(item)
        if not item_date:
            continue
        by_date.setdefault(item_date, {"date": item_date})
        by_date[item_date]["intensity_minutes"] = (_field(item, "moderate_value", 0) or 0) + (_field(item, "vigorous_value", 0) or 0)
    for item in hrv:
        item_date = _item_calendar_date(item)
        if not item_date:
            continue
        by_date.setdefault(item_date, {"date": item_date})
        by_date[item_date]["hrv_status"] = _field(item, "status")
        by_date[item_date]["hrv_last_night_avg"] = _field(item, "last_night_avg")
    if sleep_detail_map:
        for item_date, payload in sleep_detail_map.items():
            by_date.setdefault(item_date, {"date": item_date})
            by_date[item_date]["resting_hr"] = _coerce_int(_first_value(payload, ("restingHeartRate",)))
            by_date[item_date]["body_battery_change"] = _coerce_int(_first_value(payload, ("bodyBatteryChange",)))
            by_date[item_date]["respiration_rate"] = _coerce_float(_first_value(payload, ("avgWakingRespirationValue",), ("averageRespirationValue",)))
            by_date[item_date]["breathing_events"] = _payload_count(_first_value(payload, ("breathingDisruptionData",)))
    return [by_date[key] for key in sorted(by_date.keys(), reverse=True)]


def _build_health_metrics(
    sleep_scores: list[Any],
    steps: list[Any],
    stress: list[Any],
    intensity: list[Any],
    hrv: list[Any],
    sleep_detail: Any,
    raw_sleep_detail: Any,
) -> list[dict[str, Any]]:
    sleep_dto = getattr(sleep_detail, "daily_sleep_dto", None) if sleep_detail is not None else None
    sleep_seconds = getattr(sleep_dto, "sleep_time_seconds", None)
    sleep_feedback = _humanize_metric_label(getattr(sleep_dto, "sleep_score_feedback", None))
    body_battery_change = _coerce_int(_first_value(raw_sleep_detail, ("bodyBatteryChange",)))
    resting_hr = _coerce_int(_first_value(raw_sleep_detail, ("restingHeartRate",)))
    latest_sleep_score = next((_field(item, "value") for item in reversed(sleep_scores) if _field(item, "value") is not None), None)
    latest_steps = next((_field(item, "total_steps") for item in reversed(steps) if _field(item, "total_steps") is not None), None)
    latest_stress = next((_field(item, "overall_stress_level") for item in reversed(stress) if _field(item, "overall_stress_level") is not None), None)
    latest_hrv = next((item for item in reversed(hrv) if _field(item, "last_night_avg") is not None), None)
    latest_intensity = next((item for item in reversed(intensity)), None)

    metrics: list[dict[str, Any]] = [
        {
            "key": "sleep_score",
            "label": "Calidad del sueño",
            "value": str(latest_sleep_score) if latest_sleep_score is not None else "n/d",
            "detail": sleep_feedback or (_format_duration_short(sleep_seconds) if isinstance(sleep_seconds, int) and sleep_seconds > 0 else None),
        },
        {
            "key": "stress",
            "label": "Stress diario",
            "value": str(latest_stress) if latest_stress is not None else "n/d",
            "detail": "Nivel global de estrés Garmin",
        },
        {
            "key": "hrv",
            "label": "HRV noche",
            "value": str(_field(latest_hrv, "last_night_avg", "n/d")) if latest_hrv else "n/d",
            "detail": _field(latest_hrv, "status") if latest_hrv else None,
        },
        {
            "key": "steps",
            "label": "Pasos",
            "value": str(latest_steps) if latest_steps is not None else "n/d",
            "detail": "Último valor diario visible",
        },
        {
            "key": "intensity",
            "label": "Minutos de intensidad",
            "value": str(((_field(latest_intensity, "moderate_value", 0) or 0) + (_field(latest_intensity, "vigorous_value", 0) or 0))) if latest_intensity else "n/d",
            "detail": "Moderado + vigoroso",
        },
    ]
    if body_battery_change is not None:
        metrics.append(
            {
                "key": "body_battery",
                "label": "Batería corporal",
                "value": str(body_battery_change),
                "detail": "Recarga nocturna visible",
            }
        )
    if resting_hr is not None:
        metrics.append(
            {
                "key": "resting_hr",
                "label": "Frecuencia en reposo",
                "value": f"{resting_hr}",
                "detail": "Pulso de reposo Garmin",
            }
        )
    return metrics


def _build_sleep_breakdown(
    sleep_detail: Any,
    raw_sleep_detail: Any,
) -> list[dict[str, Any]]:
    sleep_dto = getattr(sleep_detail, "daily_sleep_dto", None) if sleep_detail is not None else None
    if sleep_dto is None and not isinstance(raw_sleep_detail, dict):
        return []

    feedback = _humanize_metric_label(getattr(sleep_dto, "sleep_score_feedback", None))
    insight = _humanize_metric_label(getattr(sleep_dto, "sleep_score_insight", None))
    body_battery_change = _coerce_int(_first_value(raw_sleep_detail, ("bodyBatteryChange",)))
    resting_hr = _coerce_int(_first_value(raw_sleep_detail, ("restingHeartRate",)))
    breathing_events = _payload_count(_first_value(raw_sleep_detail, ("breathingDisruptionData",)))

    rows: list[dict[str, Any]] = []
    for key, label, seconds, detail in [
        ("sleep_time", "Tiempo dormido", getattr(sleep_dto, "sleep_time_seconds", None), "Sueño total visible"),
        ("deep_sleep", "Sueño profundo", getattr(sleep_dto, "deep_sleep_seconds", None), "Fase más reparadora"),
        ("light_sleep", "Sueño ligero", getattr(sleep_dto, "light_sleep_seconds", None), "Base del bloque nocturno"),
        ("rem_sleep", "REM", getattr(sleep_dto, "rem_sleep_seconds", None), "Procesamiento y recuperación"),
        ("awake_sleep", "Awake", getattr(sleep_dto, "awake_sleep_seconds", None), "Tiempo despierto"),
    ]:
        if isinstance(seconds, int) and seconds > 0:
            rows.append(
                {
                    "key": key,
                    "label": label,
                    "value": _format_duration_short(seconds),
                    "detail": detail,
                }
            )

    if body_battery_change is not None:
        rows.append(
            {
                "key": "body_battery_change",
                "label": "Batería corporal",
                "value": f"+{body_battery_change}" if body_battery_change >= 0 else str(body_battery_change),
                "detail": "Cambio nocturno visible",
            }
        )
    if resting_hr is not None:
        rows.append(
            {
                "key": "resting_hr",
                "label": "Frecuencia en reposo",
                "value": f"{resting_hr} bpm",
                "detail": "Pulso de reposo nocturno",
            }
        )

    respiration = _coerce_float(getattr(sleep_dto, "average_respiration_value", None))
    if respiration is not None:
        rows.append(
            {
                "key": "respiration",
                "label": "Respiración",
                "value": f"{respiration:.1f}/min",
                "detail": f"{breathing_events} eventos visibles" if breathing_events else "Media de respiración nocturna",
            }
        )

    if feedback:
        rows.append(
            {
                "key": "sleep_feedback",
                "label": "Feedback Garmin",
                "value": feedback,
                "detail": insight or "Lectura literal de Garmin Connect",
            }
        )

    return rows


def _build_performance_metrics(
    user_settings: Any,
    latest_activity_summary: Any,
    latest_activity_detail: Any,
) -> list[dict[str, Any]]:
    if not isinstance(user_settings, dict) and not isinstance(latest_activity_detail, dict):
        return []

    summary_dto = latest_activity_detail.get("summaryDTO") if isinstance(latest_activity_detail, dict) and isinstance(latest_activity_detail.get("summaryDTO"), dict) else {}
    activity_name = None
    if isinstance(latest_activity_summary, dict):
        activity_name = latest_activity_summary.get("activityName")
    if not activity_name and isinstance(latest_activity_detail, dict):
        activity_name = latest_activity_detail.get("activityName")
    activity_context = str(activity_name or "Ultima sesion Garmin")

    vo2max_running = _coerce_float(_first_value(user_settings, ("userData", "vo2MaxRunning"), ("vo2MaxRunning",)))
    vo2max_cycling = _coerce_float(_first_value(user_settings, ("userData", "vo2MaxCycling"), ("vo2MaxCycling",)))
    lt_hr = _coerce_int(_first_value(user_settings, ("userData", "lactateThresholdHeartRate"), ("lactateThresholdHeartRate",)))
    ftp_auto = bool(_first_value(user_settings, ("userData", "ftpAutoDetected"), ("ftpAutoDetected",)))

    functional_threshold_power = _coerce_float(summary_dto.get("functionalThresholdPower"))
    training_effect = _coerce_float(summary_dto.get("trainingEffect"))
    anaerobic_training_effect = _coerce_float(summary_dto.get("anaerobicTrainingEffect"))
    training_load = _coerce_float(summary_dto.get("activityTrainingLoad"))
    training_stress = _coerce_float(summary_dto.get("trainingStressScore"))
    training_effect_label = _humanize_metric_label(summary_dto.get("trainingEffectLabel"))

    metrics: list[dict[str, Any]] = []
    if vo2max_running is not None:
        metrics.append(
            {
                "key": "vo2max_running",
                "label": "VO2max carrera",
                "value": _format_compact_number(vo2max_running),
                "detail": "Estimacion Garmin para carrera",
            }
        )
    if vo2max_cycling is not None:
        metrics.append(
            {
                "key": "vo2max_cycling",
                "label": "VO2max ciclismo",
                "value": _format_compact_number(vo2max_cycling),
                "detail": "Estimacion Garmin para ciclismo",
            }
        )
    if lt_hr is not None:
        metrics.append(
            {
                "key": "lt_hr",
                "label": "FC umbral",
                "value": f"{lt_hr} bpm",
                "detail": "Umbral de lactato detectado por Garmin",
            }
        )
    if functional_threshold_power is not None:
        metrics.append(
            {
                "key": "ftp",
                "label": "Potencia umbral",
                "value": f"{int(round(functional_threshold_power))} W",
                "detail": "Auto-detectado por Garmin" if ftp_auto else activity_context,
            }
        )
    if training_effect is not None:
        metrics.append(
            {
                "key": "training_effect",
                "label": "Efecto del entreno",
                "value": f"{training_effect:.1f}",
                "detail": f"{training_effect_label or 'Ultima sesion'} · {activity_context}",
            }
        )
    if training_load is not None:
        metrics.append(
            {
                "key": "training_load",
                "label": "Carga del entreno",
                "value": _format_compact_number(training_load),
                "detail": activity_context,
            }
        )
    if training_stress is not None:
        metrics.append(
            {
                "key": "training_stress",
                "label": "Estrés del entreno",
                "value": _format_compact_number(training_stress),
                "detail": activity_context,
            }
        )
    if anaerobic_training_effect is not None:
        metrics.append(
            {
                "key": "anaerobic_effect",
                "label": "Efecto anaeróbico",
                "value": f"{anaerobic_training_effect:.1f}",
                "detail": "Impacto anaerobico de la ultima sesion",
            }
        )
    return metrics[:7]


def _load_latest_activity_performance_payloads(garth: Any, window_end: date) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    activity_search_start = window_end - timedelta(days=42)
    recent_activities = _best_effort_connectapi(
        garth,
        f"activitylist-service/activities/search/activities?startDate={activity_search_start.isoformat()}&limit=8",
    )
    if not isinstance(recent_activities, list):
        return None, None

    for item in recent_activities:
        if not isinstance(item, dict):
            continue
        activity_id = _coerce_int(item.get("activityId"))
        if activity_id is None:
            continue
        detail = _best_effort_connectapi(garth, f"activity-service/activity/{activity_id}")
        return item, detail if isinstance(detail, dict) else None
    return None, None


def _load_daily_sleep_detail_map(
    garth: Any,
    username: str,
    sleep_scores: list[Any],
    window_end: date,
) -> dict[date, dict[str, Any]]:
    candidate_dates = [
        item_date
        for item_date in (_item_calendar_date(item) for item in reversed(sleep_scores))
        if item_date is not None
    ]
    if not candidate_dates:
        candidate_dates = [window_end - timedelta(days=offset) for offset in range(7)]

    unique_dates: list[date] = []
    for item_date in candidate_dates:
        if item_date in unique_dates:
            continue
        unique_dates.append(item_date)
        if len(unique_dates) >= 7:
            break

    payloads: dict[date, dict[str, Any]] = {}
    for item_date in unique_dates:
        payload = _best_effort_connectapi(
            garth,
            f"/wellness-service/wellness/dailySleepData/{username}?date={item_date.isoformat()}&nonSleepBufferMinutes=60",
        )
        if isinstance(payload, dict):
            payloads[item_date] = payload
    return payloads


def _best_effort_list(loader):
    try:
        result = loader()
    except Exception:
        return []
    return result or []


def _best_effort_item(loader):
    try:
        return loader()
    except Exception:
        return None


def _serialize_dataclass(value: Any) -> Any:
    if value is None:
        return None
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, list):
        return [_serialize_dataclass(item) for item in value]
    return value


def _item_calendar_date(item: Any) -> date | None:
    raw = _field(item, "calendar_date")
    return _coerce_date(raw)


def _field(item: Any, key: str, default: Any = None) -> Any:
    if item is None:
        return default
    if isinstance(item, dict):
        return item.get(key, default)
    return getattr(item, key, default)


def _first_value(payload: Any, *paths: tuple[str, ...]) -> Any:
    if not paths:
        return None
    for path in paths:
        current = payload
        for part in path:
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(part)
            if current is None:
                break
        if current is not None:
            return current
    return None


def _coerce_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _coerce_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _normalize_stats_payload(
    payload: Any,
    field_map: dict[str, list[str]],
    *,
    nested_key: str | None = None,
) -> list[dict[str, Any]]:
    if isinstance(payload, dict) and nested_key and isinstance(payload.get(nested_key), list):
        items = payload.get(nested_key) or []
    elif isinstance(payload, list):
        items = payload
    else:
        return []

    normalized: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        source = dict(item)
        values = source.pop("values", None)
        if isinstance(values, dict):
            source.update(values)
        item_date = _coerce_date(source.get("calendarDate") or source.get("calendar_date"))
        if not item_date:
            continue
        row: dict[str, Any] = {"calendar_date": item_date}
        for target, candidates in field_map.items():
            for candidate in candidates:
                if candidate in source and source[candidate] is not None:
                    row[target] = source[candidate]
                    break
        normalized.append(row)
    return normalized


def _payload_count(payload: Any) -> int:
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict):
        if isinstance(payload.get("hrvSummaries"), list):
            return len(payload.get("hrvSummaries") or [])
        return len(payload)
    return 0


def _format_duration_short(value: Any) -> str | None:
    seconds = _coerce_int(value)
    if seconds is None or seconds <= 0:
        return None
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    if hours and minutes:
        return f"{hours}h {minutes:02d}m"
    if hours:
        return f"{hours}h"
    return f"{minutes}m"


def _format_compact_number(value: Any) -> str:
    number = _coerce_float(value)
    if number is None:
        return "n/d"
    rounded = round(number, 1)
    if float(rounded).is_integer():
        return str(int(rounded))
    return f"{rounded:.1f}"


def _humanize_metric_label(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return cleaned.replace("_", " ").title()
