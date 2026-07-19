# Phase 21.1.2S — Deployment

## Frontend (deployed)

| Item | Value |
|------|--------|
| Image | `scrolith-frontend:p2112s-afd96d41` |
| Commit | `afd96d41` |
| Revision | `scrolith-frontend-00129-vkb` @ **100%** |
| Tag | `p2112s` |

Frontend-only. No Android rebuild required (wrapper loads live SPA).

## Rollback

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00128-gr7=100
```

(p2112r / mic recovery baseline)

Alternate: `scrolith-frontend-00127-p5c` (p2112) or `00179-zav` (p2111).
