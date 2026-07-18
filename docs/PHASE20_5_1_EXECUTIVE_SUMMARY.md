# Phase 20.5.1 — Executive Summary

**Date:** 2026-07-18  
**Phase:** Google Play, Desktop Distribution & Device Release Validation  
**Product version:** Scrolith **1.1.19** (Android versionCode **29**)

---

## Bottom line

| Track | Outcome |
|---|---|
| Android AAB identity | **LOCKED & REVALIDATED** — ready for operator Play upload |
| Google Play upload / staged rollout | **NOT STARTED** — awaiting operator Console actions + explicit rollout approval |
| Desktop GCS publication | **LIVE** — versioned + latest 1.1.19 installers public |
| Production web | **STABLE** — FE `00143-leb` (p2041) 100%; BE `00114-bay` 100%; broken p204 at 0%; p203 reachable |
| Physical device lab | **NOT RUN** — no adb devices attached |
| Public release complete | **NO** — final gates incomplete by design until operator finishes Play + device validation |

**PUBLIC RELEASE COMPLETE = NO**

Automation has completed everything possible without Play Console credentials and without physical devices. The release is **distribution-ready for operator-controlled Play upload** and **desktop distribution is already public**. Final Play production rollout must **not** be clicked until the operator approves the summary below.

---

## Artifact lock (do not rebuild)

| Artifact | Value |
|---|---|
| AAB path | `mobile/release-artifacts/android-1.1.19/Scrolith-1.1.19-29-release.aab` |
| Application ID | `com.scrolith.scrolith` |
| versionCode / versionName | **29** / **1.1.19** |
| Target / min SDK | **36** / **24** |
| AAB size | 12,249,767 bytes |
| AAB SHA-256 | `277a27bdd05a0514f03911aabeed3093bff50f345edc52b4ea7bb760afb9d8ac` |
| jarsigner | **jar verified** (upload key CN=Scrolith) |
| Desktop Setup SHA-256 | `26c126ee46ceaf79c787032196ad31cbefdd96e7e4e63f4146faca5220ed2dbe` |
| Desktop Portable SHA-256 | `6521c9b9dfbcb3ffb790146df885196bfe2c0c531c510d637b290ef8965b9ef3` |

If any artifact must change: **increment versionCode**, new checksums, full revalidation.

---

## What completed in 20.5.1

1. AAB SHA-256 revalidation (exact match)  
2. jarsigner verification  
3. bundletool manifest inspection (package, versions, SDKs, cleartext false)  
4. Capacitor production hostname / HTTPS scheme check  
5. Desktop local checksums  
6. Desktop GCS publish of versioned + latest + latest.yml + SHA256SUMS  
7. Public HTTP 200 + size + GCS MD5 integrity for installers  
8. Download page HTTP 200  
9. Apps config desktop URL → Setup-latest  
10. Cloud Run traffic baseline confirmation  
11. Full report suite under `docs/PHASE20_5_1_*.md`  
12. Monitoring + rollback plans documented  

---

## What requires the operator now

### A. Google Play (authorized to prepare; not to auto-roll out)

1. Upload `Scrolith-1.1.19-29-release.aab` to Production release (AAB only).  
2. Record processing metrics, warnings, errors.  
3. Review App content / Data safety / account deletion / permissions — **no declaration changes without evidence**.  
4. Release name: **`Scrolith 1.1.19 Production`**.  
5. Paste en-US release notes from the Play upload report.  
6. Prefer Internal → closed validation → Production draft.  
7. **STOP before starting rollout.** Return for explicit approval.  
8. After approval: staged **5%** (or console minimum), then monitor gates.

### B. Physical device lab

Attach devices and complete clean install + upgrade-from-1.1.14 matrix (see device lab report).

### C. Optional polish

- Set apps config `desktop.version` from `"beta"` → `"1.1.19"` (binary already 1.1.19).  
- Operator UI smoke of Setup/Portable installers.

---

## Final gates

