"""initial schema"""

from alembic import op
import sqlalchemy as sa


revision = "20260307_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)

    op.create_table(
        "athletes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=False),
        sa.Column("sex", sa.String(length=20), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("height", sa.Float(), nullable=True),
        sa.Column("primary_discipline", sa.String(length=50), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.Date(), nullable=False),
        sa.Column("coach_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["coach_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_athletes_name", "athletes", ["name"], unique=False)
    op.create_index("ix_athletes_primary_discipline", "athletes", ["primary_discipline"], unique=False)

    op.create_table(
        "athlete_weight_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("athlete_id", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.Date(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_athlete_weight_history_athlete_id", "athlete_weight_history", ["athlete_id"], unique=False)

    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("athlete_id", sa.Integer(), nullable=False),
        sa.Column("performed_at", sa.DateTime(), nullable=False),
        sa.Column("discipline", sa.String(length=50), nullable=False),
        sa.Column("session_type", sa.String(length=50), nullable=False),
        sa.Column("goal", sa.String(length=255), nullable=False),
        sa.Column("surface", sa.String(length=100), nullable=True),
        sa.Column("temperature_c", sa.Float(), nullable=True),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sessions_athlete_id", "sessions", ["athlete_id"], unique=False)
    op.create_index("ix_sessions_discipline", "sessions", ["discipline"], unique=False)
    op.create_index("ix_sessions_performed_at", "sessions", ["performed_at"], unique=False)
    op.create_index("ix_sessions_session_type", "sessions", ["session_type"], unique=False)

    op.create_table(
        "session_intervals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("rest_seconds", sa.Integer(), nullable=True),
        sa.Column("rest_type", sa.String(length=50), nullable=True),
        sa.Column("heart_rate_avg", sa.Integer(), nullable=True),
        sa.Column("heart_rate_max", sa.Integer(), nullable=True),
        sa.Column("pace_seconds_per_km", sa.Float(), nullable=True),
        sa.Column("power_watts", sa.Float(), nullable=True),
        sa.Column("running_power_watts", sa.Float(), nullable=True),
        sa.Column("cadence", sa.Integer(), nullable=True),
        sa.Column("rpe", sa.Float(), nullable=True),
        sa.Column("purpose", sa.String(length=50), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_session_intervals_order_index", "session_intervals", ["order_index"], unique=False)
    op.create_index("ix_session_intervals_session_id", "session_intervals", ["session_id"], unique=False)

    op.create_table(
        "lactate_samples",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("interval_id", sa.Integer(), nullable=False),
        sa.Column("lactate_mmol", sa.Float(), nullable=False),
        sa.Column("sample_delay_seconds", sa.Integer(), nullable=False),
        sa.Column("sample_timing_label", sa.String(length=50), nullable=False),
        sa.Column("sampling_notes", sa.Text(), nullable=True),
        sa.Column("contextual_lactate", sa.Float(), nullable=True),
        sa.Column("contextual_confidence", sa.Float(), nullable=True),
        sa.Column("interpretation", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["interval_id"], ["session_intervals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lactate_samples_interval_id", "lactate_samples", ["interval_id"], unique=False)

    op.create_table(
        "physiological_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("athlete_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("discipline", sa.String(length=50), nullable=False),
        sa.Column("lt1_lactate", sa.Float(), nullable=True),
        sa.Column("lt2_lactate", sa.Float(), nullable=True),
        sa.Column("lt1_pace_seconds_per_km", sa.Float(), nullable=True),
        sa.Column("lt2_pace_seconds_per_km", sa.Float(), nullable=True),
        sa.Column("lt1_power_watts", sa.Float(), nullable=True),
        sa.Column("lt2_power_watts", sa.Float(), nullable=True),
        sa.Column("lt1_heart_rate", sa.Integer(), nullable=True),
        sa.Column("lt2_heart_rate", sa.Integer(), nullable=True),
        sa.Column("method", sa.String(length=100), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_physiological_snapshots_athlete_id", "physiological_snapshots", ["athlete_id"], unique=False)
    op.create_index("ix_physiological_snapshots_snapshot_date", "physiological_snapshots", ["snapshot_date"], unique=False)

    op.create_table(
        "derived_metrics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("athlete_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("metric_type", sa.String(length=100), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=50), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_derived_metrics_athlete_id", "derived_metrics", ["athlete_id"], unique=False)
    op.create_index("ix_derived_metrics_metric_type", "derived_metrics", ["metric_type"], unique=False)

    op.create_table(
        "performance_estimates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("athlete_id", sa.Integer(), nullable=False),
        sa.Column("snapshot_id", sa.Integer(), nullable=True),
        sa.Column("estimate_type", sa.String(length=50), nullable=False),
        sa.Column("discipline", sa.String(length=50), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=50), nullable=False),
        sa.Column("lower_bound", sa.Float(), nullable=True),
        sa.Column("upper_bound", sa.Float(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("valid_on", sa.Date(), nullable=False),
        sa.Column("reliability_label", sa.String(length=50), nullable=False),
        sa.Column("inputs_summary", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["snapshot_id"], ["physiological_snapshots.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_performance_estimates_athlete_id", "performance_estimates", ["athlete_id"], unique=False)
    op.create_index("ix_performance_estimates_estimate_type", "performance_estimates", ["estimate_type"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_performance_estimates_estimate_type", table_name="performance_estimates")
    op.drop_index("ix_performance_estimates_athlete_id", table_name="performance_estimates")
    op.drop_table("performance_estimates")
    op.drop_index("ix_derived_metrics_metric_type", table_name="derived_metrics")
    op.drop_index("ix_derived_metrics_athlete_id", table_name="derived_metrics")
    op.drop_table("derived_metrics")
    op.drop_index("ix_physiological_snapshots_snapshot_date", table_name="physiological_snapshots")
    op.drop_index("ix_physiological_snapshots_athlete_id", table_name="physiological_snapshots")
    op.drop_table("physiological_snapshots")
    op.drop_index("ix_lactate_samples_interval_id", table_name="lactate_samples")
    op.drop_table("lactate_samples")
    op.drop_index("ix_session_intervals_session_id", table_name="session_intervals")
    op.drop_index("ix_session_intervals_order_index", table_name="session_intervals")
    op.drop_table("session_intervals")
    op.drop_index("ix_sessions_session_type", table_name="sessions")
    op.drop_index("ix_sessions_performed_at", table_name="sessions")
    op.drop_index("ix_sessions_discipline", table_name="sessions")
    op.drop_index("ix_sessions_athlete_id", table_name="sessions")
    op.drop_table("sessions")
    op.drop_index("ix_athlete_weight_history_athlete_id", table_name="athlete_weight_history")
    op.drop_table("athlete_weight_history")
    op.drop_index("ix_athletes_primary_discipline", table_name="athletes")
    op.drop_index("ix_athletes_name", table_name="athletes")
    op.drop_table("athletes")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

