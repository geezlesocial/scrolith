# Phase 33.3 — Scrolitha Core Intelligence Architecture

## Priority routing

```
NATIVE (Scrolitha local intelligence)
  → OLLAMA (local/core models)
  → GEMINI (optional, consent)
  → OPENAI (optional, consent)
  → MOCK (tests / last resort)
```

External providers are **augmentation**, not primary.  
Production: network providers stay disabled via env; NATIVE still works offline.

## Entry points

- `ScrolithaAI.execute()` — sole model gateway  
- `runCopilot()` — platform contextual copilot  
- Skills registry — modular domain assistance  
- `invokePlatformTools()` — internal tools only  

## No autonomous actions

Copilot / skills return drafts and hints with `requiresUserAction: true` and `autonomous: false`.
