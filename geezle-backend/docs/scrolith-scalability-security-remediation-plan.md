# Scrolith Scalability and Security Remediation Plan

## Delivery principles

- Additive, backward-compatible changes only.
- Stable revisions remain available throughout the rollout.
- Keep Azure maximum replicas at four unless load evidence and approval justify otherwise.
- No billing, IAM/RBAC, DNS, SSL, secret-value, or unrelated configuration changes.
- No database destructive changes or historical migration edits.
- Every material change has a feature flag, telemetry, automated tests, canary, and rollback.

## Priority plan

### P0 — safety and availability

1. Remove production JWT fallback secrets and add fail-fast validation.
2. Audit and harden Socket.IO cookie, EIO compatibility, payload limit, event schema, and media transport.
3. Establish distributed Redis/gateway rate limits for authentication, AI, uploads, messages, payments, gifts, webhooks, search, and admin operations.
4. Add AI provider health probes, operation-specific timeouts, circuit recovery, bounded retry, cancellation, safe fallback, quotas, and queue isolation.
5. Inventory high-volume queries and enforce bounded pagination, stable ordering, minimal projections, and evidence-based indexes.
6. Define explicit AI consent, privacy, retention, deletion, and tenant-isolation enforcement.
7. Run official-registry or approved dependency, secret, SAST, container, and IaC scans.

### P1 — capacity and observability

1. Separate API, AI/media workers, and scheduled jobs with durable queue lifecycle management.
2. Add Redis/socket adapter and bounded presence/typing state where cross-replica behavior requires it.
3. Add distributed scheduler locks.
4. Add traces, redacted structured logs, dashboards, alerts, SLOs, and error budgets.
5. Load, spike, soak, recovery, and four-replica capacity-test core paths.
6. Perform authenticated API/WebSocket/mobile-aware DAST and independent penetration testing.
7. Verify upload ownership, signed URLs, malware scanning, storage lifecycle, and orphan cleanup across every media route.

### P2 — optimization

1. Tune query plans, cache hit ratio, connection pools, queue concurrency, and frontend request waterfalls using production evidence.
2. Add cost attribution for replicas, storage, egress, AI compute, and background workers.
3. Rehearse disaster recovery, backup restore, rollback, and incident response.

## Release acceptance thresholds

- No Critical findings and no unresolved High findings in changed scope.
- API availability objective: 99.9% monthly.
- Standard API p95 below 500 ms under agreed load.
- AI text/chat p95 below 8 seconds when provider is healthy.
- Queue failure rate below 1%.
- Upload failure rate below 1%.
- No cross-user authorization failures.
- No secret exposure in logs, images, bundles, responses, or test artifacts.
- Four-replica capacity remains within agreed CPU, memory, DB-pool, Redis, and latency thresholds.

## Required rollout

1. Build and test immutable artifacts.
2. Deploy candidate at 0% traffic.
3. Verify health, auth, messaging, feeds, payments, gifts, uploads, AI fallback, queues, and metrics.
4. Promote to 5%, observe 5–10 minutes.
5. Promote to 25%, observe 5–10 minutes.
6. Promote to 50% only if thresholds remain clean; observe again.
7. Promote to 100%, observe 5–10 minutes.
8. Keep the previous stable revision at 0% for rollback.
9. Disable the feature flag or roll back immediately for a material regression.

## Required evidence per change

- Finding IDs addressed.
- Changed files and migration impact.
- Test and scan output.
- Load/capacity impact.
- Security and privacy impact.
- Cost impact.
- Feature flag and default state.
- Candidate/final revision IDs and traffic.
- Rollback command and verified rollback readiness.
