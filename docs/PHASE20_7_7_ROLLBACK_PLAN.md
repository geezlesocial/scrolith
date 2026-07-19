# Phase 20.7.7 — Rollback Plan

## Revision rollback

| Service | Safe prior |
|---|---|
| Backend | scrolith-backend-00132-loh (p2076) |
| Frontend | scrolith-frontend-00161-bov (p2077) |

```
gcloud run services update-traffic scrolith-backend --region=asia-southeast1 --to-revisions=scrolith-backend-00132-loh=100
gcloud run services update-traffic scrolith-frontend --region=asia-southeast1 --to-revisions=scrolith-frontend-00159-vox=100
```

(Adjust prior FE to actual pre-20.7.7 revision after deploy.)

## Data

No migrations. Stored `lastMessageText` may contain new labels (“Image”); safe for older clients.

## Impact of rollback

Inbox may again show “No messages” for media-only latest messages.
