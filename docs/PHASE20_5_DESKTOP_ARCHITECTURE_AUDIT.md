# Phase 20.5 — Desktop Architecture Audit

## CURRENT

| Item | Value |
|---|---|
| Runtime | Electron 37 + electron-builder 26 |
| App ID | com.scrolith.desktop |
| Default URL | https://scrolith.com |
| Artifacts | NSIS Setup + Portable x64 |
| Update feed | https://storage.googleapis.com/downloads.scrolith.com/desktop/win |
| Website | https://scrolith.com/download (HTTP 200) |
| prior version | 1.1.14 packages present |
| **new version** | **1.1.19** packages built |

## IMPLEMENT NOW (done)

- Bump package version to 1.1.19  
- Build Setup + Portable installers  
- SHA-256SUMS-1.1.19.txt  

## DEFER

| Item | Reason |
|---|---|
| GCS publish via SA | Requires `GCP_DESKTOP_RELEASE_SA_KEY` operator secret |
| Code signing cert | Optional CSC_*; builds succeed; public trust needs org cert |
| Auto-update latest.yml bump | Publish step after GCS upload |

## Validation

| Check | Result |
|---|---|
| Setup exe exists non-zero | YES |
| Portable exe exists non-zero | YES |
| SHA-256 published locally | YES |
| Download page live | YES (scrolith.com/download) |
