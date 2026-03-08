from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from pypdf import PdfReader

from app.core.config import get_settings


STOPWORDS = {
    "the",
    "and",
    "for",
    "that",
    "with",
    "this",
    "from",
    "your",
    "athlete",
    "about",
    "para",
    "como",
    "sobre",
    "estado",
    "actual",
    "query",
    "goal",
    "foco",
    "pregunta",
    "advisor",
    "atleta",
    "libro",
}

QUERY_EXPANSIONS = {
    "lt1": {"threshold", "aerobic", "endurance", "lactate", "intensity"},
    "lt2": {"threshold", "anaerobic", "lactate", "intensity", "capacity"},
    "umbral": {"threshold", "lactate", "intensity"},
    "umbrales": {"threshold", "lactate", "intensity"},
    "lactato": {"lactate", "curve", "threshold", "conditioning"},
    "cadencia": {"stroke", "rate", "frequency", "training"},
    "fatiga": {"fatigue", "recovery", "supercompensation", "timing"},
    "recuperacion": {"recovery", "supercompensation", "timing"},
    "degradacion": {"fatigue", "timing", "recovery", "capacity"},
    "mejora": {"adaptation", "training", "improvement", "capacity"},
    "vo2max": {"aerobic", "capacity", "intensity", "conditioning"},
    "ftp": {"threshold", "intensity", "capacity"},
    "ciclismo": {"training", "intensity", "capacity"},
    "running": {"training", "intensity", "conditioning"},
    "natacion": {"swimming", "training", "intensity", "lactate"},
    "swim": {"swimming", "training", "intensity", "lactate"},
    "triatlon": {"training", "planning", "periodization", "intensity"},
    "planificacion": {"planning", "periodization", "training"},
    "periodizacion": {"periodization", "planning", "training"},
    "tempo": {"intensity", "training", "threshold"},
    "anaerobico": {"anaerobic", "capacity", "lactate"},
    "aerobico": {"aerobic", "endurance", "lactate"},
}


def _tokenize(text: str) -> list[str]:
    return [token for token in re.findall(r"[a-zA-ZÀ-ÿ0-9]+", text.lower()) if len(token) > 2 and token not in STOPWORDS]


def _expand_query_tokens(tokens: set[str]) -> set[str]:
    expanded = set(tokens)
    for token in list(tokens):
        expanded.update(QUERY_EXPANSIONS.get(token, set()))
    return expanded


@lru_cache(maxsize=1)
def load_book_chunks() -> list[dict]:
    book_path = Path(get_settings().advisor_book_path)
    if not book_path.exists():
        return []

    reader = PdfReader(str(book_path))
    chunks: list[dict] = []
    for page_index, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").replace("\xa0", " ")
        parts = [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]
        for part in parts:
            normalized = re.sub(r"\s+", " ", part).strip()
            if len(normalized) < 180:
                continue
            chunks.append(
                {
                    "page": page_index,
                    "text": normalized,
                    "tokens": set(_tokenize(normalized)),
                }
            )
    return chunks


def retrieve_book_context(query: str, limit: int = 3) -> list[dict]:
    chunks = load_book_chunks()
    if not chunks:
        return []

    query_tokens = _expand_query_tokens(set(_tokenize(query)))
    if not query_tokens:
        query_tokens = {"lactate", "training", "threshold"}

    scored = []
    for chunk in chunks:
        overlap_tokens = query_tokens & chunk["tokens"]
        overlap = len(overlap_tokens)
        if overlap <= 0:
            continue
        threshold_bonus = 0.2 if {"threshold", "lactate"} & overlap_tokens else 0
        planning_bonus = 0.2 if {"planning", "periodization", "timing", "recovery"} & overlap_tokens else 0
        score = overlap / max(1, len(query_tokens)) + threshold_bonus + planning_bonus
        scored.append((score, chunk))

    scored.sort(key=lambda item: (item[0], -item[1]["page"]), reverse=True)
    return [chunk for _, chunk in scored[:limit]]


def build_book_advisor_response(analysis: dict, question: str, focus: str | None = None, goal: str | None = None) -> tuple[str, str]:
    athlete = analysis.get("athlete")
    thresholds = analysis.get("thresholds", [])
    trends = analysis.get("trends", [])
    estimates = analysis.get("estimates", [])

    lt1 = next((item for item in thresholds if item.get("name") == "LT1"), None)
    lt2 = next((item for item in thresholds if item.get("name") == "LT2"), None)
    ftp = next((item for item in estimates if item.get("estimate_type") == "FTP"), None)
    query_parts = [
        f"focus {focus}" if focus else None,
        f"goal {goal}" if goal else None,
        question or None,
    ]
    query = " ".join(part for part in query_parts if part)
    top_context = retrieve_book_context(query)

    lines: list[str] = []
    lines.append(f"Advisor basado en: Science of Winning.")
    lines.append(f"Lectura del atleta: {athlete.name if athlete else 'n/d'} · {athlete.primary_discipline if athlete else 'n/d'}.")
    if focus:
        lines.append(f"Foco de consulta: {focus}.")
    if question:
        lines.append(f"Pregunta del entrenador: {question}.")

    if lt1:
        if lt1.get("power_watts"):
            lines.append(
                f"LT1 actual: {round(lt1['power_watts'])} W, {lt1.get('heart_rate', '-')} bpm, {lt1.get('lactate', '-')} mmol/L."
            )
        else:
            lines.append(
                f"LT1 actual: {lt1.get('pace_seconds_per_km', '-')} s/km, {lt1.get('heart_rate', '-')} bpm, {lt1.get('lactate', '-')} mmol/L."
            )
    if lt2:
        if lt2.get("power_watts"):
            lines.append(
                f"LT2 actual: {round(lt2['power_watts'])} W, {lt2.get('heart_rate', '-')} bpm, {lt2.get('lactate', '-')} mmol/L."
            )
        else:
            lines.append(
                f"LT2 actual: {lt2.get('pace_seconds_per_km', '-')} s/km, {lt2.get('heart_rate', '-')} bpm, {lt2.get('lactate', '-')} mmol/L."
            )
    if ftp:
        lines.append(f"FTP estimado actual: {round(ftp.get('value', 0))} W.")
    if trends:
        main_trend = trends[0]
        lines.append(f"Tendencia dominante: {main_trend.get('metric')} {main_trend.get('direction')} ({main_trend.get('value', 0):+.1%}).")
    if goal:
        lines.append(f"Objetivo del atleta: {goal}.")

    if top_context:
        lines.append("Fragmentos del libro más cercanos a esta consulta:")
        for chunk in top_context:
            lines.append(f"- p.{chunk['page']}: {chunk['text'][:360]}...")
    else:
        lines.append("No he encontrado fragmentos muy específicos en el libro para esta consulta; usa esta respuesta como apoyo general.")

    lines.append("Interpretación operativa: responde a la pregunta apoyándote primero en los fragmentos del libro y luego en los datos del atleta.")
    return "science-of-winning", "\n".join(lines)
