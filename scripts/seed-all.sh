#!/usr/bin/env bash
# =============================================================================
# Risk Sentinel — self-hosted data seeding
# =============================================================================
# Populates Redis with the bootstrap datasets the dashboard panels read.
# Run on the VPS (or any host with Docker + access to the compose network):
#
#   ./scripts/seed-all.sh                 # every seeder
#   ./scripts/seed-all.sh commodities     # only seeders whose name matches
#   SEED_TIMEOUT_SECONDS=300 ./scripts/seed-all.sh
#
# It can be launched from anywhere (the checkout root is derived from this
# file's path). Each seeder runs inside a throwaway node:24-alpine container
# attached to the compose internal network, with the Redis REST env the seeds
# expect (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN derived from the
# checkout's .env REDIS_TOKEN) and API_BASE_URL pointed at the local API
# container so derived seeds (insights/forecasts) warm their digest against the
# self-hosted gateway instead of the upstream cloud.
#
# Every seeder is bounded by SEED_TIMEOUT_SECONDS (default 180) so one hanging
# upstream can never freeze the whole sweep. Progress is printed as it goes and
# a failing seeder shows its last output lines.
# =============================================================================
set -euo pipefail

REPO_PATH="${REPO_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
FILTER="${1:-}"
TIMEOUT_SECONDS="${SEED_TIMEOUT_SECONDS:-180}"
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
echo "seed sweep starting (timeout ${TIMEOUT_SECONDS}s/seeder, log: ${LOG})"
if [ -n "${FILTER}" ]; then
  echo "filter: name contains '${FILTER}'"
fi

total=0; ok=0; fail=0; skipped=0
for f in scripts/seed-*.mjs; do
  name="$(basename "${f}")"
  if [ -n "${FILTER}" ] && [[ "${name}" != *"${FILTER}"* ]]; then
    continue
  fi
  total=$((total + 1))
  echo "RUN  ${name}"
  seedlog="$(mktemp /tmp/seed-one.XXXXXX.log)"
  echo "### ${name} ($(date -u +%FT%TZ))" >> "${LOG}"
  if docker run --rm --network "${NET}" \
    --env-file "${REPO_PATH}/.env" \
    -e UPSTASH_REDIS_REST_URL=http://redis-rest:80 \
    -e UPSTASH_REDIS_REST_TOKEN="${RT}" \
    -e API_BASE_URL=http://worldmonitor:8080 \
    -v "${REPO_PATH}:/repo:ro" \
    -w /repo/scripts \
    node:24-alpine sh -c "timeout -s KILL ${TIMEOUT_SECONDS} node ${name}" > "${seedlog}" 2>&1; then
    ok=$((ok + 1))
    echo "OK   ${name}"
  else
    fail=$((fail + 1))
    echo "FAIL ${name}"
    echo "----- last output (${name}) -----"
    tail -n 15 "${seedlog}" || true
    echo "--------------------------------"
  fi
  cat "${seedlog}" >> "${LOG}"
  rm -f "${seedlog}"
done

echo "seed sweep complete: total=${total} ok=${ok} fail=${fail} skipped=${skipped} (log: ${LOG})"
