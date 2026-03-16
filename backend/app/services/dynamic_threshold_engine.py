from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from math import exp
from statistics import mean, median
from typing import Any, Optional

from app.models.athlete import Athlete
from app.models.session import Session as AthleteSession
from app.models.session import SessionInterval


@dataclass
class DynamicThresholdConfig:
    lt1_delta_from_baseline: float = 0.45
    practical_lt1_target_mmol: float = 1.6
    practical_lt2_target_mmol: float = 3.1
    practical_translation_mode: str = "relative"
    acute_window_days: int = 42  # unified with chronic — single model, decay handles recency
    chronic_window_days: int = 42
    recency_decay_days: int = 18
    quality_weight: float = 1.0
    recency_weight: float = 1.0
    similarity_weight: float = 1.0
    outlier_residual_threshold: float = 1.0
    fallback_baseline_lactate: float = 1.2


def config_from_settings(settings) -> DynamicThresholdConfig:
    return DynamicThresholdConfig(
        lt1_delta_from_baseline=settings.dynamic_lt1_delta_from_baseline,
        practical_lt1_target_mmol=settings.dynamic_practical_lt1_target_mmol,
        practical_lt2_target_mmol=settings.dynamic_practical_lt2_target_mmol,
        practical_translation_mode=settings.dynamic_practical_translation_mode,
        acute_window_days=settings.dynamic_acute_window_days,
        chronic_window_days=settings.dynamic_chronic_window_days,
        recency_decay_days=settings.dynamic_recency_decay_days,
        quality_weight=settings.dynamic_quality_weight,
        recency_weight=settings.dynamic_recency_weight,
        similarity_weight=settings.dynamic_similarity_weight,
        outlier_residual_threshold=settings.dynamic_outlier_residual_threshold,
        fallback_baseline_lactate=settings.dynamic_fallback_baseline_lactate,
    )


def _session_density(session: AthleteSession) -> float:
    total_work = sum(interval.duration_seconds for interval in session.intervals)
    total_rest = sum(interval.rest_seconds or 0 for interval in session.intervals)
    total = total_work + total_rest
    if total <= 0:
        return 1.0
    return total_work / total


def _interval_duration_score(duration_seconds: int) -> float:
    if duration_seconds < 120:
        return 0.42
    if duration_seconds < 180:
        return 0.58
    if duration_seconds <= 240:
        return 0.78
    if duration_seconds <= 480:
        return 0.92
    if duration_seconds <= 720:
        return 0.85
    if duration_seconds <= 900:
        return 0.76
    if duration_seconds <= 1200:
        return 0.64
    return 0.5


def _interval_protocol_score(interval: SessionInterval) -> float:
    duration_score = _interval_duration_score(interval.duration_seconds)
    rest_ratio = (interval.rest_seconds or 0) / max(interval.duration_seconds, 1)
    if rest_ratio <= 0.15:
        rest_score = 1.0
    elif rest_ratio <= 0.30:
        rest_score = 0.9
    elif rest_ratio <= 0.50:
        rest_score = 0.74
    elif rest_ratio <= 0.75:
        rest_score = 0.58
    else:
        rest_score = 0.42
    return round(max(0.25, min(1.0, duration_score * 0.65 + rest_score * 0.35)), 2)


def _normalized_power_source(session: AthleteSession) -> Optional[str]:
    if session.discipline != "ciclismo":
        return None
    return session.power_source or "outdoor"


def _sample_size_effect(points: int) -> float:
    if points <= 1:
        return 0.12
    if points == 2:
        return 0.22
    if points == 3:
        return 0.35
    if points <= 5:
        return 0.5
    if points <= 8:
        return 0.65
    if points <= 12:
        return 0.78
    if points <= 20:
        return 0.88
    return 0.94


def _point_influence_score(points: int) -> float:
    effect = _sample_size_effect(points)
    return round(max(0.08, 1.0 - effect * 0.9), 2)


def _estimate_baseline(
    session: AthleteSession,
    session_date: date,
    measured_baselines: list[tuple[date, float]],
    config: DynamicThresholdConfig,
) -> tuple[float, str, list[str]]:
    recent = [value for baseline_date, value in measured_baselines if 0 <= (session_date - baseline_date).days <= 21]
    if recent:
        baseline = round(mean(recent[-3:]), 2)
        return baseline, "estimated_recent", [f"Basal estimado con media conservadora de {len(recent[-3:])} basales recientes."]

    historical = [value for _, value in measured_baselines]
    if historical:
        baseline = round(median(historical), 2)
        return baseline, "estimated_historical", ["Basal estimado con mediana individual histórica por ausencia de basal del día."]

    return round(config.fallback_baseline_lactate, 2), "fallback_default", ["Basal no medido ni histórico; se usa fallback global conservador."]


def _baseline_state(
    baseline_value: float,
    reference_values: list[float],
    fallback_value: float,
) -> tuple[str, float, float]:
    reference = median(reference_values) if reference_values else fallback_value
    delta = round(baseline_value - reference, 2)
    abs_delta = abs(delta)
    if abs_delta <= 0.15:
        return "normal", delta, 1.0
    if abs_delta <= 0.30:
        return ("alto" if delta > 0 else "bajo"), delta, 0.92
    if abs_delta <= 0.50:
        return ("alto" if delta > 0 else "bajo"), delta, 0.82
    return ("alto" if delta > 0 else "bajo"), delta, 0.7


def _recency_weight(days_old: int, config: DynamicThresholdConfig) -> float:
    decay_days = max(3, config.recency_decay_days)
    base = exp(-(max(0, days_old) / decay_days))
    return max(0.2, round(base, 3))


def _similarity_weight(session: AthleteSession, interval: SessionInterval) -> float:
    purpose = (interval.purpose or "").lower()
    session_type = (session.session_type or "").lower()
    goal = (session.goal or "").lower()
    score = 0.72
    if any(token in purpose for token in ("lt1", "lt2", "threshold", "umbral")):
        score += 0.18
    if any(token in session_type for token in ("incremental", "test", "umbral", "threshold")):
        score += 0.08
    if any(token in goal for token in ("lt1", "lt2", "threshold", "umbral")):
        score += 0.05
    return min(1.0, round(score, 2))


def _data_quality_score(baseline_source: str, sample_delay_seconds: int, contextual_confidence: Optional[float]) -> float:
    if sample_delay_seconds <= 15:
        delay_score = 1.0
    elif sample_delay_seconds <= 30:
        delay_score = 0.94
    elif sample_delay_seconds <= 60:
        delay_score = 0.82
    elif sample_delay_seconds <= 90:
        delay_score = 0.66
    else:
        delay_score = 0.5

    baseline_score = {
        "measured": 1.0,
        "estimated_recent": 0.88,
        "estimated_historical": 0.8,
        "fallback_default": 0.68,
    }.get(baseline_source, 0.72)

    contextual = contextual_confidence if contextual_confidence is not None else 0.68
    return round(max(0.3, min(1.0, delay_score * 0.45 + baseline_score * 0.25 + contextual * 0.3)), 2)


def _session_context_score(session: AthleteSession, interval: SessionInterval) -> float:
    density = _session_density(session)
    protocol_score = _interval_protocol_score(interval)
    order_penalty = max(0.0, (interval.order_index - 1) * 0.04)
    purpose_bonus = 0.08 if (interval.purpose or "").lower() in {"lt1", "lt2"} else 0.0
    score = protocol_score * 0.62 + density * 0.18 + 0.16 + purpose_bonus - order_penalty
    return round(max(0.35, min(1.0, score)), 2)


def _pace_to_speed(pace_seconds_per_km: Optional[float]) -> Optional[float]:
    if not pace_seconds_per_km:
        return None
    return round(3600 / pace_seconds_per_km, 3)


def _speed_to_pace(speed_kph: Optional[float]) -> Optional[float]:
    if not speed_kph or speed_kph <= 0:
        return None
    return round(3600 / speed_kph, 1)


