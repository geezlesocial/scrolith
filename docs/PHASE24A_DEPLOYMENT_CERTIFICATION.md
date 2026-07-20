# Phase 24A — Community Deployment & Production Certification

**Date:** 2026-07-20  
**Result:** **PASS** · `phase24Certified: true` · **FRONTEND PROMOTED 100%**  
**Backend:** unchanged at `scrolith-backend-00160-xez`

---

## Pre-deployment

| Check | Result |
|-------|--------|
| FE commit `eeffcfd3` on `origin/main` | **PASS** (pushed) |
| Docs `8507815b` | Present |
| Changed files | Community only (layout, Clubs, GroupsWorkspace, design/ui, learning utils) |
| Scroll / messaging files in commit | **None** |
| Live before | FE `scrolith-frontend-00215-tab` (p23) · BE `scrolith-backend-00160-xez` (p23) |

**Rollback FE:** `scrolith-frontend-00215-tab`

---

## Migration

```json
{ "migrationRequired": false, "migrationStatus": "NOT_APPLICABLE" }
```

---

## Build & tests

| Suite | Result |
|-------|--------|
| `phase24Community.spec.ts` | **8/8 PASS** |
| `phase23ScrollEnterprise.spec.ts` | **7/7 PASS** |
| `phase221BScrollVideoRoutes.spec.ts` | **6/6 PASS** |
| Cloud Build `scrolith-frontend:p24` | **SUCCESS** |

---

## Deployment (frontend only)

| Field | Value |
|-------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend:p24` |
| Digest | `sha256:e372ca8727a0196ebf728c98cae3fd4b751b61f23b4514ff947202e39b5c84c2` |
| Revision | `scrolith-frontend-00217-niy` |
| Tag | `p24` |
| Tag URL | https://p24---scrolith-frontend-25ysnpjdda-as.a.run.app |
| Staged traffic | 0% |
| Promoted traffic | **100%** |
| Entry JS | `assets/index-kBabzjhk.js` |
| Entry CSS | `assets/index-vkqgQJmU.css` |
| Asset 404 | **0** |

Backend remains **`scrolith-backend-00160-xez`**.

---

## Certification summary

| Area | Result |
|------|--------|
| FE shells `/`, `/community`, `/community/clubs`, `/scroll`, `/messages` | **PASS** (200) |
| Clubs API list/search/joined | **PASS** |
| Privacy (22.3C) | **PASS** |
| Scroll feed (23) | **PASS** |
| Messages list (22) | **PASS** |
| API health | **PASS** |
| Community layout chunk + learning engine | **PASS** (present in bundle) |
| Unit regressions | **21/21 PASS** |

Gate: `geezle/playwright-results/phase24/release-gate-summary.json`

---

## Promotion (executed)

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00217-niy=100
```

### Rollback

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00215-tab=100
```

---

## Production now

| Service | Revision | Tag | Traffic |
|---------|----------|-----|---------|
| Frontend | **`scrolith-frontend-00217-niy`** | p24 | **100%** |
| Backend | **`scrolith-backend-00160-xez`** | p23 | **100%** (unchanged) |

---

## Monitoring

Post-promote smoke: prod FE/community/API **200**. Continue ~20–30 minutes for 5xx, asset 404s, community routing, mobile layout.

---

## Phase 25

**Do not start** until this monitoring window stays clean.
