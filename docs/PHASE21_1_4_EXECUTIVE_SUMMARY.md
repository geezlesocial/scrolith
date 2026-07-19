# Phase 21.1.4 — Executive Summary

**Status:** Root cause fixed · Implementation complete · Staged FE deploy  
**Date:** 2026-07-19

## Root cause (confirmed)

Member Home **soft refresh** (socket / online / background `loadFeed`) used:

```ts
mergeUniqueFeedItems(normalizedFirstPage, existingSession)
```

Because merge walks `existing` first, this **placed the re-ranked first page at the top** and shifted prior session items down. Visible cards at a fixed scroll position **changed identity** without user action.

Secondary causes:

- Mobile soft_refresh re-`sortPosts` over the full session after merge.
- Community re-init **replaced** `posts` with a new first page; load-more re-sorted the entire list.

## Fix

- Soft refresh isolates new IDs into a **pending buffer** + **Show new posts** banner (Member Home).
- `useContinuousFeed` soft refresh no longer prepends into the live stream.
- Pagination remains **append-only**; no full-session re-sort after append.
- Community soft re-init merges append-only when a session exists.

Continuous recommendations continue via pagination/prefetch; they no longer displace content being read.
