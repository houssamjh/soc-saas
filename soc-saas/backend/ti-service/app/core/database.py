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
    es = await get_es()
    ioc_mapping = {
        "mappings": {
            "properties": {
                "id": {"type": "keyword"},
                "type": {"type": "keyword"},
                "value": {"type": "keyword"},
                "severity": {"type": "keyword"},
                "source": {"type": "keyword"},
                "description": {"type": "text"},
                "tags": {"type": "keyword"},
                "score": {"type": "float"},
                "is_active": {"type": "boolean"},
                "first_seen": {"type": "date"},
                "last_seen": {"type": "date"},
                "created_at": {"type": "date"},
            }
        },
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
    }
    try:
        exists = await es.indices.exists(index=settings.IOC_INDEX)
        if not exists:
            await es.indices.create(index=settings.IOC_INDEX, body=ioc_mapping)
            logger.info(f"Created IOC index: {settings.IOC_INDEX}")
    except Exception as e:
        logger.error(f"Failed to create IOC index: {e}")

async def close_es():
    global es_client
    if es_client:
        await es_client.close()
        es_client = None
