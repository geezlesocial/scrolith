# Phase 20.5 — Google Play Release Guide

## Package to upload

`C:\Projects\mobile\release-artifacts\android-1.1.19\Scrolith-1.1.19-29-release.aab`

- versionCode: **29** (must be > store 24)  
- versionName: **1.1.19**  
- applicationId: **com.scrolith.scrolith**  
- SHA-256: `277a27bdd05a0514f03911aabeed3093bff50f345edc52b4ea7bb760afb9d8ac`

## Steps (operator)

1. Open Google Play Console → Scrolith → Production (or closed testing first).  
2. Create release → Upload AAB.  
3. Confirm Play App Signing accepts the upload key (existing CN=Scrolith).  
4. Paste release notes from `RELEASE_NOTES.md` (en-US block).  
5. Review permissions / data safety if prompted (camera, mic, notifications, location optional features).  
6. Roll out **staged** (e.g. 10% → 50% → 100%).  
7. Retain mapping if generated in future minified builds (currently minifyEnabled false).  

## Pre-upload validation checklist

- [x] versionCode > 24  
- [x] AAB non-zero  
- [x] jarsigner verified  
- [x] targetSdk 36  
- [x] production web bundled  
- [ ] Clean install on device (operator)  
- [ ] Upgrade from Play 1.1.14 (operator)  

## Not performed by automation

Play Console upload requires human authorization — **not uploaded in this phase**.
