# Phase 32.1 — Notification Center API extensions

Extends Phase 32.0 without breaking clients.

## `GET /api/notifications`

### Query parameters

| Param | Description |
|-------|-------------|
| `limit` | Page size (10–100) |
| `cursor` | Cursor pagination |
| `category` | Taxonomy category or `all` |
| `q` / `search` | Free-text search (title, body, type, category, deepLink) |
| `unreadOnly` / `filter=unread` | Unread only |
| `readOnly` / `filter=read` | Read only |
| `archivedOnly` / `filter=archived` | Archived only |
| `includeArchived` | Include archived with active |
| `priority` | exact priority band |
| `highPriorityOnly` / `filter=high` | high + critical |
| `criticalOnly` / `filter=critical` | critical only |
| `pinnedOnly` / `filter=pinned` | pinned only |
| `timeRange` / `range` | `today` \| `week` \| `older` |

### Ordering

1. `pinnedAt` DESC (pinned first)  
2. `createdAt` DESC  
3. `id` DESC  

### Response item extensions

`category`, `priority`, `deepLink`, `pinnedAt`, `isPinned`, `archivedAt`, `deletedAt`, `eventId`, `schemaVersion`, actor fields

## `GET /api/notifications/summary`

```json
{
  "unread": 12,
  "total": 80,
  "archived": 5,
  "critical": 1,
  "high": 4,
  "pinned": 2,
  "byCategory": { "messaging": 3, "jobs": 2 }
}
```

## `POST /api/notifications/bulk`

Actions (Phase 32.1 adds pin/unpin):

`read` · `unread` · `archive` · `unarchive` · `delete` · `restore` · `pin` · `unpin`

Pin limit default: **25** (`DEFAULT_PIN_LIMIT`).

## Compatibility

- Existing mark-read / mark-all-read / create / emit / quiet-hours / device routes unchanged
- Missing migration columns degrade gracefully where possible
