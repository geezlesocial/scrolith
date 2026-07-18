# Phase 20.6 — Rollback Report

## Frontend

```bash
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00143-leb=100
```

Also keep p203 reachable: `scrolith-frontend-00138-ruh`.  
Keep broken p204 at 0%.

## Backend

```bash
gcloud run services update-traffic scrolith-backend --region asia-southeast1 \
  --to-revisions scrolith-backend-00114-bay=100
```

## Notes

- FE-only rollback restores prior renderer if needed.
- BE contentUrl mapping is backward compatible; FE still accepts legacy storage urls via file id.
