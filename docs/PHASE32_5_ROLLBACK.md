# Phase 32.5 — Rollback Plan

## Prefer traffic rollback (minutes)

### Backend

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 \
  --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00214-rid=100
```

### Frontend

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 \
  --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00285-wep=100
```

## Feature safety without code rollback

```bash
# Keep digests off
gcloud run services update scrolith-backend \
  --region=asia-southeast1 \
  --project=scrolith-500821 \
  --update-env-vars=NOTIFICATION_DIGEST_CRON_ENABLED=false
```

Do **not** send campaigns or emergency broadcasts while diagnosing.

## Database

| Asset | Value |
|-------|--------|
| Pre-deploy backup | `1784691767121` |
| Description | `phase325-pre-deploy-20260722-114243` |
| Instance | `scrolith-postgres-prod` |

**Guidance:** Phase 32 migrations are additive. Rolling back application code without dropping tables is the preferred path. Full restore is last resort and requires maintenance window + approval.

## Triggers for rollback

- Sustained 5xx spike on `/api/notifications*`  
- Auth/ownership failures  
- Uncontrolled email/push fan-out  
- Database integrity issues  
- Migration-related Prisma errors at scale  

## Contacts

Authorized operators: Cloud project `scrolith-500821` owners / release engineer on duty.
