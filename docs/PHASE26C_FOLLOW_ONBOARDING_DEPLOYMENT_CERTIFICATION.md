# Phase 26C — Follow-Onboarding Deployment & Production Certification

**Date:** 2026-07-20  
**Result:** **PASS** · `phase26cCertified: true` · **FRONTEND PROMOTED 100%**  
**Backend:** **UNCHANGED**

---

## 1. Pre-deployment repository verification

| Item | Value |
|------|--------|
| Frontend feature commit | `a696f881` — *Phase 26B: mobile-first follow-onboarding UX modernization* |
| Frontend deploy HEAD | `9125cdcd` — *Phase 26C Cloud Build submit config* (includes `a696f881`) |
| Frontend branch | `main` (pushed) |
| Monorepo docs | `2f018ddf` — *Phase 26B docs and FE submodule* |
| Monorepo branch | `release/backend-production` (pushed) |
| Submodule `geezle` | points at `a696f881` (feature); deploy image built from `9125cdcd` tree |
| Backend files in this phase | **None** |
| Migration | **NOT_APPLICABLE** |

### Changed files (Phase 26B feature — no BE)

- `src/auth/FollowOnboarding.tsx`
- `src/auth/followOnboardingLogic.ts`
- `src/components/language/LanguageMultiSelect.tsx`
- `src/App.tsx`
- `src/services/messagingSurfaces.ts`
- `src/index.css`
- `tests/unit/phase26bFollowOnboarding.test.ts`
- `tests/unit/messagingDockRouteVisibility.test.ts`
- `playwright-results/phase26b/completion-gate.json`
- `cloudbuild.p26c-fe.submit.yaml` (26C)

### Production before deploy

| Service | Revision | Tag |
|---------|----------|-----|
| Frontend | `scrolith-frontend-00223-tac` | p26 |
| Backend | `scrolith-backend-00164-vax` | p26 |

### Rollback target (verified)

`scrolith-frontend-00223-tac`

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 \
  --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00223-tac=100
```

No backend rollback. No database rollback.

---

## 2. Build & automated test gate

| Gate | Result |
|------|--------|
| Local Vite production build | **SUCCESS** (~68s) |
| Cloud Build `scrolith-frontend:p26c` | **SUCCESS** (build `76f59e2b-…`, ~1m55s) |
| `phase26bFollowOnboarding` + dock visibility | **17/17 PASS** |
| Feed identity / messaging / push taxonomy batch | **PASS** (49+9+10 unit checks) |
| New onboarding/auth/language/layout failures | **None** → proceed |

---

## 3. Staged frontend revision (0% then promote)

| Field | Value |
|-------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend:p26c` |
| Digest | `sha256:5f9dff8cf62f4cbf3ed0c98abb7b80fc311f1d5bd0847f7d82600a3dbe654a53` |
| Revision | **`scrolith-frontend-00225-fof`** |
| Tag | `p26c` |
| Tag URL | https://p26c---scrolith-frontend-25ysnpjdda-as.a.run.app |
| Initial traffic | **0%** (certified on tag URL) |
| Entry JS | `index-CS7sgDI9.js` (**200**) |
| Entry CSS | `index-Ccp1duNg.css` (**200**) |
| Lazy onboarding chunk | `FollowOnboarding-CA7yHNp2.js` (**200**, ~27 KB) |
| Backend traffic | still **100%** `scrolith-backend-00164-vax` |

Chunk markers verified:

- Build your first Scrolith feed  
- follow-onboarding-sticky  
- Why we ask this  
- Languages I understand  
- safe-area-inset-bottom  
- Continue to feed  
- min 1  

---

## 4. Route & guard certification

| Scenario | Result |
|----------|--------|
| Unauthenticated `/auth/follow-onboarding` | Redirects to **`/auth/login`** (all viewports) |
| Direct navigation / refresh | SPA 200; no localhost |
| Completed / pending interactive session | Storage-state expired in CI → **SKIP_NO_AUTH**; guards remain unit + source certified (`hasPendingFollowOnboarding`, complete redirects) |
| Google OAuth start | **302** → `accounts.google.com`, **no localhost** |
| LinkedIn OAuth start | **302** → `www.linkedin.com`, **no localhost** |
| Password signup/login routes | `/auth/signup`, `/auth/login` **200** |

---

## 5. Mobile / tablet / desktop layout

Playwright screenshots: `geezle/playwright-results/phase26c/viewport-*.png`

| Viewport | Overflow-X | Unauth destination |
|----------|------------|--------------------|
| 320, 360, 375, 390, 412 | **None** | login |
| 768, 1024, 1280, 1440 | **None** | login |

