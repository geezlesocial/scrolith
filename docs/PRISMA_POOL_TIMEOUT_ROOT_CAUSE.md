# Prisma Pool Timeout Root Cause

## Scope

This investigation covers the production rollout failure for backend revision `scrolith-backend-00269-xer` during the 100% traffic stage on `2026-07-23`.

Production traffic has not been retried. Production remains on `scrolith-backend-00152-9tk` and `scrolith-frontend-00181-hdk`.

## Finding

The Prisma timeout burst was caused by backend startup ordering under full Cloud Run traffic, not by Cloud SQL capacity.

The failed candidate allowed the process to begin accepting traffic while Prisma was still acquiring its initial connection and while DB-dependent startup workers were being registered. At lower traffic percentages this did not reproduce, but at 100% traffic Cloud Run routed all production traffic to candidate instances and the combination of request load plus startup worker database work exhausted the local Prisma acquisition queue.

Observed timeout text included:

- `Timed out fetching a new connection from the connection pool`
- `Current connection pool timeout: 15`
- `connection limit: 5`

No HTTP 500, HTTP 429, Cloud Run `no available instance`, Cloud SQL CPU pressure, Cloud SQL memory pressure, or excessive Cloud SQL backend connection count was observed during the failure window.

## Evidence

- Rollout stages `5%`, `25%`, and `50%`: passed authenticated smoke and infrastructure monitoring.
- Rollout stage `100%`: active Prisma pool timeout mentions observed.
- Candidate `scrolith-backend-00269-xer`: timeout matches observed during rollout window.
- Stable production revision `scrolith-backend-00152-9tk`: zero Prisma pool timeout matches in the later post-rollback check window.
- Cloud SQL utilization stayed healthy during the failure: CPU, memory, and PostgreSQL backend sessions did not indicate saturation.

## Severity

Active production severity: high during full candidate promotion because Prisma pool acquisition timeouts are an explicit rollout stop condition.

Customer-facing impact observed during the stop window: no HTTP 500 or HTTP 429 was observed in the collected logs, and rollback completed successfully.

Infrastructure severity: not a Cloud SQL capacity incident.

## Root Cause

`server.ts` registered background jobs and DB-dependent startup work before the server's initial Prisma readiness had completed. The Prisma helper already retried initial connection, but `ensurePrismaReady()` was not idempotent after the first successful connection and the server startup sequence did not prevent worker/query competition during cold starts.

At 100% traffic, new candidate instances had only `connection_limit=5` per Prisma pool and had to handle production traffic while startup code was also attempting database work. That pattern can exhaust the local Prisma wait queue even when Cloud SQL itself has healthy capacity.

## Remediation

The remediation keeps the existing architecture and Cloud Run configuration intact:

- Keep the single shared Prisma client.
- Make `ensurePrismaReady()` return immediately after the process is already ready.
- Await initial Prisma readiness before opening the HTTP listener.
- Start DB-backed background jobs only after Prisma readiness succeeds.
- Keep startup in degraded mode if Prisma readiness fails, but do not start background workers in that degraded state.

No Prisma schema, authentication, authorization, CORS, messaging, payment, GCoin, socket, Scrolitha provider, Cloud SQL, Cloud Run scaling, CPU, or memory changes were made.

## Status

Validation is in progress. Production traffic remains unchanged.
