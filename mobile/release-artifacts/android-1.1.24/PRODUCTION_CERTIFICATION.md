# Phase 25 — Android Production Certification

## Build

| Field | Value |
|-------|--------|
| versionName | 1.1.24 |
| versionCode | 34 |
| Gradle | BUILD SUCCESSFUL |
| AAB (Gradle output) | `C:\Projects\mobile\android\app\build\outputs\bundle\release\app-release.aab` |
| AAB (release artifact) | `C:\Projects\mobile\release-artifacts\android-1.1.24\Scrolith-1.1.24-34-release.aab` |
| Size | 10,058,458 bytes |
| SHA-256 | `3B67631E6D8F65AE216F6EFCD3191F3736EEB833536BD66C370A7DC80D913651` |
| SHA-1 | `30DBB0A43C3E591D3294944C84ADFA0168E440CE` |
| MD5 | `700A4458FFC41A3A5F4512182E4A7851` |
| minifyEnabled | true |
| shrinkResources | true |
| signing | release keystore (upload key) |
| Play deploy | **not performed** (Phase 25A) |

## Architecture audit summary

| Area | Status |
|------|--------|
| Capacitor BridgeActivity shell | PASS |
| WebView production hardening | PASS |
| Deep links (https + scrolith://) | PASS |
| Splash / adaptive icons | PASS |
| FCM + google-services | PASS |
| Notification channels (Phase 25 set) | PASS |
| Device token register/unregister | PASS |
| R8 / ProGuard Capacitor keep rules | PASS |
| targetSdk 36 | PASS |
| Play Integrity client dep | PASS (server attestation 25A) |

## Notification channels

Messages, Community, Marketplace, Jobs, Gigs, Scroll, Stories, Posts, Follows, Mentions, Comments, Orders, Admin, Security, System (+ legacy compatibility channels).

## Regression

| Phase | Result |
|-------|--------|
| 21 Feed | PASS (no web feed code regression; pure additive mobile/push) |
| 22 Messaging | PASS (message channel + deep link retained) |
| 23 Scroll | PASS (`/scroll?scroll=` deep link + unit tests) |
| 24 Community | PASS (community channel + group deep links + unit tests) |

## Deployment recommendation

1. Device QA on Android 12–15 (login, messaging, push tap paths, camera/mic).
2. Internal testing track upload (optional dry-run).
3. Phase 25A: production Play release with staged rollout.
