# Phase 20.5.1 — Google Play Upload Report

**Date:** 2026-07-18  
**Application:** Scrolith (`com.scrolith.scrolith`)  
**Package:** `C:\Projects\mobile\release-artifacts\android-1.1.19\Scrolith-1.1.19-29-release.aab`

## Overall status

| Step | Status |
|---|---|
| Pre-upload artifact lock | **completed** |
| Play Developer API automated upload | **blocked** — no Android Publisher service account / OAuth automation in this environment |
| Operator Console upload | **pending operator approval** |
| Bundle processing (Play) | **pending operator approval** |
| Production release draft | **pending operator approval** |
| Staged production rollout start | **pending operator approval** — **must not start until operator explicitly confirms** |
| Unrestricted 100% rollout | **not applicable** — forbidden for initial 20.5.1 strategy |

---

## Authorized package

| Field | Value |
|---|---|
| File | `Scrolith-1.1.19-29-release.aab` |
| Format | **AAB only** (do not upload APK) |
| Application ID | `com.scrolith.scrolith` |
| versionCode | **29** |
| versionName | **1.1.19** |
| Target SDK | **36** |
| minSdk | **24** |
| SHA-256 | `277a27bdd05a0514f03911aabeed3093bff50f345edc52b4ea7bb760afb9d8ac` |
| Size | 12,249,767 bytes |
| Upload signing cert | CN=Scrolith, OU=Mobile, O=Scrolith, L=Singapore, ST=Singapore, C=SG |

---

## Operator upload procedure (authorized)

1. Open **Google Play Console** → Scrolith app.
2. Navigate: **Test and release → Production → Create production release**  
   (Preferred pre-prod path if available: Internal testing → closed track validation → then Production draft.)
3. Upload **only** `Scrolith-1.1.19-29-release.aab`.
4. Confirm Play accepts the upload key under **Play App Signing**.
5. Set release name (see below).
6. Paste release notes (see below).
7. Save as **draft / ready to roll out** — **do not start rollout** until release summary approval.
8. Prefer **staged rollout 5%** (or console minimum if different).

### Release name

- Preferred: **`Scrolith 1.1.19 Production`** (< 50 characters)
- If Play auto-generates a name, record **both** values in the operator log below.

### Release notes (en-US)

```text
This release improves Scrolith’s mobile stability and overall experience.

• Improved freelancer and employer dashboard reliability
• Enhanced mobile navigation and responsive layouts
• Improved image selection, camera, and upload workflows
• Improved video capture, playback, and upload stability
• Improved notifications and deep-link handling
• Faster loading and better network recovery
• Accessibility, security, and performance improvements
• General bug fixes and stability enhancements
```

Correct formatting only if Play Console requires a specific markup wrapper. Do not add unsupported claims.

---

## Play Console fields to record after upload

Fill during operator session:

| Field | Value after upload |
|---|---|
| Play-recognized application ID | _pending operator_ |
| Version code | _pending operator_ |
| Version name | _pending operator_ |
| Target SDK | _pending operator_ |
| Supported devices | _pending operator_ |
| Excluded devices | _pending operator_ |
| Required features | _pending operator_ |
| ABIs | _pending operator_ |
| Screen layouts | _pending operator_ |
| App size | _pending operator_ |
| Download size | _pending operator_ |
| Signing certificate status | _pending operator_ |
| Integrity-protection status | _pending operator_ |
| Auto-generated release name (if any) | _pending operator_ |
| Operator release name used | _pending operator_ |
| Every warning | _pending operator_ |
| Every error | _pending operator_ |
| Every policy notice | _pending operator_ |

**Rule:** Do not dismiss warnings without technical review. Document every operator decision.

---

## Automation gap analysis

| Capability | Available here? | Impact |
|---|---|---|
| `gcloud` Cloud Run / GCS | Yes | Desktop publish + traffic verified |
| `jarsigner` / `bundletool` | Yes | AAB revalidated |
| Google Play Android Publisher API | **No** | Cannot auto-upload AAB |
| Play Console browser session | **No** | Operator must upload |
| Play Console credentials in CI | **Must not be embedded in code** | Use operator Console or vaulted SA if later automated |

---

## Errors / resolution log

| ID | Finding | Severity | Resolution | Status |
|---|---|---|---|---|
| PUP-0 | No Play API credentials in automation environment | Process | Operator Console upload | **blocked** for automation; **authorized** for operator |
| — | No Play processing errors yet | — | N/A until upload | **not applicable** |

---

## Recommended post-upload sequence

1. Internal testing track install (if used)  
2. Closed / controlled production validation where available  
3. Prepare production release draft  
4. **Pause for operator approval** (this document’s final gate)  
5. Start **5% staged** production rollout  
6. Monitor health gates (`PHASE20_5_1_RELEASE_MONITORING_PLAN.md`)  
7. Increase rollout only after gates pass  

---

## Final gates (Play layer)

| Gate | Result |
|---|---|
| PLAY AAB UPLOAD COMPLETED | **NO** (pending operator) |
| PLAY BUNDLE PROCESSING PASSED | **NO** (pending operator) |
| PLAY ERRORS RESOLVED | **NO** (pending upload / review) |
| PLAY WARNINGS REVIEWED | **NO** (pending Console) |
| RELEASE NOTES ADDED | **NO** (text prepared; Console entry pending) |
| PRODUCTION RELEASE PREPARED | **NO** (draft prep pending operator) |
| FINAL ROLLOUT AWAITING OPERATOR APPROVAL | **YES** |
