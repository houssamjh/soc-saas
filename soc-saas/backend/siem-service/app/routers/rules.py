import logging
from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException, Query
from app.core.config import settings
from app.core.database import get_es
from app.models.alert import Rule, RuleCreate
import uuid

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/rules", response_model=Rule)
async def create_rule(rule_data: RuleCreate):
    """Create a new correlation rule."""
    es = await get_es()

    rule = Rule(
        id=str(uuid.uuid4()),
        **rule_data.model_dump(),
        is_active=True,
        created_at=datetime.utcnow(),
    )

    doc = rule.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()

    await es.index(
        index=settings.RULES_INDEX,
        id=rule.id,
        document=doc,
    )

    logger.info(f"Created rule: {rule.name} [{rule.id}]")
    return rule


@router.get("/rules", response_model=List[Rule])
async def list_rules(
    active_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """List all correlation rules."""
    es = await get_es()

    query = {"term": {"is_active": True}} if active_only else {"match_all": {}}

    try:
        resp = await es.search(
            index=settings.RULES_INDEX,
            body={
                "query": query,
                "sort": [{"created_at": {"order": "desc"}}],
                "from": (page - 1) * page_size,
                "size": page_size,
            },
        )
    except Exception as e:
        logger.error(f"Failed to list rules: {e}")
        return []

    rules = []
    for hit in resp["hits"]["hits"]:
        src = hit["_source"]
        try:
            if src.get("created_at") and isinstance(src["created_at"], str):
                src["created_at"] = datetime.fromisoformat(src["created_at"].replace("Z", "+00:00"))
            rules.append(Rule(**src))
        except Exception as e:
            logger.warning(f"Failed to parse rule {hit['_id']}: {e}")

    return rules


@router.put("/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: str):
    """Toggle rule active/inactive status."""
    es = await get_es()
    try:
        resp = await es.get(index=settings.RULES_INDEX, id=rule_id)
        current = resp["_source"].get("is_active", True)
        await es.update(
            index=settings.RULES_INDEX,
            id=rule_id,
            body={"doc": {"is_active": not current}},
        )
        return {"rule_id": rule_id, "is_active": not current}
    except Exception:
        raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str):
    """Delete a correlation rule."""
    es = await get_es()
    try:
        await es.delete(index=settings.RULES_INDEX, id=rule_id)
        return {"status": "deleted", "rule_id": rule_id}
    except Exception:
        raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")
