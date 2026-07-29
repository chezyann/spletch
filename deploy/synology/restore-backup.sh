#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /volume1/docker/spletch/backups/DATE" >&2
  exit 1
fi

SOURCE=$1
DATA_PATH=${DATA_PATH:-/volume1/docker/spletch/data}
CONTAINER=${CONTAINER:-spletch}

DB_SOURCE="$SOURCE/spletch.sqlite"
[ -f "$DB_SOURCE" ] || DB_SOURCE="$SOURCE/atelier.sqlite"
[ -f "$DB_SOURCE" ] || { echo "spletch.sqlite absent de la sauvegarde." >&2; exit 1; }

echo "Arrêt du conteneur $CONTAINER…"
docker stop "$CONTAINER" >/dev/null
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "${DATA_PATH}.before-restore-$STAMP"
cp -a "$DATA_PATH/." "${DATA_PATH}.before-restore-$STAMP/"
rm -f "$DATA_PATH/spletch.sqlite" "$DATA_PATH/spletch.sqlite-wal" "$DATA_PATH/spletch.sqlite-shm"
cp -a "$DB_SOURCE" "$DATA_PATH/spletch.sqlite"
if [ -d "$SOURCE/assets" ]; then
  rm -rf "$DATA_PATH/assets"
  cp -a "$SOURCE/assets" "$DATA_PATH/assets"
fi
chown -R 1000:1000 "$DATA_PATH"
docker start "$CONTAINER" >/dev/null
echo "Restauration terminée. Copie précédente: ${DATA_PATH}.before-restore-$STAMP"
