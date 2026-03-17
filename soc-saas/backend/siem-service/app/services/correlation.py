import logging
import re
from typing import Optional
from app.models.alert import Alert, Rule, EventIngest

logger = logging.getLogger(__name__)


def evaluate_condition(event: dict, condition: dict) -> bool:
    """Evaluate a single condition against an event."""
    field = condition.get("field", "")
    operator = condition.get("operator", "equals")
    value = str(condition.get("value", ""))

    event_value = str(event.get(field, ""))

    if operator == "equals":
        return event_value.lower() == value.lower()
    elif operator == "contains":
        return value.lower() in event_value.lower()
    elif operator == "greater_than":
        try:
            return float(event_value) > float(value)
        except (ValueError, TypeError):
            return False
    elif operator == "less_than":
        try:
            return float(event_value) < float(value)
        except (ValueError, TypeError):
            return False
    elif operator == "regex":
        try:
            return bool(re.search(value, event_value, re.IGNORECASE))
        except re.error:
            return False
    elif operator == "not_equals":
        return event_value.lower() != value.lower()
    elif operator == "starts_with":
        return event_value.lower().startswith(value.lower())
    elif operator == "ends_with":
        return event_value.lower().endswith(value.lower())
    return False


def correlate_event_with_rules(event: dict, rules: list[Rule]) -> Optional[Alert]:
    """
    Apply correlation rules to an event.
    Returns an Alert if any rule matches, else None.
    """
    event_dict = {
        "event_type": event.get("event_type", ""),
        "severity": event.get("severity", "low"),
        "source_ip": event.get("source_ip", ""),
        "title": event.get("title", ""),
        "raw_log": event.get("raw_log", ""),
        "host": event.get("host", ""),
        "user": event.get("user", ""),
        "process_name": event.get("process_name", ""),
        "bytes_out": event.get("bytes_out", "0"),
        "message": event.get("raw_log", ""),
    }

    matched_rule = None
    for rule in rules:
        if not rule.is_active:
            continue
        try:
            if evaluate_condition(event_dict, rule.condition.model_dump()):
                matched_rule = rule
                break
        except Exception as e:
            logger.warning(f"Rule evaluation error for rule {rule.id}: {e}")
            continue

    if matched_rule:
        alert = Alert(
            title=event.get("title") or f"Alert: {matched_rule.name}",
            severity=matched_rule.severity,
            status="open",
            source_ip=event.get("source_ip", "0.0.0.0"),
            event_type=event.get("event_type", "unknown"),
            raw_log=event.get("raw_log", ""),
            rule_id=matched_rule.id,
            rule_name=matched_rule.name,
            mitre_technique=matched_rule.mitre_technique or event.get("mitre_technique", ""),
            host=event.get("host", ""),
            user=event.get("user", ""),
            tags=matched_rule.tags,
        )
        return alert

    # If no rule matches but event has a severity, create a raw alert
    if event.get("severity") in ("high", "critical"):
        alert = Alert(
            title=event.get("title", "Unmatched Security Event"),
            severity=event.get("severity", "medium"),
            status="open",
            source_ip=event.get("source_ip", "0.0.0.0"),
            event_type=event.get("event_type", "unknown"),
            raw_log=event.get("raw_log", ""),
            mitre_technique=event.get("mitre_technique", ""),
            host=event.get("host", ""),
            user=event.get("user", ""),
        )
        return alert

    return None
