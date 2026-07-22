# Phase 32.3 — Push Architecture

## Flow

```
NotificationService.emit / notifyUser
  → Delivery policy (32.2) for PUSH
  → sendPushToUser (FCM)
      → buildPushMessage
          category, channelId, deepLink
          actions (JSON rich action catalog)
          groupKey, conversationId, badgeCount
      → AndroidConfig
          channelId, sound, icon, color
          tag / collapseKey (conversation grouping)
          notificationCount (badge when provided)
          visibility private for message/security/wallet
  → DeviceToken tokens (platform-filtered)
```

## Channels

Unchanged Phase 25/29 enterprise map (`scrolith_*_v2`). Client still calls `PushNotifications.createChannel` on init.

## Rich actions

`resolveRichActions()` builds up to 4 actions. Serialized into FCM **data** (string JSON) so Capacitor web layer can route `actionId` on `pushNotificationActionPerformed`.

Supported action ids:

- `mark_read` / `read` → `POST /notifications/actions`  
- `archive` → bulk archive  
- `open_conversation` / `reply` / `view_job` / `view_order` / `view_wallet` / `open` → deep link navigation  

## Delivery receipts

Optional analytics-only lifecycle events (not messaging “seen”):

`delivered` · `displayed` · `opened` (+ `read` when mark-read action used)

Idempotent via `idempotencyKey`. Soft-skip if migration not applied.

## Device registration

`POST /notifications/device/register` accepts optional:

`deviceName`, `appVersion`, `pushStatus`, `notificationCapable`, `capabilities`

Falls back to legacy upsert when new columns are absent.

## Security

- Token ownership on unregister / list / remove  
- Full tokens never returned to clients (prefix only)  
- Deep links normalized to internal hosts / scrolith:// scheme  
