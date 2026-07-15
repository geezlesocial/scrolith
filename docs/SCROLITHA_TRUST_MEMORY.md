# Scrolitha Trust, Memory, Personalization & Knowledge Platform

**Phase 7.7 — Enterprise AI companion architecture**

This document describes memory, personalization, trust/verification, knowledge graph expansion, learning loop, explainability, privacy controls, freshness, and safety mitigations.

It extends — and does not replace — existing Scrolitha modules (intelligence, OS, contextual posts, ops).

---

## 1. Memory architecture

### Layers

| Layer | Store | Default retention | Notes |
|-------|--------|-------------------|-------|
| `session` | SessionStore (in-process / pluggable) | 30 minutes | Short-term turns only |
| `conversation` | `ScrolithaConversation.summary` + metadata | 12 hours open window | Summaries, not full transcripts in prompts |
| `userPreference` | `ScrolithaUserPreference` | ~180 days | Tone, troubleshooting, interest facts |
| `professionalProfile` | Derived from User.profile (read) | ~365 days | Title, skills, location |
| `organization` | Preference metadata (opt-in) | ~90 days | Requires `shareOrgMemory` |
| `community` | Preference metadata | ~60 days | Community-related facts |
| `project` | Preference metadata | ~120 days | Project facts |
| `relationship` | Preference metadata | ~90 days | Relationship hints |

All durable layers live in **existing** `ScrolithaUserPreference.metadata` / conversation rows — **no schema migration**.

### Retention policies

Configurable via `metadata.memoryRetention` overrides (per layer: `maxAgeMs`, `maxEntries`, `allowPersonalization`).

Expired entries are pruned on read/write.

### APIs

- `GET /api/scrolitha/memory` — safe summary (counts + non-sensitive facts)
- `POST /api/scrolitha/memory/clear` — clear layer or all durable memory

### Rollout

- `SCROLITHA_ROLLOUT_MEMORY` / `metadata.rollout.persistentMemory`

---

## 2. Personalization model

Personalization adapts:

- Recommendations (rank + filter)
- Proactive suggestions
- Learning suggestions
- Writing assistance hints
- Explanation tone (concise vs detailed)

**Inputs:** layered memory, topic affinity (learning loop), privacy controls, knowledge freshness boosts.

**Hard rules:**

- Never use private messages or hidden moderation data
- Recommendation category toggles always apply
- Proactive off → empty proactive list
- `aiVisibility: hidden` → suppress OS chrome suggestions/cards

Module: `scrolitha.personalization.ts`  
Wired into: `scrolitha.recommendationEngine`, `scrolitha.os` bootstrap

Rollout: `SCROLITHA_ROLLOUT_PERSONALIZATION`

---

## 3. Trust model & verification engine

### Verdicts

| Verdict | Meaning |
|---------|---------|
| `verified` | Strong authoritative platform evidence |
| `likely` | Supported but not definitive |
| `uncertain` | Partial / weak evidence |
| `insufficient_evidence` | No reliable support |
| `conflicting` | Support vs counter both strong |
| `outdated` | Support exists but knowledge is stale |

### Pipeline

1. Collect evidence items (label, authority, supports claim/counter/context)
2. Rank by authority
3. Detect conflicts
4. Apply freshness
5. Map to verdict + confidence band
6. Build user-safe package (citations + hedge)

Modules: `scrolitha.trust.ts`, `scrolitha.confidence.ts`, `scrolitha.knowledgeFreshness.ts`

API: `POST /api/scrolitha/trust/assess`  
Intelligence ask attaches optional `trust` package when `trustVerification` enabled.

---

## 4. Knowledge graph

Existing post-centric graph (`buildPostPlatformGraph`) plus:

- **`buildUserPlatformGraph`** — user → skills, services, jobs, posts, communities, companies

Relationships used for recommendations and ranked context (permission-safe public fields only).

Node types: user, company, job, gig/service, community, post, comment, skill, organization, page, event.

---

## 5. Learning loop

Signals:

