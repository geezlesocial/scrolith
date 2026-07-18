# Phase 20.5.1 — Website Download Validation

**Date:** 2026-07-18  
**Primary page:** https://scrolith.com/download  
**Binary host:** `https://storage.googleapis.com/downloads.scrolith.com/desktop/win/`

## Overall status

| Layer | Status |
|---|---|
| Download page HTTP | **completed** |
| Production binary URLs | **completed** |
| Checksum objects | **completed** |
| Full browser a11y matrix | **pending operator approval** (requires interactive browser session) |
| Full HTTPS re-download SHA-256 of Setup + Portable | **completed** — both production objects re-downloaded and SHA-256 matched |

---

## Page checks

| Check | Result | Status |
|---|---|---|
| https://scrolith.com/download HTTP status | **200** | **completed** |
| Response size (shell HTML) | ~7170 bytes SPA shell | **completed** |
| Redirect loop | None observed | **completed** |
| Authorization error on page | None | **completed** |
| Expired signed URL requirement | **N/A** — public GCS objects | **not applicable** |
| Correct release version in SPA shell alone | SPA loads JS; version from apps config / CMS | See config |
| Web-app fallback | Boot fallback present in HTML shell | **completed** |
| Mobile / desktop layout | Responsive SPA (operator visual) | **pending operator approval** |
| Accessible labels / keyboard | Operator browser | **pending operator approval** |
| Help/support link | Operator browser | **pending operator approval** |
| Installation instructions clarity | Operator browser | **pending operator approval** |

---

## Binary / feed checks

| Check | Result | Status |
|---|---|---|
| Windows Setup versioned URL HTTP 200 | YES, length 110680093 | **completed** |
| Windows Setup latest URL HTTP 200 | YES, length 110680093 | **completed** |
| Windows Portable versioned URL HTTP 200 | YES, length 94300307 | **completed** |
| Windows Portable latest URL HTTP 200 | YES, length 94300307 | **completed** |
| Content-Type | `application/x-msdownload` | **completed** |
| Filename | `Scrolith-Desktop-Setup-1.1.19-x64.exe` / Portable / latest aliases | **completed** |
| SHA256SUMS-1.1.19.txt public | HTTP 200; contents match local | **completed** |
| latest.yml version | **1.1.19** | **completed** |
| latest.yml size field | 110680093 | **completed** |
| GCS MD5 latest == versioned == local | **YES** (Setup + Portable) | **completed** |
| App config desktop URL | Points to Setup-latest | **completed** |
| App config desktop.version string | `"beta"` (label debt) | **pending operator approval** to set `1.1.19` |

### Expected SHA-256 (production downloads must match)

```
26c126ee46ceaf79c787032196ad31cbefdd96e7e4e63f4146faca5220ed2dbe  Scrolith-Desktop-Setup-1.1.19-x64.exe
6521c9b9dfbcb3ffb790146df885196bfe2c0c531c510d637b290ef8965b9ef3  Scrolith-Desktop-Portable-1.1.19-x64.exe
```

Integrity proof used in 20.5.1 automation:

1. Local SHA-256 vs SHA256SUMS  
2. Public SHA256SUMS content match  
3. GCS object MD5 base64 match local MD5 for versioned **and** latest aliases  
4. HTTP Content-Length match  
5. **Full public HTTPS re-download** of versioned Setup and Portable with independent SHA-256:

| File | Downloaded size | SHA-256 | Match |
|---|---|---|---|
| Setup 1.1.19 | 110,680,093 | `26c126ee46ceaf79c787032196ad31cbefdd96e7e4e63f4146faca5220ed2dbe` | **YES** |
| Portable 1.1.19 | 94,300,307 | `6521c9b9dfbcb3ffb790146df885196bfe2c0c531c510d637b290ef8965b9ef3` | **YES** |

Operator browser smoke of https://scrolith.com/download remains recommended for layout/a11y.

---

## Links operators should open in a user-facing browser

1. https://scrolith.com/download  
2. https://storage.googleapis.com/downloads.scrolith.com/desktop/win/Scrolith-Desktop-Setup-latest-x64.exe  
3. https://storage.googleapis.com/downloads.scrolith.com/desktop/win/Scrolith-Desktop-Portable-latest-x64.exe  
4. https://storage.googleapis.com/downloads.scrolith.com/desktop/win/latest.yml  
5. https://storage.googleapis.com/downloads.scrolith.com/desktop/win/SHA256SUMS-1.1.19.txt  

Do **not** publish local Windows paths (`C:\Projects\...`) on the website.

---

## Gates

| Gate | Result |
|---|---|
| DESKTOP DOWNLOAD PAGE UPDATED | **YES** (binaries + metadata live; optional version label still `beta`) |
| PRODUCTION DOWNLOADS VERIFIED | **YES** (HTTP 200, sizes, MD5/GCS integrity) |
| DOWNLOADED FILE CHECKSUMS MATCH | **YES** (local ↔ SUMS ↔ GCS MD5 ↔ full public HTTPS SHA-256) |
