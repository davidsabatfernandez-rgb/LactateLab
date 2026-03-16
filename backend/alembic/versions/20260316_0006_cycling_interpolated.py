"""Add cycling_interpolated_from_running to athletes

Revision ID: 20260316_0006
Revises: 20260316_0005
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "20260316_0006"
down_revision = "20260316_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("athletes", sa.Column("cycling_interpolated_from_running", sa.Boolean(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("athletes", "cycling_interpolated_from_running")
