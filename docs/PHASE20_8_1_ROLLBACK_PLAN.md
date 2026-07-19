# Phase 20.8.1 — Rollback Plan

## Trigger

- Desktop Messages regression
- Mobile composer unusable after deploy
- Critical JS error on `/messages`
- Attachment launcher broken in production

## Immediate FE rollback (preferred)

```bash
gcloud run services update-traffic scrolith-frontend \
  --project=scrolith-500821 \
  --region=asia-southeast1 \
  --to-revisions=scrolith-frontend-00169-wob=100
```

| Field | Value |
|---|---|
| Rollback revision | `scrolith-frontend-00169-wob` |
| Tag | `p2081` |
| Image | `scrolith-frontend:p2081-11acf8be` |
| Expected time | &lt; 2 minutes traffic shift |

## Active (current) revision

| Field | Value |
|---|---|
| Revision | `scrolith-frontend-00171-yis` |
| Tag | `p2082` |
| Image | `scrolith-frontend:p2082-mobile` |

## Backend

No rollback required for 20.8.1 (backend not changed).

## Data

No migrations. No data repair. Client drafts remain local.

## Verification after rollback

1. GET scrolith.com/messages → 200  
2. Desktop Smart Composer (Phase 20.8) still works  
3. Confirm traffic 100% on `00169-wob`
