# Phase 21.1.2R — Deployment

## Frontend (deployed)

| Item | Value |
|------|--------|
| Image | `scrolith-frontend:p2112r-1cd78a77` |
| Commit | `1cd78a77` |
| Revision | `scrolith-frontend-00128-gr7` @ **100%** |
| Tag | `p2112r` |
| Verified header | `Permissions-Policy: camera=(self), microphone=(self), ...` on https://scrolith.com |

Must ship nginx Permissions-Policy fix (`microphone=(self)`).

## Rollback

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00127-p5c=100
```

Alternate: `scrolith-frontend-00179-zav` (p2111).

## Android

Code bumped to **1.1.23 / versionCode 33**. Build/install AAB still operator residual. FE-only does not fully certify WebView bridge.