def _collect_points(
    athlete: Athlete,
    sessions: list[AthleteSession],
    discipline: str,
    as_of: date,
    config: DynamicThresholdConfig,
    window_days: Optional[int] = None,
    power_source: Optional[str] = None,
) -> tuple[list[dict[str, Any]], Optional[float], str, list[str]]:
    measured_baselines: list[tuple[date, float]] = []
    for session in sorted(sessions, key=lambda item: item.performed_at):
        if session.performed_at.date() > as_of:
            continue
        if session.discipline != discipline:
            continue
        if discipline == "ciclismo" and power_source and _normalized_power_source(session) != power_source:
            continue
        for interval in session.intervals:
            sample = interval.lactate_sample
            if sample and sample.baseline_lactate is not None:
                measured_baselines.append((session.performed_at.date(), sample.baseline_lactate))

    points: list[dict[str, Any]] = []
    current_baseline = None
    current_baseline_source = "fallback_default"
    current_baseline_notes: list[str] = []
    current_baseline_state = "sin_referencia"
    current_baseline_delta_from_history = 0.0
    current_baseline_state_score = 0.88

    for session in sorted(sessions, key=lambda item: item.performed_at):
        session_date = session.performed_at.date()
        if session_date > as_of:
            continue
        if window_days is not None and (as_of - session_date).days > window_days:
            continue
        if session.discipline != discipline:
            continue
        if discipline == "ciclismo" and power_source and _normalized_power_source(session) != power_source:
            continue

        session_measured_baseline = next(
            (interval.lactate_sample.baseline_lactate for interval in session.intervals if interval.lactate_sample and interval.lactate_sample.baseline_lactate is not None),
            None,
        )
        if session_measured_baseline is not None:
            baseline_value = round(session_measured_baseline, 2)
            baseline_source = "measured"
            baseline_notes = ["Basal del día medido directamente antes de la sesión."]
        else:
            previous_measured = [entry for entry in measured_baselines if entry[0] < session_date]
            baseline_value, baseline_source, baseline_notes = _estimate_baseline(session, session_date, previous_measured, config)

        baseline_reference_values = [value for baseline_date, value in measured_baselines if baseline_date < session_date][-6:]
        baseline_state, baseline_delta_from_history, baseline_state_score = _baseline_state(
            baseline_value,
            baseline_reference_values,
            config.fallback_baseline_lactate,
        )

        if session_date == as_of:
            current_baseline = baseline_value
            current_baseline_source = baseline_source
            current_baseline_notes = baseline_notes
            current_baseline_state = baseline_state
            current_baseline_delta_from_history = baseline_delta_from_history
            current_baseline_state_score = baseline_state_score

        for interval in session.intervals:
            sample = interval.lactate_sample
            if sample is None:
                continue
            absolute_lactate = sample.contextual_lactate if sample.contextual_lactate is not None else sample.lactate_mmol
            delta_lactate = round(absolute_lactate - baseline_value, 2)
            quality = _data_quality_score(baseline_source, sample.sample_delay_seconds, sample.contextual_confidence)
            context_score = _session_context_score(session, interval)
            days_old = (as_of - session_date).days
            recency = _recency_weight(days_old, config)
            similarity = _similarity_weight(session, interval)
            combined_weight = (
                (recency ** config.recency_weight)
                * (quality ** config.quality_weight)
                * (similarity ** config.similarity_weight)
                * context_score
                * baseline_state_score
            )
            points.append(
                {
                    "session_id": session.id,
                    "session_date": session_date.isoformat(),
                    "discipline": discipline,
                    "power_source": _normalized_power_source(session),
                    "purpose": interval.purpose,
                    "session_type": session.session_type,
                    "order_index": interval.order_index,
                    "duration_seconds": interval.duration_seconds,
                    "rest_seconds": interval.rest_seconds,
                    "density": round(_session_density(session), 3),
                    "protocol_score": _interval_protocol_score(interval),
                    "raw_lactate": round(sample.lactate_mmol, 2),
                    "baseline_lactate": baseline_value,
                    "baseline_source": baseline_source,
                    "baseline_state": baseline_state,
                    "baseline_delta_from_history": baseline_delta_from_history,
                    "baseline_state_score": baseline_state_score,
                    "delta_lactate": delta_lactate,
                    "contextualized_lactate": round(absolute_lactate, 2),
                    "sample_delay_seconds": sample.sample_delay_seconds,
                    "data_quality_score": quality,
                    "session_context_score": context_score,
                    "recency_weight": recency,
                    "similarity_weight": similarity,
                    "point_weight": round(combined_weight, 3),
                    "pace_seconds_per_km": interval.pace_seconds_per_km,
                    "speed_kph": _pace_to_speed(interval.pace_seconds_per_km),
                    "power_watts": interval.power_watts or interval.running_power_watts,
                    "heart_rate": interval.heart_rate_avg,
                }
            )

    if current_baseline is None:
        current_baseline = round(config.fallback_baseline_lactate, 2)
        current_baseline_notes = ["No había sesión del día; se expone basal fallback conservador para el estado actual."]
    return (
        points,
        current_baseline,
        current_baseline_source,
        current_baseline_notes,
        current_baseline_state,
        round(current_baseline_delta_from_history, 2),
        current_baseline_state_score,
    )


def _isotonic_filter(
    points: list[dict[str, Any]],
    x_key: str,
    lactate_key: str = "raw_lactate",
    deviation_threshold: float = 1.2,
) -> list[dict[str, Any]]:
    """Filtra puntos que violan fuertemente la relación monotónica carga→lactato.

    La curva de lactato debe ser no decreciente con la carga. Puntos que se
    desvían marcadamente de la regresión isotónica (PAVA) representan datos
    de sesiones de naturaleza diferente — sprints, recuperaciones, esfuerzos
    máximos — que no aportan información útil para estimar umbrales submáximos
    y arrastran las estimaciones a valores erróneos.

    Proceso:
    1. Ordenar puntos por carga (speed/power).
    2. Calcular la regresión isotónica (Pool Adjacent Violators Algorithm)
       que fuerza la secuencia de lactatos a ser no decreciente.
    3. Puntos con |lactato_real - lactato_isotónico| > deviation_threshold
       reciben peso × 0.03 (esencialmente excluidos del cálculo).

    Los puntos no se eliminan del dataset — siguen visibles en el gráfico
    y contribuyen a scoring de monotonicity/stability, pero ya no pueden
    arrastrar la interpolación de umbrales.

    Requiere ≥ 4 puntos para activarse.
    """
    valid = sorted(
        [p for p in points if p.get(x_key) is not None and p.get(lactate_key) is not None],
        key=lambda p: p[x_key],
    )
    if len(valid) < 4:
        return [{**p, "isotonic_flag": False, "isotonic_deviation": 0.0} for p in points]

    # PAVA: calcula la secuencia isotónica no decreciente
    lactates = [p[lactate_key] for p in valid]
    blocks: list[list[int]] = [[i] for i in range(len(lactates))]
    block_means: list[float] = list(lactates)

    changed = True
    while changed:
        changed = False
        i = 0
        while i < len(block_means) - 1:
            if block_means[i] > block_means[i + 1]:
                merged = blocks[i] + blocks[i + 1]
                merged_mean = sum(lactates[j] for j in merged) / len(merged)
                blocks[i: i + 2] = [merged]
                block_means[i: i + 2] = [merged_mean]
                changed = True
                if i > 0:
                    i -= 1
            else:
                i += 1

    isotonic: list[float] = [0.0] * len(lactates)
    for block, mean_val in zip(blocks, block_means):
        for idx in block:
            isotonic[idx] = mean_val

    # Construir mapa de desviación por id de objeto
    deviation_map: dict[int, tuple[bool, float]] = {}
    for i, p in enumerate(valid):
        dev = abs(p[lactate_key] - isotonic[i])
        deviation_map[id(p)] = (dev > deviation_threshold, round(dev, 2))

    result: list[dict[str, Any]] = []
    for p in points:
        if p.get(x_key) is None or p.get(lactate_key) is None:
            result.append({**p, "isotonic_flag": False, "isotonic_deviation": 0.0})
            continue
        flagged, dev = deviation_map.get(id(p), (False, 0.0))
        if flagged:
            result.append({
                **p,
                "point_weight": round(p["point_weight"] * 0.03, 5),
                "isotonic_flag": True,
                "isotonic_deviation": dev,
            })
        else:
            result.append({**p, "isotonic_flag": False, "isotonic_deviation": dev})
    return result


def _weighted_regression(
    points: list[dict[str, Any]],
    x_key: str,
    lactate_key: str = "raw_lactate",
) -> tuple[Optional[float], Optional[float]]:
    valid = [point for point in points if point.get(x_key) is not None]
    if len(valid) < 2:
        return None, None
    total_weight = sum(point["point_weight"] for point in valid)
    if total_weight <= 0:
        return None, None
    mean_x = sum(point[x_key] * point["point_weight"] for point in valid) / total_weight
    mean_y = sum(point[lactate_key] * point["point_weight"] for point in valid) / total_weight
    covariance = sum(
        point["point_weight"] * (point[lactate_key] - mean_y) * (point[x_key] - mean_x)
        for point in valid
    )
    variance = sum(point["point_weight"] * (point[lactate_key] - mean_y) ** 2 for point in valid)
    if variance <= 0:
        return None, None
    slope = covariance / variance
    intercept = mean_x - slope * mean_y
    return intercept, slope


