"""Add plan_tier to users table.

Revision ID: 20260323_0001
Revises: 20260322_0001
Create Date: 2026-03-23
"""

from alembic import op
import sqlalchemy as sa

revision = "20260323_0001"
down_revision = "20260322_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("plan_tier", sa.String(30), nullable=False, server_default="free"))


def downgrade() -> None:
    op.drop_column("users", "plan_tier")
