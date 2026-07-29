#!/bin/sh
set -eu
URL=${1:-http://127.0.0.1:4080/api/health}
printf 'Santé HTTP: '
curl -fsS "$URL"
printf '\nConteneurs:\n'
docker ps --filter 'name=spletch' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
