from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GarminActivity(Base):
    __tablename__ = "garmin_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("athletes.id"), nullable=False, index=True)
    provider_activity_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True, index=True)
    sport_type: Mapped[str] = mapped_column(String(100), nullable=False)
    discipline: Mapped[str] = mapped_column(String(50), nullable=False)  # normalized: running/ciclismo/natación/other
    name: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    distance_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    moving_time_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    elapsed_time_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    average_heartrate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_heartrate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    average_watts: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_watts: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    average_speed_m_s: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_speed_m_s: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_elevation_gain_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    average_cadence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    calories: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    device_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    tss: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # calculated TSS
    tss_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # "power" | "pace" | "hr" | "garmin" | "estimate"
    planned_session_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("planned_sessions.id"), nullable=True, index=True)
    raw_summary: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # store garmin summary payload for future use
    synced_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
