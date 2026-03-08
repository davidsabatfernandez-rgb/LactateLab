"""add cycling power source separation

Revision ID: 20260308_0004
Revises: 20260308_0003
Create Date: 2026-03-08 18:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260308_0004"
down_revision = "20260308_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("power_source", sa.String(length=50), nullable=True))
    op.create_index("ix_sessions_power_source", "sessions", ["power_source"], unique=False)

    op.add_column("physiological_snapshots", sa.Column("power_source", sa.String(length=50), nullable=True))
    op.create_index("ix_physiological_snapshots_power_source", "physiological_snapshots", ["power_source"], unique=False)

    op.add_column("performance_estimates", sa.Column("power_source", sa.String(length=50), nullable=True))
    op.create_index("ix_performance_estimates_power_source", "performance_estimates", ["power_source"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_performance_estimates_power_source", table_name="performance_estimates")
    op.drop_column("performance_estimates", "power_source")

    op.drop_index("ix_physiological_snapshots_power_source", table_name="physiological_snapshots")
    op.drop_column("physiological_snapshots", "power_source")

    op.drop_index("ix_sessions_power_source", table_name="sessions")
    op.drop_column("sessions", "power_source")
