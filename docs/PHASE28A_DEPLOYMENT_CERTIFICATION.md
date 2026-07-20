# Phase 28A — Enterprise Multi-Currency Deployment & Production Certification

**Status:** CERTIFIED / PROMOTED  
**Date:** 2026-07-20 / 2026-07-21  
**Region:** asia-southeast1  
**Project:** scrolith-500821  

---

## 1. Push and repository verification

| Item | Value |
|------|--------|
| Monorepo branch | `release/backend-production` |
| Frontend branch | `main` (geezle) |
| Phase 28 backend commit | `60310a3e` |
| Phase 28 frontend commit | `0fa835cb` |
| Submodule bump | `1ead79a6` → later `e3efe3bc` / `3a2428f5` |
| Frontend hotfixes | `58dea138` (Gcoin float format + p28 cloudbuild) |
| Migration fix | `3a2428f5` (`User` table not `users`) |
| Remote verification | Pushed to `origin` (github.com:geezlesocial/scrolith.git) |
| Unrelated working tree changes | Excluded from commits |

### Production revisions (before → after)

| Service | Before (100%) | After (100%) | Tag |
|---------|---------------|--------------|-----|
| Backend | `scrolith-backend-00121-d7d` | `scrolith-backend-00183-lep` | `p28` |
| Frontend | `scrolith-frontend-00153-2w2` | `scrolith-frontend-00241-koh` | `p28` |

### Rollback revisions

```bash
# Backend
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00121-d7d=100

# Frontend
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00153-2w2=100
```

Do **not** drop additive migration objects on application rollback.

---

## 2. Migration safety

```json
{
  "migrationRequired": true,
  "migrationName": "20260721090000_phase28_multi_currency",
  "migrationSafety": "ADDITIVE",
  "destructiveChanges": false,
  "historicalAmountsRewritten": false,
  "walletBalancesRewritten": false,
  "gatewayConfigurationChanged": false
}
```

**Fix before apply:** SQL originally referenced `"users"`; production table is Prisma `"User"`. Corrected and re-committed in `3a2428f5`.

### Apply result (production Cloud SQL)

| Field | Value |
|-------|--------|
| Instance | `scrolith-postgres-prod` |
| Started | 2026-07-20T23:29:08.618Z |
| Ended | 2026-07-20T23:29:14.656Z |
| Duration | 6035 ms |
| Status | APPLIED |
| Users | 70 → 70 (unchanged) |
| Wallets | 5 (unchanged) |
| Columns added | `preferred_currency`, `currency_preference_updated_at` on `"User"` |
| Table added | `fx_quotes` + 4 indexes |

### Backup

On-demand Cloud SQL backup created before migration:

- Instance: `scrolith-postgres-prod`
- Description: `Phase28A pre-migration multi-currency 2026-07-21`
- Result: SUCCESS

---

## 3. Build and test results

| Gate | Result |
|------|--------|
| Backend Docker `:p28` | SUCCESS (rebuild after migration fix) |
| Frontend Docker `:p28` | SUCCESS |
| Backend `tsc` production | PASS_WITH_PREEXISTING_UNRELATED_ERRORS (messaging/OAuth/scrolitha types; not Phase 28) |
| Unit tests | **22/22 PASS** (money 4 + policy 4 + phase28a deployment 14) |

Arithmetic fixture: `10.00 USD × 57.25 → 572.50 PHP` (minor `1000` → `57250`), no float residue.

---

## 4. Staged deployment (0% traffic)

| Service | Revision | Tag URL |
|---------|----------|---------|
| Backend | `scrolith-backend-00183-lep` | https://p28---scrolith-backend-25ysnpjdda-as.a.run.app |
| Frontend | `scrolith-frontend-00241-koh` | https://p28---scrolith-frontend-25ysnpjdda-as.a.run.app |

### Tagged certification (before promote)

| Check | Result |
|-------|--------|
| `/api/health` | OK, prisma ready |
| `/api/currencies/active` | 200, base USD, Frankfurter snapshot present |
| `/api/currencies/rates` | 200 |
| `/api/currencies/preference` (no auth) | 401 |
| `/api/currencies/quote` (no auth) | 401 |
| `/api/currencies/convert` (no auth) | 401 |
| `/api/payments/methods/active` | Stripe + PayPal only; inactive hidden |
| Frontend tag root | 200 |

---

## 5. Production promotion

Traffic set to 100% on p28 revisions.

### Post-promote smoke (api.scrolith.com / scrolith.com)

| Check | Result |
|-------|--------|
| Health | OK (new uptime) |
| Currencies active | 200 |
| Payment methods active | Stripe + PayPal live |
| Preference unauthenticated | 401 |
| Frontend | 200 |

---

## 6. Domain certification summary

| Domain | Status | Notes |
|--------|--------|-------|
| Money arithmetic | PASS | Unit + fixture |
| FX rate resolution | PASS | Override → snapshot → catalog; fail closed |
| Frankfurter | PASS | Snapshot retained; admin path preserved |
| FX quotes | PASS | Auth-bound APIs; server-side rates only |
| Preferred currency | PASS | API + Settings + server field |
| MoneyDisplay | PASS | Gigs, marketplace, featured, mobile jobs |
| Active gateways | PASS | Inactive not in public methods |
| Stripe | PASS | Listed when enabled; no live charge |
| PayPal | PASS | Listed when enabled; no live charge |
| Wallet Funds | PASS | Policy + filter; enabled when admin allows |
| Gcoin | PASS | Utility labeling; float display fixed |
| Historical immutability | PASS | Migration additive; conversion does not rewrite |
| Ads settlement quotes | PARTIAL | Display/context ready; deep checkout quote progressive |
| platformWideDisplayConversion | PARTIAL | Core surfaces done; not every pricing field |

---

## 7. Security

- No client-provided rate accepted for settlement
- Preference/quote require auth
- No gateway secrets rotated
- No live Stripe/PayPal mode change
- No inactive gateway activation

---

## 8. Monitoring

Initial post-promote window: **CLEAN** (health OK, APIs responding, no immediate 5xx observed on smoke).

Continue watching 30–60 minutes for:

- backend 5xx
- quote/FX failures
- wallet errors
- gateway exposure anomalies

Immediate rollback commands listed in §1.

---

## 9. Completion gate

See `geezle/playwright-results/phase28a/release-gate.json`.

```json
{
  "overall": "PASS",
  "phase28Certified": true,
  "promoteRecommended": true,
  "migrationApplied": true,
  "backendPromoted": true,
  "frontendPromoted": true,
  "productionMonitoring": "CLEAN_INITIAL",
  "platformWideDisplayConversion": "PARTIAL"
}
```

---

## 10. Follow-ups (not blockers for 28A close)

1. Admin re-sync Frankfurter if multi-currency catalog should expand beyond USD in production settings  
2. Progressive ads/checkout quote consumption on payment intents  
3. Optional authenticated E2E for preference save + quote create/consume  
4. Continue monitoring window to full 30–60 minutes  

**Do not begin a new feature phase until monitoring remains clean.**
