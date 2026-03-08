"""link athlete users to athlete profiles

Revision ID: 20260308_0009
Revises: 20260308_0008
Create Date: 2026-03-08 23:35:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260308_0009"
down_revision = "20260308_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "athlete_id" not in columns:
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(sa.Column("athlete_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("fk_users_athlete_id", type_="foreignkey")
        batch_op.drop_column("athlete_id")
