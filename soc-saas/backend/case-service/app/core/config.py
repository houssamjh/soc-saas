from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SERVICE_NAME: str = "case-service"
    DATABASE_URL: str = "postgresql+asyncpg://soc_admin:socpassword123@postgresql:5432/socdb"
    REDIS_URL: str = "redis://redis:6379"
    JWT_SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"


settings = Settings()
