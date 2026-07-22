# Phase 33.2 — AI Memory Model

## Stored (disclosed)

- preferredTopics  
- preferredIndustries  
- mutedTopics  
- preferredLanguages  
- favoriteCommunities  
- mutedEntityIds  
- signalWeights (from explicit feedback / learning signals)  

## Not stored

- Sensitive attributes (health, religion, race, etc.)  
- Hidden profiles  
- Full private message contents  

## User rights

View, edit, export, delete via `/api/ai/discovery/memory*`.

Forbidden topic sanitization rejects sensitive category labels.
