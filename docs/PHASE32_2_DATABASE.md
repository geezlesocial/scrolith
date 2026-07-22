# Phase 32.2 — Database

## Migration

**File:** `geezle-backend/prisma/migrations/20260722160000_phase322_preferences_digests/migration.sql`  

**Rules:** Additive only. Not applied to production in this phase.

## Schema changes

### Extended: `NotificationPreference`

| Column | Type | Default |
|--------|------|---------|
| deliveryMode | TEXT | `immediate` |
| minPriority | TEXT | `normal` |
| soundEnabled | BOOLEAN | true |
| vibrationEnabled | BOOLEAN | true |
| previewEnabled | BOOLEAN | true |
| version | INTEGER | 1 |

### New tables

| Table | Purpose | Key constraints |
|-------|---------|-----------------|
| NotificationEventPreference | Per-event overrides | UNIQUE (userId, eventType) |
| NotificationGlobalPreference | Global user settings | UNIQUE (userId) |
| NotificationFocusSession | Focus sessions | INDEX (userId, active), (endsAt) |
| NotificationDigestSchedule | Per-user schedule | UNIQUE (userId) |
| NotificationDigest | Generated digests | UNIQUE (idempotencyKey) |
| NotificationDigestItem | Digest line items | INDEX (digestId) |
| NotificationSuppression | Deferred/suppressed audit | INDEX (userId, createdAt), (nextEligibleAt) |

## Timezone storage

- Quiet hours: `QuietHourRule.timezone` + optional `NotificationGlobalPreference.timezone`  
- Digests: `NotificationDigestSchedule.timezone` and `NotificationDigest.timezone`  
- Never store wall-clock schedule without timezone context  

## Rollback

1. Stop digest cron (`NOTIFICATION_DIGEST_CRON_ENABLED=false`)  
2. Revert application code  
3. New tables may remain empty; optional DROP only in non-production after approval  
4. Extended columns on `NotificationPreference` are nullable-defaulted; safe to leave  

## Prisma client

Models mirrored in `schema.prisma`. Runtime services use `(prisma as any)` for graceful pre-migration operation.
