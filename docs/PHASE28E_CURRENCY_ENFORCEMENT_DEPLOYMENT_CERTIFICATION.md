# Phase 28E — Currency Enforcement Deployment & Production Certification

**Status:** CERTIFIED / PROMOTED  
**Date:** 2026-07-21  

---

## Repository verification

| Item | Value |
|------|--------|
| Backend (Phase 28D) | `2d69932c` |
| Backend hotfixes (28E) | `3450427e`, `1b3e6e06` (deployed tip) |
| Frontend | `372dc934` |
| Submodule (28D) | `45a71b85` |
| Migration | **NOT_APPLICABLE** (no Phase 28D migration) |

---

## Production revisions

| Service | Before (100%) | After (100%) | Tag |
|---------|---------------|--------------|-----|
| Backend | `scrolith-backend-00183-lep` | **`scrolith-backend-00187-tov`** | `p28e` |
| Frontend | `scrolith-frontend-00243-vic` | **`scrolith-frontend-00245-yuh`** | `p28e` |

Tag URLs:
- https://p28e---scrolith-backend-25ysnpjdda-as.a.run.app  
- https://p28e---scrolith-frontend-25ysnpjdda-as.a.run.app  

---

## Tests

| Suite | Result |
|-------|--------|
| FE moneyConversion.phase28d | **6/6 PASS** |
| BE phase28d + money | **9/9 PASS** |
| **Total** | **15/15 PASS** |

Fixture arithmetic (unit): 10 USD × 57.25 → **572.50 PHP**; 10,000 → **572,500 PHP**.

---

## Catalog certification (production)

| Check | Result |
|-------|--------|
| Base currency | **USD** rate **1** |
| Required 23 codes present | **PASS** |
| Active count observed | **25** (23 + preserved SAR/AED) |
| PHP rate | snapshot (sample **61.601**) |
| NGN/KES/VND | manual seed rates (not fabricated live Frankfurter) |
| Frankfurter unsupported | NGN, KES, VND |
| Gateways public | stripe, paypal |

Ads min/max at live PHP rate example: **10 USD → ₱616.01**, **10,000 USD → ₱616,010**.

---

## Hotfixes during certification

1. Non-base catalog rate `1` treated as unset → seed rate (NGN 1500).  
2. Catalog ensure is **write-only-when-needed** + cooldown + fail-soft on GET (prevents pool timeouts).

---

## Progressive areas (honest)

| Area | Status |
|------|--------|
| Ads placement CPM/CPC full conversion | **PARTIAL** |
| Jobs full settlement enforcement | **PARTIAL** |
| Gigs full settlement enforcement | **PARTIAL** |
| Marketplace full settlement enforcement | **PARTIAL** |

Phase 28E passes for **deployed Phase 28D scope**, not full-platform settlement.

---

## Rollback

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00183-lep=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00243-vic=100
```

No DB rollback (no migration).

---

## Monitoring

Initial post-promote: **CLEAN** (health 200, catalog 200, gateways 200, FE 200).

Continue **30–60 minutes** for 5xx, catalog errors, Ads validation failures, symbol-only regressions.

---

## Completion

```json
{
  "overall": "PASS",
  "phase28eCertified": true,
  "backendPromoted": true,
  "frontendPromoted": true,
  "baseCurrency": "USD",
  "requiredCatalogPresent": 23,
  "productionMonitoring": "CLEAN_INITIAL"
}
```

Gate: `geezle/playwright-results/phase28e/release-gate-summary.json`
