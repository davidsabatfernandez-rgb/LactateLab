"""AI Coach — conversational assistant with full athlete context.

Uses OpenRouter (Claude Sonnet 4.6) to power an AI coach that can chat with
athletes using their physiological AND wellness data.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.athlete import Athlete
from app.models.chat_message import ChatMessage
from app.models.garmin_activity import GarminActivity
from app.models.health_sample import HealthSample
from app.models.wellness_checkin import WellnessCheckIn
from app.services.science_advisor.llm_client import DOMAIN_GLOSSARY

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# System prompt — fisiólogo deportivo + coach de bienestar
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = f"""Eres un fisiólogo deportivo y coach IA de PeakAerobic, especializado en deportes de resistencia (triatlón, running, ciclismo, natación).

PERSONALIDAD:
- Cercano pero profesional. Tuteas al atleta.
- Directo y conciso — no divagues.
- Basado en evidencia científica.
- Siempre positivo pero honesto.

CAPACIDADES:
- Tienes acceso a los datos fisiológicos completos del atleta (umbrales de lactato, zonas, estimaciones, tendencias, curva de lactato).
- Tienes acceso a datos de bienestar recientes (HRV, FC reposo, sueño, recuperación, actividades).
- Puedes interpretar curvas de lactato, umbrales LT1/LT2, VO2max, FTP, CSS.
- Puedes analizar tendencias (si está mejorando o empeorando).
- Puedes recomendar zonas de entrenamiento basadas en sus umbrales reales.
- Puedes dar recomendaciones de entrenamiento, recuperación y estilo de vida.

REGLAS:
- Responde SIEMPRE en español.
- Sé conciso: máximo 3-4 párrafos por respuesta.
- Cuando sea relevante, referencia datos concretos del atleta ("tu LT2 está a 4:15/km con lactato de 3.8 mmol").
- NUNCA inventes valores fisiológicos. Si no tienes un dato, di "no tengo datos de X".
- NUNCA diagnostiques condiciones médicas. Si el atleta pregunta sobre síntomas, recomienda consultar a un médico.
- Si no tienes datos suficientes para responder algo, dilo claramente.
- Usa emojis con moderación (máximo 1-2 por respuesta).
- Prioriza consejos accionables sobre teoría.

