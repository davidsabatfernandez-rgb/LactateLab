"""target distance and priority

Revision ID: 20260308_0008
Revises: 20260308_0007
Create Date: 2026-03-08 23:55:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260308_0008"
down_revision = "20260308_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("athlete_targets", sa.Column("distance_label", sa.String(length=100), nullable=True))
    op.add_column("athlete_targets", sa.Column("priority_level", sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column("athlete_targets", "priority_level")
    op.drop_column("athlete_targets", "distance_label")
