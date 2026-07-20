# Phase 2 API

The Next.js application implements health, identity, organization, project, environment, template, draft, entitlement, reservation, and worker APIs under `/api`. Provisioning, deployed services, billing mutations, secrets, backups, domains, and product object-storage APIs are not implemented.

## Conventions

Except for the Auth.js protocol routes, successful application API responses use:

```json
{
  "data": {},
  "requestId": "request-correlation-id"
}
```

Errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request was invalid.",
    "fields": [{ "path": "email", "code": "invalid_format" }]
  },
  "requestId": "request-correlation-id"
}
```

`fields` is present only for validation failures. Responses set `X-Request-Id` and `Cache-Control: no-store`; a valid incoming `X-Request-Id` is retained. Rate-limit responses use status `429` and include `Retry-After`. JSON readers reject invalid JSON and declared bodies larger than 64 KiB.

Auth.js endpoints use Auth.js request and response formats rather than the application envelope.

## Authentication and Origin Checks

Browser-authenticated endpoints use the Auth.js session cookie and also validate the persisted `AppSession` against its user, token version, revocation state, and expiry. Worker enrollment uses a one-use bearer token; all later worker mutations use signed machine requests rather than a browser session.

Every browser-facing custom `POST`, `PATCH`, and `DELETE` endpoint below requires:

- An `Origin` header exactly equal to the origin of `APP_URL`
- If `Sec-Fetch-Site` is present, a value of `same-origin`, `same-site`, or `none`

A missing or mismatched origin returns `403 INVALID_ORIGIN`. This requirement applies to public account mutations as well as authenticated mutations. The email-verification `GET` is token-authorized. Worker machine routes do not use browser origin checks; they require HTTPS and their token or signature protocol instead.

The Auth.js catch-all route separately requires the request URL origin to equal the `APP_URL` origin. Password and magic-link sign-in also apply the custom mutation-origin check. GitHub and Google callbacks follow the OAuth redirect protocol and require a verified provider email in the sign-in callback.

## Health

| Method | Endpoint            | Auth   | Response `data`                                                                                          |
| ------ | ------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/health/live`  | Public | `{ status: "alive", timestamp }`; process liveness only                                                  |
| `GET`  | `/api/health/ready` | Public | `{ ready, checks }`; validates environment and MongoDB, plus Redis outside development                   |
| `GET`  | `/api/health`       | Public | `{ status, ready, checks }`; combined readiness response with `status` set to `healthy` or `unavailable` |

Readiness returns `200` when ready and `503` otherwise. In development, the rate limiter check reports `memory` and does not ping Redis. These endpoints expose status labels, not credentials or connection details.

## Auth.js Protocol

`GET` and `POST` requests under `/api/auth/[...nextauth]` are handled by Auth.js. The active provider IDs are:

- `credentials` for email/password
- `resend` for email magic links
- `github` for GitHub OAuth
- `google` for Google OAuth

This route supplies the standard Auth.js protocol surface, including `/api/auth/session`, `/api/auth/providers`, `/api/auth/csrf`, provider sign-in and callback paths, sign-out, errors, and magic-link verification. Provider-specific paths include `/api/auth/signin/{provider}` and `/api/auth/callback/{provider}`. GitHub and Google are usable only when their corresponding environment credentials are configured.

## Registration and Recovery

| Method | Endpoint                           | Auth   | JSON input                                                             | Response `data`                        |
| ------ | ---------------------------------- | ------ | ---------------------------------------------------------------------- | -------------------------------------- |
| `POST` | `/api/auth/register`               | Public | `{ name, email, password, passwordConfirmation, termsAccepted: true }` | Generic accepted message, status `202` |
| `GET`  | `/api/auth/verify-email?token=...` | Public | Query token                                                            | `{ verified: true }`                   |
| `POST` | `/api/auth/verify-email/resend`    | Public | `{ email }`                                                            | Generic accepted message, status `202` |
| `POST` | `/api/auth/password/forgot`        | Public | `{ email }`                                                            | Generic accepted message, status `202` |
| `POST` | `/api/auth/password/reset`         | Public | `{ token, password, passwordConfirmation }`                            | `{ reset: true }`                      |

