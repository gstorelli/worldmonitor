#!/usr/bin/env bash
# SENTINEL-ADM — verified backup of the platform state.
#
# The only persistent state of the platform is the bind-mounted ./data
# directory (the watchlist): it is packed into a tarball with a SHA-256
# sidecar, then older copies are pruned.
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

if [ ! -d data ]; then
  echo "error: directory ./data assente (watchlist non inizializzata)" >&2
  exit 1
fi

echo "creazione ${NAME}…"
tar -czf "${BACKUP_DIR}/${NAME}" ./data

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
