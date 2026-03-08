"""add athlete focus blocks

Revision ID: 20260308_0005
Revises: 20260308_0004
Create Date: 2026-03-08 20:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260308_0005"
down_revision = "20260308_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "athlete_focus_blocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("energy_system_focus", sa.String(length=100), nullable=False),
        sa.Column("block_objective", sa.String(length=100), nullable=False),
        sa.Column("block_intent", sa.Text(), nullable=True),
        sa.Column("priority_discipline", sa.String(length=50), nullable=True),
        sa.Column("phase", sa.String(length=50), nullable=True),
        sa.Column("target_event", sa.String(length=255), nullable=True),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="planned"),
        sa.Column("coach_notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_athlete_focus_blocks_athlete_id", "athlete_focus_blocks", ["athlete_id"], unique=False)
    op.create_index("ix_athlete_focus_blocks_start_date", "athlete_focus_blocks", ["start_date"], unique=False)
    op.create_index("ix_athlete_focus_blocks_end_date", "athlete_focus_blocks", ["end_date"], unique=False)
    op.create_index("ix_athlete_focus_blocks_energy_system_focus", "athlete_focus_blocks", ["energy_system_focus"], unique=False)
    op.create_index("ix_athlete_focus_blocks_block_objective", "athlete_focus_blocks", ["block_objective"], unique=False)
    op.create_index("ix_athlete_focus_blocks_status", "athlete_focus_blocks", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_athlete_focus_blocks_status", table_name="athlete_focus_blocks")
    op.drop_index("ix_athlete_focus_blocks_block_objective", table_name="athlete_focus_blocks")
    op.drop_index("ix_athlete_focus_blocks_energy_system_focus", table_name="athlete_focus_blocks")
    op.drop_index("ix_athlete_focus_blocks_end_date", table_name="athlete_focus_blocks")
    op.drop_index("ix_athlete_focus_blocks_start_date", table_name="athlete_focus_blocks")
    op.drop_index("ix_athlete_focus_blocks_athlete_id", table_name="athlete_focus_blocks")
    op.drop_table("athlete_focus_blocks")
