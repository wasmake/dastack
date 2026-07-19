#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-180}"

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Missing %s. Copy .env.example to .env and review it first.\n' "$ENV_FILE" >&2
  exit 1
fi

if [[ ! "$HEALTH_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  printf '%s\n' 'HEALTH_TIMEOUT_SECONDS must be a positive integer.' >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  printf '%s\n' 'Docker Engine with the Compose v2 plugin is required.' >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  printf '%s\n' 'curl is required to check published HTTP health endpoints.' >&2
  exit 1
fi

compose=(
  docker compose
  --project-directory "$ROOT_DIR"
  --env-file "$ENV_FILE"
  --file "$ROOT_DIR/docker-compose.yml"
)
services=(mongo redis minio caddy nginx cadvisor prometheus)
deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))

"${compose[@]}" config --quiet

for service in "${services[@]}"; do
  while true; do
    container_id="$("${compose[@]}" ps --all --quiet "$service")"
    if [[ -n "$container_id" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
      if [[ "$status" == healthy ]]; then
        printf '%-12s %s\n' "$service" healthy
        break
      fi
      if [[ "$status" == exited || "$status" == dead ]]; then
        printf '%s entered state %s. Inspect: docker compose logs %s\n' "$service" "$status" "$service" >&2
        exit 1
      fi
    fi

    if (( SECONDS >= deadline )); then
      printf 'Timed out waiting for %s to become healthy.\n' "$service" >&2
      exit 1
    fi
    sleep 2
  done
done

"${compose[@]}" exec --no-TTY mongo /bin/bash /scripts/check-replica.sh
"${compose[@]}" exec --no-TTY redis /bin/sh -ec \
  'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping | grep -q PONG'

check_http() {
  local service=$1
  local container_port=$2
  local path=$3
  local address

  address="$("${compose[@]}" port "$service" "$container_port")"
  if [[ ! "$address" =~ ^127\.0\.0\.1:[1-9][0-9]*$ ]]; then
    printf 'No loopback port found for %s:%s (got %q).\n' \
      "$service" "$container_port" "$address" >&2
    return 1
  fi

  curl --fail --silent --show-error --max-time 5 "http://$address$path" >/dev/null
}

check_http minio 9000 /minio/health/live
check_http caddy 8080 /healthz
check_http nginx 8080 /healthz
check_http cadvisor 8080 /healthz
check_http prometheus 9090 /-/healthy

printf '%s\n' 'All local infrastructure checks passed.'
