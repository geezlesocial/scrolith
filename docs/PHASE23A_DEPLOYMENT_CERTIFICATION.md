# Phase 23A — Enterprise Scroll Deployment & Production Certification

**Date:** 2026-07-20  
**Result:** **PASS** · `phase23Certified: true` · **PROMOTED 100%**

---

## Pre-deployment

| Check | Result |
|-------|--------|
| FE `a2a395d2` on `origin/main` | **PASS** (pushed) |
| BE `951080ed` on `origin/release/backend-production` | **PASS** (pushed) |
| Submodule `geezle` → `a2a395d2` | **PASS** |
| Unrelated dirty baselines/mobile excluded | **PASS** |
| No Phase 24 community modernization in commits | **PASS** |
| No Phase 21 feed identity / messaging regressions in scope | **PASS** |

### Live traffic before deploy

| Service | 100% revision | Tag |
|---------|---------------|-----|
| Backend | `scrolith-backend-00158-faz` | p223c |
| Frontend | `scrolith-frontend-00213-hit` | p223c |

**Rollback targets:** those revisions.

---

## Migration

```json
{
  "migrationRequired": false,
  "migrationStatus": "NOT_APPLICABLE"
}
```

Phase 23 learning types reuse existing `ScrollEngagement.type` string column (unique `scrollId+userId+type`). No schema migration.

### Learning event types (actual implementation names)

| Event | Notes |
|-------|--------|
| `learn_pause` | No public counter inflation |
| `learn_mute` | No public counter inflation |
| `learn_unmute` | No public counter inflation |
| `learn_seek` | No public counter inflation |
| `learn_complete` | Intent signal COMPLETE, surface `scroll` |
| `learn_replay` | Intent signal REPLAY, surface `scroll` |
| `learn_watch` | Intent signal WATCH, surface `scroll` |

Auth required. Unknown types → **400**. Duplicates → `created: false` (unique constraint). Peer realtime not emitted for learning events.

---

## Build & tests

| Suite | Result |
|-------|--------|
| `phase23ScrollEnterprise.spec.ts` | **7/7 PASS** |
| `phase221BScrollVideoRoutes.spec.ts` | **6/6 PASS** |
| Privacy regression (22.3B) | **6/6 PASS** |
| Cloud Build BE `:p23` | **SUCCESS** |
| Cloud Build FE `:p23` | **SUCCESS** |

Classification: **PASS** (no new Phase 23 failures).

---

## Deployment

| Service | Image | Digest | Revision | Staged | Promoted |
|---------|-------|--------|----------|--------|----------|
| Backend | `scrolith-backend:p23` | `sha256:ecb029d2…4bf3` | `scrolith-backend-00160-xez` | 0% | **100%** |
| Frontend | `scrolith-frontend:p23` | `sha256:e5f0604b…2299` | `scrolith-frontend-00215-tab` | 0% | **100%** |

| Tag URLs |
|----------|
| BE: https://p23---scrolith-backend-25ysnpjdda-as.a.run.app |
| FE: https://p23---scrolith-frontend-25ysnpjdda-as.a.run.app |

### Frontend assets

| Asset | Value |
|-------|--------|
| Entry JS | `assets/index-DGYttTsx.js` |
| Entry CSS | `assets/index-D23ZOhET.css` |
| Scroll chunk | `assets/ScrollFeed-DdUagh6n.js` |
| Asset 404 | **0** |

Lazy chunk contains: `scroll-brand-label`, `learn_*`, `scroll:resume`, `virtualized`, `Buffering`, `prefetch`.

---

## Certification matrix

| Area | Result | Evidence |
|------|--------|----------|
| Engagement identity (id path) | **PASS** | API engage by scrollId 200 + metrics |
| Invalid engage type | **PASS** | 400 |
| Unauth engage | **PASS** | 401 |
| Learning all 7 types | **PASS** | `learning:true`, no like/comment/share inflation |
| Learning duplicate | **PASS** | second `learn_complete` → `created:false` |
| Report | **PASS** | 200 |
| Interested | **PASS** | 200 |
| Deep link GET `/scroll/:id` | **PASS** | id match |
| Missing video | **PASS** | 404 |
| Deep link URL helper | **PASS** | `/scroll?scroll=<id>` no `/home` |
| Brand label in bundle | **PASS** | ScrollFeed chunk |
| Adaptive/virtual/prefetch code | **PASS** | bundle markers |
| Phase 22.3C privacy | **PASS** | GET privacy 200 |
| Phase 22 messages | **PASS** | conversations list 200 |
| Production post-promote API | **PASS** | 20/20 |
| Production `/scroll` | **PASS** | 200 |

**Dash action product meaning:** Gcoin tip/donation (`SendGcoinModal`) — existing contract retained, not renamed.

Gate: `geezle/playwright-results/phase23/release-gate-summary.json`

---

## Promotion (executed)

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00160-xez=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00215-tab=100
```

### Rollback

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00158-faz=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00213-hit=100
```

---

## Production revisions now

| Service | Revision | Tag |
|---------|----------|-----|
| Backend | **`scrolith-backend-00160-xez`** | p23 @ **100%** |
| Frontend | **`scrolith-frontend-00215-tab`** | p23 @ **100%** |

---

## Monitoring

Post-promote health samples on `api.scrolith.com`, `scrolith.com`, `/scroll` should remain **CLEAN**. Continue 20–30 minutes for 5xx, media errors, engagement failures, and `scroll_home_fallback` (= 0).

---

## Phase 24

**Do not start** until this monitoring window stays clean.
