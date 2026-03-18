"""Add workout_template_overrides table

Revision ID: 20260318_overrides
Revises: 20260317_gcal
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa

revision = "20260318_overrides"
down_revision = "20260317_gcal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workout_template_overrides",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("template_id", sa.String(100), nullable=False, index=True),
        sa.Column("overrides", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "template_id", name="uq_override_user_template"),
    )


def downgrade() -> None:
    op.drop_table("workout_template_overrides")
