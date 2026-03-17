import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from app.core.config import settings
from app.core.database import get_es
from app.models.alert import Alert, AlertStatusUpdate, AlertListResponse
from app.services.kafka_consumer import ws_connections

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/alerts", response_model=AlertListResponse)
async def list_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """List alerts with pagination and filters."""
    es = await get_es()

    must_clauses = []

    if severity:
        must_clauses.append({"term": {"severity": severity}})
    if status:
        must_clauses.append({"term": {"status": status}})
    if event_type:
        must_clauses.append({"term": {"event_type": event_type}})
    if search:
        must_clauses.append({
            "multi_match": {
                "query": search,
                "fields": ["title", "raw_log", "source_ip", "host"],
            }
        })

    query = {"bool": {"must": must_clauses}} if must_clauses else {"match_all": {}}

    try:
        resp = await es.search(
            index=settings.ALERTS_INDEX,
            body={
                "query": query,
                "sort": [{"created_at": {"order": "desc"}}],
                "from": (page - 1) * page_size,
                "size": page_size,
            },
        )
    except Exception as e:
        logger.error(f"Elasticsearch query failed: {e}")
        return AlertListResponse(alerts=[], total=0, page=page, page_size=page_size)

    alerts = []
    for hit in resp["hits"]["hits"]:
        src = hit["_source"]
        try:
            # Parse datetime fields
            for dt_field in ("created_at", "updated_at"):
                if src.get(dt_field) and isinstance(src[dt_field], str):
                    src[dt_field] = datetime.fromisoformat(src[dt_field].replace("Z", "+00:00"))
            alerts.append(Alert(**src))
        except Exception as e:
            logger.warning(f"Failed to parse alert {hit['_id']}: {e}")

    total = resp["hits"]["total"]["value"]

    return AlertListResponse(
        alerts=alerts,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/alerts/{alert_id}", response_model=Alert)
async def get_alert(alert_id: str):
    """Get a single alert by ID."""
    es = await get_es()

    try:
        resp = await es.get(index=settings.ALERTS_INDEX, id=alert_id)
        src = resp["_source"]
        for dt_field in ("created_at", "updated_at"):
            if src.get(dt_field) and isinstance(src[dt_field], str):
                src[dt_field] = datetime.fromisoformat(src[dt_field].replace("Z", "+00:00"))
        return Alert(**src)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")


@router.put("/alerts/{alert_id}/status")
async def update_alert_status(alert_id: str, update: AlertStatusUpdate):
    """Update alert status."""
    valid_statuses = ("open", "investigating", "closed")
    if update.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {valid_statuses}",
        )

    es = await get_es()

    try:
        await es.update(
            index=settings.ALERTS_INDEX,
            id=alert_id,
            body={
                "doc": {
                    "status": update.status,
                    "updated_at": datetime.utcnow().isoformat(),
                    **({"note": update.note} if update.note else {}),
                }
            },
        )
        return {"status": "updated", "alert_id": alert_id, "new_status": update.status}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")


@router.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """WebSocket endpoint for real-time alert streaming."""
    await websocket.accept()
    ws_connections.add(websocket)
    logger.info(f"WebSocket client connected. Total connections: {len(ws_connections)}")

    try:
        # Send a welcome message with recent alerts
        es = await get_es()
        try:
            recent = await es.search(
                index=settings.ALERTS_INDEX,
                body={
                    "query": {"match_all": {}},
                    "sort": [{"created_at": {"order": "desc"}}],
                    "size": 10,
                },
            )
            recent_alerts = []
            for hit in recent["hits"]["hits"]:
                src = hit["_source"]
                for dt_field in ("created_at", "updated_at"):
                    if src.get(dt_field) and isinstance(src[dt_field], str):
                        src[dt_field] = src[dt_field]
                recent_alerts.append(src)

            import json
            await websocket.send_text(json.dumps({
                "type": "recent_alerts",
                "data": recent_alerts,
            }))
        except Exception as e:
            logger.warning(f"Failed to send recent alerts to WebSocket: {e}")

        # Keep connection alive
        while True:
            try:
                data = await websocket.receive_text()
                # Handle ping/pong
                if data == "ping":
                    await websocket.send_text("pong")
            except WebSocketDisconnect:
                break

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        ws_connections.discard(websocket)
        logger.info(f"WebSocket client removed. Total connections: {len(ws_connections)}")
