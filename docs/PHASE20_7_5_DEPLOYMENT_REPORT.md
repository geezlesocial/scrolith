# Phase 20.7.5 — Deployment Report

## Builds

| Image | Build ID | Status |
|---|---|---|
| scrolith-backend:p2075-c38f1c67 | b96a6060-1cdb-4363-b95a-8561135a29ed | SUCCESS |
| scrolith-frontend:p2076-6ddf1d27 | 2ec14a97-d520-4316-8ec7-b8898359b31e | SUCCESS |

## PRs

| PR | Merge |
|---|---|
| #93 BE | c38f1c67 |
| #94 FE | 6ddf1d27 |

## Live revisions

| Service | Revision | Tag | Traffic |
|---|---|---|---|
| Backend | scrolith-backend-00130-joj | p2075 | 100% |
| Backend prior | scrolith-backend-00128-guz | p2074 | 0% |
| Frontend | scrolith-frontend-00159-vox | p2076 | 100% |
| Frontend prior | scrolith-frontend-00157-nij | p2075 | 0% |

## Smoke

- `GET /api/messages/search?q=scrolitha` unauth → 401 (route exists)
- p2076 FE → 200
