"""Add execution_status, linked_activity_id, actual_performance to planned_sessions

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
    with op.batch_alter_table("planned_sessions") as batch_op:
        batch_op.add_column(sa.Column("execution_status", sa.String(30), nullable=False, server_default="planned"))
        batch_op.add_column(sa.Column("linked_activity_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("actual_performance", sa.JSON(), nullable=True))
        batch_op.create_index("ix_planned_sessions_execution_status", ["execution_status"])
        batch_op.create_index("ix_planned_sessions_linked_activity_id", ["linked_activity_id"])


def downgrade() -> None:
    with op.batch_alter_table("planned_sessions") as batch_op:
        batch_op.drop_index("ix_planned_sessions_linked_activity_id")
        batch_op.drop_index("ix_planned_sessions_execution_status")
        batch_op.drop_column("actual_performance")
        batch_op.drop_column("linked_activity_id")
        batch_op.drop_column("execution_status")
