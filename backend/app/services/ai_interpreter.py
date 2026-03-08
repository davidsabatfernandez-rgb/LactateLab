from __future__ import annotations

import httpx
from statistics import mean

from app.core.config import get_settings


def _combined_goal(goal: str, focus: str | None = None, question: str | None = None) -> str:
    parts = [goal or "Sin objetivo definido"]
    if focus:
        parts.append(f"Foco prioritario: {focus}")
    if question:
        parts.append(f"Pregunta a resolver: {question}")
    return "\n".join(parts)


def build_athlete_prompt(analysis: dict, goal: str, focus: str | None = None, question: str | None = None) -> str:
    threshold_lines = []
    for threshold in analysis.get("thresholds", []):
        threshold_lines.append(
            f"{threshold['name']}: lactato={threshold.get('lactate')}, ritmo={threshold.get('pace_seconds_per_km')}, FC={threshold.get('heart_rate')}, confianza={threshold.get('confidence')}"
        )
    trend_lines = []
    for trend in analysis.get("trends", [])[:6]:
        trend_lines.append(f"{trend['metric']}: {trend['direction']} ({trend['value']:+.1%}), confianza={trend['confidence']}")
    estimate_lines = []
    for estimate in analysis.get("estimates", [])[:8]:
        estimate_lines.append(
            f"{estimate['estimate_type']}: {estimate['value']} {estimate['unit']} (IC {estimate.get('lower_bound')} - {estimate.get('upper_bound')}), fiabilidad={estimate['reliability_label']}"
        )

    return f"""
Eres un analista fisiológico para deportes de resistencia.
Da una interpretación breve, accionable y específica. No escribas una biblia.
Máximo 8 bullets cortos.

Objetivo del atleta:
{_combined_goal(goal, focus, question)}

Datos del atleta:
- Nombre: {analysis['athlete'].name}
- Disciplina: {analysis['athlete'].primary_discipline}
- Peso: {analysis['athlete'].weight}

Umbrales:
{chr(10).join(threshold_lines) if threshold_lines else "- Sin umbrales"}

Tendencias:
{chr(10).join(trend_lines) if trend_lines else "- Sin tendencias"}

Estimaciones:
{chr(10).join(estimate_lines) if estimate_lines else "- Sin estimaciones"}

Comentarios del sistema:
{chr(10).join(analysis.get("interpretation", [])[:4]) if analysis.get("interpretation") else "- Sin comentarios"}

Devuelve:
1. estado actual
2. lo más relevante respecto al objetivo
3. una alerta si existe
4. dos acciones prácticas de entrenamiento
5. una advertencia de fiabilidad si aplica
""".strip()


def request_openrouter_interpretation(prompt: str) -> tuple[str, str]:
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise ValueError("OPENROUTER_API_KEY is not configured")

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Lactate Lab",
        "X-OpenRouter-Title": "Lactate Lab",
    }
    payload = {
        "model": settings.openrouter_model,
        "messages": [{"role": "user", "content": prompt}],
        "provider": {"allow_fallbacks": True},
    }
    with httpx.Client(timeout=60.0) as client:
        response = client.post(f"{settings.openrouter_base_url}/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
    text = data["choices"][0]["message"]["content"]
    return settings.openrouter_model, text


def build_local_advisor_interpretation(analysis: dict, goal: str) -> tuple[str, str]:
    thresholds = analysis.get("thresholds", [])
    estimates = analysis.get("estimates", [])
    trends = analysis.get("trends", [])
    athlete = analysis.get("athlete")

    lt1 = next((item for item in thresholds if item.get("name") == "LT1"), None)
    lt2 = next((item for item in thresholds if item.get("name") == "LT2"), None)
    ftp = next((item for item in estimates if item.get("estimate_type") == "FTP"), None)
    vo2 = next((item for item in estimates if item.get("estimate_type") == "VO2max"), None)
    degrading = [item for item in trends if item.get("direction") == "degrading"]
    improving = [item for item in trends if item.get("direction") == "improving"]

    bullets: list[str] = []
    bullets.append(f"Estado actual: atleta {athlete.name if athlete else ''} con disciplina principal {athlete.primary_discipline if athlete else 'n/d'}.")
    if lt1:
      bullets.append(
          f"LT1 operativo en {round(lt1.get('power_watts', 0))} W / {lt1.get('heart_rate', '-') } bpm / {lt1.get('lactate', '-') } mmol/L."
          if lt1.get("power_watts")
          else f"LT1 operativo en ritmo {lt1.get('pace_seconds_per_km')} s/km y {lt1.get('heart_rate', '-') } bpm."
      )
    if lt2:
      bullets.append(
          f"LT2 operativo en {round(lt2.get('power_watts', 0))} W / {lt2.get('heart_rate', '-') } bpm / {lt2.get('lactate', '-') } mmol/L."
          if lt2.get("power_watts")
          else f"LT2 operativo en ritmo {lt2.get('pace_seconds_per_km')} s/km y {lt2.get('heart_rate', '-') } bpm."
      )
    if ftp:
        bullets.append(f"Referencia actual de rendimiento: FTP estimado {round(ftp.get('value', 0))} W.")
    if vo2:
        bullets.append(f"VO2max estimado: {round(vo2.get('value', 0) * 10) / 10} ml/kg/min.")
    if improving:
        bullets.append("Señal positiva: hay tendencias recientes en mejora que apoyan progresión controlada.")
    if degrading:
        bullets.append("Alerta: aparecen señales de degradación o pérdida de eficiencia que conviene revisar antes de subir carga.")
    if goal:
        bullets.append(f"Respecto al objetivo, la lectura debe priorizar: {goal[:160]}.")

    confidence_scores = [item.get("score", 0) for item in analysis.get("confidence_summary", []) if isinstance(item.get("score"), (int, float))]
    if confidence_scores:
        confidence = mean(confidence_scores)
        if confidence < 0.6:
            bullets.append("Fiabilidad limitada: conviene confirmar con más muestras comparables antes de tomar decisiones fuertes.")
        else:
            bullets.append("Fiabilidad suficiente para usar esta lectura como base de decisión, con prudencia normal de campo.")

    bullets.append("Acción práctica 1: mantener o ajustar solo una variable dominante por bloque para conservar comparabilidad.")
    bullets.append("Acción práctica 2: repetir estímulo clave con el mismo protocolo si quieres confirmar cambio real.")

    return "local-advisor", "\n".join(f"- {item}" for item in bullets[:8])


def generate_reasoning_interpretation(
    analysis: dict,
    goal: str,
    provider: str = "local",
    focus: str | None = None,
    question: str | None = None,
) -> tuple[str, str, str]:
    normalized_provider = provider.lower().strip()
    prompt = build_athlete_prompt(analysis, goal=goal, focus=focus, question=question)

    if normalized_provider == "openrouter":
        model, interpretation = request_openrouter_interpretation(prompt)
        return normalized_provider, model, interpretation
    if normalized_provider != "local":
        raise ValueError("Unsupported provider. Use 'local' or 'openrouter'.")

    model, interpretation = build_local_advisor_interpretation(analysis, goal=_combined_goal(goal, focus, question))
    return normalized_provider, model, interpretation
