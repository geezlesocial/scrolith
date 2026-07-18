# Phase 20.7.2 — Response Recovery Implementation

## Backend

| Change | File |
|---|---|
| Allow admin/moderator Scrolitha turns | `messages.controller.ts` |
| Return `scrolithaTurn` on message POST | `messages.controller.ts` |
| Bounded turn budget + AbortSignal | `messages.controller.ts`, `messagingBridge.ts` |
| Always-log skip reasons | `messages.controller.ts` |
| Fallback assistant text on budget error | `messages.controller.ts` |
| Regression tests | `scrolitha.phase2072.responseRecovery.spec.ts` |

## Frontend

| Change | File |
|---|---|
| 95s timeout + clientRequestId for Scrolitha | `messaging.ts` |
| No auto-retry for Scrolitha sends | `messaging.ts` |
| Inject assistant from `scrolithaTurn` | `MessageContext.tsx`, `Messages.tsx` |
| Thinking / error / retry UI | `Messages.tsx` |
| Clear thinking on socket assistant | `Messages.tsx` |

## Invariant restored

When `MASTER=true` and `MESSAGING_ASSISTANT=true`, every valid user text to the Scrolitha DM results in either:

1. Exactly one assistant DirectMessage (success or error_fallback), or  
2. Explicit FE error + retry  

Silent no-op is forbidden.
