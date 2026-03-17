# SOC SaaS Platform

A production-grade Security Operations Center (SOC) platform running entirely via Docker Compose on Ubuntu 22.04 LTS. No cloud costs — everything runs locally.

## Architecture Overview

```
                          ┌─────────────────────────────────────────────────────┐
                          │                   SOC Platform                       │
                          │                                                       │
  Log Sources             │  ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
  ──────────              │  │          │    │          │    │              │  │
  Syslog ────────────────►│  │ Logstash │───►│  Kafka   │───►│ siem-service │  │
  Beats  ────────────────►│  │  :5044   │    │  :9092   │    │   :8001      │  │
  JSON   ────────────────►│  │  :5514   │    │          │    │              │  │
                          │  └──────────┘    └──────────┘    └──────┬───────┘  │
                          │        │                                  │          │
                          │        ▼                                  ▼          │
                          │  ┌──────────────┐              ┌──────────────────┐ │
                          │  │Elasticsearch │◄─────────────│  Correlation     │ │
                          │  │   :9200      │              │  Engine +        │ │
                          │  └──────────────┘              │  Sigma Rules     │ │
                          │        │                        └──────────────────┘ │
                          │        ▼                                  │          │
                          │  ┌──────────┐                            ▼          │
                          │  │  Kibana  │              ┌─────────────────────┐  │
                          │  │  :5601   │              │   WebSocket /ws/    │  │
                          │  └──────────┘              │   alerts stream     │  │
                          │                            └──────────┬──────────┘  │
                          │  ┌──────────────────────────────────────────────┐   │
                          │  │              Backend Microservices            │   │
                          │  │  case-service:8002  ti-service:8003           │   │
                          │  │  soar-service:8004  (PostgreSQL + Redis)      │   │
                          │  └──────────────────────────────────────────────┘   │
                          │                         │                            │
                          │  ┌──────────────────────▼─────────────────────────┐ │
                          │  │              Nginx Reverse Proxy :80            │ │
                          │  └──────────────────────┬─────────────────────────┘ │
                          │                         │                            │
                          │  ┌──────────────────────▼─────────────────────────┐ │
                          │  │         Next.js SOC Dashboard :3001             │ │
                          │  │   Dashboard | Alerts | Cases | TI | SOAR        │ │
                          │  └────────────────────────────────────────────────┘  │
                          └─────────────────────────────────────────────────────┘
```

## Prerequisites

- **OS:** Ubuntu 22.04 LTS
- **RAM:** 16GB minimum (32GB recommended)
- **CPU:** 8 cores minimum
- **Storage:** 100GB SSD
- **Ports:** 80, 3000, 3001, 5601, 8001-8004, 8080, 8443, 9090, 9200 must be free

## Quick Start (5 minutes)

```bash
git clone <repo-url> soc-saas
cd soc-saas
chmod +x scripts/install.sh
sudo ./scripts/install.sh
# Open http://localhost in your browser
```

## Manual Setup

```bash
# 1. Install Docker Engine
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 2. Configure system
sudo usermod -aG docker $USER
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf

# 3. Setup environment
cp .env.example .env
# Edit .env to set passwords

# 4. Build and start
docker compose build
docker compose up -d

# 5. Wait for services (~2 minutes), then seed data
./scripts/seed-data.sh
```

## Docker Compose Services

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| SOC Dashboard | 3001 | http://localhost:3001 | Main frontend |
| SIEM Service | 8001 | http://localhost:8001/docs | Alert engine API |
| Case Service | 8002 | http://localhost:8002/docs | Case management API |
| TI Service | 8003 | http://localhost:8003/docs | Threat intel API |
| SOAR Service | 8004 | http://localhost:8004/docs | Playbook API |
| Nginx | 80 | http://localhost | Reverse proxy |
| Elasticsearch | 9200 | http://localhost:9200 | Search & log storage |
| Kibana | 5601 | http://localhost:5601 | Log exploration |
| Kafka UI | 8080 | http://localhost:8080 | Message broker UI |
| MinIO Console | 9001 | http://localhost:9001 | Object storage UI |
| Grafana | 3000 | http://localhost:3000 | Metrics dashboards |
| Keycloak | 8443 | http://localhost:8443 | Auth & user mgmt |
| Prometheus | 9090 | http://localhost:9090 | Metrics collection |
| ClickHouse | 8123 | http://localhost:8123 | Analytics DB |
| Kafka | 9092 | - | Message broker |
| PostgreSQL | 5432 | - | Relational DB |
| Redis | 6379 | - | Cache & queues |
| Zookeeper | 2181 | - | Kafka coordination |

## Backend Services

### SIEM Service (`:8001`)
- `POST /api/siem/events` — Ingest raw log event
- `GET /api/siem/alerts` — List alerts (pagination + filters)
- `GET /api/siem/alerts/{id}` — Alert detail
- `PUT /api/siem/alerts/{id}/status` — Update alert status
- `POST /api/siem/rules` — Create correlation rule
- `GET /api/siem/rules` — List rules
- `WS /ws/alerts` — Real-time alert stream