{DOMAIN_GLOSSARY}
""".strip()


# ═══════════════════════════════════════════════════════════════════════════════
# Helper — format pace from seconds/km to min:ss/km
# ═══════════════════════════════════════════════════════════════════════════════

def _fmt_pace(seconds_per_km: float | None) -> str:
    if not seconds_per_km or seconds_per_km <= 0:
        return "—"
    mins = int(seconds_per_km) // 60
    secs = int(seconds_per_km) % 60
    return f"{mins}:{secs:02d}/km"


# ═══════════════════════════════════════════════════════════════════════════════
# Context builders
# ═══════════════════════════════════════════════════════════════════════════════

def get_physiology_context(db: Session, athlete_id: int) -> str:
    """Build text context from the full physiological analysis payload."""
    try:
        from app.services.analytics import athlete_analysis_payload
        analysis = athlete_analysis_payload(db, athlete_id)
    except Exception as e:
        logger.warning("Could not load physiology context: %s", e)
        return ""

    sections: list[str] = []

    # -- Thresholds --
    thresholds = analysis.get("thresholds", [])
    if thresholds:
        th_lines = []
        for t in thresholds:
            parts = [f"{t['name']}:"]
            if t.get("lactate") is not None:
                parts.append(f"lactato={t['lactate']:.1f} mmol/L")
            if t.get("pace_seconds_per_km"):
                parts.append(f"ritmo={_fmt_pace(t['pace_seconds_per_km'])}")
            if t.get("power_watts"):
                parts.append(f"potencia={t['power_watts']:.0f}W")
            if t.get("heart_rate"):
                parts.append(f"FC={t['heart_rate']:.0f}bpm")
            if t.get("confidence") is not None:
                parts.append(f"confianza={t['confidence']:.0%}")
            th_lines.append(" ".join(parts))
        sections.append("UMBRALES DE LACTATO:\n" + "\n".join(f"- {l}" for l in th_lines))

    # -- Zones --
    zones = analysis.get("zones", [])
    if zones:
        zone_lines = []
        for z in zones:
            parts = [f"Z{z.get('zone_id', '?')} {z.get('zone_name', '')}:"]
            if z.get("min_pace") and z.get("max_pace"):
                parts.append(f"{_fmt_pace(z['max_pace'])} - {_fmt_pace(z['min_pace'])}")
            if z.get("hr_min") and z.get("hr_max"):
                parts.append(f"FC {z['hr_min']:.0f}-{z['hr_max']:.0f}bpm")
            zone_lines.append(" ".join(parts))
        sections.append("ZONAS DE ENTRENAMIENTO:\n" + "\n".join(f"- {l}" for l in zone_lines))

    # -- Estimates --
    estimates = analysis.get("estimates", [])
    if estimates:
        est_lines = []
        for e in estimates[:8]:
            parts = [f"{e['estimate_type']}:"]
            if e.get("value") is not None:
                parts.append(f"{e['value']} {e.get('unit', '')}")
            if e.get("lower_bound") is not None and e.get("upper_bound") is not None:
                parts.append(f"(rango {e['lower_bound']}-{e['upper_bound']})")
            if e.get("reliability_label"):
                parts.append(f"fiabilidad={e['reliability_label']}")
            est_lines.append(" ".join(parts))
        sections.append("ESTIMACIONES RENDIMIENTO:\n" + "\n".join(f"- {l}" for l in est_lines))

    # -- Trends --
    trends = analysis.get("trends", [])
    if trends:
        trend_lines = []
        for t in trends[:6]:
            direction = {"improving": "mejorando", "degrading": "empeorando", "stable": "estable"}.get(
                t.get("direction", ""), t.get("direction", "")
            )
            trend_lines.append(f"{t['metric']}: {direction} ({t['value']:+.1%})")
        sections.append("TENDENCIAS RECIENTES:\n" + "\n".join(f"- {l}" for l in trend_lines))

    # -- Active focus block --
    block = analysis.get("active_focus_block")
    if block:
        block_parts = []
        if hasattr(block, "block_type"):
            block_parts.append(f"Tipo: {block.block_type}")
        if hasattr(block, "priority_discipline"):
            block_parts.append(f"Disciplina: {block.priority_discipline}")
        if hasattr(block, "start_date") and hasattr(block, "end_date"):
            block_parts.append(f"Periodo: {block.start_date} → {block.end_date}")
        if block_parts:
            sections.append("BLOQUE ENTRENAMIENTO ACTIVO:\n" + "\n".join(f"- {p}" for p in block_parts))

    # -- Interpretation comments --
    interpretation = analysis.get("interpretation", [])
    if interpretation:
        sections.append("COMENTARIOS DEL SISTEMA:\n" + "\n".join(f"- {c}" for c in interpretation[:5]))

    # -- Snapshot date --
    snap_date = analysis.get("latest_snapshot_date")
    if snap_date:
        sections.append(f"ULTIMA EVALUACION FISIOLOGICA: {snap_date}")

    return "\n\n".join(sections) if sections else ""


async def get_wellness_context(db: Session, athlete_id: int) -> str:
    """Build text context with the athlete's recent wellness/health data."""
    today = date.today()
    week_ago = today - timedelta(days=7)

    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if not athlete:
        return "Sin datos del atleta."

    sections: list[str] = []

    # -- Athlete profile --
    profile_parts = [f"Nombre: {athlete.name}"]
    if athlete.primary_discipline:
        profile_parts.append(f"Disciplina: {athlete.primary_discipline}")
    if athlete.weight:
        profile_parts.append(f"Peso: {athlete.weight} kg")
    if athlete.sex:
        profile_parts.append(f"Sexo: {athlete.sex}")
    sections.append("PERFIL:\n" + "\n".join(f"- {p}" for p in profile_parts))

    # -- Last 7 days health metrics --
    samples = db.scalars(
        select(HealthSample)
        .where(
            HealthSample.athlete_id == athlete_id,
            HealthSample.sample_date >= week_ago,
        )
        .order_by(HealthSample.sample_date.desc())
    ).all()

    if samples:
        health_lines = []
        for s in samples[:7]:
            parts = [f"Fecha: {s.sample_date}"]
            if s.hrv_sdnn is not None:
                parts.append(f"HRV={s.hrv_sdnn:.0f}ms")
            if s.resting_hr is not None:
                parts.append(f"FC_reposo={s.resting_hr}bpm")
            if s.sleep_seconds is not None:
                parts.append(f"Sueno={s.sleep_seconds / 3600:.1f}h")
            if s.deep_sleep_seconds is not None:
                parts.append(f"Profundo={s.deep_sleep_seconds / 3600:.1f}h")
            if s.rem_sleep_seconds is not None:
                parts.append(f"REM={s.rem_sleep_seconds / 3600:.1f}h")
            if s.spo2 is not None:
                parts.append(f"SpO2={s.spo2:.1f}%")
            if s.respiration_rate is not None:
                parts.append(f"Resp={s.respiration_rate:.1f}")
            if s.steps is not None:
                parts.append(f"Pasos={s.steps}")
            if s.exercise_minutes is not None:
                parts.append(f"Ejercicio={s.exercise_minutes}min")
            if s.vo2max is not None:
                parts.append(f"VO2max={s.vo2max:.1f}")
            health_lines.append(" | ".join(parts))
        sections.append("METRICAS SALUD (7 dias):\n" + "\n".join(health_lines))

        # Averages
        hrv_vals = [s.hrv_sdnn for s in samples if s.hrv_sdnn is not None]
        rhr_vals = [s.resting_hr for s in samples if s.resting_hr is not None]
        sleep_vals = [s.sleep_seconds / 3600 for s in samples if s.sleep_seconds is not None]
        avg_parts = []
        if hrv_vals:
            avg_parts.append(f"HRV media={sum(hrv_vals) / len(hrv_vals):.1f}ms")
        if rhr_vals:
            avg_parts.append(f"FC reposo media={sum(rhr_vals) / len(rhr_vals):.0f}bpm")
        if sleep_vals:
            avg_parts.append(f"Sueno medio={sum(sleep_vals) / len(sleep_vals):.1f}h")
        if avg_parts:
            sections.append("PROMEDIOS 7 DIAS: " + " | ".join(avg_parts))

    # -- Recovery score --
    try:
        from app.services.athlete_health import compute_recovery_score
        recovery = compute_recovery_score(db, athlete_id, today)
        if recovery.get("score") is not None:
            zone = recovery.get("zone_label", "")
            sections.append(f"RECOVERY SCORE HOY: {recovery['score']}/100 ({zone})")
    except Exception:
        pass

    # -- Recent activities (last 7 days) --
    activities = db.scalars(
        select(GarminActivity)
        .where(
            GarminActivity.athlete_id == athlete_id,
            GarminActivity.started_at >= datetime.combine(today - timedelta(days=7), datetime.min.time()),
        )
        .order_by(GarminActivity.started_at.desc())
    ).all()

    if activities:
        act_lines = []
        for a in activities[:10]:
            parts = [a.sport_type or "actividad"]
            if a.distance_m:
                parts.append(f"{a.distance_m / 1000:.1f}km")
            if a.moving_time_seconds:
                parts.append(f"{a.moving_time_seconds // 60}min")
            if a.average_heartrate:
                parts.append(f"FC_avg={a.average_heartrate:.0f}")
            if a.calories:
                parts.append(f"{a.calories:.0f}kcal")
            started = str(a.started_at)[:10] if a.started_at else ""
            act_lines.append(f"{started}: {' | '.join(parts)}")
        sections.append("ACTIVIDADES RECIENTES (7d):\n" + "\n".join(act_lines))

    # -- Wellness check-ins --
    checkins = db.scalars(
        select(WellnessCheckIn)
        .where(
            WellnessCheckIn.athlete_id == athlete_id,
            WellnessCheckIn.check_date >= week_ago,
        )
        .order_by(WellnessCheckIn.check_date.desc())
    ).all()

    if checkins:
        well_lines = []
        for c in checkins[:7]:
            avg = (c.fatigue + c.soreness + c.mood + c.sleep_quality) / 4
            well_lines.append(
                f"{c.check_date}: Fatiga={c.fatigue}/5 Dolor={c.soreness}/5 "
                f"Animo={c.mood}/5 SuenoQ={c.sleep_quality}/5 (media={avg:.1f})"
            )
        sections.append("BIENESTAR SUBJETIVO (7d):\n" + "\n".join(well_lines))

    # -- Health alerts --
    try:
        from app.services.health_alerts import check_health_alerts
        alerts = check_health_alerts(db, athlete_id, today)
        if alerts:
            alert_lines = [f"- {a['severity'].upper()}: {a['message']}" for a in alerts[:5]]
            sections.append("ALERTAS ACTIVAS:\n" + "\n".join(alert_lines))
    except Exception:
        pass

    # -- Behavior correlations (top 3 positive/negative) --
    try:
        from app.services.behavior_correlation_engine import get_insights_summary
        insights = get_insights_summary(db, athlete_id)
        corr_lines = []
        for c in insights.get("top_positive", [])[:3]:
            corr_lines.append(f"+ {c['behavior_label']}: {c['narrative']}")
        for c in insights.get("top_negative", [])[:3]:
            corr_lines.append(f"- {c['behavior_label']}: {c['narrative']}")
        if corr_lines:
            sections.append("CORRELACIONES COMPORTAMIENTO:\n" + "\n".join(corr_lines))
    except Exception:
        pass

    return "\n\n".join(sections) if sections else "Sin datos disponibles."


