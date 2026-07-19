# Phase 22.0A — Enterprise Messaging Architecture Validation

**Reviewer roles:** Principal Software Architect · Messaging Systems · Distributed Systems · Security · Database · Technical Review  
**Subject:** `docs/PHASE22_0_ENTERPRISE_MESSAGING_ARCHITECTURE.md`  
**Date:** 2026-07-20  
**Scope:** Architecture review only — no code, migrations, deploys, or Phase 21 changes  

---

## 1. Architecture review (overall)

### Verdict

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Completeness | **Strong** | Covers 1:1, groups, media, presence, sync, security, AI ports, scale path |
| Scalability | **Good with caveats** | Sound growth stages; receipt/sync event log need tighter specs before 1M |
| Maintainability | **Strong** | Evolve-not-replace; additive APIs; clear Phase 21 boundary |
| Backward compatibility | **Strong** | Keep `/api/messages`, models, Socket events; progressive enhancement |
| Operational simplicity | **Good if simplified** | 10 logical services is fine as *modules*; must not become 10 deployables early |
| Production readiness (as design) | **Ready for 22.1 with refinements** | 22.0 is architecture-complete; 22.1 scope must stay narrow |
| Evolves vs replaces | **PASS** | Explicit reuse of Conversation/DM/MessageContext/Smart Composer/Socket.IO |

### Evolution confirmation

The architecture correctly:

- Anchors on production assets (`messages.controller`, `MessageContext`, `messagingEngine`, Prisma models, Scrolitha bridge).
- Forbids deleting routes / destructive schema / feed changes.
- Treats `SERVER_ACCESSIBLE` as default (matches 20.7.8 encryption audit).
- Maps Phase 21 patterns to messaging without coupling to feed state.

**Gap vs reality:** Client already has optimistic send paths and socket health/polling; backend has conversation-level `lastReadAt` and reaction idempotency middleware, but **send-path `clientMessageId` persistence and durable outbox are not fully formalized as server contracts**. Architecture correctly prioritizes that for 22.1.

---

## 2. Service boundaries

### Assessment

| Service | Keep? | Recommendation |
|---------|-------|----------------|
| ConversationService | Yes | Core |
| MessageService | Yes | Core; absorb short-term Media *binding* helpers |
| ReceiptService | Yes | Keep logical; **implement as module inside Message write path initially** |
| PresenceService | Yes | Keep separate module (different durability + TTL) |
| SyncService | Merge early | **Fold into MessageService + DeviceSync helpers for 22.1–22.3**; extract only when event log exists |
| MediaMessagingService | Delay | **22.4**; until then use existing File + `attachments[]` + media pipeline |
| GroupPolicyService | Delay extract | **22.2 methods on ConversationService** until roles ship |
| MessagingNotificationService | Thin adapter | Wrap existing `messageNotifications` / system messaging — do not fork |
| MessagingModerationService | Thin adapter | Hooks on existing report-block + `aiFlagged` |
| MessagingAIAdapter | Port only | **22.7**; keep Scrolitha as sole inference owner |

### Boundary refinements

1. **Merge for implementation:** `SyncService` → not a standalone service until there is a real event log table.  
2. **Merge for implementation:** `GroupPolicyService` → `ConversationService` until multi-role is live.  
3. **Keep separate (code modules, one process):** Presence vs Messages (ephemeral vs durable).  
4. **Do not extract** Realtime Hub to its own Cloud Run service before multi-instance pain is measured.  
5. **Naming:** Prefer `messaging/*` modules over microservice language in 22.1 docs to avoid premature extraction pressure.

**Clarity score:** Responsibilities are clear at the *domain* level; the risk is over-partitioning the monorepo BE. Mitigate by treating the table as **bounded contexts**, not deployables.

---

## 3. Data model review

### Strengths

- Additive-only posture is correct for Scrolith engineering standards.  
- Keeps denormalized `lastMessage*` (required for inbox performance).  
- `MessageReceipt` unique `(messageId, userId)` is the right grain for DIRECT.  
- Presence online in Redis / last-seen durable is the right split.  
- Dual-write path for `MessageAttachment` avoids big-bang attachment rewrite.

