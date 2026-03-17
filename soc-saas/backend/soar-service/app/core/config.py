from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    SERVICE_NAME: str = "soar-service"
    DATABASE_URL: str = "postgresql+asyncpg://soc_admin:socpassword123@postgresql:5432/socdb"
    KAFKA_BOOTSTRAP_SERVERS: str = "kafka:9092"
    REDIS_URL: str = "redis://redis:6379"
    CASE_SERVICE_URL: str = "http://case-service:8002"
    JWT_SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    KAFKA_ALERTS_TOPIC: str = "soc-alerts"
    KAFKA_CONSUMER_GROUP: str = "soar-playbook-group"

settings = Settings()
