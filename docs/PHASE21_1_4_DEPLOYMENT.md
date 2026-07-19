# Phase 21.1.4 — Deployment

## Frontend (deployed)

| Item | Value |
|------|--------|
| Image | `scrolith-frontend:p2114-bf830417` |
| Commit | `bf830417` |
| Revision | `scrolith-frontend-00130-dhz` @ **100%** |
| Tag | `p2114` |

## Rollback

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00129-vkb=100
```

(p2112s baseline)