### Unnecessary complexity (trim for early phases)

| Proposal | Issue | Refinement |
|----------|-------|------------|
| Both `lastReadAt` and `lastReadMessageId` + full `MessageReceipt` | Triple tracking | **22.1:** keep `lastReadAt`; add optional `lastReadMessageId` on participant. **22.3:** receipts for DIRECT only. Channels stay watermark-only. |
| `messageCount` denorm | Drift risk | Defer; compute or approximate later |
| `permissions` Json bitmask + `role` | Two authz systems | Ship **role enum only** first; custom bitmasks later if needed |
| Full `MessageAttachment` table in 22.1 | Touches every send path | Defer to **22.4**; use `messageType` + `metadata` + `attachments[]` |
| Global signed event log + hash chain | Heavy | For 22.1 use **per-conversation keyset** + existing sockets; introduce `MessagingEvent` table only when multi-device sync requires it |

### Missing entities / fields

| Missing | Why |
|---------|-----|
| `DirectMessage.clientMessageId` (unique per sender or global unique) | Server-side idempotency for outbox retry — **critical for 22.1** |
| `MessageHide` / per-user delete-for-me store (if not fully modeled) | Confirm “delete for me” storage; document existing approach |
| Block/mute relationship at messaging layer | Block may live on social graph; **document join rule** for send/notify |
| `ConversationParticipant.mutedUntil` / notification channel prefs | Mute-aware push needs explicit contract |
| Soft-delete visibility matrix | System messages + delete-everyone + delete-me interactions underspecified |
| Retention / legal hold fields | Enterprise: optional later, note as 22.6+ |
| Pin message / pin conversation | Product often expected; optional backlog |
| Link between Community channel messages and DM `Conversation` | Taxonomy mentions community-linked groups; **mapping table or sourceId convention** needs a single rule |

### Indexing risks

| Risk | Mitigation |
|------|------------|
| `MessageReceipt` writes on every open | Batch; only for DIRECT & small groups; no receipt rows for large channels |
| Index on `(userId, readAt)` without selectivity | Prefer `(userId, messageId)` unique; avoid heavy analytics indexes early |
| `Conversation (source, sourceId)` without partial unique | Add unique `(source, sourceId, type)` only if one channel per community |
| Cursor `(createdAt, id)` clock skew | Use server `createdAt`; never client time for ordering |
| Search ILIKE at scale | Cap result set; plan FTS in 22.6, not 22.1 |

### Scaling concerns

1. **Inbox query** today is participant-join + lastMessage sort — OK to mid-scale; at 1M users need covering indexes and possibly inbox projection table.  
2. **Group fan-out** of per-message receipts is the primary write amplification risk — architecture already prefers watermarks for channels; **encode as hard rule**.  
3. **No partition strategy detail** for `DirectMessage` — acceptable for 22.0; add “partition by createdAt month when rows > N” as operational note in 22.6.

---

## 4. API review

### Strengths

- Additive paths under `/api/messages`.  
- Cursor pagination shape consistent with modern clients.  
- Progressive enhancement for receipts/presence/AI.  
- Error machine codes listed.

### Backward compatibility

**PASS** if:

- Existing send body without `clientMessageId` still works.  
- Existing `POST .../read` without `upToMessageId` still sets `lastReadAt = now()`.  
- WS event payload extensions are additive fields only.  
- Group title/role fields optional on create.

### Idempotency

| Finding | Refinement |
|---------|------------|
| Reaction route already uses idempotency middleware | Align send with same middleware **or** unique `clientMessageId` |
| Architecture allows either Idempotency-Key or clientMessageId | **Standardize: require `clientMessageId` (ULID) on send from modern clients; accept Idempotency-Key as alias** |
| Missing: documented conflict response | Specify `200` return existing message on duplicate id (not 409) for safe retries |

### Missing APIs (add to architecture backlog)

