# Phase 20.7.1 — Architecture

## Principles

- Extend Phase 20.7 Scrolitha messaging bridge; do not replace Ollama/Qwen, messaging, or orchestration.
- One official Scrolitha identity (`@scrolitha`) and one DirectMessage conversation per user.
- Provider-independent streaming contract (`scrolitha.streaming` + messaging bridge events).
- Typed rich cards only (no server HTML).
- Independent feature flags for every major new capability.

## Data flow (unified turn)

```
SupportWidget / Messages / Dock
        │
        ▼
POST /api/messages/scrolitha/turn  (or /turn/stream SSE)
        │
        ▼
processScrolithaUnifiedTurn
  1. ensureScrolithaDirectConversation
  2. persist user DirectMessage
  3. processScrolithaMessagingTurn
       - optional file understanding context (untrusted)
       - scrolithaChat (existing orchestrator)
       - optional chunk_fallback stream events
       - mint confirmation tokens for pending actions
       - build typed entity cards
       - persist single final assistant DirectMessage
       - emit messages:new + scrolitha:messaging_reply (+ scrolitha:stream)
```

## Streaming

- Transport: SSE (`/turn/stream`) and socket event `scrolitha:stream`.
- Mode: `chunk_fallback` (full generation then chunk for UI); token streaming remains provider-optional.
- Final answer only is chunked — no chain-of-thought exposure.
- Tokens are **not** persisted as separate DirectMessages.

## Confirmation

- `mintConfirmationToken` / `consumeConfirmationToken` in `scrolitha.confirmationTokens.ts`.
- Bound to userId, toolKey, actionId, payload hash; TTL ~5 minutes; single-use.
- Enforced in `scrolithaExecute` when `confirmationTokens` capability is on.

## Rollback

- Set new `SCROLITHA_ROLLOUT_*` flags false (or omit).
- Or traffic-shift FE/BE to prior revisions (p2072 / 00089-f5h after supersede).
