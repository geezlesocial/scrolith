# Phase 22.0 — Enterprise Messaging Foundation Architecture

**Status:** ARCHITECTURE ONLY — no production code, no migrations, no Phase 21 changes  
**Authority:** Principal Software Architect · Messaging Systems · Distributed Systems · Security · Mobile · UX  
**Continuity:** Builds on production messaging (Phases 20.6–20.8, 20.7.x Scrolitha, 21.1.2 voice) without redesigning the certified feed (Phase 21)  
**Date:** 2026-07-20  

---

## 0. Executive summary

Scrolith already ships a **production messaging product**: 1:1 DMs, multi-participant `GROUP` create, Smart Composer, attachments, voice notes, voice calls, reactions, edit/delete, typing, conversation-level read watermarks, search, mute/star/archive, Scrolitha AI peer, Socket.IO realtime, FCM push, and audit records.

Phase 22.0 defines the **enterprise messaging foundation** that scales that product from thousands to **millions of users**, closes structural gaps (groups as a product, receipts, presence, offline sync, E2EE-compatible design, AI hooks), and integrates cleanly with Member Home, Communities, Scroll, Profiles, Notifications, recommendations, auth, and permissions.

**Strategy:** Evolve, do not rewrite. Extend existing `Conversation` / `DirectMessage` / `MessageContext` / `/api/messages` / Socket.IO paths additively. Apply Phase 21 session-stability patterns (append-only merge, soft-refresh isolation, progressive windows, identity keys) to inbox and thread lifecycles.

---

## 1. Continuity & non-goals

### 1.1 Must not change

| Area | Rule |
|------|------|
| Phase 21 feed | No feed orchestrator, ranking, soft-refresh, or design-system regressions |
| Auth / JWT | Reuse existing middleware and user model |
| Production traffic | Architecture only; no deploys from this phase |
| Existing routes | Never delete `/api/messages/*`; only extend |
| DB columns | No destructive schema; additive models only when implementing later |

### 1.2 As-built foundation (reuse)

| Layer | Production asset |
|-------|------------------|
| FE surfaces | `Messages.tsx`, dock, header popover, Smart Composer |
| FE state | `MessageContext`, `messagingEngine/*` |
| FE API | `services/messaging.ts` |
| BE | `messages.routes.ts`, `messages.controller.ts` |
| Models | `Conversation`, `ConversationParticipant`, `DirectMessage`, `MessageReaction`, `DirectMessageRecord`, `VoiceNote`, `VoiceCall*` |
| Realtime | Socket.IO `messages:*` on user rooms |
| Push | `messageNotifications` → system message + FCM channel `messages` |
| AI | Scrolitha ensure/turn/stream in messaging |
| Security truth | TLS + server-readable plaintext (20.7.8); honest UI |

### 1.3 Product gaps this architecture closes

| Gap | Enterprise target |
|-----|-------------------|
| Groups | Named groups, roles, invites, communities/teams/channels |
| Receipts | Per-message delivered/read (not only `lastReadAt`) |
| Presence | Online / last seen / typing / recording |
| Offline | Durable outbox, multi-device sync, reconnect |
| Media types | Structured attachment catalog (location, stickers, GIF, link previews) |
| E2EE | Compatibility layer (opt-in later); server-side path remains for AI |
| Scale | Sharding-ready keys, cursor pagination, fan-out control |
| AI | Explicit capability interfaces without implementing models yet |

---

## 2. Complete system architecture

### 2.1 Logical system view

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Clients: Web (desktop dock + /messages) · Mobile Web · Capacitor · Electron │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ HTTPS REST + WSS Socket.IO
┌───────────────────────────────▼──────────────────────────────────────────┐
│                     Edge / API Gateway (Cloud Run FE/BE)                 │
│  Auth JWT · Rate limits · CORS · CDN static · GCS media signed URLs      │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ Messaging API │     │ Realtime Hub    │     │ Media Pipeline   │
│ REST commands │     │ Socket.IO       │     │ Upload / transcode│
│ Query / inbox │     │ Presence        │     │ GCS + CDN        │
└───────┬───────┘     └────────┬────────┘     └────────┬─────────┘
        │                      │                       │
        ▼                      ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Messaging Domain Services                             │
