# Performance Validation — Prisma Pool Candidate

## Candidate

| Field | Value |
|-------|--------|
| Revision | `scrolith-backend-prisma-pool2` |
| Tag | `prisma-pool-cors` |
| URL | `https://prisma-pool-cors---scrolith-backend-25ysnpjdda-as.a.run.app` |
| Traffic | **0%** |
| Image tag | `prisma-pool-cors-9a57f933` |
| Commit | `9a57f933` |

## Pool configuration under test

| Setting | Value |
|---------|--------|
| `PRISMA_CONNECTION_LIMIT` | 15 |
| `PRISMA_POOL_TIMEOUT_SECONDS` | 20 |
| Cloud Run concurrency | 80 |
| maxScale | 5 |

## Controlled load (read-only)

| Concurrency | Requests | Success | p50 ms | p95 ms | max ms |
|-------------|----------|---------|--------|--------|--------|
| 1 | 12 | 12 | ~394 | ~644 | ~663 |
| 5 | 12 | 12 | ~233 | ~514 | ~1290 |
| 10 | 12 | 12 | ~335 | ~606 | ~646 |
| 25 | 12 | 12 | ~301 | ~556 | ~602 |
| Burst 25× health | 25 | 25 | — | ~687 | ~2183 |

Extended multi-path concurrent smoke (health/auth/users/ai/search/commerce): all responses &lt; 500.

## Outcomes

| Check | Result |
|-------|--------|
| HTTP 5xx on candidate load | **0** |
| Active Prisma pool timeouts during validation | **0** observed |
| Cloud Run “no available instance” | **0** |
| Production traffic changed | **false** |

## Note

Full production-level authenticated messaging load is reserved for operator-approved staged rollout. Candidate validation used non-destructive health endpoints at concurrency levels 1–25 plus a 25-way burst.
