"""add athlete training goal"""

from alembic import op
import sqlalchemy as sa


revision = "20260308_0002"
down_revision = "20260307_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("athletes", sa.Column("training_goal", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("athletes", "training_goal")
