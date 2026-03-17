#!/usr/bin/env bash
set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────────────
SIEM_URL="${SIEM_URL:-http://localhost:8001}"
CASE_URL="${CASE_URL:-http://localhost:8002}"
TI_URL="${TI_URL:-http://localhost:8003}"
SOAR_URL="${SOAR_URL:-http://localhost:8004}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()    { echo -e "${GREEN}[SEED] $*${NC}"; }
info()   { echo -e "${CYAN}[SEED] $*${NC}"; }

# Wait for a service to be ready
wait_ready() {
  local url="$1"
  local name="$2"
  local attempts=0
  echo -n "  Waiting for $name..."
  while ! curl -sf "$url/health" > /dev/null 2>&1; do
    sleep 3
    ((attempts++))
    if [[ $attempts -gt 40 ]]; then
      echo " TIMEOUT"
      return 1
    fi
    echo -n "."
  done
  echo -e " ${GREEN}ready${NC}"
}

wait_ready "$SIEM_URL" "SIEM Service"
wait_ready "$CASE_URL" "Case Service"
wait_ready "$TI_URL"   "TI Service"
wait_ready "$SOAR_URL" "SOAR Service"

# ─── Helper: POST with error checking ──────────────────────────────────────
post() {
  local url="$1"
  local data="$2"
  local resp
  resp=$(curl -sf -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$data" 2>&1) || {
    echo "  WARN: Failed POST to $url" >&2
    return 0
  }
  echo "$resp"
}

# ─── 1. Inject SIEM Correlation Rules ────────────────────────────────────
info "Creating correlation rules..."

post "$SIEM_URL/api/siem/rules" '{
  "name": "Brute Force SSH Detection",
  "description": "Detects multiple failed SSH login attempts",
  "condition": {"field": "event_type", "operator": "equals", "value": "ssh_failed"},
  "threshold": 5,
  "time_window": 300,
  "severity": "high",
  "mitre_technique": "T1110",
  "tags": ["brute-force", "authentication", "ssh"]
}' > /dev/null

post "$SIEM_URL/api/siem/rules" '{
  "name": "Lateral Movement via PsExec",
  "description": "Detects PsExec usage for lateral movement",
  "condition": {"field": "process_name", "operator": "contains", "value": "psexec"},
  "threshold": 1,
  "time_window": 60,
  "severity": "critical",
  "mitre_technique": "T1021",
  "tags": ["lateral-movement", "execution", "windows"]
}' > /dev/null

post "$SIEM_URL/api/siem/rules" '{
  "name": "C2 Beacon Pattern",
  "description": "Detects periodic beacon-like network connections",
  "condition": {"field": "event_type", "operator": "equals", "value": "network_connection"},
  "threshold": 10,
  "time_window": 600,
  "severity": "critical",
  "mitre_technique": "T1071",
  "tags": ["c2", "command-and-control", "network"]
}' > /dev/null

post "$SIEM_URL/api/siem/rules" '{
  "name": "Privilege Escalation Detected",
  "description": "Detects privilege escalation attempts",
  "condition": {"field": "event_type", "operator": "equals", "value": "privilege_escalation"},
  "threshold": 1,
  "time_window": 60,
  "severity": "critical",
  "mitre_technique": "T1078",
  "tags": ["privilege-escalation", "credential-access"]
}' > /dev/null

post "$SIEM_URL/api/siem/rules" '{
  "name": "Data Exfiltration Over HTTP",
  "description": "Large data transfer to external IP via HTTP",
  "condition": {"field": "bytes_out", "operator": "greater_than", "value": "10485760"},
  "threshold": 1,
  "time_window": 300,
  "severity": "high",
  "mitre_technique": "T1041",
  "tags": ["exfiltration", "network", "data-loss"]
}' > /dev/null

log "Created 5 correlation rules"

# ─── 2. Inject 50 SIEM Events (which generate alerts) ────────────────────
info "Injecting 50 SIEM events..."

