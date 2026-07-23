# Prisma Pool Timeout Root Cause

## Scope

Production rollout failure for backend revision `scrolith-backend-00269-xer` during the **100%** traffic stage on **2026-07-23**.

Production remains on:

| Service | Revision | Traffic |
|---------|----------|---------|
| Backend | `scrolith-backend-00152-9tk` | 100% |
| Frontend | `scrolith-frontend-00181-hdk` | 100% |

Candidate `scrolith-backend-00269-xer` remains at **0%**. No further production promotion until operator approval.

## Observed failure window

| Field | Value |
|-------|--------|
| Stage 100% start (UTC) | 2026-07-23T11:10:03Z |
| First active pool timeout | 2026-07-23T11:13:11Z |
| Latest pool timeout | 2026-07-23T11:16:45Z |
| P2024 / pool timeout mentions | 43 |
| HTTP 5xx | 0 |
| HTTP 429 | 0 |
| Cloud Run “no available instance” | 0 |
| Cloud SQL CPU avg / max | ~0.08 / ~0.09 |
| Cloud SQL memory avg / max | ~0.33 / ~0.34 |
| PostgreSQL backends avg / max | ~4.2 / 15 |

Rollout stages **5% / 25% / 50%** passed. **100%** failed and was rolled back.

## Finding

The Prisma timeout burst was **not** caused by Cloud SQL capacity exhaustion.

It was caused by a **per-instance Prisma connection pool that was too small for production Cloud Run concurrency under full traffic**.

### Configuration at failure

| Setting | Value |
|---------|--------|
| Cloud Run `containerConcurrency` | 80 |
| Cloud Run `maxScale` | 5 |
| Cloud Run `minScale` | 0 (null) |
| Prisma `connection_limit` (default) | **5** |
| Prisma `pool_timeout` (default) | **15s** |
| Explicit `PRISMA_CONNECTION_LIMIT` env | **unset** |

Timeout text observed in candidate logs matched:

- `Timed out fetching a new connection from the connection pool`
- `Current connection pool timeout: 15`
- `connection limit: 5`

### Why Cloud SQL looked healthy

Worst-case DB sessions from this service alone:

`maxScale × connection_limit = 5 × 5 = 25`

Observed backends peaked near **15**. That is well below Cloud SQL saturation for `db-custom-1-3840`. Pool waits happened **inside each Node process** before Cloud SQL became the bottleneck.

### Why 50% passed and 100% failed

At partial traffic, concurrent handlers per warm instance rarely exceeded five simultaneous DB acquisitions. At 100%, production request concurrency against each instance increased; the five-slot pool filled; waiters hit `pool_timeout` → **P2024**. Application often failed closed without elevating HTTP 500 rates for the sampled window.

### Contributing startup factor (already remediated)

Earlier analysis also identified startup ordering: workers could compete for the same five-slot pool during cold start. Commit `75f27ecf` made `ensurePrismaReady()` idempotent, awaited readiness before `listen`, and deferred DB-backed workers until Prisma was ready.

That fix alone is **necessary but not sufficient** for sustained full-traffic load: warm instances still had only five pool slots under concurrency 80.

## Root cause summary

**Primary:** Production Prisma pool sized at `connection_limit=5` cannot serve full Cloud Run concurrency (80) at 100% traffic, producing local pool acquisition timeouts (P2024) despite healthy Cloud SQL.

**Secondary (mitigated):** Startup worker registration racing request traffic on cold instances with the same undersized pool.

## Ruled out

| Hypothesis | Evidence |
|------------|----------|
| Cloud SQL CPU/memory exhaustion | CPU ~8–9%, memory ~33% |
| Too many absolute DB backends | Max ~15 sessions |
| Cloud Run “no available instance” | 0 matches |
| HTTP 429 overload | 0 matches |
| Connection leak as sole cause | Sessions stayed low after rollback; timeouts correlated with traffic cutover to candidate under full load |
| CORS (on 00269) | Candidate already included `https://scrolith.com` and `https://www.scrolith.com` (earlier 00268 CORS-only issue was separate) |

## Remediation

1. **Startup ordering** (`75f27ecf`): ready-before-listen; workers after ready.  
2. **Pool sizing** (`9a57f933`): production defaults `connection_limit=15`, `pool_timeout=20s`; process-wide singleton always pinned; boot log of pool config.  
3. **CORS** preserved for production origins on the new candidate deploy env.  
4. Deploy new backend candidate at **0%** traffic for validation; **no production promotion** without operator approval.

Safe capacity envelope after sizing:

`5 instances × 15 connections = 75` sessions upper bound from this service — still within expected Cloud SQL limits for the production tier, and far above the observed healthy backend counts.

## Confidence

**HIGH** — timeout messages explicitly reported `connection limit: 5` and `pool timeout: 15`; metrics showed healthy SQL with timeouts only under full candidate traffic.
