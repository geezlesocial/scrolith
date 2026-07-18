# Phase 20.5 — Mobile Architecture Audit

## Stack

| Item | CURRENT | REQUIRED | Action |
|---|---|---|---|
| Wrapper | Capacitor 8 Android WebView | Keep | — |
| appId | com.scrolith.scrolith | Preserve | — |
| minSdk | 24 | ≥24 | CURRENT |
| target/compile SDK | 36 | Compliant | CURRENT |
| AGP | 8.13.0 | Compatible | CURRENT |
| Gradle | 8.14.3 wrapper | Compatible | CURRENT |
| versionCode (gradle before) | 26 | >24 Play, >28 local | **IMPLEMENT → 29** |
| versionName (gradle before) | 1.1.16 | Semantic next | **IMPLEMENT → 1.1.19** |
| Signing | key.properties + scrolith-release.jks | Signed AAB | **USED** |
| Cleartext | false release | HTTPS only | CURRENT |
| Capacitor host | scrolith.com https | Production origin | CURRENT |
| FCM | Firebase BOM + messaging | Channels | CURRENT |
| Camera plugin | @capacitor/camera 8 | Gallery + camera | **Enhanced FE** |
| Deep links | https scrolith.com + custom scheme | Keep | CURRENT |
| READ_MEDIA_* | Missing | Android 13+ | **IMPLEMENT** |
| WebView debug | Not forced off | Off in release | **IMPLEMENT** |
| 20.4.1 TDZ | Fixed on web main | Bundled in AAB | CURRENT |

## IMPLEMENT NOW (done)

1. versionCode 29 / versionName 1.1.19  
2. READ_MEDIA_IMAGES/VIDEO/AUDIO + legacy storage maxSdk 32  
3. WebView debugging disabled when not debuggable  
4. Capture quality assessment + gallery pick helpers  
5. Production web bundle sync into AAB  
6. Signed AAB generation + checksums  

## DEFER

| Item | Reason |
|---|---|
| Native bubble notifications | Product/native surface |
| Full ABR streaming | No manifest pipeline |
| Server multipart resumable | Backend phase |
| Play Console upload | Operator action |
| Device lab physical camera suite | Hardware-dependent |

## Risk

| Risk | Mitigation |
|---|---|
| Upload key self-signed | Expected for Play App Signing upload key |
| Capacitor core version drift desktop vs mobile | Desktop packaging warning only |
