# Phase 20.7 Dock Overlap — Certification

## Result

**COMPLETE — DEPLOYED, LIMITED VALIDATION**

Layout patch is in production (`00149-siz` / p2071). Unauthenticated smoke and automated tests pass. Visual authenticated confirmation of dock absence requires operator hard-refresh.

## Gates

| # | Gate | Result |
|---|---|---|
| 1 | Root cause identified | **YES** |
| 2 | Route policy implemented | **YES** |
| 3 | Unmount (not z-index) | **YES** |
| 4 | MessageContext preserved | **YES** |
| 5 | No CSS-only hide as primary | **YES** |
| 6 | Unit tests | **YES** |
| 7 | Build | **YES** |
| 8 | Merge + deploy | **YES** |
| 9 | Unauth smoke | **YES** |
| 10 | Auth visual smoke | **PENDING OPERATOR** |
| 11 | Rollback ready | **YES** → `00147-dag` or `00145-dez` |

## Rollback

```bash
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00147-dag=100
```
