# Phase 1 API

The Next.js application implements health, identity, session, and organization APIs under `/api`. Workers, provisioning, services, billing, secrets, backups, domains, and product object-storage APIs are not implemented.

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

Authenticated endpoints use the Auth.js session cookie and also validate the persisted `AppSession` against its user, token version, revocation state, and expiry. No bearer-token API is implemented.

Every custom `POST`, `PATCH`, and `DELETE` endpoint below requires:

- An `Origin` header exactly equal to the origin of `APP_URL`
- If `Sec-Fetch-Site` is present, a value of `same-origin`, `same-site`, or `none`

A missing or mismatched origin returns `403 INVALID_ORIGIN`. This requirement applies to public account mutations as well as authenticated mutations. The email-verification `GET` is the only custom state-changing route and is token-authorized rather than origin-authorized.

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

Role definitions contain reserved permissions for later product areas. There are no Phase 1 APIs for projects, services, workers, billing, backups, domains, ingress management, public IPs, or secrets.

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