| API | Phase |
|-----|-------|
| `GET .../messages?around=messageId` | Jump to reply/context (22.1–22.2) |
| `POST .../messages/:id/forward` or share-to-conversation | Platform integration (22.2+) |
| `GET /conversations/:id/members` | Groups (22.2) |
| `POST /conversations/direct` ensure-or-create by peer userId | Profiles CTA (exists partially — document) |
| Drafts sync `PUT /drafts/:conversationId` | Multi-device (22.3 optional) |
| `GET /unread/count` aggregate | Badge (may exist via notif — document) |
| Block-aware `POST /conversations` rejection codes | Security (22.1) |
| Admin export / retention | Enterprise (later) |
| Push preference test / dry-run | Ops (22.6) |

### Sync endpoints

`GET /sync?sinceEventId` is the right idea but **underspecified**:

- What is an event id? Global sequence? Per-user?  
- Ordering guarantees?  
- Payload size limits?  
- Auth of deviceId?

**Refinement for 22.1:** Implement **pragmatic sync** without full event log:

1. `GET /conversations?updatedSince=` for inbox delta.  
2. `GET .../messages?afterMessageId=` for thread catch-up.  
3. Defer generic `/sync` event stream to **22.3/22.6** when DeviceSyncState is real.

---

## 5. Realtime architecture review

### Strengths

- Reuses Socket.IO + JWT + user rooms (production-proven).  
- Reconnect steps ordered correctly (catch-up → outbox → reconcile).  
- No full inbox wipe aligns with Phase 21.  
- Typing remains ephemeral.

### Delivery guarantees (truth table)

| Path | Guarantee | Note |
|------|-----------|------|
| REST send + DB commit | At-least-once durable | Source of truth |
| WS `messages:new` | Best-effort | Client must reconcile via REST on gap |
| Receipts | At-least-once | Idempotent upsert |
| Typing/presence | Best-effort, lossy | Correct |

Architecture should **state explicitly: WS is not the durability boundary**. Clients must treat REST + DB as authority.

### Recommended improvements

1. **Sequence numbers:** Add optional `conversationSeq` (monotonic int per conversation) on messages for gap detection without global event bus.  
2. **Reconnect:** Prefer `afterMessageId` / `updatedSince` over premature `/sync` event log.  
3. **Multi-instance:** Document that **Redis adapter is required before second Cloud Run instance that accepts sockets** — operational gate, not 22.1 feature.  
4. **Conversation rooms:** Join only when thread open; leave on close to limit fan-out memory.  
5. **Backpressure:** Cap concurrent `messages:delivered` batch size (e.g. 50 ids).  
6. **Duplicate socket handlers:** Note FE risk of double-subscribe (Messages + MessageContext + GigDetail) — 22.1 hygiene.  
7. **Offline recovery order:** Outbox flush **per conversation FIFO**, global fair scheduling so one stuck conversation doesn’t block others.

---

## 6. Security review

### Consistency of encryption model

| Mode | Server plaintext | AI | Search | Status |
|------|------------------|----|--------|--------|
| SERVER_ACCESSIBLE | Yes | Yes | Yes | **Current production** |
| E2EE | No | No | Metadata-only | **Future 22.8** |

**Internally consistent** and aligned with `PHASE20_7_8_ENCRYPTION_AUDIT.md`. Hybrid per-conversation mode is the right long-term product control.

### AuthN / AuthZ

- JWT on REST + socket: correct.  
- Participant membership: correct baseline.  
- Group roles: good for 22.2.  
- **Missing explicit:** block-list enforcement on create/send; admin bypass scope documentation; Scrolitha system user rules.

### Moderation / abuse / spam

- Report path and `aiFlagged` exist; architecture hooks are fine.  
- **Missing:** explicit rate-limit numbers and burst behavior; progressive penalties; link to existing `idempotency` + social write limits.  
- Mute + `forcePush` contradiction noted in 22.0 — **must be fixed in 22.1 notification policy** or architecture promise is incomplete.

### Privacy

- Last-seen opt-out: good.  
- **Add:** typing indicators privacy (disable in prefs); read receipts privacy (WhatsApp-style optional) for enterprise markets.  
- GDPR: export/delete conversation — note as future compliance epic.

### AI compatibility

- Server-accessible required for Scrolitha: correct.  
- Fail-closed: correct.  
- **Add:** data minimization — AI context window size limits; no training on DMs without policy flag.

