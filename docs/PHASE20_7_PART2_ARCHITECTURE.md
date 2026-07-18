# Phase 20.7 Part 2 — Architecture Changes

## Conversation lifecycle

```
User opens Messages / Dock / SupportWidget
  → POST /api/messages/scrolitha/ensure
  → ensureScrolithaPlatformUser()
  → find-or-create DIRECT (user, scrolitha)
  → optional welcome DirectMessage
  → return conversation payload (is_scrolitha, is_pinned)

User sends text in Scrolitha DM
  → POST /api/messages/conversations/:id/messages
  → persist user DirectMessage
  → async processScrolithaMessagingTurn
       → scrolithaChat (existing orchestration)
       → persist assistant DirectMessage (metadata: actions, chips, session id)
       → socket messages:new
```

## Permission model

- AI turns require Scrolitha user-facing access (master or internal allowlist)
- Tools execute only through existing `scrolithaChat` / execute paths
- Scrolitha cannot be blocked
- Human DMs unchanged

## Future extension points

- SSE streaming into messaging bubbles  
- Full action-card React components  
- Widget write-through to DirectMessage for perfect single history  
- Multimodal attachments in Scrolitha DM  
