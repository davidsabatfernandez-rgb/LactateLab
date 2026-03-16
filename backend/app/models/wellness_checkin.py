from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class WellnessCheckIn(Base):
    __tablename__ = "wellness_checkins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    check_date: Mapped[date] = mapped_column(Date, index=True)
    fatigue: Mapped[int] = mapped_column(Integer)  # 1-5 Likert
    soreness: Mapped[int] = mapped_column(Integer)  # 1-5 Likert
    mood: Mapped[int] = mapped_column(Integer)  # 1-5 Likert
    sleep_quality: Mapped[int] = mapped_column(Integer)  # 1-5 Likert
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    athlete = relationship("Athlete")
