import asyncio
import json
import logging
from datetime import datetime
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from app.core.config import settings
from app.core.database import get_es
from app.models.alert import Alert, Rule, AlertCondition
from app.services.correlation import correlate_event_with_rules

logger = logging.getLogger(__name__)

# Global set of active WebSocket connections
ws_connections: set = set()


async def get_active_rules(es) -> list[Rule]:
    """Fetch all active correlation rules from Elasticsearch."""
    try:
        resp = await es.search(
            index=settings.RULES_INDEX,
            body={
                "query": {"term": {"is_active": True}},
                "size": 1000,
            },
        )
        rules = []
        for hit in resp["hits"]["hits"]:
            src = hit["_source"]
            try:
                condition_data = src.get("condition", {})
                rule = Rule(
                    id=src.get("id", hit["_id"]),
                    name=src["name"],
                    description=src.get("description", ""),
                    condition=AlertCondition(**condition_data),
                    threshold=src.get("threshold", 1),
                    time_window=src.get("time_window", 300),
                    severity=src.get("severity", "medium"),
                    mitre_technique=src.get("mitre_technique", ""),
                    tags=src.get("tags", []),
                    is_active=src.get("is_active", True),
                )
                rules.append(rule)
            except Exception as e:
                logger.warning(f"Failed to parse rule {hit['_id']}: {e}")
        return rules
    except Exception as e:
        logger.error(f"Failed to fetch rules: {e}")
        return []


async def save_alert(es, alert: Alert):
    """Save an alert to Elasticsearch."""
    doc = alert.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()

    await es.index(
        index=settings.ALERTS_INDEX,
        id=alert.id,
        document=doc,
    )
    logger.info(f"Saved alert {alert.id}: {alert.title} [{alert.severity}]")
    return alert


async def publish_alert_to_kafka(producer: AIOKafkaProducer, alert: Alert):
    """Publish alert to Kafka soc-alerts topic."""
    doc = alert.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    await producer.send(
        settings.KAFKA_ALERTS_TOPIC,
        value=json.dumps(doc).encode(),
    )


async def broadcast_alert_to_ws(alert: Alert):
    """Broadcast alert to all connected WebSocket clients."""
    if not ws_connections:
        return

    doc = alert.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    message = json.dumps({"type": "new_alert", "data": doc})

    dead_connections = set()
    for ws in ws_connections.copy():
        try:
            await ws.send_text(message)
        except Exception:
            dead_connections.add(ws)

    ws_connections.difference_update(dead_connections)


async def run_kafka_consumer():
    """Main Kafka consumer loop: read raw-events, correlate, produce alerts."""
    logger.info("Starting Kafka consumer for raw-events...")

    consumer = AIOKafkaConsumer(
        settings.KAFKA_RAW_EVENTS_TOPIC,
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        group_id=settings.KAFKA_CONSUMER_GROUP,
        value_deserializer=lambda m: json.loads(m.decode("utf-8")),
        auto_offset_reset="latest",
        enable_auto_commit=True,
    )

    producer = AIOKafkaProducer(
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: v if isinstance(v, bytes) else v,
    )

    max_retries = 10
    retry_delay = 5

    for attempt in range(max_retries):
        try:
            await consumer.start()
            await producer.start()
            logger.info("Kafka consumer connected to raw-events topic")
            break
        except Exception as e:
            if attempt == max_retries - 1:
                logger.error(f"Failed to connect to Kafka after {max_retries} attempts: {e}")
                return
            logger.warning(f"Kafka not ready (attempt {attempt + 1}/{max_retries}): {e}")
            await asyncio.sleep(retry_delay)

    try:
        es = await get_es()
        async for msg in consumer:
            try:
                event = msg.value
                if not isinstance(event, dict):
                    continue

                rules = await get_active_rules(es)
                alert = correlate_event_with_rules(event, rules)

                if alert:
                    await save_alert(es, alert)
                    await publish_alert_to_kafka(producer, alert)
                    await broadcast_alert_to_ws(alert)
                    logger.info(f"Alert generated: {alert.title} [{alert.severity}]")

            except Exception as e:
                logger.error(f"Error processing event: {e}", exc_info=True)

    except asyncio.CancelledError:
        logger.info("Kafka consumer cancelled")
    finally:
        await consumer.stop()
        await producer.stop()
        logger.info("Kafka consumer stopped")
