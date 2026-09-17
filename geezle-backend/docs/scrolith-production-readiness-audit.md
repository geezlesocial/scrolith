# Scrolith Production Readiness Audit

**Audit date:** 2026-09-17  
**Scope:** `geezle/`, `geezle-backend/`, `mobile/`, `deploy/`, production HTTP endpoints, and Azure Container Apps configuration.  
**Method:** Read-only source inspection, configuration inspection, live health/header checks, and dependency metadata review. This is not a penetration test or formal compliance certification.

## Executive assessment

| Domain | Rating | Confidence | Summary |
|---|---:|---|---|
| Scalability | 6/10 | Medium | Good container, cache, compression, Prisma, Redis, and lazy-loading foundations; insufficient proof of load capacity, distributed workers, query bounds, and queue isolation. |
| Security | 7/10 | Medium | Strong TLS/CSP/CORS/auth/RBAC foundations; material hardening remains around secrets, Socket.IO, distributed limits, authorization testing, and dependency verification. |
| AI reliability | 6/10 | Medium | Prompt/output hygiene and consent controls exist; provider timeout history and incomplete queue/cost/fallback evidence remain risks. |
| Azure readiness | 7/10 | Medium | Healthy revisions, controlled traffic, rollback availability, and max four replicas are verified; production SLO and cost evidence need expansion. |

## Verified strengths

- Live `https://scrolith.com/` returned HTTP 200.
- Live `https://api.scrolith.com/api/health` returned HTTP 200 with database status `ready`.
- Live headers included HSTS, CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and API `Cache-Control: no-store`.
- Production CORS is origin allowlisted and credentials-aware; revision-origin support is pattern constrained.
- Express production server disables `x-powered-by`, sets trusted proxy behavior, uses Helmet, CORS, JSON/urlencoded limits, correlation/metrics middleware, and a global API limiter.
- JWT authentication, RBAC/admin middleware, request validation libraries, bcrypt password hashing, Redis support, compression, Socket.IO authentication, object storage, and idempotency middleware are present.
- Sensitive routes such as wallet, gifts, payouts, ads, messages, business pages, KYC, proposals, and admin routes visibly use authentication and/or admin/permission middleware.
- Azure frontend and backend are in Multiple revision mode with 100% traffic on one healthy revision, previous revisions retained at 0%, and `minReplicas=1`, `maxReplicas=4`.
- Frontend route splitting/lazy-loaded chunks and media optimization paths exist.

## Findings

