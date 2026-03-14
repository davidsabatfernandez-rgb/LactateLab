"""Training load calculator — TSS / ATL / CTL / TSB / ACWR.

Cadena de cálculo por actividad:
  power_tss > pace_rtss > hr_tss > garmin_reported > None
"""

from __future__ import annotations

import json
import logging
import math
import os
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.athlete import Athlete
from app.models.metrics import DerivedMetric, PhysiologicalSnapshot

logger = logging.getLogger(__name__)

REPORT_DIR = Path(__file__).resolve().parents[3] / "reports" / "training_load_reliability"

# ── Sport mapping ────────────────────────────────────────────────────────────

_GARMIN_SPORT_TO_DISCIPLINE: dict[str, str] = {
    "running": "running",
    "trail_running": "running",
    "treadmill_running": "running",
    "track_running": "running",
    "cycling": "ciclismo",
    "mountain_biking": "ciclismo",
    "indoor_cycling": "ciclismo",
    "virtual_ride": "ciclismo",
    "gravel_cycling": "ciclismo",
    "lap_swimming": "natación",
    "open_water_swimming": "natación",
    "swimming": "natación",
    "pool_swimming": "natación",
}


def _discipline_from_garmin_sport(sport_type: str) -> str:
    return _GARMIN_SPORT_TO_DISCIPLINE.get(sport_type.lower().replace(" ", "_"), "other")


# ── TSSResult ────────────────────────────────────────────────────────────────


@dataclass
class TSSResult:
    tss: float
    method: str  # "power"|"pace"|"swim"|"hr"|"garmin_reported"
    confidence: float  # 1.0, 0.9, 0.8, 0.7, 0.5
    discipline: str
    garmin_tss: float | None = None
    warnings: list[str] = field(default_factory=list)


# ── Threshold resolution ─────────────────────────────────────────────────────


def resolve_threshold_for_discipline(
    db: Session,
    athlete: Athlete,
    discipline: str,
) -> dict[str, Any]:
    """Return threshold dict for the discipline. Priority: manual field > LT2 from lactate engine."""
    result: dict[str, Any] = {"source": "none", "discipline": discipline}

    if discipline == "running":
        if athlete.ftpa_running_pace:
            result.update(method="manual", value=athlete.ftpa_running_pace, unit="sec/km", source="manual")
        else:
            lt2_pace = _latest_lt2_pace(db, athlete.id, "running")
            if lt2_pace:
                result.update(method="lt2_pace", value=lt2_pace, unit="sec/km", source="lt2_engine")
    elif discipline == "ciclismo":
        if athlete.ftp_cycling_watts:
            result.update(method="manual", value=float(athlete.ftp_cycling_watts), unit="watts", source="manual")
        else:
            lt2_power = _latest_lt2_power(db, athlete.id, "ciclismo")
            if lt2_power:
                result.update(method="lt2_power", value=lt2_power, unit="watts", source="lt2_engine")
    elif discipline == "natación":
        if athlete.css_swimming_pace:
            result.update(method="manual", value=athlete.css_swimming_pace, unit="sec/100m", source="manual")

    return result


def _latest_lt2_pace(db: Session, athlete_id: int, discipline: str) -> float | None:
    snap = db.scalar(
        select(PhysiologicalSnapshot)
        .where(
            PhysiologicalSnapshot.athlete_id == athlete_id,
            PhysiologicalSnapshot.discipline == discipline,
            PhysiologicalSnapshot.lt2_pace_seconds_per_km.isnot(None),
        )
        .order_by(PhysiologicalSnapshot.snapshot_date.desc())
        .limit(1)
    )
    return snap.lt2_pace_seconds_per_km if snap else None


def _latest_lt2_power(db: Session, athlete_id: int, discipline: str) -> float | None:
    snap = db.scalar(
        select(PhysiologicalSnapshot)
        .where(
            PhysiologicalSnapshot.athlete_id == athlete_id,
            PhysiologicalSnapshot.discipline == discipline,
            PhysiologicalSnapshot.lt2_power_watts.isnot(None),
        )
        .order_by(PhysiologicalSnapshot.snapshot_date.desc())
        .limit(1)
    )
    return snap.lt2_power_watts if snap else None


