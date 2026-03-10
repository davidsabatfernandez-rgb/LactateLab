from datetime import datetime
from typing import Optional

from app.models.session import Session
from app.services.mesocycle_detector import classify_session_for_planning, detect_mesocycles, summarize_training_weeks


def make_session(session_id: int, performed_at: str, discipline: str, session_type: str, goal: str = "", comments: Optional[str] = None) -> Session:
    return Session(
        id=session_id,
        athlete_id=1,
        performed_at=datetime.fromisoformat(performed_at),
        discipline=discipline,
        session_type=session_type,
        goal=goal,
        comments=comments,
    )


def test_classify_session_for_planning_uses_canonical_labels():
    session = make_session(1, "2025-04-05T10:00:00", "ciclismo", "Aerobic.profile EVAL")

    result = classify_session_for_planning(session)

    assert result.canonical_session_type == "test_aerobic_profile"
    assert result.public_label == "Test aeróbico de perfil"


def test_summarize_training_weeks_detects_capacity_week():
    sessions = [
        make_session(1, "2025-04-01T10:00:00", "running", "1h D1"),
        make_session(2, "2025-04-03T10:00:00", "running", "30-40' AR + 4 x progresivos"),
        make_session(3, "2025-04-04T10:00:00", "running", "4 x 6' LT1"),
    ]

    weeks = summarize_training_weeks(sessions, "running")

    assert len(weeks) == 1
    assert weeks[0].dominant_block_type == "aerobic_capacity_block"
    assert weeks[0].sessions_count == 3


def test_detect_mesocycles_merges_test_week_into_following_block():
    sessions = [
        make_session(1, "2025-04-01T10:00:00", "ciclismo", "Aerobic.profile EVAL"),
        make_session(2, "2025-04-03T10:00:00", "ciclismo", "3h AR"),
        make_session(3, "2025-04-08T10:00:00", "ciclismo", "15' D2 + 3 x 20' LT1"),
        make_session(4, "2025-04-10T10:00:00", "ciclismo", "15' D2 + 3 x 25' LT1"),
        make_session(5, "2025-04-15T10:00:00", "ciclismo", "3 x 30' LT2 (half pace)"),
        make_session(6, "2025-04-17T10:00:00", "ciclismo", "4 x 20' LT2 (half pace)"),
    ]

    mesocycles = detect_mesocycles(sessions, "ciclismo")

    assert len(mesocycles) == 2
    assert mesocycles[0].block_type == "aerobic_capacity_block"
    assert mesocycles[0].testing_weeks == 1
    assert mesocycles[0].weeks_count == 2
    assert mesocycles[1].block_type == "competition_specific_block"


def test_detect_mesocycles_marks_support_modules_inside_segment():
    sessions = [
        make_session(1, "2025-05-05T10:00:00", "ciclismo", "15' LT1 + 4 x 3' VO2max"),
        make_session(2, "2025-05-07T10:00:00", "ciclismo", "FUERZA"),
        make_session(3, "2025-05-09T10:00:00", "ciclismo", "15' LT1 + 5 x 3' VO2max"),
    ]

    mesocycles = detect_mesocycles(sessions, "ciclismo")

    assert len(mesocycles) == 1
    assert mesocycles[0].block_type == "aerobic_power_block"
    assert "Fuerza de soporte" in mesocycles[0].support_modules
