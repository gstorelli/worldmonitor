#!/usr/bin/env bash
# =============================================================================
# Risk Sentinel — create/update a portal user
# =============================================================================
# Runs scripts/create-user.mjs inside a throwaway node:24-alpine container on
# the compose internal network so it can reach redis-rest with the checkout's
# REDIS_TOKEN. Usage:
#
#   ./scripts/create-user.sh --username admin --role admin --password '...'
#   RS_USER_PASSWORD='...' ./scripts/create-user.sh --username admin --role admin
#
# Set AUTH_REQUIRED=true in .env (or docker-compose.override.yml) to enforce
# login; machine callers (n8n) keep using N8N_INGEST_SECRET.
# =============================================================================
set -euo pipefail

REPO_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_PATH}"

if [ ! -f .env ]; then
  echo "error: ${REPO_PATH}/.env not found" >&2
  exit 1
fi

NET="$(docker network ls --format '{{.Name}}' | grep -E 'internal-net$' | head -1 || true)"
if [ -z "${NET}" ]; then
  echo "error: compose internal network not found (is the stack running here?)" >&2
  exit 1
fi

RT="$(grep '^REDIS_TOKEN=' .env | cut -d= -f2-)"

docker run --rm --network "${NET}" \
  --env-file "${REPO_PATH}/.env" \
  -e UPSTASH_REDIS_REST_URL=http://redis-rest:80 \
  -e UPSTASH_REDIS_REST_TOKEN="${RT}" \
  -v "${REPO_PATH}:/repo:ro" \
  -w /repo \
  node:24-alpine node scripts/create-user.mjs "$@"
