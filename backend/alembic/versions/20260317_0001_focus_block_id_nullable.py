"""Make focus_block_id nullable for manual sessions

Revision ID: 20260317_0001
Revises: 20260316_0009
Create Date: 2026-03-17
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260317_0001"
down_revision = "20260316_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "planned_sessions",
        "focus_block_id",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    # Backfill NULLs before making NOT NULL again (safety)
    op.execute("UPDATE planned_sessions SET focus_block_id = 0 WHERE focus_block_id IS NULL")
    op.alter_column(
        "planned_sessions",
        "focus_block_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
