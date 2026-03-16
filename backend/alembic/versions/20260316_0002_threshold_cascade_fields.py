"""Add threshold_snapshot_date and targets_stale to planned_sessions

Revision ID: 20260316_0002
Revises: 20260316_0001
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "20260316_0002"
down_revision = "20260316_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("planned_sessions", sa.Column("threshold_snapshot_date", sa.DateTime(), nullable=True))
    op.add_column("planned_sessions", sa.Column("targets_stale", sa.Boolean(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("planned_sessions", "targets_stale")
    op.drop_column("planned_sessions", "threshold_snapshot_date")
