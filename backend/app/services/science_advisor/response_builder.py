"""
Constructor de respuestas del Science Advisor.

Ensambla la respuesta final combinando:
1. Evidencia científica (papers encontrados)
2. Datos del atleta (patrones detectados)
3. Contexto de la pregunta (clasificación)

La respuesta se estructura en secciones claras para que el entrenador
pueda leer rápidamente la evidencia y aplicarla a su atleta.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .search_engine import PaperResult, SearchResult
from .pattern_detector import DetectedPatterns
from .question_classifier import QuestionClassification


# ═══════════════════════════════════════════════════════════════════════════
# Estructura de la respuesta
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class Citation:
    """Una cita para incluir en la respuesta."""
    ref_number: int
    authors_short: str      # "Faude et al." o "Seiler & Tønnessen"
    year: Optional[int]
    title: str
    journal: Optional[str]
    doi: Optional[str]
    pmid: Optional[str]
    relevance_score: float


@dataclass
class ResponseSection:
    """Una sección de la respuesta."""
    heading: str
    content: str
    citations: list[int] = field(default_factory=list)  # ref_numbers


@dataclass
class AdvisorResponse:
    """Respuesta completa del Science Advisor."""
    question: str
    summary: str                                         # Respuesta corta (2-3 frases)
    sections: list[ResponseSection] = field(default_factory=list)
    citations: list[Citation] = field(default_factory=list)
    athlete_context: Optional[str] = None                # Contexto del atleta si aplica
    data_warnings: list[str] = field(default_factory=list)
    search_meta: Optional[dict] = None                   # Metadata de búsqueda


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _authors_short(authors: list[str]) -> str:
    """Genera formato corto de autores: 'Faude et al.' o 'Seiler & Tønnessen'."""
    if not authors:
        return "Autor desconocido"
    if len(authors) == 1:
        return authors[0]
    if len(authors) == 2:
        # Extraer apellidos
        names = [a.split()[0] if a else "?" for a in authors]
        return f"{names[0]} & {names[1]}"
    return f"{authors[0].split()[0] if authors[0] else '?'} et al."


def _build_citations(papers: list[PaperResult]) -> list[Citation]:
    """Construye la lista de citas desde los papers encontrados."""
    citations: list[Citation] = []
    for i, paper in enumerate(papers, start=1):
        citations.append(Citation(
            ref_number=i,
            authors_short=_authors_short(paper.authors),
            year=paper.year,
            title=paper.title,
            journal=paper.journal,
            doi=paper.doi,
            pmid=paper.pmid,
            relevance_score=paper.relevance_score,
        ))
    return citations


# ═══════════════════════════════════════════════════════════════════════════
# Sección de evidencia científica
# ═══════════════════════════════════════════════════════════════════════════

def _build_evidence_section(
    papers: list[PaperResult],
    classification: QuestionClassification,
) -> Optional[ResponseSection]:
    """Construye la sección de evidencia adicional (papers 4+, ya que los top 3 van en el summary)."""
    # Los top 3 ya se muestran en el summary — aquí van los restantes
    remaining = papers[3:]
    if not remaining:
        return None

    lines: list[str] = []
    for p in remaining:
        ref = papers.index(p) + 1
        year_str = f" ({p.year})" if p.year else ""
        lines.append(f"- [{ref}] {_authors_short(p.authors)}{year_str}: {p.title}")

    return ResponseSection(
        heading=f"Más evidencia ({len(remaining)} papers adicionales)",
        content="\n".join(lines),
        citations=[papers.index(p) + 1 for p in remaining],
    )


# ═══════════════════════════════════════════════════════════════════════════
# Sección de datos del atleta
# ═══════════════════════════════════════════════════════════════════════════

def _build_athlete_section(
    patterns: DetectedPatterns,
    classification: QuestionClassification,
) -> Optional[ResponseSection]:
    """Construye la sección con datos del atleta."""
    if not classification.needs_athlete_data:
        return None

    lines: list[str] = []

    # Tendencias de umbrales
    relevant_trends = [
        t for t in patterns.threshold_trends
        if t.metric in ("pace", "power") and t.num_snapshots >= 2
    ]
    if relevant_trends:
        lines.append("**Tendencia de umbrales:**")
        for trend in relevant_trends[:4]:
            direction_map = {
                "improving": "mejorando",
                "stable": "estable",
                "declining": "empeorando",
            }
            direction = direction_map.get(trend.direction, trend.direction)
            lines.append(
                f"- {trend.threshold.upper()} ({trend.metric}): {direction} "
                f"({trend.delta_pct:+.1f}% en {trend.window_days}d, "
                f"{trend.num_snapshots} snapshots, conf={trend.confidence:.0%})"
            )

    # Ratio LT1/LT2
    if patterns.lt1_lt2_ratio and "lt1_lt2_ratio" in classification.relevant_athlete_patterns:
        ratio = patterns.lt1_lt2_ratio
        lines.append(f"\n**Ratio LT1/LT2:** {ratio.ratio:.2f} ({ratio.metric_used})")
        lines.append(f"- {ratio.interpretation}")

    # Forma de la curva
    if patterns.curve_shapes and "curve_shapes" in classification.relevant_athlete_patterns:
        lines.append("\n**Última curva de lactato:**")
        shape = patterns.curve_shapes[0]
        lines.append(f"- Forma: {shape.shape} (baseline {shape.baseline_mmol}, pico {shape.peak_mmol} mmol)")
        lines.append(f"- {shape.description}")

    # Patrón de entrenamiento
    if patterns.training_pattern and "training_pattern" in classification.relevant_athlete_patterns:
        tp = patterns.training_pattern
        lines.append(f"\n**Entrenamiento reciente:** {tp.avg_sessions_per_week:.0f} sesiones/semana, "
                      f"{tp.avg_duration_min_per_week:.0f} min/semana, patrón {tp.consistency}")

    # Notas de contexto
    if patterns.context_notes:
        lines.append("\n**Contexto:**")
        for note in patterns.context_notes[:3]:
            lines.append(f"- {note}")

    if not lines:
        return None

    return ResponseSection(
        heading="Datos del atleta",
        content="\n".join(lines),
    )


# ═══════════════════════════════════════════════════════════════════════════
# Generador de resumen
# ═══════════════════════════════════════════════════════════════════════════

def _generate_summary(
    papers: list[PaperResult],
    patterns: Optional[DetectedPatterns],
    classification: QuestionClassification,
) -> str:
    """Genera un resumen directo y útil a partir de los abstracts.

    Extrae las conclusiones más relevantes de los papers encontrados
    y las presenta como respuesta directa, no como un listado.
    """
    if not papers:
        return ("No se encontró evidencia científica directa para esta pregunta. "
                "Intenta reformular con términos más específicos (e.g., \"VO2max ironman\", "
                "\"lactate threshold training\").")

    parts: list[str] = []

    # Extraer hallazgos clave de los top 3 papers con abstract
    papers_with_abstract = [p for p in papers if p.abstract and len(p.abstract) > 50]

    if papers_with_abstract:
        parts.append(f"Según la evidencia ({len(papers)} papers encontrados):\n")

        for i, paper in enumerate(papers_with_abstract[:3]):
            ref = papers.index(paper) + 1
            # Extraer la parte más informativa del abstract
            snippet = _extract_key_finding(paper.abstract)
            authors = _authors_short(paper.authors)
            year_str = f" ({paper.year})" if paper.year else ""

            parts.append(f"**[{ref}] {authors}{year_str}:** {snippet}\n")
    else:
        # Si no hay abstracts, al menos listar títulos relevantes
        parts.append(f"Se encontraron {len(papers)} papers relevantes:\n")
        for i, paper in enumerate(papers[:3]):
            ref = i + 1
            authors = _authors_short(paper.authors)
            year_str = f" ({paper.year})" if paper.year else ""
            parts.append(f"- [{ref}] {authors}{year_str}: {paper.title}\n")

    # Contexto del atleta
    if patterns and classification.needs_athlete_data:
        athlete_parts: list[str] = []
        if patterns.threshold_trends:
            best = patterns.threshold_trends[0]
            direction_map = {
                "improving": "mejorando",
                "stable": "estable",
                "declining": "empeorando",
            }
            athlete_parts.append(
                f"el {best.threshold.upper()} está "
                f"{direction_map.get(best.direction, best.direction)} "
                f"({best.delta_pct:+.1f}%)"
            )
        if patterns.lt1_lt2_ratio:
            r = patterns.lt1_lt2_ratio
            athlete_parts.append(f"ratio LT1/LT2 = {r.ratio:.2f} (VLamax {r.vlamax_proxy})")

        if athlete_parts:
            parts.append(f"\n**En tu atleta:** {', '.join(athlete_parts)}.")

    return "".join(parts)


def _extract_key_finding(abstract: str) -> str:
    """Extrae la conclusión o hallazgo principal de un abstract.

    Busca frases que empiezan con señales de conclusión/resultado.
    Si no las encuentra, devuelve las primeras frases.
    """
    import re

    # Buscar secciones de conclusión/resultados en abstracts estructurados
    conclusion_patterns = [
        r"(?:CONCLUSION|CONCLUSIONS|SUMMARY)[:\s]+(.+?)(?:\.|$)",
        r"(?:These results|Our results|The results|Results suggest|We conclude|In conclusion|Overall)[,\s]+(.+?)(?:\.\s|$)",
        r"(?:indicate|suggest|demonstrate|show|reveal)[sd]?\s+that\s+(.+?)(?:\.\s|$)",
    ]

    for pattern in conclusion_patterns:
        match = re.search(pattern, abstract, re.IGNORECASE)
        if match:
            finding = match.group(1).strip()
            # Limitar longitud
            if len(finding) > 200:
                finding = finding[:200].rsplit(" ", 1)[0] + "..."
            # Capitalizar primera letra
            return finding[0].upper() + finding[1:] if finding else finding

    # Fallback: últimas 1-2 frases del abstract (suelen ser la conclusión)
    sentences = re.split(r'(?<=[.!?])\s+', abstract)
    if len(sentences) >= 2:
        last_sentences = " ".join(sentences[-2:])
    else:
        last_sentences = abstract

    if len(last_sentences) > 250:
        last_sentences = last_sentences[:250].rsplit(" ", 1)[0] + "..."

    return last_sentences


# ═══════════════════════════════════════════════════════════════════════════
# Builder principal
# ═══════════════════════════════════════════════════════════════════════════

def build_response(
    question: str,
    search_result: SearchResult,
    patterns: Optional[DetectedPatterns],
    classification: QuestionClassification,
) -> AdvisorResponse:
    """Construye la respuesta completa del Science Advisor.

    Args:
        question: Pregunta original del entrenador.
        search_result: Resultado de la búsqueda científica.
        patterns: Patrones detectados del atleta (None si no se pidieron datos).
        classification: Clasificación de la pregunta.
    """
    papers = search_result.papers
    citations = _build_citations(papers)

    # Secciones
    sections: list[ResponseSection] = []

    # 1. Evidencia científica adicional (top 3 ya están en el summary)
    evidence = _build_evidence_section(papers, classification)
    if evidence:
        sections.append(evidence)

    # 2. Datos del atleta (si aplica)
    if patterns:
        athlete_section = _build_athlete_section(patterns, classification)
        if athlete_section:
            sections.append(athlete_section)

    # Warnings sobre calidad de datos
    data_warnings: list[str] = []
    if patterns and patterns.data_freshness:
        if patterns.data_freshness.warning:
            data_warnings.append(patterns.data_freshness.warning)

    # Contexto del atleta (frase corta)
    athlete_context = None
    if patterns and patterns.context_notes:
        athlete_context = " · ".join(patterns.context_notes[:2])

    # Resumen
    summary = _generate_summary(papers, patterns, classification)

    # Metadata de búsqueda
    search_meta = {
        "strategies_used": search_result.strategies_used,
        "total_found": search_result.total_found,
        "papers_returned": len(papers),
        "primary_topic": classification.primary_topic,
        "intent": classification.intent,
        "needs_athlete_data": classification.needs_athlete_data,
    }

    return AdvisorResponse(
        question=question,
        summary=summary,
        sections=sections,
        citations=citations,
        athlete_context=athlete_context,
        data_warnings=data_warnings,
        search_meta=search_meta,
    )
