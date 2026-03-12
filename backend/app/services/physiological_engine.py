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

# Convención: required_lt2 = target_race_pace / factor
# factor < 1 → LT2 debe ser MÁS RÁPIDO que el ritmo de carrera (objetivo de calidad)
# Fuentes por disciplina:
#   Running: Faude 2009 (MLSS), Daniels VDOT T-pace, Billat 2003
#   Ciclismo: Coggan FTP≈0.95×MLSS, Allen&Coggan 2010
#   Triatlón: Hausswirth & Mujika 2013 (fatiga acumulada penaliza ~8-12% en run leg)
#   Natación: Maglischo 2003, Olbrecht 2000 (CSS≈LT2 en piscina)
LT2_RACE_FACTOR: dict[str, dict[str, float]] = {
    # ── Running ──────────────────────────────────────────────────────────
    # 5k: race pace ≈ LT2 para competitive; trained corre ~4% sobre LT2
    "5k":        {"recreational": 0.90, "trained": 0.96, "competitive": 1.01},
    # 10k: cerca del umbral para trained/competitive (Faude 2009 fig.3)
    "10k":       {"recreational": 0.88, "trained": 0.93, "competitive": 0.98},
    # HM: Daniels T-pace ≈ HM-pace para trained → factor ~0.97; recreational más alejado
    "hm":        {"recreational": 0.85, "trained": 0.92, "competitive": 0.97},
    # Maratón: Billat 2003 — élite ≈ 87-93% MLSS; recreational más conservador
    "marathon":  {"recreational": 0.79, "trained": 0.87, "competitive": 0.93},
    # ── Ciclismo ─────────────────────────────────────────────────────────
    # TT corto (<30 min): ~100-105% FTP ≈ 95-100% MLSS → factor cercano a 1
    "road_tt_short": {"recreational": 0.91, "trained": 0.97, "competitive": 1.02},
    # TT medio (30-60 min): ~95-100% FTP ≈ 90-95% MLSS
    "road_tt_medium": {"recreational": 0.87, "trained": 0.92, "competitive": 0.97},
    # TT largo (>60 min): ~85-90% FTP ≈ 81-86% MLSS
    "road_tt_long": {"recreational": 0.83, "trained": 0.89, "competitive": 0.94},
    # TT genérico (alias medium)
    "road_tt":   {"recreational": 0.86, "trained": 0.92, "competitive": 0.97},
    # Granfondo (~3-5h): penalización por duración similar a maratón
    "granfondo": {"recreational": 0.79, "trained": 0.86, "competitive": 0.92},
    # Hill climb (<60 min intensa): similar TT corto-medio
    "hill_climb": {"recreational": 0.91, "trained": 0.96, "competitive": 1.01},
    # Road race (criterium/carrera): corta e intensa
    "road_race": {"recreational": 0.85, "trained": 0.91, "competitive": 0.96},
    # ── Natación ─────────────────────────────────────────────────────────
    # Pool 400: CSS ≈ LT2 en piscina (Olbrecht); competitive puede superar ligeramente
    "pool_400":  {"recreational": 0.90, "trained": 0.95, "competitive": 1.00},
    # Pool 800-1500: algo por debajo de CSS/LT2
    "pool_800_1500": {"recreational": 0.85, "trained": 0.91, "competitive": 0.97},
    # Open water short (~750-1500m): similar pool pero penalización técnica/corriente
    "open_water_short": {"recreational": 0.83, "trained": 0.89, "competitive": 0.95},
    # Open water long (≥5km): fatiga + corriente penalizan más
    "open_water_long": {"recreational": 0.77, "trained": 0.84, "competitive": 0.91},
    # ── Triatlón — factores con penalización de fatiga acumulada ─────────
    # Sprint (~1h total): fatiga acumulada mínima, cerca de running puro
    "sprint_tri":  {"recreational": 0.90, "trained": 0.95, "competitive": 1.00},
    "sprint_run":  {"recreational": 0.90, "trained": 0.95, "competitive": 1.00},
    "sprint_bike": {"recreational": 0.90, "trained": 0.95, "competitive": 1.00},
    # Olímpico (~2h): penalización ~3-4% respecto a running aislado
    "olympic_tri":  {"recreational": 0.85, "trained": 0.91, "competitive": 0.96},
    "olympic_run":  {"recreational": 0.85, "trained": 0.91, "competitive": 0.96},
    "olympic_bike": {"recreational": 0.85, "trained": 0.91, "competitive": 0.96},
    # 70.3 (~4-5h): penalización ~8-10%; run leg es ~HM pace para trained
    "70.3":      {"recreational": 0.80, "trained": 0.86, "competitive": 0.92},
    "half_tri":  {"recreational": 0.80, "trained": 0.86, "competitive": 0.92},
    "half_run":  {"recreational": 0.80, "trained": 0.87, "competitive": 0.93},
    "half_bike": {"recreational": 0.79, "trained": 0.85, "competitive": 0.91},
    # Ironman (~8-17h): penalización máxima; run leg bien por debajo del LT2 standalone
    "ironman":     {"recreational": 0.71, "trained": 0.78, "competitive": 0.84},
    "ironman_run": {"recreational": 0.71, "trained": 0.78, "competitive": 0.84},
    "ironman_bike": {"recreational": 0.72, "trained": 0.79, "competitive": 0.85},
    # ── Otros ────────────────────────────────────────────────────────────
    "other":     {"recreational": 0.81, "trained": 0.87, "competitive": 0.93},
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
    "aerobic_capacity_block":      5,
    "threshold_development_block": 4,
    "anaerobic_capacity_block":    4,   # ANC — Olbrecht: cambios toman semanas-meses
    "aerobic_power_block":         3,
    "anaerobic_power_block":       2,   # ANP — Olbrecht: efectos en 10-17 días (moderado ANC)
    "competition_specific_block":  2,
    "recovery_consolidation_block":1,
    "testing_decision_block":      0,
}