def _latest_lt2_hr(db: Session, athlete_id: int) -> int | None:
    snap = db.scalar(
        select(PhysiologicalSnapshot)
        .where(
            PhysiologicalSnapshot.athlete_id == athlete_id,
            PhysiologicalSnapshot.lt2_heart_rate.isnot(None),
        )
        .order_by(PhysiologicalSnapshot.snapshot_date.desc())
        .limit(1)
    )
    return snap.lt2_heart_rate if snap else None


# ── TSS formulas ─────────────────────────────────────────────────────────────


def _power_tss(np_watts: float, ftp: float, duration_seconds: float) -> float:
    """IF² × hours × 100"""
    if ftp <= 0:
        return 0.0
    intensity_factor = np_watts / ftp
    hours = duration_seconds / 3600
    return intensity_factor ** 2 * hours * 100


def _pace_rtss(avg_pace_sec_km: float, threshold_pace_sec_km: float, duration_seconds: float) -> float:
    """rTSS = (threshold/actual)² × hours × 100
    threshold < actual means easier (higher sec/km = slower)."""
    if avg_pace_sec_km <= 0 or threshold_pace_sec_km <= 0:
        return 0.0
    intensity_factor = threshold_pace_sec_km / avg_pace_sec_km
    hours = duration_seconds / 3600
    return intensity_factor ** 2 * hours * 100


def _swim_tss(avg_pace_sec_100m: float, css_sec_100m: float, duration_seconds: float) -> float:
    """sTSS = IF³ × hours × 100 (cubic por resistencia agua)."""
    if avg_pace_sec_100m <= 0 or css_sec_100m <= 0:
        return 0.0
    intensity_factor = css_sec_100m / avg_pace_sec_100m
    hours = duration_seconds / 3600
    return intensity_factor ** 3 * hours * 100


def _hr_tss(
    avg_hr: float,
    duration_min: float,
    hr_max: int,
    hr_rest: int,
    lthr: int | None,
    sex: str,
) -> float:
    """TRIMP-based hrTSS.
    TRIMP = duration × HRR × 0.64 × e^(k×HRR), k=1.92(M)/1.67(F)
    Then: TRIMP / TRIMP_1h@LTHR × 100
    """
    if hr_max <= hr_rest or avg_hr <= hr_rest:
        return 0.0

    k = 1.92 if sex.lower().startswith("m") else 1.67
    hrr = (avg_hr - hr_rest) / (hr_max - hr_rest)
    hrr = max(0.0, min(1.0, hrr))
    trimp = duration_min * hrr * 0.64 * math.exp(k * hrr)

    # Reference TRIMP: 60 min at LTHR
    if lthr and lthr > hr_rest:
        hrr_ref = (lthr - hr_rest) / (hr_max - hr_rest)
        hrr_ref = max(0.01, min(1.0, hrr_ref))
        trimp_ref = 60 * hrr_ref * 0.64 * math.exp(k * hrr_ref)
    else:
        # Estimate LTHR as ~89% HRmax if unknown
        est_lthr = hr_rest + 0.89 * (hr_max - hr_rest)
        hrr_ref = (est_lthr - hr_rest) / (hr_max - hr_rest)
        trimp_ref = 60 * hrr_ref * 0.64 * math.exp(k * hrr_ref)

    if trimp_ref <= 0:
        return 0.0
    return (trimp / trimp_ref) * 100


def _extract_garmin_tss(activity: dict[str, Any]) -> float | None:
    """Extract TSS from Garmin raw detail."""
    try:
        detail = activity.get("raw_detail", {})
        if isinstance(detail, dict):
            # Try detail.summaryDTO.trainingStressScore
            summary = detail.get("detail", detail)
            if isinstance(summary, dict):
                summary_dto = summary.get("summaryDTO", summary)
                if isinstance(summary_dto, dict):
                    tss = summary_dto.get("trainingStressScore")
                    if tss is not None and isinstance(tss, (int, float)) and tss > 0:
                        return float(tss)
    except Exception:
        pass
    return None


