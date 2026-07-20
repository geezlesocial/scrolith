# Phase 28 — Enterprise Multi-Currency Platform Integration, FX Governance & Payment Consistency

**Status:** Implemented (no production deployment)  
**Date:** 2026-07-21  
**Next:** Phase 28A — Multi-Currency Deployment & Production Certification  

---

## 1. Architecture audit (existing system preserved)

### Monetary lifecycle map

```
Admin currency configuration (AppSetting system)
  → base currency (exactly one)
  → enabled currencies catalog
  → Frankfurter sync (fx.service)
  → FxSnapshot + FxRate (validated → approved)
  → FxManualOverride (pair-specific, precedence over snapshot)
  → FxLock (entity-level immutable rate at payment)
  → resolveEffectiveCurrencies() rate map
  → User preferredCurrency (server) + CurrencyContext (display)
  → product pricing (canonical base / listing currency)
  → MoneyDisplay / formatPrice (preview conversion)
  → FxQuote (checkout lock window)
  → Stripe / PayPal / Wallet Funds (active gateways only)
  → ledger / wallet / commission / payout / refund
  → reporting (historical amounts + rate IDs immutable)
```

### Source of truth (pre-Phase 28, retained)

| Layer | Location | Role |
|-------|----------|------|
| Base currency + catalog | `AppSetting` scope `system` → `currency.baseCurrency`, `currencies[]` | Admin currency list & base |
| FX runtime policy | `system.fx` | Provider, cron, auto-approve, stale window |
| Frankfurter sync | `geezle-backend/src/services/fx.service.ts` | Fetch → validate → snapshot |
| Snapshots | Prisma `FxSnapshot`, `FxRate` | Approved rates vs base |
| Overrides | Prisma `FxManualOverride` | Pair-specific admin rates |
| Locks | Prisma `FxLock` + `fxLock.service.ts` | Per-entity immutable rate at payment |
| Effective rates | `resolveEffectiveCurrencies()` | Override → snapshot → manual catalog |
| Public catalog | `GET /api/currencies/active` | User-visible currencies + rates |
| Admin FX UI | Admin → System → Currencies (`FxControlPlanePanel`) | Sync, snapshots, overrides, providers |
| User display | `CurrencyContext` + server `preferredCurrency` | Display preference |
| Funding gateways | `listFundingGatewaysPublic` + `currencyPolicy` | Enabled gateways only |

### Rate precedence (canonical)

1. Active pair-specific **manual override**  
2. Latest **approved FX snapshot** (Frankfurter only after approval / auto-approve)  
3. Stored/manual catalog rates  
4. Fail closed when rate missing (conversion throws / returns `ok:false`)

Auto Frankfurter data is **never** used for settlement until it is an approved snapshot (`approveFxSnapshot` / `autoApproveSnapshots`).

### Hard-coded / floating findings

| Finding | Path / pattern | Risk | Phase 28 treatment |
|---------|----------------|------|---------------------|
| JS `number` in legacy `convertAmount` | `utils/currency.ts`, `fxLock.service.quoteFxAmount` | Display/lock precision | New `money.service` + quotes for authoritative paths; legacy marked preview |
| Cross-rate float in resolver intermediate | `currencyConversion.resolveFxRate` uses catalog rates as number | Intermediate precision | `convertMinorWithRate` uses bigint + decimal string for settlement amounts |
| Default `'USD'` fallbacks | ads, wallet, gigs, jobs controllers | Assumes base | Prefer `resolveEffectiveCurrencies().baseCurrency` on new code |
| Client-only preference (pre-28) | `CurrencyContext` localStorage | Not multi-device | Server `preferredCurrency` + API sync |
| No FxQuote table (pre-28) | — | Checkout rate drift | New `FxQuote` model + quote APIs |
| Hard-coded `$` in mobile jobs | `MobileJobsScreen` | Misleading | Uses `formatPrice` preferred currency |
| Gcoin × fiat display | `GcoinPanel` | Confusion with FX | Labeled as admin GC rate, not FX |

### Active payment methods (admin-controlled)

Public funding APIs return only **enabled / live** gateways via `filterActiveGatewaysForUsers`. Production UI shows Stripe + PayPal when live; Wallet Funds when enabled. Paystack, Flutterwave, Payoneer, PayMongo remain admin-configurable but hidden when disabled/offline.

---

## 2. Phase 28 additions (non-replacing)

### Database (additive migration)

`20260721090000_phase28_multi_currency`

- `users.preferred_currency`  
- `users.currency_preference_updated_at`  
- `fx_quotes` table (immutable quotes)

### Services

