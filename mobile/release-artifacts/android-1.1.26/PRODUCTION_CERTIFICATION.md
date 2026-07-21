# Phase 29 Production Certification — Android 1.1.26 (36)

**Date:** 2026-07-21  
**Package:** `com.scrolith.scrolith`  
**deploymentPerformed:** `false`

## Build

| Check | Result |
|-------|--------|
| Frontend sync | `npm run android:sync` SUCCESS (geezle production Vite build + cap sync) |
| Gradle | `clean bundleRelease` **BUILD SUCCESSFUL** (~5m 51s, JDK 21) |
| Signing | release keystore `scrolith-release.jks` / alias `scrolith` |
| jarsigner | **jar verified** |

## Artifact

| Field | Value |
|-------|--------|
| versionName | 1.1.26 |
| versionCode | 36 |
| AAB path | `C:\Projects\mobile\android\app\build\outputs\bundle\release\app-release.aab` |
| Release copy | `C:\Projects\mobile\release-artifacts\android-1.1.26\Scrolith-1.1.26-36-release.aab` |
| Size (bytes) | 10086990 |
| SHA-256 | 19c2ab335dc684e3ca34f37c546d41b9b113a4ae66082fae0314c06e925d7a90 |
| mapping.txt | `C:\Projects\mobile\release-artifacts\android-1.1.26\mapping.txt` |
| native-debug-symbols.zip | NOT_AVAILABLE |

## Sound

| Field | Value |
|-------|--------|
| Resource file | `res/raw/scrolith.wav` |
| Resource name | `scrolith` |
| Pronunciation | Scroll it |
| Duration | ~0.88s |
| Channel sound | set on all v2 createChannel + FCM android.notification.sound |

## Channels

Active delivery uses `scrolith_*_v2` (Phase 29 sound migration). Legacy `*_v1` and short ids retained on device. Default FCM channel: `scrolith_alerts_v2`.

## Production origin

- Capacitor: `https` + `scrolith.com`
- Cleartext: false for production domains
- No debug keystore in release

## Device lab

Physical multi-device / live FCM sound: **Phase 29A**.

## Upload

**Do not upload in Phase 29.** Use this AAB in Phase 29A Play Console upload.
