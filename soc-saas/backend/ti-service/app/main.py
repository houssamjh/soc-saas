import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_indices, close_es
from app.routers import ioc

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.SERVICE_NAME}...")
    try:
        await init_indices()
    except Exception as e:
        logger.error(f"ES init failed: {e}")
    yield
    await close_es()

app = FastAPI(title="SOC Threat Intelligence Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(ioc.router, prefix="/api/ti", tags=["threat-intelligence"])

@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.SERVICE_NAME}

@app.get("/metrics")
async def metrics():
    return {"service": settings.SERVICE_NAME, "status": "ok"}
