from datetime import datetime

from app.models.session import Session, SessionInterval
from app.services.planning_engine import _estimate_durability_state


def _running_session(
    session_id: int,
    *,
    early_pace: float,
    late_pace: float,
    early_hr: int,
    late_hr: int,
    temperature_c: float = 16,
) -> Session:
    session = Session(
        id=session_id,
        athlete_id=1,
        performed_at=datetime(2026, 3, 1 + session_id, 9, 0, 0),
        discipline="running",
        power_source=None,
        session_type="tirada larga",
        goal="durability check",
        surface="road",
        temperature_c=temperature_c,
        comments=None,
    )
    intervals = []
    for index in range(6):
        is_late = index >= 3
        intervals.append(
            SessionInterval(
                order_index=index + 1,
                duration_seconds=900,
                rest_seconds=0,
                rest_type="none",
                heart_rate_avg=late_hr if is_late else early_hr,
                heart_rate_max=(late_hr if is_late else early_hr) + 5,
                pace_seconds_per_km=late_pace if is_late else early_pace,
                power_watts=None,
                running_power_watts=None,
                cadence=176,
                rpe=5.5 if is_late else 4.5,
                purpose="steady",
                notes=None,
            )
        )
    session.intervals = intervals
    return session


def test_estimate_durability_state_flags_low_durability_with_consistent_drift():
    sessions = [
        _running_session(1, early_pace=300, late_pace=320, early_hr=145, late_hr=158),
        _running_session(2, early_pace=302, late_pace=322, early_hr=146, late_hr=160),
    ]

    durability = _estimate_durability_state(
        sessions,
        discipline="running",
        distance_category="marathon",
    )

    assert durability["durability_confidence"] >= 0.65
    assert durability["durability_flag"] == "possible_low_durability"
    assert durability["aerobic_drift_pct"] is not None
    assert durability["aerobic_drift_pct"] >= 6


def test_estimate_durability_state_stays_prudent_with_single_confounded_session():
    sessions = [
        _running_session(1, early_pace=300, late_pace=316, early_hr=145, late_hr=156, temperature_c=30),
    ]

    durability = _estimate_durability_state(
        sessions,
        discipline="running",
        distance_category="half_run",
    )

    assert durability["durability_confidence"] <= 0.52
    assert durability["durability_flag"] in {"durability_signal_confounded", "insufficient_evidence_for_durability"}
