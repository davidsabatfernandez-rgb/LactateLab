import pytest

from app.services.physiological_engine import build_physiological_context, analyse_physiological_gap


def _pace(seconds_per_km: int) -> str:
    minutes = seconds_per_km // 60
    seconds = seconds_per_km % 60
    return f"{minutes:02d}:{seconds:02d}"


def _pace_analysis(discipline: str, lt1_seconds: int, lt2_seconds: int, confidence: float = 0.82):
    return {
        "discipline_views": {
            discipline: {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [
                    {"name": "LT1", "pace_seconds_per_km": float(lt1_seconds), "confidence": confidence},
                    {"name": "LT2", "pace_seconds_per_km": float(lt2_seconds), "confidence": confidence},
                ],
            }
        }
    }


def _power_analysis(lt1_watts: float, lt2_watts: float, confidence: float = 0.82):
    return {
        "discipline_views": {
            "ciclismo": {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [
                    {"name": "LT1", "power_watts": lt1_watts, "confidence": confidence},
                    {"name": "LT2", "power_watts": lt2_watts, "confidence": confidence},
                ],
            }
        }
    }


def test_build_physiological_context_reads_thresholds_from_discipline_view():
    analysis = {
        "discipline_views": {
            "running": {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [
                    {"name": "LT1", "pace_seconds_per_km": 370.0, "confidence": 0.86},
                    {"name": "LT2", "pace_seconds_per_km": 339.0, "confidence": 0.80},
                ],
                "real_thresholds": {
                    "lt1_real": {"pace_seconds_per_km": 370.0, "confidence": 0.85},
                    "lt2_real": {"pace_seconds_per_km": 339.0, "confidence": 0.80},
                },
            }
        }
    }

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="recreational",
        discipline="running",
        distance_category="hm",
        target_pace_label="04:59",
        target_power_watts=None,
        weeks_to_goal=34,
        peak_lactate_1km=10.0,
        raw_curve_points=[],
    )

    assert ctx.lt1_kmh == 9.73
    assert ctx.lt2_kmh == 10.619
    assert ctx.lt1_confidence >= 0.8
    assert ctx.lt2_confidence >= 0.8
    assert ctx.metric_type == "pace_kmh"


def test_hm_profile_moves_to_capacity_when_lt1_support_is_too_poor():
    analysis = {
        "discipline_views": {
            "running": {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [
                    {"name": "LT1", "pace_seconds_per_km": 370.0, "confidence": 0.86},
                    {"name": "LT2", "pace_seconds_per_km": 339.0, "confidence": 0.80},
                ],
                "real_thresholds": {
                    "lt1_real": {"pace_seconds_per_km": 370.0, "confidence": 0.85},
                    "lt2_real": {"pace_seconds_per_km": 339.0, "confidence": 0.80},
                },
            }
        }
    }

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="recreational",
        discipline="running",
        distance_category="hm",
        target_pace_label="04:59",
        target_power_watts=None,
        weeks_to_goal=34,
        peak_lactate_1km=10.0,
        raw_curve_points=[],
    )
    result = analyse_physiological_gap(ctx)

    assert result.data_quality == "good"
    assert result.primary_limiter == "lt1"
    assert result.recommended_block == "aerobic_capacity_block"


def test_hm_profile_can_still_start_with_threshold_when_lt1_support_is_acceptable():
    analysis = {
        "discipline_views": {
            "running": {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [
                    {"name": "LT1", "pace_seconds_per_km": 320.0, "confidence": 0.86},
                    {"name": "LT2", "pace_seconds_per_km": 295.0, "confidence": 0.80},
                ],
                "real_thresholds": {
                    "lt1_real": {"pace_seconds_per_km": 320.0, "confidence": 0.85},
                    "lt2_real": {"pace_seconds_per_km": 295.0, "confidence": 0.80},
                },
            }
        }
    }

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained",
        discipline="running",
        distance_category="hm",
        target_pace_label="04:45",
        target_power_watts=None,
        weeks_to_goal=18,
        peak_lactate_1km=9.7,
        raw_curve_points=[],
    )
    result = analyse_physiological_gap(ctx)

    assert result.data_quality == "good"
    assert result.primary_limiter == "lt2"
    assert result.recommended_block == "threshold_development_block"


