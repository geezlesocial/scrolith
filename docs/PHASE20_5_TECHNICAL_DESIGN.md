# Phase 20.5 — Technical Design

## Goals

1. Ship production Android AAB **versionCode 29 / 1.1.19** bundling certified web (p2041 + media polish).  
2. Ship desktop installers **1.1.19** for website distribution.  
3. Improve media capture reliability without replacing Capacitor media stack.  

## Architecture decisions

| Decision | Rationale |
|---|---|
| Keep Capacitor | Existing production architecture; no migration plan |
| Bundle production web dist | Matches Cloud Run FE behavior for dashboards |
| Upload key signing | Existing `key.properties` / Play App Signing model |
| No backend deploy | Not required for AAB/desktop delivery |
| Soft AI for media | Heuristic size/quality checks only — no heavy models |

## Components changed

- `mobile/android/app/build.gradle` — version  
- `AndroidManifest.xml` — media permissions  
- `MainActivity.java` — WebView debug off in release  
- `geezle/src/mobile/uploads.ts` — quality + gallery  
- `geezle/package.json` — version 1.1.19  
- Release scripts/artifacts under `mobile/release-artifacts/android-1.1.19`  
- Desktop under `geezle/desktop-dist`  
