"""add baseline lactate to samples

Revision ID: 20260308_0010
Revises: 20260308_0009
Create Date: 2026-03-08 23:58:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260308_0010"
down_revision = "20260308_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("lactate_samples")}
    if "baseline_lactate" not in columns:
        with op.batch_alter_table("lactate_samples") as batch_op:
            batch_op.add_column(sa.Column("baseline_lactate", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("lactate_samples") as batch_op:
        batch_op.drop_column("baseline_lactate")
