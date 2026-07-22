# Phase 32.3 — Cross-Device Synchronization

## What syncs

| State | Mechanism |
|-------|-----------|
| Read / unread | Bulk update + `notifications:sync` |
| Unread / badge counts | Sync snapshot + `notifications:badge` |
| Archive / pin / delete | Bulk update broadcast |
| Focus Mode | Focus start/stop broadcast |
| Quiet hours / prefs | Snapshot includes preferenceVersion + quietHoursActive; full prefs via existing GET |
| Multi-browser sessions | Socket.IO user room (existing realtime) |
| Android ↔ Web | Same APIs + socket events |

## Sync snapshot

```
GET /api/notifications/sync-state
POST /api/notifications/sync/heartbeat
```

Fields: `serverTime`, `version`, `badgeCount`, `unreadCount`, `total`, `archived`, `pinned`, `focusActive`, `focus`, `preferenceVersion`, `quietHoursActive`.

## Conflict resolution (deterministic)

Client `applyRemoteSync`:

1. Reject if remote `version` < local version  
2. If versions equal, reject if remote `serverTime` is older  
3. Accept on `force: true` (reconnect recovery / heartbeat)  

Server is source of truth for counts (recomputed from Notification rows).

## Offline queue

Key: `scrolith:notification-offline-queue:v1`

Queued types:

- `notification_action` → `POST /notifications/actions`  
- `lifecycle_receipt` → `POST /notifications/receipts`  
- `preference_patch` → `PATCH /notifications/preferences`  

Flush on network recovery (`NetworkStatusContext` recovery tick) and after successful flush re-fetch sync state.

## Realtime events

| Event | Payload |
|-------|---------|
| `notifications:sync` | Full snapshot + reason + optional ids |
| `notifications:badge` | badgeCount, unreadCount, version, serverTime |
| `notifications:new` | Existing (inbox + badge increment) |

## Badge recovery after reconnect

1. Flush offline queue  
2. `fetchAndApplySyncState({ force })`  
3. Apply badge to local store / optional native bridge  
