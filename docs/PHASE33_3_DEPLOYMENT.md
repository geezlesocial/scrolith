# Phase 33.3 — Production Deployment Report

| Field | Value |
|-------|--------|
| **Phase** | 33.3 |
| **Date** | 2026-07-22 |
| **Scope** | Scrolitha Core Intelligence (NATIVE-first) + Platform Copilot + Skills + Orchestration |
| **External AI providers** | **DISABLED** |
| **Copilot / skills flags** | **Default OFF** + `betaAllowlistOnly: true` |
| **Result** | **PASS** |

---

## Implementation (pre-deploy)

| Item | Value |
|------|--------|
| Branch | `release/backend-production` |
| Backend commit | `a0baa413` (+ UTF-8 schema fix `8cf5a80a`) |
| Frontend commit | `17142608` |
| Unit tests | **74/74** (foundation + assistant + discovery + core33) |
| FE copilot structure tests | **3/3** |

---

## Builds

| Layer | Build ID | Image tag | Status |
|-------|----------|-----------|--------|
| Backend | `7557dfe0-5c2e-4565-b0d5-dd9584ce8009` | `:p333` | **SUCCESS** (rebuild after schema UTF-8 fix) |
| Frontend | `28bfe354-4966-4c0c-9a57-bc6347854414` | `:p333` | **SUCCESS** |

First backend attempt (`4728e34d…`) image failed startup: invalid UTF-8 in `schema.prisma` (PowerShell append BOM). Fixed and rebuilt.

---

## Database

| Item | Status |
|------|--------|
| New migration required for 33.3 | **None** (reuses 33.0–33.2 AI tables + `AIFeatureFlag` for beta allowlist) |
| Prior AI migrations | Already applied in Phase 33.2 deploy |
| Notification row integrity | Unchanged from 33.2 baseline |

**migrationApplied** for 33.3 net-new SQL: N/A (no new SQL). Prior phase migrations remain applied.

---

## Backend deployment

| Item | Value |
|------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-backend:p333` |
| Revision | **`scrolith-backend-00235-mib`** |
| Tag | `p333` |
| Traffic | Staged **5% → 25% → 50% → 100%** |
| Env | `SCROLITHA_AI_ENABLE_PROVIDER_CALLS=false` |
| | `SCROLITHA_AI_FORCE_NO_PROVIDER=1` |
| | `SCROLITHA_AI_KILL_SWITCH=false` |

---

## Frontend deployment

| Item | Value |
|------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend:p333` |
| Revision | **`scrolith-frontend-00299-zah`** |
| Tag | `p333` |
| Traffic | Staged **5% → 25% → 50% → 100%** |

Surfaces: floating **Scrolitha Copilot** (surface-aware), `/assistant`, `/discovery`, `/settings/ai`.

---

## Android

| Item | Value |
|------|--------|
| versionName | **1.1.36** |
| versionCode | **46** |
| AAB | `mobile/release-artifacts/android-1.1.36/app-release.aab` |
| SHA-256 | `3715C6A68EA1B699B897B843C3177557347A83D8134372348ECAA9D6E71401B6` |
| Build | **SUCCESS** (`bundleRelease`) |

Play upload is operator-controlled.

---

## Production smoke

| Check | Result |
|-------|--------|
| `api.scrolith.com/api/health` | 200 |
| `api.scrolith.com/api/ai/health` | 200 |
| `scrolith.com/` + login | 200 |
| p333 tagged BE/FE | 200 |
| `/api/ai/copilot/status` unauth | **401** |
| `/api/ai/skills` unauth | **401** |
| Discovery/status unauth | **401** |

---

## Rollback validation

1. BE → `scrolith-backend-00227-wer` (p332) → health **200**  
2. BE restored → `scrolith-backend-00235-mib` (p333) → health **200**  
3. FE prior `00294-zaq` retained at 0% for rollback  

**rollbackValidated=PASS**

---

## Controlled activation

| Capability | Production state |
|------------|------------------|
| Code paths live | **Yes** |
| `platformCopilotEnabled` / skills / native flags | **OFF** by default |
| `betaAllowlistOnly` | **true** (admins + allowlist when flags enabled) |
| External provider calls | **OFF** (env enforced) |
| NATIVE offline path | Available when flags + consent + allowlist |

Enable path: Admin → Scrolitha AI flags + `PUT /api/ai/beta-allowlist` for cohort IDs.

---

## Rollout timeline (UTC 2026-07-22)

| Step | Time |
|------|------|
| Implement + tests | ~05:55–06:00 |
| FE build | ~06:02 |
| BE fail (schema UTF-8) | ~06:07 |
| Schema fix + BE rebuild | ~06:09–06:13 |
| BE/FE deploy 0% | ~06:13–06:16 |
| Traffic 5→100% | ~06:16–06:29 |
| Smoke + rollback cert | ~06:30–06:32 |
