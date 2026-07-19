# Phase 20.7.7 — Deployment Report

## Pre-deploy

| Service | Revision | Tag |
|---|---|---|
| Backend | scrolith-backend-00132-loh | p2076 |
| Frontend | scrolith-frontend-00161-bov | p2077 |

## Post-deploy

_Populated after Cloud Build + traffic shift._

## Smoke

- GET /api/health → 200  
- GET / → 200  
- Messages search unauth → 401  