# ── Eventos donde tiene sentido un bloque ANC (construir VLamax) ──────────────
# Para atletas con VLamax baja (perfil diesel) que compiten en pruebas
# donde la capacidad anaeróbica es co-determinante del rendimiento.
# Fuente: Olbrecht SoW cap.2 — "ANC important even for middle-distance athletes"
_ANC_CANDIDATE_EVENTS: frozenset[str] = frozenset({
    "5k", "10k", "sprint_tri", "sprint_run", "sprint_bike",
    "pool_400", "hill_climb", "road_race", "road_tt_short",
})

# ── Eventos donde ANP es la prescripción pre-comp correcta ────────────────────
# Olbrecht: "sprinters and middle distance athletes concentrate on ANP
# in the competition training period; long distance athletes use AEP."
_ANP_EVENTS: frozenset[str] = frozenset({
    "5k", "10k", "sprint_tri", "sprint_run",
    "pool_400", "hill_climb", "road_race",
})

# ── Benchmarks LT2 absoluto para estimar nivel aeróbico ───────────────────
# (umbral_bajo, umbral_alto) — por debajo = low, entre = moderate, encima = high
# Running en km/h; Ciclismo en W (sin normalizar); Natación en km/h
# Fuente: Billat 2003, Daniels VDOT, literatura de laboratorio
LT2_AEROBIC_BENCHMARKS: dict[str, dict[str, tuple[float, float]]] = {
    "running": {
        "recreational": (9.0,  11.5),
        "trained":      (11.0, 14.5),
        "competitive":  (13.5, 17.0),
    },
    "ciclismo": {
        "recreational": (170.0, 240.0),
        "trained":      (220.0, 310.0),
        "competitive":  (270.0, 380.0),
    },
    "natacion": {
        "recreational": (2.8, 3.4),
        "trained":      (3.2, 4.0),
        "competitive":  (3.8, 4.8),
    },
}

