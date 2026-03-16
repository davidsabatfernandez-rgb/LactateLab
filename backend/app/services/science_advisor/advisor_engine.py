"""
Motor principal del Science Advisor.

Flujo con LLM (Claude/Gemma via OpenRouter):
1. El entrenador escribe en lenguaje natural
2. El LLM traduce la pregunta a queries científicas óptimas
3. Las queries buscan en PubMed, Semantic Scholar, Europe PMC
4. El LLM sintetiza la respuesta integrando papers + datos del atleta

Fallback sin LLM: usa el clasificador de reglas + response_builder.

Punto de entrada: `ask()`
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from sqlalchemy.orm import Session as DBSession

from .question_classifier import classify
from .search_engine import (
    search as rule_based_search,
    search_pubmed,
    search_semantic_scholar,
    search_europepmc,
    PaperResult,
    SearchResult,
    deduplicate_and_rank,
    tokenize,
)
from .data_reader import read_athlete_data, AthleteDataBundle
from .pattern_detector import detect_patterns, DetectedPatterns
from .response_builder import build_response, AdvisorResponse
from .llm_client import generate_search_queries, synthesize_response

logger = logging.getLogger(__name__)


def _format_papers_for_llm(papers: list[PaperResult]) -> str:
    """Formatea los papers encontrados como texto para el prompt del LLM."""
    if not papers:
        return "No se encontraron papers relevantes."

    lines: list[str] = []
    for i, p in enumerate(papers, 1):
        authors = ", ".join(p.authors[:3])
        if len(p.authors) > 3:
            authors += " et al."
        year = f" ({p.year})" if p.year else ""
        journal = f". {p.journal}" if p.journal else ""

        lines.append(f"[{i}] {authors}{year}: {p.title}{journal}")
        if p.abstract:
            # Limitar abstract a ~300 chars para no saturar el prompt
            abstract = p.abstract[:400]
            if len(p.abstract) > 400:
                abstract += "..."
            lines.append(f"    Abstract: {abstract}")
        lines.append("")

    return "\n".join(lines)


def _format_patterns_for_llm(patterns: DetectedPatterns) -> str:
    """Formatea los patrones detectados como texto para el prompt del LLM."""
    lines: list[str] = []

    for trend in patterns.threshold_trends:
        if trend.metric in ("pace", "power"):
            lines.append(
                f"- {trend.threshold.upper()} ({trend.metric}): "
                f"{trend.direction} ({trend.delta_pct:+.1f}% en {trend.window_days}d)"
            )

    if patterns.lt1_lt2_ratio:
        r = patterns.lt1_lt2_ratio
        lines.append(f"- Ratio LT1/LT2: {r.ratio:.2f} → VLamax proxy: {r.vlamax_proxy}")

    if patterns.curve_shapes:
        s = patterns.curve_shapes[0]
        lines.append(f"- Curva de lactato: {s.shape} (baseline {s.baseline_mmol}, pico {s.peak_mmol} mmol)")

    if patterns.training_pattern:
        tp = patterns.training_pattern
        lines.append(f"- Entrenamiento: {tp.avg_sessions_per_week:.0f} ses/semana, {tp.consistency}")

    if patterns.data_freshness:
        df = patterns.data_freshness
        if df.last_lactate_test_days is not None:
            lines.append(f"- Último test lactato: hace {df.last_lactate_test_days} días ({df.freshness_label})")

    for note in patterns.context_notes:
        lines.append(f"- {note}")

    return "\n".join(lines) if lines else ""


def _format_athlete_context(bundle: AthleteDataBundle) -> str:
    """Contexto breve del atleta para el prompt de generación de queries."""
    p = bundle.profile
    parts: list[str] = []
    if p.primary_discipline:
        parts.append(f"Disciplina: {p.primary_discipline}")
    if p.athlete_level:
        parts.append(f"Nivel: {p.athlete_level}")
    if p.age:
        parts.append(f"Edad: {p.age}")
    if p.total_lactate_sessions > 0:
        parts.append(f"{p.total_lactate_sessions} tests de lactato")
    return ", ".join(parts) if parts else ""


async def _llm_powered_search(
    question: str,
    athlete_context: Optional[str] = None,
    max_papers: int = 8,
) -> SearchResult:
    """Búsqueda potenciada por LLM: genera queries inteligentes y busca."""
    llm_queries = await generate_search_queries(question, athlete_context)

    if not llm_queries:
        # Fallback a reglas si el LLM falla
        return await rule_based_search(question, max_results=max_papers)

    all_papers: list[PaperResult] = []
    strategies_used: list[str] = []

    # Ejecutar las queries del LLM
    # PubMed: las 3 primeras (secuencial con delay)
    for i, query in enumerate(llm_queries[:3]):
        strategies_used.append(f"llm_query_{i+1}@pubmed")
        try:
            papers = await search_pubmed(query, max_results=5)
            for p in papers:
                p.search_strategy = f"llm_query_{i+1}"
            all_papers.extend(papers)
        except Exception as e:
            logger.warning("PubMed search failed for LLM query: %s", e)
        if i < len(llm_queries[:3]) - 1:
            await asyncio.sleep(0.35)

    # Semantic Scholar + Europe PMC en paralelo con la mejor query
    parallel = []
    if llm_queries:
        strategies_used.append("llm_query_1@semantic_scholar")
        parallel.append(_tag_papers(
            search_semantic_scholar(llm_queries[0], max_results=5),
            "llm_scholar",
        ))
        strategies_used.append("llm_query_1@europepmc")
        parallel.append(_tag_papers(
            search_europepmc(llm_queries[0], max_results=5),
            "llm_europepmc",
        ))

    if parallel:
        results = await asyncio.gather(*parallel, return_exceptions=True)
        for result in results:
            if isinstance(result, list):
                all_papers.extend(result)

    # También buscar con reglas como complemento (una query rápida)
    tokens = tokenize(question)
    ranked = deduplicate_and_rank(all_papers, tokens, max_papers)

    return SearchResult(
        query_original=question,
        papers=ranked,
        strategies_used=strategies_used,
        total_found=len(all_papers),
    )


async def _tag_papers(coro, strategy: str) -> list[PaperResult]:
    """Wrapper para etiquetar papers con su estrategia."""
    papers = await coro
    for p in papers:
        p.search_strategy = strategy
    return papers


async def ask(
    question: str,
    db: DBSession,
    athlete_id: Optional[int] = None,
    discipline: Optional[str] = None,
    max_papers: int = 8,
) -> AdvisorResponse:
    """Responde una pregunta del entrenador con evidencia científica.

    Flujo:
    1. Clasifica la pregunta (reglas) para determinar si necesita datos
    2. Si hay LLM → genera queries inteligentes, si no → queries por reglas
    3. Busca en PubMed/Semantic Scholar/Europe PMC
    4. Lee datos del atleta si la pregunta lo requiere
    5. Si hay LLM → sintetiza respuesta integrando todo
    6. Si no → ensambla respuesta con response_builder
    """
    # 1. Clasificar (reglas, rápido) — para saber si necesita datos del atleta
    classification = classify(question)
    logger.info(
        "Science Advisor: topic=%s intent=%s needs_data=%s",
        classification.primary_topic,
        classification.intent,
        classification.needs_athlete_data,
    )

    if not discipline and classification.discipline_filter:
        discipline = classification.discipline_filter

    # 2. Leer datos del atleta si se necesitan
    bundle: Optional[AthleteDataBundle] = None
    patterns: Optional[DetectedPatterns] = None
    athlete_context_str: Optional[str] = None

    if athlete_id:
        bundle = read_athlete_data(db, athlete_id, discipline=discipline)
        if bundle:
            patterns = detect_patterns(bundle)
            athlete_context_str = _format_athlete_context(bundle)

    # 3. Buscar evidencia — LLM-powered con fallback a reglas
    search_result = await _llm_powered_search(
        question=question,
        athlete_context=athlete_context_str,
        max_papers=max_papers,
    )
    logger.info(
        "Science Advisor: %d papers found via %d strategies",
        len(search_result.papers),
        len(search_result.strategies_used),
    )

    # 4. Sintetizar respuesta con LLM
    papers_text = _format_papers_for_llm(search_result.papers)
    patterns_text = _format_patterns_for_llm(patterns) if patterns else None

    llm_synthesis = await synthesize_response(
        question=question,
        papers_text=papers_text,
        athlete_context=athlete_context_str,
        patterns_text=patterns_text,
    )

    # 5. Construir respuesta final
    if llm_synthesis:
        # Usar la síntesis del LLM como respuesta principal
        response = build_response(
            question=question,
            search_result=search_result,
            patterns=patterns,
            classification=classification,
        )
        # Reemplazar el summary genérico con la síntesis del LLM
        response.summary = llm_synthesis
    else:
        # Fallback: respuesta estructurada por reglas
        response = build_response(
            question=question,
            search_result=search_result,
            patterns=patterns,
            classification=classification,
        )

    return response
