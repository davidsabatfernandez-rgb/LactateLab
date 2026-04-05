"""behavior_correlations_nutrition_logs_insights_digests"""

revision = '20260330_0001'
down_revision = '20260329_0001'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # -- nutrition_logs --
    op.create_table(
        'nutrition_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('athlete_id', sa.Integer(), nullable=False),
        sa.Column('log_date', sa.Date(), nullable=False),
        sa.Column('carbs_g', sa.Float(), nullable=True),
        sa.Column('protein_g', sa.Float(), nullable=True),
        sa.Column('fat_g', sa.Float(), nullable=True),
        sa.Column('calories_kcal', sa.Float(), nullable=True),
        sa.Column('hydration_l', sa.Float(), nullable=True),
        sa.Column('preset', sa.String(20), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['athlete_id'], ['athletes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('athlete_id', 'log_date', name='uq_nutrition_athlete_date'),
        sa.CheckConstraint('carbs_g >= 0', name='ck_nutrition_carbs_g'),
        sa.CheckConstraint('protein_g >= 0', name='ck_nutrition_protein_g'),
        sa.CheckConstraint('fat_g >= 0', name='ck_nutrition_fat_g'),
        sa.CheckConstraint('calories_kcal >= 0', name='ck_nutrition_calories_kcal'),
        sa.CheckConstraint('hydration_l >= 0 AND hydration_l <= 15', name='ck_nutrition_hydration_l'),
    )
    op.create_index(op.f('ix_nutrition_logs_athlete_id'), 'nutrition_logs', ['athlete_id'])
    op.create_index(op.f('ix_nutrition_logs_log_date'), 'nutrition_logs', ['log_date'])

    # -- behavior_correlations --
    op.create_table(
        'behavior_correlations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('athlete_id', sa.Integer(), nullable=False),
        sa.Column('behavior_key', sa.String(60), nullable=False),
        sa.Column('outcome_metric', sa.String(30), nullable=False),
        sa.Column('sample_size_with', sa.Integer(), nullable=False),
        sa.Column('sample_size_without', sa.Integer(), nullable=False),
        sa.Column('mean_with', sa.Float(), nullable=False),
        sa.Column('mean_without', sa.Float(), nullable=False),
        sa.Column('effect_pct', sa.Float(), nullable=False),
        sa.Column('effect_direction', sa.String(10), nullable=False),
        sa.Column('confidence', sa.String(10), nullable=False),
        sa.Column('p_value', sa.Float(), nullable=True),
        sa.Column('lag_days', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('window_days', sa.Integer(), nullable=False, server_default='90'),
        sa.Column('computed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['athlete_id'], ['athletes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('athlete_id', 'behavior_key', 'outcome_metric', 'lag_days', name='uq_correlation_key'),
    )
    op.create_index(op.f('ix_behavior_correlations_athlete_id'), 'behavior_correlations', ['athlete_id'])

    # -- behavior_insights_digests --
    op.create_table(
        'behavior_insights_digests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('athlete_id', sa.Integer(), nullable=False),
        sa.Column('digest_type', sa.String(10), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('payload', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['athlete_id'], ['athletes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('athlete_id', 'digest_type', 'period_start', name='uq_digest_key'),
    )
    op.create_index(op.f('ix_behavior_insights_digests_athlete_id'), 'behavior_insights_digests', ['athlete_id'])


def downgrade() -> None:
    op.drop_table('behavior_insights_digests')
    op.drop_table('behavior_correlations')
    op.drop_table('nutrition_logs')
