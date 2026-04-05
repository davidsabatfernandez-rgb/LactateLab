from __future__ import annotations

"""Nutrition module models: FoodItem, MealLog, MealLogItem, NutritionTarget."""

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class FoodItem(Base):
    __tablename__ = "food_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("athletes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(200), index=True)
    brand: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    source: Mapped[str] = mapped_column(String(30))
    """fatsecret | openfoodfacts | ai_estimated | manual"""
    source_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Per 100 g – macros
    calories_per_100g: Mapped[float] = mapped_column(Float)
    protein_per_100g: Mapped[float] = mapped_column(Float)
    carbs_per_100g: Mapped[float] = mapped_column(Float)
    fat_per_100g: Mapped[float] = mapped_column(Float)
    fiber_per_100g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sugar_per_100g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    saturated_fat_per_100g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sodium_mg_per_100g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Micronutrients (premium)
    iron_mg_per_100g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    calcium_mg_per_100g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vitamin_d_ug_per_100g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vitamin_c_mg_per_100g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    magnesium_mg_per_100g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    potassium_mg_per_100g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    zinc_mg_per_100g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    omega3_g_per_100g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Meta
    default_serving_g: Mapped[float] = mapped_column(Float, default=100.0, server_default="100")
    serving_description: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    use_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    athlete = relationship("Athlete", back_populates="food_items")

    __table_args__ = (
        UniqueConstraint("athlete_id", "name", "brand", name="uq_food_athlete_name_brand"),
    )


class MealLog(Base):
    __tablename__ = "meal_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(
        ForeignKey("athletes.id", ondelete="CASCADE"), index=True
    )
    log_date: Mapped[date] = mapped_column(Date, index=True)
    meal_type: Mapped[str] = mapped_column(String(30))
    """breakfast | lunch | dinner | snack | pre_workout | post_workout | intra_workout"""
    logged_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    items: Mapped[list["MealLogItem"]] = relationship(
        "MealLogItem", back_populates="meal_log", cascade="all, delete-orphan"
    )
    athlete = relationship("Athlete", back_populates="meal_logs_detailed")


class MealLogItem(Base):
    __tablename__ = "meal_log_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meal_log_id: Mapped[int] = mapped_column(
        ForeignKey("meal_logs.id", ondelete="CASCADE"), index=True
    )
    food_item_id: Mapped[int] = mapped_column(
        ForeignKey("food_items.id"), index=True
    )
    quantity_g: Mapped[float] = mapped_column(Float)

    # Computed at log time
    calories: Mapped[float] = mapped_column(Float)
    protein_g: Mapped[float] = mapped_column(Float)
    carbs_g: Mapped[float] = mapped_column(Float)
    fat_g: Mapped[float] = mapped_column(Float)
    fiber_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    meal_log: Mapped["MealLog"] = relationship("MealLog", back_populates="items")
    food_item: Mapped["FoodItem"] = relationship("FoodItem")


class NutritionTarget(Base):
    __tablename__ = "nutrition_targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(
        ForeignKey("athletes.id", ondelete="CASCADE"), unique=True, index=True
    )
    calories_kcal: Mapped[float] = mapped_column(Float)
    protein_g: Mapped[float] = mapped_column(Float)
    carbs_g: Mapped[float] = mapped_column(Float)
    fat_g: Mapped[float] = mapped_column(Float)
    fiber_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    hydration_l: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    auto_adjust: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    athlete = relationship("Athlete", back_populates="nutrition_targets")
