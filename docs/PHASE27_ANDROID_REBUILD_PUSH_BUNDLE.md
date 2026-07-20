# Phase 27 — Scrolith Android Rebuild, Push Notification Certification & Play Bundle Generation

**Status:** Complete (implementation + signed AAB)  
**Play upload:** **Not performed** → Phase 27A  
**Date:** 2026-07-20

## Release readiness

| Field | Value |
|-------|--------|
| productionFrontendRevision | `scrolith-frontend-00227-xud` |
| productionBackendRevision | `scrolith-backend-00164-vax` |
| androidFrontendCommit | `c4aacad1` (+ Phase 27 taxonomy/push hardening in same tree) |
| androidReleaseEligible | **true** |
| pendingReleaseDependency | **null** |

## Version

- **versionName:** 1.1.25  
- **versionCode:** 35  

## Signed AAB (upload paths)

```
C:\Projects\mobile\android\app\build\outputs\bundle\release\app-release.aab
C:\Projects\mobile\release-artifacts\android-1.1.25\Scrolith-1.1.25-35-release.aab
```

| Metric | Value |
|--------|--------|
| Size | 10,065,045 bytes |
| SHA-256 | `27920e1fbc78c1e282c308c9f5d30cdbe77daa74d988b642a79e1483808531f0` |
| Native debug symbols | NOT_AVAILABLE |

## Key changes

1. Sync latest certified web SPA into Capacitor Android (`scrolith.com` / https).  
2. Version 1.1.25 / 35; R8 + NDK SYMBOL_TABLE config.  
3. Shared `ANDROID_CHANNEL_DEFINITIONS`; private Messages lock-screen; Phase 27 type aliases.  
4. Source labels + deep-link unit certification.  
5. Icons: `ic_stat_scrolith` + adaptive launcher retained.

## Tests

`geezle` unit: **17/17 PASS** (`phase27AndroidPushTaxonomy` + messaging notifications).

## Next

**Phase 27A — Google Play Upload, Device Certification & Staged Rollout**

Full certification detail: `mobile/release-artifacts/android-1.1.25/PRODUCTION_CERTIFICATION.md`  
Gate: `geezle/playwright-results/phase27/completion-gate.json`