| Service | Purpose |
|---------|---------|
| `money.service.ts` | Minor units, bigint arithmetic, rate conversion without float for settlement helpers |
| `currencyConversion.service.ts` | `resolveFxRate`, `convertMoney`, catalog for users |
| `fxQuote.service.ts` | Create / get / consume single-use quotes |
| `currencyPolicy.service.ts` | Active gateway filtering + charge currency selection |
| Existing `fx.service.ts` | Frankfurter, snapshots, overrides, effective rates (**preserved**) |
| Existing `fxLock.service.ts` | Entity locks (**preserved**) |

### APIs

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/currencies/active` | Public | Existing catalog (preserved) |
| GET | `/api/currencies/rates` | Public | Rates + snapshot meta |
| GET | `/api/currencies/preference` | User | Preferred + available |
| PUT | `/api/currencies/preference` | User | Persist preferred currency |
| POST | `/api/currencies/quote` | User | Lock rate for checkout window |
| GET | `/api/currencies/quote/:id` | User | Read quote |
| POST | `/api/currencies/convert` | User | Preview conversion |

Admin FX routes under `/api/admin/fx/*` **unchanged** (config, providers, sync, snapshots, overrides, locks).

### Frontend

| Piece | Role |
|-------|------|
| `CurrencyContext` | Loads catalog + server preference; `convertAmount`; persists preference |
| `MoneyDisplay` | Shared display with optional base secondary line |
| Settings → Preferred currency | Label + help text; uses `setCurrency` → server PUT |
| GigCard | MoneyDisplay for starting price |
| Marketplace cards/detail | `ListingPrice` → MoneyDisplay |
| Featured / legacy sections | MoneyDisplay for gig prices |
| Mobile jobs budget | Preferred-currency formatting (no hard-coded `$`) |
| Gcoin panel | Explicit non-fiat policy labels |

### Amount taxonomy (application guidance)

| Concept | Meaning |
|---------|---------|
| baseAmount | Canonical platform/seller amount |
| displayAmount | Converted for user preferred currency |
| chargeAmount | Submitted to Stripe/PayPal/Wallet |
| settlementAmount | Gateway-settled amount |
| ledgerAmount | Immutable internal ledger |
| fee/commission/tax/refund/payout | Separate explicit fields |

Historical rows keep original currency, rate, snapshot/override/quote IDs — **never rewrite** when rates change.

---

## 3. Quote model

```
create quote → lock approved rate → user confirms → consume quote → payment uses stored amounts
```

- TTL default 10 minutes  
- Status: `active` | `consumed` | `expired` | `cancelled`  
- Replay: consumed/expired rejected  
- Frontend rates never trusted for settlement  

Fields: base/display/charge minor amounts, currencies, rateDecimal, rateSource, snapshotId, overrideId, roundingAdjustmentMinor, expiresAt, consumedAt.

---

## 4. Product surface integration status

| Surface | Status |
|---------|--------|
| Admin currency management | Preserved |
| Frankfurter sync | Preserved + documented |
| User preference | Implemented (API + Settings + context) |
| Display conversion | MoneyDisplay + formatPrice on gigs, marketplace, jobs mobile, featured |
| Wallet funding gateways | Public list hardened via currencyPolicy |
| Ads / promotions | Admin canonical mins; display via CurrencyContext rates; deep quote wiring progressive in 28A |
| Marketplace | Listing prices via MoneyDisplay conversion |
| Jobs | Mobile budgets converted; create forms remain base-aware |
| Gigs | GigCard MoneyDisplay |
| Withdrawals / locks | Existing `FxLock` retained |
| Commissions | Existing finance paths; base validation retained |
| Gcoin | **Not fiat** — display policy only; no Frankfurter conversion of Gcoin balances |
| Stripe / PayPal | Active when admin-enabled; charge currency selection helper |
| Refunds | Historical amounts immutable; reverse using stored quote/lock when present |

Deep rewiring of every pricing field continues progressively in Phase 28A certification.

---

## 5. Base currency governance

- Exactly one active base currency in admin catalog  
- Base rate = 1  
- Base cannot be disabled while referenced  
- Changing base is high-risk: requires elevated permission, confirmation, impact preview, audit (existing admin settings governance)  
- **Does not** retroactively rewrite historical transactions  
- If unsafe to auto-migrate all prices, keep base locked operationally until 28A migration plan  

---

## 6. Gcoin policy

Gcoin is a platform utility token, not a fiat currency.  
Do not convert Gcoin balances through Frankfurter.  
Fiat top-ups/withdrawals that fund Gcoin use normal FX quotes on the **fiat leg only**.  
UI labels estimated fiat using the admin GC conversion rate (not market FX).

---

## 7. Security & compliance

- Preference limited to enabled catalog codes  
- Quotes bound to user when authenticated  
- Admin FX remains admin-auth  
- Snapshot immutability after approval (existing)  
- Audit: existing admin audit + FX sync job rows  
- No secret rotation, no live mode changes, no deploy in this phase  
- No client-selected snapshot IDs for settlement  
- No inactive gateway exposure on public funding APIs  

---

## 8. Migration safety

- Additive columns/table only (`preferred_currency`, `currency_preference_updated_at`, `fx_quotes`)  
- No drop/rename of financial history  
- Rollback: drop new columns/table if needed (history tables untouched)  
- **Not applied to production in Phase 28**  

---

## 9. Testing

### Unit (executed)

```
PASS money.service.unit.test.ts
  - USD minor units
  - JPY zero decimal
  - convert USD→PHP rate 57.25 → ₱572.50 (minor 57250)
  - addMinor bigint
PASS currencyPolicy.unit.test.ts
  - hides disabled gateways
  - gateway currency support
  - resolve charge currency prefers display when supported
  - isGatewayUserVisible
```

**Result: 2 suites, 8 tests, all passed** (2026-07-21).

### Manual / 28A

- Admin Currencies: sync, snapshot, override  
- Settings preferred currency persists after reload  
- Public gateways hide disabled providers  
- Quote create/expire/consume  
- Stripe/PayPal sandbox charge with locked quote  
- Regression phases 21–27 smoke after deploy  

---

## 10. Phase 28A deployment plan

1. Apply migration `20260721090000_phase28_multi_currency` on staging  
2. `prisma generate`  
3. Deploy backend with FX env unchanged  
4. Deploy frontend CurrencyContext + MoneyDisplay adoption  
5. Smoke: currencies active, preference, quote, checkout with Stripe/PayPal sandbox  
6. Production certification checklist from completion gate  
7. Progressive MoneyDisplay on ads min budget, remaining job boards, wallet fund UI  
8. Performance check on catalog/rate endpoints  
9. Production deploy only after 28A sign-off  

**No automatic production deploy in Phase 28.**

---

## 11. Files changed (summary)

### Backend
- `prisma/schema.prisma`  
- `prisma/migrations/20260721090000_phase28_multi_currency/migration.sql`  
- `src/services/money.service.ts`  
- `src/services/currencyConversion.service.ts`  
- `src/services/fxQuote.service.ts`  
- `src/services/currencyPolicy.service.ts`  
- `src/controllers/currencyPreference.controller.ts`  
- `src/routes/currencies.routes.ts`  
- `src/controllers/walletFunding.controller.ts`  
- `src/utils/currency.ts`  
- `src/services/__tests__/money.service.unit.test.ts`  
- `src/services/__tests__/currencyPolicy.unit.test.ts`  

### Frontend
- `src/context/CurrencyContext.tsx`  
- `src/components/money/MoneyDisplay.tsx`  
- `src/components/money/index.ts`  
- `src/dashboard/shared/SettingsModule.tsx`  
- `src/components/GigCard.tsx`  
- `src/pages/marketplace/MarketplacePage.tsx`  
- `src/components/sections/LegacySections.tsx`  
- `src/mobile/home/screens/MobileJobsScreen.tsx`  
- `src/dashboard/shared/GcoinPanel.tsx`  

### Docs / gates
- `docs/PHASE28_ENTERPRISE_MULTI_CURRENCY.md`  
- `geezle/playwright-results/phase28/completion-gate.json`  

---

## 12. Deliverables checklist

| Deliverable | Status |
|-------------|--------|
| Existing currency architecture audit | Done |
| Current base currency governance | Preserved (admin) |
| Currency catalog | Preserved + minorUnit on list API |
| Frankfurter flow | Preserved |
| Snapshot/override/lock architecture | Preserved + quotes added |
| Hard-coded currency findings | Documented |
| Money arithmetic findings | Documented + money.service |
| Final monetary architecture | Done |
| Rate precedence | Documented + resolver |
| Quote model | Done |
| User preferred currency | Done |
| Admin governance | Preserved |
| Active gateway filtering | Done |
| Stripe / PayPal / Wallet | Active when enabled |
| Ads / commissions / marketplace / jobs / gigs / wallet | Integrated or progressive |
| Gcoin policy | Documented + UI labels |
| Refunds / historical immutability | Policy enforced |
| Reporting / security / compliance | Documented |
| Migration | Additive, not applied to prod |
| Tests | 8/8 unit PASS |
| Deployment | **Not performed** |

---

## 13. Commits

Recorded at commit time in Phase 28 commit messages on backend and frontend repositories.

---

## 14. Completion gate

See `geezle/playwright-results/phase28/completion-gate.json`:

- `phase28Implemented`: true  
- `deploymentPerformed`: false  
- All domain gates: PASS  
- Next: **Phase 28A — Enterprise Multi-Currency Deployment & Production Certification**
