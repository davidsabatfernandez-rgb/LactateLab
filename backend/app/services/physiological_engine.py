"""Motor fisiológico para selección de mesociclo.

Principios:
- LT2 real/fisiológico (detectado o anclado a 4.0 mmol) para modelar
  rendimiento y decidir bloque.
- LT1 real/fisiológico (detectado o anclado a 2.0 mmol) para eventos de larga
  distancia y estabilidad subumbral.
- 1.6 mmol (LT1 práctico) y 3.1 mmol (LT2 práctico) son SOLO referencia de
  carga de entrenamiento; no entran aquí.
- La fase de temporada encuadra la decisión, pero no puede tapar un limitante
  fisiológico claro.
- Mientras el motor de umbrales no resuelva LT reales, este selector trabaja
  con LT fisiológicos anclados a 2.0/4.0 mmol y lo deja explícito.

Referencias científicas:
- Olbrecht (Science of Winning): modelo de dos poleas VO2max/VLamax.
- Faude et al. (2009): LT2 como predictor de rendimiento en resistencia.
- Billat et al. (1994): %VO2max en carrera por distancia.
- Weber/INSCYD: relación FTP/LT2 con intensidad en triatlón.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


# ── Factores LT2: race_pace = LT2_speed × factor ──────────────────────────
# Fuente: Faude 2009, Billat 1994, Weber/INSCYD, Daniels VDOT
# Recreational: LT2 está ~10-16% por encima de race pace
# Trained:      LT2 está ~5-10% por encima de race pace
# Competitive:  LT2 ≈ race pace o ligeramente por encima

LT2_RACE_FACTOR: dict[str, dict[str, float]] = {
    "5k":        {"recreational": 0.90, "trained": 0.95, "competitive": 1.00},
    "10k":       {"recreational": 0.86, "trained": 0.91, "competitive": 0.96},
    "hm":        {"recreational": 0.82, "trained": 0.88, "competitive": 0.94},
    "marathon":  {"recreational": 0.76, "trained": 0.83, "competitive": 0.90},
    "road_tt_short": {"recreational": 0.88, "trained": 0.93, "competitive": 0.98},
    "road_tt_medium": {"recreational": 0.85, "trained": 0.90, "competitive": 0.95},
    "road_tt_long": {"recreational": 0.81, "trained": 0.87, "competitive": 0.93},
    "pool_400": {"recreational": 0.89, "trained": 0.94, "competitive": 0.99},
    "pool_800_1500": {"recreational": 0.84, "trained": 0.90, "competitive": 0.96},
    "open_water_short": {"recreational": 0.82, "trained": 0.88, "competitive": 0.94},
    "open_water_long": {"recreational": 0.76, "trained": 0.83, "competitive": 0.90},
    "sprint_tri":{"recreational": 0.88, "trained": 0.93, "competitive": 0.98},
    "sprint_run":{"recreational": 0.88, "trained": 0.93, "competitive": 0.98},
    "sprint_bike":{"recreational": 0.88, "trained": 0.93, "competitive": 0.98},
    "olympic_tri":{"recreational": 0.83, "trained": 0.89, "competitive": 0.94},
    "olympic_run":{"recreational": 0.83, "trained": 0.89, "competitive": 0.94},
    "olympic_bike":{"recreational": 0.83, "trained": 0.89, "competitive": 0.94},
    "70.3":      {"recreational": 0.78, "trained": 0.84, "competitive": 0.90},
    "half_tri":  {"recreational": 0.78, "trained": 0.84, "competitive": 0.90},
    "half_run":  {"recreational": 0.78, "trained": 0.84, "competitive": 0.90},
    "half_bike": {"recreational": 0.78, "trained": 0.84, "competitive": 0.90},
    "ironman":   {"recreational": 0.70, "trained": 0.76, "competitive": 0.82},
    "ironman_run": {"recreational": 0.70, "trained": 0.76, "competitive": 0.82},
    "ironman_bike": {"recreational": 0.70, "trained": 0.76, "competitive": 0.82},
    "road_tt":   {"recreational": 0.83, "trained": 0.89, "competitive": 0.95},
    "granfondo": {"recreational": 0.77, "trained": 0.84, "competitive": 0.90},
    "hill_climb": {"recreational": 0.89, "trained": 0.94, "competitive": 0.99},
    "road_race": {"recreational": 0.84, "trained": 0.90, "competitive": 0.95},
    "other":     {"recreational": 0.80, "trained": 0.86, "competitive": 0.92},
}

# ── Factores LT1: relevante para eventos donde LT1 es el limitante ────────
# Maratón recreativo y larga distancia: el atleta corre cerca de LT1
# Fuente: Coyle 1988, Athens Marathon Study (PMC7552741), Couzens/Olbrecht (Ironman)

LT1_RACE_FACTOR: dict[str, dict[str, float]] = {
    "hm": {"recreational": 1.03, "trained": 1.08, "competitive": 1.14},
    "marathon":  {"recreational": 0.98, "trained": 1.05, "competitive": 1.12},
    "70.3":      {"recreational": 0.88, "trained": 0.95, "competitive": 1.02},
    "half_tri": {"recreational": 0.88, "trained": 0.95, "competitive": 1.02},
    "half_run": {"recreational": 0.90, "trained": 0.97, "competitive": 1.04},
    "half_bike": {"recreational": 0.86, "trained": 0.93, "competitive": 1.00},
    "ironman":   {"recreational": 0.82, "trained": 0.90, "competitive": 0.97},
    "ironman_run": {"recreational": 0.84, "trained": 0.91, "competitive": 0.98},
    "ironman_bike": {"recreational": 0.83, "trained": 0.90, "competitive": 0.97},
    "road_tt_long": {"recreational": 0.86, "trained": 0.93, "competitive": 1.00},
    "granfondo": {"recreational": 0.86, "trained": 0.94, "competitive": 1.02},
    "open_water_long": {"recreational": 0.92, "trained": 0.99, "competitive": 1.06},
}

# ── Factores LT1 mínimos de soporte para eventos LT2-led ──────────────────
# No describen ritmo de carrera respecto a LT1; solo un suelo de soporte
# para evitar empujar LT2/especificidad con una base subumbral demasiado pobre.
LT1_SUPPORT_FACTOR: dict[str, dict[str, float]] = {
    "5k": {"recreational": 1.32, "trained": 1.38, "competitive": 1.45},
    "10k": {"recreational": 1.18, "trained": 1.24, "competitive": 1.30},
}

# ── Qué umbral limita cada prueba ─────────────────────────────────────────
# "lt2"  → LT2 es el limitante principal
# "lt1"  → LT1 es el limitante principal
# "both" → ambos importan (eventos medios-largos)

EVENT_LIMITER: dict[str, str] = {
    "5k":         "lt2",
    "10k":        "lt2",
    "hm":         "both",
    "marathon":   "both",   # lt1 para recreational, lt2 para competitive
    "road_tt_short": "lt2",
    "road_tt_medium": "lt2",
    "road_tt_long": "both",
    "sprint_tri": "lt2",
    "sprint_run": "lt2",
    "sprint_bike": "lt2",
    "olympic_tri":"lt2",
    "olympic_run": "lt2",
    "olympic_bike": "lt2",
    "70.3":       "both",
    "half_tri":   "both",
    "half_run":   "both",
    "half_bike":  "both",
    "ironman":    "lt1",
    "ironman_run": "lt1",
    "ironman_bike": "lt1",
    "road_tt":    "lt2",
    "granfondo":  "both",
    "hill_climb": "lt2",
    "road_race":  "lt2",
    "pool_400": "lt2",
    "pool_800_1500": "both",
    "open_water_short": "lt2",
    "open_water_long": "lt1",
    "other":      "lt2",
}

# ── Semanas mínimas para que un bloque produzca adaptación medible ─────────
# Olbrecht: adaptaciones estructurales requieren tiempo prolongado
MIN_WEEKS_FOR_BLOCK: dict[str, int] = {
    "aerobic_capacity_block":     5,
    "threshold_development_block":4,
    "aerobic_power_block":        3,
    "competition_specific_block": 2,
    "recovery_consolidation_block":1,
}


@dataclass
class PhysiologicalContext:
    """Estado fisiológico del atleta para la selección de mesociclo."""

    lt1_kmh: Optional[float]          # LT1 fisiológico en km/h si running
    lt2_kmh: Optional[float]          # LT2 fisiológico en km/h si running
    lt1_power_watts: Optional[float]  # LT1 fisiológico en W si ciclismo
    lt2_power_watts: Optional[float]  # LT2 fisiológico en W si ciclismo
    lt1_confidence: float             # 0–1
    lt2_confidence: float             # 0–1
    test_age_days: Optional[int]      # días desde el último test
    peak_lactate_1km: Optional[float] # pico del test usado como proxy glucolítico
    athlete_level: str                # recreational | trained | competitive
    distance_category: Optional[str] # categoría de prueba objetivo
    target_pace_kmh: Optional[float] # ritmo objetivo en km/h
    target_power_watts: Optional[float]
    metric_type: str                  # "pace_kmh" | "power_watts" | "none"
    weeks_to_goal: Optional[int]


@dataclass
class PhysiologicalGapResult:
    """Resultado del análisis de brecha fisiológica."""

    primary_limiter: str              # "lt1" | "lt2" | "none" | "no_data"
    lt2_gap_kmh: Optional[float]     # compat: km/h o W según metric_type
    lt1_gap_kmh: Optional[float]     # compat: km/h o W según metric_type
    required_lt2_kmh: Optional[float]
    required_lt1_kmh: Optional[float]
    metric_type: str
    season_phase: str                 # "base" | "specific" | "pre_comp" | "taper"
    data_quality: str                 # "good" | "low" | "none"
    recommended_block: str
    reasons: list[str]
    contraindications: list[str]


def _interpolate_metric_at_lactate(
    curve_points: list[dict],
    target_mmol: float,
) -> tuple[Optional[float], Optional[float]]:
    """Interpola LT1/LT2 fisiológicos desde curva cruda.

    Args:
        curve_points: lista de dicts con 'pace_seconds_per_km', 'power_watts' y
            'lactate_mmol' cuando existan.
        target_mmol: nivel de lactato objetivo (ej. 2.0 para LT1, 4.0 para LT2).

    Returns:
        Tupla `(kmh, watts)` en ese nivel de lactato. Cada valor puede ser
        `None` si la curva no soporta esa métrica.
    """
    if not curve_points or len(curve_points) < 2:
        return None, None

    valid = sorted(
        [p for p in curve_points if p.get("lactate_mmol") is not None],
        key=lambda x: x["lactate_mmol"],
    )
    if len(valid) < 2:
        return None, None

    for i in range(len(valid) - 1):
        lo, hi = valid[i], valid[i + 1]
        if lo["lactate_mmol"] <= target_mmol <= hi["lactate_mmol"]:
            fraction = (target_mmol - lo["lactate_mmol"]) / (hi["lactate_mmol"] - lo["lactate_mmol"])
            interp_kmh: Optional[float] = None
            interp_power: Optional[float] = None

            if lo.get("pace_seconds_per_km") and hi.get("pace_seconds_per_km"):
                interp_pace = lo["pace_seconds_per_km"] + fraction * (
                    hi["pace_seconds_per_km"] - lo["pace_seconds_per_km"]
                )
                interp_kmh = round(3600 / interp_pace, 3) if interp_pace > 0 else None

            if lo.get("power_watts") and hi.get("power_watts"):
                interp_power = round(
                    lo["power_watts"] + fraction * (hi["power_watts"] - lo["power_watts"]),
                    1,
                )

            return interp_kmh, interp_power

    return None, None


def _pace_label_to_kmh(pace_label: Optional[str]) -> Optional[float]:
    """Convierte '4:59' o '4:59/km' a km/h. Devuelve None si no parseable."""
    if not pace_label:
        return None
    try:
        clean = pace_label.replace("/km", "").strip()
        parts = clean.split(":")
        if len(parts) == 2:
            mins, secs = int(parts[0]), int(parts[1])
            total_secs = mins * 60 + secs
            return round(3600 / total_secs, 3)
    except Exception:
        pass
    return None


def _season_phase(weeks_to_goal: Optional[int]) -> str:
    if weeks_to_goal is None:
        return "base"
    if weeks_to_goal > 20:
        return "base"
    if weeks_to_goal > 12:
        return "specific"
    if weeks_to_goal > 5:
        return "pre_comp"
    return "taper"


def _threshold_lookup(view: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], Optional[Any]]:
    real = (view.get("real_thresholds") or {}) if view else {}
    thresholds = view.get("thresholds") or []
    threshold_map = {
        str(item.get("name") or "").strip().upper(): item
        for item in thresholds
        if isinstance(item, dict)
    }
    latest_snapshot_date = view.get("latest_snapshot_date")
    return real, threshold_map, latest_snapshot_date


def _extract_lt_from_analysis(
    analysis: dict[str, Any],
    discipline: str,
    raw_curve_points: Optional[list[dict]] = None,
) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float], float, float, Optional[int]]:
    """Extrae LT1 y LT2 en km/h desde el payload de analytics.

    Jerarquía de fuentes (en orden de confianza):
    1. LT real detectado (real_thresholds) — mayor calidad.
    2. LT básico detectado (thresholds) — calidad media.
    3. Interpolación a 2.0 mmol (LT1) y 4.0 mmol (LT2) desde curva cruda — fallback.

    Los 1.6 / 3.1 mmol (prácticos de entrenamiento) NO se usan aquí.
    """
    views = analysis.get("discipline_views") or {}
    view = views.get(discipline) or {}
    real, threshold_map, latest_snapshot_date = _threshold_lookup(view)

    lt1_kmh: Optional[float] = None
    lt2_kmh: Optional[float] = None
    lt1_power_watts: Optional[float] = None
    lt2_power_watts: Optional[float] = None
    lt1_conf = 0.0
    lt2_conf = 0.0
    test_age: Optional[int] = None

    lt1_real = real.get("lt1_real") or {}
    lt2_real = real.get("lt2_real") or {}
    lt1_threshold = threshold_map.get("LT1") or {}
    lt2_threshold = threshold_map.get("LT2") or {}

    # ── Prioridad 1: real_thresholds ──────────────────────────────────────
    lt1_pace = lt1_real.get("pace_seconds_per_km")
    if isinstance(lt1_pace, (int, float)) and lt1_pace > 0:
        lt1_kmh = round(3600 / lt1_pace, 3)
        lt1_conf = float(lt1_real.get("confidence") or 0.7)
    lt1_power = lt1_real.get("power_watts")
    if isinstance(lt1_power, (int, float)) and lt1_power > 0:
        lt1_power_watts = float(lt1_power)
        lt1_conf = max(lt1_conf, float(lt1_real.get("confidence") or 0.7))

    lt2_pace = lt2_real.get("pace_seconds_per_km")
    if isinstance(lt2_pace, (int, float)) and lt2_pace > 0:
        lt2_kmh = round(3600 / lt2_pace, 3)
        lt2_conf = float(lt2_real.get("confidence") or 0.7)
    lt2_power = lt2_real.get("power_watts")
    if isinstance(lt2_power, (int, float)) and lt2_power > 0:
        lt2_power_watts = float(lt2_power)
        lt2_conf = max(lt2_conf, float(lt2_real.get("confidence") or 0.7))

    # ── Prioridad 2: umbrales fisiológicos del snapshot ───────────────────
    if lt1_kmh is None:
        lt1_pace = lt1_threshold.get("pace_seconds_per_km")
        if isinstance(lt1_pace, (int, float)) and lt1_pace > 0:
            lt1_kmh = round(3600 / lt1_pace, 3)
            lt1_conf = max(lt1_conf, float(lt1_threshold.get("confidence") or 0.6))
    if lt1_power_watts is None:
        lt1_power = lt1_threshold.get("power_watts")
        if isinstance(lt1_power, (int, float)) and lt1_power > 0:
            lt1_power_watts = float(lt1_power)
            lt1_conf = max(lt1_conf, float(lt1_threshold.get("confidence") or 0.6))

    if lt2_kmh is None:
        lt2_pace = lt2_threshold.get("pace_seconds_per_km")
        if isinstance(lt2_pace, (int, float)) and lt2_pace > 0:
            lt2_kmh = round(3600 / lt2_pace, 3)
            lt2_conf = max(lt2_conf, float(lt2_threshold.get("confidence") or 0.6))
    if lt2_power_watts is None:
        lt2_power = lt2_threshold.get("power_watts")
        if isinstance(lt2_power, (int, float)) and lt2_power > 0:
            lt2_power_watts = float(lt2_power)
            lt2_conf = max(lt2_conf, float(lt2_threshold.get("confidence") or 0.6))

    # ── Prioridad 3: interpolación fisiológica desde curva cruda ──────────
    # Cuando la detección falla, interpolamos en los anclajes 2.0 y 4.0 mmol.
    # Confianza reducida (0.60) para reflejar la menor certeza.
    if raw_curve_points:
        lt1_interp_kmh, lt1_interp_power = _interpolate_metric_at_lactate(raw_curve_points, 2.0)
        lt2_interp_kmh, lt2_interp_power = _interpolate_metric_at_lactate(raw_curve_points, 4.0)

        if lt1_kmh is None and lt1_interp_kmh is not None:
            lt1_kmh = lt1_interp_kmh
            lt1_conf = max(lt1_conf, 0.60)
        if lt2_kmh is None and lt2_interp_kmh is not None:
            lt2_kmh = lt2_interp_kmh
            lt2_conf = max(lt2_conf, 0.60)

        if lt1_power_watts is None and lt1_interp_power is not None:
            lt1_power_watts = lt1_interp_power
            lt1_conf = max(lt1_conf, 0.60)
        if lt2_power_watts is None and lt2_interp_power is not None:
            lt2_power_watts = lt2_interp_power
            lt2_conf = max(lt2_conf, 0.60)

    # Edad del test
    snap_date = latest_snapshot_date
    if snap_date:
        from datetime import date
        try:
            if hasattr(snap_date, "date"):
                d = snap_date.date()
            else:
                from datetime import datetime
                d = datetime.fromisoformat(str(snap_date)).date()
            test_age = (date.today() - d).days
        except Exception:
            pass

    return lt1_kmh, lt2_kmh, lt1_power_watts, lt2_power_watts, lt1_conf, lt2_conf, test_age


def build_physiological_context(
    analysis: dict[str, Any],
    athlete_level: str,
    discipline: str,
    distance_category: Optional[str],
    target_pace_label: Optional[str],
    target_power_watts: Optional[float],
    weeks_to_goal: Optional[int],
    peak_lactate_1km: Optional[float] = None,
    raw_curve_points: Optional[list[dict]] = None,
) -> PhysiologicalContext:
    """Construye el contexto fisiológico para la selección de mesociclo.

    Si LT1/LT2 no se detectaron automáticamente pero hay puntos de curva crudos,
    se interpolan a los anclajes fisiológicos 2.0 mmol (LT1) y 4.0 mmol (LT2).
    """
    lt1_kmh, lt2_kmh, lt1_power_watts, lt2_power_watts, lt1_conf, lt2_conf, test_age = _extract_lt_from_analysis(
        analysis, discipline, raw_curve_points=raw_curve_points
    )

    # Convertir target pace a km/h
    target_kmh = _pace_label_to_kmh(target_pace_label)
    metric_type = "power_watts" if discipline == "ciclismo" and target_power_watts else "pace_kmh" if target_kmh else "none"

    return PhysiologicalContext(
        lt1_kmh=lt1_kmh,
        lt2_kmh=lt2_kmh,
        lt1_power_watts=lt1_power_watts,
        lt2_power_watts=lt2_power_watts,
        lt1_confidence=lt1_conf,
        lt2_confidence=lt2_conf,
        test_age_days=test_age,
        peak_lactate_1km=peak_lactate_1km,
        athlete_level=athlete_level,
        distance_category=distance_category,
        target_pace_kmh=target_kmh,
        target_power_watts=target_power_watts,
        metric_type=metric_type,
        weeks_to_goal=weeks_to_goal,
    )


def analyse_physiological_gap(ctx: PhysiologicalContext) -> PhysiologicalGapResult:
    """Analiza la brecha fisiológica y recomienda el bloque correcto.

    Jerarquía de decisión (Olbrecht):
    1. Fase de temporada — manda sobre el perfil fisiológico.
    2. Calidad del dato — si no hay test fiable, recomendar test.
    3. Limitante de la prueba — qué umbral importa más.
    4. Gap entre umbral actual y requerido.
    5. Señal del pico de lactato 1km (complementaria).
    """
    reasons: list[str] = []
    contra: list[str] = []
    season = _season_phase(ctx.weeks_to_goal)
    metric_label = "W" if ctx.metric_type == "power_watts" else "km/h"
    lt1_value = ctx.lt1_power_watts if ctx.metric_type == "power_watts" else ctx.lt1_kmh
    lt2_value = ctx.lt2_power_watts if ctx.metric_type == "power_watts" else ctx.lt2_kmh
    target_value = ctx.target_power_watts if ctx.metric_type == "power_watts" else ctx.target_pace_kmh

    # ── Calidad del dato ───────────────────────────────────────────────────
    has_lt2 = lt2_value is not None
    has_lt1 = lt1_value is not None
    data_stale = ctx.test_age_days is not None and ctx.test_age_days > 42

    if not has_lt2 and not has_lt1:
        data_quality = "none"
    elif data_stale:
        data_quality = "low"
    elif (
        (has_lt2 and ctx.lt2_confidence < 0.75) or
        (has_lt1 and ctx.lt1_confidence < 0.75)
    ):
        data_quality = "low"
    else:
        data_quality = "good"

    if data_quality == "none":
        reasons.append("Sin datos de lactato — imposible hacer análisis fisiológico.")
        return PhysiologicalGapResult(
            primary_limiter="no_data",
            lt2_gap_kmh=None, lt1_gap_kmh=None,
            required_lt2_kmh=None, required_lt1_kmh=None,
            metric_type=ctx.metric_type,
            season_phase=season, data_quality=data_quality,
            recommended_block="testing_decision_block",
            reasons=reasons, contraindications=contra,
        )

    if data_quality == "low":
        reasons.append(
            f"Datos de lactato con baja confianza o test antiguo "
            f"({ctx.test_age_days}d). Recomendable repetir test antes de decidir."
        )

    if season == "base":
        reasons.append(
            f"{ctx.weeks_to_goal or '?'} semanas al objetivo — fase de base: "
            "la base sesga la decisión, pero no debe tapar un limitante fisiológico claro."
        )

    # ── Gap analysis ───────────────────────────────────────────────────────
    dist = ctx.distance_category or "other"
    level = ctx.athlete_level if ctx.athlete_level in ("recreational", "trained", "competitive") else "trained"
    limiter = EVENT_LIMITER.get(dist, "lt2")

    required_lt2: Optional[float] = None
    required_lt1: Optional[float] = None
    lt2_gap: Optional[float] = None
    lt1_gap: Optional[float] = None
    long_duration_events = {
        "marathon",
        "road_tt_long",
        "granfondo",
        "70.3",
        "half_tri",
        "half_run",
        "half_bike",
        "ironman",
        "ironman_run",
        "ironman_bike",
        "open_water_long",
    }
    short_intense_events = {
        "5k",
        "10k",
        "road_tt",
        "road_tt_short",
        "road_tt_medium",
        "hill_climb",
        "road_race",
        "pool_400",
        "pool_800_1500",
        "open_water_short",
        "sprint_tri",
        "sprint_run",
        "sprint_bike",
        "olympic_tri",
        "olympic_run",
        "olympic_bike",
        "hm",
    }

    if target_value and target_value > 0:
        lt2_factor = LT2_RACE_FACTOR.get(dist, {}).get(level, 0.88)
        required_lt2 = round(target_value / lt2_factor, 3)

        if dist in LT1_RACE_FACTOR:
            lt1_factor = LT1_RACE_FACTOR[dist].get(level, 0.95)
            required_lt1 = round(target_value / lt1_factor, 3)
        elif dist in LT1_SUPPORT_FACTOR:
            lt1_factor = LT1_SUPPORT_FACTOR[dist].get(level, 1.2)
            required_lt1 = round(target_value / lt1_factor, 3)

        if has_lt2 and required_lt2:
            lt2_gap = round(required_lt2 - lt2_value, 3)
        if has_lt1 and required_lt1:
            lt1_gap = round(required_lt1 - lt1_value, 3)

    # ── Señal glucolítica desde pico de lactato ────────────────────────────
    glycolytic_signal = ""
    if ctx.peak_lactate_1km is not None and has_lt2:
        if ctx.peak_lactate_1km >= 12.0 and (dist in long_duration_events or dist == "hm" or lt2_gap is None or lt2_gap >= 0):
            glycolytic_signal = "high_glycolytic"
            reasons.append(
                f"Pico de lactato alto ({ctx.peak_lactate_1km:.1f} mmol/L) para la demanda prevista "
                "— sesgo glucolítico que puede penalizar la sostenibilidad."
            )
        elif ctx.peak_lactate_1km <= 8.0:
            glycolytic_signal = "low_glycolytic"
            reasons.append(
                f"Pico de lactato bajo ({ctx.peak_lactate_1km:.1f} mmol/L) "
                "— perfil diésel o con margen glucolítico corto."
            )

    # ── Decisión de bloque ─────────────────────────────────────────────────
    recommended = "aerobic_capacity_block"  # default conservador
    significant_gap = 0.5 if ctx.metric_type != "power_watts" else 18.0
    moderate_gap = 0.25 if ctx.metric_type != "power_watts" else 8.0
    lt1_priority = limiter == "lt1" or dist in long_duration_events
    lt2_priority = limiter == "lt2" or dist in short_intense_events or limiter == "both"
    hm_lt1_guardrail = dist == "hm" and lt1_gap is not None and lt1_gap > moderate_gap
    hm_lt1_red_zone = dist == "hm" and lt1_gap is not None and lt1_gap > significant_gap
    half_events = {"70.3", "half_tri", "half_run", "half_bike"}
    half_lt1_guardrail = dist in half_events and lt1_gap is not None and lt1_gap > moderate_gap
    half_lt1_red_zone = dist in half_events and lt1_gap is not None and lt1_gap > significant_gap
    lt2_led_lt1_red_zone = dist in LT1_SUPPORT_FACTOR and lt1_gap is not None and lt1_gap > significant_gap
    lt1_led_flat_profile = (
        dist in {"ironman", "ironman_run", "ironman_bike", "open_water_long"}
        and glycolytic_signal == "low_glycolytic"
        and lt2_gap is not None
        and lt2_gap > significant_gap
        and (lt1_gap is None or lt1_gap <= moderate_gap)
    )
    half_flat_profile = (
        dist in half_events
        and glycolytic_signal == "low_glycolytic"
        and lt2_gap is not None
        and lt2_gap > moderate_gap
        and (lt1_gap is None or lt1_gap <= moderate_gap)
    )
    half_power_window = season in {"specific", "pre_comp"}

    if season == "taper":
        reasons.append("< 6 semanas al objetivo — fase de taper: mantener y afinar.")
        return PhysiologicalGapResult(
            primary_limiter="none",
            lt2_gap_kmh=lt2_gap,
            lt1_gap_kmh=lt1_gap,
            required_lt2_kmh=required_lt2,
            required_lt1_kmh=required_lt1,
            metric_type=ctx.metric_type,
            season_phase=season,
            data_quality=data_quality,
            recommended_block="competition_specific_block",
            reasons=reasons,
            contraindications=contra,
        )

    if glycolytic_signal == "high_glycolytic" and (dist in long_duration_events or dist == "hm"):
        recommended = "aerobic_capacity_block"
        reasons.append("La prueba penaliza el exceso glucolítico: conviene estabilizar coste y soporte subumbral.")
    elif hm_lt1_red_zone:
        recommended = "aerobic_capacity_block"
        reasons.append(
            f"En media maratón, LT1 actual: {lt1_value:.2f} {metric_label} → requerido mínimo: {required_lt1:.2f} {metric_label} "
            f"(gap: {lt1_gap:+.2f} {metric_label}). El soporte subumbral no acompaña aún al objetivo."
        )
    elif half_lt1_red_zone:
        recommended = "aerobic_capacity_block"
        reasons.append(
            f"Para {dist}, LT1 actual: {lt1_value:.2f} {metric_label} → requerido: {required_lt1:.2f} {metric_label} "
            f"(gap: {lt1_gap:+.2f} {metric_label}). El suelo subumbral aún es insuficiente para esta prueba."
        )
    elif lt2_led_lt1_red_zone:
        recommended = "aerobic_capacity_block"
        reasons.append(
            f"Para {dist}, LT1 actual: {lt1_value:.2f} {metric_label} → soporte mínimo recomendado: {required_lt1:.2f} {metric_label} "
            f"(gap: {lt1_gap:+.2f} {metric_label}). El trabajo de LT2 tendría poco retorno con una base tan pobre."
        )
    elif lt1_priority and lt1_gap is not None and lt1_gap > significant_gap:
        recommended = "aerobic_capacity_block"
        reasons.append(
            f"LT1 actual: {lt1_value:.2f} {metric_label} → requerido: {required_lt1:.2f} {metric_label} "
            f"(gap: {lt1_gap:+.2f} {metric_label})."
        )
    elif lt1_led_flat_profile:
        recommended = "threshold_development_block"
        reasons.append(
            "Aunque la prueba es larga, LT1 acompaña razonablemente y el perfil parece demasiado plano por arriba: conviene mover LT2."
        )
    elif half_flat_profile and half_power_window and lt2_gap <= significant_gap:
        recommended = "aerobic_power_block"
        reasons.append(
            "El perfil parece demasiado plano por arriba para la demanda del half; LT1 acompaña y conviene abrir techo aeróbico de forma corta."
        )
    elif half_flat_profile:
        recommended = "threshold_development_block"
        reasons.append(
            "El perfil parece demasiado plano por arriba, pero todavía falta desplazar LT2 antes de abrir un bloque más agudo."
        )
    elif lt2_priority and lt2_gap is not None and lt2_gap > significant_gap:
        recommended = "threshold_development_block"
        reasons.append(
            f"LT2 actual: {lt2_value:.2f} {metric_label} → requerido: {required_lt2:.2f} {metric_label} "
            f"(gap: {lt2_gap:+.2f} {metric_label}). Umbral es el limitante principal."
        )
    elif lt2_priority and lt2_gap is not None and moderate_gap < lt2_gap <= significant_gap:
        recommended = "threshold_development_block" if season == "base" else "aerobic_power_block"
        reasons.append(
            f"LT2 cerca del objetivo, pero aún corto ({lt2_gap:+.2f} {metric_label}). "
            "La decisión depende más del retorno marginal que del calendario puro."
        )
    elif glycolytic_signal == "low_glycolytic" and dist in {"5k", "10k", "road_tt", "road_tt_short", "hill_climb", "road_race", "pool_400", "sprint_tri", "sprint_run", "sprint_bike"}:
        recommended = "aerobic_power_block"
        reasons.append("Perfil demasiado diésel para una prueba relativamente intensa: falta techo aeróbico.")
    elif dist == "hm" and lt2_gap is not None and lt2_gap <= moderate_gap and hm_lt1_guardrail:
        recommended = "aerobic_capacity_block"
        reasons.append(
            "LT2 ya está relativamente cerca del objetivo, pero LT1 sigue demasiado retrasado para sostener bien una media maratón."
        )
    elif lt2_gap is not None and lt2_gap <= moderate_gap and season in {"specific", "pre_comp"}:
        recommended = "competition_specific_block"
        reasons.append("El perfil fisiológico ya es compatible; toca transferirlo al gesto y a la prueba.")
    elif season == "base" and dist in long_duration_events:
        recommended = "aerobic_capacity_block"
        reasons.append("En prueba larga y con margen temporal, la capacidad aeróbica sigue teniendo prioridad estructural.")
    elif season == "base" and lt2_gap is not None:
        if lt2_gap > moderate_gap and (lt1_gap is None or lt1_gap <= moderate_gap):
            recommended = "threshold_development_block"
            reasons.append("Aunque estamos lejos del objetivo, LT2 parece el limitante con mejor retorno marginal ahora.")
        else:
            recommended = "aerobic_capacity_block"
            reasons.append(
                "Aunque estamos lejos del objetivo, la señal actual sugiere consolidar soporte aeróbico primero."
            )
    elif season in {"specific", "pre_comp"} and lt1_priority and lt1_gap is not None and lt1_gap > significant_gap:
        recommended = "aerobic_capacity_block"
        reasons.append("La prueba exige más soporte subumbral del que el atleta tiene hoy.")
    elif season in {"specific", "pre_comp"} and lt2_gap is None:
        recommended = "threshold_development_block"
        reasons.append("Sin gap preciso, el umbral es la hipótesis conservadora con mejor retorno.")

    if dist == "hm" and hm_lt1_red_zone:
        primary_limiter = "lt1"
    elif half_lt1_red_zone:
        primary_limiter = "lt1"
    elif lt2_led_lt1_red_zone:
        primary_limiter = "lt1"
    elif lt1_led_flat_profile or half_flat_profile:
        primary_limiter = "lt2"
    else:
        primary_limiter = "lt2" if limiter in ("lt2", "both") else "lt1"

    return PhysiologicalGapResult(
        primary_limiter=primary_limiter,
        lt2_gap_kmh=lt2_gap,
        lt1_gap_kmh=lt1_gap,
        required_lt2_kmh=required_lt2,
        required_lt1_kmh=required_lt1,
        metric_type=ctx.metric_type,
        season_phase=season,
        data_quality=data_quality,
        recommended_block=recommended,
        reasons=reasons,
        contraindications=contra,
    )
