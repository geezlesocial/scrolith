# Phase 28G — Currency Surface Deployment & Production Certification

**Status:** CERTIFIED / PROMOTED  
**Date:** 2026-07-21  

---

## Scope

Production deployment of **Phase 28F** full currency surface completion:

- Ads CPM/CPC placement conversion + daily spend base validation  
- Jobs budget display helpers  
- Gigs checkout FX fail-closed  
- Marketplace COD-exempt commission + checkout quote/order APIs  

Phase 28E foundation preserved (USD base, FX engine, catalog, historical locks).

---

## Repository verification

| Item | Value |
|------|--------|
| Backend / monorepo tip | `7d93d445` |
| Frontend | `225cc002` |
| Migration | **NOT_APPLICABLE** (no schema migration) |

---

## Production revisions

| Service | Before (100%) | After (100%) | Tag |
|---------|---------------|--------------|-----|
| Backend | `scrolith-backend-00189-yuc` (msg-rxn) | **`scrolith-backend-00191-gol`** | `p28g` |
| Frontend | `scrolith-frontend-00249-huc` (msg-rxn) | **`scrolith-frontend-00251-lok`** | `p28g` |

Images:

- `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-backend:p28g`  
- `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend:p28g`  

Cloud Build:

| Service | Build ID | Status |
|---------|----------|--------|
| Backend | `c06119fa-c33d-473f-823b-730d663a8300` | SUCCESS |
| Frontend | `80c91ec4-53e4-4f31-83cf-65971930d224` | SUCCESS |

Tag URLs:

- https://p28g---scrolith-backend-25ysnpjdda-as.a.run.app  
- https://p28g---scrolith-frontend-25ysnpjdda-as.a.run.app  

---

## Pre-promote smoke (tagged)

| Check | Result |
|-------|--------|
| Tagged BE `/api/health` | **200** |
| Tagged BE `/api/currencies/active` | **200**, base **USD**, codes observed **25** (23 + preserved extras) |
| Tagged BE ads config (unauth) | **401** (auth required — expected) |
| Tagged BE marketplace settings | **200** |
| Tagged FE | **200**, My Ads chunk includes placement conversion (`MyAds-qg_Y7JIt.js`) |
| Live API health (pre-promote) | **200** |

---

## Post-promote smoke (production)

| Check | Result |
|-------|--------|
| `https://api.scrolith.com/api/health` | **200** |
| `https://api.scrolith.com/api/currencies/active` | **200**, base **USD** |
| `https://api.scrolith.com/api/marketplace/settings` | **200** |
| `https://scrolith.com` | **200**, main `index-D7jL9p78.js` |
| BE traffic | **100%** → `scrolith-backend-00191-gol` |
| FE traffic | **100%** → `scrolith-frontend-00251-lok` |

---

## Unit tests (pre-deploy)

| Suite | Result |
|-------|--------|
| BE phase28f.currencySurfaces | **9/9 PASS** |
| FE moneyConversion (28D+28F) | **8/8 PASS** |

---

## Surface certification matrix

| Surface | Status | Notes |
|---------|--------|--------|
| Ads CPM/CPC display conversion | **PASS** | FE MyAds converts rates; BE optional display maps |
| Ads daily spend base validation | **PASS** | Implemented in create draft path |
| Jobs budget helpers | **PASS** | budgetAmount/currency serialization |
| Gigs checkout FX fail-closed | **PASS** | orderPayments convert + ERR_FX_UNAVAILABLE |
| Marketplace COD no commission | **PASS** | quote/order commission rule |
| Marketplace online commission | **PASS** | Stripe/PayPal/wallet paths |
| Base USD / catalog | **PASS** | Unchanged foundation |

---

## Rollback

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00189-yuc=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00249-huc=100
```

No DB rollback (no migration).

---

## Monitoring (30–60 minutes)

Watch for:

- 5xx on `/api/currencies/*`, ads create, order checkout, marketplace quote  
- FX fail-closed 400s spike (rate catalog issues)  
- Symbol-only regressions on My Ads placement estimates  
- Unexpected commission on COD marketplace quotes  

Initial post-promote: **CLEAN**.

---

## Completion

```json
{
  "overall": "PASS",
  "phase28gCertified": true,
  "backendPromoted": true,
  "frontendPromoted": true,
  "backendRevision": "scrolith-backend-00191-gol",
  "frontendRevision": "scrolith-frontend-00251-lok",
  "baseCurrency": "USD",
  "productionMonitoring": "CLEAN_INITIAL"
}
```

Gate: `geezle/playwright-results/phase28g/release-gate-summary.json`
