"""Behavior–outcome correlation engine (Fase 2).

Computes Welch's t-test correlations between each behavior logged in the
journal and recovery/performance outcome metrics (HRV, resting HR, sleep
quality, overall wellness).  Results are cached in the ``behavior_correlations``
table and surfaced as Spanish-language narrative insights.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from scipy.stats import ttest_ind
from sqlalchemy import select, and_, delete
from sqlalchemy.orm import Session

from app.models.behavior_correlation import BehaviorCorrelation, BehaviorInsightsDigest
from app.models.behavior_journal import (
    BehaviorJournalEntry,
    BEHAVIOR_KEYS,
    CustomBehavior,
    CustomBehaviorLog,
)
from app.models.health_sample import HealthSample
from app.models.wellness_checkin import WellnessCheckIn

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OUTCOME_METRICS: list[dict[str, Any]] = [
    {
        "key": "hrv",
        "label": "HRV",
        "field": "hrv_sdnn",
        "source": "health_sample",
        "lag": 1,
        "positive_direction": "up",
    },
    {
        "key": "resting_hr",
        "label": "FC reposo",
        "field": "resting_hr",
        "source": "health_sample",
        "lag": 1,
        "positive_direction": "down",
    },
    {
        "key": "sleep_quality",
        "label": "Calidad sueno",
        "field": "sleep_quality",
        "source": "wellness",
        "lag": 1,
        "positive_direction": "up",
    },
    {
        "key": "wellness_avg",
        "label": "Bienestar medio",
        "field": None,
        "source": "wellness",
        "lag": 1,
        "positive_direction": "up",
    },
]

MIN_SAMPLE_SIZE = 5
MIN_DAYS_FOR_INSIGHTS = 14
NEUTRAL_THRESHOLD_PCT = 2.0
P_VALUE_THRESHOLD = 0.10
STALENESS_HOURS = 24

BEHAVIOR_EMOJIS: dict[str, str] = {
    "ice_bath": "\u2744\uFE0F",
    "sauna": "\U0001F9D6",
    "massage": "\U0001F486",
    "foam_rolling": "\U0001F9F4",
    "stretching": "\U0001F9D8",
    "compression_garments": "\U0001F9E6",
    "cold_shower": "\U0001F6BF",
    "alcohol": "\U0001F37A",
    "late_meal": "\U0001F35D",
    "creatine": "\U0001F4AA",
    "caffeine_after_2pm": "\u2615",
    "fasting": "\u23F0",
    "melatonin": "\U0001F31C",
    "omega_3": "\U0001F41F",
    "vitamin_d": "\u2600\uFE0F",
    "electrolytes": "\U0001F9C3",
    "probiotics": "\U0001F9AB",
    "ashwagandha": "\U0001F33F",
    "cbd": "\U0001F33F",
    "pre_workout": "\u26A1",
    "meditation": "\U0001F9D8",
    "journaling": "\U0001F4D3",
    "breathwork": "\U0001F32C\uFE0F",
    "screens_before_bed": "\U0001F4F1",
    "consistent_bedtime": "\U0001F6CF\uFE0F",
    "sleep_mask": "\U0001F60E",
    "magnesium": "\U0001F48A",
    "mouth_tape": "\U0001FA79",
    "nasal_strip": "\U0001F443",
    "weighted_blanket": "\U0001F6CF\uFE0F",
    "white_noise": "\U0001F50A",
    "reading_before_bed": "\U0001F4DA",
    "blue_light_glasses": "\U0001F453",
    "working_late": "\U0001F4BB",
    "shift_work": "\U0001F504",
    "travel_jet_lag": "\u2708\uFE0F",
    "high_work_stress": "\U0001F62B",
    "nap": "\U0001F4A4",
    "morning_sunlight": "\U0001F305",
    "nature_outdoors": "\U0001F332",
    "social_activity": "\U0001F465",
    "sex": "\u2764\uFE0F",
    "illness": "\U0001F912",
    "injury": "\U0001FA95",
    "allergies": "\U0001F927",
    "high_altitude": "\u26F0\uFE0F",
    "antihistamine": "\U0001F48A",
    "pain_reliever": "\U0001F48A",
    "birth_control": "\U0001F48A",
    "cpap_machine": "\U0001F4A8",
    "prescription_medication": "\U0001F48A",
    "anti_inflammatory": "\U0001F48A",
}

# Behaviors that mark confounding days (excluded from analysis)
CONFOUNDING_BEHAVIORS = {"illness", "injury"}
# Behaviors that confound HRV / HR specifically
HR_CONFOUNDING_BEHAVIORS = {"high_altitude"}

# Human-readable Spanish labels for behaviours
BEHAVIOR_LABELS: dict[str, str] = {
    "ice_bath": "banarse en agua fria",
    "sauna": "usar sauna",
    "massage": "recibir masaje",
    "foam_rolling": "hacer foam rolling",
    "stretching": "estirar",
    "compression_garments": "usar prendas de compresion",
    "cold_shower": "ducharse con agua fria",
    "alcohol": "consumir alcohol",
    "late_meal": "cenar tarde",
    "creatine": "tomar creatina",
    "caffeine_after_2pm": "tomar cafeina despues de las 14h",
    "fasting": "ayunar",
    "melatonin": "tomar melatonina",
    "omega_3": "tomar omega-3",
    "vitamin_d": "tomar vitamina D",
    "electrolytes": "tomar electrolitos",
    "probiotics": "tomar probioticos",
    "ashwagandha": "tomar ashwagandha",
    "cbd": "tomar CBD",
    "pre_workout": "tomar pre-entreno",
    "meditation": "meditar",
    "journaling": "escribir diario",
    "breathwork": "hacer trabajo respiratorio",
    "screens_before_bed": "usar pantallas antes de dormir",
    "consistent_bedtime": "acostarse a hora fija",
    "sleep_mask": "usar antifaz para dormir",
    "magnesium": "tomar magnesio",
    "mouth_tape": "usar tape bucal",
    "nasal_strip": "usar tira nasal",
    "weighted_blanket": "usar manta pesada",
    "white_noise": "usar ruido blanco",
    "reading_before_bed": "leer antes de dormir",
    "blue_light_glasses": "usar gafas de luz azul",
    "working_late": "trabajar hasta tarde",
    "shift_work": "trabajar por turnos",
    "travel_jet_lag": "viajar (jet lag)",
    "high_work_stress": "tener alto estres laboral",
    "nap": "dormir siesta",
    "morning_sunlight": "exponerse al sol por la manana",
    "nature_outdoors": "estar en la naturaleza",
    "social_activity": "socializar",
    "sex": "tener relaciones sexuales",
    "illness": "estar enfermo",
    "injury": "estar lesionado",
    "allergies": "tener alergias",
    "high_altitude": "estar en altitud",
    "antihistamine": "tomar antihistaminico",
    "pain_reliever": "tomar analgesico",
    "birth_control": "tomar anticonceptivo",
    "cpap_machine": "usar CPAP",
    "prescription_medication": "tomar medicacion",
    "anti_inflammatory": "tomar antiinflamatorio",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_all_correlations(
    db: Session,
    athlete_id: int,
    window_days: int = 90,
) -> list[dict[str, Any]]:
    """Main entry point.  Computes correlations for all behaviours x all metrics."""
    end_date = date.today()
    start_date = end_date - timedelta(days=window_days)

    behavior_data = _gather_behavior_data(db, athlete_id, start_date, end_date)
    if len(behavior_data) < MIN_DAYS_FOR_INSIGHTS:
        logger.info(
            "athlete %s: only %d behavior days — skipping correlation",
            athlete_id,
            len(behavior_data),
        )
        return []

    outcome_data = _gather_outcome_data(db, athlete_id, start_date, end_date)

    # Collect all behaviour keys (built-in + custom)
    all_behavior_keys = _all_behavior_keys(behavior_data)

    results: list[dict[str, Any]] = []

    for metric in OUTCOME_METRICS:
        metric_key: str = metric["key"]
        metric_values = outcome_data.get(metric_key, {})
        if not metric_values:
            continue

        lag: int = metric["lag"]
        is_hr_metric = metric_key in ("hrv", "resting_hr")

        for bkey in all_behavior_keys:
            # Skip confounding markers — they are used for filtering, not as behaviors
            if bkey in CONFOUNDING_BEHAVIORS:
                continue

            pairs: list[tuple[bool, float]] = []
            for d, behaviors in behavior_data.items():
                # Filter out confounding days
                if behaviors.get("illness") or behaviors.get("injury"):
                    continue
                if is_hr_metric and behaviors.get("high_altitude"):
                    continue

                outcome_date = d + timedelta(days=lag)
                if outcome_date not in metric_values:
                    continue

                is_active = behaviors.get(bkey, False)
                pairs.append((bool(is_active), metric_values[outcome_date]))

            corr = _compute_single_correlation(pairs, metric["positive_direction"])
            if corr is None:
                continue

            behavior_label = _behavior_label(db, athlete_id, bkey)
            narrative = _generate_narrative(
                behavior_label,
                metric["label"],
                corr["effect_pct"],
                corr["direction"],
                corr["n_with"],
                metric["positive_direction"],
            )
            corr.update(
                {
                    "athlete_id": athlete_id,
                    "behavior_key": bkey,
                    "outcome_metric": metric_key,
                    "lag_days": lag,
                    "window_days": window_days,
                    "metric_label": metric["label"],
                    "behavior_label": behavior_label,
                    "narrative": narrative,
                }
            )
            results.append(corr)

    # Persist to DB
    _upsert_correlations(db, athlete_id, results, window_days)

    return results


def get_cached_correlations(
    db: Session,
    athlete_id: int,
    min_confidence: str = "low",
) -> list[dict[str, Any]]:
    """Return cached correlations from DB, ordered by abs(effect_pct) desc."""
    confidence_order = {"low": 0, "medium": 1, "high": 2}
    min_level = confidence_order.get(min_confidence, 0)

    rows = db.scalars(
        select(BehaviorCorrelation)
        .where(BehaviorCorrelation.athlete_id == athlete_id)
        .order_by(BehaviorCorrelation.effect_pct.desc())
    ).all()

    results: list[dict[str, Any]] = []
    for r in rows:
        if confidence_order.get(r.confidence, 0) < min_level:
            continue
        behavior_label = _behavior_label(db, athlete_id, r.behavior_key)
        metric_label = _metric_label(r.outcome_metric)
        positive_direction = _positive_direction(r.outcome_metric)
        narrative = _generate_narrative(
            behavior_label,
            metric_label,
            r.effect_pct,
            r.effect_direction,
            r.sample_size_with,
            positive_direction,
        )
        outcome_labels = {
            "hrv": "HRV",
            "resting_hr": "FC reposo",
            "sleep_quality": "Calidad sueño",
            "wellness_avg": "Bienestar",
        }
        results.append(
            {
                "behavior_key": r.behavior_key,
                "behavior_label": behavior_label,
                "behavior_emoji": BEHAVIOR_EMOJIS.get(r.behavior_key, "\U0001F4CA"),
                "outcome_metric": r.outcome_metric,
                "outcome_label": outcome_labels.get(r.outcome_metric, metric_label),
                "sample_size_with": r.sample_size_with,
                "sample_size_without": r.sample_size_without,
                "mean_with": r.mean_with,
                "mean_without": r.mean_without,
                "effect_pct": r.effect_pct,
                "effect_direction": r.effect_direction,
                "confidence": r.confidence,
                "p_value": r.p_value,
                "lag_days": r.lag_days,
                "narrative": narrative,
            }
        )

    # Sort by absolute effect (strongest first)
    results.sort(key=lambda x: abs(x["effect_pct"]), reverse=True)
    return results


def refresh_correlations(
    db: Session,
    athlete_id: int,
    window_days: int = 90,
    force: bool = False,
) -> list[dict[str, Any]]:
    """Recompute if stale (>24 h) or if *force* is True.  Returns fresh correlations."""
    if not force:
        latest = db.scalar(
            select(BehaviorCorrelation.computed_at)
            .where(BehaviorCorrelation.athlete_id == athlete_id)
            .order_by(BehaviorCorrelation.computed_at.desc())
            .limit(1)
        )
        if latest is not None:
            # Ensure latest is timezone-aware for comparison
            if latest.tzinfo is None:
                latest = latest.replace(tzinfo=timezone.utc)
            age = datetime.now(timezone.utc) - latest
            if age < timedelta(hours=STALENESS_HOURS):
                logger.debug("athlete %s: correlations still fresh (%s old)", athlete_id, age)
                return get_cached_correlations(db, athlete_id)

    return compute_all_correlations(db, athlete_id, window_days=window_days)


def get_insights_summary(db: Session, athlete_id: int) -> dict[str, Any]:
    """Return top 3 positive, top 3 negative, and data completeness info."""
    all_corrs = get_cached_correlations(db, athlete_id, min_confidence="low")

    positive = [c for c in all_corrs if c["effect_direction"] == "positive"]
    negative = [c for c in all_corrs if c["effect_direction"] == "negative"]

    # Sort by strongest effect
    positive.sort(key=lambda x: abs(x["effect_pct"]), reverse=True)
    negative.sort(key=lambda x: abs(x["effect_pct"]), reverse=True)

    # Data completeness: count unique behavior days in last 90 days
    cutoff = date.today() - timedelta(days=90)
    total_behavior_entries = len(
        db.scalars(
            select(BehaviorJournalEntry.entry_date)
            .where(
                BehaviorJournalEntry.athlete_id == athlete_id,
                BehaviorJournalEntry.entry_date >= cutoff,
            )
        ).all()
    )
    wellness_entries = len(
        db.scalars(
            select(WellnessCheckIn.check_date)
            .where(
                WellnessCheckIn.athlete_id == athlete_id,
                WellnessCheckIn.check_date >= cutoff,
            )
        ).all()
    )
    health_entries = len(
        db.scalars(
            select(HealthSample.sample_date)
            .where(
                HealthSample.athlete_id == athlete_id,
                HealthSample.sample_date >= cutoff,
            )
        ).all()
    )

    # Calculate completeness as percentage of days with both behavior + outcome data
    outcome_days = max(wellness_entries, health_entries)
    paired_days = min(total_behavior_entries, outcome_days)
    data_completeness_pct = round((paired_days / 90) * 100, 1) if paired_days > 0 else 0.0

    return {
        "top_positive": positive[:3],
        "top_negative": negative[:3],
        "data_completeness_pct": data_completeness_pct,
        "total_days_tracked": total_behavior_entries,
        "min_days_remaining": (MIN_DAYS_FOR_INSIGHTS - total_behavior_entries) if total_behavior_entries < MIN_DAYS_FOR_INSIGHTS else None,
    }


def generate_weekly_digest(db: Session, athlete_id: int) -> dict[str, Any]:
    """Generate digest for the current week: behaviour adherence + metric trends."""
    today = date.today()
    week_start = today - timedelta(days=6)

    # Behaviour adherence this week
    entries = db.scalars(
        select(BehaviorJournalEntry)
        .where(
            BehaviorJournalEntry.athlete_id == athlete_id,
            BehaviorJournalEntry.entry_date >= week_start,
            BehaviorJournalEntry.entry_date <= today,
        )
        .order_by(BehaviorJournalEntry.entry_date)
    ).all()

    days_logged = len(entries)
    behavior_counts: dict[str, int] = {}
    for entry in entries:
        for key in BEHAVIOR_KEYS:
            val = getattr(entry, key, None)
            if val is not None and val is not False and val != 0:
                behavior_counts[key] = behavior_counts.get(key, 0) + 1

    # Include custom behaviours
    custom_logs = db.scalars(
        select(CustomBehaviorLog)
        .where(
            CustomBehaviorLog.athlete_id == athlete_id,
            CustomBehaviorLog.log_date >= week_start,
            CustomBehaviorLog.log_date <= today,
            CustomBehaviorLog.value == True,  # noqa: E712
        )
    ).all()
    for log in custom_logs:
        ckey = f"custom_{log.custom_behavior_id}"
        behavior_counts[ckey] = behavior_counts.get(ckey, 0) + 1

    # Metric trends this week vs previous week
    prev_start = week_start - timedelta(days=7)
    prev_end = week_start - timedelta(days=1)

    metric_trends: list[dict[str, Any]] = []
    for metric in OUTCOME_METRICS:
        this_week = _avg_metric_in_range(db, athlete_id, metric, week_start, today)
        prev_week = _avg_metric_in_range(db, athlete_id, metric, prev_start, prev_end)
        trend: str | None = None
        change_pct: float | None = None
        if this_week is not None and prev_week is not None and prev_week != 0:
            change_pct = round((this_week - prev_week) / abs(prev_week) * 100, 1)
            if abs(change_pct) < NEUTRAL_THRESHOLD_PCT:
                trend = "stable"
            elif change_pct > 0:
                trend = "up"
            else:
                trend = "down"
        metric_trends.append(
            {
                "metric": metric["key"],
                "label": metric["label"],
                "this_week_avg": round(this_week, 2) if this_week is not None else None,
                "prev_week_avg": round(prev_week, 2) if prev_week is not None else None,
                "change_pct": change_pct,
                "trend": trend,
            }
        )

    # Top active behaviors
    top_behaviors = sorted(behavior_counts.items(), key=lambda x: -x[1])[:5]

    # Top 3 positive and top 3 negative correlations
    all_corrs = get_cached_correlations(db, athlete_id, min_confidence="low")
    positive = [c for c in all_corrs if c["effect_direction"] == "positive"]
    negative = [c for c in all_corrs if c["effect_direction"] == "negative"]
    positive.sort(key=lambda x: abs(x["effect_pct"]), reverse=True)
    negative.sort(key=lambda x: abs(x["effect_pct"]), reverse=True)

    top_positive = [
        {
            "behavior_label": c["behavior_label"],
            "behavior_emoji": BEHAVIOR_EMOJIS.get(c["behavior_key"], "\U0001F4CA"),
            "effect_pct": c["effect_pct"],
            "narrative": c["narrative"],
        }
        for c in positive[:3]
    ]
    top_negative = [
        {
            "behavior_label": c["behavior_label"],
            "behavior_emoji": BEHAVIOR_EMOJIS.get(c["behavior_key"], "\U0001F4CA"),
            "effect_pct": c["effect_pct"],
            "narrative": c["narrative"],
        }
        for c in negative[:3]
    ]

    # Normalize metric_trends keys to match monthly digest shape
    normalized_trends: list[dict[str, Any]] = []
    for t in metric_trends:
        normalized_trends.append({
            "metric": t["metric"],
            "label": t["label"],
            "this_period_avg": t["this_week_avg"],
            "prev_period_avg": t["prev_week_avg"],
            "change_pct": t["change_pct"],
            "trend": t["trend"],
        })

    digest_payload: dict[str, Any] = {
        "period_start": week_start.isoformat(),
        "period_end": today.isoformat(),
        "days_logged": days_logged,
        "total_days": 7,
        "top_behaviors": [
            {
                "key": k,
                "label": _behavior_label(db, athlete_id, k),
                "emoji": BEHAVIOR_EMOJIS.get(k, "\U0001F4CA"),
                "count": v,
            }
            for k, v in top_behaviors
        ],
        "metric_trends": normalized_trends,
        "top_positive": top_positive,
        "top_negative": top_negative,
    }

    # Persist digest
    existing = db.scalar(
        select(BehaviorInsightsDigest).where(
            BehaviorInsightsDigest.athlete_id == athlete_id,
            BehaviorInsightsDigest.digest_type == "weekly",
            BehaviorInsightsDigest.period_start == week_start,
        )
    )
    if existing:
        existing.payload = json.dumps(digest_payload, ensure_ascii=False)
        existing.period_end = today
        existing.created_at = datetime.now(timezone.utc)
    else:
        db.add(
            BehaviorInsightsDigest(
                athlete_id=athlete_id,
                digest_type="weekly",
                period_start=week_start,
                period_end=today,
                payload=json.dumps(digest_payload, ensure_ascii=False),
            )
        )
    db.commit()

    return digest_payload


def generate_monthly_digest(db: Session, athlete_id: int) -> dict[str, Any]:
    """Generate digest for the current month (last 30 days): adherence, top behaviors, metric trends, top correlations."""
    today = date.today()
    month_start = today - timedelta(days=29)
    prev_start = month_start - timedelta(days=30)
    prev_end = month_start - timedelta(days=1)

    # Behaviour adherence this month
    entries = db.scalars(
        select(BehaviorJournalEntry)
        .where(
            BehaviorJournalEntry.athlete_id == athlete_id,
            BehaviorJournalEntry.entry_date >= month_start,
            BehaviorJournalEntry.entry_date <= today,
        )
        .order_by(BehaviorJournalEntry.entry_date)
    ).all()

    days_logged = len(entries)
    behavior_counts: dict[str, int] = {}
    for entry in entries:
        for key in BEHAVIOR_KEYS:
            val = getattr(entry, key, None)
            if val is not None and val is not False and val != 0:
                behavior_counts[key] = behavior_counts.get(key, 0) + 1

    # Include custom behaviours
    custom_logs = db.scalars(
        select(CustomBehaviorLog)
        .where(
            CustomBehaviorLog.athlete_id == athlete_id,
            CustomBehaviorLog.log_date >= month_start,
            CustomBehaviorLog.log_date <= today,
            CustomBehaviorLog.value == True,  # noqa: E712
        )
    ).all()
    for log in custom_logs:
        ckey = f"custom_{log.custom_behavior_id}"
        behavior_counts[ckey] = behavior_counts.get(ckey, 0) + 1

    # Top 5 behaviors by frequency
    top_behaviors = sorted(behavior_counts.items(), key=lambda x: -x[1])[:5]

    # Metric trends: this month avg vs previous month avg
    metric_trends: list[dict[str, Any]] = []
    for metric in OUTCOME_METRICS:
        this_avg = _avg_metric_in_range(db, athlete_id, metric, month_start, today)
        prev_avg = _avg_metric_in_range(db, athlete_id, metric, prev_start, prev_end)
        trend: str | None = None
        change_pct: float | None = None
        if this_avg is not None and prev_avg is not None and prev_avg != 0:
            change_pct = round((this_avg - prev_avg) / abs(prev_avg) * 100, 1)
            if abs(change_pct) < NEUTRAL_THRESHOLD_PCT:
                trend = "stable"
            elif change_pct > 0:
                trend = "up"
            else:
                trend = "down"
        metric_trends.append(
            {
                "metric": metric["key"],
                "label": metric["label"],
                "this_period_avg": round(this_avg, 2) if this_avg is not None else None,
                "prev_period_avg": round(prev_avg, 2) if prev_avg is not None else None,
                "change_pct": change_pct,
                "trend": trend,
            }
        )

    # Top 3 positive and top 3 negative correlations
    all_corrs = get_cached_correlations(db, athlete_id, min_confidence="low")
    positive = [c for c in all_corrs if c["effect_direction"] == "positive"]
    negative = [c for c in all_corrs if c["effect_direction"] == "negative"]
    positive.sort(key=lambda x: abs(x["effect_pct"]), reverse=True)
    negative.sort(key=lambda x: abs(x["effect_pct"]), reverse=True)

    top_positive = [
        {
            "behavior_label": c["behavior_label"],
            "behavior_emoji": BEHAVIOR_EMOJIS.get(c["behavior_key"], "\U0001F4CA"),
            "effect_pct": c["effect_pct"],
            "narrative": c["narrative"],
        }
        for c in positive[:3]
    ]
    top_negative = [
        {
            "behavior_label": c["behavior_label"],
            "behavior_emoji": BEHAVIOR_EMOJIS.get(c["behavior_key"], "\U0001F4CA"),
            "effect_pct": c["effect_pct"],
            "narrative": c["narrative"],
        }
        for c in negative[:3]
    ]

    digest_payload: dict[str, Any] = {
        "period_start": month_start.isoformat(),
        "period_end": today.isoformat(),
        "days_logged": days_logged,
        "total_days": 30,
        "top_behaviors": [
            {
                "key": k,
                "label": _behavior_label(db, athlete_id, k),
                "emoji": BEHAVIOR_EMOJIS.get(k, "\U0001F4CA"),
                "count": v,
            }
            for k, v in top_behaviors
        ],
        "metric_trends": metric_trends,
        "top_positive": top_positive,
        "top_negative": top_negative,
    }

    # Persist digest
    existing = db.scalar(
        select(BehaviorInsightsDigest).where(
            BehaviorInsightsDigest.athlete_id == athlete_id,
            BehaviorInsightsDigest.digest_type == "monthly",
            BehaviorInsightsDigest.period_start == month_start,
        )
    )
    if existing:
        existing.payload = json.dumps(digest_payload, ensure_ascii=False)
        existing.period_end = today
        existing.created_at = datetime.now(timezone.utc)
    else:
        db.add(
            BehaviorInsightsDigest(
                athlete_id=athlete_id,
                digest_type="monthly",
                period_start=month_start,
                period_end=today,
                payload=json.dumps(digest_payload, ensure_ascii=False),
            )
        )
    db.commit()

    return digest_payload


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _gather_behavior_data(
    db: Session,
    athlete_id: int,
    start_date: date,
    end_date: date,
) -> dict[date, dict[str, bool]]:
    """Return ``{date: {behavior_key: is_active}}`` for all days in range."""
    entries = db.scalars(
        select(BehaviorJournalEntry).where(
            BehaviorJournalEntry.athlete_id == athlete_id,
            BehaviorJournalEntry.entry_date >= start_date,
            BehaviorJournalEntry.entry_date <= end_date,
        )
    ).all()

    result: dict[date, dict[str, bool]] = {}
    for entry in entries:
        day: dict[str, bool] = {}
        for key in BEHAVIOR_KEYS:
            val = getattr(entry, key, None)
            day[key] = val is not None and val is not False and val != 0
        result[entry.entry_date] = day

    # Merge custom behaviour logs
    custom_logs = db.scalars(
        select(CustomBehaviorLog).where(
            CustomBehaviorLog.athlete_id == athlete_id,
            CustomBehaviorLog.log_date >= start_date,
            CustomBehaviorLog.log_date <= end_date,
        )
    ).all()
    for log in custom_logs:
        ckey = f"custom_{log.custom_behavior_id}"
        if log.log_date not in result:
            result[log.log_date] = {k: False for k in BEHAVIOR_KEYS}
        result[log.log_date][ckey] = bool(log.value)

    return result


def _gather_outcome_data(
    db: Session,
    athlete_id: int,
    start_date: date,
    end_date: date,
) -> dict[str, dict[date, float]]:
    """Return ``{metric_key: {date: value}}`` for all outcome metrics."""
    # Extend range by max lag so we can look up next-day outcomes
    max_lag = max(m["lag"] for m in OUTCOME_METRICS)
    extended_end = end_date + timedelta(days=max_lag)

    # Health samples (HRV, resting HR)
    health_rows = db.scalars(
        select(HealthSample).where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date >= start_date,
            HealthSample.sample_date <= extended_end,
        )
    ).all()

    hrv_data: dict[date, float] = {}
    rhr_data: dict[date, float] = {}
    for h in health_rows:
        if h.hrv_sdnn is not None:
            hrv_data[h.sample_date] = float(h.hrv_sdnn)
        if h.resting_hr is not None:
            rhr_data[h.sample_date] = float(h.resting_hr)

    # Wellness check-ins (sleep_quality, wellness_avg)
    wellness_rows = db.scalars(
        select(WellnessCheckIn).where(
            WellnessCheckIn.athlete_id == athlete_id,
            WellnessCheckIn.check_date >= start_date,
            WellnessCheckIn.check_date <= extended_end,
        )
    ).all()

    sleep_data: dict[date, float] = {}
    wellness_avg_data: dict[date, float] = {}
    for w in wellness_rows:
        if w.sleep_quality is not None:
            sleep_data[w.check_date] = float(w.sleep_quality)
        # wellness_avg = mean(fatigue, soreness, mood, sleep_quality)
        components = [w.fatigue, w.soreness, w.mood, w.sleep_quality]
        valid = [float(c) for c in components if c is not None]
        if valid:
            wellness_avg_data[w.check_date] = sum(valid) / len(valid)

    return {
        "hrv": hrv_data,
        "resting_hr": rhr_data,
        "sleep_quality": sleep_data,
        "wellness_avg": wellness_avg_data,
    }


def _compute_single_correlation(
    pairs: list[tuple[bool, float]],
    positive_direction: str,
) -> dict[str, Any] | None:
    """Given ``[(is_active, outcome_value), ...]``, compute t-test and effect.

    Returns ``None`` if insufficient data.
    """
    with_values = [v for active, v in pairs if active]
    without_values = [v for active, v in pairs if not active]

    if len(with_values) < MIN_SAMPLE_SIZE or len(without_values) < MIN_SAMPLE_SIZE:
        return None

    mean_with = sum(with_values) / len(with_values)
    mean_without = sum(without_values) / len(without_values)

    if mean_without == 0:
        return None

    effect_pct = (mean_with - mean_without) / abs(mean_without) * 100

    # Welch's t-test
    t_stat, p_value = ttest_ind(with_values, without_values, equal_var=False)

    # Confidence based on sample sizes
    min_n = min(len(with_values), len(without_values))
    if min_n >= 30:
        confidence = "high"
    elif min_n >= 10:
        confidence = "medium"
    else:
        confidence = "low"

    # Direction: depends on metric polarity
    if abs(effect_pct) < NEUTRAL_THRESHOLD_PCT or p_value > P_VALUE_THRESHOLD:
        direction = "neutral"
    elif positive_direction == "up":
        direction = "positive" if effect_pct > 0 else "negative"
    elif positive_direction == "down":
        # For resting_hr: lower is better, so negative effect_pct = positive
        direction = "positive" if effect_pct < 0 else "negative"
    else:
        direction = "neutral"

    return {
        "n_with": len(with_values),
        "n_without": len(without_values),
        "mean_with": round(mean_with, 3),
        "mean_without": round(mean_without, 3),
        "effect_pct": round(effect_pct, 2),
        "direction": direction,
        "confidence": confidence,
        "p_value": round(float(p_value), 6) if p_value is not None else None,
    }


def _generate_narrative(
    behavior_label: str,
    metric_label: str,
    effect_pct: float,
    direction: str,
    sample_with: int,
    positive_direction: str,
) -> str:
    """Generate a Spanish-language narrative string for a single correlation."""
    abs_pct = abs(round(effect_pct, 1))

    if direction == "neutral":
        return (
            f"No se observa un efecto claro de {behavior_label} sobre tu "
            f"{metric_label} (basado en {sample_with} dias)"
        )

    # Build verb based on metric type
    metric_lower = metric_label.lower()

    if "hrv" in metric_lower:
        if effect_pct > 0:
            return (
                f"Tu HRV sube un {abs_pct}% el dia despues de {behavior_label} "
                f"(basado en {sample_with} dias)"
            )
        else:
            return (
                f"Tu HRV baja un {abs_pct}% el dia despues de {behavior_label} "
                f"(basado en {sample_with} dias)"
            )

    if "fc" in metric_lower or "reposo" in metric_lower:
        if effect_pct > 0:
            return (
                f"Tu FC en reposo sube un {abs_pct}% tras {behavior_label} "
                f"(basado en {sample_with} dias)"
            )
        else:
            return (
                f"Tu FC en reposo baja un {abs_pct}% tras {behavior_label} "
                f"(basado en {sample_with} dias)"
            )

    # Wellness / sleep quality — generic template
    if direction == "positive":
        return (
            f"Tu {metric_label} mejora un {abs_pct}% tras {behavior_label} "
            f"(basado en {sample_with} dias)"
        )
    else:
        return (
            f"Tu {metric_label} empeora un {abs_pct}% tras {behavior_label} "
            f"(basado en {sample_with} dias)"
        )


def _all_behavior_keys(behavior_data: dict[date, dict[str, bool]]) -> list[str]:
    """Collect all behaviour keys present in the data (built-in + custom)."""
    keys: set[str] = set()
    for day_behaviors in behavior_data.values():
        keys.update(day_behaviors.keys())
    return sorted(keys)


def _behavior_label(db: Session, athlete_id: int, bkey: str) -> str:
    """Return a human-readable Spanish label for a behaviour key."""
    if bkey in BEHAVIOR_LABELS:
        return BEHAVIOR_LABELS[bkey]

    # Custom behaviour
    if bkey.startswith("custom_"):
        try:
            custom_id = int(bkey.split("_", 1)[1])
        except (ValueError, IndexError):
            return bkey
        cb = db.scalar(
            select(CustomBehavior).where(
                CustomBehavior.id == custom_id,
                CustomBehavior.athlete_id == athlete_id,
            )
        )
        if cb:
            return cb.name.lower()

    return bkey.replace("_", " ")


def _metric_label(outcome_metric: str) -> str:
    """Return the Spanish label for an outcome metric key."""
    for m in OUTCOME_METRICS:
        if m["key"] == outcome_metric:
            return m["label"]
    return outcome_metric


def _positive_direction(outcome_metric: str) -> str:
    """Return 'up' or 'down' for an outcome metric."""
    for m in OUTCOME_METRICS:
        if m["key"] == outcome_metric:
            return m["positive_direction"]
    return "up"


def _upsert_correlations(
    db: Session,
    athlete_id: int,
    results: list[dict[str, Any]],
    window_days: int,
) -> None:
    """Upsert computed correlations into the database."""
    now = datetime.now(timezone.utc)

    # Delete stale correlations for this athlete + window first
    db.execute(
        delete(BehaviorCorrelation).where(
            BehaviorCorrelation.athlete_id == athlete_id,
            BehaviorCorrelation.window_days == window_days,
        )
    )

    for r in results:
        db.add(
            BehaviorCorrelation(
                athlete_id=athlete_id,
                behavior_key=r["behavior_key"],
                outcome_metric=r["outcome_metric"],
                sample_size_with=r["n_with"],
                sample_size_without=r["n_without"],
                mean_with=r["mean_with"],
                mean_without=r["mean_without"],
                effect_pct=r["effect_pct"],
                effect_direction=r["direction"],
                confidence=r["confidence"],
                p_value=r["p_value"],
                lag_days=r["lag_days"],
                window_days=r["window_days"],
                computed_at=now,
            )
        )

    db.commit()


def _avg_metric_in_range(
    db: Session,
    athlete_id: int,
    metric: dict[str, Any],
    start_date: date,
    end_date: date,
) -> float | None:
    """Compute the average of a metric in a date range.  Returns None if no data."""
    if metric["source"] == "health_sample":
        rows = db.scalars(
            select(HealthSample).where(
                HealthSample.athlete_id == athlete_id,
                HealthSample.sample_date >= start_date,
                HealthSample.sample_date <= end_date,
            )
        ).all()
        values = [
            float(getattr(r, metric["field"]))
            for r in rows
            if getattr(r, metric["field"], None) is not None
        ]
    elif metric["source"] == "wellness":
        rows = db.scalars(
            select(WellnessCheckIn).where(
                WellnessCheckIn.athlete_id == athlete_id,
                WellnessCheckIn.check_date >= start_date,
                WellnessCheckIn.check_date <= end_date,
            )
        ).all()
        if metric["key"] == "wellness_avg":
            values = []
            for w in rows:
                components = [w.fatigue, w.soreness, w.mood, w.sleep_quality]
                valid = [float(c) for c in components if c is not None]
                if valid:
                    values.append(sum(valid) / len(valid))
        else:
            field = metric["field"]
            values = [
                float(getattr(r, field))
                for r in rows
                if getattr(r, field, None) is not None
            ]
    else:
        return None

    if not values:
        return None
    return sum(values) / len(values)


# ---------------------------------------------------------------------------
# Coach aggregations
# ---------------------------------------------------------------------------


def get_coach_aggregations(db: Session, coach_user_id: int) -> dict:
    """Aggregate behavior correlations across all athletes coached by this user."""
    from app.models.athlete import Athlete

    # Get all athletes for this coach
    athletes = db.scalars(
        select(Athlete).where(Athlete.coach_id == coach_user_id)
    ).all()

    if not athletes:
        return {"aggregations": [], "total_athletes": 0}

    athlete_ids = [a.id for a in athletes]

    # Get all medium/high-confidence correlations for these athletes
    corrs = db.scalars(
        select(BehaviorCorrelation).where(
            BehaviorCorrelation.athlete_id.in_(athlete_ids),
            BehaviorCorrelation.confidence.in_(["medium", "high"]),
        )
    ).all()

    if not corrs:
        return {"aggregations": [], "total_athletes": len(athletes)}

    # Group by (behavior_key, outcome_metric)
    groups: dict[tuple[str, str], list] = {}
    for c in corrs:
        key = (c.behavior_key, c.outcome_metric)
        if key not in groups:
            groups[key] = []
        groups[key].append(c)

    # Outcome labels
    outcome_labels = {
        "hrv": "HRV",
        "resting_hr": "FC reposo",
        "sleep_quality": "Calidad sueno",
        "wellness_avg": "Bienestar",
    }

    aggregations = []
    for (bkey, metric), items in groups.items():
        # Count unique athletes affected
        unique_athletes = len(set(c.athlete_id for c in items))
        if unique_athletes < 3:  # need at least 3 athletes
            continue

        label = BEHAVIOR_LABELS.get(bkey, bkey.replace("_", " "))
        emoji = BEHAVIOR_EMOJIS.get(bkey, "\U0001F4CA")

        avg_effect = sum(c.effect_pct for c in items) / len(items)
        direction = "positive" if avg_effect > 0 else "negative" if avg_effect < 0 else "neutral"

        aggregations.append({
            "behavior_key": bkey,
            "behavior_label": label,
            "behavior_emoji": emoji,
            "affected_athletes": unique_athletes,
            "total_tracked_athletes": len(athletes),
            "avg_effect_pct": round(avg_effect, 1),
            "effect_direction": direction,
            "outcome_metric": metric,
            "outcome_label": outcome_labels.get(metric, metric),
        })

    # Sort by number of affected athletes desc
    aggregations.sort(key=lambda x: x["affected_athletes"], reverse=True)

    return {"aggregations": aggregations, "total_athletes": len(athletes)}
