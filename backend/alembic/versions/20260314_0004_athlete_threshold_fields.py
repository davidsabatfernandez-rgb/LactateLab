"""add threshold fields to athletes (hr_rest, ftp_cycling_watts, ftpa_running_pace, css_swimming_pace)

Revision ID: 20260314_0004
Revises: 20260314_0003
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260314_0004"
down_revision = "20260314_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("athletes", sa.Column("hr_rest", sa.Integer(), nullable=True))
    op.add_column("athletes", sa.Column("ftp_cycling_watts", sa.Integer(), nullable=True))
    op.add_column("athletes", sa.Column("ftpa_running_pace", sa.Float(), nullable=True))
    op.add_column("athletes", sa.Column("css_swimming_pace", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("athletes", "css_swimming_pace")
    op.drop_column("athletes", "ftpa_running_pace")
    op.drop_column("athletes", "ftp_cycling_watts")
    op.drop_column("athletes", "hr_rest")
