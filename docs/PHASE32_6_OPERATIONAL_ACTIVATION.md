# Phase 32.6 — Enterprise Notification Operational Activation

## Status

**Operational activation complete** (with honest residual DEFERRED items for physical device lab).

| Field | Value |
|-------|--------|
| Date | 2026-07-22 |
| New features | **None** (activation + minimal safety gates only) |
| Phase 33 | **Not started** |
| phase32Closed | **true** (with residual physical lab follow-up) |

## What changed in production

| Control | Value |
|---------|--------|
| Digest cron | **ENABLED** (`NOTIFICATION_DIGEST_CRON_ENABLED=true`) |
| Digest allowlist required | **true** (`NOTIFICATION_DIGEST_REQUIRE_ALLOWLIST=true`) |
| Digest allowlist IDs | **empty** → processes **0** users until IDs added |
| Retention purge | **DISABLED** (`NOTIFICATION_RETENTION_PURGE_ENABLED=false`) |
| Emergency broadcast | **Not sent** |
| Unrestricted campaigns | **Not sent** |

## Backend / Frontend revisions

| Service | Revision | Notes |
|---------|----------|--------|
| Backend (live 100%) | `scrolith-backend-00221-qam` | p32 image + digest allowlist gate |
| Frontend (live 100%) | `scrolith-frontend-00292-dux` | deep-link support precedence fix |
| Prior BE (rollback) | `scrolith-backend-00216-lig` / `00214-rid` | |

## Safety gates added (operational, not product features)

1. **Digest allowlist** — env filter so cron can run without fan-out  
2. **Retention dry-run script** — `scripts/phase326-retention-dry-run.mjs`  
3. **Retention purge kill switch** — execute only when `NOTIFICATION_RETENTION_PURGE_ENABLED=true`  
4. **Deep-link fix** — support/security before generic `reply` heuristic  

## Expand digest cohort (operator)

```bash
# Example: allow internal user IDs only
gcloud run services update scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --update-env-vars="NOTIFICATION_DIGEST_ALLOWLIST=userId1,userId2,NOTIFICATION_DIGEST_REQUIRE_ALLOWLIST=true,NOTIFICATION_DIGEST_CRON_ENABLED=true"

# Full production (after observation)
gcloud run services update scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --update-env-vars="NOTIFICATION_DIGEST_ALLOWLIST=*,NOTIFICATION_DIGEST_REQUIRE_ALLOWLIST=false"
```

Users still need an **enabled** digest schedule (`mode != off`) to receive digests.

## Residual lab work

- Physical Android devices (none attached in this environment)  
- Device-lab badge visual verification  
- Device-lab deep-link cold/warm/background matrix  

Code-level deep-link + badge certification: **PASS** (unit matrix).
