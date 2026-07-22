# Phase 31 — Production Validation

## Scope

Validate production after deploying Phase 29 messaging groups + Phase 30 human verification **without enabling HV master**.

## Smoke matrix

| Area | Method | Result |
|------|--------|--------|
| API health | GET `/api/health` | PASS 200 |
| Auth health | GET `/api/auth/health` | PASS 200 |
| Login validation | POST `/api/auth/login` `{}` | PASS 400 |
| HV master off | GET `/api/human-verification/config?endpoint=login` | PASS `required=false` |
| HV create off | POST `/api/human-verification/create` | PASS `master_disabled` |
| Support categories | GET `/api/support/categories` | PASS 200 |
| Messaging privacy auth gate | GET `/api/messages/settings/privacy` | PASS 401 |
| Admin HV auth gate | GET `/api/admin/security/human-verification/settings` | PASS 401 |
| FE home / support / login / signup | Browser GET | PASS 200 |

## Phase 29 (Messaging Groups) expectations

| Capability | Status |
|------------|--------|
| Group schema (SECRET, joinPolicy, etc.) | Present (migration already applied) |
| Search indexes | Present |
| Privacy settings endpoint | Auth-required (401 unauth) — live |
| Admin messaging groups routes | Deployed with BE p31 |
| Realtime `/community` | Retained platform namespace |

Authenticated E2E (create group, invite, typing, pins) requires a live user session and was not automated with credentials in this phase. Unauthenticated contract checks + prior Phase 29.7 certification + schema validation constitute the production gate for this deploy.

## Phase 30 (Human Verification) expectations

| Capability | Status |
|------------|--------|
| Tables present | PASS (6 tables) |
| Public API mounted | PASS |
| Master default | **Disabled** (PASS) |
| Auth/support continue without token | PASS (master off) |
| Admin settings path | Auth-gated PASS |

## Negative checks

| Check | Expected | Result |
|-------|----------|--------|
| HV does not block login when master off | Login only credential validation | PASS |
| No third-party CAPTCHA required for Scrolith HV | No Google dependency | PASS |

## Staged rollout observation

| Stage | API health | FE health |
|-------|------------|-----------|
| 5% | OK | OK |
| 25% | OK | OK |
| 100% | OK | OK |

## Android validation checklist (operator)

After installing AAB 1.1.33:

1. Open app → production URLs load  
2. Login / messaging list  
3. Support form loads (HV widget hidden while master off)  
4. Push deep links (prior contract)  

## Residual items for enablement (post-Phase 31)

1. Admin enables Master only after dry-run create/verify in staging or low-traffic window  
2. Monitor `HumanVerificationAttempt` failure rate  
3. Keep Emergency Disable ready  
