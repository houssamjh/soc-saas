import io
import csv
import json
import uuid
import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from app.core.config import settings
from app.core.database import get_es
from app.models.ioc import IOC, IOCCreate, IOCListResponse, MITRETechnique

router = APIRouter()
logger = logging.getLogger(__name__)

MITRE_TECHNIQUES = [
    {"id": "T1059", "name": "Command and Scripting Interpreter", "tactic": "Execution", "description": "Adversaries may abuse command and script interpreters to execute commands, scripts, or binaries.", "url": "https://attack.mitre.org/techniques/T1059/"},
    {"id": "T1078", "name": "Valid Accounts", "tactic": "Defense Evasion", "description": "Adversaries may obtain and abuse credentials of existing accounts.", "url": "https://attack.mitre.org/techniques/T1078/"},
    {"id": "T1190", "name": "Exploit Public-Facing Application", "tactic": "Initial Access", "description": "Adversaries may attempt to exploit a weakness in an Internet-facing host.", "url": "https://attack.mitre.org/techniques/T1190/"},
    {"id": "T1021", "name": "Remote Services", "tactic": "Lateral Movement", "description": "Adversaries may use Valid Accounts to log into remote services.", "url": "https://attack.mitre.org/techniques/T1021/"},
    {"id": "T1110", "name": "Brute Force", "tactic": "Credential Access", "description": "Adversaries may use brute force techniques to gain access to accounts.", "url": "https://attack.mitre.org/techniques/T1110/"},
    {"id": "T1055", "name": "Process Injection", "tactic": "Defense Evasion", "description": "Adversaries may inject code into processes to evade defenses.", "url": "https://attack.mitre.org/techniques/T1055/"},
    {"id": "T1071", "name": "Application Layer Protocol", "tactic": "Command and Control", "description": "Adversaries may communicate using application layer protocols.", "url": "https://attack.mitre.org/techniques/T1071/"},
    {"id": "T1041", "name": "Exfiltration Over C2 Channel", "tactic": "Exfiltration", "description": "Adversaries may steal data by exfiltrating over an existing C2 channel.", "url": "https://attack.mitre.org/techniques/T1041/"},
    {"id": "T1003", "name": "OS Credential Dumping", "tactic": "Credential Access", "description": "Adversaries may attempt to dump credentials.", "url": "https://attack.mitre.org/techniques/T1003/"},
    {"id": "T1098", "name": "Account Manipulation", "tactic": "Persistence", "description": "Adversaries may manipulate accounts to maintain access.", "url": "https://attack.mitre.org/techniques/T1098/"},
    {"id": "T1566", "name": "Phishing", "tactic": "Initial Access", "description": "Adversaries may send phishing messages to gain access.", "url": "https://attack.mitre.org/techniques/T1566/"},
    {"id": "T1486", "name": "Data Encrypted for Impact", "tactic": "Impact", "description": "Adversaries may encrypt data to interrupt availability.", "url": "https://attack.mitre.org/techniques/T1486/"},
    {"id": "T1027", "name": "Obfuscated Files or Information", "tactic": "Defense Evasion", "description": "Adversaries may obfuscate files to hide artifacts.", "url": "https://attack.mitre.org/techniques/T1027/"},
    {"id": "T1082", "name": "System Information Discovery", "tactic": "Discovery", "description": "Adversaries may get detailed information about the operating system.", "url": "https://attack.mitre.org/techniques/T1082/"},
    {"id": "T1083", "name": "File and Directory Discovery", "tactic": "Discovery", "description": "Adversaries may enumerate files and directories.", "url": "https://attack.mitre.org/techniques/T1083/"},
    {"id": "T1087", "name": "Account Discovery", "tactic": "Discovery", "description": "Adversaries may attempt to get a listing of valid accounts.", "url": "https://attack.mitre.org/techniques/T1087/"},
    {"id": "T1057", "name": "Process Discovery", "tactic": "Discovery", "description": "Adversaries may get information about running processes.", "url": "https://attack.mitre.org/techniques/T1057/"},
    {"id": "T1016", "name": "System Network Configuration Discovery", "tactic": "Discovery", "description": "Adversaries may look for network configuration details.", "url": "https://attack.mitre.org/techniques/T1016/"},
    {"id": "T1049", "name": "System Network Connections Discovery", "tactic": "Discovery", "description": "Adversaries may get a listing of network connections.", "url": "https://attack.mitre.org/techniques/T1049/"},
    {"id": "T1140", "name": "Deobfuscate/Decode Files", "tactic": "Defense Evasion", "description": "Adversaries may deobfuscate or decode files.", "url": "https://attack.mitre.org/techniques/T1140/"},
]


