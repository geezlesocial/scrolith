# Phase 32.3 — APIs

All user routes require authentication. Ownership = `req.user.id`.

## Devices

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/notifications/device/register` | Register/update token (+ optional metadata) |
| POST | `/api/notifications/device/unregister` | Remove by token (existing) |
| GET | `/api/notifications/devices` | List devices (no full tokens) |
| DELETE | `/api/notifications/devices/:deviceId` | Remove by deviceId or row id |

## Sync

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications/sync-state` | Badge/unread/focus/prefs version snapshot |
| POST | `/api/notifications/sync-state` | Heartbeat alias |
| POST | `/api/notifications/sync/heartbeat` | Touch lastSyncAt + refresh snapshot |

## Receipts

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/notifications/receipts` | Single or `{ events: [] }` batch (max 50) |

Body example:

```json
{
  "notificationId": "…",
  "lifecycle": "opened",
  "channel": "push",
  "deviceId": "…",
  "clientTimestamp": "2026-07-22T00:00:00.000Z",
  "idempotencyKey": "optional"
}
```

## Unified actions (offline flush / rich actions)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/notifications/actions` | mark_read, archive, delete, pin, mark_all_read, … |

Reuses `NotificationService.bulkUpdate` / `markAllRead` and broadcasts sync.

## Backward compatibility

- All Phase 32.0–32.2 routes unchanged  
- Device register without new fields still works  
- Receipt/sync writes soft-degrade pre-migration  

## Realtime (socket)

- `notifications:new` (existing)  
- `notifications:sync` (new)  
- `notifications:badge` (new)  
