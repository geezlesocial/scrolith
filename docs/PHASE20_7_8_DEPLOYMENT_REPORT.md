# Phase 20.7.8 — Deployment Report

## Pre-deploy

| Service | Revision | Tag |
|---|---|---|
| Backend | scrolith-backend-00134-neh | p2077 |
| Frontend | scrolith-frontend-00163-wer | p2078 |

## Post-deploy

_Populated after Cloud Build._

## Smoke

- GET /api/scrolitha/public-profile → 200
- GET /u/scrolitha → 200
- GET /api/health → 200
