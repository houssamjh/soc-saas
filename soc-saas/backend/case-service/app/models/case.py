import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pydantic import BaseModel, Field
from app.core.database import Base


# ─── SQLAlchemy ORM Models ────────────────────────────────────────────────────

class Case(Base):
    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="open")
    assigned_to: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    alert_ids: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    tags: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())

    timeline_events: Mapped[List["TimelineEvent"]] = relationship(
        "TimelineEvent",
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="TimelineEvent.created_at",
    )


class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String(36), nullable=False)
    event: Mapped[str] = mapped_column(Text, nullable=False)
    author: Mapped[str] = mapped_column(String(200), nullable=False, default="system")
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, default="note")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    case: Mapped["Case"] = relationship("Case", back_populates="timeline_events")


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class TimelineEventSchema(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    case_id: str = ""
    event: str
    author: str = "system"
    event_type: str = "note"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True


class CaseCreate(BaseModel):
    title: str
    description: str = ""
    severity: str = "medium"  # low, medium, high, critical
    status: str = "open"  # open, in-progress, resolved, closed
    assigned_to: Optional[str] = None
    alert_ids: List[str] = []
    tags: List[str] = []


class CaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    alert_ids: Optional[List[str]] = None
    tags: Optional[List[str]] = None


class CaseSchema(BaseModel):
    id: str
    title: str
    description: Optional[str] = ""
    severity: str
    status: str
    assigned_to: Optional[str] = None
    alert_ids: List[str] = []
    tags: List[str] = []
    created_at: datetime
    updated_at: datetime
    timeline: List[TimelineEventSchema] = []

    class Config:
        from_attributes = True


class TimelineEventCreate(BaseModel):
    event: str
    author: str = "analyst"
    event_type: str = "note"  # note, assignment, status_change, alert_link


class AssignRequest(BaseModel):
    analyst: str


class CaseListResponse(BaseModel):
    cases: List[CaseSchema]
    total: int
    page: int
    page_size: int
