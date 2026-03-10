from pathlib import Path

from app.core.config import Settings


def test_sqlite_database_url_is_resolved_from_backend_root():
    settings = Settings(database_url="sqlite:///./data/lactate_lab.db")

    expected_path = Path(__file__).resolve().parents[1] / "data" / "lactate_lab.db"
    assert settings.database_url == f"sqlite:///{expected_path}"