SEVERITIES=("critical" "critical" "high" "high" "high" "medium" "medium" "medium" "medium" "low")
MITRE_TECHNIQUES=("T1059" "T1078" "T1190" "T1021" "T1110" "T1055" "T1071" "T1041" "T1003" "T1098" "T1566" "T1486" "T1027" "T1140" "T1083" "T1087" "T1057" "T1082" "T1016" "T1049")

ALERT_TITLES=(
  "Brute force detected on SSH"
  "Lateral movement via PsExec"
  "C2 beacon detected to known malicious IP"
  "Privilege escalation via sudo abuse"
  "PowerShell encoded command execution"
  "Suspicious registry modification"
  "Credential dumping via LSASS access"
  "DNS tunneling detected"
  "Ransomware file extension pattern"
  "Unauthorized service installation"
  "Pass-the-hash attack detected"
  "Kerberoasting activity"
  "Golden ticket attack attempt"
  "Suspicious WMI execution"
  "Living off the land binary abuse"
  "Unusual outbound traffic to TOR exit node"
  "Web shell uploaded to server"
  "Log tampering detected"
  "Anomalous admin account creation"
  "Data staged for exfiltration"
  "Network scan from internal host"
  "Malicious macro execution in Office document"
  "Suspicious scheduled task creation"
  "DLL hijacking attempt"
  "Remote access tool installed"
  "Exploit code executed CVE-2024-1234"
  "Successful exploit of CVE-2023-44487"
  "Active Directory replication abuse"
  "NTLM relay attack in progress"
  "Certificate theft detected"
  "Fileless malware execution"
  "Memory injection into explorer.exe"
  "Suspicious parent-child process"
  "UAC bypass attempt"
  "Security tool disabled"
  "Backup deletion command executed"
  "Shadow copy deletion detected"
  "Persistence via startup folder"
  "New admin user created outside policy"
  "VPN access from sanctioned country"
  "Multiple failed MFA attempts"
  "Suspicious email attachment opened"
  "Outbound connection to Cobalt Strike server"
  "Internal host scanning port 445"
  "Exploit kit traffic detected"
  "Cryptomining process detected"
  "Anomalous AWS API calls"
  "Docker escape attempt detected"
  "Kubernetes privilege escalation"
  "Supply chain package tampering"
)

SOURCE_IPS=(
  "10.0.1.45" "192.168.100.23" "172.16.50.12" "10.0.2.78" "192.168.1.199"
  "10.10.10.5" "172.31.0.44" "192.168.0.100" "10.1.1.88" "172.16.200.5"
  "185.220.101.45" "91.108.56.23" "194.165.16.78" "45.142.212.100" "89.248.167.131"
  "10.0.0.254" "192.168.50.3" "172.16.1.77" "10.5.5.5" "192.168.99.1"
)

EVENT_TYPES=("ssh_failed" "process_execution" "network_connection" "file_access" "registry_modification" "privilege_escalation" "dns_query" "authentication")

for i in $(seq 0 49); do
  TITLE="${ALERT_TITLES[$((i % ${#ALERT_TITLES[@]}))]}"
  SEV="${SEVERITIES[$((RANDOM % ${#SEVERITIES[@]}))]}"
  SRC_IP="${SOURCE_IPS[$((RANDOM % ${#SOURCE_IPS[@]}))]}"
  EVT_TYPE="${EVENT_TYPES[$((RANDOM % ${#EVENT_TYPES[@]}))]}"
  MITRE="${MITRE_TECHNIQUES[$((i % ${#MITRE_TECHNIQUES[@]}))]}"
  TS=$(date -u -d "-$((RANDOM % 86400)) seconds" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-$((RANDOM % 86400))S +%Y-%m-%dT%H:%M:%SZ)

  post "$SIEM_URL/api/siem/events" "{
    \"title\": \"$TITLE\",
    \"source_ip\": \"$SRC_IP\",
    \"event_type\": \"$EVT_TYPE\",
    \"severity\": \"$SEV\",
    \"raw_log\": \"$(date): [$SEV] $TITLE from $SRC_IP via $EVT_TYPE\",
    \"mitre_technique\": \"$MITRE\",
    \"host\": \"prod-server-$((RANDOM % 20 + 1))\",
    \"user\": \"user$((RANDOM % 50))\",
    \"timestamp\": \"$TS\"
  }" > /dev/null
