from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Lactate Lab API"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./data/lactate_lab.db"
    jwt_secret: str = "change-me"
    jwt_expire_minutes: int = 1440
    access_token_algorithm: str = "HS256"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemma-3-12b-it:free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    dynamic_lt1_delta_from_baseline: float = 0.45
    dynamic_practical_lt1_target_mmol: float = 1.6
    dynamic_practical_lt2_target_mmol: float = 3.1
    dynamic_practical_translation_mode: str = "configured"
    dynamic_acute_window_days: int = 10
    dynamic_chronic_window_days: int = 42
    dynamic_recency_decay_days: int = 18
    dynamic_quality_weight: float = 1.0
    dynamic_recency_weight: float = 1.0
    dynamic_similarity_weight: float = 1.0
    dynamic_outlier_residual_threshold: float = 1.0
    dynamic_fallback_baseline_lactate: float = 1.2
    advisor_book_path: str = "/Users/davidsabatfernandez/Library/Mobile Documents/JFJWWP64QD~com~goodiware~GoodReader/Documents/Documentos David copia/Libros/Triatlón/Fisiologia/Science of Winning.pdf"
    frontend_base_url: str = "http://localhost:5173"
    backend_base_url: str = "http://localhost:8000"
    strava_client_id: str = ""
    strava_client_secret: str = ""
    strava_redirect_uri: str = "http://localhost:8000/api/auth/strava/callback"
    strava_scopes: str = "read,activity:read_all"
    strava_token_encryption_key: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                return []
            if normalized.startswith("["):
                return normalized
            return [item.strip() for item in normalized.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