# ── Umbrales ratio LT1/LT2 para proxy de VLamax ───────────────────────────
# Ratio = LT1_speed / LT2_speed (misma unidad: km/h o W)
# Curva empinada (ratio bajo) → VLamax alta → más glucólisis dominante
# Curva plana (ratio alto)   → VLamax baja → perfil diésel/aeróbico puro
_VLAMAX_HIGH_RATIO    = 0.79   # ratio < 0.79  → VLamax alta
_VLAMAX_MODERATE_RATIO = 0.87  # ratio 0.79–0.87 → VLamax moderada
                                # ratio > 0.87  → VLamax baja

# ── Confianza del perfil según fuente de los thresholds ───────────────────
_SOURCE_PROFILE_CONFIDENCE: dict[str, float] = {
    "real":         0.85,  # real_thresholds detectados
    "basic":        0.65,  # thresholds básicos detectados
    "interpolated": 0.40,  # interpolados a 2.0/4.0 mmol
    "insufficient": 0.0,
}


@dataclass
class CapacityProfile:
    """Perfil aeróbico/glucolítico derivado de los thresholds disponibles.

    Proxy del modelo VO2max/VLamax de Olbrecht/Mader sin necesitar tests directos.
    La confianza crece conforme los thresholds mejoran: interpolados → básicos → reales.
    """

    aerobic_level: str           # "high" | "moderate" | "low" | "unknown"
    vlamax_level: str            # "high" | "moderate" | "low" | "unknown"
    confidence: float            # 0.0–1.0
    source: str                  # "real" | "basic" | "interpolated" | "insufficient"
    lt1_lt2_ratio: Optional[float]  # ratio LT1/LT2 (transparencia)


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
    capacity_profile: Optional[CapacityProfile] = None


@dataclass
class PhysiologicalGapResult:
    """Resultado del análisis de brecha fisiológica."""

    primary_limiter: str              # "lt1" | "lt2" | "none" | "no_data"
    lt2_gap_kmh: Optional[float]     # compat: km/h o W según metric_type
    lt1_gap_kmh: Optional[float]     # compat: km/h o W según metric_type
    required_lt2_kmh: Optional[float]
    required_lt1_kmh: Optional[float]
    metric_type: str
    season_phase: str                 # "base_early"|"base_late"|"specific"|"pre_comp"|"taper"
    data_quality: str                 # "good" | "low" | "none"
    recommended_block: str
    reasons: list[str]
    contraindications: list[str]
    # ── Fiabilidad y rationale ─────────────────────────────────────────────
    # Poblados por analyse_physiological_gap usando block_rationale.py
    warnings: list[Any] = None           # list[ReliabilityWarning] — importado lazy
    borderline: bool = False             # gap cerca de un umbral de decisión (±15%)
    borderline_note: str = ""            # explicación del caso límite


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


_BASE_PHASES = {"base_early", "base_late"}


def _season_phase(weeks_to_goal: Optional[int]) -> str:
    """Devuelve la fase de temporada según semanas al objetivo.

    base_early (>28s): construcción de base — prioridad capacidad aeróbica.
    base_late (20-28s): final del base — puede empezar a mover LT2 si la base acompaña.
        Olbrecht: "en el último mesociclo del base, re-boostear capacidad aeróbica
        justo antes de entrar en fase específica" (Triathlon PDF, 2011).
    specific (12-20s): trabajo de umbral y potencia.
    pre_comp (3-12s): afinado y transferencia.
    taper (<3s): mantener, reducir volumen. Olbrecht: taper típico 2-3 semanas.
    """
    if weeks_to_goal is None:
        return "base_early"
    if weeks_to_goal > 28:
        return "base_early"
    if weeks_to_goal > 20:
        return "base_late"
    if weeks_to_goal > 12:
        return "specific"
    if weeks_to_goal > 3:
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


def _infer_threshold_source(lt1_conf: float, lt2_conf: float) -> str:
    """Infiere la fuente de los thresholds desde sus confianzas combinadas."""
    min_conf = min(lt1_conf, lt2_conf)
    if min_conf >= 0.74:
        return "real"
    if min_conf >= 0.62:
        return "basic"
    if min_conf >= 0.58:
        return "interpolated"
    return "insufficient"