Registration passwords must be 12 to 128 characters and contain lowercase, uppercase, numeric, and symbol characters. Passwords are stored as Argon2id hashes. Verification tokens expire after 24 hours, password-reset tokens expire after 30 minutes, and both are random, stored by digest, and consumed once. A password reset increments the user's token version and revokes all application sessions.

Registration, verification resend, and forgotten-password responses intentionally do not reveal whether an account exists or is eligible.

## Sessions

| Method   | Endpoint                           | Auth          | Input | Response `data`                                                                              |
| -------- | ---------------------------------- | ------------- | ----- | -------------------------------------------------------------------------------------------- |
| `GET`    | `/api/auth/sessions`               | Authenticated | None  | Array of `{ id, provider, userAgent, createdAt, lastSeenAt, expiresAt, revokedAt, current }` |
| `DELETE` | `/api/auth/sessions/{sessionId}`   | Authenticated | None  | `{ revoked: true }`                                                                          |
| `POST`   | `/api/auth/sessions/revoke-others` | Authenticated | None  | `{ revoked }`, where `revoked` is the number of sessions changed                             |

Credential sessions last one day unless `remember` is true; remembered credentials sessions and provider sessions last up to 30 days. Revoking the current session invalidates it on its next validation.

## Organizations

All organization endpoints require authentication. IDs are 24-character MongoDB ObjectId strings. Authorization is evaluated on the server against the caller's active membership and persisted role.

| Method   | Endpoint                                                         | Permission or rule                         | JSON input            | Response `data`                                                                 |
| -------- | ---------------------------------------------------------------- | ------------------------------------------ | --------------------- | ------------------------------------------------------------------------------- |
| `GET`    | `/api/organizations`                                             | Active memberships                         | None                  | Organizations visible to the caller, including their role                       |
| `POST`   | `/api/organizations`                                             | Any authenticated user                     | `{ name }`            | New `{ id, name, slug, status, version }`, status `201`                         |
| `GET`    | `/api/organizations/{organizationId}`                            | `organization:read`                        | None                  | Organization details and the caller's role and permissions                      |
| `GET`    | `/api/organizations/{organizationId}/roles`                      | `role:list`                                | None                  | Built-in role records and permission arrays                                     |
| `GET`    | `/api/organizations/{organizationId}/members`                    | `member:list`                              | None                  | Active and suspended member records                                             |
| `PATCH`  | `/api/organizations/{organizationId}/members/{memberId}`         | `member:update`                            | `{ roleId, version }` | `{ id, roleId, version }`                                                       |
| `DELETE` | `/api/organizations/{organizationId}/members/{memberId}`         | `member:remove`                            | None                  | `{ removed: true }`                                                             |
| `DELETE` | `/api/organizations/{organizationId}/members/me`                 | Caller is an active member                 | None                  | `{ left: true }`                                                                |
| `GET`    | `/api/organizations/{organizationId}/invitations`                | `member:list`                              | None                  | Invitation records with effective pending, accepted, revoked, or expired status |
| `POST`   | `/api/organizations/{organizationId}/invitations`                | `member:invite`                            | `{ email, roleId }`   | New invitation summary, status `201`                                            |
| `DELETE` | `/api/organizations/{organizationId}/invitations/{invitationId}` | `member:invite`                            | None                  | `{ id, status: "revoked" }`                                                     |
| `POST`   | `/api/organizations/invitations/accept`                          | Token email matches authenticated user     | `{ token }`           | `{ organizationId, membershipId }`                                              |
| `POST`   | `/api/organizations/{organizationId}/ownership`                  | Caller has `member:update` and is an owner | `{ targetMemberId }`  | `{ ownerMemberId }`                                                             |

