# Phase 20.5.1 — Artifact Revalidation

**Date:** 2026-07-18  
**Scope:** Pre-upload verification of locked Phase 20.5 Android AAB and desktop installers  
**Rule:** No silent rebuild. Artifact identity must match Phase 20.5 baseline.

## Status legend

| Status | Meaning |
|---|---|
| **completed** | Verified in this phase with tooling |
| **pending operator approval** | Requires human Console / device action |
| **blocked** | Cannot proceed without external access or hardware |
| **failed** | Check failed (none for artifact identity) |
| **not applicable** | Out of scope for this check |

---

## Android App Bundle

| Field | Expected | Observed | Status |
|---|---|---|---|
| Path | `mobile/release-artifacts/android-1.1.19/Scrolith-1.1.19-29-release.aab` | Present | **completed** |
| Size | Non-zero | **12,249,767** bytes | **completed** |
| SHA-256 | `277a27bdd05a0514f03911aabeed3093bff50f345edc52b4ea7bb760afb9d8ac` | **Exact match** (case-insensitive) | **completed** |
| SHA-1 (manifest) | `e9469548540c4885eca88ce6186ddfbed1ecdde2` | Unchanged in `artifact-metadata.json` | **completed** |
| MD5 (manifest) | `374b400c27e4f1cf905c77e1e4a05e23` | Unchanged in `artifact-metadata.json` | **completed** |
| jarsigner | jar verified | **`jar verified.`** | **completed** |
| Upload certificate | CN=Scrolith (Play App Signing upload key) | `CN=Scrolith, OU=Mobile, O=Scrolith, L=Singapore, ST=Singapore, C=SG` | **completed** |
| Self-signed warning | Expected for upload key | Present (expected; Play re-signs) | **completed** |
| Application ID | `com.scrolith.scrolith` | `package="com.scrolith.scrolith"` (bundletool) | **completed** |
| versionCode | 29 | `android:versionCode="29"` | **completed** |
| versionName | 1.1.19 | `android:versionName="1.1.19"` | **completed** |
| minSdk | 24 | `minSdkVersion="24"` | **completed** |
| targetSdk | 36 | `targetSdkVersion="36"` | **completed** |
| compileSdk | 36 | `compileSdkVersion="36"` | **completed** |
| Debuggable | Not set / false | No `android:debuggable` on application | **completed** |
| Cleartext | Disabled at app level | `usesCleartextTraffic="false"` | **completed** |
| Base cleartext policy | false | `base-config cleartextTrafficPermitted=false` | **completed** |

### jarsigner notes (non-blocking)

- Self-signed upload certificate is **expected** under Google Play App Signing.
- Certificate expiry 2053-07-31; no timestamp on signature (common for app upload keys).
- JarFile vs JarInputStream entry warnings are a known jarsigner/AAB packaging quirk; Play accepts AABs signed with the registered upload key.

### Capacitor / runtime configuration (from unpacked AAB)

| Check | Result | Status |
|---|---|---|
| `capacitor.config.json` appId | `com.scrolith.scrolith` | **completed** |
| Server hostname | `scrolith.com` | **completed** |
| androidScheme | `https` | **completed** |
| allowMixedContent | `false` | **completed** |
| localhost / staging server URL | Not present in capacitor config | **completed** |
| Stripe test keys (`sk_test` / `pk_test`) in small config assets | Not found | **completed** |
| Signing secrets / keystore passwords in AAB | Not found | **completed** |
| WebView debugging | Release path disables (Phase 20.5 build + FLAG_DEBUGGABLE guard) | **completed** (source-validated in 20.5; not re-instrumented here) |

### Residual network policy note

`network_security_config.xml` keeps **domain-config cleartext permitted only for** local/dev hosts (`localhost`, `127.0.0.1`, `10.0.2.2`, `192.168.1.168`). Application-level `usesCleartextTraffic=false` and base-config cleartext **false** remain production defaults. This is residual local-dev convenience, not a production cleartext open. **Do not treat as release-blocking** unless product policy requires removing local domain exceptions from release AABs (would require a new versionCode).

### Version code upload uniqueness

| Check | Status |
|---|---|
| versionCode 29 not already on Play | **pending operator approval** — confirm in Play Console → App bundle explorer / Production releases before upload |

---

## Desktop artifacts (local)

| Artifact | Size | SHA-256 | Match SHA256SUMS-1.1.19.txt | Status |
|---|---|---|---|---|
| `Scrolith-Desktop-Setup-1.1.19-x64.exe` | 110,680,093 | `26c126ee46ceaf79c787032196ad31cbefdd96e7e4e63f4146faca5220ed2dbe` | **YES** | **completed** |
| `Scrolith-Desktop-Portable-1.1.19-x64.exe` | 94,300,307 | `6521c9b9dfbcb3ffb790146df885196bfe2c0c531c510d637b290ef8965b9ef3` | **YES** | **completed** |
| `SHA256SUMS-1.1.19.txt` | — | Lists both files | — | **completed** |

---

## Production web baseline (not rebuilt)

| Service | Region | Expected | Observed | Status |
|---|---|---|---|---|
| Frontend 100% traffic | asia-southeast1 | `scrolith-frontend-00143-leb` (p2041) | **percent: 100** on `00143-leb` tag `p2041` | **completed** |
| Broken p204 | 0% | `scrolith-frontend-00140-zaq` | Present as tagged revision **without** traffic percent | **completed** |
| p203 rollback | Reachable | `scrolith-frontend-00138-ruh` tag `p203` | Present (tagged, reachable) | **completed** |
| Backend 100% | asia-southeast1 | `scrolith-backend-00114-bay` | **percent: 100** on `00114-bay` | **completed** |

---

## Gate summary (artifact layer)

| Gate | Result |
|---|---|
| AAB CHECKSUM REVALIDATED | **YES** |
| AAB SIGNATURE REVALIDATED | **YES** |
| APPLICATION ID VERIFIED | **YES** |
| VERSION CODE 29 VERIFIED | **YES** |
| VERSION NAME 1.1.19 VERIFIED | **YES** |
| DESKTOP ARTIFACT CHECKSUMS VERIFIED | **YES** |
| Artifact rebuild performed | **NO** (correct) |

## Operator STOP conditions

**STOP and do not upload** if any of the following change before Play upload:

1. AAB SHA-256 ≠ expected  
2. Signing identity ≠ CN=Scrolith upload key  
3. applicationId ≠ `com.scrolith.scrolith`  
4. versionCode ≠ 29 or versionName ≠ 1.1.19  
5. Play Console reports versionCode 29 already used  

**Outcome this phase:** Artifact identity **PASS**. Proceed to operator Play upload with this exact AAB.
