# Phase 31 — Rollback

## When to rollback immediately

- Migration failure (this phase’s migrations already completed successfully)
- Authentication failure spike
- Socket instability
- Data corruption indicators
- Critical 5xx spike
- Search/permission regression
- HV unexpectedly blocking auth (should not happen while master off)

## Application traffic rollback (preferred)

Traffic only — no schema drop.

### Backend → prior

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 \
  --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00207-tew=100
```

### Frontend → prior

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 \
  --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00279-xug=100
```

| Service | Phase 31 | Prior rollback |
|---------|----------|----------------|
| Backend | `scrolith-backend-00210-sih` | `scrolith-backend-00207-tew` |
| Frontend | `scrolith-frontend-00281-qik` | `scrolith-frontend-00279-xug` |

Evidence file: `docs/evidence/phase31_rollback_revisions.json`.

## Database

| Migration | Rollback approach |
|-----------|-------------------|
| Phase 29.1 / 29.5 | **Do not drop** — already live before Phase 31; additive only |
| Phase 30 HV tables | **Do not drop** in emergency; leave tables idle with master disabled. Table drop is last-resort offline maintenance only |

Cloud SQL backup for restore-if-catastrophic:

- Backup ID `1784679551715` (`phase31-pre-deploy-20260722-081908`)

Restore is a controlled DBA operation (instance-level) — not a routine rollback.

## Feature-level disable (faster than traffic rollback)

| Issue | Action |
|-------|--------|
| HV misconfiguration | Keep / set Master Enable = false; Emergency Disable = true |
| Messaging groups bug | Prefer traffic rollback to prior BE/FE |

## Android

Play Console can halt rollout of AAB 1.1.33 and retain previous track (1.1.32).

## Verification after rollback

1. GET `https://api.scrolith.com/api/health` → 200  
2. Login page loads  
3. Messages privacy unauth → 401  
4. Confirm traffic % on prior revisions  

## Rollback verified

Rollback commands and prior revision IDs were captured **before** promote. Traffic rollback is reversible by re-applying:

```bash
--to-revisions=scrolith-backend-00210-sih=100
--to-revisions=scrolith-frontend-00281-qik=100
```
