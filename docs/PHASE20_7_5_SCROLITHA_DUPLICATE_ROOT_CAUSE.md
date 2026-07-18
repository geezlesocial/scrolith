# Phase 20.7.5 — Scrolitha Duplicate Conversation Root Cause

## Baseline

- BE `scrolith-backend-00128-guz` (p2074)  
- FE `scrolith-frontend-00157-nij` (p2075)

## Root causes

1. **Ensure create race** — concurrent `ensure` calls could both observe “no match” and insert two DIRECT rows for the same user↔Scrolitha pair (no transaction re-check / lock).

2. **No automatic consolidation** — when duplicates already existed, ensure preferred one row but left others visible in inbox queries.

3. **Lookup was improved but not consolidating** — participant-order matching existed, but multiple exact matches were not merged.

4. **Frontend** — `mergeDirectConversations` collapses same participant-pair keys, but transient flag/identity mismatches could still show multiple Scrolitha rows.

## Fix

- Find *all* exact Scrolitha DMs; consolidate (move messages, soft-archive losers).  
- Create inside `$transaction` with re-check.  
- Post-create re-consolidate if race produced extras.  
- FE defensive bucket `direct:scrolitha-canonical`.
