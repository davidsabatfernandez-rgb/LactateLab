"""add planned session publish state and structured payload

Revision ID: 20260313_0015
Revises: db43753833c3
Create Date: 2026-03-13 18:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260313_0015"
down_revision = "db43753833c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("planned_sessions")}
    indexes = {index["name"] for index in inspector.get_indexes("planned_sessions")}

    with op.batch_alter_table("planned_sessions") as batch_op:
        if "structured_workout_payload" not in columns:
            batch_op.add_column(sa.Column("structured_workout_payload", sa.JSON(), nullable=True))
        if "publish_status" not in columns:
            batch_op.add_column(sa.Column("publish_status", sa.String(length=30), nullable=False, server_default="draft"))
        if "publish_provider" not in columns:
            batch_op.add_column(sa.Column("publish_provider", sa.String(length=50), nullable=True))
        if "publish_error" not in columns:
            batch_op.add_column(sa.Column("publish_error", sa.Text(), nullable=True))
        if "structured_workout_generated_at" not in columns:
            batch_op.add_column(sa.Column("structured_workout_generated_at", sa.DateTime(), nullable=True))
        if "ix_planned_sessions_publish_status" not in indexes:
            batch_op.create_index("ix_planned_sessions_publish_status", ["publish_status"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("planned_sessions")}
    indexes = {index["name"] for index in inspector.get_indexes("planned_sessions")}

    with op.batch_alter_table("planned_sessions") as batch_op:
        if "ix_planned_sessions_publish_status" in indexes:
            batch_op.drop_index("ix_planned_sessions_publish_status")
        if "structured_workout_generated_at" in columns:
            batch_op.drop_column("structured_workout_generated_at")
        if "publish_error" in columns:
            batch_op.drop_column("publish_error")
        if "publish_provider" in columns:
            batch_op.drop_column("publish_provider")
        if "publish_status" in columns:
            batch_op.drop_column("publish_status")
        if "structured_workout_payload" in columns:
            batch_op.drop_column("structured_workout_payload")