### Case Service (`:8002`)
- `POST /api/cases` — Create case
- `GET /api/cases` — List cases
- `GET /api/cases/{id}` — Case detail
- `PUT /api/cases/{id}` — Update case
- `DELETE /api/cases/{id}` — Delete case
- `POST /api/cases/{id}/timeline` — Add timeline event
- `POST /api/cases/{id}/assign` — Assign to analyst

### TI Service (`:8003`)
- `POST /api/ti/ioc` — Add IOC
- `GET /api/ti/ioc/search?value=x` — Lookup IOC
- `GET /api/ti/feed` — List all IOCs
- `POST /api/ti/feed/import` — Bulk import
- `GET /api/ti/mitre` — MITRE ATT&CK techniques

### SOAR Service (`:8004`)
- `POST /api/soar/playbooks` — Create playbook
- `GET /api/soar/playbooks` — List playbooks
- `POST /api/soar/playbooks/{id}/execute` — Execute playbook

## Frontend Pages

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/` | KPIs, live feed, charts |
| Alerts | `/alerts` | Alert console with filters |
| Cases | `/cases` | Kanban case manager |
| Threat Intel | `/ti` | IOC search, MITRE matrix |
| SOAR | `/soar` | Playbook manager |
| Settings | `/settings` | Service health, config |

## Default Credentials

| Service | Username | Password |
|---------|----------|----------|
| Grafana | admin | admin |
| Keycloak Admin | admin | admin123 |
| MinIO | minioadmin | minioadmin123 |
| PostgreSQL | soc_admin | socpassword123 |

## Useful Commands

```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f siem-service

# Restart a service
docker compose restart siem-service

# Stop all
docker compose down

# Stop and remove volumes (WARNING: destroys data)
docker compose down -v

# Rebuild a service
docker compose build siem-service
docker compose up -d siem-service

# Shell into a service
docker compose exec siem-service bash

# Check service status
docker compose ps

# View resource usage
docker stats
```

## Architecture — Data Flow

```
External Logs
     │
     ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Logstash   │────►│    Kafka     │────►│  SIEM Service   │
│ (normalize) │     │ raw-events   │     │  (correlate)    │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
                          ┌────────────────────────┤
                          ▼                        ▼
                   ┌─────────────┐      ┌──────────────────┐
                   │Elasticsearch│      │  Kafka soc-alerts │
                   │  soc-alerts │      │  (alert events)   │
                   └─────────────┘      └────────┬─────────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    ▼            ▼            ▼
                             ┌──────────┐ ┌──────────┐ ┌──────────┐
                             │  SOAR    │ │  Case    │ │ Frontend │
                             │ (auto    │ │ Service  │ │ (WebSock)│
                             │  action) │ │(tickets) │ │          │
                             └──────────┘ └──────────┘ └──────────┘
```

## Adding Log Sources

### Syslog (UDP)
Configure your device to send syslog to `<ubuntu-ip>:5514` UDP:
```
# rsyslog example
*.* @<ubuntu-ip>:5514
```

### Filebeat / Metricbeat
```yaml
# filebeat.yml
output.logstash:
  hosts: ["<ubuntu-ip>:5044"]
```

### JSON over TCP
```bash
echo '{"event_type":"login","source_ip":"192.168.1.1","severity":"high"}' | nc <ubuntu-ip> 5044
```

## Troubleshooting

### 1. Elasticsearch fails to start
```bash
sudo sysctl -w vm.max_map_count=262144
# Check logs
docker compose logs elasticsearch
```

### 2. Kafka connection refused
```bash
# Check Zookeeper first
docker compose logs zookeeper
docker compose restart kafka
```

### 3. Services can't connect to each other
```bash
# Verify all on soc-network
docker network inspect soc-saas_soc-network
```

### 4. Frontend build fails
```bash
cd frontend/soc-dashboard
npm install
npm run build
```

### 5. PostgreSQL init script not running
```bash
docker compose down -v
docker compose up -d postgresql
```

### 6. Out of disk space
```bash
docker system prune -af
docker volume prune
```

### 7. Port already in use
```bash
sudo lsof -i :9200
sudo kill -9 <pid>
```

### 8. Logstash pipeline errors
```bash
docker compose logs logstash
# Check pipeline config syntax
```

### 9. CORS errors in browser
Check nginx.conf and ensure CORS headers are set for your domain.

### 10. Keycloak realm not loading
```bash
docker compose restart keycloak
# Access: http://localhost:8443/admin
```

## Next Steps

- **Auth hardening:** Replace dev JWT with full Keycloak OIDC flow, enable xpack.security in Elasticsearch
- **Cloud deploy:** Package with Helm charts for Kubernetes, use managed Elasticsearch/Kafka
- **ML anomaly detection:** Integrate Elasticsearch ML jobs or add a Python anomaly detection service
- **More log sources:** Add connectors for AWS CloudTrail, Azure Sentinel, Okta, CrowdStrike
- **Custom Sigma rules:** Build a rule editor UI with YAML syntax highlighting
- **Alerting integrations:** PagerDuty, OpsGenie, Teams webhooks from SOAR
- **Compliance reports:** PDF report generation for SOC 2, ISO 27001
- **RBAC:** Role-based access control with analyst/manager/admin roles via Keycloak
