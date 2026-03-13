from app.services.analytics import _threshold_result_from_payload


def test_threshold_result_from_payload_ignores_unknown_keys():
    result = _threshold_result_from_payload(
        {
            "name": "lt1",
            "lactate": 1.8,
            "pace_seconds_per_km": 280.0,
            "power_watts": None,
            "heart_rate": 162,
            "power_source": None,
            "method": "test_method",
            "confidence": 0.84,
            "rationale": "Compat payload",
            "methods_compared": [],
            "agreement_score": 0.73,
            "evidence_level": "medium",
            "heart_rate_running": 162,
            "unexpected_nested_payload": {"foo": "bar"},
        }
    )

    assert result.name == "lt1"
    assert result.heart_rate == 162
    assert result.confidence == 0.84