│  Conversation · Message · Receipt · Group · Presence · Sync · Policy    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ PostgreSQL    │     │ Redis (future)  │     │ Event bus        │
│ Source of     │     │ Presence,       │     │ (in-process →    │
│ truth + audit │     │ typing, cache   │     │  Pub/Sub later)  │
└───────────────┘     └─────────────────┘     └────────┬─────────┘
                                                       │
                              ┌────────────────────────┼────────────┐
                              ▼                        ▼            ▼
                    ┌──────────────┐         ┌─────────────┐  ┌──────────┐
                    │ Notifications│         │ Scrolitha   │  │ Moder.   │
                    │ In-app + FCM │         │ AI adapters │  │ Abuse    │
                    └──────────────┘         └─────────────┘  └──────────┘
```

### 2.2 Design principles

1. **Append-only message history** for a conversation session (Phase 21 analog).  
2. **Optimistic UI + durable server identity** (client `clientMessageId` → server `id`).  
3. **Participant-scoped authorization** (membership first; role matrix for groups).  
4. **Honest security modes**: `server_accessible` (default, AI-compatible) vs future `e2ee_optional`.  
5. **Soft-delete / hide never hard-delete** user data without retention policy.  
6. **Additive APIs only** — versioned capabilities, not breaking clients.  
7. **One conversation identity** across dock, full page, mobile, push deep links.

### 2.3 Conversation taxonomy

| Kind | `type` / subtype | Participants | Examples |
|------|------------------|--------------|----------|
| Direct | `DIRECT` | Exactly 2 humans (or human+Scrolitha) | 1:1 DM |
| Group private | `GROUP` + `visibility=PRIVATE` | 3–N, invite-only | Friends, project squad |
| Group public | `GROUP` + `visibility=PUBLIC` | Discoverable + join rules | Community interest groups |
| Community-linked | `GROUP` + `source=COMMUNITY` | Community members subset | Community chat room |
| Business team | `GROUP` + `source=BUSINESS` | Business page members | Org team |
| Project channel | `CHANNEL` (new subtype) | Team + topics | `#delivery`, `#general` |
| System | flags `isSystem` | Platform | Order/brief notices |

Implementation may keep `ConversationType` enum extended additively (`CHANNEL`) or encode subtype in `metadata` / new columns — **no removals**.

---

## 3. Component diagram (frontend)

```text
┌─────────────────────────────────────────────────────────────────────┐
│ App Shell (unchanged Phase 21 surfaces)                             │
│  Member Home · Community · Scroll · Profile · Notifications         │
│         │ deep-link Message / Share / Mention                         │
└─────────┼───────────────────────────────────────────────────────────┘
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Messaging Surfaces                                                    │
│  HeaderMessagesPopover │ DesktopMessagingDock │ /messages workspace   │
└─────────┬───────────────────────────────────────────────────────────┘
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ MessagingProvider (evolution of MessageContext)                       │
│  · Inbox session · Thread sessions · Outbox · Presence · Sync clock │
└───┬─────────────┬─────────────┬─────────────┬───────────────────────┘
    ▼             ▼             ▼             ▼
 Conversation  MessageThread  Composer     Attachment
 List          Virtualizer    System       Pipeline
    │             │             │             │
    │             ├─ Bubble     ├─ SmartComposer (20.8)
    │             ├─ Reactions  ├─ Reply/Edit strip
    │             ├─ Receipts   └─ VoiceRecorder
    │             └─ System cards (Scrolitha)
    ▼
 messagingEngine (event bus, queue, socket health, multi-tab)
```

### 3.1 Reusable component catalog

| Component | Responsibility |
|-----------|----------------|
| `ConversationList` | Virtualized inbox; filters (all/unread/starred/groups); soft-refresh pending |
| `ConversationRow` | Avatar, title, preview, unread badge, mute/star, presence dot |
| `MessageThread` | Virtual list (bottom-anchored); date separators; load older |
| `MessageBubble` | Text/rich, reply quote, edit marker, reactions row, receipt ticks |
| `AttachmentRenderer` | Image/video/audio/doc/link/location/sticker/GIF (extend 20.6) |
| `MessageComposer` | SmartComposer base + reply/edit modes + @mention + slash |
| `ReactionPicker` | Emoji set; optimistic toggle |
| `PresenceChip` | Online / last seen / typing / recording |
| `GroupHeader` | Name, members, roles, invite |
| `SecurityBadge` | Honest mode label (TLS / E2EE unavailable / E2EE active) |
| `ScrolithaCards` | Existing rich cards; no dual chat UI |

