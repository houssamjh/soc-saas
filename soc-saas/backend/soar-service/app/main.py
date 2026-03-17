import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_db
from app.routers import playbooks
from app.services import kafka_consumer

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)
kafka_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global kafka_task
    logger.info(f"Starting {settings.SERVICE_NAME}...")
    try:
        await init_db()
    except Exception as e:
        logger.error(f"DB init failed: {e}")
    kafka_task = asyncio.create_task(kafka_consumer.run_kafka_consumer())
    yield
    if kafka_task:
        kafka_task.cancel()
        try:
            await kafka_task
        except asyncio.CancelledError:
            pass

app = FastAPI(title="SOC SOAR Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(playbooks.router, prefix="/api/soar", tags=["soar"])

@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.SERVICE_NAME}

@app.get("/metrics")
async def metrics():
    return {"service": settings.SERVICE_NAME, "status": "ok"}
