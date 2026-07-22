# Phase 32.3 — Testing

## Backend unit

`geezle-backend/src/__tests__/phase323.androidCrossDevice.unit.test.ts`

- Rich action catalogs (messaging, jobs, wallet, marketplace)  
- Lifecycle stage set + invalid rejection  
- Soft lifecycle record pre-migration  
- Sync snapshot shape  

Also retain 32.0 / 32.1 / 32.2 unit suites.

## Frontend unit / smoke

- `geezle/src/mobile/__tests__/notificationSync.unit.test.ts` — badge, conflict resolution, offline queue  
- `geezle/src/pages/__tests__/phase323.androidExcellence.smoke.test.ts` — contract strings  

## Manual matrix

| Case | Expect |
|------|--------|
| Android open push | Deep link to DM/job/wallet/etc. |
| Mark read on device A | Badge drops on web session via socket |
| Offline mark read | Queued; flushes on reconnect |
| Focus start | Other sessions receive `notifications:sync` |
| Device list | Shows platform/last seen; remove unregisters |
| Receipt open | Lifecycle row when migration applied |
| Channels | Existing v2 channels still present |

## Regression

Phases 22–32.2 paths: messaging groups, HV, inbox, preferences, digests — no route removals.

## Known gaps

- Full instrumented Android emulator suite not run in this implementation-only phase  
- Native NotificationCompat action buttons require optional plugin (actions still in data payload)  
