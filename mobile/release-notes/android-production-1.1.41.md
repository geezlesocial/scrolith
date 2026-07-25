# Scrolith Android 1.1.41 (51) - Production Release Notes

**Status:** Ready for manual Google Play upload
**Upload performed:** No

## Version

| Field | Value |
|-------|-------|
| versionName | 1.1.41 |
| versionCode | 51 |
| applicationId | com.scrolith.scrolith |
| minSdk | 24 |
| targetSdk | 36 |
| compileSdk | 36 |

## What's new

This release packages the latest production Scrolith web experience for Android:

- Branded Scrolith ringtone for incoming voice, video, and conference calls.
- Outgoing ringback while callers wait for participants to answer.
- Improved WebRTC call reliability with TURN-backed voice/video connectivity.
- Remote audio playback fixes for voice-only and video calls.
- Safer WebRTC signaling for SDP and ICE candidate exchange.
- Post background composer updates.
- Messaging stability updates, including URL rendering and internal navigation.
- Desktop and mobile header consistency updates inherited by the WebView shell.
- Scrolitha messaging availability fixes with the production Ollama-backed assistant configuration.

## Production targets

| Layer | Value |
|-------|-------|
| API | https://api.scrolith.com |
| App | https://scrolith.com |
| Backend revision | scrolith-backend-00180-wtc |
| Frontend revision (web) | scrolith-frontend-00370-yut |
| Web commit packaged | 513a5ac4 |

## Artifact

- Path: `mobile/release-artifacts/android-1.1.41/Scrolith-1.1.41-51-release.aab`
- Signed: release keystore (`scrolith-release.jks`, alias `scrolith`)
- Minify / shrink resources: enabled

## Play Console short notes (copy/paste)

```
Adds branded Scrolith ringtones for voice, video, and conference calls, improves real-time call audio/video reliability, and includes the latest messaging, URL rendering, post background, header, and Scrolitha production updates.
```

## Operator action

1. Open Google Play Console -> Scrolith -> Production or preferred track.
2. Create release and upload `Scrolith-1.1.41-51-release.aab`.
3. Paste the release notes above or the short notes block.
4. Review and roll out when ready.

Do not re-sign with a different upload key unless Play App Signing requires it.

## Rollback

Previous store package: `1.1.40` / versionCode `50` if still retained in Play.
