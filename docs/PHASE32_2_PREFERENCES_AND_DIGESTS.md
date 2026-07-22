# Phase 32.2 — Notification Preferences, Quiet Hours & Digest Engine

## Status

**Implemented (code only).**  
`deploymentPerformed: false` · `migrationApplied: false`

## Purpose

Add user-controlled delivery policies, quiet hours, focus mode, and scheduled digests on top of Phase 32.0 emit + Phase 32.1 inbox — without replacing FCM, email, socket, quiet-hour rules, or Android channels.

## Architecture

```
Producer
  → NotificationService.emit()
  → NotificationDeliveryPolicy.evaluate({ userId, event, channel, … })
      → DELIVER_NOW
      → QUEUE_FOR_DIGEST
      → DEFER
      → SUPPRESS
  → Inbox / Push / Email
  → Audit / Analytics

Scheduler (node-cron */15)
  → NotificationDigestEngine.processDueDigests()
      → eligibility + grouping
      → NotificationDigest + items
      → in-app summary + sendSystemEmail
      → delivery receipt / audit
```

## Inventory / compatibility matrix

| Existing system | Reuse strategy |
|-----------------|----------------|
| `NotificationPreference` (32.0) | Extended with deliveryMode, minPriority, sound/vibration/preview, version |
| `QuietHourRule` + journey quiet-hours APIs | Primary quiet-hours store; PUT alias on `/api/notifications/quiet-hours` |
| NotificationIntelligence preferences | Unchanged; policy is additive gate on emit/push path |
| UserSettings email/in-app toggles | Still honored via legacy settings UI; 32.2 adds category/channel depth |
| FCM device registration | Unchanged (`/device/register`) |
| Android notification channels | Unchanged; app prefs do not override OS DND |
| Admin journey quiet hours | Extended with `/api/admin/notifications/defaults` |
| Email (`sendSystemEmail`) | Digest emails only |
| node-cron in `server.ts` | Digest worker + focus cleanup |
| Phase 26 localization | Email templates use safe HTML; deeper i18n deferred |
| Unsubscribe / preferences links | Digest footer → `/settings/notifications` |

## Preference hierarchy (highest → lowest)

1. Emergency platform policy  
2. Mandatory security policy  
3. Admin-enforced category policy  
4. User event-type override  
5. User category preference  
6. User device/channel preference  
7. Focus mode  
8. Quiet hours  
9. Digest mode  
10. Global pause (optional only)  
11. Default platform preference  

**Rule:** User preferences never suppress mandatory security or emergency alerts unless the security policy itself allows it (not in 32.2).

## Channels

| Channel | Status |
|---------|--------|
| IN_APP | Active |
| PUSH | Active |
| EMAIL | Active |
| SMS | Schema/hooks only — disabled |
| DESKTOP | Disabled |
| WEBHOOK | Disabled |

## Key files

| Path | Role |
|------|------|
| `notificationCenter/delivery/NotificationDeliveryPolicy.ts` | Policy engine |
| `notificationCenter/preferencesUser.service.ts` | User prefs CRUD |
| `notificationCenter/focusMode.service.ts` | Focus sessions |
| `notificationCenter/digestEngine.service.ts` | Schedules, worker, email |
| `notificationCenter/adminDefaults.service.ts` | Admin defaults |
| `controllers/notificationPreferences.controller.ts` | HTTP handlers |
| `routes/notifications.routes.ts` | User APIs |
| `routes/admin/notification-defaults.routes.ts` | Admin defaults |
| `prisma/migrations/20260722160000_phase322_preferences_digests/` | Additive SQL |
| `geezle/src/pages/settings/NotificationSettings.tsx` | Settings UI |
| `geezle/src/pages/NotificationCenter.tsx` | Focus control + settings link |

## Deferred

- Phase 32.3 Android notification excellence  
- Phase 32.4 ops dashboard  
- SMS / desktop / webhook delivery  
- Full i18n of digest templates  

## Safety

- Additive schema only  
- No production deploy or migration apply in this phase  
- Existing `/api/notifications` inbox routes preserved  
