from __future__ import annotations

from datetime import date
from statistics import mean
from typing import Any, Optional

from app.models.athlete import Athlete
from app.models.metrics import PhysiologicalSnapshot


RUNNING_EVENT_CONFIG: dict[str, dict[str, float]] = {
    "5K": {
        "base_multiplier": 1.03,
        "endurance_bonus": -0.01,
        "anaerobic_bonus": 0.015,
        "base_spread": 0.03,
        "confidence_penalty": 0.02,
    },
    "10K": {
        "base_multiplier": 1.0,
        "endurance_bonus": 0.002,
        "anaerobic_bonus": 0.01,
        "base_spread": 0.035,
        "confidence_penalty": 0.03,
    },
    "HM": {
        "base_multiplier": 0.94,
        "endurance_bonus": 0.035,
        "anaerobic_bonus": -0.004,
        "base_spread": 0.05,
        "confidence_penalty": 0.05,
    },
    "Maratón": {
        "base_multiplier": 0.89,
        "endurance_bonus": 0.05,
        "anaerobic_bonus": -0.01,
        "base_spread": 0.065,
        "confidence_penalty": 0.08,
    },
}


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _threshold_attr(threshold: Any, attr: str) -> Any:
    if threshold is None:
        return None
    if isinstance(threshold, dict):
        return threshold.get(attr)
    return getattr(threshold, attr, None)


def _find_threshold(thresholds: list[Any], name: str) -> Any:
    return next((item for item in thresholds if _threshold_attr(item, "name") == name), None)


def _pace_to_speed_kph(pace_seconds_per_km: Optional[float]) -> Optional[float]:
    if pace_seconds_per_km is None or pace_seconds_per_km <= 0:
        return None
    return 3600 / pace_seconds_per_km


def _speed_kph_to_pace(speed_kph: Optional[float]) -> Optional[float]:
    if speed_kph is None or speed_kph <= 0:
        return None
    return 3600 / speed_kph


def _historical_stability(values: list[float]) -> float:
    cleaned = [value for value in values if value is not None and value > 0]
    if len(cleaned) < 2:
        return 0.46
    relative_changes = [abs(cleaned[index] - cleaned[index - 1]) / cleaned[index - 1] for index in range(1, len(cleaned)) if cleaned[index - 1] > 0]
    if not relative_changes:
        return 0.5
    mean_change = sum(relative_changes) / len(relative_changes)
    return round(_clamp(1 - mean_change / 0.08, 0.35, 0.92), 2)


def _agreement_score(values: list[float], reference_value: float) -> float:
    if len(values) < 2 or reference_value <= 0:
        return 0.64
    normalized_gap = (max(values) - min(values)) / reference_value
    return round(_clamp(1 - normalized_gap / 0.08, 0.35, 0.95), 2)


def _confidence_label(confidence: float, evidence_points: int) -> str:
    if evidence_points < 2 or confidence < 0.6:
        return "low"
    if confidence < 0.78:
        return "medium"
    return "high"


