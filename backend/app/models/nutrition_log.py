"""Nutrition log model.

One row per athlete per day with macro intake and hydration.
Supports both manual entry and quick presets.
"""
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class NutritionLog(Base):
    __tablename__ = "nutrition_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    log_date: Mapped[date] = mapped_column(Date, index=True)

    # Macros
    carbs_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    protein_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fat_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    calories_kcal: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    hydration_l: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Quick preset used (null if manual entry)
    preset: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    athlete = relationship("Athlete", back_populates="nutrition_logs")

    __table_args__ = (
        UniqueConstraint("athlete_id", "log_date", name="uq_nutrition_athlete_date"),
    )
