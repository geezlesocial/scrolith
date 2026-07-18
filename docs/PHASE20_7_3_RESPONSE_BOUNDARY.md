# Phase 20.7.3 — Response Boundary

## Rule

Only approved user-facing content is persisted as the DirectMessage / chat body.

## Allowed in body

- Natural answer  
- Clarifying question  
- Relevant next-step guidance  
- Optional high-confidence suggested step (when tools actually match)

## Forbidden in body

- Role / scope / surface / route  
- Account context dumps  
- “I will keep actions inside approved platform tools…”  
- Tool traces / confidence / rollout state  
- INTERNAL_CONTEXT blocks  

## Implementation

| Layer | Behavior |
|---|---|
| Intent router | Produces clean `userFacingReply` |
| `buildFallbackReply` | No page/account/policy append |
| `sanitizeUserFacingReply` | Strips leaked internal lines |
| Audit / metadata | Intent + confidence stored in **metadata**, not body |
| System prompt | Marks internal context `DO_NOT_ECHO` |

## Persistence

`appendConversationMessage` content = sanitized reply only.  
Metadata may include `intent`, `intentConfidence`, `routerMeta`.
