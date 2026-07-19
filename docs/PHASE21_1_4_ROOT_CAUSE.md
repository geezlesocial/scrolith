# Phase 21.1.4 — Reproduction

Video symptom: author/post cards morph in place while scroll stays roughly fixed.

Code path:

1. Socket `community:post_updated` / online / soft `loadFeed()`.
2. Orchestrator first page returned with new ranking order.
3. `mergeUniqueFeedItems(newPage, oldSession)` → new page becomes indices 0..n.
4. React re-renders progressive window at same scroll offset with different IDs.