- accepted_suggestion  
- dismissed_suggestion  
- rewritten_answer  
- successful_recommendation  
- abandoned_interaction  
- positive/negative feedback  
- used_action_card  

Storage:

- Per-user ring buffer in preference metadata (`learningSignals`, max 40)
- Topic affinity counters
- **Global aggregates only by signal type** (no user ids, no content)

API:

- `POST /api/scrolitha/learning/signal`
- `GET /api/scrolitha/learning/snapshot` (admin/moderator)

Rollout: `SCROLITHA_ROLLOUT_LEARNING`

---

## 6. Explainability model

### Internal (`InternalExplanationModel`)

- reasoningPath  
- evidenceUsed  
- confidence  
- skillsInvoked  
- workflowUsed  
- assumptions  
- trustVerdict  
- userSafe  

### User-facing (`ExplanationBlock`)

Summary, basis, skills, confidence, caveats, optional trust label. **Never** raw prompts or private data.

Module: `scrolitha.explainability.ts`

---

## 7. Privacy controls

User (`GET/PUT /api/scrolitha/privacy`):

| Control | Default |
|---------|---------|
| memoryEnabled | true |
| personalizationEnabled | true |
| proactiveSuggestionsEnabled | true |
| aiVisibility | full \| subtle \| hidden |
| shareOrgMemory | false |
| recommendationCategories.* | all true |
| allowLearningLoop | true |

Org defaults: `ScrolithaConfig.metadata.privacyDefaults`  
Enforce options: `enforceMemoryOff`, `enforceProactiveOff`

---

## 8. Knowledge freshness

Bands: fresh (24h) → recent (7d) → aging (30d) → stale (90d+)

- Stale knowledge can force `outdated` trust verdict  
- Freshness boost adjusts recommendation scores  

---

## 9. Safety (summary)

See `scrolitha.safetyReview.ts` matrix for:

- Hallucination  
- Prompt injection  
- Misinformation  
- Abusive prompts  
- Recommendation manipulation  
- Privacy leakage  

Principle: **prefer insufficient evidence over fabricated certainty; degrade AI rather than leak private data.**

---

## 10. Extension points

| Concern | Extension |
|---------|-----------|
| Distributed durable memory | Swap preference store or add Redis-backed memory adapter later (keep API) |
| New memory layers | Add to `MemoryLayerKind` + retention defaults |
| New trust evidence sources | Pass additional `EvidenceItem`s into `assessTrust` |
| Graph anchors | Add `build*PlatformGraph` builders similar to post/user |
| Org policy packs | Expand `privacyDefaults` on config metadata |
| UI controls | Bind privacy/memory endpoints in settings (frontend optional) |

---

## 11. Operational guidance

1. Ship with personalization + memory on for internal users first  
2. Monitor learning aggregates (accept vs dismiss rates)  
3. If privacy incident risk: `enforceMemoryOff` + `SCROLITHA_ROLLOUT_MEMORY=false`  
4. Trust issues: `SCROLITHA_ROLLOUT_TRUST=false` (falls back to prior confidence-only path)  
5. Core platform (messaging, posts, feeds, …) remains independent of these flags  

---

## 12. Related modules

| File | Role |
|------|------|
| `scrolitha.memoryLayers.ts` | Layered memory |
| `scrolitha.privacyControls.ts` | Privacy + categories |
| `scrolitha.personalization.ts` | Personalization engine |
| `scrolitha.trust.ts` | Verification engine |
| `scrolitha.knowledgeFreshness.ts` | Freshness |
| `scrolitha.learningLoop.ts` | Feedback signals |
| `scrolitha.explainability.ts` | Explainability |
| `scrolitha.platformGraph.ts` | Graph (incl. user graph) |
| `scrolitha.safetyReview.ts` | Safety matrix |
| `scrolitha.sessionMemory.ts` | Session layer |
| `scrolitha.learning.ts` | Existing interaction learning |
| `scrolitha.memory.ts` | Conversation persistence |

Also see: `docs/SCROLITHA_OPERATIONS.md` (Phase 7.6 ops).
