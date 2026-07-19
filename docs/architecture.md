# Architecture

## Phase 1 Scope

The current control plane is a host-run Next.js App Router application with React server and client components. It implements marketing and status pages, account and sign-in flows, invitation acceptance, organization onboarding, and an authenticated dashboard shell.

The server uses Auth.js for credentials, magic-link, GitHub, and Google authentication. MongoDB stores identity, revocable application sessions, one-time token digests, organizations, built-in roles, memberships, invitations, audit records, and email delivery records. Organization writes that span records use transactions. Redis backs rate limiting outside development; development intentionally uses a process-local memory limiter. Transactional email uses Resend in production or mode-`0600` files under `EMAIL_DEV_DIR` in development.

The Docker Compose stack supplies an authenticated single-member MongoDB replica set, authenticated Redis, MinIO, two independent ingress baselines, Prometheus, and cAdvisor. The application runs on the host and reaches local data services through loopback-published ports. Caddy and Nginx expose only `/healthz` and do not proxy the application.

MinIO is operational local infrastructure but no application object-storage workflow uses it. Workers, workload provisioning, Stripe billing, Vault integration, product backups, and domain management remain planned.

## Control Plane

Solid arrows are implemented code paths. Dashed arrows are planned boundaries without a Phase 1 product implementation.

```mermaid
flowchart LR
    User[Browser user] -->|App Router UI and API| Web[Next.js control plane]
    GitHub[GitHub OAuth] -->|OAuth callback when configured| Web
    Google[Google OAuth] -->|OAuth callback when configured| Web
    Web -->|identity, sessions, organizations, audit| Mongo[(MongoDB rs0)]
    Web -->|rate limits outside development| Redis[(Redis)]
    Web -->|production transactional email| Resend[Resend]
    Web -->|development transactional email| Files[(EMAIL_DEV_DIR)]
    Web -.->|application objects, planned| S3[(MinIO / S3)]
    Web -.->|billing, planned| Stripe[Stripe]
    Worker[Worker, planned] -.->|worker protocol, planned| Web
```

Password and magic-link authentication are also implemented inside the browser-to-control-plane path. GitHub and Google code paths are present but are enabled in the UI only when each provider's credentials are configured.

## Identity and Authorization

Auth.js issues JWT-backed login sessions. On sign-in, the application also creates a MongoDB `AppSession` carrying a random session ID, user token version, provider, hashed source address, user agent, activity time, expiry, and revocation state. Authenticated server operations validate both the Auth.js session and the `AppSession`; a password reset increments the user token version and revokes all application sessions.

Credentials registration hashes passwords with Argon2id. Verification, password-reset, invitation, and Auth.js magic-link tokens are persisted by digest and have expirations. GitHub and Google sign-in requires the provider to attest a verified email, and dangerous email-based account linking is disabled.

Organizations create five built-in roles and an owner membership in one transaction. API authorization resolves the active membership and role on the server for every organization-scoped operation. Role assignment prevents permission escalation, membership updates use optimistic versions, and last-owner checks protect ownership continuity.

## Worker Plane

The entire worker plane is a design target, not running Phase 1 code.

```mermaid
flowchart LR
    subgraph WorkerHost[Separate worker trust boundary, planned]
        Agent[Worker agent]
        Verify[Signature and replay verifier]
        Sandbox[Restricted execution adapter]
        Agent -.-> Verify
        Verify -.-> Sandbox
    end

    Control[Control-plane worker API, planned] -.->|signed job envelope over TLS or mTLS| Agent
    Agent -.->|signed heartbeat, result, and audit metadata| Control
    Sandbox -.->|allowlisted egress only| Allowed[Approved external targets]
    Secrets[Short-lived worker credentials, planned] -.-> Agent
    DockerSock[Docker socket] -.->|explicitly forbidden| Agent
```

Workers should initiate outbound connections, use per-worker identities, reject replayed messages, and receive scoped short-lived secrets. A worker must not receive the control-plane host's Docker socket. See [worker security](worker-security.md).

## Local Components

```mermaid
flowchart TB
    Host[Developer host]
    App[Next.js dev server :3000]
    DevEmail[(.local/emails)]

    subgraph Ingress[Ingress network]
        Caddy[Caddy :8080 health only]
        Nginx[Nginx :8081 health only]
    end

    subgraph Data[Dedicated data network]
        Mongo[(MongoDB rs0)]
        Redis[(Redis)]
        MinIO[(MinIO)]
    end

    subgraph Monitoring[Dedicated monitoring network]
        Prom[Prometheus]
        cAdvisor[cAdvisor]
    end

    Host --> App
    App -->|identity and application data over loopback| Mongo
    App -->|available locally; app limiter uses memory in development| Redis
    App -->|file email in development| DevEmail
    Host -->|loopback only| Caddy
    Host -->|loopback only| Nginx
    Host -->|loopback only| MinIO
    Host -->|loopback only| Prom
    Host -->|loopback only| cAdvisor
    Prom -->|metrics endpoint| MinIO
    Prom -->|metrics endpoint| cAdvisor
    Prom -->|self scrape| Prom
    cAdvisor -->|read-only mounts; privileged process| Socket[Docker and containerd sockets]
```

Data, ingress, and monitoring use separate bridge networks. All published infrastructure ports bind to `127.0.0.1`. The app is not attached to those Docker networks, and neither ingress baseline has an application route.

## Persistence and Initialization

Named volumes hold MongoDB, Redis, MinIO, Prometheus, and the Mongo replica key. `mongo-keyfile-init` creates an owner-only key once and refuses an unexpected replacement. `mongo-rs-init` safely initiates `rs0`, waits for a writable primary, and upserts only the technical database user. `minio-init` creates only the configured private bucket.

Application records are created by real account and organization flows. The bootstrap scripts do not create product users, organizations, activity, or other fake business records.

No worker runtime or protocol, provisioning engine, Stripe integration, Vault integration, product backup/restore flow, domain management, or application use of MinIO is present in Phase 1.
