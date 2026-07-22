# Phase 32.0 — Enterprise Notification Center Foundation

## Status

**Implemented (code only).**  
`deploymentPerformed: false` · `migrationApplied: false`

## Purpose

Unify Scrolith notification producers behind a single enterprise facade without rewriting FCM, journey, NI engines, or Android channels.

## Architecture

```
Module producer
  → NotificationService.emit()
      → taxonomy (category, priority, deepLink)
      → idempotency / time-window dedupe
      → NotificationEvent (log)
      → Notification (inbox row)
      → NotificationDeliveryPolicy.evaluate()   [Phase 32.2]
          → DELIVER_NOW | QUEUE_FOR_DIGEST | DEFER | SUPPRESS
      → NotificationDelivery (in_app / push attempts)
      → NotificationAudit + analytics counters
      → notifyUser (socket + FCM) [existing]
      → Digest worker (scheduled) [Phase 32.2]
```

See also: `PHASE32_2_PREFERENCES_AND_DIGESTS.md`, `PHASE32_2_DELIVERY_POLICY.md`, `PHASE32_2_DIGEST_ENGINE.md`.

## Taxonomy categories

`personal` · `messaging` · `messaging_groups` · `jobs` · `marketplace` · `communities` · `business` · `wallet` · `security` · `support` · `system` · `admin`

## Priority

`critical` · `high` · `normal` · `low` · `silent`

## Key files

| Path | Role |
|------|------|
| `geezle-backend/src/services/notificationCenter/*` | Facade, taxonomy, analytics |
| `geezle-backend/src/controllers/notifications.controller.ts` | Extended APIs |
| `geezle-backend/src/routes/notifications.routes.ts` | Route wiring |
| `geezle-backend/src/services/engagementNotifications.service.ts` | Producer adoption |
| `geezle-backend/prisma/migrations/20260722140000_phase320_notification_center_foundation/` | Additive SQL |
| `geezle/src/services/notifications.ts` | Client extensions |

## What is deferred (32.1+)

- Full Notification Inbox UI redesign
- Digests / focus mode product UX
- Admin analytics dashboards
- Migrating every producer (messaging, wallet, gcoin, live, …)
- SMS channel

## Safety

- Additive schema only
- No production deploy/migrate in this phase
- Engagement notifications fall back to legacy create if emit fails
