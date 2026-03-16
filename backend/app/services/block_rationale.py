"""Rationale de bloques de entrenamiento y sistema de warnings de fiabilidad.

═══════════════════════════════════════════════════════════════════════════════
REFERENCIA CANÓNICA PARA CODEX / PLANNING ENGINE
═══════════════════════════════════════════════════════════════════════════════

NOTA METODOLÓGICA (Auditoría 1.2):
  La taxonomía de bloques (AEC/AEP/ANC/ANP) se basa en el framework de
  Jan Olbrecht ("The Science of Winning", 2000), ampliamente respetado en
  coaching de resistencia pero publicado principalmente en formato libro,
  no en journals peer-reviewed con RCTs.

  Meta-análisis disponibles (Molmen 2019, n=20 estudios; Frontiers Physiology
  2022) muestran efectos favorables pequeños de la periodización por bloques
  vs tradicional (SMD 0.40 VO2max), con calidad metodológica baja (PEDro 3.7/10).

  Por tanto, la selección de bloques es un MODELO EXPERTO FISIOLÓGICAMENTE
  FUNDAMENTADO, no una prescripción evidence-based de nivel RCT.
  El coach siempre tiene la última palabra y puede elegir otro bloque.

Este módulo es el punto central de definición de:

  1. BLOCK_RATIONALE       — Descripción científica de cada bloque (por qué,
                             qué entrena el atleta, qué adaptaciones esperar,
                             cuándo NO aplicarlo, cuánto dura).

  2. ReliabilityWarning    — Señales de incertidumbre del motor fisiológico
                             (datos interpolados, test obsoleto, gap borderline,
                             semanas insuficientes, etc.)

  3. generate_reliability_warnings() — Genera la lista de warnings dado el
                             contexto fisiológico y el resultado del análisis.

  4. generate_block_explanation()   — Genera la explicación contextual del
                             bloque recomendado: por qué ESTE atleta necesita
                             ESTE bloque AHORA, qué adaptaciones esperar, qué
                             vigilar, cuándo salir y qué bloque sigue.

CÓMO USARLO EN CODEX
─────────────────────
  from app.services.block_rationale import (
      BLOCK_RATIONALE,
      generate_reliability_warnings,
      generate_block_explanation,
      ReliabilityWarning,
      BlockExplanation,
  )

  # Obtener rationale genérico de un bloque:
  rationale = BLOCK_RATIONALE["aerobic_capacity_block"]
  print(rationale.summary_coach)       # resumen para el entrenador
  print(rationale.risk_if_wrong)       # cuándo NO aplicarlo
  print(rationale.training_description)# cómo entrena el atleta

  # Generar warnings de fiabilidad:
  warnings = generate_reliability_warnings(ctx, gap_result)
  for w in warnings:
      if w.severity == "critical":
          # bloquear prescripción o mostrar alerta roja
          pass

  # Generar explicación contextual (por qué ESTE atleta, AHORA):
  explanation = generate_block_explanation(ctx, gap_result)
  print(explanation.headline)          # 1 frase: por qué este bloque ahora
  print(explanation.why_now)           # párrafo con datos del atleta
  print(explanation.what_to_expect)    # adaptaciones esperadas
  print(explanation.what_to_watch)     # señales ✓ y ⚠ durante el bloque
  print(explanation.when_to_exit)      # cuándo terminar y qué bloque sigue
  print(explanation.alternative_if_wrong)  # si los datos cambian

REFERENCIAS CIENTÍFICAS BASE
─────────────────────────────
  - Olbrecht J. (2000). The Science of Winning. — modelo AEC/ANC/AEP/ANP.
  - Olbrecht J. (2011). Triathlon: swimming for winning. J. Hum. Sport Exerc.
  - Faude O. et al. (2009). Lactate threshold concepts. Sports Med.
  - Billat V. et al. (1994/2003). VO2max and lactate threshold in runners.
  - Laursen P. & Jenkins D. (2002). Ironman triathlon performance. Sports Med.
  - Dudley G. et al. (1982). Influence of exercise intensity on mitochondria.
  - Coyle E. (1988). Determinants of endurance in highly trained cyclists.
═══════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from app.services.physiological_engine import PhysiologicalContext, PhysiologicalGapResult


# ── Códigos de warning (usar siempre estas constantes, nunca strings libres) ──

W_INTERPOLATED_THRESHOLDS = "INTERPOLATED_THRESHOLDS"
# LT1/LT2 interpolados a 2.0/4.0 mmol desde curva cruda. No detectados por forma.
# Confianza ~0.60. El CapacityProfile no actúa. Decisión solo por gap analysis.

W_LOW_CONFIDENCE = "LOW_CONFIDENCE"
# Thresholds detectados pero con confianza < 0.75. Puede ser detector con pocos puntos
# o curva ruidosa. El perfil VO2max/VLamax opera en modo orientativo.

W_STALE_DATA_MILD = "STALE_DATA_MILD"
# Test de lactato entre 43 y 56 días. Adaptaciones recientes no reflejadas.
# Aceptable para base, arriesgado en specific/pre_comp.

W_STALE_DATA_CRITICAL = "STALE_DATA_CRITICAL"
# Test de lactato > 56 días en fase specific o pre_comp. Motor ya redirige
# a testing_decision_block, pero el warning queda registrado.

W_BORDERLINE_GAP = "BORDERLINE_GAP"
# El gap fisiológico está a ±15% del umbral de decisión. Una variación de
# ±0.2 km/h en el test (error típico de medición) podría cambiar el bloque.
# Olbrecht: "el test de lactato tiene precisión de ±1 s/100m en natación;
# en running el error puede ser mayor por factores técnicos."

W_INSUFFICIENT_WEEKS = "INSUFFICIENT_WEEKS"
# Semanas disponibles < MIN_WEEKS_FOR_BLOCK + 2. Las adaptaciones estructurales
# (Olbrecht: mitocondrias, capilares) necesitan tiempo que no hay.

W_NO_TARGET = "NO_TARGET"
# No hay objetivo de ritmo/potencia definido. La decisión se basa solo en
# fase temporal, sin gap analysis real. Menor precisión.

W_PROFILE_UNCERTAIN = "PROFILE_UNCERTAIN"
# CapacityProfile con confianza < 0.55 (thresholds interpolados o insuficientes).
# El proxy VO2max/VLamax no es fiable; el motor trabaja sin perfil de capacidades.

W_NO_LT1 = "NO_LT1"
# LT1 no disponible. Para eventos LT1-led (ironman, OW long, maratón recreativo)
# esto limita significativamente la precisión del análisis.

W_IMPLAUSIBLE_RATIO = "IMPLAUSIBLE_RATIO"
# Ratio LT1/LT2 fuera del rango fisiológico esperado (< 0.55 o > 1.05).
# Posible error de medición, protocolo incorrecto o sesión atípica.

W_SINGLE_DISCIPLINE = "SINGLE_DISCIPLINE"
# Atleta de triatlón analizado solo con una disciplina. El brick effect
# (fatiga acumulada nado+bici sobre el running) no está modelado.


# ── Severidades ──────────────────────────────────────────────────────────────
SEV_INFO     = "info"      # información contextual, no bloquea
SEV_WARNING  = "warning"   # señal amarilla: revisar antes de prescribir
SEV_CRITICAL = "critical"  # señal roja: no prescribir sin resolver primero


@dataclass
class ReliabilityWarning:
    """Señal de incertidumbre o riesgo en la prescripción del motor fisiológico."""

    code: str           # una de las constantes W_* definidas arriba
    severity: str       # SEV_INFO | SEV_WARNING | SEV_CRITICAL
    message: str        # mensaje legible por el entrenador
    actionable: str     # qué hacer para resolver el warning


# ── Rationale de bloque ───────────────────────────────────────────────────────

@dataclass
class BlockRationale:
    """Descripción científica completa de un bloque de entrenamiento.

    Todos los campos están orientados al entrenador, no al atleta.
    Para mensajes de UI, usar summary_coach y risk_if_wrong.
    Para explicación profunda, usar physiological_goal + expected_timeline.
    """

    block_key: str
    display_name: str           # nombre para UI
    olbrecht_class: str         # AEC | AEP | ANC | ANP | ESPECÍFICO | RECUPERACIÓN | TEST
    summary_coach: str          # 1-2 frases: qué es y cuándo se usa
    physiological_goal: str     # qué adaptación buscamos a nivel biológico
    training_description: str   # cómo entrena el atleta (volumen, intensidad, tipo)
    expected_timeline: str      # cuándo ver resultados
    ideal_context: str          # cuándo aplicar (fase, perfil, condición)
    risk_if_wrong: str          # qué pasa si se aplica mal o en el momento incorrecto
    min_weeks: int              # duración mínima para ver adaptación
    max_weeks: int              # duración máxima antes de rendimiento decreciente
    science_refs: list[str] = field(default_factory=list)


def _compact_text(value: str, max_len: int = 220) -> str:
    normalized = " ".join(value.split())
    if len(normalized) <= max_len:
        return normalized
    return f"{normalized[: max_len - 1].rstrip()}…"


def rationale_fit_messages(block_key: str) -> list[str]:
    """Mensajes cortos para explicar por qué un bloque puede encajar.

    Están pensados para UI y auditoría, no para sustituir el scoring cuantitativo.
    """
    rationale = BLOCK_RATIONALE.get(block_key)
    if not rationale:
        return []

    return [
        _compact_text(rationale.summary_coach, 180),
        f"Contexto ideal: {_compact_text(rationale.ideal_context, 200)}",
        f"Ventana útil: {rationale.min_weeks}-{rationale.max_weeks} semanas. {_compact_text(rationale.expected_timeline, 170)}",
    ]


def rationale_risk_messages(block_key: str) -> list[str]:
    """Mensajes cortos para explicar cuándo ese bloque no sería tan buena idea."""
    rationale = BLOCK_RATIONALE.get(block_key)
    if not rationale:
        return []

    return [
        f"Si lo aplicas mal: {_compact_text(rationale.risk_if_wrong, 220)}",
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# BLOCK_RATIONALE — Referencia canónica de bloques
# Fuente principal: Olbrecht (2000) The Science of Winning, capítulos 2-8
# ═══════════════════════════════════════════════════════════════════════════════

BLOCK_RATIONALE: dict[str, BlockRationale] = {

    "aerobic_capacity_block": BlockRationale(
        block_key="aerobic_capacity_block",
        display_name="Bloque de Capacidad Aeróbica",
        olbrecht_class="AEC",
        summary_coach=(
            "Construye la base metabólica del atleta aumentando VO2max y la densidad "
            "mitocondrial. Es el bloque más importante del base y el que más tiempo necesita."
        ),
        physiological_goal=(
            "Aumentar el número y tamaño de mitocondrias en fibras lentas (tipo I) y "
            "fibras rápidas oxidativas (tipo IIa). Mejorar la densidad capilar, los "
            "sustratos oxidativos y la capacidad de transporte de O2. En perfiles con "
            "VLamax alta, el alto volumen suprime temporalmente la glucólisis (Olbrecht: "
            "'high mileage reduces anaerobic capacity temporarily')."
        ),
        training_description=(
            "Alto volumen a intensidad baja-media (zona 1-2), con 'spices' breves e "
            "intensos (20-30s all-out o aceleraciones cortas) al INICIO de la sesión, "
            "seguidos de larga extensión de baja intensidad. Intervalos largos con poco "
            "descanso. Sesiones de recuperación regenerativa entre días de carga. "
            "Olbrecht: 'aerobic capacity training = low intensity spiced with a few "
            "short, intense stimuli at the beginning of the workout'."
        ),
        expected_timeline=(
            "5-6 semanas para cambios medibles en LT1/LT2 vía test de lactato. "
            "Adaptaciones estructurales (mitocondrias, capilares) requieren 6-8 semanas. "
            "Un bloque de <4 semanas produce ganancias transitorias que se pierden rápido "
            "(Olbrecht: 'half the mitochondrial gain lost in 1 week of detraining')."
        ),
        ideal_context=(
            "Fase base_early (>28 semanas al objetivo): siempre. "
            "Fase base_late: cuando LT1 tiene déficit o el perfil VO2max/VLamax lo requiere. "
            "Cualquier fase: cuando LT1/LT2 ratio < 0.75 (VLamax alta, thin ice). "
            "Maratón o Ironman: casi siempre hasta 12-16 semanas del objetivo."
        ),
        risk_if_wrong=(
            "Aplicado en specific/pre_comp: el atleta pierde la 'sharpness' competitiva "
            "y llega apagado a la competición. "
            "Aplicado con demasiadas intensidades (spices excesivos): sube VLamax en vez "
            "de suprimirla, agravando el problema en atletas con sesgo glucolítico. "
            "Demasiado corto (<4 semanas): las adaptaciones estructurales no se consolidan "
            "y el atleta destrains rápido al reducir carga."
        ),
        min_weeks=5,
        max_weeks=10,
        science_refs=[
            "Olbrecht 2000 — The Science of Winning, ch. 2-4",
            "Dudley et al. 1982 — Mitochondrial density and training intensity",
            "Faude et al. 2009 — Lactate threshold concepts. Sports Med.",
        ],
    ),

    "threshold_development_block": BlockRationale(
        block_key="threshold_development_block",
        display_name="Bloque de Desarrollo de Umbral",
        olbrecht_class="AEC→AEP",
        summary_coach=(
            "Desplaza el LT2/MLSS hacia la velocidad objetivo aumentando la capacidad "
            "de aclaramiento de lactato y la tolerancia al trabajo subumbral sostenido."
        ),
        physiological_goal=(
            "Elevar la velocidad/potencia a la que se alcanza el estado estable máximo "
            "de lactato (MLSS/LT2). Mejorar la actividad de enzimas oxidativas en fibras "
            "tipo IIa y la eficiencia del metabolismo del lactato como sustrato energético. "
            "En Olbrecht: transición de construir VO2max a maximizar su utilización."
        ),
        training_description=(
            "Intervalos en LT2 o ligeramente por encima (cruise intervals, intervalos "
            "de umbral, series continuas al ritmo de umbral). Alto tiempo acumulado en "
            "zona de umbral por sesión. Descansos cortos. Faude 2009: 'MLSS training is "
            "the most potent stimulus for threshold development'."
        ),
        expected_timeline=(
            "3-5 semanas para un desplazamiento medible del LT2. Efectos visibles en "
            "test de lactato tras 4 semanas de carga bien ejecutada."
        ),
        ideal_context=(
            "Fase base_late (20-28 semanas): cuando LT1/LT2 ratio ≥ 0.75 y LT2 es el "
            "limitante claro. "
            "Fase specific (12-20 semanas): el bloque más común en esta fase. "
            "Perfiles con VLamax moderada-alta y gap LT2 > 0.5 km/h. "
            "Nunca antes de que la base aeróbica esté construida (ratio < 0.75 = thin ice)."
        ),
        risk_if_wrong=(
            "Aplicado con base débil (LT1/LT2 ratio < 0.75): el trabajo de umbral "
            "estimula la glucólisis (VLamax sube) en vez de la capacidad aeróbica, "
            "agravando el desequilibrio. Olbrecht: 'thin ice — como andar sobre hielo "
            "fino: a dosis pequeñas no pasa nada, pero si se excede, el hielo se rompe'. "
            "Aplicado demasiado cerca de la competición: atleta llega en carga, sin "
            "frescura para el taper."
        ),
        min_weeks=4,
        max_weeks=7,
        science_refs=[
            "Olbrecht 2000 — The Science of Winning, ch. 6",
            "Faude et al. 2009 — Lactate threshold concepts. Sports Med.",
            "Billat V. et al. 1994 — Use of blood lactate concentrations. Sports Med.",
        ],
    ),

    "aerobic_power_block": BlockRationale(
        block_key="aerobic_power_block",
        display_name="Bloque de Potencia Aeróbica",
        olbrecht_class="AEP",
        summary_coach=(
            "Afina la utilización del VO2max en condiciones de competición. Es el bloque "
            "de 'fine-tuning': la capacidad ya está construida, ahora se maximiza su uso."
        ),
        physiological_goal=(
            "Maximizar el porcentaje de VO2max que el atleta puede sostener durante la "
            "prueba objetivo. Mejorar la economía metabólica a ritmo de carrera. "
            "Olbrecht: 'aerobic power = the extent to which the athlete uses his aerobic "
            "capacity during competition'. Es el puente entre capacidad y rendimiento real."
        ),
        training_description=(
            "Intervalos a ritmo de competición o ligeramente más rápido. Descanso corto "
            "(5-15 segundos). Distancia de repetición cercana a la distancia de competición. "
            "Progresión: inicialmente distancias más largas con algo más de descanso; "
            "acercándose a la competición, acortar el descanso manteniendo la velocidad. "
            "Olbrecht: 'aerobic power sets look easy but elite athletes can only tolerate "
            "them 1-2 times per week'."
        ),
        expected_timeline=(
            "3-4 semanas. Resultados visibles en rendimiento competitivo más que en "
            "test de lactato (el LT2 puede no subir, pero el atleta rinde mejor)."
        ),
        ideal_context=(
            "Perfil: alta capacidad aeróbica + baja VLamax (diesel). "
            "Gap LT2 ≤ 0.25 km/h (ya cerca del objetivo). "
            "Fase specific tardía o pre_comp. "
            "Base_late con LT2 ya en rango (F3). "
            "El atleta tiene el motor — necesita aprender a usarlo en carrera."
        ),
        risk_if_wrong=(
            "Aplicado con LT2 aún muy lejos del objetivo: el atleta entrena al ritmo "
            "equivocado y consolida un patrón de rendimiento subóptimo. "
            "Aplicado en base_early: sacrifica la construcción estructural por un pico "
            "de forma prematuro que no durará. Olbrecht: 'aerobic power training is only "
            "useful once the aerobic capacity has been fully developed'."
        ),
        min_weeks=3,
        max_weeks=5,
        science_refs=[
            "Olbrecht 2000 — The Science of Winning, ch. 7-8",
            "Billat V. 2001 — Interval training for performance. Sports Med.",
        ],
    ),

    "competition_specific_block": BlockRationale(
        block_key="competition_specific_block",
        display_name="Bloque Específico de Competición",
        olbrecht_class="AEP+ANP",
        summary_coach=(
            "Transfiere la capacidad fisiológica construida al gesto, ritmo y condiciones "
            "específicas de la prueba objetivo. La fisiología ya está lista; toca practicar "
            "la carrera."
        ),
        physiological_goal=(
            "Especificidad neuromuscular y metabólica: el atleta practica el patrón exacto "
            "de esfuerzo de la competición. Ajuste fino del sistema nervioso, estrategia de "
            "ritmo, gestión de la fatiga en condiciones reales."
        ),
        training_description=(
            "Simulaciones de carrera, intervalos al ritmo exacto de competición con "
            "condiciones específicas (wetsuit, terreno, estrategia de drafting en triatlón). "
            "Reducción progresiva de volumen manteniendo la intensidad (taper fisiológico). "
            "Máxima especificidad al deporte y la distancia objetivo."
        ),
        expected_timeline=(
            "2-4 semanas. El atleta debería sentirse 'listo' a los 10-14 días. "
            "Más de 4 semanas en este bloque sin competición produce estancamiento."
        ),
        ideal_context=(
            "Fase pre_comp o taper. "
            "LT2 gap ≤ 0.25 km/h (fisiología compatible con el objetivo). "
            "Atleta ha completado al menos un bloque de threshold + aerobic_power previos. "
            "3-8 semanas al objetivo (según distancia)."
        ),
        risk_if_wrong=(
            "Aplicado con gap LT2 grande: el atleta 'practica el fracaso' — consolida "
            "un rendimiento por debajo de su potencial real. "
            "Demasiado largo (>5 semanas): detraining de la capacidad aeróbica base, "
            "el atleta llega a la competición 'apagado' por arriba. "
            "Olbrecht: 'competition specific training cannot compensate for a physiological "
            "deficit; it only transfers what is already there'."
        ),
        min_weeks=2,
        max_weeks=5,
        science_refs=[
            "Olbrecht 2000 — The Science of Winning, ch. 8-9",
            "Hausswirth C. & Mujika I. (2013). Recovery for Performance in Sport.",
        ],
    ),

    "recovery_consolidation_block": BlockRationale(
        block_key="recovery_consolidation_block",
        display_name="Bloque de Recuperación y Consolidación",
        olbrecht_class="RECUPERACIÓN",
        summary_coach=(
            "Permite que las adaptaciones del bloque anterior se consoliden y reduce "
            "la carga acumulada antes del siguiente estímulo."
        ),
        physiological_goal=(
            "Supercompensación: el cuerpo responde a la reducción de carga consolidando "
            "las adaptaciones inducidas. Restauración del glucógeno, reparación tisular, "
            "reducción de marcadores de fatiga. Olbrecht: 'recovery training strongly "
            "stimulates improvements in aerobic capacity'."
        ),
        training_description=(
            "Muy fácil, bajo volumen, sin intensidad. Técnica y habilidad. "
            "1-2 sesiones de calidad muy suaves por semana. "
            "El objetivo es moverse, no estresar el sistema."
        ),
        expected_timeline=(
            "1-2 semanas. Más de 2 semanas se convierte en detraining "
            "(Olbrecht: mitocondrias empiezan a perderse a partir de los 5-7 días)."
        ),
        ideal_context=(
            "Entre bloques duros de >5 semanas. "
            "Tras competición importante. "
            "Señal de sobreentrenamiento (HRV baja, rendimiento estancado). "
            "Inicio de nueva macrociclo (transición)."
        ),
        risk_if_wrong=(
            "Demasiado largo: detraining real. "
            "Con demasiada intensidad: no hay recuperación real y el atleta empieza "
            "el siguiente bloque sin haber supercompensado."
        ),
        min_weeks=1,
        max_weeks=2,
        science_refs=[
            "Olbrecht 2000 — The Science of Winning, ch. 3 (detraining)",
            "Mujika I. & Padilla S. (2000). Detraining: loss of training-induced "
            "physiological and performance adaptations. Sports Med.",
        ],
    ),

    "anaerobic_capacity_block": BlockRationale(
        block_key="anaerobic_capacity_block",
        display_name="Bloque de Capacidad Anaeróbica",
        olbrecht_class="ANC",
        summary_coach=(
            "Desarrolla la capacidad glucolítica (VLamax) del atleta. Indicado para perfiles "
            "diesel (VLamax baja) en pruebas cortas donde la glucólisis es co-determinante. "
            "Los cambios en ANC son lentos — semanas a meses — y parcialmente innatos (Olbrecht)."
        ),
        physiological_goal=(
            "Aumentar la tasa máxima de producción de lactato (VLamax/ANC). "
            "Estimular fibras rápidas glucolíticas (tipo IIb/IIx) para aumentar la capacidad "
            "de producir energía en esfuerzos supramáximos cortos. "
            "Olbrecht: 'ANC importante para media distancia y para tolerar cargas de entrenamiento "
            "altas; el atleta con baja ANC no tiene señal de aviso de fatiga y entra en "
            "sobreentrenamiento fácilmente'."
        ),
        training_description=(
            "Intervalos CORTOS (15-60s), intensidad all-out o casi all-out desde el inicio. "
            "Descanso LARGO (≥ tiempo de esfuerzo, preferiblemente pasivo). "
            "Olbrecht checklist ANC: (1) intervalos 25-50m, (2) casi-máximo para VLamax alta, "
            "máximo para VLamax baja, (3) descanso ≥ doble del tiempo de esfuerzo. "
            "En running: strides 15-20s all-out, hill sprints cortos. "
            "Volumen bajo por sesión — los ANC actúan como 'spice' dentro del AEC."
        ),
        expected_timeline=(
            "Cambios innatos en VLamax: 6-18 meses. "
            "Fluctuaciones temporales en ANC (volumen alto las reduce, intensidad las sube): "
            "visibles en 3-5 semanas. "
            "Olbrecht: 'the ANC can be temporarily modified within a mesocycle but "
            "intrinsic changes take 1-2 years'."
        ),
        ideal_context=(
            "Perfil VLamax baja (ratio LT1/LT2 > 0.87) con capacidad aeróbica moderate/alta. "
            "Eventos cortos: 5k, 10k, sprint tri, pool 400m, hill climb. "
            "Fase base_late: introducir ANC antes de entrar en fase específica. "
            "Como 'spice' dentro de AEC en cualquier fase de base."
        ),
        risk_if_wrong=(
            "Aplicado con VLamax ya ALTA (ratio < 0.79): aumenta la glucólisis cuando ya es "
            "excesiva — penaliza sostenibilidad en eventos largos y destruye la AEP. "
            "Olbrecht: 'as ANC increases, it becomes increasingly difficult to build AEP'. "
            "Demasiado volumen de ANC: puede sobreestimular glucólisis y comprometer la AEC. "
            "En atletas con VLamax alta: contraindicado — usar volumen extensivo para suprimir."
        ),
        min_weeks=4,
        max_weeks=6,
        science_refs=[
            "Olbrecht 2000 — The Science of Winning, ch. 2-3 (ANC classification)",
            "Mader A. (1984) — Glycolytic activity during exercise. Int J Sports Med.",
            "Faude et al. (2009) — Lactate threshold concepts. Sports Med.",
        ],
    ),

    "anaerobic_power_block": BlockRationale(
        block_key="anaerobic_power_block",
        display_name="Bloque de Potencia Anaeróbica",
        olbrecht_class="ANP",
        summary_coach=(
            "Afina la expresión máxima de velocidad y la tolerancia a la acidosis en la "
            "fase pre-competición. Solo para pruebas cortas e intensas (5k, 10k, sprint tri). "
            "Olbrecht: efectos visibles en 10-17 días en atletas con ANC moderada."
        ),
        physiological_goal=(
            "Maximizar la utilización de la capacidad anaeróbica (VLamax) en condiciones "
            "de competición. Desarrollar tolerancia a la acidosis (buffering de H+). "
            "Olbrecht: 'ANP toughens the swimmer against acidosis — this adaptation "
            "can be completed quite quickly (2 weeks)'."
        ),
        training_description=(
            "Velocidad MÁXIMA desde el primer repetición. Distancias muy cortas. "
            "Descanso mínimo (5-10 segundos). Volumen total muy bajo (125-250m equivalente). "
            "Olbrecht checklist ANP: (1) máxima velocidad, (2) distancias cortas, "
            "(3) muy poco descanso, (4) total set muy bajo. "
            "En running: sprints 50-100m máximos, flying runs, aceleraciones de carrera. "
            "Olbrecht recomienda 2×2 semanas con 1 semana de baja intensidad entre ellas."
        ),
        expected_timeline=(
            "Atletas con ANC moderada: efectos claros en 10-17 días. "
            "Atletas con ANC alta: 4 semanas para efecto completo. "
            "Olbrecht: 'compared to AEP which takes up to 4 weeks, ANP changes much more quickly'."
        ),
        ideal_context=(
            "Fase pre_comp EXCLUSIVAMENTE. "
            "Eventos cortos: 5k, 10k, sprint tri, pool 400m, hill climb, road race. "
            "SOLO para atletas con ANC suficiente (ratio LT1/LT2 < 0.87). "
            "Después de haber completado un bloque de AEC + ANC + AEP en la macrotemporada."
        ),
        risk_if_wrong=(
            "Aplicado en base_early o base_late: destruye la AEC antes de construirla. "
            "Olbrecht: 'ANP training drives aerobic capacity lower if the rest of the "
            "training is not slow enough'. "
            "Aplicado en eventos largos (maratón, ironman, 70.3): el atleta llega a la "
            "competición con VLamax disparada — penaliza la sostenibilidad catastrófica. "
            "Más de 2-3 semanas consecutivas: 'carries more risks than advantages' (Olbrecht)."
        ),
        min_weeks=2,
        max_weeks=3,
        science_refs=[
            "Olbrecht 2000 — The Science of Winning, ch. 2 (ANP classification)",
            "Billat V. et al. (1994) — Lactate and anaerobic power. Sports Med.",
        ],
    ),

    "testing_decision_block": BlockRationale(
        block_key="testing_decision_block",
        display_name="Repetir Test Antes de Decidir",
        olbrecht_class="TEST",
        summary_coach=(
            "Los datos disponibles no son suficientemente fiables para prescribir un "
            "bloque con garantías. El primer paso es hacer un test de lactato limpio."
        ),
        physiological_goal=(
            "No aplica — no es un bloque de entrenamiento. "
            "El objetivo es obtener datos fiables (LT1/LT2 actuales) para poder "
            "hacer un gap analysis real y recomendar el bloque correcto."
        ),
        training_description=(
            "Mantener el entrenamiento habitual mientras se programa el test. "
            "Protocolo recomendado: test de lactato escalonado (5-8 etapas, 3-5 min "
            "por etapa, muestra al final de cada etapa). "
            "Condiciones: bien descansado, sin carga fuerte en las 48h previas."
        ),
        expected_timeline=(
            "Resultado inmediato tras el test. "
            "El análisis de los umbrales puede tardar 24-48h si se envían al laboratorio."
        ),
        ideal_context=(
            "Test de >56 días en fase specific/pre_comp. "
            "Confianza en los thresholds < 0.60 (solo curva sin detección). "
            "Primera toma de contacto con el atleta (sin datos previos). "
            "Cambio drástico de rendimiento inexplicado."
        ),
        risk_if_wrong=(
            "Prescribir un bloque sin test fiable: el entrenador trabaja con un mapa "
            "incorrecto. El atleta puede estar en un estado fisiológico muy diferente "
            "al que los datos obsoletos indican."
        ),
        min_weeks=0,
        max_weeks=1,
        science_refs=[
            "Faude et al. 2009 — Lactate threshold concepts. Sports Med.",
            "Olbrecht 2000 — The Science of Winning, ch. 5 (test protocols)",
        ],
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
# generate_reliability_warnings — Sistema de warnings de fiabilidad
# ═══════════════════════════════════════════════════════════════════════════════

def generate_reliability_warnings(
    ctx: "PhysiologicalContext",
    gap_result: "PhysiologicalGapResult",
) -> list[ReliabilityWarning]:
    """Genera lista de warnings de fiabilidad para una prescripción.

    Evalúa la calidad de los datos, el gap borderline, el tiempo disponible
    y la fiabilidad del perfil VO2max/VLamax. Cada warning tiene un código,
    severidad y mensaje accionable para el entrenador.

    Args:
        ctx:        PhysiologicalContext del atleta.
        gap_result: PhysiologicalGapResult devuelto por analyse_physiological_gap.

    Returns:
        Lista ordenada por severidad: critical primero, luego warning, luego info.
    """
    warnings: list[ReliabilityWarning] = []
    unit = "W" if ctx.metric_type == "power_watts" else "km/h"

    # ── Thresholds interpolados (fuente más débil) ────────────────────────────
    is_interp_lt1 = ctx.lt1_confidence is not None and abs(ctx.lt1_confidence - 0.60) < 0.03
    is_interp_lt2 = ctx.lt2_confidence is not None and abs(ctx.lt2_confidence - 0.60) < 0.03
    if is_interp_lt1 or is_interp_lt2:
        warnings.append(ReliabilityWarning(
            code=W_INTERPOLATED_THRESHOLDS,
            severity=SEV_INFO,
            message=(
                "Los umbrales se han interpolado a los anclajes fisiológicos estándar "
                "(LT1=2.0 mmol, LT2=4.0 mmol) porque el detector no encontró un umbral "
                "claro en la curva de lactato. El gap analysis es orientativo."
            ),
            actionable=(
                "Realizar más tests de lactato para que el detector pueda identificar "
                "LT1/LT2 reales por forma de curva. Con 3-5 tests limpios la confianza "
                "subirá a ≥0.65 (básico) o ≥0.75 (real)."
            ),
        ))

    # ── Confianza baja (thresholds detectados pero poco fiables) ─────────────
    elif (
        (ctx.lt1_confidence is not None and ctx.lt1_confidence < 0.75) or
        (ctx.lt2_confidence is not None and ctx.lt2_confidence < 0.75)
    ):
        low_conf = min(
            ctx.lt1_confidence or 1.0,
            ctx.lt2_confidence or 1.0,
        )
        warnings.append(ReliabilityWarning(
            code=W_LOW_CONFIDENCE,
            severity=SEV_WARNING,
            message=(
                f"Confianza en los umbrales detectados: {low_conf:.0%}. "
                "Por debajo de 0.75, el perfil VO2max/VLamax (CapacityProfile) "
                "opera en modo orientativo y no puede sobrescribir el bloque. "
                "La recomendación se basa principalmente en el gap analysis."
            ),
            actionable=(
                "Repetir el test de lactato con protocolo limpio (bien descansado, "
                "sin carga en las 48h previas, buenas condiciones de medición). "
                "Los umbrales reales requieren ≥5 etapas con puntos bien distribuidos."
            ),
        ))

    # ── Test obsoleto leve (43-56 días) ──────────────────────────────────────
    if ctx.test_age_days is not None and 43 <= ctx.test_age_days <= 56:
        warnings.append(ReliabilityWarning(
            code=W_STALE_DATA_MILD,
            severity=SEV_WARNING,
            message=(
                f"El último test de lactato tiene {ctx.test_age_days} días. "
                "Las adaptaciones recientes (últimas 6 semanas) no están reflejadas. "
                "Aceptable en base, arriesgado en specific/pre_comp."
            ),
            actionable=(
                "Programar un test de lactato en las próximas 1-2 semanas, "
                "especialmente si el atleta ha completado un bloque de carga reciente."
            ),
        ))

    # ── Test obsoleto crítico (>56 días en fase crítica) ─────────────────────
    elif ctx.test_age_days is not None and ctx.test_age_days > 56:
        warnings.append(ReliabilityWarning(
            code=W_STALE_DATA_CRITICAL,
            severity=SEV_CRITICAL,
            message=(
                f"El último test tiene {ctx.test_age_days} días — más de 8 semanas. "
                "En fase {gap_result.season_phase} esto representa un riesgo real: "
                "el atleta puede haber cambiado su estado fisiológico significativamente."
            ),
            actionable=(
                "REPETIR TEST ANTES DE PRESCRIBIR. "
                "No prescribir ningún bloque basado en estos datos si estamos en "
                "specific o pre_comp."
            ),
        ))

    # ── Gap borderline ────────────────────────────────────────────────────────
    significant_gap = 0.5 if ctx.metric_type != "power_watts" else 18.0
    moderate_gap    = 0.25 if ctx.metric_type != "power_watts" else 8.0
    tolerance_sig   = 0.15 if ctx.metric_type != "power_watts" else 5.0
    tolerance_mod   = 0.10 if ctx.metric_type != "power_watts" else 3.0

    gap_ref = gap_result.lt2_gap_kmh if gap_result.lt2_gap_kmh is not None else gap_result.lt1_gap_kmh
    if gap_ref is not None:
        near_significant = abs(gap_ref - significant_gap) <= tolerance_sig
        near_moderate    = abs(gap_ref - moderate_gap) <= tolerance_mod
        if near_significant or near_moderate:
            threshold_ref = significant_gap if near_significant else moderate_gap
            warnings.append(ReliabilityWarning(
                code=W_BORDERLINE_GAP,
                severity=SEV_INFO,
                message=(
                    f"Gap fisiológico ({gap_ref:+.2f} {unit}) muy cerca del umbral de "
                    f"decisión ({threshold_ref} {unit}). "
                    "El error típico de medición de LT2 en test de campo (±0.2-0.4 km/h) "
                    "podría cambiar la recomendación de bloque."
                ),
                actionable=(
                    "Considerar repetir el test en 2-3 semanas para confirmar la posición "
                    "del gap. El bloque actual es la mejor apuesta con los datos disponibles, "
                    "pero el entrenador debe monitorear de cerca la respuesta del atleta."
                ),
            ))

    # ── Semanas insuficientes ─────────────────────────────────────────────────
    from app.services.physiological_engine import MIN_WEEKS_FOR_BLOCK
    min_w = MIN_WEEKS_FOR_BLOCK.get(gap_result.recommended_block, 0)
    if (
        min_w > 0
        and ctx.weeks_to_goal is not None
        and ctx.weeks_to_goal < min_w + 2
        and gap_result.recommended_block not in {
            "competition_specific_block",
            "recovery_consolidation_block",
            "testing_decision_block",
        }
    ):
        warnings.append(ReliabilityWarning(
            code=W_INSUFFICIENT_WEEKS,
            severity=SEV_WARNING,
            message=(
                f"'{BLOCK_RATIONALE[gap_result.recommended_block].display_name}' "
                f"necesita ≥{min_w} semanas para adaptación estructural (Olbrecht). "
                f"Solo hay {ctx.weeks_to_goal} semanas al objetivo — margen muy ajustado."
            ),
            actionable=(
                f"Considerar acortar el bloque a {min_w} semanas de carga + 1 de taper. "
                "Alternativamente, valorar si el objetivo es realista con el tiempo disponible."
            ),
        ))

    # ── Sin objetivo de ritmo/potencia ───────────────────────────────────────
    if ctx.target_pace_kmh is None and ctx.target_power_watts is None:
        warnings.append(ReliabilityWarning(
            code=W_NO_TARGET,
            severity=SEV_INFO,
            message=(
                "No hay objetivo de ritmo/potencia definido. "
                "El gap analysis no puede ejecutarse — la decisión se basa "
                "solo en fase temporal y datos de umbrales sin referencia de meta."
            ),
            actionable=(
                "Definir el objetivo de rendimiento del atleta (ritmo de carrera objetivo "
                "o potencia objetivo) para activar el gap analysis y afinar la recomendación."
            ),
        ))

    # ── Perfil VO2max/VLamax no fiable ───────────────────────────────────────
    if (
        ctx.capacity_profile is not None
        and ctx.capacity_profile.confidence < 0.55
        and ctx.capacity_profile.source not in ("real", "basic")
    ):
        warnings.append(ReliabilityWarning(
            code=W_PROFILE_UNCERTAIN,
            severity=SEV_INFO,
            message=(
                f"Perfil VO2max/VLamax con confianza {ctx.capacity_profile.confidence:.0%} "
                f"(fuente: {ctx.capacity_profile.source}). "
                "El CapacityProfile no puede refinar la recomendación — "
                "la prescripción se basa solo en el gap analysis."
            ),
            actionable=(
                "Acumular 3-5 tests de lactato con buena calidad de curva para que "
                "el detector identifique LT1/LT2 reales y el perfil suba a confianza ≥0.75."
            ),
        ))

    # ── Sin LT1 disponible (relevante para eventos LT1-led) ──────────────────
    lt1_val = ctx.lt1_power_watts if ctx.metric_type == "power_watts" else ctx.lt1_kmh
    lt1_led_events = {
        "ironman", "ironman_run", "ironman_bike",
        "open_water_long", "marathon", "granfondo",
    }
    if lt1_val is None and (ctx.distance_category or "") in lt1_led_events:
        warnings.append(ReliabilityWarning(
            code=W_NO_LT1,
            severity=SEV_WARNING,
            message=(
                f"LT1 no disponible para un evento donde LT1 es co-limitante "
                f"({ctx.distance_category}). "
                "Laursen 2002: 'IM performance correlates r=0.87 with submaximal "
                "threshold power'. Sin LT1, el análisis de gap es incompleto."
            ),
            actionable=(
                "Asegurar que el protocolo de test incluye suficientes etapas a baja "
                "intensidad para detectar LT1 (~2 mmol o primera inflexión de la curva)."
            ),
        ))

    # ── Ratio LT1/LT2 implausible ─────────────────────────────────────────────
    lt2_val = ctx.lt2_power_watts if ctx.metric_type == "power_watts" else ctx.lt2_kmh
    if lt1_val is not None and lt2_val is not None and lt2_val > 0:
        ratio = lt1_val / lt2_val
        if ratio > 1.05 or ratio < 0.50:
            warnings.append(ReliabilityWarning(
                code=W_IMPLAUSIBLE_RATIO,
                severity=SEV_WARNING,
                message=(
                    f"Ratio LT1/LT2 = {ratio:.2f} está fuera del rango fisiológico "
                    f"esperado (0.55-1.00). Posible error de medición o protocolo "
                    "incorrecto (orden de etapas, muestra contaminada, etc.)."
                ),
                actionable=(
                    "Revisar el test de lactato: verificar que LT1 y LT2 no están "
                    "invertidos, que las muestras son de la misma sesión y que el "
                    "protocolo tiene etapas suficientes a baja intensidad."
                ),
            ))

    # ── Ordenar por severidad: critical > warning > info ─────────────────────
    severity_order = {SEV_CRITICAL: 0, SEV_WARNING: 1, SEV_INFO: 2}
    warnings.sort(key=lambda w: severity_order.get(w.severity, 3))

    return warnings


# ═══════════════════════════════════════════════════════════════════════════════
# generate_block_explanation — Explicación contextual para el entrenador
# ═══════════════════════════════════════════════════════════════════════════════

# Nombres de display para fases
_PHASE_LABELS: dict[str, str] = {
    "base_early": "base temprana",
    "base_late":  "final del base",
    "specific":   "fase específica",
    "pre_comp":   "pre-competición",
    "taper":      "taper",
}

# Etiquetas de distancia para mensajes
_DIST_LABELS: dict[str, str] = {
    "5k": "5 km", "10k": "10 km", "hm": "media maratón",
    "marathon": "maratón", "sprint_tri": "triatlón sprint",
    "olympic_tri": "triatlón olímpico", "70.3": "70.3 / Half Ironman",
    "half_tri": "Half Ironman", "ironman": "Ironman",
    "open_water_long": "aguas abiertas larga distancia",
    "granfondo": "granfondo", "road_tt": "contrarreloj",
}

# Mensajes de limitante principal
_LIMITER_LABELS: dict[str, str] = {
    "lt1": "la capacidad subumbral (LT1)",
    "lt2": "el umbral anaeróbico (LT2/MLSS)",
    "both": "ambos umbrales (LT1 y LT2)",
    "none": "el perfil fisiológico",
    "no_data": "la falta de datos",
}


@dataclass
class BlockExplanation:
    """Explicación contextual completa para el entrenador.

    Combina el rationale científico del bloque con los datos específicos
    del atleta. Lista para mostrarse en UI o enviarse al planning engine.

    Campos:
        headline       — 1 frase que resume el "por qué" (para tarjeta/header)
        why_now        — párrafo: por qué ESTE bloque AHORA para ESTE atleta
        what_to_expect — qué adaptaciones verá el entrenador en test y rendimiento
        what_to_watch  — señales de que el bloque está funcionando (o no)
        when_to_exit   — cuándo terminar el bloque y pasar al siguiente
        alternative_if_wrong — qué bloque alternativo si los datos mejoran/empeoran
        block_key      — clave del bloque
        display_name   — nombre UI
        olbrecht_class — clase Olbrecht (AEC, AEP, etc.)
        min_weeks      — duración mínima
        max_weeks      — duración máxima
    """

    headline: str
    why_now: str
    what_to_expect: str
    what_to_watch: str
    when_to_exit: str
    alternative_if_wrong: str
    block_key: str
    display_name: str
    olbrecht_class: str
    min_weeks: int
    max_weeks: int


def generate_block_explanation(
    ctx: "PhysiologicalContext",
    gap_result: "PhysiologicalGapResult",
) -> BlockExplanation:
    """Genera la explicación contextual del bloque recomendado.

    Combina los datos específicos del atleta (gaps, fase, perfil VO2max/VLamax)
    con el rationale científico del bloque para producir texto orientado
    al entrenador: no "qué es AEC" sino "por qué ESTE atleta necesita AEC AHORA".

    Args:
        ctx:        PhysiologicalContext del atleta.
        gap_result: PhysiologicalGapResult de analyse_physiological_gap.

    Returns:
        BlockExplanation con todos los campos listos para UI o planning engine.
    """
    block    = gap_result.recommended_block
    rationale = BLOCK_RATIONALE.get(block, BLOCK_RATIONALE["aerobic_capacity_block"])
    unit      = "W" if ctx.metric_type == "power_watts" else "km/h"
    phase_lbl = _PHASE_LABELS.get(gap_result.season_phase, gap_result.season_phase)
    dist_lbl  = _DIST_LABELS.get(ctx.distance_category or "", ctx.distance_category or "la prueba objetivo")
    level_lbl = {"recreational": "recreativo", "trained": "entrenado", "competitive": "competitivo"}.get(
        ctx.athlete_level, ctx.athlete_level
    )
    lt2_val = ctx.lt2_power_watts if ctx.metric_type == "power_watts" else ctx.lt2_kmh
    lt1_val = ctx.lt1_power_watts if ctx.metric_type == "power_watts" else ctx.lt1_kmh
    limiter_lbl = _LIMITER_LABELS.get(gap_result.primary_limiter, "el perfil fisiológico")

    # ── Headline ──────────────────────────────────────────────────────────────
    weeks_str = f"{ctx.weeks_to_goal} semanas" if ctx.weeks_to_goal else "tiempo disponible"
    headline = _build_headline(block, gap_result, ctx, phase_lbl, dist_lbl, unit)

    # ── Why now ───────────────────────────────────────────────────────────────
    why_now = _build_why_now(block, gap_result, ctx, phase_lbl, dist_lbl, level_lbl,
                              lt1_val, lt2_val, unit, limiter_lbl, weeks_str)

    # ── What to expect ────────────────────────────────────────────────────────
    what_to_expect = _build_what_to_expect(block, gap_result, ctx, unit)

    # ── What to watch ─────────────────────────────────────────────────────────
    what_to_watch = _build_what_to_watch(block, gap_result, ctx, unit)

    # ── When to exit ──────────────────────────────────────────────────────────
    when_to_exit = _build_when_to_exit(block, gap_result, ctx, unit)

    # ── Alternative if wrong ──────────────────────────────────────────────────
    alternative_if_wrong = _build_alternative(block, gap_result, ctx)

    return BlockExplanation(
        headline=headline,
        why_now=why_now,
        what_to_expect=what_to_expect,
        what_to_watch=what_to_watch,
        when_to_exit=when_to_exit,
        alternative_if_wrong=alternative_if_wrong,
        block_key=block,
        display_name=rationale.display_name,
        olbrecht_class=rationale.olbrecht_class,
        min_weeks=rationale.min_weeks,
        max_weeks=rationale.max_weeks,
    )


# ─── helpers internos ────────────────────────────────────────────────────────

def _build_headline(block, gap_result, ctx, phase_lbl, dist_lbl, unit) -> str:
    lt2_gap = gap_result.lt2_gap_kmh
    lt1_gap = gap_result.lt1_gap_kmh
    weeks   = ctx.weeks_to_goal

    if block == "aerobic_capacity_block":
        if gap_result.primary_limiter == "lt1":
            g = f"{lt1_gap:+.2f} {unit}" if lt1_gap is not None else "deficitario"
            return f"Base aeróbica subumbral insuficiente para {dist_lbl} — construir antes de atacar umbral."
        if gap_result.primary_limiter == "lt2":
            g = f"{lt2_gap:+.2f} {unit}" if lt2_gap is not None else "deficitario"
            return f"Motor aeróbico aún en construcción — la base debe preceder al trabajo de umbral."
        return f"En {phase_lbl} con {weeks or '?'} semanas: consolidar la base aeróbica es la prioridad."

    if block == "threshold_development_block":
        if lt2_gap is not None:
            return f"LT2 a {lt2_gap:+.2f} {unit} del objetivo — desplazar el umbral es el mejor retorno ahora."
        return f"En {phase_lbl}: el umbral anaeróbico es el limitante con mejor retorno marginal."

    if block == "aerobic_power_block":
        return f"Base construida y umbral en rango — afinar la utilización del VO2max en condiciones de carrera."

    if block == "competition_specific_block":
        return f"Perfil fisiológico compatible con {dist_lbl} — transferir capacidad al gesto específico."

    if block == "recovery_consolidation_block":
        return "Consolidar adaptaciones del bloque anterior antes del siguiente estímulo."

    if block == "testing_decision_block":
        return "Datos insuficientes para prescribir — repetir test de lactato antes de decidir."

    return f"{block} recomendado en {phase_lbl}."


def _build_why_now(block, gap_result, ctx, phase_lbl, dist_lbl, level_lbl,
                   lt1_val, lt2_val, unit, limiter_lbl, weeks_str) -> str:
    lt2_gap = gap_result.lt2_gap_kmh
    lt1_gap = gap_result.lt1_gap_kmh
    req_lt2 = gap_result.required_lt2_kmh
    req_lt1 = gap_result.required_lt1_kmh
    phase   = gap_result.season_phase
    profile = ctx.capacity_profile

    profile_note = ""
    if profile and profile.confidence >= 0.55 and profile.aerobic_level != "unknown":
        aero = {"high": "alta", "moderate": "moderada", "low": "baja"}.get(profile.aerobic_level, "")
        vla  = {"high": "alta", "moderate": "moderada", "low": "baja"}.get(profile.vlamax_level, "")
        if aero and vla:
            profile_note = (
                f" El perfil de capacidades indica capacidad aeróbica {aero} y "
                f"VLamax {vla} (ratio LT1/LT2={profile.lt1_lt2_ratio:.2f}),"
                f" con confianza {profile.confidence:.0%}."
            )

    if block == "aerobic_capacity_block":
        parts = [f"Atleta {level_lbl} en {phase_lbl} con {weeks_str} al objetivo ({dist_lbl})."]

        if gap_result.primary_limiter == "lt1" and lt1_val is not None and req_lt1 is not None:
            parts.append(
                f"El limitante principal es {limiter_lbl}: LT1 actual "
                f"{lt1_val:.2f} {unit} frente a los {req_lt1:.2f} {unit} requeridos "
                f"(gap {lt1_gap:+.2f} {unit})."
            )
            if dist_lbl in ("media maratón", "70.3 / Half Ironman", "Ironman", "maratón",
                             "aguas abiertas larga distancia"):
                parts.append(
                    f"En {dist_lbl} la capacidad subumbral es co-determinante del rendimiento "
                    "(Coyle 1988; Laursen 2002): sin una base LT1 sólida, trabajar umbral "
                    "tendría poco retorno y riesgo de 'thin ice' (Olbrecht)."
                )
        elif lt2_val is not None and req_lt2 is not None and lt2_gap is not None:
            parts.append(
                f"LT2 actual: {lt2_val:.2f} {unit} | Requerido: {req_lt2:.2f} {unit} "
                f"(gap {lt2_gap:+.2f} {unit})."
            )
            if phase == "base_early":
                parts.append(
                    "En base temprana, la prioridad estructural es construir la densidad "
                    "mitocondrial (Olbrecht: las adaptaciones aeróbicas toman 5-8 semanas). "
                    "Atacar el umbral antes de tener la base construida eleva VLamax "
                    "en lugar de VO2max."
                )
        if profile_note:
            parts.append(profile_note)

        # Señal glucolítica si disponible
        if ctx.peak_lactate_1km is not None and ctx.peak_lactate_1km >= 12.0:
            parts.append(
                f"Señal glucolítica elevada (pico {ctx.peak_lactate_1km:.1f} mmol/L): "
                "el alto volumen de este bloque ayudará a suprimir temporalmente la VLamax "
                "(Olbrecht: 'high mileage temporarily reduces glycolytic capacity')."
            )
        return " ".join(parts)

    if block == "threshold_development_block":
        parts = [f"Atleta {level_lbl} en {phase_lbl} con {weeks_str} al objetivo ({dist_lbl})."]
        if lt2_val is not None and req_lt2 is not None and lt2_gap is not None:
            parts.append(
                f"LT2 actual: {lt2_val:.2f} {unit} | Requerido: {req_lt2:.2f} {unit} "
                f"(gap {lt2_gap:+.2f} {unit}). El umbral anaeróbico es el limitante "
                "con mejor retorno marginal en este momento."
            )
        if profile and profile.confidence >= 0.55 and profile.lt1_lt2_ratio is not None:
            ratio = profile.lt1_lt2_ratio
            if ratio >= 0.75:
                parts.append(
                    f"Ratio LT1/LT2={ratio:.2f} (≥0.75): la base subumbral es funcional "
                    "(Faude 2009), por lo que el trabajo de umbral no supone riesgo de 'thin ice'."
                )
        if phase in ("base_late", "specific"):
            parts.append(
                "Olbrecht: 'threshold development is most effective once the aerobic capacity "
                "foundation is in place'. Estamos en el momento óptimo del ciclo."
            )
        return " ".join(parts)

    if block == "aerobic_power_block":
        parts = [f"Atleta {level_lbl} en {phase_lbl} con {weeks_str} al objetivo ({dist_lbl})."]
        if lt2_val is not None and req_lt2 is not None:
            gap_str = f"{lt2_gap:+.2f} {unit}" if lt2_gap is not None else "mínimo"
            parts.append(
                f"LT2 actual: {lt2_val:.2f} {unit} — ya muy cerca del objetivo "
                f"(gap {gap_str}). La capacidad aeróbica está construida."
            )
        if profile and profile.confidence >= 0.75:
            aero = profile.aerobic_level
            vla  = profile.vlamax_level
            if aero == "high" and vla == "low":
                parts.append(
                    f"Perfil óptimo para AEP: alta capacidad aeróbica + baja VLamax "
                    f"(ratio={profile.lt1_lt2_ratio:.2f}). El motor aeróbico es potente "
                    "y eficiente — ahora necesita afinarse para la competición específica."
                )
        parts.append(
            "Olbrecht (AEP): 'aerobic power training maximizes the athlete's ability "
            "to use the built aerobic capacity in competition'."
        )
        return " ".join(parts)

    if block == "competition_specific_block":
        parts = [f"Atleta {level_lbl} en {phase_lbl} con {weeks_str} al objetivo ({dist_lbl})."]
        if lt2_val is not None and req_lt2 is not None:
            gap_str = f"{lt2_gap:+.2f} {unit}" if lt2_gap is not None else "ok"
            parts.append(
                f"LT2: {lt2_val:.2f} {unit} — compatible con el objetivo (gap {gap_str}). "
                "El perfil fisiológico está listo."
            )
        parts.append(
            "El trabajo ahora es de especificidad: transferir la capacidad al gesto, "
            "ritmo y condiciones de la competición (Olbrecht: 'competition specific "
            "training only transfers what is already there')."
        )
        return " ".join(parts)

    if block == "testing_decision_block":
        age_str = f"{ctx.test_age_days} días" if ctx.test_age_days else "desconocida"
        return (
            f"Los datos de lactato disponibles (antigüedad: {age_str}, "
            f"calidad: {gap_result.data_quality}) no permiten hacer un gap analysis fiable. "
            "Prescribir un bloque con estos datos sería trabajar con un mapa incorrecto. "
            "El primer paso es un test de lactato con protocolo limpio."
        )

    return gap_result.reasons[0] if gap_result.reasons else "Ver razones del motor."


def _build_what_to_expect(block, gap_result, ctx, unit) -> str:
    lt2_gap = gap_result.lt2_gap_kmh
    lt1_gap = gap_result.lt1_gap_kmh

    if block == "aerobic_capacity_block":
        lt1_expect = ""
        if lt1_gap is not None and lt1_gap > 0:
            lt1_expect = (
                f" LT1 debería subir {min(lt1_gap * 0.3, 0.8):.1f}–"
                f"{min(lt1_gap * 0.5, 1.2):.1f} {unit} si el bloque se ejecuta bien."
            )
        return (
            "En test de lactato tras 5-6 semanas: desplazamiento de la curva hacia la "
            "derecha en las intensidades bajas (LT1 sube, la curva se 'aplana' en su parte "
            f"inicial).{lt1_expect} "
            "En entrenamiento: el atleta podrá sostener más volumen a la misma percepción "
            "de esfuerzo. La frecuencia cardíaca bajará a las mismas velocidades."
        )

    if block == "threshold_development_block":
        lt2_expect = ""
        if lt2_gap is not None and lt2_gap > 0:
            lt2_expect = (
                f" LT2 debería subir {min(lt2_gap * 0.25, 0.6):.1f}–"
                f"{min(lt2_gap * 0.45, 1.0):.1f} {unit} en 4-5 semanas."
            )
        return (
            "En test de lactato: LT2/MLSS se desplaza hacia mayor velocidad o potencia — "
            f"la curva se mueve a la derecha en su zona central.{lt2_expect} "
            "En entrenamiento: las series de umbral se ejecutan más fácilmente a la misma "
            "velocidad. La recuperación entre series mejora."
        )

    if block == "aerobic_power_block":
        return (
            "El test de lactato puede no mostrar cambios grandes en LT2 — el efecto "
            "principal es de rendimiento en carrera, no de umbral. "
            "El atleta debería rendir mejor en pruebas de tempo y race-pace. "
            "La percepción de esfuerzo a ritmo de competición bajará."
        )

    if block == "competition_specific_block":
        return (
            "Mejora del rendimiento en race-pace y en condiciones de competición. "
            "El test de lactato no es el indicador aquí — las simulaciones de carrera "
            "y los tiempos de entrenamiento a pace objetivo son la métrica principal."
        )

    if block == "testing_decision_block":
        return (
            "Resultado: valores de LT1 y LT2 actualizados. Confianza mínima esperada: "
            "≥0.65 con un test bien ejecutado. Esto permitirá al motor hacer un gap "
            "analysis real y recomendar el bloque correcto."
        )

    return "Ver indicadores de rendimiento y test de lactato tras el bloque."


def _build_what_to_watch(block, gap_result, ctx, unit) -> str:
    if block == "aerobic_capacity_block":
        return (
            "✓ El atleta tolera bien el volumen y la fatiga es manejable entre sesiones. "
            "✓ FC en reposo estable o bajando. "
            "✓ Percepción de esfuerzo a ritmos aeróbicos mejora semana a semana. "
            "⚠ Si la FC no baja después de 3 semanas: posible volumen excesivo o estrés externo. "
            "⚠ Si el rendimiento cae bruscamente: reducir intensidad de los 'spices', posible VLamax reacción."
        )

    if block == "threshold_development_block":
        return (
            "✓ Las series de umbral se mantienen o mejoran en velocidad semana a semana. "
            "✓ La recuperación entre series no se degrada. "
            "⚠ Si el lactato en las series sube semana a semana a la misma velocidad: "
            "el atleta está respondiendo con VLamax, no con LT2. Revisar base. "
            "⚠ Si aparece fatiga crónica en semana 3-4: reducir densidad de las series."
        )

    if block == "aerobic_power_block":
        return (
            "✓ El atleta puede mantener el pace objetivo más allá de la distancia de competición. "
            "✓ La percepción de esfuerzo a race-pace es 'controlada'. "
            "⚠ Si el atleta no puede mantener el pace más de 3-4 min: LT2 no está donde creíamos. "
            "Revisar el gap analysis — posible necesidad de threshold block previo."
        )

    if block == "competition_specific_block":
        return (
            "✓ Las simulaciones de carrera producen tiempos en el rango objetivo. "
            "✓ El atleta llega a la competición sintiéndose 'fresco y rápido'. "
            "⚠ Si el atleta se siente pesado o lento en race-pace: taper insuficiente "
            "o bloque demasiado largo. Reducir volumen."
        )

    return "Monitorizar respuesta al entrenamiento y lactato si disponible."


def _build_when_to_exit(block, gap_result, ctx, unit) -> str:
    rationale = BLOCK_RATIONALE.get(block)
    min_w = rationale.min_weeks if rationale else 4
    max_w = rationale.max_weeks if rationale else 8
    lt2_gap = gap_result.lt2_gap_kmh
    lt1_gap = gap_result.lt1_gap_kmh

    if block == "aerobic_capacity_block":
        lt1_trigger = ""
        if lt1_gap is not None and lt1_gap > 0:
            target_lt1 = f"LT1 a ≤{lt1_gap * 0.3:.2f} {unit} del requerido" if lt1_gap < 1.5 else "LT1 subiendo consistentemente"
            lt1_trigger = f" o cuando {target_lt1}."
        return (
            f"Mínimo {min_w} semanas; máximo {max_w} antes de rendimiento decreciente. "
            "Señal de salida: LT1 ha subido visiblemente en test + el atleta tolera bien "
            f"el volumen sin señales de sobreentrenamiento{lt1_trigger} "
            "→ Siguiente bloque: threshold_development si LT2 sigue siendo el limitante, "
            "o aerobic_power si LT2 ya está en rango."
        )

    if block == "threshold_development_block":
        trigger = ""
        if lt2_gap is not None:
            target = f"lt2_gap ≤ 0.25 {unit}" if lt2_gap < 1.5 else f"lt2_gap reducido ≥50%"
            trigger = f" o cuando {target}."
        return (
            f"Mínimo {min_w} semanas; máximo {max_w}. "
            f"Señal de salida: LT2 se ha desplazado en test (verificar con test de lactato){trigger} "
            "→ Siguiente bloque: aerobic_power si gap ≤ 0.25 km/h, "
            "competition_specific si gap ≤ 0.10 km/h y estamos en specific/pre_comp."
        )

    if block == "aerobic_power_block":
        return (
            f"Mínimo {min_w} semanas; máximo {max_w}. "
            "Señal de salida: el atleta ejecuta sesiones de race-pace con facilidad relativa "
            "y los tiempos de simulación están en el rango objetivo. "
            "→ Siguiente bloque: competition_specific para afinar pacing y táctica."
        )

    if block == "competition_specific_block":
        weeks = ctx.weeks_to_goal or 4
        return (
            f"Mínimo {min_w} semanas; máximo {max_w}. "
            f"Con {weeks} semanas al objetivo, este bloque debería cubrir hasta la "
            "semana de taper. Señal de salida: 7-10 días antes de la competición, "
            "reducir volumen manteniendo 1-2 estímulos de velocidad."
        )

    if block == "testing_decision_block":
        return (
            "Salida: test de lactato completado con protocolo correcto. "
            "Confianza mínima para prescribir: ≥0.65 (thresholds básicos detectados)."
        )

    return f"Revisar en test de lactato a las {min_w}-{max_w} semanas."


def _build_alternative(block, gap_result, ctx) -> str:
    lt2_gap = gap_result.lt2_gap_kmh
    lt1_gap = gap_result.lt1_gap_kmh
    unit    = "W" if ctx.metric_type == "power_watts" else "km/h"

    if block == "aerobic_capacity_block":
        return (
            "Si en el próximo test el LT2 ya está ≤ 0.25 km/h del objetivo y LT1 acompaña → "
            "saltar a aerobic_power_block. "
            "Si el atleta responde muy bien y el gap LT1 se cierra en 3 semanas → "
            "acortar bloque y pasar a threshold_development_block antes."
        )

    if block == "threshold_development_block":
        return (
            "Si el atleta no mejora LT2 en 4 semanas y el lactato en series sube → "
            "la base puede ser más débil de lo esperado; volver a aerobic_capacity_block. "
            "Si el gap se cierra a ≤ 0.25 km/h → avanzar a aerobic_power_block."
        )

    if block == "aerobic_power_block":
        return (
            "Si el atleta no puede mantener race-pace en las series → "
            "gap LT2 mayor de lo estimado; volver a threshold_development_block. "
            "Si responde muy bien y la competición es en 3-4 semanas → "
            "avanzar directamente a competition_specific_block."
        )

    if block == "competition_specific_block":
        return (
            "Si la competición se pospone >4 semanas → intercalar un mini-bloque de "
            "aerobic_power para mantener la agudeza. "
            "Si aparecen señales de sobreentrenamiento → recovery_consolidation_block 1-2 semanas."
        )

    return "Evaluar respuesta y ajustar según test de lactato."