# ── Main compute function ────────────────────────────────────────────────────


def compute_activity_tss(
    db: Session,
    athlete: Athlete,
    activity: dict[str, Any],
) -> TSSResult | None:
    """Compute TSS for a single activity. Chain: power > pace > swim > hr > garmin."""
    sport_type = activity.get("sport_type", "") or activity.get("activityType", {}).get("typeKey", "")
    discipline = _discipline_from_garmin_sport(sport_type)
    if discipline == "other":
        return None

    duration_seconds = float(activity.get("moving_time_seconds", 0) or activity.get("duration", 0) or 0)
    if duration_seconds < 60:
        return None

    garmin_tss = _extract_garmin_tss(activity)
    warnings: list[str] = []

    threshold = resolve_threshold_for_discipline(db, athlete, discipline)

    # 1. Power TSS (cycling with power meter)
    if discipline == "ciclismo" and threshold.get("source") != "none":
        np_watts = _coerce_float(activity.get("average_watts"))
        if np_watts and np_watts > 0 and threshold.get("unit") == "watts":
            tss = _power_tss(np_watts, threshold["value"], duration_seconds)
            return TSSResult(
                tss=round(tss, 1), method="power", confidence=1.0,
                discipline=discipline, garmin_tss=garmin_tss, warnings=warnings,
            )

    # 2. Pace rTSS (running)
    if discipline == "running" and threshold.get("source") != "none" and threshold.get("unit") == "sec/km":
        avg_speed = _coerce_float(activity.get("average_speed_m_s"))
        if avg_speed and avg_speed > 0:
            avg_pace = 1000 / avg_speed  # sec/km
            tss = _pace_rtss(avg_pace, threshold["value"], duration_seconds)
            return TSSResult(
                tss=round(tss, 1), method="pace", confidence=0.9,
                discipline=discipline, garmin_tss=garmin_tss, warnings=warnings,
            )

    # 3. Swim TSS (natación)
    if discipline == "natación" and threshold.get("source") != "none" and threshold.get("unit") == "sec/100m":
        avg_speed = _coerce_float(activity.get("average_speed_m_s"))
        if avg_speed and avg_speed > 0:
            avg_pace_100m = 100 / avg_speed  # sec/100m
            tss = _swim_tss(avg_pace_100m, threshold["value"], duration_seconds)
            return TSSResult(
                tss=round(tss, 1), method="swim", confidence=0.8,
                discipline=discipline, garmin_tss=garmin_tss, warnings=warnings,
            )

    # 4. hrTSS (any discipline)
    avg_hr = _coerce_float(activity.get("average_heartrate") or activity.get("averageHR"))
    hr_max = athlete.training_hr_max
    hr_rest = athlete.hr_rest
    if avg_hr and hr_max and hr_rest and avg_hr > hr_rest:
        lthr = _latest_lt2_hr(db, athlete.id)
        duration_min = duration_seconds / 60
        tss = _hr_tss(avg_hr, duration_min, hr_max, hr_rest, lthr, athlete.sex)
        if tss > 0:
            return TSSResult(
                tss=round(tss, 1), method="hr", confidence=0.7,
                discipline=discipline, garmin_tss=garmin_tss, warnings=warnings,
            )

    # 5. Garmin reported TSS
    if garmin_tss is not None:
        return TSSResult(
            tss=round(garmin_tss, 1), method="garmin_reported", confidence=0.5,
            discipline=discipline, garmin_tss=garmin_tss, warnings=["Using Garmin reported TSS (no threshold data available)"],
        )

    return None


# ── Reliability audit log ────────────────────────────────────────────────────


