# Phase 20.7.5 — Exactly-One Scrolitha Conversation Invariant

For each human user U and canonical Scrolitha platform user S:

- At most one active DIRECT conversation with exact participants {U, S}.  
- `ensureScrolithaDirectConversation` is idempotent and concurrency-safe.  
- Duplicates are consolidated automatically on ensure.

Survivor rule: most messages → newest lastMessageAt → earliest createdAt.
