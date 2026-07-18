# Phase 20.7 Part 3 — Deployment Report

**Project:** scrolith-500821  
**Region:** asia-southeast1  
**Date:** 2026-07-18

## Images

| Service | Tag | Build ID |
|---|---|---|
| Frontend | `scrolith-frontend:p207-1c7b9f5e` | `93de3ea9-2ea2-40f9-9148-6716532b2615` |
| Backend | `scrolith-backend:p207-07d4b99c` | `179b9657-9a8f-4405-900a-8f733d7862c5` |

## Revisions (post-deploy)

| Service | Active revision | Traffic | Tag / note |
|---|---|---|---|
| Frontend | **`scrolith-frontend-00147-dag`** | **100%** | `p207` |
| Frontend previous | `scrolith-frontend-00145-dez` | 0% | `p206` rollback |
| Frontend emergency | `scrolith-frontend-00138-ruh` | 0% | `p203` |
| Frontend broken | `scrolith-frontend-00140-zaq` | **0%** | `p204` |
| Backend | **`scrolith-backend-00089-f5h`** (LATEST) | **100%** | p207 image + messaging env |
| Backend prior | `scrolith-backend-00118-cud` | 0% | p207 image, messaging=false |
| Backend p206 | `scrolith-backend-00116-qoc` | 0% | rollback |
| Backend p203 | `scrolith-backend-00114-bay` | 0% | rollback |

## Feature flags (backend env, non-secret)

| Variable | Value |
|---|---|
| SCROLITHA_ROLLOUT_MASTER | true (pre-existing) |
| SCROLITHA_ROLLOUT_MESSAGING_ASSISTANT | **true** (enabled after initial false deploy) |
| SCROLITHA_INTERNAL_ROLLOUT | true |
| SCROLITHA_INTERNAL_ALLOW_ADMINS | true |
| SCROLITHA_CORE_ENDPOINT | set (scrolitha-core Cloud Run) |

**Note:** With MASTER already true in production, messaging capability is controlled solely by `SCROLITHA_ROLLOUT_MESSAGING_ASSISTANT` for all users (internal-only path applies only when master is false).

## Deploy sequence

1. BE `00118-cud` image p207 + MESSAGING=false @ 0% → then 100%  
2. FE `00147-dag` image p207 @ 0% → then 100%  
3. Env update MESSAGING=true + INTERNAL → new BE LATEST `00089-f5h` @ 100%  

## Smoke evidence

- Homepage 200, Messages 200, p207 FE 200  
- Platform identity 200 (`scrolitha`, verified)  
- ensure unauth 401  
