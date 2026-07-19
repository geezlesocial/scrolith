# Phase 21.1.7c — iOS WebKit Feed Identity Stabilization

**Date:** 2026-07-19  
**Commit:** `659937d57596adf2c0b24bc8ebb3aedce6552ffd`  
**Staged revision:** `scrolith-frontend-00203-yot` (tag `p2117`, 0% traffic)  
**Base URL:** https://p2117---scrolith-frontend-25ysnpjdda-as.a.run.app

## Root cause

Member Home on mobile uses `MobileFeed` + `useContinuousFeed` (shared lifecycle). On iOS WebKit only, the session head post id changed during the 60s identity probe (`visible_post_id_changed`).

Verified product mechanisms (not harness-only):

1. **Hard re-initial replace** — a second `load('initial')` against a non-empty stream replaced the reading session with a re-ranked first page (WebKit remount / lifecycle races made this more likely than Chromium).
2. **Memory trim dropped the head** — `trimFeedForMemory` / `mergeStreamEntries` used `slice(length - cap)`, destroying session-head identity after aggressive pagination.
3. **Mobile UI sync** had no defense if shared stream head swapped under race.
4. **WebKit `content-visibility: auto`** on post cards interacted poorly with progressive layout / observers (disabled only for pure WebKit engines).

Desktop Chrome, mobile Chromium (390 / Pixel 7) already passed; only WebKit failed prior to 21.1.7c.

## Fix (minimal, WebKit-compatible)

| Area | Change |
|------|--------|
| `useContinuousFeed` | Isolate soft_refresh **and** re-initial when stream non-empty; surface/mode session key; lifecycle instrumentation |
| `trimFeedForMemory` / `mergeStreamEntries` | Keep session head; drop oldest tail |
| `MobileFeed` | Reject destructive head swaps; disable content-visibility on WebKit only |
| Cert probe | Capture product lifecycle timeline + session/head ids |

No ranking, recommendations, backend APIs, or schema changes.

## Instrumentation evidence

Runtime ring buffer: `window.__scrolithFeedLifecycleLog`  
Events: `session_start`, `load_start`, `commit_stream`, `soft_refresh_isolate`, `initial_protected`, `pagination_merge`, `memory_trim`, `head_change`, `visibility_change`, `online_change`, `webkit_lifecycle`, `reject_head_swap`  
Probe attaches product head + recent lifecycle rows to `__scrolithFeedIdentityTimeline`.

## Identity suite (60s) — PASS all four

| Project | Member Home | Community | Scroll |
|---------|-------------|-----------|--------|
| desktop-chrome | PASS | PASS | PASS |
| pixel-7 | PASS | PASS | PASS |
| **iphone-15** | **PASS** | PASS | PASS |
| mobile-390 | PASS | PASS | PASS |

**13/13 passed** (~12.4m).

## Full release gate — PASS

- Unit contracts: PASS (54)
- Authenticated e2e: **56 passed**, 1 skipped, 0 failed (~16.7m)
- `promoteRecommended`: **true**
- `phase2115ProductionCertified`: **true**
- `phase2117IdentityCertified`: **true**
- Auto traffic shift: **not performed**

## Promotion report (operator action required)

| Field | Value |
|-------|--------|
| Promote recommended | **YES** |
| Source image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend:p2117` |
| Staged revision | `scrolith-frontend-00203-yot` |
| Staged tag URL | https://p2117---scrolith-frontend-25ysnpjdda-as.a.run.app |
| Current public traffic | Prior stable (e.g. p2114i `00131-4jr` at 100%) — confirm before cutover |
| Suggested action | Route 100% FE traffic to `scrolith-frontend-00203-yot` only after operator approval |
| Rollback | Re-point traffic to previous 100% revision; no DB migration |

### Suggested promote command (do not run unless approved)

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 \
  --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00203-yot=100
```

## Phase 21.1.5 production certification

**YES — production-certified** via this gate (`phase2115ProductionCertified: true`), contingent on staged p2117 containing 21.1.5 design system + 21.1.7c identity fix. Public traffic still requires operator promotion.
