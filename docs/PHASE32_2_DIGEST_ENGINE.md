# Phase 32.2 — Digest Engine

## Flow

```
node-cron (*/15)
  → NotificationDigestEngine.processDueDigests(limit=50)
      → cleanupExpired focus sessions
      → load enabled NotificationDigestSchedule rows
      → isScheduleDue(schedule, now)  // timezone-aware 15-min window
      → buildAndDeliverForUser(userId, mode, periodStart, periodEnd, schedule)
          → idempotencyKey = sha256(userId|mode|start|end)
          → skip if digest exists
          → select notifications in period
          → isEligibleForDigest
          → groupItems
          → create NotificationDigest + NotificationDigestItem
          → in-app emit system.digest_ready
          → sendSystemEmail (HTML + text fallback)
          → update schedule lastRunAt / lastRunKey
          → audit + metrics
```

## Modes

| Mode | Default local time | Period window |
|------|--------------------|---------------|
| off | — | — |
| morning | 08:00 | ~16h lookback |
| evening | 19:00 | ~16h lookback |
| daily | 09:00 | ~24h lookback |
| weekly | Mon 09:00 (configurable day) | ~7d lookback |

## Eligibility

Excluded from digests:

- Critical priority (normally immediate)  
- Mandatory security / emergency event types  
- Deleted notifications  
- Already-read (unless `includeRead`)  

## Grouping

Group key: `category:entityType:entityId` or `category:type`.  
Multiple rows collapse to `"N updates: {title}"` with count metadata.

## Idempotency & safety

- Unique `idempotencyKey` on `NotificationDigest`  
- `lastRunAt` cooldown prevents duplicate runs across DST/same window  
- Empty digests are **not** emailed (metric `digest_empty`)  
- Missing tables → soft skip (`migration_required`)  
- Bounded batch size (50 users / tick, 200 notifications / user)  
- HTML escaping for email body  

## Env

| Variable | Default | Purpose |
|----------|---------|---------|
| `NOTIFICATION_DIGEST_CRON_ENABLED` | `true` | Disable worker without code change |
| `SCHEDULE_TIMEZONE` | `UTC` | Cron process timezone (user schedules still use their own TZ) |

## Email content

- Greeting with user name  
- Mode + counts  
- Grouped items (capped)  
- Deep link to Notification Center  
- Manage preferences link  
- No highly sensitive raw message bodies beyond preview policy  

## In-app

Digest does **not** replace the inbox. A low-priority `system.digest_ready` notification links to `/notifications?digest={id}`.
