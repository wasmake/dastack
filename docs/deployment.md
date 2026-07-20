# Deployment Foundation

Phase 2 has a working host-run application, worker agent, BullMQ reconciliation runner, and local Compose dependency stack, not a production deployment. The repository has no application or worker image and no production ingress route. Compose is designed for one Linux developer host, uses placeholder credentials, publishes administrative UIs to loopback, and gives cAdvisor privileged host access.

Use this document as a production-readiness boundary, not as a claim that the current stack is deployable unchanged.

## Current Runtime Requirements

The application validates environment values when a server path first needs them. A production environment requires:

- HTTPS `APP_URL` and matching public `AUTH_URL`
- A high-entropy `AUTH_SECRET` of at least 32 characters
- `MONGODB_URI` and `MONGODB_DB`
- `REDIS_URL` for distributed rate limiting and readiness
- `EMAIL_ADAPTER=resend`, `RESEND_API_KEY`, and a verified `EMAIL_FROM`; `EMAIL_REPLY_TO` is optional
- `AUTH_GITHUB_ID` with `AUTH_GITHUB_SECRET`
- `AUTH_GOOGLE_ID` with `AUTH_GOOGLE_SECRET`
- `WORKER_SYSTEM_ACTOR_ID` and `WORKER_SYSTEM_ORGANIZATION_ID` for worker/reconciliation audits
- A protected `WORKER_ENROLLMENT_TOKEN_DIGEST` only while enrolling a worker
- HTTPS worker transport; `WORKER_ALLOW_INSECURE_HTTP` must remain false

`NEXT_PUBLIC_APP_URL` should match the public application URL. Keep `TRUST_PROXY=false` unless the application is behind a known proxy that removes untrusted forwarding headers and supplies the real client address. This setting controls whether request context and rate limiting trust the first `X-Forwarded-For` value; it is not the Auth.js host-trust switch.

## Required External Setup

### Resend

1. Create separate Resend API keys for staging and production.
2. Verify the sending domain and publish required SPF and DKIM records.
3. Set `RESEND_API_KEY`, a verified `EMAIL_FROM`, and an optional monitored `EMAIL_REPLY_TO`.
4. Set `EMAIL_ADAPTER=resend`. Production environment validation rejects the file adapter.

The development file adapter provides neither remote delivery nor a production retention/access-control policy. It writes complete message HTML, including live links, to `EMAIL_DEV_DIR` and must not be used in staging or production.

### GitHub OAuth

1. Create a dedicated GitHub OAuth App for each environment.
2. Set its homepage URL to the public `APP_URL`.
3. Set the authorization callback URL to `APP_URL/api/auth/callback/github`.
4. Store `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` in the deployment secret manager.

The implementation accepts GitHub sign-in only when the provider API reports a verified address matching the Auth.js user email.

### Google OAuth

1. Configure an OAuth consent screen and an OAuth 2.0 Web application for each environment.
2. Add the exact public application origin.
3. Add `APP_URL/api/auth/callback/google` as an authorized redirect URI.
4. Store `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in the deployment secret manager.

The implementation requires Google's `email_verified` claim. Both OAuth providers disable dangerous email-based account linking.

## Target Boundaries

- Build immutable, non-root application, job-runner, and worker-agent images before deployment.
- Run the worker agent in a separate trust boundary and account from the control plane. Do not co-locate a future execution runtime until its isolation model is implemented and reviewed.
- Select one ingress implementation. Terminate TLS, enforce request/body/time limits, emit structured access logs, and route the application using `/api/health/live` for liveness and `/api/health/ready` for dependency readiness.
- Use a multi-member managed MongoDB replica set and managed Redis with private networking, authentication, transport encryption, and tested failover.
- Introduce scoped S3 credentials only when an application object-storage path is implemented. The current MinIO bucket is local infrastructure, not a production storage design.
- Store application, provider, worker, and command-signing secrets in a platform secret manager. Vault integration is not implemented, and `.env` or Compose placeholder defaults must not be deployed.
- Pin promoted images by verified digest, scan images, produce an SBOM, and define a patch cadence.

## Security and Data

- Generate independent high-entropy Auth.js, database, provider, worker-enrollment, and command-signing secrets.
- Design application-layer encryption and key rotation before treating OAuth provider tokens or future credentials as production-safe at rest. The current encryption-key environment placeholders are not consumed by application code.
- Keep `APP_URL`, `AUTH_URL`, provider redirects, allowed hosts, and ingress forwarding behavior aligned. The application rejects an Auth.js request URL origin that differs from `APP_URL` and custom mutations require the exact `APP_URL` origin.
- Restrict MongoDB and Redis network access to the application and operational principals. Do not expose either datastore publicly.
- Do not mount Docker or containerd sockets into the control plane, job runner, or workers. Replace or isolate cAdvisor as described in the [threat model](threat-model.md).
- Use a fresh, operator-approved enrollment token per worker. Rotate worker credentials before expiry and define an emergency disable/revocation procedure; the current agent and API do not automate those operations.
- Protect and monitor `AUTH_SECRET` because it keys Auth.js state and source-address HMACs. Secret rotation and mass session invalidation need an explicit procedure.
- Define retention, access, export, and tamper-detection controls for audit and email-delivery records.

## Reliability and Operations

- Keep liveness dependency-independent. Readiness currently checks environment and MongoDB, plus Redis outside development; configure ingress and orchestrator thresholds so a transient dependency failure does not create a restart loop.
- Define a controlled index and data migration process. Mongoose automatically builds indexes outside production but deliberately disables `autoIndex` in production.
- Back up MongoDB and any future object storage, encrypt backups, and regularly test restoration before claiming recoverability. No product backup workflow exists today.
- Define Redis persistence and high availability for rate-limit and BullMQ continuity. Assign every deployment sharing Redis a distinct `JOB_QUEUE_PREFIX`. Run the job runner as a supervised singleton or otherwise preserve the current concurrency assumptions.
- Route metrics, audit events, email delivery failures, and application logs to access-controlled systems. Define SLOs and alerts for errors, latency, authentication abuse, dependency health, certificate expiry, and recovery failures.
- Perform staged rollout and rollback with immutable image references. Test session validation, OAuth callbacks, email links, origin checks, organization transactions, and readiness behind the real proxy chain.

## Deferred Systems

Stripe variables and control-command signing configuration are present in `.env.example`, but billing, command delivery, and worker execution are outside Phase 2. There are also no provisioning, Vault, backup, or domain-management integrations.

Before enabling Stripe, implement raw-body signature verification, idempotent event handling, environment-separated products and prices, authorization, and reconciliation. Keep `STRIPE_ENABLED=false` until those controls and tests exist.

Before adding provisioning or workload execution, implement command delivery, agent credential rotation, sandboxing, scoped workload credentials, egress policy, administrative worker lifecycle controls, and the remaining boundaries described in [worker security](worker-security.md). The current signed reporting protocol and reserved role permissions do not satisfy those execution requirements.
