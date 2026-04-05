"""nutrition module: food_items, meal_logs, meal_log_items, nutrition_targets"""

revision = "20260330_0002"
down_revision = "20260330_0001"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # -- food_items --
    op.create_table(
        "food_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("athlete_id", sa.Integer, sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("name", sa.String(200), nullable=False, index=True),
        sa.Column("brand", sa.String(100), nullable=True),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("source_id", sa.String(100), nullable=True),
        # Per 100 g macros
        sa.Column("calories_per_100g", sa.Float, nullable=False),
        sa.Column("protein_per_100g", sa.Float, nullable=False),
        sa.Column("carbs_per_100g", sa.Float, nullable=False),
        sa.Column("fat_per_100g", sa.Float, nullable=False),
        sa.Column("fiber_per_100g", sa.Float, nullable=True),
        sa.Column("sugar_per_100g", sa.Float, nullable=True),
        sa.Column("saturated_fat_per_100g", sa.Float, nullable=True),
        sa.Column("sodium_mg_per_100g", sa.Float, nullable=True),
        # Micronutrients
        sa.Column("iron_mg_per_100g", sa.Float, nullable=True),
        sa.Column("calcium_mg_per_100g", sa.Float, nullable=True),
        sa.Column("vitamin_d_ug_per_100g", sa.Float, nullable=True),
        sa.Column("vitamin_c_mg_per_100g", sa.Float, nullable=True),
        sa.Column("magnesium_mg_per_100g", sa.Float, nullable=True),
        sa.Column("potassium_mg_per_100g", sa.Float, nullable=True),
        sa.Column("zinc_mg_per_100g", sa.Float, nullable=True),
        sa.Column("omega3_g_per_100g", sa.Float, nullable=True),
        # Meta
        sa.Column("default_serving_g", sa.Float, nullable=False, server_default="100"),
        sa.Column("serving_description", sa.String(100), nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("use_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("athlete_id", "name", "brand", name="uq_food_athlete_name_brand"),
    )

    # -- meal_logs --
    op.create_table(
        "meal_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("athlete_id", sa.Integer, sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("log_date", sa.Date, nullable=False, index=True),
        sa.Column("meal_type", sa.String(30), nullable=False),
        sa.Column("logged_at", sa.DateTime, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.CheckConstraint(
            "meal_type IN ('breakfast','lunch','dinner','snack','pre_workout','post_workout','intra_workout')",
            name="ck_meal_type",
        ),
    )

    # -- meal_log_items --
    op.create_table(
        "meal_log_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("meal_log_id", sa.Integer, sa.ForeignKey("meal_logs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("food_item_id", sa.Integer, sa.ForeignKey("food_items.id"), nullable=False, index=True),
        sa.Column("quantity_g", sa.Float, nullable=False),
        sa.Column("calories", sa.Float, nullable=False),
        sa.Column("protein_g", sa.Float, nullable=False),
        sa.Column("carbs_g", sa.Float, nullable=False),
        sa.Column("fat_g", sa.Float, nullable=False),
        sa.Column("fiber_g", sa.Float, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
    )

    # -- nutrition_targets --
    op.create_table(
        "nutrition_targets",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("athlete_id", sa.Integer, sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
        sa.Column("calories_kcal", sa.Float, nullable=False),
        sa.Column("protein_g", sa.Float, nullable=False),
        sa.Column("carbs_g", sa.Float, nullable=False),
        sa.Column("fat_g", sa.Float, nullable=False),
        sa.Column("fiber_g", sa.Float, nullable=True),
        sa.Column("hydration_l", sa.Float, nullable=True),
        sa.Column("auto_adjust", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("nutrition_targets")
    op.drop_table("meal_log_items")
    op.drop_table("meal_logs")
    op.drop_table("food_items")
