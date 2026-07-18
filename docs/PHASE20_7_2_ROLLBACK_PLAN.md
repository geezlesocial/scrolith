# Phase 20.7.2 — Rollback Plan

## Immediate traffic rollback

```bash
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00153-qid=100

gcloud run services update-traffic scrolith-backend --region asia-southeast1 \
  --to-revisions scrolith-backend-00122-taj=100
```

Emergency FE p2072 layout: `scrolith-frontend-00151-fin`  
Emergency BE pre-20.7.1: `scrolith-backend-00089-f5h`

## Capability kill

```
SCROLITHA_ROLLOUT_MESSAGING_ASSISTANT=false
```

## Notes

No schema migrations. Fallback error messages are ordinary DirectMessages (safe to leave).
