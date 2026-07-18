# Phase 20.5.1 — Rollback & Release Halt Plan

**Date:** 2026-07-18  
**Release under control:** Scrolith 1.1.19 (Android versionCode 29, desktop 1.1.19, web p2041)

## Overall status

| Layer | Plan verified | Status |
|---|---|---|
| Android halt / hotfix path | Documented accurately | **completed** (procedure) |
| Desktop rollback metadata | 1.1.14 preserved + 1.1.19 immutable | **completed** |
| Web rollback | p203 reachable; p204 at 0%; p2041 at 100% | **completed** |

---

## Android

### Critical constraint

A published Android version **cannot** reuse an earlier `versionCode`. You **cannot** re-upload versionCode 29 after a bad release with a “fixed” binary of the same code. You **cannot** upload a lower versionCode.

### Halt staged rollout (preferred first response)

1. Play Console → Production → Release → **Halt rollout** / set percentage to **0%** (console wording may vary).  
2. Users not yet updated remain on previous production version (e.g. store 1.1.14 / versionCode 24).  
3. Users already updated stay on 1.1.19 until a higher versionCode ships or they uninstall.  
4. Capture crash clusters, vitals, and repro before any rebuild.

### Hotfix path

1. Fix defect in source.  
2. Increment **versionCode > 29** (e.g. 30) and set appropriate versionName.  
3. Rebuild AAB, new checksums, full revalidation (repeat Phase 20.5 / 20.5.1 gates).  
4. Upload new AAB; staged rollout again.  
5. Never attempt to overwrite historical AAB identity silently.

### What not to do

- Do not upload APK to “replace” AAB.  
- Do not force-push a different binary under the same versionCode.  
- Do not delete prior store listing versions as a rollback strategy.

| Gate | Result |
|---|---|
| ANDROID ROLLBACK/HALT PLAN VERIFIED | **YES** |

---

## Desktop

### Preserve

- `Scrolith-Desktop-Setup-1.1.19-x64.exe` and Portable **immutable versioned** objects  
- `Scrolith-Desktop-Setup-1.1.14-x64.exe` and Portable **already present** in GCS  
- `SHA256SUMS-1.1.19.txt` historical record  

### Rollback procedure

1. Do **not** delete 1.1.19 objects.  
2. Point `latest` aliases back to last known-good binaries (e.g. 1.1.14) **or** re-publish prior good package with care.  
3. Restore prior `latest.yml` content for the good version.  
4. Re-validate public HEAD + checksums.  
5. Optionally update apps config download URL if it diverges.

| Gate | Result |
|---|---|
| DESKTOP ROLLBACK VERIFIED | **YES** (objects preserved; procedure clear) |

---

## Web

### Current certified baseline

| Revision | Tag | Traffic |
|---|---|---|
| `scrolith-frontend-00143-leb` | p2041 | **100%** |
| `scrolith-frontend-00140-zaq` | p204 (broken) | **0%** (tagged only) |
| `scrolith-frontend-00138-ruh` | p203 | Reachable rollback target |
| `scrolith-backend-00114-bay` | production BE | **100%** |

### Rollback command pattern (operator)

```bash
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00138-ruh=100
```

Only use if p2041 regresses. Keep broken p204 at **0%**. Backend unchanged unless a backend defect is proven.

| Gate | Result |
|---|---|
| WEB ROLLBACK VERIFIED | **YES** |

---

## Communication

On halt:

1. Notify Release Manager + SRE  
2. Freeze further % increases  
3. Open incident notes (symptom, cohort, versionCode, time)  
4. Decide: hold / hotfix / web-only mitigation  

## Status

Rollback documentation **completed**. No production halt executed (none required yet — Android not rolled out).
