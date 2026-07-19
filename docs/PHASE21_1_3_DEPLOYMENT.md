# Phase 21.1.3 — Deployment

## Decision: **no new production deployment**

Policy: deploy only if corrective code is required. Validation found no product defect requiring a revision.

## Current production

- Revision: `scrolith-frontend-00129-vkb`
- Tag: `p2112s`
- Image lineage: `p2112s-afd96d41`
- Traffic: 100%

## Rollback (unchanged)

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00128-gr7=100
```
