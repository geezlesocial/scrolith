# Scrolitha AI Operations Guide

**Phase 7.6 — Enterprise operations, reliability, and production readiness**

This document describes operational controls for Scrolitha without requiring code deploys to toggle capabilities.

---

## 1. Architecture (summary)

Scrolitha is layered:

1. **Identity & safety** — platform user, policy, prompt injection defenses  
2. **Contextual replies** — `@Scrolitha` comment pipeline (DB-deduped)  
3. **Intelligence network** — skills, workflows, confidence, explainability  
4. **Intelligence OS** — global surface, fusion, action cards, recommendations  
5. **Distributed contracts** — pluggable session/cache/search/stream adapters  
6. **Operations** — rollout flags, health, metrics, diagnostics, governance  

Core platform paths (messaging, posts, comments, feeds, notifications, communities, moderation, jobs, services) do **not** depend on Scrolitha being enabled.

---

## 2. Module responsibilities

| Module | Responsibility |
|--------|----------------|
| `scrolitha.rollout` | Independent feature flags |
| `scrolitha.health` | Operational health model |
| `scrolitha.opsMetrics` | Latency/counters (no content) |
| `scrolitha.diagnostics` | Admin aggregate diagnostics |
| `scrolitha.failureModes` | Degradation helpers |
| `scrolitha.contextualPost` | Mention → AI reply |
| `scrolitha.intelligence` / `workflow` / `skills` | Multi-skill answers |
| `scrolitha.os` | Bootstrap/ask for global UI |
| `scrolitha.sessionStore` | Session adapter (in-process default) |
| `scrolitha.enterpriseCache` | Namespaced cache + invalidation |
| `scrolitha.searchProvider` | Lexical/semantic abstraction |
| `scrolitha.streaming` | Stream/chunk abstraction |
| `scrolitha.providerOrchestration` | Route/retry/fallback |
| `scrolitha.eventContracts` | Idempotent event processing |
| `scrolitha.governance` | Safe metadata trail |

---

## 3. Feature rollout framework

### Flags

| Capability | Config key | Env override |
|------------|------------|--------------|
| Master | `metadata.rollout.master` | `SCROLITHA_ROLLOUT_MASTER` |
| Contextual intelligence | `contextualIntelligence` | `SCROLITHA_ROLLOUT_CONTEXTUAL` |
| AI replies | `aiReplies` | `SCROLITHA_ROLLOUT_AI_REPLIES` |
| Proactive suggestions | `proactiveSuggestions` | `SCROLITHA_ROLLOUT_PROACTIVE` |
| Action cards | `actionCards` | `SCROLITHA_ROLLOUT_ACTION_CARDS` |
| Deep search | `deepSearch` | `SCROLITHA_ROLLOUT_DEEP_SEARCH` |
| Recommendations | `recommendationEngine` | `SCROLITHA_ROLLOUT_RECOMMENDATIONS` |
| OS surface | `osSurface` | `SCROLITHA_ROLLOUT_OS_SURFACE` |
| Diagnostics | `diagnostics` | `SCROLITHA_ROLLOUT_DIAGNOSTICS` |
| Moderation assist | `moderationAssist` | `SCROLITHA_ROLLOUT_MODERATION` |
| Intelligence ask | `intelligenceAsk` | `SCROLITHA_ROLLOUT_INTELLIGENCE` |
| Event intelligence | `eventIntelligence` | `SCROLITHA_ROLLOUT_EVENTS` |
| Governance | `governance` | `SCROLITHA_ROLLOUT_GOVERNANCE` |
| Streaming | `streaming` | `SCROLITHA_ROLLOUT_STREAMING` |

### Precedence

1. Environment variables  
2. `ScrolithaConfig.metadata.rollout` / `featureFlags`  
3. Defaults (user-facing OFF; diagnostics ON for staff endpoints)

### Safe defaults

- Code defaults: **master and all user-facing capabilities = OFF**
- `diagnostics` defaults **ON** (admin/moderator endpoints only)
- Enable only via env or `metadata.rollout` / contextual config — deploy alone does not activate AI

### Kill switch

- `SCROLITHA_ROLLOUT_MASTER=false` **or** `ScrolithaConfig.enabled=false`  
- Disables user-facing AI; platform remains fully operational.

### Rollback without redeploy

Disable individual flags via env or admin Scrolitha config metadata. No migration required.

---

## 4. Configuration examples

```json
{
  "rollout": {
    "master": true,
    "osSurface": true,
    "aiReplies": true,
    "deepSearch": false,
    "proactiveSuggestions": true,
    "diagnostics": true
  }
}
```

```bash
# Emergency off
SCROLITHA_ROLLOUT_MASTER=false

# Soft launch: replies only, no OS chrome
SCROLITHA_ROLLOUT_OS_SURFACE=false
SCROLITHA_ROLLOUT_AI_REPLIES=true
```

---

## 5. Health model

Components:

- master_rollout  
- provider  
- cache  
- session_adapter  
- search_provider  
- streaming_provider  
- workflow  
- event_processing  

Statuses: `healthy | degraded | unhealthy | disabled`

Overall `disabled` means AI off — **not** platform down.

API: included in diagnostics / network-status.

---

## 6. Metrics model

Counters (no content):

- requests, successes, failures, cancellations, retries  
- cache hits/misses  
- provider primary vs fallback  
- action card uses, recommendations served, proactive shown  
- search / OS bootstrap / OS ask / AI replies  
- timeouts, duplicate suppressions  

Latency: p50 / p95 / p99 from bounded sample window.

---

## 7. Diagnostics (admin / moderator)

- `GET /api/scrolitha/intelligence/diagnostics`  
- `GET /api/scrolitha/intelligence/network-status`  
- `GET /api/scrolitha/intelligence/analytics`  
- `GET /api/scrolitha/intelligence/health` (ops health summary)  
- `GET /api/scrolitha/intelligence/rollout` (flag summary)

Never includes raw prompts or private message bodies.

---

## 8. Failure handling

See runtime matrix in `scrolitha.health.FAILURE_MODE_MATRIX`.

Principle: **degrade AI, never break core social platform.**

---

## 9. Extension points (future)

| Concern | How to extend |
|---------|----------------|
| Distributed sessions | Implement `DistributedSessionStore`, `setSessionStoreAdapter` |
| Distributed cache | Implement `DistributedCacheAdapter`, `setCacheAdapter` |
| Semantic search | Register provider with `registerSearchProvider`, set ready=true when index exists |
| Token streaming | Register `LlmStreamProvider` with `supportsTokenStreaming=true` |
| New skills | `registerSkill` in skills module |
| New modules | `registerModuleCapability` in collaboration |

---

## 10. Rollout strategy (recommended)

1. **Shadow** — master on, OS off, replies on for limited traffic  
2. **OS internal** — enable OS surface for staff  
3. **Proactive soft** — suggestions + action cards  
4. **Search/recs** — enable deep search after monitoring latency  
5. **Full** — all flags on; watch p95 and fallback rate  

Rollback at any step via flags only.

---

## 11. Security notes

- Diagnostics require admin/moderator  
- Prompt injection blocked by policy layer  
- AI replies cannot escalate privileges  
- Moderation assist never auto-removes content  
- Search is public-data only  

---

## 12. Related code

- Backend: `geezle-backend/src/services/scrolitha/*`  
- Frontend OS: `geezle/src/components/scrolitha/ScrolithaOsSurface.tsx`  
- Feature entry: `/api/scrolitha/*`