def _estimate_payload(
    estimate_type: str,
    discipline: str,
    power_source: Optional[str],
    value: float,
    unit: str,
    confidence: float,
    snapshot_date: date,
    variables_used: list[str],
    evidence_points: int,
    explanation: str,
    *,
    spread: Optional[float] = None,
    lower_bound: Optional[float] = None,
    upper_bound: Optional[float] = None,
    method_used: Optional[str] = None,
    primary_anchor: Optional[str] = None,
    agreement_score: Optional[float] = None,
    range_summary: Optional[str] = None,
    calculation_steps: Optional[list[str]] = None,
    cautions: Optional[list[str]] = None,
    anchors: Optional[list[dict[str, Any]]] = None,
    confidence_factors: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    if lower_bound is None or upper_bound is None:
        if unit == "ml/kg/min":
            margin = spread or 3.0
            lower_bound = round(value - margin, 1)
            upper_bound = round(value + margin, 1)
        else:
            applied_spread = spread or 0.05
            lower_bound = round(value * (1 - applied_spread), 1)
            upper_bound = round(value * (1 + applied_spread), 1)

    confidence = round(_clamp(confidence, 0.2, 0.95), 2)
    reliability = _confidence_label(confidence, evidence_points)
    payload = {
        "estimate_type": estimate_type,
        "discipline": discipline,
        "power_source": power_source,
        "value": round(value, 1),
        "unit": unit,
        "lower_bound": round(lower_bound, 1) if lower_bound is not None else None,
        "upper_bound": round(upper_bound, 1) if upper_bound is not None else None,
        "confidence": confidence,
        "reliability_label": reliability,
        "valid_on": snapshot_date,
        "inputs_summary": explanation,
        "variables_used": variables_used,
        "evidence_points": evidence_points,
        "low_evidence": reliability == "low",
        "valid_on_iso": snapshot_date.isoformat(),
        "method_used": method_used,
        "primary_anchor": primary_anchor,
        "agreement_score": agreement_score,
        "range_summary": range_summary,
        "calculation_steps": calculation_steps or [],
        "cautions": cautions or [],
        "anchors": anchors or [],
        "confidence_factors": confidence_factors or [],
    }
    return payload


def _running_prediction_inputs(
    thresholds: list[Any],
    dynamic_thresholds: Optional[dict[str, Any]],
    snapshots: list[PhysiologicalSnapshot],
    discipline: str,
    power_source: Optional[str],
    history_depth: int,
) -> Optional[dict[str, Any]]:
    lt1 = _find_threshold(thresholds, "LT1")
    lt2 = _find_threshold(thresholds, "LT2")
    lt2_pace = _threshold_attr(lt2, "pace_seconds_per_km")
    if lt2_pace is None:
        return None

    anchors: list[dict[str, Any]] = []
    weighted_sources: list[tuple[float, float, str]] = []

    lt2_confidence = float(_threshold_attr(lt2, "confidence") or 0.55)
    anchors.append(
        {
            "label": "LT2 fisiologico",
            "value": round(float(lt2_pace), 1),
            "unit": "s/km",
            "confidence": round(lt2_confidence, 2),
        }
    )
    weighted_sources.append((float(lt2_pace), max(0.25, lt2_confidence), "lt2_fisiologico"))

    chronic = (dynamic_thresholds or {}).get("chronic") or {}
    practical_lt2 = chronic.get("practical_lt2") or {}
    practical_pace = practical_lt2.get("estimated_pace_seconds_per_km")
    practical_confidence = float(practical_lt2.get("confidence_score") or practical_lt2.get("reliability_score") or 0.0)
    if practical_pace is not None:
        anchors.append(
            {
                "label": "LT2 practico cronico",
                "value": round(float(practical_pace), 1),
                "unit": "s/km",
                "confidence": round(practical_confidence, 2),
            }
        )
        weighted_sources.append((float(practical_pace), max(0.2, practical_confidence), "lt2_practico_cronico"))

    total_weight = sum(weight for _, weight, _ in weighted_sources)
    reference_pace = sum(value * weight for value, weight, _ in weighted_sources) / max(total_weight, 1e-6)
    reference_speed_kph = _pace_to_speed_kph(reference_pace)
    if reference_speed_kph is None:
        return None

    agreement = _agreement_score([value for value, _, _ in weighted_sources], reference_pace)
    lt2_history = [
        snapshot.lt2_pace_seconds_per_km
        for snapshot in snapshots
        if snapshot.discipline == discipline
        and (power_source is None or snapshot.power_source == power_source)
        and snapshot.lt2_pace_seconds_per_km is not None
    ]
    lt2_history.append(float(lt2_pace))
    stability = _historical_stability([value for value in lt2_history if value is not None])
    history_score = round(_clamp(0.28 + min(history_depth, 6) * 0.1, 0.28, 0.88), 2)

    cautions: list[str] = []
    lt1_pace = _threshold_attr(lt1, "pace_seconds_per_km")
    if lt1_pace is not None:
        lt1_speed = _pace_to_speed_kph(float(lt1_pace))
        lt2_speed = _pace_to_speed_kph(float(lt2_pace))
        ratio = (lt1_speed / lt2_speed) if lt1_speed and lt2_speed else 0.88
        endurance_score = round(_clamp((ratio - 0.82) / 0.12, 0.0, 1.0), 2)
    else:
        endurance_score = 0.52
        cautions.append("Sin LT1 comparable en la sesion actual, el perfil de resistencia se ha estimado con mayor prudencia.")

    if history_depth < 3:
        cautions.append("Historico corto para afinar predicciones de media y larga distancia.")
    if agreement < 0.55:
        cautions.append("Las anclas LT2 fisiologica y LT2 practica cronica no coinciden del todo; el rango se amplia.")

    base_confidence = round(
        _clamp(
            mean([item["confidence"] for item in anchors]) * 0.48
            + stability * 0.2
            + agreement * 0.17
            + history_score * 0.15,
            0.38,
            0.92,
        ),
        2,
    )

    calculation_steps = [
        "Se toma LT2 fisiologico como ancla principal de rendimiento.",
    ]
    if practical_pace is not None:
        calculation_steps.append("Se mezcla con LT2 practico cronico para no depender solo del ultimo test.")
    calculation_steps.append("Se ajusta segun cercania LT1-LT2 para perfilar resistencia frente a tolerancia a esfuerzos cortos.")
    calculation_steps.append("El rango final se abre o se cierra segun acuerdo entre anclas, estabilidad del historico y profundidad de evidencia.")

    confidence_factors = [
        {
            "label": "acuerdo_anclas",
            "score": agreement,
            "weight": 0.17,
            "explanation": "Si LT2 fisiologico y LT2 practico cronico se parecen, la prediccion es mas estable.",
        },
        {
            "label": "estabilidad_historica",
            "score": stability,
            "weight": 0.2,
            "explanation": "Las referencias longitudinales estables reducen dispersion.",
        },
        {
            "label": "profundidad_historica",
            "score": history_score,
            "weight": 0.15,
            "explanation": "Mas cortes comparables elevan confianza.",
        },
    ]

    return {
        "reference_pace": round(reference_pace, 1),
        "reference_speed_kph": round(reference_speed_kph, 3),
        "agreement_score": agreement,
        "stability_score": stability,
        "history_score": history_score,
        "endurance_score": endurance_score,
        "base_confidence": base_confidence,
        "anchors": anchors,
        "cautions": cautions,
        "calculation_steps": calculation_steps,
        "confidence_factors": confidence_factors,
        "lt1_missing": lt1_pace is None,
    }


def _cycling_prediction_inputs(
    thresholds: list[Any],
    dynamic_thresholds: Optional[dict[str, Any]],
    snapshots: list[PhysiologicalSnapshot],
    discipline: str,
    power_source: Optional[str],
    history_depth: int,
) -> Optional[dict[str, Any]]:
    lt1 = _find_threshold(thresholds, "LT1")
    lt2 = _find_threshold(thresholds, "LT2")
    lt2_power = _threshold_attr(lt2, "power_watts")
    if lt2_power is None:
        return None

    anchors: list[dict[str, Any]] = []
    weighted_sources: list[tuple[float, float, str]] = []

    lt2_confidence = float(_threshold_attr(lt2, "confidence") or 0.55)
    anchors.append(
        {
            "label": "LT2 fisiologico",
            "value": round(float(lt2_power), 1),
            "unit": "W",
            "confidence": round(lt2_confidence, 2),
        }
    )
    weighted_sources.append((float(lt2_power), max(0.25, lt2_confidence), "lt2_fisiologico"))

    chronic = (dynamic_thresholds or {}).get("chronic") or {}
    practical_lt2 = chronic.get("practical_lt2") or {}
    practical_power = practical_lt2.get("estimated_power_watts")
    practical_confidence = float(practical_lt2.get("confidence_score") or practical_lt2.get("reliability_score") or 0.0)
    if practical_power is not None:
        anchors.append(
            {
                "label": "LT2 practico cronico",
                "value": round(float(practical_power), 1),
                "unit": "W",
                "confidence": round(practical_confidence, 2),
            }
        )
        weighted_sources.append((float(practical_power), max(0.2, practical_confidence), "lt2_practico_cronico"))

    total_weight = sum(weight for _, weight, _ in weighted_sources)
    reference_power = sum(value * weight for value, weight, _ in weighted_sources) / max(total_weight, 1e-6)
    agreement = _agreement_score([value for value, _, _ in weighted_sources], reference_power)
    lt2_history = [
        snapshot.lt2_power_watts
        for snapshot in snapshots
        if snapshot.discipline == discipline
        and (power_source is None or snapshot.power_source == power_source)
        and snapshot.lt2_power_watts is not None
    ]
    lt2_history.append(float(lt2_power))
    stability = _historical_stability([value for value in lt2_history if value is not None])
    history_score = round(_clamp(0.28 + min(history_depth, 6) * 0.1, 0.28, 0.88), 2)

    cautions: list[str] = []
    lt1_power = _threshold_attr(lt1, "power_watts")
    if lt1_power is not None and lt2_power:
        ratio = float(lt1_power) / float(lt2_power) if float(lt2_power) > 0 else 0.8
        endurance_score = round(_clamp((ratio - 0.72) / 0.18, 0.0, 1.0), 2)
    else:
        endurance_score = 0.55
        cautions.append("Sin LT1 ciclista comparable, el ajuste de durabilidad se conserva en una zona neutra.")

    if history_depth < 3:
        cautions.append("Historico corto para estabilizar FTP y VO2max estimados.")
    if agreement < 0.55:
        cautions.append("La referencia fisiologica y la practica cronica difieren mas de lo deseable; se amplian margenes.")

    base_confidence = round(
        _clamp(
            mean([item["confidence"] for item in anchors]) * 0.5
            + stability * 0.2
            + agreement * 0.16
            + history_score * 0.14,
            0.4,
            0.92,
        ),
        2,
    )

    calculation_steps = [
        "Se usa LT2 ciclista como ancla principal de carga sostenible.",
    ]
    if practical_power is not None:
        calculation_steps.append("Se mezcla con LT2 practico cronico para reducir dependencia del ultimo test.")
    calculation_steps.append("Se ajusta el factor FTP segun cercania LT1-LT2 y robustez del historico.")

    confidence_factors = [
        {
            "label": "acuerdo_anclas",
            "score": agreement,
            "weight": 0.16,
            "explanation": "Cuanto mas convergen LT2 fisiologico y LT2 practico, menor dispersion del resultado.",
        },
        {
            "label": "estabilidad_historica",
            "score": stability,
            "weight": 0.2,
            "explanation": "Menos variacion entre cortes comparables aumenta confianza.",
        },
        {
            "label": "profundidad_historica",
            "score": history_score,
            "weight": 0.14,
            "explanation": "Mas referencias ciclistas comparables hacen mas defendible la estimacion.",
        },
    ]

    return {
        "reference_power": round(reference_power, 1),
        "agreement_score": agreement,
        "stability_score": stability,
        "history_score": history_score,
        "endurance_score": endurance_score,
        "base_confidence": base_confidence,
        "anchors": anchors,
        "cautions": cautions,
        "calculation_steps": calculation_steps,
        "confidence_factors": confidence_factors,
    }


def _running_estimates(
    athlete: Athlete,
    snapshot_date: date,
    power_source: Optional[str],
    history_depth: int,
    inputs: dict[str, Any],
) -> list[dict[str, Any]]:
    reference_speed = inputs["reference_speed_kph"]
    endurance_score = inputs["endurance_score"]
    anaerobic_bias = 1 - endurance_score
    estimates: list[dict[str, Any]] = []
    base_variables = [
        "lt2_pace",
        "practical_lt2_chronic_pace",
        "lt1_lt2_gap",
        "historical_stability",
        "history_depth",
    ]

    for estimate_type, config in RUNNING_EVENT_CONFIG.items():
        multiplier = (
            config["base_multiplier"]
            + endurance_score * config["endurance_bonus"]
            + anaerobic_bias * config["anaerobic_bonus"]
        )
        pace = _speed_kph_to_pace(reference_speed * multiplier)
        if pace is None:
            continue
        spread = config["base_spread"] + (1 - inputs["agreement_score"]) * 0.045 + (1 - inputs["stability_score"]) * 0.035
        if history_depth < 3:
            spread += 0.015
        if estimate_type in {"HM", "Maratón"} and inputs["lt1_missing"]:
            spread += 0.02 if estimate_type == "HM" else 0.03
        spread = round(_clamp(spread, 0.025, 0.12), 3)

        confidence = inputs["base_confidence"] - config["confidence_penalty"]
        if estimate_type == "Maratón" and inputs["lt1_missing"]:
            confidence -= 0.04
        confidence = round(_clamp(confidence, 0.35, 0.91), 2)

        range_summary = (
            f"Rango abierto por acuerdo entre anclas ({round(inputs['agreement_score'] * 100)}%), "
            f"estabilidad historica ({round(inputs['stability_score'] * 100)}%) y profundidad de evidencia ({history_depth} cortes)."
        )
        explanation = (
            "Prediccion explicable desde LT2 fisiologico y LT2 practico cronico, ajustada por perfil LT1-LT2 y estabilidad del historico."
        )
        cautions = list(inputs["cautions"])
        if estimate_type == "Maratón" and history_depth < 4:
            cautions.append("Maraton necesita mas respaldo longitudinal que 5K o 10K; conviene confirmarla con trabajo especifico.")

        estimates.append(
            _estimate_payload(
                estimate_type=estimate_type,
                discipline="running",
                power_source=power_source,
                value=pace,
                unit="s/km",
                confidence=confidence,
                snapshot_date=snapshot_date,
                variables_used=base_variables,
                evidence_points=history_depth,
                explanation=explanation,
                spread=spread,
                method_used="blended_lt2_endurance_profile_v2",
                primary_anchor="lt2_blended_reference",
                agreement_score=inputs["agreement_score"],
                range_summary=range_summary,
                calculation_steps=list(inputs["calculation_steps"]),
                cautions=cautions,
                anchors=list(inputs["anchors"]),
                confidence_factors=list(inputs["confidence_factors"]),
            )
        )

    threshold_fraction = 0.86 + endurance_score * 0.04
    speed_m_per_min = reference_speed * 1000 / 60
    vvo2_speed_m_per_min = speed_m_per_min / threshold_fraction
    vo2max = 0.2 * vvo2_speed_m_per_min + 3.5
    vo2_margin = 2.0 + (1 - inputs["agreement_score"]) * 2.4 + (1 - inputs["stability_score"]) * 1.8 + (0.88 - inputs["history_score"]) * 1.2
    vo2_margin = _clamp(vo2_margin, 1.8, 5.5)
    estimates.append(
        _estimate_payload(
            estimate_type="VO2max",
            discipline="running",
            power_source=power_source,
            value=vo2max,
            unit="ml/kg/min",
            confidence=_clamp(inputs["base_confidence"] - 0.03, 0.4, 0.92),
            snapshot_date=snapshot_date,
            variables_used=["lt2_pace", "lt1_pace", "historical_stability", "history_depth"],
            evidence_points=history_depth,
            explanation="VO2max estimado desde velocidad asociada a LT2, fraccion de vVO2 inferida por el perfil LT1-LT2 y control longitudinal.",
            lower_bound=vo2max - vo2_margin,
            upper_bound=vo2max + vo2_margin,
            method_used="lt2_to_vvo2_proxy_v2",
            primary_anchor="lt2_blended_reference",
            agreement_score=inputs["agreement_score"],
            range_summary="El margen combina error fisiologico del proxy LT2->vVO2 con acuerdo entre anclas y estabilidad del historico.",
            calculation_steps=[
                "Se transforma el ritmo de referencia en velocidad real de carrera.",
                "Se estima que LT2 ocurre en torno al 86-90% de la vVO2 segun el perfil de resistencia del atleta.",
                "Se aplica la ecuacion energetica de carrera en m/min para obtener VO2max estimado.",
            ],
            cautions=list(inputs["cautions"]),
            anchors=list(inputs["anchors"]),
            confidence_factors=list(inputs["confidence_factors"]),
        )
    )

    lt2_gap = max(0.0, 1 - endurance_score)
    vlamax = _clamp(0.28 + lt2_gap * 0.38, 0.25, 0.95)
    estimates.append(
        _estimate_payload(
            estimate_type="VLAMAX",
            discipline="running",
            power_source=power_source,
            value=vlamax,
            unit="mmol/L/s",
            confidence=_clamp(inputs["base_confidence"] - 0.16, 0.3, 0.8),
            snapshot_date=snapshot_date,
            variables_used=["lt1_lactate", "lt2_lactate", "lt1_lt2_gap", "history_depth"],
            evidence_points=history_depth,
            explanation="Proxy glucolitico conservador derivado del salto LT1-LT2 y del sesgo hacia esfuerzos cortos frente a sostenidos.",
            spread=0.12 if history_depth >= 3 else 0.18,
            method_used="lt_gap_glycolytic_proxy_v1",
            primary_anchor="lt1_lt2_gap",
            agreement_score=inputs["agreement_score"],
            range_summary="Proxy orientativo; conviene no interpretarlo como medicion directa de VLaMax.",
            calculation_steps=[
                "Se observa la separacion LT1-LT2 como senal indirecta del perfil glucolitico.",
                "Se reduce la agresividad del ajuste cuando falta historico o LT1 es menos robusto.",
            ],
            cautions=list(inputs["cautions"]) + ["VLaMax sigue siendo una aproximacion indirecta mientras no exista protocolo especifico."],
            anchors=list(inputs["anchors"]),
            confidence_factors=list(inputs["confidence_factors"]),
        )
    )

    return estimates


def _cycling_estimates(
    athlete: Athlete,
    snapshot_date: date,
    power_source: Optional[str],
    history_depth: int,
    inputs: dict[str, Any],
) -> list[dict[str, Any]]:
    reference_power = inputs["reference_power"]
    endurance_score = inputs["endurance_score"]
    estimates: list[dict[str, Any]] = []

    ftp_factor = 0.92 + endurance_score * 0.04
    ftp = reference_power * ftp_factor
    ftp_spread = 0.028 + (1 - inputs["agreement_score"]) * 0.04 + (1 - inputs["stability_score"]) * 0.03
    if history_depth < 3:
        ftp_spread += 0.015
    ftp_spread = round(_clamp(ftp_spread, 0.025, 0.09), 3)
    estimates.append(
        _estimate_payload(
            estimate_type="FTP",
            discipline="ciclismo",
            power_source=power_source,
            value=ftp,
            unit="W",
            confidence=_clamp(inputs["base_confidence"] - 0.02, 0.42, 0.92),
            snapshot_date=snapshot_date,
            variables_used=["lt2_power", "practical_lt2_chronic_power", "lt1_lt2_gap", "history_depth"],
            evidence_points=history_depth,
            explanation="FTP derivado de LT2 fisiologico y LT2 practico cronico con ajuste conservador por durabilidad LT1-LT2.",
            spread=ftp_spread,
            method_used="blended_lt2_ftp_proxy_v2",
            primary_anchor="lt2_blended_reference",
            agreement_score=inputs["agreement_score"],
            range_summary="El margen aumenta si el historico es corto o si LT2 fisiologico y practico no convergen.",
            calculation_steps=list(inputs["calculation_steps"]),
            cautions=list(inputs["cautions"]),
            anchors=list(inputs["anchors"]),
            confidence_factors=list(inputs["confidence_factors"]),
        )
    )

    athlete_weight = athlete.weight if athlete.weight and athlete.weight > 0 else None
    if athlete_weight:
        reference_wkg = reference_power / athlete_weight
        vo2max = 23 + reference_wkg * 8.5 + (1 - endurance_score) * 1.5
        vo2_margin = _clamp(2.4 + (1 - inputs["agreement_score"]) * 2.2 + (1 - inputs["stability_score"]) * 1.8, 2.0, 5.8)
        estimates.append(
            _estimate_payload(
                estimate_type="VO2max",
                discipline="ciclismo",
                power_source=power_source,
                value=vo2max,
                unit="ml/kg/min",
                confidence=_clamp(inputs["base_confidence"] - 0.05, 0.4, 0.9),
                snapshot_date=snapshot_date,
                variables_used=["lt2_power", "athlete_weight", "historical_stability", "history_depth"],
                evidence_points=history_depth,
                explanation="VO2max ciclista estimado desde W/kg de referencia en LT2 y calidad del soporte longitudinal.",
                lower_bound=vo2max - vo2_margin,
                upper_bound=vo2max + vo2_margin,
                method_used="lt2_wkg_vo2_proxy_v2",
                primary_anchor="lt2_blended_reference",
                agreement_score=inputs["agreement_score"],
                range_summary="Margen fisiologico ampliado cuando el LT2 practico y el LT2 fisiologico discrepan o el historico es corto.",
                calculation_steps=[
                    "Se mezcla LT2 fisiologico y LT2 practico cronico para obtener la potencia de referencia.",
                    "La potencia se relativiza por peso corporal actual para evitar sesgos absolutos.",
                    "El VO2max se aproxima desde W/kg con un margen dependiente del acuerdo entre anclas.",
                ],
                cautions=list(inputs["cautions"]),
                anchors=list(inputs["anchors"]),
                confidence_factors=list(inputs["confidence_factors"]),
            )
        )

    vlamax = _clamp(0.26 + (1 - endurance_score) * 0.36, 0.22, 0.92)
    estimates.append(
        _estimate_payload(
            estimate_type="VLAMAX",
            discipline="ciclismo",
            power_source=power_source,
            value=vlamax,
            unit="mmol/L/s",
            confidence=_clamp(inputs["base_confidence"] - 0.18, 0.3, 0.78),
            snapshot_date=snapshot_date,
            variables_used=["lt1_lactate", "lt2_lactate", "lt1_lt2_power_gap", "history_depth"],
            evidence_points=history_depth,
            explanation="Proxy glucolitico ciclista estimado desde separacion LT1-LT2 y sesgo del perfil de potencia.",
            spread=0.12 if history_depth >= 3 else 0.18,
            method_used="lt_gap_glycolytic_proxy_v1",
            primary_anchor="lt1_lt2_power_gap",
            agreement_score=inputs["agreement_score"],
            range_summary="VLaMax sigue siendo una lectura orientativa en ausencia de protocolo especifico.",
            calculation_steps=[
                "Se usa la distancia LT1-LT2 en potencia como indicador indirecto del perfil glucolitico.",
                "El resultado se modera si el historico o el acuerdo entre anclas es limitado.",
            ],
            cautions=list(inputs["cautions"]) + ["Este valor no sustituye una medicion especifica de VLaMax."],
            anchors=list(inputs["anchors"]),
            confidence_factors=list(inputs["confidence_factors"]),
        )
    )

    return estimates


def build_performance_estimates(
    athlete: Athlete,
    discipline: str,
    thresholds: list[Any],
    snapshot_date: date,
    history_depth: int,
    power_source: Optional[str] = None,
    dynamic_thresholds: Optional[dict[str, Any]] = None,
    snapshots: Optional[list[PhysiologicalSnapshot]] = None,
) -> list[dict[str, Any]]:
    snapshots = snapshots or []
    normalized_discipline = discipline or athlete.primary_discipline

    if normalized_discipline == "running":
        running_inputs = _running_prediction_inputs(
            thresholds=thresholds,
            dynamic_thresholds=dynamic_thresholds,
            snapshots=snapshots,
            discipline=normalized_discipline,
            power_source=power_source,
            history_depth=history_depth,
        )
        if not running_inputs:
            return []
        return _running_estimates(
            athlete=athlete,
            snapshot_date=snapshot_date,
            power_source=power_source,
            history_depth=max(1, history_depth),
            inputs=running_inputs,
        )

    if normalized_discipline == "ciclismo":
        cycling_inputs = _cycling_prediction_inputs(
            thresholds=thresholds,
            dynamic_thresholds=dynamic_thresholds,
            snapshots=snapshots,
            discipline=normalized_discipline,
            power_source=power_source,
            history_depth=history_depth,
        )
        if not cycling_inputs:
            return []
        return _cycling_estimates(
            athlete=athlete,
            snapshot_date=snapshot_date,
            power_source=power_source,
            history_depth=max(1, history_depth),
            inputs=cycling_inputs,
        )

    return []