def test_10k_can_require_capacity_first_when_lt1_support_is_extremely_poor():
    analysis = {
        "discipline_views": {
            "running": {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [
                    {"name": "LT1", "pace_seconds_per_km": 370.0, "confidence": 0.86},
                    {"name": "LT2", "pace_seconds_per_km": 345.0, "confidence": 0.80},
                ],
            }
        }
    }

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="recreational",
        discipline="running",
        distance_category="10k",
        target_pace_label="04:45",
        target_power_watts=None,
        weeks_to_goal=24,
        peak_lactate_1km=10.0,
        raw_curve_points=[],
    )
    result = analyse_physiological_gap(ctx)

    # F1 fix: ratio LT1/LT2=0.933 ≥ 0.75 → base funcional → primary_limiter="lt2", no "lt1"
    assert result.primary_limiter == "lt2"
    assert result.recommended_block == "aerobic_capacity_block"


def test_5k_with_very_poor_lt1_support_moves_to_capacity_first():
    analysis = {
        "discipline_views": {
            "running": {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [
                    {"name": "LT1", "pace_seconds_per_km": 370.0, "confidence": 0.86},
                    {"name": "LT2", "pace_seconds_per_km": 345.0, "confidence": 0.80},
                ],
            }
        }
    }

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="recreational",
        discipline="running",
        distance_category="5k",
        target_pace_label="04:20",
        target_power_watts=None,
        weeks_to_goal=20,
        peak_lactate_1km=9.5,
        raw_curve_points=[],
    )
    result = analyse_physiological_gap(ctx)

    # F1 fix: ratio=0.933 ≥ 0.75 → base funcional → primary_limiter="lt2"
    # weeks=20 → specific → lt2_priority + large gap → threshold
    assert result.primary_limiter == "lt2"
    assert result.recommended_block == "threshold_development_block"


def test_ironman_run_flat_profile_can_use_threshold_when_lt1_is_good_enough():
    analysis = {
        "discipline_views": {
            "running": {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [
                    {"name": "LT1", "pace_seconds_per_km": 285.0, "confidence": 0.86},
                    {"name": "LT2", "pace_seconds_per_km": 270.0, "confidence": 0.80},
                ],
            }
        }
    }

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained",
        discipline="running",
        distance_category="ironman_run",
        target_pace_label="05:10",
        target_power_watts=None,
        weeks_to_goal=18,
        peak_lactate_1km=7.0,
        raw_curve_points=[],
    )
    result = analyse_physiological_gap(ctx)

    assert result.primary_limiter == "lt2"
    assert result.recommended_block == "threshold_development_block"


def test_half_run_with_poor_lt1_support_moves_to_capacity_first():
    analysis = {
        "discipline_views": {
            "running": {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [
                    {"name": "LT1", "pace_seconds_per_km": 320.0, "confidence": 0.86},
                    {"name": "LT2", "pace_seconds_per_km": 295.0, "confidence": 0.80},
                ],
            }
        }
    }

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained",
        discipline="running",
        distance_category="half_run",
        target_pace_label="04:30",
        target_power_watts=None,
        weeks_to_goal=14,
        peak_lactate_1km=9.0,
        raw_curve_points=[],
    )
    result = analyse_physiological_gap(ctx)

    assert result.primary_limiter == "lt1"
    assert result.recommended_block == "aerobic_capacity_block"


def test_half_run_flat_profile_can_use_power_when_lt1_is_ready():
    analysis = {
        "discipline_views": {
            "running": {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [
                    {"name": "LT1", "pace_seconds_per_km": 255.0, "confidence": 0.86},
                    {"name": "LT2", "pace_seconds_per_km": 234.0, "confidence": 0.80},
                ],
            }
        }
    }

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained",
        discipline="running",
        distance_category="half_run",
        target_pace_label="04:30",
        target_power_watts=None,
        weeks_to_goal=8,
        peak_lactate_1km=7.2,
        raw_curve_points=[],
    )
    result = analyse_physiological_gap(ctx)

    assert result.primary_limiter == "lt2"
    # gap cerrado (lt2=15.38 > req=15.32) + pre_comp + half_run not ANP → competition_specific
    assert result.recommended_block == "competition_specific_block"


