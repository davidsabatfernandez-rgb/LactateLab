from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TrainingZoneSet(Base):
    """Conjunto de zonas de entrenamiento personalizadas para un atleta+disciplina.

    Un set agrupa N zonas (Z1..Z7) bajo un nombre descriptivo.
    Solo un set puede estar activo por atleta+disciplina a la vez.
    """

    __tablename__ = "training_zone_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    discipline: Mapped[str] = mapped_column(String(50), index=True)
    name: Mapped[str] = mapped_column(String(150))
    is_active: Mapped[bool] = mapped_column(default=True, server_default="1")
    threshold_source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    """Source type at creation: individual | physiological | analysis | manual"""
    threshold_context: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    """Snapshot of LT1/LT2 values at creation time for auditability."""
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    athlete = relationship("Athlete", back_populates="training_zone_sets")
    zones = relationship("TrainingZone", back_populates="zone_set", cascade="all, delete-orphan", order_by="TrainingZone.zone_number")


class TrainingZone(Base):
    """Una zona individual dentro de un TrainingZoneSet."""

    __tablename__ = "training_zones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    zone_set_id: Mapped[int] = mapped_column(ForeignKey("training_zone_sets.id", ondelete="CASCADE"), index=True)
    zone_number: Mapped[int] = mapped_column(Integer)
    zone_label: Mapped[str] = mapped_column(String(50))
    zone_color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Pace boundaries (seconds per km — lower = slower, upper = faster for running)
    pace_lower_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pace_upper_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # HR boundaries
    hr_lower: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hr_upper: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Power boundaries (cycling)
    power_lower: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    power_upper: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    zone_set = relationship("TrainingZoneSet", back_populates="zones")
