# Cloud Run Backend Readiness

## Current Decision

`scrolith-backend-00269-xer` is ready for operator-approved staged production rollout from the Prisma pool perspective.

## Reason

The corrected candidate fixed the CORS allowlist and preserved the startup remediation. A follow-up Prisma pool investigation determined that the observed timeout messages were historical startup-only events, not active request-serving behavior.

The timeout burst occurred before Prisma reported ready:

- Startup probe succeeded: `2026-07-23T10:00:18.745457Z`
- Prisma pool timeout burst: `2026-07-23T10:01:35.806499Z` to `2026-07-23T10:01:35.814436Z`
- Prisma ready: `2026-07-23T10:01:36.350511Z`

Source classification: startup background-job/database access contention while the Prisma client pool was still connecting. The production Prisma URL normalization keeps `connection_limit=5` and `pool_timeout=15` unless explicitly overridden.

Severity: low active severity, moderate cold-start observability risk. No request-path failures, `P2024` recurrence, Cloud Run `no available instance`, 429, or 5xx responses were observed during candidate validation after readiness.

## Production State

- Backend production: `scrolith-backend-00152-9tk` at 100%
- Frontend production: `scrolith-frontend-00181-hdk` at 100%
- Corrected backend candidate: `scrolith-backend-00269-xer` at 0%
- Corrected frontend candidate: `scrolith-frontend-00313-dep` at 0%

Production health after stop:

- `https://api.scrolith.com/api/health`: 200
- `https://scrolith.com/`: 200
- `https://scrolith.com/messages`: 200

## Passed Gates

- Context verified: `scrolith-500821`, `asia-southeast1`
- Backend build: PASS
- Regression Cloud Build: PASS, `4ee1f902-1ab3-4310-b316-7c8d447726e6`
- Candidate deployed at 0%: PASS
- CORS allowlist corrected: PASS
- Wildcard CORS disabled: PASS
- No production traffic changed: PASS
- No runtime Prisma migrate/generate startup command observed: PASS
- No Cloud Run `no available instance` observed: PASS
- Active Prisma pool timeout validation: PASS
- Cloud SQL capacity validation: PASS

## Prisma Pool Validation

- Historical candidate pool timeout mentions over 4h: `12`
- Latest historical pool timeout: `2026-07-23T10:01:35.814436Z`
- Candidate validation load: `70/70` HTTP 200 responses, concurrency `10`
- Active validation window: `2026-07-23T10:30:38.114Z` onward
- Active validation logs: `70` HTTP requests, `0` 5xx, `0` 429, `0` pool timeout, `0` P2024, `0` Cloud Run `no available instance`

Cloud SQL capacity for `scrolith-postgres-prod` during the validation window:

- CPU utilization: avg `0.0825`, max `0.1038`
- Memory utilization: avg `0.3288`, max `0.3332`
- PostgreSQL backend connections: avg `4.21`, max `15`

## Failed Gate

None active.

## Required Before Rollout

Operator approval is still required before any staged production rollout. No remediation, redeploy, or new backend candidate is required unless new active Prisma pool timeout evidence appears.
