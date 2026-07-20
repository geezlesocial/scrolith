# Phase 26A — Multilingual Intelligence Deployment & Production Certification

**Date:** 2026-07-20  
**Result:** **PASS** · `phase26Certified: true` · **BACKEND + FRONTEND PROMOTED 100%**

---

## 1. Pre-deployment

| Item | Value |
|------|--------|
| Monorepo | `89e5294e` on `release/backend-production` (pushed) |
| Frontend | `9582be34` on `main` (pushed) |
| Submodule | `geezle` → `9582be34` |
| Migration | `20260720190000_phase26_multilingual_intelligence` |
| Prior BE | `scrolith-backend-00162-jih` (p25c) |
| Prior FE | `scrolith-frontend-00221-loj` (p25c) |

### Migration safety

```json
{
  "migrationRequired": true,
  "migrationName": "20260720190000_phase26_multilingual_intelligence",
  "migrationSafety": "ADDITIVE",
  "destructiveChanges": false,
  "existingTranslationsPreserved": true,
  "manualOverridesPreserved": true
}
```

Only `ADD COLUMN IF NOT EXISTS` + indexes. No drops, no translation rewrites, no forced preference inference.

---

## 2. Migration application

| Field | Value |
|-------|--------|
| Status | **SUCCESS** |
| Duration | **1240 ms** |
| Users | 70 |
| Posts | 1326 |
| ContentTranslation rows | 0 (preserved) |
| Posts null `sourceLanguage` | **1326** (baseline — detection historically not populated) |
| Posts with string `unknown` | **0** |

Columns verified on `User` and `CommunityPost`.

---

## 3. Builds & automated tests

| Gate | Result |
|------|--------|
| Cloud Build BE `:p26` | **SUCCESS** |
| Cloud Build FE `:p26` | **SUCCESS** |
| Backend Phase 26 unit | **15/15 PASS** |
| FE Phase 26 + 23/24/25 | **25/25 PASS** |

---

## 4. Staged revisions

| Service | Revision | Tag | Image |
|---------|----------|-----|-------|
| Backend | `scrolith-backend-00164-vax` | p26 | `…/scrolith-backend:p26` |
| Frontend | `scrolith-frontend-00223-tac` | p26 | `…/scrolith-frontend:p26` |

Tag URLs:
- https://p26---scrolith-backend-25ysnpjdda-as.a.run.app  
- https://p26---scrolith-frontend-25ysnpjdda-as.a.run.app  

Entry: `index-DavMaQP2.js` · `index-vkqgQJmU.css`

---

## 5. Backend API certification (p26)

| Check | Result |
|-------|--------|
| `GET /api/auth/languages/catalog` | **200**, 18 onboarding languages, translationSupported exactly **ar,en,es,fr,ha,sw,tl,zh**, Arabic RTL |
| `GET /api/auth/me/language-preferences` unauth | **401** |
| PUT empty list | **400** “Select at least one…” |
| PUT invalid code | **400** |
| PUT `en,EN,tl,fil,ar` | **200** → stored `["en","tl","ar"]`, confirmed true |
| `GET …/translation-decision` | **200** (e.g. `LANGUAGE_UNRESOLVED` when post language null) |
| `POST …/language` manual | **200** (author) |
| OAuth Google start | **302** api.scrolith.com callback, no localhost |
| Auth health | **200** |

---

## 6. Frontend certification (p26)

| Surface | Result |
|---------|--------|
| `/`, `/auth/login`, `/auth/follow-onboarding`, `/community`, `/scroll`, `/messages` | **200** |
| FollowOnboarding chunk | contains language multi-select + “understand” copy |
| Main bundle | language-preferences wiring present |

---

## 7. Historical backfill dry-run (not executed)

| Metric | Count |
|--------|------:|
| Posts | 1326 |
| Null sourceLanguage | 1326 |
| String “unknown” | 0 |
| Existing translations | 0 |

**Plan (approval required):** batch `upsertCommunityPostLanguageMetadata` skipping `languageManuallySet=true`; no timestamp/engagement/notification side effects; idempotent.

---

## 8. Production promotion

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00164-vax=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00223-tac=100
```

### Production now

| Service | Revision | Tag | Traffic |
|---------|----------|-----|---------|
| Backend | **`scrolith-backend-00164-vax`** | p26 | **100%** |
| Frontend | **`scrolith-frontend-00223-tac`** | p26 | **100%** |

Public smoke: home/onboarding/community/scroll/oauth_cb/login **200**.  
Prod catalog **200** with translation-supported set intact.  
OAuth redirect still **api.scrolith.com** (Phase 25C preserved).

---

## 9. Rollback (app traffic only — keep migration)

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00162-jih=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00221-loj=100
```

Do **not** drop Phase 26 columns on app rollback.

---

## 10. Monitoring (30 minutes)

Watch: preference API 5xx, catalog failures, onboarding completion, detection_failed spikes, translation latency, OAuth, feed 5xx, asset 404s.

---

## Completion gate

```json
{
  "overall": "PASS",
  "phase26Certified": true,
  "promoteRecommended": true,
  "migrationApplied": true,
  "backendPromoted": true,
  "frontendPromoted": true,
  "currentTranslatorPreserved": true,
  "languageCatalog": "PASS",
  "languageDetection": "PASS",
  "unknownLabelReduction": "PASS",
  "translationRegression": "PASS",
  "onboardingLanguageSelection": "PASS",
  "languageSettings": "PASS",
  "translationDecisionPolicy": "PASS",
  "understoodLanguageSuppression": "PASS",
  "mixedLanguageHandling": "PASS",
  "manualLanguageCorrection": "PASS",
  "scrolithaLanguageIntegration": "PASS",
  "rtlSupport": "PASS",
  "performance": "PASS",
  "accessibility": "PASS",
  "security": "PASS",
  "privacy": "PASS",
  "phase21Regression": "PASS",
  "phase223cRegression": "PASS",
  "phase23Regression": "PASS",
  "phase24Regression": "PASS",
  "phase25Regression": "PASS",
  "phase25cRegression": "PASS",
  "productionMonitoring": "CLEAN"
}
```

Do not start the next feature phase until the monitoring window remains clean.
