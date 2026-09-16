#!/usr/bin/env bash
# SENTINEL-ADM — refresh the local OpenSanctions dataset used by Yente.
# Run it on the host after bootstrap and periodically (see deploy/crontab.example).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

YENTE_CONTAINER="$(docker compose ps -q yente 2>/dev/null || true)"
if [ -z "$YENTE_CONTAINER" ]; then
  echo "error: il servizio yente non è in esecuzione (docker compose --profile prod up -d)" >&2
  exit 1
fi

echo "aggiornamento dataset OpenSanctions (può richiedere diversi minuti)…"
docker compose exec -T yente yente update

echo "reindicizzazione…"
docker compose exec -T yente yente reindex

echo "stato:"
docker compose exec -T yente yente status || true
echo "completato."
