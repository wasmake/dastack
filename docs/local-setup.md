# Local Setup

## Prerequisites

- Linux host with Docker Engine and Docker Compose v2
- Node.js 22 or later and pnpm 11.15.0
- `curl` for host-side endpoint checks
- Enough Docker resources for MongoDB, Redis, MinIO, both ingress servers, Prometheus, and cAdvisor

cAdvisor uses Linux host paths, `/dev/kmsg`, and exact Docker/containerd socket mounts. Docker Desktop and rootless Docker may require platform-specific changes. Do not broaden mounts or expose either runtime API over TCP to make it work. See the [threat model](threat-model.md).

## First Start

Run these commands from the repository root:

```bash
pnpm install
cp .env.example .env
chmod 600 .env
```

Review `.env`. The recognizable infrastructure credentials are suitable only for a single-user, loopback-only workstation. Replace them before use on a shared host and keep connected values synchronized.

The default development email transport needs no external account. GitHub and Google credentials can remain empty if those login buttons are not needed locally. Then bootstrap the dependency stack and start Next.js:

```bash
./scripts/bootstrap-local.sh
pnpm dev
```

The bootstrap script validates Compose, starts MongoDB, idempotently initializes replica set `rs0` and its technical application user, starts the remaining services, creates the private MinIO bucket, and runs health checks. It does not start the Next.js application.

To start Compose without the wrapper:

```bash
docker compose config --quiet
docker compose up -d
./scripts/check-local.sh
```

Plain `docker compose up -d` includes one-shot Mongo and MinIO initialization services. `bootstrap-local.sh` is preferred because it initializes Mongo in a deterministic order and verifies the complete stack.

## Endpoints

| Service               | Local endpoint                           | Purpose                                                |
| --------------------- | ---------------------------------------- | ------------------------------------------------------ |
| Application           | `http://localhost:3000`                  | Host-run Phase 1 Next.js UI and API                    |
| Application liveness  | `http://localhost:3000/api/health/live`  | Process liveness                                       |
| Application readiness | `http://localhost:3000/api/health/ready` | Environment and application dependency readiness       |
| MongoDB               | `127.0.0.1:27017`                        | Authenticated single-member `rs0`                      |
| Redis                 | `127.0.0.1:6379`                         | Authenticated dependency; app limits use memory in dev |
| MinIO API             | `http://127.0.0.1:9000`                  | S3-compatible local infrastructure; no app workflow    |
| MinIO console         | `http://127.0.0.1:9001`                  | Local object storage console                           |
| Caddy                 | `http://127.0.0.1:8080/healthz`          | Baseline ingress health only                           |
| Nginx                 | `http://127.0.0.1:8081/healthz`          | Baseline ingress health only                           |
| cAdvisor              | `http://127.0.0.1:8082`                  | Local container metrics UI                             |
| Prometheus            | `http://127.0.0.1:9090`                  | Local metrics and targets                              |

All published infrastructure ports explicitly bind to loopback. Caddy and Nginx return `404` outside their health endpoints and do not proxy the host-run application.

## Application Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

`pnpm test:integration` requires the local MongoDB replica set. `pnpm test:e2e` starts or reuses the development server and runs desktop Chromium plus the configured mobile visual checks; install Playwright browser dependencies if they are not present.

## Infrastructure Operations

```bash
./scripts/check-local.sh
./scripts/validate-infra.sh
docker compose ps
docker compose logs -f mongo mongo-rs-init
docker compose logs -f prometheus cadvisor
docker compose down
```

`validate-infra.sh` validates all shell scripts, the rendered Compose model, Caddy, Nginx, and Prometheus. It pulls pinned validation images if they are not already local.

To initialize or repair only the local replica set:

```bash
./scripts/bootstrap-mongo.sh
```

Mongo initialization is idempotent. It retains existing data, confirms or initiates `rs0`, and creates or updates only the technical application database user. The health check runs an application-user transaction and aborts it, leaving no probe data. It never creates product users or organizations. The MinIO initializer similarly creates only the configured technical bucket.

## Credential Changes and Reset

Keep `MONGODB_URI`, `MONGODB_INTERNAL_URI`, Mongo component credentials, Redis URLs, Redis password, and S3/MinIO credentials synchronized with their corresponding values. URI-encode credentials if they contain reserved URL characters.

The Mongo replica key is persisted separately and intentionally refuses silent replacement. To change `MONGO_REPLICA_KEY` for disposable local data, remove all local volumes and rebuild:

```bash
docker compose down --volumes
./scripts/bootstrap-local.sh
```

This permanently deletes local MongoDB, Redis, MinIO, and Prometheus data. Back up anything needed first. Mongo root credentials are created only on an empty database volume; changing them also requires an intentional reset or an authenticated database rotation.

## Email Development Mode

The default values are:

```dotenv
EMAIL_ADAPTER=file
EMAIL_DEV_DIR=.local/emails
EMAIL_FROM="DaStack Local <no-reply@example.test>"
EMAIL_REPLY_TO=support@example.test
```

Registration verification, password recovery, magic links, invitations, welcome messages, and password-change notifications write rendered HTML files to `EMAIL_DEV_DIR`. Newly created directories request mode `0700`, message files use mode `0600`, and `.local/` is gitignored. Verify the permissions yourself if `EMAIL_DEV_DIR` already exists. The messages contain usable one-time URLs, so do not publish or share them.

Production rejects the file adapter. Set `EMAIL_ADAPTER=resend`, provide `RESEND_API_KEY`, use a Resend-verified `EMAIL_FROM`, and set `EMAIL_REPLY_TO` when replies should go to a separate monitored address.

## External Providers

The provider integrations are implemented; local credentials determine whether the OAuth buttons are enabled.

- Resend: create an API key, verify the sending domain, and configure SPF/DKIM. Set `RESEND_API_KEY`, `EMAIL_FROM`, and optional `EMAIL_REPLY_TO`.
- GitHub: create an OAuth App, set the homepage to `APP_URL`, and set the callback URL to `APP_URL/api/auth/callback/github`. Configure `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`.
- Google: create an OAuth 2.0 Web application, configure its consent screen and exact origin, and set the redirect URI to `APP_URL/api/auth/callback/google`. Configure `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

Keep `APP_URL`, `AUTH_URL`, and `NEXT_PUBLIC_APP_URL` aligned locally. Never commit provider secrets. Use separate provider applications and keys for local, staging, and production environments.
