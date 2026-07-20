# Phase 22.1B — Deployment & Certification (Scroll Preview + Deep Link)

**Date:** 2026-07-20  
**Result:** **PASS** · **PROMOTED** · `scrollPreviewWorks: true` · `exactVideoDeepLinkWorks: true` · `homeFallbackCount: 0` · `phase21Regression: PASS`  
**promoteRecommended:** **true** · **trafficActionCompleted:** **true**

---

## Production traffic (current)

| Service | Revision | Tag | Traffic |
|---------|----------|-----|---------|
| Backend | `scrolith-backend-00154-cit` | p221b | **100%** |
| Frontend | `scrolith-frontend-00209-yet` | p221b | **100%** |

Promoted: 2026-07-20. Post-promote health: API 200, FE 200, `GET /api/scroll/:id` auth gate 401 (expected).

## Prior production (rollback targets)

| Service | Revision | Tag |
|---------|----------|-----|
| Backend | `scrolith-backend-00152-sag` | p222 |
| Frontend | `scrolith-frontend-00207-rug` | p222 |

## Staged tag URLs (still reachable)

| Service | Image | Revision | Tag URL |
|---------|-------|----------|---------|
| Backend | `scrolith-backend:p221b` | `scrolith-backend-00154-cit` | https://p221b---scrolith-backend-25ysnpjdda-as.a.run.app |
| Frontend | `scrolith-frontend:p221b` | `scrolith-frontend-00209-yet` | https://p221b---scrolith-frontend-25ysnpjdda-as.a.run.app |

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

## Promote (executed)

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

Scroll recommendation cards **no longer route to `/home`**.  
**Production-live on p221b** (BE `00154-cit`, FE `00209-yet` @ 100%).
