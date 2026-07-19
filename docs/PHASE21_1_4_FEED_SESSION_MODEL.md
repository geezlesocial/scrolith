# Phase 21.1.4 — Feed Session Model

`feedSessionStability.ts` v21.1.4:

- `isolateSoftRefreshPage` / `isolateStreamSoftRefresh`
- `applyPendingNewItems` / `applyPendingStreamEntries`
- `mergeAppendOnly`
- `assertStableRelativeOrder` / `detectDestructiveReplacement`

Session order is immutable until explicit hard reset (tab change) or user applies pending new posts.
