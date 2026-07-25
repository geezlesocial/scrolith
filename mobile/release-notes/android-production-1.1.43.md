# Scrolith Android 1.1.43 (53) - Production Release Notes

**Status:** Ready for manual Google Play upload
**Upload performed:** No

## Version

| Field | Value |
|-------|-------|
| versionName | 1.1.43 |
| versionCode | 53 |
| applicationId | com.scrolith.scrolith |
| minSdk | 24 |
| targetSdk | 36 |
| compileSdk | 36 |

## What's New

This release packages the latest production Scrolith experience for Android:

- Hardens uploaded video handling across post cards, stories, and Scroll.
- Prevents missing storage objects from being advertised as playable videos.
- Preserves playback for valid uploaded videos with HTTP range streaming support.
- Improves inline video retry and fallback behavior in the mobile WebView.
- Keeps the latest post background, messaging, voice call, video call, ringtone, and admin video-control updates.
- Uses secure production endpoints only: `https://scrolith.com` and `https://api.scrolith.com`.

## Production Targets

| Layer | Value |
|-------|-------|
| API | https://api.scrolith.com |
| App | https://scrolith.com |
| Backend revision | scrolith-backend-videomedia2 |
| Frontend revision | scrolith-frontend-videomedia0726 |
| Backend commit | 5f48c59d |
| Frontend commit | 97972272 |

## Artifact

- Path: `mobile/release-artifacts/android-1.1.43/Scrolith-1.1.43-53-release.aab`
- SHA-256: `84254a395d718bc889f902f970ee7d0af775234ebf7f3ae825eecebb942005ac`
- Signed: release keystore (`scrolith-release.jks`, alias `scrolith`)
- Minify / shrink resources: enabled
- Google Play upload performed: No

## Play Console Short Notes

```
Improves uploaded video reliability in posts, stories, and Scroll, prevents broken playback for missing media, and includes the latest messaging, calls, ringtone, post background, and admin video-control updates.
```

## Operator Action

1. Open Google Play Console -> Scrolith -> Production or preferred track.
2. Create a new release and upload `Scrolith-1.1.43-53-release.aab`.
3. Paste the release notes above or the short notes block.
4. Review and roll out when ready.

## Rollback

Previous store package: `1.1.42` / versionCode `52` if still retained in Play.
