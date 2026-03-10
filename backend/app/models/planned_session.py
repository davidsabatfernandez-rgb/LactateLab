from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PlannedSession(Base):
    __tablename__ = "planned_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    focus_block_id: Mapped[int] = mapped_column(ForeignKey("athlete_focus_blocks.id", ondelete="CASCADE"), index=True)
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
    confidence: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(30), index=True, default="planned")
    bla_check: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    """Si True, el entrenador pide medición de lactato durante esta sesión para validar el mesociclo."""
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    athlete = relationship("Athlete", back_populates="planned_sessions")
    focus_block = relationship("AthleteFocusBlock", back_populates="planned_sessions")
