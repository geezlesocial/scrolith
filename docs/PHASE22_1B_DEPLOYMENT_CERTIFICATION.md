# Phase 22.1B — Deployment & Certification (Scroll Preview + Deep Link)

**Date:** 2026-07-20  
**Result:** **PASS_STAGED** · `scrollPreviewWorks: true` · `exactVideoDeepLinkWorks: true` · `homeFallbackCount: 0` · `phase21Regression: PASS`  
**promoteRecommended:** **true** (operator approval required — **not auto-promoted**)

---

## Production traffic (unchanged)

| Service | Revision | Tag | Traffic |
|---------|----------|-----|---------|
| Backend | `scrolith-backend-00152-sag` | p222 | **100%** |
| Frontend | `scrolith-frontend-00207-rug` | p222 | **100%** |

## Staged revision (0%)

| Service | Image | Revision | Tag URL |
|---------|-------|----------|---------|
| Backend | `scrolith-backend:p221b` | `scrolith-backend-00154-cit` | https://p221b---scrolith-backend-25ysnpjdda-as.a.run.app |
| Frontend | `scrolith-frontend:p221b` | `scrolith-frontend-00209-yet` | https://p221b---scrolith-frontend-25ysnpjdda-as.a.run.app |

Health: BE 200 (after cold start), FE 200.

---

## Certification matrix

| Check | Result |
|-------|--------|
| Unit 22.1B (routes + mixed card) | **9/9 PASS** |
| Phase 21 cert unit | **54/54 PASS** |
| E2E desktop / 390 / Pixel 7 / iPhone 15 | **4/4 PASS** |
| `/scroll?scroll=…` stays on Scroll | **PASS** |
| No redirect to `/home` on deep link | **PASS** |
| Deep-link query shape | **PASS** |
| Scroll unavailable / player UI | **PASS** |
| homeFallbackCount | **0** |

Gate: `geezle/playwright-results/phase221b/release-gate-summary.json`

---

## Root cause (confirmed)

1. `FeedMixedCard` missing `case 'scroll'` → default `href: '/home'`, CTA Open, no media  
2. `toStreamEntry` did not promote orchestrator `media` onto card data  
3. No `GET /scroll/:id` for session-miss deep links  

## Canonical fix

- `buildScrollVideoUrl(id)` → `/scroll?scroll=<id>`  
- Muted `ScrollVideoPreview` on Scroll rec cards  
- `ScrollFeed` resolves `?scroll=` / `?video=` and fetches by id  
- Backend `GET /scroll/:id`  

---

## Promote (when approved)

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00154-cit=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00209-yet=100
```

### Rollback

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00152-sag=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00207-rug=100
```

---

## Confirmation

Scroll recommendation cards **no longer route to `/home`** under the new contract (unit + staged e2e).  
**Not production-live until promote.**
