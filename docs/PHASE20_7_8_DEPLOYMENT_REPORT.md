# Phase 20.7.8 — Deployment Report

## Pre-deploy

| Service | Revision | Tag |
|---|---|---|
| Backend | scrolith-backend-00134-neh | p2077 |
| Frontend | scrolith-frontend-00163-wer | p2078 |

## Builds

| Image | Status |
|---|---|
| scrolith-backend:p2078-f45228c6 | SUCCESS |
| scrolith-frontend:p2079-e9723d9a | SUCCESS |

## Post-deploy traffic

| Service | Revision | Tag | Traffic |
|---|---|---|---|
| Backend | scrolith-backend-00136-ziz | p2078 | 100% |
| Backend prior | scrolith-backend-00134-neh | p2077 | 0% |
| Frontend | scrolith-frontend-00165-bef | p2079 | 100% |
| Frontend prior | scrolith-frontend-00163-wer | p2078 | 0% |

## PRs

| PR | Merge |
|---|---|
| #99 BE | f45228c6 |
| #100 FE | 6f712333 |
| #102 FE fix | e9723d9a |

## Smoke

| Check | Result |
|---|---|
| GET /api/scrolitha/public-profile | 200 |
| GET /u/scrolitha | 200 |
| GET /api/health | 200 |
