# Phase 22.1B — Scroll Video Preview and Deep-Link Correction

**Date:** 2026-07-20  
**Status:** Implementation complete — staged deploy required (0% traffic)  
**Scope:** Scroll recommendation cards + `/scroll` deep links only  
**Does not start Phase 22.2**

---

## Root-cause analysis

### 1. Wrong `/home` navigation (primary)

| Layer | File | Defect |
|-------|------|--------|
| Stream kind | `utils/feedStream.ts` | `SCROLL_VIDEO` correctly maps to kind `scroll` |
| Card renderer | `components/feed/FeedMixedCard.tsx` | **No `case 'scroll'`** → fell into `default` |
| Default card | same | `href: '/home'`, `cta: 'Open'`, empty media |

Faulty path:

```
feedOrchestrator SCROLL_VIDEO
  → toStreamEntry(kind=scroll)
  → FeedMixedCard switch
  → default → href='/home' + CTA Open
  → user lands on Member Home shell (/home)
```

### 2. Missing muted preview

| Cause | Detail |
|-------|--------|
| No scroll card branch | Default card never rendered a `<video>` |
| Media dropped | `toStreamEntry` copied `payload` but not orchestrator `item.media` |
| Orchestrator media | BE attaches resolved `media.url` / `thumbnailUrl` on the item, not always inside `payload` |

### 3. Lost Scroll identity

Default card discarded all ids. Recommendation id / `sourceId` / `fileId` were never mapped to a Scroll deep link.

### 4. Scroll route partial support

| Existing | Gap |
|----------|-----|
| Member Home reels used `/scroll?scroll=<id>` | Mixed-card Open ignored it |
| `ScrollFeed` handled `series`, post-video `watch` | Did not fetch missing `?scroll=` when not already in session |
| No public `GET /scroll/:id` | Could not load one video by id |

---

## Canonical Scroll URL contract

**Single builder:** `buildScrollVideoUrl(videoId)` → `/scroll?scroll=<scrollVideoId>`

| Rule | Value |
|------|--------|
| Path | `/scroll` |
| Query key (write) | `scroll` |
| Query alias (read) | `video` |
| Helper | `src/utils/scrollVideoRoutes.ts` |

Also supports refresh, share, back/forward, Capacitor.

---

## Identity contract

```ts
type ScrollVideoRecommendationTarget = {
  scrollVideoId: string;
  postId?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  title?: string;
  creatorId?: string;
  ...
};
```

`normalizeScrollVideoRecommendation` / `resolveScrollVideoId` map:
`id | sourceId | scrollId | videoId | SCROLL_VIDEO:<id> feedKey` → canonical id.

If no id → **disable navigation** (honest unavailable), **never** `/home`.

---

## Preview design

`ScrollVideoPreview` (`components/feed/ScrollVideoPreview.tsx`):

- muted, playsInline, loop, no controls
- fixed 9:16 aspect, poster first
- IntersectionObserver (~35% visible) → load + play
- leave viewport / tab hidden → pause
- max **1** simultaneous active preview
- autoplay fail → poster + play glyph; card still navigable
- `preload="none"` until near viewport

---

## Files changed

### Frontend (`geezle`)

| File | Change |
|------|--------|
| `src/utils/scrollVideoRoutes.ts` | **New** — URL + identity |
| `src/utils/scrollRecommendationAnalytics.ts` | **New** — counters / events |
| `src/utils/feedStream.ts` | Promote `media` onto stream data |
| `src/components/feed/FeedMixedCard.tsx` | `case 'scroll'`, preview, deep link, no `/home` |
| `src/components/feed/ScrollVideoPreview.tsx` | **New** — muted preview |
| `src/features/scroll/ScrollFeed.tsx` | Deep-link resolve + unavailable UI |
| `src/services/scroll.ts` | `getById` |
| `src/components/sections/MemberHomeSection.tsx` | Reels use `buildScrollVideoUrl` |
| `src/utils/__tests__/phase221B*.spec.ts` | Unit tests |

### Backend (`geezle-backend`)

| File | Change |
|------|--------|
| `src/controllers/scroll.controller.ts` | `getScrollById` |
| `src/routes/scroll.routes.ts` | `GET /:id` before comments |

---

## Corrected route locations (Scroll-specific)

| Location | Before | After |
|----------|--------|-------|
| `FeedMixedCard` default for `scroll` kind | N/A (missed case → `/home`) | `case 'scroll'` → `/scroll?scroll=` |
| `FeedMixedCard` default fallback | `/home` | `/member-home` (non-scroll unknowns only) |
| Member Home reel click | inline `/scroll?scroll=` | `buildScrollVideoUrl` |
| Scroll share URLs in feed | same shape | `buildScrollVideoUrl` via `buildScrollUrl` |

Unrelated people/page `/home` profile fallbacks **unchanged**.

---

## Analytics

Privacy-safe events via `feed_interaction`:

- preview attempt / started / blocked  
- `scroll_recommendation_clicked` with `{ recommendationId, scrollVideoId, sourceSurface, sourcePosition, destination: "/scroll" }`  
- deep-link success / failure  

Counter **`scroll_recommendation_home_fallback_total` must stay 0**.

---

## Tests

| Suite | Result |
|-------|--------|
| phase221B route + identity | PASS (after feedKey fix) |
| phase221B feed mixed scroll | PASS |
| Phase 21 cert unit | **54/54 PASS** |

---

## Deploy discipline

1. Deploy **backend** first (GET `/scroll/:id`) tagged `p221b` @ **0%**  
2. Deploy **frontend** tagged `p221b` @ **0%**  
3. Certify tagged URLs  
4. **Do not promote without operator approval**

### Rollback

- FE: previous production revision (p222 / prior)  
- BE: previous production revision  

---

## Release gate (target)

```json
{
  "scrollPreviewWorks": true,
  "exactVideoDeepLinkWorks": true,
  "homeFallbackCount": 0,
  "phase21Regression": "PASS",
  "promoteRecommended": false
}
```

`promoteRecommended` remains **false** until operator approval after tagged cert.
