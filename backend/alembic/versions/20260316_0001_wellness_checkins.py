"""Create wellness_checkins table

Revision ID: 20260316_0001
Revises: a1b2c3d4e5f6
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "20260316_0001"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wellness_checkins",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("check_date", sa.Date(), nullable=False, index=True),
        sa.Column("fatigue", sa.Integer(), nullable=False),
        sa.Column("soreness", sa.Integer(), nullable=False),
        sa.Column("mood", sa.Integer(), nullable=False),
        sa.Column("sleep_quality", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_wellness_checkins_athlete_date", "wellness_checkins", ["athlete_id", "check_date"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_wellness_checkins_athlete_date", table_name="wellness_checkins")
    op.drop_table("wellness_checkins")