| ID | Severity | Finding and evidence | Impact | Remediation | Tests / rollback | Owner / priority |
|---|---|---|---|---|---|---|
| SEC-001 | High | Production source contains JWT fallback patterns such as `process.env.JWT_SECRET || 'dev_jwt_secret'` in administrative/controller code. | A misconfigured production instance could accept a known signing secret. | Fail fast in production; allow development fallback only outside production; add startup and CI secret checks. | Startup tests and token rejection tests; rollback image only. | Backend/Security / P0 |
| SEC-002 | High | Socket.IO is configured with `maxHttpBufferSize: 1e8`, `allowEIO3: true`, and a client-readable cookie (`httpOnly: false`). | Memory/DoS exposure, legacy attack surface, and unnecessary cookie exposure. | Establish whether cookie/EIO3 are required; remove or harden cookie; reduce payload limit; require media upload APIs; validate every event. | WebSocket compatibility, size-limit, auth, and reconnect tests; feature flag/socket rollback. | Realtime/Security / P0 |
| SEC-003 | High | Distributed rate-limit storage is not evidenced; `express-rate-limit` is present and route policies exist. | Limits may multiply across replicas or reset on restart. | Use Redis/gateway-backed stores for auth, AI, uploads, messaging, search, payments, gifts, webhooks, and admin routes. | Multi-replica rate-limit tests; revert limiter configuration. | Platform/SRE / P0 |
| SEC-004 | High | Dependency scan is not currently verified; `npm audit` used a mirror whose audit endpoint returned 404/NOT_IMPLEMENTED. | Vulnerable packages may remain undetected. | Run official-registry or approved OSV/Trivy/Dependabot scan; triage without unrelated upgrades. | CI scan gate; no deployment if Critical/High policy fails. | Supply chain / P0 |
| SEC-005 | High | No independent penetration-test evidence was found in the audited scope. | IDOR, BOLA, CSRF, SSRF, business-logic, and WebSocket issues may remain. | Commission authenticated API/WebSocket/mobile-aware DAST and retest. | Security report and remediation evidence. | Security / P1 |
| SEC-006 | Medium | Dynamic production frontend revision-origin allowance is useful for canaries but expands the trusted origin set. | A compromised/incorrect revision could receive credentialed requests. | Keep strict suffix validation, expire old candidates, and disable revision-origin access after promotion where operationally safe. | CORS preflight/credential tests; revert env/config only. | Platform/Security / P1 |
| SEC-007 | Medium | AI user activity learning must remain explicitly consented and privacy scoped. | Silent learning from messages, resumes, KYC, payments, or confidential employer data creates privacy/regulatory risk. | Separate analytics from personalization/model training; opt-in, redaction, retention/deletion, tenant isolation, and audit controls. | Consent, deletion, isolation, and data-leak tests. | AI/Privacy / P0 |
| SEC-008 | Medium | File upload and storage controls are implemented in several paths, but a complete cross-route ownership/signed-URL/malware audit is not yet evidenced. | Cross-user media access or unsafe files could affect users and storage. | Build a route inventory and test every upload/download path; private-by-default and short-lived signed URLs. | Ownership, MIME/signature, malware, expiry, and range tests. | Media/Security / P1 |
| SCALE-001 | High | Azure max replicas are capped at four, but no production-like load/spike/soak evidence was found for core and AI workloads. | Four replicas may protect cost but saturate during feed, chat, AI, media, or campaign spikes. | Load-test against the four-replica ceiling; define queue backpressure and scaling thresholds before any limit change. | k6/Artillery load, spike, soak, and recovery tests; keep current cap on failure. | SRE/Performance / P0 |
| SCALE-002 | High | Many `findMany` call sites exist across feeds, search, ads, messages, notifications, and admin paths; boundedness is inconsistent by route. | Memory, latency, DB pool, and response-size growth. | Inventory list endpoints; enforce validated page limits, cursor pagination, stable indexed ordering, and minimal selects. | Query-bound tests and EXPLAIN plans; revert route by route. | Backend/DB / P0 |
| SCALE-003 | High | Long-running AI/media/notification/analytics work is present across the platform; worker isolation and durable queue evidence is incomplete. | Slow synchronous requests consume API capacity and amplify provider timeouts. | Move long work to durable jobs with idempotency, cancellation, retry/backoff, DLQ, age metrics, and separate worker deployments. | Job lifecycle, duplicate, timeout, retry, cancellation, and worker failover tests. | AI/Workers / P0 |
| SCALE-004 | Medium | In-memory presence/typing/dedup caches exist in the server; cross-replica state strategy is not fully evidenced. | Inconsistent realtime state and memory growth across replicas. | Use bounded caches and Redis/socket adapter where required; verify cleanup and TTLs. | Multi-replica socket tests and cache pressure tests. | Realtime/SRE / P1 |
| SCALE-005 | Medium | Cron and scheduled jobs run in a multi-replica application environment; distributed-lock coverage is not fully evidenced. | Duplicate reconciliation, notification, webhook, or analytics work. | Add scheduler ownership/distributed locks or move jobs to a managed scheduler/worker. | Concurrent scheduler tests; disable only the changed scheduler on rollback. | SRE / P1 |
| SCALE-006 | Medium | API/AI/DB/Redis p95/p99, queue age, saturation, and error-budget evidence is incomplete. | Incidents may be detected after users are affected. | Add redacted structured telemetry, traces, dashboards, alerts, SLOs, and runbooks. | Alert firing and incident-drill tests. | Observability/SRE / P1 |
| AI-001 | High | Previous production reports show Ollama/provider timeouts and circuit-open errors. | AI features can feel unreliable and occupy request capacity. | Separate timeout budgets, provider health probes, bounded retries, circuit recovery, fallback, cancellation, and queueing. | Provider fault-injection tests and user-safe fallback checks. | AI Platform / P0 |
| AI-002 | Medium | Prompt-cleaning and draft-only behavior exist, but all AI surfaces/providers need a consistent structured-output contract. | Inconsistent formatting, hallucinated metadata, or internal instructions reaching users. | Centralize output schemas, cleaning, confidence/uncertainty handling, and surface-specific quality checks. | Golden prompts, injection tests, malformed-output tests. | AI/Product / P1 |
| AZ-001 | Medium | Azure revisions and four-replica limits are verified; resource utilization and cost attribution are not. | Capacity/cost decisions may be guesswork. | Add per-service CPU/memory/request/egress/AI usage dashboards and budget alerts. | Cost dashboard and alert test; no billing changes in this program. | Cloud/SRE / P1 |

## Release gate

No remediation deployment should proceed until the affected finding has tests, telemetry, a feature flag where appropriate, and a tested rollback. Existing stable revisions must remain active if any Critical/High check fails.

## Evidence limitations

- No secret values were read or printed.
- No database data, private messages, KYC data, payment data, or user tokens were inspected.
- Dependency vulnerability status is unknown until an official/approved scanner completes.
- Capacity ratings are provisional until production-like load and soak tests complete.
- A formal external penetration test was not part of this audit.
