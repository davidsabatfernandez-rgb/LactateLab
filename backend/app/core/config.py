from functools import lru_cache

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
    advisor_book_path: str = "/Users/davidsabatfernandez/Library/Mobile Documents/JFJWWP64QD~com~goodiware~GoodReader/Documents/Documentos David copia/Libros/Triatlón/Fisiologia/Science of Winning.pdf"


@lru_cache
def get_settings() -> Settings:
    return Settings()
