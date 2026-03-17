#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "\033[0;36m[$(date +%T)] Starting SOC Platform...\033[0m"
cd "$PROJECT_DIR"
docker compose up -d

echo ""
echo -e "\033[0;32mServices started. Checking health...\033[0m"
sleep 10
docker compose ps

echo ""
echo -e "\033[0;32mSOC Dashboard: http://localhost\033[0m"
echo -e "\033[0;32mAPI Docs:       http://localhost:8001/docs\033[0m"
