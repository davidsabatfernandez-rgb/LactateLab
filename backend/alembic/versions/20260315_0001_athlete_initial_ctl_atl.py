"""Add initial_ctl and initial_atl seed fields to athletes

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "20260314_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("athletes") as batch_op:
        batch_op.add_column(sa.Column("initial_ctl", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("initial_atl", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("athletes") as batch_op:
        batch_op.drop_column("initial_atl")
        batch_op.drop_column("initial_ctl")
