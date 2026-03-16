from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CoachLibrary(Base):
    """Biblioteca semanal de entrenos del entrenador (ej: 'IRONMAN Base Semana 1')."""

    __tablename__ = "coach_libraries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    discipline: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    """Disciplina principal (nullable = multi-disciplina)."""
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
    workouts = relationship("CoachWorkoutTemplate", back_populates="library", cascade="all, delete-orphan", order_by="CoachWorkoutTemplate.day_offset, CoachWorkoutTemplate.sort_order")


class CoachWorkoutTemplate(Base):
    """Entreno individual dentro de una biblioteca del entrenador, asignado a un día de la semana."""

    __tablename__ = "coach_workout_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    library_id: Mapped[int] = mapped_column(ForeignKey("coach_libraries.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day_offset: Mapped[int] = mapped_column(Integer, default=0)
    """Día de la semana: 0=Lunes, 1=Martes, ..., 6=Domingo."""
    discipline: Mapped[str] = mapped_column(String(50), index=True)
    session_family: Mapped[str] = mapped_column(String(100), index=True)
    public_label: Mapped[str] = mapped_column(String(255))
    objective: Mapped[str] = mapped_column(Text, default="")
    intensity_zone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    duration_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    """Orden dentro del día."""
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
    library = relationship("CoachLibrary", back_populates="workouts")


class CoachPlan(Base):
    """Plan de entrenamiento multi-semana del entrenador."""
    __tablename__ = "coach_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_weeks: Mapped[int] = mapped_column(Integer, default=4)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
    days = relationship("CoachPlanDay", back_populates="plan", cascade="all, delete-orphan", order_by="CoachPlanDay.day_number, CoachPlanDay.sort_order")


class CoachPlanDay(Base):
    """Sesión individual dentro de un plan, asignada a un día numérico (0-based desde el inicio del plan)."""
    __tablename__ = "coach_plan_days"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("coach_plans.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day_number: Mapped[int] = mapped_column(Integer, default=0)
    """Día dentro del plan: 0 = primer día, 1 = segundo día, etc."""
    discipline: Mapped[str] = mapped_column(String(50), index=True)
    session_family: Mapped[str] = mapped_column(String(100), index=True)
    public_label: Mapped[str] = mapped_column(String(255))
    objective: Mapped[str] = mapped_column(Text, default="")
    intensity_zone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    duration_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
    plan = relationship("CoachPlan", back_populates="days")
