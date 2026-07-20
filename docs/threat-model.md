# Threat Model

## Scope and Assets

Phase 2 includes a browser-facing Next.js control plane, identity and organization APIs, project/environment desired state, template drafts, entitlements and reservations, worker identity and health reporting, BullMQ reconciliation, MongoDB persistence, transactional email, rate limiting, audit records, and a local dependency/monitoring stack. Sensitive assets include password hashes, Auth.js secrets and cookies, OAuth credentials and provider tokens, one-time account/invitation/enrollment tokens, application sessions, tenant data, draft configuration, entitlement counters, worker private/public keys, command-signing keys when configured, replay records, email contents, provider credentials, audit metadata, database credentials, and the Docker daemon's host-level authority.

Worker identities and signed machine requests are implemented. Workload payloads and credentials, charged billing data, Vault-managed secrets, backup artifacts, and domain credentials belong to planned systems. Their presence in schemas, queue names, configuration, or role permissions does not mean those systems exist.

Local defaults reduce accidental network exposure but do not make a developer workstation a production environment. Anyone with local Docker access is effectively a host administrator.

## Trust Boundaries

Implemented boundaries:

- Browser to the Next.js UI, Auth.js handlers, and application APIs
- GitHub, Google, and Resend to the control plane when those providers are configured
- Control plane to MongoDB
- Control plane to Redis for non-development rate limiting
- Control plane to Resend in production or `EMAIL_DEV_DIR` in development
- Worker agent to control-plane worker APIs
- Control plane and the independent job runner to Redis/BullMQ
- Job runner to MongoDB for reservation and worker reconciliation
- Prometheus to monitored local targets
- cAdvisor to the host kernel, Docker data directory, and Docker/containerd API sockets
- Developer host to loopback-published Compose services

The control-plane-to-worker identity and reporting boundary is implemented. Control-command delivery and workload execution boundaries are not.

## Implemented Application Controls

### Identity and Tokens

- Passwords are validated at 12 to 128 characters with basic composition requirements and hashed with Argon2id using 64 MiB memory, three iterations, and parallelism one. Email identifiers are normalized before lookup.
- Credential login performs a dummy Argon2 verification for unknown users to reduce direct user-existence timing differences. Login requires an active, email-verified account.
- Public registration, verification-resend, and password-recovery responses are generic. Rate limits apply by source hash, account identifier, user, or organization as appropriate.
- Verification, password-reset, and invitation tokens contain 32 random bytes, are stored as SHA-256 digests, expire, and are atomically marked used. Auth.js magic-link tokens are also stored by digest.
- Password reset increments the user's token version and revokes every active `AppSession`.
- GitHub sign-in queries the provider's email API for a verified matching address. Google sign-in requires `email_verified`. Dangerous email account linking is disabled for both providers.

### Sessions and Requests

- Auth.js manages the browser login session. A separate MongoDB `AppSession` is created at sign-in and checked for user, token version, expiry, and revocation during authenticated operations.
- Users can list their unexpired sessions, revoke one session, or revoke every session except the current one. Sign-out attempts to revoke its matching application session.
- The Auth.js route rejects request URL origins that differ from `APP_URL`. Custom mutation routes require an exact `Origin` match and reject disallowed `Sec-Fetch-Site` values when that header is present.
- Custom JSON input is schema-validated, rejects unknown fields where schemas are strict, and is limited to a declared 64 KiB body. Responses carry request IDs and disable caching.
- Application responses set CSP, frame, MIME-sniffing, referrer, opener, resource, permissions, and HSTS headers. These controls limit impact but do not make an XSS or compromised dependency harmless.

### Organizations

- Organization authorization is resolved from active membership and the persisted role on the server, not trusted from client state.
- Role assignment prevents users from granting permissions they do not possess. Built-in owner, admin, developer, billing, and viewer roles are created with each organization.
- Optimistic versions prevent blind overwrite of membership role changes. MongoDB transactions protect multi-record organization creation, invitation acceptance, ownership transfer, and owner-sensitive member changes.
- A final owner cannot be demoted, removed, or leave. Ownership transfer requires an owner and an active target member.
- Invitations expire after seven days, are bound to an email address, and can be accepted only by an authenticated user with the same normalized email.

### Email, Audit, and Rate Limiting

- Production environment validation requires Redis, Resend, both configured OAuth providers, HTTPS `APP_URL`, and `EMAIL_ADAPTER=resend`. The file email adapter is rejected in production.
- Resend sends use a delivery-record-derived idempotency key and up to three immediate attempts. Delivery records contain a recipient digest rather than a plaintext recipient.
- Development file email requests mode `0700` when creating `EMAIL_DEV_DIR` and writes message files with mode `0600`. An existing directory keeps its current mode. The files still contain live links and message content and must be treated as secrets.
- Security-relevant identity and organization actions write MongoDB audit records with request IDs and HMAC-derived source-address values. Audit metadata passes through secret redaction.
- Development rate limits are process-local. Outside development, rate limiting uses Redis and fails closed when Redis is unavailable.

## Worker Communication Threats

