import asyncio
import logging
from elasticsearch import AsyncElasticsearch
from app.core.config import settings

logger = logging.getLogger(__name__)

es_client: AsyncElasticsearch | None = None


async def get_es() -> AsyncElasticsearch:
    global es_client
    if es_client is None:
        es_client = AsyncElasticsearch(
            hosts=[settings.elastic_url],
            max_retries=3,
            retry_on_timeout=True,
            request_timeout=30,
        )
    return es_client


async def init_indices():
    """Create Elasticsearch indices with mappings on startup."""
    es = await get_es()

    alerts_mapping = {
        "mappings": {
            "properties": {
                "id": {"type": "keyword"},
                "title": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                "severity": {"type": "keyword"},
                "status": {"type": "keyword"},
                "source_ip": {"type": "ip"},
                "event_type": {"type": "keyword"},
                "raw_log": {"type": "text"},
                "rule_id": {"type": "keyword"},
                "rule_name": {"type": "text"},
                "mitre_technique": {"type": "keyword"},
                "host": {"type": "keyword"},
                "user": {"type": "keyword"},
                "tags": {"type": "keyword"},
                "created_at": {"type": "date"},
                "updated_at": {"type": "date"},
            }
        },
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
    }

    rules_mapping = {
        "mappings": {
            "properties": {
                "id": {"type": "keyword"},
                "name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                "description": {"type": "text"},
                "condition": {"type": "object"},
                "threshold": {"type": "integer"},
                "time_window": {"type": "integer"},
                "severity": {"type": "keyword"},
                "mitre_technique": {"type": "keyword"},
                "tags": {"type": "keyword"},
                "is_active": {"type": "boolean"},
                "created_at": {"type": "date"},
            }
        },
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
    }

    events_mapping = {
        "mappings": {
            "properties": {
                "id": {"type": "keyword"},
                "title": {"type": "text"},
                "source_ip": {"type": "ip"},
                "event_type": {"type": "keyword"},
                "severity": {"type": "keyword"},
                "raw_log": {"type": "text"},
                "mitre_technique": {"type": "keyword"},
                "host": {"type": "keyword"},
                "user": {"type": "keyword"},
                "timestamp": {"type": "date"},
                "ingested_at": {"type": "date"},
            }
        },
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
    }

    for index, mapping in [
        (settings.ALERTS_INDEX, alerts_mapping),
        (settings.RULES_INDEX, rules_mapping),
        (settings.EVENTS_INDEX, events_mapping),
    ]:
        try:
            exists = await es.indices.exists(index=index)
            if not exists:
                await es.indices.create(index=index, body=mapping)
                logger.info(f"Created index: {index}")
            else:
                logger.info(f"Index already exists: {index}")
        except Exception as e:
            logger.error(f"Failed to create index {index}: {e}")


async def close_es():
    global es_client
    if es_client:
        await es_client.close()
        es_client = None