def build_capacity_profile(
    lt1_value: Optional[float],
    lt2_value: Optional[float],
    lt1_conf: float,
    lt2_conf: float,
    athlete_level: str,
    discipline: str,
    metric_type: str,
) -> CapacityProfile:
    """Construye el perfil de capacidades aeróbica/glucolítica.

    Requiere LT1 y LT2 para estimar VLamax (ratio de la curva). Si falta
    alguno o la fuente es insuficiente, devuelve un perfil sin confianza.

    No reemplaza el gap analysis con anclajes — lo cualifica cuando la
    confianza es suficiente (≥ 0.55 orientativo, ≥ 0.75 para modificar bloque).
    """
    if lt1_value is None or lt2_value is None or lt2_value <= 0:
        return CapacityProfile(
            aerobic_level="unknown",
            vlamax_level="unknown",
            confidence=0.0,
            source="insufficient",
            lt1_lt2_ratio=None,
        )

    source = _infer_threshold_source(lt1_conf, lt2_conf)
    base_conf = _SOURCE_PROFILE_CONFIDENCE[source]

    if source == "insufficient":
        return CapacityProfile(
            aerobic_level="unknown",
            vlamax_level="unknown",
            confidence=0.0,
            source=source,
            lt1_lt2_ratio=None,
        )

    # ── Proxy VLamax: ratio LT1/LT2 ──────────────────────────────────────
    ratio = lt1_value / lt2_value
    if ratio < _VLAMAX_HIGH_RATIO:
        vlamax_level = "high"
    elif ratio < _VLAMAX_MODERATE_RATIO:
        vlamax_level = "moderate"
    else:
        vlamax_level = "low"

    # ── Proxy aeróbico: LT2 absoluto vs benchmarks por nivel/disciplina ──
    disc_key = discipline if discipline in LT2_AEROBIC_BENCHMARKS else "running"
    level_key = athlete_level if athlete_level in ("recreational", "trained", "competitive") else "trained"
    benchmarks = LT2_AEROBIC_BENCHMARKS.get(disc_key, {}).get(level_key)

    if benchmarks is None or metric_type == "none":
        aerobic_level = "unknown"
        base_conf *= 0.7  # penalizar si no hay benchmark para esta disciplina
    else:
        low_thresh, high_thresh = benchmarks
        if lt2_value < low_thresh:
            aerobic_level = "low"
        elif lt2_value >= high_thresh:
            aerobic_level = "high"
        else:
            aerobic_level = "moderate"

    return CapacityProfile(
        aerobic_level=aerobic_level,
        vlamax_level=vlamax_level,
        confidence=round(base_conf, 3),
        source=source,
        lt1_lt2_ratio=round(ratio, 3),
    )


