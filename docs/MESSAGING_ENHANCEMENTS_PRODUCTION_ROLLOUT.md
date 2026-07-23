# Messaging Enhancements — Production Rollout

**Date:** 2026-07-23  
**Status:** COMPLETE  
**Rollback required:** No

## Revisions promoted to 100%

| Service | Revision | Previous 100% |
|---------|----------|---------------|
| Backend | `scrolith-backend-00282-xup` (`msg-enh-51716906`) | `scrolith-backend-prisma-pool2` |
| Frontend | `scrolith-frontend-00328-rav` (`msg-enh-92da8d29`) | `scrolith-frontend-00313-dep` |

## Staged traffic

| Stage | Backend | Frontend | Smoke | Recheck |
|-------|---------|----------|-------|---------|
| 5% | PASS | PASS | PASS | PASS |
| 25% | PASS | PASS | PASS | PASS |
| 50% | PASS | PASS | PASS | PASS |
| 100% | PASS | PASS | PASS | n/a |

Stabilization between stages: ~90 seconds + health/auth/messages smoke.

## 60-minute monitoring

- Window: ~15:26Z → ~16:26Z UTC
- Interval: 5 minutes
- Samples: 13 (all PASS)
- Checks each sample: BE main health, BE tag health, FE main, FE tag, authenticated `/auth/me`, authenticated conversations list

Evidence: `docs/evidence/msg_enh_rollout_final.json`

## Authenticated E2E (pre-promote gate)

- Script: `geezle/scripts/msg-enh-authenticated-e2e.mjs`
- Result: **29/29 PASS**
- Features: group photo, pins (incl. max 10), appearance, auto text contrast, CORS, authz

See `docs/MESSAGING_ENHANCEMENTS_AUTHENTICATED_CERTIFICATION.md`.

## Rollback targets (if needed)

```bash
gcloud run services update-traffic scrolith-backend --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-prisma-pool2=100

gcloud run services update-traffic scrolith-frontend --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00313-dep=100
```

## Note on frontend API base

The promoted frontend image is built with `VITE_API_URL` pointing at the backend candidate tag URL  
`https://msg-enh-51716906---scrolith-backend-25ysnpjdda-as.a.run.app`.  
That tag remains routed to `scrolith-backend-00282-xup`, which is also 100% of default service traffic.