Organization creation atomically creates the organization, the five built-in roles (`owner`, `admin`, `developer`, `billing`, and `viewer`), and the creator's owner membership. Invitation acceptance and ownership-sensitive mutations also use MongoDB transactions.

Role assignment rejects permission escalation: an actor cannot grant permissions they do not hold. Optimistic membership updates require the current `version`. Last-owner checks prevent demotion, removal, or leaving until another owner exists; explicit ownership transfer promotes the target and changes the transferring owner to admin.

Role definitions contain reserved permissions for later product areas. Their presence does not imply that provisioning, billing mutations, backups, domains, ingress management, public IPs, or secrets are implemented.

## Projects and Environments

All routes below require an authenticated active organization member. IDs are MongoDB ObjectId strings. Updates require the current optimistic `version`; stale writes return `409 VERSION_CONFLICT`.

| Method                   | Endpoint                                                                                | Permission                           | Input or result                                                              |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| `GET`, `POST`            | `/api/organizations/{organizationId}/projects`                                          | `project:view`, `project:create`     | List projects or create from `{ name, slug?, description?, icon? }`          |
| `GET`, `PATCH`, `DELETE` | `/api/organizations/{organizationId}/projects/{projectId}`                              | `project:view`, `project:create`     | Read, update with `version`, or soft-delete a project                        |
| `GET`, `POST`            | `/api/organizations/{organizationId}/projects/{projectId}/environments`                 | `project:view`, `environment:manage` | List environments or create from `{ name, slug?, type, isDefault?, region }` |
| `GET`, `PATCH`, `DELETE` | `/api/organizations/{organizationId}/projects/{projectId}/environments/{environmentId}` | `project:view`, `environment:manage` | Read, update with `version`, or soft-delete an environment                   |

Project icons are `box`, `boxes`, `database`, `globe`, or `layers`. Environment types are `production`, `preview`, `development`, or `custom`. Creation and region changes require a schedulable worker in that region with a heartbeat no older than two minutes. The generated `networkId` is persisted desired state; no Docker network is created. Projects with active environments and environments with active reservations cannot be deleted.

## Templates and Service Drafts

| Method                   | Endpoint                                                                                                 | Auth             | Result                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------- |
| `GET`                    | `/api/templates`                                                                                         | Public           | Latest published global version of each template           |
| `GET`                    | `/api/templates/{templateId}`                                                                            | Public           | Latest published version of one template                   |
| `GET`                    | `/api/templates/{templateId}/versions/{manifestVersion}`                                                 | Public           | Exact published version                                    |
| `GET`, `POST`            | `/api/organizations/{organizationId}/projects/{projectId}/environments/{environmentId}/drafts`           | `service:create` | List the caller's active drafts or validate and create one |
| `GET`, `PATCH`, `DELETE` | `/api/organizations/{organizationId}/projects/{projectId}/environments/{environmentId}/drafts/{draftId}` | `service:create` | Read, update with `version`, or abandon the caller's draft |

A draft input is `{ name, templateId, manifestVersion, values }`. Wizard values are validated against the manifest JSON Schema and mapped to provider-neutral desired configuration. Secret fields accept only `vault://...` references; Phase 2 does not resolve them. Abandoned drafts receive a 30-day TTL. There is no manifest import/publication HTTP endpoint, draft submission endpoint, deployed-service record, or deploy action. Operators must call the internal manifest service from trusted administration code until an administration API exists.

## Entitlements and Reservations

| Method | Endpoint                                                                   | Permission          | Input or result                                                             |
| ------ | -------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| `GET`  | `/api/organizations/{organizationId}/entitlements`                         | `billing:read`      | Entitlement status, validity, limits, and reserved/allocated counters       |
| `POST` | `/api/organizations/{organizationId}/reservations`                         | `service:create`    | Atomically reserve organization and worker capacity                         |
| `GET`  | `/api/organizations/{organizationId}/reservations/{reservationId}`         | `project:view`      | Read one tenant-scoped reservation                                          |
| `POST` | `/api/organizations/{organizationId}/reservations/{reservationId}/confirm` | `service:lifecycle` | Idempotently move reserved counters to allocated counters                   |
| `POST` | `/api/organizations/{organizationId}/reservations/{reservationId}/release` | `service:lifecycle` | Idempotently release counters; optional `reason` is `requested` or `failed` |