def _apply_capacity_profile(
    profile: Optional[CapacityProfile],
    recommended: str,
    reasons: list[str],
    season: str = "base_early",
    distance_category: Optional[str] = None,
    athlete_level: str = "trained",
) -> str:
    """Cualifica o refina el bloque recomendado con el perfil de capacidades.

    Confianza ≥ 0.75 (thresholds reales): puede cambiar el bloque.
    Confianza 0.55–0.74 (thresholds básicos): añade contexto, no cambia bloque.
    Confianza < 0.55 (interpolados): sin efecto — el gap analysis manda.

    No actúa si aerobic_level o vlamax_level son "unknown".

    Bloques Olbrecht que puede recomendar:
      ANC (anaerobic_capacity_block): perfil diesel en prueba corta, base_late.
           Olbrecht: "ANC importante incluso en media distancia; corredor diesel
           en 5k/10k necesita desarrollar glucólisis para activar sprint final."
      AEP (aerobic_power_block): alta capacidad aeróbica + baja VLamax, no base_early.
      Supresión VLamax (→ AEC): alta aeróbica + alta VLamax en base phases.
      Thin ice (→ AEC): baja aeróbica + alta VLamax, siempre.
    """
    if profile is None or profile.confidence < 0.55:
        return recommended
    if profile.aerobic_level == "unknown" or profile.vlamax_level == "unknown":
        return recommended

    aerobic = profile.aerobic_level
    vlamax = profile.vlamax_level
    ratio_str = f"{profile.lt1_lt2_ratio:.2f}" if profile.lt1_lt2_ratio else "?"

    # ── Confianza alta: puede modificar el bloque ─────────────────────────
    if profile.confidence >= 0.75:
        # HIGH/MODERATE aeróbico + BAJA VLamax (perfil diesel):
        # NO aplica en base_early (siempre AEC en base temprana).
        # En base_late + prueba corta → ANC para desarrollar glucólisis (Olbrecht).
        # En otros contextos → AEP (la base está construida, afinar su uso).
        if aerobic in ("high", "moderate") and vlamax == "low" and season not in {"base_early"}:
            if recommended in ("aerobic_capacity_block", "threshold_development_block"):
                dist = distance_category or ""
                if (
                    season == "base_late"
                    and dist in _ANC_CANDIDATE_EVENTS
                    and athlete_level in {"trained", "competitive"}
                ):
                    # ANC: construir VLamax en atleta diesel para prueba corta.
                    # Solo trained/competitive — recreativos necesitan base aeróbica primero.
                    # Olbrecht: "ANC even for middle distance; diesel athlete needs
                    # to develop glycolysis to activate sprint and tolerate training load"
                    reasons.append(
                        f"Perfil diesel (VLamax baja, ratio={ratio_str}) en prueba corta ({dist}). "
                        "Base tardía: desarrollar capacidad anaeróbica (ANC, Olbrecht) para "
                        "activar la glucólisis necesaria en la fase específica."
                    )
                    return "anaerobic_capacity_block"
                elif aerobic == "high":
                    # Solo HIGH aeróbico justifica upgrade a AEP.
                    # MODERATE aeróbico con VLamax baja: el gap puede seguir siendo real
                    # — añadimos contexto pero no cambiamos el bloque.
                    reasons.append(
                        f"Perfil: alta capacidad aeróbica + baja glucólisis (ratio LT1/LT2={ratio_str}). "
                        "La base está construida — potencia aeróbica tiene mejor retorno marginal."
                    )
                    return "aerobic_power_block"
                else:
                    # moderate aeróbico + VLamax baja: añadir contexto, respetar bloque del gap analysis
                    reasons.append(
                        f"Perfil orientativo diesel (ratio={ratio_str}): VLamax baja pero capacidad "
                        "aeróbica moderada — el gap de LT2 sigue siendo el limitante prioritario."
                    )
                    return recommended

        # HIGH aeróbico + ALTA VLamax: suprimir glucólisis — solo en fases de base
        # En specific/pre_comp la intensidad de carrera ya gestiona la VLamax
        if aerobic == "high" and vlamax == "high" and season in _BASE_PHASES:
            if recommended in ("aerobic_capacity_block", "threshold_development_block"):
                reasons.append(
                    f"Perfil: alta capacidad aeróbica pero glucólisis dominante (ratio={ratio_str}). "
                    "Prioridad: suprimir VLamax con volumen extensivo. Minimizar spices intensos en este bloque."
                )
                return "aerobic_capacity_block"

        # LOW aeróbico + ALTA VLamax: thin ice — siempre aplica
        if aerobic == "low" and vlamax == "high":
            reasons.append(
                f"Perfil: base aeróbica débil con glucólisis activa (ratio={ratio_str}). "
                "Thin ice (Olbrecht): construir base aeróbica con cautela — la intensidad puede "
                "romper el equilibrio glucolítico antes de que la base soporte la carga."
            )
            return "aerobic_capacity_block"

    # ── Confianza media: solo contexto, sin cambio de bloque ─────────────
    reasons.append(
        f"Perfil orientativo (ratio LT1/LT2={ratio_str}): "
        f"aeróbico {aerobic} / VLamax {vlamax}. "
        f"Confianza {profile.confidence:.0%} — confirmar con más tests."
    )
    return recommended


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

    # Valores a pasar al perfil según tipo de métrica
    lt1_val = lt1_power_watts if metric_type == "power_watts" else lt1_kmh
    lt2_val = lt2_power_watts if metric_type == "power_watts" else lt2_kmh

    capacity_profile = build_capacity_profile(
        lt1_value=lt1_val,
        lt2_value=lt2_val,
        lt1_conf=lt1_conf,
        lt2_conf=lt2_conf,
        athlete_level=athlete_level,
        discipline=discipline,
        metric_type=metric_type,
    )

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
        capacity_profile=capacity_profile,
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
    # P21a: test muy obsoleto (>56d) en fase crítica → no prescribir, recomendar test
    # Un test de 8+ semanas en specific/pre_comp puede llevar a prescripciones equivocadas.
    if (
        data_quality == "low"
        and ctx.test_age_days is not None and ctx.test_age_days > 56
        and season in {"specific", "pre_comp"}
    ):
        reasons.append(
            f"Test de {ctx.test_age_days} días en fase {season}: demasiado obsoleto para "
            "prescribir con seguridad. Repetir test antes de decidir el bloque."
        )
        return PhysiologicalGapResult(
            primary_limiter="no_data",
            lt2_gap_kmh=None, lt1_gap_kmh=None,
            required_lt2_kmh=None, required_lt1_kmh=None,
            metric_type=ctx.metric_type,
            season_phase=season, data_quality=data_quality,
            recommended_block="testing_decision_block",
            reasons=reasons, contraindications=contra,
        )

    if season in _BASE_PHASES:
        if season == "base_late":
            reasons.append(
                f"{ctx.weeks_to_goal or '?'} semanas al objetivo — final del bloque de base: "
                "si la base aeróbica acompaña, es momento de empezar a desplazar LT2."
            )
        else:
            reasons.append(
                f"{ctx.weeks_to_goal or '?'} semanas al objetivo — base temprana: "
                "consolidar la capacidad aeróbica antes de cualquier otro trabajo."
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
        # High glycolytic solo penaliza en pruebas largas/medio-largas donde la sostenibilidad
        # es clave. En pruebas cortas (5k, 10k, sprint_tri...) un pico alto es normal y no penaliza.
        if ctx.peak_lactate_1km >= 12.0 and (dist in long_duration_events or dist == "hm"):
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
    # F4: para eventos donde LT1 ES el limitante primario (no "both"), el atleta compite
    # cerca de LT1 → un gap de 0.35 km/h ya representa penalización real de rendimiento.
    # Fuente: Coyle 1988 (marathon/LT1); Laursen 2002 (ironman); Olbrecht 2000 (OW long)
    significant_gap_lt1_primary = 0.35 if ctx.metric_type != "power_watts" else 12.0
    lt1_priority = limiter == "lt1" or dist in long_duration_events
    lt2_priority = limiter == "lt2" or dist in short_intense_events or limiter == "both"
    hm_lt1_guardrail = dist == "hm" and lt1_gap is not None and lt1_gap > moderate_gap
    hm_lt1_red_zone = dist == "hm" and lt1_gap is not None and lt1_gap > significant_gap
    half_events = {"70.3", "half_tri", "half_run", "half_bike"}
    half_lt1_guardrail = dist in half_events and lt1_gap is not None and lt1_gap > moderate_gap
    half_lt1_red_zone = dist in half_events and lt1_gap is not None and lt1_gap > significant_gap
    # F1: solo disparar si la base subumbral es genuinamente débil.
    # Ratio LT1/LT2 ≥ 0.75 = base funcional (Faude 2009: trained runners LT1/LT2 ≈ 0.75–0.85).
    # Evita alarmas falsas en atletas entrenados con ratio normal pero gap alto por factor estricto.
    _lt1_base_ok = (
        lt1_value is not None and lt2_value is not None and lt2_value > 0
        and lt1_value / lt2_value >= 0.75
    )
    lt2_led_lt1_red_zone = (
        dist in LT1_SUPPORT_FACTOR
        and lt1_gap is not None
        and lt1_gap > significant_gap
        and not _lt1_base_ok
    )
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
    half_power_window = season in {"specific", "pre_comp", "base_late"}

    if season == "taper":
        reasons.append("≤ 3 semanas al objetivo — taper: mantener estímulo, reducir volumen.")
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
    elif lt1_priority and lt1_gap is not None and lt1_gap > (
        significant_gap_lt1_primary if limiter == "lt1" else significant_gap
    ):
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
    elif lt2_priority and lt2_gap is not None and lt2_gap > significant_gap and season not in {"base_early"} and (
        # En base_late, solo disparar si LT1 acompaña (lt1_gap pequeño o sin LT1).
        # Si lt1_gap es grande (> significant_gap), el atleta necesita base aeróbica primero,
        # no threshold — la lógica de base_phases lo gestiona correctamente más abajo.
        season not in _BASE_PHASES or lt1_gap is None or lt1_gap <= significant_gap
    ):
        recommended = "threshold_development_block"
        reasons.append(
            f"LT2 actual: {lt2_value:.2f} {metric_label} → requerido: {required_lt2:.2f} {metric_label} "
            f"(gap: {lt2_gap:+.2f} {metric_label}). Umbral es el limitante principal."
        )
    elif lt2_priority and lt2_gap is not None and moderate_gap < lt2_gap <= significant_gap:
        recommended = "threshold_development_block" if season in _BASE_PHASES else "aerobic_power_block"
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
        if season == "pre_comp" and dist in _ANP_EVENTS:
            # ANP — Olbrecht: "sprinters and middle-distance athletes concentrate on
            # anaerobic power in the competition training period" (SoW cap.2)
            recommended = "anaerobic_power_block"
            reasons.append(
                f"Pre-competición con umbral en rango para {dist} — potencia anaeróbica (ANP, Olbrecht): "
                "afinar la expresión máxima de velocidad y tolerancia a la acidosis antes de competir."
            )
        else:
            # competition_specific = AEP para larga distancia / specific phase
            recommended = "competition_specific_block"
            reasons.append("El perfil fisiológico ya es compatible; toca transferirlo al gesto y a la prueba.")
    # F3: base_late con umbral ya en rango → no hacer base, avanzar a potencia aeróbica
    # Olbrecht: "mesociclo final del base = mantener lo adquirido y preparar para el específico"
    elif (
        season == "base_late"
        and lt2_gap is not None and lt2_gap <= moderate_gap
        and (lt1_gap is None or lt1_gap <= moderate_gap)
    ):
        recommended = "aerobic_power_block"
        reasons.append(
            "Base tardía con umbral ya en rango: buena ventana para potencia aeróbica "
            "antes de entrar en específico (Olbrecht: mantener y preparar, no más base extensa)."
        )
    elif season in _BASE_PHASES and dist in long_duration_events:
        # base_late con LT1 sólido puede empezar a mover LT2 (Olbrecht: 2ª parte del base)
        # Para eventos lt1-primary (ironman, OW_long...) usamos el umbral F4 (0.35) como
        # referencia de "LT1 acompaña", no el moderate_gap genérico (0.25).
        _lt1_ok_for_base_late = (
            lt1_gap is None
            or lt1_gap <= (significant_gap_lt1_primary if limiter == "lt1" else moderate_gap)
        )
        if (
            season == "base_late"
            and lt2_gap is not None and lt2_gap > moderate_gap
            and _lt1_ok_for_base_late
        ):
            recommended = "threshold_development_block"
            reasons.append(
                "Final del base en prueba larga: LT1 acompaña y LT2 sigue siendo el limitante — "
                "buen momento de empezar a desplazarlo antes de entrar en específico."
            )
        else:
            recommended = "aerobic_capacity_block"
            reasons.append("Con margen temporal, la capacidad aeróbica sigue teniendo prioridad estructural.")
    elif season in _BASE_PHASES and lt2_gap is not None:
        if lt2_gap > moderate_gap and (lt1_gap is None or lt1_gap <= moderate_gap):
            if season == "base_late":
                recommended = "threshold_development_block"
                reasons.append(
                    "Final del base: LT2 es el limitante claro y LT1 ya acompaña — "
                    "adelantar el trabajo de umbral tiene buen retorno marginal."
                )
            else:
                # base_early: aunque LT2 sea el limitante, consolidar base primero
                recommended = "aerobic_capacity_block"
                reasons.append(
                    "Base temprana: construir la capacidad aeróbica es la prioridad "
                    "antes de atacar el umbral directamente."
                )
        else:
            recommended = "aerobic_capacity_block"
            reasons.append("La señal actual sugiere consolidar soporte aeróbico primero.")
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

    # ── Perfil de capacidades: cualifica o refina el bloque ───────────────
    # Solo actúa cuando data_quality != "none" y confianza del perfil es suficiente.
    # No sobreescribe decisiones de red_zone ni taper (esas tienen returns propios).
    if data_quality != "none":
        recommended = _apply_capacity_profile(
            ctx.capacity_profile, recommended, reasons, season,
            ctx.distance_category, ctx.athlete_level,
        )

    # ── Borderline gap detection ──────────────────────────────────────────────
    borderline = False
    borderline_note = ""
    _sig  = significant_gap
    _mod  = moderate_gap
    _tol_sig = 0.15 if ctx.metric_type != "power_watts" else 5.0
    _tol_mod = 0.10 if ctx.metric_type != "power_watts" else 3.0
    _gap_ref = lt2_gap if lt2_gap is not None else lt1_gap
    if _gap_ref is not None:
        if abs(_gap_ref - _sig) <= _tol_sig:
            borderline = True
            borderline_note = (
                f"Gap ({_gap_ref:+.2f} {metric_label}) muy cerca del umbral significativo "
                f"({_sig} {metric_label} ±{_tol_sig}). Un test limpio podría cambiar el bloque."
            )
        elif abs(_gap_ref - _mod) <= _tol_mod:
            borderline = True
            borderline_note = (
                f"Gap ({_gap_ref:+.2f} {metric_label}) en zona de transición "
                f"entre 'aceptable' y 'necesita trabajo' ({_mod} {metric_label} ±{_tol_mod})."
            )

    # P5a: advertencia si el bloque requiere más semanas de las disponibles
    # Olbrecht: adaptaciones estructurales de AEC requieren ≥5 semanas; AEP ≥3 semanas
    _min_weeks = MIN_WEEKS_FOR_BLOCK.get(recommended, 0)
    if (
        _min_weeks > 0
        and ctx.weeks_to_goal is not None
        and ctx.weeks_to_goal < _min_weeks + 2
        and recommended not in {"competition_specific_block", "recovery_consolidation_block", "testing_decision_block"}
    ):
        contra.append(
            f"'{recommended}' necesita ≥{_min_weeks} semanas para adaptación estructural (Olbrecht). "
            f"Con {ctx.weeks_to_goal}s al objetivo, el margen es muy ajustado — "
            "considera reducir el alcance o acortar el bloque."
        )

    # ── Warnings de fiabilidad ────────────────────────────────────────────────
    try:
        from app.services.block_rationale import generate_reliability_warnings
        _result_tmp = PhysiologicalGapResult(
            primary_limiter=primary_limiter,
            lt2_gap_kmh=lt2_gap, lt1_gap_kmh=lt1_gap,
            required_lt2_kmh=required_lt2, required_lt1_kmh=required_lt1,
            metric_type=ctx.metric_type, season_phase=season,
            data_quality=data_quality, recommended_block=recommended,
            reasons=reasons, contraindications=contra,
            borderline=borderline, borderline_note=borderline_note,
        )
        reliability_warnings = generate_reliability_warnings(ctx, _result_tmp)
    except Exception:
        reliability_warnings = []

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
        warnings=reliability_warnings,
        borderline=borderline,
        borderline_note=borderline_note,
    )
