# Phase 22.3 — Presence & Rich Delivery/Read Receipts

**Date:** 2026-07-20  
**Status:** Implementation complete (additive)  
**Builds on:** 22.1 core · 22.2 groups  
**Constraints:** No Phase 21 feed changes · no messaging rewrite · no E2EE · no microservices · no AI messaging  

---

## Scope delivered

| Area | Delivery |
|------|----------|
| Presence | Heartbeat API + socket pulse; online/away/offline via store; last seen; privacy |
| Typing | Existing path retained; recording indicator added |
| Delivery/read | `lastDeliveredAt` watermark + enhanced `lastReadAt`; rich ticks UI |
| Group model | Small groups: all-peer watermarks; large groups: any-peer watermark |
| Realtime | `presence:heartbeat`, `messages:receipts`, `messages:recording` |
| Performance | Batch receipts endpoint; typing debounce retained; in-memory store Redis-ready |
| UI | Delivery ticks, typing/recording line, presence online/away/last seen, group online count |

---

## Architecture

### Presence store (Redis-ready)

`src/services/messaging/presenceStore.ts`

- In-memory default (`MemoryPresenceStore`)
- API: `markConnect` / `markDisconnect` / `touchHeartbeat` / `list` / privacy filter
- Thresholds: away after idle, offline after longer idle (env-tunable)
- Dual-written from socket connect path in `server.ts`

### Receipt policy (watermark-first)

`src/services/messaging/receiptPolicy.ts`

- Outgoing status: `sent` → `delivered` → `read`
- DM / small groups (≤ cap, default 12): **all** peers must advance watermark
- Large groups: **any** peer watermark advances coarse status
- No per-message receipt rows (scale-safe)

### Schema (additive)

Migration `20260720160000_phase223_presence_receipts`:

- `User.presenceVisibility` TEXT default `EVERYONE` (`EVERYONE` | `CONTACTS` | `NOBODY`)
- `ConversationParticipant.lastDeliveredAt` TIMESTAMP nullable
- Indexes on `(conversationId, lastReadAt)` and `(conversationId, lastDeliveredAt)`

---

## API surface (backward compatible)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/messages/presence/heartbeat` | Durable lastSeen + store touch |
| GET | `/messages/presence?ids=` | Batch presence (privacy filtered) |
| PATCH | `/messages/presence/privacy` | Set visibility |
| POST | `/messages/conversations/:id/receipts` | Batch delivered/read watermarks |
| POST | `/messages/conversations/:id/read` | Existing; now also advances delivered + fans out `messages:receipts` |

### Socket events

| Event | Direction | Notes |
|-------|-----------|-------|
| `presence:heartbeat` | client → server | Throttled ~30s |
| `presence:updated` | server → clients | Online/away/offline |
| `messages:typing` | bi-directional | Existing |
| `messages:recording` | bi-directional | Voice note recording |
| `messages:receipts` | server → clients | Peer watermark updates |

---

## Frontend

| File | Role |
|------|------|
| `MessageDeliveryTicks.tsx` | ✓ / ✓✓ / clock ticks |
| `messageReceipts.ts` | Pure status normalize |
| `MessageContext` | Heartbeat, receipts apply, delivery ack on receive |
| `Messages.tsx` | Presence header, typing/recording, ticks, receipts socket |
| `MessagingChatWindow.tsx` | Dock typing/recording label |
| `messaging.ts` | API helpers |

---

## Tests

| Suite | Coverage |
|-------|----------|
| BE `phase223.presenceReceipts.test.ts` | Store, privacy, watermarks, large-group semantics |
| FE `phase223MessageReceipts.spec.ts` | Tick normalize/labels |

---

## Deploy notes (when requested)

1. Apply migration `20260720160000_phase223_presence_receipts`  
2. Deploy backend first (columns + endpoints + socket handlers)  
3. Deploy frontend  
4. Smoke: two browsers — send → delivered tick → open → read tick; typing; heartbeat  

**Not deployed in this implementation session.**

---

## Rollback

- FE previous revision ignores new fields  
- BE previous revision: columns unused  
- Do not drop columns on emergency rollback  

---

## Out of scope (deferred)

- Redis deployment (abstraction only)  
- True contact-graph CONTACTS filter (flag reserved; currently treated as contact=true for batch)  
- E2EE  
- Per-message receipt table for mega-channels  
