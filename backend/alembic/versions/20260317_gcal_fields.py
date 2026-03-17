"""Add Google Calendar OAuth fields to athletes and gcal_event_id to planned_sessions."""

revision = "20260317_gcal"
down_revision = "4543c4fc71dd"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    with op.batch_alter_table("athletes") as batch_op:
        batch_op.add_column(sa.Column("gcal_access_token", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("gcal_refresh_token", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("gcal_token_expires_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("gcal_connected_at", sa.DateTime(), nullable=True))

    with op.batch_alter_table("planned_sessions") as batch_op:
        batch_op.add_column(sa.Column("gcal_event_id", sa.String(255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("planned_sessions") as batch_op:
        batch_op.drop_column("gcal_event_id")

    with op.batch_alter_table("athletes") as batch_op:
        batch_op.drop_column("gcal_connected_at")
        batch_op.drop_column("gcal_token_expires_at")
        batch_op.drop_column("gcal_refresh_token")
        batch_op.drop_column("gcal_access_token")
