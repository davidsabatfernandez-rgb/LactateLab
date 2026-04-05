"""Behavior correlation and insights digest models.

  - behavior_correlations: pre-computed correlation between a behavior and an outcome metric
  - behavior_insights_digests: weekly/monthly summary payloads (JSON)
"""
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class BehaviorCorrelation(Base):
    __tablename__ = "behavior_correlations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    behavior_key: Mapped[str] = mapped_column(String(60), nullable=False)
    outcome_metric: Mapped[str] = mapped_column(String(30), nullable=False)

    sample_size_with: Mapped[int] = mapped_column(Integer, nullable=False)
    sample_size_without: Mapped[int] = mapped_column(Integer, nullable=False)
    mean_with: Mapped[float] = mapped_column(Float, nullable=False)
    mean_without: Mapped[float] = mapped_column(Float, nullable=False)
    effect_pct: Mapped[float] = mapped_column(Float, nullable=False)
    effect_direction: Mapped[str] = mapped_column(String(10), nullable=False)
    """'positive', 'negative', or 'neutral'"""
    confidence: Mapped[str] = mapped_column(String(10), nullable=False)
    """'low', 'medium', or 'high'"""
    p_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lag_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    window_days: Mapped[int] = mapped_column(Integer, nullable=False, default=90)

    computed_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    athlete = relationship("Athlete")

    __table_args__ = (
        UniqueConstraint("athlete_id", "behavior_key", "outcome_metric", "lag_days", name="uq_correlation_key"),
    )


class BehaviorInsightsDigest(Base):
    __tablename__ = "behavior_insights_digests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    digest_type: Mapped[str] = mapped_column(String(10), nullable=False)
    """'weekly' or 'monthly'"""
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    """JSON string with the digest content."""
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    athlete = relationship("Athlete")

    __table_args__ = (
        UniqueConstraint("athlete_id", "digest_type", "period_start", name="uq_digest_key"),
    )
