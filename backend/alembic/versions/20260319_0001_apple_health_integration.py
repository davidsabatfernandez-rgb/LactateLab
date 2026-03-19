"""Apple Health integration: health_samples table + athlete fields.

Revision ID: 20260319_0001
Revises:
Create Date: 2026-03-19
"""

from alembic import op
import sqlalchemy as sa

revision = "20260319_0001"
down_revision = "20260318_overrides"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Apple Health fields on athlete
    with op.batch_alter_table("athletes") as batch_op:
        batch_op.add_column(sa.Column("apple_health_connected", sa.Boolean(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("apple_health_last_sync_at", sa.DateTime(), nullable=True))

    # Health samples table
    op.create_table(
        "health_samples",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("sample_date", sa.Date(), nullable=False, index=True),
        sa.Column("source", sa.String(30), nullable=False, server_default="apple_health"),
        sa.Column("sleep_seconds", sa.Integer(), nullable=True),
        sa.Column("deep_sleep_seconds", sa.Integer(), nullable=True),
        sa.Column("rem_sleep_seconds", sa.Integer(), nullable=True),
        sa.Column("core_sleep_seconds", sa.Integer(), nullable=True),
        sa.Column("awake_seconds", sa.Integer(), nullable=True),
        sa.Column("resting_hr", sa.Integer(), nullable=True),
        sa.Column("hrv_sdnn", sa.Float(), nullable=True),
        sa.Column("respiration_rate", sa.Float(), nullable=True),
        sa.Column("spo2", sa.Float(), nullable=True),
        sa.Column("steps", sa.Integer(), nullable=True),
        sa.Column("exercise_minutes", sa.Integer(), nullable=True),
        sa.Column("active_energy_kcal", sa.Float(), nullable=True),
        sa.Column("vo2max", sa.Float(), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("health_samples")
    with op.batch_alter_table("athletes") as batch_op:
        batch_op.drop_column("apple_health_last_sync_at")
        batch_op.drop_column("apple_health_connected")
