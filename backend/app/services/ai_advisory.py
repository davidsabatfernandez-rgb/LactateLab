"""AI Advisory — generates cached LLM narrative for lactate curve insights.

Called ONCE during recalculate_athlete(), cached in snapshot.payload["ai_advisory"].
Never called on page load — only when new data triggers recalculation.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.core.config import get_settings
from app.services.science_advisor.llm_client import DOMAIN_GLOSSARY

logger = logging.getLogger(__name__)


def generate_curve_advisory(
    curve_insights: dict[str, Any] | None,
    thresholds: list[dict[str, Any]],
    data_quality: dict[str, Any] | None,
    days_since_previous: int | None,
    discipline: str,
) -> dict[str, Any] | None:
    """Generate a 3-5 bullet AI narrative interpreting the athlete's curve state.

    Returns dict with {bullets: list[str], generated_at: str} or None on failure.
    """
    settings = get_settings()
    if not settings.openrouter_api_key:
        return None

    if not curve_insights and not thresholds:
        return None

    # Build compact prompt
    sections: list[str] = []

    # Thresholds
    if thresholds:
        th_lines = []
        for t in thresholds:
            parts = [f"{t.get('name', '?')}:"]
            if t.get("lactate") is not None:
                parts.append(f"lactato={t['lactate']:.1f}")
            if t.get("pace_seconds_per_km"):
                mins = int(t["pace_seconds_per_km"]) // 60
                secs = int(t["pace_seconds_per_km"]) % 60
                parts.append(f"ritmo={mins}:{secs:02d}/km")
            if t.get("power_watts"):
                parts.append(f"potencia={t['power_watts']:.0f}W")
            if t.get("heart_rate"):
                parts.append(f"FC={t['heart_rate']:.0f}bpm")
            if t.get("confidence") is not None:
                parts.append(f"confianza={t['confidence']:.0%}")
            th_lines.append(" ".join(parts))
        sections.append("UMBRALES:\n" + "\n".join(th_lines))

    # Curve alerts
    alerts = (curve_insights or {}).get("curve_alerts", [])
    if alerts:
        alert_lines = [f"- [{a.get('severity', 'info')}] {a.get('title', '')}: {a.get('message', '')}" for a in alerts]
        sections.append("ALERTAS DEL MOTOR:\n" + "\n".join(alert_lines))

    # Trainability
    trainability = (curve_insights or {}).get("trainability")
    if trainability:
        sections.append(f"ENTRENABILIDAD: {trainability.get('direction', '?')} (indice={trainability.get('trainability_index', '?')})")

    # Data quality
    if data_quality:
        sections.append(
            f"CALIDAD DATOS: {data_quality.get('stage_count', '?')} escalones, "
            f"monotonía={data_quality.get('monotonicity', '?')}, "
            f"señal={data_quality.get('signal_score', '?')}"
        )

    # Days since previous
    if days_since_previous is not None:
        sections.append(f"DIAS DESDE TEST ANTERIOR: {days_since_previous}")

    sections.append(f"DISCIPLINA: {discipline}")

    context = "\n\n".join(sections)

    prompt = f"""{DOMAIN_GLOSSARY}

---

Eres un fisiólogo deportivo. Analiza los datos de la curva de lactato de este atleta y genera entre 3 y 5 bullets interpretativos en español.

{context}

REGLAS:
- Sé conciso y accionable. Cada bullet máximo 2 líneas.
- Tutea al atleta.
- Referencia datos concretos ("tu LT2 está a...").
- Si hay alertas, interprétalas en contexto.
- NO inventes valores que no estén en los datos.
- Si los datos son insuficientes, dilo.

Responde SOLO con un JSON array de strings (los bullets). Sin explicación adicional. Ejemplo:
["Tu LT2 ha mejorado un 3%...", "El baseline elevado sugiere..."]"""

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                f"{settings.openrouter_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.openrouter_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.4,
                    "max_tokens": 400,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"].strip()

            # Parse JSON array from response
            start = content.find("[")
            end = content.rfind("]") + 1
            if start >= 0 and end > start:
                bullets = json.loads(content[start:end])
                if isinstance(bullets, list) and all(isinstance(b, str) for b in bullets):
                    logger.info("AI advisory generated %d bullets for %s", len(bullets), discipline)
                    return {
                        "bullets": bullets[:5],
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                    }

            logger.warning("AI advisory response not parseable: %s", content[:200])
            return None

    except Exception as e:
        logger.warning("AI advisory generation failed (non-blocking): %s", e)
        return None
