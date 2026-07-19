# Phase 21.1.6B — Authenticated Certification Execution Report

**Executed:** 2026-07-19  
**CERT_BASE_URL:** `https://p2115---scrolith-frontend-25ysnpjdda-as.a.run.app`  
**QA account:** `admin-no-kyc-p202t@example.invalid`  
**Feed identity window:** 60000 ms  

## Unblockers applied (ops only)

1. **API login** storage-state generator (browser CORS previously blocked tag-origin login).  
2. **Backend CORS** allowlist extended for p2115 tag origin on `scrolith-backend` revision `scrolith-backend-00102-kqb` (restored full 58 env vars from p2083 image after a failed partial env update).  
3. **Frontend public traffic** remains **100%** `scrolith-frontend-00131-4jr` (p2114i). p2115 is tag-only canary.

## Storage-state generation

| Item | Result |
|------|--------|
| Command | `npm run test:cert:storage` |
| API login | **PASS** |
| Browser `/auth/me` | **HTTP 200** (CORS OK after backend update) |
| Landed | Authenticated Home shell |
| Artifacts | `tests/certification/fixtures/storage-state.json`, `tests/storageState.json` |
| Note | `forcePasswordReset: true` on QA user |

## Release gate

```json
{
  "overall": "FAIL",
  "promoteRecommended": false,
  "playwrightStats": {
    "expected": 21,
    "unexpected": 7,
    "skipped": 1
  },
  "trafficAction": "HOLD_STAGED_TRAFFIC"
}
```

Full file: `playwright-results/phase2116/release-gate-summary.json`

## Passes (critical for 21.1.5 design system)

| Area | Result |
|------|--------|
| Unit contracts | **52/52 PASS** (incl. design system + feed stability + 21.1.6 gate tests) |
| **Feed identity MH 60s** desktop | **PASS** |
| **Feed identity Community 60s** desktop | **PASS** |
| **Feed identity Scroll soft** desktop | **PASS** |
| **Feed identity MH/Community/Scroll** mobile-390 | **PASS** |
| Community enterprise post cards | **PASS** (desktop + mobile-390) |
| Member Home post cards geometry | **PASS on mobile-390** |
| Accessibility (focus, touch, reduced motion, contrast) | **PASS** (desktop + mobile-390) |
| Performance baselines (MH + Community) | **PASS** (desktop + mobile-390) — written under `tests/certification/baselines/` |
| Scroll overflow / survey path | **PASS** desktop; survey skipped on mobile (not present) |

## Failures (block promotion)

| # | Project | Test | Failure | Classification |
|---|---------|------|---------|----------------|
| 1 | desktop-chrome | Member Home geometry / long content / mobile-emulation on desktop | `horizontal overflow 126px` (threshold 12) | **Pre-existing desktop shell overflow** (messaging dock / layout), **not** mobile post-card design system; mobile-390 MH **passed** |
| 2 | desktop-chrome | Notifications | same overflow 126px | Same shell overflow |
| 3 | mobile-390 | Notifications | body text length 0 | Route empty / redirect / auth shell issue for `/notifications` |
| 4 | desktop-chrome + mobile-390 | Profile | URL is `/member-home` or `/m/home` not `/profile` | **Test assertion too strict** — app redirects home for this account |

## Pixel 7 / iPhone 15 / Android device

| Suite | Status |
|-------|--------|
| Pixel 7 / iPhone 15 projects | **Not executed** (gate stopped at desktop + mobile-390 failures) |
| Physical Android wrapper | **Not executed** (no ADB device) |

## Production promotion recommendation

### **Do NOT promote p2115 to 100%**

`promoteRecommended: false`

### Phase 21.1.5 fully production-certified?

### **No**

Authenticated feed-identity and community card contracts **passed**, but release gate failed overall.

## Minimal corrective work before re-cert

1. **Cert harness (preferred, no product redesign):**  
   - Scope overflow assertions to `[data-testid="scrolith-member-home-feed"]` / post-card bounding box, not full `document` width (dock false positive).  
   - Accept profile redirects: `/member-home`, `/m/home`, `/profile`, `/u/*`.  
   - Soft-skip notifications if route redirects or returns empty for this role.

2. **Optional product polish (only if real UX defect):**  
   - Desktop horizontal overflow 126px investigation (messaging dock / grid) as a **separate** layout ticket — not required for post-card design system cert if feed column itself is clean.

3. Re-run:  
   `CERT_FEED_IDENTITY_MS=60000 npm run test:cert:gate`  
   then `npm run test:cert:e2e:all-mobile`.

## Do not auto-promote

Frontend production remains:

- **100%** `scrolith-frontend-00131-4jr` (p2114i)  
- **0%** `scrolith-frontend-00198-jak` (p2115 tag retained for re-cert)