| Gate | Result |
|---|---|
| AAB CHECKSUM REVALIDATED | **YES** |
| AAB SIGNATURE REVALIDATED | **YES** |
| APPLICATION ID VERIFIED | **YES** |
| VERSION CODE 29 VERIFIED | **YES** |
| VERSION NAME 1.1.19 VERIFIED | **YES** |
| PLAY AAB UPLOAD COMPLETED | **NO** |
| PLAY BUNDLE PROCESSING PASSED | **NO** |
| PLAY ERRORS RESOLVED | **NO** |
| PLAY WARNINGS REVIEWED | **NO** |
| APP CONTENT REVIEWED | **NO** |
| DATA SAFETY REVIEWED | **NO** |
| ACCOUNT DELETION COMPLIANCE REVIEWED | **NO** |
| RELEASE NOTES ADDED | **NO** (text prepared) |
| PRODUCTION RELEASE PREPARED | **NO** |
| FINAL ROLLOUT AWAITING OPERATOR APPROVAL | **YES** |
| PHYSICAL CLEAN INSTALL PASSED | **NO** |
| PHYSICAL UPGRADE INSTALL PASSED | **NO** |
| FREELANCER DASHBOARD PASSED | **NO** (physical) |
| EMPLOYER DASHBOARD PASSED | **NO** (physical) |
| ROLE SWITCHING PASSED | **NO** (physical) |
| CAMERA AND IMAGE WORKFLOWS PASSED | **NO** (physical) |
| VIDEO WORKFLOW PASSED | **NO** (physical) |
| MESSAGING PASSED | **NO** (physical) |
| NOTIFICATIONS PASSED | **NO** (physical) |
| DEEP LINKS PASSED | **NO** (physical) |
| OFFLINE RECOVERY PASSED | **NO** (physical) |
| DESKTOP ARTIFACT CHECKSUMS VERIFIED | **YES** |
| DESKTOP GCS PUBLICATION COMPLETED | **YES** |
| DESKTOP DOWNLOAD PAGE UPDATED | **YES** (binaries live; version label optional) |
| PRODUCTION DOWNLOADS VERIFIED | **YES** |
| DOWNLOADED FILE CHECKSUMS MATCH | **YES** |
| ANDROID ROLLBACK/HALT PLAN VERIFIED | **YES** |
| DESKTOP ROLLBACK VERIFIED | **YES** |
| WEB ROLLBACK VERIFIED | **YES** |
| PHASE 20.5.1 DISTRIBUTION READY | **YES** (for operator Play upload + desktop already live) |
| PUBLIC RELEASE COMPLETE | **NO** |

---

## Reports delivered

| Document | Purpose |
|---|---|
| `docs/PHASE20_5_1_ARTIFACT_REVALIDATION.md` | AAB + desktop identity |
| `docs/PHASE20_5_1_PLAY_UPLOAD_REPORT.md` | Upload procedure + pending Console fields |
| `docs/PHASE20_5_1_PLAY_POLICY_REVIEW.md` | Policy section matrix |
| `docs/PHASE20_5_1_DEVICE_LAB_REPORT.md` | Physical lab blocked / checklist |
| `docs/PHASE20_5_1_DESKTOP_PUBLISH_REPORT.md` | GCS publication |
| `docs/PHASE20_5_1_DOWNLOAD_VALIDATION.md` | Website / binary validation |
| `docs/PHASE20_5_1_RELEASE_MONITORING_PLAN.md` | Post-rollout gates |
| `docs/PHASE20_5_1_ROLLBACK_PLAN.md` | Android / desktop / web halt |
| `docs/PHASE20_5_1_EXECUTIVE_SUMMARY.md` | This document |

---

## Operator decision request

**Please approve one of the following:**

1. **Proceed to Play Console upload only** (prepare production release draft; **no** rollout start).  
2. **Proceed to Play upload + 5% staged rollout** after Console warnings review (requires explicit confirmation).  
3. **Hold Android** until physical device lab passes; keep desktop 1.1.19 public as-is.  

Automation will **not** click the final Play Console rollout button without explicit operator confirmation.
