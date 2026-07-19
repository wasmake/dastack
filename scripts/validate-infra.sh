#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.example}"

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

scripts=(
  "$ROOT_DIR/scripts/bootstrap-local.sh"
  "$ROOT_DIR/scripts/bootstrap-mongo.sh"
  "$ROOT_DIR/scripts/check-local.sh"
  "$ROOT_DIR/scripts/validate-infra.sh"
  "$ROOT_DIR/docker/mongo/init-replica.sh"
  "$ROOT_DIR/docker/mongo/check-replica.sh"
)

for script in "${scripts[@]}"; do
  bash -n "$script"
done

sh -n "$ROOT_DIR/docker/mongo/init-keyfile.sh"
sh -n "$ROOT_DIR/docker/minio/init-bucket.sh"
"${compose[@]}" config --quiet

docker run --rm --network none \
  --volume "$ROOT_DIR/docker/caddy:/etc/caddy:ro" \
  caddy:2.10.0-alpine \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

docker run --rm --network none \
  --volume "$ROOT_DIR/docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
  --volume "$ROOT_DIR/docker/nginx/conf.d:/etc/nginx/conf.d:ro" \
  --volume "$ROOT_DIR/docker/nginx/ingress.d:/etc/nginx/ingress.d:ro" \
  nginx:1.28.0-alpine \
  nginx -t

docker run --rm --network none \
  --entrypoint /bin/promtool \
  --volume "$ROOT_DIR/docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  prom/prometheus:v3.4.1 \
  check config /etc/prometheus/prometheus.yml

printf '%s\n' 'Compose, shell, Caddy, Nginx, and Prometheus validation passed.'