### 3.2 Desktop vs mobile layout

| Viewport | Layout |
|----------|--------|
| Desktop ≥1024 | 3-pane optional: list \| thread \| info; dock multi-window retained |
| Tablet | 2-pane list/thread with push navigation |
| Mobile | Single pane stack; SmartComposer `mobilePrimary`; visualViewport keyboard strategy (20.8.1) |
| Capacitor | Same SPA; FCM channel `messages`; deep link `/messages/:id` |

---

## 4. Backend architecture

### 4.1 Service boundaries (logical; may start as modules in one BE)

| Service | Owns | Does not own |
|---------|------|--------------|
| **ConversationService** | Create/list/merge DIRECT, group metadata, membership | Feed ranking |
| **MessageService** | Send/edit/delete/reply, pagination, search index hooks | Payment |
| **ReceiptService** | Delivered/read events, unread counts | Presence TTL |
| **PresenceService** | Online, last seen, typing, recording (ephemeral) | Durable messages |
| **SyncService** | Device cursors, outbox ack, conflict resolution | Media binary |
| **MediaMessagingService** | Attachment metadata binding, link unfurl jobs | GCS IAM |
| **GroupPolicyService** | Roles, invites, bans, channel permissions | Community post feed |
| **MessagingNotificationService** | Fan-out rules, mute respect, mention push | Generic notif UI |
| **MessagingModerationService** | Report, spam scores, rate limits, AI flags | Trust & safety case mgmt UI |
| **MessagingAIAdapter** | Capability ports for Scrolitha | Inference runtime (existing Scrolitha) |

**Initial deployment:** modules inside `geezle-backend` (Express).  
**Scale path:** extract realtime hub + presence to a dedicated Cloud Run service sharing Redis + same JWT issuer.

### 4.2 Message lifecycle

```text
Client compose
  → clientMessageId (ULID)
  → optimistic bubble (status=queued|sending)
  → POST /messages  OR  outbox flush on reconnect
Server validate (auth, membership, rate limit, policy)
  → persist DirectMessage (+ attachments)
  → update Conversation lastMessage*
  → emit messages:sent → sender
  → emit messages:new → other participants (fan-out)
  → enqueue notifications (skip muted / self / active thread optional)
Recipient device
  → render bubble
  → emit messages:delivered (per device/session)
  → on viewport visible → messages:read (watermark + optional receipts)
Edit/Delete/React
  → mutate + DirectMessageRecord audit
  → messages:updated
```

### 4.3 Event model (domain events)

| Event | Payload essentials | Transport |
|-------|-------------------|-----------|
| `message.created` | conversationId, messageId, senderId, type, createdAt | WS + internal bus |
| `message.updated` | messageId, fields changed | WS |
| `message.deleted` | messageId, mode for_me\|everyone | WS |
| `reaction.changed` | messageId, emoji, userId, op | WS |
| `receipt.delivered` | messageId, userId, deviceId, at | WS (optional batch) |
| `receipt.read` | conversationId, userId, upToMessageId / lastReadAt | WS |
| `presence.changed` | userId, state, lastSeenAt | WS (throttled) |
| `typing.started/stopped` | conversationId, userId | WS (ephemeral, no DB) |
| `recording.started/stopped` | conversationId, userId | WS ephemeral |
| `conversation.updated` | prefs, lastMessage preview | WS |
| `membership.changed` | group add/remove/role | WS + REST |
| `sync.checkpoint` | deviceId, cursor | REST/WS |

### 4.4 Caching strategy

| Data | Cache | TTL / invalidation |
|------|-------|-------------------|
| Inbox list rows | Client memory + optional Redis per user | On `conversation.updated` |
| Thread hot window | Client thread cache (existing engine) | Append/edit events |
| Unread counts | Redis hash `unread:{userId}` (future) | On send/read |
| Presence | Redis `presence:{userId}` | Heartbeat 30–60s |
| Typing | Redis key or pure WS | 3–5s TTL |
| Link previews | Server cache by URL hash | Hours |
| User display cards | Existing user/profile caches | Profile update |

