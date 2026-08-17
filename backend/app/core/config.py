from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://stride:stride@localhost:5432/stride"
    # Dedicated DB for pytest — kept separate from the dev DB above so manual
    # writes against a live uvicorn (which uses database_url) can never
    # collide with test fixtures/rollback.
    test_database_url: str = "postgresql+psycopg://stride:stride@localhost:5432/stride_test"


settings = Settings()
