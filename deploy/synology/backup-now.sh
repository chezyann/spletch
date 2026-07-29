#!/bin/sh
set -eu
CONTAINER=${CONTAINER:-spletch}
docker exec "$CONTAINER" node /app/scripts/backup.mjs
# Conservation locale par défaut: 14 jours.
BACKUP_PATH=${BACKUP_PATH:-/volume1/docker/spletch/backups}
find "$BACKUP_PATH" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf -- {} +
echo "Sauvegarde terminée dans $BACKUP_PATH"
