# DAStack

DAStack Phase 1 is an implemented Next.js App Router control-plane foundation. It includes the marketing, authentication, onboarding, and dashboard UI; Auth.js password, magic-link, GitHub, and Google sign-in; Argon2id registration; email verification and password recovery; revocable application sessions; organization membership and server-side role permissions; transactional email; MongoDB models; rate limiting; audit records; and application health endpoints.

The repository also includes a loopback-only Docker Compose stack for MongoDB, Redis, MinIO, Caddy, Nginx, Prometheus, and cAdvisor. The application runs on the host during local development and is not proxied by Caddy or Nginx.

Workers, workload provisioning, Stripe billing, Vault integration, backup workflows, domain management, and a production deployment topology are not implemented.

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

Open <http://localhost:3000>. The application health endpoints are <http://localhost:3000/api/health/live>, <http://localhost:3000/api/health/ready>, and <http://localhost:3000/api/health>.

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

The integration suite requires the local MongoDB replica set. The end-to-end suite requires its Playwright browser dependencies in addition to the application environment.

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

## Phase 1 Scope

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

Not implemented:

- Worker enrollment, job dispatch, execution, or sandboxing
- Application or database provisioning and service lifecycle management
- Stripe products, checkout, subscriptions, usage charging, or webhooks
- Vault or another application-integrated secret store
- Product backup/restore workflows, domain or DNS management, and application object-storage workflows
- An application container, configured production ingress, or a production deployment topology

The built-in role permission vocabulary reserves names for some later capabilities; those permission strings do not make the corresponding product features available.

## Documentation

- [Local setup](docs/local-setup.md)
- [Architecture and diagrams](docs/architecture.md)
- [Phase 1 API](docs/api.md)
- [Threat model](docs/threat-model.md)
- [Deployment foundation](docs/deployment.md)
- [Worker security outline](docs/worker-security.md)
