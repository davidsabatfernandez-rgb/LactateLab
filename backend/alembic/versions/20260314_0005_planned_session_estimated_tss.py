"""add estimated_tss to planned_sessions

Revision ID: 20260314_0005
Revises: 20260314_0004
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260314_0005"
down_revision = "20260314_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("planned_sessions", sa.Column("estimated_tss", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("planned_sessions", "estimated_tss")
