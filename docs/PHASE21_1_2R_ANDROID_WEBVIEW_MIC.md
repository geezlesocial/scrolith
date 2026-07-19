# Phase 21.1.2R — Android WebView Microphone

## Manifest

- RECORD_AUDIO
- MODIFY_AUDIO_SETTINGS

## MainActivity (1.1.23 / 33)

- `onPermissionRequest` → origin trust check (scrolith.com, *.scrolith.com, Cloud Run FE, localhost/capacitor)
- Request runtime RECORD_AUDIO / CAMERA as needed
- Grant only `RESOURCE_AUDIO_CAPTURE` / `RESOURCE_VIDEO_CAPTURE` matching approval
- Deny untrusted origins and non-capture resource requests

## Version

- versionName 1.1.23
- versionCode 33
