#!/usr/bin/env bash
# =============================================================================
# Risk Sentinel — manual production deploy (Contabo VPS fallback)
# =============================================================================
# Pulls the latest code from origin/main and rebuilds the Docker stack.
# Use this when the GitHub Actions deploy is unavailable; the workflow runs
# the same commands via SSH.
#
# Usage:
#   ./scripts/deploy.sh [REPO_PATH]
#
# REPO_PATH defaults to the repository root (parent of this script).
# Requires: a populated .env in REPO_PATH, and the external `nginx-proxy`
# Docker network to exist on the host (docker network create nginx-proxy).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_PATH="${1:-$(cd "${SCRIPT_DIR}/.." && pwd)}"

if [[ ! -d "${REPO_PATH}" ]]; then
  echo "error: ${REPO_PATH} is not a directory" >&2
  exit 1
fi

cd "${REPO_PATH}"

if [[ ! -f .env ]]; then
  echo "error: ${REPO_PATH}/.env not found" >&2
  echo "       cp .env.example .env && fill in REDIS_PASSWORD, REDIS_TOKEN, secrets" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is not installed on this host" >&2
  exit 1
fi

echo "==> deploying Risk Sentinel from ${REPO_PATH}"

echo "==> git pull origin main"
git fetch origin
git pull origin main

echo "==> docker compose up -d --build"
docker compose up -d --build

echo "==> prune dangling images"
docker image prune -f

echo "==> stack status"
docker compose ps

echo "==> deploy complete: $(date -u +%Y-%m-%dT%H:%M:%SZ)"