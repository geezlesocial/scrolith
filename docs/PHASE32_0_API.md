# Phase 32.0 — Notification API

Base: `/api/notifications`  
Auth: Bearer JWT required unless noted.

## Existing (compatible)

### `GET /`

List inbox.

Query (new, optional):

| Param | Description |
|-------|-------------|
| `limit` | Page size (10–100) |
| `cursor` | Cursor id |
| `category` | Taxonomy category |
| `unreadOnly=true` | Unread only |
| `includeArchived=true` | Include archived |
| `includeDeleted=true` | Include soft-deleted |

Response: `{ success, data: Notification[], pagination }`

### `POST /mark-read`

Body: `{ ids: string[] }`

### `POST /mark-all-read`

### `POST /create`

Body: `{ userId, type, title?, body?, actorId?, category?, priority?, deepLink?, metadata?, idempotencyKey? }`  
Authz: self or admin.

### Quiet hours / device / test push

Unchanged.

## New (Phase 32.0)

### `GET /summary` · `GET /counters`

```json
{ "success": true, "data": { "unread": 3, "total": 40, "archived": 2 } }
```

### `POST /mark-unread`

Body: `{ ids: string[] }`

### `POST /bulk`

Body:

```json
{
  "action": "read|unread|archive|unarchive|delete|restore",
  "ids": ["..."]
}
```

Archive/delete require Phase 32.0 migration columns; returns `503 NOTIFICATION_FOUNDATION_MIGRATION_REQUIRED` if missing.

### `POST /emit`

Canonical multi-recipient emit (self-only for non-admins).

```json
{
  "type": "comment_on_post",
  "recipientIds": ["user_1"],
  "title": "New comment",
  "body": "Someone commented",
  "category": "personal",
  "priority": "normal",
  "deepLink": "/posts/abc",
  "entityType": "post",
  "entityId": "abc",
  "idempotencyKey": "optional-stable-key",
  "metadata": {}
}
```

Response:

```json
{
  "success": true,
  "data": {
    "eventId": "...",
    "schemaVersion": "32.0",
    "items": [{ "userId": "...", "notificationId": "...", "status": "created|duplicate|suppressed|failed" }],
    "createdCount": 1,
    "duplicateCount": 0,
    "suppressedCount": 0,
    "failedCount": 0
  }
}
```

## Notification object (extended fields when available)

Legacy fields always present. Optional:

`category`, `priority`, `deepLink`, `eventId`, `schemaVersion`, `archivedAt`, `deletedAt`