def _log_reliability(
    athlete_id: int,
    garmin_id: str | None,
    result: TSSResult,
) -> None:
    """Append one line to the monthly JSONL audit file."""
    try:
        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        month_tag = datetime.now(timezone.utc).strftime("%Y_%m")
        filepath = REPORT_DIR / f"tss_audit_{month_tag}.jsonl"

        delta_pct: float | None = None
        if result.garmin_tss and result.garmin_tss > 0 and result.method != "garmin_reported":
            delta_pct = round(abs(result.tss - result.garmin_tss) / result.garmin_tss * 100, 1)

        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "athlete_id": athlete_id,
            "garmin_id": garmin_id,
            "our_tss": result.tss,
            "garmin_tss": result.garmin_tss,
            "delta_pct": delta_pct,
            "method": result.method,
            "discipline": result.discipline,
            "confidence": result.confidence,
            "warnings": result.warnings,
        }
        with open(filepath, "a") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        logger.debug("Could not write TSS audit log", exc_info=True)


# ── EWMA ─────────────────────────────────────────────────────────────────────


def compute_training_load_series(
    db: Session,
    athlete: Athlete,
    activities: list[dict[str, Any]],
    start_date: date,
    end_date: date,
) -> dict[str, Any]:
    """Compute daily TSS, ATL (7d), CTL (42d), TSB, ACWR for a date range."""
    from datetime import timedelta

    # Compute TSS for each activity, with caching via DerivedMetric
    activity_results: list[dict[str, Any]] = []
    for act in activities:
        garmin_id = str(act.get("provider_activity_id") or act.get("activityId") or "")
        if not garmin_id:
            continue

        # Check cache
        cached = db.scalar(
            select(DerivedMetric).where(
                DerivedMetric.athlete_id == athlete.id,
                DerivedMetric.metric_type == "activity_tss",
                DerivedMetric.payload["garmin_activity_id"].as_string() == garmin_id,
            )
        )
        if cached:
            activity_results.append({
                "garmin_activity_id": garmin_id,
                "date": cached.recorded_at.date() if isinstance(cached.recorded_at, datetime) else cached.recorded_at,
                "tss": cached.value,
                "method": cached.payload.get("method", "cached"),
                "confidence": cached.confidence,
                "discipline": cached.payload.get("discipline", ""),
                "garmin_tss": cached.payload.get("garmin_tss"),
                "duration_minutes": cached.payload.get("duration_minutes", 0),
            })
            continue

        result = compute_activity_tss(db, athlete, act)
        if result is None:
            continue

        # Parse activity date
        started_at = act.get("started_at") or act.get("startTimeLocal") or act.get("startTimeGMT")
        if isinstance(started_at, str):
            try:
                act_date = datetime.fromisoformat(started_at.replace("Z", "+00:00")).date()
            except Exception:
                act_date = date.today()
        elif isinstance(started_at, datetime):
            act_date = started_at.date()
        elif isinstance(started_at, date):
            act_date = started_at
        else:
            act_date = date.today()

        duration_min = float(act.get("moving_time_seconds", 0) or act.get("duration", 0) or 0) / 60

        # Cache in DerivedMetric
        metric = DerivedMetric(
            athlete_id=athlete.id,
            metric_type="activity_tss",
            value=result.tss,
            unit="tss",
            confidence=result.confidence,
            recorded_at=datetime.combine(act_date, datetime.min.time()),
            explanation=f"TSS via {result.method}",
            payload={
                "garmin_activity_id": garmin_id,
                "method": result.method,
                "discipline": result.discipline,
                "garmin_tss": result.garmin_tss,
                "confidence": result.confidence,
                "duration_minutes": round(duration_min, 1),
            },
        )
        db.add(metric)

        _log_reliability(athlete.id, garmin_id, result)

        activity_results.append({
            "garmin_activity_id": garmin_id,
            "date": act_date,
            "tss": result.tss,
            "method": result.method,
            "confidence": result.confidence,
            "discipline": result.discipline,
            "garmin_tss": result.garmin_tss,
            "duration_minutes": round(duration_min, 1),
        })

    db.commit()

    # Aggregate daily TSS
    daily_tss: dict[date, dict[str, float]] = {}
    for ar in activity_results:
        d = ar["date"]
        if d not in daily_tss:
            daily_tss[d] = {}
        disc = ar["discipline"]
        daily_tss[d][disc] = daily_tss[d].get(disc, 0) + ar["tss"]

    # Build day-by-day series with EWMA (need warmup from start_date - 42d)
    warmup_start = start_date - timedelta(days=42)
    all_dates = []
    current = warmup_start
    while current <= end_date:
        all_dates.append(current)
        current += timedelta(days=1)

    atl_decay = 1 - math.exp(-1 / 7)
    ctl_decay = 1 - math.exp(-1 / 42)

    DISCIPLINES = ("running", "ciclismo", "natación")

    atl = 0.0
    ctl = 0.0
    atl_disc: dict[str, float] = {d: 0.0 for d in DISCIPLINES}
    ctl_disc: dict[str, float] = {d: 0.0 for d in DISCIPLINES}
    days_output: list[dict[str, Any]] = []

    for d in all_dates:
        day_disciplines = daily_tss.get(d, {})
        tss_total = sum(day_disciplines.values())

        atl = atl + (tss_total - atl) * atl_decay
        ctl = ctl + (tss_total - ctl) * ctl_decay
        tsb = ctl - atl
        acwr = round(atl / ctl, 2) if ctl >= 10 else None

        for disc in DISCIPLINES:
            disc_tss = day_disciplines.get(disc, 0.0)
            atl_disc[disc] = atl_disc[disc] + (disc_tss - atl_disc[disc]) * atl_decay
            ctl_disc[disc] = ctl_disc[disc] + (disc_tss - ctl_disc[disc]) * ctl_decay

        if d >= start_date:
            days_output.append({
                "date": d.isoformat(),
                "tss_total": round(tss_total, 1),
                "tss_by_discipline": {k: round(v, 1) for k, v in day_disciplines.items()},
                "atl": round(atl, 1),
                "ctl": round(ctl, 1),
                "tsb": round(tsb, 1),
                "acwr": acwr,
                "atl_by_discipline": {disc: round(atl_disc[disc], 1) for disc in DISCIPLINES},
                "ctl_by_discipline": {disc: round(ctl_disc[disc], 1) for disc in DISCIPLINES},
                "tsb_by_discipline": {disc: round(ctl_disc[disc] - atl_disc[disc], 1) for disc in DISCIPLINES},
            })

    # Resolve threshold sources for reporting
    threshold_sources: dict[str, Any] = {}
    for disc in ("running", "ciclismo", "natación"):
        th = resolve_threshold_for_discipline(db, athlete, disc)
        if th.get("source") != "none":
            threshold_sources[disc] = th

    # Compute current values
    last = days_output[-1] if days_output else {"atl": 0, "ctl": 0, "tsb": 0, "acwr": None}

    # Collect warnings
    warnings: list[str] = []
    if not threshold_sources:
        warnings.append("No threshold data available for any discipline. TSS calculations may use Garmin reported values or HR-based estimates.")
    missing = [d for d in ("running", "ciclismo", "natación") if d not in threshold_sources]
    if missing and threshold_sources:
        warnings.append(f"No threshold data for: {', '.join(missing)}. Those activities use HR or Garmin TSS.")

    # Confidence
    confs = [ar["confidence"] for ar in activity_results]
    avg_confidence = sum(confs) / len(confs) if confs else 0

    # Per-discipline current values
    current_atl_by_disc = {disc: round(atl_disc[disc], 1) for disc in DISCIPLINES}
    current_ctl_by_disc = {disc: round(ctl_disc[disc], 1) for disc in DISCIPLINES}

    return {
        "athlete_id": athlete.id,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "days": days_output,
        "current_atl": last["atl"],
        "current_ctl": last["ctl"],
        "current_tsb": last["tsb"],
        "current_acwr": last["acwr"],
        "current_atl_by_discipline": current_atl_by_disc,
        "current_ctl_by_discipline": current_ctl_by_disc,
        "threshold_sources": threshold_sources,
        "warnings": warnings,
        "avg_confidence": round(avg_confidence, 2),
    }


def _coerce_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None
