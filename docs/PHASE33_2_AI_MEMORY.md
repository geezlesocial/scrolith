# Phase 33.2 — AI Memory

## Fields

preferredTopics, preferredIndustries, mutedTopics, preferredLanguages, favoriteCommunities, mutedEntityIds, signalWeights

## User controls

View / edit / export / delete via `/api/ai/discovery/memory*` and `/discovery` → AI memory tab.

## Privacy

- No sensitive category storage (sanitizer)  
- Requires consent (`aiFeaturesEnabled`; personalization for signal weights)  
- No hidden profiling beyond disclosed preferences and explicit signals  
