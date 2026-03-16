"""
Clasificador de preguntas del entrenador.

Analiza la pregunta en lenguaje natural y determina:
1. Tópico(s) científicos relevantes
2. Si necesita datos del atleta o solo evidencia general
3. Qué tipo de respuesta espera el entrenador
4. Qué patrones del atleta son relevantes para la respuesta

NO usa LLM — es un clasificador basado en reglas y keywords.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from .search_engine import tokenize, CONCEPT_TRANSLATIONS


# ═══════════════════════════════════════════════════════════════════════════
# Categorías de preguntas
# ═══════════════════════════════════════════════════════════════════════════

# Tópicos científicos que el advisor sabe responder
TOPICS = {
    "thresholds": {
        "keywords": {"lt1", "lt2", "umbral", "umbrales", "mlss", "obla", "threshold"},
        "description": "Umbrales de lactato, métodos de detección, significado fisiológico",
    },
    "lactate": {
        "keywords": {"lactato", "curva", "aclaramiento", "produccion", "baseline", "lactate"},
        "description": "Lactato sanguíneo, cinética, aclaramiento, producción",
    },
    "aerobic_capacity": {
        "keywords": {"vo2max", "vo2", "capacidad", "aerobica", "aerobico", "base", "mitocondrias"},
        "description": "VO2max, capacidad aeróbica, biogénesis mitocondrial",
    },
    "glycolytic": {
        "keywords": {"vlamax", "glucolisis", "anaerobico", "anaerobica", "glucolitico"},
        "description": "VLamax, capacidad glucolítica, metabolismo anaeróbico",
    },
    "training_method": {
        "keywords": {"polarizado", "intervalos", "hiit", "tempo", "continuo", "series", "repeticiones"},
        "description": "Métodos de entrenamiento, tipos de sesiones",
    },
    "periodization": {
        "keywords": {"periodizacion", "mesociclo", "microciclo", "macrociclo", "bloque", "fase", "taper"},
        "description": "Periodización, estructura de temporada, mesociclos",
    },
    "adaptation": {
        "keywords": {"adaptacion", "mejora", "progreso", "estancamiento", "sobreentrenamiento", "fatiga", "regresion"},
        "description": "Adaptación al entrenamiento, respuesta, estancamiento",
    },
    "recovery": {
        "keywords": {"recuperacion", "descanso", "sueño", "hrv", "descarga"},
        "description": "Recuperación, descanso, monitorización",
    },
    "performance": {
        "keywords": {"economia", "economía", "potencia", "ftp", "css", "rendimiento", "marca"},
        "description": "Rendimiento, economía de movimiento, potencia crítica",
    },
    "testing": {
        "keywords": {"test", "protocolo", "fiabilidad", "test de lactato", "incremental"},
        "description": "Protocolos de testing, fiabilidad, interpretación",
    },
    "nutrition": {
        "keywords": {"nutricion", "hidratacion", "carbohidratos", "grasa", "peso", "combustible"},
        "description": "Nutrición deportiva, hidratación, composición corporal",
    },
    "environment": {
        "keywords": {"calor", "altitud", "frio", "aclimatacion", "altura"},
        "description": "Entrenamiento en calor, altitud, frío",
    },
    "biomechanics": {
        "keywords": {"cadencia", "zancada", "tecnica", "biomecanica", "postura"},
        "description": "Biomecánica, técnica, cinemática",
    },
    "injury": {
        "keywords": {"lesion", "dolor", "riesgo", "prevencion", "molestia"},
        "description": "Prevención de lesiones, gestión de dolor",
    },
    "discipline_specific": {
        "keywords": {"running", "correr", "ciclismo", "bici", "natacion", "nadar", "triatlon", "ironman", "maraton"},
        "description": "Preguntas específicas de una disciplina",
    },
}

# Intenciones del entrenador
INTENTS = {
    "explain": {
        "keywords": {"que es", "explica", "explicame", "que significa", "como funciona", "diferencia entre", "por que"},
        "description": "Quiere entender un concepto",
    },
    "interpret": {
        "keywords": {"que indica", "que me dice", "como interpreto", "que leo", "que veo", "significa"},
        "description": "Quiere interpretar datos de su atleta",
    },
    "prescribe": {
        "keywords": {"como mejoro", "que hago", "como entreno", "cuanto", "mejor manera", "recomendacion"},
        "description": "Quiere recomendaciones prácticas",
    },
    "compare": {
        "keywords": {"mejor", "peor", "versus", "comparar", "diferencia", "ventaja", "desventaja"},
        "description": "Quiere comparar opciones o enfoques",
    },
    "validate": {
        "keywords": {"correcto", "bien", "normal", "logico", "tiene sentido", "es bueno", "deberia"},
        "description": "Quiere validar una decisión o un dato",
    },
    "troubleshoot": {
        "keywords": {"no mejora", "estancado", "empeora", "problema", "raro", "anomalo", "no entiendo"},
        "description": "Tiene un problema y busca causas",
    },
}


# ═══════════════════════════════════════════════════════════════════════════
# Resultado de clasificación
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class QuestionClassification:
    """Resultado de clasificar la pregunta del entrenador."""
    original_question: str
    tokens: list[str]
    primary_topic: str                              # tópico más relevante
    secondary_topics: list[str] = field(default_factory=list)
    intent: str = "explain"                         # intención del entrenador
    needs_athlete_data: bool = False                # ¿necesita datos del atleta?
    relevant_athlete_patterns: list[str] = field(default_factory=list)
    search_priority: str = "balanced"               # "evidence_heavy" | "balanced" | "data_heavy"
    discipline_filter: Optional[str] = None         # disciplina específica si la hay
    topic_descriptions: list[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# Clasificador
# ═══════════════════════════════════════════════════════════════════════════

# Señales de que la pregunta es sobre el atleta específico
_ATHLETE_SIGNALS = {
    "mi atleta", "el atleta", "este atleta", "su", "sus datos",
    "su curva", "su umbral", "su lactato", "su vo2", "su rendimiento",
    "está", "tiene", "muestra", "veo que", "los datos", "su test",
    "su entrenamiento", "su progreso", "su mejora", "no mejora",
    "empeora", "estancado", "evolución",
}

# Disciplinas detectables
_DISCIPLINE_MAP = {
    "running": "running",
    "correr": "running",
    "carrera": "running",
    "maraton": "running",
    "media maraton": "running",
    "ciclismo": "cycling",
    "bici": "cycling",
    "bicicleta": "cycling",
    "natacion": "swimming",
    "nadar": "swimming",
    "triatlon": "triathlon",
    "ironman": "triathlon",
}


def classify(question: str) -> QuestionClassification:
    """Clasifica la pregunta del entrenador.

    Determina tópicos, intención, y si necesita datos del atleta.
    """
    tokens = tokenize(question)
    question_lower = question.lower().strip()

    # ── Detectar tópicos ──
    topic_scores: dict[str, int] = {}
    for topic_id, topic_def in TOPICS.items():
        score = 0
        for keyword in topic_def["keywords"]:
            if keyword in tokens or keyword in question_lower:
                score += 1
        if score > 0:
            topic_scores[topic_id] = score

    # Si no se detecta ningún tópico, asumir "thresholds" como default genérico
    if not topic_scores:
        topic_scores["thresholds"] = 1

    sorted_topics = sorted(topic_scores.items(), key=lambda x: x[1], reverse=True)
    primary_topic = sorted_topics[0][0]
    secondary_topics = [t[0] for t in sorted_topics[1:3]]

    # ── Detectar intención ──
    intent = "explain"  # default
    intent_scores: dict[str, int] = {}
    for intent_id, intent_def in INTENTS.items():
        score = sum(1 for kw in intent_def["keywords"] if kw in question_lower)
        if score > 0:
            intent_scores[intent_id] = score

    if intent_scores:
        intent = max(intent_scores, key=intent_scores.get)

    # ── ¿Necesita datos del atleta? ──
    needs_athlete = False
    for signal in _ATHLETE_SIGNALS:
        if signal in question_lower:
            needs_athlete = True
            break

    # Intenciones que implícitamente necesitan datos
    if intent in ("interpret", "troubleshoot", "validate"):
        needs_athlete = True

    # ── Patrones relevantes del atleta ──
    relevant_patterns: list[str] = []
    if needs_athlete:
        pattern_map = {
            "thresholds": ["threshold_trends", "lt1_lt2_ratio"],
            "lactate": ["curve_shapes", "threshold_trends"],
            "aerobic_capacity": ["threshold_trends", "lt1_lt2_ratio", "training_pattern"],
            "glycolytic": ["lt1_lt2_ratio", "curve_shapes"],
            "adaptation": ["threshold_trends", "training_pattern", "data_freshness"],
            "training_method": ["training_pattern", "threshold_trends"],
            "periodization": ["training_pattern", "current_block"],
            "performance": ["threshold_trends", "derived_metrics"],
            "testing": ["data_freshness", "curve_shapes"],
            "recovery": ["training_pattern"],
        }
        relevant_patterns = pattern_map.get(primary_topic, ["data_freshness"])

    # ── Prioridad de búsqueda ──
    if needs_athlete and intent in ("interpret", "troubleshoot"):
        search_priority = "data_heavy"
    elif not needs_athlete:
        search_priority = "evidence_heavy"
    else:
        search_priority = "balanced"

    # ── Filtro de disciplina ──
    discipline_filter = None
    for keyword, discipline in _DISCIPLINE_MAP.items():
        if keyword in tokens or keyword in question_lower:
            discipline_filter = discipline
            break

    # ── Descripciones de tópicos ──
    all_topics = [primary_topic] + secondary_topics
    topic_descriptions = [
        TOPICS[t]["description"] for t in all_topics if t in TOPICS
    ]

    return QuestionClassification(
        original_question=question,
        tokens=tokens,
        primary_topic=primary_topic,
        secondary_topics=secondary_topics,
        intent=intent,
        needs_athlete_data=needs_athlete,
        relevant_athlete_patterns=relevant_patterns,
        search_priority=search_priority,
        discipline_filter=discipline_filter,
        topic_descriptions=topic_descriptions,
    )
