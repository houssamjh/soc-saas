import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

class IOCCreate(BaseModel):
    type: str  # ip, domain, hash, url, email
    value: str
    severity: str = "medium"
    source: str = "manual"
    description: str = ""
    tags: List[str] = []
    score: float = 50.0

class IOC(IOCCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    is_active: bool = True
    first_seen: datetime = Field(default_factory=datetime.utcnow)
    last_seen: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class IOCListResponse(BaseModel):
    iocs: List[IOC]
    total: int
    page: int
    page_size: int

class MITRETechnique(BaseModel):
    id: str
    name: str
    tactic: str
    description: str
    url: str
    count: int = 0
