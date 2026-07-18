# Phase 20.7.2 — Deployment Report

## Builds

| Image | Build ID | Status |
|---|---|---|
| scrolith-backend:p2072-c172b3a0 | 6a9231f3-f072-49c9-8eac-735181559ceb | SUCCESS |
| scrolith-frontend:p2074-104959be | 9b38ec88-c906-48ad-b6ea-9efe6d8e4955 | SUCCESS |

## Revisions

| Service | Revision | Tag | Traffic |
|---|---|---|---|
| Backend | **scrolith-backend-00124-rom** | p2072 | **100%** |
| Backend prior | scrolith-backend-00122-taj | p2071 | 0% |
| Frontend | **scrolith-frontend-00155-goh** | p2074 | **100%** |
| Frontend prior | scrolith-frontend-00153-qid | p2073 | 0% |

## Env changes

| Key | Value |
|---|---|
| SCROLITHA_CORE_MODEL | qwen3:14b (added) |
| SCROLITHA_PROVIDER | core |
| New 20.7.1 caps | unset (false) |

## PRs

| PR | Merge |
|---|---|
| #87 BE recovery | c172b3a0 |
| #88 FE recovery | 77cf727d |
| #89 FE build fix | 104959be |

## Smoke

- p2074 FE: 200  
- /messages: 200  
- ensure unauth: 401  