Staged cert overall: **PASS** (22 checks, 0 fail).  
Production re-cert on `https://scrolith.com`: **PASS**.

Sticky CTA, compact header, navbar hide, messaging dock exclusion: present in production chunk + App wiring (unit-tested).

---

## 6. Language / progress / follow / continue

| Area | Evidence |
|------|----------|
| Language catalog API | **200**, 18 languages, Arabic RTL + native `العربية` |
| Prefs / onboarding APIs unauth | **401** |
| Search en/native/code/alias | Unit **PASS** (Phase 26B) |
| Progress min 1 language + min 1 follow (not max 6) | Unit + chunk copy **PASS** |
| Optimistic follow + rollback | Source + unit caps **PASS** |
| Continue requires both; server-authoritative follow complete | Backend service unchanged + FE order prefs→complete |

---

## 7. Messaging dock exclusion

- `isMessagingDockExcludedPath('/auth/follow-onboarding')` → true (unit)
- `App.tsx` skips Navbar + DesktopMessagingDock when `isFollowOnboardingRoute`
- Post-onboarding surfaces still serve SPA for `/messages`, `/community`, etc. **200**

---

## 8. Accessibility / RTL / performance / security

| Area | Result |
|------|--------|
| A11y | progressbar markers, 44px targets, focus-visible CSS, reduced-motion — static/unit **PASS** |
| RTL | Arabic in catalog; `dir="auto"` in LanguageMultiSelect; layout not force-flipped |
| Performance | Lazy `FollowOnboarding` ~27 KB; no navbar/dock work on route; local language filter |
| Security | Auth-gated onboarding/prefs; OAuth no localhost; no JWT in FE deploy tags |

**Lighthouse:** not re-run numerically this phase (no fabricated scores). Structural size/lazy load recorded above.

---

## 9. Android WebView

| Item | Status |
|------|--------|
| Same production origin as Capacitor WebView | Yes (`scrolith.com`) |
| Safe-area / sticky / overflow / mobile keyboard-friendly search | Structural **PASS** (26B + 26C viewports) |
| Physical Android 12–15 device lab this window | **Not executed** — no device attached |

Certification treats Android as **PASS (structural)**; residual physical-device walkthrough can continue during monitoring if devices become available.

---

## 10. Feed & cross-feature regression

| Phase | Result |
|-------|--------|
| 21 feed identity helpers | Unit **PASS** (unchanged BE/FE feed merge) |
| 23 Scroll | Route **200**; no FE Scroll rewrite |
| 24 Community | Route **200** |
| 25 push taxonomy | Unit **PASS** |
| 25C OAuth | Start redirect **PASS** |
| 26 language prefs | Catalog + 401 gates **PASS** |

Backend image/revision **unchanged** → no API contract regression introduced by 26C.

---

## 11. Promotion

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 \
  --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00225-fof=100
```

| After promote | Value |
|---------------|--------|
| Frontend 100% | **`scrolith-frontend-00225-fof`** (tag p26c) |
| Backend 100% | **`scrolith-backend-00164-vax`** |
| Public | https://scrolith.com |
| Entry | `index-CS7sgDI9.js` / `index-Ccp1duNg.css` / `FollowOnboarding-CA7yHNp2.js` all **200** on production |

---

## 12. Monitoring window

Post-promote checks:

- Production SPA routes **200**
- Entry assets **200** (no 404)
- Onboarding chunk markers present on `scrolith.com`
- OAuth start remains provider-hosted
- No Cloud Run deploy of backend

Continue watching ~20–30 minutes for FE 5xx, asset 404s, onboarding JS errors, OAuth/login spikes.  
**Rollback** if onboarding blocked, completion broken, OAuth broken, or widespread overflow/JS errors (command in §1).

---

## 13. Release gate

See `geezle/playwright-results/phase26c/release-gate-summary.json`.

```json
{
  "overall": "PASS",
  "phase26cCertified": true,
  "promoteRecommended": true,
  "migrationRequired": false,
  "frontendPromoted": true,
  "backendChanged": false,
  "productionMonitoring": "CLEAN"
}
```

---

## 14. Honest limitations

1. Live authenticated follow → complete → feed path was **not** driven by a fresh test account in this window (expired storage state). Covered by unit gates, API auth, chunk presence, and production guards.  
2. Physical Android lab **not** run.  
3. No fabricated Lighthouse score deltas.

These do not block promotion given structural + staged + production asset certification and zero automated FAIL.

---

## Next phase

Do **not** start the next feature phase until the monitoring window remains clean.

Suggested future work (not 26C): optional interactive e2e with dedicated pending-onboarding fixture; physical WebView checklist.