### 4.5 Scaling strategy (1M+ users)

| Concern | Approach |
|---------|----------|
| Write path | Single-writer per conversation (DB row lock or advisory); batch receipts |
| Read path | Cursor pagination `(createdAt, id)` already indexed; keyset only |
| Fan-out | Direct: O(1–2); Group: emit to conversation room + membership cache; large groups → async worker + push only |
| Socket scale | Sticky sessions or Redis adapter for Socket.IO multi-instance |
| Hot conversations | Shard by `conversationId` hash for future workers |
| Search | Start with SQL ILIKE/existing search; later OpenSearch/PG FTS on `search_document` |
| Media | GCS + CDN; never store blobs in Postgres |
| DB | Cloud SQL; partition `DirectMessage` by time **later** if > hundreds of millions rows |
| Rate limits | Per-user send, per-conversation, attachment size/type |

---

## 5. Frontend architecture

### 5.1 State model

```text
MessagingState
  connection: { status, lastConnectedAt, socketId }
  inbox: {
    sessionId, orderedIds[], byId{}, pendingSoftRefresh[],
    filters, cursor, terminal
  }
  threads: Map<conversationId, {
    sessionId, orderedMessageIds[], byId{},
    olderCursor, hasMoreOlder, integrityHash
  }>
  outbox: OutboxItem[]  // durable localStorage / IndexedDB
  presence: Map<userId, PresenceState>
  typing: Map<conversationId, userId[]>
  ui: { activeConversationId, dockWindows[], drafts{} }
```

### 5.2 Session stability (from Phase 21)

| Feed pattern | Messaging application |
|--------------|----------------------|
| Append-only merge | History: only append older pages upward; never reorder mid-session |
| Soft-refresh isolation | Inbox: new activity → pending badge, not list thrash |
| Progressive window | Thread: render last N; virtualize rest |
| Identity keys | `message.id` / `clientMessageId`; attachment stable media keys (20.6) |
| Socket health | Existing degraded polling policy — keep; no hard reload on brief disconnect |
| Integrity probe | Optional cert: thread order, duplicate bubbles, scroll jump |

### 5.3 Optimistic updates

1. Assign `clientMessageId`.  
2. Insert bubble `status=sending`.  
3. Persist outbox.  
4. On `messages:sent` / REST 200: replace with server id, `status=sent`.  
5. On `messages:delivered` (others): `status=delivered`.  
6. On read watermark covering message: `status=read`.  
7. On failure: `status=failed` + retry.  
8. Reconnect: flush outbox FIFO per conversation.

### 5.4 Virtualization & bandwidth

- Thread: reverse virtual list (`@tanstack/react-virtual` already in stack).  
- Inbox: virtualize at 50+ conversations.  
- Media: progressive load; thumbnails first; voice waveform lazy.  
- Receipts: batch WS events (max 1Hz per conversation per device).  
- Presence: subscribe only for visible list + open thread peers.

---

## 6. Database schema proposal (additive)

> **No migrations in Phase 22.0.** Proposal only. Prefer additive tables/columns; keep existing names.

### 6.1 Existing (keep)

- `Conversation`, `ConversationParticipant`, `DirectMessage`, `MessageReaction`, `DirectMessageRecord`, `VoiceNote`, `VoiceCall*`, `MessengerVoiceConfig`

### 6.2 Proposed additive models

#### Conversation extensions (columns)

| Column | Type | Purpose |
|--------|------|---------|
| `title` | String? | Group/channel name |
| `avatarFileId` | String? | Group avatar |
| `visibility` | enum PRIVATE/PUBLIC/UNLISTED | Discovery |
| `source` | enum USER/COMMUNITY/BUSINESS/SYSTEM | Origin |
| `sourceId` | String? | Community/business id |
| `securityMode` | enum SERVER_ACCESSIBLE / E2EE | Policy |
| `messageCount` | Int? | Optional denorm |
| `settings` | Json? | Retention, slow mode |

#### ConversationMemberRole (or columns on participant)

| Column | Purpose |
|--------|---------|
| `role` | OWNER / ADMIN / MODERATOR / MEMBER / GUEST |
| `permissions` | Json bitmask override |
| `notifications` | ALL / MENTIONS / NONE |
| `lastDeliveredMessageId` | Optional watermark |
| `lastReadMessageId` | Optional finer than `lastReadAt` |

