"""Apple Health (HealthKit) samples — stored locally, sent from the iOS app."""

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class HealthSample(Base):
    __tablename__ = "health_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    sample_date: Mapped[date] = mapped_column(Date, index=True)
    source: Mapped[str] = mapped_column(String(30), default="apple_health")
    """Source identifier: apple_health, garmin, manual."""

    # Sleep
    sleep_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    deep_sleep_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rem_sleep_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    core_sleep_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    awake_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Heart
    resting_hr: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hrv_sdnn: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """HRV as SDNN (ms) — Apple Watch standard."""

    # Respiratory / SpO2
    respiration_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    spo2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Activity
    steps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    exercise_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    active_energy_kcal: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Apple-estimated
    vo2max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    synced_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    athlete = relationship("Athlete", backref="health_samples")
