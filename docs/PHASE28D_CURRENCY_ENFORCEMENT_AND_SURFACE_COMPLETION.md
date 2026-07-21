# Phase 28D — Enterprise Currency Enforcement, Real-Time Conversion & Monetary Surface Completion

**Status:** Implemented (no production deployment)  
**Date:** 2026-07-21  
**Next:** Phase 28E — Currency Enforcement Deployment & Production Certification  

---

## Root cause

Product surfaces called `Intl.NumberFormat({ style: 'currency', currency: userCode })` with **admin base amounts** (USD) without converting the number.

Example (My Ads):

```ts
formatCurrency(minBudget, form.currency) // minBudget=10 USD → ₱10.00 when form.currency=PHP
```

Secondary causes:

1. `CurrencyContext.convertAmount` returned the original amount when rates were missing (symbol-only trap).
2. Production catalog often had only USD active → cross rates missing → same number, new symbol.
3. Ads backend validated `budget < minBudget` without converting campaign currency to base USD.

---

## Base currency & catalog

| Rule | Value |
|------|--------|
| Base currency | **USD** (rate = 1, cannot disable) |
| Active catalog size | **23** |
| Seed service | `ensurePlatformCurrencyCatalog` (idempotent) |

### 23 currencies

USD, EUR, GBP, JPY, CNY, CHF, CAD, AUD, SGD, HKD, NZD, NGN, KRW, INR, PHP, KES, IDR, THB, MYR, VND, MXN, BRL, ZAR

### Frankfurter support audit

| Status | Codes |
|--------|--------|
| Supported | USD, EUR, GBP, JPY, CNY, CHF, CAD, AUD, SGD, HKD, NZD, KRW, INR, PHP, IDR, THB, MYR, MXN, BRL, ZAR |
| **Not supported** (manual rates required) | **NGN, KES, VND** |

Manual-required currencies keep seed catalog rates and `frankfurterSupported: false`. No fabricated live provider rates.

---

## Monetary invariant

Changing currency **must** change both code/symbol **and** numeric amount via approved conversion.

Fixture:

| Base | Rate | Display |
|------|------|---------|
| 10.00 USD | 57.25 | **572.50 PHP** |
| 10,000 USD | 57.25 | **572,500.00 PHP** |

Minor units: `1000` → `57250` PHP centavos.

---

## Rate precedence (unchanged)

1. Manual override  
2. Entity FX lock (when applicable)  
3. Approved snapshot  
4. Catalog/manual rate  
5. Fail closed  

---

## Surface matrix (high priority)

| Surface | Source | Defect | Fix |
|---------|--------|--------|-----|
| Ads min/max guardrail | Admin USD | Symbol-only | Convert via rates; validate in base USD |
| Ads total budget input | User currency | Validated as USD | Backend converts to base |
| Ads currency switch | Form | Drift | Pivot via USD base |
| MoneyDisplay | Context | Fail open | Fail closed → keep source currency |
| CurrencyContext | Rates | Default rate 1 | Only store positive rates |
| Gigs/Marketplace cards | formatPrice/MoneyDisplay | Partial | Uses hardened convertAmount |
| Jobs mobile | formatPrice | Partial | Prefer formatPrice path |
| Wallet | Display | Partial | Ledger remains base; display converts |

---

## Ads Manager

- Canonical: `pricingCurrency: "USD"`, `minBudget: 10`, `maxBudget: 10000`
- Frontend: displays converted min/max in campaign currency
- Backend `createAdDraft`: converts entered budget → base before min/max checks
- Currency switch recalculates budget/daily spend from base to avoid round-trip drift

---

## Real-time propagation

Frontend listens for:

- `settings:updated`
- `currency:catalog:updated`
- `currency:rates:updated`
- `currency:policy:updated`

→ `refreshCurrencies()` (server remains authoritative).

---

## Security

- No client rate trusted for settlement  
- Ads min/max enforced server-side in base currency  
- Fail closed on missing FX for validation  

---

## Files changed

### Backend
- `src/services/platformCurrencyCatalog.ts`
- `src/services/ensurePlatformCurrencyCatalog.service.ts`
- `src/controllers/currencies.controller.ts`
- `src/controllers/community.ads.controller.ts`
- `src/services/money.service.ts`
- `src/services/__tests__/phase28d.currencyEnforcement.unit.test.ts`

### Frontend
- `src/utils/moneyConversion.ts`
- `src/utils/__tests__/moneyConversion.phase28d.test.ts`
- `src/context/CurrencyContext.tsx`
- `src/components/money/MoneyDisplay.tsx`
- `src/pages/MyAds.tsx`
- `src/constants.ts`

### Docs / gates
- `docs/PHASE28D_CURRENCY_ENFORCEMENT_AND_SURFACE_COMPLETION.md`
- `geezle/playwright-results/phase28d/completion-gate.json`

---

## Tests

- FE: moneyConversion.phase28d — USD→PHP 10→572.50, fail closed, base normalize  
- BE: catalog 23, Frankfurter unsupported list, minor-unit ads arithmetic  

---

## Phase 28E deployment plan

1. Deploy backend (catalog ensure + ads validation) at 0% tag  
2. Deploy frontend  
3. Smoke: `/api/currencies/active` returns 23; ads min displays ₱572.50 at rate 57.25  
4. Promote after certification  
5. Monitor conversion failures / symbol-only regressions  

**No production deploy in Phase 28D.**

---

## Known limitations / progressive work

- Not every historical hard-coded `$` string in mobile jobs shell is rewritten; primary conversion paths hardened.  
- Placement CPM display conversion on every placement chip is progressive (rates stored as USD; use MoneyDisplay).  
- Full authenticated E2E ads checkout quote wiring remains progressive (quote APIs from Phase 28 exist).  
