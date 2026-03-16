"""
Cliente LLM para el Science Advisor.

Usa OpenRouter (ya configurado en el proyecto) para:
1. Traducir preguntas del entrenador a queries científicas
2. Sintetizar respuestas a partir de papers + datos del atleta

Incluye un glosario de dominio para evitar que modelos pequeños
alucinen definiciones de términos clave de fisiología del deporte.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# Glosario de dominio — inyectado en cada prompt para evitar alucinaciones
# ═══════════════════════════════════════════════════════════════════════════

DOMAIN_GLOSSARY = """
GLOSARIO DE FISIOLOGÍA DEL DEPORTE (DEFINICIONES CORRECTAS):

- **VLamax** (maximal lactate production rate): Tasa máxima de producción de lactato por la vía glucolítica. Mide la capacidad/potencia anaeróbica glucolítica. NO es ventilación. Valores altos = alta producción de lactato = peor para resistencia pura. Valores bajos = mejor economía de lactato para larga distancia. Referencia: Mader 2003, Olbrecht "Science of Winning".

- **VO2max** (maximal oxygen uptake): Consumo máximo de oxígeno. Medido en ml/kg/min. Indica el techo aeróbico del atleta. Valores típicos: recreativo 35-45, entrenado 50-60, élite resistencia 65-80+.

- **LT1** (first lactate threshold / aerobic threshold): Punto donde el lactato empieza a subir por encima del baseline (~0.5 mmol sobre reposo). Marca el límite superior de la zona puramente aeróbica. Sinónimos: VT1, aerobic threshold.

- **LT2** (second lactate threshold / anaerobic threshold): Punto de acumulación exponencial de lactato. Aproximadamente MLSS (maximal lactate steady state). Sinónimos: OBLA (~4 mmol), VT2, anaerobic threshold. Referencia: Faude 2009.

- **MLSS** (maximal lactate steady state): Máxima intensidad sostenible sin acumulación progresiva de lactato. Gold standard para LT2.

- **FTP** (functional threshold power): Potencia al umbral funcional en ciclismo. Aproximación práctica a MLSS/LT2.

- **CSS** (critical swim speed): Velocidad crítica de nado. Equivalente acuático de FTP/MLSS.

- **Economía de carrera/movimiento**: Coste de oxígeno a una velocidad dada. Mejor economía = menos O2 para la misma velocidad.

- **Fractional utilization**: Porcentaje del VO2max usado a intensidad de competición. Ironman: 70-80%, maratón: 80-90%.

- **Entrenamiento polarizado**: Distribución 80/20 — 80% baja intensidad (bajo LT1), 20% alta intensidad (sobre LT2). Referencia: Seiler 2010, Stöggl 2014.

- **Periodización por bloques**: Concentrar un estímulo fisiológico dominante por mesociclo (3-6 semanas). Referencia: Issurin 2010.

- **Olbrecht**: Jan Olbrecht, autor de "The Science of Winning". Define 4 capacidades: AEC (aerobic capacity), AEP (aerobic power), ANC (anaerobic capacity), ANP (anaerobic power). Sistema basado en VO2max y VLamax.

- **Ratio LT1/LT2**: Indicador proxy de VLamax. >0.87 = VLamax baja (bueno para resistencia), 0.79-0.87 = moderada, <0.79 = alta.

REGLA CRÍTICA: Si no conoces con certeza la definición de un término, di "no tengo suficiente información" en vez de inventar una definición.
""".strip()


async def generate_search_queries(question: str, athlete_context: Optional[str] = None) -> list[str]:
    """Usa el LLM para convertir la pregunta del entrenador en queries científicas.

    Returns:
        Lista de queries en inglés para búsqueda científica.
    """
    settings = get_settings()
    if not settings.openrouter_api_key:
        logger.warning("No OpenRouter API key — falling back to rule-based queries")
        return []

    context_block = ""
    if athlete_context:
        context_block = f"\n\nContexto del atleta: {athlete_context}"

    prompt = f"""{DOMAIN_GLOSSARY}

---

Eres un experto en fisiología del ejercicio y ciencias del deporte.

Un entrenador deportivo te hace esta pregunta:
"{question}"{context_block}

Tu tarea: generar entre 3 y 5 queries de búsqueda en INGLÉS, optimizadas para encontrar papers científicos relevantes en PubMed y Semantic Scholar.

Reglas:
- Usa la terminología científica CORRECTA del glosario anterior (e.g., VLamax = "maximal lactate production rate", NO "ventilatory threshold")
- Usa términos MeSH cuando sea posible
- Incluye sinónimos científicos del concepto
- Una query específica, otra amplia, y si conoces autores clave inclúyelos
- NO incluyas queries en español
- Prioriza reviews y meta-análisis cuando la pregunta sea general

Responde SOLO con un JSON array de strings, sin explicación. Ejemplo:
["query 1", "query 2", "query 3"]"""

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{settings.openrouter_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.openrouter_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 500,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"].strip()

            start = content.find("[")
            end = content.rfind("]") + 1
            if start >= 0 and end > start:
                queries = json.loads(content[start:end])
                if isinstance(queries, list) and all(isinstance(q, str) for q in queries):
                    logger.info("LLM generated %d queries for: %s", len(queries), question[:50])
                    return queries[:5]

            logger.warning("LLM response not parseable as query list: %s", content[:200])
            return []

    except Exception as e:
        logger.warning("LLM query generation failed: %s", e)
        return []


async def synthesize_response(
    question: str,
    papers_text: str,
    athlete_context: Optional[str] = None,
    patterns_text: Optional[str] = None,
) -> str:
    """Usa el LLM para sintetizar una respuesta integrando papers + datos del atleta.

    Returns:
        Texto de la respuesta sintetizada en español.
    """
    settings = get_settings()
    if not settings.openrouter_api_key:
        return ""

    athlete_block = ""
    if athlete_context:
        athlete_block = f"\n\n--- DATOS DEL ATLETA ---\n{athlete_context}"
    if patterns_text:
        athlete_block += f"\n\n--- PATRONES DETECTADOS ---\n{patterns_text}"

    prompt = f"""{DOMAIN_GLOSSARY}

---

Eres un asesor científico para entrenadores deportivos. Respondes en español, con rigor científico pero lenguaje accesible.

PREGUNTA DEL ENTRENADOR:
"{question}"

--- EVIDENCIA CIENTÍFICA ENCONTRADA ---
{papers_text}{athlete_block}

INSTRUCCIONES:
1. Usa las definiciones CORRECTAS del glosario de arriba. Si la pregunta es sobre VLamax, es "tasa máxima de producción de lactato", NO "ventilación" ni "umbral ventilatorio".
2. Responde la pregunta basándote en la evidencia científica proporcionada.
3. Cita los papers usando [número] según el orden en que aparecen.
4. Si hay datos del atleta, intégralos en la respuesta ("en tu atleta vemos que...").
5. Sé directo y práctico — el entrenador quiere saber qué hacer, no solo teoría.
6. Si la evidencia proporcionada no responde bien la pregunta, dilo y aporta lo que sepas del glosario.
7. Responde en 2-4 párrafos, no más.
8. Al final, sugiere una acción concreta si es relevante.

PROHIBIDO: inventar datos, inventar definiciones, citar papers que no estén en la evidencia."""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.openrouter_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.openrouter_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.4,
                    "max_tokens": 1200,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"].strip()
            logger.info("LLM synthesized response (%d chars) for: %s", len(content), question[:50])
            return content

    except Exception as e:
        logger.warning("LLM synthesis failed: %s", e)
        return ""
