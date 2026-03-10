from app.services.planning_taxonomy import infer_session_taxonomy


def test_infers_aerobic_profile_test_from_raw_title():
    match = infer_session_taxonomy(title="Aerobic.profile EVAL", workout_type="Bike")

    assert match.canonical_session_type == "test_aerobic_profile"
    assert match.public_label == "Test aeróbico de perfil"


def test_infers_glycolytic_profile_without_exposing_raw_label():
    match = infer_session_taxonomy(title="Glyc.profile EVAL", workout_type="Bike")

    assert match.canonical_session_type == "test_anaerobic_profile"
    assert match.public_label == "Test anaeróbico de perfil"


def test_infers_lt1_extensive_from_representative_session():
    match = infer_session_taxonomy(title="4 x 6' LT1", workout_type="Run")

    assert match.canonical_session_type == "lt1_extensive"
    assert match.energy_system_focus == "Aerobic Capacity"


def test_infers_lt2_work_from_representative_session():
    match = infer_session_taxonomy(title="3 x 30' LT2 (half pace)", workout_type="Bike")

    assert match.canonical_session_type == "competition_specific"
    assert match.block_type_hint == "competition_specific_block"


def test_infers_vo2_power_from_representative_session():
    match = infer_session_taxonomy(title="15' LT1 + 4 x 3' VO2max", workout_type="Bike")

    assert match.canonical_session_type == "mixed_session"
    assert match.mesocycle_role == "mixed"


def test_infers_strength_support_from_private_coach_nomenclature():
    match = infer_session_taxonomy(title="FUERZA.swim focus", workout_type="Strength")

    assert match.canonical_session_type == "strength_support"
    assert match.public_label == "Fuerza de soporte"