done

log "Injected 50 SIEM events"

# ─── 3. Create 10 Cases ──────────────────────────────────────────────────
info "Creating 10 cases..."

CASE_STATUSES=("open" "in-progress" "in-progress" "resolved" "open" "in-progress" "closed" "open" "resolved" "in-progress")
CASE_SEVERITIES=("critical" "high" "critical" "medium" "high" "medium" "low" "critical" "high" "medium")
ANALYSTS=("alice.chen" "bob.martinez" "carol.johnson" "dave.wilson" "" "alice.chen" "bob.martinez" "" "carol.johnson" "dave.wilson")

CASE_DATA=(
  '{"title":"Active Ransomware Incident - Finance Division","description":"Ransomware activity detected on multiple endpoints in the Finance division. Shadow copies deleted, files encrypted with .locked extension. Containment in progress.","severity":"critical"}'
  '{"title":"APT Group Lateral Movement Investigation","description":"Suspected APT group moving laterally through the network using stolen credentials. Multiple systems compromised. MITRE ATT&CK techniques T1078 and T1021 observed.","severity":"high"}'
  '{"title":"Data Exfiltration via HTTPS - Customer PII","description":"Large volume of customer PII data detected being exfiltrated to external IP 185.220.101.45. Estimated 2.3GB transferred before detection.","severity":"critical"}'
  '{"title":"Phishing Campaign - HR Department","description":"Targeted spear-phishing campaign against HR department. 3 users clicked malicious link. Credentials potentially compromised.","severity":"medium"}'
  '{"title":"Insider Threat - Unusual Data Access","description":"Former employee account still active accessing sensitive financial records after termination date. Account has been disabled pending investigation.","severity":"high"}'
  '{"title":"Web Application SQL Injection Attack","description":"Automated SQL injection attack detected against customer portal. WAF logs show 10,000+ attempts. Database access not confirmed.","severity":"medium"}'
  '{"title":"Cryptomining Malware on Dev Server","description":"Cryptomining software detected on development server dev-03. CPU usage spiked to 100%. Malware removed and system reimaged.","severity":"low"}'
  '{"title":"Zero-Day Exploit CVE-2024-8765","description":"Exploitation of CVE-2024-8765 detected in production VPN appliance. Vendor patch not yet available. Mitigation controls applied.","severity":"critical"}'
  '{"title":"Compromised Service Account Investigation","description":"Service account SVCACCT-BACKUP used from unusual location. Account credentials rotated. Investigating scope of access.","severity":"high"}'
  '{"title":"Suspicious PowerShell Empire Activity","description":"PowerShell Empire C2 framework traffic detected. Beaconing to 45.142.212.100 every 60 seconds. Host isolated from network.","severity":"medium"}'
)

for i in $(seq 0 9); do
  STATUS="${CASE_STATUSES[$i]}"
  SEV="${CASE_SEVERITIES[$i]}"
  ANALYST="${ANALYSTS[$i]}"
  DATA="${CASE_DATA[$i]}"

  # Inject severity and status
  PAYLOAD=$(echo "$DATA" | jq --arg s "$STATUS" --arg sev "$SEV" '. + {"status": $s, "severity": $sev}')

  RESP=$(post "$CASE_URL/api/cases" "$PAYLOAD") || continue
  CASE_ID=$(echo "$RESP" | jq -r '.id // empty' 2>/dev/null || true)

  if [[ -n "$CASE_ID" && -n "$ANALYST" ]]; then
    post "$CASE_URL/api/cases/$CASE_ID/assign" "{\"analyst\": \"$ANALYST\"}" > /dev/null || true
    post "$CASE_URL/api/cases/$CASE_ID/timeline" "{
      \"event\": \"Case opened and assigned to $ANALYST\",
      \"author\": \"system\",
      \"event_type\": \"assignment\"
    }" > /dev/null || true
  fi

  if [[ -n "$CASE_ID" && "$STATUS" != "open" ]]; then
    post "$CASE_URL/api/cases/$CASE_ID/timeline" "{
      \"event\": \"Initial triage completed. Confirmed malicious activity. Escalating for investigation.\",
      \"author\": \"${ANALYST:-analyst}\",
      \"event_type\": \"note\"
    }" > /dev/null || true
  fi
