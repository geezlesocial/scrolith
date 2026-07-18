# Phase 20.7.1 — Deployment Report

**Date:** 2026-07-18  
**Project:** scrolith-500821  
**Region:** asia-southeast1

## Baseline (pre-deploy)

| Service | Revision | Tag | Traffic |
|---|---|---|---|
| Frontend | scrolith-frontend-00151-fin | p2072 | 100% |
| Backend | scrolith-backend-00089-f5h | LATEST | 100% |

## Deploy plan

1. Build/deploy backend image with new flags **unset** (default false).  
2. Build/deploy frontend image.  
3. Smoke: health, messages, ensure, turn unauth 401.  
4. Progressive env enablement (documented separately).  

## Post-deploy revisions

_Filled after deploy commands complete._

## New env vars (optional)

All default off when omitted:

- SCROLITHA_ROLLOUT_CONVERSATION_UNIFICATION  
- SCROLITHA_ROLLOUT_MESSAGING_STREAM  
- SCROLITHA_ROLLOUT_RICH_ENTITY_CARDS  
- SCROLITHA_ROLLOUT_TOOL_EXECUTION  
- SCROLITHA_ROLLOUT_TOOL_WRITE_ACTIONS  
- SCROLITHA_ROLLOUT_CONFIRMATION_TOKENS  
- SCROLITHA_ROLLOUT_FILE_UNDERSTANDING  
- SCROLITHA_ROLLOUT_QUALITY_FEEDBACK  
