# Scrolitha Production Incident - 2026-07-22

## Status

Resolved after authenticated Ollama-only certification, staged backend rollout, and 30-minute monitoring.

| Item | Value |
|---|---|
| Backend production | `scrolith-backend-p3334-ollama4` at 100% |
| Frontend production | `scrolith-frontend-p3334-ollama` at 100% |
| Backend image | `sha256:67e1e1200fda325452abd9338d66d9a29d05186a94121969f65202e51d4fcc1b` |
| Rollback backend | `scrolith-backend-p3334-ollama2` |
| Rollback frontend | `scrolith-frontend-00299-zah` |
| Phase 33.4 | Not started |

## Root Cause

1. Production provider calls were disabled by `SCROLITHA_AI_ENABLE_PROVIDER_CALLS=false` and `SCROLITHA_AI_FORCE_NO_PROVIDER=1`, while persisted AI feature defaults were off.
2. Generation could use native or MOCK paths without an explicit production Ollama requirement.
3. Frontend emitted `push_token_project_reset`, which was missing from the backend event allowlist.

## Fixes

- Production generation is restricted to `ScrolithaAI.execute()` -> OLLAMA -> `qwen3:14b`.
- Gemini, OpenAI, external providers, and production MOCK responses are disabled.
- Transport disclosure now normalizes `scrolitha-core` to `qwen3:14b`.
- Copilot and Scrolitha runtime timeout is 120 seconds for qwen3:14b thinking latency.
- `push_token_project_reset` is accepted and malformed events return one controlled 400.
- Auth, RBAC, beta allowlist, consent, privacy, and safety controls remain active.

## Certification

- Authenticated status: 200; beta allowed; consent valid.
- Required prompts: all six returned 200 from OLLAMA / `qwen3:14b`.
- Jobs routing selected `JobSkill` for `Find jobs for me`.
- Valid tracking: 200. Malformed tracking: 400. No retry flood.
- External provider calls: 0. Production MOCK responses: 0.
- Backend and AI health: 200.
- Monitoring: over 30 minutes; zero P2024 and zero provider-timeout entries.

## Android

- Version `1.1.37`, versionCode `47`.
- Artifact: `mobile/release-artifacts/android-1.1.37/app-release.aab`.
- SHA-256: `89c5a3d73cf38b83b0e27d920b83ca48d9035188bfb4b6ad39840a38682756d5`.
- Signed and not uploaded to Google Play.
