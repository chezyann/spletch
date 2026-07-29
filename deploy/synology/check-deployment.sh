#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

required_files="
$SCRIPT_DIR/portainer-stack.yml
$SCRIPT_DIR/.env.portainer.example
$SCRIPT_DIR/Caddyfile
$SCRIPT_DIR/UPDATE.md
$SCRIPT_DIR/PUBLISH_GHCR.md
$ROOT_DIR/release.json
"

for file in $required_files; do
  if [ ! -s "$file" ]; then
    echo "Fichier absent ou vide: $file" >&2
    exit 1
  fi
done

grep -q 'SPLETCH_IMAGE_REPOSITORY' "$SCRIPT_DIR/portainer-stack.yml"
grep -q 'SPLETCH_VERSION' "$SCRIPT_DIR/portainer-stack.yml"
grep -q 'AUTO_BACKUP_ON_START' "$SCRIPT_DIR/portainer-stack.yml"
grep -q 'pull_policy' "$SCRIPT_DIR/portainer-stack.yml"

echo "Kit de déploiement cohérent."
