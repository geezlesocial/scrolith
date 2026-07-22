# Phase 32.6 — Badge Synchronization Certification

## Semantics certified (unit)

| Scenario | Result |
|----------|--------|
| Increment local badge | PASS |
| Decrement local badge | PASS |
| Higher sync version wins (multi-device) | PASS |
| Force recovery overwrites stale local | PASS |
| Sync snapshot fields (backend) | PASS (Phase 32.3/32.5 API) |

## Production path

| Path | Status |
|------|--------|
| `GET /api/notifications/sync-state` | Auth required (401 unauth) |
| Socket `notifications:sync` / `notifications:badge` | Deployed with BE 32.3+ |
| Offline queue flush on reconnect | Client `notificationSync.ts` live in FE |

## Physical multi-device visual badge

**DEFERRED** — requires ≥2 physical devices or emulator instances.

## Gate

- Logic/sync: **PASS**  
- Physical Android badge icon: **DEFERRED**  
