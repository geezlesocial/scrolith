# Phase 20.7.4 — Rollback

```bash
# Backend to p2073 intent routing
gcloud run services update-traffic scrolith-backend --region asia-southeast1 \
  --to-revisions scrolith-backend-00126-deh=100

# Frontend to p2074 recovery/routing UX
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00155-goh=100
```
