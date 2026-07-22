# Phase 33.2 — Production Deployment Report

| Field | Value |
|-------|--------|
| **Phase** | 33.2 |
| **Date** | 2026-07-22 |
| **Scope** | Scrolitha AI intelligence layer (33.0–33.2 code paths) + additive AI DB tables |
| **External AI providers in prod** | **DISABLED** (`SCROLITHA_AI_ENABLE_PROVIDER_CALLS=false`, `SCROLITHA_AI_FORCE_NO_PROVIDER=1`) |
| **Discovery/assistant feature flags** | **Default OFF** (internal enable via admin only) |
| **Result** | **PASS** |

---

## Pre-deploy

| Item | Result |
|------|--------|
| Branch | `release/backend-production` |
| Implementation commits | `e42aa497` (33.0), `bb969e5b` (33.1), `678be288` (33.2) + FE submodule |
| Unit tests (33.0–33.2) | **57/57 PASS** |
| Cloud SQL backup | **`1784697942927`** SUCCESS (`phase332-pre-deploy-20260722-132538`) |
| Rollback BE | `scrolith-backend-00221-qam` (p32) retained |
| Rollback FE | `scrolith-frontend-00292-dux` (p32) retained |

---

## Migrations (additive)

| Migration | Status |
|-----------|--------|
| `20260722190000_phase330_scrolitha_ai_foundation` | **APPLIED** |
| `20260722200000_phase331_scrolitha_ai_assistant` | **APPLIED** |
| `20260722210000_phase332_intelligent_discovery` | **APPLIED** |

| Metric | Value |
|--------|--------|
| Notification row count | **185 → 185** (no loss) |
| Method | `scripts/phase332-apply-migrations.mjs` via Cloud SQL Auth Proxy `127.0.0.1:5433` |
| Evidence | `docs/evidence/phase332_migration_report.json` |

**migrationApplied=PASS**

---

## Backend deployment

| Item | Value |
|------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-backend:p332` |
| Build ID | `386c9f2d-b402-457b-ada0-ff3f047601ed` **SUCCESS** |
| Revision | **`scrolith-backend-00227-wer`** |
| Tag | `p332` |
| Traffic | Staged **5% → 25% → 50% → 100%** |
| AI env | `SCROLITHA_AI_ENABLE_PROVIDER_CALLS=false`, `SCROLITHA_AI_FORCE_NO_PROVIDER=1` |

---

## Frontend deployment

| Item | Value |
|------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend:p332` |
| Build ID | `569b07cc-be97-4704-9cb6-8a8f18a36ccc` **SUCCESS** |
| Revision | **`scrolith-frontend-00294-zaq`** |
| Tag | `p332` |
| Traffic | Staged **5% → 25% → 50% → 100%** |

Routes shipped: `/assistant`, `/discovery`, `/settings/ai`, Admin Scrolitha AI + Discovery Analytics.

---

## Android

| Item | Value |
|------|--------|
| versionName | **1.1.35** |
| versionCode | **45** |
| AAB | `mobile/release-artifacts/android-1.1.35/app-release.aab` |
| SHA-256 | `4E44471F83A3DFB182D876C845C552A0016F1BF697FA88F21E26C1055AAE2073` |
| Build | **SUCCESS** (`bundleRelease`) |

Play upload is operator-controlled; artifact ready.

---

## Production smoke

| Check | Result |
|-------|--------|
| `https://api.scrolith.com/api/health` | 200 |
| `https://api.scrolith.com/api/ai/health` | 200 |
| AI discovery/status unauth | **401** |
| `https://scrolith.com/` | 200 |
| Login page | 200 |
| p332 tagged BE health | 200 |
| p332 tagged FE | 200 |

---

## Rollback validation

1. Switched BE traffic to `scrolith-backend-00221-qam` (p32) → health **200**  
2. Restored BE traffic to `scrolith-backend-00227-wer` (p332) → health **200**  
3. FE prior revision `00292-dux` retained at 0% for rollback  

**rollbackValidated=PASS**

---

## Controlled activation (post-deploy)

| Capability | Production state |
|------------|------------------|
| Code + routes | **Live** |
| AI discovery / assistant surface flags | **OFF** (defaults) |
| External provider calls | **OFF** (env enforced) |
| MOCK path | Available when flags enabled for internal tests |
| Production AI provider calls | **false** |

Internal enable: Admin → Scrolitha AI → Feature Flags (RBAC + confirm for high-risk).  
Do **not** set `SCROLITHA_AI_ALLOW_PROD_PROVIDER=1` without separate approval.

---

## Rollout timeline (UTC 2026-07-22)

| Step | Approx |
|------|--------|
| Backup | 05:25 |
| Migrations | 05:27 |
| Cloud Builds | 05:28–05:31 |
| Deploy 0% traffic | 05:36–05:38 |
| Staged traffic 5→100% | 05:39–05:42 |
| Rollback drill | 05:42–05:43 |
