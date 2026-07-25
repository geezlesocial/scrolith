# Scrolith Android 1.1.42 (52) - Production Release Notes

**Status:** Ready for manual Google Play upload
**Upload performed:** No

## Version

| Field | Value |
|-------|-------|
| versionName | 1.1.42 |
| versionCode | 52 |
| applicationId | com.scrolith.scrolith |
| minSdk | 24 |
| targetSdk | 36 |
| compileSdk | 36 |

## What's new

This release packages the latest production Scrolith experience for Android:

- Fixes uploaded media playback across post cards, stories, and Scroll by using durable production media storage and safer fallback URLs.
- Improves video retry behavior when a recent upload is reachable through an alternate Scrolith media endpoint.
- Hardens mobile voice and video calls with mobile-friendly camera constraints and reliable remote audio playback.
- Keeps branded Scrolith ringtone support for incoming voice, video, and conference calls.
- Includes the latest admin-managed messaging and video-call controls.
- Includes post background support and the latest responsive web/mobile UI updates.
- Preserves secure HTTPS production loading from `scrolith.com`.

## Production targets

| Layer | Value |
|-------|-------|
| API | https://api.scrolith.com |
| App | https://scrolith.com |
| Backend revision | scrolith-backend-mediafix2 |
| Frontend revision | scrolith-frontend-mediafix0726 |
| Backend commit | 67c3027b |
| Frontend commit | ca75c87b |

## Artifact

- Path: `mobile/release-artifacts/android-1.1.42/Scrolith-1.1.42-52-release.aab`
- Signed: release keystore (`scrolith-release.jks`, alias `scrolith`)
- Minify / shrink resources: enabled
- Google Play upload performed: No

## Play Console Short Notes

```
Fixes uploaded media playback in posts, stories, and Scroll, improves mobile voice/video call reliability, keeps Scrolith call ringtone support, and includes the latest post background, messaging, and admin video-call controls.
```

## Operator Action

1. Open Google Play Console -> Scrolith -> Production or preferred track.
2. Create a new release and upload `Scrolith-1.1.42-52-release.aab`.
3. Paste the release notes above or the short notes block.
4. Review and roll out when ready.

## Rollback

Previous store package: `1.1.41` / versionCode `51` if still retained in Play.
