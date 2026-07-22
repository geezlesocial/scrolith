# Phase 33.1 — Scrolitha AI Assistant & User Productivity Foundation

## Architecture

```
User UI (/assistant, AIComposerAssist)
  → /api/ai/assistant/*
  → ScrolithaAssistant (surface flags + consent)
  → ScrolithaAI.execute()  // Phase 33.0 gateway only
  → MOCK (default) | OLLAMA | GEMINI | OPENAI
```

All generation uses `ScrolithaAI.execute()`. No direct provider SDKs outside the gateway.

## Capabilities (new)

| Capability | Surface |
|------------|---------|
| ASSISTANT_CHAT | Chat / Q&A |
| TEXT_TRANSLATION | Translation |
| DRAFT_COMPOSITION | Draft posts, jobs, listings, etc. |
| COMPOSER_ASSIST | In-composer improve/expand/… |
| SEARCH_QUERY_SUGGESTION | Search suggestions only |

## Feature flags (default OFF)

`assistantEnabled`, `composerEnabled`, `rewriteEnabled`, `translationEnabled`, `promptLibraryEnabled`, `conversationHistoryEnabled`, `feedbackEnabled`, `searchSuggestionsEnabled`, `jobsDraftingEnabled`, `marketplaceDraftingEnabled`, `businessPageDraftingEnabled` + per-capability flags.

## Hard rules

- Drafts / suggestions only  
- No auto-publish, send, apply, pay, ban, delete  
- No production deploy / migration / AI calls  
- MOCK default path  

## UI

- `/assistant` — chat, tools, prompt library, history  
- `/settings/ai` — consent  
- `AIComposerAssist` — embeddable composer panel  
