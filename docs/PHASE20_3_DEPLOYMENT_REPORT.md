# Phase 20.3 — Deployment Report

**Date:** 2026-07-18  
**Region:** asia-southeast1  
**Project:** scrolith-500821

## Artifacts

| Component | Image | Build ID | Git SHA |
|---|---|---|---|
| Frontend | `scrolith-frontend:p203-a3eee9cf` | `11728a81-cbb7-4335-ac29-0ba348b3d46a` | `a3eee9cf` |
| Backend | `scrolith-backend:p203-40136336` | `59abe290-d03e-4549-beb4-b8219c5bbe7c` | `40136336` |

## Revisions

| Service | Previous 100% | New 100% | Tag |
|---|---|---|---|
| Frontend | `scrolith-frontend-00136-dit` (p2028) | **`scrolith-frontend-00138-ruh`** | `p203` |
| Backend | `scrolith-backend-00112-qar` (p2028) | **`scrolith-backend-00114-bay`** | `p203` |

## Sequence

1. Cloud Build FE + BE SUCCESS  
2. Deploy BE tagged `p203` no-traffic → smoke health/readyz/growth-pulse  
3. Deploy FE tagged `p203` no-traffic  
4. Promote BE 100%  
5. Promote FE 100%  
6. Production smoke + rollback tag verification  

## Migrations

None.

## Rollback

```bash
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00136-dit=100
gcloud run services update-traffic scrolith-backend --region asia-southeast1 \
  --to-revisions scrolith-backend-00112-qar=100
```

Previous tags `p2028` verified reachable after promote.
