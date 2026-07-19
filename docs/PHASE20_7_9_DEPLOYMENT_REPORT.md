# Phase 20.7.9 — Deployment Report

## Pre-deploy

| Service | Revision |
|---|---|
| BE | scrolith-backend-00136-ziz (p2078) |
| FE | scrolith-frontend-00165-bef (p2079) |

## Flags to set on backend (progressive)

```
SCROLITHA_ROLLOUT_FILE_UNDERSTANDING=true
SCROLITHA_FILE_TEXT=true
SCROLITHA_FILE_PDF=true
SCROLITHA_FILE_DOCX=true
SCROLITHA_FILE_IMAGES=true
SCROLITHA_FILE_MULTI=true
SCROLITHA_FILE_SCANNED_PDF=false
SCROLITHA_ROLLOUT_MESSAGING_STREAM=true
SCROLITHA_ROLLOUT_TOOL_EXECUTION=true
SCROLITHA_ROLLOUT_CONFIRMATION_TOKENS=true
SCROLITHA_ROLLOUT_TOOL_WRITE_ACTIONS=true
```

## Post-deploy

_Filled after Cloud Run update._
