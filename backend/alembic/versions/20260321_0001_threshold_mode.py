"""Add threshold_mode and vo2max_ml_kg_min to athletes.

Revision ID: 20260321_0001
Revises: 20260319_0001
Create Date: 2026-03-21
"""

from alembic import op
import sqlalchemy as sa

revision = "20260321_0001"
down_revision = "20260319_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("athletes") as batch_op:
        batch_op.add_column(
            sa.Column("threshold_mode", sa.String(20), nullable=False, server_default="lactate")
        )
        batch_op.add_column(
            sa.Column("vo2max_ml_kg_min", sa.Float(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("athletes") as batch_op:
        batch_op.drop_column("vo2max_ml_kg_min")
        batch_op.drop_column("threshold_mode")