def _stability_score(
    points: list[dict[str, Any]],
    x_key: str,
    estimate_value: Optional[float],
    lactate_key: str = "raw_lactate",
) -> float:
    valid = [point for point in points if point.get(x_key) is not None]
    if len(valid) < 4 or estimate_value is None:
        return 0.35
    leave_one_out: list[float] = []
    for index in range(len(valid)):
        subset = valid[:index] + valid[index + 1 :]
        intercept, slope = _weighted_regression(subset, x_key, lactate_key=lactate_key)
        if intercept is None or slope is None:
            continue
        leave_one_out.append(intercept + slope * valid[min(index, len(valid) - 2)][lactate_key])
    if len(leave_one_out) < 2:
        return 0.45
    span = max(leave_one_out) - min(leave_one_out)
    normalized = span / max(abs(estimate_value), 1.0)
    return round(max(0.2, 1 - normalized * 2.3), 2)


def _monotonicity_score(points: list[dict[str, Any]], x_key: str, lactate_key: str = "raw_lactate") -> float:
    valid = sorted([point for point in points if point.get(x_key) is not None], key=lambda item: item[x_key])
    if len(valid) < 2:
        return 0.4
    positives = 0
    comparisons = 0
    for previous, current in zip(valid, valid[1:]):
        delta_load = current[x_key] - previous[x_key]
        delta_lactate = current[lactate_key] - previous[lactate_key]
        if delta_load <= 0:
            continue
        comparisons += 1
        if delta_lactate >= -0.15:
            positives += 1
    if comparisons == 0:
        return 0.45
    return round(positives / comparisons, 2)


def _signal_score(points: list[dict[str, Any]], x_key: str, lactate_key: str = "raw_lactate") -> float:
    valid = [point for point in points if point.get(x_key) is not None and point.get(lactate_key) is not None]
    if len(valid) < 3:
        return 0.22
    monotonicity = _monotonicity_score(valid, x_key, lactate_key=lactate_key)
    ordered = sorted(valid, key=lambda item: item[x_key])
    drops = [max(0.0, previous[lactate_key] - current[lactate_key] - 0.15) for previous, current in zip(ordered, ordered[1:])]
    drop_burden = min(1.0, (sum(drops) / max(len(drops), 1)) / 1.2) if drops else 0.0
    lactate_values = [point[lactate_key] for point in valid]
    range_score = max(0.25, min(1.0, (max(lactate_values) - min(lactate_values)) / 4.0))
    stage_score = max(0.25, min(1.0, len(valid) / 10))
    return round(
        max(0.18, min(0.95, monotonicity * 0.42 + (1 - drop_burden) * 0.23 + range_score * 0.15 + stage_score * 0.20)),
        2,
    )


def _confidence_interval(values: list[float], estimate: float, points: int, influence: float) -> tuple[float, float]:
    if not values:
        return estimate, estimate
    span = max(values) - min(values)
    margin = max(0.01, span * (0.12 + influence * 0.28) / max(1.0, points ** 0.5))
    return round(estimate - margin, 2), round(estimate + margin, 2)


def _detect_outliers_in_lactate_space(
    points: list[dict[str, Any]],
    x_key: str,
    outlier_threshold: float,
    lactate_key: str = "raw_lactate",
) -> list[dict[str, Any]]:
    """Detecta muestras cuyo lactato es inconsistente con la curva esperada y reduce su peso.

    Usa Leave-One-Out (LOO): para cada punto candidato, ajusta una regresión
    lineal ponderada (lactato ~ carga) con TODOS LOS DEMÁS puntos y compara
    el lactato real con el predicho. Esto evita que el outlier "incline" la
    regresión hacia sí mismo (el problema de la regresión global) y también
    evita la contaminación de vecinos del método de interpolación local.

    Con 4 puntos y un outlier, la regresión LOO sobre los 3 sanos es limpia
    y el outlier queda claramente expuesto.

    Puntos con |lactato_real - lactato_predicho| > outlier_threshold se
    penalizan × 0.12: siguen en el dataset (para monotonicity/stability)
    pero prácticamente no influyen en la interpolación práctica.

    Requiere ≥ 4 puntos; con menos no hay suficiente contexto para juzgar.
    """
    valid = [p for p in points if p.get(x_key) is not None and p.get(lactate_key) is not None]
    if len(valid) < 4:
        return [{**p, "outlier_flag": False, "outlier_residual_mmol": 0.0} for p in points]

    residual_map: dict[int, tuple[bool, float]] = {}
    for i, candidate in enumerate(valid):
        rest = [p for j, p in enumerate(valid) if j != i]
        # Regresión ponderada lactato ~ carga sobre el resto
        total_w = sum(p["point_weight"] for p in rest)
        if total_w <= 0:
            residual_map[id(candidate)] = (False, 0.0)
            continue
        mean_x = sum(p[x_key] * p["point_weight"] for p in rest) / total_w
        mean_y = sum(p[lactate_key] * p["point_weight"] for p in rest) / total_w
        cov = sum(p["point_weight"] * (p[x_key] - mean_x) * (p[lactate_key] - mean_y) for p in rest)
        var_x = sum(p["point_weight"] * (p[x_key] - mean_x) ** 2 for p in rest)
        if var_x <= 0:
            residual_map[id(candidate)] = (False, 0.0)
            continue
        b = cov / var_x
        a = mean_y - b * mean_x
        expected = a + b * candidate[x_key]
        residual = abs(candidate[lactate_key] - expected)
        residual_map[id(candidate)] = (residual > outlier_threshold, round(residual, 2))

    result: list[dict[str, Any]] = []
    for p in points:
        if p.get(x_key) is None or p.get(lactate_key) is None:
            result.append({**p, "outlier_flag": False, "outlier_residual_mmol": 0.0})
            continue
        is_outlier, residual_val = residual_map.get(id(p), (False, 0.0))
        if is_outlier:
            result.append({
                **p,
                "point_weight": round(p["point_weight"] * 0.25, 4),
                "outlier_flag": True,
                "outlier_residual_mmol": residual_val,
            })
        else:
            result.append({**p, "outlier_flag": False, "outlier_residual_mmol": residual_val})
    return result


