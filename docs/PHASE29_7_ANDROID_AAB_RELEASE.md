# Phase 29.7 — Android AAB 1.1.30 (40)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-22 |
| **versionName** | 1.1.30 |
| **versionCode** | 40 |
| **applicationId** | `com.scrolith.scrolith` |
| **AAB** | `mobile/release-artifacts/android-1.1.30/Scrolith-1.1.30-40-release.aab` |
| **Web commit (bundled)** | `4402ba14` (Message Privacy mobile fix + Phase 29 FE) |
| **API hosts** | `https://api.scrolith.com` / `https://scrolith.com` |

## SHA-256

See `mobile/release-artifacts/android-1.1.30/SHA256SUMS.txt` and `artifact-metadata.json`.

## Release notes

- Long form: `mobile/release-notes/android-production-1.1.30.md`
- Play “What’s new”: `mobile/release-notes/android-production-1.1.30.txt`

## Build command

```powershell
cd C:\Projects\mobile
powershell -ExecutionPolicy Bypass -File scripts\build-release-aab.ps1
```

## Scope

- Enterprise Messaging Groups (Phases 29.0–29.7) web bundle
- Message Privacy mobile stacking / inbox entry fix
- Production backend revision alignment (p297 / 00199-hef)

Manual Play Console upload — not auto-deployed.
