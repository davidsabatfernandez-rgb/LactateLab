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
    # Sprint (~1h total): fatiga acumulada mínima; run degrades ~2% vs bike (Hausswirth 2013)
    "sprint_tri":  {"recreational": 0.89, "trained": 0.94, "competitive": 0.99},
    "sprint_run":  {"recreational": 0.89, "trained": 0.94, "competitive": 0.99},
    "sprint_bike": {"recreational": 0.91, "trained": 0.96, "competitive": 1.01},
    # Olímpico (~2h): run degrades ~3% more than bike due to accumulated fatigue
    "olympic_tri":  {"recreational": 0.84, "trained": 0.90, "competitive": 0.95},
    "olympic_run":  {"recreational": 0.84, "trained": 0.90, "competitive": 0.95},
    "olympic_bike": {"recreational": 0.87, "trained": 0.93, "competitive": 0.98},
    # 70.3 (~4-5h): penalización ~8-10%; Hausswirth 2013: ~89% LT2 trained
    "70.3":      {"recreational": 0.82, "trained": 0.89, "competitive": 0.94},
    "half_tri":  {"recreational": 0.82, "trained": 0.89, "competitive": 0.94},
    "half_run":  {"recreational": 0.80, "trained": 0.87, "competitive": 0.93},
    "half_bike": {"recreational": 0.79, "trained": 0.85, "competitive": 0.91},
    # Ironman (~8-17h): penalización máxima; run leg bien por debajo del LT2 standalone
    # Laursen 2002, Hausswirth 2013: ironman run ≈ 72-76% LT2 (trained), 78-82% (competitive)
    "ironman":     {"recreational": 0.68, "trained": 0.74, "competitive": 0.80},
    "ironman_run": {"recreational": 0.68, "trained": 0.74, "competitive": 0.80},
    # Ironman bike: Hausswirth 2013 — bike leg ≈ 73% LT2 (trained), 79% (competitive)
    "ironman_bike": {"recreational": 0.67, "trained": 0.73, "competitive": 0.79},
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
    "ironman":   {"recreational": 0.82, "trained": 0.85, "competitive": 0.97},
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

