# Phase 32.2 — Notification Preferences & Digest APIs

All user routes require `authMiddleware`. Ownership is always the authenticated user.

## Preferences

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications/preferences` | Bundle: global, categories, event overrides, digest, focus, quiet hours, channels, precedence |
| PATCH | `/api/notifications/preferences` | Patch global prefs; optional `version` optimistic concurrency (409 on conflict) |
| PATCH | `/api/notifications/preferences/categories/:category` | Category channels + deliveryMode + minPriority |
| PATCH | `/api/notifications/preferences/events/:eventType` | Event override |
| POST | `/api/notifications/preferences/reset` | Reset user preference rows |
| POST | `/api/notifications/preferences/evaluate` | Dry-run delivery policy for self |

## Quiet hours (extended)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications/quiet-hours` | List active rules (existing) |
| POST | `/api/notifications/quiet-hours` | Create rule (existing) |
| PUT | `/api/notifications/quiet-hours` | Create/replace style save |
| DELETE | `/api/notifications/quiet-hours/:id` | Deactivate rule (existing) |

## Focus mode

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications/focus-mode` | Active session or null |
| POST | `/api/notifications/focus-mode` | Start session |
| DELETE | `/api/notifications/focus-mode` | Stop all active sessions |

### POST body

```json
{
  "durationMinutes": 60,
  "endsAt": null,
  "indefinite": false,
  "untilTomorrowMorning": false,
  "timezone": "Asia/Manila",
  "silencePush": true,
  "silenceEmail": false,
  "allowCritical": true,
  "allowSecurity": true,
  "allowedCategories": [],
  "allowedUserIds": [],
  "allowedConversationIds": []
}
```

Max duration: 7 days (admin default).

## Digests

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications/digest-settings` | Schedule |
| PUT | `/api/notifications/digest-settings` | Upsert schedule |
| GET | `/api/notifications/digests` | Recent digests |
| GET | `/api/notifications/digests/:digestId` | Digest + items |
| POST | `/api/notifications/digests/:digestId/mark-read` | Mark digest read |

## Admin (minimal)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/notifications/defaults` | Platform defaults / locks / flags |
| PUT | `/api/admin/notifications/defaults` | Update (audited) |
| POST | `/api/admin/notifications/defaults/reset` | Reset to code defaults |

Permissions: reuses `journeys.quiet_hours.read` / `.write`.

## Backward compatibility

- All Phase 32.0/32.1 inbox routes unchanged  
- Device register/unregister unchanged  
- Emit + create endpoints preserved  
- 503 with clear message when 32.2 tables are not migrated for write paths that need them  
