"""Behavioral journal models.

Two tables:
  - behavior_journal_entries: one row per athlete per day, ~46 columns per behavior
  - behavior_preferences: one row per athlete, controls which habits the UI shows

Input types:
  - toggle   → Boolean (did it or not)
  - time     → String "HH:MM" (when did it happen)
  - quantity → Integer (how many)
  - duration → Integer (minutes)
  - scale    → Integer 1-3 (intensity)
"""
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# ── All behavior column names ──
BEHAVIOR_KEYS = [
    # Recovery
    "ice_bath", "sauna", "massage", "foam_rolling", "stretching", "compression_garments", "cold_shower",
    # Nutrition
    "alcohol", "late_meal", "creatine", "caffeine_after_2pm", "fasting",
    # Supplements
    "melatonin", "omega_3", "vitamin_d", "electrolytes", "probiotics", "ashwagandha", "cbd", "pre_workout",
    # Mental
    "meditation", "journaling", "breathwork",
    # Sleep
    "screens_before_bed", "consistent_bedtime", "sleep_mask", "magnesium",
    "mouth_tape", "nasal_strip", "weighted_blanket", "white_noise", "reading_before_bed", "blue_light_glasses",
    # Work
    "working_late", "shift_work",
    # Lifestyle
    "travel_jet_lag", "high_work_stress", "nap", "morning_sunlight", "nature_outdoors", "social_activity", "sex",
    # Life status (persistent conditions)
    "illness", "injury", "allergies", "high_altitude",
    # Medication
    "antihistamine", "pain_reliever", "birth_control", "cpap_machine", "prescription_medication", "anti_inflammatory",
]


class BehaviorJournalEntry(Base):
    __tablename__ = "behavior_journal_entries"
    __table_args__ = (
        UniqueConstraint("athlete_id", "entry_date", name="uq_athlete_behavior_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    entry_date: Mapped[date] = mapped_column(Date, index=True)

    # ── Recovery (toggle) ──
    ice_bath: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    sauna: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    massage: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    foam_rolling: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    stretching: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    compression_garments: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    cold_shower: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")

    # ── Nutrition (mixed) ──
    alcohol: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """Number of drinks (1-6), null = none"""
    late_meal: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    """Last meal time as HH:MM, null = no late meal"""
    creatine: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    caffeine_after_2pm: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    """Last caffeine time as HH:MM, null = no caffeine after 2pm"""
    fasting: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """Fasting intensity 1-3, null = none"""

    # ── Supplements (toggle) ──
    melatonin: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    omega_3: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    vitamin_d: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    electrolytes: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    probiotics: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    ashwagandha: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    cbd: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    pre_workout: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")

    # ── Mental (toggle) ──
    meditation: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    journaling: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    breathwork: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")

    # ── Sleep (mixed) ──
    screens_before_bed: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    """Last screen time as HH:MM"""
    consistent_bedtime: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    sleep_mask: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    magnesium: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    mouth_tape: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    nasal_strip: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    weighted_blanket: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    white_noise: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    reading_before_bed: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    blue_light_glasses: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")

    # ── Work (toggle) ──
    working_late: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    shift_work: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")

    # ── Lifestyle (mixed) ──
    travel_jet_lag: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    high_work_stress: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """Stress level 1-3, null = none"""
    nap: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """Nap duration in minutes, null = no nap"""
    morning_sunlight: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    nature_outdoors: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    social_activity: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    sex: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")

    # ── Life status (toggle — persistent conditions) ──
    illness: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    injury: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    allergies: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    high_altitude: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")

    # ── Medication (toggle) ──
    antihistamine: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    pain_reliever: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    birth_control: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    cpap_machine: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    prescription_medication: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")
    anti_inflammatory: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="0")

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    athlete = relationship("Athlete", back_populates="behavior_journal_entries")


class BehaviorPreferences(Base):
    """Which behaviors are visible in the UI — always Boolean (show/hide)."""
    __tablename__ = "behavior_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), unique=True, index=True)

    # Recovery
    ice_bath: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    sauna: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    massage: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    foam_rolling: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    stretching: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    compression_garments: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    cold_shower: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Nutrition
    alcohol: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    late_meal: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    creatine: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    caffeine_after_2pm: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    fasting: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Supplements
    melatonin: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    omega_3: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    vitamin_d: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    electrolytes: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    probiotics: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    ashwagandha: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    cbd: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    pre_workout: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Mental
    meditation: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    journaling: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    breathwork: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Sleep
    screens_before_bed: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    consistent_bedtime: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    sleep_mask: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    magnesium: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    mouth_tape: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    nasal_strip: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    weighted_blanket: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    white_noise: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    reading_before_bed: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    blue_light_glasses: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Work
    working_late: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    shift_work: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Lifestyle
    travel_jet_lag: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    high_work_stress: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    nap: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    morning_sunlight: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    nature_outdoors: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    social_activity: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    sex: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Life status
    illness: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    injury: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    allergies: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    high_altitude: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Medication
    antihistamine: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    pain_reliever: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    birth_control: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    cpap_machine: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    prescription_medication: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    anti_inflammatory: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    athlete = relationship("Athlete", back_populates="behavior_preferences")


class CustomBehavior(Base):
    __tablename__ = "custom_behaviors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    emoji: Mapped[str] = mapped_column(String(10), server_default="⭐")
    category: Mapped[str] = mapped_column(String(30), server_default="custom")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    athlete = relationship("Athlete", back_populates="custom_behaviors")


class CustomBehaviorLog(Base):
    __tablename__ = "custom_behavior_logs"
    __table_args__ = (
        UniqueConstraint("custom_behavior_id", "log_date", name="uq_custom_behavior_log_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    custom_behavior_id: Mapped[int] = mapped_column(ForeignKey("custom_behaviors.id", ondelete="CASCADE"), index=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), index=True)
    log_date: Mapped[date] = mapped_column(Date)
    value: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    custom_behavior = relationship("CustomBehavior")
    athlete = relationship("Athlete")
