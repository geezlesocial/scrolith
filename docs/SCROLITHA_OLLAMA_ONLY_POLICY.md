# Scrolitha Ollama-Only Policy

Production generative execution is restricted to:

- Provider: `OLLAMA`
- Model: `qwen3:14b`
- External providers: disabled
- MOCK responses: disabled for production user requests

Native code may perform deterministic intent detection, skill planning, validation, orchestration, safety, and parsing. User-facing generation must pass through `ScrolithaAI.execute()` with the Ollama-only policy. A provider other than Ollama is rejected with `PRODUCTION_PROVIDER_NOT_ALLOWED`; unavailable Ollama returns a controlled failure.
