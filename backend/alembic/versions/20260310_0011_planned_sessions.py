"""add planned sessions and block template id

Revision ID: 20260310_0011
Revises: 20260308_0010
Create Date: 2026-03-10 12:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260310_0011"
down_revision = "20260308_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    columns = {column["name"] for column in inspector.get_columns("athlete_focus_blocks")}
    if "template_id" not in columns:
        with op.batch_alter_table("athlete_focus_blocks") as batch_op:
            batch_op.add_column(sa.Column("template_id", sa.String(length=100), nullable=True))
            batch_op.create_index("ix_athlete_focus_blocks_template_id", ["template_id"], unique=False)

    if "planned_sessions" not in tables:
        op.create_table(
            "planned_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False),
            sa.Column("focus_block_id", sa.Integer(), sa.ForeignKey("athlete_focus_blocks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("scheduled_date", sa.Date(), nullable=False),
            sa.Column("discipline", sa.String(length=50), nullable=False),
            sa.Column("week_index", sa.Integer(), nullable=False),
            sa.Column("day_offset", sa.Integer(), nullable=False),
            sa.Column("session_role", sa.String(length=30), nullable=False),
            sa.Column("session_family", sa.String(length=100), nullable=False),
            sa.Column("workout_template_id", sa.String(length=100), nullable=True),
            sa.Column("public_label", sa.String(length=255), nullable=False),
            sa.Column("objective", sa.Text(), nullable=False),
            sa.Column("dose_prescription", sa.Text(), nullable=False),
            sa.Column("dose_guidance", sa.Text(), nullable=True),
            sa.Column("progression_note", sa.Text(), nullable=True),
            sa.Column("expected_signal", sa.Text(), nullable=True),
            sa.Column("coach_note", sa.Text(), nullable=True),
            sa.Column("confidence", sa.Float(), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="planned"),
            sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_planned_sessions_athlete_id", "planned_sessions", ["athlete_id"], unique=False)
        op.create_index("ix_planned_sessions_focus_block_id", "planned_sessions", ["focus_block_id"], unique=False)
        op.create_index("ix_planned_sessions_scheduled_date", "planned_sessions", ["scheduled_date"], unique=False)
        op.create_index("ix_planned_sessions_discipline", "planned_sessions", ["discipline"], unique=False)
        op.create_index("ix_planned_sessions_session_role", "planned_sessions", ["session_role"], unique=False)
        op.create_index("ix_planned_sessions_session_family", "planned_sessions", ["session_family"], unique=False)
        op.create_index("ix_planned_sessions_workout_template_id", "planned_sessions", ["workout_template_id"], unique=False)
        op.create_index("ix_planned_sessions_status", "planned_sessions", ["status"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "planned_sessions" in tables:
        op.drop_index("ix_planned_sessions_status", table_name="planned_sessions")
        op.drop_index("ix_planned_sessions_workout_template_id", table_name="planned_sessions")
        op.drop_index("ix_planned_sessions_session_family", table_name="planned_sessions")
        op.drop_index("ix_planned_sessions_session_role", table_name="planned_sessions")
        op.drop_index("ix_planned_sessions_discipline", table_name="planned_sessions")
        op.drop_index("ix_planned_sessions_scheduled_date", table_name="planned_sessions")
        op.drop_index("ix_planned_sessions_focus_block_id", table_name="planned_sessions")
        op.drop_index("ix_planned_sessions_athlete_id", table_name="planned_sessions")
        op.drop_table("planned_sessions")

    columns = {column["name"] for column in inspector.get_columns("athlete_focus_blocks")}
    if "template_id" in columns:
        with op.batch_alter_table("athlete_focus_blocks") as batch_op:
            batch_op.drop_index("ix_athlete_focus_blocks_template_id")
            batch_op.drop_column("template_id")
