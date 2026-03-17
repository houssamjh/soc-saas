import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_indices, close_es
from app.routers import events, alerts, rules
from app.services import kafka_consumer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

kafka_consumer_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global kafka_consumer_task
    logger.info(f"Starting {settings.SERVICE_NAME}...")

    # Initialize Elasticsearch indices
    try:
        await init_indices()
        logger.info("Elasticsearch indices initialized")
    except Exception as e:
        logger.error(f"Failed to initialize indices: {e}")

    # Start Kafka consumer in background
    kafka_consumer_task = asyncio.create_task(
        kafka_consumer.run_kafka_consumer()
    )
    logger.info("Kafka consumer started in background")

    yield

    # Cleanup
    if kafka_consumer_task:
        kafka_consumer_task.cancel()
        try:
            await kafka_consumer_task
        except asyncio.CancelledError:
            pass

    await close_es()
    logger.info(f"{settings.SERVICE_NAME} shutdown complete")


app = FastAPI(
    title="SOC SIEM Service",
    description="Security Information and Event Management - Correlation Engine",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(events.router, prefix="/api/siem", tags=["events"])
app.include_router(alerts.router, prefix="/api/siem", tags=["alerts"])
app.include_router(rules.router, prefix="/api/siem", tags=["rules"])
# Also mount WebSocket at root level for nginx proxying
app.include_router(alerts.router, prefix="", tags=["websocket"], include_in_schema=False)


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.SERVICE_NAME}


@app.get("/metrics")
async def metrics():
    """Basic Prometheus-compatible metrics endpoint."""
    return {"service": settings.SERVICE_NAME, "status": "ok"}
