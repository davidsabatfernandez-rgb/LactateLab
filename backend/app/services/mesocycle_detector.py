from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from typing import Any, Iterable, Optional

from app.models.session import Session as AthleteSession
from app.services.planning_taxonomy import infer_session_taxonomy


MAJOR_BLOCK_TYPES = {
    "aerobic_capacity_block",
    "threshold_development_block",
    "aerobic_power_block",
    "competition_specific_block",
    "technical_rebuild_block",
    "recovery_consolidation_block",
    "testing_decision_block",
}


@dataclass(frozen=True)
class ClassifiedPlanningSession:
    session_id: int | None
    performed_at: date
    discipline: str
    canonical_session_type: str
    public_label: str
    energy_system_focus: str
    mesocycle_role: str
    block_type_hint: str
    confidence: float
    rationale: str
    matched_terms: list[str]
    original_session_type: str
    goal: str


@dataclass(frozen=True)
class MesocycleWeekSummary:
    week_start: date
    week_end: date
    discipline: str
    sessions_count: int
    canonical_session_counts: dict[str, int]
    block_type_counts: dict[str, int]
    dominant_block_type: str
    dominant_public_label: str
    support_modules: list[str]
    includes_test: bool
    includes_recovery: bool
    explanation: list[str]
    confidence: float


@dataclass(frozen=True)
class DetectedMesocycle:
    start_date: date
    end_date: date
    discipline: str
    block_type: str
    block_label: str
    weeks_count: int
    session_count: int
    work_weeks: int
    recovery_weeks: int
    testing_weeks: int
    support_modules: list[str]
    dominant_session_types: list[str]
    confidence: float
    explanation: list[str]
    week_starts: list[date]


def _as_date(value: datetime | date) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _confidence_from_counts(counter: Counter[str], total: int) -> float:
    if total <= 0:
        return 0.45
    top = counter.most_common(1)[0][1] if counter else 0
    dominance = top / total
    return round(min(0.94, 0.48 + dominance * 0.28 + min(total, 5) * 0.05), 2)


def _dominant_block_type(block_type_counts: Counter[str]) -> str:
    if not block_type_counts:
        return "recovery_consolidation_block"
    if block_type_counts.get("testing_decision_block"):
        return "testing_decision_block"
    if block_type_counts.get("competition_specific_block") and block_type_counts.get("threshold_development_block"):
        if block_type_counts["competition_specific_block"] >= block_type_counts["threshold_development_block"]:
            return "competition_specific_block"
    return block_type_counts.most_common(1)[0][0]


def _dominant_public_label(sessions: Iterable[ClassifiedPlanningSession], dominant_block_type: str) -> str:
    counter = Counter(session.public_label for session in sessions if session.block_type_hint == dominant_block_type)
    if counter:
        return counter.most_common(1)[0][0]
    fallback = Counter(session.public_label for session in sessions)
    return fallback.most_common(1)[0][0] if fallback else "Bloque mixto"


def classify_session_for_planning(session: AthleteSession) -> ClassifiedPlanningSession:
    session_text = f"{session.session_type} {session.goal} {session.comments or ''}".lower()
    workout_type = session.discipline
    inferred = infer_session_taxonomy(
        title=session.session_type,
        description=session.goal,
        coach_comments=session.comments,
        workout_type=workout_type,
    )
    block_type_hint = inferred.block_type_hint
    if inferred.canonical_session_type == "mixed_session":
        if "vo2" in session_text or "30-30" in session_text or "sit" in session_text:
            block_type_hint = "aerobic_power_block"
        elif "half pace" in session_text or "race pace" in session_text:
            block_type_hint = "competition_specific_block"
        elif "lt2" in session_text:
            block_type_hint = "threshold_development_block"
    return ClassifiedPlanningSession(
        session_id=session.id if getattr(session, "id", None) is not None else None,
        performed_at=_as_date(session.performed_at),
        discipline=session.discipline,
        canonical_session_type=inferred.canonical_session_type,
        public_label=inferred.public_label,
        energy_system_focus=inferred.energy_system_focus,
        mesocycle_role=inferred.mesocycle_role,
        block_type_hint=block_type_hint,
        confidence=inferred.confidence,
        rationale=inferred.rationale,
        matched_terms=inferred.matched_terms,
        original_session_type=session.session_type,
        goal=session.goal,
    )


