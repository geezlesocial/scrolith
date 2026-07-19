# Phase 22.1 — Messaging Core Hardening

**Status:** Implementation complete (additive)  
**Date:** 2026-07-20  
**Constraint compliance:** No Phase 21 feed changes · no microservices · no E2EE · no attachment schema · no groups/roles · no event-log sync  

---

## Architecture changes

| Area | Change |
|------|--------|
| Send identity | `DirectMessage.clientMessageId` + unique `(senderId, clientMessageId)` |
| Idempotent send | Duplicate `clientMessageId` → **200 + existing message** |
| Durable outbox | Browser `localStorage` queue + in-memory delivery queue |
| Reconnect | Delta `updatedSince` inbox + fair outbox flush |
| Thread stability | Soft inbox isolation; optimistic reconcile by client id |
| Push | Mute-aware filter before `forcePush` |

---

## Files changed

### Backend
- `prisma/schema.prisma` — additive `clientMessageId`
- `prisma/migrations/20260720120000_phase221_client_message_id/migration.sql`
- `src/controllers/messages.controller.ts` — idempotent post, delta list/get
- `src/services/messageNotifications.ts` — mute filter
- `src/services/messaging/clientMessageId.ts` — parse helpers
- `src/services/messaging/notificationPolicy.ts` — mute precedence
- `src/__tests__/phase221.messagingCore.test.ts`

### Frontend
- `src/services/messaging.ts` — send `clientMessageId`; `updatedSince` list
- `src/services/messagingComposer.ts` — unique client send ids
- `src/services/messagingSessionStability.ts` — inbox/thread merge helpers
- `src/services/messagingEngine/durableOutbox.ts` — durable queue
- `src/services/messagingEngine/deliveryQueue.ts` — durable mirror + fair retry list
- `src/services/messagingEngine/index.ts` — exports
- `src/context/MessageContext.tsx` — wire outbox, delta refresh, reconnect flush
- `src/utils/__tests__/phase221MessagingCore.spec.ts`

---

## API additions (backward compatible)

| Method | Path / param | Behavior |
|--------|----------------|----------|
| POST | `/messages/conversations/:id/messages` body `clientMessageId` / header `X-Client-Message-Id` | Idempotent create |
| GET | `/messages/conversations?updatedSince=ISO` | Delta inbox |
| GET | `/messages/conversations/:id?afterMessageId=` | Newer messages only |

Existing clients that omit these fields behave as before.

---

## Database additions

```sql
ALTER TABLE "DirectMessage" ADD COLUMN IF NOT EXISTS "clientMessageId" TEXT;
CREATE UNIQUE INDEX ... ON ("senderId", "clientMessageId");
CREATE INDEX ... ON ("clientMessageId");
```

Nullable column — legacy rows unaffected.

---

## Outbox design

1. On optimistic send → `trackOutgoingMessage` + `upsertDurableOutboxItem` (localStorage).  
2. On success → remove durable item (`state=sent`).  
3. On failure → keep with `failed` + retry count.  
4. On reconnect → `listDurableOutboxFlushOrder()` = FIFO within conversation, fair round-robin across conversations.  
5. Max retries: 5. No global event log.

---

## Reconnect strategy

1. Detect real socket disconnect → reconnect.  
2. Soft refresh inbox with `updatedSince` last sync clock when available.  
3. Flush durable outbox in fair order.  
4. Server returns existing message if same `clientMessageId` retried.  
5. WS remains best-effort; REST/DB is authority.

---

## Mute-aware push precedence

1. **Block** (future / social graph) — not expanded in 22.1.  
2. **Mute** — `ConversationParticipant.isMuted` suppresses `new_message` push + in-app for that conversation.  
3. **forcePush** cannot override mute for messaging receipts.  
4. **Mentions** — bypass hook reserved (`allowMentionBypass`) for 22.2; disabled in 22.1.  
5. **Sender** never notified.

---

## Test results

| Suite | Result |
|-------|--------|
| Backend `phase221.messagingCore.test.ts` | **5/5 pass** |
| Frontend `phase221MessagingCore.spec.ts` | **7/7 pass** |

---

## Remaining work for Phase 22.2

- Group title / avatar / roles / invites  
- @mentions + mute mention bypass product rules  
- Member management APIs  
- Optional jump-to-message  

---

## Rollback considerations

| Layer | Rollback |
|-------|----------|
| FE only | Redeploy previous FE; durable outbox keys ignored harmlessly |
| BE only | Old clients omit `clientMessageId`; column unused |
| Migration | Column nullable; drop index/column only if emergency (prefer leave additive) |
| Mute filter | Revert `messageNotifications.ts` restores prior force-push-all behavior |

---

## Deployment recommendation

1. Apply additive migration on Cloud SQL (`clientMessageId`).  
2. Deploy **backend** first (idempotency + mute + delta query).  
3. Deploy **frontend** (outbox + clientMessageId always sent).  
4. Smoke: send, kill network, reconnect, confirm no duplicate bubbles; mute conversation, send from peer, confirm no push.  
5. Do **not** couple to Phase 21 feed release.  
6. Stage then promote like prior FE/BE tags; no traffic auto-shift without operator approval.

**Risk level:** Low–medium (additive).  
**Blocks 22.2:** No — foundation ready.
