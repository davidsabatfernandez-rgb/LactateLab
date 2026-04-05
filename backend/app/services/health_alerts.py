"""Health Anomaly Alert Detection Service.

Detects baseline deviations in RHR, HRV, SpO2 and respiration rate
and generates alerts for athletes and coaches.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import func as sa_func, select
from sqlalchemy.orm import Session

from app.models.athlete import Athlete
from app.models.health_sample import HealthSample

# ── Thresholds ──────────────────────────────────────────────────

ALERT_THRESHOLDS: dict[str, dict[str, Any]] = {
    "resting_hr": {
        "warn": 1.5,
        "critical": 2.0,
        "direction": "up",
        "unit": "bpm",
        "label": "FC en reposo",
        "icon": "\u2764\ufe0f",
    },
    "hrv_sdnn": {
        "warn": 1.5,
        "critical": 2.0,
        "direction": "down",
        "unit": "ms",
        "label": "HRV",
        "icon": "\U0001f4c9",
    },
    "spo2": {
        "warn_abs": 94.0,
        "critical_abs": 92.0,
        "unit": "%",
        "label": "SpO2",
        "icon": "\U0001fa78",
    },
    "respiration_rate": {
        "warn": 1.5,
        "critical": 2.0,
        "direction": "up",
        "unit": "rpm",
        "label": "Frecuencia respiratoria",
        "icon": "\U0001f32c\ufe0f",
    },
}

MIN_BASELINE_DAYS = 14
BASELINE_WINDOW_DAYS = 30


# ── Internal helpers ────────────────────────────────────────────

def _get_baseline_stats(
    db: Session,
    athlete_id: int,
    target_date: date,
    column,
    days: int = BASELINE_WINDOW_DAYS,
) -> tuple[float | None, float | None, int]:
    """Return (mean, stddev, sample_count) for a column over the baseline window."""
    start = target_date - timedelta(days=days)
    row = db.execute(
        select(
            sa_func.avg(column),
            sa_func.stddev_pop(column),
            sa_func.count(column),
        ).where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date >= start,
            HealthSample.sample_date < target_date,
            column.isnot(None),
        )
    ).one()
    avg = float(row[0]) if row[0] is not None else None
    # stddev_pop may return None or 0 with <2 samples
    std = float(row[1]) if row[1] is not None else None
    cnt = int(row[2]) if row[2] is not None else 0
    return avg, std, cnt


def _get_today_value(
    db: Session,
    athlete_id: int,
    target_date: date,
    column,
) -> float | None:
    sample = db.scalar(
        select(column).where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date == target_date,
            column.isnot(None),
        )
    )
    return float(sample) if sample is not None else None


_METRIC_COLUMNS = {
    "resting_hr": HealthSample.resting_hr,
    "hrv_sdnn": HealthSample.hrv_sdnn,
    "spo2": HealthSample.spo2,
    "respiration_rate": HealthSample.respiration_rate,
}


def _check_metric(
    db: Session,
    athlete_id: int,
    target_date: date,
    metric_key: str,
) -> dict | None:
    """Check a single metric against its baseline. Returns alert dict or None."""
    cfg = ALERT_THRESHOLDS[metric_key]
    col = _METRIC_COLUMNS[metric_key]

    current = _get_today_value(db, athlete_id, target_date, col)
    if current is None:
        return None

    # SpO2 uses absolute thresholds
    if "warn_abs" in cfg:
        return _check_absolute(current, target_date, metric_key, cfg, db, athlete_id)

    # Standard-deviation based metrics
    avg, std, cnt = _get_baseline_stats(db, athlete_id, target_date, col)
    if avg is None or cnt < MIN_BASELINE_DAYS:
        return None

    # Protect against zero/tiny std — use 5% of mean as floor
    if std is None or std < 0.01:
        std = max(avg * 0.05, 0.5)

    direction = cfg["direction"]

    if direction == "up":
        deviation = (current - avg) / std
        if deviation < cfg["warn"]:
            return None
        severity = "critical" if deviation >= cfg["critical"] else "warning"
        pct = round(((current - avg) / avg) * 100, 1) if avg > 0 else 0
        msg = _build_message_up(metric_key, cfg, current, avg, pct)
    elif direction == "down":
        deviation = (avg - current) / std
        if deviation < cfg["warn"]:
            return None
        severity = "critical" if deviation >= cfg["critical"] else "warning"
        pct = round(((avg - current) / avg) * 100, 1) if avg > 0 else 0
        msg = _build_message_down(metric_key, cfg, current, avg, pct)
    else:
        return None

    return {
        "metric": metric_key,
        "metric_label": cfg["label"],
        "severity": severity,
        "current_value": round(current, 1),
        "baseline_value": round(avg, 1),
        "deviation_pct": pct,
        "message": msg,
        "icon": cfg["icon"],
        "created_date": target_date.isoformat(),
    }


def _check_absolute(
    current: float,
    target_date: date,
    metric_key: str,
    cfg: dict,
    db: Session,
    athlete_id: int,
) -> dict | None:
    if current >= cfg["warn_abs"]:
        return None

    severity = "critical" if current < cfg["critical_abs"] else "warning"

    avg, _, cnt = _get_baseline_stats(
        db, athlete_id, target_date, _METRIC_COLUMNS[metric_key]
    )
    baseline = round(avg, 1) if avg else None
    pct = round(((avg - current) / avg) * 100, 1) if avg and avg > 0 else 0

    msg = f"Tu {cfg['label']} ({current:.0f}{cfg['unit']}) esta por debajo del umbral normal"
    if severity == "critical":
        msg = f"Tu {cfg['label']} ({current:.0f}{cfg['unit']}) esta en nivel critico, por debajo de {cfg['critical_abs']:.0f}{cfg['unit']}"

    return {
        "metric": metric_key,
        "metric_label": cfg["label"],
        "severity": severity,
        "current_value": round(current, 1),
        "baseline_value": baseline,
        "deviation_pct": pct,
        "message": msg,
        "icon": cfg["icon"],
        "created_date": target_date.isoformat(),
    }


def _build_message_up(metric_key: str, cfg: dict, current: float, avg: float, pct: float) -> str:
    label = cfg["label"].lower()
    unit = cfg["unit"]
    if metric_key == "resting_hr":
        return (
            f"Tu frecuencia cardiaca en reposo ({current:.0f} {unit}) "
            f"esta un {abs(pct):.0f}% por encima de tu media ({avg:.0f} {unit})"
        )
    return (
        f"Tu {label} ({current:.1f} {unit}) "
        f"esta un {abs(pct):.0f}% por encima de tu media ({avg:.1f} {unit})"
    )


def _build_message_down(metric_key: str, cfg: dict, current: float, avg: float, pct: float) -> str:
    label = cfg["label"]
    unit = cfg["unit"]
    if metric_key == "hrv_sdnn":
        return (
            f"Tu HRV ({current:.0f} {unit}) ha bajado un {abs(pct):.0f}% "
            f"respecto a tu media ({avg:.0f} {unit})"
        )
    return (
        f"Tu {label} ({current:.1f} {unit}) ha bajado un {abs(pct):.0f}% "
        f"respecto a tu media ({avg:.1f} {unit})"
    )


# ── Public API ──────────────────────────────────────────────────

def check_health_alerts(
    db: Session,
    athlete_id: int,
    target_date: date | None = None,
) -> list[dict]:
    """Check all vitals against baselines for a given date.

    Returns list of alert dicts sorted by severity (critical first).
    """
    if target_date is None:
        target_date = date.today()

    alerts: list[dict] = []
    for metric_key in ALERT_THRESHOLDS:
        try:
            alert = _check_metric(db, athlete_id, target_date, metric_key)
            if alert:
                alerts.append(alert)
        except Exception:
            # Don't let one metric failure break all alerts
            continue

    # Sort: critical first, then warning
    severity_order = {"critical": 0, "warning": 1}
    alerts.sort(key=lambda a: severity_order.get(a["severity"], 2))
    return alerts


def get_alert_history(
    db: Session,
    athlete_id: int,
    days: int = 14,
) -> list[dict]:
    """Return alerts for the past N days, grouped by date."""
    today = date.today()
    result: list[dict] = []

    for offset in range(days):
        check_date = today - timedelta(days=offset)
        day_alerts = check_health_alerts(db, athlete_id, check_date)
        if day_alerts:
            result.append({
                "date": check_date.isoformat(),
                "alerts": day_alerts,
            })

    return result


def get_coach_alerts(
    db: Session,
    coach_id: int,
) -> list[dict]:
    """Return active (today's) alerts for all athletes coached by coach_id."""
    athletes = db.scalars(
        select(Athlete).where(Athlete.coach_id == coach_id)
    ).all()

    today = date.today()
    result: list[dict] = []

    for athlete in athletes:
        alerts = check_health_alerts(db, athlete.id, today)
        if alerts:
            result.append({
                "athlete_id": athlete.id,
                "athlete_name": athlete.name,
                "alerts": alerts,
            })

    # Sort: athletes with critical alerts first
    def _sort_key(item: dict) -> tuple[int, str]:
        has_critical = any(a["severity"] == "critical" for a in item["alerts"])
        return (0 if has_critical else 1, item["athlete_name"])

    result.sort(key=_sort_key)
    return result
