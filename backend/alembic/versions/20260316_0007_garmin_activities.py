"""Create garmin_activities table

Revision ID: 20260316_0007
Revises: 20260316_0006
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "20260316_0007"
down_revision = "20260316_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "garmin_activities",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id"), nullable=False, index=True),
        sa.Column("provider_activity_id", sa.BigInteger(), nullable=False, unique=True, index=True),
        sa.Column("sport_type", sa.String(100), nullable=False),
        sa.Column("discipline", sa.String(50), nullable=False),
        sa.Column("name", sa.String(500), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False, index=True),
        sa.Column("distance_m", sa.Float(), nullable=True),
        sa.Column("moving_time_seconds", sa.Integer(), nullable=True),
        sa.Column("elapsed_time_seconds", sa.Integer(), nullable=True),
        sa.Column("average_heartrate", sa.Float(), nullable=True),
        sa.Column("max_heartrate", sa.Float(), nullable=True),
        sa.Column("average_watts", sa.Float(), nullable=True),
        sa.Column("max_watts", sa.Float(), nullable=True),
        sa.Column("average_speed_m_s", sa.Float(), nullable=True),
        sa.Column("max_speed_m_s", sa.Float(), nullable=True),
        sa.Column("total_elevation_gain_m", sa.Float(), nullable=True),
        sa.Column("average_cadence", sa.Float(), nullable=True),
        sa.Column("calories", sa.Float(), nullable=True),
        sa.Column("device_name", sa.String(200), nullable=True),
        sa.Column("tss", sa.Float(), nullable=True),
        sa.Column("tss_method", sa.String(50), nullable=True),
        sa.Column("planned_session_id", sa.Integer(), sa.ForeignKey("planned_sessions.id"), nullable=True, index=True),
        sa.Column("raw_summary", sa.JSON(), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("garmin_activities")
