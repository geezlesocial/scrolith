# Phase 20.7 Messages Viewport — Deployment

| Field | Value |
|---|---|
| Service | scrolith-frontend |
| Region | asia-southeast1 |
| Image | `p2072-57f5e366` |
| New revision | **`scrolith-frontend-00151-fin`** |
| Traffic | **100%** tag `p2072` |
| Immediate rollback | **`scrolith-frontend-00149-siz`** (p2071) |
| p207 | `00147-dag` 0% |
| Backend | Unchanged |

## Rollback

```bash
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00149-siz=100
```
