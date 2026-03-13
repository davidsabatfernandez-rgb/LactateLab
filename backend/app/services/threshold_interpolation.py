"""Interpolación de umbrales running → ciclismo via HR bridge.

Fase 1 (actual): Transferir HR de umbrales running a ciclismo con corrección.
  - La FC en LT2 ciclismo es ~5-10 bpm menor que en running
    (Millet et al. 2009, Hue et al. 1998: menor masa muscular activa en bici).
  - Resultado: umbrales de ciclismo expresados SOLO en HR, sin watts.

Fase 2 (futura): Cuando el atleta acumule entrenos de bici con potenciómetro + HR,
  correlacionar HR → watts para estimar potencia en esos umbrales.

Referencias:
  - Millet, Vleck & Bentley (2009). Sports Med, 39(3):179-206.
  - Hue et al. (1998). Can J Appl Physiol, 23(6):547-61.
  - Bijker et al. (2002). Eur J Appl Physiol, 87(6):556-61.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# ── Offset HR running → ciclismo (Millet 2009, Hue 1998) ────────────────────
# En ciclismo la FC a una misma intensidad metabólica es menor que en running:
# - Menos masa muscular activa (principalmente cuádriceps vs todo el cuerpo)
# - Posición sentada reduce el retorno venoso
# Rango en la literatura: 5-10 bpm. Usamos valores por nivel.
_HR_OFFSET: dict[str, int] = {
    "recreational": 10,   # Recreativos: más diferencia (menos adaptación)
    "trained":       7,   # Entrenados: offset intermedio
    "competitive":   5,   # Competitivos: muy adaptados a ambas modalidades
}
_HR_OFFSET_DEFAULT = 7


@dataclass
class InterpolatedCyclingThresholds:
    """Resultado de la interpolación running → ciclismo (solo HR)."""
    lt1_hr_cycling: Optional[int]         # HR estimada en LT1 ciclismo
    lt2_hr_cycling: Optional[int]         # HR estimada en LT2 ciclismo
    lt1_hr_running: Optional[int]         # HR original del test running
    lt2_hr_running: Optional[int]         # HR original del test running
    hr_offset_applied: int                # bpm restados
    lt1_power_watts: Optional[float]      # None hasta fase 2 (HR→power mapping)
    lt2_power_watts: Optional[float]      # None hasta fase 2
    confidence: float
    warnings: list[str] = field(default_factory=list)
    method_detail: str = ""


def interpolate_running_to_cycling(
    lt1_heart_rate: Optional[int] = None,
    lt2_heart_rate: Optional[int] = None,
    athlete_level: str = "trained",
) -> InterpolatedCyclingThresholds:
    """Interpola umbrales de running a ciclismo usando HR bridge.

    Toma la FC en LT1/LT2 del test de running y aplica una corrección
    de ~5-10 bpm (Millet 2009) para estimar la FC equivalente en ciclismo.

    No estima watts — eso requiere datos reales de potencia en bici (fase 2).

    Args:
        lt1_heart_rate: HR en LT1 del test de running.
        lt2_heart_rate: HR en LT2 del test de running.
        athlete_level: "recreational" | "trained" | "competitive".

    Returns:
        InterpolatedCyclingThresholds con HR estimadas y warnings.
    """
    warnings: list[str] = []
    offset = _HR_OFFSET.get(athlete_level, _HR_OFFSET_DEFAULT)

    lt1_cycling: Optional[int] = None
    lt2_cycling: Optional[int] = None

    if lt2_heart_rate is None and lt1_heart_rate is None:
        warnings.append(
            "Sin datos de frecuencia cardíaca en el test de running. "
            "No se pueden interpolar umbrales de ciclismo."
        )
        return InterpolatedCyclingThresholds(
            lt1_hr_cycling=None, lt2_hr_cycling=None,
            lt1_hr_running=None, lt2_hr_running=None,
            hr_offset_applied=offset,
            lt1_power_watts=None, lt2_power_watts=None,
            confidence=0.0,
            warnings=warnings,
            method_detail="sin_datos_hr",
        )

    # ── LT1 ──
    if lt1_heart_rate is not None:
        lt1_cycling = lt1_heart_rate - offset
        if lt1_heart_rate < 80 or lt1_heart_rate > 210:
            warnings.append(
                f"HR LT1 running ({lt1_heart_rate} bpm) fuera de rango fisiológico habitual."
            )
    else:
        warnings.append("Sin HR en LT1 running — solo se interpola LT2.")

    # ── LT2 ──
    if lt2_heart_rate is not None:
        lt2_cycling = lt2_heart_rate - offset
        if lt2_heart_rate < 100 or lt2_heart_rate > 220:
            warnings.append(
                f"HR LT2 running ({lt2_heart_rate} bpm) fuera de rango fisiológico habitual."
            )
    else:
        warnings.append("Sin HR en LT2 running — solo se interpola LT1.")

    # Validación cruzada
    if lt1_cycling is not None and lt2_cycling is not None:
        if lt1_cycling >= lt2_cycling:
            warnings.append(
                f"HR LT1 ({lt1_cycling} bpm) ≥ HR LT2 ({lt2_cycling} bpm) en ciclismo — "
                "verificar los datos del test de running."
            )

    # Confianza
    confidence = 0.55 if (lt1_cycling is not None and lt2_cycling is not None) else 0.40

    # Warning principal
    warnings.insert(0,
        f"Umbrales de ciclismo estimados desde HR de running "
        f"(−{offset} bpm, Millet 2009 / Hue 1998, nivel: {athlete_level}). "
        "Son zonas de FC orientativas. Para obtener potencia, se necesitan "
        "entrenamientos en bici con potenciómetro."
    )

    method_detail = (
        f"HR bridge: running HR −{offset} bpm "
        f"(Millet 2009, nivel {athlete_level})"
    )

    return InterpolatedCyclingThresholds(
        lt1_hr_cycling=lt1_cycling,
        lt2_hr_cycling=lt2_cycling,
        lt1_hr_running=lt1_heart_rate,
        lt2_hr_running=lt2_heart_rate,
        hr_offset_applied=offset,
        lt1_power_watts=None,   # Fase 2: cuando haya datos de potencia
        lt2_power_watts=None,
        confidence=round(confidence, 3),
        warnings=warnings,
        method_detail=method_detail,
    )
