# Phase 20.7.5 — Rollback

```bash
gcloud run services update-traffic scrolith-backend --region asia-southeast1 \
  --to-revisions scrolith-backend-00128-guz=100
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00157-nij=100
```

Merged duplicate rows stay soft-archived (`label=scrolitha_duplicate_merged`); no hard delete.
