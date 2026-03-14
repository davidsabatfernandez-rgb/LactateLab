"""Add athlete_note and scheduled_time to planned_sessions

Revision ID: 20260314_0003
Revises: 20260314_0002
"""
from alembic import op
import sqlalchemy as sa

revision = "20260314_0003"
down_revision = "20260314_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("planned_sessions", sa.Column("athlete_note", sa.Text(), nullable=True))
    op.add_column("planned_sessions", sa.Column("scheduled_time", sa.String(5), nullable=True))


def downgrade() -> None:
    op.drop_column("planned_sessions", "scheduled_time")
    op.drop_column("planned_sessions", "athlete_note")
