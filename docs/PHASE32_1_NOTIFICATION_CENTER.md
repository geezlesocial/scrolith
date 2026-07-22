# Phase 32.1 — Enterprise Notification Center (Inbox Experience)

## Status

**Implemented (code only).**  
`deploymentPerformed: false` · `migrationApplied: false`

## Scope

User-facing Notification Center on top of Phase 32.0 foundation:

- Dedicated route `/notifications`
- Category filters, search, quick filters
- Cursor pagination + infinite scroll
- Bulk mark read/unread, pin/unpin, archive, delete
- Counters (unread, critical, high, pinned, archived, by category)
- Real-time refresh via `notifications:new`
- Navbar “Open Notification Center”
- Mobile “Full inbox” entry from existing shell

## Architecture

```
UI NotificationCenter
  → NotificationService.getPage / getSummary / bulkUpdate
  → GET /api/notifications (filters)
  → GET /api/notifications/summary
  → POST /api/notifications/bulk
```

Deep links use existing `getNotificationActionUrl` / `notificationRouting` helpers (web + Android).

## Key files

| Path | Role |
|------|------|
| `geezle/src/pages/NotificationCenter.tsx` | Full inbox UI |
| `geezle/src/services/notifications.ts` | Client page/query helpers |
| `geezle/src/App.tsx` | `/notifications` route |
| `geezle/src/components/Navbar.tsx` | Link to full center |
| `geezle/src/mobile/home/screens/MobileNotificationsScreen.tsx` | Full inbox CTA |
| `geezle-backend/.../NotificationService.ts` | Search/filters/pin/summary |
| `.../migrations/20260722150000_phase321_notification_inbox/` | Additive pin index |

## Deferred to 32.2+

- Preference matrix UI & digests
- Admin analytics dashboards
- Full producer migration of every emit site
