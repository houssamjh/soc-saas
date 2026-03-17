#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "\033[1;33m[$(date +%T)] Stopping SOC Platform...\033[0m"
cd "$PROJECT_DIR"

if [[ "${1:-}" == "--volumes" || "${1:-}" == "-v" ]]; then
  echo -e "\033[0;31mWARNING: Removing all volumes (data will be lost)!\033[0m"
  read -p "Are you sure? (yes/no): " confirm
  if [[ "$confirm" == "yes" ]]; then
    docker compose down -v
    echo -e "\033[0;32mAll containers and volumes removed.\033[0m"
  else
    echo "Aborted."
  fi
else
  docker compose down
  echo -e "\033[0;32mAll containers stopped. Data volumes preserved.\033[0m"
  echo -e "Run with --volumes to also remove data volumes."
fi
