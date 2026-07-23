# Prisma Connection Analysis

## Lifecycle

| Concern | Status |
|---------|--------|
| Singleton `PrismaClient` | Module-level client; `global.__prisma` always set after fix |
| Client recreation | Not recreated per request |
| Startup connect | `ensurePrismaReady()` with retries; returns immediately if already ready |
| Listen ordering | HTTP `listen` only after initial readiness attempt |
| Background workers | Started only when Prisma readiness succeeds |

## Production pool parameters

| Parameter | Before (00269 failure) | After (`9a57f933`) |
|-----------|------------------------|---------------------|
| `connection_limit` default | 5 | **15** |
| `pool_timeout` default (s) | 15 | **20** |
| `connect_timeout` default (s) | 15 | 15 |
| Read retry on P2024 | yes (2) | yes (2) |
| Slow query logging | on (≥350ms) | on (≥350ms) |

Env overrides remain supported:

- `PRISMA_CONNECTION_LIMIT`
- `PRISMA_POOL_TIMEOUT_SECONDS`
- `PRISMA_CONNECT_TIMEOUT_SECONDS`
- `PRISMA_READ_RETRY_COUNT`

## Cloud Run interaction

| Cloud Run setting | Value | Implication |
|-------------------|-------|-------------|
| concurrency | 80 | Up to 80 in-flight HTTP handlers per instance |
| maxScale | 5 | Up to 5 instances |
| minScale | 0 | Cold starts possible |

**Pool pressure model:** concurrent DB-using handlers share `connection_limit` slots. When waiters exceed `pool_timeout`, Prisma emits **P2024**.

## Cloud SQL capacity check

| Metric during 100% failure | Value |
|----------------------------|-------|
| CPU | healthy (~8–9%) |
| Memory | healthy (~33%) |
| backends max | ~15 |

Not a Cloud SQL capacity incident.

## Worst-case session demand (after remediation)

```
maxScale (5) × connection_limit (15) = 75
```

Within safe operating range for `db-custom-1-3840` given observed low utilization.

## Leak / transaction assessment

| Check | Result |
|-------|--------|
| Connection leak primary | Not supported by low backend counts |
| Idle-in-transaction evidence | Not observed in available metrics |
| Long transactions primary | Not confirmed; pool size mismatch explains timeouts without SQL pressure |
| N+1 / slow queries | Slow-query logger remains enabled for follow-up; not required for stop condition |

## CORS (related candidate hygiene)

| Revision | CORS_ALLOWED_ORIGINS |
|----------|----------------------|
| 00268-ruz | messaging tag only (blocker) |
| 00269-xer | scrolith.com + www + messaging tag |
| New candidate | same production-safe allowlist; no wildcards |
