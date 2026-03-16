"""Add target_mode to planned_sessions

Revision ID: 20260316_0003
Revises: 20260316_0002b
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "20260316_0003"
down_revision = "20260316_0002b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("planned_sessions", sa.Column("target_mode", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("planned_sessions", "target_mode")
