# Phase 33.0 — Scrolitha AI Platform Foundation

## Objective

Create one **canonical AI platform** so Scrolith modules do not independently integrate AI providers.

```
Scrolith Feature
  → ScrolithaAI.execute()
  → Capability Authorization
  → Consent and Privacy Classification
  → Redaction
  → Safety Pre-check
  → Prompt Registry
  → Model Router
  → Provider Adapter (OLLAMA | GEMINI | OPENAI | MOCK)
  → Output Validation
  → Safety Post-check
  → Audit / Usage / Metrics
  → Calling Feature
```

## Hard rules (this phase)

- Additive only  
- **No production deployment**  
- **No production migration applied**  
- **No production AI provider calls**  
- No autonomous actions (messages, payments, bans, job applications)  
- Feature flags default **off**  
- `enableProviderCalls` default **false**

## Package layout

`geezle-backend/src/services/scrolithaAi/`

| Module | Responsibility |
|--------|----------------|
| `execute.ts` | `ScrolithaAI.execute()` facade |
| `types.ts` | Contracts |
| `providers/*` | Provider adapters |
| `router.ts` | Deterministic routing |
| `privacy.ts` | Classification + redaction |
| `consent.ts` | Versioned consent |
| `safety.ts` | Pre/post safety + injection wrap |
| `promptRegistry.ts` | Versioned prompts |
| `structured.ts` | Schema-validated outputs |
| `usage.ts` | Quotas / cost estimates |
| `cache.ts` | Privacy-safe cache |
| `reliability.ts` | Circuit breaker / timeout |
| `observability.ts` | Metrics |
| `audit.ts` | Audit / history |
| `notificationHooks.ts` | Phase 32 hooks (flags off) |
| `config.ts` | Flags + provider config |

## Capabilities (foundation only)

- TEXT_SUMMARIZATION  
- TEXT_REWRITING  
- TEXT_CLASSIFICATION  
- STRUCTURED_EXTRACTION  
- NOTIFICATION_SUMMARIZATION  
- NOTIFICATION_PRIORITIZATION  
- CONTENT_SAFETY_ANALYSIS  
- SEMANTIC_SEARCH_PREPARATION  

## UI

- User: `/settings/ai`  
- Admin: Dashboard → **Scrolitha AI** (`?tab=scrolitha-ai`)

## Next phase

**Do not start Phase 33.1** until explicit approval (assistant + user productivity features).
