#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/var/lib/spletch}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/spletch}"
SECRET_FILE="${APP_SECRET_FILE:-$DATA_DIR/app-secret}"
DATABASE_FILE="$DATA_DIR/spletch.sqlite"
LEGACY_DATABASE_FILE="$DATA_DIR/atelier.sqlite"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-/app/scripts/backup.mjs}"

mkdir -p "$DATA_DIR" "$BACKUP_DIR"

# Migration transparente du nom de base utilisé avant le renommage Spletch!.
if [ ! -e "$DATABASE_FILE" ] && [ -e "$LEGACY_DATABASE_FILE" ]; then
  mv "$LEGACY_DATABASE_FILE" "$DATABASE_FILE"
  [ ! -e "$LEGACY_DATABASE_FILE-wal" ] || mv "$LEGACY_DATABASE_FILE-wal" "$DATABASE_FILE-wal"
  [ ! -e "$LEGACY_DATABASE_FILE-shm" ] || mv "$LEGACY_DATABASE_FILE-shm" "$DATABASE_FILE-shm"
fi

if [ -z "${APP_SECRET:-}" ]; then
  if [ ! -s "$SECRET_FILE" ]; then
    umask 077
    node -e "process.stdout.write(require('node:crypto').randomBytes(64).toString('base64url'))" > "$SECRET_FILE"
  fi
  APP_SECRET="$(cat "$SECRET_FILE")"
  export APP_SECRET
fi

if [ "${AUTO_BACKUP_ON_START:-true}" = "true" ] && [ -s "$DATABASE_FILE" ]; then
  echo "Création de la sauvegarde de démarrage pour Spletch! ${APP_VERSION:-inconnue}…"
  if ! BACKUP_INCLUDE_ASSETS="${STARTUP_BACKUP_INCLUDE_ASSETS:-false}" node "$BACKUP_SCRIPT"; then
    if [ "${REQUIRE_STARTUP_BACKUP:-true}" = "true" ]; then
      echo "La sauvegarde de démarrage a échoué; démarrage annulé." >&2
      exit 1
    fi
    echo "AVERTISSEMENT: sauvegarde de démarrage impossible; poursuite autorisée par la configuration." >&2
  fi
fi

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
case "$RETENTION_DAYS" in
  ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS invalide: $RETENTION_DAYS" >&2; exit 1 ;;
esac
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION_DAYS" -exec rm -rf -- {} + 2>/dev/null || true

exec "$@"
