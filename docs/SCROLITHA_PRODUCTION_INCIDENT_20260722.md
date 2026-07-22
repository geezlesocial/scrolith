# Scrolitha Production Incident 2026-07-22

Status: hotfix implementation complete; production certification remains gated on an approved authenticated smoke identity.

The Phase 33.3 rollout left provider calls disabled with `SCROLITHA_AI_ENABLE_PROVIDER_CALLS=false` and `SCROLITHA_AI_FORCE_NO_PROVIDER=1`. Copilot was also still native-first and returned generic blocked responses. The mobile event `push_token_project_reset` was present in the frontend contract but absent from the backend allowlist, producing `400 Unsupported app tracking event`.

The hotfix keeps authentication, beta allowlisting, consent, and deterministic native skills intact. User-facing Copilot generation is routed through `ScrolithaAI.execute()` to Ollama `qwen3:14b`; external providers and MOCK are rejected in production.

Evidence captured before changes: `docs/evidence/phase333_scrolitha_incident_before.json`.
