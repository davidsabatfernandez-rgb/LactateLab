"""Menstrual cycle engine — phase calculation, prediction, training tips.

Scientific references:
- McNulty et al. 2020: Exercise performance varies across the menstrual cycle
- Bruinvels et al. 2017: Sport, exercise and the menstrual cycle
- Oosthuyse & Bosch 2010: The effect of the menstrual cycle on exercise metabolism
- Mujika et al. 2018: An integrated approach to periodization
- Janse de Jonge 2003: Effects of the menstrual cycle on exercise performance
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.menstrual_cycle import MenstrualCycleLog, MenstrualCyclePreferences, MenstrualDailyLog


# ── Phase definitions (typical 28-day cycle) ─────────────────

PHASES = {
    "menstruation": {"label": "Menstruación", "color": "#ef4444"},
    "follicular": {"label": "Fase folicular", "color": "#22c55e"},
    "ovulation": {"label": "Ovulación", "color": "#a855f7"},
    "early_luteal": {"label": "Fase lútea temprana", "color": "#f59e0b"},
    "late_luteal": {"label": "Fase lútea tardía", "color": "#f97316"},
}

# Phase boundaries as fraction of cycle length (Janse de Jonge 2003)
# menstruation: days 1-5 (~18% of cycle)
# follicular: days 6-13 (~29%)
# ovulation: days 14-16 (~11%)
# early_luteal: days 17-23 (~25%)
# late_luteal: days 24-28 (~18%)
PHASE_FRACTIONS = [
    ("menstruation", 0.00, 0.18),
    ("follicular", 0.18, 0.46),
    ("ovulation", 0.46, 0.57),
    ("early_luteal", 0.57, 0.82),
    ("late_luteal", 0.82, 1.00),
]

# Training recommendations per phase (McNulty 2020, Bruinvels 2017, Oosthuyse 2010)
TRAINING_TIPS: dict[str, list[str]] = {
    "menstruation": [
        "Prioriza recuperación activa y sesiones de baja intensidad",
        "El hierro y la hidratación son clave — aumenta ingesta de hierro",
        "Si te sientes bien, puedes entrenar normal; escucha a tu cuerpo",
        "Yoga, natación suave o caminata son opciones ideales",
    ],
    "follicular": [
        "Fase óptima para entrenamientos de alta intensidad y fuerza",
        "El estrógeno alto mejora la sensibilidad a la insulina y la recuperación",
        "Aprovecha para sesiones de VO2max, intervalos y trabajo de potencia",
        "La motivación y energía suelen estar en su punto más alto",
    ],
    "ovulation": [
        "Pico de fuerza y rendimiento — ideal para tests o competiciones",
        "Precaución: mayor riesgo de lesiones ligamentosas (estrógeno pico)",
        "Calienta bien y cuida la técnica, especialmente en cambios de dirección",
        "Hidrátate más — la temperatura basal comienza a subir",
    ],
    "early_luteal": [
        "Buena fase para entrenamiento de resistencia moderada",
        "La progesterona eleva la temperatura → mayor gasto calórico en reposo",
        "Aumenta ligeramente la ingesta de carbohidratos pre-entrenamiento",
        "Las sesiones de umbral y tempo funcionan bien en esta fase",
    ],
    "late_luteal": [
        "Posible retención de líquidos y menor tolerancia al calor",
        "Reduce volumen e intensidad si notas fatiga o síntomas premenstruales",
        "Prioriza sueño y técnicas de recuperación (foam rolling, estiramientos)",
        "Los carbohidratos complejos ayudan a estabilizar el ánimo y la energía",
    ],
}

DEFAULT_CYCLE_LENGTH = 28
DEFAULT_PERIOD_LENGTH = 5


def get_current_phase(
    db: Session,
    athlete_id: int,
    prefs: MenstrualCyclePreferences,
    reference_date: Optional[date] = None,
) -> Optional[dict]:
    """Calculate current cycle phase based on logged data + preferences.

    Returns dict with: phase, phase_label, day_of_cycle, cycle_day_total,
    next_period_date, confidence, training_tips
    """
    today = reference_date or date.today()

    # Find the most recent confirmed (non-predicted) cycle start
    last_cycle = db.scalar(
        select(MenstrualCycleLog)
        .where(
            MenstrualCycleLog.athlete_id == athlete_id,
            MenstrualCycleLog.is_predicted == False,  # noqa: E712
            MenstrualCycleLog.cycle_start_date <= today,
        )
        .order_by(MenstrualCycleLog.cycle_start_date.desc())
    )

    if last_cycle is None:
        # Try using last_period_start_date from preferences
        if prefs.last_period_start_date and prefs.last_period_start_date <= today:
            cycle_start = prefs.last_period_start_date
            cycle_length = prefs.average_cycle_length_days or DEFAULT_CYCLE_LENGTH
            confidence = 0.3  # low — only from onboarding
        else:
            return None
    else:
        cycle_start = last_cycle.cycle_start_date
        cycle_length = _estimate_cycle_length(db, athlete_id, prefs)
        confidence = _compute_confidence(db, athlete_id)

    day_of_cycle = (today - cycle_start).days + 1  # 1-indexed

    # If we're past the expected cycle length, we might be in a new cycle
    if day_of_cycle > cycle_length + 7:
        # Too far past — can't reliably determine phase
        return None

    # Clamp to cycle_length for phase calculation
    effective_day = min(day_of_cycle, cycle_length)
    fraction = (effective_day - 1) / max(cycle_length - 1, 1)

    phase = "late_luteal"
    for phase_name, frac_start, frac_end in PHASE_FRACTIONS:
        if frac_start <= fraction < frac_end:
            phase = phase_name
            break

    # Override: if within period length and flow logged, it's menstruation
    period_length = prefs.average_period_length_days or DEFAULT_PERIOD_LENGTH
    if day_of_cycle <= period_length:
        phase = "menstruation"

    next_period = cycle_start + timedelta(days=cycle_length)

    return {
        "phase": phase,
        "phase_label": PHASES[phase]["label"],
        "day_of_cycle": day_of_cycle,
        "cycle_day_total": cycle_length,
        "next_period_date": next_period,
        "confidence": round(confidence, 2),
        "training_tips": TRAINING_TIPS.get(phase, []),
    }


def _estimate_cycle_length(
    db: Session, athlete_id: int, prefs: MenstrualCyclePreferences
) -> int:
    """Weighted moving average of last 6 completed cycles (more recent = more weight).

    Falls back to user-reported average, then to 28-day default.
    """
    completed = db.scalars(
        select(MenstrualCycleLog)
        .where(
            MenstrualCycleLog.athlete_id == athlete_id,
            MenstrualCycleLog.is_predicted == False,  # noqa: E712
            MenstrualCycleLog.cycle_length_days.isnot(None),
        )
        .order_by(MenstrualCycleLog.cycle_start_date.desc())
        .limit(6)
    ).all()

    if not completed:
        return prefs.average_cycle_length_days or DEFAULT_CYCLE_LENGTH

    lengths = [c.cycle_length_days for c in completed]
    # Weighted: most recent gets highest weight
    weights = list(range(1, len(lengths) + 1))
    total_w = sum(weights)
    wma = sum(l * w for l, w in zip(lengths, reversed(weights))) / total_w
    return round(wma)


def _compute_confidence(db: Session, athlete_id: int) -> float:
    """Confidence 0-1 based on number of logged cycles.

    0 cycles: 0.3 (onboarding only)
    1 cycle: 0.5
    3 cycles: 0.7
    6+ cycles: 0.9
    """
    count = db.scalar(
        select(MenstrualCycleLog.id)
        .where(
            MenstrualCycleLog.athlete_id == athlete_id,
            MenstrualCycleLog.is_predicted == False,  # noqa: E712
        )
        .order_by(MenstrualCycleLog.id)
        .limit(7)
    )
    # Quick count
    from sqlalchemy import func
    n = db.scalar(
        select(func.count())
        .select_from(MenstrualCycleLog)
        .where(
            MenstrualCycleLog.athlete_id == athlete_id,
            MenstrualCycleLog.is_predicted == False,  # noqa: E712
        )
    ) or 0

    if n == 0:
        return 0.3
    if n == 1:
        return 0.5
    if n == 2:
        return 0.6
    if n <= 4:
        return 0.7
    if n <= 6:
        return 0.85
    return 0.9


def log_period_start(
    db: Session, athlete_id: int, period_start: date, period_end_date: Optional[date] = None
) -> MenstrualCycleLog:
    """Log a new period start. Closes the previous cycle if open."""
    # Close previous open cycle
    prev = db.scalar(
        select(MenstrualCycleLog)
        .where(
            MenstrualCycleLog.athlete_id == athlete_id,
            MenstrualCycleLog.is_predicted == False,  # noqa: E712
            MenstrualCycleLog.cycle_end_date.is_(None),
        )
        .order_by(MenstrualCycleLog.cycle_start_date.desc())
    )
    if prev and prev.cycle_start_date < period_start:
        prev.cycle_end_date = period_start - timedelta(days=1)
        prev.cycle_length_days = (period_start - prev.cycle_start_date).days

    # Compute period length if end date given
    period_length = None
    if period_end_date:
        period_length = (period_end_date - period_start).days + 1

    new_cycle = MenstrualCycleLog(
        athlete_id=athlete_id,
        cycle_start_date=period_start,
        period_end_date=period_end_date,
        period_length_days=period_length,
        is_predicted=False,
    )
    db.add(new_cycle)
    return new_cycle


def upsert_daily_log(
    db: Session, athlete_id: int, data: dict
) -> MenstrualDailyLog:
    """Upsert a daily symptom/flow log."""
    log_date = data.pop("log_date")
    existing = db.scalar(
        select(MenstrualDailyLog).where(
            MenstrualDailyLog.athlete_id == athlete_id,
            MenstrualDailyLog.log_date == log_date,
        )
    )
    if existing:
        for k, v in data.items():
            setattr(existing, k, v)
        return existing

    log = MenstrualDailyLog(athlete_id=athlete_id, log_date=log_date, **data)
    db.add(log)
    return log
