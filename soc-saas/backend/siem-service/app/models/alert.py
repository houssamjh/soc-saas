from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
import uuid


class AlertCondition(BaseModel):
    field: str
    operator: str  # equals, contains, greater_than, less_than, regex
    value: str


class RuleCreate(BaseModel):
    name: str
    description: str = ""
    condition: AlertCondition
    threshold: int = 1
    time_window: int = 300  # seconds
    severity: str = "medium"  # low, medium, high, critical
    mitre_technique: str = ""
    tags: List[str] = []


class Rule(RuleCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    hit_count: int = 0


class EventIngest(BaseModel):
    title: str
    source_ip: str = "0.0.0.0"
    event_type: str = "unknown"
    severity: str = "low"
    raw_log: str = ""
    mitre_technique: str = ""
    host: str = ""
    user: str = ""
    timestamp: Optional[datetime] = None
    extra_fields: dict = {}


class Alert(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    severity: str  # low, medium, high, critical
    status: str = "open"  # open, investigating, closed
    source_ip: str = "0.0.0.0"
    event_type: str = "unknown"
    raw_log: str = ""
    rule_id: Optional[str] = None
    rule_name: Optional[str] = None
    mitre_technique: str = ""
    host: str = ""
    user: str = ""
    tags: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AlertStatusUpdate(BaseModel):
    status: str  # open, investigating, closed
    note: Optional[str] = None


class AlertListResponse(BaseModel):
    alerts: List[Alert]
    total: int
    page: int
    page_size: int
