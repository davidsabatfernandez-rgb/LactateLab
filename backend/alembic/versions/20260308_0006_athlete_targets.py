"""athlete targets

Revision ID: 20260308_0006
Revises: 20260308_0005
Create Date: 2026-03-08 20:45:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260308_0006"
down_revision = "20260308_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "athlete_targets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("athlete_id", sa.Integer(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=False),
        sa.Column("discipline", sa.String(length=50), nullable=False),
        sa.Column("objective", sa.String(length=255), nullable=False),
        sa.Column("target_pace_label", sa.String(length=50), nullable=True),
        sa.Column("target_power_watts", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_athlete_targets_athlete_id"), "athlete_targets", ["athlete_id"], unique=False)
    op.create_index(op.f("ix_athlete_targets_target_date"), "athlete_targets", ["target_date"], unique=False)
    op.create_index(op.f("ix_athlete_targets_discipline"), "athlete_targets", ["discipline"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_athlete_targets_discipline"), table_name="athlete_targets")
    op.drop_index(op.f("ix_athlete_targets_target_date"), table_name="athlete_targets")
    op.drop_index(op.f("ix_athlete_targets_athlete_id"), table_name="athlete_targets")
    op.drop_table("athlete_targets")