def test_half_bike_flat_profile_can_use_power_when_lt1_is_ready():
    analysis = _power_analysis(275, 300)

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained",
        discipline="ciclismo",
        distance_category="half_bike",
        target_pace_label=None,
        target_power_watts=260.0,
        weeks_to_goal=8,
        peak_lactate_1km=7.3,
        raw_curve_points=[],
    )
    result = analyse_physiological_gap(ctx)

    assert result.primary_limiter == "lt2"
    # gap cerrado (lt2=300W > req=305.9W? No: 300<305.9 → gap=-5.9W ≤ mod) + pre_comp + half_bike not ANP → competition_specific
    assert result.recommended_block == "competition_specific_block"


def test_high_glycolytic_marathon_profile_biases_towards_aerobic_capacity():
    analysis = {
        "discipline_views": {
            "running": {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [
                    {"name": "LT1", "pace_seconds_per_km": 300.0, "confidence": 0.82},
                    {"name": "LT2", "pace_seconds_per_km": 265.0, "confidence": 0.80},
                ],
            }
        }
    }

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained",
        discipline="running",
        distance_category="marathon",
        target_pace_label="04:15",
        target_power_watts=None,
        weeks_to_goal=20,
        peak_lactate_1km=13.0,
        raw_curve_points=[],
    )
    result = analyse_physiological_gap(ctx)

    assert result.data_quality == "good"
    assert result.recommended_block == "aerobic_capacity_block"
    assert any("glucol" in item.lower() for item in result.reasons)


def test_taper_keeps_required_thresholds_for_goal_scenario_chart():
    analysis = {
        "discipline_views": {
            "running": {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [
                    {"name": "LT1", "pace_seconds_per_km": 300.0, "confidence": 0.82},
                    {"name": "LT2", "pace_seconds_per_km": 273.0, "confidence": 0.84},
                ],
            }
        }
    }

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained",
        discipline="running",
        distance_category="hm",
        target_pace_label="04:15",
        target_power_watts=None,
        weeks_to_goal=2,  # taper = <3 semanas (cambiado desde <5)
        peak_lactate_1km=9.2,
        raw_curve_points=[],
    )
    result = analyse_physiological_gap(ctx)

    assert result.season_phase == "taper"
    assert result.recommended_block == "competition_specific_block"
    assert result.required_lt1_kmh is not None
    assert result.required_lt2_kmh is not None


def test_cycling_context_uses_power_thresholds_when_target_is_power_based():
    analysis = {
        "discipline_views": {
            "ciclismo": {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [
                    {"name": "LT1", "power_watts": 260.0, "confidence": 0.80},
                    {"name": "LT2", "power_watts": 300.0, "confidence": 0.83},
                ],
                "real_thresholds": {
                    "lt1_real": {"power_watts": 265.0, "confidence": 0.82},
                    "lt2_real": {"power_watts": 305.0, "confidence": 0.84},
                },
            }
        }
    }

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained",
        discipline="ciclismo",
        distance_category="road_tt",
        target_pace_label=None,
        target_power_watts=320.0,
        weeks_to_goal=12,
        peak_lactate_1km=9.5,
        raw_curve_points=[],
    )
    result = analyse_physiological_gap(ctx)

    assert ctx.metric_type == "power_watts"
    assert ctx.lt2_power_watts == 305.0
    assert result.data_quality == "good"
    assert result.recommended_block == "threshold_development_block"


