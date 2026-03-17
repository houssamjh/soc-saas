import logging
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from aiokafka import AIOKafkaProducer
from app.core.config import settings
from app.core.database import get_es
from app.models.alert import EventIngest, Alert
from app.services.correlation import correlate_event_with_rules
from app.services.kafka_consumer import get_active_rules, save_alert, broadcast_alert_to_ws
import uuid

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/events", response_model=dict)
async def ingest_event(event: EventIngest):
    """
    Ingest a raw security event. Applies correlation rules immediately
    and optionally publishes to Kafka pipeline.
    """
    es = await get_es()

    event_doc = event.model_dump()
    event_doc["id"] = str(uuid.uuid4())
    event_doc["ingested_at"] = datetime.utcnow().isoformat()
    if event_doc.get("timestamp"):
        event_doc["timestamp"] = event_doc["timestamp"].isoformat() if hasattr(event_doc["timestamp"], "isoformat") else event_doc["timestamp"]

    # Store raw event
    try:
        await es.index(
            index=settings.EVENTS_INDEX,
            id=event_doc["id"],
            document=event_doc,
        )
    except Exception as e:
        logger.warning(f"Failed to store raw event: {e}")

    # Apply correlation rules
    rules = await get_active_rules(es)
    alert = correlate_event_with_rules(event_doc, rules)

    alert_id = None
    if alert:
        await save_alert(es, alert)
        await broadcast_alert_to_ws(alert)

        # Publish to Kafka
        try:
            producer = AIOKafkaProducer(
                bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            )
            await producer.start()
            alert_doc = alert.model_dump()
            alert_doc["created_at"] = alert_doc["created_at"].isoformat()
            alert_doc["updated_at"] = alert_doc["updated_at"].isoformat()
            await producer.send(
                settings.KAFKA_ALERTS_TOPIC,
                value=json.dumps(alert_doc).encode(),
            )
            await producer.stop()
        except Exception as e:
            logger.warning(f"Failed to publish alert to Kafka: {e}")

        alert_id = alert.id

    return {
        "status": "ingested",
        "event_id": event_doc["id"],
        "alert_generated": alert is not None,
        "alert_id": alert_id,
    }
