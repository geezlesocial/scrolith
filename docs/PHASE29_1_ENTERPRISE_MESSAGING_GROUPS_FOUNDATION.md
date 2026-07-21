# Phase 29.1 — Enterprise Messaging Groups  
## Database & Backend Foundation

| Field | Value |
|-------|--------|
| **Phase** | 29.1 |
| **Status** | Implementation complete (not deployed) |
| **Date** | 2026-07-21 |
| **Deployment** | **Do not deploy** |
| **Builds on** | Phase 29.0 architecture PASS · Phase 22.2 group foundation |

---

## SECRET visibility decision (verified)

| Question | Answer |
|----------|--------|
| New enum value or map to UNLISTED? | **New additive enum value `ConversationVisibility.SECRET`** |
| Approved by | Phase 29.0 architecture §4.1 + stakeholder acceptance |
| UNLISTED role | Remains for non-listed but less strict privacy; **not** an alias of SECRET |
| SECRET effects | Not discoverable · no previews · **join policy forced to INVITE_ONLY** |

---

## What shipped (code only)

### Schema (additive)

Migration: `prisma/migrations/20260721140000_phase291_enterprise_messaging_groups/migration.sql`

- Enum: `SECRET` on `ConversationVisibility`
- Enums: `ConversationJoinPolicy`, `ConversationMessagingMode`, `ConversationJoinRequestStatus`, `ConversationRestrictionKind`, invite status `REJECTED`
- Conversation columns: category, language, country, region, timezone, banner, emoji, accent, joinPolicy, messagingMode, slowModeSeconds, maxMembers, memberCount, settingsVersion, lock fields, archivedAt, lastActivityAt, permissionOverrides, orgVerified
- Participant: profileKey, lastMessageAt, permissionOverrides
- Invite: maxUses, useCount, oneTime, requireApproval, previewDisabled, label, qrTokenHash
- Tables: `ConversationSettings`, `ConversationJoinRequest`, `ConversationMemberRestriction`, `GroupModerationAction`, `ConversationPinnedMessage`
- Indexes for type+joinPolicy, type+messagingMode, type+lastActivityAt, audit paths
- **No** message table rewrite; **no** DROP of Conversation/DirectMessage

### Services

| Module | Role |
|--------|------|
| `permissionEngine.ts` | Pure matrix + profiles + messaging mode |
| `groupVisibility.ts` | SECRET / join policy helpers |
| `groupSendGate.ts` | Server-authoritative send evaluation |
| `groupRateLimit.ts` | Send + invite create rate limits |
| `groupAudit.ts` | Append-only GroupModerationAction writes |

### APIs (additive under `/api/messages`)

| Method | Path |
|--------|------|
| POST | `/groups` |
| GET/PATCH | `/groups/:id` |
| GET/PATCH | `/groups/:id/permissions` |
| POST | `/groups/:id/join` |
| POST/GET | `/groups/:id/join-requests` |
| POST | `/groups/:id/join-requests/:requestId/:decision` |
| POST | `/groups/:id/lock` · `/unlock` |
| POST | `/groups/:id/restrictions` |
| POST | `/groups/:id/invites` |
| GET | `/groups/:id/audit` |

Phase 22.2 routes (`/conversations/:id/group`, members, classic invites) **preserved**.

### Send path (`postMessage`)

For `type === GROUP` only:

1. Membership (soft-deleted cannot rejoin by sending)
2. UserBlock either direction
3. `evaluateGroupSendGate` (mode, permissions, restrictions, slow mode, rate limit, content settings)
4. Audit `message.send_denied` on reject
5. On success: `lastMessageAt` + `lastActivityAt`

**DIRECT** conversations skip group gates (except shared UserBlock check).

### Invite accept enhancements

- maxUses / oneTime usage counting  
- requireApproval → join request  
- maxMembers capacity  
- Audit + memberCount refresh  

---

## Messaging modes

| Mode | Who can send |
|------|----------------|
| EVERYONE | Matrix canSend |
| ADMINS_ONLY / ANNOUNCEMENT | OWNER, ADMIN |
| MODS_PLUS | OWNER, ADMIN, MODERATOR |
| READ_ONLY | OWNER only |
| LOCKED | Nobody (temporary lockdown + optional expiry) |

---

## Tests

- `src/services/__tests__/phase291.permissionEngine.unit.test.ts`
- `src/__tests__/phase291.enterpriseGroups.api.unit.test.ts`
- Regression: Phase 22.2 group policy tests must remain green

---

## Rollback

1. Do not apply migration on production if not yet applied.  
2. If applied: leave columns/tables; roll BE image to pre-29.1 revision (code ignores unused schema).  
3. No data rewrite required.

---

## Out of scope (later phases)

- Frontend wizard (29.3)  
- Realtime member events polish (29.2)  
- Polls/events message UX (29.2)  
- Admin dashboard (29.4)  
- Discovery search at scale (29.5)  
- Production deploy (29.7 only when requested)  

---

## Completion gate

See `docs/PHASE29_1_COMPLETION_GATE.json`.
