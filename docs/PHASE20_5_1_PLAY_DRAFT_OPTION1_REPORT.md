# Phase 20.5.1 — Option 1 Execution Report  
## Play production **draft only** (no rollout)

**Date:** 2026-07-18  
**Operator decision:** Option 1 — prepare Google Play production release draft only  
**Rollout:** **NOT STARTED** (forbidden until explicit later approval)

---

## 1. Git push

| Item | Result |
|---|---|
| Commit | `edf4c8f2dbd9f8a16cbd0223638382c24b979d88` |
| Message | `docs(release): Phase 20.5.1 distribution validation and operator gates` |
| Branch | `release/backend-production` |
| Remote | `origin/release/backend-production` |
| Push | **completed** (`322871be..edf4c8f2`) |
| Tracking | Branch up to date with origin after push |

---

## 2. Artifact lock (unchanged — no rebuild)

| Field | Value | Verified |
|---|---|---|
| Path | `mobile/release-artifacts/android-1.1.19/Scrolith-1.1.19-29-release.aab` | **YES** |
| Size | 12,249,767 bytes | **YES** |
| SHA-256 | `277a27bdd05a0514f03911aabeed3093bff50f345edc52b4ea7bb760afb9d8ac` | **YES** (exact) |
| Application ID | `com.scrolith.scrolith` | Prior revalidation |
| versionCode | 29 | Prior revalidation |
| versionName | 1.1.19 | Prior revalidation |
| Target SDK | 36 | Prior revalidation |
| minSdk | 24 | Prior revalidation |
| Format | **AAB only** | **YES** |
| Artifact modified this session | **NO** | **YES** |

Desktop artifacts were **not** modified.

---

## 3. Automated Play Console / API upload attempt

### What was tried

| Probe | Result |
|---|---|
| Play-related env vars (`PLAY*`, `ANDROID*`, publisher SA) | **None present** |
| GCP Secret Manager play/android publisher secrets | **None** (project secrets observed: `DATABASE_URL`, `GOOGLE_API_KEY`, `JWT_SECRET` only) |
| fastlane / supply | **Not installed** |
| Gradle Play Publisher credentials in `mobile/android` | **Not found** |
| Service-account JSON for Android Publisher | **Not found** (search of project + common credential locations) |
| `gcloud auth print-access-token` → Android Publisher API | **403 ACCESS_TOKEN_SCOPE_INSUFFICIENT** |

### API evidence (no secrets printed)

**GET** `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.scrolith.scrolith`

```text
HTTP 403
message: Request had insufficient authentication scopes.
reason: ACCESS_TOKEN_SCOPE_INSUFFICIENT
method: google.play.androidpublisher.v3.ApplicationsService.GetApplication
```

**POST** `.../applications/com.scrolith.scrolith/edits`

```text
HTTP 403
message: Request had insufficient authentication scopes.
reason: ACCESS_TOKEN_SCOPE_INSUFFICIENT
method: google.play.publishingapi.v3.EditsService.Insert
```

### Conclusion

| Action | Status |
|---|---|
| Upload AAB via Android Publisher API | **blocked** |
| Create Play production edit/draft via API | **blocked** |
| Start production rollout | **not attempted** (correct for Option 1) |
| Change policy / Data safety / App content / legal | **not attempted** (correct) |

**This environment cannot complete the browser/API Play upload without:**

1. A Google Play Console user session (browser), **or**  
2. A Play Console–linked service account JSON with Android Publisher API access and `androidpublisher` OAuth scope, stored via the approved secret mechanism (never printed).

---

## 4. Production draft package prepared for Console (operator paste)

### Release name

```text
Scrolith 1.1.19 Production
```

### Upload file

```text
C:\Projects\mobile\release-artifacts\android-1.1.19\Scrolith-1.1.19-29-release.aab
```

- AAB only — **do not upload APK**  
- versionCode **29** / versionName **1.1.19**  
- SHA-256 `277a27bdd05a0514f03911aabeed3093bff50f345edc52b4ea7bb760afb9d8ac`

### Release notes (en-US) — paste exactly

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

### Operator Console steps (draft only)

