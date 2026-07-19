#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Missing %s. Copy .env.example to .env and review it first.\n' "$ENV_FILE" >&2
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
"${compose[@]}" up --detach mongo
"${compose[@]}" run --rm mongo-rs-init
"${compose[@]}" exec --no-TTY mongo /bin/bash /scripts/check-replica.sh