def summarize_training_weeks(sessions: Iterable[AthleteSession], discipline: str) -> list[MesocycleWeekSummary]:
    filtered = [session for session in sessions if session.discipline == discipline]
    classified = [classify_session_for_planning(session) for session in filtered]
    grouped: dict[date, list[ClassifiedPlanningSession]] = defaultdict(list)
    for session in classified:
        grouped[_week_start(session.performed_at)].append(session)

    summaries: list[MesocycleWeekSummary] = []
    for start in sorted(grouped):
        sessions_in_week = grouped[start]
        canonical_counts = Counter(session.canonical_session_type for session in sessions_in_week)
        block_type_counts = Counter(session.block_type_hint for session in sessions_in_week)
        dominant_block_type = _dominant_block_type(block_type_counts)
        support_modules = sorted(
            {
                session.public_label
                for session in sessions_in_week
                if session.block_type_hint in {"technical_rebuild_block", "glycolytic_support_block"} or session.mesocycle_role == "support"
            }
        )
        includes_test = any(session.block_type_hint == "testing_decision_block" for session in sessions_in_week)
        includes_recovery = any(session.block_type_hint == "recovery_consolidation_block" for session in sessions_in_week)
        explanation: list[str] = []
        if includes_test:
            explanation.append("Semana con test o evaluación que actúa como punto de decisión del bloque.")
        if dominant_block_type == "aerobic_capacity_block":
            explanation.append("Predominan sesiones extensivas y controladas orientadas a construir base.")
        elif dominant_block_type == "threshold_development_block":
            explanation.append("Predominan sesiones orientadas a empujar LT1/LT2 y sostener trabajo de umbral.")
        elif dominant_block_type == "aerobic_power_block":
            explanation.append("Predominan sesiones de VO2 o potencia aeróbica con carga más alta y específica.")
        elif dominant_block_type == "competition_specific_block":
            explanation.append("Predominan ritmos o potencias específicos de prueba, señal de fase más fina.")
        elif dominant_block_type == "technical_rebuild_block":
            explanation.append("La semana se apoya sobre técnica, fuerza o corrección de limitantes.")
        elif dominant_block_type == "recovery_consolidation_block":
            explanation.append("Semana más ligera o regenerativa para consolidar y absorber la carga previa.")

        summaries.append(
            MesocycleWeekSummary(
                week_start=start,
                week_end=start + timedelta(days=6),
                discipline=discipline,
                sessions_count=len(sessions_in_week),
                canonical_session_counts=dict(canonical_counts),
                block_type_counts=dict(block_type_counts),
                dominant_block_type=dominant_block_type,
                dominant_public_label=_dominant_public_label(sessions_in_week, dominant_block_type),
                support_modules=support_modules,
                includes_test=includes_test,
                includes_recovery=includes_recovery,
                explanation=explanation,
                confidence=_confidence_from_counts(block_type_counts, len(sessions_in_week)),
            )
        )
    return summaries


def _mesocycle_boundary(previous: MesocycleWeekSummary | None, current: MesocycleWeekSummary) -> bool:
    if previous is None:
        return True
    if previous.includes_test:
        return True
    if previous.dominant_block_type == "recovery_consolidation_block" and current.dominant_block_type != "recovery_consolidation_block":
        return True
    if current.includes_test and previous.week_start != current.week_start:
        return True
    if previous.dominant_block_type != current.dominant_block_type:
        previous_major = previous.dominant_block_type in MAJOR_BLOCK_TYPES
        current_major = current.dominant_block_type in MAJOR_BLOCK_TYPES
        if previous_major and current_major:
            return True
    return False


def _segment_dominant_block(segment: list[MesocycleWeekSummary]) -> str:
    counts = Counter(week.dominant_block_type for week in segment)
    if len(segment) > 1 and counts.get("testing_decision_block"):
        counts["testing_decision_block"] = 0
    return _dominant_block_type(counts)


def _merge_short_segments(segments: list[list[MesocycleWeekSummary]]) -> list[list[MesocycleWeekSummary]]:
    if len(segments) <= 1:
        return segments

    pending_test_segment: list[MesocycleWeekSummary] | None = None
    normalized: list[list[MesocycleWeekSummary]] = []
    for segment in segments:
        dominant = _segment_dominant_block(segment)

        # A test week is a decision point inside the surrounding block, not a mesocycle by itself.
        if len(segment) == 1 and dominant == "testing_decision_block":
            if normalized:
                normalized[-1].extend(segment)
            else:
                pending_test_segment = list(segment)
            continue

        # A single recovery week should usually close or absorb into the surrounding mesocycle.
        if len(segment) == 1 and dominant == "recovery_consolidation_block" and normalized:
            normalized[-1].extend(segment)
            continue

        if pending_test_segment:
            segment = pending_test_segment + segment
            pending_test_segment = None

        if len(segment) == 1 and normalized:
            previous_dominant = _segment_dominant_block(normalized[-1])
            if previous_dominant == dominant:
                normalized[-1].extend(segment)
                continue

        normalized.append(segment)

    if pending_test_segment:
        if normalized:
            normalized[-1].extend(pending_test_segment)
        else:
            normalized.append(pending_test_segment)

    if len(normalized) <= 1:
        return normalized

    merged: list[list[MesocycleWeekSummary]] = []
    for segment in normalized:
        if not merged:
            merged.append(segment)
            continue

        dominant = _segment_dominant_block(segment)
        previous_dominant = _segment_dominant_block(merged[-1])

        if len(segment) == 1 and previous_dominant == dominant:
            merged[-1].extend(segment)
            continue

        merged.append(segment)

    return merged


