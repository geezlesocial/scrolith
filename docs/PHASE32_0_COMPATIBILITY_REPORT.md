# Phase 32.0 — Compatibility Report

## Inventory (pre-implementation)

### Existing APIs (preserved)

| Route | Status |
|-------|--------|
| `GET /api/notifications` | Extended with filters; same response shape |
| `POST /api/notifications/mark-read` | Preserved; foundation path with NI fallback |
| `POST /api/notifications/mark-all-read` | Preserved |
| `POST /api/notifications/create` | Preserved authz; now uses `NotificationService.emit` |
| `GET /api/notifications/user/:userId` | Preserved (admin) |
| `GET/POST/DELETE /api/notifications/quiet-hours` | Unchanged |
| `POST /api/notifications/device/register` | Unchanged |
| `POST /api/notifications/device/unregister` | Unchanged |
| `POST /api/notifications/test/push` | Unchanged |

### New APIs (additive)

| Route | Purpose |
|-------|---------|
| `GET /api/notifications/summary` | Unread/total/archived counters |
| `GET /api/notifications/counters` | Alias of summary |
| `POST /api/notifications/mark-unread` | Unread bulk |
| `POST /api/notifications/bulk` | read/unread/archive/delete/restore |
| `POST /api/notifications/emit` | Canonical multi-recipient emit |

### Existing database

| Table / model | Role |
|---------------|------|
| `Notification` | Primary in-app inbox (extended additively) |
| `DeviceToken` | FCM/device registration |
| `NotificationTemplate` | Journey templates |
| `JourneyFlow` / steps | Journey engine |
| Quiet hour rules (journey) | Quiet hours API |

### Existing services (extended, not replaced)

| Service | Phase 32.0 relationship |
|---------|-------------------------|
| `notificationIntelligence/*` | Read façade + preferences/priority/delivery engines remain |
| `engagementNotifications.service` | Creates via `NotificationService.emit` with legacy fallback |
| `messageNotifications` | Unchanged (Phase 32.1+ can adopt emit) |
| `pushNotifications` | Still used by `notifyUser` / FCM |
| `notificationAndroidChannels` | Unchanged |
| `utils/notify.ts` | Still used for realtime + push fanout after inbox write |
| Admin Notification Journey Center | Unchanged |
| FE `NotificationContext`, taxonomy, mobile push | Compatible; client APIs extended |

### Android

- Channel ids and Capacitor push paths unchanged
- Deep links still carried in `meta.actionUrl` / `deepLink`
- No shell redesign

### Analytics / admin tools

- Journey templates + NI metrics remain
- Phase 32.0 adds best-effort `NotificationAnalyticsCounter` + `NotificationAudit` (no new dashboards)

## Backward compatibility guarantees

1. Existing list/mark-read clients continue to work without code changes.
2. `Notification` rows always include legacy fields: `userId`, `actorId`, `type`, `title`, `body`, `meta`, `isRead`, `createdAt`.
3. Producers that still call `prisma.notification.create` continue to work.
4. When Phase 32.0 migration is not applied, emit/list degrade to legacy columns (no hard failure for create path).
5. Phases 29–31 messaging, HV, system backup, and auth flows are not modified.

## Non-duplication

| Concern | Single owner after 32.0 |
|---------|-------------------------|
| Emit / create | `NotificationService.emit` (preferred) |
| List / mark | `NotificationService` → legacy when needed |
| Preference evaluation | NI preference service (future wiring) |
| Push channels | Existing Android channel service |
| Quiet hours | Existing journey quiet-hours routes |