### E2EE future design

- Device keys / sender keys / safety numbers: adequate for architecture-only.  
- **Add non-goals for 22.1–22.7:** no safety numbers UI, no key backup, no sealed sender — avoid partial insecure “E2EE” claims.

---

## 7. Performance review

### Strengths

- Optimistic UI path well specified.  
- Virtualization strategy sound.  
- Keyset pagination matches existing indexes.  
- Watermark vs receipt trade-off is the right scale lever.

### Bottlenecks to watch

| Bottleneck | When | Mitigation |
|------------|------|------------|
| Inbox N+1 participant hydration | Every list load | Batch user cards; cache |
| `lastMessageText` update contention | Hot groups | Single row update already; avoid extra indexes on text |
| Receipt table growth | Read-heavy DIRECT | TTL/archive old receipts optional later |
| Socket broadcast to large groups | 100+ online members | Push-only for backgrounded; conversation room + server-side filter |
| Media upload on send critical path | Large videos | Async upload complete then message (existing pipeline) |
| Search ILIKE | Growth | Cap + later FTS |
| FE `Messages.tsx` monolith | Complexity | Incremental extraction; don’t rewrite in 22.1 |
| Multi-tab broadcast storms | Desktop dock | Existing multi-tab sync — verify single leader for outbox flush |

### Message ordering

- Server `createdAt` + `id` keyset: good.  
- **Clock:** reject client-supplied ordering timestamps for history.  
- Optimistic messages: temporary sort key = local now; re-seat on server ack without reordering previously confirmed messages (Phase 21 append-only).

### Caching

- Client-first is correct for 22.1.  
- Redis unread: valuable but **not required for 22.1** if participant watermark queries stay cheap.

---

## 8. Implementation roadmap review

### Original 22.1–22.9

Generally safe: core hardening → groups → presence/receipts → media → communities → scale → AI → E2EE → cert.

### Risk-reducing changes

| Change | Rationale |
|--------|-----------|
| **22.1 narrower** | Idempotency + outbox + reconnect catch-up + mute-aware push + session-stable inbox/thread **only**. Defer generic `/sync` event API and `MessageReceipt` table. |
| **22.1.5 or fold into 22.1** | Notification mute correctness (forcePush) — security/UX bug, low schema cost |
| **22.2 groups before rich receipts** | Keep | Product value high; schema additive |
| **22.3 presence + DIRECT receipts** | Keep; add conversationSeq optional |
| **22.4 media catalog** | Keep; dual-write attachments |
| **22.5 community/business** | Keep after groups stable |
| **22.6 scale + observability before AI** | Keep; load test before AI traffic |
| **22.7 AI** | Keep after security mode flags exist (even if only SERVER_ACCESSIBLE) |
| **22.8 E2EE** | Keep last functional; optional |
| **22.9 cert** | Keep; also add messaging regression suite earlier smoke in each phase |

### Updated roadmap (recommended)

| Phase | Scope | Risk |
|-------|--------|------|
| **22.0** | Architecture | Done |
| **22.0A** | Validation | This review |
| **22.1** | Core hardening: `clientMessageId` server uniqueness; durable outbox; reconnect via `updatedSince` / `afterMessageId`; append-only thread/inbox merge; mute-respecting push; no new microservices | Low–medium |
| **22.2** | Group product: title, avatar, roles, invites, member APIs, @mentions | Medium |
| **22.3** | Presence + typing/recording polish + DIRECT delivered/read ticks (watermark + optional receipts) + deviceId basics | Medium |
| **22.4** | Media kinds + link unfurl + attachment dual-write | Medium |
| **22.5** | Community/business-linked conversations | Medium |
| **22.6** | Redis adapter gate, unread cache, metrics/SLOs, search upgrade plan, load model | Medium–high ops |
| **22.7** | AI assist ports (flagged, fail-closed) | Medium |
| **22.8** | E2EE opt-in design/impl (optional) | High |
| **22.9** | Full certification + rollback drills | — |

---