def detect_mesocycles(sessions: Iterable[AthleteSession], discipline: str) -> list[DetectedMesocycle]:
    weeks = summarize_training_weeks(sessions, discipline)
    if not weeks:
        return []

    segments: list[list[MesocycleWeekSummary]] = []
    current_segment: list[MesocycleWeekSummary] = []
    previous: MesocycleWeekSummary | None = None

    for week in weeks:
        if _mesocycle_boundary(previous, week) and current_segment:
            segments.append(current_segment)
            current_segment = []
        current_segment.append(week)
        previous = week

    if current_segment:
        segments.append(current_segment)

    segments = _merge_short_segments(segments)

    mesocycles: list[DetectedMesocycle] = []
    for segment in segments:
        block_counts = Counter(week.dominant_block_type for week in segment)
        dominant_block_type = _segment_dominant_block(segment)
        canonical_counts: Counter[str] = Counter()
        support_modules: set[str] = set()
        explanation: list[str] = []
        sessions_count = 0
        work_weeks = 0
        recovery_weeks = 0
        testing_weeks = 0

        for week in segment:
            canonical_counts.update(week.canonical_session_counts)
            support_modules.update(week.support_modules)
            sessions_count += week.sessions_count
            if week.dominant_block_type == "recovery_consolidation_block":
                recovery_weeks += 1
            elif week.dominant_block_type == "testing_decision_block":
                testing_weeks += 1
            else:
                work_weeks += 1
            explanation.extend(week.explanation[:1])

        dominant_session_types = [name for name, _ in canonical_counts.most_common(3)]
        confidence = round(
            min(
                0.93,
                0.5
                + (block_counts.most_common(1)[0][1] / max(1, len(segment))) * 0.18
                + min(len(segment), 4) * 0.06
                + (0.05 if testing_weeks else 0),
            ),
            2,
        )

        if dominant_block_type == "aerobic_capacity_block":
            explanation.append("El segmento prioriza capacidad aeróbica y estabilidad subumbral antes de apretar la especificidad.")
        elif dominant_block_type == "threshold_development_block":
            explanation.append("El segmento concentra trabajo de umbral para trasladar la base a un rendimiento más específico.")
        elif dominant_block_type == "aerobic_power_block":
            explanation.append("El segmento empuja la parte alta del sistema aeróbico y conviene mantenerlo más corto.")
        elif dominant_block_type == "competition_specific_block":
            explanation.append("El segmento ya se parece al objetivo competitivo y debe vigilar la fatiga acumulada.")
        elif dominant_block_type == "technical_rebuild_block":
            explanation.append("El segmento actúa como bloque correctivo o de soporte técnico/fuerza.")
        elif dominant_block_type == "testing_decision_block":
            explanation.append("El segmento gira alrededor de test que deberían decidir el siguiente mesociclo.")
        elif dominant_block_type == "recovery_consolidation_block":
            explanation.append("El segmento baja carga para permitir consolidación y supercompensación.")

        mesocycles.append(
            DetectedMesocycle(
                start_date=segment[0].week_start,
                end_date=segment[-1].week_end,
                discipline=discipline,
                block_type=dominant_block_type,
                block_label=segment[0].dominant_public_label if dominant_block_type == "testing_decision_block" else segment[0].dominant_public_label,
                weeks_count=len(segment),
                session_count=sessions_count,
                work_weeks=work_weeks,
                recovery_weeks=recovery_weeks,
                testing_weeks=testing_weeks,
                support_modules=sorted(support_modules),
                dominant_session_types=dominant_session_types,
                confidence=confidence,
                explanation=list(dict.fromkeys(explanation)),
                week_starts=[week.week_start for week in segment],
            )
        )
    return mesocycles


def serialize_detected_mesocycles(mesocycles: Iterable[DetectedMesocycle]) -> list[dict[str, Any]]:
    serialized = []
    for mesocycle in mesocycles:
        payload = asdict(mesocycle)
        payload["start_date"] = mesocycle.start_date.isoformat()
        payload["end_date"] = mesocycle.end_date.isoformat()
        payload["week_starts"] = [value.isoformat() for value in mesocycle.week_starts]
        serialized.append(payload)
    return serialized
