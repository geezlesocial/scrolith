# Phase 20.7.3 — Rollback Plan

```bash
gcloud run services update-traffic scrolith-backend --region asia-southeast1 \
  --to-revisions scrolith-backend-00124-rom=100
```

That restores Phase 20.7.2 recovery behavior (with old incorrect routing).

Frontend need not roll back for this phase (no FE change).
