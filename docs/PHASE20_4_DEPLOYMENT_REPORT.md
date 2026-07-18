# Phase 20.4 — Deployment Report

**Date:** 2026-07-18  
**Component:** Frontend only (additive UI on existing APIs)  
**Git SHA:** `0a54dde6`  
**Image tag:** `scrolith-frontend:p204-0a54dde6`

## Sequence
1. Unit tests + production Vite build PASS  
2. Cloud Build image  
3. Deploy tagged candidate `p204` with 0% traffic  
4. Smoke homepage / dashboard deep links  
5. Promote 100%  
6. Verify previous `p203` tag remains rollback target  

## Backend
Unchanged at Phase 20.3 revision (`scrolith-backend-00114-bay`). No migrations.

## Rollback
```bash
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00138-ruh=100
```
