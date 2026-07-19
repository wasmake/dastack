#!/bin/sh
set -eu

: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
: "${MINIO_BUCKET:?MINIO_BUCKET is required}"

case "$MINIO_BUCKET" in
  *[!a-z0-9.-]* | .* | *.)
    printf '%s\n' 'MINIO_BUCKET must be a valid lowercase S3 bucket name.' >&2
    exit 1
    ;;
esac

for attempt in $(seq 1 30); do
  if mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; then
    break
  fi

  if [ "$attempt" -eq 30 ]; then
    printf '%s\n' 'MinIO did not become reachable within 60 seconds.' >&2
    exit 1
  fi
  sleep 2
done

mc mb --ignore-existing "local/$MINIO_BUCKET"
