# Phase 20.7.6 — Rollback Plan

## Instant capability kill (preferred)

```
SCROLITHA_ROLLOUT_FILE_UNDERSTANDING=false
# optional sub-flags
SCROLITHA_FILE_TEXT=false
SCROLITHA_FILE_PDF=false
SCROLITHA_FILE_IMAGES=false
SCROLITHA_FILE_DOCX=false
SCROLITHA_FILE_MULTI=false
SCROLITHA_FILE_SCANNED_PDF=false
```

No traffic shift required. Messaging assistant remains available.

## Revision rollback

| Service | Current (pre-20.7.6) | Prior |
|---|---|---|
| Backend | scrolith-backend-00130-joj (p2075) | scrolith-backend-00128-guz (p2074) |
| Frontend | scrolith-frontend-00159-vox (p2076) | scrolith-frontend-00157-nij (p2075) |

After 20.7.6 deploy, pin traffic to prior revision tags if code regression:

```
gcloud run services update-traffic scrolith-backend --region=asia-southeast1 --to-revisions=PRIOR=100
gcloud run services update-traffic scrolith-frontend --region=asia-southeast1 --to-revisions=PRIOR=100
```

## Data

No migrations. No destructive schema changes. Safe to leave code deployed with flags off.