## 9. Risks (consolidated)

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R1 | Scope creep in 22.1 (sync event log + receipts + groups) | High | Enforce narrow 22.1 above |
| R2 | Messages.tsx rewrite | High | Façade MessageContext; leaf components only |
| R3 | Receipt write amplification | High | DIRECT-only receipts; channel watermarks |
| R4 | Mute ignored by forcePush | Medium | Fix in 22.1 |
| R5 | Premature microservice split | Medium | Single BE modules through 22.5 |
| R6 | WS treated as durable | Medium | Document + client gap recovery |
| R7 | E2EE marketing ahead of crypto | Medium | Honest SecurityBadge only |
| R8 | Phase 21 feed regression | High | Code ownership boundary; no shared session stores |
| R9 | Multi-instance Socket without Redis | High | Ops gate before scale-out |
| R10 | Missing clientMessageId column | High | First migration when 22.1 starts |

---

## 10. Missing components (summary)

1. Server field/contract for **`clientMessageId`** (must-have before outbox).  
2. **Pragmatic delta sync** (`updatedSince`, `afterMessageId`) vs full event log.  
3. **conversationSeq** for gap detection.  
4. **Mute / notification policy** end-to-end matrix.  
5. **Block-list** enforcement on messaging.  
6. **Read receipt / typing privacy** prefs.  
7. **Jump-to-message** API.  
8. **Ensure-direct** API documentation.  
9. **FE double-subscription** hygiene.  
10. **Operational runbooks:** reconnect storms, poison outbox item, media send failure.  
11. **Observability:** metrics names (send_latency, ws_connected_users, outbox_depth).  
12. **Community↔Conversation** link invariant.

---

## 11. Recommended refinements (apply to architecture before 22.1)

1. Treat logical services as **modules**, not services, until 22.6.  
2. Standardize send idempotency on **`clientMessageId`** with duplicate → return existing.  
3. Split sync into **Phase A (delta queries)** and **Phase B (event log)**.  
4. Hard rule: **per-message receipts only for DIRECT (and groups ≤ N members)**.  
5. Defer `MessageAttachment` table to 22.4.  
6. Require **mute-aware push** in 22.1 exit criteria.  
7. State **WS best-effort; REST/DB authority**.  
8. Add **conversationSeq** optional column in schema proposal.  
9. Document **block + participant** authorization algorithm.  
10. Add **observability & ops gates** section (Redis adapter before multi-instance sockets).  
11. Keep **SecurityBadge** honest; no E2EE UI claims until 22.8.  
12. Narrow **22.1** as in updated roadmap.

---

## 12. Go / No-Go for Phase 22.1

### Recommendation: **GO WITH CONDITIONS**

Phase 22.0 architecture is **enterprise-grade, evolution-first, and production-aligned**. It is safe to begin **Phase 22.1** provided:

| # | Condition |
|---|-----------|
| C1 | 22.1 scope limited to core hardening (idempotency, outbox, reconnect delta sync, session-stable merge, mute-aware push) |
| C2 | No Phase 21 feed file changes |
| C3 | No microservice extraction |
| C4 | No E2EE implementation |
| C5 | No `MessageAttachment` migration yet |
| C6 | No full `/sync` event-log API unless delta queries prove insufficient |
| C7 | Additive schema only when 22.1 coding starts (`clientMessageId` first) |
| C8 | Architecture refinements above accepted (this 22.0A doc) |

### No-Go triggers (do not start 22.1 if)

- Plan includes rewrite of entire `Messages.tsx` or replacement of Socket.IO.  
- Plan couples messaging session state into feed soft-refresh.  
- Plan claims E2EE for GA in 22.1.  
- Plan requires multi-region messaging in first implementation slice.

---

## 13. Sign-off

| Item | Status |
|------|--------|
| Architecture completeness | **Accepted with refinements** |
| Evolve existing platform | **Confirmed** |
| Security model consistency | **Confirmed** (server-accessible vs future E2EE) |
| Roadmap | **Updated (narrower 22.1)** |
| Phase 22.1 | **GO WITH CONDITIONS** |

**Reviewer conclusion:** Phase 22.0 is a solid foundation. Phase 22.0A refinements reduce delivery risk. Proceed to Phase 22.1 under the conditions above.
