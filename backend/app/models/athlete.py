from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Athlete(Base):
    __tablename__ = "athletes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    date_of_birth: Mapped[date] = mapped_column(Date)
    sex: Mapped[str] = mapped_column(String(20))
    weight: Mapped[float] = mapped_column(Float)
    height: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    primary_discipline: Mapped[str] = mapped_column(String(50), index=True)
    goal_category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    training_goal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    athlete_level: Mapped[str] = mapped_column(String(30), nullable=False, default="trained", server_default="trained")
    """Nivel del atleta: recreational | trained | competitive. Afecta la relación umbral→ritmo de carrera."""
    strava_athlete_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, index=True)
    strava_access_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    strava_refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    strava_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    strava_connected_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    garmin_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, index=True)
    garmin_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    garmin_password_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    garmin_token_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    garmin_connected_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    garmin_last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    training_hr_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """FC máxima real del atleta (medida en test). Tiene prioridad sobre la observada en sesiones."""
    hr_rest: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """FC reposo (para hrTSS)."""
    ftp_cycling_watts: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """FTP ciclismo (watts)."""
    ftpa_running_pace: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """rFTPa running (sec/km, = LT2 pace)."""
    css_swimming_pace: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """CSS natación (sec/100m)."""
    cycling_interpolated_from_running: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    """Si True, los umbrales de ciclismo se interpolan automáticamente desde running."""
    created_at: Mapped[date] = mapped_column(Date)
    coach_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)

    coach = relationship("User", back_populates="athletes", foreign_keys=[coach_id])
    weights = relationship("AthleteWeightHistory", back_populates="athlete", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="athlete", cascade="all, delete-orphan")
    snapshots = relationship("PhysiologicalSnapshot", back_populates="athlete", cascade="all, delete-orphan")
    estimates = relationship("PerformanceEstimate", back_populates="athlete", cascade="all, delete-orphan")
    metrics = relationship("DerivedMetric", back_populates="athlete", cascade="all, delete-orphan")
    focus_blocks = relationship("AthleteFocusBlock", back_populates="athlete", cascade="all, delete-orphan", order_by="AthleteFocusBlock.start_date.desc()")
    planned_sessions = relationship("PlannedSession", back_populates="athlete", cascade="all, delete-orphan", order_by="PlannedSession.scheduled_date.asc()")
    targets = relationship("AthleteTarget", back_populates="athlete", cascade="all, delete-orphan", order_by="AthleteTarget.target_date.desc()")
    training_zone_sets = relationship("TrainingZoneSet", back_populates="athlete", cascade="all, delete-orphan")

    @property
    def strava_connected(self) -> bool:
        return bool(
            self.strava_athlete_id is not None
            and self.strava_access_token
            and self.strava_refresh_token
            and self.strava_token_expires_at is not None
        )

    @property
    def garmin_connected(self) -> bool:
        return bool(
            self.garmin_user_id is not None
            and self.garmin_email
            and self.garmin_password_encrypted
            and self.garmin_connected_at is not None
        )


class AthleteWeightHistory(Base):
    __tablename__ = "athlete_weight_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    recorded_at: Mapped[date] = mapped_column(Date)
    weight: Mapped[float] = mapped_column(Float)
    source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    athlete = relationship("Athlete", back_populates="weights")


class AthleteFocusBlock(Base):
    __tablename__ = "athlete_focus_blocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    start_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    template_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    energy_system_focus: Mapped[str] = mapped_column(String(100), index=True)
    block_objective: Mapped[str] = mapped_column(String(100), index=True)
    block_intent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    priority_discipline: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    phase: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target_event: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    target_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(30), index=True, default="planned")
    coach_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    athlete = relationship("Athlete", back_populates="focus_blocks")
    planned_sessions = relationship("PlannedSession", back_populates="focus_block", cascade="all, delete-orphan", order_by="PlannedSession.scheduled_date.asc()")


class AthleteTarget(Base):
    __tablename__ = "athlete_targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    target_date: Mapped[date] = mapped_column(Date, index=True)
    discipline: Mapped[str] = mapped_column(String(50), index=True)
    objective: Mapped[str] = mapped_column(String(255))
    distance_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    distance_category: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    """Categoría normalizada: 5k | 10k | hm | marathon | sprint_tri | olympic_tri | 70.3 | ironman | road_tt | other"""
    priority_level: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    target_pace_label: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target_power_watts: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_running_pace_label: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target_swim_pace_label: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target_cycling_power_watts: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    athlete = relationship("Athlete", back_populates="targets")
