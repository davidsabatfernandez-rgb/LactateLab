from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50))
    full_name: Mapped[str] = mapped_column(String(255))
    athlete_id: Mapped[Optional[int]] = mapped_column(ForeignKey("athletes.id"), nullable=True)
    plan_tier: Mapped[str] = mapped_column(String(30), nullable=False, default="free", server_default="free")
    """Plan tier: free | lactate | pro | pro_plus | elite"""
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    athletes = relationship("Athlete", back_populates="coach", foreign_keys="Athlete.coach_id")
    athlete_profile = relationship("Athlete", foreign_keys=[athlete_id])
