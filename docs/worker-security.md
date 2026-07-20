# Worker Security Contract

Phase 2 implements worker enrollment, per-worker credentials, signed heartbeat/result/rotation endpoints, replay protection, host reporting, and offline detection. It does not implement command delivery, workload execution, sandboxing, or secret delivery. This document separates current controls from required controls for those deferred systems.

## Identity and Enrollment

- Each worker generates its own Ed25519 key pair and exchanges a one-use enrollment token for a unique `keyId` and expiring credential.
- The control plane stores the public key and SHA-256 enrollment-token digest. The plaintext token is delivered out of band and is never persisted in agent state.
- Agent state is written atomically to an owner-checked regular file opened with no-follow semantics and mode `0600` under an owner-checked, non-symlink `0700` directory.
- Enrollment-token consumption, credentials, and security audits are persisted in MongoDB transactions.
- Exact enrollment retries with the same public key are idempotent; another key cannot reuse the token.

The token itself has no encoded expiry and enrollment has no approval queue. Operators must generate a fresh token per worker, protect it in transit, replace the configured digest after use, and restrict who can restart or configure the control plane. mTLS and administrative worker revocation APIs are not implemented.

## Transport and Protocol

- Workers initiate outbound requests; the agent opens no inbound management port.
- HTTPS is mandatory. Loopback HTTP requires both a non-production server opt-in and the agent's explicit `--allow-http` flag.
- Signed requests bind a protocol domain, method, path, millisecond timestamp, random nonce, and raw-body SHA-256 digest to the worker public key.
- Credentials must be active and unexpired. Timestamps have a bounded skew, nonce records have TTL indexes, and duplicate nonces fail closed.
- Signed bodies are limited to 32 KiB, schemas are strict, heartbeat observation and result completion times are bounded, and protocol failures return generic authentication errors.
- Rotation uses a five-minute one-use challenge, an old-key request signature, and proof from the replacement private key. The old key enters a rotation-only recovery state so an identical request can recover a lost response; first authenticated use of the new key revokes it.

The included agent does not yet implement credential rotation or result submission. The server-side result route requires a pre-existing worker-command record, but Phase 2 has no command producer or delivery path. There is no per-worker rate limiter or mTLS client identity.

## Deferred Execution Isolation

- Any later job executor must run jobs as an unprivileged identity in an ephemeral sandbox with a read-only root filesystem.
- Apply CPU, memory, process, file-size, and execution-time limits.
- Use a restrictive seccomp profile and AppArmor/SELinux policy; drop all capabilities by default.
- Mount only a per-job workspace. Never mount host roots, control-plane storage, cloud metadata credentials, or Docker/containerd runtime sockets.
- If container execution is required, use a dedicated isolated execution service or VM boundary, not the host Docker socket.
- Default-deny egress and explicitly allow required destinations. Validate redirect chains and resolved IP addresses.

## Secrets and Results

- A later delivery path must use short-lived, job-scoped credentials minted after authorization.
- Encrypt sensitive payloads to the assigned worker and bind encryption context to worker/job IDs.
- Do not include secrets in command lines, logs, status messages, or result metadata.
- The current result endpoint validates a bounded result schema and idempotent command transition. A later artifact path must validate content type, size, and checksums before accepting output.
- Upload artifacts using short-lived scoped URLs; scan untrusted outputs before exposing them.

## Operations

- Enrollment, heartbeats, result submissions, and credential rotations write audits with redacted metadata.
- The heartbeat daemon retries only network, timeout, rate-limit, and server failures with bounded exponential delay. Authentication and validation failures stop the agent for operator intervention, and shutdown cancels in-flight requests.
- The BullMQ cleanup processor marks workers offline and unschedulable when their heartbeat exceeds `WORKER_DISCONNECT_AFTER_SECONDS`.
- Credential expiry and server-side rotation exist. Fleet orchestration, proactive agent rotation, immediate administrative revocation, quarantine, signed upgrades, and minimum-version enforcement remain required.
- Replay, skew, malformed signature, duplicate nonce, expired credential, and command-result conflict behavior has unit coverage. Compromised-worker, outage, and full rotation lifecycle exercises remain operational requirements.

`WORKER_SYSTEM_ACTOR_ID` and `WORKER_SYSTEM_ORGANIZATION_ID` must identify a tightly controlled technical audit principal. `WORKER_CONTROL_SIGNING_KEY_ID` and `WORKER_CONTROL_SIGNING_PRIVATE_KEY` are consumed only by the command-signing helper; because no command delivery path exists, they are not needed for enrollment or heartbeats. Never place worker private keys, plaintext enrollment tokens, or command-signing keys in source control.
