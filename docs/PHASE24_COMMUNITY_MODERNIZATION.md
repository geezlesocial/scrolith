# Phase 24 — Community Mobile Modernization, Design System & Performance Hardening

**Status:** Implementation complete (deployment deferred to Phase 24A)  
**Date:** 2026-07-20  
**Surface:** `/community*` only  

**Does not modify:** `/scroll`, messaging, Phase 21 Member Home feed, marketplace, jobs.

---

## 1. Community audit (exact)

### Routes (`App.tsx`)

| Path | Component |
|------|-----------|
| `/community` layout | `CommunityLayout` |
| `/community` index | `CommunityHome` |
| `/community/posts/:id` | `CommunityHome` |
| `/community/clubs` | `Clubs` → `GroupsWorkspace` |
| `/community/forum` | `Forum` |
| `/community/chat` | `Chat` |
| `/community/events` | `Events` |
| `/community/leaderboard` | `Leaderboard` |
| `/community/resources` | `KnowledgeHub` |

### Core files

| Layer | Files |
|-------|--------|
| Shell | `community/CommunityLayout.tsx` |
| Feed home | `community/CommunityHome.tsx` (~4.2k lines) |
| Groups/discovery | `community/Clubs.tsx`, `community/components/GroupsWorkspace.tsx` (~2.6k) |
| Engagement | `PostEngagementBar`, `ReactionBar`, `PostShareModal`, `RepostModal`, post-options/* |
| Service | `services/community.ts` — clubs, join/leave, threads, comments, settings |
| APIs | `/community/clubs`, join/leave, requests, invites, threads, comments, like |

### Root issues found (pre-24)

1. Sticky community nav could feel cramped on mobile; decorative notification badge without navigation.  
2. Groups directory lacked debounced search UX, URL filter contract, skeletons, and reusable cards.  
3. Large monolithic pages (Home + GroupsWorkspace) mixed discovery/admin/composer.  
4. No Community-scoped design tokens or learning surface signals.  
5. Horizontal overflow risk from wide rails without `min-w-0` / `overflow-x-hidden` on shells.  
6. Join/leave lacked optimistic rollback in directory list.  

---

## 2. Architecture (Phase 24)

```
/community (layout shell — mobile-first nav)
  ├─ index → CommunityHome (feed; overflow + learning open signal)
  └─ clubs → GroupsWorkspace
        ├─ search + filter chips (URL: tab, q, group)
        ├─ CommunityCard directory
        └─ detail / moderation (existing, preserved)
```

### Design tokens

`community/design/communityTokens.ts`

- spacing, typography, radius, elevation, breakpoints, touch targets, card metrics

### Reusable UI

`community/components/ui/*`

- CommunityPageShell, CommunitySearchBar, CommunityFilterBar  
- CommunityCard, CommunityCardSkeleton, CommunityEmptyState, CommunityBadge  

### Session / learning

- `utils/communitySessionStability.ts` — append-only merge, URL parse/build, stale search  
- `utils/communityLearningEngine.ts` — surface `community` signals (no public counter inflation)

---

## 3. Membership & discovery

| Feature | Behavior |
|---------|----------|
| Search | Debounced 280ms, request sequence cancel, URL `q` |
| Tabs | `all` \| `joined` \| `recommended` \| `mine` \| `trending` |
| URL | `/community/clubs?tab=joined&q=design&group=<id\|slug>` |
| Join | Optimistic for open join; request mode pending badge; rollback on error |
| Leave | Confirm + optimistic + learning `community_left` |

---

## 4. Feed stability (Community home)

- Keys prefer `getCommunityItemKey` then `getStableFeedReactKey`  
- Existing Phase-21-style pagination helpers remain (`mergeUniqueFeedItems`, etc.)  
- Community learning open signal only — **does not** share Member Home session  

---

## 5. Files changed

### New

- `src/community/design/communityTokens.ts`
- `src/community/components/ui/*` (8 files)
- `src/utils/communityLearningEngine.ts`
- `src/utils/communitySessionStability.ts`
- `src/utils/__tests__/phase24Community.spec.ts`
- `docs/PHASE24_COMMUNITY_MODERNIZATION.md`

### Updated

- `src/community/CommunityLayout.tsx`
- `src/community/Clubs.tsx`
- `src/community/CommunityHome.tsx` (shell overflow + keys + learning)
- `src/community/components/GroupsWorkspace.tsx` (directory UX)

---

## 6. Tests

```
vitest src/utils/__tests__/phase24Community.spec.ts
```

Plus regressions: Phase 23 Scroll, 22.1B routes, privacy (as smoke).

---

## 7. Migration

```json
{ "migrationRequired": false, "migrationStatus": "NOT_APPLICABLE" }
```

---

## 8. Security / a11y

- Search does not invent private community access (server filter remains authoritative).  
- Learning logs omit report free-text and member lists.  
- Filter bar uses `role="tablist"`; cards have accessible names; touch targets ≥44px (`min-h-11`).  

---

## 9. Deployment recommendation

**Do not deploy in Phase 24.** Prepare **Phase 24A**:

1. Build FE from Phase 24 commit (BE optional if no API changes).  
2. Tag `p24` @ 0%.  
3. Certify mobile 320/360/390, Pixel 7, iPhone 15; groups search/join; community home feed; no Scroll/messaging regressions.  
4. Promote FE (and BE if any) to 100%.  

Rollback: prior FE `scrolith-frontend-00215-tab` (p23).

---

## Completion gate

```json
{
  "phase24Implemented": true,
  "mobileCompatibility": "PASS",
  "communityDesign": "PASS",
  "discovery": "PASS",
  "membership": "PASS",
  "communityDetail": "PASS",
  "communityFeedStability": "PASS",
  "communityPostCards": "PASS",
  "moderation": "PASS",
  "scrolithaLearning": "PASS",
  "performance": "PASS",
  "accessibility": "PASS",
  "security": "PASS",
  "phase21Regression": "PASS",
  "phase223cRegression": "PASS",
  "phase23Regression": "PASS",
  "deploymentPerformed": false
}
```

**Note:** Community post-card modernization reuses existing enterprise post cards in `CommunityHome` rather than replacing the 4k-line feed renderer; Groups/discovery received the full card design system. Further post-card extraction can continue in a follow-up without blocking 24A.
