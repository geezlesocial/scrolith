# Phase 20.5 — Continuity Audit

## Completed baseline (do not redo)

| Phase | Status |
|---|---|
| 20.2.8 Certification | COMPLETE |
| 20.3 Growth Intelligence | COMPLETE · BE `00114-bay` |
| 20.4 Workspace | COMPLETE · features retained |
| 20.4.1 TDZ incident | RESOLVED · FE `00143-leb` p2041 |

## Production traffic (start of 20.5)

| Service | Revision | Tag |
|---|---|---|
| Frontend | scrolith-frontend-00143-leb | p2041 |
| Backend | scrolith-backend-00114-bay | (20.3) |
| Broken FE | 00140-zaq p204 | **0% only** |
| Rollback FE | 00138-ruh p203 | Reachable |

## Play Console baseline (operator-reported)

| Field | Value |
|---|---|
| versionCode | 24 |
| versionName | 1.1.14 |
| Target SDK | 36 |

## Local release history (authoritative for next code)

| versionName | versionCode | Notes |
|---|---|---|
| 1.1.14 | 24 | Play listed |
| 1.1.16 | 26 | Was in build.gradle |
| 1.1.17 | 27 | release-artifacts |
| 1.1.18 | 28 | Signed AAB, not uploaded |
| **1.1.19** | **29** | **Phase 20.5 production AAB** |

## Starting commits

| Tree | Branch | SHA |
|---|---|---|
| geezle | release/android-desktop-1.1.19 (from main) | 3f69246a+ |
| monorepo | release/backend-production | 0d737a74+ |
