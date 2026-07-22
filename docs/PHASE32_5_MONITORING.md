# Phase 32.5 — Monitoring Notes

## Services

| Service | Revision | Tag |
|---------|----------|-----|
| scrolith-backend | scrolith-backend-00216-lig | p32 |
| scrolith-frontend | scrolith-frontend-00287-nul | p32 |

## Env safety

- `NOTIFICATION_DIGEST_CRON_ENABLED=false` on backend revision

## Watch

- Cloud Run request latency / 5xx for `/api/notifications*`
- Prisma / Cloud SQL connection errors
- FCM error rates (existing push path)
- Email provider errors (if digests later enabled)
- Instance CPU/memory for scrolith-backend

## Stop thresholds (operators)

- Sustained error rate > 2% on notification routes → traffic rollback to `00214-rid`
- Auth bypass or cross-user data exposure → immediate traffic rollback + incident

## Log queries (Cloud Logging)

```
resource.type="cloud_run_revision"
resource.labels.service_name="scrolith-backend"
resource.labels.revision_name="scrolith-backend-00216-lig"
severity>=ERROR
```

## Digest enable checklist (later)

1. Allowlisted test accounts only  
2. Set cron true on backend  
3. Watch digest metrics / email  
4. Expand cohort  
