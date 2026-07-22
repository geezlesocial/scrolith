# Phase 32.2 — Delivery Policy Engine

## API

```ts
NotificationDeliveryPolicy.evaluate({
  userId,
  eventType,
  category,
  channel,
  priority?,
  timestamp?,
  actorId?,
  conversationId?,
  isMandatorySecurity?,
  isEmergencySystem?,
  deviceId?,
  timezone?
}): Promise<DeliveryPolicyDecision>
```

## Decision shape

```json
{
  "allowed": true,
  "action": "DELIVER_NOW | QUEUE_FOR_DIGEST | SUPPRESS | DEFER",
  "reason": "string",
  "effectivePreferenceSource": "string",
  "nextEligibleAt": "ISO date optional",
  "deliveryMode": "immediate | digest | priority_only | muted",
  "channel": "PUSH",
  "category": "messaging",
  "eventType": "messaging.direct_message"
}
```

## Evaluation steps

1. **Future channel** → `SUPPRESS` / `channel_not_available`  
2. **Emergency system event** → `DELIVER_NOW`  
3. **Mandatory security event** → `DELIVER_NOW`  
4. Load global / category / event prefs + focus + quiet hours (graceful if tables missing)  
5. **Admin locks** (e.g. security force immediate)  
6. **Event override** (muted / channel flags / deliveryMode / minPriority)  
7. **Category** (channel enabled, minPriority, deliveryMode)  
8. **Focus mode** — silence push/email with exceptions for critical/security/categories/people/conversations  
9. **Quiet hours** — timezone-aware; supports midnight-crossing windows; optional critical/high pass-through  
10. **Digest mode** — `QUEUE_FOR_DIGEST` when category/event deliveryMode is digest  
11. **Global pauseOptional** — suppress optional only  
12. **Default** → `DELIVER_NOW`  

## Quiet hours timezone

- Prefer stored user timezone (`NotificationGlobalPreference.timezone`)  
- Else rule timezone on `QuietHourRule`  
- Else request `timezone` input  
- Else `UTC`  
- **Never** silently override a stored user timezone with IP geo in this phase  

## Midnight crossing

`start > end` (e.g. 22:00–07:00) is treated as overnight: minute-of-day is in window if `≥ start OR < end`.

## Emit integration

`NotificationService.emit` evaluates policy for **PUSH** before FCM; in-app realtime still emitted when inbox row is created so the Notification Center remains current even if push is deferred/suppressed.

## Testability

Unit tests cover emergency, mandatory security, future channels, and helper predicates without DB. Full preference paths degrade safely when Phase 32.2 tables are not migrated.