def test_build_physiological_context_interpolates_cycling_thresholds_from_raw_curve():
    analysis = {
        "discipline_views": {
            "ciclismo": {
                "latest_snapshot_date": "2026-03-08",
                "thresholds": [],
                "real_thresholds": {},
            }
        }
    }

    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level="trained",
        discipline="ciclismo",
        distance_category="road_tt",
        target_pace_label=None,
        target_power_watts=320.0,
        weeks_to_goal=12,
        peak_lactate_1km=9.5,
        raw_curve_points=[
            {"power_watts": 220.0, "lactate_mmol": 1.4},
            {"power_watts": 250.0, "lactate_mmol": 2.1},
            {"power_watts": 300.0, "lactate_mmol": 4.0},
        ],
    )
    result = analyse_physiological_gap(ctx)

    assert ctx.lt1_power_watts == 245.7
    assert ctx.lt2_power_watts == 300.0
    assert result.data_quality == "low"
    assert result.recommended_block == "threshold_development_block"


@pytest.mark.parametrize(
    ("analysis", "athlete_level", "discipline", "distance_category", "target_pace", "target_power", "weeks_to_goal", "peak_lactate", "expected_block"),
    [
        (
            {
                "discipline_views": {
                    "running": {
                        "latest_snapshot_date": "2026-03-08",
                        "thresholds": [
                            {"name": "LT1", "pace_seconds_per_km": 255.0, "confidence": 0.82},
                            {"name": "LT2", "pace_seconds_per_km": 240.0, "confidence": 0.82},
                        ],
                    }
                }
            },
            "competitive",
            "running",
            "marathon",
            "04:20",
            None,
            8,
            8.8,
            "competition_specific_block",  # gap=-0.11 ≤ mod, pre_comp, marathon not ANP
        ),
        (
            {
                "discipline_views": {
                    "running": {
                        "latest_snapshot_date": "2026-03-08",
                        "thresholds": [
                            {"name": "LT1", "pace_seconds_per_km": 370.0, "confidence": 0.82},
                            {"name": "LT2", "pace_seconds_per_km": 345.0, "confidence": 0.82},
                        ],
                    }
                }
            },
            "recreational",
            "running",
            "marathon",
            "05:05",
            None,
            20,
            8.8,
            "aerobic_capacity_block",
        ),
        (
            {
                "discipline_views": {
                    "running": {
                        "latest_snapshot_date": "2026-03-08",
                        "thresholds": [
                            {"name": "LT1", "pace_seconds_per_km": 230.0, "confidence": 0.82},
                            {"name": "LT2", "pace_seconds_per_km": 218.0, "confidence": 0.82},
                        ],
                    }
                }
            },
            "trained",
            "running",
            "10k",
            "03:55",
            None,
            8,
            7.4,
            "aerobic_power_block",
        ),
        (
            {
                "discipline_views": {
                    "ciclismo": {
                        "latest_snapshot_date": "2026-03-08",
                        "thresholds": [
                            {"name": "LT1", "power_watts": 225.0, "confidence": 0.82},
                            {"name": "LT2", "power_watts": 275.0, "confidence": 0.82},
                        ],
                    }
                }
            },
            "trained",
            "ciclismo",
            "ironman_bike",
            None,
            220.0,
            18,
            13.0,
            "aerobic_capacity_block",
        ),
    ],
)
def test_physiological_gap_matrix_covers_critical_profiles(
    analysis,
    athlete_level,
    discipline,
    distance_category,
    target_pace,
    target_power,
    weeks_to_goal,
    peak_lactate,
    expected_block,
):
    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level=athlete_level,
        discipline=discipline,
        distance_category=distance_category,
        target_pace_label=target_pace,
        target_power_watts=target_power,
        weeks_to_goal=weeks_to_goal,
        peak_lactate_1km=peak_lactate,
        raw_curve_points=[],
    )
    result = analyse_physiological_gap(ctx)

    assert result.data_quality in {"good", "low"}
    assert result.recommended_block == expected_block


