"""Módulo de insights avanzados de curva de lactato.

4 features de oportunidad derivadas de datos existentes:
1. Perfil de combustible (CHO vs FAT) — Olbrecht/Mader model
2. Predicción de depleción de glucógeno — para maratón/Ironman
3. Índice de trainability — respuesta entre tests sucesivos
4. Alertas automáticas de curva — warnings fisiológicos

Referencias:
- Olbrecht (Science of Winning): VLamax como proxy de contribución glucolítica
- Brooks & Mercier 1994: crossover concept CHO/FAT
- Romijn et al. 1993: sustrato vs intensidad relativa
- Rapoport 2010: modelo de depleción de glucógeno en maratón
- Coyle 2007: glycogen availability y rendimiento
- Faude et al. 2009: significado clínico de cambios en curva
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


# ═══════════════════════════════════════════════════════════════════════════════
# 1. PERFIL DE COMBUSTIBLE (CHO vs FAT)
# ═══════════════════════════════════════════════════════════════════════════════
#
# Modelo simplificado basado en:
# - VLamax proxy (ratio LT1/LT2) → tasa glucolítica
# - Posición relativa en la curva → %VO2max proxy
# - Brooks & Mercier 1994: crossover a ~75% VO2max en trained
# - Romijn et al. 1993: datos empíricos sustrato vs intensidad
#
# Limitaciones: sin calorimetría indirecta, esto es una ESTIMACIÓN educativa.
# El coach debe interpretarlo como tendencia, no como valor absoluto.

# CHO% a distintas fracciones de VO2max (Romijn 1993, Brooks 1994)
# Key: fraction of VO2max → (cho_pct_low_vlamax, cho_pct_high_vlamax)
_CHO_MODEL = {
    0.25: (10, 20),   # muy baja intensidad
    0.40: (20, 35),
    0.55: (35, 50),
    0.65: (45, 60),   # ~LT1
    0.75: (55, 72),   # crossover zone
    0.85: (72, 88),   # ~LT2
    0.95: (88, 95),   # supra-umbral
    1.00: (95, 98),
}


def _cho_pct_at_intensity(fraction_vo2max: float, vlamax_level: str) -> float:
    """Estima %CHO a una fracción de VO2max dado el nivel de VLamax.

    VLamax alta → mayor contribución glucolítica a cualquier intensidad
    (crossover más temprano, Brooks & Mercier 1994).
    """
    # Interpolar en la tabla
    fractions = sorted(_CHO_MODEL.keys())
    if fraction_vo2max <= fractions[0]:
        lo_cho, hi_cho = _CHO_MODEL[fractions[0]]
    elif fraction_vo2max >= fractions[-1]:
        lo_cho, hi_cho = _CHO_MODEL[fractions[-1]]
    else:
        for i in range(len(fractions) - 1):
            if fractions[i] <= fraction_vo2max <= fractions[i + 1]:
                t = (fraction_vo2max - fractions[i]) / (fractions[i + 1] - fractions[i])
                lo1, hi1 = _CHO_MODEL[fractions[i]]
                lo2, hi2 = _CHO_MODEL[fractions[i + 1]]
                lo_cho = lo1 + t * (lo2 - lo1)
                hi_cho = hi1 + t * (hi2 - hi1)
                break
        else:
            lo_cho, hi_cho = 50, 65

    # VLamax modula entre low y high
    if vlamax_level == "low":
        return round(lo_cho, 1)
    elif vlamax_level == "high":
        return round(hi_cho, 1)
    else:  # moderate
        return round((lo_cho + hi_cho) / 2, 1)


def compute_fuel_profile(
    curve_points: list[dict],
    lt1_lactate: Optional[float],
    lt2_lactate: Optional[float],
    vlamax_level: str,
    vo2max_estimated: Optional[float] = None,
) -> Optional[dict[str, Any]]:
    """Genera perfil de combustible por zona de intensidad.

    Args:
        curve_points: puntos de la curva (lactate_mmol, pace_seconds_per_km, etc.)
        lt1_lactate: lactato en LT1 (mmol)
        lt2_lactate: lactato en LT2 (mmol)
        vlamax_level: "low" | "moderate" | "high"
        vo2max_estimated: VO2max en ml/kg/min (opcional)

    Returns:
        Dict con zones_fuel (por zona) y crossover_intensity.
    """
    if not curve_points or len(curve_points) < 3:
        return None
    if not lt1_lactate or not lt2_lactate:
        return None

    lactates = [p.get("lactate_mmol") for p in curve_points if p.get("lactate_mmol") is not None]
    if len(lactates) < 3:
        return None

    baseline = min(lactates[:min(3, len(lactates))])
    peak = max(lactates)
    lactate_range = peak - baseline
    if lactate_range < 0.5:
        return None

    # Definir zonas por fracción de VO2max proxy
    # La posición en la curva de lactato mapea a intensidad relativa:
    # baseline → ~40% VO2max, LT1 → ~65%, LT2 → ~85%, peak → ~95%
    zones = [
        {"zone": "Z1", "label": "Recovery", "fraction_vo2max": 0.50, "intensity": "< LT1"},
        {"zone": "Z2", "label": "Aeróbico", "fraction_vo2max": 0.65, "intensity": "≈ LT1"},
        {"zone": "Z3", "label": "Tempo", "fraction_vo2max": 0.75, "intensity": "LT1–LT2"},
        {"zone": "Z4", "label": "Threshold", "fraction_vo2max": 0.85, "intensity": "≈ LT2"},
        {"zone": "Z5", "label": "VO2max+", "fraction_vo2max": 0.95, "intensity": "> LT2"},
    ]

    zones_fuel = []
    for z in zones:
        cho = _cho_pct_at_intensity(z["fraction_vo2max"], vlamax_level)
        fat = round(100 - cho, 1)
        zones_fuel.append({
            "zone": z["zone"],
            "label": z["label"],
            "intensity": z["intensity"],
            "fraction_vo2max": z["fraction_vo2max"],
            "cho_pct": cho,
            "fat_pct": fat,
        })

    # Crossover intensity: donde CHO > 50%
    crossover_fraction = None
    for frac in [x / 100 for x in range(25, 101)]:
        if _cho_pct_at_intensity(frac, vlamax_level) >= 50:
            crossover_fraction = round(frac, 2)
            break

    # Implicación práctica
    if vlamax_level == "high":
        implication = (
            "VLamax alta: crossover CHO/FAT temprano. El atleta consume más glucógeno "
            "a intensidades moderadas. Beneficio potencial de trabajo aeróbico extensivo "
            "para desplazar el crossover hacia la derecha."
        )
    elif vlamax_level == "low":
        implication = (
            "VLamax baja: excelente oxidación de grasas en zona aeróbica. "
            "El atleta puede mantener intensidades moderadas con bajo coste glucolítico. "
            "Ventaja para pruebas de ultra-resistencia."
        )
    else:
        implication = (
            "VLamax moderada: perfil mixto de sustrato. "
            "Margen de mejora tanto en capacidad aeróbica (desplazar crossover) "
            "como en potencia glucolítica según el objetivo."
        )

    return {
        "zones_fuel": zones_fuel,
        "crossover_fraction_vo2max": crossover_fraction,
        "vlamax_level": vlamax_level,
        "implication": implication,
        "model": "brooks_romijn_proxy",
        "confidence": "educational",
        "note": "Estimación basada en VLamax proxy y modelo de crossover. No sustituye calorimetría indirecta.",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 2. PREDICCIÓN DE DEPLECIÓN DE GLUCÓGENO
# ═══════════════════════════════════════════════════════════════════════════════
#
# Modelo basado en Rapoport 2010 y Coyle 2007:
# - Reserva de glucógeno muscular: ~400-500g (~1600-2000 kcal)
# - Tasa de uso de CHO depende de intensidad relativa y VLamax
# - A mayor VLamax, más CHO se quema por minuto a misma intensidad
# - Depleción → "muro" (bonking) cuando reservas < ~20%

_GLYCOGEN_RESERVE_KCAL = 1800  # ~450g × 4 kcal/g (valor medio)
_GLYCOGEN_INTAKE_RATE_KCAL_H = 240  # 60g/h CHO = 240 kcal/h (ingesta competición)

# Gasto energético aproximado por km según ritmo (running)
# Basado en ACSM metabolic equation: VO2 (ml/kg/min) = 0.2×speed + 0.9×speed×grade + 3.5
# Asumimos 70kg, grade=0
def _energy_cost_per_km_kcal(pace_seconds_per_km: float, body_weight_kg: float = 70) -> float:
    """Coste energético por km en kcal (running, ACSM equation)."""
    speed_m_min = 1000 / (pace_seconds_per_km / 60)
    vo2_ml_kg_min = 0.2 * speed_m_min + 3.5  # simplified flat ground
    vo2_l_min = vo2_ml_kg_min * body_weight_kg / 1000
    kcal_per_min = vo2_l_min * 5.0  # ~5 kcal per L O2
    time_per_km_min = pace_seconds_per_km / 60
    return round(kcal_per_min * time_per_km_min, 1)


def compute_glycogen_depletion(
    race_distance_km: float,
    race_pace_seconds_per_km: float,
    lt1_lactate: Optional[float],
    lt2_lactate: Optional[float],
    lt2_pace_seconds_per_km: Optional[float],
    vlamax_level: str,
    cho_intake_g_per_hour: float = 60,
    body_weight_kg: float = 70,
) -> Optional[dict[str, Any]]:
    """Predice el punto de depleción de glucógeno en carrera larga.

    Solo relevante para distancias ≥ HM (21.1 km).
    """
    if race_distance_km < 15:
        return None
    if not lt2_pace_seconds_per_km or race_pace_seconds_per_km <= 0:
        return None

    # Fracción de VO2max a ritmo de carrera
    # Proxy: ratio de velocidades (race vs LT2), LT2 ≈ 85% VO2max
    lt2_speed = 3600 / lt2_pace_seconds_per_km
    race_speed = 3600 / race_pace_seconds_per_km
    intensity_ratio = race_speed / lt2_speed if lt2_speed > 0 else 0.8
    fraction_vo2max = min(1.0, intensity_ratio * 0.85)

    # %CHO a esa intensidad
    cho_pct = _cho_pct_at_intensity(fraction_vo2max, vlamax_level) / 100

    # Energía total por km
    total_kcal_per_km = _energy_cost_per_km_kcal(race_pace_seconds_per_km, body_weight_kg)
    cho_kcal_per_km = total_kcal_per_km * cho_pct

    # Ingesta CHO por km
    time_per_km_h = race_pace_seconds_per_km / 3600
    intake_kcal_per_km = cho_intake_g_per_hour * 4 * time_per_km_h  # 4 kcal/g

    # Gasto neto de glucógeno por km
    net_glycogen_per_km = cho_kcal_per_km - intake_kcal_per_km

    if net_glycogen_per_km <= 0:
        # Intake covers CHO cost — no depletion predicted
        return {
            "depletion_km": None,
            "depletion_time_min": None,
            "race_distance_km": race_distance_km,
            "glycogen_at_finish_pct": 95,
            "risk_level": "none",
            "message": "La ingesta de CHO cubre el gasto glucolítico a este ritmo. Sin riesgo de depleción.",
            "cho_pct_at_race_pace": round(cho_pct * 100, 1),
            "fraction_vo2max": round(fraction_vo2max, 2),
        }

    depletion_km = _GLYCOGEN_RESERVE_KCAL / net_glycogen_per_km
    depletion_time_min = depletion_km * race_pace_seconds_per_km / 60

    glycogen_used_total = net_glycogen_per_km * race_distance_km
    glycogen_at_finish_pct = max(0, round((1 - glycogen_used_total / _GLYCOGEN_RESERVE_KCAL) * 100, 1))

    if depletion_km > race_distance_km * 1.15:
        risk_level = "low"
        message = f"Reservas de glucógeno suficientes para {race_distance_km}km a este ritmo."
    elif depletion_km > race_distance_km:
        risk_level = "moderate"
        message = (
            f"Margen ajustado: depleción estimada a ~{depletion_km:.0f}km. "
            f"Mantener ingesta de {cho_intake_g_per_hour}g/h CHO es crítico."
        )
    else:
        risk_level = "high"
        message = (
            f"⚠️ Depleción estimada a km {depletion_km:.0f} (antes de los {race_distance_km:.0f}km). "
            f"Opciones: reducir ritmo, aumentar ingesta CHO, o trabajar VLamax para reducir coste glucolítico."
        )

    strategies = []
    if vlamax_level == "high":
        strategies.append("Bloque AEC (capacidad aeróbica) para reducir VLamax y desplazar crossover.")
    if cho_intake_g_per_hour < 80:
        strategies.append(f"Entrenar ingesta hasta 80-90g/h CHO (actual: {cho_intake_g_per_hour}g/h).")
    if risk_level == "high":
        # Calcular ritmo seguro
        safe_pace = race_pace_seconds_per_km * 1.05  # 5% más lento
        strategies.append(f"Ritmo más conservador (~{int(safe_pace//60)}:{int(safe_pace%60):02d}/km) para reducir %CHO.")

    return {
        "depletion_km": round(depletion_km, 1),
        "depletion_time_min": round(depletion_time_min, 0),
        "race_distance_km": race_distance_km,
        "race_pace": race_pace_seconds_per_km,
        "glycogen_at_finish_pct": glycogen_at_finish_pct,
        "risk_level": risk_level,
        "message": message,
        "cho_pct_at_race_pace": round(cho_pct * 100, 1),
        "fraction_vo2max": round(fraction_vo2max, 2),
        "net_glycogen_cost_kcal_per_km": round(net_glycogen_per_km, 1),
        "cho_intake_g_per_hour": cho_intake_g_per_hour,
        "strategies": strategies,
        "model": "rapoport_coyle_proxy",
        "confidence": "educational",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 3. ÍNDICE DE TRAINABILITY
# ═══════════════════════════════════════════════════════════════════════════════
#
# Cuantifica la respuesta al entrenamiento entre tests sucesivos.
# Basado en:
# - Cambio en LT2 (rendimiento aeróbico)
# - Cambio en LT1 (base aeróbica)
# - Cambio en forma de curva (desplazamiento lateral)
# - Cambio en baseline (fatiga/sobreentrenamiento)
#
# Faude 2009: cambios significativos > 3-5% en umbrales entre tests


def compute_trainability_index(
    current_snapshot: dict[str, Any],
    previous_snapshot: dict[str, Any],
    days_between: int,
) -> Optional[dict[str, Any]]:
    """Calcula índice de trainability entre dos snapshots consecutivos.

    Args:
        current_snapshot: payload del snapshot más reciente
        previous_snapshot: payload del snapshot anterior
        days_between: días entre tests

    Returns:
        Dict con trainability_index, componentes, y dirección.
    """
    if days_between < 7:
        return None  # demasiado cercanos para medir adaptación

    curr_thresholds = current_snapshot.get("thresholds", [])
    prev_thresholds = previous_snapshot.get("thresholds", [])

    def _get_threshold(thresholds: list, name: str) -> Optional[dict]:
        return next((t for t in thresholds if t.get("name") == name), None)

    curr_lt1 = _get_threshold(curr_thresholds, "LT1")
    curr_lt2 = _get_threshold(curr_thresholds, "LT2")
    prev_lt1 = _get_threshold(prev_thresholds, "LT1")
    prev_lt2 = _get_threshold(prev_thresholds, "LT2")

    if not all([curr_lt2, prev_lt2]):
        return None

    components = {}

    # ── LT2 change (peso: 40%) ────────────────────────────────────────────
    lt2_delta_pct = None
    # Try pace first, then power
    if curr_lt2.get("pace_seconds_per_km") and prev_lt2.get("pace_seconds_per_km"):
        curr_speed = 3600 / curr_lt2["pace_seconds_per_km"]
        prev_speed = 3600 / prev_lt2["pace_seconds_per_km"]
        lt2_delta_pct = (curr_speed - prev_speed) / prev_speed * 100
    elif curr_lt2.get("power_watts") and prev_lt2.get("power_watts"):
        lt2_delta_pct = (curr_lt2["power_watts"] - prev_lt2["power_watts"]) / prev_lt2["power_watts"] * 100

    if lt2_delta_pct is not None:
        components["lt2_change_pct"] = round(lt2_delta_pct, 2)

    # ── LT1 change (peso: 25%) ────────────────────────────────────────────
    lt1_delta_pct = None
    if curr_lt1 and prev_lt1:
        if curr_lt1.get("pace_seconds_per_km") and prev_lt1.get("pace_seconds_per_km"):
            curr_speed = 3600 / curr_lt1["pace_seconds_per_km"]
            prev_speed = 3600 / prev_lt1["pace_seconds_per_km"]
            lt1_delta_pct = (curr_speed - prev_speed) / prev_speed * 100
        elif curr_lt1.get("power_watts") and prev_lt1.get("power_watts"):
            lt1_delta_pct = (curr_lt1["power_watts"] - prev_lt1["power_watts"]) / prev_lt1["power_watts"] * 100

    if lt1_delta_pct is not None:
        components["lt1_change_pct"] = round(lt1_delta_pct, 2)

    # ── Baseline lactate change (peso: 15%) ───────────────────────────────
    # Un baseline que baja → mejor capacidad de clearance
    curr_peak = current_snapshot.get("peak_lactate", {})
    prev_peak = previous_snapshot.get("peak_lactate", {})
    curr_baseline = _extract_baseline(current_snapshot)
    prev_baseline = _extract_baseline(previous_snapshot)

    baseline_delta = None
    if curr_baseline is not None and prev_baseline is not None and prev_baseline > 0:
        baseline_delta = (curr_baseline - prev_baseline) / prev_baseline * 100
        # Negativo es bueno (baseline baja)
        components["baseline_change_pct"] = round(baseline_delta, 2)

    # ── Ratio LT1/LT2 change (peso: 20%) ─────────────────────────────────
    # Ratio subiendo → VLamax bajando → mejor eficiencia aeróbica
    curr_ratio = None
    prev_ratio = None
    if curr_lt1 and curr_lt2 and curr_lt1.get("lactate") and curr_lt2.get("lactate"):
        curr_ratio = curr_lt1["lactate"] / curr_lt2["lactate"] if curr_lt2["lactate"] > 0 else None
    if prev_lt1 and prev_lt2 and prev_lt1.get("lactate") and prev_lt2.get("lactate"):
        prev_ratio = prev_lt1["lactate"] / prev_lt2["lactate"] if prev_lt2["lactate"] > 0 else None

    ratio_delta = None
    if curr_ratio and prev_ratio:
        ratio_delta = (curr_ratio - prev_ratio) / prev_ratio * 100
        components["lt1_lt2_ratio_change_pct"] = round(ratio_delta, 2)

    # ── Composite score ───────────────────────────────────────────────────
    # Ponderación: LT2(40%) + LT1(25%) + baseline(15%) + ratio(20%)
    score = 0.0
    weights_used = 0.0

    if lt2_delta_pct is not None:
        score += lt2_delta_pct * 0.40
        weights_used += 0.40
    if lt1_delta_pct is not None:
        score += lt1_delta_pct * 0.25
        weights_used += 0.25
    if baseline_delta is not None:
        # Baseline bajando es positivo → invertir signo
        score += (-baseline_delta) * 0.15
        weights_used += 0.15
    if ratio_delta is not None:
        score += ratio_delta * 0.20
        weights_used += 0.20

    if weights_used < 0.30:
        return None

    # Normalizar por el peso total usado
    trainability_index = round(score / weights_used, 2)

    # Normalizar por tiempo (respuesta por semana)
    weeks = max(1, days_between / 7)
    response_per_week = round(trainability_index / weeks, 2)

    # Interpretar
    if trainability_index > 3:
        direction = "strong_positive"
        interpretation = "Respuesta excelente al entrenamiento. El bloque actual está funcionando."
    elif trainability_index > 1:
        direction = "positive"
        interpretation = "Progresión positiva. Mantener la dirección del entrenamiento."
    elif trainability_index > -1:
        direction = "stable"
        interpretation = "Sin cambios significativos. Considerar nuevo estímulo o verificar carga."
    elif trainability_index > -3:
        direction = "negative"
        interpretation = "Regresión leve. Revisar carga, descanso y estrés externo."
    else:
        direction = "strong_negative"
        interpretation = "Regresión significativa. Posible sobreentrenamiento o fatiga acumulada. Priorizar recuperación."

    return {
        "trainability_index": trainability_index,
        "response_per_week": response_per_week,
        "direction": direction,
        "interpretation": interpretation,
        "days_between_tests": days_between,
        "components": components,
        "significance_threshold": 3.0,
        "model": "faude_composite",
    }


def _extract_baseline(snapshot_payload: dict[str, Any]) -> Optional[float]:
    """Extrae baseline de lactato del snapshot."""
    for curve_key in ("curve_by_pace", "curve_by_power", "curve_by_hr"):
        points = snapshot_payload.get(curve_key, [])
        if points and len(points) >= 2:
            lactates = [p.get("lactate_mmol") for p in points if p.get("lactate_mmol") is not None]
            if lactates:
                return min(lactates[:min(3, len(lactates))])
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# 4. ALERTAS AUTOMÁTICAS DE CURVA
# ═══════════════════════════════════════════════════════════════════════════════
#
# Detección de patrones anómalos en la curva que el coach debe conocer.
# Basado en Faude 2009, Meeusen 2013 (overtraining), Bosquet 2007.

@dataclass
class CurveAlert:
    code: str          # ej. "ELEVATED_BASELINE", "LEFT_SHIFT", etc.
    severity: str      # "info" | "warning" | "critical"
    title: str
    message: str
    data: dict


def detect_curve_alerts(
    current_snapshot: dict[str, Any],
    previous_snapshot: Optional[dict[str, Any]] = None,
    days_since_previous: Optional[int] = None,
) -> list[dict[str, Any]]:
    """Detecta alertas automáticas en la curva de lactato.

    Args:
        current_snapshot: payload del snapshot actual
        previous_snapshot: payload del snapshot anterior (para comparar)
        days_since_previous: días entre tests

    Returns:
        Lista de alertas (dicts serializables).
    """
    alerts: list[CurveAlert] = []

    curr_thresholds = current_snapshot.get("thresholds", [])
    curr_lt1 = next((t for t in curr_thresholds if t.get("name") == "LT1"), None)
    curr_lt2 = next((t for t in curr_thresholds if t.get("name") == "LT2"), None)

    baseline = _extract_baseline(current_snapshot)
    peak = current_snapshot.get("peak_lactate", {})
    peak_mmol = peak.get("lactate_mmol") if isinstance(peak, dict) else None

    # ── A1: Baseline elevado ──────────────────────────────────────────────
    # Meeusen 2013: baseline > 2.0 mmol sugiere fatiga residual o estrés
    if baseline is not None and baseline > 2.0:
        severity = "critical" if baseline > 2.5 else "warning"
        alerts.append(CurveAlert(
            code="ELEVATED_BASELINE",
            severity=severity,
            title="Baseline de lactato elevado",
            message=(
                f"Baseline en reposo/baja intensidad: {baseline:.1f} mmol/L "
                f"(esperado < 1.5 mmol). Puede indicar fatiga residual, "
                f"glycogen depletion, o estrés fisiológico elevado."
            ),
            data={"baseline_mmol": round(baseline, 2), "threshold": 2.0},
        ))

    # ── A2: LT1/LT2 ratio comprimido ─────────────────────────────────────
    # Ratio < 0.5 → gap muy grande entre umbrales → posible VLamax muy alta
    if curr_lt1 and curr_lt2 and curr_lt1.get("lactate") and curr_lt2.get("lactate"):
        ratio = curr_lt1["lactate"] / curr_lt2["lactate"] if curr_lt2["lactate"] > 0 else None
        if ratio is not None and ratio < 0.50:
            alerts.append(CurveAlert(
                code="COMPRESSED_AEROBIC_WINDOW",
                severity="warning",
                title="Ventana aeróbica comprimida",
                message=(
                    f"Ratio LT1/LT2 = {ratio:.2f} (< 0.50). La zona entre umbrales es muy estrecha, "
                    f"sugiriendo alta VLamax. Trabajo aeróbico extensivo puede ampliar esta ventana."
                ),
                data={"lt1_lt2_ratio": round(ratio, 3)},
            ))

    # ── A3: Pico de lactato bajo ──────────────────────────────────────────
    # Un pico < 4 mmol en test incremental sugiere que el test no fue maximal
    if peak_mmol is not None and peak_mmol < 4.0:
        alerts.append(CurveAlert(
            code="LOW_PEAK_LACTATE",
            severity="info",
            title="Pico de lactato bajo",
            message=(
                f"Pico de lactato: {peak_mmol:.1f} mmol/L. Un test incremental debería "
                f"alcanzar > 4 mmol si el esfuerzo fue maximal. Valorar si el protocolo "
                f"fue insuficiente o si el atleta tiene VLamax genuinamente baja."
            ),
            data={"peak_mmol": round(peak_mmol, 2)},
        ))

    # ── A4: Pico de lactato muy alto ──────────────────────────────────────
    # Pico > 12 mmol → alta capacidad glucolítica, revisar si es coherente
    if peak_mmol is not None and peak_mmol > 12:
        alerts.append(CurveAlert(
            code="VERY_HIGH_PEAK",
            severity="info",
            title="Pico de lactato muy alto",
            message=(
                f"Pico de lactato: {peak_mmol:.1f} mmol/L (> 12). Indica alta capacidad "
                f"glucolítica (VLamax alta). Normal en sprinters; en fondistas puede "
                f"indicar que el perfil glucolítico domina sobre el aeróbico."
            ),
            data={"peak_mmol": round(peak_mmol, 2)},
        ))

    # ── Alertas de comparación (requieren test previo) ────────────────────
    if previous_snapshot and days_since_previous:
        prev_thresholds = previous_snapshot.get("thresholds", [])
        prev_lt1 = next((t for t in prev_thresholds if t.get("name") == "LT1"), None)
        prev_lt2 = next((t for t in prev_thresholds if t.get("name") == "LT2"), None)
        prev_baseline = _extract_baseline(previous_snapshot)

        # ── A5: Left shift (curva se desplaza a la izquierda = empeoramiento)
        if curr_lt2 and prev_lt2:
            curr_lt2_speed = None
            prev_lt2_speed = None
            if curr_lt2.get("pace_seconds_per_km") and prev_lt2.get("pace_seconds_per_km"):
                curr_lt2_speed = 3600 / curr_lt2["pace_seconds_per_km"]
                prev_lt2_speed = 3600 / prev_lt2["pace_seconds_per_km"]
            elif curr_lt2.get("power_watts") and prev_lt2.get("power_watts"):
                curr_lt2_speed = curr_lt2["power_watts"]
                prev_lt2_speed = prev_lt2["power_watts"]

            if curr_lt2_speed and prev_lt2_speed:
                delta_pct = (curr_lt2_speed - prev_lt2_speed) / prev_lt2_speed * 100
                if delta_pct < -5:
                    severity = "critical" if delta_pct < -10 else "warning"
                    alerts.append(CurveAlert(
                        code="LEFT_SHIFT",
                        severity=severity,
                        title="Desplazamiento a la izquierda de la curva",
                        message=(
                            f"LT2 ha bajado {abs(delta_pct):.1f}% respecto al test anterior "
                            f"({days_since_previous} días). Posibles causas: sobreentrenamiento, "
                            f"enfermedad reciente, o acumulación de fatiga."
                        ),
                        data={"lt2_delta_pct": round(delta_pct, 2), "days_between": days_since_previous},
                    ))

        # ── A6: Baseline rising (fatiga crónica)
        if baseline is not None and prev_baseline is not None:
            if baseline > prev_baseline + 0.5:
                alerts.append(CurveAlert(
                    code="RISING_BASELINE",
                    severity="warning",
                    title="Baseline en aumento",
                    message=(
                        f"Baseline subió de {prev_baseline:.1f} a {baseline:.1f} mmol/L. "
                        f"Combinado con otros indicadores puede sugerir fatiga acumulada "
                        f"o recuperación incompleta entre sesiones."
                    ),
                    data={
                        "current_baseline": round(baseline, 2),
                        "previous_baseline": round(prev_baseline, 2),
                    },
                ))

        # ── A7: VLamax rising (ratio LT1/LT2 bajando)
        if curr_lt1 and curr_lt2 and prev_lt1 and prev_lt2:
            curr_lt1_lac = curr_lt1.get("lactate")
            curr_lt2_lac = curr_lt2.get("lactate")
            prev_lt1_lac = prev_lt1.get("lactate")
            prev_lt2_lac = prev_lt2.get("lactate")
            if all([curr_lt1_lac, curr_lt2_lac, prev_lt1_lac, prev_lt2_lac]):
                curr_ratio = curr_lt1_lac / curr_lt2_lac if curr_lt2_lac > 0 else None
                prev_ratio = prev_lt1_lac / prev_lt2_lac if prev_lt2_lac > 0 else None
                if curr_ratio and prev_ratio and curr_ratio < prev_ratio - 0.05:
                    alerts.append(CurveAlert(
                        code="VLAMAX_RISING",
                        severity="info",
                        title="VLamax proxy en aumento",
                        message=(
                            f"Ratio LT1/LT2 bajó de {prev_ratio:.2f} a {curr_ratio:.2f}. "
                            f"Sugiere que la contribución glucolítica está aumentando. "
                            f"Normal tras bloques anaeróbicos; en base aeróbico puede indicar "
                            f"que el volumen Z2 es insuficiente."
                        ),
                        data={
                            "current_ratio": round(curr_ratio, 3),
                            "previous_ratio": round(prev_ratio, 3),
                        },
                    ))

        # ── A8: Right shift significativo (mejora notable)
        if curr_lt2 and prev_lt2:
            curr_lt2_speed = None
            prev_lt2_speed = None
            if curr_lt2.get("pace_seconds_per_km") and prev_lt2.get("pace_seconds_per_km"):
                curr_lt2_speed = 3600 / curr_lt2["pace_seconds_per_km"]
                prev_lt2_speed = 3600 / prev_lt2["pace_seconds_per_km"]
            elif curr_lt2.get("power_watts") and prev_lt2.get("power_watts"):
                curr_lt2_speed = curr_lt2["power_watts"]
                prev_lt2_speed = prev_lt2["power_watts"]

            if curr_lt2_speed and prev_lt2_speed:
                delta_pct = (curr_lt2_speed - prev_lt2_speed) / prev_lt2_speed * 100
                if delta_pct > 5:
                    alerts.append(CurveAlert(
                        code="RIGHT_SHIFT",
                        severity="info",
                        title="Desplazamiento a la derecha (mejora)",
                        message=(
                            f"LT2 ha mejorado {delta_pct:.1f}% respecto al test anterior. "
                            f"La curva se desplaza a la derecha — excelente respuesta al entrenamiento."
                        ),
                        data={"lt2_delta_pct": round(delta_pct, 2), "days_between": days_since_previous},
                    ))

    return [
        {
            "code": a.code,
            "severity": a.severity,
            "title": a.title,
            "message": a.message,
            "data": a.data,
        }
        for a in alerts
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT: compute all insights for a session
# ═══════════════════════════════════════════════════════════════════════════════

def compute_curve_insights(
    analysis: dict[str, Any],
    previous_snapshot_payload: Optional[dict[str, Any]] = None,
    days_since_previous: Optional[int] = None,
    vlamax_level: str = "moderate",
    vo2max_estimated: Optional[float] = None,
) -> dict[str, Any]:
    """Computa todos los insights de curva para una sesión.

    Se llama desde recalculate_athlete() después de analyze_session().
    El resultado se añade al payload del snapshot como 'curve_insights'.
    """
    thresholds = analysis.get("thresholds", [])
    lt1 = next((t for t in thresholds if t.get("name") == "LT1"), None)
    lt2 = next((t for t in thresholds if t.get("name") == "LT2"), None)

    lt1_lactate = lt1.get("lactate") if lt1 else None
    lt2_lactate = lt2.get("lactate") if lt2 else None
    lt2_pace = lt2.get("pace_seconds_per_km") if lt2 else None

    # Get curve points (prefer pace, then power)
    curve_points = analysis.get("curve_by_pace") or analysis.get("curve_by_power") or []

    # 1. Fuel profile
    fuel_profile = compute_fuel_profile(
        curve_points=curve_points,
        lt1_lactate=lt1_lactate,
        lt2_lactate=lt2_lactate,
        vlamax_level=vlamax_level,
        vo2max_estimated=vo2max_estimated,
    )

    # 2. Glycogen depletion (marathon example)
    glycogen_predictions = {}
    if lt2_pace:
        for race_name, (distance, pace_factor) in {
            "half_marathon": (21.1, 0.92),
            "marathon": (42.195, 0.85),
            "ironman_run": (42.195, 0.78),
        }.items():
            race_pace = lt2_pace / pace_factor  # más lento que LT2
            pred = compute_glycogen_depletion(
                race_distance_km=distance,
                race_pace_seconds_per_km=race_pace,
                lt1_lactate=lt1_lactate,
                lt2_lactate=lt2_lactate,
                lt2_pace_seconds_per_km=lt2_pace,
                vlamax_level=vlamax_level,
            )
            if pred:
                glycogen_predictions[race_name] = pred

    # 3. Trainability index
    trainability = None
    if previous_snapshot_payload and days_since_previous:
        trainability = compute_trainability_index(
            current_snapshot=analysis,
            previous_snapshot=previous_snapshot_payload,
            days_between=days_since_previous,
        )

    # 4. Curve alerts
    alerts = detect_curve_alerts(
        current_snapshot=analysis,
        previous_snapshot=previous_snapshot_payload,
        days_since_previous=days_since_previous,
    )

    return {
        "fuel_profile": fuel_profile,
        "glycogen_predictions": glycogen_predictions if glycogen_predictions else None,
        "trainability": trainability,
        "curve_alerts": alerts,
    }
