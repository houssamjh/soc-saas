#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()     { echo -e "${GREEN}[$(date +%T)] $*${NC}"; }
warn()    { echo -e "${YELLOW}[$(date +%T)] WARN: $*${NC}"; }
error()   { echo -e "${RED}[$(date +%T)] ERROR: $*${NC}" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════════════${NC}"; echo -e "${BOLD}${CYAN}  $*${NC}"; echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════${NC}\n"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

header "SOC SaaS Platform — Ubuntu 22.04 Installer"
log "Project directory: $PROJECT_DIR"
log "Starting installation at $(date)"

# ─── Check OS ────────────────────────────────────────────────────────────────
if [[ "$(lsb_release -si 2>/dev/null)" != "Ubuntu" ]]; then
  warn "This script is designed for Ubuntu 22.04. Proceeding anyway..."
fi

# ─── Check root ──────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root: sudo ./install.sh"
  exit 1
fi

ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)

header "Step 1: Update system packages"
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  apt-transport-https \
  software-properties-common \
  git \
  wget \
  jq \
  netcat-openbsd \
  net-tools \
  htop \
  unzip
log "System packages updated"

header "Step 2: Install Docker Engine (official repo)"
# Remove old versions
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Add Docker GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --batch --yes -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repo
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker
log "Docker Engine installed: $(docker --version)"
log "Docker Compose installed: $(docker compose version)"

header "Step 3: Add user to docker group"
usermod -aG docker "$ACTUAL_USER"
log "Added $ACTUAL_USER to docker group (logout/login required for shell access)"

header "Step 4: Install Node.js 20 via nvm"
sudo -u "$ACTUAL_USER" bash -c "
  export HOME='$ACTUAL_HOME'
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR=\"\$HOME/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\"
  nvm install 20
  nvm use 20
  nvm alias default 20
  echo \"Node.js version: \$(node --version)\"
  echo \"npm version: \$(npm --version)\"
"
log "Node.js 20 installed"

header "Step 5: Install Python 3.11"
add-apt-repository -y ppa:deadsnakes/ppa 2>/dev/null || true
apt-get update -y
apt-get install -y python3.11 python3.11-venv python3.11-dev python3-pip
update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1
log "Python version: $(python3.11 --version)"

header "Step 6: Configure system for Elasticsearch"
sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" >> /etc/sysctl.conf
sysctl -w fs.file-max=65536
echo "fs.file-max=65536" >> /etc/sysctl.conf
log "vm.max_map_count set to 262144"
log "fs.file-max set to 65536"

# Increase nofile limits
cat >> /etc/security/limits.conf << 'EOF'
* soft nofile 65536
* hard nofile 65536
* soft nproc 65536
* hard nproc 65536
EOF
log "System limits configured"

header "Step 7: Setup environment file"
cd "$PROJECT_DIR"
if [[ ! -f .env ]]; then
  cp .env.example .env
  log "Created .env from .env.example"
  warn "Review .env and change passwords before production use!"
else
  log ".env already exists, skipping"
fi

header "Step 8: Build Docker images"
cd "$PROJECT_DIR"
log "Building all Docker images (this may take 5-15 minutes)..."
docker compose build --parallel
log "All images built successfully"

header "Step 9: Start all services"
docker compose up -d
log "All services starting..."

header "Step 10: Wait for services to be healthy"

wait_for_service() {
  local name="$1"
  local url="$2"
  local max_attempts="${3:-40}"
  local attempt=1

  echo -n "  Waiting for $name"
  while [[ $attempt -le $max_attempts ]]; do
    if curl -sf "$url" > /dev/null 2>&1; then
      echo -e " ${GREEN}✓${NC}"
      return 0
    fi
    echo -n "."
    sleep 5
    ((attempt++))
  done
  echo -e " ${RED}✗ TIMEOUT${NC}"
  return 1
}

wait_for_service "Elasticsearch"  "http://localhost:9200/_cluster/health"  48
wait_for_service "Kafka"          "http://localhost:8080/actuator/health"  40
wait_for_service "PostgreSQL"     "http://localhost:8002/health"           40
wait_for_service "SIEM Service"   "http://localhost:8001/health"           40
wait_for_service "Case Service"   "http://localhost:8002/health"           40
wait_for_service "TI Service"     "http://localhost:8003/health"           40
wait_for_service "SOAR Service"   "http://localhost:8004/health"           40
wait_for_service "SOC Dashboard"  "http://localhost:3001"                  48

log "All services healthy!"

header "Step 11: Seed initial data"
chmod +x "$SCRIPT_DIR/seed-data.sh"
sudo -u "$ACTUAL_USER" bash "$SCRIPT_DIR/seed-data.sh"
log "Seed data injected successfully"

header "Installation Complete!"

echo -e "\n${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║          SOC Platform — Service URLs                 ║${NC}"
echo -e "${BOLD}${GREEN}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}${GREEN}║${NC}  SOC Dashboard     ${CYAN}http://localhost${NC}                ${BOLD}${GREEN}║${NC}"
echo -e "${BOLD}${GREEN}║${NC}  SOC Dashboard Alt ${CYAN}http://localhost:3001${NC}           ${BOLD}${GREEN}║${NC}"
echo -e "${BOLD}${GREEN}║${NC}  SIEM API Docs     ${CYAN}http://localhost:8001/docs${NC}      ${BOLD}${GREEN}║${NC}"
echo -e "${BOLD}${GREEN}║${NC}  Case API Docs     ${CYAN}http://localhost:8002/docs${NC}      ${BOLD}${GREEN}║${NC}"
echo -e "${BOLD}${GREEN}║${NC}  TI API Docs       ${CYAN}http://localhost:8003/docs${NC}      ${BOLD}${GREEN}║${NC}"
echo -e "${BOLD}${GREEN}║${NC}  SOAR API Docs     ${CYAN}http://localhost:8004/docs${NC}      ${BOLD}${GREEN}║${NC}"
echo -e "${BOLD}${GREEN}║${NC}  Kibana            ${CYAN}http://localhost:5601${NC}           ${BOLD}${GREEN}║${NC}"
echo -e "${BOLD}${GREEN}║${NC}  Kafka UI          ${CYAN}http://localhost:8080${NC}           ${BOLD}${GREEN}║${NC}"
echo -e "${BOLD}${GREEN}║${NC}  Grafana           ${CYAN}http://localhost:3000${NC}           ${BOLD}${GREEN}║${NC}"
echo -e "${BOLD}${GREEN}║${NC}  MinIO Console     ${CYAN}http://localhost:9001${NC}           ${BOLD}${GREEN}║${NC}"
echo -e "${BOLD}${GREEN}║${NC}  Keycloak          ${CYAN}http://localhost:8443${NC}           ${BOLD}${GREEN}║${NC}"
echo -e "${BOLD}${GREEN}║${NC}  Prometheus        ${CYAN}http://localhost:9090${NC}           ${BOLD}${GREEN}║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"

echo -e "\n${YELLOW}NOTE: Log out and back in for docker group changes to take effect${NC}"
echo -e "${YELLOW}      Or run: newgrp docker${NC}\n"