#### MessageAttachment (normalized; phase in)

| Column | Purpose |
|--------|---------|
| `id`, `messageId`, `fileId` | Link to File |
| `kind` | IMAGE/VIDEO/AUDIO/DOCUMENT/LINK/LOCATION/STICKER/GIF/VOICE |
| `order`, `width`, `height`, `durationMs` | Render hints |
| `previewUrl`, `blurhash` | UX |
| `metadata` | Location coords, link OG, sticker pack |

*Short term:* keep `attachments String[]` + `messageType`; long term dual-write to `MessageAttachment`.

#### MessageReceipt

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `messageId`, `userId` | Unique pair |
| `deliveredAt`, `readAt` | Timestamps |
| `deviceId` | Optional multi-device |

Indexes: `(messageId)`, `(userId, readAt)`, `(conversationId via join)` for analytics.

#### DeviceSyncState

| Column | Purpose |
|--------|---------|
| `userId`, `deviceId` | Unique |
| `inboxCursor`, `lastEventId` | Sync |
| `updatedAt` | |

#### Presence (optional durable last-seen only)

| Column | Purpose |
|--------|---------|
| `userId` PK | |
| `lastSeenAt` | Privacy-respecting |
| `showLastSeen` | User pref |

Online state stays in Redis, not Postgres.

#### GroupInvite

| Column | Purpose |
|--------|---------|
| `conversationId`, `code` / `inviteeUserId` | |
| `role`, `expiresAt`, `createdById` | |

### 6.3 Index guidance (implementation phases)

Keep existing:

- `DirectMessage (conversationId, createdAt, id)`  
- `ConversationParticipant (userId, deletedAt, conversationId)`  
- `Conversation (lastMessageAt)`

Add when building receipts/groups:

- `MessageReceipt (userId, messageId)` unique  
- `Conversation (source, sourceId)`  
- `ConversationParticipant (conversationId, role)`  

---

## 7. API design

### 7.1 Principles

- Base path remains `/api/messages` (backward compatible).  
- New resources under additive paths.  
- Cursor pagination: `?cursor=&limit=` returning `{ items, nextCursor, hasMore }`.  
- Idempotency: `Idempotency-Key` or `clientMessageId` on send.  
- Errors: existing JSON shape; add machine codes `RATE_LIMITED`, `NOT_PARTICIPANT`, `E2EE_REQUIRED`.

### 7.2 REST contracts (target)

#### Inbox & conversations

```http
GET  /api/messages/conversations?filter=all|unread|groups&cursor&limit
POST /api/messages/conversations
     body: { type, participantIds[], title?, visibility?, source?, sourceId? }
GET  /api/messages/conversations/:id
PATCH /api/messages/conversations/:id
     body: { title?, avatarFileId?, settings? }
POST /api/messages/conversations/:id/members
DELETE /api/messages/conversations/:id/members/:userId
PATCH /api/messages/conversations/:id/members/:userId  # role
POST /api/messages/conversations/:id/invites
POST /api/messages/conversations/:id/read
     body: { upToMessageId? }  # extends lastReadAt
POST /api/messages/conversations/:id/preferences
```

#### Messages

```http
GET  /api/messages/conversations/:id/messages?cursor&limit&direction=older|newer
POST /api/messages/conversations/:id/messages
     body: {
       clientMessageId, text?, messageType, attachments?,
       replyToMessageId?, metadata?, rich?: RichTextDoc
     }
PATCH /api/messages/conversations/:id/messages/:messageId
DELETE /api/messages/conversations/:id/messages/:messageId?scope=me|everyone
POST /api/messages/conversations/:id/messages/:messageId/reactions
POST /api/messages/conversations/:id/messages/:messageId/report
POST /api/messages/conversations/:id/voice-notes  # existing
GET  /api/messages/search?q=&cursor  # existing
```

#### Receipts & sync

```http
POST /api/messages/receipts/delivered
     body: { messageIds: string[], deviceId }
POST /api/messages/receipts/read
     body: { conversationId, upToMessageId, deviceId }
GET  /api/messages/sync?deviceId&sinceEventId
POST /api/messages/sync/ack
     body: { deviceId, eventId }
```

