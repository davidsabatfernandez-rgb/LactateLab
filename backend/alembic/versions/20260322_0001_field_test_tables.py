"""Create field test tables: decoupling_results, time_trial_30_results, field_test_snapshots.

Revision ID: 20260322_0001
Revises: 20260321_0001
Create Date: 2026-03-22
"""

from alembic import op
import sqlalchemy as sa

revision = "20260322_0001"
down_revision = "20260321_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "decoupling_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("test_date", sa.Date(), nullable=False, index=True),
        sa.Column("discipline", sa.String(50), nullable=False, server_default="running"),
        sa.Column("pace_seconds_per_km", sa.Float(), nullable=False),
        sa.Column("hr_avg", sa.Integer(), nullable=False),
        sa.Column("hr_first_half", sa.Integer(), nullable=True),
        sa.Column("hr_second_half", sa.Integer(), nullable=True),
        sa.Column("drift_pct", sa.Float(), nullable=False),
        sa.Column("verdict", sa.String(20), nullable=False),
        sa.Column("block_duration_min", sa.Float(), nullable=False),
        sa.Column("pace_cv_pct", sa.Float(), nullable=True),
        sa.Column("temp_c", sa.Float(), nullable=True),
        sa.Column("temp_flag", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("planned_session_id", sa.Integer(), sa.ForeignKey("planned_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("garmin_activity_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "time_trial_30_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("test_date", sa.Date(), nullable=False, index=True),
        sa.Column("discipline", sa.String(50), nullable=False, server_default="running"),
        sa.Column("avg_pace_seconds_per_km", sa.Float(), nullable=False),
        sa.Column("avg_hr", sa.Integer(), nullable=False),
        sa.Column("distance_m", sa.Float(), nullable=True),
        sa.Column("pace_first_half", sa.Float(), nullable=True),
        sa.Column("pace_second_half", sa.Float(), nullable=True),
        sa.Column("pacing_diff_pct", sa.Float(), nullable=False),
        sa.Column("pacing_quality", sa.String(20), nullable=False),
        sa.Column("temp_c", sa.Float(), nullable=True),
        sa.Column("temp_flag", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("planned_session_id", sa.Integer(), sa.ForeignKey("planned_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("garmin_activity_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "field_test_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("discipline", sa.String(50), nullable=False, index=True),
        sa.Column("lt1_pace_seconds_per_km", sa.Float(), nullable=True),
        sa.Column("lt1_hr", sa.Integer(), nullable=True),
        sa.Column("lt1_confidence", sa.Float(), nullable=True),
        sa.Column("lt1_test_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lt1_last_test_date", sa.Date(), nullable=True),
        sa.Column("lt2_pace_seconds_per_km", sa.Float(), nullable=True),
        sa.Column("lt2_hr", sa.Integer(), nullable=True),
        sa.Column("lt2_confidence", sa.Float(), nullable=True),
        sa.Column("lt2_test_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lt2_last_test_date", sa.Date(), nullable=True),
        sa.Column("lt1_lt2_ratio_pace", sa.Float(), nullable=True),
        sa.Column("lt1_lt2_ratio_hr", sa.Float(), nullable=True),
        sa.Column("cross_validation_ok", sa.Boolean(), nullable=True),
        sa.Column("transfer_source", sa.String(30), nullable=True),
        sa.Column("transfer_factor_lt1", sa.Float(), nullable=True),
        sa.Column("transfer_factor_lt2", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("field_test_snapshots")
    op.drop_table("time_trial_30_results")
    op.drop_table("decoupling_results")
