"""triathlon target fields

Revision ID: 20260308_0007
Revises: 20260308_0006
Create Date: 2026-03-08 23:20:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260308_0007"
down_revision = "20260308_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("athlete_targets", sa.Column("target_running_pace_label", sa.String(length=50), nullable=True))
    op.add_column("athlete_targets", sa.Column("target_swim_pace_label", sa.String(length=50), nullable=True))
    op.add_column("athlete_targets", sa.Column("target_cycling_power_watts", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("athlete_targets", "target_cycling_power_watts")
    op.drop_column("athlete_targets", "target_swim_pace_label")
    op.drop_column("athlete_targets", "target_running_pace_label")
