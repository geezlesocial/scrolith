# Phase 32.6 — Digest Worker Controlled Rollout

## Timeline (UTC 2026-07-22)

| Step | Action | Result |
|------|--------|--------|
| T0 | Pre-check: cron disabled, 0 enabled schedules in prod | PASS |
| T1 | Ship allowlist + require-allowlist gate in digest engine | PASS |
| T2 | Deploy BE `00221-qam` with cron **on**, require allowlist **on**, allowlist **empty** | PASS |
| T3 | Traffic 10% → 50% → 100% | Health 200 |
| T4 | Rollback path: env toggle cron false → true | PASS (new revs created; live restored to controlled state) |
| T5 | Observation: enabled schedules still 0; no fan-out | PASS |

## Validation matrix (code + prod config)

| Check | Result |
|-------|--------|
| Morning/evening/daily/weekly due windows | Unit PASS |
| Timezone-aware localParts | Unit PASS |
| Quiet Hours / Focus interaction (policy) | Unit PASS (security DELIVER_NOW) |
| Security bypass digest eligibility | Unit PASS |
| Duplicate prevention (lastRunAt cooldowns) | Unit PASS |
| Empty digest suppression | Engine skips empty (no email) |
| HTML escape + prefs link | Unit PASS |
| Allowlist empty + require → 0 processed | Unit PASS |
| Prod enabled schedules count | **0** (dry-run evidence) |

## Email / queue monitoring

With allowlist empty:

- Expected processed = 0 every 15 minutes  
- No production emails from digest worker  

## Expand criteria

1. Add internal user IDs to `NOTIFICATION_DIGEST_ALLOWLIST`  
2. Those users enable a digest schedule in settings  
3. Observe one full cycle without duplicates  
4. Expand allowlist or set `*`  

## Disable (instant)

```bash
gcloud run services update scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --update-env-vars=NOTIFICATION_DIGEST_CRON_ENABLED=false
```
