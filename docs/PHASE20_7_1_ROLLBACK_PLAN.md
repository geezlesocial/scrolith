# Phase 20.7.1 — Rollback Plan

## Capability kill (preferred)

Set any/all of:

```
SCROLITHA_ROLLOUT_CONVERSATION_UNIFICATION=false
SCROLITHA_ROLLOUT_MESSAGING_STREAM=false
SCROLITHA_ROLLOUT_RICH_ENTITY_CARDS=false
SCROLITHA_ROLLOUT_TOOL_EXECUTION=false
SCROLITHA_ROLLOUT_TOOL_WRITE_ACTIONS=false
SCROLITHA_ROLLOUT_CONFIRMATION_TOKENS=false
SCROLITHA_ROLLOUT_FILE_UNDERSTANDING=false
SCROLITHA_ROLLOUT_QUALITY_FEEDBACK=false
```

Or disable messaging surface:

```
SCROLITHA_ROLLOUT_MESSAGING_ASSISTANT=false
```

## Revision rollback

```bash
# Frontend to p2072
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00151-fin=100

# Backend to pre-20.7.1 LATEST if needed
gcloud run services update-traffic scrolith-backend --region asia-southeast1 \
  --to-revisions scrolith-backend-00089-f5h=100
```

## Data

No destructive schema migrations. Cards/tokens are metadata/cache only.
