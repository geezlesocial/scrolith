# Phase 22.3C — Messaging Privacy Deployment & Production Certification

**Date:** 2026-07-20  
**Result:** **PASS** · `phase223cCertified: true` · `promoteRecommended: true` · **PROMOTED 100%**

---

## Pre-deployment verification

| Check | Result |
|-------|--------|
| FE commit `76a30ab0` on `origin/main` | **PASS** (pushed) |
| BE monorepo `ff64d459` (+ docs `17b8e3ed`/`46a1bc2f`) on `origin/release/backend-production` | **PASS** (pushed) |
| Submodule `geezle` at `76a30ab0` | **PASS** |
| Unrelated mobile/baseline dirty files excluded from deploy images | **PASS** (Cloud Build source upload of intended trees) |
| No feed / Scroll rec changes in 22.3B commits | **PASS** |

### Live traffic before deploy (inspected)

| Service | 100% revision | Image tag |
|---------|---------------|-----------|
| Backend | `scrolith-backend-00156-jor` | `p223` |
| Frontend | `scrolith-frontend-00211-kev` | `p223` |

These are the **rollback targets**.

---

## Build & test gate

| Suite | Result | Classification |
|-------|--------|----------------|
| BE privacy + lastMessagePreview | **19/19 PASS** | PASS |
| FE privacy/menu/receipts/mentions/Scroll | **22/22 PASS** | PASS |
| Production Docker builds (Cloud Build) | BE SUCCESS / FE SUCCESS | PASS |
| Project-wide `tsc` noise | Pre-existing unrelated | PASS_WITH_PREEXISTING_UNRELATED_ERRORS |
| New Phase 22.3B compile errors | None observed in privacy files | PASS |

---

## Migration

| Field | Value |
|-------|--------|
| Name | `20260720180000_phase223b_messaging_privacy` |
| Status | **APPLIED** |
| Project | `scrolith-500821` |
| Instance | `scrolith-postgres-prod` (asia-southeast1) |
| Database | `scrolith` |
| Method | Cloud SQL Auth Proxy → `127.0.0.1:5433` + additive SQL + `_prisma_migrations` insert |

### Safety assessment

- Additive only (`ADD COLUMN IF NOT EXISTS`)
- Reuses canonical `presenceVisibility` (no competing online field)
- Defaults preserve prior production behavior (`EVERYONE` / `true`)
- Sample after apply (aggregate only): **69/69** users effective production-safe defaults for all privacy columns

**Do not drop columns on application rollback.**

---

## Deployment

| Service | Image | Digest | Revision | Staged | Promoted |
|---------|-------|--------|----------|--------|----------|
| Backend | `scrolith-backend:p223c` | `sha256:4e2d60ea…` | `scrolith-backend-00158-faz` | 0% | **100%** |
| Frontend | `scrolith-frontend:p223c` | `sha256:be87e858…` | `scrolith-frontend-00213-hit` | 0% | **100%** |

| Tag URLs |
|----------|
| BE: https://p223c---scrolith-backend-25ysnpjdda-as.a.run.app |
| FE: https://p223c---scrolith-frontend-25ysnpjdda-as.a.run.app |

### FE assets (tagged)

- Entry JS: `assets/index-Blu9sgaX.js`
- Entry CSS: `assets/index-Cwlo4sYM.css`
- Asset 404 count: **0** (6/6)

---

## Certification matrix

| Area | Result | Evidence |
|------|--------|----------|
| Privacy GET/PATCH self | **PASS** | 35/35 tagged API cert |
| Unauthenticated privacy | **PASS** | 401 |
| Audience enums (incl. FOLLOWERS DM) | **PASS** | PATCH cycles |
| Invalid enum safety | **PASS** | normalized / rejected safely |
| Defaults restore + persist | **PASS** | restore EVERYONE/enabled |
| Presence heartbeat + batch | **PASS** | 200 |
| Read receipts (internal + API) | **PASS** | delivered/read 200 with privacy off/on |
| Menu star/mute/archive/unarchive/label/unread | **PASS** | all 200 after warm |
| 22.1 idempotent send | **PASS** | dual POST same clientMessageId |
| Group create (privacy-safe) | **PASS** | group create 200 |
| Notification preview policy | **PASS** | unit + setting toggle (server path wired) |
| Typing/recording privacy | **PASS** | unit + server gates (22.3B) + setting toggles |
| Production post-promote API | **PASS** | 35/35 on `api.scrolith.com` |
| Production FE boot | **PASS** | 200 + entry `index-Blu9sgaX.js` |
| Phase 22.1B Scroll unit | **PASS** | 6/6 no `/home` |
| Phase 22.2 mentions unit | **PASS** | 4/4 |
| Phase 22.3 receipts unit | **PASS** | 4/4 |
| Phase 22.3B privacy/menu unit | **PASS** | 8/8 |

Gate: `geezle/playwright-results/phase223c/release-gate-summary.json`

---

## Promotion (executed)

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00158-faz=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00213-hit=100
```

### Rollback (application traffic only)

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00156-jor=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00211-kev=100
```

Do **not** drop privacy columns. Prior revision safely ignores additive fields via defaults/fallbacks.

---

## Observability notes

- Privacy-policy denials (DM/invite) are expected application outcomes, not 5xx.
- Structured metrics names from the 22.3C checklist may be incrementally wired; certification relied on API behavior + health.
- Logs must not include message bodies, tokens, or full privacy payloads (cert scripts avoid logging those).

---

## Production recommendation

**PROMOTE COMPLETE.** Phase 22.3B messaging privacy controls and enterprise conversation settings are live at 100%.

Monitor for a short post-deploy window:

- privacy API 4xx/5xx
- unexpected DM create failures vs expected policy denials
- presence projection errors
- frontend asset 404s / 5xx

Do not begin the next messaging feature phase until this monitoring window remains clean.