# ═══════════════════════════════════════════════════════════════════════════════
# Chat persistence helpers
# ═══════════════════════════════════════════════════════════════════════════════

def load_history(db: Session, athlete_id: int, limit: int = 50) -> list[dict]:
    """Load persisted chat messages for display."""
    rows = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.athlete_id == athlete_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {"role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
        for m in reversed(rows)
    ]


def clear_history(db: Session, athlete_id: int) -> int:
    """Delete all chat messages for an athlete. Returns count deleted."""
    result = db.execute(
        delete(ChatMessage).where(ChatMessage.athlete_id == athlete_id)
    )
    db.commit()
    return result.rowcount


def _save_message(db: Session, athlete_id: int, role: str, content: str) -> None:
    db.add(ChatMessage(athlete_id=athlete_id, role=role, content=content))
    db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# Main chat function
# ═══════════════════════════════════════════════════════════════════════════════

async def chat(
    db: Session,
    athlete_id: int,
    message: str,
    history: Optional[list[dict]] = None,
) -> tuple[str, str]:
    """Send a message to the AI coach with full athlete context.

    Returns:
        Tuple of (response_text, context_summary).
    """
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise ValueError("OPENROUTER_API_KEY is not configured")

    # Build full context: wellness + physiology
    wellness = await get_wellness_context(db, athlete_id)
    physiology = get_physiology_context(db, athlete_id)

    context_parts = [wellness]
    if physiology:
        context_parts.append(physiology)
    full_context = "\n\n".join(context_parts)

    # Build context summary (short version for frontend)
    summary_parts = []
    for line in wellness.split("\n"):
        if line.startswith("RECOVERY SCORE"):
            summary_parts.append(line.replace("RECOVERY SCORE HOY: ", "Recovery: "))
        elif line.startswith("PROMEDIOS"):
            summary_parts.append(line.replace("PROMEDIOS 7 DIAS: ", ""))
        elif line.startswith("ALERTAS"):
            summary_parts.append("Alertas activas")
    context_summary = " | ".join(summary_parts) if summary_parts else "Datos cargados"

    # Build messages for LLM
    system_message = f"{SYSTEM_PROMPT}\n\n--- DATOS DEL ATLETA ---\n{full_context}"
    messages: list[dict[str, str]] = [{"role": "system", "content": system_message}]

    # Load conversation history from DB (last 20 for LLM context)
    db_history = load_history(db, athlete_id, limit=20)
    for msg in db_history:
        if msg["role"] in ("user", "assistant") and msg["content"]:
            messages.append({"role": msg["role"], "content": msg["content"]})

    # Add current message
    messages.append({"role": "user", "content": message})

    # Save user message to DB
    _save_message(db, athlete_id, "user", message)

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                f"{settings.openrouter_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://peakaerobic.com",
                    "X-Title": "PeakAerobic AI Coach",
                },
                json={
                    "model": settings.openrouter_model,
                    "messages": messages,
                    "temperature": 0.6,
                    "max_tokens": 1200,
                    "provider": {"allow_fallbacks": True},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            response_text = data["choices"][0]["message"]["content"].strip()

            # Save assistant response to DB
            _save_message(db, athlete_id, "assistant", response_text)

            logger.info(
                "AI Coach response (%d chars) for athlete %d",
                len(response_text),
                athlete_id,
            )
            return response_text, context_summary

    except httpx.HTTPStatusError as e:
        logger.error("AI Coach HTTP error: %s", e)
        raise ValueError(f"Error del servicio de IA: {e.response.status_code}")
    except Exception as e:
        logger.error("AI Coach error: %s", e)
        raise ValueError(f"Error al comunicar con el coach IA: {e}")
