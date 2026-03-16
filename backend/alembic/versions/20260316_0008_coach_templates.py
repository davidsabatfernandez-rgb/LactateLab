"""Create coach_libraries, coach_workout_templates, coach_plans, coach_plan_days tables

Revision ID: 20260316_0008
Revises: 20260316_0007
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "20260316_0008"
down_revision = "20260316_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "coach_libraries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("discipline", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "coach_workout_templates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("library_id", sa.Integer(), sa.ForeignKey("coach_libraries.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("day_offset", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("discipline", sa.String(50), nullable=False, index=True),
        sa.Column("session_family", sa.String(100), nullable=False, index=True),
        sa.Column("public_label", sa.String(255), nullable=False),
        sa.Column("objective", sa.Text(), nullable=False, server_default=""),
        sa.Column("intensity_zone", sa.String(100), nullable=True),
        sa.Column("duration_min", sa.Float(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "coach_plans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("duration_weeks", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "coach_plan_days",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("coach_plans.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("day_number", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("discipline", sa.String(50), nullable=False, index=True),
        sa.Column("session_family", sa.String(100), nullable=False, index=True),
        sa.Column("public_label", sa.String(255), nullable=False),
        sa.Column("objective", sa.Text(), nullable=False, server_default=""),
        sa.Column("intensity_zone", sa.String(100), nullable=True),
        sa.Column("duration_min", sa.Float(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("coach_plan_days")
    op.drop_table("coach_plans")
    op.drop_table("coach_workout_templates")
    op.drop_table("coach_libraries")
