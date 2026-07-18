# Phase 20.4.1 — Deployment Report

## Emergency rollback (first action)

| Field | Value |
|---|---|
| From | `scrolith-frontend-00140-zaq` (p204 — broken) |
| To | **`scrolith-frontend-00138-ruh` (p203 — stable)** |
| Backend | Unchanged `scrolith-backend-00114-bay` |

## Fix deploy

| Field | Value |
|---|---|
| Image | `scrolith-frontend:p2041-3f69246a` |
| Build ID | `194ffe81-0e3d-469a-a0d1-f81f92bab682` |
| Git SHA | `3f69246a` |
| PR | #77 |
| Candidate tag | `p2041` |
| New revision | **`scrolith-frontend-00143-leb`** |
| Traffic | **100%** after candidate smoke |

## Post-deploy smoke

| Check | Result |
|---|---|
| Candidate homepage | 200 |
| Production homepage | 200 + nosniff |
| p203 rollback tag | Reachable |
| p204 (broken) tag | Still exists at 0% (do not promote) |
| Backend health | OK |

## Rollback instructions (current)

If p2041 regresses:

```bash
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00138-ruh=100
```

Alternative last-known-good tags: `p203`, or pre-20.4 `p2028` (`00136-dit`).
