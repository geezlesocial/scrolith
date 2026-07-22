# Phase 33.1 — AI Translation

## Capability

`TEXT_TRANSLATION` via `ScrolithaAI.execute()`.

## Requirements

- Heuristic source language detection (no external call required)  
- Preserve `@mentions`, URLs, `#hashtags` via post-pass `preserveTokens`  
- Unicode-safe  
- Target locale via `locale` / `targetLocale`  

## API

```json
POST /api/ai/assistant/translate
{ "text": "...", "targetLocale": "es", "sourceLocale": "en" }
```
