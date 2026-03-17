from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SERVICE_NAME: str = "siem-service"
    ELASTIC_HOST: str = "elasticsearch"
    ELASTIC_PORT: int = 9200
    KAFKA_BOOTSTRAP_SERVERS: str = "kafka:9092"
    REDIS_URL: str = "redis://redis:6379"
    JWT_SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"

    ALERTS_INDEX: str = "soc-alerts"
    RULES_INDEX: str = "soc-rules"
    EVENTS_INDEX: str = "soc-raw-events"

    KAFKA_RAW_EVENTS_TOPIC: str = "raw-events"
    KAFKA_ALERTS_TOPIC: str = "soc-alerts"
    KAFKA_CONSUMER_GROUP: str = "siem-correlation-group"

    @property
    def elastic_url(self) -> str:
        return f"http://{self.ELASTIC_HOST}:{self.ELASTIC_PORT}"


settings = Settings()
