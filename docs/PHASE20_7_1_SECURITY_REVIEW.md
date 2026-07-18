# Phase 20.7.1 — Security Review

| Control | Status |
|---|---|
| No parallel AI stack | Pass |
| Provider credentials not exposed to FE | Pass |
| Admin tools blocked for non-admin | Pass |
| Confirmation tokens single-use | Pass (unit tested) |
| File content untrusted framing | Pass |
| No arbitrary HTML cards | Pass |
| Idempotent clientRequestId | Pass |
| Feature kill-switches | Pass (per-capability env) |
| Write tools default off | Pass |
| Secrets in logs | Not introduced |

## Residual risks

- confirmationTokens off → boolean confirm only  
- Unified turn increases Scrolitha load on SupportWidget  
- Prisma JSON path idempotency depends on PostgreSQL JSON filter support
