"""Models for field-test-based threshold estimation (decoupling + CRI 30').

These tables are completely independent of the lactate-based threshold system.
They only apply to athletes with threshold_mode='field_tests'.
"""

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class DecouplingResult(Base):
    """Result of a single decoupling analysis (dedicated test or session monitoring)."""

    __tablename__ = "decoupling_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    test_date: Mapped[date] = mapped_column(Date, index=True)
    discipline: Mapped[str] = mapped_column(String(50), default="running")

    # Target & measured values
    pace_seconds_per_km: Mapped[float] = mapped_column(Float)
    hr_avg: Mapped[int] = mapped_column(Integer)
    hr_first_half: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hr_second_half: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Analysis output
    drift_pct: Mapped[float] = mapped_column(Float)
    """Pa:Hr decoupling percentage. <3.5 = coupled, 3.5-5 = borderline, >5 = decoupled."""
    verdict: Mapped[str] = mapped_column(String(20))
    """'coupled' | 'borderline' | 'decoupled' | 'invalid'"""

    # Context & quality
    block_duration_min: Mapped[float] = mapped_column(Float)
    """Duration of the steady-state block analyzed (minutes)."""
    pace_cv_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """Coefficient of variation of pace within the block (%). <8 = valid."""
    temp_c: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """Ambient temperature from Garmin weather (Celsius)."""
    temp_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    """True if temperature >28°C — result is less reliable."""

    # Source tracking
    source: Mapped[str] = mapped_column(String(30))
    """'dedicated_test' | 'session_monitoring'"""
    planned_session_id: Mapped[Optional[int]] = mapped_column(ForeignKey("planned_sessions.id", ondelete="SET NULL"), nullable=True)
    garmin_activity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """GarminActivity.provider_activity_id (not FK — just reference)."""

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    athlete = relationship("Athlete")


class TimeTrial30Result(Base):
    """Result of a 30-minute time trial (CRI 30') for LT2 estimation."""

    __tablename__ = "time_trial_30_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    test_date: Mapped[date] = mapped_column(Date, index=True)
    discipline: Mapped[str] = mapped_column(String(50), default="running")

    # Performance
    avg_pace_seconds_per_km: Mapped[float] = mapped_column(Float)
    avg_hr: Mapped[int] = mapped_column(Integer)
    distance_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Pacing validation
    pace_first_half: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """Average pace (s/km) of first 15 minutes."""
    pace_second_half: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """Average pace (s/km) of second 15 minutes."""
    pacing_diff_pct: Mapped[float] = mapped_column(Float)
    """(pace_2nd - pace_1st) / pace_1st × 100. <3 = good, 3-5 = acceptable, >5 = invalid."""
    pacing_quality: Mapped[str] = mapped_column(String(20))
    """'good' | 'acceptable' | 'invalid'"""

    # Context
    temp_c: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    temp_flag: Mapped[bool] = mapped_column(Boolean, default=False)

    # Source tracking
    planned_session_id: Mapped[Optional[int]] = mapped_column(ForeignKey("planned_sessions.id", ondelete="SET NULL"), nullable=True)
    garmin_activity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    athlete = relationship("Athlete")


class FieldTestSnapshot(Base):
    """Aggregated LT1+LT2 estimate from field tests for an athlete+discipline.

    This is the field-test equivalent of PhysiologicalSnapshot / threshold_snapshot.
    The planning engine reads from here when threshold_mode='field_tests'.
    Never mixes with lactate-based thresholds.
    """

    __tablename__ = "field_test_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    discipline: Mapped[str] = mapped_column(String(50), index=True)
    """'running' | 'ciclismo'"""

    # LT1 (from decoupling)
    lt1_pace_seconds_per_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lt1_hr: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    lt1_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lt1_test_count: Mapped[int] = mapped_column(Integer, default=0)
    lt1_last_test_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # LT2 (from CRI 30')
    lt2_pace_seconds_per_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lt2_hr: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    lt2_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lt2_test_count: Mapped[int] = mapped_column(Integer, default=0)
    lt2_last_test_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Cross-validation
    lt1_lt2_ratio_pace: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """LT1 pace / LT2 pace. Plausible range: 0.80-0.92."""
    lt1_lt2_ratio_hr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cross_validation_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    """True if ratios are within plausible range."""

    # Transfer info (for cycling derived from running)
    transfer_source: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    """'running' if this cycling snapshot was transferred from running thresholds."""
    transfer_factor_lt1: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """0.95 for cycling from running LT1."""
    transfer_factor_lt2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """0.93 for cycling from running LT2."""

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    athlete = relationship("Athlete")
