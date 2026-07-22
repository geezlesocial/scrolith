# Phase 32.6 — Production Monitoring

## Live revisions

| Service | Revision | Traffic |
|---------|----------|---------|
| scrolith-backend | scrolith-backend-00221-qam | 100% |
| scrolith-frontend | scrolith-frontend-00292-dux | 100% |

## Feature flags / env (final operational)

| Key | Value |
|-----|--------|
| NOTIFICATION_DIGEST_CRON_ENABLED | true |
| NOTIFICATION_DIGEST_REQUIRE_ALLOWLIST | true |
| NOTIFICATION_DIGEST_ALLOWLIST | (empty) |
| NOTIFICATION_RETENTION_PURGE_ENABLED | false |
| Campaigns unrestricted | not executed |
| Emergency broadcast | not executed |

## Watch signals

```
resource.type="cloud_run_revision"
resource.labels.service_name="scrolith-backend"
resource.labels.revision_name="scrolith-backend-00221-qam"
textPayload=~"processDueDigests|retentionPurge|digest"
```

| Metric | Expected (current cohort) |
|--------|---------------------------|
| Digest processed | 0 (empty allowlist) |
| Email digest failures | 0 |
| Queue depth | low |
| API health | 200 |
| 5xx on /api/notifications | near 0 |

## Incident response

1. Set `NOTIFICATION_DIGEST_CRON_ENABLED=false`  
2. Optionally traffic-roll to `scrolith-backend-00216-lig` or `00214-rid`  
3. Preserve audit / logs  

## Observation window

Activation completed 2026-07-22. Continuous monitoring via Cloud Run metrics; no incidents during activation window.
