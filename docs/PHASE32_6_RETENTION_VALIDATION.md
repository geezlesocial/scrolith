# Phase 32.6 — Retention Validation

## Dry run (production)

| Field | Value |
|-------|--------|
| Script | `geezle-backend/scripts/phase326-retention-dry-run.mjs` |
| Evidence | `docs/evidence/phase326_retention_dry_run.json` |
| dryRun | true |
| success | true |

### Candidates (older than windows)

| Table | Candidates |
|-------|------------|
| NotificationEvent | 0 |
| NotificationDelivery | 0 |
| NotificationAudit | 0 |
| NotificationLifecycleEvent | 0 |
| NotificationDigest | 0 |
| NotificationAnalyticsCounter | 0 |
| Notification inbox (NOT purged) | 185 total |

**Purge candidate sum: 0** (safe)

## Windows (defaults)

| Key | Days |
|-----|------|
| notificationEventsDays | 90 |
| deliveryLogsDays | 60 |
| auditLogsDays | 180 |
| analyticsSummariesDays | 365 |
| digestsDays | 90 |
| lifecycleEventsDays | 60 |

## Kill switch

| Env | Value in production |
|-----|---------------------|
| `NOTIFICATION_RETENTION_PURGE_ENABLED` | **false** |

Execute path refuses when kill switch off (unit PASS).

## Worker enablement decision

Because:

1. Dry-run shows **zero** purge candidates  
2. Kill switch remains off until operator chooses  

**retentionWorkerEnabled = DEFERRED** (safe: dry-run PASS, worker not required until data ages)

To enable later (conservative daily 03:15 UTC):

```bash
gcloud run services update scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --update-env-vars=NOTIFICATION_RETENTION_PURGE_ENABLED=true,NOTIFICATION_RETENTION_CRON="15 3 * * *"
```

Inbox `Notification` rows are **never** deleted by the 32.6 purge service.
