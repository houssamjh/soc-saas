import logging
import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.case import (
    Case, TimelineEvent,
    CaseCreate, CaseUpdate, CaseSchema,
    TimelineEventCreate, TimelineEventSchema,
    AssignRequest, CaseListResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def case_to_schema(case: Case) -> CaseSchema:
    timeline = [
        TimelineEventSchema(
            id=te.id,
            case_id=te.case_id,
            event=te.event,
            author=te.author,
            event_type=te.event_type,
            created_at=te.created_at,
        )
        for te in (case.timeline_events or [])
    ]
    return CaseSchema(
        id=case.id,
        title=case.title,
        description=case.description or "",
        severity=case.severity,
        status=case.status,
        assigned_to=case.assigned_to,
        alert_ids=case.alert_ids or [],
        tags=case.tags or [],
        created_at=case.created_at,
        updated_at=case.updated_at,
        timeline=timeline,
    )


@router.post("", response_model=CaseSchema, status_code=201)
async def create_case(case_data: CaseCreate, db: AsyncSession = Depends(get_db)):
    """Create a new case."""
    valid_severities = ("low", "medium", "high", "critical")
    valid_statuses = ("open", "in-progress", "resolved", "closed")

    if case_data.severity not in valid_severities:
        raise HTTPException(status_code=400, detail=f"Invalid severity. Must be one of: {valid_severities}")
    if case_data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    case = Case(
        id=str(uuid.uuid4()),
        title=case_data.title,
        description=case_data.description,
        severity=case_data.severity,
        status=case_data.status,
        assigned_to=case_data.assigned_to,
        alert_ids=case_data.alert_ids,
        tags=case_data.tags,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(case)

    # Add initial timeline event
    timeline_event = TimelineEvent(
        id=str(uuid.uuid4()),
        case_id=case.id,
        event=f"Case created: {case.title}",
        author="system",
        event_type="status_change",
        created_at=datetime.utcnow(),
    )
    db.add(timeline_event)

    await db.flush()
    await db.refresh(case)

    result = await db.execute(
        select(Case).options(selectinload(Case.timeline_events)).where(Case.id == case.id)
    )
    case = result.scalar_one()
    logger.info(f"Created case {case.id}: {case.title}")
    return case_to_schema(case)


@router.get("", response_model=CaseListResponse)
async def list_cases(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List cases with pagination and filters."""
    stmt = select(Case).options(selectinload(Case.timeline_events))
    count_stmt = select(func.count(Case.id))

    if severity:
        stmt = stmt.where(Case.severity == severity)
        count_stmt = count_stmt.where(Case.severity == severity)
    if status:
        stmt = stmt.where(Case.status == status)
        count_stmt = count_stmt.where(Case.status == status)
    if assigned_to:
        stmt = stmt.where(Case.assigned_to == assigned_to)
        count_stmt = count_stmt.where(Case.assigned_to == assigned_to)
    if search:
        stmt = stmt.where(or_(
            Case.title.ilike(f"%{search}%"),
            Case.description.ilike(f"%{search}%"),
        ))
        count_stmt = count_stmt.where(or_(
            Case.title.ilike(f"%{search}%"),
            Case.description.ilike(f"%{search}%"),
        ))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = stmt.order_by(Case.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    cases = result.scalars().all()

    return CaseListResponse(
        cases=[case_to_schema(c) for c in cases],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{case_id}", response_model=CaseSchema)
async def get_case(case_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single case by ID."""
    result = await db.execute(
        select(Case).options(selectinload(Case.timeline_events)).where(Case.id == case_id)
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    return case_to_schema(case)


@router.put("/{case_id}", response_model=CaseSchema)
async def update_case(case_id: str, update: CaseUpdate, db: AsyncSession = Depends(get_db)):
    """Update a case."""
    result = await db.execute(
        select(Case).options(selectinload(Case.timeline_events)).where(Case.id == case_id)
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")

    update_data = update.model_dump(exclude_none=True)
    old_status = case.status

    for field, value in update_data.items():
        setattr(case, field, value)

    case.updated_at = datetime.utcnow()

    # Add timeline event if status changed
    if "status" in update_data and update_data["status"] != old_status:
        timeline_event = TimelineEvent(
            id=str(uuid.uuid4()),
            case_id=case.id,
            event=f"Status changed from {old_status} to {update_data['status']}",
            author="system",
            event_type="status_change",
            created_at=datetime.utcnow(),
        )
        db.add(timeline_event)

    await db.flush()

    result = await db.execute(
        select(Case).options(selectinload(Case.timeline_events)).where(Case.id == case_id)
    )
    case = result.scalar_one()
    return case_to_schema(case)


@router.delete("/{case_id}")
async def delete_case(case_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a case."""
    result = await db.execute(select(Case).where(Case.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    await db.delete(case)
    return {"status": "deleted", "case_id": case_id}


@router.post("/{case_id}/timeline", response_model=TimelineEventSchema)
async def add_timeline_event(
    case_id: str,
    event_data: TimelineEventCreate,
    db: AsyncSession = Depends(get_db),
):
    """Add a timeline event to a case."""
    result = await db.execute(select(Case).where(Case.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")

    event = TimelineEvent(
        id=str(uuid.uuid4()),
        case_id=case_id,
        event=event_data.event,
        author=event_data.author,
        event_type=event_data.event_type,
        created_at=datetime.utcnow(),
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)

    return TimelineEventSchema(
        id=event.id,
        case_id=event.case_id,
        event=event.event,
        author=event.author,
        event_type=event.event_type,
        created_at=event.created_at,
    )


@router.post("/{case_id}/assign", response_model=CaseSchema)
async def assign_case(
    case_id: str,
    assign: AssignRequest,
    db: AsyncSession = Depends(get_db),
):
    """Assign a case to an analyst."""
    result = await db.execute(
        select(Case).options(selectinload(Case.timeline_events)).where(Case.id == case_id)
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")

    old_assignee = case.assigned_to
    case.assigned_to = assign.analyst
    case.updated_at = datetime.utcnow()

    timeline_event = TimelineEvent(
        id=str(uuid.uuid4()),
        case_id=case.id,
        event=f"Case assigned to {assign.analyst}" + (f" (was: {old_assignee})" if old_assignee else ""),
        author="system",
        event_type="assignment",
        created_at=datetime.utcnow(),
    )
    db.add(timeline_event)

    await db.flush()

    result = await db.execute(
        select(Case).options(selectinload(Case.timeline_events)).where(Case.id == case_id)
    )
    case = result.scalar_one()
    return case_to_schema(case)
