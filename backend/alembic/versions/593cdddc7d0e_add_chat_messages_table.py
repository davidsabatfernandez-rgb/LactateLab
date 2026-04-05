"""add chat_messages table"""

revision = '593cdddc7d0e'
down_revision = '20260330_0002'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.create_table('chat_messages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('athlete_id', sa.Integer(), nullable=False),
    sa.Column('role', sa.String(length=16), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['athlete_id'], ['athletes.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_chat_messages_athlete_id'), 'chat_messages', ['athlete_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_chat_messages_athlete_id'), table_name='chat_messages')
    op.drop_table('chat_messages')
