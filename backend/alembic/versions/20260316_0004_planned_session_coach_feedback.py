"""Add coach_feedback, coach_feedback_at, execution_rating to planned_sessions

Revision ID: 20260316_0004
Revises: 20260316_0003
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "20260316_0004"
down_revision = "20260316_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("planned_sessions") as batch_op:
        batch_op.add_column(sa.Column("coach_feedback", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("coach_feedback_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("execution_rating", sa.String(30), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("planned_sessions") as batch_op:
        batch_op.drop_column("execution_rating")
        batch_op.drop_column("coach_feedback_at")
        batch_op.drop_column("coach_feedback")
