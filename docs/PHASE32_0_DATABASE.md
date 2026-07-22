# Phase 32.0 — Database

## Migration

`20260722140000_phase320_notification_center_foundation`

**Not applied in this phase.**

## Changes

### Extend `Notification` (inbox)

| Column | Type | Purpose |
|--------|------|---------|
| category | TEXT | Taxonomy |
| priority | TEXT | critical…silent |
| deepLink | TEXT | Destination |
| eventId | TEXT | Link to event log |
| idempotencyKey | TEXT | Per-user dedupe |
| entityType / entityId | TEXT | Target entity |
| schemaVersion | TEXT | `32.0` |
| archivedAt / deletedAt / readAt | TIMESTAMP | Inbox lifecycle |

Indexes for user+category, archive/delete filters, entity, event.

Partial unique index: `(userId, idempotencyKey)` where key not null.

### New tables

| Table | Purpose |
|-------|---------|
| NotificationEvent | Canonical emit log |
| NotificationDelivery | Channel attempts (in_app, push, …) |
| NotificationPreference | Per-user category overrides (extends UserSettings) |
| NotificationAudit | Emitted/delivered/read/archive/delete/fail |
| NotificationAnalyticsCounter | Daily metric counters for future dashboards |

## Reuse

- `Notification` remains the inbox source of truth for clients
- `DeviceToken`, templates, journey quiet hours untouched
- No destructive operations

## Rollback considerations

- Columns/tables are additive; app code degrades if migration absent
- Drop only via controlled future migration (not recommended)
