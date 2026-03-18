#!/usr/bin/env python3
"""
SOC Test Agent — continuously generates realistic security events to populate the dashboard.
Usage:
  python3 test-agent.py                  # default: http://localhost (via nginx)
  python3 test-agent.py --host 192.168.38.145
  python3 test-agent.py --host 192.168.38.145 --rate 2   # 2 events/sec
  python3 test-agent.py --burst 50                        # send 50 events then stop
"""

import argparse
import json
import random
import time
import sys
from datetime import datetime, timezone
try:
    import urllib.request as urlreq
    import urllib.error
except ImportError:
    sys.exit("Python 3.6+ required")

# ── Realistic event templates ─────────────────────────────────────────────────

ATTACKER_IPS = [
    "185.220.101.47", "91.108.4.12", "194.165.16.77", "45.33.32.156",
    "198.235.24.130", "103.124.106.91", "78.128.113.11", "162.247.74.201",
    "23.129.64.208", "171.25.193.20", "46.166.139.111", "37.187.129.166",
]
INTERNAL_IPS = [
    "10.0.1.10", "10.0.1.22", "10.0.2.5", "10.0.3.8",
    "192.168.1.50", "192.168.1.100", "172.16.0.5",
]
USERNAMES = ["admin", "root", "jsmith", "mwilson", "dbadmin", "svc-backup", "webuser"]
HOSTNAMES = ["dc01.corp", "web01.corp", "db01.corp", "wkstn-042", "wkstn-107", "srv-app01"]
PROCESSES = ["cmd.exe", "powershell.exe", "psexec.exe", "mimikatz.exe", "nc.exe", "wscript.exe"]

EVENTS = [
    # (event_type, title_template, severity_weights, mitre)
    ("ssh_failed",
     "Failed SSH login from {src_ip}",
     ["low"] * 3 + ["medium"] * 3 + ["high"] * 2,
     "T1110"),
    ("ssh_failed",
     "Brute-force SSH attempt against {host}",
     ["medium"] * 3 + ["high"] * 4 + ["critical"] * 1,
     "T1110"),
    ("network_connection",
     "Suspicious outbound connection to {src_ip}:443",
     ["low"] * 2 + ["medium"] * 4 + ["high"] * 2,
     "T1071"),
    ("network_connection",
     "C2 beacon pattern detected from {host}",
     ["high"] * 3 + ["critical"] * 5,
     "T1071"),
    ("port_scan",
     "Port scan detected from {src_ip}",
     ["medium"] * 4 + ["high"] * 3,
     "T1046"),
    ("malware_detected",
     "Malware signature match on {host}",
     ["high"] * 3 + ["critical"] * 5,
     "T1204"),
    ("privilege_escalation",
     "Privilege escalation attempt by {user}",
     ["high"] * 2 + ["critical"] * 6,
     "T1078"),
    ("data_exfiltration",
     "Large data transfer to external IP {src_ip}",
     ["high"] * 4 + ["critical"] * 4,
     "T1048"),
    ("lateral_movement",
     "PsExec execution detected on {host}",
     ["high"] * 3 + ["critical"] * 5,
     "T1021"),
    ("dns_tunneling",
     "DNS tunneling suspected from {host}",
     ["medium"] * 2 + ["high"] * 4 + ["critical"] * 2,
     "T1071"),
    ("process_injection",
     "Process injection detected: {process} on {host}",
     ["high"] * 3 + ["critical"] * 5,
     "T1055"),
    ("credential_dump",
     "Credential dumping attempt by {user}",
     ["critical"] * 8,
     "T1003"),
    ("web_attack",
     "SQL injection attempt from {src_ip}",
     ["medium"] * 3 + ["high"] * 4,
     "T1190"),
    ("web_attack",
     "XSS/CSRF attack detected from {src_ip}",
     ["medium"] * 5 + ["high"] * 2,
     "T1190"),
    ("ransomware",
     "Ransomware-like file encryption on {host}",
     ["critical"] * 10,
     "T1486"),
    ("login_success",
     "Successful login from unusual location {src_ip}",
     ["low"] * 3 + ["medium"] * 4,
     "T1078"),
    ("file_access",
     "Sensitive file accessed by {user}",
     ["low"] * 2 + ["medium"] * 4 + ["high"] * 2,
     "T1083"),
    ("persistence",
     "New scheduled task created by {user}",
     ["medium"] * 3 + ["high"] * 4,
     "T1053"),
]

