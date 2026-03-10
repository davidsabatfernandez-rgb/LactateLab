"""add Strava integration fields to athletes

Revision ID: 20260310_0012
Revises: 20260310_0011
Create Date: 2026-03-10 13:20:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260310_0012"
down_revision = "20260310_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("athletes")}
    indexes = {index["name"] for index in inspector.get_indexes("athletes")}

    with op.batch_alter_table("athletes") as batch_op:
        if "strava_athlete_id" not in columns:
            batch_op.add_column(sa.Column("strava_athlete_id", sa.BigInteger(), nullable=True))
        if "strava_access_token" not in columns:
            batch_op.add_column(sa.Column("strava_access_token", sa.Text(), nullable=True))
        if "strava_refresh_token" not in columns:
            batch_op.add_column(sa.Column("strava_refresh_token", sa.Text(), nullable=True))
        if "strava_token_expires_at" not in columns:
            batch_op.add_column(sa.Column("strava_token_expires_at", sa.DateTime(), nullable=True))
        if "strava_connected_at" not in columns:
            batch_op.add_column(sa.Column("strava_connected_at", sa.DateTime(), nullable=True))
        if "ix_athletes_strava_athlete_id" not in indexes:
            batch_op.create_index("ix_athletes_strava_athlete_id", ["strava_athlete_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("athletes")}
    indexes = {index["name"] for index in inspector.get_indexes("athletes")}

    with op.batch_alter_table("athletes") as batch_op:
        if "ix_athletes_strava_athlete_id" in indexes:
            batch_op.drop_index("ix_athletes_strava_athlete_id")
        if "strava_connected_at" in columns:
            batch_op.drop_column("strava_connected_at")
        if "strava_token_expires_at" in columns:
            batch_op.drop_column("strava_token_expires_at")
        if "strava_refresh_token" in columns:
            batch_op.drop_column("strava_refresh_token")
        if "strava_access_token" in columns:
            batch_op.drop_column("strava_access_token")
        if "strava_athlete_id" in columns:
            batch_op.drop_column("strava_athlete_id")
