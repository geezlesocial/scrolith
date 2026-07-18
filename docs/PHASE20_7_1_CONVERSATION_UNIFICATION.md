# Phase 20.7.1 — Conversation Unification

## Goal

Single canonical Scrolitha DirectMessage history across Messages, Messaging Dock, SupportWidget, and future entry points.

## Implementation

| Path | Behavior |
|---|---|
| Messages send | Existing: `postMessage` → `processScrolithaMessagingTurn` |
| SupportWidget (auth) | **New:** `MessagingService.scrolithaUnifiedTurn` → persists both sides |
| SupportWidget fallback | If messaging disabled / 403 → legacy `/scrolitha/chat` (divergent history only when messaging off) |
| Ensure on widget open | Existing ensure conversation (20.7) |
| Idempotency | `clientRequestId` on unified turn; assistant metadata dedupe |

## Guest users

Guests remain on local SupportWidget FAQ flow (no DM). Authenticated users use canonical DM when messaging assistant is enabled.

## Known gap

Dashboard coach / growth rewrite surfaces still use specialized rewrite endpoints (not full chat history). Intent deep-links to Messages remain the primary unification for conversational AI.
