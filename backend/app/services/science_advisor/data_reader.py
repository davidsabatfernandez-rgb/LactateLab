"""
Lector independiente de datos del atleta.

Lee directamente de la base de datos sin pasar por ningún motor
de prescripción ni de análisis. Esto garantiza que el Science Advisor
da información objetiva, no contaminada por posibles errores del motor.

Funciones principales:
- athlete_profile(): datos demográficos + benchmarks
- lactate_history(): todas las curvas de lactato con contexto
- threshold_history(): evolución de umbrales detectados
- training_summary(): resumen de entrenamiento reciente
- current_block(): bloque activo y sesiones planificadas
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session as DBSession

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Dataclasses de lectura (independientes de los modelos ORM)
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class AthleteProfile:
    """Perfil básico del atleta."""
    athlete_id: int
    name: str
    age: Optional[int]
    sex: Optional[str]
    weight: Optional[float]
    primary_discipline: str
    athlete_level: Optional[str]
    training_goal: Optional[str]
    hr_max: Optional[int]
    hr_rest: Optional[int]
    ftp_watts: Optional[int]
    ftpa_pace: Optional[float]       # s/km
    css_pace: Optional[float]        # s/100m
    total_sessions: int = 0
    total_lactate_sessions: int = 0
    first_session_date: Optional[date] = None
    last_session_date: Optional[date] = None


@dataclass
class LactateSampleRead:
    """Un punto de la curva de lactato."""
    order_index: int
    lactate_mmol: float
    pace_seconds_per_km: Optional[float]
    power_watts: Optional[float]
    heart_rate_avg: Optional[int]
    duration_seconds: Optional[int]
    purpose: str
    contextual_lactate: Optional[float] = None
    contextual_confidence: Optional[float] = None


@dataclass
class LactateSessionRead:
    """Una sesión completa de lactato con todos sus puntos."""
    session_id: int
    performed_at: datetime
    discipline: str
    power_source: Optional[str]
    session_type: str
    goal: str
    surface: Optional[str]
    temperature_c: Optional[float]
    comments: Optional[str]
    samples: list[LactateSampleRead] = field(default_factory=list)

    @property
    def num_samples(self) -> int:
        return len(self.samples)

    @property
    def min_lactate(self) -> Optional[float]:
        if not self.samples:
            return None
        return min(s.lactate_mmol for s in self.samples)

    @property
    def max_lactate(self) -> Optional[float]:
        if not self.samples:
            return None
        return max(s.lactate_mmol for s in self.samples)


@dataclass
class ThresholdSnapshotRead:
    """Un snapshot de umbrales detectados."""
    snapshot_id: int
    snapshot_date: date
    session_id: Optional[int]
    discipline: str
    power_source: Optional[str]
    method: str
    confidence: float
    # LT1
    lt1_lactate: Optional[float]
    lt1_pace: Optional[float]        # s/km
    lt1_power: Optional[float]       # watts
    lt1_hr: Optional[int]
    # LT2
    lt2_lactate: Optional[float]
    lt2_pace: Optional[float]
    lt2_power: Optional[float]
    lt2_hr: Optional[int]
    # Real thresholds (from payload)
    lt1_real: Optional[float] = None
    lt2_real: Optional[float] = None
    lt1_practical_real: Optional[float] = None
    lt2_practical_real: Optional[float] = None
    summary: Optional[str] = None


@dataclass
class TrainingWeekSummary:
    """Resumen de una semana de entrenamiento."""
    week_start: date
    total_sessions: int
    total_duration_min: float
    disciplines: list[str] = field(default_factory=list)
    avg_hr: Optional[float] = None
    lactate_sessions: int = 0


@dataclass
class FocusBlockRead:
    """Bloque de enfoque activo."""
    block_id: int
    start_date: date
    end_date: Optional[date]
    template_id: Optional[str]
    energy_system_focus: str
    block_objective: str
    block_intent: Optional[str]
    phase: Optional[str]
    status: str
    weeks_elapsed: int = 0
    planned_sessions_total: int = 0
    planned_sessions_completed: int = 0


@dataclass
class DerivedMetricRead:
    """Una métrica derivada (VO2max, VLamax, etc.)."""
    metric_type: str
    value: float
    unit: str
    confidence: float
    recorded_at: datetime
    explanation: Optional[str]


@dataclass
class TargetRead:
    """Un objetivo del atleta."""
    target_date: date
    discipline: str
    objective: str
    distance_label: Optional[str]
    distance_category: Optional[str]
    priority_level: Optional[str]


@dataclass
class AthleteDataBundle:
    """Paquete completo de datos del atleta para el advisor."""
    profile: AthleteProfile
    lactate_sessions: list[LactateSessionRead]
    threshold_history: list[ThresholdSnapshotRead]
    training_weeks: list[TrainingWeekSummary]
    current_block: Optional[FocusBlockRead]
    derived_metrics: list[DerivedMetricRead]
    targets: list[TargetRead]


# ═══════════════════════════════════════════════════════════════════════════
# Funciones de lectura
# ═══════════════════════════════════════════════════════════════════════════

def athlete_profile(db: DBSession, athlete_id: int) -> Optional[AthleteProfile]:
    """Lee el perfil del atleta directamente de la DB."""
    from app.models.athlete import Athlete
    from app.models.session import Session as SessionModel

    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        return None

    # Contar sesiones
    total = db.query(SessionModel).filter(
        SessionModel.athlete_id == athlete_id,
    ).count()

    # Contar sesiones con lactato
    from app.models.session import SessionInterval, LactateSample
    lactate_count = (
        db.query(SessionModel.id)
        .join(SessionInterval, SessionInterval.session_id == SessionModel.id)
        .join(LactateSample, LactateSample.interval_id == SessionInterval.id)
        .filter(SessionModel.athlete_id == athlete_id)
        .distinct()
        .count()
    )

    # Primera y última sesión
    from sqlalchemy import func
    date_range = db.query(
        func.min(SessionModel.performed_at),
        func.max(SessionModel.performed_at),
    ).filter(SessionModel.athlete_id == athlete_id).first()

    first_date = date_range[0].date() if date_range and date_range[0] else None
    last_date = date_range[1].date() if date_range and date_range[1] else None

    # Edad
    age = None
    if athlete.date_of_birth:
        today = date.today()
        age = today.year - athlete.date_of_birth.year
        if (today.month, today.day) < (athlete.date_of_birth.month, athlete.date_of_birth.day):
            age -= 1

    return AthleteProfile(
        athlete_id=athlete.id,
        name=athlete.name,
        age=age,
        sex=athlete.sex,
        weight=athlete.weight,
        primary_discipline=athlete.primary_discipline,
        athlete_level=getattr(athlete, "athlete_level", None),
        training_goal=athlete.training_goal,
        hr_max=athlete.training_hr_max,
        hr_rest=getattr(athlete, "hr_rest", None),
        ftp_watts=athlete.ftp_cycling_watts,
        ftpa_pace=athlete.ftpa_running_pace,
        css_pace=athlete.css_swimming_pace,
        total_sessions=total,
        total_lactate_sessions=lactate_count,
        first_session_date=first_date,
        last_session_date=last_date,
    )


def lactate_history(
    db: DBSession,
    athlete_id: int,
    discipline: Optional[str] = None,
    limit: int = 20,
) -> list[LactateSessionRead]:
    """Lee todas las sesiones con datos de lactato, de más reciente a más antigua."""
    from app.models.session import Session as SessionModel, SessionInterval, LactateSample

    query = (
        db.query(SessionModel)
        .join(SessionInterval, SessionInterval.session_id == SessionModel.id)
        .join(LactateSample, LactateSample.interval_id == SessionInterval.id)
        .filter(SessionModel.athlete_id == athlete_id)
    )
    if discipline:
        query = query.filter(SessionModel.discipline == discipline)

    sessions = (
        query
        .distinct()
        .order_by(SessionModel.performed_at.desc())
        .limit(limit)
        .all()
    )

    result: list[LactateSessionRead] = []
    for session in sessions:
        samples: list[LactateSampleRead] = []
        for interval in sorted(session.intervals, key=lambda i: i.order_index):
            if interval.lactate_sample:
                ls = interval.lactate_sample
                samples.append(LactateSampleRead(
                    order_index=interval.order_index,
                    lactate_mmol=ls.lactate_mmol,
                    pace_seconds_per_km=interval.pace_seconds_per_km,
                    power_watts=interval.power_watts,
                    heart_rate_avg=interval.heart_rate_avg,
                    duration_seconds=interval.duration_seconds,
                    purpose=interval.purpose,
                    contextual_lactate=ls.contextual_lactate,
                    contextual_confidence=ls.contextual_confidence,
                ))
        if samples:
            result.append(LactateSessionRead(
                session_id=session.id,
                performed_at=session.performed_at,
                discipline=session.discipline,
                power_source=session.power_source,
                session_type=session.session_type,
                goal=session.goal,
                surface=getattr(session, "surface", None),
                temperature_c=getattr(session, "temperature_c", None),
                comments=session.comments,
                samples=samples,
            ))

    return result


def threshold_history(
    db: DBSession,
    athlete_id: int,
    discipline: Optional[str] = None,
    limit: int = 30,
) -> list[ThresholdSnapshotRead]:
    """Lee la evolución de umbrales detectados (snapshots fisiológicos)."""
    from app.models.metrics import PhysiologicalSnapshot

    query = db.query(PhysiologicalSnapshot).filter(
        PhysiologicalSnapshot.athlete_id == athlete_id,
    )
    if discipline:
        query = query.filter(PhysiologicalSnapshot.discipline == discipline)

    snapshots = (
        query
        .order_by(PhysiologicalSnapshot.snapshot_date.desc())
        .limit(limit)
        .all()
    )

    result: list[ThresholdSnapshotRead] = []
    for snap in snapshots:
        # Extraer real_thresholds del payload
        payload = snap.payload or {}
        real = payload.get("real_thresholds") or {}

        result.append(ThresholdSnapshotRead(
            snapshot_id=snap.id,
            snapshot_date=snap.snapshot_date,
            session_id=snap.session_id,
            discipline=snap.discipline,
            power_source=snap.power_source,
            method=snap.method,
            confidence=snap.confidence,
            lt1_lactate=snap.lt1_lactate,
            lt1_pace=snap.lt1_pace_seconds_per_km,
            lt1_power=snap.lt1_power_watts,
            lt1_hr=snap.lt1_heart_rate,
            lt2_lactate=snap.lt2_lactate,
            lt2_pace=snap.lt2_pace_seconds_per_km,
            lt2_power=snap.lt2_power_watts,
            lt2_hr=snap.lt2_heart_rate,
            lt1_real=real.get("lt1_real"),
            lt2_real=real.get("lt2_real"),
            lt1_practical_real=real.get("lt1_practical_real"),
            lt2_practical_real=real.get("lt2_practical_real"),
            summary=snap.summary,
        ))

    return result


def training_summary(
    db: DBSession,
    athlete_id: int,
    weeks: int = 8,
) -> list[TrainingWeekSummary]:
    """Resumen de entrenamiento de las últimas N semanas."""
    from app.models.session import Session as SessionModel, SessionInterval, LactateSample
    from sqlalchemy import func

    cutoff = datetime.utcnow() - timedelta(weeks=weeks)

    sessions = (
        db.query(SessionModel)
        .filter(
            SessionModel.athlete_id == athlete_id,
            SessionModel.performed_at >= cutoff,
        )
        .order_by(SessionModel.performed_at)
        .all()
    )

    # Agrupar por semana (lunes = inicio)
    week_buckets: dict[date, list] = {}
    for session in sessions:
        session_date = session.performed_at.date() if isinstance(session.performed_at, datetime) else session.performed_at
        week_start = session_date - timedelta(days=session_date.weekday())
        week_buckets.setdefault(week_start, []).append(session)

    result: list[TrainingWeekSummary] = []
    for week_start in sorted(week_buckets.keys()):
        week_sessions = week_buckets[week_start]
        disciplines = list({s.discipline for s in week_sessions})

        total_duration = 0.0
        hr_values = []
        lactate_count = 0

        for session in week_sessions:
            for interval in session.intervals:
                total_duration += (interval.duration_seconds or 0) / 60.0
                if interval.heart_rate_avg:
                    hr_values.append(interval.heart_rate_avg)
                if interval.lactate_sample:
                    lactate_count += 1

        # Contar sesiones con lactato (no muestras individuales)
        lactate_sessions = sum(
            1 for s in week_sessions
            if any(i.lactate_sample for i in s.intervals)
        )

        result.append(TrainingWeekSummary(
            week_start=week_start,
            total_sessions=len(week_sessions),
            total_duration_min=round(total_duration, 1),
            disciplines=disciplines,
            avg_hr=round(sum(hr_values) / len(hr_values), 1) if hr_values else None,
            lactate_sessions=lactate_sessions,
        ))

    return result


def current_block(db: DBSession, athlete_id: int) -> Optional[FocusBlockRead]:
    """Lee el bloque de enfoque activo actual."""
    from app.models.athlete import AthleteFocusBlock
    from app.models.planned_session import PlannedSession

    block = (
        db.query(AthleteFocusBlock)
        .filter(
            AthleteFocusBlock.athlete_id == athlete_id,
            AthleteFocusBlock.status.in_(["active", "planned"]),
        )
        .order_by(AthleteFocusBlock.start_date.desc())
        .first()
    )

    if not block:
        return None

    today = date.today()
    weeks_elapsed = max(0, (today - block.start_date).days // 7)

    total_planned = db.query(PlannedSession).filter(
        PlannedSession.focus_block_id == block.id,
    ).count()

    completed = db.query(PlannedSession).filter(
        PlannedSession.focus_block_id == block.id,
        PlannedSession.status == "completed",
    ).count()

    return FocusBlockRead(
        block_id=block.id,
        start_date=block.start_date,
        end_date=block.end_date,
        template_id=block.template_id,
        energy_system_focus=block.energy_system_focus,
        block_objective=block.block_objective,
        block_intent=block.block_intent,
        phase=block.phase,
        status=block.status,
        weeks_elapsed=weeks_elapsed,
        planned_sessions_total=total_planned,
        planned_sessions_completed=completed,
    )


def derived_metrics(
    db: DBSession,
    athlete_id: int,
    limit: int = 20,
) -> list[DerivedMetricRead]:
    """Lee métricas derivadas recientes (VO2max, VLamax, etc.)."""
    from app.models.metrics import DerivedMetric

    metrics = (
        db.query(DerivedMetric)
        .filter(DerivedMetric.athlete_id == athlete_id)
        .order_by(DerivedMetric.recorded_at.desc())
        .limit(limit)
        .all()
    )

    return [
        DerivedMetricRead(
            metric_type=m.metric_type,
            value=m.value,
            unit=m.unit,
            confidence=m.confidence,
            recorded_at=m.recorded_at,
            explanation=m.explanation,
        )
        for m in metrics
    ]


def athlete_targets(
    db: DBSession,
    athlete_id: int,
) -> list[TargetRead]:
    """Lee los objetivos del atleta."""
    from app.models.athlete import AthleteTarget

    targets = (
        db.query(AthleteTarget)
        .filter(AthleteTarget.athlete_id == athlete_id)
        .order_by(AthleteTarget.target_date.asc())
        .all()
    )

    return [
        TargetRead(
            target_date=t.target_date,
            discipline=t.discipline,
            objective=t.objective,
            distance_label=t.distance_label,
            distance_category=t.distance_category,
            priority_level=t.priority_level,
        )
        for t in targets
    ]


# ═══════════════════════════════════════════════════════════════════════════
# Paquete completo
# ═══════════════════════════════════════════════════════════════════════════

def read_athlete_data(
    db: DBSession,
    athlete_id: int,
    discipline: Optional[str] = None,
) -> Optional[AthleteDataBundle]:
    """Lee TODOS los datos relevantes del atleta en un solo bundle.

    Este es el punto de entrada principal para el Science Advisor.
    Devuelve None si el atleta no existe.
    """
    profile = athlete_profile(db, athlete_id)
    if profile is None:
        return None

    return AthleteDataBundle(
        profile=profile,
        lactate_sessions=lactate_history(db, athlete_id, discipline=discipline),
        threshold_history=threshold_history(db, athlete_id, discipline=discipline),
        training_weeks=training_summary(db, athlete_id),
        current_block=current_block(db, athlete_id),
        derived_metrics=derived_metrics(db, athlete_id),
        targets=athlete_targets(db, athlete_id),
    )
