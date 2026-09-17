#!/usr/bin/env bash
# SENTINEL-ADM — verified backup of the platform state.
#
# Backs up the watchlist (bind ./data), the evidence vault, the ArchiveBox
# captures and the Yente index into a single tarball with a SHA-256 sidecar,
# then prunes older copies.
#
#   BACKUP_DIR=/var/backups/sentinel-adm BACKUP_RETENTION=14 ./scripts/backup.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION="${BACKUP_RETENTION:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="sentinel-adm-${STAMP}.tar.gz"
mkdir -p "$BACKUP_DIR"

volume_for() {
  local container
  container="$(docker compose ps -q "$1" 2>/dev/null || true)"
  if [ -z "$container" ]; then
    echo ""
    return
  fi
  docker inspect -f '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{"\n"}}{{end}}{{end}}' "$container" | head -n 1
}

MOUNTS=()
for service in sentinel-api yente archivebox; do
  volume="$(volume_for "$service")"
  if [ -n "$volume" ]; then
    MOUNTS+=(-v "${volume}:/volumes/${service}:ro")
  else
    echo "warning: nessun volume trovato per ${service}" >&2
  fi
done
MOUNTS+=(-v "${REPO_ROOT}/data:/volumes/watchlist:ro")

echo "creazione ${NAME}…"
docker run --rm "${MOUNTS[@]}" -v "${BACKUP_DIR}:/backup" alpine:3.20 \
  tar -czf "/backup/${NAME}" -C /volumes .

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$BACKUP_DIR" && sha256sum "$NAME" > "${NAME}.sha256" && sha256sum -c "${NAME}.sha256")
else
  (cd "$BACKUP_DIR" && openssl dgst -sha256 "$NAME" > "${NAME}.sha256")
  echo "hash calcolato con openssl (sha256sum non disponibile)"
fi

mapfile -t OLD < <(find "$BACKUP_DIR" -maxdepth 1 -name 'sentinel-adm-*.tar.gz' -type f -printf '%T@ %p\n' \
  | sort -rn | tail -n "+$((RETENTION + 1))" | cut -d' ' -f2-)
if [ "${#OLD[@]}" -gt 0 ]; then
  rm -f -- "${OLD[@]}"
  echo "rimossi ${#OLD[@]} backup oltre la retention di ${RETENTION}"
fi

echo "backup completato: ${BACKUP_DIR}/${NAME}"
