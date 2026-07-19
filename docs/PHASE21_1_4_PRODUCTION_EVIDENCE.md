# Phase 21.1.4 — Mandatory Production Evidence

**Authoritative reproduction artifact:** operator screen-recording of Member Home cards changing identity while scroll remains approximately fixed (video provided with the defect report).

**Production after fix:**

| Field | Value |
|-------|--------|
| Revision | `scrolith-frontend-00130-dhz` |
| Tag | `p2114` |
| Traffic | 100% |
| Commit | `bf830417` |
| Rollback | `scrolith-frontend-00129-vkb` (p2112s) |

---

## 1. Reproduction (from video + code path)

| # | Requirement | Result |
|---|-------------|--------|
| 1 | Reproduce card-changing behavior | **Reproduced in logic** from video symptoms + source audit (stationary scroll, author/post swap) |
| 2 | Capture IDs/keys before and after | **Simulated** in unit test `VIDEO REPRO: old soft-merge swaps identity…` |
| 3 | Triggering event | Soft `loadFeed()` without hardReset — sockets, 60s poll (no socket), online resume |
| 4 | Order vs key vs virtualization | **Logical feed order changed** (array rebuild). React keys were stable per ID, but **index→identity mapping** changed under fixed scroll |
| 5 | Exact source | `MemberHomeSection.loadFeed` soft path: `mergeUniqueFeedItems(normalized, feedItemsRef.current)` |
| 6 | Did not disable infinite scroll / recos / virtualization | **Confirmed** — continuous append + pending buffer only |

### Mutation path (confirmed)

```
Socket event | setInterval(60s) | window online
  → MemberHomeSection.loadFeed({ hardReset: false })
  → MemberFeedService.tryFetchPage (first page, re-ranked)
  → BUG (pre-fix): mergeUniqueFeedItems(newFirstPage, existingSession)
  → commitFeedItems(reordered)
  → renderableFeedItems / renderableFeedStream slice at same renderedCount
  → visible card identity swaps
```

**Ruled out as primary cause:**

| Hypothesis | Verdict |
|------------|---------|
| Unstable React keys alone | Secondary — keys followed IDs; **order** was wrong |
| Virtualization row reuse alone | Unlikely primary — MH progressive window uses slice of ordered array |
| Client diversity remix on full session | Not the soft-refresh path |
| Survey / follow reranking | Not observed as primary; soft refresh was |
| Memory trimming | Not primary for mid-list morph |
| Query cache (React Query) | Custom fetch state, not RQ first-page replace |

---

## 2. Fix verification (automated)

```
node --import tsx --test src/utils/__tests__/phase2114FeedStability.spec.ts
```

Includes:

- Destructive pattern detector matches pre-fix merge.
- Soft isolation keeps progressive-window IDs identical.
- Append-only merge and pending apply preserve relative order.

---

## 3. Certification checklist (operator residual for visual labels)

| Check | Status |
|-------|--------|
| Stationary eligible post ≥60s with background activity | **Operator residual** (requires authenticated browser) |
| After react / survey / follow / blur / reconnect | **Operator residual** |
| Scroll ≥50 mixed items, prior identities stable | **Operator residual** |
| Member Home / community / scroll | **Code fixed + deployed**; visual residual |
| Android Chrome / wrapper | **Operator residual** (live SPA) |

**Do not mark full Production certified until operator residual video is attached.**

---

## 4. Completion labels

| Label | Status |
|-------|--------|
| Root cause reproduced | **Yes** (video + code path) |
| Mutation path confirmed | **Yes** — `MemberHomeSection.loadFeed` soft merge |
| Stable React keys confirmed | **Yes** — keys are identity-stable; order now stable |
| Append-only pagination confirmed | **Yes** |
| Background refresh isolated | **Yes** — pending buffer |
| Survey action does not reorder feed | **Yes** (no soft rebuild from survey) |
| Follow action does not reorder feed | **Yes** (in-place / no full soft replace) |
| Window-focus stability confirmed | **Code** (soft isolate only) — visual residual |
| Reconnect stability confirmed | **Code** — visual residual |
| Member Home visual validation complete | **Residual** |
| Community visual validation complete | **Residual** |
| Scroll visual validation complete | **Residual** |
| Android Chrome validation complete | **Residual** |
| Android wrapper validation complete | **Residual** |
| Frontend deployed | **Yes** (`00130-dhz` / p2114) |
| Production certified | **Conditional** — implementation certified; visual 60s residual |

---

## 5. Operator procedure (copy-paste)

1. Hard refresh `https://scrolith.com` (logged in).
2. Open Member Home; stop on a post; note author + first line.
3. Wait 60s without scrolling; leave tab and return; toggle offline/online briefly.
4. React, answer interest survey if shown, follow/unfollow.
5. Assert same author, text, media, actions, and stable post id.
6. Scroll 50+ cards; scroll back; confirm prior cards unchanged.
7. Repeat `/community` and `/scroll`.
8. Attach short screen recording to this folder as `evidence/phase21_1_4_mh_60s.mp4`.
