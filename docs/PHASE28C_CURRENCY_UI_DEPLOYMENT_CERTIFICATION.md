# Phase 28C — Currency Management UI Deployment & Production Certification

**Status:** CERTIFIED / PROMOTED  
**Date:** 2026-07-21  
**Scope:** Frontend-only (no backend, migration, FX policy, or gateway changes)

---

## Repository verification

| Item | Value |
|------|--------|
| Frontend branch | `main` |
| Frontend commit | `ecee6b5495d0911fdfa8f21fa791304cff0360c7` |
| Monorepo branch | `release/backend-production` |
| Monorepo commit | `2fdcd9e41dc2ddec208df15fb16a43d0a276eb08` |
| Submodule pointer | `ecee6b54` |
| Migration | **Not required** |
| Backend deploy | **Not performed** |

### Production revisions

| Service | Before | After |
|---------|--------|-------|
| Frontend | `scrolith-frontend-00241-koh` (p28) | **`scrolith-frontend-00243-vic` (p28c)** |
| Backend | `scrolith-backend-00183-lep` | **unchanged** `scrolith-backend-00183-lep` |

---

## Build & tests

| Gate | Result |
|------|--------|
| Cloud Build `:p28c` | SUCCESS |
| Image digest | `sha256:c2fc9502ea0d7eb516e72ee266daa74b5213b770d70e6ce604fb4c0e0a9ae94c` |
| `currencyLayout.phase28b.test.ts` | **4/4 PASS** |
| API smoke (currencies/rates/methods/health) | PASS |

---

## Staged deployment (0%)

| Field | Value |
|-------|--------|
| Revision | `scrolith-frontend-00243-vic` |
| Tag | `p28c` |
| Tag URL | https://p28c---scrolith-frontend-25ysnpjdda-as.a.run.app |
| Entry JS | `/assets/index-Z-9uGfC1.js` |
| Entry CSS | `/assets/index-BGgC3sQd.css` |
| SystemSettings chunk | `/assets/SystemSettings-BZB19699.js` |

### Bundle certification

Deployed `SystemSettings-BZB19699.js` contains:

- `system-settings-shell`
- `currency-table-container`
- `currency-toolbar`
- `currency-pagination`
- `currency-mobile-cards`
- `Currency Management`
- `Save All Changes`

### Viewport smoke (tagged URL, unauthenticated shell)

No page-level horizontal overflow at: 320, 360, 390, 768, 1024, 1280, 1440, 1920.  
All returned HTTP 200.

Asset head checks: **0** 404s on linked assets.

---

## Layout / UX certification (deployed code contracts)

| Check | Status |
|-------|--------|
| Blue Save side column removed | PASS (footer layout in shell) |
| Table horizontal scroll | PASS |
| Sticky Code / Actions | PASS |
| Toolbar / filters | PASS |
| Rate inputs min width | PASS |
| Pagination | PASS |
| Mobile cards | PASS |
| Tablet section select | PASS |
| FX control plane preserved | PASS |
| Currency API behavior | PASS (backend unchanged) |

**Note:** Full authenticated admin DOM screenshots at every breakpoint require a live admin session. Certified via unit contracts + deployed chunk markers + public viewport/API smoke. Recommend manual visual pass in browser while logged in as admin during the monitoring window.

---

## Promotion

Traffic set to **100%** on `scrolith-frontend-00243-vic`.

Backend remains **`scrolith-backend-00183-lep`**.

---

## Rollback

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 \
  --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00241-koh=100
```

No backend or database rollback.

---

## Monitoring

Initial post-promote: **CLEAN** (scrolith.com 200, API health OK, currency/gateway APIs 200).

Continue **20–30 minutes** for JS errors, asset 404s, admin route issues, and Save/rate UX reports.

---

## Completion criteria

```json
{
  "overall": "PASS",
  "phase28cCertified": true,
  "promoteRecommended": true,
  "frontendPromoted": true,
  "backendChanged": false,
  "migrationRequired": false,
  "bluePanelObstruction": "REMOVED",
  "productionMonitoring": "CLEAN_INITIAL"
}
```

Gate file: `geezle/playwright-results/phase28c/release-gate-summary.json`
