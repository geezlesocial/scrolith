# Phase 21.1.8 — Production Promotion & Post-Deployment Verification

**Promoted at:** 2026-07-19T19:04Z (approx.)  
**Operator action:** Controlled 100% FE traffic cutover  
**Auto-rollback:** Not required

## Traffic allocation

| Role | Revision | Tag | Percent |
|------|----------|-----|---------|
| **Production (live)** | `scrolith-frontend-00203-yot` | `p2117` | **100%** |
| **Rollback target** | `scrolith-frontend-00131-4jr` | `p2114i` | **0%** (retained) |

- Older revisions **not deleted**.
- Public origin: https://scrolith.com  
- Image: `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend@sha256:0f960649060037b36ec5f4310f3f45ddc54281a1811e48123cd443bf36a16784`  
- Commit on image: `659937d5` (Phase 21.1.7c identity fix + Phase 21.1.5 design system lineage)

### Rollback command (if needed)

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 \
  --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00131-4jr=100
```

## Post-deployment verification

### Assets / boot

| Check | Result |
|-------|--------|
| HTML HTTP 200 + `#root` | PASS |
| Entry JS | `/assets/index-CCZ5abQQ.js` → 200 |
| Entry CSS | `/assets/index-DVNU449I.css` → 200 |
| JS/CSS 404s | **0** |
| HTML asset set matches promoted revision entry | PASS (`index-CCZ5abQQ.js`) |
| Guest SPA shell on all routes | PASS |

Surfaces (unauthenticated HTTP):

| Surface | Path | Status |
|---------|------|--------|
| Home | `/` | 200 |
| Community | `/community` | 200 |
| Scroll | `/scroll` | 200 |
| Profile | `/profile` | 200 |
| Notifications | `/notifications` | 200 |
| Admin Dashboard | `/dashboard` | 200 |
| Login | `/auth/login` | 200 |

Evidence: `docs/evidence/phase21_1_8_post_deploy_verify.json`

### Authentication

- Token validated via `GET https://api.scrolith.com/api/auth/me` → **200**
- Session re-bound to `https://scrolith.com` origin (prior cert storage was run.app-only)
- Authenticated boot shows Member Home feed (post cards present), no Sign In chrome

### Authenticated Playwright (production origin)

`CERT_BASE_URL=https://scrolith.com` · desktop-chrome + iphone-15

| Suite | Result |
|-------|--------|
| Feed identity 60s (MH + Community + Scroll) | **PASS** (desktop + iPhone) |
| Member Home post cards | **PASS** |
| Community post cards | **PASS** |
| Scroll surface | **PASS** |
| Profile | **PASS** |
| Notifications | **PASS** |
| Overall | **20 passed, 1 skipped, 0 failed** |

Note: First unauthenticated run failed with `no_post_cards` because storage-state localStorage was bound only to the `p2117` tag host — **not** a production asset/traffic defect. Corrected by injecting the same valid token into the `scrolith.com` origin.

## Monitoring (~15+ minutes)

| Signal | Result |
|--------|--------|
| Home `/` poll (15 samples / 15 min) | All **200** |
| Login `/auth/login` poll | All **200** |
| Asset 404 probes | **0** |
| FE revision HTTP 5xx (30m log query) | **0** |
| FE revision severity≥ERROR (30m) | **0** |
| Backend HTTP 5xx (30m) | **0** |
| Auth failures observed in verify path | **None** (auth/me 200; cert suite authenticated) |
| Critical regression requiring rollback | **No** |

Evidence: `docs/evidence/phase21_1_8_monitor_15m.json` (HTTP/asset polls) + live `gcloud logging read` counts.

## Error summary

| Category | Count | Notes |
|----------|------:|-------|
| Asset 404 | 0 | |
| FE 5xx (revision 00203-yot) | 0 | |
| FE ERROR logs | 0 | |
| BE 5xx | 0 | |
| Product feed identity regression | 0 | iPhone + desktop 60s identity PASS on prod |
| Harness false negatives | 1 wave | Wrong-origin storage state; corrected |

## Final production status

**HEALTHY — PRODUCTION LIVE**

- Phase 21.1.5 design system + Phase 21.1.7c WebKit identity fix are serving 100% on `scrolith-frontend-00203-yot`.
- Rollback target `scrolith-frontend-00131-4jr` retained at 0%.
- No rollback executed.
- No commits reverted.
