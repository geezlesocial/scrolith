# Phase 20.7.1 — Production Validation

## Baseline verification (2026-07-18)

Commands:

```
gcloud run services describe scrolith-frontend --region=asia-southeast1
gcloud run services describe scrolith-backend --region=asia-southeast1
```

Evidence:

- FE traffic 100% → `scrolith-frontend-00151-fin` tag `p2072`  
- BE traffic 100% → `scrolith-backend-00089-f5h`  
- SCROLITHA_ROLLOUT_MASTER=true  
- SCROLITHA_ROLLOUT_MESSAGING_ASSISTANT=true  
- SCROLITHA_INTERNAL_ROLLOUT=true  

**Matches reported baseline.** Proceeded with implementation.

## Smoke (to re-run post-deploy)

| Check | Expected |
|---|---|
| Homepage | 200 |
| /messages | 200 |
| POST /api/messages/scrolitha/ensure unauth | 401 |
| POST /api/messages/scrolitha/turn unauth | 401 |
| Platform identity | scrolitha verified |
| Human messaging | unaffected |
| Media preview | Phase 20.6 continuity |

## Authenticated gates

Require operator credentials for full unified turn + stream + cards. Not claimed certified without session evidence.
