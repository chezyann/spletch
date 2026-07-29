#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
REPOSITORY=${SPLETCH_IMAGE_REPOSITORY:-spletch-synology}
VERSION=${SPLETCH_VERSION:-0.5.1}
IMAGE_NAME="$REPOSITORY:$VERSION"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker/Container Manager est introuvable." >&2
  exit 1
fi

ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) PLATFORM=linux/amd64 ;;
  aarch64|arm64) PLATFORM=linux/arm64 ;;
  *) echo "Architecture non prise en charge automatiquement: $ARCH" >&2; exit 1 ;;
esac

echo "Construction de $IMAGE_NAME pour $PLATFORM…"
docker build --pull --platform "$PLATFORM" -f "$SCRIPT_DIR/Dockerfile" -t "$IMAGE_NAME" "$ROOT_DIR"
echo "Image prête: $IMAGE_NAME"
