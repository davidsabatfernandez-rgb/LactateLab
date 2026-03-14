"""add training zones

Revision ID: 20260314_0001
Revises: 20260313_0016
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa

revision = "20260314_0001"
down_revision = "20260313_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "training_zone_sets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("athlete_id", sa.Integer(), nullable=False),
        sa.Column("discipline", sa.String(50), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("threshold_source", sa.String(50), nullable=True),
        sa.Column("threshold_context", sa.JSON(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_training_zone_sets_athlete_id"), "training_zone_sets", ["athlete_id"])
    op.create_index(op.f("ix_training_zone_sets_discipline"), "training_zone_sets", ["discipline"])

    op.create_table(
        "training_zones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("zone_set_id", sa.Integer(), nullable=False),
        sa.Column("zone_number", sa.Integer(), nullable=False),
        sa.Column("zone_label", sa.String(50), nullable=False),
        sa.Column("zone_color", sa.String(20), nullable=True),
        sa.Column("pace_lower_seconds", sa.Float(), nullable=True),
        sa.Column("pace_upper_seconds", sa.Float(), nullable=True),
        sa.Column("hr_lower", sa.Integer(), nullable=True),
        sa.Column("hr_upper", sa.Integer(), nullable=True),
        sa.Column("power_lower", sa.Float(), nullable=True),
        sa.Column("power_upper", sa.Float(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["zone_set_id"], ["training_zone_sets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_training_zones_zone_set_id"), "training_zones", ["zone_set_id"])


def downgrade() -> None:
    op.drop_table("training_zones")
    op.drop_table("training_zone_sets")