done

log "Created 10 cases"

# ─── 4. Add 20 IOCs ──────────────────────────────────────────────────────
info "Adding 20 IOCs..."

IOC_DATA=(
  '{"type":"ip","value":"185.220.101.45","severity":"critical","source":"ThreatFox","description":"Tor exit node used in ransomware C2 communication","tags":["tor","c2","ransomware"]}'
  '{"type":"ip","value":"91.108.56.23","severity":"high","source":"AlienVault OTX","description":"Known Cobalt Strike C2 server","tags":["cobalt-strike","apt","c2"]}'
  '{"type":"ip","value":"45.142.212.100","severity":"critical","source":"AbuseIPDB","description":"Active C2 for Emotet malware campaign","tags":["emotet","malware","c2"]}'
  '{"type":"ip","value":"194.165.16.78","severity":"high","source":"Shodan","description":"Exposed RDP server with brute force attempts","tags":["rdp","brute-force"]}'
  '{"type":"ip","value":"89.248.167.131","severity":"medium","source":"GreyNoise","description":"Mass scanner targeting web vulnerabilities","tags":["scanner","reconnaissance"]}'
  '{"type":"domain","value":"update-service.malicious-domain.net","severity":"critical","source":"ThreatFox","description":"Malware distribution domain used in phishing","tags":["phishing","distribution"]}'
  '{"type":"domain","value":"cdn.evil-payload.xyz","severity":"high","source":"VirusTotal","description":"Domain used to host exploit kits","tags":["exploit-kit","drive-by"]}'
  '{"type":"domain","value":"beacon.cobaltstrike-c2.ru","severity":"critical","source":"MISP","description":"Cobalt Strike team server domain","tags":["cobalt-strike","c2","apt"]}'
  '{"type":"domain","value":"exfil-staging.attacker-infra.io","severity":"high","source":"Internal","description":"Data exfiltration staging server","tags":["exfiltration","data-theft"]}'
  '{"type":"domain","value":"malware-update.fake-adobe.com","severity":"medium","source":"PhishTank","description":"Fake Adobe update page distributing malware","tags":["phishing","impersonation"]}'
  '{"type":"hash","value":"d41d8cd98f00b204e9800998ecf8427e","severity":"critical","source":"VirusTotal","description":"MD5 hash of WannaCry ransomware variant","tags":["ransomware","wannacry"]}'
  '{"type":"hash","value":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","severity":"critical","source":"MalwareBazaar","description":"SHA256 of Ryuk ransomware loader","tags":["ransomware","ryuk"]}'
  '{"type":"hash","value":"aabbccddeeff00112233445566778899aabbccdd","severity":"high","source":"MISP","description":"SHA1 hash of Mimikatz credential dumping tool","tags":["credential-dumping","mimikatz"]}'
  '{"type":"hash","value":"5f4dcc3b5aa765d61d8327deb882cf99","severity":"high","source":"ThreatFox","description":"MD5 hash of Metasploit meterpreter payload","tags":["metasploit","meterpreter","payload"]}'
  '{"type":"hash","value":"8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92","severity":"medium","source":"Internal","description":"SHA256 of suspicious PowerShell script","tags":["powershell","suspicious"]}'
  '{"type":"url","value":"http://185.220.101.45/gate.php","severity":"critical","source":"ThreatFox","description":"Emotet C2 gate endpoint","tags":["emotet","c2","malware"]}'
  '{"type":"url","value":"https://cdn.evil-payload.xyz/stage2/loader.exe","severity":"critical","source":"VirusTotal","description":"Second stage malware payload download URL","tags":["malware","download","payload"]}'
  '{"type":"url","value":"http://update-service.malicious-domain.net/update.exe","severity":"high","source":"URLhaus","description":"Fake update distributing RAT","tags":["rat","phishing","update"]}'
  '{"type":"ip","value":"10.0.1.45","severity":"medium","source":"Internal","description":"Internal host exhibiting C2 beacon behavior","tags":["internal","c2","compromised"]}'
  '{"type":"domain","value":"ransomware-payment.onion.to","severity":"critical","source":"Recorded Future","description":"Ransomware payment portal proxy","tags":["ransomware","payment","darkweb"]}'
)

