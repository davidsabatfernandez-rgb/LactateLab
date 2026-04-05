"""add_behavior_journal_tables"""

revision = '20260329_0001'
down_revision = 'e39d7c4c8edd'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa

# Columns grouped by type for the journal entries table
TOGGLE_KEYS = [
    # Recovery
    "ice_bath", "sauna", "massage", "foam_rolling", "stretching", "compression_garments", "cold_shower",
    # Nutrition (toggle only)
    "creatine",
    # Supplements
    "melatonin", "omega_3", "vitamin_d", "electrolytes", "probiotics", "ashwagandha", "cbd", "pre_workout",
    # Mental
    "meditation", "journaling", "breathwork",
    # Sleep (toggle only)
    "consistent_bedtime", "sleep_mask", "magnesium",
    "mouth_tape", "nasal_strip", "weighted_blanket", "white_noise", "reading_before_bed", "blue_light_glasses",
    # Work
    "working_late", "shift_work",
    # Lifestyle (toggle only)
    "travel_jet_lag", "morning_sunlight", "nature_outdoors", "social_activity", "sex",
    # Life status
    "illness", "injury", "allergies", "high_altitude",
    # Medication
    "antihistamine", "pain_reliever", "birth_control", "cpap_machine", "prescription_medication", "anti_inflammatory",
]
TIME_KEYS = ["late_meal", "caffeine_after_2pm", "screens_before_bed"]
QUANTITY_KEYS = ["alcohol"]
DURATION_KEYS = ["nap"]
SCALE_KEYS = ["high_work_stress", "fasting"]

ALL_KEYS = TOGGLE_KEYS + TIME_KEYS + QUANTITY_KEYS + DURATION_KEYS + SCALE_KEYS


def upgrade() -> None:
    # -- behavior_journal_entries --
    cols = [
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('athlete_id', sa.Integer(), nullable=False),
        sa.Column('entry_date', sa.Date(), nullable=False),
    ]
    for key in TOGGLE_KEYS:
        cols.append(sa.Column(key, sa.Boolean(), nullable=True, server_default='0'))
    for key in TIME_KEYS:
        cols.append(sa.Column(key, sa.String(5), nullable=True))
    for key in QUANTITY_KEYS:
        cols.append(sa.Column(key, sa.Integer(), nullable=True))
    for key in DURATION_KEYS:
        cols.append(sa.Column(key, sa.Integer(), nullable=True))
    for key in SCALE_KEYS:
        cols.append(sa.Column(key, sa.Integer(), nullable=True))
    cols += [
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['athlete_id'], ['athletes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('athlete_id', 'entry_date', name='uq_athlete_behavior_date'),
    ]
    op.create_table('behavior_journal_entries', *cols)
    op.create_index(op.f('ix_behavior_journal_entries_athlete_id'), 'behavior_journal_entries', ['athlete_id'])
    op.create_index(op.f('ix_behavior_journal_entries_entry_date'), 'behavior_journal_entries', ['entry_date'])

    # -- behavior_preferences (always Boolean show/hide) --
    pref_cols = [
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('athlete_id', sa.Integer(), nullable=False),
    ]
    for key in ALL_KEYS:
        pref_cols.append(sa.Column(key, sa.Boolean(), nullable=False, server_default='1'))
    pref_cols += [
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['athlete_id'], ['athletes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    ]
    op.create_table('behavior_preferences', *pref_cols)
    op.create_index(op.f('ix_behavior_preferences_athlete_id'), 'behavior_preferences', ['athlete_id'], unique=True)

    # -- custom_behaviors --
    op.create_table(
        'custom_behaviors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('athlete_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(60), nullable=False),
        sa.Column('emoji', sa.String(10), nullable=False, server_default='⭐'),
        sa.Column('category', sa.String(30), nullable=False, server_default='custom'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['athlete_id'], ['athletes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_custom_behaviors_athlete_id'), 'custom_behaviors', ['athlete_id'])

    # -- custom_behavior_logs --
    op.create_table(
        'custom_behavior_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('custom_behavior_id', sa.Integer(), nullable=False),
        sa.Column('athlete_id', sa.Integer(), nullable=False),
        sa.Column('log_date', sa.Date(), nullable=False),
        sa.Column('value', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['custom_behavior_id'], ['custom_behaviors.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['athlete_id'], ['athletes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('custom_behavior_id', 'log_date', name='uq_custom_behavior_log_date'),
    )
    op.create_index(op.f('ix_custom_behavior_logs_custom_behavior_id'), 'custom_behavior_logs', ['custom_behavior_id'])
    op.create_index(op.f('ix_custom_behavior_logs_athlete_id'), 'custom_behavior_logs', ['athlete_id'])


def downgrade() -> None:
    op.drop_table('custom_behavior_logs')
    op.drop_table('custom_behaviors')
    op.drop_table('behavior_preferences')
    op.drop_table('behavior_journal_entries')
