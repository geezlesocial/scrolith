# Phase 33.0 — Compatibility Report (Inventory)

**Date:** 2026-07-22  
**Scope:** Existing AI systems in Scrolith monorepo before/after foundation layer.

## Deployment context (correction)

Production is **not** frozen at Phase 31 only. Phase 32.0–32.6 notification work was implemented and Phase 32.5 production deployment/certification was performed earlier on this branch. Phase 33.0 intentionally does **not** deploy or migrate production.

| Phase | Implementation | Production deployment |
|-------|----------------|----------------------|
| 31 | Complete | Yes |
| 32.0–32.4 | Complete | Yes (via 32.5) |
| 32.5–32.6 | Complete | Yes (ops cert) |
| 33.0 | This phase | **No** |

## Inventory findings

| System | Location | Classification |
|--------|----------|----------------|
| Scrolitha Ollama / Core runtime | `geezle-backend/src/services/scrolitha/scrolitha.ollama.ts` | **Reuse** — adapted via `scrolithaAi/providers/ollamaProvider.ts` |
| Provider orchestration | `scrolitha.providerOrchestration.ts` | **Adapt** — routing concepts mirrored; Phase 33 uses `scrolithaAi/router.ts` for foundation capabilities |
| Scrolitha inference service | `modules/scrolitha/inference/scrolitha.service.ts` | **Reuse** — existing product assistant path; not replaced |
| Prompt injection / policy | `scrolitha.policy.ts` | **Reuse** + **Adapt** — foundation adds `safety.ts` heuristics |
| Privacy controls (assistant memory) | `scrolitha.privacyControls.ts` | **Reuse** for assistant; foundation adds separate `AIConsent` for platform AI |
| OpenAI SDK usage | `scrolitha.ollama.ts`, packages | **Adapt** — only via `openaiProvider.ts` in foundation; no new feature-level SDK use |
| Gemini SDK usage | `scrolitha.ollama.ts`, packages | **Adapt** — only via `geminiProvider.ts` in foundation |
| Legacy `/api/ai/*` | `routes/ai.ts`, `controllers/aiController` | **Reuse** — preserved; foundation endpoints added additively |
| AICopilotLog | Prisma model | **Reuse** — legacy logging; foundation uses `AIRequest` / `AIAuditLog` |
| AiAutomationLog / LtvPrediction | Market intelligence | **Out of scope** — not part of foundation gateway |
| Resume / Insights Scrolitha callers | `resume.ai.service`, `insights.service` | **Deprecate later** (migrate to `ScrolithaAI.execute` in future phases) |
| Recommendation engine | `scrolitha.recommendationEngine.ts` | **Out of scope** for 33.0 |
| Embeddings / vector store | lexical embedding in service; no dedicated vector DB found | **Out of scope** — `SEMANTIC_SEARCH_PREPARATION` capability only |
| Feature flags | Scrolitha config + env | **Adapt** — `AIFeatureFlag` + env kill switch |
| Consent | privacyControls metadata | **Adapt** — new versioned `AIConsent` |
| Telemetry | scrolitha.observability / opsMetrics | **Adapt** — foundation `observability.ts` counters |

## Environment variables (existing + new)

| Variable | Role |
|----------|------|
| `SCROLITHA_OLLAMA_MODEL` / core host vars | Existing Ollama/Core |
| `GOOGLE_GEMINI_KEY` / `GEMINI_API_KEY` | Existing Gemini |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Existing OpenAI |
| `SCROLITHA_AI_ENABLE_PROVIDER_CALLS` | **New** — hard gate for real provider network |
| `SCROLITHA_AI_KILL_SWITCH` | **New** — emergency off |
| `SCROLITHA_AI_FORCE_NO_PROVIDER` | **New** — force mock |
| `SCROLITHA_AI_ALLOW_PROD_PROVIDER` | **New** — required for prod provider enable |
| Quota envs `SCROLITHA_AI_DAILY_REQUESTS` etc. | **New** |

## Do not duplicate

- Do not reimplement Ollama HTTP transport.
- Do not remove Scrolitha assistant product surface.
- Do not add second OpenAI clients in feature modules.

## Classification summary

- **Reuse:** Ollama transport, legacy `/api/ai`, Scrolitha assistant modules  
- **Adapt:** Routing, privacy/consent, safety, prompts for foundation capabilities  
- **Deprecate later:** Direct feature → `ScrolithaService.generate` paths (migrate gradually)  
- **Remove only after approval:** None in 33.0  
- **Out of scope:** Full ranking, autonomous tools, vector DB, billing