#### Presence (optional REST + primarily WS)

```http
GET /api/messages/presence?userIds=a,b,c
PATCH /api/messages/presence/privacy  { showLastSeen, showOnline }
```

#### AI (interfaces only)

```http
POST /api/messages/conversations/:id/ai/smart-replies
POST /api/messages/conversations/:id/ai/summarize
POST /api/messages/conversations/:id/ai/translate
POST /api/messages/conversations/:id/ai/assist-write
# All require SERVER_ACCESSIBLE security mode; E2EE threads return 409 CAPABILITY_DISABLED
```

### 7.3 Compatibility

Existing clients that only use today's endpoints continue to work. Receipts/presence/AI are progressive enhancements.

---

## 8. WebSocket design

### 8.1 Transport

- Keep **Socket.IO** + JWT handshake (existing).  
- Rooms:  
  - `user:{userId}` (primary)  
  - `conversation:{conversationId}` (optional optimization for large groups)  
- Multi-instance: Socket.IO Redis adapter when horizontal scale requires it.

### 8.2 Client → server

| Event | Payload | Notes |
|-------|---------|-------|
| `messages:typing` | `{ conversationId, isTyping }` | Existing; validate membership |
| `messages:recording` | `{ conversationId, isRecording }` | New ephemeral |
| `messages:delivered` | `{ messageIds[], deviceId }` | New; batched |
| `messages:read` | `{ conversationId, upToMessageId }` | Complements REST |
| `presence:heartbeat` | `{ deviceId }` | New; 30–60s |
| `messages:debug_trace` | existing | Dev only |

### 8.3 Server → client

| Event | Purpose |
|-------|---------|
| `messages:new` | New message (existing) |
| `messages:sent` | Sender ack (existing) |
| `messages:updated` | Edit/delete/reaction (existing) |
| `messages:read` | Read watermark (existing; extend payload) |
| `messages:delivered` | Delivery receipts |
| `messages:conversation_updated` | Inbox row (existing) |
| `messages:conversation_deleted` | Soft delete (existing) |
| `presence:update` | Online/last seen (privacy filtered) |
| `typing:update` | Aggregated typing users |
| `sync:event` | Ordered sync stream for multi-device |

### 8.4 Reconnect handling

1. On connect: `presence:heartbeat`; subscribe conversations of interest.  
2. `GET /sync?sinceEventId` catch-up (or thread `direction=newer` since last message id).  
3. Flush outbox.  
4. Reconcile optimistic with server ids.  
5. Resume typing/presence subscriptions.  
6. **No full inbox wipe** (Phase 21 soft-refresh spirit).

---

## 9. Security model

### 9.1 Layers

| Layer | Control |
|-------|---------|
| Transport | TLS everywhere (Cloud Run) |
| Auth | JWT on REST + Socket handshake |
| AuthZ | Participant membership; group roles |
| Input | Max text length, attachment MIME allowlist, virus scan hooks |
| Rate limit | Send/min, attach/min, reaction/min, search/min |
| Abuse | Report/block (existing); spam scoring hooks; slow mode |
| Audit | `DirectMessageRecord` retained |
| Privacy | Mute, last-seen toggle, archive, delete for me |
| Encryption modes | See 9.2 |

### 9.2 Encryption modes

| Mode | Storage | Server AI | Attachments | Status |
|------|---------|-----------|-------------|--------|
| `SERVER_ACCESSIBLE` (default) | Postgres plaintext | Allowed | Server-side encrypted at rest (GCS) | **Production today** |
| `E2EE` (future opt-in) | Ciphertext + device keys | **Disabled** | Client-encrypted blobs | Design only |
| Hybrid | Per-conversation mode | Mode-gated | Mode-gated | Target |

**Compatibility design (not implement yet):**

- Device identity keys, prekeys, safety numbers.  
- Sender keys for groups.  
- Server stores ciphertext + metadata only in E2EE mode.  
- UI must never claim E2EE when mode is server-accessible (20.7.8 honesty).

### 9.3 Integrity

- Server signs event ids (monotonic per conversation or global event log).  
- Optional hash chain for E2EE later.  
- Edit/delete always audited.

### 9.4 Moderation hooks

