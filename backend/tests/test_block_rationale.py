from types import SimpleNamespace

from app.services.block_rationale import (
    generate_block_explanation,
    rationale_fit_messages,
    rationale_risk_messages,
)


def test_rationale_fit_messages_expose_ui_ready_block_explanation():
    messages = rationale_fit_messages("aerobic_capacity_block")

    assert len(messages) == 3
    assert "Contexto ideal:" in messages[1]
    assert "Ventana útil:" in messages[2]


def test_rationale_risk_messages_expose_block_tradeoff():
    messages = rationale_risk_messages("threshold_development_block")

    assert len(messages) == 1
    assert messages[0].startswith("Si lo aplicas mal:")


def test_generate_block_explanation_exposes_all_ui_sections():
    ctx = SimpleNamespace(
        metric_type="pace_kmh",
        athlete_level="trained",
        distance_category="marathon",
        weeks_to_goal=12,
        lt1_kmh=14.2,
        lt2_kmh=16.0,
        lt1_power_watts=None,
        lt2_power_watts=None,
        capacity_profile=None,
        peak_lactate_1km=9.6,
    )
    gap_result = SimpleNamespace(
        recommended_block="aerobic_capacity_block",
        season_phase="base_early",
        primary_limiter="lt1",
        lt2_gap_kmh=-0.3,
        lt1_gap_kmh=-0.8,
        required_lt2_kmh=16.3,
        required_lt1_kmh=15.0,
    )

    explanation = generate_block_explanation(ctx, gap_result)

    assert explanation.block_key == "aerobic_capacity_block"
    assert explanation.headline
    assert explanation.why_now
    assert explanation.what_to_expect
    assert explanation.what_to_watch
    assert explanation.when_to_exit
    assert explanation.alternative_if_wrong
