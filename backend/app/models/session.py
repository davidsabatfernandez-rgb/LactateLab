from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    performed_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    discipline: Mapped[str] = mapped_column(String(50), index=True)
    power_source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    session_type: Mapped[str] = mapped_column(String(50), index=True)
    goal: Mapped[str] = mapped_column(String(255))
    session_heart_rate_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    surface: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    temperature_c: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sprint_protocol: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    """Protocol duration for VLamax sprint tests: '15s' or '30s'. When set, overrides auto-detection."""
    is_draft: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    athlete = relationship("Athlete", back_populates="sessions")
    intervals = relationship(
        "SessionInterval",
        back_populates="session",
        order_by="SessionInterval.order_index",
        cascade="all, delete-orphan",
    )
    snapshots = relationship("PhysiologicalSnapshot", back_populates="session")
    metrics = relationship("DerivedMetric", back_populates="session")


class SessionInterval(Base):
    __tablename__ = "session_intervals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    order_index: Mapped[int] = mapped_column(Integer, index=True)
    duration_seconds: Mapped[int] = mapped_column(Integer)
    rest_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rest_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    heart_rate_avg: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    heart_rate_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pace_seconds_per_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    power_watts: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    running_power_watts: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cadence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rpe: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    purpose: Mapped[str] = mapped_column(String(50))
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    session = relationship("Session", back_populates="intervals")
    lactate_sample = relationship(
        "LactateSample",
        back_populates="interval",
        uselist=False,
        cascade="all, delete-orphan",
    )


class LactateSample(Base):
    __tablename__ = "lactate_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    interval_id: Mapped[int] = mapped_column(ForeignKey("session_intervals.id", ondelete="CASCADE"), index=True)
    lactate_mmol: Mapped[float] = mapped_column(Float)
    baseline_lactate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sample_delay_seconds: Mapped[int] = mapped_column(Integer)
    sample_timing_label: Mapped[str] = mapped_column(String(50))
    sampling_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    contextual_lactate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    contextual_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    interpretation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    interval = relationship("SessionInterval", back_populates="lactate_sample")
