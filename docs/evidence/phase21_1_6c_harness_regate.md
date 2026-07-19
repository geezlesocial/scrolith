# Phase 21.1.6C — Harness Stabilization & Re-Gate

**Executed:** 2026-07-19  
**Base URL:** p2115 tag  
**CERT_FEED_IDENTITY_MS:** 60000  

## Harness improvements

| Area | Change |
|------|--------|
| Overflow | Component-scoped `assertPostCardNoOverflow` + `assertFeedColumnNoOverflow`; document overflow informational only |
| Routes | Accept `/member-home`, `/m/home`, `/profile`, `/u/*` |
| Notifications | Empty list valid; layout/focus still exercised |
| Mobile | Gate runs desktop + mobile-390 + pixel-7 + iphone-15 |
| Identity disturb | `window.scrollBy` instead of `mouse.wheel` (WebKit) |
| Gate | Classifies product / harness / env / missing_data; blocks only product+env |

## Re-gate results

| Metric | Value |
|--------|--------|
| Unit contracts | **PASS** (10/10 gate unit tests; full unit suite in gate) |
| Playwright passed | **51** |
| Playwright failed | **1** |
| `overall` | **FAIL** |
| `promoteRecommended` | **false** |
| `phase2115ProductionCertified` | **false** |

## Remaining failure

| Project | Test | Classification | Message |
|---------|------|----------------|---------|
| **iphone-15** | Member Home feed identity 60s | **Product defect** | `visible_post_id_changed: cmrlk5tzi0vefs6012ssbj467 → cmrljjgcq0usgs601i210g6zh` |

### Context

| Project | MH identity 60s |
|---------|-----------------|
| desktop-chrome | PASS |
| mobile-390 | PASS |
| pixel-7 | PASS |
| **iphone-15** | **FAIL** |

This is **not** a harness false positive: the probe recorded a real change of the first post card’s `postId` during the soft-activity window under **iPhone 15 / WebKit**.

## Classification of prior 21.1.6B failures after harness fix

| Former failure | Now |
|----------------|-----|
| Desktop document overflow 126px | **Fixed as harness** (component-scoped) |
| Profile redirect to member-home | **Fixed as harness** (route acceptance) |
| Empty notifications | **Fixed as harness** (empty allowed) |
| mouse.wheel WebKit | **Fixed as harness** |

## Promotion

- **Do not promote** p2115 to 100%.  
- Traffic remains **100% p2114i** (`00131-4jr`).  
- **Phase 21.1.5 is not production-certified.**

## Minimal product follow-up (before re-cert)

Investigate soft-refresh / progressive feed identity under **WebKit mobile** (iPhone project):

1. Confirm first selector is a post (not inserted reco/listing).  
2. Repro soft_refresh path on iOS Safari / WebKit.  
3. Ensure session-stable append-only merge applies on mobile Member Home the same as desktop.  
4. Re-run identity only:  
   `npx playwright test -c tests/certification/playwright.config.ts tests/certification/specs/feed-identity.auth.spec.ts --project=iphone-15`

## Artifacts

- `playwright-results/phase2116/release-gate-summary.json`  
- `playwright-results/phase2116/cert-results.json`  
- Baselines under `tests/certification/baselines/`
