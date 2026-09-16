#!/usr/bin/env bash
# SENTINEL-ADM — idempotent production bootstrap.
#
#   SENTINEL_BASIC_AUTH_PASSWORD='...' ./scripts/bootstrap.sh
#
# Creates .env from the template when missing, generates the basic-auth hash
# into .env, seeds the watchlist from the example, starts the production
# profile and waits for the API healthcheck. Safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

command -v docker >/dev/null 2>&1 || { echo "error: docker non installato" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "error: serve docker compose v2" >&2; exit 1; }

if [ ! -f .env ]; then
  cp .env.example .env
  echo "creato .env da .env.example — compila dominio, email ACME e canali di notifica"
fi

if [ -n "${SENTINEL_BASIC_AUTH_PASSWORD:-}" ]; then
  if grep -qE '^SENTINEL_BASIC_AUTH_HASH=.+' .env; then
    echo "hash basic-auth già presente: lasciato invariato"
  else
    HASH="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext "$SENTINEL_BASIC_AUTH_PASSWORD")"
    if grep -q '^SENTINEL_BASIC_AUTH_HASH=' .env; then
      # Delimiter | because bcrypt hashes contain / and $
      sed -i "s|^SENTINEL_BASIC_AUTH_HASH=.*|SENTINEL_BASIC_AUTH_HASH=${HASH}|" .env
    else
      printf 'SENTINEL_BASIC_AUTH_HASH=%s\n' "$HASH" >> .env
    fi
    echo "hash basic-auth generato e salvato in .env"
  fi
fi

mkdir -p data/evidence data/archivebox data/watchlist
if [ ! -f data/watchlist/watchlist.json ] && [ -f data/watchlist.example.json ]; then
  cp data/watchlist.example.json data/watchlist/watchlist.json
  echo "watchlist inizializzata dall'esempio: va sostituita con i dati reali"
fi

docker compose --profile prod up -d --build

API_PORT="$(sed -n 's/^SENTINEL_API_PORT=//p' .env | tail -n 1)"
API_PORT="${API_PORT:-8080}"
echo "attendo l'healthcheck dell'API su 127.0.0.1:${API_PORT}…"
READY=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 2
done
if [ "$READY" -eq 1 ]; then
  echo "API pronta."
else
  echo "warning: l'API non risponde ancora; controlla: docker compose logs sentinel-api" >&2
fi

cat <<'EOF'

Prossimi passi:
  1) ./scripts/yente-update.sh       scarica i dataset OpenSanctions (prima volta: diversi GB)
  2) data/watchlist/watchlist.json   inserisci la watchlist reale
  3) ./scripts/backup.sh             primo backup verificato
  4) deploy/crontab.example          aggiornamento Yente e backup periodici
EOF
