# Phase 20.4 — Deployment Report

**Date:** 2026-07-18  
**Component:** Frontend only (additive UI on existing APIs)  
**Git SHA:** `0a54dde6`  
**Image tag:** `scrolith-frontend:p204-0a54dde6`

## Sequence
1. Unit tests + production Vite build PASS  
2. Cloud Build image (`b0750a3b-cd58-441d-8ac9-56d1a76f4b71`) SUCCESS  
3. Deploy tagged candidate `p204` → revision `scrolith-frontend-00140-zaq` at 0%  
4. Promote 100%  
5. Smoke: homepage 200 + security headers; growth-pulse OK; `p203` rollback tag reachable  

## Production revision
- **Frontend 100%:** `scrolith-frontend-00140-zaq` (tag `p204`)  
- **Backend 100%:** `scrolith-backend-00114-bay` (Phase 20.3, unchanged)

## Backend
Unchanged at Phase 20.3 revision. No migrations.

## Rollback
```bash
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00138-ruh=100
```
