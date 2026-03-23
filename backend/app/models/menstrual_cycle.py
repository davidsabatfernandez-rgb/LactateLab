"""Menstrual cycle tracking models.

Three tables:
  - menstrual_cycle_preferences: one-to-one per athlete (onboarding + settings)
  - menstrual_cycle_logs: one row per cycle (period start → next period start)
  - menstrual_daily_logs: one row per day the athlete logs symptoms
"""
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MenstrualCyclePreferences(Base):
    __tablename__ = "menstrual_cycle_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    tracking_goal: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    """Objetivo: period_tracking | performance_sync | symptom_awareness | all"""
    average_cycle_length_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    average_period_length_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cycles_are_regular: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    uses_hormonal_contraception: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    contraception_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    """pill | iud_hormonal | iud_copper | implant | patch | ring | injection | none"""
    last_period_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notify_phase_change: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    share_with_coach: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    athlete = relationship("Athlete", back_populates="cycle_preferences")


class MenstrualCycleLog(Base):
    __tablename__ = "menstrual_cycle_logs"
    __table_args__ = (
        UniqueConstraint("athlete_id", "cycle_start_date", name="uq_athlete_cycle_start"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    cycle_start_date: Mapped[date] = mapped_column(Date, index=True)
    cycle_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    period_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    cycle_length_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    period_length_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_predicted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    athlete = relationship("Athlete", back_populates="cycle_logs")


class MenstrualDailyLog(Base):
    __tablename__ = "menstrual_daily_logs"
    __table_args__ = (
        UniqueConstraint("athlete_id", "log_date", name="uq_athlete_daily_log"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    log_date: Mapped[date] = mapped_column(Date, index=True)

    # Flow
    flow_intensity: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    """none | spotting | light | medium | heavy"""

    # Symptoms
    cramps_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """0=none, 1=mild, 2=moderate, 3=severe"""
    energy_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """1-5 Likert"""
    mood: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    """great | good | neutral | low | irritable | anxious | emotional"""
    bloating: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    headache: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    breast_tenderness: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    back_pain: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    acne: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    sleep_quality: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """1-5 Likert"""
    appetite: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    """normal | increased | decreased"""
    exercise_tolerance: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    """great | normal | reduced | very_low"""

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    athlete = relationship("Athlete", back_populates="daily_cycle_logs")
