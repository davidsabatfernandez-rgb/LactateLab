"""Create beta_signups table

Revision ID: 20260316_0005
Revises: 20260316_0004
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "20260316_0005"
down_revision = "20260316_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "beta_signups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_beta_signups_email", "beta_signups", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_beta_signups_email", table_name="beta_signups")
    op.drop_table("beta_signups")