def _estimate_reference(
    points: list[dict[str, Any]],
    target_lactate: float,
    x_key: str,
    unit: str,
    label: str,
    baseline_lactate: Optional[float],
    baseline_source: str,
    config: DynamicThresholdConfig,
    lactate_key: str = "raw_lactate",
    robust: bool = False,
) -> Optional[dict[str, Any]]:
    valid = [point for point in points if point.get(x_key) is not None]
    if len(valid) < 2:
        return None

    # Para umbrales prácticos: detectar y penalizar outliers antes de interpolar.
    # Esto hace que una muestra mala (medición tardía, fallo del lactímetro, etc.)
    # no pueda contaminar directamente el resultado.
    if robust:
        valid = _detect_outliers_in_lactate_space(valid, x_key, config.outlier_residual_threshold, lactate_key)

    warnings: list[str] = []
    explanations: list[str] = []
    sorted_by_lactate = sorted(valid, key=lambda item: item[lactate_key])
    lower = [point for point in sorted_by_lactate if point[lactate_key] <= target_lactate]
    upper = [point for point in sorted_by_lactate if point[lactate_key] >= target_lactate]
    estimate_value: Optional[float] = None
    method_used = "weighted_regression"

    if lower and upper:
        # Interpolación multi-bracket robusta.
        #
        # Se evalúan TODOS los pares válidos formados por los 4 puntos más
        # cercanos al target en cada lado (no solo 2+2 pre-seleccionados).
        # Esto evita que la preselección excluya el par más tight: si los
        # dos mejores brackets están en posición 3 y 4 del pool ordenado por
        # lactato, una preselección 2+2 los perdería y caería al fallback.
        #
        # Los pares no monotónicos (carga no sube con lactato) se descartan:
        # son datos de sesiones distintas con estados de forma diferentes y
        # no representan la curva real de ese punto.
        #
        # El peso de cada par combina:
        #   - Media geométrica de los pesos de ambos puntos (recencia, calidad)
        #   - Proximidad del midpoint al target en lactato
        #   - Penalización cuadrática si el upper bracket está > 2 mmol por
        #     encima del target (interpolar sobre un span amplio es impreciso)
        lower_pool = lower[-min(4, len(lower)):]
        upper_pool = upper[:min(4, len(upper))]
        pair_estimates: list[tuple[float, float]] = []
        for low in lower_pool:
            for high in upper_pool:
                if low is high:
                    continue
                y_low = low[lactate_key]
                y_high = high[lactate_key]
                x_low = low[x_key]
                x_high = high[x_key]
                # Descartar pares no monotónicos
                if y_high <= y_low or x_high <= x_low:
                    continue
                ratio = (target_lactate - y_low) / (y_high - y_low)
                est = x_low + ratio * (x_high - x_low)
                lactate_proximity = 1.0 / (1.0 + abs(target_lactate - (y_low + y_high) / 2))
                w = (low["point_weight"] * high["point_weight"]) ** 0.5 * lactate_proximity
                upper_distance = y_high - target_lactate
                if upper_distance > 2.0:
                    w *= (2.0 / upper_distance) ** 2
                pair_estimates.append((est, w))
        if pair_estimates:
            total_pair_w = sum(w for _, w in pair_estimates)
            if total_pair_w > 0:
                estimate_value = sum(e * w for e, w in pair_estimates) / total_pair_w
                method_used = (
                    "multi_bracket_interpolation" if len(pair_estimates) > 1
                    else "weighted_linear_interpolation"
                )
                n_pairs = len(pair_estimates)
                explanations.append(
                    f"Interpolación multi-bracket con {n_pairs} par(es) válido(s) que enmarcan {target_lactate:.1f} mmol."
                )

    if estimate_value is None:
        nearest = sorted(valid, key=lambda item: abs(item[lactate_key] - target_lactate))[: min(5, len(valid))]
        intercept, slope = _weighted_regression(nearest, x_key, lactate_key=lactate_key)
        if intercept is None or slope is None:
            return None
        estimate_value = intercept + slope * target_lactate
        explanations.append(f"Regresión ponderada local por recencia, calidad y similitud para estimar {target_lactate:.1f} mmol.")
        lactate_span = [point[lactate_key] for point in nearest]
        if target_lactate < min(lactate_span) or target_lactate > max(lactate_span):
            warnings.append("Objetivo fuera del rango directo de lactato; se usa extrapolación conservadora.")

    if estimate_value is None:
        return None

    sample_effect = _sample_size_effect(len(valid))
    influence = _point_influence_score(len(valid))
    stability = _stability_score(valid, x_key, estimate_value, lactate_key=lactate_key)
    monotonicity = _monotonicity_score(valid, x_key, lactate_key=lactate_key)
    signal = _signal_score(valid, x_key, lactate_key=lactate_key)
    protocol = round(mean([point.get("protocol_score", 0.7) for point in valid]), 2)
    baseline_state = round(mean([point.get("baseline_state_score", 0.88) for point in valid]), 2)
    ci_low, ci_high = _confidence_interval([point[x_key] for point in valid], estimate_value, len(valid), influence)

    if len(valid) <= 3:
        warnings.append("Muy pocos datos para estimación robusta.")
    if baseline_source != "measured":
        warnings.append("Basal no medido, estimación menos fiable.")
    if influence >= 0.55:
        warnings.append("Nuevo punto con alto impacto sobre el modelo.")
    if protocol < 0.7:
        warnings.append("Duración de escalón o descanso poco favorables para comparar anclajes con alta confianza.")
    if baseline_state < 0.85:
        warnings.append("Parte de los puntos provienen de días con basal alejado de la línea individual habitual.")

    if target_lactate in {2.0, 4.0}:
        warnings.append("Output no debe interpretarse como umbral definitivo.")

    reliability = round(
        max(
            0.18,
            min(0.95, sample_effect * 0.30 + stability * 0.20 + monotonicity * 0.10 + signal * 0.12 + (1 - influence) * 0.08 + protocol * 0.12 + baseline_state * 0.08),
        ),
        2,
    )
    plausibility = 0.0
    if x_key == "heart_rate":
        plausible_range = 80 <= estimate_value <= 205
        plausibility = 0.78 if plausible_range else 0.35
    elif x_key == "power_watts":
        plausible_range = 80 <= estimate_value <= 700
        plausibility = 0.8 if plausible_range else 0.38
    elif x_key == "speed_kph":
        plausible_range = 6 <= estimate_value <= 27
        plausibility = 0.8 if plausible_range else 0.32
    validity = round(
        max(
            0.2,
            min(
                0.95,
                monotonicity * 0.24 + signal * 0.18 + plausibility * 0.18 + (1 - influence) * 0.06 + (0.9 if baseline_source == "measured" else 0.65) * 0.16 + protocol * 0.10 + baseline_state * 0.08,
            ),
        ),
        2,
    )
    confidence = round(max(0.18, min(0.95, reliability * 0.55 + validity * 0.45)), 2)

    explanations.append(f"Se usaron {len(valid)} puntos y el efecto muestral quedó en {sample_effect:.2f}.")
    explanations.append(f"La influencia potencial de un punto nuevo se estimó en {influence:.2f}.")
    explanations.append(f"La adecuación del protocolo trabajo/descanso quedó en {protocol:.2f}.")
    explanations.append(f"La señal global de la curva para ese anclaje quedó en {signal:.2f}.")
    explanations.append(f"El estado basal relativo del día pesó {baseline_state:.2f} en el modelo.")
    if baseline_lactate is not None:
        explanations.append(f"Basal de referencia del modelo: {baseline_lactate:.2f} mmol ({baseline_source}).")

    return {
        "label": label,
        "target_lactate": round(target_lactate, 2),
        "metric": x_key,
        "unit": unit,
        "estimate": round(estimate_value, 2),
        "confidence_interval": {"lower": ci_low, "upper": ci_high, "unit": unit},
        "number_of_points_used": len(valid),
        "interpolation_method_used": method_used,
        "confidence_score": confidence,
        "reliability_score": reliability,
        "validity_score": validity,
        "sample_size_effect": round(sample_effect, 2),
        "point_influence_score": round(influence, 2),
        "protocol_score": protocol,
        "signal_score": signal,
        "baseline_state_score": baseline_state,
        "warnings": warnings,
        "explanation": explanations,
    }


