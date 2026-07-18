# Phase 20.7 Part 3 — Rollback Plan

## Immediate feature kill (no redeploy)

```bash
gcloud run services update scrolith-backend --region asia-southeast1 \
  --update-env-vars "SCROLITHA_ROLLOUT_MESSAGING_ASSISTANT=false"
```

Human messaging continues; AI ensure/create and AI turns stop.

## Frontend revision rollback

```bash
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00145-dez=100
```

## Backend revision rollback

```bash
gcloud run services update-traffic scrolith-backend --region asia-southeast1 \
  --to-revisions scrolith-backend-00116-qoc=100
```

Or p203: `scrolith-backend-00114-bay=100`

## Constraints

- Keep p204 at 0%  
- Do not delete historical revisions  
- Existing Scrolitha DMs remain as normal conversations if flag off (no auto-delete)  
