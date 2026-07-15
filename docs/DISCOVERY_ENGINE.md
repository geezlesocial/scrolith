# Enterprise Discovery & Recommendation Engine

Phases **8.0–8.3**: unified, explainable, permission-aware discovery across Scrolith surfaces.

Additive only — does **not** replace `/api/reco`, `/api/discovery/v2/*`, or the feed orchestrator.

---

## Architecture

```
Client (rail / future surfaces)
    │
    ▼
/api/discovery-engine/recommend|feedback|rollout|metrics
    │
    ▼
Rollout gate (defaults OFF)
    │
    ▼
Privacy + interest profile + blocks
    │
    ▼
Candidate generators (parallel, bounded, independent failure)
    │
    ▼
Eligibility filter (domain rules)
    │
    ▼
Score stages (interest, relationship, behavioral, quality,
              freshness, trending, content, collaborative, …)
    │
    ▼
Diversity / exposure policy
    │
    ▼
Explain + page (HMAC cursor)
    │
    ▼
Viewer-scoped cache  +  optional Socket.IO invalidation
```

### Module map (`geezle-backend/src/services/discoveryEngine/`)

| Module | Responsibility |
|--------|----------------|
| `types` | Contracts (candidate, ranked item, request/response) |
| `rollout` | Safe-by-default env flags |
| `privacy` | Personalization / collab / explanation controls |
| `interest` | Runtime interest graph (no durable psych profile) |
| `relationship` | Follows + club membership features |
| `behavior` | Feedback quality gates (dwell, accidental click) |
| `collaborative` | Cohort co-engagement index (min cohort 5) |
| `trending` | Bounded velocity from feedback aggregates |
| `eligibility` | Domain eligibility (never rank ineligible) |
| `scoring` | Stage scores + combine |
| `diversity` | Caps, exploration, deterministic ties |
| `generators` | Entity coverage matrix |
| `pipeline` | Orchestration, cursor, cache key |
| `feedback` | Impression/feedback → existing reco logs |
| `cache` | Generation versioning, in-flight dedupe |
| `realtime` | Socket invalidation helpers |
| `observability` | Content-safe counters |
| `scrolithaAdapter` | Optional AI hints (no Phase 7 import) |
| `explain` | Safe user-facing reasons |
| `service` | Public exports |
| `versions` | Model / policy version markers |

Frontend:

| Path | Role |
|------|------|
| `src/services/discoveryEngine.ts` | API client |
| `src/components/discovery/DiscoveryRecommendationRail.tsx` | Fail-closed rail |

---

## Ranking pipeline

1. **Rollout** – surface disabled → empty items (not an error).  
2. **Cursor** – decode HMAC v2 cursor; reject tamper / model mismatch.  
3. **Cache** – key `resp:v:{viewerId}:{hash}` including model/policy/diversity versions, personalization, context.  
4. **In-flight dedupe** – concurrent identical cold requests share one build.  
5. **Context load** – interest, blocks, negatives, positives, relationship, collab index, trending.  
6. **Generators** – parallel with timeouts.  
7. **Eligibility** – domain + block/self/sold/expired.  
8. **Score** – multi-stage; graph relationship score takes max with basic helper.  
9. **Optional Scrolitha hints** – no-op unless adapter registered and flag on.  
10. **Diversity policy** – author/type/source/category/company caps.  
11. **Explain** – safe reason strings only.  
12. **Page** – opaque next cursor.

---

## Generators

Supported (bounded queries): posts, discussions, people, freelancers, jobs, services, communities, groups, companies/pages, marketplace listings/products, interest-matched posts, legacy people reco bridge.

**Unsupported (formal empty, no fake data):** event, course, project — platform models not discovery catalogs.

Coverage matrix: `getGeneratorCoverageMatrix()`.

---

## Cache

