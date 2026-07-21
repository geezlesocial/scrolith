# Phase 29.2 — Real-Time Messaging Engine

| Field | Value |
|-------|--------|
| **Phase** | 29.2 |
| **Status** | Implementation complete (**not deployed**) |
| **Date** | 2026-07-21 |
| **Namespace** | Existing Socket.IO `/community` only |
| **Migration** | **None** — reuses Phase 29.1 additive tables (not applied in this phase) |

---

## 1. Architecture

```
Client ──► REST /api/messages/*  ──► same domain services ──► DirectMessage
       └─► Socket /community     ──► authorize → fan-out    ──► community:user:{id}
                                                              └─► messages:group:{conversationId}
```

- **No parallel realtime stack**
- Message persistence remains HTTP-first (`POST .../messages`) with shared send gates
- Group room join is **server-authorized** via DB membership (`messages:group:join`)
- Fan-out always re-filters **active members** (`deletedAt: null`)

---

## 2. Authorization flow

1. Socket JWT auth (existing `communityNs.use`)
2. For group room join: `authorizeGroupRealtimeAccess(conversationId, userId)`
3. For typing/recording: participant list + privacy policies (22.3B) + rate limit
4. For message send (REST): Phase 29.1 `evaluateGroupSendGate` + UserBlock
5. For event fan-out: `emitToGroupMembers` loads active members from DB — **does not trust room alone**

**SECRET / PRIVATE isolation:** non-members never receive group room join success, typing, pins, or message payloads. SECRET is not discoverable and never leaks previews via realtime metadata events.

---

## 3. Send path parity & acknowledgements

REST `POST /conversations/:id/messages` returns:

```json
{
  "success": true,
  "data": { "...message" },
  "sendAck": {
    "status": "accepted|duplicate|...",
    "conversationId": "...",
    "messageId": "...",
    "clientMessageId": "...",
    "orderingCursor": "ISO|id"
  }
}
```

Reject path includes `sendAck.status` mapped from gate:

| status | meaning |
|--------|---------|
| accepted | persisted + emitted |
| duplicate | same clientMessageId |
| rate_limited | send rate / typing rate |
| permission_denied | matrix / mode |
| group_locked | LOCKED / archived |
| slow_mode | slowModeSeconds |
| content_type_disabled | content settings |
| not_member | removed / not joined |
| blocked | UserBlock |
| rejected / error | generic |

**In-flight rule:** once `DirectMessage.create` succeeds, emit proceeds even if mode flips milliseconds later (ordering: accept = DB commit time). Subsequent sends re-evaluate mode.

Idempotency: existing `clientMessageId` unique path → `sendAck.status = duplicate`.

---

## 4. Ordering guarantees

- Canonical order: **`createdAt ASC, id ASC`**
- Catch-up cursor: base64url `{ createdAt, id }`
- Clients buffer out-of-order `messages:updated` until base message known, or call catch-up
- Multi-tab: same user rooms receive identical events (existing dual room joins)

---

## 5. Reconnect protocol

1. Client connects `/community` (existing)
2. `emit('messages:group:join', { conversationId })`
3. `emit('messages:catchup', { conversationId, cursor, limit })` **or** `GET /api/messages/groups/:id/catchup`
4. Response: messages page, pins, group mode snapshot, ephemeral typing/recording, recent membership audit (no secrets)
5. Resume live events

Bounded page size (default 50, max 100). Metrics: `group_reconnect_catchup_total`.

---

## 6. Multi-typer & recording

- Memory maps only (`groupEphemeralIndicators`) — **never DB**
- Typing TTL ~6s, recording TTL ~15s
- Rate limit typing events
- Payload includes `typing[]` / `recording[]` for multi-user attribution
- Disconnect clears indicators globally for that user

---

## 7. Pins

- Service: `groupPinService` on `ConversationPinnedMessage`
- REST: `POST/DELETE/GET /groups/:id/pins`
- Events: `messages:pin_updated`
- Permission: `canPin`
- Deleted messages auto-omitted from pin list

---

## 8. Receipts (22.3 preserved)

- Small groups: watermark all-peers read/delivered
- Large groups (`> SMALL_GROUP_RECEIPT_MEMBER_CAP`): coarse any-peer watermark
- Read disclosure privacy still applied via `readDisclosurePeerIds`
- No per-member receipt explosion in large groups

---

## 9. Security

- IDOR: membership checks on join, pin, catch-up, send
- Cross-group isolation: conversationId scoped queries
- Invite codes **never** in realtime payloads
- No message body in metrics logs
- Rate limits: send, invite create, typing

---

## 10. Observability metrics

In-process counters (`groupMetrics.snapshot()` / `GET /api/messages/groups/metrics/realtime`):

- group_socket_join_total / denied
- group_message_send_total / rejected / duplicate
- group_typing_event_total / rate_limited
- group_reconnect_catchup_total
- group_pin_total / group_reaction_total
- group_membership_event_total
- group_event_delivery_latency_ms_*

---

## 11. Migration decision

| Item | Decision |
|------|----------|
| Modify 29.1 migration | **No** |
| Apply 29.1 migration in 29.2 | **No** |
| New 29.2 migration | **Not required** (`migrationRequired: false`) |

Pins / settings tables already defined in 29.1 schema for when ops applies migrations at 29.7.

---

## 12. Rollback

1. Revert BE commit / image pre-29.2  
2. No DB changes applied by this phase  
3. Clients ignore unknown `messages:*` events  

---

## 13. Frontend contract preview (Phase 29.3)

| Action | Client behavior |
|--------|-----------------|
| Open group | `messages:group:join` + catch-up |
| Send | REST only (preferred) + handle `sendAck` |
| Typing | existing emit + render `typing[]` array |
| Mode change | listen `messages:group_locked` / `group_updated` → disable composer |
| Pins | listen `messages:pin_updated` |
| Leave/kick | stop joining room; clear local state |

---

## 14. Tests

- `src/services/__tests__/phase292.realtimeEngine.unit.test.ts`
- `src/__tests__/phase292.realtimeWiring.unit.test.ts`
- Regression: 29.1 + 22.2 suites
