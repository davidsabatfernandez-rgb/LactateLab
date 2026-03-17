"""add calendar_ical_url to athletes

Revision ID: 20260317_cal
Revises: db43753833c3
Create Date: 2026-03-17
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260317_cal"
down_revision = "db43753833c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("athletes", sa.Column("calendar_ical_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("athletes", "calendar_ical_url")