@router.post("/ioc", response_model=IOC, status_code=201)
async def add_ioc(ioc_data: IOCCreate):
    """Add a new IOC."""
    es = await get_es()
    valid_types = ("ip", "domain", "hash", "url", "email")
    if ioc_data.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {valid_types}")

    # Check duplicate
    try:
        resp = await es.search(
            index=settings.IOC_INDEX,
            body={"query": {"bool": {"must": [
                {"term": {"type": ioc_data.type}},
                {"term": {"value": ioc_data.value}},
            ]}}},
            size=1,
        )
        if resp["hits"]["total"]["value"] > 0:
            hit = resp["hits"]["hits"][0]
            await es.update(
                index=settings.IOC_INDEX,
                id=hit["_id"],
                body={"doc": {"last_seen": datetime.utcnow().isoformat()}},
            )
            src = hit["_source"]
            for f in ("first_seen", "last_seen", "created_at"):
                if src.get(f) and isinstance(src[f], str):
                    src[f] = datetime.fromisoformat(src[f].replace("Z", "+00:00"))
            return IOC(**src)
    except Exception as e:
        logger.warning(f"Duplicate check failed: {e}")

    ioc = IOC(id=str(uuid.uuid4()), **ioc_data.model_dump())
    doc = ioc.model_dump()
    for f in ("first_seen", "last_seen", "created_at"):
        if doc.get(f):
            doc[f] = doc[f].isoformat()

    await es.index(index=settings.IOC_INDEX, id=ioc.id, document=doc)
    logger.info(f"Added IOC: {ioc.type}:{ioc.value}")
    return ioc


@router.get("/ioc/search", response_model=List[IOC])
async def search_ioc(value: str = Query(...)):
    """Search for an IOC by value."""
    es = await get_es()
    try:
        resp = await es.search(
            index=settings.IOC_INDEX,
            body={
                "query": {
                    "bool": {
                        "should": [
                            {"term": {"value": value}},
                            {"wildcard": {"value": f"*{value}*"}},
                        ],
                        "minimum_should_match": 1,
                    }
                },
                "size": 20,
            },
        )
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return []

    results = []
    for hit in resp["hits"]["hits"]:
        src = hit["_source"]
        try:
            for f in ("first_seen", "last_seen", "created_at"):
                if src.get(f) and isinstance(src[f], str):
                    src[f] = datetime.fromisoformat(src[f].replace("Z", "+00:00"))
            results.append(IOC(**src))
        except Exception as e:
            logger.warning(f"Failed to parse IOC: {e}")
    return results


@router.get("/feed", response_model=IOCListResponse)
async def list_iocs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ioc_type: Optional[str] = Query(None, alias="type"),
    severity: Optional[str] = Query(None),
):
    """List all IOCs."""
    es = await get_es()
    must = [{"term": {"is_active": True}}]
    if ioc_type:
        must.append({"term": {"type": ioc_type}})
    if severity:
        must.append({"term": {"severity": severity}})

    try:
        resp = await es.search(
            index=settings.IOC_INDEX,
            body={
                "query": {"bool": {"must": must}},
                "sort": [{"created_at": {"order": "desc"}}],
                "from": (page - 1) * page_size,
                "size": page_size,
            },
        )
    except Exception as e:
        logger.error(f"List failed: {e}")
        return IOCListResponse(iocs=[], total=0, page=page, page_size=page_size)

    iocs = []
    for hit in resp["hits"]["hits"]:
        src = hit["_source"]
        try:
            for f in ("first_seen", "last_seen", "created_at"):
                if src.get(f) and isinstance(src[f], str):
                    src[f] = datetime.fromisoformat(src[f].replace("Z", "+00:00"))
            iocs.append(IOC(**src))
        except Exception as e:
            logger.warning(f"Failed to parse: {e}")

    return IOCListResponse(
        iocs=iocs,
        total=resp["hits"]["total"]["value"],
        page=page,
        page_size=page_size,
    )


@router.post("/feed/import")
async def import_feed(file: UploadFile = File(...)):
    """Bulk import IOCs from JSON or CSV."""
    es = await get_es()
    content = await file.read()
    imported = 0
    errors = 0

    if file.filename and file.filename.endswith(".json"):
        try:
            data = json.loads(content)
            items = data if isinstance(data, list) else data.get("iocs", [])
            for item in items:
                try:
                    ioc = IOC(id=str(uuid.uuid4()), type=item.get("type","ip"),
                              value=item.get("value",""), severity=item.get("severity","medium"),
                              source=item.get("source","import"), description=item.get("description",""),
                              tags=item.get("tags",[]), score=float(item.get("score",50.0)))
                    doc = ioc.model_dump()
                    for f in ("first_seen","last_seen","created_at"):
                        if doc.get(f): doc[f] = doc[f].isoformat()
                    await es.index(index=settings.IOC_INDEX, id=ioc.id, document=doc)
                    imported += 1
                except Exception as e:
                    errors += 1
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")

    elif file.filename and file.filename.endswith(".csv"):
        text = content.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            try:
                ioc = IOC(id=str(uuid.uuid4()), type=row.get("type","ip"),
                          value=row.get("value", row.get("ioc","")),
                          severity=row.get("severity","medium"),
                          source=row.get("source","csv-import"),
                          description=row.get("description",""),
                          tags=[t.strip() for t in row.get("tags","").split(",") if t.strip()],
                          score=float(row.get("score",50.0)))
                doc = ioc.model_dump()
                for f in ("first_seen","last_seen","created_at"):
                    if doc.get(f): doc[f] = doc[f].isoformat()
                await es.index(index=settings.IOC_INDEX, id=ioc.id, document=doc)
                imported += 1
            except Exception as e:
                errors += 1
    else:
        raise HTTPException(status_code=400, detail="File must be .json or .csv")

    return {"status": "imported", "imported": imported, "errors": errors}


@router.get("/mitre", response_model=List[MITRETechnique])
async def get_mitre_techniques():
    """Return top 20 MITRE ATT&CK techniques."""
    return [MITRETechnique(**t) for t in MITRE_TECHNIQUES]
