# Cloud Run Backend Rollback

## Current Rollback Targets

- Backend: `scrolith-backend-00152-9tk`
- Frontend: `scrolith-frontend-00181-hdk`

## Current Production State

- Backend `scrolith-backend-00152-9tk`: 100%
- Frontend `scrolith-frontend-00181-hdk`: 100%
- Backend failed candidate `scrolith-backend-00262-dif`: 0%
- Backend remediated candidate `scrolith-backend-00268-ruz`: 0%
- Frontend corrected candidate `scrolith-frontend-00313-dep`: 0%

## Rollback Command

If any staged rollout begins and a stop condition is hit, restore traffic to the rollback targets:

```sh
gcloud run services update-traffic scrolith-backend --project=scrolith-500821 --region=asia-southeast1 --to-revisions=scrolith-backend-00152-9tk=100
gcloud run services update-traffic scrolith-frontend --project=scrolith-500821 --region=asia-southeast1 --to-revisions=scrolith-frontend-00181-hdk=100
```

## Stop Conditions

Rollback immediately on:

- HTTP 5xx increase
- HTTP 429 or `no available instance`
- P2024 or Prisma pool exhaustion
- Auth, CORS, or session regression
- Messaging send/search regression
- Payment, ads, GCoin, or wallet regression
- Database integrity issue
- Scrolitha routing/provider regression

## Post-Rollback Checks

Verify:

- `https://api.scrolith.com/api/health` returns 200.
- `https://scrolith.com/` returns 200.
- `https://scrolith.com/messages` returns 200.
- Backend and frontend traffic are each 100% on the rollback revisions.

