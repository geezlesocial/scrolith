# Phase 21.1.4 — Append-Only Merge

`mergeUniqueFeedItems(existing, incoming)` and `mergeStreamEntries(existing, incoming)` only append unseen IDs. Soft refresh must not invert arguments.
