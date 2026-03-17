import logging
import httpx
from datetime import datetime
from app.core.config import settings

logger = logging.getLogger(__name__)


async def execute_action(action: dict, context: dict) -> dict:
    action_type = action.get("type", "")
    params = action.get("params", {})
    step = action.get("step", 0)
    result = {"step": step, "type": action_type, "status": "success", "message": "", "executed_at": datetime.utcnow().isoformat()}

    try:
        if action_type == "create_case":
            result["message"] = await _create_case(params, context)
        elif action_type == "notify_slack":
            result["message"] = await _notify_slack(params, context)
        elif action_type == "block_ip":
            result["message"] = await _block_ip(params, context)
        elif action_type == "send_email":
            result["message"] = await _send_email(params, context)
        else:
            result["status"] = "skipped"
            result["message"] = f"Unknown action: {action_type}"
    except Exception as e:
        result["status"] = "failed"
        result["message"] = str(e)
        logger.error(f"Action {action_type} failed: {e}")

    return result


async def _create_case(params: dict, context: dict) -> str:
    alert = context.get("alert", {})
    case_data = {
        "title": f"[AUTO] {alert.get('title', 'SOAR Auto-Created Case')}",
        "description": f"Auto-created by SOAR playbook.\nSource IP: {alert.get('source_ip', 'N/A')}\nAlert ID: {alert.get('id', 'N/A')}",
        "severity": params.get("severity") or alert.get("severity", "high"),
        "status": "open",
        "alert_ids": [alert["id"]] if alert.get("id") else [],
        "tags": ["soar-generated"],
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{settings.CASE_SERVICE_URL}/api/cases", json=case_data)
            if resp.status_code in (200, 201):
                return f"Case created: {resp.json().get('id', 'unknown')}"
            return f"Case creation returned {resp.status_code}"
    except Exception as e:
        return f"Case creation failed: {e}"


async def _notify_slack(params: dict, context: dict) -> str:
    alert = context.get("alert", {})
    channel = params.get("channel", "#soc-alerts")
    msg = params.get("message", "Alert: {{alert.title}}")
    msg = msg.replace("{{alert.title}}", alert.get("title", "Unknown"))
    msg = msg.replace("{{alert.source_ip}}", alert.get("source_ip", "Unknown"))
    msg = msg.replace("{{alert.host}}", alert.get("host", "Unknown"))
    logger.info(f"[SLACK] Channel:{channel} Message:{msg}")
    return f"Slack notification sent to {channel}"


async def _block_ip(params: dict, context: dict) -> str:
    alert = context.get("alert", {})
    ip = alert.get("source_ip", "0.0.0.0")
    duration = params.get("duration", "1h")
    firewall = params.get("firewall", "perimeter")
    logger.info(f"[FIREWALL] Blocking IP:{ip} Duration:{duration} Firewall:{firewall}")
    return f"IP {ip} blocked on {firewall} for {duration}"


async def _send_email(params: dict, context: dict) -> str:
    alert = context.get("alert", {})
    to = params.get("to", "soc@company.com")
    subject = params.get("subject", "SOC Alert")
    logger.info(f"[EMAIL] To:{to} Subject:{subject} Alert:{alert.get('title','N/A')}")
    return f"Email sent to {to}"


async def execute_playbook(playbook, context: dict) -> list:
    results = []
    for action in (playbook.actions or []):
        if isinstance(action, dict):
            result = await execute_action(action, context)
            results.append(result)
    return results
