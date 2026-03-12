"""add_dose_step_override_and_swapped_template_to_planned_sessions"""

revision = 'db43753833c3'
down_revision = '9acc4cf3b2b4'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column('planned_sessions', sa.Column('dose_step_override', sa.Integer(), nullable=True))
    op.add_column('planned_sessions', sa.Column('swapped_template_id', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('planned_sessions', 'swapped_template_id')
    op.drop_column('planned_sessions', 'dose_step_override')
