# Production Rollback Points

Recorded: 2026-05-08, Asia/Singapore.

These are the last known stable Google Cloud Run revisions from the production handoff context. Local `gcloud` was not available when this document was written, so verify the currently serving revisions in Cloud Shell before rollback.

## Current Stable Revisions

| Service | Region | Stable revision | Notes |
| --- | --- | --- | --- |
| `scrolith-frontend` | `us-central1` | `scrolith-frontend-00016-baz` | Guest homepage stable after home-auth fix. |
| `scrolith-backend` | `us-central1` | `scrolith-backend-00007-q9r` | Backend stable baseline before auth/login cleanup deployment. |

## Verify Live Traffic

```sh
gcloud config set project scrolith-prod

gcloud run services describe scrolith-frontend \
  --region us-central1 \
  --format='table(status.traffic.revisionName,status.traffic.percent,status.latestReadyRevisionName)'

gcloud run services describe scrolith-backend \
  --region us-central1 \
  --format='table(status.traffic.revisionName,status.traffic.percent,status.latestReadyRevisionName)'
```

## Roll Back Traffic

```sh
gcloud run services update-traffic scrolith-frontend \
  --region us-central1 \
  --to-revisions scrolith-frontend-00016-baz=100

gcloud run services update-traffic scrolith-backend \
  --region us-central1 \
  --to-revisions scrolith-backend-00007-q9r=100
```

## Post-Rollback Smoke Checks

```sh
curl -I https://scrolith.com
curl -i https://api.scrolith.com/api/health
curl -i https://api.scrolith.com/api/cms/footer
curl -i https://api.scrolith.com/api/auth/me
curl -i https://api.scrolith.com/api/favorites
```

For a fuller smoke pass, run:

```sh
npm run smoke:production
```

To include authenticated login, auth/me, and favorites checks:

```sh
SMOKE_LOGIN_EMAIL='user@example.com' \
SMOKE_LOGIN_PASSWORD='replace-me' \
npm run smoke:production
```
