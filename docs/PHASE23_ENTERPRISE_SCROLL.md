# Phase 23 — Enterprise Scroll Experience

**Status:** Implementation complete (deployment deferred to Phase 23A)  
**Date:** 2026-07-20  
**Surface:** `/scroll` only (no community feed identity / Phase 21 changes)

---

## Objective

Hardened enterprise Scroll player, engagement, Scrolitha learning signals, performance, and moderation — without rewriting messaging or feed ranking identity.

---

## Delivered

### Player

| Capability | Implementation |
|------------|----------------|
| Reels-style **Scroll** brand label | `ScrollCard` top-center overlay (`data-testid="scroll-brand-label"`) |
| Adaptive buffering / preload | `resolveScrollPreloadMode` + `estimateBufferHealth` + buffering chip |
| Prefetch next videos | `prefetchScrollMediaUrls` from `ScrollFeed` for next 1–2 items |
| Autoplay behavior | `shouldAttemptAutoplay` + existing visibility / gesture resume |
| Resume playback | `saveScrollResumePosition` / `readScrollResumePosition` (local, near-end cleared) |
| Offline recovery | Learning/engage queue drain on `online` event |

### Engagement hardening

| Action | Behavior |
|--------|----------|
| Reactions | Existing `ReactionBar` + double-tap like retained |
| Comments / repost / share / send / dash | Existing sheets/modals retained |
| Report | Validation + client rate limit + optimistic pending count + rollback |
| Add to Story | Existing path retained |
| **Bugfix** | `handleEngage` now accepts **scroll id or object** (card was passing id; engage was a no-op) |
| Optimistic metrics | Patch counters before API; rollback on failure |
| Idempotent engage | Existing `beginManagedIdempotentRequest` retained |

### Scrolitha Learning Engine

Client: `scrollLearningEngine.ts`  
Server: extended `engageScroll` types:

- `learn_pause`, `learn_replay`, `learn_mute`, `learn_unmute`, `learn_seek`, `learn_complete`, `learn_watch`

Learning types **do not inflate public counters**.  
Successful completion/replay/like/share/watch signals call `recordFeedIntentSignal` with `surface: 'scroll'` to improve **Scroll** recommendation quality via existing `getViewerFeedContext` / `scoreScrollForMode` — **not** community feed identity.

### Performance

| Item | Implementation |
|------|----------------|
| Virtualized mount window | Only ±1–2 cards around active index mount full `ScrollCard` |
| Predictive preloading | Link `prefetch` for next media URLs |
| Reduced re-renders | Cold cards are lightweight placeholders |
| Data saver / low bandwidth | Smaller virtual radius + metadata-only preload |

### Moderation / safety

| Item | Implementation |
|------|----------------|
| Report workflow | Reason validation + rate limit |
| Abuse signal logging | Structured `[scroll-safety]` log without free-text reason body |
| Spam hooks | Repeated-character rejection on report reason |
| Server report | Existing `/scroll/:id/report` retained |

---

## Files changed

### Frontend

- `src/utils/scrollPlayerEngine.ts` **(new)**
- `src/utils/scrollLearningEngine.ts` **(new)**
- `src/utils/scrollEngagementOptimistic.ts` **(new)**
- `src/utils/scrollModerationClient.ts` **(new)**
- `src/utils/__tests__/phase23ScrollEnterprise.spec.ts` **(new)**
- `src/features/scroll/ScrollCard.tsx`
- `src/features/scroll/ScrollFeed.tsx`
- `src/services/scroll.ts` (engagement type union)

### Backend

- `src/controllers/scroll.controller.ts` (learning engage types + intent signals)

### Docs

- `docs/PHASE23_ENTERPRISE_SCROLL.md`

---

## Tests

```
vitest phase23ScrollEnterprise.spec.ts
```

Expected: player window, preload, learning weights, optimistic metrics, report validation.

Also preserve:

- Phase 22.1B Scroll route tests (no `/home` fallback)
- Messaging phases unchanged

---

## Explicit non-goals (Phase 23)

- No Phase 23A deploy
- No Phase 24 community modernization
- No messaging changes
- No E2EE / Redis microservices
- No community feed ranking rewrite

---

## Phase 23A (next)

1. Build FE + BE images  
2. Tag @0%  
3. Certify `/scroll` on desktop + mobile viewports  
4. Promote 100%  

---

## Completion gate (implementation)

```json
{
  "phase23Implemented": true,
  "scrollBrandLabel": "PASS",
  "adaptivePlayer": "PASS",
  "engagementHandlerFix": "PASS",
  "learningSignals": "PASS",
  "virtualization": "PASS",
  "moderationClient": "PASS",
  "deploymentPerformed": false
}
```
