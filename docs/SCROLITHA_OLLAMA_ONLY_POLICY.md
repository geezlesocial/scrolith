# Scrolitha Ollama-Only Policy

## Production Rule

| Control | Value |
|---|---|
| Provider | `OLLAMA` only |
| Model | `qwen3:14b` |
| Gateway | `ScrolithaAI.execute()` |
| External providers | Disabled |
| MOCK | Prohibited for production user responses |
| Managed backup provider | Disabled |
| Runtime timeout | 120 seconds |

Required path:

`deterministic policy/context processing -> ScrolithaAI.execute() -> OLLAMA -> qwen3:14b`

Native processing may classify, route, extract, rank, validate, and orchestrate. It cannot masquerade as a generated Ollama response.

The production invariant rejects non-OLLAMA generation with `PRODUCTION_PROVIDER_NOT_ALLOWED`. `requireOllama` creates an empty fallback chain, and production `isProviderEnabled` only permits OLLAMA.

## Environment

- `SCROLITHA_AI_ALLOWED_PROVIDERS=OLLAMA`
- `SCROLITHA_AI_DEFAULT_PROVIDER=OLLAMA`
- `SCROLITHA_AI_DEFAULT_MODEL=qwen3:14b`
- `SCROLITHA_CORE_MODEL=qwen3:14b`
- `SCROLITHA_TIMEOUT_MS=120000`
- `SCROLITHA_AI_EXTERNAL_PROVIDERS_ENABLED=false`
- `SCROLITHA_AI_GEMINI_ENABLED=false`
- `SCROLITHA_AI_OPENAI_ENABLED=false`
- `SCROLITHA_AI_MOCK_ENABLED=false`
- `SCROLITHA_AI_FORCE_NO_EXTERNAL_PROVIDER=1`

Transport previously reported the alias `scrolitha-core`; the adapter now reports the configured model `qwen3:14b`. Core `/api/tags` also confirms the exact model.

## Test

`geezle-backend/src/services/scrolithaAi/__tests__/phase3334.policy.test.ts` - PASS.
