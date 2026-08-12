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
# REPO_PATH defaults to the repository root (parent of this script). If the
# directory does not exist yet it is bootstrapped with a fresh clone over
# HTTPS (no credentials needed for the public repository).
#
# The script self-heals:
#   - creates the external `nginx-proxy` network if missing
#   - uses `docker compose` (v2) or falls back to `docker-compose` (v1)
#   - waits for the container health gate before reporting success
# =============================================================================
set -euo pipefail

# Public repo: HTTPS clone/pull needs no credentials on the VPS.
# Switch to git@github.com:gstorelli/worldmonitor.git (and register a
# deploy key) if the repository ever becomes private.
REPO_URL="https://github.com/gstorelli/worldmonitor.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_PATH="${1:-$(cd "${SCRIPT_DIR}/.." && pwd)}"

if [ ! -d "${REPO_PATH}" ]; then
  echo "==> ${REPO_PATH} does not exist — bootstrapping a fresh clone"
  mkdir -p "$(dirname "${REPO_PATH}")"
  git clone "${REPO_URL}" "${REPO_PATH}"
fi

cd "${REPO_PATH}"

# Git refuses checkouts owned by another user ("dubious ownership",
# CVE-2022-24765) unless whitelisted. Add the path for this user.
git config --global --add safe.directory "${REPO_PATH}" 2>/dev/null || true

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is not installed on this host" >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "error: neither 'docker compose' (v2) nor 'docker-compose' (v1) found" >&2
  exit 1
fi
echo "using: ${COMPOSE}"

if [ ! -f .env ]; then
  echo "warning: ${REPO_PATH}/.env not found — internal services will use the"
  echo "         local development fallback credentials (see .env.example)."
  echo "         For production set REDIS_PASSWORD and REDIS_TOKEN first."
fi

echo "==> ensure external proxy network (idempotent)"
docker network inspect nginx-proxy >/dev/null 2>&1 || docker network create nginx-proxy

echo "==> git fetch + pull (ff-only) from origin/main"
git fetch origin
git pull --ff-only origin main

echo "==> ${COMPOSE} up -d --build"
${COMPOSE} up -d --build

echo "==> prune dangling images"
docker image prune -f

echo "==> health gate (container internal 8080)"
ok=0
for i in $(seq 1 18); do
  if docker exec worldmonitor wget -qO- http://127.0.0.1:8080/api/version >/dev/null 2>&1 \
     || docker exec worldmonitor node -e "fetch('http://127.0.0.1:8080/api/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    echo "health OK (attempt ${i})"
    ok=1
    break
  fi
  echo "waiting for worldmonitor... (${i}/18)"
  sleep 10
done
if [ "${ok}" != "1" ]; then
  echo "ERROR: worldmonitor did not become healthy after deploy" >&2
  ${COMPOSE} ps
  ${COMPOSE} logs --tail=50 worldmonitor || true
  exit 1
fi

echo "==> stack status"
${COMPOSE} ps

echo "==> deploy complete: $(date -u +%Y-%m-%dT%H:%M:%SZ)"