# Phase 20.7.7 — Deployment Report

## Pre-deploy

| Service | Revision | Tag |
|---|---|---|
| Backend | scrolith-backend-00132-loh | p2076 |
| Frontend | scrolith-frontend-00161-bov | p2077 |

## Builds

| Image | Build ID | Status |
|---|---|---|
| scrolith-backend:p2077-e08343fa | 3b019e7b-6019-426a-808e-e9846ea722d6 | SUCCESS |
| scrolith-frontend:p2078-41321764 | f3c9d655-28c5-4962-9f5f-5421d087f239 | SUCCESS |

## Post-deploy traffic

| Service | Revision | Tag | Traffic |
|---|---|---|---|
| Backend | scrolith-backend-00134-neh | p2077 | 100% |
| Backend prior | scrolith-backend-00132-loh | p2076 | 0% |
| Frontend | scrolith-frontend-00163-wer | p2078 | 100% |
| Frontend prior | scrolith-frontend-00161-bov | p2077 | 0% |

## Smoke

| Check | Result |
|---|---|
| GET /api/health | 200 |
| GET https://scrolith.com/ | 200 |
| GET /api/messages/search?q=test unauth | 401 |

## PRs

| PR | Merge |
|---|---|
| #97 BE | e08343fa |
| #98 FE | 41321764 |
