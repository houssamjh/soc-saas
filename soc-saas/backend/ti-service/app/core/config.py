from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    SERVICE_NAME: str = "ti-service"
    ELASTIC_HOST: str = "elasticsearch"
    ELASTIC_PORT: int = 9200
    REDIS_URL: str = "redis://redis:6379"
    JWT_SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    IOC_INDEX: str = "soc-ioc"

    @property
    def elastic_url(self) -> str:
        return f"http://{self.ELASTIC_HOST}:{self.ELASTIC_PORT}"

settings = Settings()
