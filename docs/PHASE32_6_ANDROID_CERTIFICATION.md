# Phase 32.6 — Android Certification

## Devices available in this environment

| Source | Result |
|--------|--------|
| `adb devices` | **No devices attached** |
| Android emulator AVDs | **None listed** |
| Physical lab | **Not available** |

Therefore **physical device certification is DEFERRED** for operator lab.

## Artifacts ready for lab

| Item | Value |
|------|--------|
| versionName | 1.1.34 |
| versionCode | 44 |
| AAB | `mobile/release-artifacts/android-1.1.34/scrolith-1.1.34.aab` |
| SHA-256 | `42207058837E5B2BAE3E0B24996BE00237119D57D705AECFE0FE1DC5595EB617` |
| Backend | api.scrolith.com · `scrolith-backend-00221-qam` |

## Lab checklist (operator)

Minimum OS: Android 11–15.

- [ ] FCM registration after login  
- [ ] Notification permission grant/deny  
- [ ] Push delivery foreground/background  
- [ ] Notification open → deep link  
- [ ] Grouping / channel routing  
- [ ] Badge increment/decrement  
- [ ] Mark read / archive (rich action or in-app)  
- [ ] Offline queue flush on reconnect  
- [ ] Focus Mode sync  
- [ ] Quiet Hours sync  
- [ ] Device list / remove in Settings  

## Code / static certification performed

| Area | Result |
|------|--------|
| Deep-link matrix unit (12+ cases) | **PASS** |
| Badge conflict / force recovery unit | **PASS** |
| Production AAB signed build | **PASS** (Phase 32.5) |
| FCM/device APIs auth-gated in production | **PASS** (401 unauth) |

## Final gate value

`androidPhysicalCertification`: **DEFERRED** (no attached device/emulator)  
`androidDeepLinksCertified`: **PASS** at routing layer (unit matrix + support fix); physical DEFERRED  
