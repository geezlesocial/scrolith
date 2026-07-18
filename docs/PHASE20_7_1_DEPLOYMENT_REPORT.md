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

| Service | Revision | Image / tag | Traffic |
|---|---|---|---|
| Backend | **scrolith-backend-00122-taj** | `p2071-a7c52a6f` / tags p2071 (+ LATEST) | **100%** |
| Backend rollback | scrolith-backend-00089-f5h | prior production | 0% |
| Frontend | **scrolith-frontend-00153-qid** | `p2073-85499340` / tag **p2073** | **100%** |
| Frontend rollback | scrolith-frontend-00151-fin | p2072 | 0% |

### Builds

| Image | Build ID | Status |
|---|---|---|
| scrolith-backend:p2071-a7c52a6f | 9cb58b42-f568-4fc7-a07f-fa39afa2081a | SUCCESS |
| scrolith-frontend:p2073-85499340 | d70282ef-eb6c-4d9f-911f-7caa182c47be | SUCCESS |

### PRs / commits

| PR | Merge | Branch |
|---|---|---|
| #85 BE | a7c52a6f | feat/phase20-7-1-scrolitha-capabilities-be → release/backend-production |
| #86 FE | 85499340 | feat/phase20-7-1-scrolitha-capabilities-fe → main |

### Smoke (post-traffic)

| Check | Result |
|---|---|
| FE tag URL p2073 | 200 |
| /messages | 200 |
| POST ensure unauth | 401 No token |
| Platform identity | 200 scrolitha verified |
| New capability env flags | **unset** (default false) |
| MESSAGING_ASSISTANT | true (unchanged) |

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
