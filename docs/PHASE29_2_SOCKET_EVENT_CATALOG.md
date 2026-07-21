# Phase 29.2 — Socket Event Catalog

**Namespace:** `/community`  
**Auth:** existing JWT on handshake  

---

## Client → Server

| Event | Payload | Auth rules | Notes |
|-------|---------|------------|-------|
| `messages:typing` | `{ conversationId, isTyping, name? }` | Member + privacy + rate limit | Multi-typer snapshot in response fan-out |
| `messages:recording` | `{ conversationId, isRecording, name? }` | Member + privacy | Multi-recorder snapshot |
| `messages:group:join` | `{ conversationId }` | Active member only | Joins `messages:group:{id}` |
| `messages:group:leave` | `{ conversationId }` | Authenticated | Leaves room |
| `messages:catchup` | `{ conversationId, cursor?, limit? }` | Active member | Same as REST catch-up |
| `presence:heartbeat` | existing | existing | Unchanged |

Message **send remains REST** (`POST /api/messages/conversations/:id/messages`) for parity with Phase 22.x clients.

---

## Server → Client (wire names)

| Wire event | Executive alias | Payload summary |
|------------|-----------------|-----------------|
| `messages:new` | message.sent | Full message DTO |
| `messages:sent` | message.sent (sender) | Full message DTO |
| `messages:updated` | message.updated / deleted | Patch incl. soft delete |
| `messages:reaction` | reaction.created / removed | Reaction payload |
| `messages:typing` | typing.started / stopped | + `typing[]` multi |
| `messages:recording` | recording.started / stopped | + `recording[]` multi |
| `messages:receipts` | — | Watermark receipts |
| `messages:read` | — | Self read |
| `messages:conversation_updated` | group.archived (partial) | Prefs / meta |
| `messages:conversation_deleted` | group.deleted | Soft leave |
| `messages:group_updated` | group.created / updated | Mode, visibility, version |
| `messages:group_locked` | group.locked | Lock fields |
| `messages:group_unlocked` | group.unlocked | Mode restore |
| `messages:permissions_updated` | permissions.updated | version only |
| `messages:member_joined` | member.joined | compact member |
| `messages:member_left` | member.left / kicked | userId + reason |
| `messages:member_role` | — | promote/demote |
| `messages:member_restricted` | member.banned / restricted | kind |
| `messages:invite_created` | invite.created | **no raw code** |
| `messages:invite_revoked` | invite.revoked | inviteId |
| `messages:invite_updated` | — | use counts (no code) |
| `messages:join_requested` | join.requested | requestId |
| `messages:join_approved` | join.approved | userId |
| `messages:join_rejected` | join.rejected | userId |
| `messages:pin_updated` | pin.created / removed | pins[] |
| `messages:group_room_joined` | — | ack + ephemeral |
| `messages:group_room_denied` | — | reason |
| `messages:catchup` | — | catch-up page |
| `messages:catchup_ack` | — | success/fail |
| `messages:send_ack` | — | reserved for future socket send |

---

## Rooms

| Room | Who joins | Content |
|------|-----------|---------|
| `community:user:{userId}` | auto on connect | All personal events |
| `messages:group:{conversationId}` | after authorized `messages:group:join` | Group dual-emit |

---

## Privacy rules

1. Never emit invite `code` / tokens on sockets  
2. Never log message `text` in metrics  
3. SECRET/PRIVATE: non-members get `group_room_denied`  
4. Typing/recording only to participants + privacy filters  
5. Receipts respect disclosure privacy (22.3B)  

---

## REST companions

| REST | Socket dual |
|------|-------------|
| POST messages | messages:new / sent |
| POST/DELETE pins | messages:pin_updated |
| GET catchup | messages:catchup |
| lock/unlock | messages:group_locked / unlocked |
| members/invites | membership / invite events |