| Threat                                           | Phase 2 control and residual risk                                                                                                                                                                                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stolen enrollment token registers a rogue worker | Token digests are configured server-side and token consumption is one-use and transactional. Tokens have no intrinsic expiry or operator approval workflow, so secure out-of-band delivery and prompt digest replacement remain operational controls. |
| Worker impersonation                             | Each worker has an expiring Ed25519 credential; rotation and revocation states are supported server-side. The current agent does not rotate automatically and there is no administrative revoke endpoint.                                             |
| Control-plane impersonation                      | The agent requires HTTPS and normal certificate validation. Explicit insecure mode is limited to loopback and rejected in production. mTLS and certificate pinning are not implemented.                                                               |
| Message tampering                                | A canonical domain/method/path/timestamp/nonce/body-digest envelope is signed and the raw body is schema-validated after signature verification.                                                                                                      |
| Replay or delay                                  | Timestamp skew is bounded and nonces are consumed once in MongoDB with TTL. Result transitions are idempotent and bound to pre-existing worker commands.                                                                                              |
| Cross-worker disclosure                          | No command delivery exists, so Phase 2 sends no workload payload. A later lease protocol must bind and encrypt payloads to the assigned worker.                                                                                                       |
| Compromised worker pivots inward                 | The agent initiates outbound requests and has no inbound server or runtime socket. Production egress restrictions and separate host isolation remain deployment responsibilities.                                                                     |
| Malicious job escape or secret exfiltration      | No workload executor or secret delivery exists. Sandbox, scoped credentials, output scanning, and egress policy are mandatory before implementing them.                                                                                               |

The independent BullMQ runner currently consumes only stale-reservation and disconnected-worker jobs. It does not provision infrastructure or dispatch commands.

## Docker Socket

The Docker and containerd Unix sockets grant daemon API authority. A read-only bind mount does not reliably make API operations read-only because writes are protocol operations on a socket, not ordinary file writes. Runtime socket access can often lead to root-equivalent host compromise.

The local stack has one explicit exception: cAdvisor receives `/var/run/docker.sock`, `/run/containerd/containerd.sock`, and selected host paths as read-only mounts and runs privileged to collect metrics. Its web port binds only to `127.0.0.1`, it is attached only to the monitoring network, and no application, database, ingress, or planned worker service receives a runtime socket. The sockets are not exposed over TCP.

Required production response:

- Prefer platform-native metrics that do not require a container runtime socket.
- Otherwise isolate the collector on a dedicated node and restrict who can reach its API.
- Evaluate a narrowly allowlisted, authenticated runtime API proxy; do not assume `:ro` is sufficient.
- Remove privileged mode and host mounts wherever the selected collector permits.
- Never place cAdvisor on a public network or expose its UI directly to the internet.
- Alert on Docker API access and protect the collector image/configuration supply chain.

## Local Stack Controls

- Every published infrastructure port binds to `127.0.0.1`; dedicated networks limit cross-service reachability. Compose containers retain ordinary bridge egress, so outbound policy requires a production firewall or orchestrator policy.
- MongoDB, Redis, and MinIO require credentials. Defaults are obvious local placeholders and must be changed on shared hosts.
- MongoDB internal member authentication uses a persisted owner-only keyfile.
- Caddy and Nginx expose genuine health endpoints and no application proxy routes.
- Prometheus scrapes only configured local containers and itself.
- Containers use read-only filesystems, dropped capabilities, or `no-new-privileges` where compatible; cAdvisor is the documented exception.
- `.env`, local email output, backup files, and test artifacts are gitignored. Gitignore is not an access-control or secret-management mechanism.

## Residual Risks

- There is no production application/worker image, ingress integration, TLS deployment, secret-manager integration, multi-node data topology, backup/restore process, or production operations runbook.
- OAuth account records can contain provider access, refresh, and ID tokens. Application-layer encryption and key rotation are not implemented; `DATA_ENCRYPTION_KEY` and `CREDENTIAL_ENCRYPTION_KEY` are reserved environment values only.
- Authentication has no MFA, recovery codes, device confirmation, or administrator-driven account/session revocation API.
- Exact origin checks reduce cross-origin mutation risk but do not protect against same-origin XSS, a compromised frontend dependency, stolen cookies, or malicious browser extensions.
- JWT validity and `AppSession` revocation are checked by authenticated application operations, so authorization availability depends on MongoDB. Auth.js protocol behavior also remains part of the trusted dependency surface.
- Development rate limits reset on process restart and do not coordinate multiple application processes. Redis is required for coordinated non-development limits.
- Public account endpoints intentionally suppress delivery errors to avoid exposing account state. Operators need protected delivery monitoring; no administrative delivery or audit-log API exists.
- Audit records are not tamper-evident and have no implemented retention, export, or alerting pipeline.
- Worker enrollment tokens have no built-in expiry, the agent lacks automatic credential rotation, and administrative worker disable/revoke APIs are absent.
- The worker pool is global. Organization permission gates inventory reads, but all eligible nodes can serve any tenant; placement isolation policy is deferred.
- Resource reservations write pending outbox events, but no relay publishes them. Usage and ledger models have no writers, and entitlement/template administration remains external.
- The job runner is a separate required process. If it stops, stale reservations remain reserved and stale workers retain their last persisted status until selection-time freshness checks exclude them.
- Local file emails contain usable verification, reset, magic-link, and invitation URLs. A user or process that can read the files can exercise those links before expiry.
- Local credentials remain visible to users with Docker inspection access. Loopback services are reachable by other processes and users on the same host.
- Dependency image tags are version-pinned but not digest-pinned. Production promotion should lock verified digests and generate an SBOM.
- A single MongoDB member supports transaction semantics but not availability. Automated product backups and tested restores are not implemented.
- Prometheus and MinIO's metrics endpoint have no application-layer authentication inside the isolated monitoring network.
- MinIO is running local infrastructure but has no application authorization model or product data path. Worker command execution, provisioning, Stripe, Vault, backups, and domains have not undergone implementation-level threat validation.
