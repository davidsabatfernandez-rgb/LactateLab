"""
Detector de patrones fisiológicos en datos crudos.

Analiza las curvas de lactato, umbrales y entrenamiento del atleta
para detectar patrones relevantes que contextualicen la respuesta
del Science Advisor. Opera SOLO sobre dataclasses de data_reader.py,
sin depender de ningún motor de prescripción.

Patrones detectados:
- Tendencia de umbrales (mejora / estancamiento / regresión)
- Forma de la curva de lactato (convexa, lineal, cóncava)
- Ratio LT1/LT2 y lo que implica
- Antigüedad y fiabilidad de los datos
- Volumen y consistencia de entrenamiento
- Gaps entre LT1 y LT2 vs benchmarks
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

from .data_reader import (
    AthleteDataBundle,
    LactateSessionRead,
    ThresholdSnapshotRead,
    TrainingWeekSummary,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Patrones detectados
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class ThresholdTrend:
    """Tendencia de un umbral en el tiempo."""
    threshold: str          # "lt1" | "lt2"
    metric: str             # "pace" | "power" | "lactate" | "hr"
    direction: str          # "improving" | "stable" | "declining"
    delta_pct: float        # cambio porcentual
    window_days: int        # ventana de análisis
    num_snapshots: int      # cuántos snapshots en la ventana
    confidence: float       # 0-1


@dataclass
class CurveShape:
    """Forma de la curva de lactato de una sesión."""
    session_id: int
    shape: str              # "convex" | "linear" | "concave" | "irregular"
    baseline_mmol: float
    peak_mmol: float
    inflection_index: Optional[int]  # índice donde cambia la pendiente
    description: str


@dataclass
class LT1LT2Ratio:
    """Ratio LT1/LT2 y su interpretación."""
    ratio: float            # LT1_lactate / LT2_lactate (en ritmo/potencia)
    metric_used: str        # "pace" | "power"
    interpretation: str     # qué implica fisiológicamente
    vlamax_proxy: str       # "low" | "moderate" | "high"


@dataclass
class DataFreshness:
    """Frescura y fiabilidad de los datos."""
    last_lactate_test_days: Optional[int]
    last_snapshot_days: Optional[int]
    total_lactate_sessions: int
    avg_confidence: float
    freshness_label: str    # "fresh" | "acceptable" | "stale" | "no_data"
    warning: Optional[str]


@dataclass
class TrainingPattern:
    """Patrón de entrenamiento reciente."""
    avg_sessions_per_week: float
    avg_duration_min_per_week: float
    consistency: str        # "consistent" | "irregular" | "declining" | "ramping"
    dominant_discipline: Optional[str]
    lactate_testing_frequency: str  # "regular" | "sporadic" | "none"


@dataclass
class DetectedPatterns:
    """Todos los patrones detectados del atleta."""
    threshold_trends: list[ThresholdTrend] = field(default_factory=list)
    curve_shapes: list[CurveShape] = field(default_factory=list)
    lt1_lt2_ratio: Optional[LT1LT2Ratio] = None
    data_freshness: Optional[DataFreshness] = None
    training_pattern: Optional[TrainingPattern] = None
    context_notes: list[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# Detección de tendencias en umbrales
# ═══════════════════════════════════════════════════════════════════════════

def _detect_threshold_trends(
    snapshots: list[ThresholdSnapshotRead],
    window_days: int = 90,
) -> list[ThresholdTrend]:
    """Detecta si los umbrales están mejorando, estables o empeorando."""
    if len(snapshots) < 2:
        return []

    today = date.today()
    cutoff = today - timedelta(days=window_days)
    recent = [s for s in snapshots if s.snapshot_date >= cutoff]

    if len(recent) < 2:
        # Ampliar ventana si hay pocos datos
        recent = snapshots[:5]
        if len(recent) < 2:
            return []

    trends: list[ThresholdTrend] = []

    for threshold in ("lt1", "lt2"):
        for metric, getter in [
            ("pace", lambda s, t: getattr(s, f"{t}_pace")),
            ("power", lambda s, t: getattr(s, f"{t}_power")),
            ("hr", lambda s, t: getattr(s, f"{t}_hr")),
        ]:
            values = []
            for snap in recent:
                val = getter(snap, threshold)
                if val is not None:
                    values.append((snap.snapshot_date, val, snap.confidence))

            if len(values) < 2:
                continue

            # Ordenar cronológicamente
            values.sort(key=lambda x: x[0])
            oldest_val = values[0][1]
            newest_val = values[-1][1]
            avg_conf = sum(v[2] for v in values) / len(values)

            if oldest_val == 0:
                continue

            # Para ritmo (pace), un valor MÁS BAJO es mejor
            # Para potencia y HR, un valor MÁS ALTO es mejor en LT2
            if metric == "pace":
                delta_pct = ((oldest_val - newest_val) / oldest_val) * 100
            else:
                delta_pct = ((newest_val - oldest_val) / abs(oldest_val)) * 100

            if abs(delta_pct) < 1.0:
                direction = "stable"
            elif delta_pct > 0:
                direction = "improving"
            else:
                direction = "declining"

            actual_window = (values[-1][0] - values[0][0]).days

            trends.append(ThresholdTrend(
                threshold=threshold,
                metric=metric,
                direction=direction,
                delta_pct=round(delta_pct, 2),
                window_days=actual_window,
                num_snapshots=len(values),
                confidence=round(avg_conf, 2),
            ))

    return trends


# ═══════════════════════════════════════════════════════════════════════════
# Análisis de forma de la curva de lactato
# ═══════════════════════════════════════════════════════════════════════════

def _analyze_curve_shape(session: LactateSessionRead) -> Optional[CurveShape]:
    """Analiza la forma de la curva de lactato de una sesión."""
    samples = session.samples
    if len(samples) < 4:
        return None

    lactates = [s.lactate_mmol for s in samples]
    baseline = lactates[0]
    peak = max(lactates)

    # Calcular pendientes entre puntos consecutivos
    slopes = []
    for i in range(1, len(lactates)):
        slopes.append(lactates[i] - lactates[i - 1])

    # Detectar inflexión: dónde la pendiente aumenta significativamente
    inflection_index = None
    for i in range(1, len(slopes)):
        if slopes[i] > slopes[i - 1] * 1.5 and slopes[i] > 0.3:
            inflection_index = i + 1
            break

    # Clasificar forma
    increasing_slopes = sum(1 for s in slopes if s > 0.1)
    decreasing_slopes = sum(1 for s in slopes if s < -0.1)
    total = len(slopes)

    if total == 0:
        return None

    if increasing_slopes / total > 0.7:
        # Mayoría subiendo
        # Diferenciar convex vs linear
        first_half_avg = sum(slopes[:total // 2]) / max(1, total // 2)
        second_half_avg = sum(slopes[total // 2:]) / max(1, total - total // 2)

        if second_half_avg > first_half_avg * 1.5:
            shape = "convex"
            desc = ("Curva convexa — el lactato sube lentamente al inicio y se "
                    "acelera en las últimas etapas. Patrón típico de atleta "
                    "con buena base aeróbica.")
        else:
            shape = "linear"
            desc = ("Curva lineal — el lactato sube de forma proporcional a la "
                    "intensidad. Puede indicar una capacidad aeróbica moderada.")
    elif decreasing_slopes / total > 0.3:
        shape = "irregular"
        desc = ("Curva irregular — hay bajadas de lactato entre etapas. "
                "Puede indicar un protocolo con descansos largos o una "
                "respuesta metabólica atípica.")
    else:
        # Pendientes iniciales > finales
        shape = "concave"
        desc = ("Curva cóncava — el lactato sube rápido al inicio y se "
                "estabiliza. Puede indicar una VLamax alta con buen aclaramiento.")

    return CurveShape(
        session_id=session.session_id,
        shape=shape,
        baseline_mmol=round(baseline, 2),
        peak_mmol=round(peak, 2),
        inflection_index=inflection_index,
        description=desc,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Ratio LT1/LT2 y proxy de VLamax
# ═══════════════════════════════════════════════════════════════════════════

def _analyze_lt1_lt2_ratio(
    snapshots: list[ThresholdSnapshotRead],
) -> Optional[LT1LT2Ratio]:
    """Calcula el ratio LT1/LT2 y lo interpreta fisiológicamente."""
    if not snapshots:
        return None

    # Usar el snapshot más reciente con ambos umbrales
    for snap in snapshots:
        # Preferir ritmo, luego potencia
        if snap.lt1_pace and snap.lt2_pace:
            # En pace: LT1 > LT2 (más lento). Ratio = LT2/LT1 (invertido)
            ratio = snap.lt2_pace / snap.lt1_pace
            metric = "pace"
            break
        elif snap.lt1_power and snap.lt2_power:
            ratio = snap.lt1_power / snap.lt2_power
            metric = "power"
            break
    else:
        return None

    # Interpretar según los rangos de Olbrecht
    if ratio > 0.87:
        vlamax_proxy = "low"
        interpretation = (
            "Ratio LT1/LT2 alto (>{:.0f}%): indica VLamax baja — "
            "buena capacidad oxidativa, producción glucolítica reducida. "
            "Perfil típico de resistencia pura. El margen entre LT1 y LT2 "
            "es estrecho.".format(ratio * 100)
        )
    elif ratio > 0.79:
        vlamax_proxy = "moderate"
        interpretation = (
            "Ratio LT1/LT2 moderado (~{:.0f}%): indica VLamax equilibrada. "
            "Hay un margen razonable entre LT1 y LT2 donde trabajar "
            "intensidades de umbral.".format(ratio * 100)
        )
    else:
        vlamax_proxy = "high"
        interpretation = (
            "Ratio LT1/LT2 bajo (<{:.0f}%): indica VLamax alta — "
            "producción glucolítica elevada, gap amplio entre LT1 y LT2. "
            "El atleta genera lactato rápidamente al superar LT1. "
            "La base aeróbica tiene margen de mejora.".format(ratio * 100)
        )

    return LT1LT2Ratio(
        ratio=round(ratio, 3),
        metric_used=metric,
        interpretation=interpretation,
        vlamax_proxy=vlamax_proxy,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Frescura de datos
# ═══════════════════════════════════════════════════════════════════════════

def _assess_data_freshness(
    bundle: AthleteDataBundle,
) -> DataFreshness:
    """Evalúa la frescura y fiabilidad de los datos del atleta."""
    today = date.today()

    # Último test de lactato
    last_lactate_days = None
    if bundle.lactate_sessions:
        last_test = bundle.lactate_sessions[0]  # ya ordenados desc
        last_date = last_test.performed_at.date() if hasattr(last_test.performed_at, 'date') else last_test.performed_at
        last_lactate_days = (today - last_date).days

    # Último snapshot
    last_snap_days = None
    if bundle.threshold_history:
        last_snap_days = (today - bundle.threshold_history[0].snapshot_date).days

    # Confianza media
    confidences = [s.confidence for s in bundle.threshold_history if s.confidence]
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

    # Clasificar frescura
    total_lactate = bundle.profile.total_lactate_sessions

    if total_lactate == 0:
        freshness = "no_data"
        warning = "No hay tests de lactato registrados. La información fisiológica se limita a datos indirectos."
    elif last_lactate_days is not None and last_lactate_days <= 21:
        freshness = "fresh"
        warning = None
    elif last_lactate_days is not None and last_lactate_days <= 56:
        freshness = "acceptable"
        warning = f"El último test de lactato fue hace {last_lactate_days} días. Los datos son aceptables pero se recomienda un test actualizado."
    else:
        freshness = "stale"
        days = last_lactate_days if last_lactate_days is not None else "?"
        warning = f"El último test de lactato fue hace {days} días. Los umbrales pueden no reflejar el estado actual del atleta."

    return DataFreshness(
        last_lactate_test_days=last_lactate_days,
        last_snapshot_days=last_snap_days,
        total_lactate_sessions=total_lactate,
        avg_confidence=round(avg_conf, 2),
        freshness_label=freshness,
        warning=warning,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Patrón de entrenamiento
# ═══════════════════════════════════════════════════════════════════════════

def _analyze_training_pattern(
    weeks: list[TrainingWeekSummary],
    lactate_sessions_total: int,
) -> Optional[TrainingPattern]:
    """Detecta el patrón de entrenamiento reciente."""
    if not weeks:
        return None

    sessions_per_week = [w.total_sessions for w in weeks]
    duration_per_week = [w.total_duration_min for w in weeks]

    avg_sessions = sum(sessions_per_week) / len(sessions_per_week)
    avg_duration = sum(duration_per_week) / len(duration_per_week)

    # Consistencia: comparar primera y segunda mitad
    mid = len(weeks) // 2
    if mid > 0:
        first_half = sum(sessions_per_week[:mid]) / mid
        second_half = sum(sessions_per_week[mid:]) / max(1, len(weeks) - mid)

        if abs(first_half - second_half) < 1.0:
            consistency = "consistent"
        elif second_half > first_half * 1.2:
            consistency = "ramping"
        elif second_half < first_half * 0.8:
            consistency = "declining"
        else:
            consistency = "irregular"
    else:
        consistency = "irregular"

    # Disciplina dominante
    discipline_count: dict[str, int] = {}
    for week in weeks:
        for d in week.disciplines:
            discipline_count[d] = discipline_count.get(d, 0) + 1
    dominant = max(discipline_count, key=discipline_count.get) if discipline_count else None

    # Frecuencia de tests de lactato
    total_weeks = len(weeks) if weeks else 1
    lactate_tests = sum(w.lactate_sessions for w in weeks)
    if lactate_tests == 0:
        lactate_freq = "none"
    elif lactate_tests / total_weeks >= 0.25:
        lactate_freq = "regular"
    else:
        lactate_freq = "sporadic"

    return TrainingPattern(
        avg_sessions_per_week=round(avg_sessions, 1),
        avg_duration_min_per_week=round(avg_duration, 1),
        consistency=consistency,
        dominant_discipline=dominant,
        lactate_testing_frequency=lactate_freq,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Notas de contexto
# ═══════════════════════════════════════════════════════════════════════════

def _generate_context_notes(bundle: AthleteDataBundle) -> list[str]:
    """Genera notas de contexto relevantes para la respuesta del advisor."""
    notes: list[str] = []
    profile = bundle.profile

    # Nivel del atleta
    if profile.athlete_level:
        level_map = {
            "recreational": "Atleta recreativo — las recomendaciones deben ser conservadoras.",
            "trained": "Atleta entrenado — tolera volúmenes e intensidades moderados.",
            "competitive": "Atleta competitivo — puede manejar prescripciones más agresivas.",
        }
        if profile.athlete_level in level_map:
            notes.append(level_map[profile.athlete_level])

    # Edad
    if profile.age:
        if profile.age > 50:
            notes.append(f"Atleta de {profile.age} años — considerar recuperación más larga y prevención de lesiones.")
        elif profile.age < 20:
            notes.append(f"Atleta de {profile.age} años — priorizar desarrollo a largo plazo sobre rendimiento inmediato.")

    # Disciplina y objetivos
    if bundle.targets:
        next_target = min(bundle.targets, key=lambda t: t.target_date)
        days_to = (next_target.target_date - date.today()).days
        if days_to > 0:
            notes.append(
                f"Próximo objetivo: {next_target.objective} ({next_target.distance_label or next_target.discipline}) "
                f"en {days_to} días ({next_target.target_date})."
            )

    # Bloque actual
    if bundle.current_block:
        block = bundle.current_block
        notes.append(
            f"Bloque activo: {block.energy_system_focus} — {block.block_objective} "
            f"(semana {block.weeks_elapsed + 1}, fase {block.phase or '?'})."
        )

    # Métricas derivadas recientes
    for metric in bundle.derived_metrics[:3]:
        if metric.metric_type in ("vo2max", "vlamax"):
            notes.append(
                f"{metric.metric_type}: {metric.value:.1f} {metric.unit} "
                f"(confianza {metric.confidence:.0%})."
            )

    return notes


# ═══════════════════════════════════════════════════════════════════════════
# Orquestador
# ═══════════════════════════════════════════════════════════════════════════

def detect_patterns(bundle: AthleteDataBundle) -> DetectedPatterns:
    """Detecta todos los patrones fisiológicos del atleta.

    Este es el punto de entrada principal. Recibe un AthleteDataBundle
    (de data_reader.read_athlete_data) y devuelve todos los patrones
    detectados.
    """
    patterns = DetectedPatterns()

    # Tendencias de umbrales
    patterns.threshold_trends = _detect_threshold_trends(bundle.threshold_history)

    # Forma de curva (últimas 3 sesiones de lactato)
    for session in bundle.lactate_sessions[:3]:
        shape = _analyze_curve_shape(session)
        if shape:
            patterns.curve_shapes.append(shape)

    # Ratio LT1/LT2
    patterns.lt1_lt2_ratio = _analyze_lt1_lt2_ratio(bundle.threshold_history)

    # Frescura de datos
    patterns.data_freshness = _assess_data_freshness(bundle)

    # Patrón de entrenamiento
    patterns.training_pattern = _analyze_training_pattern(
        bundle.training_weeks,
        bundle.profile.total_lactate_sessions,
    )

    # Notas de contexto
    patterns.context_notes = _generate_context_notes(bundle)

    return patterns