```text
onMessageCreate → spam classifier (async) → aiFlagged
onReport → moderation queue
onRateLimit → soft block + CAPTCHA optional
admin/moderator → existing bypass + moderation.chat routes
```

---

## 10. AI integration points (architecture only)

### 10.1 Adapter interface

```typescript
// Conceptual — not production code in this phase
interface MessagingAIPort {
  smartReplies(ctx: ThreadContext): Promise<string[]>;
  summarize(ctx: ThreadContext, range: MessageRange): Promise<SummaryCard>;
  translate(text: string, targetLang: string): Promise<string>;
  assistWrite(draft: string, intent: WriteIntent): Promise<string>;
  moderateAssist(message: MessageView): Promise<ModerationHint>;
  meetingSummary(transcript: string): Promise<SummaryCard>;
}
```

### 10.2 Context contract

| Field | Source |
|-------|--------|
| `conversationId`, `securityMode` | Conversation |
| `recentMessages` | Last K server-readable |
| `participants` | Profiles (names, roles) |
| `platformEntity` | Job/gig/brief/community if linked |
| `viewerLocale` | User prefs |
| `policy` | Scrolitha rollout / kill switch |

### 10.3 Scrolitha integration rules

- Reuse **existing** ensure/turn/stream; do not create a second AI chat product.  
- Smart replies = **composer assist**, not a new inbox peer (unless user is in Scrolitha DM).  
- All AI features **fail closed** if inference unhealthy.  
- No AI on `E2EE` conversations.  
- Analytics: task completion without logging full message bodies to third parties.

### 10.4 UX placement

| Capability | UI surface |
|------------|------------|
| Smart replies | Composer chip row (desktop Suggest Reply evolution) |
| Summaries | Thread header / info pane card |
| Translation | Per-bubble action (parallel to feed TranslatablePostText patterns) |
| Writing assist | Composer overflow |
| Moderation assist | Report flow + admin tools |
| Meeting summary | After voice call ends (VoiceCall metadata) |

---

## 11. Platform integration map

| Scrolith surface | Messaging integration |
|------------------|----------------------|
| **Member Home** | Message CTA on people cards; deep link compose |
| **Communities** | Community-linked group/channel; share post → DM |
| **Scroll** | Share video → conversation attach |
| **Profiles** | Message button → ensure DIRECT |
| **Notifications** | `new_message`, mentions, replies; badge via existing NotificationContext |
| **Recommendations** | “People you may message” uses existing social graph (no ranking rewrite) |
| **Auth** | Same JWT; socket auth |
| **Permissions** | Participant + group role; admin override retained |
| **Business / jobs / gigs** | Labels on participant (`jobs` etc.); briefs timeline (existing) |
| **Wallet / contracts** | System messages already pattern; keep server-accessible |

---

## 12. Scalability strategy (phases of growth)

| Stage | Users | Topology |
|-------|-------|----------|
| **Now** | 10K–100K | Single BE Cloud Run + Cloud SQL + Socket.IO in-process |
| **Growth** | 100K–1M | Socket.IO Redis adapter; Redis presence/unread; CDN media |
| **Scale** | 1M+ | Separate realtime service; async fan-out workers; PG read replicas; optional message partition |
| **Global** | Multi-region | Regional presence; sticky conversations by region; GCS multi-region |

### Performance targets

| Metric | Target |
|--------|--------|
| Send API p95 | < 200 ms (excl. media) |
| WS event delivery p95 | < 150 ms same region |
| Inbox first paint | < 1.0 s cached |
| Thread open (hot) | < 400 ms |
| History page (50 msgs) | < 250 ms |
| Optimistic UI | < 50 ms local |

---

## 13. Risks and trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Big-bang rewrite of Messages.tsx | Regress production DM | Incremental modules; keep MessageContext façade |
| Per-message receipts write amplification | DB load | Batch receipts; sample in large groups; watermarks for channels |
| Group fan-out storms | Socket overload | Conversation rooms + push-only for inactive |
| E2EE vs Scrolitha AI | Product conflict | Dual mode; default server-accessible; clear UI |
| Offline multi-device conflicts | Duplicate messages | `clientMessageId` idempotency |
| Presence privacy | Legal/UX | Opt-out last seen; no precision location |
| Phase 21 bleed | Feed breakage | Hard boundary: no shared mutable feed session state |
| Mute ignored by forcePush | Annoyance | Fix in notification policy phase |
| Schema additive debt | Complexity | Clear deprecation plan for `attachments[]` → table |