# I3 — Eventos largos donde ANC aplica cuando hay estancamiento crónico.
# Olbrecht SoW: "Even distance athletes with very low VLamax may need
# anaerobic capacity work to break through plateaus — the glycolytic
# system acts as a 'spark plug' for aerobic adaptations."
_ANC_STAGNATION_EVENTS: frozenset[str] = frozenset({
    "hm", "marathon", "70.3", "ironman",
    "granfondo", "road_tt_long", "road_tt_medium",
    "open_water_long",
    "olympic_tri", "olympic_run", "olympic_bike",
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

    Nuevo (2026-03-13): VO2max estimado via Swain+ACSM (HR-based) y fractional
    utilization (%VO2max al que se encuentra LT2). Permite diferenciar atletas
    con mismos umbrales pero distinto techo aeróbico.
    """

    aerobic_level: str           # "high" | "moderate" | "low" | "unknown"
    vlamax_level: str            # "high" | "moderate" | "low" | "unknown"
    confidence: float            # 0.0–1.0
    source: str                  # "real" | "basic" | "interpolated" | "insufficient"
    lt1_lt2_ratio: Optional[float]  # ratio LT1/LT2 (transparencia)
    # ── VO2max y fractional utilization (Swain + ACSM) ────────────────────
    vo2max_estimated: Optional[float] = None       # ml/kg/min
    vo2max_source: Optional[str] = None            # "swain_hr" | "garmin" | "manual" | None
    vo2max_confidence: float = 0.0                 # 0.0–1.0
    fractional_utilization: Optional[float] = None # LT2 como % de VO2max (0.0–1.0)


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
    raw_curve_points: Optional[list[dict]] = None
    capacity_profile: Optional[CapacityProfile] = None
    # I2 — Estancamiento crónico: True si ≥3 tests con <5% mejora en LT2
    stagnation_detected: bool = False
    stagnation_tests_count: int = 0


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


def _season_phase(weeks_to_goal: Optional[int], athlete_level: str = "trained") -> str:
    """Devuelve la fase de temporada según semanas al objetivo y nivel del atleta.

    Boundaries adaptativas (Olbrecht SoW):
    - Recreational: base más largo (+4s), specific más largo — necesitan más
      tiempo de construcción aeróbica antes de intensificar.
    - Competitive: base más corto (-2s), transiciones más rápidas — ya tienen
      base aeróbica consolidada y pueden intensificar antes.
    - Trained: boundaries estándar (default).

    base_early: construcción de base — prioridad capacidad aeróbica.
    base_late: final del base — puede empezar a mover LT2 si la base acompaña.
    specific: trabajo de umbral y potencia.
    pre_comp: afinado y transferencia.
    taper (<3s): mantener, reducir volumen.
    """
    if weeks_to_goal is None:
        return "base_early"

    # Boundaries: (base_early/base_late, base_late/specific, specific/pre_comp, pre_comp/taper)
    if athlete_level == "recreational":
        boundaries = (32, 23, 14, 3)
    elif athlete_level == "competitive":
        boundaries = (26, 18, 10, 3)
    else:  # trained (default)
        boundaries = (28, 20, 12, 3)

    if weeks_to_goal > boundaries[0]:
        return "base_early"
    if weeks_to_goal > boundaries[1]:
        return "base_late"
    if weeks_to_goal > boundaries[2]:
        return "specific"
    if weeks_to_goal > boundaries[3]:
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
    dynamic_thresholds: Optional[dict[str, Any]] = None,
) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float], float, float, Optional[int]]:
    """Extrae LT1 y LT2 en km/h desde el payload de analytics.

    Jerarquía de fuentes (en orden de confianza):
    1. LT real detectado (real_thresholds) — mayor calidad.
    2. LT básico detectado (thresholds) — calidad media.
    2.5 Modelo dinámico multi-sesión (reference_2mmol / reference_4mmol) — mejora
        la sensibilidad a progresión entre pasos discretos (Faude 2009).
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

    # ── Prioridad 2.5: modelo dinámico multi-sesión ───────────────────────
    # El modelo dinámico integra múltiples sesiones con ponderación por recencia
    # (half-life 18d) y detecta mejoras sub-paso que la detección per-sesión
    # no captura por la discretización de ritmos/potencias.
    # Usamos el modelo agudo (10d) que refleja la forma reciente.
    # Solo se usa cuando per-session no detectó o cuando el dinámico muestra
    # una mejora (threshold más alto = atleta más rápido a mismo lactato).
    if dynamic_thresholds:
        dyn_acute = dynamic_thresholds.get("acute") or {}
        dyn_reliability = dyn_acute.get("reliability_score", 0)
        if dyn_reliability >= 0.45:
            # ref_2mmol → proxy LT1, ref_4mmol → proxy LT2
            ref_2 = dyn_acute.get("reference_2mmol") or {}
            ref_4 = dyn_acute.get("reference_4mmol") or {}
            dyn_lt1_kmh = ref_2.get("estimated_speed_kph")
            dyn_lt2_kmh = ref_4.get("estimated_speed_kph")
            dyn_lt1_power = ref_2.get("estimated_power_watts")
            dyn_lt2_power = ref_4.get("estimated_power_watts")
            dyn_conf = min(0.70, round(0.40 + dyn_reliability * 0.35, 2))

            # Rellenar huecos (per-session no detectó)
            if lt1_kmh is None and isinstance(dyn_lt1_kmh, (int, float)) and dyn_lt1_kmh > 0:
                lt1_kmh = round(dyn_lt1_kmh, 3)
                lt1_conf = max(lt1_conf, dyn_conf)
            if lt2_kmh is None and isinstance(dyn_lt2_kmh, (int, float)) and dyn_lt2_kmh > 0:
                lt2_kmh = round(dyn_lt2_kmh, 3)
                lt2_conf = max(lt2_conf, dyn_conf)
            if lt1_power_watts is None and isinstance(dyn_lt1_power, (int, float)) and dyn_lt1_power > 0:
                lt1_power_watts = float(dyn_lt1_power)
                lt1_conf = max(lt1_conf, dyn_conf)
            if lt2_power_watts is None and isinstance(dyn_lt2_power, (int, float)) and dyn_lt2_power > 0:
                lt2_power_watts = float(dyn_lt2_power)
                lt2_conf = max(lt2_conf, dyn_conf)

            # Mejora detectada: si el modelo dinámico muestra un umbral MEJOR
            # (mayor velocidad o potencia al mismo lactato) que el per-sesión,
            # blend hacia el valor dinámico para capturar la progresión.
            # Peso del dinámico: 40% (conservador, Faude 2009: no sobrerreaccionar).
            _DYN_BLEND = 0.40
            if lt1_kmh is not None and isinstance(dyn_lt1_kmh, (int, float)) and dyn_lt1_kmh > lt1_kmh:
                lt1_kmh = round(lt1_kmh * (1 - _DYN_BLEND) + dyn_lt1_kmh * _DYN_BLEND, 3)
            if lt2_kmh is not None and isinstance(dyn_lt2_kmh, (int, float)) and dyn_lt2_kmh > lt2_kmh:
                lt2_kmh = round(lt2_kmh * (1 - _DYN_BLEND) + dyn_lt2_kmh * _DYN_BLEND, 3)
            if lt1_power_watts is not None and isinstance(dyn_lt1_power, (int, float)) and dyn_lt1_power > lt1_power_watts:
                lt1_power_watts = round(lt1_power_watts * (1 - _DYN_BLEND) + dyn_lt1_power * _DYN_BLEND, 1)
            if lt2_power_watts is not None and isinstance(dyn_lt2_power, (int, float)) and dyn_lt2_power > lt2_power_watts:
                lt2_power_watts = round(lt2_power_watts * (1 - _DYN_BLEND) + dyn_lt2_power * _DYN_BLEND, 1)

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


# ── VO2max estimation via Swain+ACSM ──────────────────────────────────────
# References:
#   - Swain & Leutholtz (1997): %HRR ≈ %VO2R
#   - ACSM metabolic equations: running VO2 = 0.2×speed(m/min) + 3.5
#     cycling VO2 = (power×10.8/weight) + 7
#   - Faude et al. (2009): LT2 at 75-90% VO2max depending on training level

_VO2_REST = 3.5  # ml/kg/min — resting VO2

# Plausibility bounds for estimated VO2max (ml/kg/min)
_VO2MAX_FLOOR = 25.0
_VO2MAX_CEILING = 90.0
_FRACTIONAL_FLOOR = 0.55   # LT2 < 55% VO2max is implausible
_FRACTIONAL_CEILING = 0.98  # LT2 > 98% VO2max is implausible


def _estimate_vo2_at_intensity_running(speed_kmh: float) -> float:
    """VO2 at a given running speed (ACSM metabolic equation, flat ground).

    NOTE: We intentionally use ACSM here (not Daniels quadratic used in
    prediction_engine.py) because Swain's %HRR≈%VO2R was validated with
    ACSM equations. The ~5-8% difference at typical LT2 speeds is absorbed
    by the fractional utilization calculation (VO2@LT2 / VO2max), which
    uses the same equation in both numerator and denominator.

    Returns ml/kg/min.
    """
    speed_m_per_min = speed_kmh * 1000.0 / 60.0
    return 0.2 * speed_m_per_min + _VO2_REST


def _estimate_vo2_at_intensity_cycling(power_watts: float, weight_kg: float) -> float:
    """VO2 at a given cycling power (ACSM leg ergometer equation).

    Returns ml/kg/min.
    """
    return (power_watts * 10.8 / weight_kg) + 7.0


def estimate_vo2max_swain(
    *,
    lt2_speed_kmh: Optional[float] = None,
    lt2_power_watts: Optional[float] = None,
    lt2_heart_rate: Optional[int] = None,
    hr_max: Optional[int] = None,
    hr_rest: Optional[int] = None,
    weight_kg: Optional[float] = None,
    discipline: str = "running",
) -> tuple[Optional[float], Optional[float], float]:
    """Estimate VO2max using Swain's %HRR ≈ %VO2R equivalence + ACSM equations.

    Returns:
        (vo2max_ml_kg_min, fractional_utilization, confidence)
        Any can be None if insufficient data.
    """
    # Need HR at LT2, HR max, and HR rest
    if lt2_heart_rate is None or hr_max is None or hr_rest is None:
        return None, None, 0.0

    # Sanity checks on HR values
    if hr_max <= hr_rest or lt2_heart_rate <= hr_rest or lt2_heart_rate >= hr_max:
        return None, None, 0.0

    # Calculate %HRR at LT2
    hrr_fraction = (lt2_heart_rate - hr_rest) / (hr_max - hr_rest)

    # %HRR ≈ %VO2R (Swain equivalence)
    # %VO2R = (VO2_LT2 - VO2rest) / (VO2max - VO2rest)
    # Solving: VO2max = (VO2_LT2 - VO2rest) / %VO2R + VO2rest

    # Calculate VO2 at LT2 intensity
    if discipline == "ciclismo" and lt2_power_watts is not None and weight_kg:
        vo2_at_lt2 = _estimate_vo2_at_intensity_cycling(lt2_power_watts, weight_kg)
    elif lt2_speed_kmh is not None and lt2_speed_kmh > 0:
        vo2_at_lt2 = _estimate_vo2_at_intensity_running(lt2_speed_kmh)
    else:
        return None, None, 0.0

    if hrr_fraction < 0.40:
        # LT2 at <40% HRR is physiologically implausible
        return None, None, 0.0

    vo2max = (vo2_at_lt2 - _VO2_REST) / hrr_fraction + _VO2_REST

    # Plausibility check
    if vo2max < _VO2MAX_FLOOR or vo2max > _VO2MAX_CEILING:
        return None, None, 0.0

    fractional = vo2_at_lt2 / vo2max
    if fractional < _FRACTIONAL_FLOOR or fractional > _FRACTIONAL_CEILING:
        return None, None, 0.0

    # Confidence based on data quality
    # Higher confidence when HR spread is wider (more signal)
    hr_spread = (hr_max - hr_rest)
    spread_conf = min(hr_spread / 100.0, 1.0)  # 100+ bpm spread → max confidence
    conf = round(0.55 + 0.20 * spread_conf, 3)  # range: 0.55–0.75

    return round(vo2max, 1), round(fractional, 3), conf


def build_capacity_profile(
    lt1_value: Optional[float],
    lt2_value: Optional[float],
    lt1_conf: float,
    lt2_conf: float,
    athlete_level: str,
    discipline: str,
    metric_type: str,
    *,
    lt2_speed_kmh: Optional[float] = None,
    lt2_power_watts: Optional[float] = None,
    lt2_heart_rate: Optional[int] = None,
    hr_max: Optional[int] = None,
    hr_rest: Optional[int] = None,
    weight_kg: Optional[float] = None,
    garmin_vo2max: Optional[float] = None,
    measured_vlamax: Optional[dict] = None,
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

    # ── VLamax: prefer measured (Mader sprint) over ratio proxy ────────
    ratio = lt1_value / lt2_value

    if measured_vlamax and measured_vlamax.get("vlamax_mmol_min"):
        # Direct measurement from sprint test — highest confidence
        mv = measured_vlamax["vlamax_mmol_min"]
        if mv > 0.50:
            vlamax_level = "high"
        elif mv >= 0.30:
            vlamax_level = "moderate"
        else:
            vlamax_level = "low"
        # Boost confidence when we have a measured value
        base_conf = min(base_conf + 0.10, 0.95)
    else:
        # Proxy VLamax from ratio LT1/LT2 crossed with aerobic level
        if ratio < _VLAMAX_HIGH_RATIO:
            raw_vlamax = "high"
        elif ratio < _VLAMAX_MODERATE_RATIO:
            raw_vlamax = "moderate"
        else:
            raw_vlamax = "low"

        # Corrección por nivel absoluto: sin motor aeróbico real, el ratio
        # no puede diagnosticar el perfil glucolítico con fiabilidad.
        if aerobic_level == "low":
            if raw_vlamax == "low":
                vlamax_level = "moderate"
            elif raw_vlamax == "high":
                vlamax_level = "moderate"
            else:
                vlamax_level = raw_vlamax
        else:
            vlamax_level = raw_vlamax

    # ── VO2max estimation (Swain+ACSM) ──────────────────────────────────
    # Hierarchy: (1) Swain HR-based, (2) Garmin VO2max, (3) None
    vo2max_est: Optional[float] = None
    vo2max_src: Optional[str] = None
    vo2max_conf = 0.0
    frac_util: Optional[float] = None

    swain_vo2, swain_frac, swain_conf = estimate_vo2max_swain(
        lt2_speed_kmh=lt2_speed_kmh,
        lt2_power_watts=lt2_power_watts,
        lt2_heart_rate=lt2_heart_rate,
        hr_max=hr_max,
        hr_rest=hr_rest,
        weight_kg=weight_kg,
        discipline=discipline,
    )
    if swain_vo2 is not None:
        vo2max_est = swain_vo2
        vo2max_src = "swain_hr"
        vo2max_conf = swain_conf
        frac_util = swain_frac
    elif garmin_vo2max is not None and _VO2MAX_FLOOR <= garmin_vo2max <= _VO2MAX_CEILING:
        vo2max_est = round(garmin_vo2max, 1)
        vo2max_src = "garmin"
        vo2max_conf = 0.50
        # Compute fractional utilization from Garmin VO2max
        if discipline == "ciclismo" and lt2_power_watts and weight_kg:
            vo2_at_lt2 = _estimate_vo2_at_intensity_cycling(lt2_power_watts, weight_kg)
        elif lt2_speed_kmh and lt2_speed_kmh > 0:
            vo2_at_lt2 = _estimate_vo2_at_intensity_running(lt2_speed_kmh)
        else:
            vo2_at_lt2 = None
        if vo2_at_lt2 is not None and garmin_vo2max > 0:
            frac_util = round(vo2_at_lt2 / garmin_vo2max, 3)
            if not (_FRACTIONAL_FLOOR <= frac_util <= _FRACTIONAL_CEILING):
                frac_util = None  # implausible

    return CapacityProfile(
        aerobic_level=aerobic_level,
        vlamax_level=vlamax_level,
        confidence=round(base_conf, 3),
        source=source,
        lt1_lt2_ratio=round(ratio, 3),
        vo2max_estimated=vo2max_est,
        vo2max_source=vo2max_src,
        vo2max_confidence=vo2max_conf,
        fractional_utilization=frac_util,
    )


@dataclass
class LevelSuggestion:
    """Sugerencia automática de nivel del atleta basada en datos fisiológicos."""
    suggested_level: str              # "recreational" | "trained" | "competitive"
    confidence: float                 # 0.0–1.0
    current_level: str                # nivel actual asignado
    matches_current: bool             # ¿coincide con el actual?
    evidence: list[str]               # razones que soportan la sugerencia
    scores: dict[str, float]          # puntuación por nivel {"recreational": 0.2, ...}


# ── VO2max benchmarks por nivel (Joyner 2008, Jones 2021) ───────────────
_VO2MAX_LEVEL_BENCHMARKS: dict[str, dict[str, tuple[float, float]]] = {
    "male": {
        "recreational": (35.0, 50.0),
        "trained":      (48.0, 62.0),
        "competitive":  (60.0, 82.0),
    },
    "female": {
        "recreational": (28.0, 42.0),
        "trained":      (40.0, 54.0),
        "competitive":  (52.0, 72.0),
    },
}


def suggest_athlete_level(
    lt2_values: dict[str, Optional[float]],
    vo2max: Optional[float] = None,
    lt1_lt2_ratio: Optional[float] = None,
    fractional_utilization: Optional[float] = None,
    sex: str = "male",
) -> LevelSuggestion:
    """Sugiere el nivel del atleta comparando LT2 contra benchmarks de TODOS los niveles.

    Parámetros:
        lt2_values: {"running": km/h, "ciclismo": W, "natacion": km/h} — None si no hay dato
        vo2max: ml/kg/min estimado (Swain, Garmin, o manual)
        lt1_lt2_ratio: ratio LT1/LT2 (proxy VLamax)
        fractional_utilization: %VO2max al LT2
        sex: "male" | "female" — para benchmarks VO2max

    Lógica:
        Para cada disciplina con dato, calcula dónde cae el LT2 respecto a los rangos
        de cada nivel. Usa media geométrica ponderada para combinar disciplinas.
        VO2max, ratio y fractional utilization son señales complementarias.

    Referencias:
        - Billat 2003: LT2 benchmarks running
        - Coggan 2019: FTP benchmarks ciclismo
        - Joyner 2008, Jones 2021: VO2max por nivel
        - Faude 2009: umbral como predictor de rendimiento
    """
    levels = ["recreational", "trained", "competitive"]
    scores: dict[str, float] = {l: 0.0 for l in levels}
    total_weight = 0.0
    evidence: list[str] = []

    # ── Señal 1: LT2 por disciplina (peso principal) ────────────────────
    for disc, lt2_val in lt2_values.items():
        if lt2_val is None or disc not in LT2_AEROBIC_BENCHMARKS:
            continue
        disc_benchmarks = LT2_AEROBIC_BENCHMARKS[disc]
        disc_scores: dict[str, float] = {}
        for level in levels:
            low, high = disc_benchmarks[level]
            mid = (low + high) / 2.0
            span = (high - low) / 2.0
            # Gaussian-like scoring: how close to the center of each level's range
            dist = abs(lt2_val - mid) / max(span, 0.01)
            disc_scores[level] = max(0.0, 1.0 - 0.5 * dist * dist)

        # Normalizar para que sumen 1.0
        s_total = sum(disc_scores.values())
        if s_total > 0:
            for level in levels:
                disc_scores[level] /= s_total

        w = 1.0  # peso por disciplina
        for level in levels:
            scores[level] += disc_scores[level] * w
        total_weight += w

        best_disc = max(disc_scores, key=disc_scores.get)  # type: ignore[arg-type]
        evidence.append(f"LT2 {disc} ({lt2_val:.1f}) → {best_disc} ({disc_scores[best_disc]:.0%})")

    # ── Señal 2: VO2max (peso 0.6) ──────────────────────────────────────
    if vo2max is not None:
        sex_key = sex if sex in _VO2MAX_LEVEL_BENCHMARKS else "male"
        vo2_benchmarks = _VO2MAX_LEVEL_BENCHMARKS[sex_key]
        vo2_scores: dict[str, float] = {}
        for level in levels:
            low, high = vo2_benchmarks[level]
            mid = (low + high) / 2.0
            span = (high - low) / 2.0
            dist = abs(vo2max - mid) / max(span, 0.01)
            vo2_scores[level] = max(0.0, 1.0 - 0.5 * dist * dist)
        s_total = sum(vo2_scores.values())
        if s_total > 0:
            for level in levels:
                vo2_scores[level] /= s_total
        w = 0.6
        for level in levels:
            scores[level] += vo2_scores[level] * w
        total_weight += w
        best_vo2 = max(vo2_scores, key=vo2_scores.get)  # type: ignore[arg-type]
        evidence.append(f"VO2max ({vo2max:.1f}) → {best_vo2} ({vo2_scores[best_vo2]:.0%})")

    # ── Señal 3: Fractional utilization (peso 0.3) ───────────────────────
    # Alta utilización fraccionaria (>80%) sugiere entrenamiento sostenido → trained/competitive
    # Baja (<70%) sugiere potencial sin desarrollar → recreational o competitive-genética
    if fractional_utilization is not None and 0.5 <= fractional_utilization <= 1.0:
        w = 0.3
        if fractional_utilization >= 0.82:
            # Alto %VO2max al LT2 → entrenado o competitivo
            frac_scores = {"recreational": 0.05, "trained": 0.45, "competitive": 0.50}
        elif fractional_utilization >= 0.72:
            frac_scores = {"recreational": 0.20, "trained": 0.60, "competitive": 0.20}
        else:
            frac_scores = {"recreational": 0.55, "trained": 0.35, "competitive": 0.10}
        for level in levels:
            scores[level] += frac_scores[level] * w
        total_weight += w
        evidence.append(f"Frac. util. ({fractional_utilization:.0%}) → {max(frac_scores, key=frac_scores.get)}")  # type: ignore[arg-type]

    # ── Señal 4: Ratio LT1/LT2 como proxy de madurez (peso 0.2) ────────
    # Ratio alto (>0.87) = motor maduro, bien entrenado
    # Ratio bajo (<0.75) = separación grande, menos entrenamiento aeróbico
    if lt1_lt2_ratio is not None and 0.50 <= lt1_lt2_ratio <= 1.0:
        w = 0.2
        if lt1_lt2_ratio >= 0.87:
            ratio_scores = {"recreational": 0.05, "trained": 0.35, "competitive": 0.60}
        elif lt1_lt2_ratio >= 0.79:
            ratio_scores = {"recreational": 0.15, "trained": 0.60, "competitive": 0.25}
        else:
            ratio_scores = {"recreational": 0.50, "trained": 0.35, "competitive": 0.15}
        for level in levels:
            scores[level] += ratio_scores[level] * w
        total_weight += w
        evidence.append(f"LT1/LT2 ratio ({lt1_lt2_ratio:.3f}) → {max(ratio_scores, key=ratio_scores.get)}")  # type: ignore[arg-type]

    # ── Normalizar y decidir ─────────────────────────────────────────────
    if total_weight == 0:
        return LevelSuggestion(
            suggested_level="trained",
            confidence=0.0,
            current_level="trained",
            matches_current=True,
            evidence=["Sin datos suficientes para sugerir nivel"],
            scores=scores,
        )

    for level in levels:
        scores[level] /= total_weight
    scores = {l: round(s, 3) for l, s in scores.items()}

    suggested = max(scores, key=scores.get)  # type: ignore[arg-type]
    # Confianza = margen sobre el segundo
    sorted_scores = sorted(scores.values(), reverse=True)
    margin = sorted_scores[0] - sorted_scores[1] if len(sorted_scores) > 1 else 1.0
    # Escalar: margen 0.0→conf 0.3, margen 0.5+→conf 0.95
    confidence = min(0.95, 0.30 + margin * 1.3)
    confidence = round(confidence, 2)

    return LevelSuggestion(
        suggested_level=suggested,
        confidence=confidence,
        current_level="trained",  # se sobreescribe en el caller
        matches_current=True,     # se sobreescribe en el caller
        evidence=evidence,
        scores=scores,
    )


def _apply_capacity_profile(
    profile: Optional[CapacityProfile],
    recommended: str,
    reasons: list[str],
    season: str = "base_early",
    distance_category: Optional[str] = None,
    athlete_level: str = "trained",
    stagnation_detected: bool = False,
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
                elif (
                    stagnation_detected
                    and season in {"base_late", "specific"}
                    and dist in _ANC_STAGNATION_EVENTS
                    and athlete_level in {"trained", "competitive"}
                ):
                    # I3 — ANC para eventos largos con estancamiento crónico.
                    # Olbrecht SoW: el sistema glucolítico actúa como "chispa"
                    # para desbloquear adaptaciones aeróbicas estancadas.
                    # Solo cuando hay evidencia de plateau (≥3 tests sin mejora).
                    reasons.append(
                        f"Estancamiento crónico detectado en perfil diesel (ratio={ratio_str}). "
                        f"Evento largo ({dist}) pero la glucólisis baja limita las adaptaciones "
                        "aeróbicas. ANC como estímulo de desbloqueo (Olbrecht: 'spark plug')."
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
                elif (
                    season in {"specific", "pre_comp"}
                    and recommended == "aerobic_capacity_block"
                    and not any("glucolít" in r or "subumbral" in r or "soporte" in r
                                or "LT1 actual" in r or "Thin ice" in r for r in reasons)
                ):
                    # S2: moderate aeróbico + VLamax baja en specific/pre_comp donde el gap
                    # analysis dio AEC por fallthrough conservador → la base ya se construyó,
                    # AEP tiene mejor retorno que volver a hacer capacidad aeróbica.
                    # No aplica si AEC fue prescrito por razones específicas (high glycolytic,
                    # LT1 red zone, soporte subumbral insuficiente).
                    reasons.append(
                        f"Perfil diesel (ratio={ratio_str}) en fase {season}: capacidad aeróbica "
                        "moderada ya construida — potencia aeróbica (AEP) para transferir al gesto."
                    )
                    return "aerobic_power_block"
                else:
                    # moderate aeróbico + VLamax baja en base: el gap de LT2 sigue mandando
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

        # ── Fractional utilization: diferenciar atletas con mismos umbrales ──
        # Un atleta con LT2 a >85% de su VO2max está "exprimido" — necesita
        # subir el techo antes de empujar umbrales (AEP/VO2max blocks).
        # Un atleta con LT2 a <75% tiene margen para empujar umbrales (THR).
        # Solo aplica si tenemos VO2max independiente (no derivado del LT2).
        frac = profile.fractional_utilization
        if frac is not None and profile.vo2max_confidence >= 0.50:
            frac_pct = f"{frac:.0%}"
            vo2_str = f"{profile.vo2max_estimated:.0f}" if profile.vo2max_estimated else "?"

            if frac > 0.85 and season not in {"base_early", "taper"}:
                # Athlete "exprimido": LT2 close to ceiling — raise ceiling first.
                # EXCEPCIÓN: en eventos de larga duración (ironman, marathon, granfondo...)
                # la alta utilización fraccionaria con VO2max bajo refleja base aeróbica
                # insuficiente, no un techo que subir con AEP. AEC es la vía correcta:
                # más volumen subumbral sube VO2max Y LT1 simultáneamente.
                # Seiler 2010, Esteve-Lanao 2005: alto volumen Z1-Z2 es el predictor
                # principal de VO2max en endurance athletes, no la intensidad.
                _long_events = {
                    "marathon", "70.3", "half_tri", "half_run", "half_bike",
                    "ironman", "ironman_run", "ironman_bike", "open_water_long",
                    "granfondo", "road_tt_long",
                }
                if recommended in ("threshold_development_block", "aerobic_capacity_block"):
                    if (distance_category or "") in _long_events:
                        reasons.append(
                            f"Fractional utilization alta ({frac_pct}, VO2max≈{vo2_str} ml/kg/min vía {profile.vo2max_source}): "
                            "en prueba larga, un techo bajo con alta utilización indica base aeróbica "
                            "insuficiente — AEC sube VO2max Y LT1 simultáneamente "
                            "(Seiler 2010, Esteve-Lanao 2005)."
                        )
                        # Do NOT override to AEP — keep AEC
                    else:
                        reasons.append(
                            f"Fractional utilization alta ({frac_pct}, VO2max≈{vo2_str} ml/kg/min vía {profile.vo2max_source}): "
                            "LT2 está cerca del techo aeróbico — prioridad subir VO2max con "
                            "potencia aeróbica (AEP) antes de empujar umbral."
                        )
                        return "aerobic_power_block"

            elif frac < 0.75 and season not in {"base_early", "taper"}:
                # Athlete with headroom: can push thresholds directly
                if recommended == "aerobic_power_block":
                    reasons.append(
                        f"Fractional utilization baja ({frac_pct}, VO2max≈{vo2_str} ml/kg/min vía {profile.vo2max_source}): "
                        "amplio margen entre LT2 y techo — el umbral es el limitante, "
                        "THR tiene mejor retorno que subir VO2max."
                    )
                    return "threshold_development_block"

            # Add informational context even when not changing block
            reasons.append(
                f"VO2max≈{vo2_str} ml/kg/min ({profile.vo2max_source}), "
                f"LT2 al {frac_pct} del techo aeróbico."
            )

    # ── Confianza media: solo contexto, sin cambio de bloque ─────────────
    frac = profile.fractional_utilization
    if frac is not None and profile.vo2max_confidence >= 0.50:
        vo2_str = f"{profile.vo2max_estimated:.0f}" if profile.vo2max_estimated else "?"
        reasons.append(
            f"Perfil orientativo (ratio LT1/LT2={ratio_str}, "
            f"VO2max≈{vo2_str} ml/kg/min, LT2 al {frac:.0%} del techo): "
            f"aeróbico {aerobic} / VLamax {vlamax}. "
            f"Confianza {profile.confidence:.0%} — confirmar con más tests."
        )
    else:
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
    dynamic_thresholds: Optional[dict[str, Any]] = None,
    *,
    lt2_heart_rate: Optional[int] = None,
    hr_max: Optional[int] = None,
    hr_rest: Optional[int] = None,
    weight_kg: Optional[float] = None,
    garmin_vo2max: Optional[float] = None,
    measured_vlamax: Optional[dict] = None,
) -> PhysiologicalContext:
    """Construye el contexto fisiológico para la selección de mesociclo.

    Si LT1/LT2 no se detectaron automáticamente pero hay puntos de curva crudos,
    se interpolan a los anclajes fisiológicos 2.0 mmol (LT1) y 4.0 mmol (LT2).

    Cuando dynamic_thresholds está disponible (modelo multi-sesión), se usa
    como fuente intermedia para capturar mejoras sub-paso (Faude 2009).
    """
    lt1_kmh, lt2_kmh, lt1_power_watts, lt2_power_watts, lt1_conf, lt2_conf, test_age = _extract_lt_from_analysis(
        analysis, discipline, raw_curve_points=raw_curve_points,
        dynamic_thresholds=dynamic_thresholds,
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
        lt2_speed_kmh=lt2_kmh,
        lt2_power_watts=lt2_power_watts,
        lt2_heart_rate=lt2_heart_rate,
        hr_max=hr_max,
        hr_rest=hr_rest,
        weight_kg=weight_kg,
        garmin_vo2max=garmin_vo2max,
        measured_vlamax=measured_vlamax,
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
        raw_curve_points=raw_curve_points,
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
    season = _season_phase(ctx.weeks_to_goal, athlete_level=ctx.athlete_level)
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

    # S3: detector de curva plana / protocolo posiblemente insuficiente
    # Si LT2 y LT1 están muy juntos en velocidad/potencia, la curva es sospechosamente
    # plana — probablemente el protocolo de test no cubrió suficiente rango de intensidades.
    if has_lt2 and has_lt1 and lt1_value is not None and lt2_value is not None:
        _lt_spread = abs(lt2_value - lt1_value)
        if ctx.metric_type == "power_watts":
            _flat_threshold = 10.0  # < 10W entre LT1 y LT2
        else:
            _flat_threshold = 0.5   # < 0.5 km/h entre LT1 y LT2
        if _lt_spread < _flat_threshold:
            data_quality = "low"
            contra.append(
                f"Curva plana: LT1 y LT2 separados solo {_lt_spread:.1f} {metric_label} "
                f"(mínimo esperado: {_flat_threshold} {metric_label}). "
                "Protocolo posiblemente insuficiente — verificar que el test cubrió suficiente "
                "rango de intensidades y que los escalones fueron ≥3 min."
            )

    # D3: detector de rango de test insuficiente desde puntos crudos de curva
    # Si el rango total de lactato medido es < 1.5 mmol, el test probablemente
    # no subió suficiente intensidad para observar LT2 real.
    if ctx.raw_curve_points and len(ctx.raw_curve_points) >= 3:
        _lactate_vals = [
            p.get("lactate") or p.get("raw_lactate") or p.get("contextual_lactate")
            for p in ctx.raw_curve_points
        ]
        _lactate_vals = [v for v in _lactate_vals if v is not None]
        if len(_lactate_vals) >= 3:
            _lac_range = max(_lactate_vals) - min(_lactate_vals)
            if _lac_range < 1.5:
                data_quality = "low"
                contra.append(
                    f"Rango de lactato del test muy estrecho ({min(_lactate_vals):.1f}–"
                    f"{max(_lactate_vals):.1f} mmol, rango {_lac_range:.1f} mmol). "
                    "Un test fiable debería cubrir ≥1.5 mmol de rango para identificar "
                    "umbrales con confianza. Verificar protocolo: ¿se alcanzó suficiente intensidad?"
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
        if ctx.peak_lactate_1km >= 10.0 and (dist in long_duration_events or dist == "hm"):
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
    # Gap relativo al LT2 del atleta (~4% pace, ~6% power) con suelo absoluto.
    # Un corredor con LT2@15km/h tiene significant_gap=0.60; uno con LT2@12km/h tiene 0.48.
    # En watts un ciclista con LT2@280W tiene significant_gap=16.8W.
    # Suelos: 0.3 km/h / 10W evitan gaps absurdamente pequeños en atletas muy entrenados.
    if ctx.metric_type == "power_watts":
        _lt2_ref = lt2_value if lt2_value and lt2_value > 0 else 250.0
        significant_gap = max(10.0, round(_lt2_ref * 0.06, 1))
        moderate_gap = max(5.0, round(significant_gap * 0.5, 1))
    else:
        _lt2_ref = lt2_value if lt2_value and lt2_value > 0 else 12.0
        significant_gap = max(0.3, round(_lt2_ref * 0.04, 2))
        moderate_gap = max(0.15, round(significant_gap * 0.5, 2))
    # F4: para eventos donde LT1 ES el limitante primario (no "both"), el atleta compite
    # cerca de LT1 → un gap relativo menor ya es penalización real.
    # Fuente: Coyle 1988 (marathon/LT1); Laursen 2002 (ironman); Olbrecht 2000 (OW long)
    significant_gap_lt1_primary = max(0.25, round(significant_gap * 0.7, 2)) if ctx.metric_type != "power_watts" else max(8.0, round(significant_gap * 0.7, 1))
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
    # lt1_led_flat_profile: atleta diesel (VLamax baja) en evento ultra-largo.
    # LT1 ok + LT2 corto → mover el techo (threshold). Olbrecht: perfil plano necesita LT2.
    # Umbral: moderate_gap (no significant) porque en ironman incluso 0.3 km/h de gap LT2
    # es significativo dado el volumen de carrera del segmento final.
    lt1_led_flat_profile = (
        dist in {"ironman", "ironman_run", "ironman_bike", "open_water_long"}
        and glycolytic_signal == "low_glycolytic"
        and lt2_gap is not None
        and lt2_gap > moderate_gap
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
    # ── AEC como vía indirecta para cerrar LT2 gap en eventos largos ────────
    # Olbrecht (SoW cap 4): en pruebas >2-3h, AEC desplaza la curva de lactato
    # completa hacia la derecha. Subir LT1 comprime el rango LT1→LT2, y el
    # siguiente bloque de THR/AEP tiene más retorno porque parte de una base
    # más alta. Coyle 1988, Laursen 2002 (ironman), Seiler 2010 (polarized
    # training para endurance): alto volumen LT1 es la vía más eficiente cuando
    # el gap LT2 todavía es grande Y la prueba se corre cerca de LT1.
    # Gate: lt1_gap > 0 (hay margen real de mejora en LT1) AND base/specific
    # AND not flat profile (si LT1 ya acompaña y es flat → THR tiene sentido).
    elif (
        lt1_priority
        and dist in long_duration_events
        and lt2_gap is not None and lt2_gap > significant_gap
        and lt1_gap is not None and lt1_gap > 0
        and season in {*_BASE_PHASES, "specific"}
        and not lt1_led_flat_profile
    ):
        recommended = "aerobic_capacity_block"
        reasons.append(
            f"Para {dist}, el LT2 gap ({lt2_gap:+.2f} {metric_label}) es grande, pero hay margen "
            f"de mejora en LT1 ({lt1_gap:+.2f} {metric_label}). Subir LT1 desplaza la curva entera "
            "hacia la derecha — el siguiente bloque de THR/AEP tendrá más retorno partiendo de una base "
            "más alta (Olbrecht SoW; Coyle 1988; Seiler 2010: polarized training para endurance)."
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
            stagnation_detected=ctx.stagnation_detected,
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

    # D1: "too late to close the gap" — gap muy grande + timeline corto
    # Si el gap es > 2× significant_gap y no hay tiempo suficiente para cerrarlo,
    # mejor transferir lo que el atleta ya tiene al gesto de competición.
    _gap_for_d1 = lt2_gap if lt2_priority else lt1_gap
    if (
        _gap_for_d1 is not None
        and _gap_for_d1 > significant_gap * 2
        and ctx.weeks_to_goal is not None
        and recommended in {"aerobic_capacity_block", "threshold_development_block", "anaerobic_capacity_block"}
    ):
        _min_for_gap = MIN_WEEKS_FOR_BLOCK.get(recommended, 4)
        if ctx.weeks_to_goal < _min_for_gap * 1.5:
            _prev_d1 = recommended
            recommended = "competition_specific_block"
            reasons.append(
                f"Override D1: gap muy grande ({_gap_for_d1:+.2f} {metric_label}, "
                f">{significant_gap * 2:.1f} {metric_label}) con solo {ctx.weeks_to_goal}s al objetivo. "
                f"'{_prev_d1}' no puede cerrar este gap a tiempo — transferir lo adquirido a la prueba."
            )

    # P5a+S1: override si el bloque requiere más semanas de las disponibles
    # Olbrecht: adaptaciones estructurales de AEC requieren ≥5 semanas; AEP ≥3 semanas
    # S1: con timeline insuficiente, forzar competition_specific en vez de solo advertir
    _min_weeks = MIN_WEEKS_FOR_BLOCK.get(recommended, 0)
    _development_blocks = {
        "aerobic_capacity_block", "threshold_development_block",
        "anaerobic_capacity_block",
    }
    if (
        _min_weeks > 0
        and ctx.weeks_to_goal is not None
        and ctx.weeks_to_goal < _min_weeks + 2
        and recommended not in {"competition_specific_block", "recovery_consolidation_block", "testing_decision_block"}
    ):
        if recommended in _development_blocks and ctx.weeks_to_goal < _min_weeks:
            # Timeline claramente insuficiente para desarrollo → override a competition_specific
            _prev = recommended
            recommended = "competition_specific_block"
            reasons.append(
                f"Override S1: '{_prev}' necesita ≥{_min_weeks} semanas pero solo quedan {ctx.weeks_to_goal}. "
                "El timeline no permite desarrollo estructural — transferir lo adquirido a la prueba."
            )
        else:
            # Margen ajustado pero posible → solo warning
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


# ── Field-test guard for planning engine ─────────────────────────────────
# Builds PhysiologicalContext + PhysiologicalGapResult from FieldTestSnapshot
# instead of lactate analysis. Used when athlete.threshold_mode == 'field_tests'.
# Blocks ANC/ANP (require VLamax from lactate).

# Allowed blocks for field-test athletes by data availability
_FIELD_TEST_BLOCKS_BOTH = {
    "aerobic_capacity_block",
    "threshold_development_block",
    "aerobic_power_block",
    "competition_specific_block",
}
_FIELD_TEST_BLOCKS_LT1_ONLY = {
    "aerobic_capacity_block",
}


def build_field_test_physio_context(
    snapshot: Any,
    athlete_level: str,
    discipline: str,
    distance_category: Optional[str],
    target_pace_label: Optional[str],
    target_power_watts: Optional[float],
    weeks_to_goal: Optional[int],
) -> PhysiologicalContext:
    """Build PhysiologicalContext from a FieldTestSnapshot (no lactate data).

    The snapshot carries LT1/LT2 pace (sec/km) and HR from field tests.
    Confidence is capped at 0.60 (field tests never reach lactate-level confidence).
    """
    lt1_kmh: Optional[float] = None
    lt2_kmh: Optional[float] = None
    lt1_conf = 0.0
    lt2_conf = 0.0
    test_age: Optional[int] = None

    if snapshot is not None:
        if snapshot.lt1_pace_seconds_per_km and snapshot.lt1_pace_seconds_per_km > 0:
            lt1_kmh = round(3600.0 / snapshot.lt1_pace_seconds_per_km, 3)
            lt1_conf = min(snapshot.lt1_confidence or 0.0, 0.60)
        if snapshot.lt2_pace_seconds_per_km and snapshot.lt2_pace_seconds_per_km > 0:
            lt2_kmh = round(3600.0 / snapshot.lt2_pace_seconds_per_km, 3)
            lt2_conf = min(snapshot.lt2_confidence or 0.0, 0.60)

        # Test age from most recent test date
        from datetime import date as _date
        _today = _date.today()
        _dates = [d for d in [snapshot.lt1_last_test_date, snapshot.lt2_last_test_date] if d]
        if _dates:
            test_age = (_today - max(_dates)).days

    target_kmh = _pace_label_to_kmh(target_pace_label)
    metric_type = "power_watts" if discipline == "ciclismo" and target_power_watts else "pace_kmh" if target_kmh else "none"

    lt1_val = None  # No power data from field tests (running only)
    lt2_val = None
    if metric_type == "pace_kmh":
        lt1_val = lt1_kmh
        lt2_val = lt2_kmh

    capacity_profile = build_capacity_profile(
        lt1_value=lt1_val,
        lt2_value=lt2_val,
        lt1_conf=lt1_conf,
        lt2_conf=lt2_conf,
        athlete_level=athlete_level,
        discipline=discipline,
        metric_type=metric_type,
        lt2_speed_kmh=lt2_kmh,
        lt2_heart_rate=snapshot.lt2_hr if snapshot else None,
    )

    return PhysiologicalContext(
        lt1_kmh=lt1_kmh,
        lt2_kmh=lt2_kmh,
        lt1_power_watts=None,
        lt2_power_watts=None,
        lt1_confidence=lt1_conf,
        lt2_confidence=lt2_conf,
        test_age_days=test_age,
        peak_lactate_1km=None,  # No lactate data
        athlete_level=athlete_level,
        distance_category=distance_category,
        target_pace_kmh=target_kmh,
        target_power_watts=target_power_watts,
        metric_type=metric_type,
        weeks_to_goal=weeks_to_goal,
        raw_curve_points=None,
        capacity_profile=capacity_profile,
    )


def guard_field_test_block(
    gap_result: PhysiologicalGapResult,
    has_lt1: bool,
    has_lt2: bool,
) -> PhysiologicalGapResult:
    """Restrict the recommended block for field-test athletes.

    Rules:
    - ANC/ANP never available (require VLamax from lactate).
    - Without LT2 data → only AEC.
    - Without any data → testing_decision_block (prescribe field tests).
    """
    if not has_lt1 and not has_lt2:
        gap_result.recommended_block = "testing_decision_block"
        gap_result.data_quality = "none"
        gap_result.reasons.append(
            "Sin datos de tests de campo — el atleta necesita realizar "
            "un test de decoupling (LT1) y/o un CRI 30' (LT2)."
        )
        return gap_result

    allowed = _FIELD_TEST_BLOCKS_BOTH if has_lt2 else _FIELD_TEST_BLOCKS_LT1_ONLY

    if gap_result.recommended_block not in allowed:
        # Downgrade to best available block
        if has_lt2:
            gap_result.recommended_block = "aerobic_capacity_block"
        else:
            gap_result.recommended_block = "aerobic_capacity_block"
        gap_result.reasons.append(
            "Bloque restringido: sin datos de lactato, los bloques ANC/ANP "
            "no están disponibles (requieren VLamax). "
            + ("" if has_lt2 else "Sin LT2, solo bloques de capacidad aeróbica. ")
            + "Se recomienda realizar tests de lactato para desbloquear "
            "el análisis fisiológico completo."
        )

    return gap_result
