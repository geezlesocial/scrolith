# Phase 29.0 — Enterprise Messaging Groups  
## Socket & API Specification (Design)

**Base path:** `/api/messages`  
**Realtime:** Socket.IO namespace `/community`  
**Auth:** Existing JWT `authMiddleware` / socket auth  

---

## 1. Existing APIs (must remain)

See Phase 22.2 routes in `messages.routes.ts`. Critically:

| Method | Path | Notes |
|--------|------|-------|
| GET | `/conversations` | Inbox (DM + groups) |
| POST | `/conversations` | Create DM or GROUP |
| POST | `/conversations/:id/messages` | Send (group gates added later) |
| PATCH | `/conversations/:id/group` | Meta |
| GET/POST | `/conversations/:id/members` | Members |
| POST | `/conversations/:id/invites` | Invite codes |
| POST | `/invites/:code/accept` | Join |
| GET | `/search` | Message search |
| GET | `/conversations/:id/attachments` | Media browser |
| * | reactions, edit, delete, receipts, presence, privacy | Unchanged |

---

## 2. Additive HTTP resources

### 2.1 Group lifecycle

```
POST   /api/messages/groups
GET    /api/messages/groups/discover
GET    /api/messages/groups/:conversationId
PATCH  /api/messages/groups/:conversationId
DELETE /api/messages/groups/:conversationId          # owner soft-archive / leave all (define carefully)
GET    /api/messages/groups/:conversationId/settings
PATCH  /api/messages/groups/:conversationId/settings
GET    /api/messages/groups/:conversationId/permissions
PATCH  /api/messages/groups/:conversationId/permissions
```

### 2.2 Join lifecycle

```
POST   /api/messages/groups/:id/join                 # OPEN
POST   /api/messages/groups/:id/join-requests
GET    /api/messages/groups/:id/join-requests         # approvers
POST   /api/messages/groups/:id/join-requests/:rid/approve
POST   /api/messages/groups/:id/join-requests/:rid/reject
POST   /api/messages/invites/:code/accept             # existing
POST   /api/messages/groups/:id/invites               # alias existing create
DELETE /api/messages/groups/:id/invites/:inviteId     # revoke
```

### 2.3 Content extensions

```
POST   /api/messages/groups/:id/pins
DELETE /api/messages/groups/:id/pins/:messageId
POST   /api/messages/groups/:id/polls
POST   /api/messages/groups/:id/polls/:pollId/vote
POST   /api/messages/groups/:id/events
GET    /api/messages/groups/:id/media
GET    /api/messages/groups/:id/analytics             # limited member view
```

### 2.4 Admin

```
GET    /api/admin/messaging-groups
GET    /api/admin/messaging-groups/:id
POST   /api/admin/messaging-groups/:id/lock
POST   /api/admin/messaging-groups/:id/unlock
POST   /api/admin/messaging-groups/:id/archive
POST   /api/admin/messaging-groups/:id/transfer-ownership
POST   /api/admin/messaging-groups/:id/moderation
GET    /api/admin/messaging-groups/:id/audit
GET    /api/admin/messaging-groups/analytics
```

Permissions keys (RBAC): `messaging.groups.read`, `messaging.groups.moderate`, `messaging.groups.admin`, `messaging.groups.export`.

---

## 3. Create group request shape (wizard)

```json
{
  "name": "Project Team",
  "description": "...",
  "category": "work",
  "language": "en",
  "country": "US",
  "region": null,
  "timezone": "America/New_York",
  "avatarFileId": null,
  "bannerFileId": null,
  "emoji": "🚀",
  "accentColor": "#2563eb",
  "visibility": "PRIVATE",
  "joinPolicy": "INVITE_ONLY",
  "messagingMode": "EVERYONE",
  "slowModeSeconds": 0,
  "maxMembers": 256,
  "memberUserIds": ["...", "..."],
  "content": {
    "allowImages": true,
    "allowVideos": true,
    "allowFiles": true,
    "allowAudio": true,
    "allowVoice": true,
    "allowGifs": true,
    "allowStickers": true,
    "allowPolls": true,
    "allowEvents": true,
    "allowLocation": false,
    "allowContacts": false,
    "allowReactions": true,
    "allowEditing": true,
    "allowDelete": true,
    "allowForward": true,
    "allowCopy": true
  }
}
```

Response: `{ success, data: { id, type: "group", ... } }` compatible with existing Conversation DTO.

---

## 4. Socket events

### 4.1 Preserved

Client → server: `messages:typing`, `messages:recording`, `presence:heartbeat`, call events  
Server → client: `messages:new|sent|updated|reaction|read|receipts|typing|recording|conversation_updated|conversation_deleted`, `presence:update|updated`

### 4.2 Additive server → client

| Event | When |
|-------|------|
| `messages:group_updated` | Settings/meta/mode change |
| `messages:member_joined` | Join / accept invite / approve request |
| `messages:member_left` | Leave / kick |
| `messages:member_role` | Promote/demote |
| `messages:permissions_updated` | Matrix override change |
| `messages:pin_updated` | Pin/unpin |
| `messages:poll_updated` | Poll create/vote/close |
| `messages:event_updated` | Event CRUD |
| `messages:group_locked` | Lock/unlock |

Payload always includes `conversationId` and `version` (settingsVersion) where applicable.

### 4.3 Executive name mapping

| Executive name | Wire event |
|----------------|------------|
| group.created | `messages:conversation_updated` + group_updated |
| group.updated | `messages:group_updated` |
| member.joined | `messages:member_joined` |
| message.sent | `messages:new` / `messages:sent` |
| reaction.created | `messages:reaction` |
| typing.started | `messages:typing` `{ isTyping: true }` |

---

## 5. Error contract

```json
{ "success": false, "error": "Human message", "code": "GROUP_PERMISSION_DENIED" }
```

Suggested codes: `GROUP_NOT_FOUND`, `GROUP_NOT_MEMBER`, `GROUP_PERMISSION_DENIED`, `GROUP_LOCKED`, `GROUP_SLOW_MODE`, `GROUP_CONTENT_FORBIDDEN`, `GROUP_JOIN_DENIED`, `GROUP_INVITE_EXPIRED`, `GROUP_FULL`.

---

## 6. Compatibility guarantee

- Clients that only use Phase 22.2 group APIs continue to work.  
- Unknown fields ignored on write (Prisma select explicit).  
- Additive response fields never remove existing keys.
