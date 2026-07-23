# Prisma Connection Analysis

## Runtime Comparison

Compared revisions:

- Stable production backend: `scrolith-backend-00152-9tk`
- Failed backend candidate: `scrolith-backend-00269-xer`

The Cloud Run service configuration did not identify a Cloud SQL capacity or scaling change as the primary cause:

- Cloud Run concurrency remained `80`.
- Cloud Run max scale remained `5`.
- App container resources remained `1 CPU` and `1Gi`.
- Cloud SQL instance attachment remained `scrolith-500821:asia-southeast1:scrolith-postgres-prod`.
- Service account remained unchanged.
- `DATABASE_URL` remained sourced from Secret Manager.
- Candidate CORS and image revision differed, but Cloud SQL capacity settings did not.

## Prisma Client Lifecycle

Application runtime code uses a shared Prisma client from `src/utils/prismaClient.ts`. No request-path evidence showed uncontrolled per-request `new PrismaClient()` creation in `src`.

The lifecycle issue was startup coordination:

- The process could register DB-backed background workers before Prisma readiness was confirmed.
- Startup retry logging showed pool acquisition timeout messages while the Prisma pool was still connecting.
- Request traffic at full candidate promotion could overlap with cold-start DB work.

## Query And Transaction Review

The failure evidence did not show:

- Slow query log correlation.
- Deadlock errors.
- Idle-in-transaction evidence.
- Transaction leak evidence.
- Cloud SQL connection exhaustion.
- Cloud SQL CPU or memory saturation.

The timeout messages pointed to local Prisma pool acquisition pressure rather than database unavailability.

## Remediation Boundary

The fix intentionally avoids changing:

- `DATABASE_URL`
- `connection_limit`
- `pool_timeout`
- Cloud Run concurrency
- Cloud Run min/max instances
- Cloud SQL settings
- PgBouncer compatibility flags
- Prisma schema
- Production data

The release candidate should prove stability with the same database capacity and connection limit before any future rollout is approved.

## Status

Validation is in progress. Production traffic remains unchanged.
