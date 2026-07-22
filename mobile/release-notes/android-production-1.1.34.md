# Scrolith Android 1.1.34 (44)

## Scope

Phase 32.5 production alignment — Notification Center client capabilities from Phases 32.0–32.4 (inbox deep links, preferences/settings routes, focus/quiet hours sync hooks, device registration metadata).

## Build

| Field | Value |
|-------|--------|
| versionName | 1.1.34 |
| versionCode | 44 |
| AAB | `mobile/release-artifacts/android-1.1.34/scrolith-1.1.34.aab` |
| SHA-256 | 42207058837E5B2BAE3E0B24996BE00237119D57D705AECFE0FE1DC5595EB617 |

## Backend dependency

Production API `api.scrolith.com` on revision `scrolith-backend-00216-lig` (Phase 32 migrations applied).

## Not included

- Play Store submission (operator-driven)
- Enabling digest worker (server env remains digest cron off until controlled enable)