1. Open [Google Play Console](https://play.google.com/console) → **Scrolith** (`com.scrolith.scrolith`).
2. **Test and release → Production → Create production release**.
3. **Upload** the AAB path above (AAB only).
4. Wait for **bundle processing** to finish.
5. Set release name: **`Scrolith 1.1.19 Production`**.
6. Paste release notes (en-US block above).
7. Review every **warning / error / policy notice** on screen (do not dismiss without technical review).
8. **Save** as draft / “review release” state as offered by Console.
9. **STOP.** Do **not** click **Start rollout to production**.  
10. Do **not** set a staged percentage yet.  
11. Return the Console values using the capture table in §5.

### Policy / declarations rule

**Do not change** App content, Data safety, privacy policy, ads, content rating, target audience, account deletion, permissions, financial features, or other legal declarations unless you first capture:

| Existing value | Proposed change | Evidence | Impact | Operator approval |
|---|---|---|---|---|

Present that table before any edit. **No declaration changes were made by automation.**

---

## 5. Post-upload capture table (fill after Console processing)

| Field | Value (operator after upload) |
|---|---|
| Upload result | _pending Console_ |
| Play-recognized application ID | _pending_ |
| Version code | _pending_ (expect **29**) |
| Version name | _pending_ (expect **1.1.19**) |
| App bundle processing status | _pending_ |
| Supported device count | _pending_ |
| Excluded device count | _pending_ |
| Download size | _pending_ |
| App size | _pending_ |
| Target SDK | _pending_ (expect **36**) |
| Signing certificate status | _pending_ |
| App Integrity status | _pending_ |
| Every warning | _pending_ |
| Every error | _pending_ |
| Every policy notice | _pending_ |
| Required declaration updates | _pending_ — if any, **hold** and report; do not auto-change |
| Can save as production draft? | _pending_ |
| Preview and confirm page (text or screenshot) | _pending_ |
| Recommendation | _pending_ |

### Expected recommendation framework (after Console data exists)

| Condition | Recommendation |
|---|---|
| Processing success, no blocking errors, warnings reviewed | **proceed** (still wait for operator before 5% rollout) |
| Non-blocking warnings only | **proceed** after documenting each warning |
| Blocking error, wrong versionCode, signing reject, policy blocker | **correct issue** or **hold** |
| Missing declaration that requires product/legal decision | **hold** — present existing vs proposed |

---

## 6. Fields that cannot be filled until Console upload

The following **cannot** be honestly reported as observed values until a human (or Play API with proper credentials) completes the upload:

- Play-recognized version after processing  
- Supported / excluded device counts  
- Play-calculated download size / app size  
- Signing / App Integrity Console status  
- Console warnings / errors / policy notices  
- Preview and confirm page contents  

Local pre-upload known values remain:

| Local field | Value |
|---|---|
| versionCode | 29 |
| versionName | 1.1.19 |
| targetSdk | 36 |
| AAB size on disk | 12,249,767 bytes |
| Upload key | CN=Scrolith (Play App Signing expected) |

---

## 7. Final status (Option 1 — truth table)

| Gate | Result |
|---|---|
| Docs commit pushed (`edf4c8f2`) | **YES** |
| AAB preserved / checksum match | **YES** |
| PLAY AAB UPLOAD COMPLETED | **NO** (blocked: no Play Publisher credentials/scopes) |
| PLAY BUNDLE PROCESSING PASSED | **NO** (upload not completed) |
| PLAY WARNINGS REVIEWED | **YES** for pre-upload technical warnings; **N/A** for Console warnings until upload |
| PRODUCTION RELEASE DRAFT PREPARED | **YES** (materials + procedure); **NO** for live Console draft object |
| PRODUCTION ROLLOUT STARTED | **NO** |
| PUBLIC RELEASE COMPLETE | **NO** |
| AWAITING OPERATOR APPROVAL | **YES** |

### Recommendation now

**HOLD** claiming Play upload complete.  

**Next operator action:** complete §4 Console steps in a logged-in Play Console session, capture §5 fields, then return for review **before** any 5% staged rollout approval.

### To unblock future automation (optional)

1. Create a GCP service account.  
2. Invite it to Play Console with **Release apps** (or equivalent) permission for Scrolith.  
3. Enable **Google Play Android Developer API**.  
4. Store JSON key via approved secret mechanism (e.g. env `PLAY_SERVICE_ACCOUNT_JSON` / Secret Manager) — **never commit or print**.  
5. Re-run draft-only upload script with **status=draft**, **track=production**, **rollout fraction unset / 0**.

---

## 8. Explicit non-actions this session

- Did **not** rebuild AAB or desktop installers  
- Did **not** change AAB bytes or checksum  
- Did **not** start production rollout  
- Did **not** click or invoke “Start rollout to production”  
- Did **not** change Play policy/legal declarations  
- Did **not** promote broken p204 traffic  
