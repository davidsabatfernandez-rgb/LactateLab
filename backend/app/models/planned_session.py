from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PlannedSession(Base):
    __tablename__ = "planned_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    focus_block_id: Mapped[Optional[int]] = mapped_column(ForeignKey("athlete_focus_blocks.id", ondelete="CASCADE"), index=True, nullable=True)
    scheduled_date: Mapped[date] = mapped_column(Date, index=True)
    discipline: Mapped[str] = mapped_column(String(50), index=True)
    week_index: Mapped[int] = mapped_column(Integer)
    day_offset: Mapped[int] = mapped_column(Integer)
    session_role: Mapped[str] = mapped_column(String(30), index=True)
    session_family: Mapped[str] = mapped_column(String(100), index=True)
    workout_template_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    public_label: Mapped[str] = mapped_column(String(255))
    objective: Mapped[str] = mapped_column(Text)
    dose_prescription: Mapped[str] = mapped_column(Text)
    dose_guidance: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    progression_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expected_signal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    coach_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dose_step_override: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """Peldaño manual del entrenador. Si None, usa el calculado por el motor."""
    swapped_template_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    """Template_id alternativo elegido por el entrenador al swapear la sesión."""
    confidence: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(30), index=True, default="planned")
    bla_check: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    """Si True, el entrenador pide medición de lactato durante esta sesión para validar el mesociclo."""
    athlete_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    """Nota personal del atleta sobre la sesión."""
    scheduled_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    """Hora programada en formato HH:MM (24h). Ej: '07:30'."""
    structured_workout_payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    estimated_tss: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """TSS estimado por el motor de planificación para esta sesión."""
    publish_status: Mapped[str] = mapped_column(String(30), index=True, default="draft")
    publish_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    publish_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    structured_workout_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    threshold_snapshot_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    """Fecha en la que los targets de esta sesión se calcularon a partir de los umbrales del atleta."""
    targets_stale: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    """True si los umbrales del atleta han cambiado desde que se generaron los targets de esta sesión."""
    target_mode: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    """Target mode: 'pace', 'hr', 'power', or None (auto). Coach toggles this."""
    execution_status: Mapped[str] = mapped_column(String(30), index=True, default="planned")
    """planned | completed | skipped | partial"""
    linked_activity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    """Garmin activity provider_activity_id linked by auto-matching."""
    actual_performance: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    """{ distance_m, duration_s, avg_pace_s_per_km, avg_hr, avg_power, started_at }"""
    coach_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    """Post-workout text feedback from coach."""
    coach_feedback_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    """When coach feedback was written."""
    execution_rating: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    """Coach's assessment: excellent | good | acceptable | poor."""
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    athlete = relationship("Athlete", back_populates="planned_sessions")
    focus_block = relationship("AthleteFocusBlock", back_populates="planned_sessions")
