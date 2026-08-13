#!/usr/bin/env bash
# =============================================================================
# Risk Sentinel — self-hosted data seeding
# =============================================================================
# Populates Redis with the bootstrap datasets the dashboard panels read.
# Run on the VPS (or any host with Docker + access to the compose network):
#
#   ./scripts/seed-all.sh /path/to/checkout
#
# Internally it runs every scripts/seed-*.mjs inside a throwaway node:24-alpine
# container attached to the compose internal network, with the Redis REST env
# the seeds expect (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) derived
# from the checkout's .env (REDIS_TOKEN), plus API_BASE_URL pointed at the
# local API container so derived seeds (insights/forecasts) warm their digest
# against the self-hosted gateway instead of the upstream cloud.
#
# Notes:
#   - seeds needing CLOUDFLARE_API_TOKEN (internet outages / DDoS / traffic
#     anomalies) skip gracefully when it is absent
#   - AviationStack delays need a working AVIATIONSTACK_API key (HTTP 403 =
#     invalid/expired key or provider IP-block)
#   - socialVelocity / wsbTickers come from Reddit and are empty when the
#     host IP is rate-limited or blocked by Reddit
# =============================================================================
set -euo pipefail

REPO_PATH="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
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

LOG="$(mktemp /tmp/seed-all.XXXXXX.log)"
total=0; ok=0; fail=0
for f in scripts/seed-*.mjs; do
  name="$(basename "${f}")"
  total=$((total + 1))
  echo "### ${name}" >> "${LOG}"
  if docker run --rm --network "${NET}" \
    --env-file "${REPO_PATH}/.env" \
    -e UPSTASH_REDIS_REST_URL=http://redis-rest:80 \
    -e UPSTASH_REDIS_REST_TOKEN="${RT}" \
    -e API_BASE_URL=http://worldmonitor:8080 \
    -v "${REPO_PATH}:/repo:ro" \
    -w /repo/scripts \
    node:24-alpine sh -c "node ${name}" >> "${LOG}" 2>&1; then
    ok=$((ok + 1))
  else
    fail=$((fail + 1))
    echo "FAIL ${name}" >> "${LOG}"
    echo "FAIL ${name}"
  fi
done

echo "seed sweep complete: total=${total} ok=${ok} fail=${fail} (log: ${LOG})"
