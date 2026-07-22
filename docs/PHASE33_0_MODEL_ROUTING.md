# Phase 33.0 — Model Routing

## Inputs

Capability, privacy level, external consent, structured flag, context size, locale, max tokens, timeout, provider health map.

## Decision shape

```json
{
  "provider": "OLLAMA",
  "model": "qwen3:14b",
  "reason": "privacy_internal_only",
  "fallbackChain": [],
  "maximumTokens": 1024,
  "timeoutMs": 30000
}
```

## Precedence

1. **PROHIBITED** → DISABLED (caller blocks before call)  
2. **HIGHLY_SENSITIVE** or sensitive without external consent → OLLAMA only (then MOCK)  
3. Else prefer OLLAMA → GEMINI → OPENAI when external consent + health allow  
4. Empty healthy chain → MOCK  
5. Circuit open on a provider → skip to next in chain  

## Testability

`routeModel()` is pure and unit-tested in `scrolithaAi.foundation.spec.ts`.