def _combine_reference_views(
    running_speed: Optional[dict[str, Any]],
    power: Optional[dict[str, Any]],
    hr: Optional[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    if not any([running_speed, power, hr]):
        return None
    warnings = []
    explanation = []
    confidence_scores = []
    reliability_scores = []
    validity_scores = []
    sample_effects = []
    influence_scores = []

    for item in [running_speed, power, hr]:
        if not item:
            continue
        warnings.extend(item["warnings"])
        explanation.extend(item["explanation"])
        confidence_scores.append(item["confidence_score"])
        reliability_scores.append(item["reliability_score"])
        validity_scores.append(item["validity_score"])
        sample_effects.append(item["sample_size_effect"])
        influence_scores.append(item["point_influence_score"])

    return {
        "target_lactate": running_speed["target_lactate"] if running_speed else power["target_lactate"] if power else hr["target_lactate"],
        "estimated_pace_seconds_per_km": _speed_to_pace(running_speed["estimate"]) if running_speed else None,
        "estimated_speed_kph": running_speed["estimate"] if running_speed else None,
        "estimated_power_watts": power["estimate"] if power else None,
        "estimated_hr_at_target": hr["estimate"] if hr else None,
        "confidence_interval": {
            "pace_seconds_per_km": {
                "lower": _speed_to_pace(running_speed["confidence_interval"]["upper"]) if running_speed else None,
                "upper": _speed_to_pace(running_speed["confidence_interval"]["lower"]) if running_speed else None,
            },
            "speed_kph": running_speed["confidence_interval"] if running_speed else None,
            "power_watts": power["confidence_interval"] if power else None,
            "heart_rate": hr["confidence_interval"] if hr else None,
        },
        "number_of_points_used": max(item["number_of_points_used"] for item in [running_speed, power, hr] if item),
        "interpolation_method_used": ", ".join(sorted({item["interpolation_method_used"] for item in [running_speed, power, hr] if item})),
        "confidence_score": round(mean(confidence_scores), 2) if confidence_scores else 0.2,
        "reliability_score": round(mean(reliability_scores), 2) if reliability_scores else 0.2,
        "validity_score": round(mean(validity_scores), 2) if validity_scores else 0.2,
        "sample_size_effect": round(mean(sample_effects), 2) if sample_effects else 0.12,
        "point_influence_score": round(mean(influence_scores), 2) if influence_scores else 0.9,
        "warnings": sorted(set(warnings)),
        "explanation": explanation[:8],
    }


def _low_lactate_cluster_reference(
    points: list[dict[str, Any]],
    x_key: str,
    unit: str,
    label: str,
    upper_lactate_limit: float,
    lactate_key: str = "raw_lactate",
) -> Optional[dict[str, Any]]:
    valid = [
        point
        for point in points
        if point.get(x_key) is not None and point.get(lactate_key) is not None and point[lactate_key] <= upper_lactate_limit
    ]
    if len(valid) < 2:
        return None

    ordered = sorted(valid, key=lambda item: item[x_key])
    conservative_point = ordered[len(ordered) // 2]
    protocol = round(mean([point.get("protocol_score", 0.7) for point in valid]), 2)
    signal = _signal_score(valid, x_key, lactate_key=lactate_key)
    baseline_state = round(mean([point.get("baseline_state_score", 0.88) for point in valid]), 2)
    reliability = round(max(0.28, min(0.88, 0.18 + _sample_size_effect(len(valid)) * 0.28 + protocol * 0.18 + signal * 0.16 + baseline_state * 0.10)), 2)
    validity = round(max(0.28, min(0.86, _monotonicity_score(valid, x_key, lactate_key=lactate_key) * 0.22 + signal * 0.20 + 0.20 + protocol * 0.16 + baseline_state * 0.10)), 2)
    confidence = round(max(0.28, min(0.86, reliability * 0.55 + validity * 0.45)), 2)

    return {
        "label": label,
        "target_lactate": round(upper_lactate_limit, 2),
        "metric": x_key,
        "unit": unit,
        "estimate": round(conservative_point[x_key], 2),
        "confidence_interval": {
            "lower": round(conservative_point[x_key], 2),
            "upper": round(conservative_point[x_key], 2),
            "unit": unit,
        },
        "number_of_points_used": len(valid),
        "interpolation_method_used": "low_lactate_cluster",
        "confidence_score": confidence,
        "reliability_score": reliability,
        "validity_score": validity,
        "sample_size_effect": _sample_size_effect(len(valid)),
        "point_influence_score": _point_influence_score(len(valid)),
        "protocol_score": protocol,
        "signal_score": signal,
        "baseline_state_score": baseline_state,
        "warnings": (
            ["Referencia operativa derivada del bloque de lactatos bajos, no de un umbral definitivo."]
            + (["Duración de escalón o descanso poco favorables para fijar LT1 práctico con alta confianza."] if protocol < 0.7 else [])
            + (["Parte del clúster bajo proviene de días con basal alterado respecto al histórico individual."] if baseline_state < 0.85 else [])
        ),
        "explanation": [
            f"Se usó el bloque estable de muestras <= {upper_lactate_limit:.2f} mmol para evitar que una transición compacta arrastre el LT1 práctico.",
            f"Se eligió el valor central del clúster de {len(valid)} puntos de lactato bajo para no sesgar la referencia operativa hacia el punto más lento ni hacia la transición.",
            f"La adecuación del protocolo trabajo/descanso del clúster quedó en {protocol:.2f}.",
            f"La señal del clúster bajo quedó en {signal:.2f} y el peso del basal relativo en {baseline_state:.2f}.",
        ],
    }


def _prefer_cluster_for_practical_lt1(
    cluster_reference: Optional[dict[str, Any]],
    interpolated_reference: Optional[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    if cluster_reference is None and interpolated_reference is None:
        return None
    if cluster_reference is None:
        return interpolated_reference
    if interpolated_reference is None:
        return cluster_reference

    cluster_points = cluster_reference["number_of_points_used"]
    cluster_estimate = cluster_reference["estimate"]
    interpolated_estimate = interpolated_reference["estimate"]
    estimate_gap = abs(cluster_estimate - interpolated_estimate) / max(abs(interpolated_estimate), 1.0)
    cluster_is_more_conservative = cluster_estimate <= interpolated_estimate

    # Solo priorizamos el clúster bajo si realmente parece un bloque estable de
    # trabajo fácil y no una forma de arrastrar LT1 práctico demasiado lejos por
    # una nube compacta en lactatos bajos.
    if (
        cluster_is_more_conservative
        and (
            (cluster_points >= 3 and cluster_reference["reliability_score"] >= 0.55 and estimate_gap <= 0.09)
            or (cluster_points >= 4 and estimate_gap <= 0.14)
        )
    ):
        cluster_reference["interpolation_method_used"] = "low_lactate_cluster_preferred"
        cluster_reference["warnings"] = sorted(
            set(
                cluster_reference["warnings"]
                + ["Se priorizó el clúster de lactatos bajos frente a la interpolación fija para LT1 práctico."]
            )
        )
        cluster_reference["explanation"] = cluster_reference["explanation"] + [
            "El clúster de lactatos bajos tenía densidad suficiente, así que se usa como referencia operativa preferente."
        ]
        return cluster_reference

    interpolated_reference["warnings"] = sorted(
        set(
            interpolated_reference["warnings"]
            + ["El clúster de lactatos bajos no era lo bastante denso o coherente como para desplazar LT1 práctico."]
        )
    )
    return interpolated_reference


def _practical_target_lactate(
    baseline_lactate: Optional[float],
    configured_target: float,
    config: DynamicThresholdConfig,
) -> tuple[float, Optional[float], list[str]]:
    relative_target = round((baseline_lactate or config.fallback_baseline_lactate) + config.lt1_delta_from_baseline, 2)
    if config.practical_translation_mode == "relative":
        chosen = relative_target
        explanation = ["Traducción práctica basada en basal + incremento relativo configurable."]
    elif config.practical_translation_mode == "configured":
        chosen = configured_target
        explanation = ["Traducción práctica basada en el objetivo absoluto configurable del entrenador; el ancla práctica no se desplaza por basal."]
    else:
        chosen = min(configured_target, relative_target) if configured_target <= 2.0 else configured_target
        explanation = ["Traducción práctica conservadora: se elige el objetivo más prudente entre configuración y basal relativo."]
    return round(chosen, 2), relative_target, explanation


def _intrasession_consistency_filter(
    points: list[dict[str, Any]],
    x_key: str,
    lactate_key: str = "raw_lactate",
    intra_threshold: float = 1.0,
) -> list[dict[str, Any]]:
    """Downweights points inconsistent with their own session's lactate curve.

    Para cada sesión con ≥ 3 puntos válidos, aplica un LOO dentro de esa
    sesión. Un punto que no encaja con sus compañeros del mismo test/día
    recibe peso × 0.15 — suficiente para no dominar sin desaparecer.

    Preserva completamente la variación entre sesiones: si el mismo ritmo
    produce más lactato en otra sesión, ambas sesiones mantienen sus pesos
    originales porque cada una se evalúa con sus propios datos.

    Requiere ≥ 3 puntos dentro de la sesión para activarse; con menos no
    hay contexto suficiente para juzgar la consistencia interna.
    """
    from collections import defaultdict

    by_session: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    for p in points:
        by_session[p["session_id"]].append(p)

    result: list[dict[str, Any]] = []
    for session_id, session_pts in by_session.items():
        valid = [p for p in session_pts if p.get(x_key) is not None and p.get(lactate_key) is not None]
        if len(valid) < 3:
            result.extend(session_pts)
            continue

        # LOO por sesión: para cada punto, ajusta la curva sin él
        # y comprueba si su lactato encaja con el resto del test.
        sorted_v = sorted(valid, key=lambda p: p[x_key])
        intra_flags: dict[int, bool] = {}
        for i, candidate in enumerate(sorted_v):
            rest = [p for j, p in enumerate(sorted_v) if j != i]
            total_w = sum(p["point_weight"] for p in rest)
            if total_w <= 0:
                intra_flags[id(candidate)] = False
                continue
            mean_x = sum(p[x_key] * p["point_weight"] for p in rest) / total_w
            mean_y = sum(p[lactate_key] * p["point_weight"] for p in rest) / total_w
            cov = sum(p["point_weight"] * (p[x_key] - mean_x) * (p[lactate_key] - mean_y) for p in rest)
            var_x = sum(p["point_weight"] * (p[x_key] - mean_x) ** 2 for p in rest)
            if var_x <= 0:
                intra_flags[id(candidate)] = False
                continue
            b = cov / var_x
            a = mean_y - b * mean_x
            residual = abs(candidate[lactate_key] - (a + b * candidate[x_key]))
            intra_flags[id(candidate)] = residual > intra_threshold

        # Safeguard: si >40% de los puntos de la sesión se marcarían,
        # la sesión completa es demasiado heterogénea para identificar
        # anomalías individuales — no aplicar el filtro.
        n_flagged = sum(1 for v in intra_flags.values() if v)
        if n_flagged / max(len(valid), 1) > 0.40:
            result.extend({**p, "intra_session_flag": False} for p in session_pts)
            continue

        for p in session_pts:
            flagged = intra_flags.get(id(p), False)
            if flagged:
                result.append({
                    **p,
                    "point_weight": round(p["point_weight"] * 0.15, 5),
                    "intra_session_flag": True,
                })
            else:
                result.append({**p, "intra_session_flag": False})

    return result


def _blend_with_physiological_anchor(
    practical_lt2: dict[str, Any],
    physiological_lt2_speed_kph: Optional[float],
    physiological_lt2_power_watts: Optional[float],
) -> dict[str, Any]:
    """Ancla parcialmente el LT2 práctico dinámico al LT2 fisiológico de la sesión.

    Cuando los datos del motor dinámico son escasos o ruidosos (baja confianza),
    el resultado se puede alejar del umbral fisiológico real. Este blend hace que
    el LT2 práctico converja hacia el fisiológico en proporción inversa a la
    confianza del modelo dinámico.

    Fórmula: anchor_weight = 0.35 × (1 − confidence) + 0.10
      → confidence 0.2 → anchor ~38 %
      → confidence 0.64 → anchor ~23 %
      → confidence 0.9 → anchor ~17 %

    El fisiológico nunca domina completamente: siempre aporta al menos el 10 %
    y como máximo el 45 %, preservando la sensibilidad del modelo dinámico.
    """
    dynamic_confidence = practical_lt2.get("confidence_score", 0.5)
    anchor_weight = round(0.35 * (1.0 - dynamic_confidence) + 0.10, 3)

    blended = dict(practical_lt2)
    blended["physiological_lt2_anchor_applied"] = False

    speed = practical_lt2.get("estimated_speed_kph")
    if speed is not None and physiological_lt2_speed_kph is not None:
        blended_speed = round((1 - anchor_weight) * speed + anchor_weight * physiological_lt2_speed_kph, 3)
        blended_pace = round(3600 / blended_speed, 1) if blended_speed > 0 else None
        blended["estimated_speed_kph"] = blended_speed
        blended["estimated_pace_seconds_per_km"] = blended_pace
        blended["physiological_lt2_anchor_applied"] = True
        blended["physiological_lt2_anchor_kph"] = round(physiological_lt2_speed_kph, 3)
        blended["physiological_lt2_anchor_weight"] = anchor_weight
        blended["explanation"] = practical_lt2.get("explanation", []) + [
            f"Resultado anclado {round(anchor_weight * 100)}% al LT2 fisiológico ({physiological_lt2_speed_kph:.2f} km/h) "
            f"por confianza dinámica de {dynamic_confidence:.2f}."
        ]

    power = practical_lt2.get("estimated_power_watts")
    if power is not None and physiological_lt2_power_watts is not None:
        blended_power = round((1 - anchor_weight) * power + anchor_weight * physiological_lt2_power_watts, 1)
        blended["estimated_power_watts"] = blended_power
        blended["physiological_lt2_anchor_applied"] = True
        blended["physiological_lt2_anchor_watts"] = round(physiological_lt2_power_watts, 1)
        blended["physiological_lt2_anchor_weight"] = anchor_weight

    return blended


def _build_model(
    athlete: Athlete,
    sessions: list[AthleteSession],
    discipline: str,
    as_of: date,
    config: DynamicThresholdConfig,
    model_type: str,
    window_days: int,
    power_source: Optional[str] = None,
    physiological_lt2_speed_kph: Optional[float] = None,
    physiological_lt2_power_watts: Optional[float] = None,
    physiological_lt2_lactate_mmol: Optional[float] = None,
    physiological_lt1_lactate_mmol: Optional[float] = None,
) -> dict[str, Any]:
    points, baseline_lactate, baseline_source, baseline_notes, baseline_state, baseline_delta_from_history, baseline_state_score = _collect_points(
        athlete=athlete,
        sessions=sessions,
        discipline=discipline,
        as_of=as_of,
        config=config,
        window_days=window_days,
        power_source=power_source,
    )
    if not points:
        return {
            "model_type": model_type,
            "based_on_days": window_days,
            "sessions_considered": 0,
            "reference_2mmol": None,
            "reference_4mmol": None,
            "practical_lt1": None,
            "practical_lt2": None,
            "confidence_score": 0.18,
            "reliability_score": 0.18,
            "validity_score": 0.22,
            "sample_size_effect": 0.12,
            "point_influence_score": 0.95,
            "warnings": ["Muy pocos datos para estimación robusta."],
            "explanation": ["No hay puntos suficientes en la ventana seleccionada para estimar referencias dinámicas."],
            "points_used": [],
            "baseline_lactate": baseline_lactate,
            "baseline_source": baseline_source,
            "baseline_state": baseline_state,
            "baseline_delta_from_history": baseline_delta_from_history,
            "baseline_state_score": baseline_state_score,
        }

    _iso_metric = "speed_kph" if discipline == "running" else "power_watts"

    # ── Paso 1: extremos absolutos ──────────────────────────────────────────
    # Elimina únicamente sprints o esfuerzos máximos (lactato fisiológicamente
    # imposible para trabajo submáximo). NO filtra variación día a día.
    if len(points) >= 5:
        _lactates_sorted = sorted(p["raw_lactate"] for p in points)
        _p90 = _lactates_sorted[int(len(_lactates_sorted) * 0.90)]
        _extreme_threshold = max(7.0, _p90 * 1.3)
        points = [
            {**p, "extreme_flag": p["raw_lactate"] > _extreme_threshold,
             "point_weight": round(p["point_weight"] * 0.04, 5)
             if p["raw_lactate"] > _extreme_threshold else p["point_weight"]}
            for p in points
        ]

    # ── Paso 2: consistencia intra-sesión ────────────────────────────────────
    # Dentro de cada sesión, si un punto no encaja con el patrón de esa
    # misma sesión (mismo día, mismo protocolo), baja su peso.
    # La variación ENTRE sesiones (mismo ritmo, más lactato otro día) se
    # preserva: cada sesión se evalúa de forma independiente, no se comparan
    # puntos de días distintos entre sí.
    points = _intrasession_consistency_filter(points, _iso_metric)

    if not points:
        return {
            "model_type": model_type,
            "based_on_days": window_days,
            "sessions_considered": 0,
            "reference_2mmol": None,
            "reference_4mmol": None,
            "practical_lt1": None,
            "practical_lt2": None,
            "confidence_score": 0.18,
            "reliability_score": 0.18,
            "validity_score": 0.22,
            "sample_size_effect": 0.12,
            "point_influence_score": 0.95,
            "warnings": ["Muy pocos datos para estimación robusta."],
            "explanation": ["No hay puntos suficientes en la ventana seleccionada para estimar referencias dinámicas."],
            "points_used": [],
            "baseline_lactate": baseline_lactate,
            "baseline_source": baseline_source,
            "baseline_state": baseline_state,
            "baseline_delta_from_history": baseline_delta_from_history,
            "baseline_state_score": baseline_state_score,
        }

    speed_at_2 = _estimate_reference(points, 2.0, "speed_kph", "km/h", "2 mmol", baseline_lactate, baseline_source, config) if discipline == "running" else None
    speed_at_4 = _estimate_reference(points, 4.0, "speed_kph", "km/h", "4 mmol", baseline_lactate, baseline_source, config) if discipline == "running" else None
    power_at_2 = _estimate_reference(points, 2.0, "power_watts", "W", "2 mmol", baseline_lactate, baseline_source, config)
    power_at_4 = _estimate_reference(points, 4.0, "power_watts", "W", "4 mmol", baseline_lactate, baseline_source, config)
    hr_at_2 = _estimate_reference(points, 2.0, "heart_rate", "bpm", "2 mmol", baseline_lactate, baseline_source, config)
    hr_at_4 = _estimate_reference(points, 4.0, "heart_rate", "bpm", "4 mmol", baseline_lactate, baseline_source, config)

    reference_2 = _combine_reference_views(speed_at_2, power_at_2, hr_at_2)
    reference_4 = _combine_reference_views(speed_at_4, power_at_4, hr_at_4)

    practical_lt1_target, relative_lt1_target, lt1_target_notes = _practical_target_lactate(
        baseline_lactate=baseline_lactate,
        configured_target=config.practical_lt1_target_mmol,
        config=config,
    )
    # Override LT1 practical with REAL LT1 − 0.3 mmol when detected by curve analysis.
    # Only apply when the physiological LT1 is plausible (≤ 2.5 mmol). Higher values
    # indicate a flat curve where LT1 detection is unreliable — keep the default target.
    if (
        physiological_lt1_lactate_mmol is not None
        and 0.8 < physiological_lt1_lactate_mmol <= 2.5
    ):
        practical_lt1_target = round(physiological_lt1_lactate_mmol - 0.3, 2)
        lt1_target_notes = [f"LT1 práctico derivado del LT1 REAL detectado ({physiological_lt1_lactate_mmol:.2f} mmol) − 0.3 mmol."]
    # I1 fix: individualise practical LT2 target.
    # Priority: (1) LT2 REAL lactate − 0.5 mmol when detected by curve analysis,
    #           (2) level-dependent default, (3) config fallback.
    _level_targets = {"recreational": 3.5, "trained": 3.1, "competitive": 2.8}
    _level_default = _level_targets.get(getattr(athlete, "athlete_level", "trained"), 3.1)

    if physiological_lt2_lactate_mmol is not None and 1.5 < physiological_lt2_lactate_mmol <= 6.0:
        practical_lt2_target = round(physiological_lt2_lactate_mmol - 0.5, 2)
        _lt2_target_source = "individual"
    else:
        practical_lt2_target = _level_default
        _lt2_target_source = "fallback"

    practical_speed_lt1 = _estimate_reference(points, practical_lt1_target, "speed_kph", "km/h", "LT1 práctico", baseline_lactate, baseline_source, config, robust=True) if discipline == "running" else None
    practical_power_lt1 = _estimate_reference(points, practical_lt1_target, "power_watts", "W", "LT1 práctico", baseline_lactate, baseline_source, config, robust=True)
    practical_hr_lt1 = _estimate_reference(points, practical_lt1_target, "heart_rate", "bpm", "LT1 práctico", baseline_lactate, baseline_source, config, robust=True)

    practical_cluster_limit = max(practical_lt1_target + 0.2, (baseline_lactate or config.fallback_baseline_lactate) + 0.45)
    practical_speed_cluster = (
        _low_lactate_cluster_reference(points, "speed_kph", "km/h", "LT1 práctico", practical_cluster_limit) if discipline == "running" else None
    )
    practical_power_cluster = _low_lactate_cluster_reference(points, "power_watts", "W", "LT1 práctico", practical_cluster_limit)
    practical_hr_cluster = _low_lactate_cluster_reference(points, "heart_rate", "bpm", "LT1 práctico", practical_cluster_limit)

    practical_speed_lt2 = _estimate_reference(points, practical_lt2_target, "speed_kph", "km/h", "LT2 práctico", baseline_lactate, baseline_source, config, robust=True) if discipline == "running" else None
    practical_power_lt2 = _estimate_reference(points, practical_lt2_target, "power_watts", "W", "LT2 práctico", baseline_lactate, baseline_source, config, robust=True)
    practical_hr_lt2 = _estimate_reference(points, practical_lt2_target, "heart_rate", "bpm", "LT2 práctico", baseline_lactate, baseline_source, config, robust=True)

    practical_speed_lt1 = _prefer_cluster_for_practical_lt1(practical_speed_cluster, practical_speed_lt1)
    practical_power_lt1 = _prefer_cluster_for_practical_lt1(practical_power_cluster, practical_power_lt1)
    practical_hr_lt1 = _prefer_cluster_for_practical_lt1(practical_hr_cluster, practical_hr_lt1)

    practical_lt1 = _combine_reference_views(practical_speed_lt1, practical_power_lt1, practical_hr_lt1)
    practical_lt2 = _combine_reference_views(practical_speed_lt2, practical_power_lt2, practical_hr_lt2)
    if practical_lt1:
        practical_lt1["target_lactate"] = practical_lt1_target
        practical_lt1["relative_target_from_baseline"] = relative_lt1_target
        practical_lt1["explanation"] = lt1_target_notes + practical_lt1["explanation"]
    if practical_lt2:
        practical_lt2["target_lactate"] = practical_lt2_target
        practical_lt2["target_source"] = _lt2_target_source  # "individual" (LT2 REAL − 0.5) or "fallback" (level default)
        practical_lt2["relative_target_from_baseline"] = None
        if physiological_lt2_speed_kph is not None or physiological_lt2_power_watts is not None:
            practical_lt2 = _blend_with_physiological_anchor(
                practical_lt2,
                physiological_lt2_speed_kph=physiological_lt2_speed_kph,
                physiological_lt2_power_watts=physiological_lt2_power_watts,
            )

    all_refs = [item for item in [reference_2, reference_4, practical_lt1, practical_lt2] if item]
    warnings = sorted({warning for item in all_refs for warning in item["warnings"]})
    explanations = baseline_notes + [line for item in all_refs for line in item["explanation"]][:10]
    sample_effect = round(mean([item["sample_size_effect"] for item in all_refs]), 2) if all_refs else _sample_size_effect(len(points))
    point_influence = round(mean([item["point_influence_score"] for item in all_refs]), 2) if all_refs else _point_influence_score(len(points))
    reliability = round(mean([item["reliability_score"] for item in all_refs]), 2) if all_refs else 0.18
    validity = round(mean([item["validity_score"] for item in all_refs]), 2) if all_refs else 0.22
    confidence = round(mean([item["confidence_score"] for item in all_refs]), 2) if all_refs else 0.18
    signal_score = round(mean([item.get("signal_score", 0.22) for item in all_refs]), 2) if all_refs else 0.22
    if len(points) <= 3:
        warnings.append("Muy pocos datos para estimación robusta.")
    if baseline_state_score < 0.85:
        warnings.append("El basal del día está desviado respecto a la línea individual; úsalo para contextualizar la carga externa de hoy.")
    if _lt2_target_source == "fallback":
        warnings.append(f"LT2 práctico usa valor por defecto ({practical_lt2_target} mmol) — no se detectó LT2 individual en la curva. El MLSS varía entre 2.0-8.0 mmol entre individuos.")

    return {
        "model_type": model_type,
        "based_on_days": window_days,
        "sessions_considered": len({point["session_id"] for point in points}),
        "reference_2mmol": reference_2,
        "reference_4mmol": reference_4,
        "practical_lt1": practical_lt1,
        "practical_lt2": practical_lt2,
        "confidence_score": confidence,
        "reliability_score": reliability,
        "validity_score": validity,
        "sample_size_effect": sample_effect,
        "point_influence_score": point_influence,
        "signal_score": signal_score,
        "warnings": sorted(set(warnings)),
        "explanation": explanations[:12],
        "points_used": points[:50],
        "baseline_lactate": baseline_lactate,
        "baseline_source": baseline_source,
        "baseline_state": baseline_state,
        "baseline_delta_from_history": baseline_delta_from_history,
        "baseline_state_score": baseline_state_score,
        "lt1_relative_target_lactate": relative_lt1_target,
    }


def _comparison_metric(
    acute: Optional[dict[str, Any]],
    chronic: Optional[dict[str, Any]],
    metric_key: str,
) -> Optional[dict[str, Any]]:
    if not acute or not chronic:
        return None
    acute_value = acute.get(metric_key)
    chronic_value = chronic.get(metric_key)
    if acute_value is None or chronic_value is None:
        return None
    delta = round(acute_value - chronic_value, 2)
    direction = "stable"
    if abs(delta) >= (6 if metric_key == "estimated_hr_at_target" else 0.25 if metric_key == "estimated_speed_kph" else 8):
        direction = "acute_above_chronic" if delta > 0 else "acute_below_chronic"
    return {"acute": acute_value, "chronic": chronic_value, "delta": delta, "direction": direction}


def _history_from_snapshots(snapshots: list[Any], discipline: str, power_source: Optional[str] = None) -> dict[str, list[dict[str, Any]]]:
    history: dict[str, list[dict[str, Any]]] = {
        "acute_2mmol": [],
        "chronic_2mmol": [],
        "acute_4mmol": [],
        "chronic_4mmol": [],
        "acute_practical_lt1": [],
        "chronic_practical_lt1": [],
        "acute_practical_lt2": [],
        "chronic_practical_lt2": [],
    }
    for snapshot in snapshots:
        if snapshot.discipline != discipline:
            continue
        if power_source is not None and snapshot.power_source != power_source:
            continue
        dynamic = snapshot.payload.get("dynamic_thresholds")
        if not dynamic:
            continue
        for prefix in ("acute", "chronic"):
            model = dynamic.get(prefix)
            if not model:
                continue
            mapping = [
                ("reference_2mmol", f"{prefix}_2mmol"),
                ("reference_4mmol", f"{prefix}_4mmol"),
                ("practical_lt1", f"{prefix}_practical_lt1"),
                ("practical_lt2", f"{prefix}_practical_lt2"),
            ]
            for source_key, history_key in mapping:
                reference = model.get(source_key)
                if not reference:
                    continue
                value = reference.get("estimated_power_watts")
                unit = "W"
                if value is None and reference.get("estimated_pace_seconds_per_km") is not None:
                    value = reference["estimated_pace_seconds_per_km"]
                    unit = "s/km"
                if value is None and reference.get("estimated_hr_at_target") is not None:
                    value = reference["estimated_hr_at_target"]
                    unit = "bpm"
                history[history_key].append(
                    {
                        "date": snapshot.snapshot_date.isoformat(),
                        "metric": history_key,
                        "value": value,
                        "unit": unit,
                        "label": history_key.replace("_", " "),
                    }
                )
    return history


def _detect_regression(
    chronic_model: dict[str, Any],
    history: dict[str, list[dict[str, Any]]],
) -> Optional[str]:
    """Detect sustained regression in practical LT2 vs historical peak.

    Compares current chronic practical_lt2 against the best value in
    chronic_practical_lt2 history. Needs ≥3 historical points to avoid
    false positives from early noisy estimates.

    Threshold: ≥5% decline (pace slower or power/speed lower).
    Mujika & Padilla 2000: detraining LT regression detectable at ~4% in 2 weeks.
    """
    current_lt2 = chronic_model.get("practical_lt2")
    if not current_lt2:
        return None

    hist_points = history.get("chronic_practical_lt2", [])
    if len(hist_points) < 3:
        return None

    # Use the primary metric available (power > speed/pace > HR)
    current_power = current_lt2.get("estimated_power_watts")
    current_pace = current_lt2.get("estimated_pace_seconds_per_km")

    if current_power is not None:
        hist_values = [p["value"] for p in hist_points if p.get("unit") == "W" and p["value"] is not None]
        if len(hist_values) >= 3:
            peak = max(hist_values)
            if peak > 0 and (peak - current_power) / peak >= 0.05:
                pct = round((peak - current_power) / peak * 100, 1)
                return f"Regresión detectada: LT2 potencia actual {current_power:.0f}W vs pico histórico {peak:.0f}W (−{pct}%). Revisar carga de entrenamiento."

    if current_pace is not None:
        hist_values = [p["value"] for p in hist_points if p.get("unit") == "s/km" and p["value"] is not None]
        if len(hist_values) >= 3:
            # For pace: lower is better, so regression = current > best (slower)
            best = min(hist_values)
            if best > 0 and (current_pace - best) / best >= 0.05:
                pct = round((current_pace - best) / best * 100, 1)
                best_m, best_s = divmod(int(best), 60)
                curr_m, curr_s = divmod(int(current_pace), 60)
                return f"Regresión detectada: LT2 pace actual {curr_m}:{curr_s:02d}/km vs mejor histórico {best_m}:{best_s:02d}/km (+{pct}% más lento). Revisar carga de entrenamiento."

    return None


def build_dynamic_threshold_payload(
    athlete: Athlete,
    sessions: list[AthleteSession],
    snapshots: list[Any],
    discipline: str,
    as_of: date,
    config: DynamicThresholdConfig,
    power_source: Optional[str] = None,
    physiological_lt2_speed_kph: Optional[float] = None,
    physiological_lt2_power_watts: Optional[float] = None,
    physiological_lt2_lactate_mmol: Optional[float] = None,
    physiological_lt1_lactate_mmol: Optional[float] = None,
) -> dict[str, Any]:
    acute = _build_model(
        athlete, sessions, discipline, as_of, config, "acute", config.acute_window_days,
        power_source=power_source,
        physiological_lt2_speed_kph=physiological_lt2_speed_kph,
        physiological_lt2_power_watts=physiological_lt2_power_watts,
        physiological_lt2_lactate_mmol=physiological_lt2_lactate_mmol,
        physiological_lt1_lactate_mmol=physiological_lt1_lactate_mmol,
    )
    chronic = _build_model(
        athlete, sessions, discipline, as_of, config, "chronic", config.chronic_window_days,
        power_source=power_source,
        physiological_lt2_speed_kph=physiological_lt2_speed_kph,
        physiological_lt2_power_watts=physiological_lt2_power_watts,
        physiological_lt2_lactate_mmol=physiological_lt2_lactate_mmol,
        physiological_lt1_lactate_mmol=physiological_lt1_lactate_mmol,
    )

    comparison_metrics = {
        "reference_2mmol_power": _comparison_metric(acute.get("reference_2mmol"), chronic.get("reference_2mmol"), "estimated_power_watts"),
        "reference_2mmol_pace": _comparison_metric(acute.get("reference_2mmol"), chronic.get("reference_2mmol"), "estimated_pace_seconds_per_km"),
        "reference_4mmol_power": _comparison_metric(acute.get("reference_4mmol"), chronic.get("reference_4mmol"), "estimated_power_watts"),
        "reference_4mmol_pace": _comparison_metric(acute.get("reference_4mmol"), chronic.get("reference_4mmol"), "estimated_pace_seconds_per_km"),
        "practical_lt1_power": _comparison_metric(acute.get("practical_lt1"), chronic.get("practical_lt1"), "estimated_power_watts"),
        "practical_lt2_power": _comparison_metric(acute.get("practical_lt2"), chronic.get("practical_lt2"), "estimated_power_watts"),
    }

    warnings = sorted(set(acute["warnings"] + chronic["warnings"]))
    # With unified windows (acute=chronic=42d), both models use the same data.
    # Comparison is kept for API compatibility but will report "stable".
    comparison_summary = "Modelo unificado — el decay exponencial pondera datos recientes automáticamente."

    if acute["reliability_score"] >= 0.7 and acute["validity_score"] <= 0.45:
        warnings.append("Estimación matemáticamente estable pero fisiológicamente dudosa.")

    # ── Freshness warnings ─────────────────────────────────────────────────
    # Based on age of most recent lactate data point in the chronic model.
    chronic_points = chronic.get("points_used", [])
    if chronic_points:
        newest_date_str = max(p["session_date"] for p in chronic_points)
        newest_date = date.fromisoformat(newest_date_str)
        days_since_last = (as_of - newest_date).days
        if days_since_last > 90:
            warnings.append(f"Sin datos de lactato desde hace {days_since_last} días — umbrales poco fiables, se recomienda validar.")
        elif days_since_last > 42:
            warnings.append(f"Umbrales basados en datos de hace >{days_since_last} días — fiabilidad reducida.")
        elif days_since_last > 21:
            warnings.append(f"Datos de lactato envejeciendo ({days_since_last}d) — considerar validación próximamente.")

    # ── Regression detection ──────────────────────────────────────────────
    # Compare current practical LT2 vs historical peak.
    # Mujika & Padilla 2000: detraining causes measurable LT regression.
    # We flag ≥5% sustained decline as a warning for the coach.
    history = _history_from_snapshots(snapshots, discipline, power_source=power_source)
    regression_warning = _detect_regression(chronic, history)
    if regression_warning:
        warnings.append(regression_warning)

    return {
        "discipline": discipline,
        "power_source": power_source,
        "generated_on": as_of.isoformat(),
        "config": {
            "lt1_delta_from_baseline": config.lt1_delta_from_baseline,
            "practical_lt1_target_mmol": config.practical_lt1_target_mmol,
            "practical_lt2_target_mmol": config.practical_lt2_target_mmol,
            "practical_translation_mode": config.practical_translation_mode,
            "acute_window_days": config.acute_window_days,
            "chronic_window_days": config.chronic_window_days,
            "recency_decay_days": config.recency_decay_days,
            "quality_weight": config.quality_weight,
            "recency_weight": config.recency_weight,
            "similarity_weight": config.similarity_weight,
            "outlier_residual_threshold": config.outlier_residual_threshold,
            "fallback_baseline_lactate": config.fallback_baseline_lactate,
        },
        "current_baseline_lactate": acute.get("baseline_lactate") or chronic.get("baseline_lactate"),
        "current_baseline_source": acute.get("baseline_source") or chronic.get("baseline_source"),
        "current_baseline_state": acute.get("baseline_state") or chronic.get("baseline_state"),
        "current_baseline_delta_from_history": acute.get("baseline_delta_from_history"),
        "current_baseline_state_score": acute.get("baseline_state_score"),
        "lt1_relative_target_lactate": acute.get("lt1_relative_target_lactate"),
        "acute": acute,
        "chronic": chronic,
        "comparison": {
            "summary": comparison_summary,
            "warnings": sorted(set(warnings)),
            "metrics": comparison_metrics,
        },
        "history": history,
        "warnings": sorted(set(warnings)),
        "explanation": (acute["explanation"] + chronic["explanation"])[:16],
    }
