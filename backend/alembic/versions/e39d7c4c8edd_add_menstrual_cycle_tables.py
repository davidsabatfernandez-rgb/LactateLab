"""add_menstrual_cycle_tables"""

revision = 'e39d7c4c8edd'
down_revision = '20260323_0002'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.create_table('menstrual_cycle_logs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('athlete_id', sa.Integer(), nullable=False),
    sa.Column('cycle_start_date', sa.Date(), nullable=False),
    sa.Column('cycle_end_date', sa.Date(), nullable=True),
    sa.Column('period_end_date', sa.Date(), nullable=True),
    sa.Column('cycle_length_days', sa.Integer(), nullable=True),
    sa.Column('period_length_days', sa.Integer(), nullable=True),
    sa.Column('is_predicted', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['athlete_id'], ['athletes.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('athlete_id', 'cycle_start_date', name='uq_athlete_cycle_start')
    )
    op.create_index(op.f('ix_menstrual_cycle_logs_athlete_id'), 'menstrual_cycle_logs', ['athlete_id'], unique=False)
    op.create_index(op.f('ix_menstrual_cycle_logs_cycle_start_date'), 'menstrual_cycle_logs', ['cycle_start_date'], unique=False)

    op.create_table('menstrual_cycle_preferences',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('athlete_id', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('tracking_goal', sa.String(length=50), nullable=True),
    sa.Column('average_cycle_length_days', sa.Integer(), nullable=True),
    sa.Column('average_period_length_days', sa.Integer(), nullable=True),
    sa.Column('cycles_are_regular', sa.Boolean(), nullable=True),
    sa.Column('uses_hormonal_contraception', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('contraception_type', sa.String(length=50), nullable=True),
    sa.Column('last_period_start_date', sa.Date(), nullable=True),
    sa.Column('notify_phase_change', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('share_with_coach', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['athlete_id'], ['athletes.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_menstrual_cycle_preferences_athlete_id'), 'menstrual_cycle_preferences', ['athlete_id'], unique=True)

    op.create_table('menstrual_daily_logs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('athlete_id', sa.Integer(), nullable=False),
    sa.Column('log_date', sa.Date(), nullable=False),
    sa.Column('flow_intensity', sa.String(length=20), nullable=True),
    sa.Column('cramps_level', sa.Integer(), nullable=True),
    sa.Column('energy_level', sa.Integer(), nullable=True),
    sa.Column('mood', sa.String(length=30), nullable=True),
    sa.Column('bloating', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('headache', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('breast_tenderness', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('back_pain', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('acne', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('sleep_quality', sa.Integer(), nullable=True),
    sa.Column('appetite', sa.String(length=20), nullable=True),
    sa.Column('exercise_tolerance', sa.String(length=20), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['athlete_id'], ['athletes.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('athlete_id', 'log_date', name='uq_athlete_daily_log')
    )
    op.create_index(op.f('ix_menstrual_daily_logs_athlete_id'), 'menstrual_daily_logs', ['athlete_id'], unique=False)
    op.create_index(op.f('ix_menstrual_daily_logs_log_date'), 'menstrual_daily_logs', ['log_date'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_menstrual_daily_logs_log_date'), table_name='menstrual_daily_logs')
    op.drop_index(op.f('ix_menstrual_daily_logs_athlete_id'), table_name='menstrual_daily_logs')
    op.drop_table('menstrual_daily_logs')
    op.drop_index(op.f('ix_menstrual_cycle_preferences_athlete_id'), table_name='menstrual_cycle_preferences')
    op.drop_table('menstrual_cycle_preferences')
    op.drop_index(op.f('ix_menstrual_cycle_logs_cycle_start_date'), table_name='menstrual_cycle_logs')
    op.drop_index(op.f('ix_menstrual_cycle_logs_athlete_id'), table_name='menstrual_cycle_logs')
    op.drop_table('menstrual_cycle_logs')
