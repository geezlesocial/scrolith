# Phase 20.5.1 — Desktop Publish Report

**Date:** 2026-07-18  
**Version:** 1.1.19  
**Publish command:** `npm run desktop:publish:gcs` (approved script `geezle/scripts/publish-desktop-release.ps1`)  
**Bucket:** `gs://downloads.scrolith.com/desktop/win/`

## Overall status

| Step | Status |
|---|---|
| Local SHA-256 vs `SHA256SUMS-1.1.19.txt` | **completed** |
| GCS versioned object publish | **completed** |
| GCS latest aliases updated | **completed** |
| `latest.yml` updated to 1.1.19 | **completed** |
| Prior 1.1.14 objects preserved | **completed** |
| Service-account credentials printed | **NO** (must never print) |
| Local Setup/Portable functional UI lab | **pending operator approval** (install on operator workstation) |

---

## Local artifact verification

| File | Size (bytes) | SHA-256 | Status |
|---|---|---|---|
| `Scrolith-Desktop-Setup-1.1.19-x64.exe` | 110,680,093 | `26c126ee46ceaf79c787032196ad31cbefdd96e7e4e63f4146faca5220ed2dbe` | **completed** |
| `Scrolith-Desktop-Portable-1.1.19-x64.exe` | 94,300,307 | `6521c9b9dfbcb3ffb790146df885196bfe2c0c531c510d637b290ef8965b9ef3` | **completed** |
| `SHA256SUMS-1.1.19.txt` | — | Matches both | **completed** |

Local MD5 (for GCS comparison):

| File | MD5 (hex) | MD5 (base64) |
|---|---|---|
| Setup | `8AB7413683405CD1873A316ABB1EDABD` | `irdBNoNAXNGHOjFqux7avQ==` |
| Portable | `DF672ED7246F25BB609410863B6D85F4` | `32cu1yRvJbtglBCGO22F9A==` |

---

## GCS objects (observed)

```
gs://downloads.scrolith.com/desktop/win/SHA256SUMS-1.1.19.txt
gs://downloads.scrolith.com/desktop/win/Scrolith-Desktop-Portable-1.1.14-x64.exe   (preserved)
gs://downloads.scrolith.com/desktop/win/Scrolith-Desktop-Portable-1.1.19-x64.exe
gs://downloads.scrolith.com/desktop/win/Scrolith-Desktop-Portable-latest-x64.exe
gs://downloads.scrolith.com/desktop/win/Scrolith-Desktop-Setup-1.1.14-x64.exe      (preserved)
gs://downloads.scrolith.com/desktop/win/Scrolith-Desktop-Setup-1.1.19-x64.exe
gs://downloads.scrolith.com/desktop/win/Scrolith-Desktop-Setup-1.1.19-x64.exe.blockmap
gs://downloads.scrolith.com/desktop/win/Scrolith-Desktop-Setup-latest-x64.exe
gs://downloads.scrolith.com/desktop/win/latest.yml
```

### GCS integrity (MD5)

| Object | md5_hash (base64) | Match local | Status |
|---|---|---|---|
| Setup 1.1.19 versioned | `irdBNoNAXNGHOjFqux7avQ==` | **YES** | **completed** |
| Setup latest | `irdBNoNAXNGHOjFqux7avQ==` | **YES** (= versioned) | **completed** |
| Portable 1.1.19 versioned | `32cu1yRvJbtglBCGO22F9A==` | **YES** | **completed** |
| Portable latest | `32cu1yRvJbtglBCGO22F9A==` | **YES** (= versioned) | **completed** |

### Public HTTP HEAD

| URL | HTTP | Content-Length | Content-Type | Status |
|---|---|---|---|---|
| Setup 1.1.19 | 200 | 110680093 | application/x-msdownload | **completed** |
| Setup latest | 200 | 110680093 | application/x-msdownload | **completed** |
| Portable 1.1.19 | 200 | 94300307 | application/x-msdownload | **completed** |
| Portable latest | 200 | 94300307 | application/x-msdownload | **completed** |
| `SHA256SUMS-1.1.19.txt` | 200 | — | checksums match local | **completed** |

### latest.yml

```yaml
version: 1.1.19
files:
  - url: Scrolith-Desktop-Setup-1.1.19-x64.exe
    sha512: i6Sor+9cz6Qn+BDSPUkdgAvIFXifRxj3CxczBGT6/81JFMSbhTCAX5+RXvARI0qzCAf2oN+sQH5Jg8bv4QzSBA==
    size: 110680093
path: Scrolith-Desktop-Setup-1.1.19-x64.exe
releaseDate: '2026-07-18T06:38:13.383Z'
```

Status: **completed**

---

## Release metadata checklist

| Metadata | Value / location | Status |
|---|---|---|
| Setup installer | Versioned + latest GCS | **completed** |
| Portable executable | Versioned + latest GCS | **completed** |
| SHA256SUMS-1.1.19.txt | Public GCS | **completed** |
| latest.yml | Public GCS version 1.1.19 | **completed** |
| Version | 1.1.19 | **completed** |
| Release date | 2026-07-18 (latest.yml) | **completed** |
| File sizes | Setup 110680093 / Portable 94300307 | **completed** |
| Checksums | SHA-256 + electron sha512 | **completed** |
| Supported OS | Windows x64 (installer naming) | **completed** |
| Public website local paths | Not exposed (GCS URLs only) | **completed** |
| App distribution CMS version label | Still `"beta"` in `/api/apps/config` desktop.version | **pending operator approval** (optional string update; URL already points at latest Setup) |

### Public app distribution config (live)

- `GET https://api.scrolith.com/api/apps/config` → HTTP 200  
- `desktop.enabled`: true  
- `desktop.downloadUrl`: `https://storage.googleapis.com/downloads.scrolith.com/desktop/win/Scrolith-Desktop-Setup-latest-x64.exe`  
- `desktop.version`: `"beta"` (label only; binary is 1.1.19)  
- Global `enabled`: false (prompt auto-show off; downloads still reachable via direct URL / download experience)

---

## Operator desktop functional checks (local installers)

| Test | Status |
|---|---|
| Setup installer install | **pending operator approval** |
| Portable launch without false installer registration | **pending operator approval** |
| Startup / login / dashboard / messaging | **pending operator approval** |
| Upload / download / media selection | **pending operator approval** |
| Window resize / session persistence | **pending operator approval** |
| Setup uninstall | **pending operator approval** |
| AV/security scan with org tools | **pending operator approval** |

---

## Gates

| Gate | Result |
|---|---|
| DESKTOP ARTIFACT CHECKSUMS VERIFIED | **YES** |
| DESKTOP GCS PUBLICATION COMPLETED | **YES** |
| DESKTOP DOWNLOAD PAGE UPDATED | **PARTIAL** — binaries + latest.yml live; SPA `/download` 200; CMS version string still `beta` |
