# Phase 20.5 — Implementation Report

## Android

| Change | Detail |
|---|---|
| Version | code **29**, name **1.1.19** |
| Permissions | READ_MEDIA_IMAGES/VIDEO/AUDIO; READ_EXTERNAL_STORAGE maxSdk 32 |
| MainActivity | Disable WebView content debugging when not debuggable |
| Web bundle | Production Vite build + `cap sync android` |
| AAB | Signed release bundle generated |

## Web/FE (bundled)

| Change | Detail |
|---|---|
| uploads.ts | `assessCaptureQuality`, `pickAndUpload`, orientation correction, size guards |
| package version | 1.1.19 (desktop alignment) |
| Tests | phase205MobileUploads + 20.4.1 TDZ guards |

## Desktop

| Change | Detail |
|---|---|
| NSIS Setup | Scrolith-Desktop-Setup-1.1.19-x64.exe |
| Portable | Scrolith-Desktop-Portable-1.1.19-x64.exe |
| Checksums | desktop-dist/SHA256SUMS-1.1.19.txt |

## Not implemented (deferred)

- Play Console upload  
- GCS desktop publish (secret-gated)  
- ABR video pipeline  
- Native notification bubbles  
