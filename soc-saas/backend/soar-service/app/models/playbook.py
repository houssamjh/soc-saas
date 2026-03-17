import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, JSON, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column
from pydantic import BaseModel, Field
from app.core.database import Base


class Playbook(Base):
    __tablename__ = "playbooks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trigger: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    actions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    execution_count: Mapped[int] = mapped_column(default=0)
    last_executed: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())


class PlaybookExecution(Base):
    __tablename__ = "playbook_executions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    playbook_id: Mapped[str] = mapped_column(String(36), nullable=False)
    playbook_name: Mapped[str] = mapped_column(String(500), nullable=False)
    trigger_source: Mapped[str] = mapped_column(String(100), nullable=False, default="manual")
    alert_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="success")
    actions_executed: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    executed_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class PlaybookTrigger(BaseModel):
    alert_severity: str = "high"
    alert_type: str = "any"

class PlaybookAction(BaseModel):
    step: int
    type: str
    params: dict = {}

class PlaybookCreate(BaseModel):
    name: str
    description: str = ""
    trigger: PlaybookTrigger
    actions: List[PlaybookAction]
    is_active: bool = True

class PlaybookSchema(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    trigger: dict
    actions: List[dict]
    is_active: bool
    execution_count: int
    last_executed: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

class PlaybookExecutionSchema(BaseModel):
    id: str
    playbook_id: str
    playbook_name: str
    trigger_source: str
    alert_id: Optional[str] = None
    status: str
    actions_executed: List[dict]
    result: Optional[dict] = None
    executed_at: datetime
    class Config:
        from_attributes = True
