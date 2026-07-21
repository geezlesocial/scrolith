# Phase 28F — Full Currency Enforcement Across Ads, Jobs, Gigs & Marketplace

**Status:** Implemented (no production deployment)  
**Date:** 2026-07-21  
**Next:** Phase 28G — Currency Surface Deployment & Production Certification  

---

## Purpose

Complete the remaining **PARTIAL** product surfaces called out in Phase 28E certification, without changing the working Phase 28E foundation:

| Preserved from 28E | Value |
|--------------------|--------|
| Base currency | **USD** |
| FX engine | Manual override → snapshot → catalog → fail closed |
| Catalog | 23 currencies + seed/manual rates |
| Ads min/max validation | Canonical USD |
| Wallet balances / historical FX locks | Unchanged |

---

## Scope completed

### Ads
- Placement **CPM/CPC** conversion into campaign display currency (FE + optional BE display maps)
- Surfaces covered: homepage, homepage feed, community feed, scroll pre-roll, scroll feed, forum listing, thread detail, chat sidebar
- Daily spend validated in platform base (cannot exceed total budget after FX)
- Estimates (impressions/clicks) use **converted** rates matching budget currency
- `GET /community/ads/config?displayCurrency=PHP` returns `cpmByPlacementDisplay` / `cpcByPlacementDisplay` / min-max display companions

### Jobs
- Serialize parseable budgets with `budgetAmount`, `budgetCurrency`, `budgetIsHourly`, `currency` for MoneyDisplay
- Free-text / historical budgets preserved as original `budget` string
- Hourly detection (`/hr`, `per hour`)

### Gigs
- Serialize `currency` + `pricingCurrency` (canonical USD unless gig meta overrides)
- Checkout (`orderPayments`): convert package + extras from source currency → charge currency **fail closed**
- Commission uses payment-method aware helper (COD-exempt)

### Marketplace
- Checkout **quote** + **order create** APIs
- Commission **only** for online methods (Stripe, PayPal, wallet, card, …)
- **COD / cash meetup: zero platform commission** (seller delivers themselves)
- Settlement amounts locked in **listing currency** (historical preservation)
- Optional buyer display conversion on quote (fail closed)

---

## New / updated APIs

| Method | Path | Notes |
|--------|------|--------|
| GET | `/community/ads/config?displayCurrency=XXX` | Optional converted placement rates |
| POST | `/marketplace/listings/:id/checkout-quote` | COD-safe commission quote |
| POST | `/marketplace/listings/:id/orders` | Create order; settlement in listing currency |

---

## Commission rule (enterprise)

```
if paymentMethod is COD / cash_on_delivery / cash meetup:
  platform commission = 0
  seller earnings = full amount
else if online gateway (stripe, paypal, wallet, …):
  apply marketplace or platform commission settings
```

Does **not** alter mute, privacy, wallet ledger schema, or gateway filtering.

---

## Files changed

### Backend
- `src/services/currencySurface.service.ts` **(new)**
- `src/utils/commission.ts`
- `src/controllers/community.ads.controller.ts`
- `src/controllers/orderPayments.controller.ts`
- `src/controllers/payment.controller.ts`
- `src/controllers/jobs.controller.ts`
- `src/controllers/gigs.controller.ts`
- `src/services/marketplace.service.ts`
- `src/routes/marketplace.routes.ts`
- `src/services/__tests__/phase28f.currencySurfaces.unit.test.ts` **(new)**

### Frontend
- `src/pages/MyAds.tsx` — CPM/CPC estimate conversion
- `src/utils/moneyConversion.ts` — placement map + COD helper
- `src/utils/__tests__/moneyConversion.phase28d.test.ts` — 28F cases

### Docs / gates
- `docs/PHASE28F_FULL_CURRENCY_SURFACE_COMPLETION.md`
- `geezle/playwright-results/phase28f/completion-gate.json`

---

## Tests

- BE phase28f: COD vs online commission, job budget parse, placement arithmetic  
- FE moneyConversion: placement map conversion + COD detection  
- Phase 28D fixtures still apply (10 USD → 572.50 PHP at 57.25)

---

## Explicit non-goals (Phase 28F)

- **No production deploy** (Phase 28G)
- No destructive schema changes
- No replacement of FX jobs, snapshots, or catalog ensure
- Not rewriting every historical hard-coded `$` string in mobile shells

---

## Phase 28G deploy plan (preview)

1. Deploy backend (currency surface + marketplace order routes) at 0% tag  
2. Deploy frontend (MyAds placement conversion)  
3. Smoke: ads config display maps; marketplace COD quote `commissionAmount=0`; gig checkout FX fail-closed  
4. Promote after certification  
5. Monitor conversion failures / commission regressions on COD  

---

## Completion criteria

```json
{
  "phase": "28F",
  "deployed": false,
  "adsPlacementConversion": true,
  "jobsBudgetDisplayHelpers": true,
  "gigsCheckoutFxFailClosed": true,
  "marketplaceCodNoCommission": true,
  "baseCurrency": "USD",
  "foundationPreserved": true
}
```
