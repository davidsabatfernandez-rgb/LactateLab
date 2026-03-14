"""add training_hr_max to athletes

Revision ID: 20260314_0002
Revises: 20260314_0001
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260314_0002"
down_revision = "20260314_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("athletes", sa.Column("training_hr_max", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("athletes", "training_hr_max")
