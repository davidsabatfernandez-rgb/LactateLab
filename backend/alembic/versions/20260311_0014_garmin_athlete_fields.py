"""add Garmin beta integration fields to athletes

Revision ID: 20260311_0014
Revises: 20260310_0013
Create Date: 2026-03-11 10:25:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260311_0014"
down_revision = "20260310_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("athletes")}
    indexes = {index["name"] for index in inspector.get_indexes("athletes")}

    with op.batch_alter_table("athletes") as batch_op:
        if "garmin_user_id" not in columns:
            batch_op.add_column(sa.Column("garmin_user_id", sa.BigInteger(), nullable=True))
        if "garmin_email" not in columns:
            batch_op.add_column(sa.Column("garmin_email", sa.String(length=255), nullable=True))
        if "garmin_password_encrypted" not in columns:
            batch_op.add_column(sa.Column("garmin_password_encrypted", sa.Text(), nullable=True))
        if "garmin_token_encrypted" not in columns:
            batch_op.add_column(sa.Column("garmin_token_encrypted", sa.Text(), nullable=True))
        if "garmin_connected_at" not in columns:
            batch_op.add_column(sa.Column("garmin_connected_at", sa.DateTime(), nullable=True))
        if "garmin_last_sync_at" not in columns:
            batch_op.add_column(sa.Column("garmin_last_sync_at", sa.DateTime(), nullable=True))
        if "ix_athletes_garmin_user_id" not in indexes:
            batch_op.create_index("ix_athletes_garmin_user_id", ["garmin_user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("athletes")}
    indexes = {index["name"] for index in inspector.get_indexes("athletes")}

    with op.batch_alter_table("athletes") as batch_op:
        if "ix_athletes_garmin_user_id" in indexes:
            batch_op.drop_index("ix_athletes_garmin_user_id")
        if "garmin_last_sync_at" in columns:
            batch_op.drop_column("garmin_last_sync_at")
        if "garmin_connected_at" in columns:
            batch_op.drop_column("garmin_connected_at")
        if "garmin_token_encrypted" in columns:
            batch_op.drop_column("garmin_token_encrypted")
        if "garmin_password_encrypted" in columns:
            batch_op.drop_column("garmin_password_encrypted")
        if "garmin_email" in columns:
            batch_op.drop_column("garmin_email")
        if "garmin_user_id" in columns:
            batch_op.drop_column("garmin_user_id")
