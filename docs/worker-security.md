# Worker Security Outline

Worker execution is not implemented in Phase 1. This outline is the minimum security contract to settle before building a worker or worker-facing control-plane endpoints. The existing identity, session, organization, and health APIs do not implement any part of this protocol.

## Identity and Enrollment

- Provision one identity per worker, never one fleet-wide credential.
- Use a short-lived, single-use registration token only to exchange for a durable identity.
- Prefer mTLS plus an application signing key. Record certificate/key identifiers for rotation and revocation.
- Keep signing private keys and mTLS keys in the worker host's secret store with least-privilege file permissions.
- Require an explicit operator policy for unattended worker registration.

## Transport and Protocol

- Workers initiate outbound TLS connections to the control plane; no public inbound worker management port is required.
- Authenticate both peers and validate certificate names/chains. Do not support insecure fallback.
- Sign a versioned canonical envelope containing worker ID, job ID, attempt, payload digest, issued/expiry times, and a unique nonce.
- Persist consumed nonces and job transitions so retries are idempotent and replayed/expired messages fail closed.
- Put bounds on payload, result, logs, lease duration, heartbeat rate, and clock skew.
- Return generic protocol errors while recording security-relevant details in access-controlled audit logs.

## Execution Isolation

- Run jobs as an unprivileged identity in an ephemeral sandbox with a read-only root filesystem.
- Apply CPU, memory, process, file-size, and execution-time limits.
- Use a restrictive seccomp profile and AppArmor/SELinux policy; drop all capabilities by default.
- Mount only a per-job workspace. Never mount host roots, control-plane storage, cloud metadata credentials, or Docker/containerd runtime sockets.
- If container execution is required, use a dedicated isolated execution service or VM boundary, not the host Docker socket.
- Default-deny egress and explicitly allow required destinations. Validate redirect chains and resolved IP addresses.

## Secrets and Results

- Prefer short-lived, job-scoped credentials minted after authorization.
- Encrypt sensitive payloads to the assigned worker and bind encryption context to worker/job IDs.
- Do not include secrets in command lines, logs, status messages, or result metadata.
- Validate result schemas, content type, size, and artifact checksums before accepting them.
- Upload artifacts using short-lived scoped URLs; scan untrusted outputs before exposing them.

## Operations

- Support key/certificate rotation without fleet downtime and immediate worker revocation.
- Audit enrollment, leases, heartbeats, result submissions, policy decisions, and credential issuance.
- Rate-limit each worker identity and quarantine anomalous workers.
- Define upgrade signing, rollback, and minimum-version enforcement for the agent.
- Test compromised-worker, replay, expired lease, duplicate result, control-plane outage, and secret rotation scenarios.

The placeholder `WORKER_*` variables in `.env.example` reserve configuration names only. They are not an implemented protocol or a substitute for these controls.
