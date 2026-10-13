#!/bin/sh
# Liveness watchdog for the Node API (local-api-server.mjs).
#
# Why: supervisord restarts the API only when the process EXITS. If the process
# stays alive but stops serving (event loop blocked, or every outbound-fetch slot
# leaked), nginx keeps serving the static SPA while every /api/* call times out
# (504 at the outer proxy), and Docker at most marks the container "unhealthy"
# without restarting it. From 12/10/2026 15:05 to 13/10 15:24 this left
# production down until a manual `docker compose restart worldmonitor`.
#
# What: probe the auth-exempt /api/sidecar-health?deep=1 route directly on the
# API port every INTERVAL seconds. The deep probe also fails (503) when the
# outbound-fetch limiter is stuck; the shallow route kept answering 200 for the
# whole 12-13/10 outage. After MAX_FAILS consecutive failures, log the process
# state and kill the API so supervisord (autorestart=true) starts a fresh one.
# An outage then lasts about MAX_FAILS x INTERVAL seconds instead of hours.
#
# Knobs (environment): API_WATCHDOG_DISABLED=true, API_WATCHDOG_INTERVAL (30),
# API_WATCHDOG_MAX_FAILS (3), API_WATCHDOG_TIMEOUT (10), API_WATCHDOG_GRACE (90:
# start-up time allowed before the first probe and after each restart).

PORT="${LOCAL_API_PORT:-46123}"
INTERVAL="${API_WATCHDOG_INTERVAL:-30}"
MAX_FAILS="${API_WATCHDOG_MAX_FAILS:-3}"
TIMEOUT="${API_WATCHDOG_TIMEOUT:-10}"
GRACE="${API_WATCHDOG_GRACE:-90}"
URL="http://127.0.0.1:${PORT}/api/sidecar-health?deep=1"
# Anchored on the exact supervisord command so nothing else can match.
MATCH="${API_WATCHDOG_MATCH:-^node /app/local-api-server.mjs}"

log() { echo "[api-watchdog] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

if [ "${API_WATCHDOG_DISABLED:-}" = "true" ]; then
  log "disabled by API_WATCHDOG_DISABLED=true"
  # Stay alive so supervisord does not restart this program in a loop.
  while :; do sleep 3600; done
fi

log "watching ${URL} every ${INTERVAL}s (restart after ${MAX_FAILS} failures)"
sleep "${GRACE}"
fails=0
while :; do
  # `timeout` bounds the whole probe (busybox wget has no retry flag; GNU wget
  # would retry on its own), so a hung API cannot stall the watchdog itself.
  if timeout "${TIMEOUT}" wget -q -O /dev/null "${URL}" 2>/dev/null; then
    [ "${fails}" -gt 0 ] && log "API answers again after ${fails} failed probe(s)"
    fails=0
  else
    fails=$((fails + 1))
    log "liveness probe failed (${fails}/${MAX_FAILS})"
    if [ "${fails}" -ge "${MAX_FAILS}" ]; then
      log "API unresponsive: process state before restart follows"
      ps -o pid,etime,vsz,rss,args 2>/dev/null | grep -E 'PID|local-api-server' | grep -v grep
      log "killing the API so supervisord restarts it"
      pkill -KILL -f "${MATCH}" || log "pkill found no API process"
      fails=0
      sleep "${GRACE}"
      continue
    fi
  fi
  sleep "${INTERVAL}"
done
