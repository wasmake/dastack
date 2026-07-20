# DAStack

DAStack Phase 2 is an implemented Next.js App Router control plane with identity, organizations, projects, environments, service-template drafts, resource reservations, a signed worker protocol, and scheduled reconciliation jobs. The dashboard reports persisted API state and does not synthesize infrastructure, quota, or catalog data.

The repository includes a loopback-only Docker Compose stack for MongoDB, Redis, MinIO, Caddy, Nginx, Prometheus, and cAdvisor. The application, worker agent, and BullMQ runner execute as separate host processes during local development; Caddy and Nginx do not proxy them.

Workload provisioning and execution, service lifecycle operations, Stripe billing, Vault secret resolution, product backup workflows, domain management, and a production deployment topology are not implemented. Worker enrollment and heartbeats are real, but Phase 2 intentionally stops before command delivery or access to a container runtime.

## Requirements

- Node.js 22 or later
- pnpm 11.15.0
- Linux Docker Engine and Docker Compose v2
- `curl` for infrastructure checks

## Install and Run

Install the JavaScript dependencies:

```bash
pnpm install
```

Create the local environment file and bootstrap Docker dependencies:

```bash
cp .env.example .env
chmod 600 .env
./scripts/bootstrap-local.sh
```

Review `.env` before bootstrap and replace its recognizable local credentials before using a shared host. Then start the host-run application:

```bash
pnpm dev
```

Open <http://localhost:3000>. The application health endpoints are <http://localhost:3000/api/health/live>, <http://localhost:3000/api/health/ready>, and <http://localhost:3000/api/health>. Configure and enroll a worker before creating environments, then start `pnpm jobs:dev`; see [Local setup](docs/local-setup.md#worker-enrollment-and-heartbeats).

`EMAIL_ADAPTER=file` writes development messages to `EMAIL_DEV_DIR`, which defaults to `.local/emails`. The file transport is rejected in production; production uses Resend with `RESEND_API_KEY`, `EMAIL_FROM`, and optional `EMAIL_REPLY_TO`.

## Verification

Run the repository scripts exactly as follows:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

The integration suite requires the local MongoDB replica set. The end-to-end script requires Playwright browser dependencies and a free `E2E_PORT` (default `3000`). It creates a database-scoped user for a uniquely named disposable database, generates a one-use test enrollment token, enrolls a real Ed25519 worker through the API, sends signed heartbeats, and removes the database and per-run artifacts after the browser server exits. Lifecycle credentials remain in the outer wrapper. Local runs derive them from `MONGO_ROOT_*`; CI can provide `E2E_MONGODB_URI`.

Useful infrastructure commands:

```bash
./scripts/check-local.sh
./scripts/validate-infra.sh
docker compose config --quiet
docker compose up -d
docker compose ps
docker compose logs -f
docker compose down
```

## Phase 2 Scope

Implemented:

- Next.js App Router UI for marketing, authentication, invitation acceptance, onboarding, and the authenticated dashboard shell
- Auth.js credentials, Resend magic-link, GitHub, and Google providers, with OAuth providers enabled when their credentials are configured
- Argon2id password registration, one-time email verification, password recovery, and account-enumeration-resistant public responses
- JWT-backed Auth.js login plus persisted, expiring, individually revocable `AppSession` records and session management APIs
- MongoDB models for users, Auth.js accounts/tokens, application sessions, auth tokens, organizations, roles, members, invitations, audit logs, and email delivery records
- Organizations with built-in roles, server-side permission checks, invitations, role changes, member removal, invitation revocation, ownership transfer, and leave flows
- Resend production email and a development-only file transport with React Email templates and delivery records
- Redis-backed rate limiting outside development, with an in-memory limiter for local development
- Application liveness/readiness endpoints and the existing loopback-only Compose dependency and monitoring stack
- Project and environment CRUD with optimistic versions, soft deletion, project icons, custom environment types, and worker-region availability checks
- Versioned service-template manifests, published catalog reads, JSON Schema wizard validation, secret-reference enforcement, provider-neutral desired configuration, and per-user persisted drafts
- Resource-entitlement reads and atomic, idempotent organization/worker reservations with confirm, release, expiry, audit, and outbox records
- A global worker pool with one-use enrollment tokens, per-worker Ed25519 credentials, signed heartbeat/result/rotation routes, persisted replay protection, host capacity reporting, and credential expiry
- BullMQ queue registration plus implemented stale-reservation and disconnected-worker processors in an independently operated runner
- Responsive dashboard views for projects, environments, service catalog, members, worker nodes, entitlements, and live organization metrics

Not implemented:

- Worker command creation, delivery, polling, execution, or sandboxing
- Application or database provisioning and service lifecycle management
- Stripe products, checkout, subscriptions, usage charging, or webhooks
- Vault or another application-integrated secret store
- Product backup/restore workflows, domain or DNS management, and application object-storage workflows
- An application container, configured production ingress, or a production deployment topology
- Template or entitlement administration APIs, outbox publishing, and usage-ledger writers

The template catalog and entitlement screens remain empty or show an explicit API error until an operator supplies those records. No local bootstrap inserts fake business objects. Built-in permission names and declared queue names do not make deferred product systems available.

## Documentation

- [Local setup](docs/local-setup.md)
- [Architecture and diagrams](docs/architecture.md)
- [Phase 2 API](docs/api.md)
- [Threat model](docs/threat-model.md)
- [Deployment foundation](docs/deployment.md)
- [Worker security contract](docs/worker-security.md)
