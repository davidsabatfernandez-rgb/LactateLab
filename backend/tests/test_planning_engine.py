from datetime import datetime

from app.models.session import Session, SessionInterval
from app.services.planning_engine import (
    BlockCandidate,
    _estimate_durability_state,
    _prioritize_physiological_candidate,
    _score_block_candidates,
    _score_initial_assignment_candidates,
)


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


def test_score_block_candidates_requires_context_instead_of_base_priors():
    candidates = _score_block_candidates(
        days_to_target=50,
        previous_major="threshold_development_block",
        evaluation_signal="stable",
        robustness="moderate",
        recent_session_count=4,
        discipline="running",
    )

    scores = {candidate.block_type: candidate.score for candidate in candidates}

    assert scores["aerobic_capacity_block"] == 0
    assert scores["threshold_development_block"] == 0
    assert scores["technical_rebuild_block"] == 0
    assert scores["competition_specific_block"] == 10


def test_score_initial_assignment_candidates_does_not_add_default_block_bias():
    candidates = _score_initial_assignment_candidates(
        days_to_target=None,
        discipline="running",
        distance_category=None,
        physiological_block=None,
        primary_limiter=None,
        data_quality="none",
    )

    scores = {candidate.block_type: candidate.score for candidate in candidates}

    assert scores["aerobic_capacity_block"] == 0
    assert scores["threshold_development_block"] == 0
    assert scores["aerobic_power_block"] == 0
    assert scores["recovery_consolidation_block"] == -20


def test_prioritize_physiological_candidate_makes_visible_ranking_match_override():
    prioritized = _prioritize_physiological_candidate(
        [
            BlockCandidate(block_type="threshold_development_block", score=28, reasons=["+28 build phase"]),
            BlockCandidate(block_type="aerobic_capacity_block", score=6, reasons=["+6 conservative fallback"]),
        ],
        physiological_block="aerobic_capacity_block",
        reasons=["LT1 es el limitante principal."],
        contraindications=[],
    )

    assert prioritized[0].block_type == "aerobic_capacity_block"
    assert prioritized[0].score == 28
    assert "Prioridad fisiológica explícita" in prioritized[0].reasons[0]
