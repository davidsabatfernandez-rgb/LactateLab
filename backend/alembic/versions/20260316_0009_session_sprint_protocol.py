"""add sprint_protocol to sessions

Revision ID: 20260316_0009
Revises: 20260316_0008
Create Date: 2026-03-16
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260316_0009"
down_revision = "20260316_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("sprint_protocol", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("sessions", "sprint_protocol")
