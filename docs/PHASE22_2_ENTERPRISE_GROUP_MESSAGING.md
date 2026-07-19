# Phase 22.2 — Enterprise Group Messaging

**Status:** Implementation complete (additive)  
**Date:** 2026-07-20  
**Builds on:** Phase 22.1 messaging core (clientMessageId, outbox, mute-aware push, delta reconnect)  
**Constraint compliance:** No Phase 21 feed changes · no microservices · no E2EE rewrite · no attachment redesign · additive schema only  

---

## Scope delivered

| Capability | Status |
|------------|--------|
| Group meta (title, description, avatarFileId, visibility) | Done |
| Member roles (Owner, Admin, Moderator, Member) | Done |
| Invitations + join flow (`/messages/join/:code`) | Done |
| @mentions (resolve + bubble highlight + mute bypass) | Done |
| Group management APIs | Done |
| Member management UI (`GroupManagePanel`) | Done |
| Group notification levels (ALL / MENTIONS / NONE) | Done |
| Mention bypass when muted / Mentions-only | Done |
| Jump-to-message (`messages/around/:messageId` + `?messageId=`) | Done |

---

## Architecture

```
Conversation (type=GROUP)
  ├── title, description, avatarFileId, visibility
  ├── ConversationParticipant.role + .notifications
  └── ConversationInvite (code, status, expiresAt)

Send path (22.1 + 22.2):
  postMessage → clientMessageId idempotency
             → extract @usernames → mentionedUserIds in metadata
             → dispatchMessageReceiptNotifications
                  └── filterReceiversForMessagePush
                        (mute · levels · mention bypass)
```

### Role ranks

| Role | Manage members/invites | Edit meta | Remove members |
|------|------------------------|-----------|----------------|
| OWNER | Yes | Yes | Yes (not other owners without transfer) |
| ADMIN | Yes | Yes | MEMBER / MODERATOR |
| MODERATOR | No | No | No |
| MEMBER | No | No | Self-leave only |

### Notification precedence (group)

1. Never notify sender  
2. `isMuted` → suppress unless `@mentioned` (mention bypass)  
3. `notifications=NONE` → suppress  
4. `notifications=MENTIONS` → only if mentioned  
5. `notifications=ALL` → notify  
6. `forcePush` must **not** override mute/level for `new_message`

---

## API surface (backward compatible)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/messages/conversations` | `type=GROUP` + `title` creates group; creator → OWNER |
| PATCH | `/messages/conversations/:id/group` | Update title/description/avatar/visibility |
| GET | `/messages/conversations/:id/members` | List members + roles |
| POST | `/messages/conversations/:id/members` | Add members |
| PATCH | `/messages/conversations/:id/members/:userId` | Role / notifications |
| DELETE | `/messages/conversations/:id/members/:userId` | Remove or self-leave |
| POST | `/messages/conversations/:id/invites` | Create invite code |
| POST | `/messages/invites/:code/accept` | Join via invite |
| GET | `/messages/conversations/:id/messages/around/:messageId` | Jump window |

Existing 1:1 DM clients that omit group fields behave as before.

---

## Database (additive)

Migration: `20260720140000_phase222_group_messaging`

- Enums: `ConversationMemberRole`, `ConversationNotificationLevel`, `ConversationVisibility`, `ConversationInviteStatus`
- `Conversation`: title, description, avatarFileId, visibility, source, sourceId
- `ConversationParticipant`: role, notifications
- Table: `ConversationInvite`
- Best-effort: first participant of existing GROUP rows → OWNER

No column removals. Rollback = leave columns unused / reverse migration with care.

---

## Frontend

| File | Change |
|------|--------|
| `GroupManagePanel.tsx` | Members, roles, invites, meta, my notifications |
| `Messages.tsx` | Group header, settings, create group, join invite, jump around, mention render |
| `messaging.ts` | Group APIs + `getMessagesAround` + normalize group fields |
| `messageMentions.ts` | Extract / split @mentions |
| `App.tsx` | `/messages/join/:inviteCode` route |

---

## Tests

- Backend: `src/__tests__/phase222.groupMessaging.test.ts`
- Frontend: `src/utils/__tests__/phase222MessageMentions.spec.ts`

---

## Deploy notes (when requested)

1. Apply migration `20260720140000_phase222_group_messaging` on Cloud SQL  
2. Deploy backend first (new columns + routes)  
3. Deploy frontend (group UI + join route)  
4. Smoke: create group → invite → join → @mention muted member → push received  

**Not deployed in this phase session** unless ops explicitly requested.

---

## Risks / rollback

| Risk | Mitigation |
|------|------------|
| Prisma client missing new fields until generate/deploy | Backend image build runs generate |
| Invite table missing pre-migration | API returns 500 with clear error; no crash on DM path |
| Existing GROUP without OWNER | Migration promotes first member |
| Mention username collisions | Case-insensitive resolve; ids stored in metadata |

Rollback: FE previous revision; BE previous revision; columns remain harmless.
