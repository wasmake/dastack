#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Missing %s. Run: cp .env.example .env\n' "$ENV_FILE" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  printf '%s\n' 'Docker Engine with the Compose v2 plugin is required.' >&2
  exit 1
fi

compose=(
  docker compose
  --project-directory "$ROOT_DIR"
  --env-file "$ENV_FILE"
  --file "$ROOT_DIR/docker-compose.yml"
)

"${compose[@]}" config --quiet
ENV_FILE="$ENV_FILE" "$ROOT_DIR/scripts/bootstrap-mongo.sh"
"${compose[@]}" up --detach redis minio caddy nginx cadvisor prometheus
"${compose[@]}" run --rm minio-init
ENV_FILE="$ENV_FILE" "$ROOT_DIR/scripts/check-local.sh"
