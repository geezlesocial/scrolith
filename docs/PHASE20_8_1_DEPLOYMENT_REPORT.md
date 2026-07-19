# Phase 20.8.1 — Deployment Report

## Pre-deploy

| Service | Revision | Tag | Image |
|---|---|---|---|
| Frontend | `scrolith-frontend-00169-wob` | p2081 | `scrolith-frontend:p2081-11acf8be` |
| Backend | `scrolith-backend-00138-zan` | p2079 | `scrolith-backend:p2079-3de89a3d` |

## Source

| Item | Value |
|---|---|
| FE commit | `bbc73f71` — fix(messages): Phase 20.8.1 mobile Smart Composer recovery (#107) |
| PR | https://github.com/geezlesocial/geezle/pull/107 (merged to main) |
| Branch at merge | main |

## Build

| Item | Value |
|---|---|
| Cloud Build ID | `8700188b-e582-4956-8756-da0309d3d996` |
| Status | SUCCESS |
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend:p2082-mobile` |
| Digest | `sha256:88ef2531a21b034d1dd104538d3e05e98da8a3f7084d38d1748a92a3f42d403b` |
| Config | `geezle/cloudbuild.p2082-fe.submit.yaml` |
| Build args | VITE_API_URL / VITE_BACKEND_URL / VITE_PUBLIC_APP_DOMAIN / VITE_PUBLIC_APP_URL production |

## Deploy

```text
gcloud run deploy scrolith-frontend \
  --project=scrolith-500821 --region=asia-southeast1 \
  --image=.../scrolith-frontend:p2082-mobile \
  --tag=p2082 --no-traffic

# Created revision scrolith-frontend-00171-yis (0%)

gcloud run services update-traffic scrolith-frontend \
  --project=scrolith-500821 --region=asia-southeast1 \
  --to-revisions=scrolith-frontend-00171-yis=100
```

## Post-deploy traffic

| Service | Revision | Tag | Traffic |
|---|---|---|---|
| Frontend | `scrolith-frontend-00171-yis` | p2082 | **100%** |
| Frontend prior | `scrolith-frontend-00169-wob` | p2081 | 0% (rollback target) |
| Backend | `scrolith-backend-00138-zan` | p2079 | **100% unchanged** |

Tagged URL: https://p2082---scrolith-frontend-25ysnpjdda-as.a.run.app

## Smoke

| Check | Result |
|---|---|
| GET p2082 `/` | 200 |
| GET p2082 `/messages` | 200 |
| GET scrolith.com `/` | 200 |
| GET scrolith.com `/messages` | 200 |
| GET api.scrolith.com `/api/health` | 200 `{"status":"OK",...}` |

## Backend

No backend image change. No schema migration. Messaging APIs unchanged.