# ── HTTP helper ───────────────────────────────────────────────────────────────

def post_json(url, data):
    body = json.dumps(data).encode()
    req = urlreq.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlreq.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read())
        except Exception:
            detail = str(e)
        return e.code, detail
    except Exception as e:
        return 0, str(e)

def get_json(url):
    try:
        with urlreq.urlopen(url, timeout=5) as r:
            return r.status, json.loads(r.read())
    except Exception as e:
        return 0, str(e)

# ── Event generation ──────────────────────────────────────────────────────────

def make_event():
    tpl = random.choice(EVENTS)
    event_type, title_tpl, severities, mitre = tpl
    src_ip = random.choice(ATTACKER_IPS + INTERNAL_IPS)
    host    = random.choice(HOSTNAMES)
    user    = random.choice(USERNAMES)
    process = random.choice(PROCESSES)
    title   = title_tpl.format(src_ip=src_ip, host=host, user=user, process=process)
    severity = random.choice(severities)

    raw_log = (
        f'{datetime.now(timezone.utc).isoformat()} {host} kernel: '
        f'[{event_type}] src={src_ip} user={user} severity={severity}'
    )

    return {
        "title":           title,
        "source_ip":       src_ip,
        "event_type":      event_type,
        "severity":        severity,
        "raw_log":         raw_log,
        "mitre_technique": mitre,
        "host":            host,
        "user":            user,
        "timestamp":       datetime.now(timezone.utc).isoformat(),
        "extra_fields": {
            "process": process,
            "agent":   "soc-test-agent",
        },
    }

# ── Stats display ─────────────────────────────────────────────────────────────

def print_stats(sent, ok, failed, start_ts):
    elapsed = time.time() - start_ts
    rate = sent / elapsed if elapsed > 0 else 0
    print(
        f"\r  Sent: {sent:>5}  OK: {ok:>5}  Fail: {failed:>4}  "
        f"Rate: {rate:.1f}/s  Elapsed: {int(elapsed)}s   ",
        end="", flush=True
    )

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="SOC Test Agent")
    parser.add_argument("--host",  default="localhost",
                        help="VM hostname/IP (default: localhost)")
    parser.add_argument("--port",  default=80, type=int,
                        help="Nginx port (default: 80)")
    parser.add_argument("--rate",  default=1.0, type=float,
                        help="Events per second (default: 1.0)")
    parser.add_argument("--burst", default=0, type=int,
                        help="Send N events then exit (0 = run forever)")
    parser.add_argument("--direct", action="store_true",
                        help="Use direct service ports (8001) instead of nginx (80)")
    args = parser.parse_args()

    if args.direct:
        base_url = f"http://{args.host}:8001"
    else:
        base_url = f"http://{args.host}:{args.port}"

    event_url = f"{base_url}/api/siem/events"

    # Verify service is reachable
    print(f"\n  SOC Test Agent")
    print(f"  Target : {event_url}")
    print(f"  Rate   : {args.rate} event(s)/sec")
    print(f"  Burst  : {'∞ (Ctrl+C to stop)' if args.burst == 0 else args.burst}")
    print()

    code, data = get_json(f"{base_url}/api/siem/health" if not args.direct else f"{base_url}/health")
    if code == 200:
        print(f"  SIEM service: OK ({data.get('service', 'siem-service')})")
    else:
        print(f"  WARN: SIEM service returned {code}: {data}")
        print(f"  Continuing anyway...\n")

    print()
    interval = 1.0 / args.rate
    sent = ok = failed = 0
    start_ts = time.time()

    try:
        while True:
            event = make_event()
            code, resp = post_json(event_url, event)
            sent += 1
            if code in (200, 201):
                ok += 1
            else:
                failed += 1
                if failed <= 3:
                    print(f"\n  Error {code}: {resp}")

            print_stats(sent, ok, failed, start_ts)

            if args.burst > 0 and sent >= args.burst:
                break

            time.sleep(interval)

    except KeyboardInterrupt:
        pass

    print(f"\n\n  Done. {ok}/{sent} events accepted.\n")


if __name__ == "__main__":
    main()