**Trade-off decisions:**

1. **Watermark-first for channels**, per-message receipts for DIRECT/small groups.  
2. **Server-accessible default** preserves AI and search.  
3. **Single BE modules first**, extract services only when metrics demand.  
4. **Virtualize threads** before sharding databases.

---

## 14. Recommended implementation phases

| Phase | Name | Scope | Exit criteria |
|-------|------|-------|---------------|
| **22.0** | Foundation architecture | This document | Architecture accepted |
| **22.1** | Messaging core hardening | Formalize clientMessageId idempotency; outbox; reconnect sync; session-stable inbox/thread merge; receipt watermarks API; mute-aware push | Zero message loss on flaky network; no inbox thrash |
| **22.2** | Group product | Title/avatar/roles/invites; member management UI; @mentions; notification levels | Create/manage private groups end-to-end |
| **22.3** | Presence & rich receipts | Online/last seen; typing/recording polish; delivered/read ticks for DIRECT | Correct ticks on multi-device smoke |
| **22.4** | Media catalog expansion | Location, link unfurl, stickers/GIF provider hooks; MessageAttachment dual-write | New types render in bubble + preview |
| **22.5** | Communities & teams channels | `source=COMMUNITY/BUSINESS`, channel subtype, slow mode | Community opens linked channel |
| **22.6** | Scale & observability | Redis adapter, unread cache, metrics, load tests to 1M-user model | SLOs + dashboards |
| **22.7** | AI assist surfaces | Smart replies, summarize, translate adapters on Scrolitha | Feature-flagged, fail-closed |
| **22.8** | E2EE opt-in (optional) | Device keys, mode flag, disable AI on E2EE threads | Security review + honest UI |
| **22.9** | Certification | Playwright messaging suite, mobile, push deep links, rollback drills | Production certified messaging |

Each phase: additive only; certify; stage; promote like Phase 21.

---

## 15. Component diagram (deployment)

```text
                    ┌─────────────┐
                    │ Cloud DNS   │ scrolith.com
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │ Cloud Run   │ scrolith-frontend  (SPA)
                    └──────┬──────┘
                           │ /api →
                    ┌──────▼──────┐
                    │ Cloud Run   │ scrolith-backend
                    │ Express+IO  │
                    └──────┬──────┘
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Cloud SQL│ │ GCS      │ │ FCM      │
        │ Postgres │ │ Media    │ │ Push     │
        └──────────┘ └──────────┘ └──────────┘
              │
              ▼ future
        ┌──────────┐ ┌──────────┐
        │ Memorystore│ │ Pub/Sub │
        │ Redis    │ │ workers  │
        └──────────┘ └──────────┘
```

---

## 16. Success criteria for “architecture complete”

- [x] System, backend, frontend, DB, API, WS, security, AI, scale documented  
- [x] Grounded in existing production messaging models and services  
- [x] Phase 21 feed explicitly out of scope for mutation  
- [x] Phased implementation path 22.1–22.9  
- [x] No production code or migrations in 22.0  

---

## 17. Appendix — file map (implementation anchors)

| Area | Path |
|------|------|
| FE workspace | `geezle/src/messages/Messages.tsx` |
| FE context | `geezle/src/context/MessageContext.tsx` |
| FE engine | `geezle/src/services/messagingEngine/*` |
| FE composer | `geezle/src/components/messaging/SmartComposer.tsx` |
| BE routes | `geezle-backend/src/routes/messages.routes.ts` |
| BE controller | `geezle-backend/src/controllers/messages.controller.ts` |
| Prisma | `geezle-backend/prisma/schema.prisma` (`Conversation`…) |
| Push | `geezle-backend/src/services/messageNotifications.ts` |
| E2EE audit | `docs/PHASE20_7_8_ENCRYPTION_AUDIT.md` |
| Scrolitha messaging | `docs/PHASE20_7_PART1_ENTERPRISE_BLUEPRINT.md` |

---

**End of Phase 22.0 architecture.**  
Next action (when approved): **Phase 22.1 — Messaging core hardening** (implementation), without touching Phase 21 feed code paths.