- In-process Map, max **2500** keys.  
- Each entry stores **generation**; bump rejects stale.  
- Response keys: `resp:v:{viewerId|anon}:{hash}`.  
- **Viewer invalidation** clears only that viewer’s `resp:v:{id}:` + interest/rel/privacy.  
- **Global invalidation** (no viewer) clears all `resp:` and bumps generation.  
- `getOrLoad` prevents thundering herd on cold cache.  
- Metrics: hits, misses, invalidations, staleRejects, inflight.

---

## Realtime invalidation

Uses existing Socket.IO (`app.get('io')` / `global.appIo`).

Events:

| Event | Meaning |
|-------|---------|
| `discovery:recommendations_invalidated` | Prefer soft rail refresh |
| `discovery:entity_unavailable` | Drop entity from open rails |
| `discovery:refresh_available` | Global soft signal |

Client: debounced refresh affordance (does not reorder mid-read); multi-tab via single `BroadcastChannel('scrolith-discovery')`.

---

## Rollout (defaults OFF)

| Env | Default |
|-----|---------|
| `DISCOVERY_ENGINE_MASTER` | false |
| `DISCOVERY_ENGINE_MEMBER_HOME` | false |
| `DISCOVERY_ENGINE_PAGE` | false |
| `DISCOVERY_ENGINE_SIDEBAR` | false |
| `DISCOVERY_ENGINE_JOBS` | false |
| `DISCOVERY_ENGINE_MARKETPLACE` | false |
| `DISCOVERY_ENGINE_COMMUNITIES` | false |
| `DISCOVERY_ENGINE_WHO_TO_FOLLOW` | false |
| `DISCOVERY_ENGINE_FEEDBACK` | true |
| `DISCOVERY_ENGINE_IMPRESSIONS` | true |
| `DISCOVERY_ENGINE_SCROLITHA` | false |
| `DISCOVERY_ENGINE_DIAGNOSTICS` | true |

Deploy alone does **not** activate user-facing recommendations.

---

## Explainability

`reasonCodes` → short user copy (e.g. shared community, skills match, trending).  
Private feature vectors never returned unless staff `debug` on response components.

---

## Observability

Counters only (requests, cache hits, feedback, invalidations).  
No prompts, recommendation bodies, or private user content.

Staff: `GET /api/discovery-engine/metrics`, `GET /api/discovery-engine/rollout`.

---

## Privacy model

- Personalization / interest / collab / behavioral flags (preference metadata when available).  
- Blocks enforced; self-recommendations excluded.  
- Negative feedback (hide / not interested / report) excludes entities.  
- Collaborative needs min cohort; no individual behavior disclosure.  
- Anonymous: non-personalized / empty when master off.

---

## Recommendation lifecycle

```
impression (visible) → optional click/save/follow/apply
                     → hide / not_interested
                     → viewer cache invalidation + socket (if available)
                     → next recommend build reflects preference
```

Feedback/impressions persist in existing `RecoFeedbackLog` / `RecoImpressionLog` (no new tables).

---

## API

| Method | Path | Auth |
|--------|------|------|
| GET/POST | `/api/discovery-engine/recommend` | optional |
| POST | `/api/discovery-engine/feedback` | required |
| GET | `/api/discovery-engine/rollout` | admin/mod |
| GET | `/api/discovery-engine/metrics` | admin/mod |

---

## Schema / infrastructure

Uses existing Prisma models only. **No migrations** in Phase 8.x.  
No Redis/vector/queue requirements for the foundation.

---

## Tests & bench

- Unit: `discoveryEngine.spec.ts`, `discoveryEngine.phase81.spec.ts`  
- Offline load bench (dev only): `discoveryEngine.loadBench.ts` under `__tests__` (excluded from `build:prod`)  
- Frontend contracts: `tests/unit/discovery-engine-contracts.test.ts`

---

## Scrolitha

`registerScrolithaDiscoveryAdapter` is optional. Phase 7 PRs are **not** imported or required.
