# Phase 32.3 — Android Notification Excellence & Cross-Device Synchronization

## Status

**Implemented (code only).**  
`deploymentPerformed: false` · `migrationApplied: false`

## Purpose

Make Scrolith notifications first-class on Android and across web + multi-session devices by extending Phases 32.0–32.2 — without replacing FCM, Capacitor, Android channels, or the Notification Center.

## Inventory (reuse, do not duplicate)

| Existing system | Extension |
|-----------------|-----------|
| Capacitor PushNotifications (`geezle/src/mobile/push.ts`) | Device metadata, lifecycle receipts, rich action ids, deeper deep-links |
| Android channels (Phase 25/29 `*_v2`) | Unchanged; still created on init |
| FCM `pushNotifications.ts` | Rich actions JSON, groupKey, badgeCount in data payload; collapseKey/tag grouping retained |
| DeviceToken | Additive metadata columns + list/remove APIs |
| Offline action queue | Dedicated notification offline queue key |
| Socket `notifications:new` | Plus `notifications:sync` and `notifications:badge` |
| Quiet hours / focus / prefs (32.2) | Synced via sync snapshot + focus broadcast |

## Android experience

- Existing multi-channel map preserved (messages, jobs, marketplace, security, wallet, …)
- Conversation collapse via FCM `collapseKey` / `tag` (prior) + `groupKey` data field
- Rich action catalog in push `data.actions` (mark read, archive, open conversation, view job/order/wallet)
- Priority remains high for interactive pushes
- Sound/vibration still channel-defined (immutable Android channel rules)
- Deep links cover DMs, groups, jobs, marketplace, wallet, support, security, profile, digests, Notification Center

## App-level quiet hours vs OS DND

App Focus Mode / Quiet Hours (Phase 32.2) do **not** override Android system Do Not Disturb. Documented in UI; OS DND remains user-controlled.

## Migration

`20260722170000_phase323_android_cross_device` — additive only, **not applied to production**.

## Deferred

- Phase 32.4 operations dashboard  
- Full native NotificationCompat action buttons (requires optional Capacitor local-notification bridge)  
- iOS-specific APNS category actions  

## Safety

No production deploy/migrate. Existing register/unregister APIs remain backward compatible.