for ioc in "${IOC_DATA[@]}"; do
  post "$TI_URL/api/ti/ioc" "$ioc" > /dev/null
done

log "Added 20 IOCs"

# ─── 5. Create 3 Playbooks ───────────────────────────────────────────────
info "Creating 3 playbooks..."

post "$SOAR_URL/api/soar/playbooks" '{
  "name": "Critical Alert Auto-Response",
  "description": "Automatically respond to critical severity alerts: create case, notify team, block IP",
  "trigger": {
    "alert_severity": "critical",
    "alert_type": "any"
  },
  "actions": [
    {
      "step": 1,
      "type": "create_case",
      "params": {"severity": "critical", "auto_assign": true, "team": "tier-2"}
    },
    {
      "step": 2,
      "type": "notify_slack",
      "params": {"channel": "#soc-critical", "message": "CRITICAL ALERT: {{alert.title}} from {{alert.source_ip}}"}
    },
    {
      "step": 3,
      "type": "block_ip",
      "params": {"duration": "24h", "firewall": "perimeter"}
    },
    {
      "step": 4,
      "type": "send_email",
      "params": {"to": "soc-manager@company.com", "subject": "Critical Security Alert Triggered", "template": "critical-alert"}
    }
  ],
  "is_active": true
}' > /dev/null

post "$SOAR_URL/api/soar/playbooks" '{
  "name": "Phishing Email Response",
  "description": "Handle phishing email reports: quarantine, hunt for other victims, notify users",
  "trigger": {
    "alert_severity": "medium",
    "alert_type": "phishing"
  },
  "actions": [
    {
      "step": 1,
      "type": "create_case",
      "params": {"severity": "medium", "category": "phishing"}
    },
    {
      "step": 2,
      "type": "notify_slack",
      "params": {"channel": "#soc-alerts", "message": "Phishing campaign detected: {{alert.title}}"}
    },
    {
      "step": 3,
      "type": "send_email",
      "params": {"to": "it-security@company.com", "subject": "Phishing Alert", "template": "phishing-alert"}
    }
  ],
  "is_active": true
}' > /dev/null

post "$SOAR_URL/api/soar/playbooks" '{
  "name": "Ransomware Containment",
  "description": "Emergency response for ransomware: isolate host, preserve evidence, escalate",
  "trigger": {
    "alert_severity": "critical",
    "alert_type": "ransomware"
  },
  "actions": [
    {
      "step": 1,
      "type": "block_ip",
      "params": {"scope": "all", "duration": "permanent"}
    },
    {
      "step": 2,
      "type": "create_case",
      "params": {"severity": "critical", "priority": "p1", "auto_assign": true}
    },
    {
      "step": 3,
      "type": "notify_slack",
      "params": {"channel": "#incident-response", "message": "RANSOMWARE DETECTED - Immediate response required! Host: {{alert.host}}"}
    },
    {
      "step": 4,
      "type": "send_email",
      "params": {"to": "ciso@company.com,soc-manager@company.com", "subject": "P1 INCIDENT: Ransomware Detected", "template": "ransomware-incident"}
    }
  ],
  "is_active": true
}' > /dev/null

log "Created 3 playbooks"

# ─── Done ────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Seed data injection complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "  ${CYAN}• 5  correlation rules${NC}"
echo -e "  ${CYAN}• 50 SIEM events injected${NC}"
echo -e "  ${CYAN}• 10 cases created${NC}"
echo -e "  ${CYAN}• 20 IOCs added${NC}"
echo -e "  ${CYAN}• 3  playbooks configured${NC}"
echo ""
echo -e "  Open ${CYAN}http://localhost${NC} to view the SOC dashboard"
echo ""
