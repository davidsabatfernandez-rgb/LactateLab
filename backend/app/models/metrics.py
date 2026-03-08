from datetime import date, datetime
from typing import Optional

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PhysiologicalSnapshot(Base):
    __tablename__ = "physiological_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)
    snapshot_date: Mapped[date] = mapped_column(Date, index=True)
    discipline: Mapped[str] = mapped_column(String(50))
    power_source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    lt1_lactate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lt2_lactate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lt1_pace_seconds_per_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lt2_pace_seconds_per_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lt1_power_watts: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lt2_power_watts: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lt1_heart_rate: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    lt2_heart_rate: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    method: Mapped[str] = mapped_column(String(100))
    confidence: Mapped[float] = mapped_column(Float)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)

    athlete = relationship("Athlete", back_populates="snapshots")
    session = relationship("Session", back_populates="snapshots")
    estimates = relationship("PerformanceEstimate", back_populates="snapshot")


class DerivedMetric(Base):
    __tablename__ = "derived_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)
    metric_type: Mapped[str] = mapped_column(String(100), index=True)
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(50))
    confidence: Mapped[float] = mapped_column(Float)
    recorded_at: Mapped[datetime] = mapped_column(DateTime)
    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)

    athlete = relationship("Athlete", back_populates="metrics")
    session = relationship("Session", back_populates="metrics")


class PerformanceEstimate(Base):
    __tablename__ = "performance_estimates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    snapshot_id: Mapped[Optional[int]] = mapped_column(ForeignKey("physiological_snapshots.id", ondelete="SET NULL"), nullable=True)
    estimate_type: Mapped[str] = mapped_column(String(50), index=True)
    discipline: Mapped[str] = mapped_column(String(50))
    power_source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(50))
    lower_bound: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    upper_bound: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float)
    valid_on: Mapped[date] = mapped_column(Date)
    reliability_label: Mapped[str] = mapped_column(String(50))
    inputs_summary: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)

    athlete = relationship("Athlete", back_populates="estimates")
    snapshot = relationship("PhysiologicalSnapshot", back_populates="estimates")