VALIDATION_BATTERY = [
    # R01: weeks=20 → specific; ratio=0.933 ok; gap=4.96 significant → threshold (specific + large gap)
    pytest.param(_pace_analysis("running", 370, 345), "recreational", "running", "5k", _pace(260), None, 20, 9.5, "threshold_development_block", id="R01_5k_recreational_low_profile"),
    pytest.param(_pace_analysis("running", 320, 295), "trained", "running", "5k", _pace(245), None, 14, 9.8, "threshold_development_block", id="R02_5k_trained_lt2_limiter"),
    pytest.param(_pace_analysis("running", 230, 218), "competitive", "running", "5k", _pace(220), None, 8, 7.4, "aerobic_power_block", id="R03_5k_diesel_near_target"),
    # R04: pre_comp + gap=0 + 5k in ANP_EVENTS → ANP
    pytest.param(_pace_analysis("running", 255, 240), "trained", "running", "5k", _pace(250), None, 6, 9.2, "anaerobic_power_block", id="R04_5k_specific_transfer"),
    pytest.param(_pace_analysis("running", 300, 275), "trained", "running", "5k", _pace(235), None, 16, 7.8, "threshold_development_block", id="R05_5k_far_from_target"),
    # R06: weeks=24 → base_late; lt1_gap=0.97 > sig(0.5) → code fix gates lt2_priority → AEC
    pytest.param(_pace_analysis("running", 370, 345), "recreational", "running", "10k", _pace(285), None, 24, 10.0, "aerobic_capacity_block", id="R06_10k_new_low_profile"),
    pytest.param(_pace_analysis("running", 320, 295), "trained", "running", "10k", _pace(250), None, 12, 9.8, "threshold_development_block", id="R07_10k_lt2_gap"),
    pytest.param(_pace_analysis("running", 230, 218), "trained", "running", "10k", _pace(235), None, 8, 7.4, "aerobic_power_block", id="R08_10k_diesel_near_target"),
    # R09: pre_comp + gap=-0.2 ≤ mod + 10k in ANP_EVENTS → ANP
    pytest.param(_pace_analysis("running", 255, 240), "competitive", "running", "10k", _pace(248), None, 7, 9.0, "anaerobic_power_block", id="R09_10k_ready_for_specific"),
    pytest.param(_pace_analysis("running", 280, 265), "trained", "running", "10k", _pace(238), None, 10, 7.5, "threshold_development_block", id="R10_10k_diesel_but_lt2_short"),
    pytest.param(_pace_analysis("running", 370, 339), "recreational", "running", "hm", _pace(299), None, 34, 10.0, "aerobic_capacity_block", id="R11_hm_andrea_like"),
    pytest.param(_pace_analysis("running", 320, 295), "trained", "running", "hm", _pace(285), None, 18, 9.7, "threshold_development_block", id="R12_hm_trained_lt2_gap"),
    pytest.param(_pace_analysis("running", 255, 240), "competitive", "running", "hm", _pace(310), None, 6, 8.8, "competition_specific_block", id="R13_hm_specific"),
    pytest.param(_pace_analysis("running", 300, 275), "trained", "running", "hm", _pace(320), None, 16, 13.2, "aerobic_capacity_block", id="R14_hm_high_glycolytic"),
    pytest.param(_pace_analysis("running", 255, 240), "trained", "running", "hm", _pace(325), None, 12, 9.0, "competition_specific_block", id="R15_hm_compatible_profile"),
    pytest.param(_pace_analysis("running", 370, 345), "recreational", "running", "marathon", _pace(305), None, 20, 8.8, "aerobic_capacity_block", id="R16_marathon_low_profile_small_gap"),
    pytest.param(_pace_analysis("running", 300, 275), "trained", "running", "marathon", _pace(290), None, 22, 13.0, "aerobic_capacity_block", id="R17_marathon_high_glycolytic"),
    pytest.param(_pace_analysis("running", 255, 240), "competitive", "running", "marathon", _pace(300), None, 6, 8.8, "competition_specific_block", id="R18_marathon_specific"),
    # R19: pre_comp + gap=-0.11 ≤ mod + marathon not ANP → competition_specific
    pytest.param(_pace_analysis("running", 255, 240), "competitive", "running", "marathon", _pace(260), None, 8, 8.8, "competition_specific_block", id="R19_marathon_high_level_small_gap"),
    # R20: specific + gap=0.21 ≤ mod + marathon → competition_specific (LT1 ok, gap almost closed)
    pytest.param(_pace_analysis("running", 280, 265), "trained", "running", "marathon", _pace(300), None, 18, 7.5, "competition_specific_block", id="R20_marathon_diesel_but_lt1_priority"),
    pytest.param(_power_analysis(235, 280), "recreational", "ciclismo", "road_tt_short", None, 320.0, 18, 9.8, "threshold_development_block", id="C01_tt_short_low_profile"),
    pytest.param(_power_analysis(260, 305), "trained", "ciclismo", "road_tt_short", None, 290.0, 8, 7.6, "aerobic_power_block", id="C02_tt_short_diesel_near_target"),
    pytest.param(_power_analysis(270, 315), "competitive", "ciclismo", "road_tt_short", None, 304.0, 6, 9.0, "competition_specific_block", id="C03_tt_short_specific"),
    pytest.param(_power_analysis(230, 275), "trained", "ciclismo", "road_tt_medium", None, 320.0, 14, 10.0, "threshold_development_block", id="C04_tt_medium_lt2_gap"),
    pytest.param(_power_analysis(255, 300), "trained", "ciclismo", "road_tt_medium", None, 275.0, 8, 9.2, "competition_specific_block", id="C05_tt_medium_near_target"),
    pytest.param(_power_analysis(265, 305), "competitive", "ciclismo", "road_tt_medium", None, 295.0, 7, 9.0, "competition_specific_block", id="C06_tt_medium_specific"),
    pytest.param(_power_analysis(220, 270), "trained", "ciclismo", "road_tt_long", None, 290.0, 20, 9.5, "aerobic_capacity_block", id="C07_tt_long_lt1_priority"),
    pytest.param(_power_analysis(225, 275), "trained", "ciclismo", "road_tt_long", None, 220.0, 18, 13.0, "aerobic_capacity_block", id="C08_tt_long_high_glycolytic"),
    pytest.param(_power_analysis(255, 300), "competitive", "ciclismo", "road_tt_long", None, 260.0, 8, 9.0, "competition_specific_block", id="C09_tt_long_specific"),
    pytest.param(_power_analysis(220, 265), "trained", "ciclismo", "granfondo", None, 240.0, 20, 9.4, "aerobic_capacity_block", id="C10_granfondo_low_support"),
    pytest.param(_power_analysis(230, 275), "trained", "ciclismo", "granfondo", None, 230.0, 18, 13.0, "aerobic_capacity_block", id="C11_granfondo_high_glycolytic"),
    pytest.param(_power_analysis(255, 300), "trained", "ciclismo", "hill_climb", None, 288.0, 10, 7.6, "aerobic_power_block", id="C12_hill_climb_diesel_near_target"),
    pytest.param(_power_analysis(250, 290), "trained", "ciclismo", "road_race", None, 320.0, 12, 9.4, "threshold_development_block", id="C13_road_race_lt2_gap"),
    # C14: pre_comp + gap=2.3W ≤ mod(8W) + road_race in ANP_EVENTS → ANP
    pytest.param(_power_analysis(265, 305), "competitive", "ciclismo", "road_race", None, 295.0, 6, 8.8, "anaerobic_power_block", id="C14_road_race_specific"),
    pytest.param(_pace_analysis("natación", 1100, 1020), "trained", "natación", "pool_400", _pace(930), None, 10, 9.5, "threshold_development_block", id="S01_pool400_lt2_gap"),
    pytest.param(_pace_analysis("natación", 980, 920), "trained", "natación", "pool_400", _pace(900), None, 8, 7.2, "aerobic_power_block", id="S02_pool400_diesel_near_target"),
    pytest.param(_pace_analysis("natación", 1080, 990), "trained", "natación", "pool_800_1500", _pace(950), None, 12, 9.0, "threshold_development_block", id="S03_pool1500_lt2_gap"),
    pytest.param(_pace_analysis("natación", 940, 900), "competitive", "natación", "pool_800_1500", _pace(890), None, 7, 8.8, "competition_specific_block", id="S04_pool1500_specific"),
    pytest.param(_pace_analysis("natación", 1120, 1040), "trained", "natación", "open_water_short", _pace(980), None, 14, 9.2, "threshold_development_block", id="S05_open_water_short_lt2"),
    pytest.param(_pace_analysis("natación", 1180, 1090), "trained", "natación", "open_water_long", _pace(1100), None, 18, 12.8, "aerobic_capacity_block", id="S06_open_water_long_high_gly"),
    pytest.param(_pace_analysis("running", 320, 295), "trained", "running", "sprint_run", _pace(255), None, 12, 9.8, "threshold_development_block", id="T01_sprint_run_lt2_gap"),
    pytest.param(_power_analysis(255, 300), "trained", "ciclismo", "sprint_bike", None, 285.0, 8, 7.5, "aerobic_power_block", id="T02_sprint_bike_diesel_near_target"),
    pytest.param(_pace_analysis("running", 300, 275), "trained", "running", "olympic_run", _pace(270), None, 12, 9.8, "threshold_development_block", id="T03_olympic_run_lt2_gap"),
    pytest.param(_power_analysis(240, 285), "trained", "ciclismo", "olympic_bike", None, 305.0, 10, 9.6, "threshold_development_block", id="T04_olympic_bike_lt2_gap"),
    # T05: specific + gap=0.44 in (mod,sig) range → aerobic_power (non-base, moderate gap)
    pytest.param(_pace_analysis("running", 280, 265), "trained", "running", "half_run", _pace(295), None, 18, 9.2, "aerobic_power_block", id="T05_half_run_lt1_priority"),
    pytest.param(_power_analysis(225, 275), "trained", "ciclismo", "half_bike", None, 240.0, 18, 12.8, "aerobic_capacity_block", id="T06_half_bike_high_gly"),
    pytest.param(_pace_analysis("running", 255, 240), "competitive", "running", "half_run", _pace(320), None, 8, 8.8, "competition_specific_block", id="T07_half_run_specific"),
    pytest.param(_power_analysis(255, 300), "competitive", "ciclismo", "half_bike", None, 260.0, 8, 8.9, "competition_specific_block", id="T08_half_bike_specific"),
    pytest.param(_pace_analysis("running", 320, 295), "trained", "running", "ironman_run", _pace(330), None, 20, 9.2, "aerobic_capacity_block", id="T09_ironman_run_lt1_priority"),
    pytest.param(_power_analysis(225, 275), "trained", "ciclismo", "ironman_bike", None, 220.0, 18, 13.0, "aerobic_capacity_block", id="T10_ironman_bike_high_gly"),
    pytest.param(_pace_analysis("running", 255, 240), "competitive", "running", "ironman_run", _pace(335), None, 8, 8.7, "competition_specific_block", id="T11_ironman_run_specific"),
    pytest.param(_power_analysis(255, 300), "competitive", "ciclismo", "ironman_bike", None, 245.0, 8, 8.8, "competition_specific_block", id="T12_ironman_bike_specific"),
]


@pytest.mark.parametrize(
    ("analysis", "athlete_level", "discipline", "distance_category", "target_pace", "target_power", "weeks_to_goal", "peak_lactate", "expected_block"),
    VALIDATION_BATTERY,
)
def test_physiological_gap_validation_battery(
    analysis,
    athlete_level,
    discipline,
    distance_category,
    target_pace,
    target_power,
    weeks_to_goal,
    peak_lactate,
    expected_block,
):
    ctx = build_physiological_context(
        analysis=analysis,
        athlete_level=athlete_level,
        discipline=discipline,
        distance_category=distance_category,
        target_pace_label=target_pace,
        target_power_watts=target_power,
        weeks_to_goal=weeks_to_goal,
        peak_lactate_1km=peak_lactate,
        raw_curve_points=[],
    )
    result = analyse_physiological_gap(ctx)

    assert result.data_quality in {"good", "low"}
    assert result.recommended_block == expected_block