Reservation creation requires an `Idempotency-Key` header and a strict body containing `projectId`, `environmentId`, optional `workerNodeId`, and resource quantities for CPU millicores, memory MiB, storage GiB, transfer GiB, backups, and concurrent operations. CPU, memory, and concurrency must be positive; the other quantities may be zero. It requires a currently valid active/trialing entitlement and eligible worker capacity, reserves one service for 15 minutes, and writes an audit and pending outbox event in the transaction. Transfer and backup quotas are organization-only. The independent job runner releases stale unconfirmed reservations.

There is no entitlement administration API, reservation list API, outbox publisher, usage writer, or billing collector. Project and environment count limits are checked during reservation, not during project or environment creation.

## Worker Protocol

`GET /api/workers?organizationId=...` uses a browser session and `environment:manage`; it returns all non-disabled nodes in the global worker pool. Worker machine routes are:

| Method | Endpoint                                      | Authentication                                         | Status |
| ------ | --------------------------------------------- | ------------------------------------------------------ | ------ |
| `POST` | `/api/workers/enroll`                         | Bearer token matching `WORKER_ENROLLMENT_TOKEN_DIGEST` | `201`  |
| `POST` | `/api/workers/heartbeat`                      | Active Ed25519 worker credential                       | `202`  |
| `POST` | `/api/workers/results`                        | Active Ed25519 worker credential                       | `202`  |
| `POST` | `/api/workers/credentials/rotation-challenge` | Active Ed25519 worker credential                       | `201`  |
| `POST` | `/api/workers/credentials/rotate`             | Old credential plus replacement-key proof              | `201`  |

Signed requests send `x-dastack-worker-key-id`, `x-dastack-worker-timestamp`, `x-dastack-worker-nonce`, and `x-dastack-worker-signature`. The signature covers a versioned domain, method, pathname, timestamp, nonce, and raw-body SHA-256 digest. Credentials must be active and unexpired, timestamps must be within the configured skew, and each nonce is consumed once in MongoDB. Worker bodies are limited to 32 KiB. HTTPS is required except explicit non-production loopback HTTP.

Heartbeats report `ready`, `degraded`, or `draining`, authoritative host capacity, reported allocation, host usage, and runtime metadata. Only `ready` nodes are schedulable. Results are accepted only for a pre-existing command record assigned to that worker; Phase 2 does not create or deliver such commands, and the included agent sends only enrollment and heartbeats.

## Job Runner

`pnpm jobs:dev` is a separate BullMQ process. It registers the queue vocabulary but runs only `reconcile-stale-reservations` and `detect-disconnected-workers`. Repeat schedulers enqueue those jobs at the configured intervals. No HTTP API starts the runner, and the remaining queue names have no consumers.

## Local Infrastructure Endpoints

These are Compose service endpoints, not Next.js application APIs:

| Component  | Endpoint                                      | Meaning                             |
| ---------- | --------------------------------------------- | ----------------------------------- |
| Caddy      | `GET http://127.0.0.1:8080/healthz`           | Caddy process/config can serve HTTP |
| Nginx      | `GET http://127.0.0.1:8081/healthz`           | Nginx process/config can serve HTTP |
| MinIO      | `GET http://127.0.0.1:9000/minio/health/live` | MinIO process liveness              |
| cAdvisor   | `GET http://127.0.0.1:8082/healthz`           | cAdvisor process health             |
| Prometheus | `GET http://127.0.0.1:9090/-/healthy`         | Prometheus process health           |
| Prometheus | `GET http://127.0.0.1:9090/-/ready`           | Prometheus query readiness          |

The Compose ports bind to loopback. Caddy and Nginx return `404` for all other paths and do not proxy the host-run application.
