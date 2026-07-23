# Cloud Run Backend Readiness

## Production freeze

| Service | Revision | Traffic |
|---------|----------|---------|
| Backend | `scrolith-backend-00152-9tk` | 100% |
| Frontend | `scrolith-frontend-00181-hdk` | 100% |

## New candidate (not promoted)

| Field | Value |
|-------|--------|
| Revision | `scrolith-backend-prisma-pool2` |
| Tag URL | `https://prisma-pool-cors---scrolith-backend-25ysnpjdda-as.a.run.app` |
| Traffic | 0% |
| Build | `11aeb01d-be53-4b9e-b9d7-d864925a2794` |
| Commit | `9a57f933` |
| Image | `…/scrolith-backend:prisma-pool-cors-9a57f933` |

## Readiness checklist

| Item | Status |
|------|--------|
| Startup uses `node dist/server.js` (no migrate on every scale-out) | PASS (Dockerfile.storyfix.runtime) |
| Prisma ready before workers | PASS (`75f27ecf`) |
| Pool sized for concurrency | PASS (`connection_limit=15`) |
| CORS production origins | PASS |
| Candidate health 200 | PASS |
| Production health 200 | PASS |
| Production traffic unchanged | PASS |
| Operator approval required for rollout | **YES** |

## Do not promote until

1. Operator explicitly approves staged rollout.  
2. Authenticated messaging certification is re-run during staged traffic.  
3. Prisma pool timeout counter remains zero under stage monitoring.
