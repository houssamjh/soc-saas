import uuid
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.playbook import (
    Playbook, PlaybookExecution,
    PlaybookCreate, PlaybookSchema, PlaybookExecutionSchema,
)
from app.services.executor import execute_playbook

router = APIRouter()
logger = logging.getLogger(__name__)


def to_schema(pb: Playbook) -> PlaybookSchema:
    return PlaybookSchema(
        id=pb.id, name=pb.name, description=pb.description or "",
        trigger=pb.trigger or {}, actions=pb.actions or [],
        is_active=pb.is_active, execution_count=pb.execution_count or 0,
        last_executed=pb.last_executed, created_at=pb.created_at, updated_at=pb.updated_at,
    )


@router.post("/playbooks", response_model=PlaybookSchema, status_code=201)
async def create_playbook(data: PlaybookCreate, db: AsyncSession = Depends(get_db)):
    pb = Playbook(
        id=str(uuid.uuid4()), name=data.name, description=data.description,
        trigger=data.trigger.model_dump(),
        actions=[a.model_dump() for a in data.actions],
        is_active=data.is_active, execution_count=0,
        created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    )
    db.add(pb)
    await db.flush()
    await db.refresh(pb)
    logger.info(f"Created playbook: {pb.name}")
    return to_schema(pb)


@router.get("/playbooks", response_model=List[PlaybookSchema])
async def list_playbooks(active_only: bool = Query(False), db: AsyncSession = Depends(get_db)):
    stmt = select(Playbook)
    if active_only:
        stmt = stmt.where(Playbook.is_active == True)
    stmt = stmt.order_by(Playbook.created_at.desc())
    result = await db.execute(stmt)
    return [to_schema(pb) for pb in result.scalars().all()]


@router.get("/playbooks/{playbook_id}", response_model=PlaybookSchema)
async def get_playbook(playbook_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    pb = result.scalar_one_or_none()
    if not pb:
        raise HTTPException(status_code=404, detail=f"Playbook {playbook_id} not found")
    return to_schema(pb)


@router.post("/playbooks/{playbook_id}/execute")
async def execute_manual(
    playbook_id: str,
    context: dict = {},
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    pb = result.scalar_one_or_none()
    if not pb:
        raise HTTPException(status_code=404, detail=f"Playbook {playbook_id} not found")
    if not pb.is_active:
        raise HTTPException(status_code=400, detail="Playbook is inactive")

    action_results = await execute_playbook(pb, context)

    execution = PlaybookExecution(
        id=str(uuid.uuid4()), playbook_id=pb.id, playbook_name=pb.name,
        trigger_source="manual", alert_id=context.get("alert", {}).get("id"),
        status="success", actions_executed=action_results,
        result={"manual": True, "actions": len(action_results)},
        executed_at=datetime.utcnow(),
    )
    db.add(execution)
    pb.execution_count = (pb.execution_count or 0) + 1
    pb.last_executed = datetime.utcnow()
    db.add(pb)
    await db.flush()

    return {"status": "executed", "playbook_id": playbook_id, "execution_id": execution.id,
            "actions_executed": len(action_results), "results": action_results}


@router.get("/playbooks/{playbook_id}/executions", response_model=List[PlaybookExecutionSchema])
async def get_executions(playbook_id: str, limit: int = Query(20, le=100), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlaybookExecution).where(PlaybookExecution.playbook_id == playbook_id)
        .order_by(PlaybookExecution.executed_at.desc()).limit(limit)
    )
    return [PlaybookExecutionSchema(id=e.id, playbook_id=e.playbook_id, playbook_name=e.playbook_name,
            trigger_source=e.trigger_source, alert_id=e.alert_id, status=e.status,
            actions_executed=e.actions_executed or [], result=e.result, executed_at=e.executed_at)
            for e in result.scalars().all()]


@router.put("/playbooks/{playbook_id}/toggle")
async def toggle_playbook(playbook_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    pb = result.scalar_one_or_none()
    if not pb:
        raise HTTPException(status_code=404, detail=f"Playbook {playbook_id} not found")
    pb.is_active = not pb.is_active
    pb.updated_at = datetime.utcnow()
    db.add(pb)
    return {"playbook_id": playbook_id, "is_active": pb.is_active}


@router.get("/executions", response_model=List[PlaybookExecutionSchema])
async def list_executions(limit: int = Query(50, le=200), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlaybookExecution).order_by(PlaybookExecution.executed_at.desc()).limit(limit)
    )
    return [PlaybookExecutionSchema(id=e.id, playbook_id=e.playbook_id, playbook_name=e.playbook_name,
            trigger_source=e.trigger_source, alert_id=e.alert_id, status=e.status,
            actions_executed=e.actions_executed or [], result=e.result, executed_at=e.executed_at)
            for e in result.scalars().all()]
