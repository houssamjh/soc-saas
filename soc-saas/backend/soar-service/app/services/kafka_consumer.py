import asyncio
import json
import logging
import uuid
from datetime import datetime
from aiokafka import AIOKafkaConsumer
from sqlalchemy import select
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.playbook import Playbook, PlaybookExecution
from app.services.executor import execute_playbook

logger = logging.getLogger(__name__)
SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}


def severity_matches(trigger_sev: str, alert_sev: str) -> bool:
    if trigger_sev == "any":
        return True
    return SEVERITY_ORDER.get(alert_sev, 0) >= SEVERITY_ORDER.get(trigger_sev, 0)


def type_matches(trigger_type: str, alert_event_type: str, alert_title: str) -> bool:
    if trigger_type == "any":
        return True
    return trigger_type.lower() in alert_event_type.lower() or trigger_type.lower() in alert_title.lower()


async def run_kafka_consumer():
    logger.info("SOAR Kafka consumer starting...")
    consumer = AIOKafkaConsumer(
        settings.KAFKA_ALERTS_TOPIC,
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        group_id=settings.KAFKA_CONSUMER_GROUP,
        value_deserializer=lambda m: json.loads(m.decode("utf-8")),
        auto_offset_reset="latest",
        enable_auto_commit=True,
    )

    for attempt in range(10):
        try:
            await consumer.start()
            logger.info("SOAR consumer connected to soc-alerts")
            break
        except Exception as e:
            if attempt == 9:
                logger.error(f"SOAR consumer failed after 10 attempts: {e}")
                return
            logger.warning(f"Kafka not ready ({attempt+1}/10): {e}")
            await asyncio.sleep(5)

    try:
        async for msg in consumer:
            try:
                alert = msg.value
                if not isinstance(alert, dict):
                    continue

                alert_sev = alert.get("severity", "low")
                alert_type = alert.get("event_type", "")
                alert_title = alert.get("title", "")

                async with AsyncSessionLocal() as db:
                    result = await db.execute(select(Playbook).where(Playbook.is_active == True))
                    playbooks = result.scalars().all()

                    for pb in playbooks:
                        trigger = pb.trigger or {}
                        if severity_matches(trigger.get("alert_severity","high"), alert_sev) and \
                           type_matches(trigger.get("alert_type","any"), alert_type, alert_title):

                            logger.info(f"Auto-triggering '{pb.name}' for: {alert_title}")
                            action_results = await execute_playbook(pb, {"alert": alert})

                            execution = PlaybookExecution(
                                id=str(uuid.uuid4()),
                                playbook_id=pb.id,
                                playbook_name=pb.name,
                                trigger_source="auto",
                                alert_id=alert.get("id"),
                                status="success",
                                actions_executed=action_results,
                                result={"alert": alert_title, "actions": len(action_results)},
                                executed_at=datetime.utcnow(),
                            )
                            db.add(execution)
                            pb.execution_count = (pb.execution_count or 0) + 1
                            pb.last_executed = datetime.utcnow()
                            db.add(pb)
                            await db.commit()

            except Exception as e:
                logger.error(f"SOAR consumer error: {e}", exc_info=True)
    except asyncio.CancelledError:
        logger.info("SOAR consumer cancelled")
    finally:
        await consumer.stop()
